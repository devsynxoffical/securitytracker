import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationType, WebSocketEvents } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service.js';
import { ClockService } from '../common/clock.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationsGateway } from '../notifications/notifications.gateway.js';
import { ConversationsService, InboundMessage } from './conversations.service.js';
import { ImapClientFactory, ImapConnectionError, ImapMailboxRow, ParsedMessage, maxUid, parseRfc822, threadCandidates } from './imap-client.js';
import type { SyncResult } from './mail-sync.service.js';

export interface ImapMailbox extends ImapMailboxRow {
  id: string;
  connectedBy: string;
  tokenStatus: string;
  lastUidValidity: number | null;
  lastUid: number | null;
}

/**
 * IMAP counterpart of MailSyncService (10 option D). INBOX is read by UID cursor; every message is
 * parsed once, threaded by In-Reply-To / References, and handed to ConversationsService so reopen,
 * assignment and CRM linking behave exactly as for Gmail. Message-IDs take the place of Gmail ids.
 */
@Injectable()
export class ImapSyncService {
  private readonly logger = new Logger(ImapSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly conversations: ConversationsService,
    private readonly notifications: NotificationsService,
    private readonly gateway: NotificationsGateway,
    private readonly imap: ImapClientFactory,
  ) {}

  async syncMailbox(mailbox: ImapMailbox): Promise<SyncResult> {
    const result: SyncResult = { mailboxId: mailbox.id, mode: mailbox.lastUid === null ? 'initial' : 'incremental', fetched: 0, inbound: 0, outbound: 0, historyId: null };
    const now = this.clock.now();
    try {
      const client = this.imap.forMailbox(mailbox);
      const page = await client.fetchNew({ lastUidValidity: mailbox.lastUidValidity, lastUid: mailbox.lastUid }, now);
      const resumed = mailbox.lastUidValidity === page.uidValidity;
      let cursor = resumed ? mailbox.lastUid : null;
      for (const m of page.messages) {
        const parsed = await parseRfc822(m.source, { date: now, messageId: `uid-${page.uidValidity}-${m.uid}` });
        await this.store(mailbox, parsed, m.uid, result);
        cursor = maxUid([m.uid], cursor);
      }
      // UIDs that were searched but not returned (expunged meanwhile) still advance the cursor.
      cursor = maxUid(page.uids, cursor);
      await this.prisma.mailbox.update({
        where: { id: mailbox.id },
        data: { lastUidValidity: page.uidValidity, lastUid: cursor, lastSyncAt: now, tokenStatus: 'ok' },
      });
      result.historyId = cursor === null ? null : `${page.uidValidity}:${cursor}`;
      if (result.inbound > 0) this.broadcast(mailbox.id);
      return result;
    } catch (e) {
      await this.handleFailure(mailbox, e);
      throw e;
    }
  }

  /** Resolves the conversation key: an existing thread referenced by In-Reply-To/References, else the message itself. */
  async resolveThreadKey(mailboxId: string, parsed: Pick<ParsedMessage, 'messageId' | 'inReplyTo' | 'references'>): Promise<string> {
    const candidates = threadCandidates(parsed);
    if (candidates.length > 0) {
      const hit = await this.prisma.mailMessage.findFirst({
        where: { gmailMessageId: { in: candidates }, thread: { mailboxId } },
        select: { thread: { select: { gmailThreadId: true } } },
      });
      if (hit) return hit.thread.gmailThreadId;
    }
    return parsed.messageId;
  }

  private async store(mailbox: ImapMailbox, parsed: ParsedMessage, uid: number, result: SyncResult) {
    result.fetched += 1;
    const threadKey = await this.resolveThreadKey(mailbox.id, parsed);
    const inbound: InboundMessage = {
      gmailThreadId: threadKey,
      gmailMessageId: parsed.messageId,
      from: parsed.from,
      to: parsed.to,
      cc: parsed.cc,
      subject: parsed.subject,
      snippet: parsed.snippet,
      sentAt: parsed.date,
      hasAttachments: parsed.attachments.length > 0,
      attachments: parsed.attachments,
      uid,
    };
    if (parsed.from === mailbox.address.toLowerCase()) {
      await this.storeOutbound(mailbox.id, inbound);
      result.outbound += 1;
    } else {
      await this.conversations.ingestInbound(mailbox.id, inbound);
      result.inbound += 1;
    }
  }

  /** Mail the mailbox sent from another client: stored, no reopen, no unread flag. */
  private async storeOutbound(mailboxId: string, msg: InboundMessage) {
    const participants = Array.from(new Set([msg.from, ...msg.to, ...(msg.cc ?? [])].map((a) => a.toLowerCase())));
    await this.prisma.$transaction(async (tx) => {
      const thread = await tx.mailThread.upsert({
        where: { mailboxId_gmailThreadId: { mailboxId, gmailThreadId: msg.gmailThreadId } },
        create: {
          mailboxId,
          gmailThreadId: msg.gmailThreadId,
          subject: msg.subject,
          snippet: msg.snippet ?? null,
          participants: participants as Prisma.InputJsonValue,
          lastMessageAt: msg.sentAt,
          unread: false,
          hasAttachments: msg.hasAttachments ?? false,
        },
        update: { lastMessageAt: msg.sentAt, snippet: msg.snippet ?? undefined, hasAttachments: msg.hasAttachments || undefined },
      });
      const existing = await tx.mailMessage.findFirst({ where: { threadId: thread.id, gmailMessageId: msg.gmailMessageId }, select: { id: true } });
      if (!existing) {
        await tx.mailMessage.create({
          data: {
            threadId: thread.id,
            gmailMessageId: msg.gmailMessageId,
            fromAddr: msg.from,
            toAddrs: msg.to,
            ccAddrs: msg.cc ?? [],
            sentAt: msg.sentAt,
            snippet: msg.snippet ?? null,
            hasAttachments: msg.hasAttachments ?? false,
            attachments: (msg.attachments ?? []) as Prisma.InputJsonValue,
            uid: msg.uid ?? null,
          },
        });
      }
    });
  }

  private async handleFailure(mailbox: ImapMailbox, e: unknown) {
    const auth = e instanceof ImapConnectionError && e.authenticationFailed;
    const status = auth ? 'revoked' : 'error';
    if (mailbox.tokenStatus !== status) {
      await this.prisma.mailbox.update({ where: { id: mailbox.id }, data: { tokenStatus: status } });
    }
    this.logger.warn(`mailbox ${mailbox.id} imap sync ${status}: ${(e as Error).message}`);
    if (auth && mailbox.tokenStatus !== 'revoked') {
      await this.prisma.securityAlert.create({
        data: { type: 'mailbox_token_revoked', severity: 'high', employeeId: mailbox.connectedBy, detail: { mailboxId: mailbox.id, address: mailbox.address, provider: 'imap' } },
      });
      await this.notifications.sendNotification(
        mailbox.connectedBy,
        NotificationType.SECURITY_ALERT,
        'Mailbox disconnected',
        `The mail server rejected the login for ${mailbox.address}. Update the password under Mail > Mailboxes.`,
        { mailboxId: mailbox.id },
      );
    }
  }

  private broadcast(mailboxId: string) {
    this.prisma.mailboxAssignment
      .findMany({ where: { mailboxId }, select: { employeeId: true } })
      .then((rows) => rows.forEach((r) => this.gateway.emitToUser(r.employeeId, WebSocketEvents.MAIL_NEW, { mailboxId })))
      .catch(() => undefined);
  }
}
