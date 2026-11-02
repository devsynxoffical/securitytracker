import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  CreateScheduleSchema,
  UpdateScheduleSchema,
  AssignScheduleSchema,
  UpdateScheduleAssignmentSchema,
  CreateHolidaySchema,
  UpdateHolidaySchema,
  ImportHolidaysSchema,
  AttendanceSheetQuerySchema,
  RequestCorrectionSchema,
  DecideCorrectionSchema,
} from '@company-os/contracts';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

/** Schedules, holidays, attendance days, sheet, corrections (03 F8, F9; 15 FR-HR-05 to 09). Leave lives in hr/leave.controller. */
@Controller()
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  // ---- Schedules
  @Get('schedules')
  @RequirePermission('attendance.view')
  listSchedules(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.listSchedules(user.companyId);
  }
  @Post('schedules')
  @RequirePermission('attendance.manage')
  createSchedule(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.attendanceService.createSchedule(user.companyId, CreateScheduleSchema.parse(body));
  }
  @Patch('schedules/:id')
  @RequirePermission('attendance.manage')
  updateSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.attendanceService.updateSchedule(user.companyId, id, UpdateScheduleSchema.parse(body));
  }
  @Delete('schedules/:id')
  @RequirePermission('attendance.manage')
  deleteSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.attendanceService.deleteSchedule(user.companyId, id);
  }

  // ---- Employee schedule assignments (FR-HR-06)
  @Get('employees/:id/schedules')
  @RequirePermission('attendance.view')
  listAssignments(@Param('id') employeeId: string, @Req() req: any) {
    return this.attendanceService.listAssignments(req.scopeFilter, employeeId);
  }
  @Post('employees/:id/schedules')
  @RequirePermission('attendance.manage')
  assignSchedule(@Param('id') employeeId: string, @Req() req: any, @Body() body: unknown) {
    const dto = AssignScheduleSchema.parse({ ...(body as object), employeeId });
    return this.attendanceService.assignSchedule(req.scopeFilter, dto);
  }
  @Patch('employees/:id/schedules/:assignmentId')
  @RequirePermission('attendance.manage')
  updateAssignment(@Param('id') employeeId: string, @Param('assignmentId') assignmentId: string, @Req() req: any, @Body() body: unknown) {
    return this.attendanceService.updateAssignment(req.scopeFilter, employeeId, assignmentId, UpdateScheduleAssignmentSchema.parse(body));
  }
  @Delete('employees/:id/schedules/:assignmentId')
  @RequirePermission('attendance.manage')
  deleteAssignment(@Param('id') employeeId: string, @Param('assignmentId') assignmentId: string, @Req() req: any) {
    return this.attendanceService.deleteAssignment(req.scopeFilter, employeeId, assignmentId);
  }

  // ---- Holidays (FR-HR-05)
  @Get('holidays')
  @RequirePermission('attendance.view')
  listHolidays(@CurrentUser() user: AuthenticatedUser, @Query('year') year?: string) {
    return this.attendanceService.listHolidays(user.companyId, year ? parseInt(year, 10) : undefined);
  }
  @Post('holidays')
  @RequirePermission('attendance.manage')
  createHoliday(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.attendanceService.createHoliday(user.companyId, CreateHolidaySchema.parse(body));
  }
  @Post('holidays/import')
  @RequirePermission('attendance.manage')
  importHolidays(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.attendanceService.importHolidays(user.companyId, ImportHolidaysSchema.parse(body));
  }
  @Patch('holidays/:id')
  @RequirePermission('attendance.manage')
  updateHoliday(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.attendanceService.updateHoliday(user.companyId, id, UpdateHolidaySchema.parse(body));
  }
  @Delete('holidays/:id')
  @RequirePermission('attendance.manage')
  deleteHoliday(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.attendanceService.deleteHoliday(user.companyId, id);
  }

  // ---- Attendance
  @Get('attendance/days')
  @RequirePermission('attendance.view')
  getAttendanceDays(@Req() req: any, @Query('employeeId') employeeId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.attendanceService.getAttendanceDays(req.scopeFilter, { employeeId, from, to });
  }
  @Get('attendance/live')
  @RequirePermission('attendance.view')
  getLiveAttendance(@Req() req: any) {
    return this.attendanceService.getLiveAttendance(req.scopeFilter);
  }
  @Get('attendance/sheet')
  @RequirePermission('attendance.view')
  async sheet(@Req() req: any, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = AttendanceSheetQuerySchema.parse(query);
    const sheet = await this.attendanceService.sheet(req.scopeFilter, q);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="attendance-${q.month}.csv"`);
      return this.attendanceService.sheetCsv(sheet);
    }
    return sheet;
  }

  // ---- Corrections (F9)
  @Get('attendance/corrections')
  @RequirePermission('attendance.view')
  listCorrections(@Req() req: any, @Query('status') status?: string) {
    return this.attendanceService.listCorrections(req.scopeFilter, status);
  }
  @Post('attendance/corrections')
  @RequirePermission('attendance.view')
  requestCorrection(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.attendanceService.requestCorrection(user.id, RequestCorrectionSchema.parse(body));
  }
  @Post('attendance/corrections/:id/decide')
  @RequirePermission('attendance.approve')
  decideCorrection(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    return this.attendanceService.decideCorrection(id, user.id, DecideCorrectionSchema.parse(body), req.scopeFilter);
  }
}
