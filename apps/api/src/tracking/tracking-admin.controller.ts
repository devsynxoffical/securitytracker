import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, Res, UseGuards, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import {
  TimesheetQuerySchema,
  TeamTimesheetQuerySchema,
  TeamActivityQuerySchema,
  UsageReportQuerySchema,
  UncategorisedQuerySchema,
  CategoriseSchema,
  UpdateProductivityRuleSchema,
  IdleReportQuerySchema,
  TamperQuerySchema,
  CreateManualTimeSchema,
  DecideManualTimeSchema,
  ManualTimeQuerySchema,
  UpdateTrackingSettingsSchema,
} from '@company-os/contracts';
import { TimesheetsService } from './timesheets.service';
import { TrackingReportsService } from './reports.service';
import { ManualTimeService } from './manual-time.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';

/** Admin-side tracking endpoints (16-tracking-admin-spec.md section 6). */
@Controller('tracking')
@UseGuards(JwtAuthGuard)
export class TrackingAdminController {
  constructor(
    private timesheets: TimesheetsService,
    private reports: TrackingReportsService,
    private manualTime: ManualTimeService,
    private permissions: PermissionsService,
  ) {}

  // ---- Timesheets and team activity ----

  @Get('timesheet')
  @RequirePermission('tracking.view_summary')
  async timesheet(@Req() req: any, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = TimesheetQuerySchema.parse(query);
    const data = await this.timesheets.timesheet(req.scopeFilter, q);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="timesheet-${data.employee.code}-${q.from}-${q.to}.csv"`);
      return this.timesheets.timesheetCsv(data);
    }
    return data;
  }

  @Get('timesheet/team')
  @RequirePermission('tracking.view_summary')
  async teamTimesheet(@Req() req: any, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = TeamTimesheetQuerySchema.parse(query);
    const data = await this.timesheets.teamTimesheet(req.scopeFilter, q);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="team-timesheet-${q.from}-${q.to}.csv"`);
      return this.timesheets.teamTimesheetCsv(data);
    }
    return data;
  }

  @Get('team-activity')
  @RequirePermission('tracking.view_summary')
  teamActivity(@Req() req: any, @Query() query: unknown) {
    return this.timesheets.teamActivity(req.scopeFilter, TeamActivityQuerySchema.parse(query));
  }

  @Get('timeline/detail')
  @RequirePermission('tracking.view_detail')
  timelineDetail(@Req() req: any, @Query('employeeId') employeeId?: string, @Query('date') date?: string) {
    if (!employeeId || !date) throw new BadRequestException('employeeId and date are required');
    return this.timesheets.timelineDetail(req.scopeFilter, employeeId, date);
  }

  // ---- Usage reports ----

  @Get('reports/apps')
  @RequirePermission('tracking.view_detail')
  usageApps(@Req() req: any, @Query() query: unknown) {
    return this.reports.usageApps(req.scopeFilter, UsageReportQuerySchema.parse(query));
  }

  @Get('reports/domains')
  @RequirePermission('tracking.view_detail')
  usageDomains(@Req() req: any, @Query() query: unknown) {
    return this.reports.usageDomains(req.scopeFilter, UsageReportQuerySchema.parse(query));
  }

  @Get('reports/employees')
  @RequirePermission('tracking.view_detail')
  usageEmployees(@Req() req: any, @Query() query: unknown, @Query('type') type?: string, @Query('key') key?: string) {
    if ((type !== 'app' && type !== 'domain') || !key) throw new BadRequestException('type (app|domain) and key are required');
    return this.reports.usageEmployees(req.scopeFilter, { ...UsageReportQuerySchema.parse(query), type, key });
  }

  // ---- Uncategorised queue and rules ----

  @Get('uncategorised')
  @RequirePermission('tracking.manage_rules')
  uncategorised(@Req() req: any, @Query() query: unknown) {
    return this.reports.uncategorised(req.scopeFilter, UncategorisedQuerySchema.parse(query));
  }

  @Post('uncategorised/categorise')
  @RequirePermission('tracking.manage_rules')
  categorise(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.reports.categorise(user.companyId, CategoriseSchema.parse(body));
  }

  @Patch('productivity-rules/:id')
  @RequirePermission('tracking.manage_rules')
  updateRule(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.reports.updateRule(user.companyId, id, UpdateProductivityRuleSchema.parse(body));
  }

  @Delete('exclusions/:id')
  @RequirePermission('tracking.manage_rules')
  deleteExclusion(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.deleteExclusion(user.companyId, id);
  }

  @Delete('exception-apps/:id')
  @RequirePermission('tracking.manage_rules')
  deleteExceptionApp(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.deleteExceptionApp(user.companyId, id);
  }

  // ---- Idle and tamper ----

  @Get('idle-report')
  @RequirePermission('tracking.view_detail')
  idleReport(@Req() req: any, @Query() query: unknown) {
    return this.reports.idleReport(req.scopeFilter, IdleReportQuerySchema.parse(query));
  }

  @Get('tamper-events')
  @RequirePermission('tracking.view_detail')
  tamperEvents(@Req() req: any, @Query() query: unknown) {
    return this.reports.tamperEvents(req.scopeFilter, TamperQuerySchema.parse(query));
  }

  // ---- Manual time (F27) ----

  @Get('manual-time')
  @RequirePermission('attendance.view')
  listManualTime(@Req() req: any, @Query() query: unknown) {
    return this.manualTime.list(req.scopeFilter, ManualTimeQuerySchema.parse(query));
  }

  @Post('manual-time')
  @RequirePermission('attendance.view')
  createManualTime(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.manualTime.create(req.scopeFilter, user.id, CreateManualTimeSchema.parse(body));
  }

  @Post('manual-time/:id/decide')
  @RequirePermission('tracking.timesheets.approve')
  decideManualTime(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.manualTime.decide(req.scopeFilter, user.id, id, DecideManualTimeSchema.parse(body));
  }

  @Delete('manual-time/:id')
  @RequirePermission('attendance.view')
  async deleteManualTime(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    const canApprove = await this.permissions.has(user, 'tracking.timesheets.approve');
    return this.manualTime.remove(req.scopeFilter, user.id, id, canApprove);
  }

  // ---- Settings (FR-TRK-24) ----

  @Get('settings')
  @RequirePermission('tracking.manage_rules')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.getSettings(user.companyId);
  }

  @Patch('settings')
  @RequirePermission('tracking.manage_rules')
  updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.reports.updateSettings(user.companyId, UpdateTrackingSettingsSchema.parse(body));
  }
}
