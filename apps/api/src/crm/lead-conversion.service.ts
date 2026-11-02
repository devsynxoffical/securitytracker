import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import {
  ConvertLeadDto,
  CrmEntityType,
  CrmActivityType,
  ErrorCodes,
  Lifecycle,
  MetricKey,
  NotificationType,
  StageType,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { TargetsService } from '../targets/targets.service';
import { CrmActivitiesService } from './shared/activities.service';
import { ContactsService } from './contacts.service';
import { AccountsService } from './accounts.service';
import { DealsService } from './deals.service';
import { normalizeDomain, normalizeName, ownerScopeWhere } from './shared/crm.util';

/** F21 - Lead conversion: one transaction creates contact (+ account, + deal) and freezes the lead. */
@Injectable()
export class LeadConversionService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
    private targets: TargetsService,
    private activities: CrmActivitiesService,
    private contacts: ContactsService,
    private accounts: AccountsService,
    private deals: DealsService,
  ) {}

  async convert(leadId: string, scope: ScopeFilter, actorId: string, dto: ConvertLeadDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope) },
      include: {
        phones: true,
        emails: true,
        pipeline: { include: { stages: true } },
        notes: true,
        callLogs: true,
        appointments: true,
        timeline: { orderBy: { occurredAt: 'asc' } },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.convertedAt) {
      throw new ConflictException({ code: ErrorCodes.LEAD_ALREADY_CONVERTED, message: 'This lead was already converted.', details: { contactId: lead.contactId } });
    }
    const ownerId = dto.ownerId ?? lead.ownerId ?? actorId;
    const companyId = scope.companyId;
    const now = this.clock.now();

    // Pre-flight checks outside the transaction (they throw 4xx).
    if (dto.account.mode === 'existing') await this.accounts.assertAccountExists(companyId, dto.account.accountId);
    if (dto.account.mode === 'new' && !dto.allowDuplicate) {
      const dup = await this.accounts.findDuplicate(companyId, dto.account.name, dto.account.domain);
      if (dup) throw new ConflictException({ code: ErrorCodes.ACCOUNT_DUPLICATE, message: 'An account with this name or domain already exists.', details: { match: dup } });
    }
    if (dto.deal) await this.deals.resolveStage(companyId, dto.deal.pipelineId, dto.deal.stageId);
    const wonStage = lead.pipeline.stages.find((s) => s.type === StageType.WON);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Account
      let accountId: string | null = null;
      if (dto.account.mode === 'existing') accountId = dto.account.accountId;
      if (dto.account.mode === 'new') {
        const acc = await tx.crmAccount.create({
          data: {
            companyId,
            name: dto.account.name,
            nameNormalized: normalizeName(dto.account.name),
            domain: normalizeDomain(dto.account.domain),
            ownerId,
            lifecycle: Lifecycle.PROSPECT,
            createdBy: actorId,
            lastActivityAt: now,
          },
        });
        accountId = acc.id;
        await this.activities.append(tx, {
          companyId, entityType: CrmEntityType.ACCOUNT, entityId: acc.id, type: CrmActivityType.CREATED_FROM_LEAD,
          actorId, data: { leadId }, refType: 'lead', refId: leadId, occurredAt: now,
        });
      }

      // 2. Contact (duplicate check honours allowDuplicate)
      const contact = await this.contacts.createWithTx(
        tx,
        companyId,
        actorId,
        {
          firstName: dto.contact.firstName,
          lastName: dto.contact.lastName ?? '',
          title: dto.contact.title,
          accountId: accountId ?? undefined,
          ownerId,
          lifecycle: dto.deal ? Lifecycle.PROSPECT : Lifecycle.LEAD,
          phones: lead.phones.map((p) => ({ phone: p.phoneE164, label: p.label, isPrimary: p.isPrimary })),
          emails: lead.emails.map((e) => ({ email: e.emailLower, label: e.label, isPrimary: e.isPrimary })),
          doNotCall: lead.doNotCall,
          doNotEmail: false,
          allowDuplicate: dto.allowDuplicate,
        },
        leadId,
      );

      // 3. Deal
      let dealId: string | null = null;
      if (dto.deal) {
        const deal = await this.deals.createWithTx(
          tx,
          companyId,
          actorId,
          {
            name: dto.deal.name,
            accountId: accountId ?? undefined,
            contacts: [{ contactId: contact.id, isPrimary: true }],
            pipelineId: dto.deal.pipelineId,
            stageId: dto.deal.stageId,
            amount: dto.deal.amount ?? (lead.value !== null ? Number(lead.value) : undefined),
            currency: dto.deal.currency ?? lead.currency,
            expectedCloseAt: dto.deal.expectedCloseAt,
            ownerId,
          },
          leadId,
        );
        dealId = deal.id;
      }

      // 4. Copy the lead's history onto the contact (and deal) as activities with a reference to the lead.
      const copies = this.historyToActivities(lead, companyId, contact.id, now);
      for (const a of copies) await this.activities.append(tx, a);
      if (dealId) {
        for (const a of copies) await this.activities.append(tx, { ...a, entityId: dealId, entityType: CrmEntityType.DEAL });
      }

      // 5. Freeze the lead
      await tx.lead.update({
        where: { id: leadId },
        data: {
          convertedAt: now,
          contactId: contact.id,
          accountId,
          dealId,
          isClient: true,
          stageId: wonStage ? wonStage.id : lead.stageId,
          wonAt: wonStage && !lead.wonAt ? now : lead.wonAt,
          lastActivityAt: now,
        },
      });
      await this.activities.append(tx, {
        companyId, entityType: CrmEntityType.LEAD, entityId: leadId, type: CrmActivityType.CONVERTED,
        actorId, data: { contactId: contact.id, accountId, dealId }, occurredAt: now,
      });

      return { contactId: contact.id, accountId, dealId };
    });

    await this.targets.recordMetricEvent(companyId, ownerId, MetricKey.LEADS_QUALIFIED, 1, 'lead_converted', leadId, now);
    if (ownerId !== actorId) {
      await this.notifications.sendNotification(ownerId, NotificationType.RECORD_ASSIGNED, 'Lead converted', `Lead "${lead.name}" was converted and assigned to you`, result);
    }
    return result;
  }

  private historyToActivities(
    lead: {
      id: string;
      notes: Array<{ id: string; authorId: string | null; body: string; createdAt: Date }>;
      callLogs: Array<{ id: string; employeeId: string; direction: string; outcome: string; durationSeconds: number; notes: string | null; occurredAt: Date }>;
      appointments: Array<{ id: string; employeeId: string; title: string; startsAt: Date; endsAt: Date; notes: string | null; status: string }>;
      timeline: Array<{ id: string; actorId: string | null; type: string; data: unknown; occurredAt: Date }>;
    },
    companyId: string,
    contactId: string,
    now: Date,
  ) {
    const base = { companyId, entityType: CrmEntityType.CONTACT, entityId: contactId, refType: 'lead', refId: lead.id } as const;
    const out = [
      ...lead.notes.map((n) => ({ ...base, type: CrmActivityType.NOTE, actorId: n.authorId, body: n.body, occurredAt: n.createdAt, data: { copiedFromLead: true } })),
      ...lead.callLogs.map((c) => ({
        ...base, type: CrmActivityType.CALL, actorId: c.employeeId, subject: `${c.direction} call: ${c.outcome}`, body: c.notes,
        status: 'done', completedAt: c.occurredAt, durationSeconds: c.durationSeconds, occurredAt: c.occurredAt, data: { copiedFromLead: true, outcome: c.outcome, direction: c.direction },
      })),
      ...lead.appointments.map((a) => ({
        ...base, type: CrmActivityType.MEETING, actorId: a.employeeId, subject: a.title, body: a.notes,
        status: a.status === 'scheduled' ? 'planned' : a.status === 'done' ? 'done' : 'cancelled',
        dueAt: a.startsAt, occurredAt: a.startsAt, data: { copiedFromLead: true, endsAt: a.endsAt.toISOString() },
      })),
      ...lead.timeline
        .filter((t) => t.type === 'stage_changed' || t.type === 'assigned' || t.type === 'created')
        .map((t) => ({ ...base, type: t.type, actorId: t.actorId, occurredAt: t.occurredAt, data: { copiedFromLead: true, ...(t.data as object) } })),
    ];
    return out.map((a) => ({ ...a, occurredAt: a.occurredAt ?? now }));
  }
}
