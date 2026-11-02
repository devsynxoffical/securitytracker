import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateManualTimeDto, DecideManualTimeDto, ManualTimeQueryDto, ManualTimeStatus, ErrorCodes, NotificationType } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { toCursorPage } from '../crm/shared/crm.util';
import { dayStart, dayEnd, overlaps } from './tracking-admin.util';

/** Manual time entries with approval (FR-TRK-17, F27). */
@Injectable()
export class ManualTimeService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
  ) {}

  async list(scope: ScopeFilter, q: ManualTimeQueryDto) {
    const where: Prisma.ManualTimeEntryWhereInput = { companyId: scope.companyId };
    if (scope.scope !== 'all') where.employeeId = { in: scope.allowedEmployeeIds };
    if (q.employeeId) {
      if (scope.scope !== 'all' && !scope.allowedEmployeeIds.includes(q.employeeId)) throw new ForbiddenException('Employee is outside your scope');
      where.employeeId = q.employeeId;
    }
    if (q.status) where.status = q.status;
    if (q.from || q.to) where.date = { ...(q.from ? { gte: dayStart(q.from) } : {}), ...(q.to ? { lte: dayStart(q.to) } : {}) };
    const rows = await this.prisma.manualTimeEntry.findMany({
      where,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { employee: { select: { id: true, code: true, firstName: true, lastName: true } } },
    });
    return toCursorPage(rows, q.limit);
  }

  async create(scope: ScopeFilter, actorId: string, dto: CreateManualTimeDto) {
    const employeeId = dto.employeeId ?? actorId;
    if (employeeId !== actorId && scope.scope !== 'all' && !scope.allowedEmployeeIds.includes(employeeId)) {
      throw new ForbiddenException('Employee is outside your scope');
    }
    const start = new Date(dto.startedAt);
    const end = new Date(dto.endedAt);
    if (end.getTime() <= start.getTime()) throw new BadRequestException('endedAt must be after startedAt');
    if (end.getTime() - start.getTime() > 16 * 3600_000) throw new BadRequestException('A manual entry cannot exceed 16 hours');
    const date = dayStart(dto.date);
    if (start.getTime() < date.getTime() - 86_400_000 || start.getTime() >= dayEnd(dto.date).getTime() + 86_400_000) {
      throw new BadRequestException('startedAt must fall on the given date (one day of timezone slack allowed)');
    }

    const [segments, others] = await Promise.all([
      this.prisma.activitySegment.findMany({
        where: { employeeId, startedAt: { lt: end }, endedAt: { gt: start }, kind: { in: ['active', 'idle'] } },
        select: { startedAt: true, endedAt: true },
        take: 1,
      }),
      this.prisma.manualTimeEntry.findMany({
        where: { employeeId, status: { not: ManualTimeStatus.REJECTED }, startedAt: { lt: end }, endedAt: { gt: start } },
        select: { startedAt: true, endedAt: true },
        take: 1,
      }),
    ]);
    const clash = [...segments, ...others].find((x) => overlaps(start, end, x.startedAt, x.endedAt));
    if (clash) {
      throw new ConflictException({ code: ErrorCodes.MANUAL_TIME_OVERLAP, message: 'The time overlaps tracked activity or another manual entry.', details: { startedAt: clash.startedAt, endedAt: clash.endedAt } });
    }

    const entry = await this.prisma.manualTimeEntry.create({
      data: {
        companyId: scope.companyId,
        employeeId,
        date,
        startedAt: start,
        endedAt: end,
        durationS: Math.floor((end.getTime() - start.getTime()) / 1000),
        reason: dto.reason,
        status: ManualTimeStatus.PENDING,
      },
    });

    // Notify the employee's manager when one exists (F27)
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true, firstName: true, lastName: true } });
    if (employee?.managerId && employee.managerId !== actorId) {
      await this.notifications.sendNotification(employee.managerId, NotificationType.CORRECTION_REQUESTED, 'Manual time to approve', `${employee.firstName} ${employee.lastName} added ${Math.round(entry.durationS / 60)} minutes for ${dto.date}`, { manualTimeId: entry.id });
    }
    return entry;
  }

  async decide(scope: ScopeFilter, actorId: string, id: string, dto: DecideManualTimeDto) {
    const entry = await this.prisma.manualTimeEntry.findFirst({ where: { id, companyId: scope.companyId } });
    if (!entry) throw new NotFoundException('Manual time entry not found');
    if (scope.scope !== 'all' && !scope.allowedEmployeeIds.includes(entry.employeeId)) throw new NotFoundException('Manual time entry not found');
    if (entry.status !== ManualTimeStatus.PENDING) {
      throw new ConflictException({ code: ErrorCodes.MANUAL_TIME_INVALID_STATE, message: `Entry is already ${entry.status}` });
    }
    const now = this.clock.now();
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.manualTimeEntry.update({ where: { id }, data: { status: dto.status, decidedBy: actorId, decidedAt: now, comment: dto.comment ?? null } });
      if (dto.status === ManualTimeStatus.APPROVED) {
        await tx.attendanceDay.upsert({
          where: { employeeId_date: { employeeId: entry.employeeId, date: entry.date } },
          update: { manualSeconds: { increment: entry.durationS } },
          create: { employeeId: entry.employeeId, date: entry.date, status: 'present', manualSeconds: entry.durationS, flags: ['manual_time'] },
        });
      }
      return res;
    });
    await this.notifications.sendNotification(entry.employeeId, NotificationType.CORRECTION_DECIDED, `Manual time ${dto.status}`, `Your manual time for ${entry.date.toISOString().slice(0, 10)} was ${dto.status}${dto.comment ? `: ${dto.comment}` : ''}`, { manualTimeId: id });
    return updated;
  }

  /** Employees may withdraw their own pending entries; approvers may remove any pending entry in scope. */
  async remove(scope: ScopeFilter, actorId: string, id: string, canApprove: boolean) {
    const entry = await this.prisma.manualTimeEntry.findFirst({ where: { id, companyId: scope.companyId } });
    if (!entry) throw new NotFoundException('Manual time entry not found');
    if (entry.status !== ManualTimeStatus.PENDING) throw new ConflictException({ code: ErrorCodes.MANUAL_TIME_INVALID_STATE, message: 'Only pending entries can be deleted' });
    const own = entry.employeeId === actorId;
    const inScope = scope.scope === 'all' || scope.allowedEmployeeIds.includes(entry.employeeId);
    if (!own && !(canApprove && inScope)) throw new ForbiddenException('You can only delete your own pending entries');
    return this.prisma.manualTimeEntry.delete({ where: { id } });
  }
}
