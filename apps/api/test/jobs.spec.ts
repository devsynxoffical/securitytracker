import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ClockService } from '../src/common/clock.service';
import { JobRegistry } from '../src/jobs/job-registry';
import { ShiftJobsService } from '../src/jobs/shift-jobs.service';
import { ReminderJobsService } from '../src/jobs/reminder-jobs.service';
import { MaintenanceJobsService } from '../src/jobs/maintenance-jobs.service';
import { MailJobsService } from '../src/jobs/mail-jobs.service';
import { HrJobsService, aggregateLeave } from '../src/jobs/hr-jobs.service';
import { shouldAutoClose, autoCloseEndTime, autoCloseRulesFrom, retentionCutoff, rollupSegments, periodEndedYesterday } from '../src/jobs/jobs.util';

const NOW = new Date('2026-11-02T12:00:00.000Z');
const UUID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

function table() {
  return { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }), deleteMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]), create: vi.fn(), createMany: vi.fn(), upsert: vi.fn() };
}
function prismaMock() {
  const p: any = { shift: table(), shiftBreak: table(), activitySegment: table(), lead: table(), crmActivity: table(), task: table(), notification: table(), company: table(), employee: table(), loginEvent: table(), target: table(), leaveRequest: table(), leaveBalance: table(), hrDocument: table(), mailbox: table() };
  p.$transaction = vi.fn((cb: any) => (typeof cb === 'function' ? cb(p) : Promise.all(cb)));
  return p;
}
function deps(env: Record<string, string> = {}) {
  const clock = new ClockService();
  clock.setMockTime(NOW);
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const registry = new JobRegistry(config, clock);
  const notifications: any = { sendNotification: vi.fn().mockResolvedValue({}) };
  return { clock, config, registry, notifications };
}

describe('jobs.util', () => {
  it('auto-close thresholds: no heartbeat for 120 min, or shift over 16 h', () => {
    const rules = autoCloseRulesFrom({});
    const base = { startedAt: new Date('2026-11-02T08:00:00Z'), lastHeartbeatAt: new Date('2026-11-02T11:30:00Z') };
    expect(shouldAutoClose(base, NOW, rules)).toBeNull();
    expect(shouldAutoClose({ ...base, lastHeartbeatAt: new Date('2026-11-02T10:00:00Z') }, NOW, rules)).toBe('no_heartbeat');
    expect(shouldAutoClose({ startedAt: new Date('2026-11-01T19:00:00Z'), lastHeartbeatAt: NOW }, NOW, rules)).toBe('max_length');
    expect(autoCloseRulesFrom({ autoCloseNoHeartbeatMinutes: 30, maxShiftHours: 10 })).toEqual({ noHeartbeatMinutes: 30, maxShiftHours: 10 });
  });

  it('auto-close end time is the later of last heartbeat and last segment, never before start', () => {
    const shift = { startedAt: new Date('2026-11-02T08:00:00Z'), lastHeartbeatAt: new Date('2026-11-02T09:00:00Z') };
    expect(autoCloseEndTime(shift, new Date('2026-11-02T09:30:00Z')).toISOString()).toBe('2026-11-02T09:30:00.000Z');
    expect(autoCloseEndTime(shift, null).toISOString()).toBe('2026-11-02T09:00:00.000Z');
    expect(autoCloseEndTime({ ...shift, lastHeartbeatAt: new Date('2026-11-02T07:00:00Z') }, null).toISOString()).toBe('2026-11-02T08:00:00.000Z');
  });

  it('retention cutoffs and period rollover', () => {
    expect(retentionCutoff(NOW, 90).toISOString()).toBe('2026-08-04T12:00:00.000Z');
    expect(periodEndedYesterday('daily', NOW)).toBe(true);
    expect(periodEndedYesterday('weekly', new Date('2026-11-02T00:05:00Z'))).toBe(true); // Monday
    expect(periodEndedYesterday('weekly', new Date('2026-11-03T00:05:00Z'))).toBe(false);
    expect(periodEndedYesterday('monthly', new Date('2026-11-01T00:05:00Z'))).toBe(true);
    expect(periodEndedYesterday('monthly', NOW)).toBe(false);
  });

  it('rollup aggregates active, idle, locked, categories, domains and long idle count', () => {
    const r = rollupSegments(
      [
        { kind: 'active', durationS: 600, processName: 'chrome.exe', appName: 'Chrome', domain: 'crm.example.com', keyCount: 50, mouseCount: 20 },
        { kind: 'active', durationS: 300, processName: 'game.exe', appName: 'Game', domain: null, keyCount: 10, mouseCount: 5 },
        { kind: 'idle', durationS: 2000, processName: 'chrome.exe', appName: 'Chrome', domain: null, keyCount: 0, mouseCount: 0 },
        { kind: 'locked', durationS: 100, processName: 'LockApp', appName: 'Lock', domain: null, keyCount: 0, mouseCount: 0 },
      ],
      (p, d) => (d ? 'productive' : p === 'game.exe' ? 'unproductive' : 'neutral'),
      1800,
    );
    expect(r.summary).toMatchObject({ trackedS: 2900, activeS: 900, idleS: 2000, lockedS: 100, productiveS: 600, unproductiveS: 300, neutralS: 0, keyCount: 60, mouseCount: 25, longIdleCount: 1 });
    expect(r.apps.get('chrome.exe')).toMatchObject({ activeS: 600, idleS: 2000 });
    expect(r.domains.get('crm.example.com')).toMatchObject({ activeS: 600, category: 'productive' });
  });
});

describe('JobRegistry', () => {
  it('skips scheduled runs unless JOBS_ENABLED, runs manually, isolates failures', async () => {
    const { registry } = deps();
    const ok = vi.fn().mockResolvedValue({ n: 1 });
    const bad = vi.fn().mockRejectedValue(new Error('boom'));
    registry.register('a', '* * * * *', 'ok job', ok);
    registry.register('b', '* * * * *', 'bad job', bad);
    await registry.scheduled('a');
    expect(ok).not.toHaveBeenCalled();
    await registry.run('a');
    await registry.run('b');
    const [a, b] = registry.list();
    expect(a).toMatchObject({ lastOutcome: 'ok', lastResult: { n: 1 }, runs: 1 });
    expect(b).toMatchObject({ lastOutcome: 'error', lastError: 'boom' });
    await expect(registry.run('zzz')).rejects.toMatchObject({ status: 404 });
    const { registry: enabled } = deps({ JOBS_ENABLED: 'true' });
    enabled.register('a', '* * * * *', '', ok);
    await enabled.scheduled('a');
    expect(ok).toHaveBeenCalledTimes(2);
  });
});

describe('ShiftJobsService auto-close', () => {
  it('closes only stale shifts, closes open breaks, flags and notifies employee and manager', async () => {
    const prisma = prismaMock();
    const { clock, registry, notifications } = deps();
    const svc = new ShiftJobsService(prisma, clock, notifications, registry);
    const employee = { id: UUID(1), companyId: UUID(9), managerId: UUID(2), company: { settings: {} } };
    prisma.shift.findMany.mockResolvedValue([
      { id: UUID(10), employeeId: UUID(1), startedAt: new Date('2026-11-02T08:00:00Z'), lastHeartbeatAt: new Date('2026-11-02T09:00:00Z'), employee },
      { id: UUID(11), employeeId: UUID(1), startedAt: new Date('2026-11-02T08:00:00Z'), lastHeartbeatAt: new Date('2026-11-02T11:59:00Z'), employee },
    ]);
    prisma.shift.findUnique.mockResolvedValue({ id: UUID(10), state: 'WORKING', startedAt: new Date('2026-11-02T08:00:00Z'), lastHeartbeatAt: new Date('2026-11-02T09:00:00Z'), flags: [], breaks: [{ startedAt: new Date('2026-11-02T08:30:00Z'), endedAt: null }] });
    prisma.activitySegment.findFirst.mockResolvedValue({ endedAt: new Date('2026-11-02T09:10:00Z') });
    const res = await svc.heartbeatCheck();
    expect(res).toEqual({ open: 2, closed: 1, failed: 0 });
    const data = prisma.shift.update.mock.calls[0][0].data;
    expect(data.state).toBe('ENDED');
    expect(data.endedAt.toISOString()).toBe('2026-11-02T09:10:00.000Z');
    expect(data.endReason).toBe('auto_closed');
    expect(data.flags).toEqual(expect.arrayContaining(['auto_closed', 'no_heartbeat']));
    expect(data.breakSeconds).toBe(40 * 60);
    expect(prisma.shiftBreak.updateMany).toHaveBeenCalled();
    expect(notifications.sendNotification).toHaveBeenCalledTimes(2);
  });

  it('is idempotent when the shift was already ended by another worker', async () => {
    const prisma = prismaMock();
    const { clock, registry, notifications } = deps();
    const svc = new ShiftJobsService(prisma, clock, notifications, registry);
    prisma.shift.findMany.mockResolvedValue([{ id: UUID(10), employeeId: UUID(1), startedAt: new Date('2026-11-02T01:00:00Z'), lastHeartbeatAt: new Date('2026-11-02T01:00:00Z'), employee: { id: UUID(1), companyId: UUID(9), managerId: null, company: { settings: {} } } }]);
    prisma.shift.findUnique.mockResolvedValue({ id: UUID(10), state: 'ENDED', flags: [], breaks: [] });
    await svc.heartbeatCheck();
    expect(prisma.shift.update).not.toHaveBeenCalled();
  });
});

describe('ReminderJobsService idempotency', () => {
  it('sends each reminder once per recipient and ref, overdue vs due soon', async () => {
    const prisma = prismaMock();
    const { clock, registry, notifications } = deps();
    const svc = new ReminderJobsService(prisma, clock, notifications, registry);
    prisma.lead.findMany.mockResolvedValue([{ id: UUID(20), name: 'Lead', ownerId: UUID(1), followUpAt: NOW }]);
    prisma.task.findMany.mockResolvedValue([
      { id: UUID(30), title: 'Soon', creatorId: UUID(1), assigneeId: UUID(1), dueAt: new Date(NOW.getTime() + 10 * 60_000), assignees: [{ employeeId: UUID(2) }] },
      { id: UUID(31), title: 'Late', creatorId: UUID(1), assigneeId: UUID(1), dueAt: new Date(NOW.getTime() - 60_000), assignees: [] },
    ]);
    // the lead reminder already exists
    prisma.notification.findFirst.mockImplementation(({ where }: any) => Promise.resolve(where.data.equals === UUID(20) ? { id: 'x' } : null));
    const res = await svc.run();
    expect(res.sent).toBe(3); // task 30 -> emp1 + emp2 due soon, task 31 -> emp1 overdue
    const types = notifications.sendNotification.mock.calls.map((c: any[]) => c[1]);
    expect(types.filter((t: string) => t === 'task_due_soon')).toHaveLength(2);
    expect(types.filter((t: string) => t === 'task_overdue')).toHaveLength(1);
    expect(types).not.toContain('followup_due');
    // a second run sends nothing when everything exists
    prisma.notification.findFirst.mockResolvedValue({ id: 'x' });
    expect((await svc.run()).sent).toBe(0);
  });
});

describe('MaintenanceJobsService retention', () => {
  it('uses company retention days for segments, 90 d notifications, 1 y login events', async () => {
    const prisma = prismaMock();
    const { clock, registry } = deps();
    const svc = new MaintenanceJobsService(prisma, clock, registry);
    prisma.company.findMany.mockResolvedValue([{ id: UUID(9), settings: { activitySegmentRetentionDays: 30 } }]);
    prisma.employee.findMany.mockResolvedValue([{ id: UUID(1) }]);
    prisma.activitySegment.deleteMany.mockResolvedValue({ count: 7 });
    prisma.notification.deleteMany.mockResolvedValue({ count: 2 });
    prisma.loginEvent.deleteMany.mockResolvedValue({ count: 1 });
    const res = await svc.retentionPurge();
    expect(res).toEqual({ segments: 7, notifications: 2, loginEvents: 1 });
    expect(prisma.activitySegment.deleteMany.mock.calls[0][0].where.startedAt.lt.toISOString()).toBe('2026-10-03T12:00:00.000Z');
    expect(prisma.notification.deleteMany.mock.calls[0][0].where.createdAt.lt.toISOString()).toBe('2026-08-04T12:00:00.000Z');
    expect(prisma.loginEvent.deleteMany.mock.calls[0][0].where.createdAt.lt.toISOString()).toBe('2025-11-02T12:00:00.000Z');
  });
});

describe('MailJobsService', () => {
  it('unsnooze delegates to ConversationsService and reports the count; queue is optional without Redis', async () => {
    const prisma = prismaMock();
    const { clock, config, registry } = deps();
    const conversations: any = { unsnoozeDue: vi.fn().mockResolvedValue({ reopened: 3 }) };
    const mailSync: any = { configured: () => false, renewExpiringWatches: vi.fn(), syncMailbox: vi.fn().mockResolvedValue({ mode: 'incremental' }) };
    const trigger: any = { setHandler: vi.fn() };
    const svc = new MailJobsService(prisma, clock, config, conversations, registry, mailSync, trigger);
    expect(await svc.unsnooze()).toEqual({ reopened: 3 });
    prisma.mailbox.findMany.mockResolvedValue([{ id: UUID(5), provider: 'gmail' }, { id: UUID(6), provider: 'imap' }]);
    // without a queue, IMAP mailboxes still sync inline; Gmail ones wait for the queue
    expect(await svc.enqueueAll()).toEqual({ mailboxes: 2, enqueued: 0, inline: 1, queueAvailable: false });
    expect(mailSync.syncMailbox).toHaveBeenCalledTimes(1);
    expect(mailSync.syncMailbox).toHaveBeenCalledWith(UUID(6));
    expect(await svc.watchRenew()).toMatchObject({ renewed: 0, skipped: true });
  });
});

describe('HrJobsService leave rebalance', () => {
  it('aggregates approved to used and pending to pending, corrects drifted balances only', async () => {
    const totals = aggregateLeave([
      { employeeId: UUID(1), leaveTypeId: UUID(7), status: 'approved', days: 2 },
      { employeeId: UUID(1), leaveTypeId: UUID(7), status: 'approved', days: 0.5 },
      { employeeId: UUID(1), leaveTypeId: UUID(7), status: 'pending', days: 1 },
      { employeeId: UUID(1), leaveTypeId: UUID(7), status: 'rejected', days: 9 },
      { employeeId: UUID(1), leaveTypeId: null, status: 'approved', days: 9 },
    ]);
    expect(totals.get(`${UUID(1)}:${UUID(7)}`)).toEqual({ used: 2.5, pending: 1 });

    const prisma = prismaMock();
    const { clock, registry, notifications } = deps();
    const svc = new HrJobsService(prisma, clock, notifications, registry);
    prisma.leaveRequest.findMany.mockResolvedValue([{ employeeId: UUID(1), leaveTypeId: UUID(7), status: 'approved', days: 2 }]);
    prisma.leaveBalance.findMany.mockResolvedValue([
      { id: 'b1', employeeId: UUID(1), leaveTypeId: UUID(7), usedDays: 5, pendingDays: 0 },
      { id: 'b2', employeeId: UUID(2), leaveTypeId: UUID(7), usedDays: 0, pendingDays: 0 },
    ]);
    const res = await svc.leaveRebalance(2026);
    expect(res).toEqual({ year: 2026, requests: 1, balances: 2, corrected: 1 });
    expect(prisma.leaveBalance.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { usedDays: 2, pendingDays: 0 } });
  });
});
