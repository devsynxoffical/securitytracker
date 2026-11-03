import { describe, it, expect, vi } from 'vitest';
import * as argon2 from 'argon2';
import { AdminRecoveryService, maskEmail } from '../src/setup/admin-recovery.service';
import { ClockService } from '../src/common/clock.service';

function prismaWith(admins: Array<{ id: string; email: string; companyId: string; passwordHash: string }>) {
  const prisma: any = {
    employee: { findMany: vi.fn().mockResolvedValue(admins), update: vi.fn().mockReturnValue('u') },
    session: { updateMany: vi.fn().mockReturnValue('s') },
    auditLog: { create: vi.fn().mockReturnValue('a') },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  return prisma;
}

describe('admin recovery (break-glass)', () => {
  it('sets the password, clears lockout and 2FA, revokes sessions and audits', async () => {
    const prisma = prismaWith([{ id: 'e1', email: 'Info@Devsynx.com', companyId: 'c1', passwordHash: await argon2.hash('old-password-123') }]);
    const svc = new AdminRecoveryService(prisma, new ClockService());
    expect(await svc.recover('info@devsynx.com', 'New-Password-2026')).toBe('applied');
    const data = prisma.employee.update.mock.calls[0][0].data;
    expect(await argon2.verify(data.passwordHash, 'New-Password-2026')).toBe(true);
    expect(data).toMatchObject({ status: 'active', failedLogins: 0, lockedUntil: null, totpEnabled: false, totpSecretEnc: null });
    expect(prisma.session.updateMany).toHaveBeenCalled();
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('admin_recovery');
  });

  it('does nothing when the password already works, the email is unknown, or the password is weak', async () => {
    const hash = await argon2.hash('Same-Password-1');
    const prisma = prismaWith([{ id: 'e1', email: 'a@b.co', companyId: 'c1', passwordHash: hash }]);
    const svc = new AdminRecoveryService(prisma, new ClockService());
    expect(await svc.recover('a@b.co', 'Same-Password-1')).toBe('unchanged');
    expect(await svc.recover('x@b.co', 'Another-Password-1')).toBe('not_found');
    expect(await svc.recover('a@b.co', 'short')).toBe('weak_password');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('masks emails in logs', () => {
    expect(maskEmail('info@devsynx.com')).toBe('i***@devsynx.com');
    expect(maskEmail('broken')).toBe('***');
  });
});
