import { Injectable, ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { BootstrapSetupDto, SystemRoleNames } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ensureDefaultRoles, seedCompanyDefaults } from './default-roles';

/**
 * First-run setup (03 F29). The workspace is created exactly once: while the employee
 * table is empty the bootstrap endpoint is open; afterwards it answers 409 forever.
 */
@Injectable()
export class SetupService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  async status(): Promise<{ needsSetup: boolean }> {
    const employees = await this.prisma.employee.count();
    return { needsSetup: employees === 0 };
  }

  async bootstrap(dto: BootstrapSetupDto, ip: string): Promise<{ companyId: string; employeeId: string }> {
    if (!(await this.status()).needsSetup) {
      throw new ConflictException({ code: 'CONFLICT', message: 'This workspace is already set up. Sign in instead.' });
    }
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: dto.companyName.trim(),
          timezone: dto.timezone,
          weekStart: 1,
          settings: { idleThresholdSeconds: 300, breakAllowanceMinutes: 60, deviceApprovalMode: 'manual', deviceLimitPerEmployee: 1 },
        },
      });
      const roles = await ensureDefaultRoles(tx);
      const admin = await tx.employee.create({
        data: {
          companyId: company.id,
          code: 'EMP-0001',
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email: dto.email.trim().toLowerCase(),
          passwordHash,
          mustChangePassword: false,
          status: 'active',
          roleId: roles[SystemRoleNames.SUPER_ADMIN]!,
          joinDate: now,
        },
      });
      await seedCompanyDefaults(tx, company.id, admin.id);
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          actorId: admin.id,
          actorRole: SystemRoleNames.SUPER_ADMIN,
          action: 'POST /setup/bootstrap',
          entityType: 'company',
          entityId: company.id,
          after: { companyName: company.name, superAdmin: admin.email },
          ip,
          client: 'admin',
          occurredAt: now,
        },
      });
      return { companyId: company.id, employeeId: admin.id };
    });
  }
}
