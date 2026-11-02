import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ScopeFilter } from '../auth/guards/rbac.guard';

/** Prisma `where` fragment for employee-owned rows (attendance, leave, profiles). */
export function employeeScopeWhere(scope: ScopeFilter): Record<string, unknown> {
  if (scope.scope === 'all') return {};
  return { employeeId: { in: scope.allowedEmployeeIds } };
}

export function inScope(scope: ScopeFilter, employeeId: string): boolean {
  return scope.scope === 'all' || scope.allowedEmployeeIds.includes(employeeId);
}

/** 404 for single records outside scope (05 section 1), 403 when used as a list filter. */
export function assertEmployeeInScope(scope: ScopeFilter, employeeId: string, asFilter = false): void {
  if (inScope(scope, employeeId)) return;
  if (asFilter) throw new ForbiddenException('Employee is outside your scope');
  throw new NotFoundException('Employee not found');
}

/** `YYYY-MM-DD` -> UTC midnight Date. */
export function dateUtc(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** ISO weekday 1 (Mon) .. 7 (Sun) for a UTC date. */
export function isoWeekday(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

export function monthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(y!, m! - 1, 1));
  const to = new Date(Date.UTC(y!, m!, 0));
  return { from, to };
}

export interface ScheduleWindow {
  workdays: number[];
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];

/**
 * Counts working days in [from, to] using the employee's schedule windows and company holidays
 * (15 F25). Days without a schedule window fall back to Monday to Friday.
 */
export function countWorkingDays(from: Date, to: Date, windows: ScheduleWindow[], holidays: Set<string>): number {
  let count = 0;
  for (let d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) {
    const key = isoDate(d);
    if (holidays.has(key)) continue;
    const window = windows.find((w) => w.effectiveFrom.getTime() <= d.getTime() && (!w.effectiveTo || w.effectiveTo.getTime() >= d.getTime()));
    const workdays = window ? window.workdays : DEFAULT_WORKDAYS;
    if (workdays.includes(isoWeekday(d))) count += 1;
  }
  return count;
}

/** Entitlement for a year: upfront credits everything, monthly credits allowance/12 per month started. */
export function entitlementForYear(allowance: number, accrual: string, year: number, now: Date, joinDate: Date | null): number {
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year, 11, 31));
  // Pro rata for employees who joined during the year.
  const effectiveStart = joinDate && joinDate.getTime() > startOfYear.getTime() ? joinDate : startOfYear;
  if (effectiveStart.getTime() > endOfYear.getTime()) return 0;
  const monthsInYear = 12 - effectiveStart.getUTCMonth();
  if (accrual === 'monthly') {
    const current = now.getUTCFullYear() === year ? now.getUTCMonth() + 1 : now.getUTCFullYear() > year ? 12 : 0;
    const accruedMonths = Math.max(0, Math.min(monthsInYear, current - effectiveStart.getUTCMonth()));
    return round2((allowance / 12) * accruedMonths);
  }
  return round2((allowance / 12) * monthsInYear);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function csvLine(values: Array<string | number | null | undefined>): string {
  return values
    .map((v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(',');
}
