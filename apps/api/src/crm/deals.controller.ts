import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, Res, UseGuards, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import {
  CreateDealSchema,
  UpdateDealSchema,
  UpdateDealStageSchema,
  DealListQuerySchema,
  AssignRecordSchema,
  BulkRecordActionSchema,
} from '@company-os/contracts';
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ExportGuarded } from '../auth/decorators/export-guarded.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';
import { CrmExportService } from './crm-export.service';

@Controller('crm/deals')
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(
    private deals: DealsService,
    private permissions: PermissionsService,
    private exporter: CrmExportService,
  ) {}

  @Get()
  @RequirePermission('crm.deals.view')
  list(@Req() req: any, @Query() query: unknown) {
    return this.deals.list(req.scopeFilter, DealListQuerySchema.parse(query));
  }

  @Get('board')
  @RequirePermission('crm.deals.view')
  board(@Req() req: any, @Query('pipelineId') pipelineId?: string, @Query('ownerId') ownerId?: string) {
    if (!pipelineId) throw new BadRequestException('pipelineId is required');
    return this.deals.board(req.scopeFilter, pipelineId, ownerId);
  }

  /** FR-CRM-29. Declared before ':id' so 'export' is not read as an id. */
  @Get('export')
  @RequirePermission('crm.deals.export')
  @ExportGuarded()
  async export(@Req() req: any, @Query() query: unknown, @Res() res: Response) {
    this.exporter.send(res, 'deals', await this.exporter.dealsCsv(req.scopeFilter, query));
  }

  @Get(':id')
  @RequirePermission('crm.deals.view')
  get(@Param('id') id: string, @Req() req: any) {
    return this.deals.getById(id, req.scopeFilter);
  }

  @Post()
  @RequirePermission('crm.deals.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.deals.create(user.companyId, user.id, CreateDealSchema.parse(body));
  }

  @Patch(':id')
  @RequirePermission('crm.deals.edit')
  update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.deals.update(id, req.scopeFilter, user.id, UpdateDealSchema.parse(body));
  }

  @Post(':id/stage')
  @RequirePermission('crm.deals.edit')
  async stage(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    const canReopen = await this.permissions.has(user, 'crm.deals.reopen');
    return this.deals.updateStage(id, req.scopeFilter, user.id, UpdateDealStageSchema.parse(body), canReopen);
  }

  @Post(':id/assign')
  @RequirePermission('crm.deals.assign')
  assign(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.deals.assign(id, req.scopeFilter, user.id, AssignRecordSchema.parse(body).ownerId);
  }

  @Delete(':id')
  @RequirePermission('crm.deals.delete')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.deals.softDelete(id, req.scopeFilter);
  }

  @Post('bulk')
  @RequirePermission('crm.deals.edit')
  async bulk(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    const dto = BulkRecordActionSchema.parse(body);
    const perms = await this.permissions.hasAll(user, ['crm.deals.assign', 'crm.deals.delete', 'crm.deals.reopen']);
    return this.deals.bulk(req.scopeFilter, user.id, dto, {
      canAssign: perms['crm.deals.assign'] ?? false,
      canDelete: perms['crm.deals.delete'] ?? false,
      canReopen: perms['crm.deals.reopen'] ?? false,
    });
  }
}
