import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { UpdateRolePermissionsSchema } from '@company-os/contracts';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private rolesService: RolesService) {}

  @Get('roles')
  @RequirePermission('roles.view')
  async listRoles() {
    return this.rolesService.listRoles();
  }

  @Get('roles/:id')
  @RequirePermission('roles.view')
  async getRoleById(@Param('id') id: string) {
    return this.rolesService.getRoleById(id);
  }

  @Get('permissions')
  @RequirePermission('roles.view')
  async getPermissionCatalog() {
    return this.rolesService.getPermissionCatalog();
  }

  @Put('roles/:id/permissions')
  @RequirePermission('roles.manage')
  async updateRolePermissions(
    @Param('id') roleId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = UpdateRolePermissionsSchema.parse(body);
    return this.rolesService.updateRolePermissions(roleId, dto, user.roleName);
  }
}
