import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import {
  CreateSpaceSchema,
  UpdateSpaceSchema,
  SpaceMemberSchema,
  CreateListSchema,
  UpdateListSchema,
  CreateStatusSchema,
  UpdateStatusSchema,
  ReorderStatusesSchema,
} from '@company-os/contracts';
import { SpacesService } from './spaces.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';

/** Registered before TasksController so `/tasks/spaces` is never read as a task id. */
@Controller('tasks/spaces')
@UseGuards(JwtAuthGuard)
export class SpacesController {
  constructor(
    private spaces: SpacesService,
    private permissions: PermissionsService,
  ) {}

  @Get()
  @RequirePermission('tasks.view')
  async list(@CurrentUser() user: AuthenticatedUser, @Query('includeArchived') includeArchived?: string) {
    const canManage = await this.permissions.has(user, 'tasks.spaces.manage');
    return this.spaces.listSpaces(user.companyId, user.id, canManage, includeArchived === 'true');
  }

  @Post()
  @RequirePermission('tasks.spaces.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.spaces.createSpace(user.companyId, user.id, CreateSpaceSchema.parse(body));
  }

  @Get(':id')
  @RequirePermission('tasks.view')
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const canManage = await this.permissions.has(user, 'tasks.spaces.manage');
    return this.spaces.getSpace(user.companyId, id, user.id, canManage);
  }

  @Patch(':id')
  @RequirePermission('tasks.spaces.manage')
  update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.spaces.updateSpace(user.companyId, id, UpdateSpaceSchema.parse(body));
  }

  @Delete(':id')
  @RequirePermission('tasks.spaces.manage')
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.spaces.archiveSpace(user.companyId, id);
  }

  @Post(':id/members')
  @RequirePermission('tasks.spaces.manage')
  addMember(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.spaces.addMember(user.companyId, id, SpaceMemberSchema.parse(body));
  }

  @Delete(':id/members/:employeeId')
  @RequirePermission('tasks.spaces.manage')
  removeMember(@Param('id') id: string, @Param('employeeId') employeeId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.spaces.removeMember(user.companyId, id, employeeId);
  }
}

@Controller('tasks/lists')
@UseGuards(JwtAuthGuard)
export class ListsController {
  constructor(
    private spaces: SpacesService,
    private permissions: PermissionsService,
  ) {}

  @Get()
  @RequirePermission('tasks.view')
  async list(@CurrentUser() user: AuthenticatedUser, @Query('spaceId') spaceId?: string, @Query('includeArchived') includeArchived?: string) {
    const canManage = await this.permissions.has(user, 'tasks.spaces.manage');
    return this.spaces.listLists(user.companyId, user.id, canManage, spaceId, includeArchived === 'true');
  }

  @Post()
  @RequirePermission('tasks.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.spaces.createList(user.companyId, CreateListSchema.parse(body));
  }

  @Get(':id')
  @RequirePermission('tasks.view')
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const canManage = await this.permissions.has(user, 'tasks.spaces.manage');
    return this.spaces.getList(user.companyId, id, user.id, canManage);
  }

  @Patch(':id')
  @RequirePermission('tasks.manage')
  update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.spaces.updateList(user.companyId, id, UpdateListSchema.parse(body));
  }

  @Delete(':id')
  @RequirePermission('tasks.manage')
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.spaces.archiveList(user.companyId, id);
  }

  @Post(':id/restore')
  @RequirePermission('tasks.manage')
  restore(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.spaces.restoreList(user.companyId, id);
  }

  @Post(':id/statuses')
  @RequirePermission('tasks.manage')
  createStatus(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.spaces.createStatus(user.companyId, id, CreateStatusSchema.parse(body));
  }

  @Post(':id/statuses/reorder')
  @RequirePermission('tasks.manage')
  reorder(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.spaces.reorderStatuses(user.companyId, id, ReorderStatusesSchema.parse(body));
  }

  @Patch(':id/statuses/:statusId')
  @RequirePermission('tasks.manage')
  updateStatus(@Param('id') id: string, @Param('statusId') statusId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.spaces.updateStatus(user.companyId, id, statusId, UpdateStatusSchema.parse(body));
  }

  @Delete(':id/statuses/:statusId')
  @RequirePermission('tasks.manage')
  deleteStatus(@Param('id') id: string, @Param('statusId') statusId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.spaces.deleteStatus(user.companyId, id, statusId);
  }
}
