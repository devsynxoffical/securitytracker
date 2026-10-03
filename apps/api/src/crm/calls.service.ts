import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { LogCallDto, CallOutcome } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';

@Injectable()
export class CallsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  /**
   * Logs a call, creates timeline entry, updates lead state/follow-up, and updates metrics (F12).
   */
  async logCall(
    employeeId: string,
    companyId: string,
    dto: LogCallDto,
    scopeFilter: ScopeFilter,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, companyId, deletedAt: null },
    });

    if (!lead) throw new NotFoundException('Lead not found');

    if (
      scopeFilter.scope !== 'all' &&
      !scopeFilter.allowedEmployeeIds.includes(lead.ownerId || '')
    ) {
      throw new ForbiddenException('Cannot log call on lead outside scope');
    }

    if (lead.doNotCall && dto.outcome !== CallOutcome.DO_NOT_CALL) {
      throw new ForbiddenException('This lead is flagged as Do Not Call');
    }

    const now = this.clock.now();
    const isDoNotCall = dto.outcome === CallOutcome.DO_NOT_CALL;

    return this.prisma.$transaction(async (tx) => {
      // 1. Create Call Log
      const callLog = await tx.callLog.create({
        data: {
          leadId: dto.leadId,
          employeeId,
          direction: dto.direction,
          outcome: dto.outcome,
          durationSeconds: dto.durationSeconds,
          notes: dto.notes || null,
          occurredAt: now,
          source: 'manual',
        },
      });

      // 2. Update Lead
      await tx.lead.update({
        where: { id: dto.leadId },
        data: {
          doNotCall: isDoNotCall ? true : lead.doNotCall,
          stageId: dto.newStageId || lead.stageId,
          followUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : lead.followUpAt,
          lastActivityAt: now,
        },
      });

      // 3. Append to Timeline
      await tx.leadTimeline.create({
        data: {
          leadId: dto.leadId,
          actorId: employeeId,
          type: 'call',
          refId: callLog.id,
          data: {
            direction: dto.direction,
            outcome: dto.outcome,
            durationSeconds: dto.durationSeconds,
            notes: dto.notes,
          },
          occurredAt: now,
        },
      });

      // 4. Record Metric Events for Targets (calls_total and calls_connected)
      const attendanceDate = new Date(now.toISOString().split('T')[0]! + 'T00:00:00.000Z');

      await tx.metricEvent.create({
        data: {
          employeeId,
          metricKey: 'calls_total',
          amount: 1,
          occurredAt: now,
          periodDate: attendanceDate,
          refType: 'call_log',
          refId: callLog.id,
        },
      });

      if (dto.outcome === CallOutcome.CONNECTED) {
        await tx.metricEvent.create({
          data: {
            employeeId,
            metricKey: 'calls_connected',
            amount: 1,
            occurredAt: now,
            periodDate: attendanceDate,
            refType: 'call_log_connected',
            refId: callLog.id,
          },
        });
      }

      return callLog;
    });
  }

  async listCalls(
    scopeFilter: ScopeFilter,
    filters?: { leadId?: string; employeeId?: string; from?: string; to?: string },
  ) {
    const where: any = {};

    if (scopeFilter.scope !== 'all') {
      where.employeeId = { in: scopeFilter.allowedEmployeeIds };
    }

    if (filters?.leadId) where.leadId = filters.leadId;
    if (filters?.employeeId) where.employeeId = filters.employeeId;

    if (filters?.from || filters?.to) {
      where.occurredAt = {};
      if (filters.from) where.occurredAt.gte = new Date(filters.from);
      if (filters.to) where.occurredAt.lte = new Date(filters.to);
    }

    return this.prisma.callLog.findMany({
      where,
      include: {
        employee: { select: { id: true, code: true, firstName: true, lastName: true } },
        lead: { select: { id: true, name: true, companyName: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }
}
