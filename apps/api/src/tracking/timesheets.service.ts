import { Injectable, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TimesheetQueryDto, TeamTimesheetQueryDto, TeamActivityQueryDto } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { aggregateDay, dateRange, dayEnd, dayStart, isoDate, sumRows, toCsv, hms, activityPercent, trackingSettingsFrom, TimesheetRow } from './tracking-admin.util';

const HEARTBEAT_OFFLINE_MS = 120_000;

/** Timesheets and team activity (FR-TRK-16, FR-TRK-18). */
@Injectable()
export class TimesheetsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  private assertInScope(scope: ScopeFilter, employeeId: string) {
    if (scope.scope !== 'all' && !scope.allowedEmployeeIds.includes(employeeId)) {
      throw new ForbiddenException('Employee is outside your scope');
    }
  }

  /** Employees visible to the caller, optionally narrowed by department or team. */
  async employeesInScope(scope: ScopeFilter, f: { departmentId?: string; teamId?: string }) {
    const where: Prisma.EmployeeWhereInput = { companyId: scope.companyId, deletedAt: null, status: { not: 'disabled' } };
    if (scope.scope !== 'all') where.id = { in: scope.allowedEmployeeIds };
    if (f.departmentId) where.departmentId = f.departmentId;
    if (f.teamId) where.teamId = f.teamId;
    return this.prisma.employee.findMany({
      where,
      select: { id: true, code: true, firstName: true, lastName: true, departmentId: true, teamId: true, department: { select: { name: true } }, team: { select: { name: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async timesheet(scope: ScopeFilter, q: TimesheetQueryDto) {
    const employeeId = q.employeeId ?? scope.employeeId;
    this.assertInScope(scope, employeeId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId: scope.companyId },
      select: { id: true, code: true, firstName: true, lastName: true },
    });
    if (!employee) throw new ForbiddenException('Employee is outside your scope');
    const rows = await this.rowsFor([employeeId], q.from, q.to);
    const mine = rows.get(employeeId) ?? [];
    return { employee, from: q.from, to: q.to, rows: mine, totals: sumRows(mine) };
  }

  timesheetCsv(data: Awaited<ReturnType<TimesheetsService['timesheet']>>): string {
    const head = ['Date', 'Status', 'First start', 'Last end', 'Tracked', 'Active', 'Idle', 'Manual', 'Break', 'Offline', 'Activity %'];
    const body = data.rows.map((r) => [r.date, r.status ?? '', r.firstStart ?? '', r.lastEnd ?? '', hms(r.trackedS), hms(r.activeS), hms(r.idleS), hms(r.manualS), hms(r.breakS), hms(r.offlineS), r.activityPercent]);
    const t = data.totals;
    body.push(['Total', '', '', '', hms(t.trackedS), hms(t.activeS), hms(t.idleS), hms(t.manualS), hms(t.breakS), hms(t.offlineS), t.activityPercent]);
    return toCsv([head, ...body]);
  }

  async teamTimesheet(scope: ScopeFilter, q: TeamTimesheetQueryDto) {
    const employees = await this.employeesInScope(scope, q);
    const rows = await this.rowsFor(employees.map((e) => e.id), q.from, q.to);
    const items = employees.map((e) => {
      const r = rows.get(e.id) ?? [];
      return { employee: e, totals: sumRows(r), days: r.filter((x) => x.shiftCount > 0).length };
    });
    const totals = sumRows(items.flatMap((i) => rows.get(i.employee.id) ?? []));
    return { from: q.from, to: q.to, items, totals };
  }

  teamTimesheetCsv(data: Awaited<ReturnType<TimesheetsService['teamTimesheet']>>): string {
    const head = ['Employee', 'Code', 'Department', 'Team', 'Days', 'Tracked', 'Active', 'Idle', 'Manual', 'Break', 'Activity %'];
    const body = data.items.map((i) => [`${i.employee.firstName} ${i.employee.lastName}`, i.employee.code, i.employee.department?.name ?? '', i.employee.team?.name ?? '', i.days, hms(i.totals.trackedS), hms(i.totals.activeS), hms(i.totals.idleS), hms(i.totals.manualS), hms(i.totals.breakS), i.totals.activityPercent]);
    return toCsv([head, ...body]);
  }

  /** Per employee and day rows built from rollups, shifts and attendance days. */
  private async rowsFor(employeeIds: string[], from: string, to: string): Promise<Map<string, TimesheetRow[]>> {
    const days = dateRange(from, to);
    const out = new Map<string, TimesheetRow[]>();
    if (employeeIds.length === 0) return out;
    const start = dayStart(from);
    const end = dayStart(to);
    const [summaries, shifts, attendance] = await Promise.all([
      this.prisma.activityDailySummary.findMany({ where: { employeeId: { in: employeeIds }, date: { gte: start, lte: end } } }),
      this.prisma.shift.findMany({
        where: { employeeId: { in: employeeIds }, attendanceDate: { gte: start, lte: end } },
        select: { employeeId: true, attendanceDate: true, startedAt: true, endedAt: true, breakSeconds: true, offlineSeconds: true, state: true },
      }),
      this.prisma.attendanceDay.findMany({ where: { employeeId: { in: employeeIds }, date: { gte: start, lte: end } }, select: { employeeId: true, date: true, status: true, manualSeconds: true, flags: true } }),
    ]);
    const key = (e: string, d: Date) => `${e}:${isoDate(d)}`;
    const sMap = new Map(summaries.map((s) => [key(s.employeeId, s.date), s]));
    const aMap = new Map(attendance.map((a) => [key(a.employeeId, a.date), a]));
    const shMap = new Map<string, typeof shifts>();
    for (const sh of shifts) {
      const k = key(sh.employeeId, sh.attendanceDate);
      const arr = shMap.get(k) ?? [];
      arr.push(sh);
      shMap.set(k, arr);
    }
    for (const e of employeeIds) {
      out.set(
        e,
        days.map((d) => aggregateDay(d, { summary: sMap.get(`${e}:${d}`) ?? null, shifts: shMap.get(`${e}:${d}`) ?? [], attendance: aMap.get(`${e}:${d}`) ?? null })),
      );
    }
    return out;
  }

  /** FR-TRK-18: one row per employee for a day with status, activity percent and top app and domain. */
  async teamActivity(scope: ScopeFilter, q: TeamActivityQueryDto) {
    const employees = await this.employeesInScope(scope, q);
    const ids = employees.map((e) => e.id);
    const date = dayStart(q.date);
    const now = this.clock.now();
    const [company, summaries, shifts, apps, domains] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: scope.companyId }, select: { settings: true } }),
      this.prisma.activityDailySummary.findMany({ where: { employeeId: { in: ids }, date } }),
      this.prisma.shift.findMany({ where: { employeeId: { in: ids }, attendanceDate: date }, orderBy: { startedAt: 'asc' } }),
      this.prisma.activityDailyApp.findMany({ where: { employeeId: { in: ids }, date }, orderBy: { activeS: 'desc' } }),
      this.prisma.activityDailyDomain.findMany({ where: { employeeId: { in: ids }, date }, orderBy: { activeS: 'desc' } }),
    ]);
    const settings = trackingSettingsFrom(company?.settings);
    const items = employees.map((e) => {
      const s = summaries.find((x) => x.employeeId === e.id);
      const mine = shifts.filter((x) => x.employeeId === e.id);
      const open = mine.find((x) => !x.endedAt);
      let status: 'working' | 'on_break' | 'offline' | 'off_shift' | 'not_started' = 'not_started';
      if (open) {
        if (open.state === 'ON_BREAK') status = 'on_break';
        else if (now.getTime() - open.lastHeartbeatAt.getTime() > HEARTBEAT_OFFLINE_MS) status = 'offline';
        else status = 'working';
      } else if (mine.length) status = 'off_shift';
      const topApp = apps.find((a) => a.employeeId === e.id);
      const topDomain = domains.find((d) => d.employeeId === e.id);
      const active = s?.activeS ?? 0;
      const idle = s?.idleS ?? 0;
      const pct = activityPercent(active, idle);
      return {
        employee: e,
        status,
        firstStart: mine[0]?.startedAt ?? null,
        trackedS: s?.trackedS ?? 0,
        activeS: active,
        idleS: idle,
        productiveS: s?.productiveS ?? 0,
        unproductiveS: s?.unproductiveS ?? 0,
        activityPercent: pct,
        level: s ? (pct < settings.activityAlertPercent ? 'alert' : pct < settings.activityWarnPercent ? 'warn' : 'ok') : 'none',
        topApp: topApp ? { name: topApp.appName, activeS: topApp.activeS, category: topApp.category } : null,
        topDomain: topDomain ? { domain: topDomain.domain, activeS: topDomain.activeS, category: topDomain.category } : null,
      };
    });
    const tracked = items.filter((i) => i.trackedS > 0);
    const summary = {
      employees: items.length,
      working: items.filter((i) => i.status === 'working').length,
      onBreak: items.filter((i) => i.status === 'on_break').length,
      offline: items.filter((i) => i.status === 'offline').length,
      notStarted: items.filter((i) => i.status === 'not_started').length,
      trackedS: tracked.reduce((a, i) => a + i.trackedS, 0),
      activityPercent: activityPercent(tracked.reduce((a, i) => a + i.activeS, 0), tracked.reduce((a, i) => a + i.idleS, 0)),
      thresholds: { warn: settings.activityWarnPercent, alert: settings.activityAlertPercent },
    };
    return { date: q.date, summary, items };
  }

  /** Timeline for an employee and day with breaks and the day's shifts (FR-TRK-22). Scope checked. */
  async timelineDetail(scope: ScopeFilter, employeeId: string, date: string) {
    this.assertInScope(scope, employeeId);
    const start = dayStart(date);
    const end = dayEnd(date);
    const [segments, shifts] = await Promise.all([
      this.prisma.activitySegment.findMany({
        where: { employeeId, startedAt: { gte: start, lt: end } },
        orderBy: { startedAt: 'asc' },
        select: { id: true, startedAt: true, endedAt: true, durationS: true, kind: true, processName: true, appName: true, domain: true, exception: true, keyCount: true, mouseCount: true },
      }),
      this.prisma.shift.findMany({
        where: { employeeId, OR: [{ attendanceDate: start }, { startedAt: { gte: start, lt: end } }] },
        include: { breaks: true },
        orderBy: { startedAt: 'asc' },
      }),
    ]);
    const apps = new Map<string, { appName: string; processName: string; activeS: number; idleS: number }>();
    for (const s of segments) {
      const a = apps.get(s.processName) ?? { appName: s.appName, processName: s.processName, activeS: 0, idleS: 0 };
      if (s.kind === 'active') a.activeS += s.durationS;
      else if (s.kind === 'idle') a.idleS += s.durationS;
      apps.set(s.processName, a);
    }
    return {
      date,
      segments,
      shifts: shifts.map((s) => ({ id: s.id, startedAt: s.startedAt, endedAt: s.endedAt, state: s.state, breaks: s.breaks.map((b) => ({ id: b.id, type: b.type, startedAt: b.startedAt, endedAt: b.endedAt })) })),
      apps: Array.from(apps.values()).sort((a, b) => b.activeS - a.activeS),
    };
  }
}
