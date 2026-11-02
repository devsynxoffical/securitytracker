import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  CreateContactSchema,
  UpdateContactSchema,
  ContactListQuerySchema,
  CheckDuplicateContactSchema,
  AssignRecordSchema,
  BulkRecordActionSchema,
} from '@company-os/contracts';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ExportGuarded } from '../auth/decorators/export-guarded.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';
import { CrmExportService } from './crm-export.service';

@Controller('crm/contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(
    private contacts: ContactsService,
    private permissions: PermissionsService,
    private exporter: CrmExportService,
  ) {}

  @Get()
  @RequirePermission('crm.contacts.view')
  list(@Req() req: any, @Query() query: unknown) {
    return this.contacts.list(req.scopeFilter, ContactListQuerySchema.parse(query));
  }

  @Post('check-duplicate')
  @RequirePermission('crm.contacts.create')
  checkDuplicate(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const dto = CheckDuplicateContactSchema.parse(body);
    return this.contacts.checkDuplicate(user.companyId, dto.phones, dto.emails);
  }

  /** FR-CRM-29. Declared before ':id' so 'export' is not read as an id. */
  @Get('export')
  @RequirePermission('crm.contacts.export')
  @ExportGuarded()
  async export(@Req() req: any, @Query() query: unknown, @Res() res: Response) {
    this.exporter.send(res, 'contacts', await this.exporter.contactsCsv(req.scopeFilter, query));
  }

  @Get(':id')
  @RequirePermission('crm.contacts.view')
  get(@Param('id') id: string, @Req() req: any) {
    return this.contacts.getById(id, req.scopeFilter);
  }

  @Post()
  @RequirePermission('crm.contacts.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.contacts.create(user.companyId, user.id, CreateContactSchema.parse(body));
  }

  @Patch(':id')
  @RequirePermission('crm.contacts.edit')
  update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.contacts.update(id, req.scopeFilter, user.id, UpdateContactSchema.parse(body));
  }

  @Post(':id/assign')
  @RequirePermission('crm.contacts.assign')
  assign(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.contacts.assign(id, req.scopeFilter, user.id, AssignRecordSchema.parse(body).ownerId);
  }

  @Delete(':id')
  @RequirePermission('crm.contacts.delete')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.contacts.softDelete(id, req.scopeFilter);
  }

  @Post('bulk')
  @RequirePermission('crm.contacts.edit')
  async bulk(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    const dto = BulkRecordActionSchema.parse(body);
    const perms = await this.permissions.hasAll(user, ['crm.contacts.assign', 'crm.contacts.delete']);
    return this.contacts.bulk(req.scopeFilter, user.id, dto, {
      canAssign: perms['crm.contacts.assign'] ?? false,
      canDelete: perms['crm.contacts.delete'] ?? false,
    });
  }
}
