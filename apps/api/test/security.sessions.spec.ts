import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityService } from '../src/security/security.service';
import { ClockService } from '../src/common/clock.service';
import { ScopeFilter } from '../src/auth/guards/rbac.guard';

const COMPANY = '00000000-0000-0000-0000-000000000001';
const ME = '00000000-0000-0000-0000-0000000000aa';
const OTHER = '00000000-0000-0000-0000-0000000000bb';
const SID = '00000000-0000-0000-0000-000000000501';

const teamScope: ScopeFilter = { scope: 'team', companyId: COMPANY, employeeId: ME, allowedEmployeeIds: [ME] };
const allScope: ScopeFilter = { scope: 'all', companyId: COMPANY, employeeId: ME, allowedEmployeeIds: [] };

describe('SecurityService sessions (FR-AUTH-08)', () => {
  let prisma: any;
  let svc: SecurityService;
  const now = new Date('2026-11-02T10:00:00.000Z');

  beforeEach(() => {
    prisma = {
      session: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      employee: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    };
    const clock = new ClockService();
    clock.setMockTime(now);
    svc = new SecurityService(prisma, clock);
  });

  it('team scope restricts sessions to employees in scope (allowed case)', async () => {
    await svc.listSessions(teamScope, { active: true });
    const where = prisma.session.findMany.mock.calls[0][0].where;
    expect(where.employee).toEqual({ companyId: COMPANY, id: { in: [ME] } });
    expect(where.revokedAt).toBeNull();
    expect(where.expiresAt.gt).toEqual(now);
  });

  it('team scope filtering by another employee is forbidden (denied case)', async () => {
    await expect(svc.listSessions(teamScope, { employeeId: OTHER })).rejects.toMatchObject({ status: 403 });
  });

  it('all scope may filter by any employee', async () => {
    await svc.listSessions(allScope, { employeeId: OTHER });
    const where = prisma.session.findMany.mock.calls[0][0].where;
    expect(where.employee).toEqual({ companyId: COMPANY });
    expect(where.employeeId).toBe(OTHER);
  });

  it('revoke returns 404 for a session outside scope and never reveals it', async () => {
    prisma.session.findFirst.mockResolvedValue(null);
    await expect(svc.revokeSession(teamScope, ME, SID)).rejects.toMatchObject({ status: 404 });
    expect(prisma.session.findFirst.mock.calls[0][0].where.employee.id).toEqual({ in: [ME] });
  });

  it('revoke sets revokedAt with the actor as reason, and is idempotent', async () => {
    prisma.session.findFirst.mockResolvedValue({ id: SID, revokedAt: null });
    prisma.session.update.mockImplementation(({ data }: any) => Promise.resolve({ id: SID, ...data }));
    const res = await svc.revokeSession(allScope, ME, SID);
    expect(res.revokedAt).toEqual(now);
    expect(res.revokedReason).toBe(`admin:${ME}`);
    prisma.session.findFirst.mockResolvedValue({ id: SID, revokedAt: now });
    await svc.revokeSession(allScope, ME, SID);
    expect(prisma.session.update).toHaveBeenCalledTimes(1);
  });

  it('revoke-all requires the employee to be in scope', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    await expect(svc.revokeAllSessions(teamScope, ME, OTHER)).rejects.toMatchObject({ status: 404 });
    prisma.employee.findFirst.mockResolvedValue({ id: ME });
    prisma.session.updateMany.mockResolvedValue({ count: 3 });
    await expect(svc.revokeAllSessions(teamScope, ME, ME)).resolves.toEqual({ revoked: 3 });
  });
});
