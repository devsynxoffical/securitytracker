import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionKey, Scope } from '@company-os/contracts';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PrismaService } from '../../common/prisma.service';

export interface ScopeFilter {
  scope: Scope;
  companyId: string;
  employeeId: string;
  allowedEmployeeIds: string[]; // List of employee IDs accessible under this scope
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<PermissionKey>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.companyId || !user.id || !user.roleId) {
      throw new ForbiddenException('User context is incomplete');
    }

    // 1. Check direct employee permission override
    const override = await this.prisma.employeePermissionOverride.findUnique({
      where: {
        employeeId_permissionKey: {
          employeeId: user.id,
          permissionKey: requiredPermission,
        },
      },
    });

    if (override) {
      if (override.effect === 'deny') {
        throw new ForbiddenException(`Permission denied: ${requiredPermission}`);
      }
      // Grant via override
      await this.attachScopeFilter(request, user, override.scope as Scope);
      return true;
    }

    // 2. Check Role Permission
    const rolePermission = await this.prisma.rolePermission.findUnique({
      where: {
        roleId_permissionKey: {
          roleId: user.roleId,
          permissionKey: requiredPermission,
        },
      },
    });

    if (!rolePermission) {
      throw new ForbiddenException(`Permission missing: ${requiredPermission}`);
    }

    await this.attachScopeFilter(request, user, rolePermission.scope as Scope);
    return true;
  }

  private async attachScopeFilter(
    request: any,
    user: any,
    scope: Scope,
  ): Promise<void> {
    let allowedEmployeeIds: string[] = [user.id];

    if (scope === 'team') {
      // Find all teams where user is leader
      const teams = await this.prisma.team.findMany({
        where: { leaderId: user.id, companyId: user.companyId },
        select: { id: true },
      });
      const teamIds = teams.map((t) => t.id);

      const teamMembers = await this.prisma.employee.findMany({
        where: { teamId: { in: teamIds }, companyId: user.companyId },
        select: { id: true },
      });
      allowedEmployeeIds = Array.from(
        new Set([user.id, ...teamMembers.map((m) => m.id)]),
      );
    } else if (scope === 'department') {
      // Find all departments where user is manager
      const depts = await this.prisma.department.findMany({
        where: { managerId: user.id, companyId: user.companyId },
        select: { id: true },
      });
      const deptIds = depts.map((d) => d.id);

      const deptMembers = await this.prisma.employee.findMany({
        where: { departmentId: { in: deptIds }, companyId: user.companyId },
        select: { id: true },
      });
      allowedEmployeeIds = Array.from(
        new Set([user.id, ...deptMembers.map((m) => m.id)]),
      );
    } else if (scope === 'all') {
      allowedEmployeeIds = []; // Empty signifies company-wide
    }

    request.scopeFilter = {
      scope,
      companyId: user.companyId,
      employeeId: user.id,
      allowedEmployeeIds,
    } as ScopeFilter;
  }
}
