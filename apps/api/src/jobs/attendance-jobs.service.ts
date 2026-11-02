import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ShiftState } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { AttendanceService } from '../attendance/attendance.service';
import { categorise, trackingSettingsFrom } from '../tracking/tracking-admin.util';
import { JobRegistry, JobResult } from './job-registry';
import { addDays, rollupSegments, utcDayStart } from './jobs.util';

/** attendance-close (F8) and activity-rollup nightly reconcile (FR-TRK-07). */
@Injectable()
export class AttendanceJobsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private attendance: AttendanceService,
    private registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('attendance-close', '0 * * * *', 'Computes attendance days for shifts ended 2h+ ago and marks yesterday for everyone', () => this.attendanceClose());
    this.registry.register('activity-rollup', '30 2 * * *', 'Recomputes yesterday daily app, domain and summary rollups from raw segments', () => this.activityRollup());
  }

  @Cron('0 * * * *', { timeZone: 'UTC' })
  scheduledClose() {
    return this.registry.scheduled('attendance-close');
  }

  @Cron('30 2 * * *', { timeZone: 'UTC' })
  scheduledRollup() {
    return this.registry.scheduled('activity-rollup');
  }

  /**
   * Two passes: (1) ended shifts whose end is at least 2 h old and whose attendance day is older than
   * the shift end, (2) every active employee for yesterday, so absences are recorded without a shift.
   */
  async attendanceClose(): Promise<JobResult> {
    const now = this.clock.now();
    const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000);
    const shifts = await this.prisma.shift.findMany({
      where: { state: ShiftState.ENDED, endedAt: { lte: twoHoursAgo, gte: addDays(now, -3) } },
      select: { employeeId: true, attendanceDate: true, endedAt: true },
    });
    const pending = new Map<string, { employeeId: string; date: Date }>();
    for (const s of shifts) {
      const key = `${s.employeeId}:${s.attendanceDate.toISOString()}`;
      const day = await this.prisma.attendanceDay.findUnique({
        where: { employeeId_date: { employeeId: s.employeeId, date: s.attendanceDate } },
        select: { computedAt: true },
      });
      if (!day || (s.endedAt && day.computedAt < s.endedAt)) pending.set(key, { employeeId: s.employeeId, date: s.attendanceDate });
    }
    const yesterday = utcDayStart(addDays(now, -1));
    const employees = await this.prisma.employee.findMany({ where: { status: 'active', deletedAt: null }, select: { id: true } });
    for (const e of employees) {
      const exists = await this.prisma.attendanceDay.findUnique({ where: { employeeId_date: { employeeId: e.id, date: yesterday } }, select: { id: true } });
      if (!exists) pending.set(`${e.id}:${yesterday.toISOString()}`, { employeeId: e.id, date: yesterday });
    }
    let computed = 0;
    let failed = 0;
    for (const p of pending.values()) {
      try {
        await this.attendance.computeDailyAttendance(p.employeeId, p.date, false);
        computed += 1;
      } catch {
        failed += 1;
      }
    }
    return { candidates: pending.size, computed, failed };
  }

  async activityRollup(date?: Date): Promise<JobResult> {
    const day = utcDayStart(date ?? addDays(this.clock.now(), -1));
    const next = addDays(day, 1);
    const employees = await this.prisma.activitySegment.groupBy({
      by: ['employeeId'],
      where: { startedAt: { gte: day, lt: next } },
    });
    let rebuilt = 0;
    let failed = 0;
    for (const { employeeId } of employees) {
      try {
        await this.rollupEmployeeDay(employeeId, day, next);
        rebuilt += 1;
      } catch {
        failed += 1;
      }
    }
    return { date: day.toISOString().slice(0, 10), employees: employees.length, rebuilt, failed };
  }

  private async rollupEmployeeDay(employeeId: string, day: Date, next: Date) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { companyId: true, departmentId: true, company: { select: { settings: true } } } });
    if (!employee) return;
    const [segments, rules] = await Promise.all([
      this.prisma.activitySegment.findMany({ where: { employeeId, startedAt: { gte: day, lt: next } } }),
      this.prisma.productivityRule.findMany({ where: { companyId: employee.companyId } }),
    ]);
    const settings = trackingSettingsFrom(employee.company.settings);
    const categoryOf = (processName: string, domain: string | null) =>
      domain && domain !== 'unknown' && domain !== 'excluded'
        ? categorise('domain', domain, rules, employee.departmentId)
        : categorise('app', processName, rules, employee.departmentId);
    const r = rollupSegments(segments, categoryOf, settings.longIdleThresholdSeconds);

    await this.prisma.$transaction(async (tx) => {
      await tx.activityDailyApp.deleteMany({ where: { employeeId, date: day } });
      await tx.activityDailyDomain.deleteMany({ where: { employeeId, date: day } });
      if (r.apps.size) {
        await tx.activityDailyApp.createMany({
          data: Array.from(r.apps.entries()).map(([processName, a]) => ({ employeeId, date: day, processName, appName: a.appName, category: a.category, activeS: a.activeS, idleS: a.idleS })),
        });
      }
      if (r.domains.size) {
        await tx.activityDailyDomain.createMany({
          data: Array.from(r.domains.entries()).map(([domain, d]) => ({ employeeId, date: day, domain, category: d.category, activeS: d.activeS })),
        });
      }
      await tx.activityDailySummary.upsert({
        where: { employeeId_date: { employeeId, date: day } },
        create: { employeeId, date: day, ...r.summary },
        update: { ...r.summary },
      });
    });
  }
}
