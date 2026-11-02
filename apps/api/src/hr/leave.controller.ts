import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import {
  CreateLeaveTypeSchema,
  UpdateLeaveTypeSchema,
  AdjustLeaveBalanceSchema,
  LeaveBalanceQuerySchema,
  CreateLeaveRequestSchema,
  LeaveRequestQuerySchema,
  LeaveCalendarQuerySchema,
  DecideLeaveSchema,
  RequestLeaveSchema,
} from '@company-os/contracts';
import { LeaveService } from './leave.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';
import { PrismaService } from '../common/prisma.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class LeaveController {
  constructor(
    private leave: LeaveService,
    private permissions: PermissionsService,
    private prisma: PrismaService,
  ) {}

  // ---- Types
  @Get('hr/leave-types')
  @RequirePermission('attendance.view')
  listTypes(@CurrentUser() user: AuthenticatedUser, @Query('includeInactive') inactive?: string) {
    return this.leave.listTypes(user.companyId, inactive === 'true');
  }
  @Post('hr/leave-types')
  @RequirePermission('hr.leave.manage')
  createType(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.leave.createType(user.companyId, CreateLeaveTypeSchema.parse(body));
  }
  @Patch('hr/leave-types/:id')
  @RequirePermission('hr.leave.manage')
  updateType(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.leave.updateType(user.companyId, id, UpdateLeaveTypeSchema.parse(body));
  }
  @Delete('hr/leave-types/:id')
  @RequirePermission('hr.leave.manage')
  deleteType(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leave.deleteType(user.companyId, id);
  }

  // ---- Balances
  @Get('hr/leave-balances')
  @RequirePermission('attendance.view')
  balances(@Req() req: any, @Query() query: unknown) {
    const q = LeaveBalanceQuerySchema.parse(query);
    return this.leave.listBalances(req.scopeFilter, q.employeeId, q.year);
  }
  @Post('hr/leave-balances/adjust')
  @RequirePermission('hr.leave.manage')
  adjust(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.leave.adjust(user.companyId, user.id, AdjustLeaveBalanceSchema.parse(body));
  }

  // ---- Requests
  @Get('leave-requests')
  @RequirePermission('attendance.view')
  list(@Req() req: any, @Query() query: unknown) {
    return this.leave.list(req.scopeFilter, LeaveRequestQuerySchema.parse(query));
  }

  /** Accepts the 15 DTO or the legacy desktop body `{type, dateFrom, dateTo, reason}`. */
  @Post('leave-requests')
  @RequirePermission('attendance.view')
  async create(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    const modern = CreateLeaveRequestSchema.safeParse(body);
    if (modern.success) return this.leave.create(req.scopeFilter, user.id, modern.data);
    const legacy = RequestLeaveSchema.safeParse(body);
    if (!legacy.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Input validation failed', issues: modern.error.issues });
    const type = await this.prisma.leaveType.findFirst({ where: { companyId: user.companyId, code: legacy.data.type.toUpperCase() } });
    if (!type) throw new BadRequestException(`No leave type with code ${legacy.data.type.toUpperCase()}`);
    return this.leave.create(req.scopeFilter, user.id, { leaveTypeId: type.id, dateFrom: legacy.data.dateFrom, dateTo: legacy.data.dateTo, halfDay: false, reason: legacy.data.reason });
  }

  @Post('leave-requests/:id/decide')
  @RequirePermission('attendance.approve')
  decide(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.leave.decide(req.scopeFilter, user.id, id, DecideLeaveSchema.parse(body));
  }

  @Post('leave-requests/:id/cancel')
  @RequirePermission('attendance.view')
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    const comment = typeof (body as { comment?: unknown })?.comment === 'string' ? (body as { comment: string }).comment : undefined;
    const canApprove = await this.permissions.has(user, 'attendance.approve');
    return this.leave.cancel(req.scopeFilter, user.id, id, comment, canApprove);
  }

  // ---- Calendar
  @Get('hr/leave-calendar')
  @RequirePermission('attendance.view')
  calendar(@Req() req: any, @Query() query: unknown) {
    return this.leave.calendar(req.scopeFilter, LeaveCalendarQuerySchema.parse(query));
  }
  @Get('hr/out-today')
  @RequirePermission('attendance.view')
  outToday(@Req() req: any) {
    return this.leave.outToday(req.scopeFilter);
  }
}
