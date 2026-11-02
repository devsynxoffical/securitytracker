import * as net from 'net';
import { randomUUID } from 'crypto';
import type { TrackerConfig, TrackerEvent, TrackerSegment, TrackerSource, TrackerStatus, TamperEvent } from './tracker-source';

interface PipeMessage {
  id?: string;
  cmd?: string;
  event?: string;
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

const RECONNECT_MS = [1000, 2000, 5000, 10000, 30000];

/**
 * Client for the C# tracker agent over the named pipe \\.\pipe\CompanyOS.Agent.<sessionId>
 * (09 §4: JSON lines, request/response by id, unsolicited events). Reconnects with backoff.
 * The agent keeps tracking while we are disconnected; nothing is lost (F5 rule 9).
 */
export class AgentClient implements TrackerSource {
  private socket: net.Socket | null = null;
  private buffer = '';
  private pending = new Map<string, { resolve: (m: PipeMessage) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private listeners: Array<(e: TrackerEvent) => void> = [];
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private disposed = false;
  private connected = false;
  private agentVersion: string | null = null;

  constructor(private readonly pipePath: string = AgentClient.defaultPipePath()) {}

  static defaultPipePath(): string {
    const sessionId = process.env.COMPANYOS_SESSION_ID || process.env.SESSIONNAME || '1';
    return `\\\\.\\pipe\\CompanyOS.Agent.${sessionId}`;
  }

  isConnected(): boolean {
    return this.connected;
  }

  connect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.disposed) return resolve();
      const socket = net.createConnection(this.pipePath);
      this.socket = socket;
      socket.setEncoding('utf8');
      socket.on('connect', async () => {
        this.connected = true;
        this.reconnectAttempt = 0;
        try {
          const hello = await this.send('hello', { appVersion: process.env.npm_package_version ?? '1.0.0' });
          this.agentVersion = (hello.agentVersion as string) ?? null;
        } catch {
          /* status() will report */
        }
        this.emit({ type: 'connected' });
        resolve();
      });
      socket.on('data', (chunk: string) => this.onData(chunk));
      socket.on('error', () => {
        /* handled by close */
      });
      socket.on('close', () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.socket = null;
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(new Error('Agent disconnected'));
        }
        this.pending.clear();
        if (wasConnected) this.emit({ type: 'disconnected' });
        this.scheduleReconnect();
        resolve();
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    const delay = RECONNECT_MS[Math.min(this.reconnectAttempt, RECONNECT_MS.length - 1)]!;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg: PipeMessage;
      try {
        msg = JSON.parse(line) as PipeMessage;
      } catch {
        continue;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.ok === false) p.reject(new Error(msg.error ?? 'Agent error'));
        else p.resolve(msg);
      } else if (msg.event) {
        this.onEvent(msg);
      }
    }
  }

  private onEvent(msg: PipeMessage): void {
    switch (msg.event) {
      case 'longIdleEnded': {
        const from = String(msg.from ?? '');
        const to = String(msg.to ?? '');
        const seconds = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
        this.emit({ type: 'longIdleEnded', from, to, seconds });
        break;
      }
      case 'queueWarning':
        this.emit({ type: 'queueWarning', percent: Number(msg.percent ?? 0) });
        break;
      case 'stateChanged':
        this.emit({ type: 'stateChanged' });
        break;
    }
  }

  private send(cmd: string, params: Record<string, unknown> = {}, timeoutMs = 5000): Promise<PipeMessage> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) return reject(new Error('Agent not connected'));
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Agent command ${cmd} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(JSON.stringify({ id, cmd, ...params }) + '\n');
    });
  }

  async setAnchor(serverTime: string): Promise<void> {
    await this.send('setAnchor', { serverTime });
  }
  async setConfig(config: TrackerConfig): Promise<void> {
    await this.send('setConfig', { ...config });
  }
  async startTracking(shiftId: string): Promise<void> {
    await this.send('startTracking', { shiftId });
  }
  async pauseTracking(reason: string): Promise<void> {
    await this.send('pauseTracking', { reason });
  }
  async resumeTracking(): Promise<void> {
    await this.send('resumeTracking');
  }
  async stopTracking(): Promise<void> {
    await this.send('stopTracking');
  }
  async pullSegments(max: number): Promise<TrackerSegment[]> {
    const res = await this.send('pullSegments', { max }, 15000);
    return (res.segments as TrackerSegment[]) ?? [];
  }
  async ackSegments(ids: string[]): Promise<void> {
    if (ids.length) await this.send('ackSegments', { ids });
  }
  async pullTamper(): Promise<TamperEvent[]> {
    const res = await this.send('pullTamper');
    return (res.events as TamperEvent[]) ?? [];
  }
  async ackTamper(ids: string[]): Promise<void> {
    if (ids.length) await this.send('ackTamper', { ids });
  }

  async status(): Promise<TrackerStatus> {
    if (!this.connected) {
      return { source: 'agent', connected: false, agentVersion: this.agentVersion, tracking: false, paused: false, queueSize: 0, queuePercent: 0, extensionConnected: false, lastInputAgeSeconds: null, currentApp: null };
    }
    const s = await this.send('status');
    return {
      source: 'agent',
      connected: true,
      agentVersion: this.agentVersion,
      tracking: Boolean(s.tracking),
      paused: Boolean(s.paused),
      queueSize: Number(s.queueSize ?? 0),
      queuePercent: Number(s.queuePercent ?? 0),
      extensionConnected: Boolean(s.extensionConnected),
      lastInputAgeSeconds: s.lastInputAgeSeconds === undefined ? null : Number(s.lastInputAgeSeconds),
      currentApp: (s.currentApp as TrackerStatus['currentApp']) ?? null,
    };
  }

  on(listener: (e: TrackerEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(e: TrackerEvent): void {
    this.listeners.forEach((l) => l(e));
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.destroy();
  }
}
