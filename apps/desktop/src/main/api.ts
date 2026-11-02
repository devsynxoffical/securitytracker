import { app } from 'electron';
import { Store } from './store';
import { DeviceIdentity } from './device';
import { AnchoredClock } from './clock';
import { revokeReasonFromError, type RevokeReason } from './lockdown';

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: ApiError;
}

type NetListener = (online: boolean) => void;
type TokenListener = (hasToken: boolean) => void;

/**
 * Server address. Baked in at build time with MAIN_VITE_API_URL (IT builds), overridable in dev with
 * COMPANYOS_API_URL. Empty means the first-run screen asks for it (F2).
 */
const DEFAULT_API_URL = process.env.COMPANYOS_API_URL || import.meta.env.MAIN_VITE_API_URL || '';
const OFFLINE_AFTER_MS = 60_000; // F7 rule 5

/**
 * The only component that talks to the server (02 §3 rule 1). Holds tokens, refreshes them with a
 * device-signed request (FR-AUTH-03/04), anchors the clock from X-Server-Time and tracks connectivity.
 */
export class ApiClient {
  private accessToken: string | null = null;
  private refreshing: Promise<boolean> | null = null;
  private lastSuccessAt = Date.now();
  private online = true;
  private netListeners: NetListener[] = [];
  private unauthorizedHandler: ((reason: RevokeReason) => void) | null = null;
  private tokenListeners: TokenListener[] = [];
  private lastAuthError: ApiError | null = null;

  constructor(
    private store: Store,
    private device: DeviceIdentity,
    private clock: AnchoredClock,
  ) {
    this.accessToken = store.getSecret('auth.accessToken');
  }

  baseUrl(): string {
    return this.store.get<string>('api.url', DEFAULT_API_URL).replace(/\/$/, '');
  }

  setBaseUrl(url: string): void {
    this.store.set('api.url', normalizeApiUrl(url));
  }

  /** First-run check (F2): GET /health on a candidate address without storing it. */
  async probe(url: string): Promise<{ ok: boolean; url: string; message?: string }> {
    const base = normalizeApiUrl(url);
    if (!/^https?:\/\//.test(base)) return { ok: false, url: base, message: 'Address must start with https:// (or http:// for local testing).' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(`${base}/health`, { signal: controller.signal, headers: { 'X-Client-Type': 'desktop' } });
      if (!res.ok) return { ok: false, url: base, message: `Server answered ${res.status}. Check the address with your administrator.` };
      const serverTime = res.headers.get('x-server-time');
      if (serverTime) this.clock.anchor(serverTime);
      return { ok: true, url: base };
    } catch (e) {
      return { ok: false, url: base, message: `Cannot reach ${base}: ${(e as Error).message || 'network error'}` };
    } finally {
      clearTimeout(timer);
    }
  }

  isOnline(): boolean {
    return this.online;
  }

  onNetwork(fn: NetListener): void {
    this.netListeners.push(fn);
  }

  /** Fired once the session is gone for good: a 401 that a refresh could not repair (FR-SEC-25). */
  onUnauthorized(fn: (reason: RevokeReason) => void): void {
    this.unauthorizedHandler = fn;
  }

  /** Fired when the access token changes (login, refresh, wipe). The realtime client re-authenticates on it. */
  onTokens(fn: TokenListener): void {
    this.tokenListeners.push(fn);
  }

  /** Main process only: the realtime client sends it in the socket handshake. Never crosses the bridge. */
  currentAccessToken(): string | null {
    return this.accessToken;
  }

  hasSession(): boolean {
    return Boolean(this.store.getSecret('auth.refreshToken'));
  }

  setTokens(access: string, refresh: string): void {
    this.accessToken = access;
    this.store.setSecret('auth.accessToken', access);
    this.store.setSecret('auth.refreshToken', refresh);
    this.tokenListeners.forEach((l) => l(true));
  }

  clearTokens(): void {
    this.accessToken = null;
    this.store.setSecret('auth.accessToken', null);
    this.store.setSecret('auth.refreshToken', null);
    this.tokenListeners.forEach((l) => l(false));
  }

  /** Signed desktop login (F2/F3). Returns the raw API body so the renderer can branch on DEVICE_PENDING. */
  async login(identifier: string, password: string): Promise<ApiResult> {
    const timestamp = this.clock.nowIso();
    const body: Record<string, unknown> = {
      identifier,
      password,
      device: {
        id: this.device.deviceId() ?? undefined,
        publicKey: this.device.publicKeyPem(),
        name: this.device.name(),
        os: this.device.os(),
        hardwareHash: this.device.hardwareHash(),
        appVersion: app.getVersion(),
      },
      timestamp,
    };
    const signature = this.device.sign(timestamp, { identifier, timestamp, hardwareHash: this.device.hardwareHash() });
    const res = await this.raw('POST', '/auth/login', { ...body, signature }, false);
    if (res.ok && res.data && typeof res.data === 'object') {
      const d = res.data as { accessToken?: string; refreshToken?: string; status?: string; deviceId?: string };
      if (d.accessToken && d.refreshToken) {
        this.setTokens(d.accessToken, d.refreshToken);
        const deviceId = this.deviceIdFromJwt(d.accessToken);
        if (deviceId) this.device.setDeviceId(deviceId);
      } else if (d.status === 'DEVICE_PENDING' && d.deviceId) {
        this.device.setDeviceId(d.deviceId);
      }
    }
    return res;
  }

  async logout(): Promise<void> {
    try {
      await this.raw('POST', '/auth/logout', {}, true);
    } finally {
      this.clearTokens();
    }
  }

  /** Authenticated request with one transparent refresh on 401. */
  async request<T = unknown>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResult<T>> {
    let res = await this.raw<T>(method, path, body, true, headers);
    if (res.status === 401 && (await this.refresh())) {
      res = await this.raw<T>(method, path, body, true, headers);
    }
    if (res.status === 401) {
      const reason = revokeReasonFromError(this.lastAuthError ?? res.error);
      this.lastAuthError = null;
      this.clearTokens();
      this.unauthorizedHandler?.(reason);
    }
    return res;
  }

  /** Rotating refresh signed by the device key (FR-AUTH-04, FR-AUTH-09). */
  async refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const refreshToken = this.store.getSecret('auth.refreshToken');
      const deviceId = this.device.deviceId();
      if (!refreshToken || !deviceId) return false;
      const timestamp = this.clock.nowIso();
      const signature = this.device.sign(timestamp, { refreshToken, deviceId, timestamp });
      const res = await this.raw<{ accessToken: string; refreshToken: string }>('POST', '/auth/refresh', { refreshToken, deviceId, timestamp, signature }, false);
      if (res.ok && res.data?.accessToken) {
        this.setTokens(res.data.accessToken, res.data.refreshToken);
        return true;
      }
      if (res.status === 401 || res.status === 403) {
        this.lastAuthError = res.error ?? null;
        this.clearTokens();
      }
      return false;
    })();
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }

  private async raw<T>(method: string, path: string, body: unknown, auth: boolean, extra: Record<string, string> = {}): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Client-Type': 'desktop', ...extra };
    if (auth && this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    const deviceId = this.device.deviceId();
    if (deviceId) headers['X-Device-Id'] = deviceId;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${this.baseUrl()}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const serverTime = response.headers.get('x-server-time');
      if (serverTime) this.clock.anchor(serverTime);
      this.markOnline();
      const text = await response.text();
      let data: unknown = undefined;
      try {
        data = text ? JSON.parse(text) : undefined;
      } catch {
        data = text;
      }
      if (!response.ok) {
        const err = (data as { error?: Partial<ApiError> } | undefined)?.error;
        return {
          ok: false,
          status: response.status,
          error: { status: response.status, code: err?.code ?? `HTTP_${response.status}`, message: err?.message ?? `HTTP ${response.status}`, details: err?.details },
        };
      }
      return { ok: true, status: response.status, data: data as T };
    } catch (e) {
      this.markFailure();
      return { ok: false, status: 0, error: { status: 0, code: 'NETWORK', message: (e as Error).message || 'Network error' } };
    } finally {
      clearTimeout(timer);
    }
  }

  private markOnline(): void {
    this.lastSuccessAt = Date.now();
    if (!this.online) {
      this.online = true;
      this.netListeners.forEach((l) => l(true));
    }
  }

  private markFailure(): void {
    if (this.online && Date.now() - this.lastSuccessAt > OFFLINE_AFTER_MS) {
      this.online = false;
      this.netListeners.forEach((l) => l(false));
    }
  }

  private deviceIdFromJwt(token: string): string | null {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { device?: string | null };
      return payload.device ?? null;
    } catch {
      return null;
    }
  }
}

/** Accepts "company.com", "https://api.company.com" or a full ".../api/v1" and returns the API base. */
export function normalizeApiUrl(input: string): string {
  let u = input.trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  if (!/\/api\/v1$/.test(u)) u = `${u}/api/v1`;
  return u;
}
