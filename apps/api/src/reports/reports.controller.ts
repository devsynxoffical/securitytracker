import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RbacGuard, ScopeFilter } from '../auth/guards/rbac.guard.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { CurrentScope } from '../auth/decorators/current-scope.decorator.js';
import { ReportQuerySchema, ReportQueryDto } from '@company-os/contracts';

@Controller('reports')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('attendance')
  @RequirePermission('reports.view')
  async getAttendanceReport(
    @Request() req: any,
    @CurrentScope() scopeFilter: ScopeFilter,
    @Query() query: any,
    @Res() res: Response,
  ) {
    const dto: ReportQueryDto = ReportQuerySchema.parse(query);
    const result = await this.reportsService.getAttendanceReport(
      req.user.companyId,
      scopeFilter,
      dto,
    );

    if (dto.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
      return res.send(result);
    }
    return res.json(result);
  }

  @Get('productivity')
  @RequirePermission('reports.view')
  async getProductivityReport(
    @Request() req: any,
    @CurrentScope() scopeFilter: ScopeFilter,
    @Query() query: any,
    @Res() res: Response,
  ) {
    const dto: ReportQueryDto = ReportQuerySchema.parse(query);
    const result = await this.reportsService.getProductivityReport(
      req.user.companyId,
      scopeFilter,
      dto,
    );

    if (dto.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="productivity_report.csv"');
      return res.send(result);
    }
    return res.json(result);
  }

  @Get('crm')
  @RequirePermission('reports.view')
  async getCrmReport(
    @Request() req: any,
    @CurrentScope() scopeFilter: ScopeFilter,
    @Query() query: any,
    @Res() res: Response,
  ) {
    const dto: ReportQueryDto = ReportQuerySchema.parse(query);
    const result = await this.reportsService.getCrmReport(
      req.user.companyId,
      scopeFilter,
      dto,
    );

    if (dto.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="crm_report.csv"');
      return res.send(result);
    }
    return res.json(result);
  }

  @Get('calls')
  @RequirePermission('reports.view')
  async getCallsReport(
    @Request() req: any,
    @CurrentScope() scopeFilter: ScopeFilter,
    @Query() query: any,
    @Res() res: Response,
  ) {
    const dto: ReportQueryDto = ReportQuerySchema.parse(query);
    const result = await this.reportsService.getCallsReport(
      req.user.companyId,
      scopeFilter,
      dto,
    );

    if (dto.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="calls_report.csv"');
      return res.send(result);
    }
    return res.json(result);
  }
}
