import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateContactDto,
  UpdateContactDto,
  ContactListQueryDto,
  BulkRecordActionDto,
  CrmEntityType,
  CrmActivityType,
  ErrorCodes,
  NotificationType,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { CrmActivitiesService } from './shared/activities.service';
import { RecordTagsService } from './shared/tags.service';
import { CustomFieldsService } from './shared/custom-fields.service';
import { AccountsService } from './accounts.service';
import { assertOwnerInScope, normalizeEmail, normalizePhone, ownerScopeWhere, parseSort, toCursorPage } from './shared/crm.util';

const SORTABLE = ['lastName', 'firstName', 'lastActivityAt', 'createdAt', 'lifecycle'] as const;

@Injectable()
export class ContactsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
    private activities: CrmActivitiesService,
    private tags: RecordTagsService,
    private customFields: CustomFieldsService,
    private accounts: AccountsService,
  ) {}

  async list(scope: ScopeFilter, q: ContactListQueryDto) {
    assertOwnerInScope(scope, q.ownerId);
    const where: Prisma.CrmContactWhereInput = {
      companyId: scope.companyId,
      deletedAt: null,
      ...ownerScopeWhere(scope),
    };
    if (q.ownerId) where.ownerId = q.ownerId;
    if (q.accountId) where.accountId = q.accountId;
    if (q.lifecycle) where.lifecycle = q.lifecycle;
    if (q.tagId) where.id = { in: await this.tags.entityIdsWithTag(scope.companyId, CrmEntityType.CONTACT, q.tagId) };
    if (q.search) {
      const digits = normalizePhone(q.search);
      where.AND = [
        {
          OR: [
            { firstName: { contains: q.search, mode: 'insensitive' } },
            { lastName: { contains: q.search, mode: 'insensitive' } },
            { title: { contains: q.search, mode: 'insensitive' } },
            { account: { name: { contains: q.search, mode: 'insensitive' } } },
            { emails: { some: { emailLower: { contains: q.search.toLowerCase() } } } },
            ...(digits.length >= 4 ? [{ phones: { some: { phoneE164: { contains: digits } } } }] : []),
          ],
        },
      ];
    }

    const rows = await this.prisma.crmContact.findMany({
      where,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [parseSort(q.sort, SORTABLE, { field: 'lastActivityAt', direction: 'desc' }), { id: 'desc' }],
      include: {
        owner: { select: { id: true, code: true, firstName: true, lastName: true } },
        account: { select: { id: true, name: true } },
        emails: { where: { isPrimary: true } },
        phones: { where: { isPrimary: true } },
      },
    });
    const page = toCursorPage(rows, q.limit);
    const tagMap = await this.tags.tagsFor(scope.companyId, CrmEntityType.CONTACT, page.items.map((r) => r.id));
    return { ...page, items: page.items.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] })) };
  }

  async getById(id: string, scope: ScopeFilter) {
    const contact = await this.prisma.crmContact.findFirst({
      where: { id, companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope) },
      include: {
        owner: { select: { id: true, code: true, firstName: true, lastName: true } },
        account: { select: { id: true, name: true, domain: true, lifecycle: true } },
        emails: true,
        phones: true,
        dealLinks: {
          include: {
            deal: {
              select: { id: true, name: true, amount: true, currency: true, probability: true, wonAt: true, lostAt: true,
                stage: { select: { id: true, name: true, type: true } }, deletedAt: true },
            },
          },
        },
      },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    const tagMap = await this.tags.tagsFor(scope.companyId, CrmEntityType.CONTACT, [id]);
    return {
      ...contact,
      deals: contact.dealLinks.filter((l) => !l.deal.deletedAt).map((l) => ({ ...l.deal, role: l.role, isPrimary: l.isPrimary })),
      tags: tagMap.get(id) ?? [],
    };
  }

  async checkDuplicate(companyId: string, phones: string[] = [], emails: string[] = [], excludeId?: string) {
    const normalizedPhones = phones.map(normalizePhone).filter(Boolean);
    const normalizedEmails = emails.map(normalizeEmail).filter(Boolean);
    if (normalizedPhones.length === 0 && normalizedEmails.length === 0) return { hasDuplicates: false, matches: [] };

    const matches = await this.prisma.crmContact.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [
          ...(normalizedPhones.length ? [{ phones: { some: { phoneE164: { in: normalizedPhones } } } }] : []),
          ...(normalizedEmails.length ? [{ emails: { some: { emailLower: { in: normalizedEmails } } } }] : []),
        ],
      },
      select: {
        id: true, firstName: true, lastName: true,
        account: { select: { id: true, name: true } },
        owner: { select: { id: true, code: true, firstName: true, lastName: true } },
      },
      take: 10,
    });
    return { hasDuplicates: matches.length > 0, matches };
  }

  async create(companyId: string, actorId: string, dto: CreateContactDto) {
    return this.createWithTx(this.prisma, companyId, actorId, dto, null);
  }

  /** Also used by lead conversion inside its transaction. */
  async createWithTx(
    tx: Prisma.TransactionClient | PrismaService,
    companyId: string,
    actorId: string,
    dto: CreateContactDto,
    originLeadId: string | null,
  ) {
    if (!dto.allowDuplicate) {
      const dup = await this.checkDuplicate(
        companyId,
        (dto.phones ?? []).map((p) => p.phone),
        (dto.emails ?? []).map((e) => e.email),
      );
      if (dup.hasDuplicates) {
        throw new ConflictException({
          code: ErrorCodes.CONTACT_DUPLICATE,
          message: 'A contact with this phone number or email already exists.',
          details: { matches: dup.matches },
        });
      }
    }
    const custom = await this.customFields.validate(companyId, CrmEntityType.CONTACT, dto.customFields, { partial: false });
    if (dto.tagIds) await this.tags.assertTagsExist(companyId, dto.tagIds);
    if (dto.accountId) await this.accounts.assertAccountExists(companyId, dto.accountId, tx);
    const now = this.clock.now();
    const ownerId = dto.ownerId ?? actorId;

    const run = async (t: Prisma.TransactionClient | PrismaService) => {
      const created = await t.crmContact.create({
        data: {
          companyId,
          firstName: dto.firstName,
          lastName: dto.lastName ?? '',
          title: dto.title ?? null,
          accountId: dto.accountId ?? null,
          ownerId,
          lifecycle: dto.lifecycle,
          address: (dto.address ?? {}) as Prisma.InputJsonValue,
          doNotCall: dto.doNotCall ?? false,
          doNotEmail: dto.doNotEmail ?? false,
          custom: custom as Prisma.InputJsonValue,
          leadId: originLeadId,
          createdBy: actorId,
          lastActivityAt: now,
          phones: dto.phones
            ? { create: dto.phones.map((p, i) => ({ phoneE164: normalizePhone(p.phone), label: p.label ?? 'Mobile', isPrimary: p.isPrimary || i === 0 })) }
            : undefined,
          emails: dto.emails
            ? { create: dto.emails.map((e, i) => ({ emailLower: normalizeEmail(e.email), label: e.label ?? 'Work', isPrimary: e.isPrimary || i === 0 })) }
            : undefined,
        },
      });
      await this.activities.append(t, {
        companyId, entityType: CrmEntityType.CONTACT, entityId: created.id,
        type: originLeadId ? CrmActivityType.CREATED_FROM_LEAD : CrmActivityType.CREATED,
        actorId, data: { ownerId, leadId: originLeadId }, refType: originLeadId ? 'lead' : null, refId: originLeadId, occurredAt: now,
      });
      if (dto.tagIds?.length) await this.tags.setTags(t, companyId, CrmEntityType.CONTACT, created.id, dto.tagIds, actorId, now);
      return created;
    };

    const contact = tx === this.prisma ? await this.prisma.$transaction((t) => run(t)) : await run(tx);
    if (ownerId !== actorId && tx === this.prisma) await this.notifyAssigned(ownerId, contact.id, `${dto.firstName} ${dto.lastName ?? ''}`.trim());
    return contact;
  }

  async update(id: string, scope: ScopeFilter, actorId: string, dto: UpdateContactDto) {
    const existing = await this.getById(id, scope);
    if (dto.phones || dto.emails) {
      const dup = await this.checkDuplicate(
        scope.companyId,
        (dto.phones ?? []).map((p) => p.phone),
        (dto.emails ?? []).map((e) => e.email),
        id,
      );
      if (dup.hasDuplicates) {
        throw new ConflictException({ code: ErrorCodes.CONTACT_DUPLICATE, message: 'Another contact has this phone or email.', details: { matches: dup.matches } });
      }
    }
    const custom = dto.customFields
      ? await this.customFields.validate(scope.companyId, CrmEntityType.CONTACT, dto.customFields, { partial: true })
      : undefined;
    if (dto.tagIds) await this.tags.assertTagsExist(scope.companyId, dto.tagIds);
    if (dto.accountId) await this.accounts.assertAccountExists(scope.companyId, dto.accountId);
    if (dto.ownerId) assertOwnerInScope(scope, dto.ownerId);
    const now = this.clock.now();

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const track = (k: string, from: unknown, to: unknown) => {
      if (to !== undefined && to !== from) changes[k] = { from, to };
    };
    track('firstName', existing.firstName, dto.firstName);
    track('lastName', existing.lastName, dto.lastName);
    track('title', existing.title, dto.title);
    track('lifecycle', existing.lifecycle, dto.lifecycle);
    track('accountId', existing.accountId, dto.accountId);
    track('ownerId', existing.ownerId, dto.ownerId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.phones) {
        await tx.crmContactPhone.deleteMany({ where: { contactId: id } });
        await tx.crmContactPhone.createMany({
          data: dto.phones.map((p, i) => ({ contactId: id, phoneE164: normalizePhone(p.phone), label: p.label ?? 'Mobile', isPrimary: p.isPrimary || i === 0 })),
        });
      }
      if (dto.emails) {
        await tx.crmContactEmail.deleteMany({ where: { contactId: id } });
        await tx.crmContactEmail.createMany({
          data: dto.emails.map((e, i) => ({ contactId: id, emailLower: normalizeEmail(e.email), label: e.label ?? 'Work', isPrimary: e.isPrimary || i === 0 })),
        });
      }
      const updated = await tx.crmContact.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          title: dto.title,
          accountId: dto.accountId,
          ownerId: dto.ownerId,
          lifecycle: dto.lifecycle,
          address: dto.address ? (dto.address as Prisma.InputJsonValue) : undefined,
          doNotCall: dto.doNotCall,
          doNotEmail: dto.doNotEmail,
          custom: custom ? ({ ...(existing.custom as object), ...custom } as Prisma.InputJsonValue) : undefined,
          lastActivityAt: now,
        },
      });
      if (Object.keys(changes).length) {
        await this.activities.append(tx, {
          companyId: scope.companyId, entityType: CrmEntityType.CONTACT, entityId: id,
          type: dto.ownerId && dto.ownerId !== existing.ownerId ? CrmActivityType.ASSIGNED : CrmActivityType.FIELD_CHANGED,
          actorId, data: { changes }, occurredAt: now,
        });
      }
      if (dto.tagIds) await this.tags.setTags(tx, scope.companyId, CrmEntityType.CONTACT, id, dto.tagIds, actorId, now);
      return updated;
    });
  }

  async assign(id: string, scope: ScopeFilter, actorId: string, ownerId: string) {
    const existing = await this.getById(id, scope);
    const now = this.clock.now();
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.crmContact.update({ where: { id }, data: { ownerId, lastActivityAt: now } });
      await this.activities.append(tx, {
        companyId: scope.companyId, entityType: CrmEntityType.CONTACT, entityId: id, type: CrmActivityType.ASSIGNED,
        actorId, data: { previousOwnerId: existing.ownerId, newOwnerId: ownerId }, occurredAt: now,
      });
      return res;
    });
    if (ownerId !== actorId) await this.notifyAssigned(ownerId, id, `${existing.firstName} ${existing.lastName}`.trim());
    return updated;
  }

  async softDelete(id: string, scope: ScopeFilter) {
    await this.getById(id, scope);
    return this.prisma.crmContact.update({ where: { id }, data: { deletedAt: this.clock.now() } });
  }

  async bulk(scope: ScopeFilter, actorId: string, dto: BulkRecordActionDto, perms: { canAssign: boolean; canDelete: boolean }) {
    const rows = await this.prisma.crmContact.findMany({
      where: { id: { in: dto.ids }, companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope) },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    if (ids.length !== dto.ids.length) throw new NotFoundException('One or more contacts were not found');
    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      switch (dto.action) {
        case 'assign':
          if (!perms.canAssign) throw new ForbiddenException('Permission missing: crm.contacts.assign');
          if (!dto.ownerId) throw new ForbiddenException('ownerId is required');
          await tx.crmContact.updateMany({ where: { id: { in: ids } }, data: { ownerId: dto.ownerId, lastActivityAt: now } });
          for (const id of ids) {
            await this.activities.append(tx, {
              companyId: scope.companyId, entityType: CrmEntityType.CONTACT, entityId: id, type: CrmActivityType.ASSIGNED,
              actorId, data: { newOwnerId: dto.ownerId, bulk: true }, occurredAt: now,
            });
          }
          break;
        case 'add_tag':
          if (!dto.tagId) throw new ForbiddenException('tagId is required');
          await this.tags.assertTagsExist(scope.companyId, [dto.tagId]);
          await this.tags.addTag(tx, scope.companyId, CrmEntityType.CONTACT, ids, dto.tagId, actorId, now);
          break;
        case 'remove_tag':
          if (!dto.tagId) throw new ForbiddenException('tagId is required');
          await this.tags.removeTag(tx, scope.companyId, CrmEntityType.CONTACT, ids, dto.tagId, actorId, now);
          break;
        case 'delete':
          if (!perms.canDelete) throw new ForbiddenException('Permission missing: crm.contacts.delete');
          await tx.crmContact.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now } });
          break;
        default:
          throw new ForbiddenException(`Action ${dto.action} is not available for contacts`);
      }
    });
    return { count: ids.length };
  }

  private async notifyAssigned(ownerId: string, contactId: string, name: string) {
    await this.notifications.sendNotification(
      ownerId,
      NotificationType.RECORD_ASSIGNED,
      'Contact assigned',
      `You now own the contact "${name}"`,
      { contactId },
    );
  }
}
