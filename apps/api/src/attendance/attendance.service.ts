import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  CreateHolidayDto,
  UpdateHolidayDto,
  ImportHolidaysDto,
  AssignScheduleDto,
  UpdateScheduleAssignmentDto,
  AttendanceSheetQueryDto,
  RequestCorrectionDto,
  DecideCorrectionDto,
  AttendanceStatus,
} from '@company-os/contracts';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { assertEmployeeInScope, dateUtc, isoDate, addDays, monthRange, isoWeekday, csvLine } from '../hr/hr.util';

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

  async updateSchedule(companyId: string, id: string, dto: UpdateScheduleDto) {
    await this.getSchedule(companyId, id);
    return this.prisma.shiftSchedule.update({ where: { id }, data: dto });
  }

  async deleteSchedule(companyId: string, id: string) {
    await this.getSchedule(companyId, id);
    const used = await this.prisma.employeeSchedule.count({ where: { scheduleId: id } });
    if (used > 0) throw new ConflictException('Schedule is assigned to employees. Reassign them first.');
    return this.prisma.shiftSchedule.delete({ where: { id } });
  }

  private async getSchedule(companyId: string, id: string) {
    const s = await this.prisma.shiftSchedule.findFirst({ where: { id, companyId } });
    if (!s) throw new NotFoundException('Schedule not found');
    return s;
  }

  // 1b. Schedule assignments per employee (15 FR-HR-06)
  async listAssignments(scope: ScopeFilter, employeeId: string) {
    assertEmployeeInScope(scope, employeeId);
    return this.prisma.employeeSchedule.findMany({
      where: { employeeId, employee: { companyId: scope.companyId } },
      include: { schedule: { select: { id: true, name: true, startTime: true, endTime: true, workdays: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async assignSchedule(scope: ScopeFilter, dto: AssignScheduleDto) {
    assertEmployeeInScope(scope, dto.employeeId);
    await this.getSchedule(scope.companyId, dto.scheduleId);
    const from = dateUtc(dto.effectiveFrom);
    const to = dto.effectiveTo ? dateUtc(dto.effectiveTo) : null;
    // Close any open assignment that overlaps the new start.
    await this.prisma.employeeSchedule.updateMany({
      where: { employeeId: dto.employeeId, effectiveTo: null, effectiveFrom: { lt: from } },
      data: { effectiveTo: addDays(from, -1) },
    });
    return this.prisma.employeeSchedule.create({ data: { employeeId: dto.employeeId, scheduleId: dto.scheduleId, effectiveFrom: from, effectiveTo: to } });
  }

  async updateAssignment(scope: ScopeFilter, employeeId: string, id: string, dto: UpdateScheduleAssignmentDto) {
    assertEmployeeInScope(scope, employeeId);
    const a = await this.prisma.employeeSchedule.findFirst({ where: { id, employeeId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (dto.scheduleId) await this.getSchedule(scope.companyId, dto.scheduleId);
    return this.prisma.employeeSchedule.update({
      where: { id },
      data: {
        scheduleId: dto.scheduleId,
        effectiveFrom: dto.effectiveFrom ? dateUtc(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo === undefined ? undefined : dto.effectiveTo ? dateUtc(dto.effectiveTo) : null,
      },
    });
  }

  async deleteAssignment(scope: ScopeFilter, employeeId: string, id: string) {
    assertEmployeeInScope(scope, employeeId);
    const a = await this.prisma.employeeSchedule.findFirst({ where: { id, employeeId } });
    if (!a) throw new NotFoundException('Assignment not found');
    return this.prisma.employeeSchedule.delete({ where: { id } });
  }

  // 2. Holidays
  async listHolidays(companyId: string, year?: number) {
    const where: Prisma.HolidayWhereInput = { companyId };
    if (year) where.date = { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) };
    return this.prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });
  }

  async updateHoliday(companyId: string, id: string, dto: UpdateHolidayDto) {
    const h = await this.prisma.holiday.findFirst({ where: { id, companyId } });
    if (!h) throw new NotFoundException('Holiday not found');
    return this.prisma.holiday.update({ where: { id }, data: { name: dto.name, isOptional: dto.isOptional, date: dto.date ? dateUtc(dto.date) : undefined } });
  }

  async deleteHoliday(companyId: string, id: string) {
    const h = await this.prisma.holiday.findFirst({ where: { id, companyId } });
    if (!h) throw new NotFoundException('Holiday not found');
    return this.prisma.holiday.delete({ where: { id } });
  }

  async importHolidays(companyId: string, dto: ImportHolidaysDto) {
    let created = 0;
    let updated = 0;
    for (const h of dto.holidays) {
      const date = dateUtc(h.date);
      const existing = await this.prisma.holiday.findUnique({ where: { companyId_date: { companyId, date } } });
      if (existing) {
        await this.prisma.holiday.update({ where: { id: existing.id }, data: { name: h.name, isOptional: h.isOptional } });
        updated += 1;
      } else {
        await this.prisma.holiday.create({ data: { companyId, date, name: h.name, isOptional: h.isOptional } });
        created += 1;
      }
    }
    return { created, updated };
  }

  /** Month grid per employee (15 FR-HR-07). */
  async sheet(scope: ScopeFilter, q: AttendanceSheetQueryDto) {
    const { from, to } = monthRange(q.month);
    if (q.employeeId) assertEmployeeInScope(scope, q.employeeId, true);
    const employees = await this.prisma.employee.findMany({
      where: {
        companyId: scope.companyId,
        deletedAt: null,
        ...(scope.scope === 'all' ? {} : { id: { in: scope.allowedEmployeeIds } }),
        ...(q.employeeId ? { id: q.employeeId } : {}),
        ...(q.departmentId ? { departmentId: q.departmentId } : {}),
        ...(q.teamId ? { teamId: q.teamId } : {}),
      },
      select: { id: true, code: true, firstName: true, lastName: true, department: { select: { name: true } }, team: { select: { name: true } } },
      orderBy: { code: 'asc' },
    });
    const ids = employees.map((e) => e.id);
    const [days, holidays] = await Promise.all([
      this.prisma.attendanceDay.findMany({ where: { employeeId: { in: ids }, date: { gte: from, lte: to } } }),
      this.prisma.holiday.findMany({ where: { companyId: scope.companyId, date: { gte: from, lte: to } } }),
    ]);
    const dates: string[] = [];
    for (let d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) dates.push(isoDate(d));
    const holidaySet = new Set(holidays.map((h) => isoDate(h.date)));
    const rows = employees.map((e) => {
      const byDate: Record<string, { status: string; workingSeconds: number; activeSeconds: number; flags: string[] }> = {};
      const totals = { present: 0, late: 0, halfDay: 0, absent: 0, onLeave: 0, holiday: 0, weeklyOff: 0, workingSeconds: 0, activeSeconds: 0 };
      for (const date of dates) {
        const row = days.find((d) => d.employeeId === e.id && isoDate(d.date) === date);
        let status = row?.status;
        if (!status) status = holidaySet.has(date) ? 'holiday' : [6, 7].includes(isoWeekday(dateUtc(date))) ? 'weekly_off' : '';
        byDate[date] = { status, workingSeconds: row?.workingSeconds ?? 0, activeSeconds: row?.activeSeconds ?? 0, flags: row?.flags ?? [] };
        totals.workingSeconds += row?.workingSeconds ?? 0;
        totals.activeSeconds += row?.activeSeconds ?? 0;
        switch (status) {
          case 'present': totals.present += 1; break;
          case 'late': totals.late += 1; break;
          case 'half_day': totals.halfDay += 1; break;
          case 'absent': totals.absent += 1; break;
          case 'on_leave': totals.onLeave += 1; break;
          case 'holiday': totals.holiday += 1; break;
          case 'weekly_off': totals.weeklyOff += 1; break;
        }
      }
      return { employee: e, days: byDate, totals };
    });
    return { month: q.month, dates, holidays: holidays.map((h) => ({ date: isoDate(h.date), name: h.name, isOptional: h.isOptional })), rows };
  }

  sheetCsv(sheet: Awaited<ReturnType<AttendanceService['sheet']>>): string {
    const header = csvLine(['Code', 'Employee', 'Department', 'Team', ...sheet.dates, 'Present', 'Late', 'Half day', 'Absent', 'On leave', 'Holiday', 'Weekly off', 'Working hours']);
    const lines = sheet.rows.map((r) =>
      csvLine([
        r.employee.code,
        `${r.employee.firstName} ${r.employee.lastName}`,
        r.employee.department?.name ?? '',
        r.employee.team?.name ?? '',
        ...sheet.dates.map((d) => r.days[d]?.status ?? ''),
        r.totals.present, r.totals.late, r.totals.halfDay, r.totals.absent, r.totals.onLeave, r.totals.holiday, r.totals.weeklyOff,
        Math.round((r.totals.workingSeconds / 3600) * 100) / 100,
      ]),
    );
    return [header, ...lines].join('\r\n') + '\r\n';
  }

  async listCorrections(scope: ScopeFilter, status?: string) {
    const employeeIds =
      scope.scope === 'all'
        ? (await this.prisma.employee.findMany({ where: { companyId: scope.companyId }, select: { id: true } })).map((e) => e.id)
        : scope.allowedEmployeeIds;
    const rows = await this.prisma.attendanceCorrection.findMany({
      where: { employeeId: { in: employeeIds }, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: Array.from(new Set(rows.map((r) => r.employeeId))) } },
      select: { id: true, code: true, firstName: true, lastName: true, department: { select: { name: true } } },
    });
    const byId = new Map(employees.map((e) => [e.id, e]));
    return rows.map((r) => ({ ...r, employee: byId.get(r.employeeId) ?? null }));
  }

  async createHoliday(companyId: string, dto: CreateHolidayDto) {
    return this.prisma.holiday.create({
      data: {
        companyId,
        date: dateUtc(dto.date),
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
    scope?: ScopeFilter,
  ) {
    const correction = await this.prisma.attendanceCorrection.findUnique({
      where: { id: correctionId },
    });
    if (!correction) throw new NotFoundException('Correction request not found');
    if (scope) assertEmployeeInScope(scope, correction.employeeId);
    if (correction.status !== 'pending') throw new ConflictException(`Correction is already ${correction.status}`);

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
      // Recompute day status with correction flag (F9: adjustment, never edits tracked data)
      await this.computeDailyAttendance(correction.employeeId, correction.date, true);
    }

    return updated;
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
