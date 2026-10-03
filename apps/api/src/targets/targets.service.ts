import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service.js';
import { ClockService } from '../common/clock.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationsGateway } from '../notifications/notifications.gateway.js';
import {
  CreateTargetDto,
  UpdateTargetDto,
  WebSocketEvents,
  TargetAssigneeType,
  TargetPeriod,
  NotificationType,
} from '@company-os/contracts';
import { Prisma } from '@prisma/client';

@Injectable()
export class TargetsService {
  private readonly logger = new Logger(TargetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly notificationsService: NotificationsService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async createTarget(companyId: string, createdBy: string, dto: CreateTargetDto) {
    const target = await this.prisma.target.create({
      data: {
        companyId,
        assigneeType: dto.assigneeType,
        assigneeId: dto.assigneeId,
        metricKey: dto.metricKey,
        period: dto.period,
        value: new Prisma.Decimal(dto.value),
        weekdays: dto.weekdays || [],
        validFrom: new Date(dto.validFrom),
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        createdBy,
        createdAt: this.clock.now(),
      },
    });

    return target;
  }

  async updateTarget(companyId: string, targetId: string, dto: UpdateTargetDto) {
    const target = await this.prisma.target.findFirst({
      where: { id: targetId, companyId },
    });

    if (!target) {
      throw new NotFoundException('Target not found');
    }

    return this.prisma.target.update({
      where: { id: targetId },
      data: {
        ...(dto.value !== undefined ? { value: new Prisma.Decimal(dto.value) } : {}),
        ...(dto.weekdays !== undefined ? { weekdays: dto.weekdays } : {}),
        ...(dto.validTo !== undefined
          ? { validTo: dto.validTo ? new Date(dto.validTo) : null }
          : {}),
      },
    });
  }

  async deleteTarget(companyId: string, targetId: string) {
    const target = await this.prisma.target.findFirst({
      where: { id: targetId, companyId },
    });

    if (!target) {
      throw new NotFoundException('Target not found');
    }

    await this.prisma.target.delete({
      where: { id: targetId },
    });

    return { success: true };
  }

  async listTargets(companyId: string, assigneeType?: string, assigneeId?: string) {
    return this.prisma.target.findMany({
      where: {
        companyId,
        ...(assigneeType ? { assigneeType } : {}),
        ...(assigneeId ? { assigneeId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recordMetricEvent(
    companyId: string,
    employeeId: string,
    metricKey: string,
    amount = 1.0,
    refType: string,
    refId: string,
    occurredAt?: Date,
  ) {
    const eventTime = occurredAt || this.clock.now();
    const periodDate = new Date(
      Date.UTC(eventTime.getUTCFullYear(), eventTime.getUTCMonth(), eventTime.getUTCDate()),
    );

    try {
      // Upsert/Insert idempotent metric event
      const metricEvent = await this.prisma.metricEvent.create({
        data: {
          employeeId,
          metricKey,
          amount: new Prisma.Decimal(amount),
          occurredAt: eventTime,
          periodDate,
          refType,
          refId,
        },
      });

      // Recalculate progress and notify if needed
      await this.evaluateEmployeeTargets(companyId, employeeId, metricKey, periodDate);

      return metricEvent;
    } catch (err: any) {
      // Unique constraint violation means this event was already recorded (idempotent)
      if (err.code === 'P2002') {
        this.logger.debug(
          `Duplicate metric event skipped: ${metricKey} ${refType}:${refId}`,
        );
        return null;
      }
      throw err;
    }
  }

  async getEmployeeTargetProgress(
    companyId: string,
    employeeId: string,
    referenceDate?: Date,
  ) {
    const targetDate = referenceDate || this.clock.now();
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { role: true },
    });

    if (!employee || employee.companyId !== companyId) {
      throw new NotFoundException('Employee not found');
    }

    // Find applicable targets:
    // 1. Direct employee targets
    // 2. Team targets (if in team)
    // 3. Role targets
    const targets = await this.prisma.target.findMany({
      where: {
        companyId,
        validFrom: { lte: targetDate },
        OR: [{ validTo: null }, { validTo: { gte: targetDate } }],
        AND: [
          {
            OR: [
              { assigneeType: TargetAssigneeType.EMPLOYEE, assigneeId: employeeId },
              ...(employee.teamId
                ? [{ assigneeType: TargetAssigneeType.TEAM, assigneeId: employee.teamId }]
                : []),
              { assigneeType: TargetAssigneeType.ROLE, assigneeId: employee.roleId },
            ],
          },
        ],
      },
    });

    // Dedup targets: Employee target overrides Role target for same metricKey + period
    const targetMap = new Map<string, (typeof targets)[0]>();
    for (const t of targets) {
      const key = `${t.metricKey}:${t.period}`;
      const existing = targetMap.get(key);
      if (!existing) {
        targetMap.set(key, t);
      } else if (
        existing.assigneeType === TargetAssigneeType.ROLE &&
        t.assigneeType === TargetAssigneeType.EMPLOYEE
      ) {
        targetMap.set(key, t);
      }
    }

    const results = [];
    for (const target of targetMap.values()) {
      const { start, end } = this.getPeriodRange(target.period, targetDate);

      // Aggregate metric events
      const aggregates = await this.prisma.metricEvent.aggregate({
        _sum: { amount: true },
        where: {
          employeeId:
            target.assigneeType === TargetAssigneeType.TEAM
              ? undefined // Team sums all members
              : employeeId,
          ...(target.assigneeType === TargetAssigneeType.TEAM && employee.teamId
            ? {
                employeeId: {
                  in: (
                    await this.prisma.employee.findMany({
                      where: { teamId: employee.teamId },
                      select: { id: true },
                    })
                  ).map((e) => e.id),
                },
              }
            : {}),
          metricKey: target.metricKey,
          occurredAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const current = Number(aggregates._sum.amount || 0);
      const targetVal = Number(target.value);
      const percentage = targetVal > 0 ? Math.round((current / targetVal) * 100) : 0;

      results.push({
        targetId: target.id,
        metricKey: target.metricKey,
        period: target.period,
        assigneeType: target.assigneeType,
        targetValue: targetVal,
        currentValue: current,
        percentage,
        isCompleted: percentage >= 100,
      });
    }

    return results;
  }

  private async evaluateEmployeeTargets(
    companyId: string,
    employeeId: string,
    metricKey: string,
    periodDate: Date,
  ) {
    const progressList = await this.getEmployeeTargetProgress(
      companyId,
      employeeId,
      periodDate,
    );

    const relevant = progressList.filter((p) => p.metricKey === metricKey);

    for (const prog of relevant) {
      // Broadcast live progress over WebSocket
      this.gateway.emitToUser(employeeId, WebSocketEvents.TARGET_PROGRESS, {
        targetId: prog.targetId,
        employeeId,
        value: prog.currentValue,
        percentage: prog.percentage,
      });

      // Notification checks
      if (prog.percentage >= 100) {
        await this.notificationsService.sendNotification(
          employeeId,
          NotificationType.TARGET_REACHED,
          'Target Achieved! 🎯',
          `You have achieved 100% of your ${prog.period} ${prog.metricKey} target!`,
          { targetId: prog.targetId, metricKey: prog.metricKey, percentage: prog.percentage },
        );
      } else if (prog.percentage >= 80) {
        await this.notificationsService.sendNotification(
          employeeId,
          NotificationType.TARGET_80_PERCENT,
          'Target Almost Reached! 🚀',
          `You have reached ${prog.percentage}% of your ${prog.period} ${prog.metricKey} target!`,
          { targetId: prog.targetId, metricKey: prog.metricKey, percentage: prog.percentage },
        );
      }
    }
  }

  private getPeriodRange(period: string, date: Date) {
    const d = new Date(date);

    if (period === TargetPeriod.DAILY) {
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
      return { start, end };
    }

    if (period === TargetPeriod.WEEKLY) {
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday start
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0));
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff + 6, 23, 59, 59, 999));
      return { start, end };
    }

    // Monthly
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { start, end };
  }
}
