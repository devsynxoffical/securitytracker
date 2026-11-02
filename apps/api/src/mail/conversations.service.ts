import { Injectable, NotFoundException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ConversationListQueryDto,
  SetConversationStatusDto,
  LinkConversationDto,
  CreateMailCommentDto,
  MailConversationStatus,
  MailThreadEventType,
  MailboxPermission,
  NotificationType,
  ErrorCodes,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from './mail.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { ownerScopeWhere, toCursorPage } from '../crm/shared/crm.util';

type Tx = Prisma.TransactionClient | PrismaService;

export interface InboundMessage {
  gmailThreadId: string;
  gmailMessageId: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  snippet?: string;
  sentAt: Date;
  hasAttachments?: boolean;
}

/** Shared-inbox collaboration layer on top of mail_threads (17-mail-collaboration-spec.md). */
@Injectable()
export class ConversationsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
    private mail: MailService,
  ) {}

  // ---- Views (FR-MAIL-13) ---------------------------------------------------

  /** Builds the where clause for a view. Exported for tests. */
  viewWhere(mailboxId: string, employeeId: string, q: ConversationListQueryDto): Prisma.MailThreadWhereInput {
    const where: Prisma.MailThreadWhereInput = { mailboxId };
    switch (q.view) {
      case 'unassigned':
        where.assigneeId = null;
        where.status = MailConversationStatus.OPEN;
        break;
      case 'mine':
        where.assigneeId = employeeId;
        where.status = { not: MailConversationStatus.CLOSED };
        break;
      case 'open':
        where.status = MailConversationStatus.OPEN;
        break;
      case 'snoozed':
        where.status = MailConversationStatus.SNOOZED;
        break;
      case 'closed':
        where.status = MailConversationStatus.CLOSED;
        break;
      case 'all':
        break;
    }
    if (q.assigneeId) where.assigneeId = q.assigneeId;
    if (q.labelId) where.labels = { some: { labelId: q.labelId } };
    if (q.q) {
      where.OR = [
        { subject: { contains: q.q, mode: 'insensitive' } },
        { snippet: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  async list(mailboxId: string, employeeId: string, q: ConversationListQueryDto) {
    await this.mail.verifyPermission(mailboxId, employeeId, MailboxPermission.READ);
    const rows = await this.prisma.mailThread.findMany({
      where: this.viewWhere(mailboxId, employeeId, q),
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      include: {
        labels: { include: { label: { select: { id: true, name: true, colour: true } } } },
        _count: { select: { messages: true, comments: { where: { deletedAt: null } } } },
      },
    });
    const page = toCursorPage(rows, q.limit);
    const assigneeIds = Array.from(new Set(page.items.map((t) => t.assigneeId).filter((x): x is string => Boolean(x))));
    const people = assigneeIds.length
      ? await this.prisma.employee.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, firstName: true, lastName: true, code: true } })
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      ...page,
      items: page.items.map((t) => ({
        ...t,
        labels: t.labels.map((l) => l.label),
        assignee: t.assigneeId ? byId.get(t.assigneeId) ?? null : null,
      })),
    };
  }

  async counts(mailboxId: string, employeeId: string) {
    await this.mail.verifyPermission(mailboxId, employeeId, MailboxPermission.READ);
    const [unassigned, mine, open, snoozed, closed] = await Promise.all([
      this.prisma.mailThread.count({ where: { mailboxId, assigneeId: null, status: MailConversationStatus.OPEN } }),
      this.prisma.mailThread.count({ where: { mailboxId, assigneeId: employeeId, status: { not: MailConversationStatus.CLOSED } } }),
      this.prisma.mailThread.count({ where: { mailboxId, status: MailConversationStatus.OPEN } }),
      this.prisma.mailThread.count({ where: { mailboxId, status: MailConversationStatus.SNOOZED } }),
      this.prisma.mailThread.count({ where: { mailboxId, status: MailConversationStatus.CLOSED } }),
    ]);
    return { unassigned, mine, open, snoozed, closed };
  }

  // ---- Triage (FR-MAIL-11, 12) ---------------------------------------------

  async assign(mailboxId: string, actorId: string, threadId: string, assigneeId: string | null) {
    await this.mail.verifyPermission(mailboxId, actorId, MailboxPermission.TRIAGE);
    const thread = await this.getThread(mailboxId, threadId);
    if (assigneeId) {
      const target = await this.prisma.mailboxAssignment.findUnique({ where: { mailboxId_employeeId: { mailboxId, employeeId: assigneeId } } });
      if (!target) throw new UnprocessableEntityException({ code: ErrorCodes.MAIL_ACTION_FORBIDDEN, message: 'Assignee has no access to this mailbox' });
    }
    const now = this.clock.now();
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.mailThread.update({ where: { id: threadId }, data: { assigneeId, assignmentChangedAt: now } });
      await this.event(tx, threadId, actorId, assigneeId ? MailThreadEventType.ASSIGNED : MailThreadEventType.UNASSIGNED, { previousAssigneeId: thread.assigneeId, assigneeId }, now);
      return res;
    });
    if (assigneeId && assigneeId !== actorId) {
      await this.notifications.sendNotification(assigneeId, NotificationType.NEW_EMAIL, 'Conversation assigned', `"${thread.subject}" was assigned to you`, { mailboxId, threadId });
    }
    return updated;
  }

  async setStatus(mailboxId: string, actorId: string, threadId: string, dto: SetConversationStatusDto) {
    await this.mail.verifyPermission(mailboxId, actorId, MailboxPermission.TRIAGE);
    const thread = await this.getThread(mailboxId, threadId);
    const now = this.clock.now();
    let snoozedUntil: Date | null = null;
    if (dto.status === MailConversationStatus.SNOOZED) {
      snoozedUntil = new Date(dto.snoozedUntil!);
      if (snoozedUntil.getTime() <= now.getTime()) {
        throw new UnprocessableEntityException({ code: ErrorCodes.MAIL_SNOOZE_IN_PAST, message: 'Snooze time must be in the future' });
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.mailThread.update({
        where: { id: threadId },
        data: {
          status: dto.status,
          snoozedUntil,
          closedAt: dto.status === MailConversationStatus.CLOSED ? now : null,
        },
      });
      await this.event(tx, threadId, actorId, MailThreadEventType.STATUS_CHANGED, { from: thread.status, to: dto.status, snoozedUntil: snoozedUntil?.toISOString() ?? null }, now);
      return res;
    });
  }

  /** Job mail-unsnooze: reopens snoozed conversations whose time has come. */
  async unsnoozeDue() {
    const now = this.clock.now();
    const due = await this.prisma.mailThread.findMany({ where: { status: MailConversationStatus.SNOOZED, snoozedUntil: { lte: now } }, select: { id: true } });
    for (const t of due) {
      await this.prisma.$transaction(async (tx) => {
        await tx.mailThread.update({ where: { id: t.id }, data: { status: MailConversationStatus.OPEN, snoozedUntil: null } });
        await this.event(tx, t.id, null, MailThreadEventType.STATUS_CHANGED, { from: MailConversationStatus.SNOOZED, to: MailConversationStatus.OPEN, reason: 'snooze_expired' }, now);
      });
    }
    return { reopened: due.length };
  }

  // ---- Labels (FR-MAIL-15) --------------------------------------------------

  async addLabel(mailboxId: string, actorId: string, threadId: string, labelId: string) {
    await this.mail.verifyPermission(mailboxId, actorId, MailboxPermission.TRIAGE);
    const thread = await this.getThread(mailboxId, threadId);
    const label = await this.prisma.mailLabel.findFirst({ where: { id: labelId, companyId: await this.companyOf(mailboxId) } });
    if (!label) throw new NotFoundException('Label not found');
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.mailThreadLabel.createMany({ data: [{ threadId: thread.id, labelId }], skipDuplicates: true });
      await this.event(tx, threadId, actorId, MailThreadEventType.LABEL_ADDED, { labelId, name: label.name }, now);
    });
    return { ok: true };
  }

  async removeLabel(mailboxId: string, actorId: string, threadId: string, labelId: string) {
    await this.mail.verifyPermission(mailboxId, actorId, MailboxPermission.TRIAGE);
    await this.getThread(mailboxId, threadId);
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.mailThreadLabel.deleteMany({ where: { threadId, labelId } });
      await this.event(tx, threadId, actorId, MailThreadEventType.LABEL_REMOVED, { labelId }, now);
    });
    return { ok: true };
  }

  // ---- CRM link (FR-MAIL-17) -----------------------------------------------

  async link(mailboxId: string, actorId: string, threadId: string, dto: LinkConversationDto) {
    await this.mail.verifyPermission(mailboxId, actorId, MailboxPermission.TRIAGE);
    await this.getThread(mailboxId, threadId);
    const companyId = await this.companyOf(mailboxId);
    if (dto.contactId) await this.assertExists(this.prisma.crmContact.findFirst({ where: { id: dto.contactId, companyId, deletedAt: null } }), 'Contact');
    if (dto.dealId) await this.assertExists(this.prisma.deal.findFirst({ where: { id: dto.dealId, companyId, deletedAt: null } }), 'Deal');
    if (dto.leadId) await this.assertExists(this.prisma.lead.findFirst({ where: { id: dto.leadId, companyId, deletedAt: null } }), 'Lead');
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.mailThread.update({
        where: { id: threadId },
        data: { contactId: dto.contactId, dealId: dto.dealId, leadId: dto.leadId },
      });
      await this.event(tx, threadId, actorId, MailThreadEventType.LINKED, { contactId: dto.contactId ?? null, dealId: dto.dealId ?? null, leadId: dto.leadId ?? null }, now);
      return res;
    });
  }

  // ---- Comments (FR-MAIL-14) -----------------------------------------------

  async listComments(mailboxId: string, employeeId: string, threadId: string) {
    await this.mail.verifyPermission(mailboxId, employeeId, MailboxPermission.READ);
    await this.getThread(mailboxId, threadId);
    const comments = await this.prisma.mailComment.findMany({ where: { threadId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    const ids = Array.from(new Set(comments.map((c) => c.authorId)));
    const people = ids.length ? await this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return comments.map((c) => ({ ...c, author: byId.get(c.authorId) ?? null }));
  }

  async addComment(mailboxId: string, actorId: string, threadId: string, dto: CreateMailCommentDto) {
    await this.mail.verifyPermission(mailboxId, actorId, MailboxPermission.COMMENT);
    const thread = await this.getThread(mailboxId, threadId);
    const now = this.clock.now();
    const mentions = dto.mentions ?? [];
    const comment = await this.prisma.$transaction(async (tx) => {
      const c = await tx.mailComment.create({ data: { threadId, authorId: actorId, body: dto.body, mentions, createdAt: now } });
      await this.event(tx, threadId, actorId, MailThreadEventType.COMMENT, { commentId: c.id }, now);
      return c;
    });
    for (const m of mentions.filter((id) => id !== actorId)) {
      await this.notifications.sendNotification(m, NotificationType.NEW_EMAIL, 'You were mentioned', `Comment on "${thread.subject}"`, { mailboxId, threadId, commentId: comment.id });
    }
    return comment;
  }

  async deleteComment(mailboxId: string, actorId: string, threadId: string, commentId: string) {
    await this.mail.verifyPermission(mailboxId, actorId, MailboxPermission.COMMENT);
    const c = await this.prisma.mailComment.findFirst({ where: { id: commentId, threadId, deletedAt: null } });
    if (!c) throw new NotFoundException('Comment not found');
    if (c.authorId !== actorId) throw new ForbiddenException('Only the author can delete a comment');
    return this.prisma.mailComment.update({ where: { id: commentId }, data: { deletedAt: this.clock.now() } });
  }

  async listEvents(mailboxId: string, employeeId: string, threadId: string) {
    await this.mail.verifyPermission(mailboxId, employeeId, MailboxPermission.READ);
    await this.getThread(mailboxId, threadId);
    return this.prisma.mailThreadEvent.findMany({ where: { threadId }, orderBy: { occurredAt: 'asc' } });
  }

  // ---- Inbound sync hook (F28) ---------------------------------------------

  /**
   * Called by the Gmail sync for every inbound message. Upserts thread and message,
   * reopens closed or snoozed conversations and auto-links the contact by participant email.
   */
  async ingestInbound(mailboxId: string, msg: InboundMessage) {
    const mailbox = await this.prisma.mailbox.findUnique({ where: { id: mailboxId }, select: { id: true, companyId: true, address: true } });
    if (!mailbox) throw new NotFoundException('Mailbox not found');
    const now = this.clock.now();
    const participants = Array.from(new Set([msg.from, ...msg.to, ...(msg.cc ?? [])].map((a) => a.toLowerCase().trim())));
    const external = participants.filter((p) => p !== mailbox.address.toLowerCase());
    const match = await this.matchContact(mailbox.companyId, external);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.mailThread.findUnique({ where: { mailboxId_gmailThreadId: { mailboxId, gmailThreadId: msg.gmailThreadId } } });
      const reopened = existing ? existing.status !== MailConversationStatus.OPEN : false;
      const thread = await tx.mailThread.upsert({
        where: { mailboxId_gmailThreadId: { mailboxId, gmailThreadId: msg.gmailThreadId } },
        create: {
          mailboxId,
          gmailThreadId: msg.gmailThreadId,
          subject: msg.subject,
          snippet: msg.snippet ?? null,
          participants,
          lastMessageAt: msg.sentAt,
          lastInboundAt: msg.sentAt,
          unread: true,
          hasAttachments: msg.hasAttachments ?? false,
          status: MailConversationStatus.OPEN,
          contactId: match?.contactId ?? null,
          dealId: match?.dealId ?? null,
        },
        update: {
          snippet: msg.snippet ?? undefined,
          participants,
          lastMessageAt: msg.sentAt,
          lastInboundAt: msg.sentAt,
          unread: true,
          status: MailConversationStatus.OPEN,
          snoozedUntil: null,
          closedAt: null,
          contactId: existing?.contactId ?? match?.contactId ?? null,
          dealId: existing?.dealId ?? match?.dealId ?? null,
        },
      });
      await tx.mailMessage.upsert({
        where: { id: await this.messageIdFor(tx, thread.id, msg.gmailMessageId) },
        create: {
          threadId: thread.id,
          gmailMessageId: msg.gmailMessageId,
          fromAddr: msg.from,
          toAddrs: msg.to,
          ccAddrs: msg.cc ?? [],
          sentAt: msg.sentAt,
          snippet: msg.snippet ?? null,
          hasAttachments: msg.hasAttachments ?? false,
        },
        update: {},
      });
      if (reopened && existing) {
        await this.event(tx, thread.id, null, MailThreadEventType.STATUS_CHANGED, { from: existing.status, to: MailConversationStatus.OPEN, reason: 'inbound' }, now);
      }
      if (!existing?.contactId && match?.contactId) {
        await this.event(tx, thread.id, null, MailThreadEventType.LINKED, { contactId: match.contactId, dealId: match.dealId, reason: 'participant_match' }, now);
      }
      return thread;
    });
  }

  /** Participant address -> contact (and its single open deal). Exported for tests. */
  async matchContact(companyId: string, addresses: string[]): Promise<{ contactId: string; dealId: string | null } | null> {
    if (addresses.length === 0) return null;
    const hit = await this.prisma.crmContactEmail.findFirst({
      where: { emailLower: { in: addresses }, contact: { companyId, deletedAt: null } },
      select: { contactId: true },
    });
    if (!hit) return null;
    const openDeals = await this.prisma.dealContact.findMany({
      where: { contactId: hit.contactId, deal: { deletedAt: null, wonAt: null, lostAt: null } },
      select: { dealId: true },
      take: 2,
    });
    return { contactId: hit.contactId, dealId: openDeals.length === 1 ? openDeals[0]!.dealId : null };
  }

  // ---- CRM side (FR-MAIL-17) -----------------------------------------------

  async threadsForContact(contactId: string, scope: ScopeFilter, employeeId: string) {
    const contact = await this.prisma.crmContact.findFirst({ where: { id: contactId, companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope) }, select: { id: true } });
    if (!contact) throw new NotFoundException('Contact not found');
    return this.threadsWhere({ contactId }, employeeId);
  }

  async threadsForDeal(dealId: string, scope: ScopeFilter, employeeId: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id: dealId, companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope) }, select: { id: true } });
    if (!deal) throw new NotFoundException('Deal not found');
    return this.threadsWhere({ dealId }, employeeId);
  }

  /** Threads linked to a CRM record. Snippets are hidden on mailboxes the caller cannot read. */
  private async threadsWhere(where: Prisma.MailThreadWhereInput, employeeId: string) {
    const threads = await this.prisma.mailThread.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
      include: { mailbox: { select: { id: true, address: true, displayName: true } } },
    });
    const readable = new Set(
      (await this.prisma.mailboxAssignment.findMany({ where: { employeeId, permissions: { has: MailboxPermission.READ } }, select: { mailboxId: true } })).map((a) => a.mailboxId),
    );
    return threads.map((t) => {
      const canRead = readable.has(t.mailboxId);
      return { id: t.id, mailbox: t.mailbox, subject: t.subject, snippet: canRead ? t.snippet : null, lastMessageAt: t.lastMessageAt, status: t.status, assigneeId: t.assigneeId, canRead };
    });
  }

  // ---- helpers -------------------------------------------------------------

  private async getThread(mailboxId: string, threadId: string) {
    const thread = await this.prisma.mailThread.findFirst({ where: { id: threadId, mailboxId } });
    if (!thread) throw new NotFoundException('Thread not found');
    return thread;
  }

  private async companyOf(mailboxId: string): Promise<string> {
    const mb = await this.prisma.mailbox.findUnique({ where: { id: mailboxId }, select: { companyId: true } });
    if (!mb) throw new NotFoundException('Mailbox not found');
    return mb.companyId;
  }

  private async messageIdFor(tx: Tx, threadId: string, gmailMessageId: string): Promise<string> {
    const found = await tx.mailMessage.findFirst({ where: { threadId, gmailMessageId }, select: { id: true } });
    return found?.id ?? '00000000-0000-0000-0000-000000000000';
  }

  private async assertExists<T>(p: Promise<T | null>, label: string): Promise<T> {
    const v = await p;
    if (!v) throw new NotFoundException(`${label} not found`);
    return v;
  }

  private event(tx: Tx, threadId: string, actorId: string | null, type: string, data: Record<string, unknown>, at: Date) {
    return tx.mailThreadEvent.create({ data: { threadId, actorId, type, data: data as Prisma.InputJsonValue, occurredAt: at } });
  }
}
