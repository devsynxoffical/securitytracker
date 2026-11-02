import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CrmEntityType,
  CrmEntityTypeValue,
  CrmActivityType,
  CrmActivityStatus,
  CreateActivityDto,
  AgendaQueryDto,
  MetricKey,
} from '@company-os/contracts';
import { PrismaService } from '../../common/prisma.service';
import { ClockService } from '../../common/clock.service';
import { ScopeFilter } from '../../auth/guards/rbac.guard';
import { TargetsService } from '../../targets/targets.service';
import { ownerScopeWhere, toCursorPage } from './crm.util';

type Tx = Prisma.TransactionClient | PrismaService;

export interface ActivityWrite {
  companyId: string;
  entityType: CrmEntityTypeValue;
  entityId: string;
  type: string;
  actorId: string | null;
  subject?: string | null;
  body?: string | null;
  status?: string | null;
  dueAt?: Date | null;
  completedAt?: Date | null;
  durationSeconds?: number | null;
  data?: Record<string, unknown>;
  refType?: string | null;
  refId?: string | null;
  occurredAt: Date;
}

const SCHEDULABLE = new Set<string>([CrmActivityType.CALL, CrmActivityType.MEETING, CrmActivityType.TASK]);

/**
 * Unified, append-only activity timeline for every CRM object (FR-CRM-21, FR-CRM-22).
 * Other services call `append` inside their own transaction.
 */
@Injectable()
export class CrmActivitiesService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private targets: TargetsService,
  ) {}

  append(tx: Tx, a: ActivityWrite) {
    return tx.crmActivity.create({
      data: {
        companyId: a.companyId,
        entityType: a.entityType,
        entityId: a.entityId,
        type: a.type,
        actorId: a.actorId,
        subject: a.subject ?? null,
        body: a.body ?? null,
        status: a.status ?? null,
        dueAt: a.dueAt ?? null,
        completedAt: a.completedAt ?? null,
        durationSeconds: a.durationSeconds ?? null,
        data: (a.data ?? {}) as Prisma.InputJsonValue,
        refType: a.refType ?? null,
        refId: a.refId ?? null,
        occurredAt: a.occurredAt,
      },
    });
  }

  /** Resolves the parent record under the caller's scope; 404 outside scope. */
  async assertParentInScope(entityType: CrmEntityTypeValue, entityId: string, scope: ScopeFilter) {
    const base = { id: entityId, companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope) };
    let found: { id: string; ownerId: string | null } | null = null;
    switch (entityType) {
      case CrmEntityType.LEAD:
        found = await this.prisma.lead.findFirst({ where: base, select: { id: true, ownerId: true } });
        break;
      case CrmEntityType.CONTACT:
        found = await this.prisma.crmContact.findFirst({ where: base, select: { id: true, ownerId: true } });
        break;
      case CrmEntityType.DEAL:
        found = await this.prisma.deal.findFirst({ where: base, select: { id: true, ownerId: true } });
        break;
      case CrmEntityType.ACCOUNT: {
        const where: Prisma.CrmAccountWhereInput = { id: entityId, companyId: scope.companyId, deletedAt: null };
        if (scope.scope !== 'all') {
          const ids = scope.allowedEmployeeIds;
          where.OR = [
            { ownerId: { in: ids } },
            { contacts: { some: { ownerId: { in: ids }, deletedAt: null } } },
            { deals: { some: { ownerId: { in: ids }, deletedAt: null } } },
          ];
        }
        found = await this.prisma.crmAccount.findFirst({ where, select: { id: true, ownerId: true } });
        break;
      }
    }
    if (!found) throw new NotFoundException('Record not found');
    return found;
  }

  async list(
    scope: ScopeFilter,
    q: { entityType: CrmEntityTypeValue; entityId: string; cursor?: string; limit: number; type?: string },
  ) {
    await this.assertParentInScope(q.entityType, q.entityId, scope);
    const rows = await this.prisma.crmActivity.findMany({
      where: {
        companyId: scope.companyId,
        entityType: q.entityType,
        entityId: q.entityId,
        ...(q.type ? { type: q.type } : {}),
      },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    return toCursorPage(rows, q.limit);
  }

  async create(scope: ScopeFilter, actorId: string, dto: CreateActivityDto) {
    await this.assertParentInScope(dto.entityType, dto.entityId, scope);
    const now = this.clock.now();
    const schedulable = SCHEDULABLE.has(dto.type);
    const status = schedulable ? dto.status ?? (dto.dueAt ? CrmActivityStatus.PLANNED : CrmActivityStatus.DONE) : null;
    const completedAt = status === CrmActivityStatus.DONE ? now : null;

    const activity = await this.prisma.$transaction(async (tx) => {
      const created = await this.append(tx, {
        companyId: scope.companyId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        type: dto.type,
        actorId,
        subject: dto.subject ?? null,
        body: dto.body ?? null,
        status,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        completedAt,
        durationSeconds: dto.durationSeconds ?? null,
        data: dto.data ?? {},
        occurredAt: now,
      });
      await this.touch(tx, dto.entityType, dto.entityId, now);
      return created;
    });

    if (dto.type === CrmActivityType.MEETING && status !== CrmActivityStatus.CANCELLED) {
      await this.targets.recordMetricEvent(
        scope.companyId,
        actorId,
        MetricKey.MEETINGS_SCHEDULED,
        1,
        'crm_meeting',
        activity.id,
        now,
      );
    }
    return activity;
  }

  async updateStatus(scope: ScopeFilter, actorId: string, id: string, status: string) {
    const activity = await this.prisma.crmActivity.findFirst({ where: { id, companyId: scope.companyId } });
    if (!activity) throw new NotFoundException('Activity not found');
    if (!SCHEDULABLE.has(activity.type)) throw new ForbiddenException('Only calls, meetings and tasks have a status');
    await this.assertParentInScope(activity.entityType as CrmEntityTypeValue, activity.entityId, scope);

    const now = this.clock.now();
    const updated = await this.prisma.crmActivity.update({
      where: { id },
      data: { status, completedAt: status === CrmActivityStatus.DONE ? now : null },
    });
    if (status === CrmActivityStatus.DONE && activity.type === CrmActivityType.TASK && activity.status !== CrmActivityStatus.DONE) {
      await this.targets.recordMetricEvent(
        scope.companyId,
        actorId,
        MetricKey.TASKS_COMPLETED,
        1,
        'crm_activity_task',
        activity.id,
        now,
      );
    }
    return updated;
  }

  /** Agenda across records: today, overdue, upcoming, done (FR-CRM-22). */
  async agenda(scope: ScopeFilter, q: AgendaQueryDto) {
    const now = this.clock.now();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

    const where: Prisma.CrmActivityWhereInput = {
      companyId: scope.companyId,
      type: q.type ? q.type : { in: Array.from(SCHEDULABLE) },
    };
    if (scope.scope !== 'all') where.actorId = { in: scope.allowedEmployeeIds };
    if (q.ownerId) {
      if (scope.scope !== 'all' && !scope.allowedEmployeeIds.includes(q.ownerId)) {
        throw new ForbiddenException('Owner is outside your scope');
      }
      where.actorId = q.ownerId;
    }

    switch (q.range) {
      case 'today':
        where.status = CrmActivityStatus.PLANNED;
        where.dueAt = { gte: startOfDay, lt: endOfDay };
        break;
      case 'overdue':
        where.status = CrmActivityStatus.PLANNED;
        where.dueAt = { lt: startOfDay };
        break;
      case 'upcoming':
        where.status = CrmActivityStatus.PLANNED;
        where.dueAt = { gte: endOfDay };
        break;
      case 'done':
        where.status = CrmActivityStatus.DONE;
        break;
    }

    const rows = await this.prisma.crmActivity.findMany({
      where,
      take: q.limit,
      orderBy: q.range === 'done' ? { completedAt: 'desc' } : { dueAt: 'asc' },
    });
    const enriched = await this.attachParents(scope.companyId, rows);
    return { items: enriched };
  }

  /** Adds a display name for the parent record of each activity. */
  private async attachParents(companyId: string, rows: Array<{ entityType: string; entityId: string }>) {
    const ids = (t: string) => rows.filter((r) => r.entityType === t).map((r) => r.entityId);
    const [leads, contacts, accounts, deals] = await Promise.all([
      this.prisma.lead.findMany({ where: { companyId, id: { in: ids(CrmEntityType.LEAD) } }, select: { id: true, name: true } }),
      this.prisma.crmContact.findMany({
        where: { companyId, id: { in: ids(CrmEntityType.CONTACT) } },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.crmAccount.findMany({ where: { companyId, id: { in: ids(CrmEntityType.ACCOUNT) } }, select: { id: true, name: true } }),
      this.prisma.deal.findMany({ where: { companyId, id: { in: ids(CrmEntityType.DEAL) } }, select: { id: true, name: true } }),
    ]);
    const names = new Map<string, string>();
    leads.forEach((l) => names.set(`lead:${l.id}`, l.name));
    contacts.forEach((c) => names.set(`contact:${c.id}`, `${c.firstName} ${c.lastName}`.trim()));
    accounts.forEach((a) => names.set(`account:${a.id}`, a.name));
    deals.forEach((d) => names.set(`deal:${d.id}`, d.name));
    return rows.map((r) => ({ ...r, entityName: names.get(`${r.entityType}:${r.entityId}`) ?? null }));
  }

  async touch(tx: Tx, entityType: CrmEntityTypeValue, entityId: string, at: Date) {
    const data = { lastActivityAt: at };
    switch (entityType) {
      case CrmEntityType.LEAD:
        return tx.lead.update({ where: { id: entityId }, data });
      case CrmEntityType.CONTACT:
        return tx.crmContact.update({ where: { id: entityId }, data });
      case CrmEntityType.ACCOUNT:
        return tx.crmAccount.update({ where: { id: entityId }, data });
      case CrmEntityType.DEAL:
        return tx.deal.update({ where: { id: entityId }, data });
    }
  }
}
