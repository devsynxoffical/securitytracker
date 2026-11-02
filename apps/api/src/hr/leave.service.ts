import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateLeaveTypeDto,
  UpdateLeaveTypeDto,
  AdjustLeaveBalanceDto,
  CreateLeaveRequestDto,
  LeaveRequestQueryDto,
  LeaveCalendarQueryDto,
  DecideLeaveDto,
  ErrorCodes,
  LeaveStatus,
  NotificationType,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { toCursorPage } from '../crm/shared/crm.util';
import {
  employeeScopeWhere,
  assertEmployeeInScope,
  inScope,
  dateUtc,
  isoDate,
  addDays,
  monthRange,
  countWorkingDays,
  entitlementForYear,
  round2,
  ScheduleWindow,
} from './hr.util';

type Tx = Prisma.TransactionClient | PrismaService;

/** Leave types, balances and requests (15 FR-HR-01 to 04, F25). */
@Injectable()
export class LeaveService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
  ) {}

  // ---- Leave types --------------------------------------------------------

  listTypes(companyId: string, includeInactive = false) {
    return this.prisma.leaveType.findMany({
      where: { companyId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { position: 'asc' },
    });
  }

  async createType(companyId: string, dto: CreateLeaveTypeDto) {
    const position = dto.position ?? (await this.prisma.leaveType.count({ where: { companyId } })) + 1;
    try {
      return await this.prisma.leaveType.create({
        data: {
          companyId,
          name: dto.name,
          code: dto.code,
          colour: dto.colour,
          paid: dto.paid,
          annualAllowanceDays: dto.annualAllowanceDays,
          accrual: dto.accrual,
          carryOverMaxDays: dto.carryOverMaxDays,
          requiresApproval: dto.requiresApproval,
          allowHalfDay: dto.allowHalfDay,
          isActive: dto.isActive,
          position,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A leave type with this code already exists');
      throw e;
    }
  }

  async updateType(companyId: string, id: string, dto: UpdateLeaveTypeDto) {
    await this.getType(companyId, id);
    return this.prisma.leaveType.update({ where: { id }, data: dto });
  }

  /** Types with history are deactivated, never deleted. */
  async deleteType(companyId: string, id: string) {
    await this.getType(companyId, id);
    const used = await this.prisma.leaveRequest.count({ where: { leaveTypeId: id } });
    if (used > 0) return this.prisma.leaveType.update({ where: { id }, data: { isActive: false } });
    return this.prisma.leaveType.delete({ where: { id } });
  }

  private async getType(companyId: string, id: string) {
    const t = await this.prisma.leaveType.findFirst({ where: { id, companyId } });
    if (!t) throw new NotFoundException('Leave type not found');
    return t;
  }

  // ---- Balances -----------------------------------------------------------

  async listBalances(scope: ScopeFilter, employeeId: string | undefined, year: number | undefined) {
    const y = year ?? this.clock.now().getUTCFullYear();
    if (employeeId) assertEmployeeInScope(scope, employeeId, true);
    const targetIds = employeeId
      ? [employeeId]
      : (
          await this.prisma.employee.findMany({
            where: { companyId: scope.companyId, deletedAt: null, status: { not: 'disabled' }, ...(scope.scope === 'all' ? {} : { id: { in: scope.allowedEmployeeIds } }) },
            select: { id: true },
          })
        ).map((e) => e.id);
    const types = await this.listTypes(scope.companyId);
    const rows: Array<Record<string, unknown>> = [];
    for (const empId of targetIds) {
      for (const type of types) {
        const b = await this.ensureBalance(this.prisma, scope.companyId, empId, type, y);
        rows.push(this.present(b, type));
      }
    }
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, code: true, firstName: true, lastName: true, department: { select: { name: true } } },
    });
    return { year: y, items: rows, employees };
  }

  async adjust(companyId: string, actorId: string, dto: AdjustLeaveBalanceDto) {
    const type = await this.getType(companyId, dto.leaveTypeId);
    const balance = await this.ensureBalance(this.prisma, companyId, dto.employeeId, type, dto.year);
    const updated = await this.prisma.leaveBalance.update({
      where: { id: balance.id },
      data: { adjustmentsDays: { increment: dto.days } },
    });
    await this.notifications.sendNotification(dto.employeeId, NotificationType.LEAVE_DECIDED, 'Leave balance adjusted', `${type.name}: ${dto.days > 0 ? '+' : ''}${dto.days} days. ${dto.reason}`, { leaveTypeId: type.id, year: dto.year, actorId });
    return this.present(updated, type);
  }

  /** Creates the year row with the computed entitlement when missing. */
  private async ensureBalance(
    tx: Tx,
    companyId: string,
    employeeId: string,
    type: { id: string; annualAllowanceDays: Prisma.Decimal | number; accrual: string },
    year: number,
  ) {
    const existing = await tx.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: type.id, year } } });
    if (existing) return existing;
    const emp = await tx.employee.findUnique({ where: { id: employeeId }, select: { joinDate: true } });
    const entitled = entitlementForYear(Number(type.annualAllowanceDays), type.accrual, year, this.clock.now(), emp?.joinDate ?? null);
    return tx.leaveBalance.create({ data: { companyId, employeeId, leaveTypeId: type.id, year, entitledDays: entitled } });
  }

  private present(b: { id: string; employeeId: string; leaveTypeId: string; year: number; entitledDays: Prisma.Decimal | number; carriedOverDays: Prisma.Decimal | number; usedDays: Prisma.Decimal | number; pendingDays: Prisma.Decimal | number; adjustmentsDays: Prisma.Decimal | number }, type: { name: string; code: string; colour: string; paid: boolean }) {
    const n = (v: Prisma.Decimal | number) => Number(v);
    const available = round2(n(b.entitledDays) + n(b.carriedOverDays) + n(b.adjustmentsDays) - n(b.usedDays) - n(b.pendingDays));
    return {
      id: b.id,
      employeeId: b.employeeId,
      leaveTypeId: b.leaveTypeId,
      leaveType: { name: type.name, code: type.code, colour: type.colour, paid: type.paid },
      year: b.year,
      entitledDays: n(b.entitledDays),
      carriedOverDays: n(b.carriedOverDays),
      adjustmentsDays: n(b.adjustmentsDays),
      usedDays: n(b.usedDays),
      pendingDays: n(b.pendingDays),
      availableDays: available,
    };
  }

  // ---- Working days -------------------------------------------------------

  async workingDays(companyId: string, employeeId: string, from: Date, to: Date, halfDay: boolean): Promise<number> {
    if (halfDay) {
      if (from.getTime() !== to.getTime()) throw new BadRequestException('Half day leave must be a single day');
    }
    const [assignments, holidays] = await Promise.all([
      this.prisma.employeeSchedule.findMany({ where: { employeeId }, include: { schedule: { select: { workdays: true } } } }),
      this.prisma.holiday.findMany({ where: { companyId, isOptional: false, date: { gte: from, lte: to } }, select: { date: true } }),
    ]);
    const windows: ScheduleWindow[] = assignments.map((a) => ({ workdays: a.schedule.workdays, effectiveFrom: a.effectiveFrom, effectiveTo: a.effectiveTo }));
    const days = countWorkingDays(from, to, windows, new Set(holidays.map((h) => isoDate(h.date))));
    return halfDay ? Math.min(days, 1) * 0.5 : days;
  }

  // ---- Requests -----------------------------------------------------------

  async list(scope: ScopeFilter, q: LeaveRequestQueryDto) {
    if (q.employeeId) assertEmployeeInScope(scope, q.employeeId, true);
    const where: Prisma.LeaveRequestWhereInput = {
      employee: { companyId: scope.companyId },
      ...employeeScopeWhere(scope),
    };
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.status) where.status = q.status;
    if (q.from) where.dateTo = { gte: dateUtc(q.from) };
    if (q.to) where.dateFrom = { lte: dateUtc(q.to) };
    const rows = await this.prisma.leaveRequest.findMany({
      where,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        employee: { select: { id: true, code: true, firstName: true, lastName: true, department: { select: { name: true } }, team: { select: { name: true } } } },
        leaveType: { select: { id: true, name: true, code: true, colour: true, paid: true } },
      },
    });
    return toCursorPage(rows, q.limit);
  }

  /**
   * F25. Accepts the new DTO; the legacy desktop body `{type, dateFrom, dateTo, reason}` is mapped
   * by the controller to a leave type whose code equals the upper-cased type.
   */
  async create(scope: ScopeFilter, actorId: string, dto: CreateLeaveRequestDto) {
    const employeeId = dto.employeeId ?? actorId;
    if (employeeId !== actorId) assertEmployeeInScope(scope, employeeId);
    const type = await this.getType(scope.companyId, dto.leaveTypeId);
    if (!type.isActive) throw new UnprocessableEntityException({ code: ErrorCodes.LEAVE_TYPE_INACTIVE, message: 'This leave type is inactive' });
    if (dto.halfDay && !type.allowHalfDay) throw new BadRequestException('This leave type does not allow half days');
    const from = dateUtc(dto.dateFrom);
    const to = dateUtc(dto.dateTo);
    if (to.getTime() < from.getTime()) throw new BadRequestException('dateTo must be on or after dateFrom');

    const overlap = await this.prisma.leaveRequest.findFirst({
      where: { employeeId, status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] }, dateFrom: { lte: to }, dateTo: { gte: from } },
      select: { id: true, dateFrom: true, dateTo: true },
    });
    if (overlap) throw new ConflictException({ code: ErrorCodes.LEAVE_OVERLAP, message: 'An existing leave request overlaps these dates', details: { requestId: overlap.id } });

    const days = await this.workingDays(scope.companyId, employeeId, from, to, dto.halfDay);
    if (days <= 0) throw new BadRequestException('The selected range contains no working days');
    const now = this.clock.now();
    const year = from.getUTCFullYear();
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true, firstName: true, lastName: true } });
    const autoApprove = !type.requiresApproval;

    const request = await this.prisma.$transaction(async (tx) => {
      const balance = await this.ensureBalance(tx, scope.companyId, employeeId, type, year);
      if (type.paid) {
        const available = Number(balance.entitledDays) + Number(balance.carriedOverDays) + Number(balance.adjustmentsDays) - Number(balance.usedDays) - Number(balance.pendingDays);
        if (available < days) {
          throw new UnprocessableEntityException({ code: ErrorCodes.LEAVE_BALANCE_EXCEEDED, message: `Only ${round2(available)} days available for ${type.name}`, details: { available: round2(available), requested: days } });
        }
      }
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: autoApprove ? { usedDays: { increment: days } } : { pendingDays: { increment: days } },
      });
      return tx.leaveRequest.create({
        data: {
          companyId: scope.companyId,
          employeeId,
          type: type.code.toLowerCase(),
          leaveTypeId: type.id,
          dateFrom: from,
          dateTo: to,
          days,
          halfDay: dto.halfDay,
          reason: dto.reason,
          status: autoApprove ? LeaveStatus.APPROVED : LeaveStatus.PENDING,
          approverId: employee?.managerId ?? null,
          decidedBy: autoApprove ? actorId : null,
          decidedAt: autoApprove ? now : null,
        },
      });
    });

    if (autoApprove) {
      await this.markAttendanceOnLeave(employeeId, from, to);
    } else if (employee?.managerId && employee.managerId !== actorId) {
      await this.notifications.sendNotification(employee.managerId, NotificationType.LEAVE_REQUESTED, 'Leave request', `${employee.firstName} ${employee.lastName} requested ${days} day(s) of ${type.name}`, { leaveRequestId: request.id, employeeId });
    }
    return request;
  }

  async decide(scope: ScopeFilter, actorId: string, id: string, dto: DecideLeaveDto) {
    const leave = await this.getRequest(scope, id);
    if (leave.status !== LeaveStatus.PENDING) throw new ConflictException(`Request is already ${leave.status}`);
    if (dto.status === LeaveStatus.CANCELLED) return this.cancel(scope, actorId, id, dto.comment);
    const now = this.clock.now();
    const days = Number(leave.days);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (leave.leaveTypeId) {
        const type = await tx.leaveType.findUnique({ where: { id: leave.leaveTypeId } });
        if (type) {
          const balance = await this.ensureBalance(tx, scope.companyId, leave.employeeId, type, leave.dateFrom.getUTCFullYear());
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: dto.status === LeaveStatus.APPROVED ? { pendingDays: { decrement: days }, usedDays: { increment: days } } : { pendingDays: { decrement: days } },
          });
        }
      }
      return tx.leaveRequest.update({ where: { id }, data: { status: dto.status, decidedBy: actorId, decidedAt: now, comment: dto.comment ?? null } });
    });

    if (dto.status === LeaveStatus.APPROVED) await this.markAttendanceOnLeave(leave.employeeId, leave.dateFrom, leave.dateTo);
    await this.notifications.sendNotification(leave.employeeId, NotificationType.LEAVE_DECIDED, `Leave ${dto.status}`, `Your leave from ${isoDate(leave.dateFrom)} to ${isoDate(leave.dateTo)} was ${dto.status}${dto.comment ? `: ${dto.comment}` : ''}`, { leaveRequestId: id });
    return updated;
  }

  /** Employee cancels while pending; approver (attendance.approve in scope) cancels after approval. */
  async cancel(scope: ScopeFilter, actorId: string, id: string, comment?: string, canApprove = true) {
    const leave = await this.getRequest(scope, id);
    if (leave.status === LeaveStatus.CANCELLED || leave.status === LeaveStatus.REJECTED) throw new ConflictException(`Request is already ${leave.status}`);
    const isOwner = leave.employeeId === actorId;
    if (leave.status === LeaveStatus.PENDING && !isOwner && !canApprove) throw new ForbiddenException('Only the employee or an approver can cancel');
    if (leave.status === LeaveStatus.APPROVED && !canApprove) throw new ForbiddenException('Approved leave can only be cancelled by an approver');
    const now = this.clock.now();
    const days = Number(leave.days);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (leave.leaveTypeId) {
        const type = await tx.leaveType.findUnique({ where: { id: leave.leaveTypeId } });
        if (type) {
          const balance = await this.ensureBalance(tx, scope.companyId, leave.employeeId, type, leave.dateFrom.getUTCFullYear());
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: leave.status === LeaveStatus.APPROVED ? { usedDays: { decrement: days } } : { pendingDays: { decrement: days } },
          });
        }
      }
      return tx.leaveRequest.update({ where: { id }, data: { status: LeaveStatus.CANCELLED, cancelledAt: now, decidedBy: actorId, decidedAt: now, comment: comment ?? leave.comment } });
    });
    if (leave.status === LeaveStatus.APPROVED) await this.clearAttendanceLeave(leave.employeeId, leave.dateFrom, leave.dateTo);
    if (!isOwner) await this.notifications.sendNotification(leave.employeeId, NotificationType.LEAVE_DECIDED, 'Leave cancelled', `Your leave from ${isoDate(leave.dateFrom)} to ${isoDate(leave.dateTo)} was cancelled`, { leaveRequestId: id });
    return updated;
  }

  private async getRequest(scope: ScopeFilter, id: string) {
    const leave = await this.prisma.leaveRequest.findFirst({ where: { id, employee: { companyId: scope.companyId } } });
    if (!leave || !inScope(scope, leave.employeeId)) throw new NotFoundException('Leave request not found');
    return leave;
  }

  // ---- Calendar and out today ---------------------------------------------

  async calendar(scope: ScopeFilter, q: LeaveCalendarQueryDto) {
    const { from, to } = monthRange(q.month);
    const where: Prisma.LeaveRequestWhereInput = {
      status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
      dateFrom: { lte: to },
      dateTo: { gte: from },
      employee: { companyId: scope.companyId, ...(q.departmentId ? { departmentId: q.departmentId } : {}), ...(q.teamId ? { teamId: q.teamId } : {}) },
      ...employeeScopeWhere(scope),
    };
    const [requests, holidays] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: { employee: { select: { id: true, code: true, firstName: true, lastName: true } }, leaveType: { select: { name: true, code: true, colour: true } } },
        orderBy: { dateFrom: 'asc' },
      }),
      this.prisma.holiday.findMany({ where: { companyId: scope.companyId, date: { gte: from, lte: to } }, orderBy: { date: 'asc' } }),
    ]);
    return { month: q.month, from: isoDate(from), to: isoDate(to), requests, holidays };
  }

  async outToday(scope: ScopeFilter) {
    const now = this.clock.now();
    const today = dateUtc(isoDate(now));
    const rows = await this.prisma.leaveRequest.findMany({
      where: { status: LeaveStatus.APPROVED, dateFrom: { lte: today }, dateTo: { gte: today }, employee: { companyId: scope.companyId }, ...employeeScopeWhere(scope) },
      include: { employee: { select: { id: true, code: true, firstName: true, lastName: true, department: { select: { name: true } } } }, leaveType: { select: { name: true, colour: true } } },
    });
    const tomorrow = addDays(today, 1);
    const upcoming = await this.prisma.leaveRequest.count({
      where: { status: LeaveStatus.APPROVED, dateFrom: { gt: today, lte: addDays(tomorrow, 6) }, employee: { companyId: scope.companyId }, ...employeeScopeWhere(scope) },
    });
    return { date: isoDate(today), items: rows, upcomingThisWeek: upcoming };
  }

  // ---- Attendance side effects --------------------------------------------

  private async markAttendanceOnLeave(employeeId: string, from: Date, to: Date) {
    for (let d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) {
      await this.prisma.attendanceDay.upsert({
        where: { employeeId_date: { employeeId, date: d } },
        update: { status: 'on_leave', computedAt: this.clock.now() },
        create: { employeeId, date: d, status: 'on_leave', computedAt: this.clock.now() },
      });
    }
  }

  private async clearAttendanceLeave(employeeId: string, from: Date, to: Date) {
    await this.prisma.attendanceDay.updateMany({
      where: { employeeId, date: { gte: from, lte: to }, status: 'on_leave', workingSeconds: 0 },
      data: { status: 'absent', computedAt: this.clock.now() },
    });
  }
}
