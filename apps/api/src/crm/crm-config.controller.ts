import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import {
  CreateLookupSchema,
  UpdateLookupSchema,
  CreateTagSchema,
  UpdateTagSchema,
  CreateCustomFieldSchema,
  UpdateCustomFieldSchema,
  CreateSavedViewSchema,
  UpdateSavedViewSchema,
  CrmEntityTypeSchema,
} from '@company-os/contracts';
import { CrmConfigService } from './crm-config.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';

/** Reads need any CRM view permission (crm.leads.view is the broadest); writes need crm.config.manage. */
@Controller('crm')
@UseGuards(JwtAuthGuard)
export class CrmConfigController {
  constructor(
    private config: CrmConfigService,
    private permissions: PermissionsService,
  ) {}

  // ---- Sources ----
  @Get('config/sources')
  @RequirePermission('crm.leads.view')
  listSources(@CurrentUser() user: AuthenticatedUser, @Query('includeInactive') inactive?: string) {
    return this.config.listSources(user.companyId, inactive === 'true');
  }
  @Post('config/sources')
  @RequirePermission('crm.config.manage')
  createSource(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.config.createSource(user.companyId, CreateLookupSchema.parse(body));
  }
  @Patch('config/sources/:id')
  @RequirePermission('crm.config.manage')
  updateSource(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.config.updateSource(user.companyId, id, UpdateLookupSchema.parse(body));
  }
  @Delete('config/sources/:id')
  @RequirePermission('crm.config.manage')
  deleteSource(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.config.deleteSource(user.companyId, id);
  }

  // ---- Lost reasons ----
  @Get('config/lost-reasons')
  @RequirePermission('crm.leads.view')
  listLostReasons(@CurrentUser() user: AuthenticatedUser, @Query('includeInactive') inactive?: string) {
    return this.config.listLostReasons(user.companyId, inactive === 'true');
  }
  @Post('config/lost-reasons')
  @RequirePermission('crm.config.manage')
  createLostReason(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.config.createLostReason(user.companyId, CreateLookupSchema.parse(body));
  }
  @Patch('config/lost-reasons/:id')
  @RequirePermission('crm.config.manage')
  updateLostReason(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.config.updateLostReason(user.companyId, id, UpdateLookupSchema.parse(body));
  }
  @Delete('config/lost-reasons/:id')
  @RequirePermission('crm.config.manage')
  deleteLostReason(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.config.deleteLostReason(user.companyId, id);
  }

  // ---- Tags ----
  @Get('config/tags')
  @RequirePermission('crm.leads.view')
  listTags(@CurrentUser() user: AuthenticatedUser) {
    return this.config.listTags(user.companyId);
  }
  @Post('config/tags')
  @RequirePermission('crm.config.manage')
  createTag(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.config.createTag(user.companyId, CreateTagSchema.parse(body));
  }
  @Patch('config/tags/:id')
  @RequirePermission('crm.config.manage')
  updateTag(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.config.updateTag(user.companyId, id, UpdateTagSchema.parse(body));
  }
  @Delete('config/tags/:id')
  @RequirePermission('crm.config.manage')
  deleteTag(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.config.deleteTag(user.companyId, id);
  }

  // ---- Custom fields ----
  @Get('config/custom-fields')
  @RequirePermission('crm.leads.view')
  listCustomFields(@CurrentUser() user: AuthenticatedUser, @Query('entityType') entityType?: string, @Query('includeInactive') inactive?: string) {
    const et = entityType ? CrmEntityTypeSchema.parse(entityType) : undefined;
    return this.config.listCustomFields(user.companyId, et, inactive === 'true');
  }
  @Post('config/custom-fields')
  @RequirePermission('crm.config.manage')
  createCustomField(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.config.createCustomField(user.companyId, CreateCustomFieldSchema.parse(body));
  }
  @Patch('config/custom-fields/:id')
  @RequirePermission('crm.config.manage')
  updateCustomField(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.config.updateCustomField(user.companyId, id, UpdateCustomFieldSchema.parse(body));
  }
  @Delete('config/custom-fields/:id')
  @RequirePermission('crm.config.manage')
  deleteCustomField(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.config.deleteCustomField(user.companyId, id);
  }

  // ---- Saved views ----
  @Get('views')
  @RequirePermission('crm.leads.view')
  listViews(@Req() req: any, @Query('entityType') entityType?: string) {
    const et = entityType ? CrmEntityTypeSchema.parse(entityType) : undefined;
    return this.config.listViews(req.scopeFilter, et);
  }
  @Post('views')
  @RequirePermission('crm.leads.view')
  async createView(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const canManage = await this.permissions.has(user, 'crm.config.manage');
    return this.config.createView(user.companyId, user.id, CreateSavedViewSchema.parse(body), canManage);
  }
  @Patch('views/:id')
  @RequirePermission('crm.leads.view')
  async updateView(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const canManage = await this.permissions.has(user, 'crm.config.manage');
    return this.config.updateView(user.companyId, user.id, id, UpdateSavedViewSchema.parse(body), canManage);
  }
  @Delete('views/:id')
  @RequirePermission('crm.leads.view')
  async deleteView(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const canManage = await this.permissions.has(user, 'crm.config.manage');
    return this.config.deleteView(user.companyId, user.id, id, canManage);
  }
}
