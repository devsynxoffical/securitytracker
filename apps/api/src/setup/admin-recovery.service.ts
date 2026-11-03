import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as argon2 from 'argon2';
import { SystemRoleNames } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';

/**
 * Break-glass access for the operator (08 section 2): when ADMIN_RECOVERY_EMAIL and ADMIN_RECOVERY_PASSWORD
 * are set on the server, the Super Admin with that email gets that password at start-up, the lockout is
 * cleared, 2FA is reset (re-enrolled at the next sign-in) and every session is revoked. Only someone who
 * can change the server's environment can use it. It applies once per password (a password that already
 * verifies is left alone), is audited, never logs the password, and the variables should be removed after
 * use. When the email matches no Super Admin, the log lists the existing Super Admin emails masked.
 */
@Injectable()
export class AdminRecoveryService implements OnApplicationBootstrap {
  private readonly log = new Logger('AdminRecovery');

  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = process.env.ADMIN_RECOVERY_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_RECOVERY_PASSWORD;
    if (!email || !password) return;
    try {
      await this.recover(email, password);
    } catch (e) {
      this.log.error(`Admin recovery failed: ${(e as Error).message}`);
    }
  }

  async recover(email: string, password: string): Promise<'applied' | 'unchanged' | 'not_found' | 'weak_password'> {
    if (password.length < 10) {
      this.log.warn('ADMIN_RECOVERY_PASSWORD must have at least 10 characters; nothing changed.');
      return 'weak_password';
    }
    const admins = await this.prisma.employee.findMany({
      where: { deletedAt: null, role: { name: SystemRoleNames.SUPER_ADMIN } },
      select: { id: true, email: true, companyId: true, passwordHash: true },
    });
    const target = admins.find((a) => a.email?.toLowerCase() === email);
    if (!target) {
      const known = admins.map((a) => maskEmail(a.email ?? '')).join(', ') || 'none (the database has no Super Admin; open /admin to run the setup)';
      this.log.warn(`No Super Admin with ${maskEmail(email)}. Existing Super Admins: ${known}`);
      return 'not_found';
    }
    if (await argon2.verify(target.passwordHash, password).catch(() => false)) {
      this.log.log(`Recovery password already active for ${maskEmail(email)}. Remove ADMIN_RECOVERY_EMAIL and ADMIN_RECOVERY_PASSWORD.`);
      return 'unchanged';
    }
    const now = this.clock.now();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    await this.prisma.$transaction([
      this.prisma.employee.update({
        where: { id: target.id },
        data: { passwordHash, status: 'active', failedLogins: 0, lockedUntil: null, totpEnabled: false, totpSecretEnc: null, mustChangePassword: false },
      }),
      this.prisma.session.updateMany({ where: { employeeId: target.id, revokedAt: null }, data: { revokedAt: now, revokedReason: 'admin_recovery' } }),
      this.prisma.auditLog.create({
        data: {
          companyId: target.companyId,
          actorId: target.id,
          actorRole: SystemRoleNames.SUPER_ADMIN,
          action: 'admin_recovery',
          entityType: 'employee',
          entityId: target.id,
          after: { passwordReset: true, twoFactorReset: true, sessionsRevoked: true },
          ip: '127.0.0.1',
          client: 'server',
          occurredAt: now,
        },
      }),
    ]);
    this.log.warn(`Admin recovery applied for ${maskEmail(email)}: new password set, 2FA reset, sessions revoked. Remove ADMIN_RECOVERY_EMAIL and ADMIN_RECOVERY_PASSWORD now.`);
    return 'applied';
  }
}

/** info@devsynx.com -> i***@devsynx.com */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '***';
  return `${user[0]}***@${domain}`;
}
