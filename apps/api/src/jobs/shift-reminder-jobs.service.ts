import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType, ShiftState, shiftPolicyFrom } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SETTINGS_DEFAULTS } from '../settings/settings.service';
import { isWorkday, localDateOf, localDateToDbDate, scheduledWindow } from '../attendance/schedule.util';
import { JobRegistry, JobResult } from './job-registry';
import { autoCloseRulesFrom } from './jobs.util';

const EVERY_5_MIN = '*/5 * * * *';
const MANAGER_DELAY_MS = 60 * 60_000;

/**
 * Schedule-aware reminders (03 F5 rules 13 to 15). Every job is idempotent through a `key` in the
 * notification data, so a 5 minute cadence sends each reminder once.
 */
@Injectable()
export class ShiftReminderJobsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
    private registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('shift-start-reminder', EVERY_5_MIN, 'Reminds employees (and after 60 min their manager) of a scheduled shift that has not started', () => this.startReminder());
    this.registry.register('shift-end-reminder', EVERY_5_MIN, 'Reminds employees of an open shift past its scheduled end', () => this.endReminder());
    this.registry.register('break-overrun', EVERY_5_MIN, 'Warns employees once per break when break time passes the company allowance', () => this.breakOverrun());
  }

  @Cron(EVERY_5_MIN, { timeZone: 'UTC' })
  scheduledStart() {
    return this.registry.scheduled('shift-start-reminder');
  }

  @Cron(EVERY_5_MIN, { timeZone: 'UTC' })
  scheduledEnd() {
    return this.registry.scheduled('shift-end-reminder');
  }

  @Cron(EVERY_5_MIN, { timeZone: 'UTC' })
  scheduledBreak() {
    return this.registry.scheduled('break-overrun');
  }

  async startReminder(): Promise<JobResult> {
    const now = this.clock.now();
    let candidates = 0;
    let employeesNotified = 0;
    let managersNotified = 0;
    const companies = await this.prisma.company.findMany({ select: { id: true, timezone: true, settings: true } });
    for (const company of companies) {
      const policy = shiftPolicyFrom(company.settings);
      if (!policy.startReminderEnabled) continue;
      const timezone = company.timezone || 'UTC';
      const today = localDateOf(now, timezone);
      const todayDb = localDateToDbDate(today);
      const holiday = await this.prisma.holiday.findFirst({ where: { companyId: company.id, date: todayDb }, select: { id: true } });
      if (holiday) continue;
      const assignments = await this.prisma.employeeSchedule.findMany({
        where: {
          effectiveFrom: { lte: todayDb },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: todayDb } }],
          employee: { companyId: company.id, status: 'active', deletedAt: null },
        },
        include: { schedule: true, employee: { select: { id: true, firstName: true, lastName: true, managerId: true } } },
      });
      for (const a of assignments) {
        if (!isWorkday(today, a.schedule)) continue;
        const window = scheduledWindow(a.schedule, timezone, today);
        const graceEnd = window.start.getTime() + a.schedule.graceMinutes * 60_000;
        if (now.getTime() < graceEnd) continue;
        candidates += 1;
        const [shift, leave] = await Promise.all([
          this.prisma.shift.findFirst({ where: { employeeId: a.employee.id, attendanceDate: todayDb }, select: { id: true } }),
          this.prisma.leaveRequest.findFirst({ where: { employeeId: a.employee.id, status: 'approved', dateFrom: { lte: todayDb }, dateTo: { gte: todayDb } }, select: { id: true } }),
        ]);
        if (shift || leave) continue;
        const key = `shift_start_reminder:${a.employee.id}:${today}`;
        if (
          await this.notifyOnce(a.employee.id, key, 'Shift not started', `You have not started your shift. Scheduled ${a.schedule.startTime}. Open WorkPulse and press Start shift.`, {
            employeeId: a.employee.id,
            date: today,
            scheduledStartAt: window.start.toISOString(),
          })
        )
          employeesNotified += 1;
        if (a.employee.managerId && now.getTime() >= window.start.getTime() + MANAGER_DELAY_MS) {
          const managerKey = `shift_start_reminder_manager:${a.employee.id}:${today}`;
          if (
            await this.notifyOnce(a.employee.managerId, managerKey, 'Shift not started', `${a.employee.firstName} ${a.employee.lastName} has not started the ${a.schedule.startTime} shift.`, {
              employeeId: a.employee.id,
              date: today,
              scheduledStartAt: window.start.toISOString(),
            })
          )
            managersNotified += 1;
        }
      }
    }
    return { candidates, employeesNotified, managersNotified };
  }

  async endReminder(): Promise<JobResult> {
    const now = this.clock.now();
    let sent = 0;
    const open = await this.prisma.shift.findMany({
      where: { state: { in: [ShiftState.WORKING, ShiftState.ON_BREAK] } },
      include: { employee: { select: { id: true, company: { select: { timezone: true, settings: true } } } } },
    });
    for (const shift of open) {
      const policy = shiftPolicyFrom(shift.employee.company.settings);
      const timezone = shift.employee.company.timezone || 'UTC';
      const assignment = await this.prisma.employeeSchedule.findFirst({
        where: { employeeId: shift.employeeId, effectiveFrom: { lte: shift.attendanceDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: shift.attendanceDate } }] },
        include: { schedule: true },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (!assignment) continue;
      const date = shift.attendanceDate.toISOString().slice(0, 10);
      if (!isWorkday(date, assignment.schedule)) continue;
      const window = scheduledWindow(assignment.schedule, timezone, date);
      if (now.getTime() < window.end.getTime() + policy.endReminderMinutes * 60_000) continue;
      const hours = Math.round((autoCloseRulesFrom(shift.employee.company.settings).noHeartbeatMinutes / 60) * 10) / 10;
      const key = `shift_end_reminder:${shift.id}`;
      if (
        await this.notifyOnce(shift.employeeId, key, 'Shift past scheduled end', `Your shift was scheduled to end at ${assignment.schedule.endTime}. End it if you are done; it closes automatically after ${hours} hours without activity.`, {
          shiftId: shift.id,
          scheduledEndAt: window.end.toISOString(),
        })
      )
        sent += 1;
    }
    return { open: open.length, sent };
  }

  async breakOverrun(): Promise<JobResult> {
    const now = this.clock.now();
    let sent = 0;
    const breaks = await this.prisma.shiftBreak.findMany({
      where: { endedAt: null, shift: { state: ShiftState.ON_BREAK } },
      include: { shift: { include: { breaks: true, employee: { select: { id: true, company: { select: { settings: true } } } } } } },
    });
    for (const b of breaks) {
      const settings = (b.shift.employee.company.settings ?? {}) as Record<string, unknown>;
      if (!shiftPolicyFrom(settings).breakReminderAtAllowance) continue;
      const allowanceMinutes = typeof settings.breakAllowanceMinutes === 'number' ? settings.breakAllowanceMinutes : SETTINGS_DEFAULTS.breakAllowanceMinutes;
      let total = 0;
      for (const br of b.shift.breaks) {
        const end = br.endedAt ?? now;
        total += Math.max(0, Math.floor((end.getTime() - br.startedAt.getTime()) / 1000));
      }
      if (total <= allowanceMinutes * 60) continue;
      const key = `break_overrun:${b.id}`;
      if (
        await this.notifyOnce(b.shift.employeeId, key, 'Break allowance reached', `Your break time today is over the ${allowanceMinutes} minute allowance. Resume when you are back.`, {
          shiftId: b.shiftId,
          breakId: b.id,
          allowanceMinutes,
        })
      )
        sent += 1;
    }
    return { openBreaks: breaks.length, sent };
  }

  /** Sends once per data key. Returns true when a notification was created. */
  private async notifyOnce(recipientId: string, key: string, title: string, body: string, data: Record<string, unknown>): Promise<boolean> {
    const existing = await this.prisma.notification.findFirst({
      where: { recipientId, type: NotificationType.SHIFT_REMINDER, data: { path: ['key'], equals: key } },
      select: { id: true },
    });
    if (existing) return false;
    await this.notifications.sendNotification(recipientId, NotificationType.SHIFT_REMINDER, title, body, { key, ...data });
    return true;
  }
}
