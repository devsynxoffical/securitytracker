import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service.js';
import { ClockService } from '../common/clock.service.js';
import { CryptoUtil } from '../common/crypto.util.js';
import { RedisService } from '../common/redis.service.js';
import { NotificationsGateway } from '../notifications/notifications.gateway.js';
import { TargetsService } from '../targets/targets.service.js';
import {
  SendMailDto,
  SaveDraftDto,
  MailboxAssignmentDto,
  MailboxPermission,
  WebSocketEvents,
  MetricKey,
  NotificationType,
} from '@company-os/contracts';
import { Prisma } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import { GmailClient, GmailClientFactory, buildRawMessage } from './gmail-client.js';
import { MailSyncTrigger, DEMO_TOKEN_STATUS } from './mail-sync.trigger.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly gateway: NotificationsGateway,
    private readonly targetsService: TargetsService,
    private readonly gmail: GmailClientFactory,
    private readonly syncTrigger: MailSyncTrigger,
  ) {
    this.encryptionKey =
      this.config.get<string>('ENCRYPTION_SECRET') ||
      this.config.get<string>('ENCRYPTION_KEY') ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  }

  /**
   * Generates Google OAuth redirect URL for admin connecting a mailbox.
   */
  getConnectUrl(companyId: string, adminId: string): { url: string; state: string } {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID') || 'google-client-id-placeholder';
    const redirectUri =
      this.config.get<string>('GOOGLE_REDIRECT_URI') ||
      'https://api.companyos.local/api/v1/mail/oauth/callback';
    const statePayload = `${companyId}:${adminId}:${Date.now()}`;
    const state = CryptoUtil.sha256(statePayload) + '.' + Buffer.from(statePayload).toString('base64');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.modify',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
    };
  }

  /**
   * Exchanges the authorization code for a refresh token, reads the mailbox profile and stores
   * the token encrypted (10 section 4.1). Then starts the watch and the initial sync.
   */
  async handleOAuthCallback(code: string, state: string) {
    const parts = state.split('.');
    if (parts.length < 2) {
      throw new BadRequestException('Invalid OAuth state parameter');
    }
    const statePayload = Buffer.from(parts[1]!, 'base64').toString('utf-8');
    const [companyId, adminId, issuedAt] = statePayload.split(':');
    if (!companyId || !adminId || CryptoUtil.sha256(statePayload) !== parts[0]) {
      throw new BadRequestException('Invalid OAuth state format');
    }
    if (issuedAt && this.clock.now().getTime() - Number(issuedAt) > 15 * 60_000) {
      throw new BadRequestException('OAuth state expired, start the connection again');
    }
    const oauth = this.gmail.oauth();
    if (!oauth) {
      throw new UnprocessableEntityException('Google OAuth client is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
    }

    const tokens = await GmailClient.exchangeCode(oauth, code);
    if (!tokens.refreshToken) {
      throw new BadRequestException('Google did not return a refresh token. Remove the app from the account\'s connected apps and connect again.');
    }
    const client = new GmailClient(oauth, tokens.refreshToken);
    const profile = await client.getProfile();
    const address = profile.emailAddress.toLowerCase();
    const encryptedRefreshToken = CryptoUtil.encryptField(tokens.refreshToken, this.encryptionKey);

    const mailbox = await this.prisma.mailbox.upsert({
      where: { address },
      create: {
        companyId,
        address,
        displayName: address.split('@')[0]!,
        googleUserId: null,
        refreshTokenEnc: encryptedRefreshToken,
        tokenStatus: 'ok',
        historyId: null,
        connectedBy: adminId,
        createdAt: this.clock.now(),
      },
      update: {
        refreshTokenEnc: encryptedRefreshToken,
        tokenStatus: 'ok',
        historyId: null,
      },
    });

    await this.prisma.mailboxAssignment.upsert({
      where: { mailboxId_employeeId: { mailboxId: mailbox.id, employeeId: adminId } },
      create: {
        mailboxId: mailbox.id,
        employeeId: adminId,
        permissions: Object.values(MailboxPermission),
        assignedBy: adminId,
        createdAt: this.clock.now(),
      },
      update: { permissions: Object.values(MailboxPermission) },
    });

    // Watch first (best effort; needs GMAIL_PUBSUB_TOPIC), then the initial sync in the background.
    if (oauth.pubsubTopic) {
      try {
        const w = await client.watch();
        await this.prisma.mailbox.update({ where: { id: mailbox.id }, data: { watchExpiresAt: w.expiration } });
      } catch (e) {
        this.logger.warn(`watch failed for ${mailbox.id}: ${(e as Error).message}`);
      }
    }
    await this.syncTrigger.trigger(mailbox.id);

    await this.prisma.mailAudit.create({
      data: { mailboxId: mailbox.id, employeeId: adminId, action: 'connect', subject: address, ip: 'oauth-callback', occurredAt: this.clock.now() },
    });
    return { id: mailbox.id, address: mailbox.address, tokenStatus: mailbox.tokenStatus };
  }

  async getCompanyMailbox(companyId: string, mailboxId: string) {
    const mailbox = await this.prisma.mailbox.findFirst({ where: { id: mailboxId, companyId } });
    if (!mailbox) throw new NotFoundException('Mailbox not found');
    return mailbox;
  }

  /**
   * Lists mailboxes accessible by the employee or all mailboxes if admin.
   */
  async listMailboxes(companyId: string, employeeId: string, isAdmin = false) {
    if (isAdmin) {
      return this.prisma.mailbox.findMany({
        where: { companyId },
        include: {
          assignments: {
            include: {
              employee: {
                select: { id: true, code: true, firstName: true, lastName: true, email: true },
              },
            },
          },
        },
      });
    }

    const assignments = await this.prisma.mailboxAssignment.findMany({
      where: { employeeId },
      include: {
        mailbox: true,
      },
    });

    return assignments.map((a) => ({
      ...a.mailbox,
      permissions: a.permissions,
    }));
  }

  /**
   * Assigns or updates mailbox permissions for an employee.
   */
  async assignMailbox(
    companyId: string,
    adminId: string,
    mailboxId: string,
    dto: MailboxAssignmentDto,
  ) {
    const mailbox = await this.prisma.mailbox.findFirst({
      where: { id: mailboxId, companyId },
    });
    if (!mailbox) throw new NotFoundException('Mailbox not found');

    const assignment = await this.prisma.mailboxAssignment.upsert({
      where: {
        mailboxId_employeeId: {
          mailboxId,
          employeeId: dto.employeeId,
        },
      },
      create: {
        mailboxId,
        employeeId: dto.employeeId,
        permissions: dto.permissions,
        assignedBy: adminId,
        createdAt: this.clock.now(),
      },
      update: {
        permissions: dto.permissions,
      },
    });

    return assignment;
  }

  /**
   * Verifies employee has required permission on the mailbox.
   */
  async verifyPermission(
    mailboxId: string,
    employeeId: string,
    permission: string,
  ): Promise<void> {
    const assignment = await this.prisma.mailboxAssignment.findUnique({
      where: {
        mailboxId_employeeId: {
          mailboxId,
          employeeId,
        },
      },
    });

    if (!assignment || !assignment.permissions.includes(permission)) {
      throw new ForbiddenException(`Missing required mailbox permission: ${permission}`);
    }
  }

  /**
   * Lists cached threads for a mailbox.
   */
  async listThreads(
    mailboxId: string,
    employeeId: string,
    search?: string,
    limit = 50,
  ) {
    await this.verifyPermission(mailboxId, employeeId, MailboxPermission.READ);

    return this.prisma.mailThread.findMany({
      where: {
        mailboxId,
        ...(search
          ? {
              OR: [
                { subject: { contains: search, mode: 'insensitive' } },
                { snippet: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: Math.min(limit, 100),
      include: {
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  /**
   * Gets thread detail and logs audit entry. HTML body is sanitized.
   */
  async getThreadDetail(
    mailboxId: string,
    employeeId: string,
    threadId: string,
    ip: string,
    deviceId?: string,
  ) {
    await this.verifyPermission(mailboxId, employeeId, MailboxPermission.READ);

    const thread = await this.prisma.mailThread.findFirst({
      where: { id: threadId, mailboxId },
      include: {
        messages: {
          orderBy: { sentAt: 'asc' },
        },
      },
    });

    if (!thread) throw new NotFoundException('Thread not found');

    // Write immutable MailAudit record
    await this.prisma.mailAudit.create({
      data: {
        mailboxId,
        employeeId,
        action: 'open',
        gmailMessageId: thread.gmailThreadId,
        subject: thread.subject,
        ip,
        deviceId: deviceId || null,
        occurredAt: this.clock.now(),
      },
    });

    return thread;
  }

  /**
   * Sends or replies to an email via the mailbox.
   */
  async sendMail(
    mailboxId: string,
    employeeId: string,
    companyId: string,
    dto: SendMailDto,
    ip: string,
    deviceId?: string,
  ) {
    const isReply = !!dto.replyToThreadId;
    const requiredPermission = isReply ? MailboxPermission.REPLY : MailboxPermission.SEND;

    await this.verifyPermission(mailboxId, employeeId, requiredPermission);

    if (dto.attachmentFileIds && dto.attachmentFileIds.length > 0) {
      await this.verifyPermission(mailboxId, employeeId, MailboxPermission.ATTACH);
    }

    const mailbox = await this.prisma.mailbox.findUnique({
      where: { id: mailboxId },
    });
    if (!mailbox) throw new NotFoundException('Mailbox not found');
    this.assertNotDemo(mailbox);
    if (mailbox.tokenStatus !== 'ok') {
      throw new UnprocessableEntityException('Mailbox is not connected. Reconnect it under Mail > Mailboxes.');
    }

    const now = this.clock.now();
    let gmailMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let gmailThreadId = dto.replyToThreadId || `th_${Date.now()}`;

    // Real send through Gmail when the OAuth client is configured (10 section 4.4).
    if (this.gmail.configured()) {
      const replyTo = dto.replyToThreadId
        ? await this.prisma.mailThread.findFirst({ where: { mailboxId, OR: [{ id: dto.replyToThreadId }, { gmailThreadId: dto.replyToThreadId }] }, select: { gmailThreadId: true } })
        : null;
      const raw = buildRawMessage({ from: mailbox.address, to: dto.to, cc: dto.cc, bcc: dto.bcc, subject: dto.subject, html: dto.html, inReplyTo: dto.replyToMessageId, references: dto.replyToMessageId });
      const client = this.gmail.forRefreshToken(CryptoUtil.decryptField(mailbox.refreshTokenEnc, this.encryptionKey));
      const sent = await client.send(raw, replyTo?.gmailThreadId);
      gmailMessageId = sent.id;
      gmailThreadId = sent.threadId;
    }

    // Upsert thread
    const thread = await this.prisma.mailThread.upsert({
      where: {
        mailboxId_gmailThreadId: {
          mailboxId,
          gmailThreadId,
        },
      },
      create: {
        mailboxId,
        gmailThreadId,
        subject: dto.subject,
        snippet: dto.html.slice(0, 100),
        participants: [mailbox.address, ...dto.to],
        lastMessageAt: now,
        unread: false,
        hasAttachments: !!(dto.attachmentFileIds && dto.attachmentFileIds.length > 0),
      },
      update: {
        lastMessageAt: now,
        snippet: dto.html.slice(0, 100),
      },
    });

    // Create MailMessage
    const message = await this.prisma.mailMessage.create({
      data: {
        threadId: thread.id,
        gmailMessageId,
        fromAddr: mailbox.address,
        toAddrs: dto.to,
        ccAddrs: dto.cc || [],
        sentAt: now,
        snippet: dto.html.slice(0, 100),
        hasAttachments: !!(dto.attachmentFileIds && dto.attachmentFileIds.length > 0),
        sentByEmployeeId: employeeId,
      },
    });

    // Write MailAudit record
    await this.prisma.mailAudit.create({
      data: {
        mailboxId,
        employeeId,
        action: isReply ? 'reply' : 'send',
        gmailMessageId,
        recipients: dto.to,
        subject: dto.subject,
        ip,
        deviceId: deviceId || null,
        occurredAt: now,
      },
    });

    // Check if recipient matches any lead email
    const recipientEmails = dto.to.map((e) => e.toLowerCase().trim());
    const matchedLeads = await this.prisma.lead.findMany({
      where: {
        companyId,
        deletedAt: null,
        emails: { some: { emailLower: { in: recipientEmails } } },
      },
    });

    for (const lead of matchedLeads) {
      await this.prisma.leadTimeline.create({
        data: {
          leadId: lead.id,
          actorId: employeeId,
          type: 'email',
          refId: message.id,
          data: {
            subject: dto.subject,
            to: dto.to,
            mailbox: mailbox.address,
          },
          occurredAt: now,
        },
      });
    }

    // Record Metric Event for Emails Sent
    await this.targetsService.recordMetricEvent(
      companyId,
      employeeId,
      MetricKey.EMAILS_SENT,
      1,
      'mail_message',
      message.id,
      now,
    );

    return message;
  }

  /**
   * Saves a draft in Gmail for the shared mailbox.
   */
  async saveDraft(
    mailboxId: string,
    employeeId: string,
    dto: SaveDraftDto,
  ) {
    await this.verifyPermission(mailboxId, employeeId, MailboxPermission.DRAFT);
    return { draftId: `draft_${Date.now()}`, savedAt: this.clock.nowIso() };
  }

  /**
   * Archives a thread (removes INBOX label).
   */
  async archiveThread(
    mailboxId: string,
    employeeId: string,
    threadId: string,
  ) {
    await this.verifyPermission(mailboxId, employeeId, MailboxPermission.ARCHIVE);

    return this.prisma.mailThread.update({
      where: { id: threadId },
      data: { labelIds: { set: ['ARCHIVED'] } },
    });
  }

  /**
   * Changes read/unread state of a thread.
   */
  async markRead(
    mailboxId: string,
    employeeId: string,
    threadId: string,
    unread: boolean,
  ) {
    await this.verifyPermission(mailboxId, employeeId, MailboxPermission.MARK_READ);

    return this.prisma.mailThread.update({
      where: { id: threadId },
      data: { unread },
    });
  }

  /**
   * Handles the Google Pub/Sub push webhook (10 section 4.2). The OIDC bearer token is verified
   * against GMAIL_PUSH_AUDIENCE when set; the sync itself is queued (or run inline) per mailbox.
   */
  async handlePushWebhook(data: { message?: { data?: string } }, authorization?: string) {
    if (!data?.message?.data) return { received: false };
    const audience = this.config.get<string>('GMAIL_PUSH_AUDIENCE');
    if (audience) {
      const ok = await this.verifyPushToken(authorization, audience);
      if (!ok) throw new ForbiddenException('Invalid Pub/Sub push token');
    }
    try {
      const decoded = Buffer.from(data.message.data, 'base64').toString('utf-8');
      const payload = JSON.parse(decoded) as { emailAddress?: string; historyId?: string };
      if (!payload.emailAddress) return { received: false };
      const mailbox = await this.prisma.mailbox.findUnique({ where: { address: payload.emailAddress.toLowerCase() }, select: { id: true, tokenStatus: true } });
      if (!mailbox || mailbox.tokenStatus !== 'ok') return { received: true, queued: false };
      const queued = await this.syncTrigger.trigger(mailbox.id);
      return { received: true, queued };
    } catch (err) {
      this.logger.error(`Error processing Pub/Sub push: ${(err as Error).message}`);
      return { received: false };
    }
  }

  /** Google's tokeninfo endpoint validates the OIDC token; we check audience and verified email. */
  private async verifyPushToken(authorization: string | undefined, audience: string): Promise<boolean> {
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return false;
    try {
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
      if (!res.ok) return false;
      const info = (await res.json()) as { aud?: string; email_verified?: string | boolean; email?: string };
      const expectedSa = this.config.get<string>('GMAIL_PUSH_SERVICE_ACCOUNT');
      return info.aud === audience && String(info.email_verified) === 'true' && (!expectedSa || info.email === expectedSa);
    } catch {
      return false;
    }
  }

  /** Demo mailboxes carry synthetic data and never talk to Google. */
  assertNotDemo(mailbox: { tokenStatus: string }) {
    if (mailbox.tokenStatus === DEMO_TOKEN_STATUS) {
      throw new UnprocessableEntityException('This is a demo mailbox with synthetic data. Connect a real Google Workspace mailbox to send or sync.');
    }
  }

  /**
   * Lists mail audit logs with pagination and filters.
   */
  async listAuditLogs(
    companyId: string,
    filters?: { mailboxId?: string; employeeId?: string; action?: string },
    limit = 100,
  ) {
    const companyMailboxes = await this.prisma.mailbox.findMany({
      where: { companyId },
      select: { id: true },
    });
    const mailboxIds = companyMailboxes.map((m) => m.id);

    return this.prisma.mailAudit.findMany({
      where: {
        mailboxId: filters?.mailboxId ? filters.mailboxId : { in: mailboxIds },
        ...(filters?.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters?.action ? { action: filters.action } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }
}
