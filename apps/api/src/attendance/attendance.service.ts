import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  CreateHolidayDto,
  RequestCorrectionDto,
  DecideCorrectionDto,
  RequestLeaveDto,
  DecideLeaveDto,
  AttendanceStatus,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  // 1. Schedules
  async listSchedules(companyId: string) {
    return this.prisma.shiftSchedule.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async createSchedule(companyId: string, dto: CreateScheduleDto) {
    return this.prisma.shiftSchedule.create({
      data: {
        companyId,
        name: dto.name,
        workdays: dto.workdays,
        startTime: dto.startTime,
        endTime: dto.endTime,
        crossesMidnight: dto.crossesMidnight,
        graceMinutes: dto.graceMinutes,
        halfDayPercent: dto.halfDayPercent,
      },
    });
  }

  // 2. Holidays
  async listHolidays(companyId: string) {
    return this.prisma.holiday.findMany({
      where: { companyId },
      orderBy: { date: 'asc' },
    });
  }

  async createHoliday(companyId: string, dto: CreateHolidayDto) {
    return this.prisma.holiday.create({
      data: {
        companyId,
        date: new Date(dto.date),
        name: dto.name,
      },
    });
  }

  // 3. Attendance Days
  async getAttendanceDays(
    scopeFilter: ScopeFilter,
    filters?: { employeeId?: string; from?: string; to?: string },
  ) {
    const where: any = {};

    if (scopeFilter.scope !== 'all') {
      where.employeeId = { in: scopeFilter.allowedEmployeeIds };
    }

    if (filters?.employeeId) {
      if (
        scopeFilter.scope !== 'all' &&
        !scopeFilter.allowedEmployeeIds.includes(filters.employeeId)
      ) {
        throw new NotFoundException('Employee not found or outside scope');
      }
      where.employeeId = filters.employeeId;
    }

    if (filters?.from || filters?.to) {
      where.date = {};
      if (filters.from) where.date.gte = new Date(filters.from);
      if (filters.to) where.date.lte = new Date(filters.to);
    }

    return this.prisma.attendanceDay.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
            team: { select: { name: true } },
          },
        },
      },
      orderBy: [{ date: 'desc' }, { checkInAt: 'asc' }],
    });
  }

  /**
   * Realtime Live Attendance Board (FR-ATT-07).
   */
  async getLiveAttendance(scopeFilter: ScopeFilter) {
    const employeeWhere: any = {
      companyId: scopeFilter.companyId,
      status: 'active',
      deletedAt: null,
    };

    if (scopeFilter.scope !== 'all') {
      employeeWhere.id = { in: scopeFilter.allowedEmployeeIds };
    }

    const employees = await this.prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
        team: { select: { name: true } },
        shifts: {
          where: { state: { in: ['WORKING', 'ON_BREAK'] } },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    });

    const now = this.clock.now();

    return employees.map((emp) => {
      const activeShift = emp.shifts[0];
      let liveStatus = 'Not started';

      if (activeShift) {
        const timeSinceHeartbeatSeconds = Math.floor(
          (now.getTime() - activeShift.lastHeartbeatAt.getTime()) / 1000,
        );

        if (timeSinceHeartbeatSeconds > 300) {
          // More than 5 minutes without heartbeat
          liveStatus = `Offline (last seen ${activeShift.lastHeartbeatAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
        } else if (activeShift.state === 'ON_BREAK') {
          liveStatus = 'On break';
        } else {
          liveStatus = 'Working';
        }
      }

      return {
        employeeId: emp.id,
        code: emp.code,
        name: `${emp.firstName} ${emp.lastName}`,
        department: emp.department?.name || 'Unassigned',
        team: emp.team?.name || 'Unassigned',
        liveStatus,
        checkInAt: activeShift ? activeShift.startedAt : null,
        activeSeconds: activeShift ? activeShift.activeSeconds : 0,
        breakSeconds: activeShift ? activeShift.breakSeconds : 0,
      };
    });
  }

  // 4. Corrections (F9)
  async requestCorrection(employeeId: string, dto: RequestCorrectionDto) {
    return this.prisma.attendanceCorrection.create({
      data: {
        employeeId,
        date: new Date(dto.date),
        type: dto.type,
        requestedStart: dto.requestedStart ? new Date(dto.requestedStart) : null,
        requestedEnd: dto.requestedEnd ? new Date(dto.requestedEnd) : null,
        reason: dto.reason,
        status: 'pending',
      },
    });
  }

  async decideCorrection(
    correctionId: string,
    decidedBy: string,
    dto: DecideCorrectionDto,
  ) {
    const correction = await this.prisma.attendanceCorrection.findUnique({
      where: { id: correctionId },
    });
    if (!correction) throw new NotFoundException('Correction request not found');

    const updated = await this.prisma.attendanceCorrection.update({
      where: { id: correctionId },
      data: {
        status: dto.status,
        decidedBy,
        decidedAt: this.clock.now(),
        comment: dto.comment || null,
      },
    });

    if (dto.status === 'approved') {
      // Recompute day status with correction flag
      await this.computeDailyAttendance(correction.employeeId, correction.date, true);
    }

    return updated;
  }

  // 5. Leave Requests (F9)
  async requestLeave(employeeId: string, dto: RequestLeaveDto) {
    return this.prisma.leaveRequest.create({
      data: {
        employeeId,
        type: dto.type,
        dateFrom: new Date(dto.dateFrom),
        dateTo: new Date(dto.dateTo),
        reason: dto.reason,
        status: 'pending',
      },
    });
  }

  async decideLeave(
    leaveId: string,
    decidedBy: string,
    dto: DecideLeaveDto,
  ) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
    });
    if (!leave) throw new NotFoundException('Leave request not found');

    return this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status: dto.status,
        decidedBy,
        decidedAt: this.clock.now(),
        comment: dto.comment || null,
      },
    });
  }

  /**
   * Daily Attendance computation rule engine (F8).
   */
  async computeDailyAttendance(
    employeeId: string,
    date: Date,
    isCorrected = false,
  ) {
    const dateOnly = new Date(date.toISOString().split('T')[0]! + 'T00:00:00.000Z');

    const [shifts, holiday, leave] = await Promise.all([
      this.prisma.shift.findMany({
        where: { employeeId, attendanceDate: dateOnly },
      }),
      this.prisma.holiday.findFirst({
        where: { date: dateOnly },
      }),
      this.prisma.leaveRequest.findFirst({
        where: {
          employeeId,
          status: 'approved',
          dateFrom: { lte: dateOnly },
          dateTo: { gte: dateOnly },
        },
      }),
    ]);

    let totalWorkingSeconds = 0;
    let totalActiveSeconds = 0;
    let totalIdleSeconds = 0;
    let totalBreakSeconds = 0;
    let totalOfflineSeconds = 0;
    let checkInAt: Date | null = null;
    let checkOutAt: Date | null = null;
    const flags: string[] = isCorrected ? ['corrected'] : [];

    for (const s of shifts) {
      totalWorkingSeconds += s.durationSeconds - s.breakSeconds - s.offlineSeconds;
      totalActiveSeconds += s.activeSeconds;
      totalIdleSeconds += s.idleSeconds;
      totalBreakSeconds += s.breakSeconds;
      totalOfflineSeconds += s.offlineSeconds;

      if (!checkInAt || s.startedAt < checkInAt) checkInAt = s.startedAt;
      if (s.endedAt && (!checkOutAt || s.endedAt > checkOutAt)) checkOutAt = s.endedAt;
    }

    let status: string = AttendanceStatus.PRESENT;

    if (shifts.length === 0) {
      if (holiday) {
        status = AttendanceStatus.HOLIDAY;
      } else if (leave) {
        status = AttendanceStatus.ON_LEAVE;
      } else {
        status = AttendanceStatus.ABSENT;
      }
    } else {
      if (totalBreakSeconds > 3600) {
        flags.push('break_exceeded');
      }
    }

    return this.prisma.attendanceDay.upsert({
      where: {
        employeeId_date: {
          employeeId,
          date: dateOnly,
        },
      },
      update: {
        status,
        checkInAt,
        checkOutAt,
        workingSeconds: totalWorkingSeconds,
        activeSeconds: totalActiveSeconds,
        idleSeconds: totalIdleSeconds,
        breakSeconds: totalBreakSeconds,
        offlineSeconds: totalOfflineSeconds,
        flags,
        computedAt: this.clock.now(),
      },
      create: {
        employeeId,
        date: dateOnly,
        status,
        checkInAt,
        checkOutAt,
        workingSeconds: totalWorkingSeconds,
        activeSeconds: totalActiveSeconds,
        idleSeconds: totalIdleSeconds,
        breakSeconds: totalBreakSeconds,
        offlineSeconds: totalOfflineSeconds,
        flags,
        computedAt: this.clock.now(),
      },
    });
  }
}
