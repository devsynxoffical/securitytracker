import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateAccountDto,
  UpdateAccountDto,
  AccountListQueryDto,
  BulkRecordActionDto,
  CrmEntityType,
  CrmActivityType,
  ErrorCodes,
  Lifecycle,
  NotificationType,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { CrmActivitiesService } from './shared/activities.service';
import { RecordTagsService } from './shared/tags.service';
import { CustomFieldsService } from './shared/custom-fields.service';
import { assertOwnerInScope, normalizeDomain, normalizeName, parseSort, toCursorPage } from './shared/crm.util';

const SORTABLE = ['name', 'lastActivityAt', 'createdAt', 'lifecycle'] as const;

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
    private activities: CrmActivitiesService,
    private tags: RecordTagsService,
    private customFields: CustomFieldsService,
  ) {}

  /** Account scope: owner in scope, or any contact or deal on the account owned in scope (13 section 1 rule 5). */
  private scopeWhere(scope: ScopeFilter): Prisma.CrmAccountWhereInput {
    if (scope.scope === 'all') return {};
    const ids = scope.allowedEmployeeIds;
    return {
      OR: [
        { ownerId: { in: ids } },
        { contacts: { some: { ownerId: { in: ids }, deletedAt: null } } },
        { deals: { some: { ownerId: { in: ids }, deletedAt: null } } },
      ],
    };
  }

  async list(scope: ScopeFilter, q: AccountListQueryDto) {
    assertOwnerInScope(scope, q.ownerId);
    const where: Prisma.CrmAccountWhereInput = {
      companyId: scope.companyId,
      deletedAt: null,
      ...this.scopeWhere(scope),
    };
    if (q.ownerId) where.ownerId = q.ownerId;
    if (q.lifecycle) where.lifecycle = q.lifecycle;
    if (q.industry) where.industry = q.industry;
    if (q.tagId) where.id = { in: await this.tags.entityIdsWithTag(scope.companyId, CrmEntityType.ACCOUNT, q.tagId) };
    if (q.search) {
      where.AND = [
        {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { domain: { contains: q.search, mode: 'insensitive' } },
            { phone: { contains: q.search } },
          ],
        },
      ];
    }

    const rows = await this.prisma.crmAccount.findMany({
      where,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [parseSort(q.sort, SORTABLE, { field: 'lastActivityAt', direction: 'desc' }), { id: 'desc' }],
      include: {
        owner: { select: { id: true, code: true, firstName: true, lastName: true } },
        _count: { select: { contacts: { where: { deletedAt: null } }, deals: { where: { deletedAt: null } } } },
      },
    });
    const page = toCursorPage(rows, q.limit);
    const tagMap = await this.tags.tagsFor(scope.companyId, CrmEntityType.ACCOUNT, page.items.map((r) => r.id));
    return { ...page, items: page.items.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] })) };
  }

  async getById(id: string, scope: ScopeFilter) {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id, companyId: scope.companyId, deletedAt: null, ...this.scopeWhere(scope) },
      include: {
        owner: { select: { id: true, code: true, firstName: true, lastName: true } },
        parentAccount: { select: { id: true, name: true } },
        childAccounts: { where: { deletedAt: null }, select: { id: true, name: true, lifecycle: true } },
        contacts: {
          where: { deletedAt: null },
          select: { id: true, firstName: true, lastName: true, title: true, lifecycle: true, ownerId: true,
            emails: { where: { isPrimary: true }, select: { emailLower: true } },
            phones: { where: { isPrimary: true }, select: { phoneE164: true } } },
          orderBy: { lastName: 'asc' },
        },
        deals: {
          where: { deletedAt: null },
          select: { id: true, name: true, amount: true, currency: true, probability: true, expectedCloseAt: true, wonAt: true, lostAt: true,
            stage: { select: { id: true, name: true, type: true } }, owner: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { lastActivityAt: 'desc' },
        },
      },
    });
    if (!account) throw new NotFoundException('Account not found');
    const tagMap = await this.tags.tagsFor(scope.companyId, CrmEntityType.ACCOUNT, [id]);
    return { ...account, tags: tagMap.get(id) ?? [] };
  }

  async findDuplicate(companyId: string, name: string, domain?: string | null, excludeId?: string) {
    const nameNormalized = normalizeName(name);
    const dom = normalizeDomain(domain);
    return this.prisma.crmAccount.findFirst({
      where: {
        companyId,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [{ nameNormalized }, ...(dom ? [{ domain: dom }] : [])],
      },
      select: { id: true, name: true, domain: true },
    });
  }

  async create(companyId: string, actorId: string, dto: CreateAccountDto) {
    if (!dto.allowDuplicate) {
      const dup = await this.findDuplicate(companyId, dto.name, dto.domain);
      if (dup) {
        throw new ConflictException({
          code: ErrorCodes.ACCOUNT_DUPLICATE,
          message: 'An account with this name or domain already exists.',
          details: { match: dup },
        });
      }
    }
    const custom = await this.customFields.validate(companyId, CrmEntityType.ACCOUNT, dto.customFields, { partial: false });
    if (dto.tagIds) await this.tags.assertTagsExist(companyId, dto.tagIds);
    if (dto.parentAccountId) await this.assertAccountExists(companyId, dto.parentAccountId);
    const now = this.clock.now();
    const ownerId = dto.ownerId ?? actorId;

    const account = await this.prisma.$transaction(async (tx) => {
      const created = await tx.crmAccount.create({
        data: {
          companyId,
          name: dto.name,
          nameNormalized: normalizeName(dto.name),
          domain: normalizeDomain(dto.domain),
          industry: dto.industry ?? null,
          size: dto.size ?? null,
          phone: dto.phone ?? null,
          website: dto.website ?? null,
          address: (dto.address ?? {}) as Prisma.InputJsonValue,
          ownerId,
          lifecycle: dto.lifecycle,
          parentAccountId: dto.parentAccountId ?? null,
          custom: custom as Prisma.InputJsonValue,
          createdBy: actorId,
          lastActivityAt: now,
        },
      });
      await this.activities.append(tx, {
        companyId, entityType: CrmEntityType.ACCOUNT, entityId: created.id, type: CrmActivityType.CREATED,
        actorId, data: { name: dto.name, ownerId }, occurredAt: now,
      });
      if (dto.tagIds?.length) {
        await this.tags.setTags(tx, companyId, CrmEntityType.ACCOUNT, created.id, dto.tagIds, actorId, now);
      }
      return created;
    });
    if (ownerId !== actorId) await this.notifyAssigned(ownerId, account.id, account.name);
    return account;
  }

  async update(id: string, scope: ScopeFilter, actorId: string, dto: UpdateAccountDto) {
    const existing = await this.getById(id, scope);
    if (dto.name || dto.domain !== undefined) {
      const dup = await this.findDuplicate(scope.companyId, dto.name ?? existing.name, dto.domain ?? existing.domain, id);
      if (dup) {
        throw new ConflictException({ code: ErrorCodes.ACCOUNT_DUPLICATE, message: 'Another account has this name or domain.', details: { match: dup } });
      }
    }
    const custom = dto.customFields
      ? await this.customFields.validate(scope.companyId, CrmEntityType.ACCOUNT, dto.customFields, { partial: true })
      : undefined;
    if (dto.tagIds) await this.tags.assertTagsExist(scope.companyId, dto.tagIds);
    if (dto.parentAccountId) await this.assertAccountExists(scope.companyId, dto.parentAccountId);
    if (dto.ownerId) assertOwnerInScope(scope, dto.ownerId);
    const now = this.clock.now();

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const track = (k: string, from: unknown, to: unknown) => {
      if (to !== undefined && to !== from) changes[k] = { from, to };
    };
    track('name', existing.name, dto.name);
    track('lifecycle', existing.lifecycle, dto.lifecycle);
    track('industry', existing.industry, dto.industry);
    track('ownerId', existing.ownerId, dto.ownerId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.crmAccount.update({
        where: { id },
        data: {
          name: dto.name,
          nameNormalized: dto.name ? normalizeName(dto.name) : undefined,
          domain: dto.domain !== undefined ? normalizeDomain(dto.domain) : undefined,
          industry: dto.industry,
          size: dto.size,
          phone: dto.phone,
          website: dto.website,
          address: dto.address ? (dto.address as Prisma.InputJsonValue) : undefined,
          ownerId: dto.ownerId,
          lifecycle: dto.lifecycle,
          parentAccountId: dto.parentAccountId,
          custom: custom ? ({ ...(existing.custom as object), ...custom } as Prisma.InputJsonValue) : undefined,
          lastActivityAt: now,
        },
      });
      if (Object.keys(changes).length) {
        await this.activities.append(tx, {
          companyId: scope.companyId, entityType: CrmEntityType.ACCOUNT, entityId: id,
          type: dto.ownerId && dto.ownerId !== existing.ownerId ? CrmActivityType.ASSIGNED : CrmActivityType.FIELD_CHANGED,
          actorId, data: { changes }, occurredAt: now,
        });
      }
      if (dto.tagIds) await this.tags.setTags(tx, scope.companyId, CrmEntityType.ACCOUNT, id, dto.tagIds, actorId, now);
      return updated;
    });
  }

  async assign(id: string, scope: ScopeFilter, actorId: string, ownerId: string) {
    const existing = await this.getById(id, scope);
    const now = this.clock.now();
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.crmAccount.update({ where: { id }, data: { ownerId, lastActivityAt: now } });
      await this.activities.append(tx, {
        companyId: scope.companyId, entityType: CrmEntityType.ACCOUNT, entityId: id, type: CrmActivityType.ASSIGNED,
        actorId, data: { previousOwnerId: existing.ownerId, newOwnerId: ownerId }, occurredAt: now,
      });
      return res;
    });
    if (ownerId !== actorId) await this.notifyAssigned(ownerId, id, existing.name);
    return updated;
  }

  async softDelete(id: string, scope: ScopeFilter) {
    await this.getById(id, scope);
    return this.prisma.crmAccount.update({ where: { id }, data: { deletedAt: this.clock.now() } });
  }

  async bulk(scope: ScopeFilter, actorId: string, dto: BulkRecordActionDto, perms: { canAssign: boolean; canDelete: boolean }) {
    const rows = await this.prisma.crmAccount.findMany({
      where: { id: { in: dto.ids }, companyId: scope.companyId, deletedAt: null, ...this.scopeWhere(scope) },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    if (ids.length !== dto.ids.length) throw new NotFoundException('One or more accounts were not found');
    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      switch (dto.action) {
        case 'assign':
          if (!perms.canAssign) throw new ForbiddenException('Permission missing: crm.accounts.assign');
          if (!dto.ownerId) throw new ForbiddenException('ownerId is required');
          await tx.crmAccount.updateMany({ where: { id: { in: ids } }, data: { ownerId: dto.ownerId, lastActivityAt: now } });
          for (const id of ids) {
            await this.activities.append(tx, {
              companyId: scope.companyId, entityType: CrmEntityType.ACCOUNT, entityId: id, type: CrmActivityType.ASSIGNED,
              actorId, data: { newOwnerId: dto.ownerId, bulk: true }, occurredAt: now,
            });
          }
          break;
        case 'add_tag':
          if (!dto.tagId) throw new ForbiddenException('tagId is required');
          await this.tags.assertTagsExist(scope.companyId, [dto.tagId]);
          await this.tags.addTag(tx, scope.companyId, CrmEntityType.ACCOUNT, ids, dto.tagId, actorId, now);
          break;
        case 'remove_tag':
          if (!dto.tagId) throw new ForbiddenException('tagId is required');
          await this.tags.removeTag(tx, scope.companyId, CrmEntityType.ACCOUNT, ids, dto.tagId, actorId, now);
          break;
        case 'delete':
          if (!perms.canDelete) throw new ForbiddenException('Permission missing: crm.accounts.delete');
          await tx.crmAccount.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now } });
          break;
        default:
          throw new ForbiddenException(`Action ${dto.action} is not available for accounts`);
      }
    });
    return { count: ids.length };
  }

  /** Called by DealsService when a deal is won (F22). */
  async markCustomer(tx: Prisma.TransactionClient, accountId: string, actorId: string, at: Date) {
    const acc = await tx.crmAccount.findUnique({ where: { id: accountId }, select: { companyId: true, lifecycle: true } });
    if (!acc || acc.lifecycle === Lifecycle.CUSTOMER) return;
    await tx.crmAccount.update({ where: { id: accountId }, data: { lifecycle: Lifecycle.CUSTOMER, lastActivityAt: at } });
    await this.activities.append(tx, {
      companyId: acc.companyId, entityType: CrmEntityType.ACCOUNT, entityId: accountId, type: CrmActivityType.FIELD_CHANGED,
      actorId, data: { changes: { lifecycle: { from: acc.lifecycle, to: Lifecycle.CUSTOMER } }, reason: 'deal_won' }, occurredAt: at,
    });
  }

  /** Pass the transaction client when the account may have been created in the same transaction. */
  async assertAccountExists(companyId: string, id: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const acc = await tx.crmAccount.findFirst({ where: { id, companyId, deletedAt: null }, select: { id: true } });
    if (!acc) throw new NotFoundException('Account not found');
  }

  private async notifyAssigned(ownerId: string, accountId: string, name: string) {
    await this.notifications.sendNotification(
      ownerId,
      NotificationType.RECORD_ASSIGNED,
      'Account assigned',
      `You now own the account "${name}"`,
      { accountId },
    );
  }
}
