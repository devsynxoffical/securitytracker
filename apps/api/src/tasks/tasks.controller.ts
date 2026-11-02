import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import {
  CreateWorkTaskSchema,
  UpdateWorkTaskSchema,
  SetTaskStatusSchema,
  TaskListQuerySchema,
  MyTasksQuerySchema,
  BulkTaskActionSchema,
  AddAssigneesSchema,
  CreateCommentSchema,
  UpdateCommentSchema,
  CreateChecklistSchema,
  CreateChecklistItemSchema,
  UpdateChecklistItemSchema,
  CreateTimeEntrySchema,
  CreateTaskSchema,
} from '@company-os/contracts';
import { TasksService, TaskPerms } from './tasks.service';
import { TaskDetailsService } from './task-details.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(
    private tasks: TasksService,
    private details: TaskDetailsService,
    private permissions: PermissionsService,
  ) {}

  private async perms(user: AuthenticatedUser): Promise<TaskPerms> {
    const p = await this.permissions.hasAll(user, ['tasks.manage', 'tasks.spaces.manage', 'tasks.assign']);
    return { canManage: p['tasks.manage'] ?? false, canManageSpaces: p['tasks.spaces.manage'] ?? false, canAssign: p['tasks.assign'] ?? false };
  }

  // ---- static routes first --------------------------------------------------

  @Get()
  @RequirePermission('tasks.view')
  async list(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Query() query: Record<string, string | undefined>) {
    const q = TaskListQuerySchema.parse(query);
    // legacy desktop filters
    const legacy = { leadId: query.leadId, status: query.status, dueToday: query.dueToday === 'true' };
    return this.tasks.list(req.scopeFilter, await this.perms(user), { ...q, ...legacy });
  }

  @Get('my')
  @RequirePermission('tasks.view')
  my(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Query() query: unknown) {
    return this.tasks.my(req.scopeFilter, user.id, MyTasksQuerySchema.parse(query));
  }

  @Get('workload')
  @RequirePermission('tasks.view')
  async workload(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Query('spaceId') spaceId?: string) {
    return this.tasks.workload(req.scopeFilter, await this.perms(user), spaceId);
  }

  @Get('board')
  @RequirePermission('tasks.view')
  async board(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Query('listId') listId?: string) {
    if (!listId) throw new BadRequestException('listId is required');
    return this.tasks.board(req.scopeFilter, await this.perms(user), listId);
  }

  @Post('bulk')
  @RequirePermission('tasks.manage')
  async bulk(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.tasks.bulk(req.scopeFilter, user.id, await this.perms(user), BulkTaskActionSchema.parse(body));
  }

  /** New body (listId) or legacy CRM/desktop body (assigneeId + dueAt). */
  @Post()
  @RequirePermission('tasks.create')
  async create(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    const perms = await this.perms(user);
    if (body && typeof body === 'object' && 'listId' in (body as object)) {
      return this.tasks.create(req.scopeFilter, user.id, perms, CreateWorkTaskSchema.parse(body));
    }
    return this.tasks.createLegacy(req.scopeFilter, user.id, perms, CreateTaskSchema.parse(body));
  }

  // ---- :id routes -----------------------------------------------------------

  @Get(':id')
  @RequirePermission('tasks.view')
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    return this.tasks.getById(req.scopeFilter, await this.perms(user), id);
  }

  @Patch(':id')
  @RequirePermission('tasks.view')
  async update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.tasks.update(req.scopeFilter, user.id, await this.perms(user), id, UpdateWorkTaskSchema.parse(body));
  }

  /** Both `POST /tasks/:id/status` (new) and `PATCH /tasks/:id/status` (legacy desktop) land here. */
  @Post(':id/status')
  @RequirePermission('tasks.view')
  async setStatus(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.tasks.setStatus(req.scopeFilter, user.id, await this.perms(user), id, SetTaskStatusSchema.parse(body));
  }

  @Patch(':id/status')
  @RequirePermission('tasks.view')
  async setStatusLegacy(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.tasks.setStatus(req.scopeFilter, user.id, await this.perms(user), id, SetTaskStatusSchema.parse(body));
  }

  @Post(':id/assignees')
  @RequirePermission('tasks.view')
  async addAssignees(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.tasks.addAssignees(req.scopeFilter, user.id, await this.perms(user), id, AddAssigneesSchema.parse(body).employeeIds);
  }

  @Delete(':id/assignees/:employeeId')
  @RequirePermission('tasks.view')
  async removeAssignee(@Param('id') id: string, @Param('employeeId') employeeId: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    return this.tasks.removeAssignee(req.scopeFilter, user.id, await this.perms(user), id, employeeId);
  }

  @Post(':id/archive')
  @RequirePermission('tasks.manage')
  async archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    return this.tasks.archive(req.scopeFilter, user.id, await this.perms(user), id, false);
  }

  @Post(':id/restore')
  @RequirePermission('tasks.manage')
  async restore(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    return this.tasks.archive(req.scopeFilter, user.id, await this.perms(user), id, true);
  }

  // ---- comments -------------------------------------------------------------

  @Get(':id/comments')
  @RequirePermission('tasks.view')
  async comments(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    return this.details.listComments(req.scopeFilter, await this.perms(user), id);
  }

  @Post(':id/comments')
  @RequirePermission('tasks.view')
  async addComment(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.details.addComment(req.scopeFilter, await this.perms(user), user.id, id, CreateCommentSchema.parse(body));
  }

  @Patch(':id/comments/:commentId')
  @RequirePermission('tasks.view')
  async updateComment(@Param('id') id: string, @Param('commentId') commentId: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.details.updateComment(req.scopeFilter, await this.perms(user), user.id, id, commentId, UpdateCommentSchema.parse(body));
  }

  @Delete(':id/comments/:commentId')
  @RequirePermission('tasks.view')
  async deleteComment(@Param('id') id: string, @Param('commentId') commentId: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    return this.details.deleteComment(req.scopeFilter, await this.perms(user), user.id, id, commentId);
  }

  // ---- checklists -----------------------------------------------------------

  @Post(':id/checklists')
  @RequirePermission('tasks.view')
  async addChecklist(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.details.addChecklist(req.scopeFilter, await this.perms(user), user.id, id, CreateChecklistSchema.parse(body));
  }

  @Delete(':id/checklists/:cid')
  @RequirePermission('tasks.view')
  async deleteChecklist(@Param('id') id: string, @Param('cid') cid: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    return this.details.deleteChecklist(req.scopeFilter, await this.perms(user), user.id, id, cid);
  }

  @Post(':id/checklists/:cid/items')
  @RequirePermission('tasks.view')
  async addItem(@Param('id') id: string, @Param('cid') cid: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.details.addChecklistItem(req.scopeFilter, await this.perms(user), user.id, id, cid, CreateChecklistItemSchema.parse(body));
  }

  @Patch(':id/checklists/:cid/items/:iid')
  @RequirePermission('tasks.view')
  async updateItem(@Param('id') id: string, @Param('cid') cid: string, @Param('iid') iid: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.details.updateChecklistItem(req.scopeFilter, await this.perms(user), user.id, id, cid, iid, UpdateChecklistItemSchema.parse(body));
  }

  @Delete(':id/checklists/:cid/items/:iid')
  @RequirePermission('tasks.view')
  async deleteItem(@Param('id') id: string, @Param('cid') cid: string, @Param('iid') iid: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    return this.details.deleteChecklistItem(req.scopeFilter, await this.perms(user), user.id, id, cid, iid);
  }

  // ---- time entries & activities -------------------------------------------

  @Get(':id/time-entries')
  @RequirePermission('tasks.view')
  async timeEntries(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    return this.details.listTimeEntries(req.scopeFilter, await this.perms(user), id);
  }

  @Post(':id/time-entries')
  @RequirePermission('tasks.view')
  async addTime(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.details.addTimeEntry(req.scopeFilter, await this.perms(user), user.id, id, CreateTimeEntrySchema.parse(body));
  }

  @Delete(':id/time-entries/:entryId')
  @RequirePermission('tasks.view')
  async deleteTime(@Param('id') id: string, @Param('entryId') entryId: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    return this.details.deleteTimeEntry(req.scopeFilter, await this.perms(user), user.id, id, entryId);
  }

  @Get(':id/activities')
  @RequirePermission('tasks.view')
  async activities(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.details.listActivities(req.scopeFilter, await this.perms(user), id, cursor, limit ? Math.min(Number(limit), 200) : 50);
  }
}
