import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../src/auth/guards/rbac.guard';

describe('RbacGuard (Unit)', () => {
  let guard: RbacGuard;
  let reflector: Reflector;
  let prismaMock: any;

  beforeEach(() => {
    reflector = new Reflector();
    prismaMock = {
      employeePermissionOverride: {
        findUnique: vi.fn(),
      },
      rolePermission: {
        findUnique: vi.fn(),
      },
      team: {
        findMany: vi.fn(),
      },
      department: {
        findMany: vi.fn(),
      },
      employee: {
        findMany: vi.fn(),
      },
    };

    guard = new RbacGuard(reflector, prismaMock);
  });

  it('should allow access and attach scopeFilter when permission is granted by role', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('crm.leads.view');

    prismaMock.employeePermissionOverride.findUnique.mockResolvedValue(null);
    prismaMock.rolePermission.findUnique.mockResolvedValue({
      roleId: 'role-emp',
      permissionKey: 'crm.leads.view',
      scope: 'own',
    });

    const request: any = {
      user: {
        id: 'emp-1',
        companyId: 'comp-1',
        roleId: 'role-emp',
      },
    };

    const context: any = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(request.scopeFilter).toEqual({
      scope: 'own',
      companyId: 'comp-1',
      employeeId: 'emp-1',
      allowedEmployeeIds: ['emp-1'],
    });
  });

  it('should throw ForbiddenException when permission is missing from role and no override', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('crm.leads.delete');

    prismaMock.employeePermissionOverride.findUnique.mockResolvedValue(null);
    prismaMock.rolePermission.findUnique.mockResolvedValue(null);

    const request: any = {
      user: {
        id: 'emp-1',
        companyId: 'comp-1',
        roleId: 'role-emp',
      },
    };

    const context: any = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    await expect(guard.canActivate(context)).rejects.toThrow('Permission missing: crm.leads.delete');
  });
});
