import { MeScheduleDto, MeShiftPolicyDto, shiftPolicyFrom } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { trackingSettingsFrom } from '../tracking/tracking-admin.util';
import { SETTINGS_DEFAULTS } from '../settings/settings.service';
import { isWorkday, localDateOf, localDateToDbDate, nextWorkday, scheduledWindow } from './schedule.util';

/**
 * /me payload pieces for the desktop app (contract agreed with the desktop builder): the effective
 * schedule resolved for today in the company timezone and the shift policy with the tracking
 * thresholds it needs next to it.
 */
export async function loadMeSchedule(prisma: PrismaService, employeeId: string, companyId: string, timezone: string, now: Date): Promise<MeScheduleDto | null> {
  const today = localDateOf(now, timezone);
  const todayDb = localDateToDbDate(today);
  const assignment = await prisma.employeeSchedule.findFirst({
    where: { employeeId, effectiveFrom: { lte: todayDb }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: todayDb } }] },
    include: { schedule: true },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!assignment) return null;
  const schedule = assignment.schedule;
  const horizon = localDateToDbDate(today);
  horizon.setUTCDate(horizon.getUTCDate() + 14);
  const [holidays, leave] = await Promise.all([
    prisma.holiday.findMany({ where: { companyId, date: { gte: todayDb, lte: horizon } }, select: { date: true } }),
    prisma.leaveRequest.findFirst({ where: { employeeId, status: 'approved', dateFrom: { lte: todayDb }, dateTo: { gte: todayDb } }, select: { id: true } }),
  ]);
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
  const workday = isWorkday(today, schedule);
  const todayWindow = workday ? scheduledWindow(schedule, timezone, today) : null;
  const nextDate = nextWorkday(today, schedule, holidaySet, 14);
  const nextWindow = nextDate ? scheduledWindow(schedule, timezone, nextDate) : null;
  return {
    scheduleId: schedule.id,
    name: schedule.name,
    timezone,
    workdays: schedule.workdays,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    graceMinutes: schedule.graceMinutes,
    today: {
      date: today,
      isWorkday: workday,
      isHoliday: holidaySet.has(today),
      onLeave: Boolean(leave),
      scheduledStartAt: todayWindow ? todayWindow.start.toISOString() : null,
      scheduledEndAt: todayWindow ? todayWindow.end.toISOString() : null,
    },
    next: nextDate && nextWindow ? { date: nextDate, scheduledStartAt: nextWindow.start.toISOString(), scheduledEndAt: nextWindow.end.toISOString() } : null,
  };
}

export function buildMeShiftPolicy(settings: unknown): MeShiftPolicyDto {
  const src = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  const tracking = trackingSettingsFrom(settings);
  return {
    ...shiftPolicyFrom(settings),
    breakAllowanceMinutes: typeof src.breakAllowanceMinutes === 'number' ? src.breakAllowanceMinutes : SETTINGS_DEFAULTS.breakAllowanceMinutes,
    idleThresholdSeconds: tracking.idleThresholdSeconds,
    longIdleThresholdSeconds: tracking.longIdleThresholdSeconds,
  };
}
