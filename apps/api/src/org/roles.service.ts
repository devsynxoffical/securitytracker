import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  PermissionKeys,
  Scopes,
  UpdateRolePermissionsDto,
} from '@company-os/contracts';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async listRoles() {
    return this.prisma.role.findMany({
      include: {
        permissions: true,
        _count: { select: { employees: true } },
      },
      orderBy: { rank: 'desc' },
    });
  }

  async getRoleById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  getPermissionCatalog() {
    return {
      permissions: PermissionKeys,
      scopes: Scopes,
    };
  }

  async updateRolePermissions(
    roleId: string,
    dto: UpdateRolePermissionsDto,
    actorRoleName: string,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    if (role.name === 'Super Admin') {
      throw new ForbiddenException('Super Admin permissions are fixed and cannot be modified.');
    }

    // Atomic update of role permissions
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: dto.permissions.map((p) => ({
          roleId,
          permissionKey: p.key,
          scope: p.scope,
        })),
      });
    });

    return this.getRoleById(roleId);
  }
}
