import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as argon2 from 'argon2';
import { ErrorCodes } from '@company-os/contracts';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { EmployeesService } from '../src/org/employees.service';
import { AuthService } from '../src/auth/auth.service';
import { ClockService } from '../src/common/clock.service';

/** FR-SEC-24 to FR-SEC-26: suspend, immediate rejection, refused sign-in, restore. */
describe('Suspend access (Unit)', () => {
  describe('JwtStrategy', () => {
    const make = (employee: any) => {
      const prisma: any = { employee: { findUnique: vi.fn().mockResolvedValue(employee) }, session: { findUnique: vi.fn().mockResolvedValue({ id: 's1', revokedAt: null }) } };
      const config: any = { get: vi.fn(() => 'test-secret-test-secret-test-secret-32') };
      return new JwtStrategy(config, prisma);
    };
    const base = { id: 'e1', companyId: 'c1', code: 'EMP-0001', email: 'e@x', roleId: 'r1', role: { name: 'Employee', rank: 1 } };

    it('accepts an active employee', async () => {
      const user = await make({ ...base, status: 'active' }).validate({ sub: 'e1', session: 's1' });
      expect(user.id).toBe('e1');
    });
    it('rejects suspended, disabled and invited employees', async () => {
      for (const status of ['suspended', 'disabled', 'invited']) {
        await expect(make({ ...base, status }).validate({ sub: 'e1', session: 's1' })).rejects.toThrow('Account is not active');
      }
    });
  });

  describe('EmployeesService.suspendEmployee / restoreEmployee', () => {
    let prisma: any;
    let gateway: any;
    let service: EmployeesService;
    const clock = new ClockService();

    beforeEach(() => {
      prisma = {
        employee: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(2) },
        session: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
        device: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      };
      gateway = { emitToUser: vi.fn() };
      service = new EmployeesService(prisma, clock, gateway);
    });

    it('sets suspended, revokes sessions and approved devices, pushes session.revoked', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 'e1', status: 'active', role: { name: 'Employee' } });
      const res = await service.suspendEmployee('e1', 'c1', 'admin', { reason: 'Policy breach' });
      expect(res).toMatchObject({ status: 'suspended', revokedSessions: 3, revokedDevices: 1 });
      expect(prisma.employee.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { status: 'suspended' } });
      expect(prisma.session.updateMany.mock.calls[0][0]).toMatchObject({ where: { employeeId: 'e1', revokedAt: null }, data: { revokedReason: 'suspended' } });
      expect(prisma.device.updateMany).toHaveBeenCalledWith({ where: { employeeId: 'e1', status: 'approved' }, data: { status: 'revoked' } });
      expect(gateway.emitToUser).toHaveBeenCalledWith('e1', 'session.revoked', { reason: 'account_suspended' });
    });

    it('refuses self-suspension, disabled employees and the last Super Admin', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 'me', status: 'active', role: { name: 'Employee' } });
      await expect(service.suspendEmployee('me', 'c1', 'me', { reason: 'x' })).rejects.toThrow(/own access/);
      prisma.employee.findFirst.mockResolvedValue({ id: 'e2', status: 'disabled', role: { name: 'Employee' } });
      await expect(service.suspendEmployee('e2', 'c1', 'admin', { reason: 'x' })).rejects.toThrow(/disabled/);
      prisma.employee.findFirst.mockResolvedValue({ id: 'sa', status: 'active', role: { name: 'Super Admin' } });
      prisma.employee.count.mockResolvedValue(1);
      await expect(service.suspendEmployee('sa', 'c1', 'admin', { reason: 'x' })).rejects.toThrow(/last active Super Admin/);
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it('restore sets active and leaves devices revoked; only suspended employees can be restored', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 'e1', status: 'suspended' });
      await expect(service.restoreEmployee('e1', 'c1')).resolves.toMatchObject({ status: 'active' });
      expect(prisma.employee.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { status: 'active' } });
      expect(prisma.device.updateMany).not.toHaveBeenCalled();
      prisma.employee.findFirst.mockResolvedValue({ id: 'e1', status: 'active' });
      await expect(service.restoreEmployee('e1', 'c1')).rejects.toThrow(/Only a suspended/);
    });
  });

  describe('AuthService login while suspended', () => {
    let prisma: any;
    let auth: AuthService;

    beforeEach(async () => {
      const passwordHash = await argon2.hash('Secret123!');
      prisma = {
        employee: { findFirst: vi.fn().mockResolvedValue({ id: 'e1', companyId: 'c1', status: 'suspended', passwordHash, failedLogins: 0, lockedUntil: null, role: { name: 'Employee', rank: 1 }, company: { settings: {} } }) },
        loginEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      const config: any = { get: vi.fn(() => undefined) };
      auth = new AuthService(prisma, { sign: vi.fn() } as any, config, new ClockService(), { get: vi.fn(), set: vi.fn(), del: vi.fn() } as any, { send: vi.fn() } as any);
    });

    const errorCode = async (p: Promise<unknown>) => { try { await p; return null; } catch (e: any) { return e.getResponse?.()?.code ?? null; } };

    it('desktop login returns ACCOUNT_SUSPENDED and logs the attempt', async () => {
      expect(await errorCode(auth.desktopLogin({ identifier: 'EMP-0001', password: 'Secret123!', device: { publicKey: 'k', name: 'PC', os: 'win', hardwareHash: 'h' }, signature: 's', timestamp: new Date().toISOString() } as any, '10.0.0.1'))).toBe(ErrorCodes.ACCOUNT_SUSPENDED);
      expect(prisma.loginEvent.create.mock.calls[0][0].data).toMatchObject({ result: 'suspended' });
    });

    it('admin login returns ACCOUNT_SUSPENDED', async () => {
      expect(await errorCode(auth.adminLogin({ email: 'e@x', password: 'Secret123!' }, '10.0.0.1'))).toBe(ErrorCodes.ACCOUNT_SUSPENDED);
    });
  });
});
