import { io, type Socket } from 'socket.io-client';
import type { ApiClient } from './api';

/** Events forwarded to the renderer. Anything else the server emits is ignored. */
export const FORWARDED_EVENTS = [
  'chat.message.created',
  'chat.message.updated',
  'chat.message.deleted',
  'chat.typing',
  'chat.read',
  'chat.channel.changed',
  'notification.new',
  'session.revoked',
] as const;

export interface RealtimeEvent {
  event: string;
  payload: unknown;
}
export interface RealtimeStatus {
  connected: boolean;
}

type EventListener = (e: RealtimeEvent) => void;
type StatusListener = (s: RealtimeStatus) => void;

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
/** Backoff after the server rejected our handshake (bad or expired token): 2 s, 4 s, ... 60 s. */
const AUTH_RETRY_MIN_MS = 2_000;
const AUTH_RETRY_MAX_MS = 60_000;
/** The gateway accepts the namespace first and disconnects on a bad token right after: a connection counts as healthy only once it survived this long. */
const STABLE_AFTER_MS = 5_000;

/**
 * The desktop's only WebSocket (docs/22 section 5: namespace `/ws`, same auth as notifications).
 * Lives in the main process so the access token never reaches the renderer (AGENTS.md rule 7): the
 * token travels in the socket.io handshake `auth.token`, exactly what NotificationsGateway reads.
 * Transport drops reconnect with socket.io's own backoff. A handshake the server rejects (expired or
 * invalid token) is retried on a separate exponential backoff; the access token is refreshed through
 * the ApiClient at most once per rejection streak so a broken server can never trigger a refresh storm.
 * Nothing about the token is ever logged.
 */
export class RealtimeClient {
  private socket: Socket | null = null;
  private eventListeners: EventListener[] = [];
  private statusListeners: StatusListener[] = [];
  private connected = false;
  private authFailures = 0;
  private authRetryTimer: NodeJS.Timeout | null = null;
  private stableTimer: NodeJS.Timeout | null = null;
  private refreshedThisStreak = false;

  constructor(private api: ApiClient) {
    this.api.onTokens((hasToken) => (hasToken ? this.connect() : this.disconnect()));
  }

  onEvent(fn: EventListener): void {
    this.eventListeners.push(fn);
  }
  onStatus(fn: StatusListener): void {
    this.statusListeners.push(fn);
  }
  status(): RealtimeStatus {
    return { connected: this.connected };
  }

  /** Idempotent: (re)creates the socket for the current server address and token. */
  connect(): void {
    const token = this.api.currentAccessToken();
    const base = this.api.baseUrl().replace(/\/api\/v1$/, '');
    if (!token || !/^https?:\/\//.test(base)) return;
    if (this.socket) {
      // Same server: refresh the handshake token; a pending auth backoff keeps its schedule.
      this.socket.auth = { token };
      if (!this.socket.connected && !this.authRetryTimer) this.socket.connect();
      return;
    }
    const socket = io(`${base}/ws`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: RECONNECT_MIN_MS,
      reconnectionDelayMax: RECONNECT_MAX_MS,
      randomizationFactor: 0.5,
      timeout: 10_000,
      extraHeaders: { 'X-Client-Type': 'desktop' },
    });
    socket.on('connect', () => {
      this.setConnected(true);
      this.clearStableTimer();
      this.stableTimer = setTimeout(() => {
        this.authFailures = 0;
        this.refreshedThisStreak = false;
      }, STABLE_AFTER_MS);
    });
    socket.on('disconnect', (reason) => {
      this.clearStableTimer();
      this.setConnected(false);
      // The gateway disconnects a socket whose token it rejects (no auto-reconnect in that case).
      if (reason === 'io server disconnect') this.scheduleAuthRetry();
    });
    socket.on('connect_error', () => this.setConnected(false));
    socket.io.on('reconnect_attempt', () => {
      const fresh = this.api.currentAccessToken();
      if (fresh) socket.auth = { token: fresh };
    });
    for (const event of FORWARDED_EVENTS) {
      socket.on(event, (payload: unknown) => this.eventListeners.forEach((l) => l({ event, payload })));
    }
    this.socket = socket;
  }

  disconnect(): void {
    if (this.authRetryTimer) clearTimeout(this.authRetryTimer);
    this.authRetryTimer = null;
    this.clearStableTimer();
    this.authFailures = 0;
    this.refreshedThisStreak = false;
    if (!this.socket) return;
    const s = this.socket;
    this.socket = null;
    s.removeAllListeners();
    s.io.removeAllListeners();
    s.disconnect();
    this.setConnected(false);
  }

  private clearStableTimer(): void {
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.stableTimer = null;
  }

  private scheduleAuthRetry(): void {
    if (this.authRetryTimer || !this.socket) return;
    this.authFailures += 1;
    const delay = Math.min(AUTH_RETRY_MIN_MS * 2 ** (this.authFailures - 1), AUTH_RETRY_MAX_MS);
    this.authRetryTimer = setTimeout(() => void this.retryAfterAuthFailure(), delay);
  }

  private async retryAfterAuthFailure(): Promise<void> {
    this.authRetryTimer = null;
    if (!this.socket) return;
    // The token may simply have expired: refresh once per streak, then rely on the ApiClient's normal refreshes.
    if (!this.refreshedThisStreak) {
      this.refreshedThisStreak = true;
      await this.api.refresh();
    }
    const token = this.api.currentAccessToken();
    if (!token || !this.socket) return;
    this.socket.auth = { token };
    if (!this.socket.connected) this.socket.connect();
  }

  private setConnected(v: boolean): void {
    if (this.connected === v) return;
    this.connected = v;
    this.statusListeners.forEach((l) => l({ connected: v }));
  }
}
