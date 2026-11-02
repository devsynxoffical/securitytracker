import { AttendanceStatus } from '@company-os/contracts';
import { ScheduleLike, ScheduledWindow, isWorkday, localWeekday, scheduledSeconds, scheduledWindow } from './schedule.util';

/** Pure F8 status and flag engine. The service loads the inputs, this file applies the rules. */

export interface ShiftInput {
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number;
  breakSeconds: number;
  offlineSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  flags: string[];
}

export interface AttendanceInputs {
  /** Local date (YYYY-MM-DD) in the company timezone. */
  date: string;
  timezone: string;
  schedule: (ScheduleLike & { id: string }) | null;
  isHoliday: boolean;
  onLeave: boolean;
  shifts: ShiftInput[];
  breakAllowanceMinutes: number;
  minShiftMinutes: number;
  countEarlyStart: boolean;
  corrected: boolean;
}

export interface AttendanceResult {
  status: string;
  flags: string[];
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workingSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  breakSeconds: number;
  offlineSeconds: number;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  lateSeconds: number | null;
  earlySeconds: number | null;
  scheduleId: string | null;
}

/** Days without a schedule assignment fall back to Monday to Friday (same default as 15 F25). */
const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];
const EARLY_START_MS = 60 * 60_000;

export function evaluateAttendance(input: AttendanceInputs): AttendanceResult {
  const flags = new Set<string>();
  if (input.corrected) flags.add('corrected');

  const window: ScheduledWindow | null = input.schedule && isWorkday(input.date, input.schedule) ? scheduledWindow(input.schedule, input.timezone, input.date) : null;
  const workday = input.schedule ? isWorkday(input.date, input.schedule) : DEFAULT_WORKDAYS.includes(localWeekday(input.date));
  if (!input.schedule) flags.add('unscheduled');

  const shifts = [...input.shifts].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  let working = 0;
  let active = 0;
  let idle = 0;
  let breaks = 0;
  let offline = 0;
  let checkInAt: Date | null = null;
  let checkOutAt: Date | null = null;
  let allEnded = shifts.length > 0;
  let autoClosed = false;

  for (const s of shifts) {
    let shiftWorking = s.durationSeconds - s.breakSeconds - s.offlineSeconds;
    if (!input.countEarlyStart && window) {
      const end = s.endedAt ?? window.start;
      const clipped = Math.max(0, Math.floor((Math.min(window.start.getTime(), end.getTime()) - s.startedAt.getTime()) / 1000));
      if (clipped > 0) {
        shiftWorking -= clipped;
        flags.add('early_clipped');
      }
    }
    working += Math.max(0, shiftWorking);
    active += s.activeSeconds;
    idle += s.idleSeconds;
    breaks += s.breakSeconds;
    offline += s.offlineSeconds;
    if (!checkInAt || s.startedAt < checkInAt) checkInAt = s.startedAt;
    if (s.endedAt && (!checkOutAt || s.endedAt > checkOutAt)) checkOutAt = s.endedAt;
    if (!s.endedAt) allEnded = false;
    if (s.flags.includes('auto_closed')) autoClosed = true;
    if (s.flags.includes('unscheduled')) flags.add('unscheduled');
    if (s.endedAt && input.minShiftMinutes > 0 && s.durationSeconds < input.minShiftMinutes * 60) flags.add('short_shift');
  }

  const hasShift = shifts.length > 0;
  let lateSeconds: number | null = null;
  let earlySeconds: number | null = null;
  let late = false;

  if (hasShift && window && checkInAt) {
    const graceMs = input.schedule!.graceMinutes * 60_000;
    const lateMs = checkInAt.getTime() - window.start.getTime();
    lateSeconds = Math.max(0, Math.floor(lateMs / 1000));
    if (lateMs > graceMs) {
      late = true;
      flags.add('late');
    }
    if (lateMs < -EARLY_START_MS) flags.add('early_start');
    if (allEnded && checkOutAt && !autoClosed) {
      const earlyMs = window.end.getTime() - checkOutAt.getTime();
      earlySeconds = Math.max(0, Math.floor(earlyMs / 1000));
      if (earlyMs > graceMs) flags.add('left_early');
    }
  }

  if (hasShift) {
    if (breaks > input.breakAllowanceMinutes * 60) flags.add('break_exceeded');
    if (autoClosed) flags.add('auto_closed');
    if (offline > 0) flags.add('offline_time');
  }

  let status: string;
  if (!hasShift && input.isHoliday) status = AttendanceStatus.HOLIDAY;
  else if (!hasShift && !workday) status = AttendanceStatus.WEEKLY_OFF;
  else if (input.onLeave) status = AttendanceStatus.ON_LEAVE;
  else if (!hasShift) status = AttendanceStatus.ABSENT;
  else if (window && working < (scheduledSeconds(window) * (input.schedule!.halfDayPercent || 50)) / 100) status = AttendanceStatus.HALF_DAY;
  else if (late) status = AttendanceStatus.LATE;
  else status = AttendanceStatus.PRESENT;

  return {
    status,
    flags: Array.from(flags),
    checkInAt,
    checkOutAt,
    workingSeconds: working,
    activeSeconds: active,
    idleSeconds: idle,
    breakSeconds: breaks,
    offlineSeconds: offline,
    scheduledStartAt: window?.start ?? null,
    scheduledEndAt: window?.end ?? null,
    lateSeconds,
    earlySeconds,
    scheduleId: input.schedule?.id ?? null,
  };
}

