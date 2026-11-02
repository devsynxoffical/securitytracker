import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Ip,
  Headers,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { MailService } from './mail.service.js';
import { JwtAuthGuard, Public } from '../auth/guards/jwt-auth.guard.js';
import { RbacGuard } from '../auth/guards/rbac.guard.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { ExportGuarded } from '../auth/decorators/export-guarded.decorator.js';
import {
  SendMailSchema,
  SaveDraftSchema,
  MailboxAssignmentSchema,
  SendMailDto,
  SaveDraftDto,
  MailboxAssignmentDto,
  ImapMailboxSettingsSchema,
  ImapMailboxSettingsDto,
  UpdateImapMailboxSchema,
  UpdateImapMailboxDto,
  PresenceSchema,
  PresenceDto,
} from '@company-os/contracts';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { PermissionsService } from '../auth/permissions.service.js';
import { MailSyncService } from './mail-sync.service.js';
import { PresenceService } from './presence.service.js';
import { PrismaService } from '../common/prisma.service.js';

const ImapTestSchema = ImapMailboxSettingsSchema.omit({ address: true, displayName: true });
type ImapTestDto = Omit<ImapMailboxSettingsDto, 'address' | 'displayName'>;

@Controller('mail')
export class MailController {
  constructor(
    private readonly mailService: MailService,
    private readonly permissions: PermissionsService,
    private readonly mailSync: MailSyncService,
    private readonly presence: PresenceService,
    private readonly prisma: PrismaService,
  ) {}

  // ---- IMAP/SMTP mailboxes (10 section 2 option D) ---------------------------

  /** Connection test without saving anything; used by the connect form before submit. */
  @Post('mailboxes/imap/test')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.accounts.manage')
  testImap(@Body(new ZodValidationPipe(ImapTestSchema)) dto: ImapTestDto) {
    return this.mailService.testImap(dto);
  }

  @Post('mailboxes/imap')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.accounts.manage')
  connectImap(@Request() req: any, @Body(new ZodValidationPipe(ImapMailboxSettingsSchema)) dto: ImapMailboxSettingsDto, @Ip() ip: string) {
    return this.mailService.connectImap(req.user.companyId, req.user.id, dto, ip);
  }

  @Patch('mailboxes/:id/imap')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.accounts.manage')
  updateImap(@Request() req: any, @Param('id') mailboxId: string, @Body(new ZodValidationPipe(UpdateImapMailboxSchema)) dto: UpdateImapMailboxDto, @Ip() ip: string) {
    return this.mailService.updateImap(req.user.companyId, req.user.id, mailboxId, dto, ip);
  }

  /** Disconnect: credentials are wiped, threads stay. Works for Gmail and IMAP mailboxes. */
  @Delete('mailboxes/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.accounts.manage')
  disconnect(@Request() req: any, @Param('id') mailboxId: string, @Ip() ip: string) {
    return this.mailService.disconnectMailbox(req.user.companyId, req.user.id, mailboxId, ip);
  }

  // ---- bodies and attachments (10 section 8b) ---------------------------------

  @Get('mailboxes/:id/messages/:messageId/body')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  getMessageBody(
    @Request() req: any,
    @Param('id') mailboxId: string,
    @Param('messageId') messageId: string,
    @Query('allowRemote') allowRemote: string | undefined,
    @Ip() ip: string,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.mailService.getMessageBody(mailboxId, req.user.id, messageId, allowRemote === 'true', ip, deviceId);
  }

  @Get('mailboxes/:id/messages/:messageId/attachments/:partId')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  @ExportGuarded({ anyEnabledPolicy: true })
  async getAttachment(
    @Request() req: any,
    @Param('id') mailboxId: string,
    @Param('messageId') messageId: string,
    @Param('partId') partId: string,
    @Ip() ip: string,
    @Res() res: Response,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const file = await this.mailService.getAttachment(mailboxId, req.user.id, messageId, partId, ip, deviceId);
    const safeName = file.fileName.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'attachment';
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', String(file.content.length));
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(file.content);
  }

  // ---- presence (FR-MAIL-19) ---------------------------------------------------

  @Post('mailboxes/:id/threads/:threadId/presence')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  async heartbeat(@Request() req: any, @Param('id') mailboxId: string, @Param('threadId') threadId: string, @Body(new ZodValidationPipe(PresenceSchema)) dto: PresenceDto) {
    await this.mailService.verifyPermission(mailboxId, req.user.id, 'read');
    const me = await this.prisma.employee.findUnique({ where: { id: req.user.id }, select: { firstName: true, lastName: true } });
    const viewers = await this.presence.heartbeat(threadId, { employeeId: req.user.id, name: me ? `${me.firstName} ${me.lastName}`.trim() : 'Colleague' }, dto.action);
    return { viewers };
  }

  @Get('mailboxes/:id/threads/:threadId/presence')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  async viewers(@Request() req: any, @Param('id') mailboxId: string, @Param('threadId') threadId: string) {
    await this.mailService.verifyPermission(mailboxId, req.user.id, 'read');
    return { viewers: await this.presence.viewers(threadId, req.user.id) };
  }

  @Get('oauth/url')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.accounts.manage')
  getConnectUrl(@Request() req: any) {
    return this.mailService.getConnectUrl(req.user.companyId, req.user.id);
  }

  /** Google redirects here without our JWT; the signed state carries the admin identity. */
  @Public()
  @Get('oauth/callback')
  async handleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return this.mailService.handleOAuthCallback(code, state);
  }

  /** Pub/Sub push: authenticated by the OIDC token when GMAIL_PUSH_AUDIENCE is set (10 section 3). */
  @Public()
  @Post('google/push')
  async handleGooglePush(@Body() body: any, @Headers('authorization') authorization?: string) {
    return this.mailService.handlePushWebhook(body, authorization);
  }

  /** Manual sync trigger for admins (FR-MAIL-20). Runs inline and returns counts. */
  @Get('mailboxes/:id/sync')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.accounts.manage')
  async syncMailbox(@Request() req: any, @Param('id') mailboxId: string) {
    const mailbox = await this.mailService.getCompanyMailbox(req.user.companyId, mailboxId);
    return this.mailSync.syncMailbox(mailbox.id);
  }

  @Get('mailboxes')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  async listMailboxes(@Request() req: any, @Query('admin') adminView?: string) {
    const isAdmin = adminView === 'true' && (await this.permissions.has(req.user, 'mail.accounts.manage'));
    return this.mailService.listMailboxes(req.user.companyId, req.user.id, isAdmin);
  }

  @Post('mailboxes/:id/assign')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.assign')
  async assignMailbox(
    @Request() req: any,
    @Param('id') mailboxId: string,
    @Body(new ZodValidationPipe(MailboxAssignmentSchema)) dto: MailboxAssignmentDto,
  ) {
    return this.mailService.assignMailbox(req.user.companyId, req.user.id, mailboxId, dto);
  }

  @Get('mailboxes/:id/threads')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  async listThreads(
    @Request() req: any,
    @Param('id') mailboxId: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.mailService.listThreads(
      mailboxId,
      req.user.id,
      search,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('mailboxes/:id/threads/:threadId')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  async getThreadDetail(
    @Request() req: any,
    @Param('id') mailboxId: string,
    @Param('threadId') threadId: string,
    @Ip() ip: string,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.mailService.getThreadDetail(
      mailboxId,
      req.user.id,
      threadId,
      ip,
      deviceId,
    );
  }

  @Post('mailboxes/:id/send')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  async sendMail(
    @Request() req: any,
    @Param('id') mailboxId: string,
    @Body(new ZodValidationPipe(SendMailSchema)) dto: SendMailDto,
    @Ip() ip: string,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.mailService.sendMail(
      mailboxId,
      req.user.id,
      req.user.companyId,
      dto,
      ip,
      deviceId,
    );
  }

  @Post('mailboxes/:id/drafts')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  async saveDraft(
    @Request() req: any,
    @Param('id') mailboxId: string,
    @Body(new ZodValidationPipe(SaveDraftSchema)) dto: SaveDraftDto,
  ) {
    return this.mailService.saveDraft(mailboxId, req.user.id, dto);
  }

  @Post('mailboxes/:id/threads/:threadId/archive')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  async archiveThread(
    @Request() req: any,
    @Param('id') mailboxId: string,
    @Param('threadId') threadId: string,
  ) {
    return this.mailService.archiveThread(mailboxId, req.user.id, threadId);
  }

  @Post('mailboxes/:id/threads/:threadId/read')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  async markRead(
    @Request() req: any,
    @Param('id') mailboxId: string,
    @Param('threadId') threadId: string,
    @Body('unread') unread: boolean,
  ) {
    return this.mailService.markRead(mailboxId, req.user.id, threadId, unread);
  }

  @Get('audit')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.logs.view')
  async listAudit(
    @Request() req: any,
    @Query('mailboxId') mailboxId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('action') action?: string,
  ) {
    return this.mailService.listAuditLogs(req.user.companyId, {
      mailboxId,
      employeeId,
      action,
    });
  }
}
