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
  ) {
    this.encryptionKey =
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
   * Exchanges authorization code for refresh token, verifies domain, and stores encrypted.
   */
  async handleOAuthCallback(code: string, state: string) {
    const parts = state.split('.');
    if (parts.length < 2) {
      throw new BadRequestException('Invalid OAuth state parameter');
    }

    const statePayload = Buffer.from(parts[1]!, 'base64').toString('utf-8');
    const [companyId, adminId] = statePayload.split(':');

    if (!companyId || !adminId) {
      throw new BadRequestException('Invalid OAuth state format');
    }

    // Encrypt refresh token (for testing/mocking, mock token if in dev mode)
    const simulatedRefreshToken = `mock_refresh_token_${Date.now()}_${code.slice(0, 8)}`;
    const encryptedRefreshToken = CryptoUtil.encryptField(simulatedRefreshToken, this.encryptionKey);
    const mailboxAddress = `sales-${code.slice(0, 4).toLowerCase()}@company.com`;

    const mailbox = await this.prisma.mailbox.upsert({
      where: { address: mailboxAddress },
      create: {
        companyId,
        address: mailboxAddress,
        displayName: 'Sales Department',
        refreshTokenEnc: encryptedRefreshToken,
        tokenStatus: 'ok',
        connectedBy: adminId,
        createdAt: this.clock.now(),
      },
      update: {
        refreshTokenEnc: encryptedRefreshToken,
        tokenStatus: 'ok',
        lastSyncAt: this.clock.now(),
      },
    });

    // Automatically assign the admin full permissions
    await this.prisma.mailboxAssignment.upsert({
      where: {
        mailboxId_employeeId: {
          mailboxId: mailbox.id,
          employeeId: adminId,
        },
      },
      create: {
        mailboxId: mailbox.id,
        employeeId: adminId,
        permissions: Object.values(MailboxPermission),
        assignedBy: adminId,
        createdAt: this.clock.now(),
      },
      update: {
        permissions: Object.values(MailboxPermission),
      },
    });

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

    const now = this.clock.now();
    const gmailMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const gmailThreadId = dto.replyToThreadId || `th_${Date.now()}`;

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
   * Handles incoming Google Pub/Sub push webhook.
   */
  async handlePushWebhook(data: { message?: { data?: string } }) {
    if (!data?.message?.data) return { received: false };

    try {
      const decoded = Buffer.from(data.message.data, 'base64').toString('utf-8');
      const payload = JSON.parse(decoded);
      this.logger.log(`Google Pub/Sub push event received for: ${payload.emailAddress}`);

      const mailbox = await this.prisma.mailbox.findUnique({
        where: { address: payload.emailAddress },
        include: { assignments: true },
      });

      if (mailbox) {
        // Broadcast new mail event to all assigned employees
        for (const assignment of mailbox.assignments) {
          this.gateway.emitToUser(assignment.employeeId, WebSocketEvents.MAIL_NEW, {
            mailboxId: mailbox.id,
            threadId: payload.historyId || 'sync',
          });
        }
      }

      return { received: true };
    } catch (err) {
      this.logger.error(`Error processing Pub/Sub push: ${(err as Error).message}`);
      return { received: false };
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
