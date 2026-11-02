import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { isoDate } from './hr.util';

export type CelebrationKind = 'birthday' | 'anniversary';

export interface Celebration {
  employeeId: string;
  firstName: string;
  lastName: string;
  code: string;
  department: string | null;
  kind: CelebrationKind;
  /** ISO date of the next occurrence. */
  date: string;
  /** Days from today (0 = today). */
  inDays: number;
  /** Anniversaries only: completed years on that date. */
  years?: number;
}

/**
 * FR-HR-16: birthdays come from the profile's date of birth, work anniversaries from the join date.
 * Pure date math lives in `nextOccurrence` so it can be unit tested (29 February falls on 28 February
 * in non-leap years; occurrences earlier this year roll to next year).
 */
export function nextOccurrence(anniversary: Date, today: Date): { date: Date; inDays: number; years: number } {
  const y = today.getUTCFullYear();
  const m = anniversary.getUTCMonth();
  const d = anniversary.getUTCDate();
  const build = (year: number) => {
    const day = m === 1 && d === 29 && !isLeap(year) ? 28 : d;
    return new Date(Date.UTC(year, m, day));
  };
  let date = build(y);
  const todayUtc = new Date(Date.UTC(y, today.getUTCMonth(), today.getUTCDate()));
  if (date < todayUtc) date = build(y + 1);
  const inDays = Math.round((date.getTime() - todayUtc.getTime()) / 86_400_000);
  return { date, inDays, years: date.getUTCFullYear() - anniversary.getUTCFullYear() };
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

@Injectable()
export class CelebrationsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  /** Upcoming celebrations within `days` for employees in scope, sorted by date then name. */
  async upcoming(scope: ScopeFilter, days: number): Promise<Celebration[]> {
    const today = this.clock.now();
    const employees = await this.prisma.employee.findMany({
      where: { companyId: scope.companyId, status: 'active', deletedAt: null, ...(scope.scope === 'all' ? {} : { id: { in: scope.allowedEmployeeIds } }) },
      select: {
        id: true, firstName: true, lastName: true, code: true, joinDate: true,
        department: { select: { name: true } },
        profile: { select: { dateOfBirth: true } },
      },
    });
    return this.collect(employees, today, days);
  }

  /** Company-wide list for the daily job (no scope; the job decides who is told). */
  async forCompany(companyId: string, days: number): Promise<Celebration[]> {
    const today = this.clock.now();
    const employees = await this.prisma.employee.findMany({
      where: { companyId, status: 'active', deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, code: true, joinDate: true,
        department: { select: { name: true } },
        profile: { select: { dateOfBirth: true } },
      },
    });
    return this.collect(employees, today, days);
  }

  collect(
    employees: Array<{ id: string; firstName: string; lastName: string; code: string; joinDate: Date | null; department: { name: string } | null; profile: { dateOfBirth: Date | null } | null }>,
    today: Date,
    days: number,
  ): Celebration[] {
    const out: Celebration[] = [];
    for (const e of employees) {
      const base = { employeeId: e.id, firstName: e.firstName, lastName: e.lastName, code: e.code, department: e.department?.name ?? null };
      const dob = e.profile?.dateOfBirth;
      if (dob) {
        const n = nextOccurrence(dob, today);
        if (n.inDays <= days) out.push({ ...base, kind: 'birthday', date: isoDate(n.date), inDays: n.inDays });
      }
      if (e.joinDate) {
        const n = nextOccurrence(e.joinDate, today);
        // The join date itself is not an anniversary; the first one is a year later.
        if (n.inDays <= days && n.years >= 1) out.push({ ...base, kind: 'anniversary', date: isoDate(n.date), inDays: n.inDays, years: n.years });
      }
    }
    return out.sort((a, b) => a.inDays - b.inDays || a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }
}
