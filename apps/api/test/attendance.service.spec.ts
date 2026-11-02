import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AttendanceService } from '../src/attendance/attendance.service';
import { ClockService } from '../src/common/clock.service';
import { AttendanceStatus } from '@company-os/contracts';

/**
 * F8 status matrix. Company in Asia/Karachi (UTC+5), schedule 09:00-18:00 Mon-Fri, grace 10 min,
 * half day under 50 percent, break allowance 30 min from company settings (not the 60 min default).
 */
const SCHEDULE = { id: 'sch-1', name: 'Office', workdays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', graceMinutes: 10, halfDayPercent: 50 };
const MONDAY = new Date('2026-11-02T00:00:00.000Z');
const SUNDAY = new Date('2026-11-01T00:00:00.000Z');

function shift(startedAt: string, endedAt: string | null, extra: Partial<{ breakSeconds: number; offlineSeconds: number; flags: string[]; durationSeconds: number }> = {}) {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : null;
  const durationSeconds = extra.durationSeconds ?? (end ? Math.floor((end.getTime() - start.getTime()) / 1000) : 0);
  return { id: 's', startedAt: start, endedAt: end, durationSeconds, breakSeconds: extra.breakSeconds ?? 0, offlineSeconds: extra.offlineSeconds ?? 0, activeSeconds: Math.max(0, durationSeconds - 600), idleSeconds: 600, flags: extra.flags ?? [] };
}

describe('AttendanceService.computeDailyAttendance (F8)', () => {
  let svc: AttendanceService;
  let prisma: any;
  let settings: Record<string, unknown>;

  beforeEach(() => {
    settings = { breakAllowanceMinutes: 30 };
    prisma = {
      employee: { findUnique: vi.fn().mockImplementation(async () => ({ companyId: 'c1', company: { timezone: 'Asia/Karachi', settings } })) },
      employeeSchedule: { findFirst: vi.fn().mockResolvedValue({ id: 'as-1', schedule: SCHEDULE }) },
      shift: { findMany: vi.fn().mockResolvedValue([]) },
      holiday: { findFirst: vi.fn().mockResolvedValue(null) },
      leaveRequest: { findFirst: vi.fn().mockResolvedValue(null) },
      attendanceDay: { upsert: vi.fn(async (args: any) => args.create) },
    };
    svc = new AttendanceService(prisma, new ClockService());
  });

  it('holiday: company holiday and no shift', async () => {
    prisma.holiday.findFirst.mockResolvedValue({ id: 'h1' });
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.status).toBe(AttendanceStatus.HOLIDAY);
    expect(prisma.holiday.findFirst.mock.calls[0][0].where.companyId).toBe('c1');
  });

  it('weekly_off: not a workday and no shift', async () => {
    const r = await svc.computeDailyAttendance('e1', SUNDAY);
    expect(r.status).toBe(AttendanceStatus.WEEKLY_OFF);
    expect(r.scheduledStartAt).toBeNull();
  });

  it('on_leave: approved leave covers the date', async () => {
    prisma.leaveRequest.findFirst.mockResolvedValue({ id: 'l1' });
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.status).toBe(AttendanceStatus.ON_LEAVE);
  });

  it('absent: workday, no shift, no leave; stores the scheduled window', async () => {
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.status).toBe(AttendanceStatus.ABSENT);
    expect(r.scheduledStartAt?.toISOString()).toBe('2026-11-02T04:00:00.000Z');
    expect(r.scheduledEndAt?.toISOString()).toBe('2026-11-02T13:00:00.000Z');
    expect(r.scheduleId).toBe('sch-1');
  });

  it('present: on time, full day', async () => {
    prisma.shift.findMany.mockResolvedValue([shift('2026-11-02T04:00:00.000Z', '2026-11-02T13:00:00.000Z')]);
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.status).toBe(AttendanceStatus.PRESENT);
    expect(r.flags).toEqual([]);
    expect(r.lateSeconds).toBe(0);
    expect(r.earlySeconds).toBe(0);
    expect(r.workingSeconds).toBe(32400);
  });

  it('late: first start after scheduled start + grace, lateSeconds stored', async () => {
    prisma.shift.findMany.mockResolvedValue([shift('2026-11-02T04:20:00.000Z', '2026-11-02T13:00:00.000Z')]);
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.status).toBe(AttendanceStatus.LATE);
    expect(r.flags).toContain('late');
    expect(r.lateSeconds).toBe(1200);
  });

  it('within grace is present', async () => {
    prisma.shift.findMany.mockResolvedValue([shift('2026-11-02T04:08:00.000Z', '2026-11-02T13:00:00.000Z')]);
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.status).toBe(AttendanceStatus.PRESENT);
    expect(r.lateSeconds).toBe(480);
  });

  it('half_day: working time under 50 percent of scheduled hours, keeps late flag', async () => {
    prisma.shift.findMany.mockResolvedValue([shift('2026-11-02T04:30:00.000Z', '2026-11-02T08:00:00.000Z')]);
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.status).toBe(AttendanceStatus.HALF_DAY);
    expect(r.flags).toContain('late');
  });

  it('left_early: last end before scheduled end - grace, earlySeconds stored', async () => {
    prisma.shift.findMany.mockResolvedValue([shift('2026-11-02T04:00:00.000Z', '2026-11-02T12:00:00.000Z')]);
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.status).toBe(AttendanceStatus.PRESENT);
    expect(r.flags).toContain('left_early');
    expect(r.earlySeconds).toBe(3600);
  });

  it('auto_closed shift: flag set, never left_early', async () => {
    prisma.shift.findMany.mockResolvedValue([shift('2026-11-02T04:00:00.000Z', '2026-11-02T11:00:00.000Z', { flags: ['auto_closed', 'no_heartbeat'] })]);
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.flags).toContain('auto_closed');
    expect(r.flags).not.toContain('left_early');
  });

  it('early_start: first start more than 60 min before scheduled start counts by default', async () => {
    prisma.shift.findMany.mockResolvedValue([shift('2026-11-02T02:30:00.000Z', '2026-11-02T13:00:00.000Z')]);
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.flags).toContain('early_start');
    expect(r.flags).not.toContain('early_clipped');
    expect(r.workingSeconds).toBe(37800);
  });

  it('countEarlyStart off clips the early portion and flags early_clipped', async () => {
    settings.countEarlyStart = false;
    prisma.shift.findMany.mockResolvedValue([shift('2026-11-02T02:30:00.000Z', '2026-11-02T13:00:00.000Z')]);
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.flags).toContain('early_clipped');
    expect(r.workingSeconds).toBe(32400);
  });

  it('break_exceeded uses the company allowance (30 min), not a hardcoded hour', async () => {
    prisma.shift.findMany.mockResolvedValue([shift('2026-11-02T04:00:00.000Z', '2026-11-02T13:00:00.000Z', { breakSeconds: 2400 })]);
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.flags).toContain('break_exceeded');
    settings.breakAllowanceMinutes = 60;
    const r2 = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r2.flags).not.toContain('break_exceeded');
  });

  it('offline_time and short_shift flags', async () => {
    settings.minShiftMinutes = 5;
    prisma.shift.findMany.mockResolvedValue([shift('2026-11-02T04:00:00.000Z', '2026-11-02T13:00:00.000Z', { offlineSeconds: 900 }), shift('2026-11-02T13:30:00.000Z', '2026-11-02T13:32:00.000Z')]);
    const r = await svc.computeDailyAttendance('e1', MONDAY);
    expect(r.flags).toEqual(expect.arrayContaining(['offline_time', 'short_shift']));
    expect(r.checkOutAt?.toISOString()).toBe('2026-11-02T13:32:00.000Z');
  });

  it('unscheduled: no assignment falls back to Mon-Fri and flags the day', async () => {
    prisma.employeeSchedule.findFirst.mockResolvedValue(null);
    const absent = await svc.computeDailyAttendance('e1', MONDAY);
    expect(absent.status).toBe(AttendanceStatus.ABSENT);
    expect(absent.flags).toContain('unscheduled');
    expect(absent.scheduleId).toBeNull();
    const off = await svc.computeDailyAttendance('e1', SUNDAY);
    expect(off.status).toBe(AttendanceStatus.WEEKLY_OFF);
    prisma.shift.findMany.mockResolvedValue([shift('2026-11-02T04:00:00.000Z', '2026-11-02T13:00:00.000Z')]);
    const present = await svc.computeDailyAttendance('e1', MONDAY);
    expect(present.status).toBe(AttendanceStatus.PRESENT);
    expect(present.flags).toContain('unscheduled');
    expect(present.lateSeconds).toBeNull();
  });

  it('corrected flag is added on recompute after an approved correction', async () => {
    const r = await svc.computeDailyAttendance('e1', MONDAY, true);
    expect(r.flags).toContain('corrected');
  });
});
