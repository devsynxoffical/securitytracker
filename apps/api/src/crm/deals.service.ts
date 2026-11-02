import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateDealDto,
  UpdateDealDto,
  UpdateDealStageDto,
  DealListQueryDto,
  BulkRecordActionDto,
  CrmEntityType,
  CrmActivityType,
  ErrorCodes,
  MetricKey,
  NotificationType,
  PipelineEntity,
  StageType,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { TargetsService } from '../targets/targets.service';
import { CrmActivitiesService } from './shared/activities.service';
import { RecordTagsService } from './shared/tags.service';
import { CustomFieldsService } from './shared/custom-fields.service';
import { AccountsService } from './accounts.service';
import { assertOwnerInScope, ownerScopeWhere, parseSort, toCursorPage } from './shared/crm.util';

const SORTABLE = ['name', 'amount', 'expectedCloseAt', 'lastActivityAt', 'createdAt', 'probability'] as const;

@Injectable()
export class DealsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
    private targets: TargetsService,
    private activities: CrmActivitiesService,
    private tags: RecordTagsService,
    private customFields: CustomFieldsService,
    private accounts: AccountsService,
  ) {}

  async list(scope: ScopeFilter, q: DealListQueryDto) {
    assertOwnerInScope(scope, q.ownerId);
    const where: Prisma.DealWhereInput = { companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope) };
    if (q.ownerId) where.ownerId = q.ownerId;
    if (q.pipelineId) where.pipelineId = q.pipelineId;
    if (q.stageId) where.stageId = q.stageId;
    if (q.accountId) where.accountId = q.accountId;
    if (q.status === 'won') where.wonAt = { not: null };
    if (q.status === 'lost') where.lostAt = { not: null };
    if (q.status === 'open') {
      where.wonAt = null;
      where.lostAt = null;
    }
    if (q.tagId) where.id = { in: await this.tags.entityIdsWithTag(scope.companyId, CrmEntityType.DEAL, q.tagId) };
    if (q.search) {
      where.AND = [{ OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { account: { name: { contains: q.search, mode: 'insensitive' } } }] }];
    }

    const rows = await this.prisma.deal.findMany({
      where,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [parseSort(q.sort, SORTABLE, { field: 'lastActivityAt', direction: 'desc' }), { id: 'desc' }],
      include: {
        owner: { select: { id: true, code: true, firstName: true, lastName: true } },
        account: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, type: true, position: true } },
        pipeline: { select: { id: true, name: true } },
      },
    });
    const page = toCursorPage(rows, q.limit);
    const tagMap = await this.tags.tagsFor(scope.companyId, CrmEntityType.DEAL, page.items.map((r) => r.id));
    return { ...page, items: page.items.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] })) };
  }

  /** Kanban data: every stage of the pipeline with its deals, count, amount total and weighted total (FR-CRM-27). */
  async board(scope: ScopeFilter, pipelineId: string, ownerId?: string) {
    assertOwnerInScope(scope, ownerId);
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, companyId: scope.companyId, entity: PipelineEntity.DEAL },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');

    const where: Prisma.DealWhereInput = { companyId: scope.companyId, deletedAt: null, pipelineId, ...ownerScopeWhere(scope) };
    if (ownerId) where.ownerId = ownerId;
    const deals = await this.prisma.deal.findMany({
      where,
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        account: { select: { id: true, name: true } },
      },
      orderBy: { lastActivityAt: 'desc' },
      take: 2000,
    });
    const tagMap = await this.tags.tagsFor(scope.companyId, CrmEntityType.DEAL, deals.map((d) => d.id));

    let weightedForecast = 0;
    const columns = pipeline.stages.map((stage) => {
      const items = deals.filter((d) => d.stageId === stage.id).map((d) => ({ ...d, tags: tagMap.get(d.id) ?? [] }));
      const total = items.reduce((sum, d) => sum + Number(d.amount ?? 0), 0);
      const weighted = stage.type === StageType.OPEN ? items.reduce((s, d) => s + (Number(d.amount ?? 0) * d.probability) / 100, 0) : 0;
      weightedForecast += weighted;
      return { stage, count: items.length, total, weighted, deals: items };
    });
    return { pipeline: { id: pipeline.id, name: pipeline.name }, columns, weightedForecast };
  }

  async getById(id: string, scope: ScopeFilter) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope) },
      include: {
        owner: { select: { id: true, code: true, firstName: true, lastName: true } },
        account: { select: { id: true, name: true, domain: true, lifecycle: true } },
        stage: true,
        pipeline: { include: { stages: { orderBy: { position: 'asc' } } } },
        lostReason: { select: { id: true, name: true } },
        contacts: {
          include: {
            contact: {
              select: { id: true, firstName: true, lastName: true, title: true,
                emails: { where: { isPrimary: true }, select: { emailLower: true } },
                phones: { where: { isPrimary: true }, select: { phoneE164: true } } },
            },
          },
        },
      },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    const tagMap = await this.tags.tagsFor(scope.companyId, CrmEntityType.DEAL, [id]);
    return { ...deal, tags: tagMap.get(id) ?? [] };
  }

  async create(companyId: string, actorId: string, dto: CreateDealDto) {
    return this.createWithTx(this.prisma, companyId, actorId, dto, null);
  }

  async createWithTx(
    tx: Prisma.TransactionClient | PrismaService,
    companyId: string,
    actorId: string,
    dto: CreateDealDto,
    originLeadId: string | null,
  ) {
    const stage = await this.resolveStage(companyId, dto.pipelineId, dto.stageId);
    const custom = await this.customFields.validate(companyId, CrmEntityType.DEAL, dto.customFields, { partial: false });
    if (dto.tagIds) await this.tags.assertTagsExist(companyId, dto.tagIds);
    if (dto.accountId) await this.accounts.assertAccountExists(companyId, dto.accountId, tx);
    if (dto.contacts?.length) await this.assertContactsExist(companyId, dto.contacts.map((c) => c.contactId), tx);
    const now = this.clock.now();
    const ownerId = dto.ownerId ?? actorId;
    const isWon = stage.type === StageType.WON;
    const isLost = stage.type === StageType.LOST;

    const run = async (t: Prisma.TransactionClient | PrismaService) => {
      const created = await t.deal.create({
        data: {
          companyId,
          name: dto.name,
          accountId: dto.accountId ?? null,
          pipelineId: dto.pipelineId,
          stageId: dto.stageId,
          amount: dto.amount ?? null,
          currency: dto.currency,
          probability: dto.probability ?? stage.probability,
          expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null,
          ownerId,
          wonAt: isWon ? now : null,
          lostAt: isLost ? now : null,
          custom: custom as Prisma.InputJsonValue,
          leadId: originLeadId,
          createdBy: actorId,
          lastActivityAt: now,
          contacts: dto.contacts?.length
            ? { create: dto.contacts.map((c, i) => ({ contactId: c.contactId, role: c.role ?? null, isPrimary: c.isPrimary || i === 0 })) }
            : undefined,
        },
      });
      await this.activities.append(t, {
        companyId, entityType: CrmEntityType.DEAL, entityId: created.id,
        type: originLeadId ? CrmActivityType.CREATED_FROM_LEAD : CrmActivityType.CREATED,
        actorId, data: { ownerId, stageId: dto.stageId, amount: dto.amount ?? null, leadId: originLeadId },
        refType: originLeadId ? 'lead' : null, refId: originLeadId, occurredAt: now,
      });
      if (dto.tagIds?.length) await this.tags.setTags(t, companyId, CrmEntityType.DEAL, created.id, dto.tagIds, actorId, now);
      if (isWon && dto.accountId) await this.accounts.markCustomer(t as Prisma.TransactionClient, dto.accountId, actorId, now);
      return created;
    };

    const deal = tx === this.prisma ? await this.prisma.$transaction((t) => run(t)) : await run(tx);
    if (isWon) await this.recordWon(companyId, ownerId, deal.id, Number(dto.amount ?? 0), now);
    if (ownerId !== actorId && tx === this.prisma) await this.notifyAssigned(ownerId, deal.id, deal.name);
    return deal;
  }

  async update(id: string, scope: ScopeFilter, actorId: string, dto: UpdateDealDto) {
    const existing = await this.getById(id, scope);
    const custom = dto.customFields
      ? await this.customFields.validate(scope.companyId, CrmEntityType.DEAL, dto.customFields, { partial: true })
      : undefined;
    if (dto.tagIds) await this.tags.assertTagsExist(scope.companyId, dto.tagIds);
    if (dto.accountId) await this.accounts.assertAccountExists(scope.companyId, dto.accountId);
    if (dto.contacts?.length) await this.assertContactsExist(scope.companyId, dto.contacts.map((c) => c.contactId));
    if (dto.ownerId) assertOwnerInScope(scope, dto.ownerId);
    const now = this.clock.now();

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const track = (k: string, from: unknown, to: unknown) => {
      if (to !== undefined && to !== from) changes[k] = { from, to };
    };
    track('name', existing.name, dto.name);
    track('amount', existing.amount === null ? null : Number(existing.amount), dto.amount);
    track('probability', existing.probability, dto.probability);
    track('expectedCloseAt', existing.expectedCloseAt?.toISOString() ?? null, dto.expectedCloseAt);
    track('accountId', existing.accountId, dto.accountId);
    track('ownerId', existing.ownerId, dto.ownerId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.contacts) {
        await tx.dealContact.deleteMany({ where: { dealId: id } });
        if (dto.contacts.length) {
          await tx.dealContact.createMany({
            data: dto.contacts.map((c, i) => ({ dealId: id, contactId: c.contactId, role: c.role ?? null, isPrimary: c.isPrimary || i === 0 })),
          });
        }
      }
      const updated = await tx.deal.update({
        where: { id },
        data: {
          name: dto.name,
          accountId: dto.accountId,
          amount: dto.amount,
          currency: dto.currency,
          probability: dto.probability,
          expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : undefined,
          ownerId: dto.ownerId,
          custom: custom ? ({ ...(existing.custom as object), ...custom } as Prisma.InputJsonValue) : undefined,
          lastActivityAt: now,
        },
      });
      if (Object.keys(changes).length) {
        await this.activities.append(tx, {
          companyId: scope.companyId, entityType: CrmEntityType.DEAL, entityId: id,
          type: dto.ownerId && dto.ownerId !== existing.ownerId ? CrmActivityType.ASSIGNED : CrmActivityType.FIELD_CHANGED,
          actorId, data: { changes }, occurredAt: now,
        });
      }
      if (dto.tagIds) await this.tags.setTags(tx, scope.companyId, CrmEntityType.DEAL, id, dto.tagIds, actorId, now);
      return updated;
    });
  }

  /** F22: any stage to any stage; lost needs a reason; won marks the account as customer and records metrics. */
  async updateStage(id: string, scope: ScopeFilter, actorId: string, dto: UpdateDealStageDto, canReopen: boolean) {
    const deal = await this.getById(id, scope);
    const stage = await this.resolveStage(scope.companyId, deal.pipelineId, dto.stageId);
    const wasClosed = Boolean(deal.wonAt || deal.lostAt);
    if (wasClosed && stage.type === StageType.OPEN && !canReopen) {
      throw new ForbiddenException('Permission missing: crm.deals.reopen');
    }
    const isWon = stage.type === StageType.WON;
    const isLost = stage.type === StageType.LOST;
    if (isLost && !dto.lostReasonId) {
      throw new UnprocessableEntityException({ code: ErrorCodes.LOST_REASON_REQUIRED, message: 'A lost reason is required.' });
    }
    if (dto.lostReasonId) {
      const reason = await this.prisma.lostReason.findFirst({ where: { id: dto.lostReasonId, companyId: scope.companyId } });
      if (!reason) throw new NotFoundException('Lost reason not found');
    }
    const now = this.clock.now();

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.deal.update({
        where: { id },
        data: {
          stageId: dto.stageId,
          probability: stage.probability,
          wonAt: isWon ? now : null,
          lostAt: isLost ? now : null,
          lostReasonId: isLost ? dto.lostReasonId : null,
          lastActivityAt: now,
        },
      });
      await this.activities.append(tx, {
        companyId: scope.companyId, entityType: CrmEntityType.DEAL, entityId: id, type: CrmActivityType.STAGE_CHANGED, actorId,
        data: { fromStageId: deal.stageId, fromStageName: deal.stage.name, toStageId: stage.id, toStageName: stage.name, stageType: stage.type, lostReasonId: dto.lostReasonId ?? null },
        occurredAt: now,
      });
      if (isWon && deal.accountId) await this.accounts.markCustomer(tx, deal.accountId, actorId, now);
      return res;
    });

    if (isWon && !deal.wonAt) {
      await this.recordWon(scope.companyId, deal.ownerId ?? actorId, deal.id, Number(deal.amount ?? 0), now);
    }
    if (stage.countsAsQualified) {
      await this.targets.recordMetricEvent(scope.companyId, deal.ownerId ?? actorId, MetricKey.LEADS_QUALIFIED, 1, 'deal_qualified', deal.id, now);
    }
    return updated;
  }

  async assign(id: string, scope: ScopeFilter, actorId: string, ownerId: string) {
    const existing = await this.getById(id, scope);
    const now = this.clock.now();
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.deal.update({ where: { id }, data: { ownerId, lastActivityAt: now } });
      await this.activities.append(tx, {
        companyId: scope.companyId, entityType: CrmEntityType.DEAL, entityId: id, type: CrmActivityType.ASSIGNED,
        actorId, data: { previousOwnerId: existing.ownerId, newOwnerId: ownerId }, occurredAt: now,
      });
      return res;
    });
    if (ownerId !== actorId) await this.notifyAssigned(ownerId, id, existing.name);
    return updated;
  }

  async softDelete(id: string, scope: ScopeFilter) {
    await this.getById(id, scope);
    return this.prisma.deal.update({ where: { id }, data: { deletedAt: this.clock.now() } });
  }

  async bulk(scope: ScopeFilter, actorId: string, dto: BulkRecordActionDto, perms: { canAssign: boolean; canDelete: boolean; canReopen: boolean }) {
    const rows = await this.prisma.deal.findMany({
      where: { id: { in: dto.ids }, companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope) },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    if (ids.length !== dto.ids.length) throw new NotFoundException('One or more deals were not found');
    const now = this.clock.now();

    if (dto.action === 'stage') {
      if (!dto.stageId) throw new BadRequestException('stageId is required');
      for (const id of ids) {
        await this.updateStage(id, scope, actorId, { stageId: dto.stageId, lostReasonId: dto.lostReasonId }, perms.canReopen);
      }
      return { count: ids.length };
    }

    await this.prisma.$transaction(async (tx) => {
      switch (dto.action) {
        case 'assign':
          if (!perms.canAssign) throw new ForbiddenException('Permission missing: crm.deals.assign');
          if (!dto.ownerId) throw new BadRequestException('ownerId is required');
          await tx.deal.updateMany({ where: { id: { in: ids } }, data: { ownerId: dto.ownerId, lastActivityAt: now } });
          for (const id of ids) {
            await this.activities.append(tx, {
              companyId: scope.companyId, entityType: CrmEntityType.DEAL, entityId: id, type: CrmActivityType.ASSIGNED,
              actorId, data: { newOwnerId: dto.ownerId, bulk: true }, occurredAt: now,
            });
          }
          break;
        case 'add_tag':
          if (!dto.tagId) throw new BadRequestException('tagId is required');
          await this.tags.assertTagsExist(scope.companyId, [dto.tagId]);
          await this.tags.addTag(tx, scope.companyId, CrmEntityType.DEAL, ids, dto.tagId, actorId, now);
          break;
        case 'remove_tag':
          if (!dto.tagId) throw new BadRequestException('tagId is required');
          await this.tags.removeTag(tx, scope.companyId, CrmEntityType.DEAL, ids, dto.tagId, actorId, now);
          break;
        case 'delete':
          if (!perms.canDelete) throw new ForbiddenException('Permission missing: crm.deals.delete');
          await tx.deal.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now } });
          break;
        default:
          throw new BadRequestException(`Action ${dto.action} is not available for deals`);
      }
    });
    return { count: ids.length };
  }

  /** Pipeline must belong to the company, be a deal pipeline, and own the stage (PIPELINE_ENTITY_MISMATCH). */
  async resolveStage(companyId: string, pipelineId: string, stageId: string) {
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: stageId, pipelineId, pipeline: { companyId } },
      include: { pipeline: { select: { entity: true } } },
    });
    if (!stage) throw new NotFoundException('Stage not found in this pipeline');
    if (stage.pipeline.entity !== PipelineEntity.DEAL) {
      throw new UnprocessableEntityException({ code: ErrorCodes.PIPELINE_ENTITY_MISMATCH, message: 'This pipeline is not a deal pipeline.' });
    }
    return stage;
  }

  private async assertContactsExist(companyId: string, ids: string[], tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const count = await tx.crmContact.count({ where: { companyId, deletedAt: null, id: { in: ids } } });
    if (count !== new Set(ids).size) throw new NotFoundException('One or more contacts do not exist');
  }

  private async recordWon(companyId: string, ownerId: string, dealId: string, amount: number, at: Date) {
    await this.targets.recordMetricEvent(companyId, ownerId, MetricKey.CLOSINGS, 1, 'deal_won', dealId, at);
    if (amount > 0) await this.targets.recordMetricEvent(companyId, ownerId, MetricKey.REVENUE_WON, amount, 'deal_revenue_won', dealId, at);
  }

  private async notifyAssigned(ownerId: string, dealId: string, name: string) {
    await this.notifications.sendNotification(ownerId, NotificationType.RECORD_ASSIGNED, 'Deal assigned', `You now own the deal "${name}"`, { dealId });
  }
}
