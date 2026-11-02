import { randomUUID } from 'crypto';
import { ApiClient } from './api';
import { Store } from './store';
import { AnchoredClock } from './clock';
import type { TrackerSource, TrackerStatus, TrackerEvent } from './tracker-source';
import {
  type ClosureInfo,
  type ReminderKind,
  type ReminderState,
  type ReminderView,
  type ScheduleInfo,
  type ScheduleToday,
  type ShiftFacts,
  type ShiftPolicy,
  type ShiftState,
  type StartContext,
  EMPTY_REMINDER,
  mergePolicy,
  recordFired,
  reminderDue,
  reminderView,
  shouldAutoStart,
  snoozeEnd,
  startContext,
} from './shift-policy';

export type { ShiftState } from './shift-policy';

/** The schedule/policy part of GET /me. Older servers send neither; every dependent behaviour is then off. */
export interface ShiftProfile {
  schedule: ScheduleInfo | null;
  shiftPolicy: ShiftPolicy | null;
  fetchedAt: string;
}

type HeartbeatCommand = string | { type: 'shift_closed'; shiftId: string; endedAt: string; reason: string } | { type: string; [k: string]: unknown };

interface QueuedEvent {
  clientEventId: string;
  type: 'start' | 'break_start' | 'break_end' | 'end';
  breakType?: string;
  occurredAt: string;
  monotonicOffsetMs: number;
  offline: boolean;
}

export interface ShiftSnapshot {
  state: ShiftState;
  shiftId: string | null;
  startedAt: string | null;
  currentBreakType: string | null;
  breakStartedAt: string | null;
  durationSeconds: number;
  breakSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  pendingEvents: number;
  queuedSegments: number;
  lastSyncAt: string | null;
  online: boolean;
  tracker: TrackerStatus | null;
  anchored: boolean;
  /** Set when the server closed the shift behind our back (F5 rule 4 / another device); cleared on dismiss or next start. */
  lastClosure: ClosureInfo | null;
  reminder: ReminderView;
  scheduleToday: ScheduleToday | null;
  schedule: ScheduleInfo | null;
  policy: Pick<ShiftPolicy, 'autoStartShiftOnLogin' | 'autoStartWindowMinutesBefore' | 'autoEndShiftOnShutdown' | 'breakAllowanceMinutes'> | null;
}

export type ShiftNotice =
  | { kind: 'autoStarted'; at: string }
  | { kind: 'closedByServer'; closure: ClosureInfo }
  | { kind: 'reminder'; reminder: ReminderKind };

type Listener = (snapshot: ShiftSnapshot) => void;
type Prompt = (p: { from: string; to: string; seconds: number }) => void;
type Notifier = (title: string, body: string) => void;
type NoticeListener = (notice: ShiftNotice) => void;

const HEARTBEAT_MS = 60_000;
const UPLOAD_MS = 60_000;
const POLICY_TICK_MS = 30_000;
const PROFILE_REFRESH_MS = 15 * 60_000;
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000];

/**
 * Shift state machine for the desktop (F5) with offline queueing (F7) and the segment uploader (F6).
 * Local state is the source of truth while offline; the server confirms on reconnect.
 */
export class ShiftManager {
  private state: ShiftState;
  private shiftId: string | null;
  private startedAt: string | null;
  private breakStartedAt: string | null;
  private currentBreakType: string | null;
  private breakSecondsClosed: number;
  private activeSeconds = 0;
  private idleSeconds = 0;
  private lastSyncAt: string | null = null;
  private events: QueuedEvent[];
  private listeners: Listener[] = [];
  private prompt: Prompt | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private uploadTimer: NodeJS.Timeout | null = null;
  private syncing = false;
  private backoffIndex = 0;
  private trackerStatus: TrackerStatus | null = null;
  private longIdleSegmentIds: string[] = [];
  private policyTimer: NodeJS.Timeout | null = null;
  private profile: ShiftProfile | null;
  private lastClosure: ClosureInfo | null;
  private reminder: ReminderState;
  private notifier: Notifier | null = null;
  private noticeListeners: NoticeListener[] = [];

  constructor(
    private api: ApiClient,
    private store: Store,
    private clock: AnchoredClock,
    private tracker: TrackerSource,
  ) {
    this.state = store.get<ShiftState>('shift.state', 'OFF_SHIFT');
    this.shiftId = store.get<string | null>('shift.id', null);
    this.startedAt = store.get<string | null>('shift.startedAt', null);
    this.breakStartedAt = store.get<string | null>('shift.breakStartedAt', null);
    this.currentBreakType = store.get<string | null>('shift.breakType', null);
    this.breakSecondsClosed = store.get<number>('shift.breakSecondsClosed', 0);
    this.events = store.get<QueuedEvent[]>('shift.events', []);
    this.profile = store.get<ShiftProfile | null>('shift.profile', null);
    this.lastClosure = store.get<ClosureInfo | null>('shift.lastClosure', null);
    this.reminder = { ...EMPTY_REMINDER, ...store.get<Partial<ReminderState>>('shift.reminder', {}) };
    this.tracker.on((e) => this.onTrackerEvent(e));
    this.api.onNetwork(() => this.broadcast());
    this.clock.onClockJump((jump) => void this.reportTamper('clock_changed', { jumpMs: jump }));
  }

  onChange(l: Listener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }
  onLongIdle(p: Prompt): void {
    this.prompt = p;
  }
  /** OS notifications are shown by the main process (index.ts); this keeps Electron out of this class. */
  onNotify(n: Notifier): void {
    this.notifier = n;
  }
  onNotice(l: NoticeListener): () => void {
    this.noticeListeners.push(l);
    return () => {
      this.noticeListeners = this.noticeListeners.filter((x) => x !== l);
    };
  }

  /**
   * Called after login or at startup when a session exists. Resumes a locally open shift (F7), then
   * asks the server which shift is really open: a shift the server closed overnight must not stay
   * "WORKING" on the PC. Offline: local state wins until the connection returns.
   */
  async start(): Promise<void> {
    await this.tracker.connect();
    await this.pushConfig();
    if (this.state !== 'OFF_SHIFT') {
      if (this.shiftId) await this.safe(() => this.tracker.startTracking(this.shiftId!));
      if (this.state === 'ON_BREAK') await this.safe(() => this.tracker.pauseTracking(this.currentBreakType ?? 'break'));
    }
    await this.loadProfile();
    await this.reconcileWithServer();
    if (!this.tickTimer) this.tickTimer = setInterval(() => this.tick(), 1000);
    if (!this.heartbeatTimer) this.heartbeatTimer = setInterval(() => void this.heartbeat(), HEARTBEAT_MS);
    if (!this.uploadTimer) this.uploadTimer = setInterval(() => void this.sync(), UPLOAD_MS);
    if (!this.policyTimer) this.policyTimer = setInterval(() => void this.evaluatePolicy(), POLICY_TICK_MS);
    void this.sync();
    await this.evaluatePolicy();
    this.broadcast();
  }

  stop(): void {
    [this.tickTimer, this.heartbeatTimer, this.uploadTimer, this.policyTimer].forEach((t) => t && clearInterval(t));
    this.tickTimer = this.heartbeatTimer = this.uploadTimer = this.policyTimer = null;
  }

  /** Behaviour 3: the renderer asks before Start shift; all time math stays here. */
  startContext(): StartContext {
    return startContext(this.clock.now(), this.profile?.schedule, this.policy());
  }

  dismissClosure(): ShiftSnapshot {
    this.lastClosure = null;
    this.store.set('shift.lastClosure', null);
    this.broadcast();
    return this.snapshot();
  }

  /** "Keep working" on the end-of-shift modal: snooze 30 min, at most 3 times. */
  snoozeEndReminder(): ShiftSnapshot {
    this.reminder = snoozeEnd(this.clock.now(), this.reminder);
    this.store.set('shift.reminder', this.reminder);
    this.broadcast();
    return this.snapshot();
  }

  dismissReminder(kind: ReminderKind): ShiftSnapshot {
    if (kind === 'start') this.reminder = { ...this.reminder, startDismissed: true };
    else if (kind === 'end') this.reminder = { ...this.reminder, endDismissed: true, endModalOpen: false };
    else this.reminder = { ...this.reminder, breakDismissed: true };
    this.store.set('shift.reminder', this.reminder);
    this.broadcast();
    return this.snapshot();
  }

  /** Lid opened / PC woke up: the server may have auto-closed the shift meanwhile (F5 rule 4). */
  async onResume(): Promise<void> {
    if (!this.api.hasSession()) return;
    await this.loadProfile();
    await this.reconcileWithServer();
    await this.evaluatePolicy();
    this.broadcast();
  }

  /**
   * Behaviour 5: OS shutdown / logoff. With `autoEndShiftOnShutdown` the shift ends now (queued,
   * flagged offline if the network is already gone) so it closes with the shutdown time instead of
   * waiting for the server's auto-close. Returns the sync promise so the caller can bound the wait.
   */
  async onShutdown(): Promise<void> {
    if (this.state === 'OFF_SHIFT' || !this.policy().autoEndShiftOnShutdown) return;
    if (this.state === 'ON_BREAK') {
      if (this.breakStartedAt) this.breakSecondsClosed += Math.round((this.clock.now().getTime() - Date.parse(this.breakStartedAt)) / 1000);
      this.enqueue('break_end');
    }
    this.enqueue('end');
    this.resetShiftState();
    this.persist();
    await this.safe(() => this.tracker.stopTracking());
    await this.sync();
  }

  /**
   * Dev-only (COMPANYOS_DEV_SIM=1, see index.ts): drive main-process state for screenshots and manual
   * QA without a server that implements the schedule contract. Never registered in production.
   */
  devSimulate(payload: { profile?: Partial<ShiftProfile>; closure?: ClosureInfo | null; state?: ShiftState; reminder?: Partial<ReminderState> }): ShiftSnapshot {
    if (payload.profile) {
      this.profile = { schedule: payload.profile.schedule ?? null, shiftPolicy: payload.profile.shiftPolicy ?? null, fetchedAt: this.clock.nowIso() };
      this.store.set('shift.profile', this.profile);
    }
    if (payload.closure !== undefined) {
      this.lastClosure = payload.closure;
      this.store.set('shift.lastClosure', this.lastClosure);
    }
    if (payload.state) {
      this.state = payload.state;
      if (payload.state === 'OFF_SHIFT') this.resetShiftState();
      else {
        this.shiftId = this.shiftId ?? randomUUID();
        this.startedAt = this.startedAt ?? this.clock.nowIso();
        if (payload.state === 'ON_BREAK') {
          this.breakStartedAt = this.breakStartedAt ?? this.clock.nowIso();
          this.currentBreakType = this.currentBreakType ?? 'Lunch';
        }
      }
      this.persist();
    }
    if (payload.reminder) {
      this.reminder = { ...this.reminder, ...payload.reminder };
      this.store.set('shift.reminder', this.reminder);
    }
    this.broadcast();
    return this.snapshot();
  }

  snapshot(): ShiftSnapshot {
    const now = this.clock.now().getTime();
    const started = this.startedAt ? Date.parse(this.startedAt) : now;
    const openBreak = this.breakStartedAt ? Math.round((now - Date.parse(this.breakStartedAt)) / 1000) : 0;
    return {
      state: this.state,
      shiftId: this.shiftId,
      startedAt: this.startedAt,
      currentBreakType: this.currentBreakType,
      breakStartedAt: this.breakStartedAt,
      durationSeconds: this.state === 'OFF_SHIFT' ? 0 : Math.max(0, Math.round((now - started) / 1000)),
      breakSeconds: this.breakSecondsClosed + openBreak,
      activeSeconds: this.activeSeconds,
      idleSeconds: this.idleSeconds,
      pendingEvents: this.events.length,
      queuedSegments: this.trackerStatus?.queueSize ?? 0,
      lastSyncAt: this.lastSyncAt,
      online: this.api.isOnline(),
      tracker: this.trackerStatus,
      anchored: this.clock.isAnchored(),
      lastClosure: this.lastClosure,
      reminder: reminderView(this.profile?.schedule, this.profile?.shiftPolicy, this.facts(), this.reminder),
      scheduleToday: this.profile?.schedule?.today ?? null,
      schedule: this.profile?.schedule ?? null,
      policy: this.profile?.shiftPolicy
        ? {
            autoStartShiftOnLogin: this.profile.shiftPolicy.autoStartShiftOnLogin,
            autoStartWindowMinutesBefore: this.profile.shiftPolicy.autoStartWindowMinutesBefore,
            autoEndShiftOnShutdown: this.profile.shiftPolicy.autoEndShiftOnShutdown,
            breakAllowanceMinutes: this.profile.shiftPolicy.breakAllowanceMinutes,
          }
        : null,
    };
  }

  private policy(): ShiftPolicy {
    return mergePolicy(this.profile?.shiftPolicy);
  }

  private facts(): ShiftFacts {
    const now = this.clock.now().getTime();
    const openBreak = this.breakStartedAt ? Math.round((now - Date.parse(this.breakStartedAt)) / 1000) : 0;
    return { state: this.state, shiftId: this.shiftId, breakStartedAt: this.breakStartedAt, breakSeconds: this.breakSecondsClosed + openBreak };
  }

  // ---- transitions (F5) ----------------------------------------------------

  async startShift(): Promise<ShiftSnapshot> {
    if (this.state !== 'OFF_SHIFT') return this.snapshot();
    const now = this.clock.nowIso();
    // Provisional local id until the server confirms (events are keyed by clientEventId, so safe).
    this.shiftId = this.shiftId ?? randomUUID();
    this.startedAt = now;
    this.state = 'WORKING';
    this.breakSecondsClosed = 0;
    this.lastClosure = null; // a new shift supersedes the "closed by server" notice
    this.store.set('shift.lastClosure', null);
    this.enqueue('start');
    await this.safe(() => this.tracker.startTracking(this.shiftId!));
    this.persist();
    await this.sync();
    return this.snapshot();
  }

  async startBreak(breakType: string): Promise<ShiftSnapshot> {
    if (this.state !== 'WORKING') return this.snapshot();
    this.state = 'ON_BREAK';
    this.currentBreakType = breakType;
    this.breakStartedAt = this.clock.nowIso();
    this.enqueue('break_start', breakType);
    await this.safe(() => this.tracker.pauseTracking(breakType));
    this.persist();
    void this.sync();
    return this.snapshot();
  }

  async endBreak(): Promise<ShiftSnapshot> {
    if (this.state !== 'ON_BREAK') return this.snapshot();
    if (this.breakStartedAt) this.breakSecondsClosed += Math.round((this.clock.now().getTime() - Date.parse(this.breakStartedAt)) / 1000);
    this.state = 'WORKING';
    this.breakStartedAt = null;
    this.currentBreakType = null;
    this.enqueue('break_end');
    await this.safe(() => this.tracker.resumeTracking());
    this.persist();
    void this.sync();
    return this.snapshot();
  }

  async endShift(): Promise<ShiftSnapshot> {
    if (this.state === 'OFF_SHIFT') return this.snapshot();
    if (this.state === 'ON_BREAK') await this.endBreak();
    this.enqueue('end');
    await this.safe(() => this.tracker.stopTracking());
    await this.sync(); // F6: upload at end of shift
    this.rememberEnded(this.clock.nowIso());
    this.resetShiftState();
    this.persist();
    this.broadcast();
    return this.snapshot();
  }

  private resetShiftState(): void {
    this.state = 'OFF_SHIFT';
    this.shiftId = null;
    this.startedAt = null;
    this.breakStartedAt = null;
    this.currentBreakType = null;
    this.breakSecondsClosed = 0;
    this.activeSeconds = 0;
    this.idleSeconds = 0;
  }

  /** Behaviour 4 needs to know that a shift already ended today (user-ended ones included) so it never auto starts again. */
  private rememberEnded(endedAt: string): void {
    this.store.set('shift.lastEnded', { endedAt, date: this.profile?.schedule?.today?.date ?? endedAt.slice(0, 10) });
  }

  /**
   * Server truth: the shift we think is open was closed (auto-close, max length, another device).
   * Stop tracking, go OFF_SHIFT and keep a notice until the user dismisses it or starts a new shift.
   */
  private async adoptClosure(closure: { endedAt?: string | null; reason?: string | null }): Promise<void> {
    if (this.state === 'OFF_SHIFT') return;
    const info: ClosureInfo = {
      startedAt: this.startedAt,
      endedAt: closure.endedAt ?? this.lastSyncAt ?? this.clock.nowIso(),
      reason: closure.reason ?? 'unknown',
      date: this.profile?.schedule?.today?.date ?? null,
    };
    await this.safe(() => this.tracker.stopTracking());
    this.resetShiftState();
    this.lastClosure = info;
    this.store.set('shift.lastClosure', info);
    this.store.set('shift.lastEnded', { endedAt: info.endedAt, date: info.date ?? info.endedAt.slice(0, 10) });
    this.persist();
    this.emitNotice({ kind: 'closedByServer', closure: info });
    this.broadcast();
  }

  /** Long idle answer (F5 rule 6): claim recorded on the idle segments that are still queued. */
  async claimLongIdle(claim: 'break' | 'away_work'): Promise<void> {
    if (!this.longIdleSegmentIds.length) return;
    this.store.set('shift.pendingClaims', { ...this.store.get<Record<string, string>>('shift.pendingClaims', {}), ...Object.fromEntries(this.longIdleSegmentIds.map((id) => [id, claim])) });
    this.longIdleSegmentIds = [];
  }

  // ---- sync (F7 rule 2: events, then segments, then heartbeat) ------------

  async sync(): Promise<void> {
    if (this.syncing || !this.api.hasSession()) return;
    this.syncing = true;
    try {
      if (!(await this.flushEvents())) return this.scheduleRetry();
      if (!(await this.uploadSegments())) return this.scheduleRetry();
      await this.uploadTamper();
      await this.heartbeat();
      this.backoffIndex = 0;
      this.lastSyncAt = this.clock.nowIso();
    } finally {
      this.syncing = false;
      this.broadcast();
    }
  }

  private scheduleRetry(): void {
    const delay = BACKOFF_MS[Math.min(this.backoffIndex, BACKOFF_MS.length - 1)]!;
    this.backoffIndex += 1;
    setTimeout(() => void this.sync(), delay);
  }

  private async flushEvents(): Promise<boolean> {
    if (!this.events.length) return true;
    const batch = this.events.slice(0, 50);
    const res = await this.api.request<{ shiftId?: string; shift?: { id: string }; accepted?: string[]; closedShift?: { id: string; endedAt: string; reason: string } }>('POST', '/shifts/events', {
      events: batch.map(({ offline: _offline, ...e }) => e),
    });
    if (!res.ok) {
      if (res.status === 409 && res.error?.details && typeof res.error.details === 'object') {
        // F5 rule 1: another open shift. Adopt it when it is ours.
        const open = (res.error.details as { openShift?: { id: string; startedAt: string } }).openShift;
        if (open) {
          this.shiftId = open.id;
          this.startedAt = open.startedAt;
          this.events = this.events.filter((e) => e.type !== 'start');
          this.persist();
          return true;
        }
      }
      return res.status === 0 ? false : this.dropPoison(batch);
    }
    const sent = new Set(batch.map((e) => e.clientEventId));
    const closed = res.data?.closedShift;
    if (closed && this.state !== 'OFF_SHIFT' && (closed.id === this.shiftId || !batch.some((e) => e.type === 'start'))) {
      // The events referred to a shift the server already closed; they are acknowledged (treated as sent).
      this.events = this.events.filter((e) => !sent.has(e.clientEventId));
      await this.adoptClosure(closed);
      return this.events.length === 0 ? true : this.flushEvents();
    }
    const serverShiftId = res.data?.shiftId ?? res.data?.shift?.id;
    if (serverShiftId && this.state !== 'OFF_SHIFT' && this.shiftId !== serverShiftId) {
      this.shiftId = serverShiftId;
      await this.safe(() => this.tracker.startTracking(serverShiftId));
      if (this.state === 'ON_BREAK') await this.safe(() => this.tracker.pauseTracking(this.currentBreakType ?? 'break'));
    }
    this.events = this.events.filter((e) => !sent.has(e.clientEventId));
    this.persist();
    return this.events.length === 0 ? true : this.flushEvents();
  }

  /** A 4xx that is not a network error means the event will never be accepted; keep going. */
  private dropPoison(batch: QueuedEvent[]): boolean {
    const sent = new Set(batch.map((e) => e.clientEventId));
    this.events = this.events.filter((e) => !sent.has(e.clientEventId));
    this.persist();
    return true;
  }

  private async uploadSegments(): Promise<boolean> {
    if (!this.shiftId && this.state === 'OFF_SHIFT') {
      // shift ended: drain whatever the agent still holds for the last shift
    }
    for (let round = 0; round < 50; round++) {
      const segments = await this.safe(() => this.tracker.pullSegments(500), []);
      if (!segments.length) return true;
      const claims = this.store.get<Record<string, string>>('shift.pendingClaims', {});
      const byShift = new Map<string, typeof segments>();
      for (const s of segments) {
        const list = byShift.get(s.shiftId) ?? [];
        list.push({ ...s, claim: (claims[s.id] as typeof s.claim) ?? s.claim });
        byShift.set(s.shiftId, list);
      }
      for (const [shiftId, list] of byShift) {
        const res = await this.api.request<{ accepted: string[]; rejected: Array<{ id: string; reason: string }> }>(
          'POST',
          '/tracking/segments',
          { shiftId, segments: list },
          { 'Idempotency-Key': randomUUID() },
        );
        if (!res.ok) {
          if (res.status === 0) return false;
          if (res.status >= 400 && res.status < 500 && res.status !== 401) {
            // whole batch unusable (e.g. unknown shift): drop to avoid blocking the queue forever
            await this.safe(() => this.tracker.ackSegments(list.map((s) => s.id)));
            continue;
          }
          return false;
        }
        const permanent = (res.data?.rejected ?? []).filter((r) => r.reason !== 'OVERLAP').map((r) => r.id);
        const ack = [...(res.data?.accepted ?? []), ...permanent];
        await this.safe(() => this.tracker.ackSegments(ack));
        for (const id of ack) delete claims[id];
      }
      this.store.set('shift.pendingClaims', claims);
    }
    return true;
  }

  private async uploadTamper(): Promise<void> {
    const events = await this.safe(() => this.tracker.pullTamper(), []);
    for (const t of events) {
      const res = await this.api.request('POST', '/tracking/tamper-events', { type: t.type, detail: t.detail ?? {}, occurredAt: t.occurredAt });
      if (res.ok || (res.status >= 400 && res.status !== 401)) await this.safe(() => this.tracker.ackTamper([t.id]));
    }
  }

  private async reportTamper(type: 'clock_changed' | 'agent_stopped', detail: Record<string, unknown>): Promise<void> {
    await this.api.request('POST', '/tracking/tamper-events', { type, detail, occurredAt: this.clock.nowIso() });
  }

  async heartbeat(): Promise<void> {
    if (!this.api.hasSession()) return;
    const status = await this.safe(() => this.tracker.status(), null);
    this.trackerStatus = status;
    const res = await this.api.request<{ serverTime: string; configVersion?: number; commands?: HeartbeatCommand[] }>('POST', '/shifts/heartbeat', {
      state: this.state,
      clientClock: new Date().toISOString(),
      queueSize: (status?.queueSize ?? 0) + this.events.length,
      shiftId: this.state !== 'OFF_SHIFT' && this.shiftId && !this.events.some((e) => e.type === 'start') ? this.shiftId : undefined,
    });
    if (res.ok && res.data) {
      if (res.data.serverTime) {
        this.clock.anchor(res.data.serverTime);
        await this.safe(() => this.tracker.setAnchor(res.data!.serverTime));
      }
      const commands = Array.isArray(res.data.commands) ? res.data.commands : [];
      const names = new Set(commands.map((c) => (typeof c === 'string' ? c : c.type)));
      if (names.has('config_changed')) {
        await this.pushConfig();
        await this.loadProfile(true);
      }
      if (names.has('force_logout')) {
        this.api.clearTokens();
      }
      for (const c of commands) {
        if (typeof c !== 'string' && c.type === 'shift_closed') {
          const cmd = c as { shiftId?: string; endedAt?: string; reason?: string };
          if (this.state !== 'OFF_SHIFT' && (!cmd.shiftId || cmd.shiftId === this.shiftId) && !this.events.some((e) => e.type === 'start')) await this.adoptClosure(cmd);
        }
      }
    }
  }

  /** Schedule and shift policy ride on GET /me; cached so an offline start still knows them. */
  private async loadProfile(force = false): Promise<void> {
    if (!this.api.hasSession()) return;
    if (!force && this.profile && this.clock.now().getTime() - Date.parse(this.profile.fetchedAt) < PROFILE_REFRESH_MS) return;
    const res = await this.api.request<{ schedule?: ScheduleInfo | null; shiftPolicy?: ShiftPolicy | null }>('GET', '/me');
    if (!res.ok || !res.data || typeof res.data !== 'object') return;
    this.profile = { schedule: res.data.schedule ?? null, shiftPolicy: res.data.shiftPolicy ?? null, fetchedAt: this.clock.nowIso() };
    this.store.set('shift.profile', this.profile);
  }

  /** Behaviours 2 and 4, every 30 s from the anchored clock. Each reminder fires once per day / shift / break (persisted). */
  private async evaluatePolicy(): Promise<void> {
    if (!this.api.hasSession()) return;
    await this.loadProfile();
    const schedule = this.profile?.schedule;
    const policy = this.policy();
    const now = this.clock.now();
    const lastEnded = this.store.get<{ endedAt: string; date: string } | null>('shift.lastEnded', null);
    const closure: ClosureInfo | null = this.lastClosure ?? (lastEnded ? { startedAt: null, endedAt: lastEnded.endedAt, reason: 'ended', date: lastEnded.date } : null);
    if (shouldAutoStart(now, schedule, policy, this.state, closure) && !this.events.some((e) => e.type === 'start')) {
      await this.startShift();
      this.emitNotice({ kind: 'autoStarted', at: this.startedAt ?? now.toISOString() });
      return;
    }
    const facts = this.facts();
    const due = reminderDue(now, schedule, policy, facts, this.reminder);
    for (const kind of due) {
      this.reminder = recordFired(kind, now, schedule?.today, facts, this.reminder);
      this.store.set('shift.reminder', this.reminder);
      this.notify(kind, facts);
      this.emitNotice({ kind: 'reminder', reminder: kind });
    }
    if (due.length) this.broadcast();
  }

  private notify(kind: ReminderKind, facts: ShiftFacts): void {
    const end = this.profile?.schedule?.today?.scheduledEndAt;
    const endLabel = end ? new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    if (kind === 'start') this.notifier?.('You have not started your shift', 'Your scheduled shift has begun. Open WorkPulse and press Start shift.');
    else if (kind === 'end') this.notifier?.('Your shift is still running', endLabel ? `Your shift was scheduled to end at ${endLabel}. End it now or keep working.` : 'Your scheduled shift has ended. End it now or keep working.');
    else this.notifier?.(`Break allowance reached (${this.policy().breakAllowanceMinutes} min)`, `You have been on break for ${Math.round(facts.breakSeconds / 60)} minutes. Resume when you are back.`);
  }

  private emitNotice(n: ShiftNotice): void {
    this.noticeListeners.forEach((l) => l(n));
  }

  /**
   * Server is authoritative for which shift is open: one we do not know about (another device, a
   * wiped state file) is adopted; one we think is open but the server has closed is dropped with a
   * notice. Unreachable server: keep the local state (F7). Queued, unsent events (an offline start)
   * are left alone: the events response settles them.
   */
  private async reconcileWithServer(): Promise<void> {
    const res = await this.api.request<{ id: string; state: ShiftState | 'ENDED'; startedAt: string; endedAt?: string | null; endReason?: string | null; closeReason?: string | null; currentBreak: { startedAt: string; type?: string } | null; activeSeconds: number; idleSeconds: number; breakSeconds: number } | null>('GET', '/shifts/current');
    if (!res.ok) return;
    const pendingStart = this.events.some((e) => e.type === 'start');
    const s = res.data && typeof res.data === 'object' && 'id' in res.data ? res.data : null;
    if (!s || s.state === 'ENDED') {
      if (this.state !== 'OFF_SHIFT' && !pendingStart) {
        await this.adoptClosure({ endedAt: s?.endedAt ?? null, reason: s?.endReason ?? s?.closeReason ?? null });
      }
      return;
    }
    if (this.state !== 'OFF_SHIFT' && (pendingStart || this.shiftId === s.id)) return; // same shift, local state is current
    this.shiftId = s.id;
    this.startedAt = s.startedAt;
    this.state = s.state === 'ON_BREAK' ? 'ON_BREAK' : 'WORKING';
    this.breakStartedAt = s.currentBreak?.startedAt ?? null;
    this.currentBreakType = s.currentBreak?.type ?? null;
    this.breakSecondsClosed = s.breakSeconds ?? 0;
    this.activeSeconds = s.activeSeconds ?? 0;
    this.idleSeconds = s.idleSeconds ?? 0;
    await this.safe(() => this.tracker.startTracking(s.id));
    if (this.state === 'ON_BREAK') await this.safe(() => this.tracker.pauseTracking(this.currentBreakType ?? 'break'));
    this.persist();
    this.broadcast();
  }

  private async pushConfig(): Promise<void> {
    const res = await this.api.request<{ idleThresholdSeconds: number; captureWindowTitles: boolean; exceptionApps: Array<{ processName: string; type: string }>; exclusions: Array<{ targetType: string; pattern: string }>; longIdleThresholdSeconds?: number }>('GET', '/tracking/config');
    const cfg = res.ok && res.data ? res.data : this.store.get('tracker.config', null);
    if (!cfg) return;
    this.store.set('tracker.config', cfg);
    await this.safe(() =>
      this.tracker.setConfig({
        idleThresholdSeconds: cfg.idleThresholdSeconds ?? 300,
        longIdleThresholdSeconds: cfg.longIdleThresholdSeconds ?? 900,
        captureWindowTitles: cfg.captureWindowTitles ?? false,
        exceptionApps: cfg.exceptionApps ?? [],
        exclusions: cfg.exclusions ?? [],
      }),
    );
  }

  // ---- internals -----------------------------------------------------------

  private enqueue(type: QueuedEvent['type'], breakType?: string): void {
    this.events.push({
      clientEventId: randomUUID(),
      type,
      breakType,
      occurredAt: this.clock.nowIso(),
      monotonicOffsetMs: this.clock.monotonicMs(),
      offline: !this.api.isOnline(),
    });
    this.persist();
  }

  private tick(): void {
    this.clock.tick();
    if (this.state === 'WORKING') {
      const idle = this.trackerStatus?.lastInputAgeSeconds;
      if (idle !== null && idle !== undefined && idle >= 300) this.idleSeconds += 1;
      else this.activeSeconds += 1;
    }
    this.broadcast();
  }

  private onTrackerEvent(e: TrackerEvent): void {
    if (e.type === 'longIdleEnded') {
      this.prompt?.({ from: e.from, to: e.to, seconds: e.seconds });
      // segments covering the idle window are the ones still queued with kind idle; the agent
      // returns their ids with the event when available
    } else if (e.type === 'disconnected' && this.state !== 'OFF_SHIFT') {
      void this.reportTamper('agent_stopped', { shiftId: this.shiftId });
    } else if (e.type === 'stateChanged' || e.type === 'connected') {
      void this.safe(() => this.tracker.status(), null).then((s) => {
        this.trackerStatus = s;
        this.broadcast();
      });
    }
  }

  private persist(): void {
    this.store.set('shift.state', this.state);
    this.store.set('shift.id', this.shiftId);
    this.store.set('shift.startedAt', this.startedAt);
    this.store.set('shift.breakStartedAt', this.breakStartedAt);
    this.store.set('shift.breakType', this.currentBreakType);
    this.store.set('shift.breakSecondsClosed', this.breakSecondsClosed);
    this.store.set('shift.events', this.events);
  }

  private broadcast(): void {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }

  private async safe<T>(fn: () => Promise<T>, fallback?: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback as T;
    }
  }
}
