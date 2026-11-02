import { Injectable } from '@nestjs/common';
import { PermissionKey, Scope } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { AuthenticatedUser } from './decorators/current-user.decorator';

/**
 * Secondary permission checks for handlers that branch on more than the decorated key
 * (for example a bulk endpoint that may assign, tag or delete). Same resolution order as RbacGuard:
 * employee override first, then role grant.
 */
@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  async scopeOf(user: AuthenticatedUser, key: PermissionKey): Promise<Scope | null> {
    const override = await this.prisma.employeePermissionOverride.findUnique({
      where: { employeeId_permissionKey: { employeeId: user.id, permissionKey: key } },
    });
    if (override) return override.effect === 'deny' ? null : (override.scope as Scope);
    const grant = await this.prisma.rolePermission.findUnique({
      where: { roleId_permissionKey: { roleId: user.roleId, permissionKey: key } },
    });
    return grant ? (grant.scope as Scope) : null;
  }

  async has(user: AuthenticatedUser, key: PermissionKey): Promise<boolean> {
    return (await this.scopeOf(user, key)) !== null;
  }

  async hasAll(user: AuthenticatedUser, keys: PermissionKey[]): Promise<Record<string, boolean>> {
    const entries = await Promise.all(keys.map(async (k) => [k, await this.has(user, k)] as const));
    return Object.fromEntries(entries);
  }
}
