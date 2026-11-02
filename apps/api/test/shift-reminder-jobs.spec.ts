import { describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ClockService } from '../src/common/clock.service';
import { JobRegistry } from '../src/jobs/job-registry';
import { ShiftReminderJobsService } from '../src/jobs/shift-reminder-jobs.service';

/** Company in Asia/Karachi, schedule 09:00-18:00 Mon-Fri (04:00Z-13:00Z), Monday 2026-11-02. */
const SCHEDULE = { id: 'sch', workdays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', graceMinutes: 10, halfDayPercent: 50 };
const EMPLOYEE = { id: 'e1', firstName: 'Sam', lastName: 'Parker', managerId: 'm1' };

function table() {
  return { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn(), create: vi.fn() };
}

function setup(now: string, settings: Record<string, unknown> = {}) {
  const clock = new ClockService();
  clock.setMockTime(new Date(now));
  const registry = new JobRegistry({ get: () => undefined } as unknown as ConfigService, clock);
  const prisma: any = { company: table(), holiday: table(), employeeSchedule: table(), shift: table(), leaveRequest: table(), notification: table(), shiftBreak: table() };
  prisma.company.findMany.mockResolvedValue([{ id: 'c1', timezone: 'Asia/Karachi', settings }]);
  // Idempotence: the mock "stores" sent notifications by key.
  const sentKeys = new Set<string>();
  prisma.notification.findFirst.mockImplementation(async ({ where }: any) => (sentKeys.has(`${where.recipientId}:${where.data.equals}`) ? { id: 'n' } : null));
  const notifications: any = { sendNotification: vi.fn(async (recipientId: string, _t: string, _ti: string, _b: string, data: any) => { sentKeys.add(`${recipientId}:${data.key}`); }) };
  const svc = new ShiftReminderJobsService(prisma, clock, notifications, registry);
  return { svc, prisma, notifications, clock };
}

describe('shift-start-reminder', () => {
  it('reminds the employee after start + grace and the manager after 60 min, once each', async () => {
    const { svc, prisma, notifications, clock } = setup('2026-11-02T04:30:00.000Z'); // 09:30 local
    prisma.employeeSchedule.findMany.mockResolvedValue([{ schedule: SCHEDULE, employee: EMPLOYEE }]);
    let r = await svc.startReminder();
    expect(r).toEqual({ candidates: 1, employeesNotified: 1, managersNotified: 0 });
    expect(notifications.sendNotification.mock.calls[0][0]).toBe('e1');
    expect(notifications.sendNotification.mock.calls[0][3]).toBe('You have not started your shift. Scheduled 09:00. Open WorkPulse and press Start shift.');
    expect(notifications.sendNotification.mock.calls[0][4].key).toBe('shift_start_reminder:e1:2026-11-02');
    r = await svc.startReminder();
    expect(r.employeesNotified).toBe(0);
    clock.setMockTime(new Date('2026-11-02T05:05:00.000Z')); // 10:05 local
    r = await svc.startReminder();
    expect(r).toEqual({ candidates: 1, employeesNotified: 0, managersNotified: 1 });
    expect(notifications.sendNotification.mock.calls[1][0]).toBe('m1');
    expect(notifications.sendNotification.mock.calls[1][3]).toBe('Sam Parker has not started the 09:00 shift.');
    r = await svc.startReminder();
    expect(r.managersNotified).toBe(0);
  });

  it('skips before grace, when a shift exists, on leave, on holidays, on weekly off and when disabled', async () => {
    const { svc, prisma, notifications, clock } = setup('2026-11-02T04:05:00.000Z');
    prisma.employeeSchedule.findMany.mockResolvedValue([{ schedule: SCHEDULE, employee: EMPLOYEE }]);
    expect((await svc.startReminder()).candidates).toBe(0);
    clock.setMockTime(new Date('2026-11-02T04:30:00.000Z'));
    prisma.shift.findFirst.mockResolvedValueOnce({ id: 's1' });
    expect((await svc.startReminder()).employeesNotified).toBe(0);
    prisma.leaveRequest.findFirst.mockResolvedValueOnce({ id: 'l1' });
    expect((await svc.startReminder()).employeesNotified).toBe(0);
    prisma.holiday.findFirst.mockResolvedValueOnce({ id: 'h1' });
    expect((await svc.startReminder()).candidates).toBe(0);
    clock.setMockTime(new Date('2026-11-07T04:30:00.000Z')); // Saturday
    expect((await svc.startReminder()).candidates).toBe(0);
    expect(notifications.sendNotification).not.toHaveBeenCalled();
    const off = setup('2026-11-02T04:30:00.000Z', { startReminderEnabled: false });
    off.prisma.employeeSchedule.findMany.mockResolvedValue([{ schedule: SCHEDULE, employee: EMPLOYEE }]);
    expect((await off.svc.startReminder()).candidates).toBe(0);
  });
});

describe('shift-end-reminder', () => {
  it('reminds once when an open shift passed scheduled end + endReminderMinutes', async () => {
    const { svc, prisma, notifications, clock } = setup('2026-11-02T13:10:00.000Z'); // 18:10 local, reminder at 18:15
    prisma.shift.findMany.mockResolvedValue([{ id: 's1', employeeId: 'e1', attendanceDate: new Date('2026-11-02T00:00:00.000Z'), employee: { id: 'e1', company: { timezone: 'Asia/Karachi', settings: {} } } }]);
    prisma.employeeSchedule.findFirst.mockResolvedValue({ schedule: SCHEDULE });
    expect((await svc.endReminder()).sent).toBe(0);
    clock.setMockTime(new Date('2026-11-02T13:20:00.000Z'));
    expect((await svc.endReminder()).sent).toBe(1);
    expect(notifications.sendNotification.mock.calls[0][3]).toBe('Your shift was scheduled to end at 18:00. End it if you are done; it closes automatically after 2 hours without activity.');
    expect(notifications.sendNotification.mock.calls[0][4].key).toBe('shift_end_reminder:s1');
    expect((await svc.endReminder()).sent).toBe(0);
  });
});

describe('break-overrun', () => {
  it('notifies once per open break when break time passes the company allowance', async () => {
    const { svc, prisma, notifications } = setup('2026-11-02T08:00:00.000Z', { breakAllowanceMinutes: 30 });
    const openBreak = { id: 'b2', shiftId: 's1', startedAt: new Date('2026-11-02T07:40:00.000Z'), endedAt: null };
    prisma.shiftBreak.findMany.mockResolvedValue([{ ...openBreak, shift: { id: 's1', employeeId: 'e1', breaks: [{ id: 'b1', startedAt: new Date('2026-11-02T06:00:00.000Z'), endedAt: new Date('2026-11-02T06:15:00.000Z') }, openBreak], employee: { id: 'e1', company: { settings: { breakAllowanceMinutes: 30 } } } } }]);
    expect((await svc.breakOverrun()).sent).toBe(1); // 15 + 20 = 35 min > 30
    expect(notifications.sendNotification.mock.calls[0][4].key).toBe('break_overrun:b2');
    expect((await svc.breakOverrun()).sent).toBe(0);
    const off = setup('2026-11-02T08:00:00.000Z');
    off.prisma.shiftBreak.findMany.mockResolvedValue([{ ...openBreak, shift: { id: 's1', employeeId: 'e1', breaks: [openBreak], employee: { id: 'e1', company: { settings: { breakReminderAtAllowance: false, breakAllowanceMinutes: 10 } } } } }]);
    expect((await off.svc.breakOverrun()).sent).toBe(0);
  });
});
