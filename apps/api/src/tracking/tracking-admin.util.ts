import { ProductivityCategory, TrackingSettingsDto, TrackingSettingsSchema } from '@company-os/contracts';

/** active / (active + idle), rounded to whole percent, 0 when nothing tracked (16 section 1). */
export function activityPercent(activeS: number, idleS: number): number {
  const total = activeS + idleS;
  if (total <= 0) return 0;
  return Math.round((activeS / total) * 100);
}

/**
 * Rule pattern matching (FR-TRK-21): `*` wildcards match any run of characters and anchor the pattern;
 * a pattern without `*` is a case-insensitive substring match (the ingest behaviour).
 */
export function matchesPattern(pattern: string, value: string): boolean {
  const p = pattern.trim().toLowerCase();
  const v = value.toLowerCase();
  if (!p) return false;
  if (p.includes('*')) {
    const re = new RegExp('^' + p.split('*').map(escapeRegex).join('.*') + '$');
    return re.test(v);
  }
  return v.includes(p);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface RuleLike {
  targetType: string;
  pattern: string;
  category: string;
  departmentId?: string | null;
}

/** Category for an app or domain: department rule beats company rule, first match wins, default neutral. */
export function categorise(type: 'app' | 'domain', value: string, rules: RuleLike[], departmentId?: string | null): string {
  const scoped = rules.filter((r) => r.targetType === type);
  const dept = departmentId ? scoped.find((r) => r.departmentId === departmentId && matchesPattern(r.pattern, value)) : undefined;
  if (dept) return dept.category;
  const company = scoped.find((r) => !r.departmentId && matchesPattern(r.pattern, value));
  return company ? company.category : ProductivityCategory.NEUTRAL;
}

export function isUncategorised(type: 'app' | 'domain', value: string, rules: RuleLike[]): boolean {
  return !rules.some((r) => r.targetType === type && matchesPattern(r.pattern, value));
}

/** Half-open interval overlap check used for manual time (F27). */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export interface DayAggregateInput {
  summary?: { trackedS: number; activeS: number; idleS: number; lockedS: number; productiveS: number; neutralS: number; unproductiveS: number; keyCount: number; mouseCount: number } | null;
  shifts: Array<{ startedAt: Date; endedAt: Date | null; breakSeconds: number; offlineSeconds: number; state: string }>;
  attendance?: { status: string; manualSeconds: number; flags: string[] } | null;
}

export interface TimesheetRow {
  date: string;
  trackedS: number;
  activeS: number;
  idleS: number;
  lockedS: number;
  manualS: number;
  breakS: number;
  offlineS: number;
  productiveS: number;
  neutralS: number;
  unproductiveS: number;
  activityPercent: number;
  firstStart: string | null;
  lastEnd: string | null;
  shiftCount: number;
  openShift: boolean;
  status: string | null;
  flags: string[];
}

/** One timesheet row for one attendance date (FR-TRK-16). Several shifts on a day are summed. */
export function aggregateDay(date: string, input: DayAggregateInput): TimesheetRow {
  const s = input.summary;
  const starts = input.shifts.map((x) => x.startedAt.getTime());
  const ends = input.shifts.filter((x) => x.endedAt).map((x) => x.endedAt!.getTime());
  const activeS = s?.activeS ?? 0;
  const idleS = s?.idleS ?? 0;
  return {
    date,
    trackedS: s?.trackedS ?? 0,
    activeS,
    idleS,
    lockedS: s?.lockedS ?? 0,
    manualS: input.attendance?.manualSeconds ?? 0,
    breakS: input.shifts.reduce((a, x) => a + x.breakSeconds, 0),
    offlineS: input.shifts.reduce((a, x) => a + x.offlineSeconds, 0),
    productiveS: s?.productiveS ?? 0,
    neutralS: s?.neutralS ?? 0,
    unproductiveS: s?.unproductiveS ?? 0,
    activityPercent: activityPercent(activeS, idleS),
    firstStart: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
    lastEnd: ends.length ? new Date(Math.max(...ends)).toISOString() : null,
    shiftCount: input.shifts.length,
    openShift: input.shifts.some((x) => !x.endedAt),
    status: input.attendance?.status ?? null,
    flags: input.attendance?.flags ?? [],
  };
}

export function sumRows(rows: TimesheetRow[]) {
  const t = rows.reduce(
    (a, r) => ({
      trackedS: a.trackedS + r.trackedS,
      activeS: a.activeS + r.activeS,
      idleS: a.idleS + r.idleS,
      lockedS: a.lockedS + r.lockedS,
      manualS: a.manualS + r.manualS,
      breakS: a.breakS + r.breakS,
      offlineS: a.offlineS + r.offlineS,
      productiveS: a.productiveS + r.productiveS,
      neutralS: a.neutralS + r.neutralS,
      unproductiveS: a.unproductiveS + r.unproductiveS,
      daysWorked: a.daysWorked + (r.shiftCount > 0 ? 1 : 0),
    }),
    { trackedS: 0, activeS: 0, idleS: 0, lockedS: 0, manualS: 0, breakS: 0, offlineS: 0, productiveS: 0, neutralS: 0, unproductiveS: 0, daysWorked: 0 },
  );
  return { ...t, activityPercent: activityPercent(t.activeS, t.idleS) };
}

/** 'YYYY-MM-DD' -> UTC midnight Date. */
export function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function dayEnd(date: string): Date {
  return new Date(dayStart(date).getTime() + 86_400_000);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of 'YYYY-MM-DD' between from and to, capped at 93 days. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = dayStart(from).getTime();
  const end = dayStart(to).getTime();
  for (let t = start, i = 0; t <= end && i < 93; t += 86_400_000, i++) out.push(isoDate(new Date(t)));
  return out;
}

/** Company settings JSON merged with the tracking defaults (FR-TRK-24). */
export function trackingSettingsFrom(settings: unknown): TrackingSettingsDto {
  const src = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const k of Object.keys(TrackingSettingsSchema.shape)) if (src[k] !== undefined) picked[k] = src[k];
  const parsed = TrackingSettingsSchema.safeParse(picked);
  return parsed.success ? parsed.data : TrackingSettingsSchema.parse({});
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

export function hms(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
