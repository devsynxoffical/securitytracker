import { Prisma } from '@prisma/client';

/** Pure helpers for background jobs. Kept free of Prisma so they are unit testable. */

export interface AutoCloseRules {
  noHeartbeatMinutes: number;
  maxShiftHours: number;
}

export const DEFAULT_AUTO_CLOSE: AutoCloseRules = { noHeartbeatMinutes: 120, maxShiftHours: 16 };

export function autoCloseRulesFrom(settings: unknown): AutoCloseRules {
  const s = (settings ?? {}) as Record<string, unknown>;
  const n = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);
  return {
    noHeartbeatMinutes: n(s.autoCloseNoHeartbeatMinutes, DEFAULT_AUTO_CLOSE.noHeartbeatMinutes),
    maxShiftHours: n(s.maxShiftHours, DEFAULT_AUTO_CLOSE.maxShiftHours),
  };
}

/** F5 rule 4: no heartbeat for N minutes, or shift longer than M hours. */
export function shouldAutoClose(
  shift: { startedAt: Date; lastHeartbeatAt: Date },
  now: Date,
  rules: AutoCloseRules,
): 'no_heartbeat' | 'max_length' | null {
  if (now.getTime() - shift.lastHeartbeatAt.getTime() >= rules.noHeartbeatMinutes * 60_000) return 'no_heartbeat';
  if (now.getTime() - shift.startedAt.getTime() >= rules.maxShiftHours * 3_600_000) return 'max_length';
  return null;
}

/** End time = last heartbeat or last uploaded segment, whichever is later, never before start. */
export function autoCloseEndTime(shift: { startedAt: Date; lastHeartbeatAt: Date }, lastSegmentEnd: Date | null): Date {
  const candidates = [shift.lastHeartbeatAt.getTime(), lastSegmentEnd?.getTime() ?? 0, shift.startedAt.getTime()];
  return new Date(Math.max(...candidates));
}

export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export function retentionDaysFrom(settings: unknown, key: string, fallback: number): number {
  const s = (settings ?? {}) as Record<string, unknown>;
  const v = s[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}

export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export interface SegmentLike {
  kind: string;
  durationS: number;
  processName: string;
  appName: string;
  domain: string | null;
  keyCount: number;
  mouseCount: number;
}

export interface RollupResult {
  summary: { trackedS: number; activeS: number; idleS: number; lockedS: number; productiveS: number; neutralS: number; unproductiveS: number; keyCount: number; mouseCount: number; longIdleCount: number };
  apps: Map<string, { appName: string; category: string; activeS: number; idleS: number }>;
  domains: Map<string, { category: string; activeS: number }>;
}

/** Rebuilds one employee-day rollup from raw segments (job activity-rollup, FR-TRK-07). */
export function rollupSegments(
  segments: SegmentLike[],
  categoryOf: (processName: string, domain: string | null) => string,
  longIdleThresholdS: number,
): RollupResult {
  const summary = { trackedS: 0, activeS: 0, idleS: 0, lockedS: 0, productiveS: 0, neutralS: 0, unproductiveS: 0, keyCount: 0, mouseCount: 0, longIdleCount: 0 };
  const apps = new Map<string, { appName: string; category: string; activeS: number; idleS: number }>();
  const domains = new Map<string, { category: string; activeS: number }>();
  for (const seg of segments) {
    summary.keyCount += seg.keyCount;
    summary.mouseCount += seg.mouseCount;
    if (seg.kind === 'locked') {
      summary.lockedS += seg.durationS;
      continue;
    }
    summary.trackedS += seg.durationS;
    const category = categoryOf(seg.processName, seg.domain);
    const app = apps.get(seg.processName) ?? { appName: seg.appName, category, activeS: 0, idleS: 0 };
    if (seg.kind === 'active') {
      summary.activeS += seg.durationS;
      app.activeS += seg.durationS;
      if (category === 'productive') summary.productiveS += seg.durationS;
      else if (category === 'unproductive') summary.unproductiveS += seg.durationS;
      else summary.neutralS += seg.durationS;
      if (seg.domain && seg.domain !== 'unknown' && seg.domain !== 'excluded') {
        const dom = domains.get(seg.domain) ?? { category, activeS: 0 };
        dom.activeS += seg.durationS;
        domains.set(seg.domain, dom);
      }
    } else {
      summary.idleS += seg.durationS;
      app.idleS += seg.durationS;
      if (seg.durationS >= longIdleThresholdS) summary.longIdleCount += 1;
    }
    apps.set(seg.processName, app);
  }
  return { summary, apps, domains };
}

/** Period boundary check for target snapshots (F13): true at the first run after a period ended. */
export function periodEndedYesterday(period: 'daily' | 'weekly' | 'monthly', today: Date, weekStart = 1): boolean {
  const d = utcDayStart(today);
  if (period === 'daily') return true;
  if (period === 'weekly') return d.getUTCDay() === weekStart % 7;
  return d.getUTCDate() === 1;
}

export type JsonObject = Prisma.JsonObject;
