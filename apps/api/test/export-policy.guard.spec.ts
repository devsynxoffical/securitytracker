import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { ErrorCodes } from '@company-os/contracts';
import { ExportPolicyGuard, resolveExportPolicy } from '../src/auth/guards/export-policy.guard';

/** FR-SEC-20: one guard for every export endpoint, three policies x Super Admin / Employee. */
describe('ExportPolicyGuard (Unit)', () => {
  let guard: ExportPolicyGuard;
  let reflector: Reflector;
  let prisma: any;

  const superAdmin = { id: 'sa', companyId: 'c1', roleId: 'r5', roleName: 'Super Admin' };
  const employee = { id: 'emp', companyId: 'c1', roleId: 'r1', roleName: 'Employee' };

  const ctx = (user: any, query: Record<string, string> = {}) => {
    const request: any = { user, query, originalUrl: '/api/v1/crm/deals/export', ip: '10.0.0.1', headers: { 'x-client-type': 'admin' } };
    return { getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => request }) } as any;
  };
  const policy = (value?: string) => prisma.company.findUnique.mockResolvedValue({ settings: value ? { dataExportPolicy: value } : {} });
  const code = async (p: Promise<unknown>) => {
    try { await p; return null; } catch (e) { return (e as ForbiddenException).getResponse() as any; }
  };

  beforeEach(() => {
    reflector = new Reflector();
    prisma = { company: { findUnique: vi.fn() }, auditLog: { create: vi.fn().mockResolvedValue({}) } };
    guard = new ExportPolicyGuard(reflector, prisma);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({});
  });

  it('ignores routes without @ExportGuarded', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    await expect(guard.canActivate(ctx(employee))).resolves.toBe(true);
    expect(prisma.company.findUnique).not.toHaveBeenCalled();
  });

  it('disabled (default when the key is missing): 403 EXPORT_DISABLED for Super Admin and Employee', async () => {
    policy(undefined);
    expect((await code(guard.canActivate(ctx(superAdmin))))?.code).toBe(ErrorCodes.EXPORT_DISABLED);
    expect((await code(guard.canActivate(ctx(employee))))?.code).toBe(ErrorCodes.EXPORT_DISABLED);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('super_admin: Super Admin passes with an export audit entry, Employee is refused', async () => {
    policy('super_admin');
    await expect(guard.canActivate(ctx(superAdmin))).resolves.toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'export', actorId: 'sa', companyId: 'c1', entityType: 'crm' });
    expect((await code(guard.canActivate(ctx(employee))))?.code).toBe(ErrorCodes.EXPORT_DISABLED);
  });

  it('permission: both pass (the route permission decides) and nothing extra is audited', async () => {
    policy('permission');
    await expect(guard.canActivate(ctx(superAdmin))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(employee))).resolves.toBe(true);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('csvOnly: JSON requests pass under disabled, format=csv is refused', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ csvOnly: true });
    policy('disabled');
    await expect(guard.canActivate(ctx(employee, {}))).resolves.toBe(true);
    expect((await code(guard.canActivate(ctx(employee, { format: 'csv' }))))?.code).toBe(ErrorCodes.EXPORT_DISABLED);
  });

  it('anyEnabledPolicy (mail attachments, FR-SEC-23): employee passes under super_admin, refused under disabled', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ anyEnabledPolicy: true });
    policy('super_admin');
    await expect(guard.canActivate(ctx(employee))).resolves.toBe(true);
    policy('disabled');
    expect((await code(guard.canActivate(ctx(employee))))?.code).toBe(ErrorCodes.EXPORT_DISABLED);
  });

  it('resolveExportPolicy falls back to disabled for unknown values', () => {
    expect(resolveExportPolicy(null)).toBe('disabled');
    expect(resolveExportPolicy({ dataExportPolicy: 'everyone' })).toBe('disabled');
    expect(resolveExportPolicy({ dataExportPolicy: 'permission' })).toBe('permission');
  });
});
