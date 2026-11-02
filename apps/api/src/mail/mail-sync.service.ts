import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { MailProvider, NotificationType, WebSocketEvents } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service.js';
import { ClockService } from '../common/clock.service.js';
import { CryptoUtil } from '../common/crypto.util.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationsGateway } from '../notifications/notifications.gateway.js';
import { ConversationsService, InboundMessage } from './conversations.service.js';
import { GmailApiError, GmailClient, GmailClientFactory, GmailMessageMeta } from './gmail-client.js';
import { ImapSyncService } from './imap-sync.service.js';

export interface SyncResult {
  mailboxId: string;
  mode: 'initial' | 'incremental' | 'skipped';
  fetched: number;
  inbound: number;
  outbound: number;
  historyId: string | null;
}

import { DEMO_TOKEN_STATUS } from './mail-sync.trigger.js';
export { DEMO_TOKEN_STATUS };
const INITIAL_SYNC_DAYS = 30;

/** Maps a Gmail metadata message to the inbound shape ConversationsService ingests. */
export function toInbound(meta: GmailMessageMeta): InboundMessage {
  return {
    gmailThreadId: meta.threadId,
    gmailMessageId: meta.id,
    from: meta.from,
    to: meta.to,
    cc: meta.cc,
    subject: meta.subject,
    snippet: meta.snippet,
    sentAt: meta.internalDate,
    hasAttachments: meta.hasAttachments,
  };
}

/** A message is outbound when the mailbox itself sent it (SENT label or From header). */
export function isOutbound(meta: GmailMessageMeta, mailboxAddress: string): boolean {
  return meta.from.toLowerCase() === mailboxAddress.toLowerCase() || meta.labelIds.includes('SENT');
}

/** Mailboxes whose watch expires within the window (or never started) need `users.watch` again. */
export function needsWatchRenewal(watchExpiresAt: Date | null, now: Date, windowMs = 24 * 3_600_000): boolean {
  return watchExpiresAt === null || watchExpiresAt.getTime() <= now.getTime() + windowMs;
}

/**
 * Gmail synchronisation (10 sections 4.1, 4.2, 7). Initial sync pulls 30 days of metadata;
 * incremental sync follows users.history from the stored historyId. Inbound messages go through
 * ConversationsService.ingestInbound so reopen, assignment and CRM linking apply; outbound
 * messages are stored without touching the conversation state.
 */
@Injectable()
export class MailSyncService {
  private readonly logger = new Logger(MailSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly config: ConfigService,
    private readonly conversations: ConversationsService,
    private readonly notifications: NotificationsService,
    private readonly gateway: NotificationsGateway,
    private readonly gmail: GmailClientFactory,
    private readonly imapSync: ImapSyncService,
  ) {}

  /**
   * Entry point for the worker, the webhook and the manual trigger. Dispatches by provider: IMAP
   * mailboxes never touch Google; Gmail mailboxes are skipped while the OAuth client is missing.
   */
  async syncMailbox(mailboxId: string): Promise<SyncResult> {
    const mailbox = await this.prisma.mailbox.findUnique({ where: { id: mailboxId } });
    if (!mailbox) throw new NotFoundException('Mailbox not found');
    this.assertSyncable(mailbox);
    if (mailbox.provider === MailProvider.IMAP) return this.imapSync.syncMailbox(mailbox);
    if (!this.gmail.configured()) return { mailboxId, mode: 'skipped', fetched: 0, inbound: 0, outbound: 0, historyId: mailbox.historyId };
    return mailbox.historyId ? this.incrementalSync(mailboxId) : this.initialSync(mailboxId);
  }

  /** True when a sync for this mailbox can do something right now (used by the inline trigger). */
  async canSync(mailboxId: string): Promise<boolean> {
    const mailbox = await this.prisma.mailbox.findUnique({ where: { id: mailboxId }, select: { provider: true, tokenStatus: true } });
    if (!mailbox || mailbox.tokenStatus === DEMO_TOKEN_STATUS || mailbox.tokenStatus === 'revoked' || mailbox.tokenStatus === 'disconnected') return false;
    return mailbox.provider === MailProvider.IMAP || this.gmail.configured();
  }

  async initialSync(mailboxId: string): Promise<SyncResult> {
    const mailbox = await this.prisma.mailbox.findUnique({ where: { id: mailboxId } });
    if (!mailbox) throw new NotFoundException('Mailbox not found');
    this.assertSyncable(mailbox);
    const client = this.clientFor(this.requireRefreshToken(mailbox));
    const result: SyncResult = { mailboxId, mode: 'initial', fetched: 0, inbound: 0, outbound: 0, historyId: null };
    try {
      const profile = await client.getProfile();
      let pageToken: string | undefined;
      const q = `newer_than:${INITIAL_SYNC_DAYS}d -in:spam -in:trash`;
      do {
        const page = await client.listMessages(q, pageToken);
        for (const id of page.ids) {
          const meta = await client.getMessage(id);
          await this.store(mailbox.id, mailbox.address, meta, result);
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      result.historyId = profile.historyId;
      await this.prisma.mailbox.update({ where: { id: mailboxId }, data: { historyId: profile.historyId, lastSyncAt: this.clock.now(), tokenStatus: 'ok' } });
      this.broadcast(mailbox.id);
      return result;
    } catch (e) {
      await this.handleFailure(mailbox, e);
      throw e;
    }
  }

  async incrementalSync(mailboxId: string): Promise<SyncResult> {
    const mailbox = await this.prisma.mailbox.findUnique({ where: { id: mailboxId } });
    if (!mailbox) throw new NotFoundException('Mailbox not found');
    this.assertSyncable(mailbox);
    if (!mailbox.historyId) return this.initialSync(mailboxId);
    const client = this.clientFor(this.requireRefreshToken(mailbox));
    const result: SyncResult = { mailboxId, mode: 'incremental', fetched: 0, inbound: 0, outbound: 0, historyId: mailbox.historyId };
    try {
      let pageToken: string | undefined;
      let latest = mailbox.historyId;
      do {
        const page = await client.listHistory(mailbox.historyId, pageToken);
        for (const id of page.messageIds) {
          const meta = await client.getMessage(id).catch((e: unknown) => {
            if (e instanceof GmailApiError && e.isNotFound) return null; // deleted between list and get
            throw e;
          });
          if (meta) await this.store(mailbox.id, mailbox.address, meta, result);
        }
        latest = page.historyId || latest;
        pageToken = page.nextPageToken;
      } while (pageToken);
      result.historyId = latest;
      await this.prisma.mailbox.update({ where: { id: mailboxId }, data: { historyId: latest, lastSyncAt: this.clock.now(), tokenStatus: 'ok' } });
      if (result.inbound > 0) this.broadcast(mailbox.id);
      return result;
    } catch (e) {
      if (e instanceof GmailApiError && e.isNotFound) {
        // historyId too old (10 section 7): drop it and run a full resync
        this.logger.warn(`history expired for mailbox ${mailboxId}, running full resync`);
        await this.prisma.mailbox.update({ where: { id: mailboxId }, data: { historyId: null } });
        return this.initialSync(mailboxId);
      }
      await this.handleFailure(mailbox, e);
      throw e;
    }
  }

  async renewWatch(mailboxId: string): Promise<{ expiresAt: Date }> {
    const mailbox = await this.prisma.mailbox.findUnique({ where: { id: mailboxId } });
    if (!mailbox) throw new NotFoundException('Mailbox not found');
    this.assertSyncable(mailbox);
    const client = this.clientFor(this.requireRefreshToken(mailbox));
    try {
      const w = await client.watch();
      await this.prisma.mailbox.update({
        where: { id: mailboxId },
        data: { watchExpiresAt: w.expiration, historyId: mailbox.historyId ?? w.historyId },
      });
      return { expiresAt: w.expiration };
    } catch (e) {
      await this.handleFailure(mailbox, e);
      throw e;
    }
  }

  /** Renews every healthy mailbox whose watch expires within 24 hours. */
  async renewExpiringWatches(): Promise<{ checked: number; renewed: number; failed: number }> {
    const now = this.clock.now();
    const rows = await this.prisma.mailbox.findMany({ where: { tokenStatus: 'ok', provider: MailProvider.GMAIL }, select: { id: true, watchExpiresAt: true } });
    let renewed = 0;
    let failed = 0;
    for (const m of rows) {
      if (!needsWatchRenewal(m.watchExpiresAt, now)) continue;
      try {
        await this.renewWatch(m.id);
        renewed += 1;
      } catch (e) {
        failed += 1;
        this.logger.warn(`watch renewal failed for mailbox ${m.id}: ${(e as Error).message}`);
      }
    }
    return { checked: rows.length, renewed, failed };
  }

  configured(): boolean {
    return this.gmail.configured();
  }

  // ---- internals -------------------------------------------------------------

  private assertSyncable(mailbox: { tokenStatus: string }) {
    if (mailbox.tokenStatus === DEMO_TOKEN_STATUS) {
      throw new UnprocessableEntityException('This is a demo mailbox with synthetic data; it cannot sync with Gmail.');
    }
    if (mailbox.tokenStatus === 'revoked') {
      throw new UnprocessableEntityException('Mailbox access was revoked by the provider. Reconnect the mailbox.');
    }
    if (mailbox.tokenStatus === 'disconnected') {
      throw new UnprocessableEntityException('Mailbox was disconnected. Connect it again under Mail > Mailboxes.');
    }
  }

  private clientFor(refreshTokenEnc: string): GmailClient {
    return this.gmail.forRefreshToken(CryptoUtil.decryptField(refreshTokenEnc, this.encryptionKey()));
  }

  private encryptionKey(): string {
    return this.config.get<string>('ENCRYPTION_SECRET') || this.config.get<string>('ENCRYPTION_KEY') || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  }

  private async store(mailboxId: string, address: string, meta: GmailMessageMeta, result: SyncResult) {
    result.fetched += 1;
    if (isOutbound(meta, address)) {
      await this.storeOutbound(mailboxId, meta);
      result.outbound += 1;
    } else {
      await this.conversations.ingestInbound(mailboxId, toInbound(meta));
      result.inbound += 1;
    }
  }

  /** Outbound mail: thread exists or is created, message stored, no reopen and no unread flag. */
  private async storeOutbound(mailboxId: string, meta: GmailMessageMeta) {
    const participants = Array.from(new Set([meta.from, ...meta.to, ...meta.cc].map((a) => a.toLowerCase())));
    await this.prisma.$transaction(async (tx) => {
      const thread = await tx.mailThread.upsert({
        where: { mailboxId_gmailThreadId: { mailboxId, gmailThreadId: meta.threadId } },
        create: {
          mailboxId,
          gmailThreadId: meta.threadId,
          subject: meta.subject,
          snippet: meta.snippet,
          participants: participants as Prisma.InputJsonValue,
          lastMessageAt: meta.internalDate,
          unread: false,
          hasAttachments: meta.hasAttachments,
          labelIds: meta.labelIds,
        },
        update: { lastMessageAt: meta.internalDate, snippet: meta.snippet, hasAttachments: meta.hasAttachments || undefined },
      });
      const existing = await tx.mailMessage.findFirst({ where: { threadId: thread.id, gmailMessageId: meta.id }, select: { id: true } });
      if (!existing) {
        await tx.mailMessage.create({
          data: { threadId: thread.id, gmailMessageId: meta.id, fromAddr: meta.from, toAddrs: meta.to, ccAddrs: meta.cc, sentAt: meta.internalDate, snippet: meta.snippet, hasAttachments: meta.hasAttachments },
        });
      }
    });
  }

  /** 10 section 7: revoked token -> status revoked, admin alert and notification; other errors -> status error. */
  private async handleFailure(mailbox: { id: string; address: string; connectedBy: string; tokenStatus: string }, e: unknown) {
    const err = e instanceof GmailApiError ? e : null;
    const revoked = Boolean(err?.isAuth);
    const status = revoked ? 'revoked' : 'error';
    if (mailbox.tokenStatus !== status) {
      await this.prisma.mailbox.update({ where: { id: mailbox.id }, data: { tokenStatus: status } });
    }
    this.logger.warn(`mailbox ${mailbox.id} sync ${status}: ${err ? `HTTP ${err.status}` : (e as Error).message}`);
    if (revoked && mailbox.tokenStatus !== 'revoked') {
      await this.prisma.securityAlert.create({
        data: { type: 'mailbox_token_revoked', severity: 'high', employeeId: mailbox.connectedBy, detail: { mailboxId: mailbox.id, address: mailbox.address } },
      });
      await this.notifications.sendNotification(
        mailbox.connectedBy,
        NotificationType.SECURITY_ALERT,
        'Mailbox disconnected',
        `Google revoked access to ${mailbox.address}. Reconnect it under Mail > Mailboxes.`,
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

  /** Gmail mailboxes always carry a refresh token; IMAP mailboxes (10 option D) never reach the Gmail client. */
  private requireRefreshToken(mailbox: { provider?: string; refreshTokenEnc: string | null; address: string }): string {
    if (!mailbox.refreshTokenEnc) {
      throw new Error(`Mailbox ${mailbox.address} has no Gmail refresh token (provider ${mailbox.provider ?? 'gmail'})`);
    }
    return mailbox.refreshTokenEnc;
  }

}
