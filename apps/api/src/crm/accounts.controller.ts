import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  CreateAccountSchema,
  UpdateAccountSchema,
  AccountListQuerySchema,
  AssignRecordSchema,
  BulkRecordActionSchema,
} from '@company-os/contracts';
import { AccountsService } from './accounts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';
import { CrmExportService } from './crm-export.service';

@Controller('crm/accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(
    private accounts: AccountsService,
    private permissions: PermissionsService,
    private exporter: CrmExportService,
  ) {}

  @Get()
  @RequirePermission('crm.accounts.view')
  list(@Req() req: any, @Query() query: unknown) {
    return this.accounts.list(req.scopeFilter, AccountListQuerySchema.parse(query));
  }

  /** FR-CRM-29. Declared before ':id' so 'export' is not read as an id. */
  @Get('export')
  @RequirePermission('crm.accounts.export')
  async export(@Req() req: any, @Query() query: unknown, @Res() res: Response) {
    this.exporter.send(res, 'accounts', await this.exporter.accountsCsv(req.scopeFilter, query));
  }

  @Get(':id')
  @RequirePermission('crm.accounts.view')
  get(@Param('id') id: string, @Req() req: any) {
    return this.accounts.getById(id, req.scopeFilter);
  }

  @Post()
  @RequirePermission('crm.accounts.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.accounts.create(user.companyId, user.id, CreateAccountSchema.parse(body));
  }

  @Patch(':id')
  @RequirePermission('crm.accounts.edit')
  update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.accounts.update(id, req.scopeFilter, user.id, UpdateAccountSchema.parse(body));
  }

  @Post(':id/assign')
  @RequirePermission('crm.accounts.assign')
  assign(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.accounts.assign(id, req.scopeFilter, user.id, AssignRecordSchema.parse(body).ownerId);
  }

  @Delete(':id')
  @RequirePermission('crm.accounts.delete')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.accounts.softDelete(id, req.scopeFilter);
  }

  @Post('bulk')
  @RequirePermission('crm.accounts.edit')
  async bulk(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    const dto = BulkRecordActionSchema.parse(body);
    const perms = await this.permissions.hasAll(user, ['crm.accounts.assign', 'crm.accounts.delete']);
    return this.accounts.bulk(req.scopeFilter, user.id, dto, {
      canAssign: perms['crm.accounts.assign'] ?? false,
      canDelete: perms['crm.accounts.delete'] ?? false,
    });
  }
}
