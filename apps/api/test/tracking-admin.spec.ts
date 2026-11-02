import { describe, it, expect, vi } from 'vitest';
import { ClockService } from '../src/common/clock.service';
import { TimesheetsService } from '../src/tracking/timesheets.service';
import { TrackingReportsService } from '../src/tracking/reports.service';
import { ManualTimeService } from '../src/tracking/manual-time.service';
import { activityPercent, aggregateDay, matchesPattern, categorise, isUncategorised, overlaps, trackingSettingsFrom, dateRange } from '../src/tracking/tracking-admin.util';
import { ScopeFilter } from '../src/auth/guards/rbac.guard';

const COMPANY = '00000000-0000-0000-0000-000000000001';
const ME = '00000000-0000-0000-0000-0000000000aa';
const OTHER = '00000000-0000-0000-0000-0000000000bb';
const own: ScopeFilter = { scope: 'own', companyId: COMPANY, employeeId: ME, allowedEmployeeIds: [ME] };
const all: ScopeFilter = { scope: 'all', companyId: COMPANY, employeeId: ME, allowedEmployeeIds: [] };

function prismaMock() {
  const t = () => ({ findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() });
  const p: any = { employee: t(), activityDailySummary: t(), activityDailyApp: t(), activityDailyDomain: t(), shift: t(), attendanceDay: t(), activitySegment: t(), productivityRule: t(), trackingExclusion: t(), activityExceptionApp: t(), tamperEvent: t(), device: t(), company: t(), manualTimeEntry: t() };
  p.$transaction = vi.fn((arg: any) => (typeof arg === 'function' ? arg(p) : Promise.all(arg)));
  return p;
}

describe('tracking-admin util', () => {
  it('activity percent = active / (active + idle), 0 when nothing tracked', () => {
    expect(activityPercent(3600, 1200)).toBe(75);
    expect(activityPercent(0, 0)).toBe(0);
    expect(activityPercent(10, 0)).toBe(100);
  });

  it('aggregates several shifts of one day: first start, last end, summed breaks, open shift flag', () => {
    const row = aggregateDay('2026-11-02', {
      summary: { trackedS: 7200, activeS: 5400, idleS: 1800, lockedS: 0, productiveS: 4000, neutralS: 1000, unproductiveS: 400, keyCount: 10, mouseCount: 20 },
      shifts: [
        { startedAt: new Date('2026-11-02T08:00:00Z'), endedAt: new Date('2026-11-02T12:00:00Z'), breakSeconds: 600, offlineSeconds: 0, state: 'ENDED' },
        { startedAt: new Date('2026-11-02T13:00:00Z'), endedAt: null, breakSeconds: 300, offlineSeconds: 120, state: 'WORKING' },
      ],
      attendance: { status: 'present', manualSeconds: 1800, flags: ['manual_time'] },
    });
    expect(row.firstStart).toBe('2026-11-02T08:00:00.000Z');
    expect(row.lastEnd).toBe('2026-11-02T12:00:00.000Z');
    expect(row.breakS).toBe(900);
    expect(row.offlineS).toBe(120);
    expect(row.manualS).toBe(1800);
    expect(row.activityPercent).toBe(75);
    expect(row.openShift).toBe(true);
    expect(row.shiftCount).toBe(2);
  });

  it('rule patterns: substring without wildcard, anchored glob with wildcard', () => {
    expect(matchesPattern('chrome', 'chrome.exe')).toBe(true);
    expect(matchesPattern('*.slack.com', 'app.slack.com')).toBe(true);
    expect(matchesPattern('*.slack.com', 'slack.com')).toBe(false);
    expect(matchesPattern('code*', 'Code.exe')).toBe(true);
    expect(matchesPattern('', 'anything')).toBe(false);
  });

  it('department rule overrides company rule; default is neutral; uncategorised detection', () => {
    const rules = [
      { targetType: 'domain', pattern: 'youtube.com', category: 'unproductive', departmentId: null },
      { targetType: 'domain', pattern: 'youtube.com', category: 'productive', departmentId: 'marketing' },
      { targetType: 'app', pattern: 'code', category: 'productive', departmentId: null },
    ];
    expect(categorise('domain', 'www.youtube.com', rules, 'sales')).toBe('unproductive');
    expect(categorise('domain', 'www.youtube.com', rules, 'marketing')).toBe('productive');
    expect(categorise('app', 'spotify.exe', rules)).toBe('neutral');
    expect(isUncategorised('app', 'spotify.exe', rules)).toBe(true);
    expect(isUncategorised('app', 'Code.exe', rules)).toBe(false);
  });

  it('overlap is half-open; settings merge with defaults; date range is inclusive', () => {
    const t = (h: number) => new Date(Date.UTC(2026, 10, 2, h));
    expect(overlaps(t(8), t(10), t(10), t(12))).toBe(false);
    expect(overlaps(t(8), t(10), t(9), t(12))).toBe(true);
    expect(trackingSettingsFrom({ idleThresholdSeconds: 600, unrelated: 1 })).toMatchObject({ idleThresholdSeconds: 600, activityWarnPercent: 50, activityAlertPercent: 30 });
    expect(trackingSettingsFrom(null).idleThresholdSeconds).toBe(300);
    expect(dateRange('2026-11-01', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });
});

describe('TimesheetsService scope', () => {
  it('own scope: another employee is denied; self is allowed', async () => {
    const prisma = prismaMock();
    const svc = new TimesheetsService(prisma, new ClockService());
    await expect(svc.timesheet(own, { employeeId: OTHER, from: '2026-11-01', to: '2026-11-02', format: 'json' })).rejects.toMatchObject({ status: 403 });
    prisma.employee.findFirst.mockResolvedValue({ id: ME, code: 'E1', firstName: 'A', lastName: 'B' });
    const res = await svc.timesheet(own, { from: '2026-11-01', to: '2026-11-02', format: 'json' });
    expect(res.rows).toHaveLength(2);
    expect(res.totals.trackedS).toBe(0);
  });

  it('team timesheet restricts employees to the scope list', async () => {
    const prisma = prismaMock();
    const svc = new TimesheetsService(prisma, new ClockService());
    prisma.employee.findMany.mockResolvedValue([]);
    await svc.teamTimesheet(own, { from: '2026-11-01', to: '2026-11-01', format: 'json' });
    expect(prisma.employee.findMany.mock.calls[0][0].where.id).toEqual({ in: [ME] });
    await svc.teamTimesheet(all, { from: '2026-11-01', to: '2026-11-01', format: 'json' });
    expect(prisma.employee.findMany.mock.calls[1][0].where.id).toBeUndefined();
  });

  it('team activity derives status and thresholds from settings', async () => {
    const prisma = prismaMock();
    const clock = new ClockService();
    clock.setMockTime(new Date('2026-11-02T10:00:00Z'));
    const svc = new TimesheetsService(prisma, clock);
    prisma.employee.findMany.mockResolvedValue([{ id: ME, code: 'E1', firstName: 'A', lastName: 'B' }, { id: OTHER, code: 'E2', firstName: 'C', lastName: 'D' }]);
    prisma.company.findUnique.mockResolvedValue({ settings: { activityWarnPercent: 60, activityAlertPercent: 40 } });
    prisma.activityDailySummary.findMany.mockResolvedValue([{ employeeId: ME, trackedS: 1000, activeS: 500, idleS: 500, productiveS: 0, unproductiveS: 0 }]);
    prisma.shift.findMany.mockResolvedValue([{ employeeId: ME, startedAt: new Date('2026-11-02T08:00:00Z'), endedAt: null, state: 'WORKING', lastHeartbeatAt: new Date('2026-11-02T09:00:00Z') }]);
    const res = await svc.teamActivity(all, { date: '2026-11-02' });
    expect(res.items[0].status).toBe('offline'); // heartbeat an hour old
    expect(res.items[0].level).toBe('warn'); // 50% < 60 warn, >= 40 alert
    expect(res.items[1].status).toBe('not_started');
    expect(res.summary.thresholds).toEqual({ warn: 60, alert: 40 });
  });
});

describe('TrackingReportsService', () => {
  it('uncategorised queue excludes apps that match a rule and sums time across employees', async () => {
    const prisma = prismaMock();
    const svc = new TrackingReportsService(prisma);
    prisma.productivityRule.findMany.mockResolvedValue([{ targetType: 'app', pattern: 'code', category: 'productive', departmentId: null }]);
    prisma.employee.findMany.mockResolvedValue([{ id: ME }, { id: OTHER }]);
    prisma.activityDailyApp.findMany.mockResolvedValue([
      { processName: 'code.exe', appName: 'VS Code', activeS: 500, employeeId: ME },
      { processName: 'spotify.exe', appName: 'Spotify', activeS: 300, employeeId: ME },
      { processName: 'spotify.exe', appName: 'Spotify', activeS: 200, employeeId: OTHER },
    ]);
    const res = await svc.uncategorised(all, { from: '2026-11-01', to: '2026-11-02', type: 'app', limit: 100 });
    expect(res.items).toEqual([{ key: 'spotify.exe', label: 'Spotify', activeS: 500, employees: 2 }]);
  });

  it('usage report for an employee outside own scope is forbidden', async () => {
    const prisma = prismaMock();
    const svc = new TrackingReportsService(prisma);
    await expect(svc.usageApps(own, { from: '2026-11-01', to: '2026-11-02', employeeIds: OTHER, limit: 100 })).rejects.toMatchObject({ status: 403 });
  });
});

describe('ManualTimeService (F27)', () => {
  const notif: any = { sendNotification: vi.fn().mockResolvedValue({}) };
  const dto = { date: '2026-11-02', startedAt: '2026-11-02T14:00:00Z', endedAt: '2026-11-02T15:00:00Z', reason: 'Client visit' };

  it('rejects overlap with tracked segments (MANUAL_TIME_OVERLAP)', async () => {
    const prisma = prismaMock();
    const svc = new ManualTimeService(prisma, new ClockService(), notif);
    prisma.activitySegment.findMany.mockResolvedValue([{ startedAt: new Date('2026-11-02T14:30:00Z'), endedAt: new Date('2026-11-02T14:45:00Z') }]);
    await expect(svc.create(own, ME, dto)).rejects.toMatchObject({ response: { code: 'MANUAL_TIME_OVERLAP' } });
  });

  it('creates a pending entry and notifies the manager; approving adds manual_s to the attendance day', async () => {
    const prisma = prismaMock();
    const clock = new ClockService();
    const svc = new ManualTimeService(prisma, clock, notif);
    prisma.manualTimeEntry.create.mockResolvedValue({ id: 'm1', durationS: 3600 });
    prisma.employee.findUnique.mockResolvedValue({ managerId: OTHER, firstName: 'A', lastName: 'B' });
    const entry = await svc.create(own, ME, dto);
    expect(entry.id).toBe('m1');
    expect(prisma.manualTimeEntry.create.mock.calls[0][0].data).toMatchObject({ status: 'pending', durationS: 3600, employeeId: ME });
    expect(notif.sendNotification).toHaveBeenCalledWith(OTHER, expect.any(String), expect.any(String), expect.any(String), { manualTimeId: 'm1' });

    prisma.manualTimeEntry.findFirst.mockResolvedValue({ id: 'm1', companyId: COMPANY, employeeId: ME, status: 'pending', durationS: 3600, date: new Date('2026-11-02T00:00:00Z') });
    prisma.manualTimeEntry.update.mockResolvedValue({ id: 'm1', status: 'approved' });
    const decided = await svc.decide(all, OTHER, 'm1', { status: 'approved' });
    expect(decided.status).toBe('approved');
    expect(prisma.attendanceDay.upsert.mock.calls[0][0].update).toEqual({ manualSeconds: { increment: 3600 } });
  });

  it('own scope cannot file time for someone else, and only pending entries can be decided', async () => {
    const prisma = prismaMock();
    const svc = new ManualTimeService(prisma, new ClockService(), notif);
    await expect(svc.create(own, ME, { ...dto, employeeId: OTHER })).rejects.toMatchObject({ status: 403 });
    prisma.manualTimeEntry.findFirst.mockResolvedValue({ id: 'm2', companyId: COMPANY, employeeId: ME, status: 'approved', durationS: 60, date: new Date() });
    await expect(svc.decide(all, OTHER, 'm2', { status: 'rejected' })).rejects.toMatchObject({ response: { code: 'MANUAL_TIME_INVALID_STATE' } });
  });
});
