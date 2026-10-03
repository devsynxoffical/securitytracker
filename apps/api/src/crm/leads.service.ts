import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  CreateLeadDto,
  UpdateLeadDto,
  UpdateLeadStageDto,
  AssignLeadDto,
  BulkAssignLeadsDto,
  AddNoteDto,
  ScheduleAppointmentDto,
  ErrorCodes,
  WebSocketEvents,
  NotificationType,
  MetricKey,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { TargetsService } from '../targets/targets.service';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private targetsService: TargetsService,
  ) {}

  async listLeads(
    scopeFilter: ScopeFilter,
    filters?: {
      ownerId?: string;
      pipelineId?: string;
      stageId?: string;
      isClient?: boolean;
      search?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    const where: any = {
      companyId: scopeFilter.companyId,
      deletedAt: null,
    };

    if (scopeFilter.scope !== 'all') {
      where.ownerId = { in: scopeFilter.allowedEmployeeIds };
    }

    if (filters?.ownerId) {
      if (
        scopeFilter.scope !== 'all' &&
        !scopeFilter.allowedEmployeeIds.includes(filters.ownerId)
      ) {
        throw new ForbiddenException('Access to owner leads outside scope');
      }
      where.ownerId = filters.ownerId;
    }

    if (filters?.pipelineId) where.pipelineId = filters.pipelineId;
    if (filters?.stageId) where.stageId = filters.stageId;
    if (filters?.isClient !== undefined) where.isClient = filters.isClient;

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { companyName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const take = filters?.limit ? Math.min(filters.limit, 200) : 50;

    const leads = await this.prisma.lead.findMany({
      where,
      take: take + 1,
      cursor: filters?.cursor ? { id: filters.cursor } : undefined,
      include: {
        stage: { select: { id: true, name: true, type: true, position: true } },
        owner: { select: { id: true, code: true, firstName: true, lastName: true } },
        phones: { where: { isPrimary: true } },
        emails: { where: { isPrimary: true } },
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    let nextCursor: string | null = null;
    if (leads.length > take) {
      const nextItem = leads.pop();
      nextCursor = nextItem?.id || null;
    }

    return { items: leads, nextCursor };
  }

  async getLeadById(id: string, scopeFilter: ScopeFilter) {
    const where: any = { id, companyId: scopeFilter.companyId, deletedAt: null };

    if (scopeFilter.scope !== 'all') {
      where.ownerId = { in: scopeFilter.allowedEmployeeIds };
    }

    const lead = await this.prisma.lead.findFirst({
      where,
      include: {
        stage: true,
        pipeline: true,
        owner: { select: { id: true, code: true, firstName: true, lastName: true } },
        phones: true,
        emails: true,
        notes: { orderBy: { createdAt: 'desc' } },
        callLogs: { orderBy: { occurredAt: 'desc' } },
        appointments: { orderBy: { startsAt: 'desc' } },
        tasks: { where: { deletedAt: null }, orderBy: { dueAt: 'asc' } },
        timeline: { orderBy: { occurredAt: 'desc' }, take: 100 },
      },
    });

    if (!lead) {
      // Return 404 (do not leak existence outside scope)
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  async checkDuplicate(companyId: string, phones: string[] = [], emails: string[] = []) {
    const normalizedPhones = phones.map((p) => p.replace(/\D/g, '')).filter(Boolean);
    const normalizedEmails = emails.map((e) => e.toLowerCase().trim()).filter(Boolean);

    const matches = await this.prisma.lead.findMany({
      where: {
        companyId,
        deletedAt: null,
        OR: [
          ...(normalizedPhones.length > 0
            ? [{ phones: { some: { phoneE164: { in: normalizedPhones } } } }]
            : []),
          ...(normalizedEmails.length > 0
            ? [{ emails: { some: { emailLower: { in: normalizedEmails } } } }]
            : []),
        ],
      },
      select: {
        id: true,
        name: true,
        companyName: true,
        owner: { select: { code: true, firstName: true, lastName: true } },
      },
    });

    return { hasDuplicates: matches.length > 0, matches };
  }

  async createLead(companyId: string, creatorId: string, dto: CreateLeadDto) {
    // 1. Duplicate check (F10)
    const phoneList = (dto.phones || []).map((p) => p.phone);
    const emailList = (dto.emails || []).map((e) => e.email);

    if (!dto.allowDuplicate && (phoneList.length > 0 || emailList.length > 0)) {
      const duplicateCheck = await this.checkDuplicate(companyId, phoneList, emailList);
      if (duplicateCheck.hasDuplicates) {
        throw new ConflictException({
          code: ErrorCodes.LEAD_DUPLICATE,
          message: 'A lead with this phone number or email already exists.',
          details: { matches: duplicateCheck.matches },
        });
      }
    }

    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          companyId,
          name: dto.name,
          companyName: dto.companyName || null,
          ownerId: dto.ownerId || creatorId,
          pipelineId: dto.pipelineId,
          stageId: dto.stageId,
          sourceId: dto.sourceId || null,
          value: dto.value !== undefined ? dto.value : null,
          currency: dto.currency || 'USD',
          followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : null,
          custom: (dto.customFields as any) || {},
          createdBy: creatorId,
          lastActivityAt: now,
          phones: dto.phones
            ? {
                create: dto.phones.map((p, idx) => ({
                  phoneE164: p.phone.replace(/\D/g, ''),
                  label: p.label || 'Mobile',
                  isPrimary: p.isPrimary ?? idx === 0,
                })),
              }
            : undefined,
          emails: dto.emails
            ? {
                create: dto.emails.map((e, idx) => ({
                  emailLower: e.email.toLowerCase().trim(),
                  label: e.label || 'Work',
                  isPrimary: e.isPrimary ?? idx === 0,
                })),
              }
            : undefined,
        },
      });

      // Append 'created' entry to timeline
      await tx.leadTimeline.create({
        data: {
          leadId: lead.id,
          actorId: creatorId,
          type: 'created',
          data: { name: dto.name, stageId: dto.stageId, ownerId: dto.ownerId || creatorId },
          occurredAt: now,
        },
      });

      // Record Metric Event for Leads Created
      const assignedEmployeeId = dto.ownerId || creatorId;
      await this.targetsService.recordMetricEvent(
        companyId,
        assignedEmployeeId,
        MetricKey.LEADS_CREATED,
        1,
        'lead_created',
        lead.id,
        now,
      );

      return lead;
    });
  }

  async updateLead(
    id: string,
    companyId: string,
    actorId: string,
    dto: UpdateLeadDto,
    scopeFilter: ScopeFilter,
  ) {
    await this.getLeadById(id, scopeFilter); // Scope check

    const now = this.clock.now();

    return this.prisma.lead.update({
      where: { id },
      data: {
        name: dto.name,
        companyName: dto.companyName,
        sourceId: dto.sourceId,
        value: dto.value,
        currency: dto.currency,
        followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : undefined,
        custom: dto.customFields ? (dto.customFields as any) : undefined,
        lastActivityAt: now,
      },
    });
  }

  async updateLeadStage(
    id: string,
    companyId: string,
    actorId: string,
    dto: UpdateLeadStageDto,
    scopeFilter: ScopeFilter,
  ) {
    const lead = await this.getLeadById(id, scopeFilter);

    const targetStage = await this.prisma.pipelineStage.findUnique({
      where: { id: dto.stageId },
    });
    if (!targetStage) throw new NotFoundException('Stage not found');

    const now = this.clock.now();
    const isWon = targetStage.type === 'won';
    const isLost = targetStage.type === 'lost';

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.lead.update({
        where: { id },
        data: {
          stageId: dto.stageId,
          isClient: isWon ? true : lead.isClient,
          wonAt: isWon ? now : lead.wonAt,
          lostAt: isLost ? now : null,
          lostReasonId: isLost ? dto.lostReasonId || null : null,
          qualifiedAt: targetStage.countsAsQualified && !lead.qualifiedAt ? now : lead.qualifiedAt,
          lastActivityAt: now,
        },
      });

      await tx.leadTimeline.create({
        data: {
          leadId: id,
          actorId,
          type: 'stage_changed',
          data: {
            fromStageId: lead.stageId,
            toStageId: dto.stageId,
            stageName: targetStage.name,
            stageType: targetStage.type,
          },
          occurredAt: now,
        },
      });

      return result;
    });

    const ownerId = lead.ownerId || actorId;

    // Record Metric Event for Leads Qualified (once per lead)
    if (targetStage.countsAsQualified && !lead.qualifiedAt) {
      await this.targetsService.recordMetricEvent(
        companyId,
        ownerId,
        MetricKey.LEADS_QUALIFIED,
        1,
        'lead_qualified',
        lead.id,
        now,
      );
    }

    // Record Metric Event for Closings & Revenue Won
    if (isWon && !lead.wonAt) {
      await this.targetsService.recordMetricEvent(
        companyId,
        ownerId,
        MetricKey.CLOSINGS,
        1,
        'lead_won',
        lead.id,
        now,
      );

      if (lead.value && Number(lead.value) > 0) {
        await this.targetsService.recordMetricEvent(
          companyId,
          ownerId,
          MetricKey.REVENUE_WON,
          Number(lead.value),
          'lead_revenue_won',
          lead.id,
          now,
        );
      }
    }

    return updated;
  }

  async assignLead(
    id: string,
    companyId: string,
    actorId: string,
    dto: AssignLeadDto,
    scopeFilter: ScopeFilter,
  ) {
    const lead = await this.getLeadById(id, scopeFilter);
    const now = this.clock.now();
    const prevOwnerId = lead.ownerId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.lead.update({
        where: { id },
        data: { ownerId: dto.ownerId, lastActivityAt: now },
      });

      await tx.leadTimeline.create({
        data: {
          leadId: id,
          actorId,
          type: 'assigned',
          data: { previousOwnerId: prevOwnerId, newOwnerId: dto.ownerId },
          occurredAt: now,
        },
      });

      return res;
    });

    // Notify new owner
    if (dto.ownerId !== actorId) {
      await this.notificationsService.sendNotification(
        dto.ownerId,
        NotificationType.LEAD_ASSIGNED,
        'Lead Assigned',
        `You have been assigned lead: "${lead.name}"`,
        { leadId: lead.id, leadName: lead.name },
      );
    }

    // Notify previous owner if reassigned
    if (prevOwnerId && prevOwnerId !== dto.ownerId && prevOwnerId !== actorId) {
      await this.notificationsService.sendNotification(
        prevOwnerId,
        NotificationType.LEAD_ASSIGNED,
        'Lead Reassigned',
        `Lead "${lead.name}" was reassigned to another team member`,
        { leadId: lead.id, leadName: lead.name },
      );
    }

    // Broadcast WebSocket event
    this.gateway.emitToUser(dto.ownerId, WebSocketEvents.LEAD_ASSIGNED, {
      leadId: lead.id,
      assignedTo: dto.ownerId,
    });

    return updated;
  }

  async bulkAssignLeads(
    companyId: string,
    actorId: string,
    dto: BulkAssignLeadsDto,
  ) {
    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      await tx.lead.updateMany({
        where: { id: { in: dto.leadIds }, companyId },
        data: { ownerId: dto.ownerId, lastActivityAt: now },
      });

      for (const leadId of dto.leadIds) {
        await tx.leadTimeline.create({
          data: {
            leadId,
            actorId,
            type: 'assigned',
            data: { newOwnerId: dto.ownerId, bulk: true },
            occurredAt: now,
          },
        });
      }

      return { success: true, count: dto.leadIds.length };
    });
  }

  async addNote(
    leadId: string,
    companyId: string,
    authorId: string,
    dto: AddNoteDto,
    scopeFilter: ScopeFilter,
  ) {
    await this.getLeadById(leadId, scopeFilter);
    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.leadNote.create({
        data: {
          leadId,
          authorId,
          body: dto.body,
          createdAt: now,
        },
      });

      await tx.lead.update({
        where: { id: leadId },
        data: { lastActivityAt: now },
      });

      await tx.leadTimeline.create({
        data: {
          leadId,
          actorId: authorId,
          type: 'note',
          refId: note.id,
          data: { snippet: dto.body.slice(0, 100) },
          occurredAt: now,
        },
      });

      return note;
    });
  }

  async scheduleAppointment(
    leadId: string,
    companyId: string,
    employeeId: string,
    dto: ScheduleAppointmentDto,
    scopeFilter: ScopeFilter,
  ) {
    await this.getLeadById(leadId, scopeFilter);
    const now = this.clock.now();

    const appointment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          leadId,
          employeeId,
          title: dto.title,
          startsAt: new Date(dto.startsAt),
          endsAt: new Date(dto.endsAt),
          notes: dto.notes || null,
          status: 'scheduled',
        },
      });

      await tx.lead.update({
        where: { id: leadId },
        data: { lastActivityAt: now },
      });

      await tx.leadTimeline.create({
        data: {
          leadId,
          actorId: employeeId,
          type: 'appointment',
          refId: created.id,
          data: { title: dto.title, startsAt: dto.startsAt },
          occurredAt: now,
        },
      });

      return created;
    });

    // Record Metric Event for Meetings Scheduled
    await this.targetsService.recordMetricEvent(
      companyId,
      employeeId,
      MetricKey.MEETINGS_SCHEDULED,
      1,
      'appointment_scheduled',
      appointment.id,
      now,
    );

    return appointment;
  }
}
