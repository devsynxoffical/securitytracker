import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClockService } from '../src/common/clock.service';
import { LeaveService } from '../src/hr/leave.service';
import { ChecklistsService } from '../src/hr/checklists.service';
import { AnnouncementsService } from '../src/hr/announcements.service';
import { countWorkingDays, entitlementForYear, dateUtc } from '../src/hr/hr.util';
import { ScopeFilter } from '../src/auth/guards/rbac.guard';

const COMPANY = '00000000-0000-0000-0000-000000000001';
const ME = '00000000-0000-0000-0000-0000000000aa';
const OTHER = '00000000-0000-0000-0000-0000000000bb';
const MANAGER = '00000000-0000-0000-0000-0000000000cc';
const UUID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const own: ScopeFilter = { scope: 'own', companyId: COMPANY, employeeId: ME, allowedEmployeeIds: [ME] };
const all: ScopeFilter = { scope: 'all', companyId: COMPANY, employeeId: MANAGER, allowedEmployeeIds: [] };

function prismaMock() {
  const table = () => ({
    findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
    upsert: vi.fn(), delete: vi.fn(), count: vi.fn().mockResolvedValue(0),
  });
  const p: any = {
    leaveType: table(), leaveBalance: table(), leaveRequest: table(), employee: table(), employeeSchedule: table(), holiday: table(),
    attendanceDay: table(), hrChecklistTemplate: table(), hrChecklist: table(), announcement: table(), announcementRead: table(),
  };
  p.$transaction = vi.fn((cb: any) => (typeof cb === 'function' ? cb(p) : Promise.all(cb)));
  return p;
}

const annual = { id: UUID(1), companyId: COMPANY, name: 'Annual', code: 'ANNUAL', colour: '#000000', paid: true, annualAllowanceDays: 20, accrual: 'upfront', carryOverMaxDays: 0, requiresApproval: true, allowHalfDay: true, isActive: true };

describe('hr.util working days and accrual (F25)', () => {
  it('counts Mon-Fri by default and skips holidays', () => {
    // 2026-11-02 (Mon) .. 2026-11-08 (Sun), holiday on Wed 4th
    const days = countWorkingDays(dateUtc('2026-11-02'), dateUtc('2026-11-08'), [], new Set(['2026-11-04']));
    expect(days).toBe(4);
  });

  it('uses the schedule window workdays when one covers the date', () => {
    const windows = [{ workdays: [1, 2, 3, 4, 5, 6], effectiveFrom: dateUtc('2026-01-01'), effectiveTo: null }];
    expect(countWorkingDays(dateUtc('2026-11-02'), dateUtc('2026-11-08'), windows, new Set())).toBe(6);
  });

  it('upfront entitlement is the allowance, pro rata for mid-year joiners', () => {
    const now = new Date('2026-11-02T00:00:00Z');
    expect(entitlementForYear(24, 'upfront', 2026, now, null)).toBe(24);
    expect(entitlementForYear(24, 'upfront', 2026, now, dateUtc('2026-07-01'))).toBe(12);
  });

  it('monthly accrual credits allowance/12 per month started', () => {
    const now = new Date('2026-03-15T00:00:00Z');
    expect(entitlementForYear(12, 'monthly', 2026, now, null)).toBe(3);
    expect(entitlementForYear(12, 'monthly', 2025, now, null)).toBe(12);
  });
});

describe('LeaveService requests and balances (F25)', () => {
  let prisma: any;
  let svc: LeaveService;
  let notifications: any;

  beforeEach(() => {
    prisma = prismaMock();
    const clock = new ClockService();
    clock.setMockTime(new Date('2026-11-02T10:00:00Z'));
    notifications = { sendNotification: vi.fn().mockResolvedValue({}) };
    svc = new LeaveService(prisma, clock, notifications);
    prisma.leaveType.findFirst.mockResolvedValue(annual);
    prisma.employee.findUnique.mockResolvedValue({ joinDate: null, managerId: MANAGER, firstName: 'A', lastName: 'B' });
    prisma.leaveRequest.create.mockImplementation(({ data }: any) => Promise.resolve({ id: UUID(9), ...data }));
  });

  function balance(overrides: Record<string, number> = {}) {
    prisma.leaveBalance.findUnique.mockResolvedValue({ id: UUID(5), entitledDays: 20, carriedOverDays: 0, adjustmentsDays: 0, usedDays: 0, pendingDays: 0, ...overrides });
  }

  it('creates a pending request, reserves pending days and notifies the manager', async () => {
    balance();
    const req = await svc.create(own, ME, { leaveTypeId: annual.id, dateFrom: '2026-11-03', dateTo: '2026-11-04', halfDay: false, reason: 'Trip' });
    expect(req.status).toBe('pending');
    expect(Number(req.days)).toBe(2);
    expect(prisma.leaveBalance.update).toHaveBeenCalledWith(expect.objectContaining({ data: { pendingDays: { increment: 2 } } }));
    expect(notifications.sendNotification).toHaveBeenCalledWith(MANAGER, 'leave_requested', expect.any(String), expect.any(String), expect.any(Object));
  });

  it('rejects when the balance is insufficient (LEAVE_BALANCE_EXCEEDED)', async () => {
    balance({ usedDays: 19 });
    await expect(svc.create(own, ME, { leaveTypeId: annual.id, dateFrom: '2026-11-03', dateTo: '2026-11-04', halfDay: false, reason: 'x' })).rejects.toMatchObject({ response: { code: 'LEAVE_BALANCE_EXCEEDED' } });
  });

  it('rejects overlapping requests (LEAVE_OVERLAP)', async () => {
    balance();
    prisma.leaveRequest.findFirst.mockResolvedValue({ id: UUID(7), dateFrom: dateUtc('2026-11-04'), dateTo: dateUtc('2026-11-05') });
    await expect(svc.create(own, ME, { leaveTypeId: annual.id, dateFrom: '2026-11-03', dateTo: '2026-11-04', halfDay: false, reason: 'x' })).rejects.toMatchObject({ response: { code: 'LEAVE_OVERLAP' } });
  });

  it('half day counts 0.5 and must be a single day', async () => {
    balance();
    const req = await svc.create(own, ME, { leaveTypeId: annual.id, dateFrom: '2026-11-03', dateTo: '2026-11-03', halfDay: true, reason: 'x' });
    expect(Number(req.days)).toBe(0.5);
    await expect(svc.create(own, ME, { leaveTypeId: annual.id, dateFrom: '2026-11-03', dateTo: '2026-11-04', halfDay: true, reason: 'x' })).rejects.toMatchObject({ status: 400 });
  });

  it('own scope cannot file leave for another employee (denied), all scope can (allowed)', async () => {
    balance();
    await expect(svc.create(own, ME, { employeeId: OTHER, leaveTypeId: annual.id, dateFrom: '2026-11-03', dateTo: '2026-11-03', halfDay: false, reason: 'x' })).rejects.toMatchObject({ status: 404 });
    const req = await svc.create(all, MANAGER, { employeeId: OTHER, leaveTypeId: annual.id, dateFrom: '2026-11-03', dateTo: '2026-11-03', halfDay: false, reason: 'x' });
    expect(req.employeeId).toBe(OTHER);
  });

  it('approve moves pending to used and marks attendance days on_leave; reject releases pending', async () => {
    const pending = { id: UUID(9), employeeId: ME, status: 'pending', days: 2, leaveTypeId: annual.id, dateFrom: dateUtc('2026-11-03'), dateTo: dateUtc('2026-11-04'), comment: null };
    prisma.leaveRequest.findFirst.mockResolvedValue(pending);
    prisma.leaveType.findUnique.mockResolvedValue(annual);
    balance({ pendingDays: 2 });
    prisma.leaveRequest.update.mockImplementation(({ data }: any) => Promise.resolve({ ...pending, ...data }));

    const approved = await svc.decide(all, MANAGER, UUID(9), { status: 'approved' });
    expect(approved.status).toBe('approved');
    expect(prisma.leaveBalance.update).toHaveBeenCalledWith(expect.objectContaining({ data: { pendingDays: { decrement: 2 }, usedDays: { increment: 2 } } }));
    expect(prisma.attendanceDay.upsert).toHaveBeenCalledTimes(2);

    prisma.leaveBalance.update.mockClear();
    await svc.decide(all, MANAGER, UUID(9), { status: 'rejected', comment: 'No cover' });
    expect(prisma.leaveBalance.update).toHaveBeenCalledWith(expect.objectContaining({ data: { pendingDays: { decrement: 2 } } }));
    expect(notifications.sendNotification).toHaveBeenCalledWith(ME, 'leave_decided', 'Leave rejected', expect.stringContaining('No cover'), expect.any(Object));
  });

  it('cancelling an approved request reverses used days and needs an approver', async () => {
    const approvedReq = { id: UUID(9), employeeId: ME, status: 'approved', days: 2, leaveTypeId: annual.id, dateFrom: dateUtc('2026-11-03'), dateTo: dateUtc('2026-11-04'), comment: null };
    prisma.leaveRequest.findFirst.mockResolvedValue(approvedReq);
    prisma.leaveType.findUnique.mockResolvedValue(annual);
    balance({ usedDays: 2 });
    prisma.leaveRequest.update.mockImplementation(({ data }: any) => Promise.resolve({ ...approvedReq, ...data }));
    await expect(svc.cancel(own, ME, UUID(9), undefined, false)).rejects.toMatchObject({ status: 403 });
    const res = await svc.cancel(all, MANAGER, UUID(9), 'Project moved', true);
    expect(res.status).toBe('cancelled');
    expect(prisma.leaveBalance.update).toHaveBeenCalledWith(expect.objectContaining({ data: { usedDays: { decrement: 2 } } }));
    expect(prisma.attendanceDay.updateMany).toHaveBeenCalled();
  });

  it('list in own scope filters by employeeId and refuses other owners as filter', async () => {
    await svc.list(own, { limit: 50 });
    expect(prisma.leaveRequest.findMany.mock.calls[0][0].where.employeeId).toEqual({ in: [ME] });
    await expect(svc.list(own, { limit: 50, employeeId: OTHER })).rejects.toMatchObject({ status: 403 });
  });
});

describe('ChecklistsService (F26)', () => {
  it('builds items with due dates from the anchor and offsets', () => {
    const prisma = prismaMock();
    const clock = new ClockService();
    const svc = new ChecklistsService(prisma, clock, { sendNotification: vi.fn() } as any);
    const items = svc.buildItems([{ title: 'Laptop', ownerRole: 'it', offsetDays: -1 }, { title: 'Welcome', ownerRole: 'manager', offsetDays: 0 }, { title: 'Check-in', offsetDays: 30 }], dateUtc('2026-11-02'));
    expect(items.map((i) => i.dueAt.slice(0, 10))).toEqual(['2026-11-01', '2026-11-02', '2026-12-02']);
    expect(items[2]!.ownerRole).toBe('hr');
    expect(items.every((i) => !i.done && i.id)).toBe(true);
  });

  it('employee may tick own items but not manager items; completing all items closes the checklist', async () => {
    const prisma = prismaMock();
    const clock = new ClockService();
    clock.setMockTime(new Date('2026-11-02T10:00:00Z'));
    const svc = new ChecklistsService(prisma, clock, { sendNotification: vi.fn() } as any);
    const items = [
      { id: 'i1', title: 'Profile', ownerRole: 'employee', dueAt: '2026-11-02T00:00:00.000Z', done: false, doneBy: null, doneAt: null },
      { id: 'i2', title: 'Welcome', ownerRole: 'manager', dueAt: '2026-11-02T00:00:00.000Z', done: true, doneBy: MANAGER, doneAt: '2026-11-02T00:00:00.000Z' },
    ];
    prisma.hrChecklist.findFirst.mockResolvedValue({ id: UUID(3), companyId: COMPANY, employeeId: ME, items, employee: { managerId: MANAGER } });
    prisma.hrChecklist.update.mockImplementation(({ data }: any) => Promise.resolve({ id: UUID(3), ...data }));

    await expect(svc.setItem(own, { id: ME, roleName: 'Employee' }, false, UUID(3), 'i2', false)).rejects.toMatchObject({ status: 403 });
    const res = await svc.setItem(own, { id: ME, roleName: 'Employee' }, false, UUID(3), 'i1', true);
    expect(res.status).toBe('completed');
    expect((res.items as any[])[0].doneBy).toBe(ME);
  });
});

describe('AnnouncementsService (FR-HR-13)', () => {
  it('delivers to the department audience only and non-senders see only their audience', async () => {
    const prisma = prismaMock();
    const clock = new ClockService();
    const notifications = { sendNotification: vi.fn().mockResolvedValue({}) };
    const svc = new AnnouncementsService(prisma, clock, notifications as any);
    prisma.employee.findMany.mockResolvedValue([{ id: ME }, { id: OTHER }]);
    prisma.announcement.create.mockImplementation(({ data }: any) => Promise.resolve({ id: UUID(4), ...data }));
    await svc.create(COMPANY, MANAGER, { title: 'Hi', body: 'All hands', audienceType: 'department', audienceId: UUID(20), pinned: false });
    expect(prisma.employee.findMany.mock.calls[0][0].where.departmentId).toBe(UUID(20));
    expect(notifications.sendNotification).toHaveBeenCalledTimes(2);

    prisma.announcement.findMany.mockResolvedValue([]);
    await svc.list(COMPANY, { id: ME, departmentId: UUID(20), teamId: null, roleId: UUID(30) }, false);
    const where = prisma.announcement.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([{ audienceType: 'company' }, { audienceType: 'department', audienceId: UUID(20) }, { audienceType: 'role', audienceId: UUID(30) }]));
  });
});
