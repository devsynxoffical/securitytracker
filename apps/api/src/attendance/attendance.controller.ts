import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateScheduleSchema,
  CreateHolidaySchema,
  RequestCorrectionSchema,
  DecideCorrectionSchema,
  RequestLeaveSchema,
  DecideLeaveSchema,
} from '@company-os/contracts';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Get('schedules')
  @RequirePermission('attendance.manage')
  async listSchedules(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.listSchedules(user.companyId);
  }

  @Post('schedules')
  @RequirePermission('attendance.manage')
  async createSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CreateScheduleSchema.parse(body);
    return this.attendanceService.createSchedule(user.companyId, dto);
  }

  @Get('holidays')
  @RequirePermission('attendance.view')
  async listHolidays(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.listHolidays(user.companyId);
  }

  @Post('holidays')
  @RequirePermission('attendance.manage')
  async createHoliday(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CreateHolidaySchema.parse(body);
    return this.attendanceService.createHoliday(user.companyId, dto);
  }

  @Get('attendance/days')
  @RequirePermission('attendance.view')
  async getAttendanceDays(
    @Req() req: any,
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendanceService.getAttendanceDays(req.scopeFilter, {
      employeeId,
      from,
      to,
    });
  }

  @Get('attendance/live')
  @RequirePermission('attendance.view')
  async getLiveAttendance(@Req() req: any) {
    return this.attendanceService.getLiveAttendance(req.scopeFilter);
  }

  @Post('attendance/corrections')
  @RequirePermission('attendance.view')
  async requestCorrection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = RequestCorrectionSchema.parse(body);
    return this.attendanceService.requestCorrection(user.id, dto);
  }

  @Post('attendance/corrections/:id/decide')
  @RequirePermission('attendance.approve')
  async decideCorrection(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = DecideCorrectionSchema.parse(body);
    return this.attendanceService.decideCorrection(id, user.id, dto);
  }

  @Post('leave-requests')
  @RequirePermission('attendance.view')
  async requestLeave(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = RequestLeaveSchema.parse(body);
    return this.attendanceService.requestLeave(user.id, dto);
  }

  @Post('leave-requests/:id/decide')
  @RequirePermission('attendance.approve')
  async decideLeave(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = DecideLeaveSchema.parse(body);
    return this.attendanceService.decideLeave(id, user.id, dto);
  }
}
