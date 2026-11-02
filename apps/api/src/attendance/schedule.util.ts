/**
 * Pure schedule arithmetic for attendance (03 F8). No Prisma, no clock: everything takes explicit
 * instants and returns UTC Dates, so it is unit testable and safe for the desktop contract on /me.
 *
 * Local wall time to UTC uses Intl.DateTimeFormat with the company IANA timezone (no dependency).
 */

export interface ScheduleLike {
  workdays: number[]; // 1 = Mon .. 7 = Sun
  startTime: string; // HH:mm local
  endTime: string; // HH:mm local
  graceMinutes: number;
  halfDayPercent: number;
}

export interface ScheduledWindow {
  /** Local date (YYYY-MM-DD) the window belongs to. */
  date: string;
  start: Date;
  end: Date;
}

export interface AttendanceDateResolution {
  /** Local date (YYYY-MM-DD) in the company timezone. */
  date: string;
  /** True when no scheduled start lies within 4 h before / 8 h after the actual start. */
  unscheduled: boolean;
  /** The matched scheduled window, or null when unscheduled. */
  window: ScheduledWindow | null;
}

const BEFORE_WINDOW_MS = 4 * 3_600_000;
const AFTER_WINDOW_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall clock parts of an instant in a timezone. */
export function wallParts(instant: Date, timeZone: string): WallParts {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/** Offset of `timeZone` from UTC in milliseconds at `instant` (positive east of Greenwich). */
export function tzOffsetMs(instant: Date, timeZone: string): number {
  const w = wallParts(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // Drop sub-second part of the instant so the comparison is exact.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** YYYY-MM-DD of an instant in a timezone. */
export function localDateOf(instant: Date, timeZone: string): string {
  const w = wallParts(instant, timeZone);
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/** Adds calendar days to a YYYY-MM-DD string (pure calendar arithmetic, timezone independent). */
export function addLocalDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** ISO weekday 1 (Mon) .. 7 (Sun) of a YYYY-MM-DD string. */
export function localWeekday(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number);
  const js = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function isWorkday(localDate: string, schedule: Pick<ScheduleLike, 'workdays'>): boolean {
  return schedule.workdays.includes(localWeekday(localDate));
}

function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

/**
 * Converts a local wall time in `timeZone` to the UTC instant. Two offset probes handle DST
 * transitions: a wall time inside a spring-forward gap resolves to the instant after the gap,
 * an ambiguous fall-back time resolves to the first (DST) occurrence.
 */
export function localWallToUtc(localDate: string, hm: string, timeZone: string): Date {
  const [y, mo, d] = localDate.split('-').map(Number);
  const { h, m } = parseHm(hm);
  const naive = Date.UTC(y!, mo! - 1, d!, h, m, 0);
  const guess = naive - tzOffsetMs(new Date(naive), timeZone);
  const offsetAtGuess = tzOffsetMs(new Date(guess), timeZone);
  const corrected = naive - offsetAtGuess;
  if (corrected === guess) return new Date(guess);
  // Offsets disagree: we are next to a transition. Take the candidate whose wall time matches,
  // otherwise (gap) the later instant.
  const offsetAtCorrected = tzOffsetMs(new Date(corrected), timeZone);
  if (offsetAtCorrected === offsetAtGuess) return new Date(corrected);
  return new Date(Math.max(guess, corrected));
}

/**
 * Scheduled start and end instants for a local date. When endTime <= startTime the shift crosses
 * midnight and the end falls on the next local day.
 */
export function scheduledWindow(schedule: Pick<ScheduleLike, 'startTime' | 'endTime'>, timeZone: string, localDate: string): ScheduledWindow {
  const start = localWallToUtc(localDate, schedule.startTime, timeZone);
  const crosses = toMinutes(schedule.endTime) <= toMinutes(schedule.startTime);
  const end = localWallToUtc(crosses ? addLocalDays(localDate, 1) : localDate, schedule.endTime, timeZone);
  return { date: localDate, start, end };
}

function toMinutes(hm: string): number {
  const { h, m } = parseHm(hm);
  return h * 60 + m;
}

export function scheduledSeconds(window: ScheduledWindow): number {
  return Math.max(0, Math.floor((window.end.getTime() - window.start.getTime()) / 1000));
}

/**
 * F8 attendance date: the local date whose scheduled start is closest to the actual start, within
 * 4 h before to 8 h after that scheduled start. Candidates are the local date of the start and its
 * neighbours; non-workdays have no scheduled shift. Otherwise the local date of the start with
 * `unscheduled`.
 */
export function resolveAttendanceDate(startInstant: Date, schedule: ScheduleLike | null, timeZone: string): AttendanceDateResolution {
  const localDate = localDateOf(startInstant, timeZone);
  if (!schedule) return { date: localDate, unscheduled: true, window: null };
  let best: { window: ScheduledWindow; distance: number } | null = null;
  for (const delta of [-1, 0, 1]) {
    const date = addLocalDays(localDate, delta);
    if (!isWorkday(date, schedule)) continue;
    const window = scheduledWindow(schedule, timeZone, date);
    const diff = startInstant.getTime() - window.start.getTime();
    if (diff < -BEFORE_WINDOW_MS || diff > AFTER_WINDOW_MS) continue;
    const distance = Math.abs(diff);
    if (!best || distance < best.distance) best = { window, distance };
  }
  if (!best) return { date: localDate, unscheduled: true, window: null };
  return { date: best.window.date, unscheduled: false, window: best.window };
}

/** Next scheduled workday strictly after `fromLocalDate`, skipping holidays, within `maxDays`. */
export function nextWorkday(fromLocalDate: string, schedule: Pick<ScheduleLike, 'workdays'>, holidays: Set<string>, maxDays = 14): string | null {
  for (let i = 1; i <= maxDays; i += 1) {
    const d = addLocalDays(fromLocalDate, i);
    if (isWorkday(d, schedule) && !holidays.has(d)) return d;
  }
  return null;
}

/** `YYYY-MM-DD` -> UTC midnight Date, the storage form of @db.Date columns in this schema. */
export function localDateToDbDate(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

/** Inverse of localDateToDbDate. */
export function dbDateToLocalDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export { DAY_MS };
