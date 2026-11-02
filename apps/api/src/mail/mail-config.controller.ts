import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import {
  CreateMailLabelSchema,
  UpdateMailLabelSchema,
  CreateMailTemplateSchema,
  UpdateMailTemplateSchema,
  RenderTemplateSchema,
} from '@company-os/contracts';
import { MailConfigService } from './mail-config.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';

@Controller('mail')
@UseGuards(JwtAuthGuard)
export class MailConfigController {
  constructor(
    private config: MailConfigService,
    private permissions: PermissionsService,
  ) {}

  // ---- Labels (FR-MAIL-15)
  @Get('labels')
  @RequirePermission('mail.use')
  listLabels(@CurrentUser() user: AuthenticatedUser) {
    return this.config.listLabels(user.companyId);
  }
  @Post('labels')
  @RequirePermission('mail.templates.manage')
  createLabel(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.config.createLabel(user.companyId, CreateMailLabelSchema.parse(body));
  }
  @Patch('labels/:id')
  @RequirePermission('mail.templates.manage')
  updateLabel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.config.updateLabel(user.companyId, id, UpdateMailLabelSchema.parse(body));
  }
  @Delete('labels/:id')
  @RequirePermission('mail.templates.manage')
  deleteLabel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.config.deleteLabel(user.companyId, id);
  }

  // ---- Templates (FR-MAIL-16)
  @Get('templates')
  @RequirePermission('mail.use')
  listTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.config.listTemplates(user.companyId, user.id);
  }
  @Post('templates')
  @RequirePermission('mail.use')
  async createTemplate(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const canShared = await this.permissions.has(user, 'mail.templates.manage');
    return this.config.createTemplate(user.companyId, user.id, CreateMailTemplateSchema.parse(body), canShared);
  }
  @Patch('templates/:id')
  @RequirePermission('mail.use')
  async updateTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const canShared = await this.permissions.has(user, 'mail.templates.manage');
    return this.config.updateTemplate(user.companyId, user.id, id, UpdateMailTemplateSchema.parse(body), canShared);
  }
  @Delete('templates/:id')
  @RequirePermission('mail.use')
  async deleteTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const canShared = await this.permissions.has(user, 'mail.templates.manage');
    return this.config.deleteTemplate(user.companyId, user.id, id, canShared);
  }
  @Post('templates/:id/render')
  @RequirePermission('mail.use')
  render(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.config.renderTemplate(user.companyId, user.id, id, RenderTemplateSchema.parse(body ?? {}));
  }

  // ---- Health (FR-MAIL-20)
  @Get('mailboxes/health')
  @RequirePermission('mail.accounts.manage')
  health(@CurrentUser() user: AuthenticatedUser) {
    return this.config.mailboxHealth(user.companyId);
  }
}
