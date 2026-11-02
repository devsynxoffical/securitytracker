import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import {
  UpdateProfileSchema,
  CreateHrDocumentSchema,
  UpdateHrDocumentSchema,
  CreateChecklistTemplateSchema,
  UpdateChecklistTemplateSchema,
  StartChecklistSchema,
  UpdateChecklistItemStateSchema,
  CreateAnnouncementSchema,
  UpdateAnnouncementSchema,
} from '@company-os/contracts';
import { ProfilesService } from './profiles.service';
import { ChecklistsService } from './checklists.service';
import { AnnouncementsService } from './announcements.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';
import { PrismaService } from '../common/prisma.service';

@Controller('hr')
@UseGuards(JwtAuthGuard)
export class HrController {
  constructor(
    private profiles: ProfilesService,
    private checklists: ChecklistsService,
    private announcements: AnnouncementsService,
    private permissions: PermissionsService,
    private prisma: PrismaService,
  ) {}

  // ---- Profiles and documents (FR-HR-10, 11)
  @Get('profiles/expiring-documents')
  @RequirePermission('hr.profiles.view')
  expiring(@Req() req: any) {
    return this.profiles.expiring(req.scopeFilter);
  }
  @Get('profiles/:employeeId')
  @RequirePermission('hr.profiles.view')
  getProfile(@Param('employeeId') employeeId: string, @Req() req: any) {
    return this.profiles.get(req.scopeFilter, employeeId);
  }
  @Patch('profiles/:employeeId')
  @RequirePermission('hr.profiles.edit')
  updateProfile(@Param('employeeId') employeeId: string, @Req() req: any, @Body() body: unknown) {
    return this.profiles.update(req.scopeFilter, employeeId, UpdateProfileSchema.parse(body));
  }
  @Get('profiles/:employeeId/documents')
  @RequirePermission('hr.profiles.view')
  listDocuments(@Param('employeeId') employeeId: string, @Req() req: any) {
    return this.profiles.listDocuments(req.scopeFilter, employeeId);
  }
  @Post('profiles/:employeeId/documents')
  @RequirePermission('hr.profiles.edit')
  createDocument(@Param('employeeId') employeeId: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.profiles.createDocument(req.scopeFilter, user.id, employeeId, CreateHrDocumentSchema.parse(body));
  }
  @Patch('profiles/:employeeId/documents/:id')
  @RequirePermission('hr.profiles.edit')
  updateDocument(@Param('employeeId') employeeId: string, @Param('id') id: string, @Req() req: any, @Body() body: unknown) {
    return this.profiles.updateDocument(req.scopeFilter, employeeId, id, UpdateHrDocumentSchema.parse(body));
  }
  @Delete('profiles/:employeeId/documents/:id')
  @RequirePermission('hr.profiles.edit')
  deleteDocument(@Param('employeeId') employeeId: string, @Param('id') id: string, @Req() req: any) {
    return this.profiles.deleteDocument(req.scopeFilter, employeeId, id);
  }

  // ---- Org chart (FR-HR-14)
  @Get('org-chart')
  @RequirePermission('employees.view')
  orgChart(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.orgChart(user.companyId);
  }

  // ---- Checklists (FR-HR-12)
  @Get('checklist-templates')
  @RequirePermission('hr.checklists.manage')
  listTemplates(@CurrentUser() user: AuthenticatedUser, @Query('kind') kind?: string) {
    return this.checklists.listTemplates(user.companyId, kind);
  }
  @Post('checklist-templates')
  @RequirePermission('hr.checklists.manage')
  createTemplate(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.checklists.createTemplate(user.companyId, CreateChecklistTemplateSchema.parse(body));
  }
  @Patch('checklist-templates/:id')
  @RequirePermission('hr.checklists.manage')
  updateTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.checklists.updateTemplate(user.companyId, id, UpdateChecklistTemplateSchema.parse(body));
  }
  @Delete('checklist-templates/:id')
  @RequirePermission('hr.checklists.manage')
  deleteTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.checklists.deleteTemplate(user.companyId, id);
  }

  @Get('checklists/my-items')
  @RequirePermission('attendance.view')
  async myItems(@CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    const canManage = await this.permissions.has(user, 'hr.checklists.manage');
    return this.checklists.myItems(req.scopeFilter, { id: user.id, roleName: user.roleName }, canManage);
  }
  @Get('checklists')
  @RequirePermission('hr.checklists.manage')
  listChecklists(@Req() req: any, @Query('employeeId') employeeId?: string, @Query('kind') kind?: string, @Query('status') status?: string) {
    return this.checklists.list(req.scopeFilter, employeeId, kind, status);
  }
  @Post('checklists')
  @RequirePermission('hr.checklists.manage')
  startChecklist(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.checklists.start(req.scopeFilter, user.id, StartChecklistSchema.parse(body));
  }
  @Patch('checklists/:id/items/:itemId')
  @RequirePermission('attendance.view')
  async setItem(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    const dto = UpdateChecklistItemStateSchema.parse(body);
    const canManage = await this.permissions.has(user, 'hr.checklists.manage');
    return this.checklists.setItem(req.scopeFilter, { id: user.id, roleName: user.roleName }, canManage, id, itemId, dto.done);
  }

  // ---- Announcements (FR-HR-13)
  @Get('announcements')
  @RequirePermission('attendance.view')
  async listAnnouncements(@CurrentUser() user: AuthenticatedUser) {
    const [canSend, me] = await Promise.all([
      this.permissions.has(user, 'announcements.send'),
      this.prisma.employee.findUnique({ where: { id: user.id }, select: { departmentId: true, teamId: true, roleId: true } }),
    ]);
    return this.announcements.list(user.companyId, { id: user.id, departmentId: me?.departmentId ?? null, teamId: me?.teamId ?? null, roleId: user.roleId }, canSend);
  }
  @Post('announcements')
  @RequirePermission('announcements.send')
  createAnnouncement(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.announcements.create(user.companyId, user.id, CreateAnnouncementSchema.parse(body));
  }
  @Patch('announcements/:id')
  @RequirePermission('announcements.send')
  updateAnnouncement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.announcements.update(user.companyId, id, UpdateAnnouncementSchema.parse(body));
  }
  @Delete('announcements/:id')
  @RequirePermission('announcements.send')
  deleteAnnouncement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.announcements.delete(user.companyId, id);
  }
  @Post('announcements/:id/read')
  @RequirePermission('attendance.view')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.announcements.markRead(user.companyId, id, user.id);
  }
  @Get('announcements/:id/readers')
  @RequirePermission('announcements.send')
  readers(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.announcements.readers(user.companyId, id);
  }
}
