import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  DisableEmployeeDto,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';

@Injectable()
export class EmployeesService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  async listEmployees(scopeFilter: ScopeFilter, status?: string) {
    const where: any = { companyId: scopeFilter.companyId, deletedAt: null };

    if (status) {
      where.status = status;
    }

    if (scopeFilter.scope !== 'all' && scopeFilter.allowedEmployeeIds.length > 0) {
      where.id = { in: scopeFilter.allowedEmployeeIds };
    }

    return this.prisma.employee.findMany({
      where,
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        joinDate: true,
        lastLoginAt: true,
        role: { select: { id: true, name: true, rank: true } },
        department: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        manager: { select: { id: true, code: true, firstName: true, lastName: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async getEmployeeById(id: string, scopeFilter: ScopeFilter) {
    const where: any = { id, companyId: scopeFilter.companyId, deletedAt: null };

    if (scopeFilter.scope !== 'all' && scopeFilter.allowedEmployeeIds.length > 0) {
      where.id = { in: scopeFilter.allowedEmployeeIds };
    }

    const employee = await this.prisma.employee.findFirst({
      where,
      include: {
        role: { include: { permissions: true } },
        department: true,
        team: true,
        manager: true,
        permissionOverrides: true,
        devices: true,
      },
    });

    if (!employee) throw new NotFoundException('Employee not found or outside scope');
    return employee;
  }

  /**
   * Create employee with sequential EMP-XXXX code and temporary password (F1).
   */
  async createEmployee(companyId: string, dto: CreateEmployeeDto) {
    // Generate sequential employee code
    const lastEmployee = await this.prisma.employee.findFirst({
      where: { companyId },
      orderBy: { code: 'desc' },
      select: { code: true },
    });

    let nextNumber = 1;
    if (lastEmployee && lastEmployee.code.startsWith('EMP-')) {
      const parsed = parseInt(lastEmployee.code.replace('EMP-', ''), 10);
      if (!isNaN(parsed)) {
        nextNumber = parsed + 1;
      }
    }
    const code = `EMP-${nextNumber.toString().padStart(4, '0')}`;

    // Generate random 12-char temporary password
    const tempPassword = `Temp@${crypto.randomBytes(4).toString('hex')}!`;
    const passwordHash = await argon2.hash(tempPassword, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    const employee = await this.prisma.employee.create({
      data: {
        companyId,
        code,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email || null,
        phone: dto.phone || null,
        roleId: dto.roleId,
        departmentId: dto.departmentId || null,
        teamId: dto.teamId || null,
        managerId: dto.managerId || null,
        joinDate: dto.joinDate ? new Date(dto.joinDate) : null,
        passwordHash,
        mustChangePassword: true,
        status: 'invited',
      },
      include: { role: true },
    });

    if (dto.scheduleId) {
      await this.prisma.employeeSchedule.create({
        data: {
          employeeId: employee.id,
          scheduleId: dto.scheduleId,
          effectiveFrom: this.clock.now(),
        },
      });
    }

    return {
      employee: {
        id: employee.id,
        code: employee.code,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        role: employee.role.name,
      },
      temporaryPassword: tempPassword,
    };
  }

  async updateEmployee(id: string, companyId: string, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.employee.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        roleId: dto.roleId,
        departmentId: dto.departmentId,
        teamId: dto.teamId,
        managerId: dto.managerId,
        joinDate: dto.joinDate ? new Date(dto.joinDate) : undefined,
      },
    });
  }

  async resetPassword(id: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const tempPassword = `Reset@${crypto.randomBytes(4).toString('hex')}!`;
    const passwordHash = await argon2.hash(tempPassword, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    await this.prisma.$transaction([
      this.prisma.employee.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, failedLogins: 0, lockedUntil: null },
      }),
      this.prisma.session.updateMany({
        where: { employeeId: id, revokedAt: null },
        data: { revokedAt: this.clock.now(), revokedReason: 'admin_password_reset' },
      }),
    ]);

    return { temporaryPassword: tempPassword };
  }

  /**
   * Offboarding preview of open items (leads, tasks, appointments) before disable (F16).
   */
  async getOffboardingPreview(id: string, companyId: string) {
    const [openLeadsCount, openTasksCount, activeShiftsCount] = await Promise.all([
      this.prisma.lead.count({ where: { ownerId: id, companyId, deletedAt: null } }),
      this.prisma.task.count({ where: { assigneeId: id, companyId, status: { not: 'done' } } }),
      this.prisma.shift.count({ where: { employeeId: id, state: { in: ['WORKING', 'ON_BREAK'] } } }),
    ]);

    return {
      employeeId: id,
      openLeadsCount,
      openTasksCount,
      activeShiftsCount,
    };
  }

  /**
   * Offboarding transaction (F16).
   */
  async disableEmployee(id: string, companyId: string, dto: DisableEmployeeDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { role: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    if (employee.role.name === 'Super Admin') {
      const activeSuperAdmins = await this.prisma.employee.count({
        where: {
          companyId,
          role: { name: 'Super Admin' },
          status: 'active',
          deletedAt: null,
        },
      });
      if (activeSuperAdmins <= 1) {
        throw new ForbiddenException('Cannot disable the last active Super Admin.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Reassign leads if owner provided
      if (dto.reassignmentMap?.leadsOwnerId) {
        await tx.lead.updateMany({
          where: { ownerId: id, companyId },
          data: { ownerId: dto.reassignmentMap.leadsOwnerId },
        });
      }

      // 2. Reassign tasks if assignee provided
      if (dto.reassignmentMap?.tasksAssigneeId) {
        await tx.task.updateMany({
          where: { assigneeId: id, companyId, status: { not: 'done' } },
          data: { assigneeId: dto.reassignmentMap.tasksAssigneeId },
        });
      }

      // 3. Auto-close open shift
      await tx.shift.updateMany({
        where: { employeeId: id, state: { in: ['WORKING', 'ON_BREAK'] } },
        data: {
          state: 'ENDED',
          endReason: 'admin',
          endedAt: this.clock.now(),
        },
      });

      // 4. Revoke sessions & devices
      await tx.session.updateMany({
        where: { employeeId: id, revokedAt: null },
        data: { revokedAt: this.clock.now(), revokedReason: 'employee_disabled' },
      });

      await tx.device.updateMany({
        where: { employeeId: id, status: 'approved' },
        data: { status: 'revoked' },
      });

      // 5. Remove mailbox assignments
      await tx.mailboxAssignment.deleteMany({
        where: { employeeId: id },
      });

      // 6. Set employee disabled
      await tx.employee.update({
        where: { id },
        data: {
          status: 'disabled',
          disabledAt: this.clock.now(),
        },
      });
    });

    return { success: true, message: 'Employee disabled and assets successfully reassigned' };
  }

  async enableEmployee(id: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.employee.update({
      where: { id },
      data: {
        status: 'active',
        disabledAt: null,
      },
    });
  }
}
