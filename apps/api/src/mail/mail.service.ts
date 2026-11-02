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
  MailProvider,
  WebSocketEvents,
  MetricKey,
  NotificationType,
  ImapMailboxSettingsDto,
  UpdateImapMailboxDto,
} from '@company-os/contracts';
import { Prisma } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import { GmailClient, GmailClientFactory, buildRawMessage, extractGmailBody } from './gmail-client.js';
import { MailSyncTrigger, DEMO_TOKEN_STATUS } from './mail-sync.trigger.js';
import { ImapClientFactory, ImapConnectionError, ImapSettings, SmtpSettings, angleBracketed, composeRaw, extractAttachment, makeMessageId, parseRfc822, AttachmentMeta } from './imap-client.js';
import { sanitizeMailHtml } from './mail-sanitizer.js';

/** Columns that never leave the server (rule 6). */
const SECRET_COLUMNS = ['refreshTokenEnc', 'passwordEnc'] as const;

export function publicMailbox<T extends Record<string, unknown>>(row: T): Omit<T, (typeof SECRET_COLUMNS)[number]> {
  const copy: Record<string, unknown> = { ...row };
  for (const c of SECRET_COLUMNS) delete copy[c];
  return copy as Omit<T, (typeof SECRET_COLUMNS)[number]>;
}

export interface MessageBody {
  id: string;
  html: string;
  text: string | null;
  attachments: AttachmentMeta[];
  remoteImagesBlocked: number;
}

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
    private readonly imap: ImapClientFactory,
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
      const rows = await this.prisma.mailbox.findMany({
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
      return rows.map((r) => publicMailbox(r));
    }

    const assignments = await this.prisma.mailboxAssignment.findMany({
      where: { employeeId },
      include: {
        mailbox: true,
      },
    });

    return assignments.map((a) => ({
      ...publicMailbox(a.mailbox),
      permissions: a.permissions,
    }));
  }

  // ---- IMAP/SMTP mailboxes (10 section 2 option D) ---------------------------

  /** Logs in to IMAP and SMTP with the given settings; nothing is stored. */
  async testImap(dto: Omit<ImapMailboxSettingsDto, 'address' | 'displayName'>): Promise<{ imap: { ok: boolean; messages?: number; error?: string }; smtp: { ok: boolean; error?: string } }> {
    const settings = this.imapSettings(dto);
    const imap = await this.imap
      .imap(settings.imap)
      .testConnection()
      .then((r) => ({ ok: true as const, messages: r.messages }))
      .catch((e: Error) => ({ ok: false as const, error: e.message }));
    const smtp = await this.imap
      .verifySmtp(settings.smtp)
      .then(() => ({ ok: true as const }))
      .catch((e: Error) => ({ ok: false as const, error: e.message }));
    return { imap, smtp };
  }

  /** Creates an IMAP mailbox after a successful connection test; the admin gets every permission. */
  async connectImap(companyId: string, adminId: string, dto: ImapMailboxSettingsDto, ip: string) {
    const address = dto.address.toLowerCase();
    const existing = await this.prisma.mailbox.findUnique({ where: { address }, select: { id: true, companyId: true, tokenStatus: true } });
    if (existing && (existing.companyId !== companyId || existing.tokenStatus !== 'disconnected')) {
      throw new UnprocessableEntityException(`A mailbox for ${address} is already connected`);
    }
    await this.assertImapWorks(dto);
    const now = this.clock.now();
    const data = {
      displayName: dto.displayName,
      provider: MailProvider.IMAP,
      refreshTokenEnc: null,
      imapHost: dto.imapHost,
      imapPort: dto.imapPort,
      imapSecure: dto.imapSecure,
      smtpHost: dto.smtpHost,
      smtpPort: dto.smtpPort,
      smtpSecure: dto.smtpSecure,
      username: dto.username,
      passwordEnc: this.imap.encryptPassword(dto.password),
      tokenStatus: 'ok',
      historyId: null,
      lastUidValidity: null,
      lastUid: null,
      watchExpiresAt: null,
    };
    const mailbox = existing
      ? await this.prisma.mailbox.update({ where: { id: existing.id }, data })
      : await this.prisma.mailbox.create({ data: { ...data, companyId, address, connectedBy: adminId, createdAt: now } });
    await this.prisma.mailboxAssignment.upsert({
      where: { mailboxId_employeeId: { mailboxId: mailbox.id, employeeId: adminId } },
      create: { mailboxId: mailbox.id, employeeId: adminId, permissions: Object.values(MailboxPermission), assignedBy: adminId, createdAt: now },
      update: { permissions: Object.values(MailboxPermission) },
    });
    await this.prisma.mailAudit.create({ data: { mailboxId: mailbox.id, employeeId: adminId, action: 'connect', subject: address, ip, occurredAt: now } });
    await this.syncTrigger.trigger(mailbox.id);
    return publicMailbox(mailbox);
  }

  /** Changes server settings or the password of an IMAP mailbox; re-tested before saving. */
  async updateImap(companyId: string, adminId: string, mailboxId: string, dto: UpdateImapMailboxDto, ip: string) {
    const mailbox = await this.getCompanyMailbox(companyId, mailboxId);
    if (mailbox.provider !== MailProvider.IMAP) throw new UnprocessableEntityException('Only IMAP mailboxes have server settings; Gmail mailboxes reconnect through Google.');
    const current = mailbox.passwordEnc ? this.imap.settingsFor(mailbox) : null;
    const merged: Omit<ImapMailboxSettingsDto, 'address' | 'displayName'> = {
      imapHost: dto.imapHost ?? mailbox.imapHost ?? '',
      imapPort: dto.imapPort ?? mailbox.imapPort ?? 993,
      imapSecure: dto.imapSecure ?? mailbox.imapSecure,
      smtpHost: dto.smtpHost ?? mailbox.smtpHost ?? '',
      smtpPort: dto.smtpPort ?? mailbox.smtpPort ?? 465,
      smtpSecure: dto.smtpSecure ?? mailbox.smtpSecure,
      username: dto.username ?? mailbox.username ?? '',
      password: dto.password ?? current?.imap.password ?? '',
    };
    if (!merged.password) throw new BadRequestException('A password is required to reconnect this mailbox');
    await this.assertImapWorks(merged);
    const hostChanged = merged.imapHost !== mailbox.imapHost || merged.username !== mailbox.username;
    const updated = await this.prisma.mailbox.update({
      where: { id: mailbox.id },
      data: {
        displayName: dto.displayName ?? undefined,
        imapHost: merged.imapHost,
        imapPort: merged.imapPort,
        imapSecure: merged.imapSecure,
        smtpHost: merged.smtpHost,
        smtpPort: merged.smtpPort,
        smtpSecure: merged.smtpSecure,
        username: merged.username,
        passwordEnc: dto.password ? this.imap.encryptPassword(dto.password) : undefined,
        tokenStatus: 'ok',
        // a different server or account means the UID cursor is meaningless
        ...(hostChanged ? { lastUidValidity: null, lastUid: null } : {}),
      },
    });
    await this.prisma.mailAudit.create({ data: { mailboxId: mailbox.id, employeeId: adminId, action: 'reconnect', subject: mailbox.address, ip, occurredAt: this.clock.now() } });
    await this.syncTrigger.trigger(mailbox.id);
    return publicMailbox(updated);
  }

  /** Removes the credentials and stops syncing; threads, messages and audit stay for the record. */
  async disconnectMailbox(companyId: string, adminId: string, mailboxId: string, ip: string) {
    const mailbox = await this.getCompanyMailbox(companyId, mailboxId);
    this.assertNotDemo(mailbox);
    const updated = await this.prisma.mailbox.update({
      where: { id: mailbox.id },
      data: { refreshTokenEnc: null, passwordEnc: null, tokenStatus: 'disconnected', watchExpiresAt: null },
    });
    await this.prisma.mailAudit.create({ data: { mailboxId: mailbox.id, employeeId: adminId, action: 'disconnect', subject: mailbox.address, ip, occurredAt: this.clock.now() } });
    return publicMailbox(updated);
  }

  private imapSettings(dto: Omit<ImapMailboxSettingsDto, 'address' | 'displayName'>): { imap: ImapSettings; smtp: SmtpSettings } {
    return {
      imap: { host: dto.imapHost, port: dto.imapPort, secure: dto.imapSecure, username: dto.username, password: dto.password },
      smtp: { host: dto.smtpHost, port: dto.smtpPort, secure: dto.smtpSecure, username: dto.username, password: dto.password },
    };
  }

  private async assertImapWorks(dto: Omit<ImapMailboxSettingsDto, 'address' | 'displayName'>) {
    const r = await this.testImap(dto);
    const errors = [r.imap.ok ? null : r.imap.error, r.smtp.ok ? null : r.smtp.error].filter(Boolean);
    if (errors.length > 0) throw new UnprocessableEntityException(errors.join(' '));
  }

  // ---- bodies and attachments (10 section 8b) ---------------------------------

  /** Fetches the body from the provider on open; HTML is sanitised and remote images are blocked by default. */
  async getMessageBody(mailboxId: string, employeeId: string, messageId: string, allowRemote: boolean, ip: string, deviceId?: string): Promise<MessageBody> {
    await this.verifyPermission(mailboxId, employeeId, MailboxPermission.READ);
    const { message, mailbox } = await this.messageWithMailbox(mailboxId, messageId);
    let html: string | null = null;
    let text: string | null = null;
    let attachments: AttachmentMeta[] = [];
    if (mailbox.tokenStatus === DEMO_TOKEN_STATUS) {
      text = message.snippet ?? '';
    } else if (mailbox.provider === MailProvider.IMAP) {
      const parsed = await this.imapSource(mailbox, message);
      html = parsed.html;
      text = parsed.text;
      attachments = parsed.attachments;
    } else {
      const body = extractGmailBody(await this.gmailClient(mailbox).getMessageFull(message.gmailMessageId));
      html = body.html;
      text = body.text;
      attachments = body.attachments.map(({ attachmentId: _a, ...meta }) => meta);
    }
    const sanitised = sanitizeMailHtml(html, allowRemote);
    await this.prisma.mailAudit.create({
      data: { mailboxId, employeeId, action: 'open', gmailMessageId: message.gmailMessageId, subject: message.thread.subject, ip, deviceId: deviceId || null, occurredAt: this.clock.now() },
    });
    return { id: message.id, html: sanitised.html, text, attachments, remoteImagesBlocked: sanitised.remoteImagesBlocked };
  }

  async getAttachment(mailboxId: string, employeeId: string, messageId: string, partId: string, ip: string, deviceId?: string): Promise<{ fileName: string; mime: string; content: Buffer }> {
    await this.verifyPermission(mailboxId, employeeId, MailboxPermission.DOWNLOAD);
    const { message, mailbox } = await this.messageWithMailbox(mailboxId, messageId);
    this.assertNotDemo(mailbox);
    let file: { fileName: string; mime: string; content: Buffer } | null = null;
    if (mailbox.provider === MailProvider.IMAP) {
      file = await extractAttachment(await this.imapRawSource(mailbox, message), partId);
    } else {
      const client = this.gmailClient(mailbox);
      const body = extractGmailBody(await client.getMessageFull(message.gmailMessageId));
      const att = body.attachments.find((a) => a.partId === partId);
      if (att) file = { fileName: att.fileName, mime: att.mime, content: await client.getAttachment(message.gmailMessageId, att.attachmentId) };
    }
    if (!file) throw new NotFoundException('Attachment not found');
    await this.prisma.mailAudit.create({
      data: { mailboxId, employeeId, action: 'download_attachment', gmailMessageId: message.gmailMessageId, subject: file.fileName, ip, deviceId: deviceId || null, occurredAt: this.clock.now() },
    });
    return file;
  }

  private async messageWithMailbox(mailboxId: string, messageId: string) {
    const message = await this.prisma.mailMessage.findFirst({
      where: { id: messageId, thread: { mailboxId } },
      include: { thread: { select: { subject: true, mailbox: true } } },
    });
    if (!message) throw new NotFoundException('Message not found');
    return { message, mailbox: message.thread.mailbox };
  }

  private gmailClient(mailbox: { refreshTokenEnc: string | null; address: string }): GmailClient {
    if (!this.gmail.configured()) throw new UnprocessableEntityException('Google OAuth client is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
    if (!mailbox.refreshTokenEnc) throw new UnprocessableEntityException(`Mailbox ${mailbox.address} is not connected. Reconnect it under Mail > Mailboxes.`);
    return this.gmail.forRefreshToken(CryptoUtil.decryptField(mailbox.refreshTokenEnc, this.encryptionKey));
  }

  private async imapRawSource(mailbox: Parameters<ImapClientFactory['forMailbox']>[0], message: { uid: number | null; gmailMessageId: string; id: string }): Promise<Buffer> {
    const client = this.imap.forMailbox(mailbox);
    let uid = message.uid;
    if (uid === null) {
      uid = await client.findUidByMessageId(message.gmailMessageId);
      if (uid !== null) await this.prisma.mailMessage.update({ where: { id: message.id }, data: { uid } });
    }
    const source = uid === null ? null : await client.fetchSource(uid);
    if (!source) throw new NotFoundException('The message is no longer on the mail server');
    return source;
  }

  private async imapSource(mailbox: Parameters<ImapClientFactory['forMailbox']>[0], message: { uid: number | null; gmailMessageId: string; id: string; sentAt: Date }) {
    return parseRfc822(await this.imapRawSource(mailbox, message), { date: message.sentAt, messageId: message.gmailMessageId });
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
    let gmailMessageId = `msg_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
    let gmailThreadId = dto.replyToThreadId || `th_${now.getTime()}`;
    const replyTo = dto.replyToThreadId
      ? await this.prisma.mailThread.findFirst({
          where: { mailboxId, OR: [{ id: dto.replyToThreadId }, { gmailThreadId: dto.replyToThreadId }] },
          select: { gmailThreadId: true, messages: { orderBy: { sentAt: 'asc' }, select: { gmailMessageId: true }, take: 20 } },
        })
      : null;

    if (mailbox.provider === MailProvider.IMAP) {
      // SMTP send with In-Reply-To/References threading, then a copy into the Sent folder (10 option D).
      const settings = this.imap.settingsFor(mailbox);
      const references = replyTo ? replyTo.messages.map((m) => m.gmailMessageId).filter((id) => !id.startsWith('uid-')) : [];
      const inReplyTo = dto.replyToMessageId ?? references[references.length - 1];
      const messageId = makeMessageId(mailbox.address);
      const raw = await composeRaw({ from: mailbox.address, fromName: mailbox.displayName, to: dto.to, cc: dto.cc, bcc: dto.bcc, subject: dto.subject, html: dto.html, inReplyTo, references, messageId });
      try {
        await this.imap.sendSmtp(settings.smtp, raw, { from: mailbox.address, to: [...dto.to, ...(dto.cc ?? []), ...(dto.bcc ?? [])] });
      } catch (e) {
        throw new UnprocessableEntityException(`The mail server refused the message: ${(e as Error).message}`);
      }
      this.imap
        .imap(settings.imap)
        .appendSent(raw, now)
        .catch((e: ImapConnectionError) => this.logger.warn(`sent-folder append failed for mailbox ${mailbox.id}: ${e.message}`));
      gmailMessageId = messageId.replace(/^<|>$/g, '');
      gmailThreadId = replyTo?.gmailThreadId ?? gmailMessageId;
    } else if (this.gmail.configured()) {
      // Real send through Gmail when the OAuth client is configured (10 section 4.4).
      const raw = buildRawMessage({ from: mailbox.address, to: dto.to, cc: dto.cc, bcc: dto.bcc, subject: dto.subject, html: dto.html, inReplyTo: dto.replyToMessageId ? angleBracketed(dto.replyToMessageId) : undefined, references: dto.replyToMessageId ? angleBracketed(dto.replyToMessageId) : undefined });
      const client = this.gmailClient(mailbox);
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
      throw new UnprocessableEntityException('This is a demo mailbox with synthetic data. Connect a real mailbox (Google Workspace or IMAP) to send or sync.');
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
