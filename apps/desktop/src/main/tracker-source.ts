/**
 * Common shape of the two tracking sources: the C# agent over the named pipe (production, 09 §4)
 * and the in-process dev fallback used when no agent is present (macOS development).
 * Counts only, never content (AGENTS.md rule 8).
 */
export interface TrackerSegment {
  id: string;
  shiftId: string;
  startedAt: string;
  endedAt: string;
  kind: 'active' | 'idle' | 'locked';
  processName: string;
  appName: string;
  domain: string | null;
  windowTitle: string | null;
  keyCount: number;
  mouseCount: number;
  exception: 'none' | 'call_app' | 'meeting_app' | 'mic';
  claim: 'none' | 'break' | 'away_work';
  clockSource: 'anchored' | 'unanchored';
}

export interface TamperEvent {
  id: string;
  type: 'agent_stopped' | 'extension_missing' | 'clock_changed' | 'binary_mismatch';
  detail?: Record<string, unknown>;
  occurredAt: string;
}

export interface TrackerConfig {
  idleThresholdSeconds: number;
  longIdleThresholdSeconds: number;
  captureWindowTitles: boolean;
  exceptionApps: Array<{ processName: string; type: string }>;
  exclusions: Array<{ targetType: string; pattern: string }>;
}

export interface TrackerStatus {
  source: 'agent' | 'dev' | 'none';
  connected: boolean;
  agentVersion: string | null;
  tracking: boolean;
  paused: boolean;
  queueSize: number;
  queuePercent: number;
  extensionConnected: boolean;
  lastInputAgeSeconds: number | null;
  currentApp: { processName: string; appName: string; domain: string | null } | null;
}

export type TrackerEvent =
  | { type: 'longIdleEnded'; from: string; to: string; seconds: number }
  | { type: 'queueWarning'; percent: number }
  | { type: 'stateChanged' }
  | { type: 'connected' }
  | { type: 'disconnected' };

export interface TrackerSource {
  connect(): Promise<void>;
  setAnchor(serverTimeIso: string): Promise<void>;
  setConfig(config: TrackerConfig): Promise<void>;
  startTracking(shiftId: string): Promise<void>;
  pauseTracking(reason: string): Promise<void>;
  resumeTracking(): Promise<void>;
  stopTracking(): Promise<void>;
  pullSegments(max: number): Promise<TrackerSegment[]>;
  ackSegments(ids: string[]): Promise<void>;
  pullTamper(): Promise<TamperEvent[]>;
  ackTamper(ids: string[]): Promise<void>;
  status(): Promise<TrackerStatus>;
  on(listener: (event: TrackerEvent) => void): () => void;
  dispose(): void;
}
