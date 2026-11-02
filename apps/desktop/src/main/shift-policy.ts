/**
 * Pure shift-policy decisions (schedule-aware start context, auto start, reminders).
 * No Electron, no I/O, no Date.now(): every function takes `now` from the AnchoredClock so the
 * decisions are testable (test/policy.spec.mjs) and independent of the PC clock (AGENTS.md rule 5).
 *
 * Everything here tolerates an older server: `schedule`/`policy` may be undefined, in which case
 * every behaviour is off (`startContext` says "inside schedule", nothing is due, nothing auto starts).
 */

export interface ScheduleToday {
  date: string;
  isWorkday: boolean;
  isHoliday: boolean;
  onLeave: boolean;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
}

export interface ScheduleInfo {
  scheduleId: string;
  name: string;
  timezone: string;
  workdays: number[];
  startTime: string;
  endTime: string;
  graceMinutes: number;
  today: ScheduleToday;
  next: { date: string; scheduledStartAt: string; scheduledEndAt: string } | null;
}

export interface ShiftPolicy {
  autoStartShiftOnLogin: boolean;
  autoStartWindowMinutesBefore: number;
  autoEndShiftOnShutdown: boolean;
  countEarlyStart: boolean;
  endReminderMinutes: number;
  startReminderEnabled: boolean;
  breakReminderAtAllowance: boolean;
  minShiftMinutes: number;
  longIdlePrompt: boolean;
  breakAllowanceMinutes: number;
  idleThresholdSeconds: number;
  longIdleThresholdSeconds: number;
}

/** Used when the server does not send a policy yet: every proactive behaviour is off. */
export const DEFAULT_POLICY: ShiftPolicy = {
  autoStartShiftOnLogin: false,
  autoStartWindowMinutesBefore: 30,
  autoEndShiftOnShutdown: false,
  countEarlyStart: true,
  endReminderMinutes: 0,
  startReminderEnabled: false,
  breakReminderAtAllowance: false,
  minShiftMinutes: 0,
  longIdlePrompt: true,
  breakAllowanceMinutes: 60,
  idleThresholdSeconds: 300,
  longIdleThresholdSeconds: 900,
};

export type ShiftState = 'OFF_SHIFT' | 'WORKING' | 'ON_BREAK';

export type StartContextReason = 'not_workday' | 'holiday' | 'on_leave' | 'too_early' | 'after_end' | null;

export interface StartContext {
  outsideSchedule: boolean;
  reason: StartContextReason;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
}

export interface ClosureInfo {
  startedAt: string | null;
  endedAt: string;
  reason: string;
  /** Attendance date (schedule.today.date) the closed shift belonged to, when known. */
  date: string | null;
}

/** Persisted reminder bookkeeping so a restart never re-fires a reminder (one per day / shift / break). */
export interface ReminderState {
  /** schedule.today.date the start/end bookkeeping belongs to; a new day resets it. */
  date: string | null;
  startFiredAt: string[];
  startDismissed: boolean;
  /** Shift id the end reminder was fired for (resets with a new shift). */
  endShiftId: string | null;
  endFiredAt: string | null;
  endSnoozedUntil: string | null;
  endSnoozes: number;
  endModalOpen: boolean;
  endDismissed: boolean;
  /** breakStartedAt the break reminder was fired for (once per break). */
  breakFiredFor: string | null;
  breakDismissed: boolean;
}

export const EMPTY_REMINDER: ReminderState = {
  date: null,
  startFiredAt: [],
  startDismissed: false,
  endShiftId: null,
  endFiredAt: null,
  endSnoozedUntil: null,
  endSnoozes: 0,
  endModalOpen: false,
  endDismissed: false,
  breakFiredFor: null,
  breakDismissed: false,
};

export const START_REMINDER_REPEAT_MS = 30 * 60_000;
export const START_REMINDER_MAX_FIRES = 2;
export const END_REMINDER_SNOOZE_MS = 30 * 60_000;
export const END_REMINDER_MAX_SNOOZES = 3;
export const EARLY_START_CONFIRM_MS = 120 * 60_000;

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

export function mergePolicy(partial: Partial<ShiftPolicy> | null | undefined): ShiftPolicy {
  return { ...DEFAULT_POLICY, ...(partial ?? {}) };
}

/** Is the given day a regular scheduled working day (not a weekly off, holiday or leave day)? */
export function isScheduledWorkday(today: ScheduleToday | null | undefined): boolean {
  return Boolean(today && today.isWorkday && !today.isHoliday && !today.onLeave && today.scheduledStartAt && today.scheduledEndAt);
}

/**
 * Behaviour 3: should the renderer ask before starting? Outside when today is not a workday, a
 * holiday or a leave day, more than 120 min before the scheduled start, or after the scheduled end.
 */
export function startContext(now: Date, schedule: ScheduleInfo | null | undefined, _policy?: ShiftPolicy | null): StartContext {
  const today = schedule?.today;
  const none: StartContext = { outsideSchedule: false, reason: null, scheduledStartAt: today?.scheduledStartAt ?? null, scheduledEndAt: today?.scheduledEndAt ?? null };
  if (!today) return none;
  if (today.onLeave) return { ...none, outsideSchedule: true, reason: 'on_leave' };
  if (today.isHoliday) return { ...none, outsideSchedule: true, reason: 'holiday' };
  if (!today.isWorkday) return { ...none, outsideSchedule: true, reason: 'not_workday' };
  const start = ms(today.scheduledStartAt);
  const end = ms(today.scheduledEndAt);
  if (start === null || end === null) return none;
  const t = now.getTime();
  if (t < start - EARLY_START_CONFIRM_MS) return { ...none, outsideSchedule: true, reason: 'too_early' };
  if (t > end) return { ...none, outsideSchedule: true, reason: 'after_end' };
  return none;
}

/**
 * Behaviour 4: auto start on login. Only OFF_SHIFT, on a scheduled workday, inside
 * [start - windowBefore, end], and never when a shift already ended on today's attendance date
 * (the employee ended it, or the server closed it; respect that).
 */
export function shouldAutoStart(now: Date, schedule: ScheduleInfo | null | undefined, policy: ShiftPolicy | null | undefined, state: ShiftState, lastClosure: ClosureInfo | null | undefined): boolean {
  if (!policy?.autoStartShiftOnLogin || state !== 'OFF_SHIFT') return false;
  const today = schedule?.today;
  if (!isScheduledWorkday(today)) return false;
  const start = ms(today!.scheduledStartAt)!;
  const end = ms(today!.scheduledEndAt)!;
  const t = now.getTime();
  if (t < start - Math.max(0, policy.autoStartWindowMinutesBefore) * 60_000 || t > end) return false;
  if (lastClosure && closureIsOnDate(lastClosure, today!)) return false;
  return true;
}

/** A closure counts for today when its attendance date matches (fallback for older data: the calendar day it ended). */
export function closureIsOnDate(closure: ClosureInfo, today: ScheduleToday): boolean {
  if (closure.date) return closure.date === today.date;
  return closure.endedAt.slice(0, 10) === today.date;
}

export interface ShiftFacts {
  state: ShiftState;
  shiftId: string | null;
  breakStartedAt: string | null;
  /** closed breaks + the running one, in seconds */
  breakSeconds: number;
}

export type ReminderKind = 'start' | 'end' | 'break';

/**
 * Behaviour 2: which reminder has to fire right now (OS notification + in-app), given the persisted
 * bookkeeping. Returns the kinds due; the caller records them with `recordFired`.
 *  - start: OFF_SHIFT on a workday, now >= scheduledStartAt + grace, fires at most twice (second +30 min)
 *  - end:   shift open, now >= scheduledEndAt + endReminderMinutes, once, then again after each snooze (max 3)
 */
export function reminderDue(now: Date, schedule: ScheduleInfo | null | undefined, policy: ShiftPolicy | null | undefined, facts: ShiftFacts, reminder: ReminderState): ReminderKind[] {
  const due: ReminderKind[] = [];
  const today = schedule?.today;
  if (!today || !policy) return due;
  const t = now.getTime();
  const r = reminder.date === today.date ? reminder : { ...EMPTY_REMINDER, date: today.date, breakFiredFor: reminder.breakFiredFor, breakDismissed: reminder.breakDismissed };

  if (policy.startReminderEnabled && facts.state === 'OFF_SHIFT' && isScheduledWorkday(today)) {
    const start = ms(today.scheduledStartAt)!;
    const threshold = start + Math.max(0, schedule!.graceMinutes ?? 0) * 60_000;
    const fires = r.startFiredAt.length;
    if (t >= threshold && fires < START_REMINDER_MAX_FIRES) {
      const last = fires ? ms(r.startFiredAt[fires - 1]!) : null;
      if (last === null || t >= last + START_REMINDER_REPEAT_MS) due.push('start');
    }
  }

  if (facts.state !== 'OFF_SHIFT' && today.scheduledEndAt) {
    const end = ms(today.scheduledEndAt)!;
    const threshold = end + Math.max(0, policy.endReminderMinutes ?? 0) * 60_000;
    const sameShift = r.endShiftId === facts.shiftId;
    if (t >= threshold) {
      if (!sameShift || !r.endFiredAt) due.push('end');
      else if (r.endSnoozedUntil && r.endSnoozes <= END_REMINDER_MAX_SNOOZES && t >= ms(r.endSnoozedUntil)! && !r.endModalOpen && !r.endDismissed) due.push('end');
    }
  }

  if (breakReminderDue(now, policy, facts, reminder)) due.push('break');
  return due;
}

/** Break reminder: ON_BREAK and (closed breaks + current break) >= allowance, once per break. */
export function breakReminderDue(_now: Date, policy: ShiftPolicy | null | undefined, facts: ShiftFacts, reminder: ReminderState): boolean {
  if (!policy?.breakReminderAtAllowance || facts.state !== 'ON_BREAK' || !facts.breakStartedAt) return false;
  if (reminder.breakFiredFor === facts.breakStartedAt) return false;
  return facts.breakSeconds >= Math.max(0, policy.breakAllowanceMinutes) * 60;
}

/** Bookkeeping after a reminder fired. Pure: returns the next state. */
export function recordFired(kind: ReminderKind, now: Date, today: ScheduleToday | null | undefined, facts: ShiftFacts, reminder: ReminderState): ReminderState {
  const base: ReminderState = reminder.date === (today?.date ?? null) ? { ...reminder } : { ...EMPTY_REMINDER, date: today?.date ?? null, breakFiredFor: reminder.breakFiredFor, breakDismissed: reminder.breakDismissed };
  if (kind === 'start') return { ...base, startFiredAt: [...base.startFiredAt, now.toISOString()], startDismissed: false };
  if (kind === 'end') {
    const fresh = base.endShiftId !== facts.shiftId;
    return { ...base, endShiftId: facts.shiftId, endFiredAt: fresh || !base.endFiredAt ? now.toISOString() : base.endFiredAt, endSnoozes: fresh ? 0 : base.endSnoozes, endSnoozedUntil: null, endModalOpen: true, endDismissed: false };
  }
  return { ...base, breakFiredFor: facts.breakStartedAt, breakDismissed: false };
}

/** "Keep working": closes the modal and re-arms it 30 min later, up to 3 times; after that only the banner remains. */
export function snoozeEnd(now: Date, reminder: ReminderState): ReminderState {
  const snoozes = reminder.endSnoozes + 1;
  return { ...reminder, endModalOpen: false, endSnoozes: snoozes, endSnoozedUntil: snoozes <= END_REMINDER_MAX_SNOOZES ? new Date(now.getTime() + END_REMINDER_SNOOZE_MS).toISOString() : null };
}

/** What the renderer shows (derived, never computed there). */
export interface ReminderView {
  startBanner: boolean;
  endBanner: boolean;
  endModal: boolean;
  endSnoozes: number;
  breakBanner: boolean;
  scheduledEndAt: string | null;
  breakAllowanceMinutes: number;
}

export function reminderView(schedule: ScheduleInfo | null | undefined, policy: ShiftPolicy | null | undefined, facts: ShiftFacts, reminder: ReminderState): ReminderView {
  const today = schedule?.today ?? null;
  const sameDay = Boolean(today && reminder.date === today.date);
  const startBanner = sameDay && facts.state === 'OFF_SHIFT' && reminder.startFiredAt.length > 0 && !reminder.startDismissed;
  const endArmed = facts.state !== 'OFF_SHIFT' && reminder.endShiftId === facts.shiftId && Boolean(reminder.endFiredAt);
  const breakBanner = facts.state === 'ON_BREAK' && reminder.breakFiredFor === facts.breakStartedAt && !reminder.breakDismissed;
  return {
    startBanner,
    endBanner: endArmed && !reminder.endDismissed,
    endModal: endArmed && reminder.endModalOpen,
    endSnoozes: endArmed ? reminder.endSnoozes : 0,
    breakBanner,
    scheduledEndAt: today?.scheduledEndAt ?? null,
    breakAllowanceMinutes: policy?.breakAllowanceMinutes ?? DEFAULT_POLICY.breakAllowanceMinutes,
  };
}
