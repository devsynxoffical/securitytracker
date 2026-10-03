import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Ip,
  Headers,
} from '@nestjs/common';
import { MailService } from './mail.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RbacGuard } from '../auth/guards/rbac.guard.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import {
  SendMailSchema,
  SaveDraftSchema,
  MailboxAssignmentSchema,
  SendMailDto,
  SaveDraftDto,
  MailboxAssignmentDto,
} from '@company-os/contracts';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Get('oauth/url')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.accounts.manage')
  getConnectUrl(@Request() req: any) {
    return this.mailService.getConnectUrl(req.user.companyId, req.user.sub);
  }

  @Get('oauth/callback')
  async handleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return this.mailService.handleOAuthCallback(code, state);
  }

  @Post('google/push')
  async handleGooglePush(@Body() body: any) {
    return this.mailService.handlePushWebhook(body);
  }

  @Get('mailboxes')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  async listMailboxes(@Request() req: any, @Query('admin') adminView?: string) {
    const isAdmin = adminView === 'true' && req.user.permissions?.includes('mail.accounts.manage');
    return this.mailService.listMailboxes(req.user.companyId, req.user.sub, isAdmin);
  }

  @Post('mailboxes/:id/assign')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.assign')
  async assignMailbox(
    @Request() req: any,
    @Param('id') mailboxId: string,
    @Body(new ZodValidationPipe(MailboxAssignmentSchema)) dto: MailboxAssignmentDto,
  ) {
    return this.mailService.assignMailbox(req.user.companyId, req.user.sub, mailboxId, dto);
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
      req.user.sub,
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
      req.user.sub,
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
      req.user.sub,
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
    return this.mailService.saveDraft(mailboxId, req.user.sub, dto);
  }

  @Post('mailboxes/:id/threads/:threadId/archive')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mail.use')
  async archiveThread(
    @Request() req: any,
    @Param('id') mailboxId: string,
    @Param('threadId') threadId: string,
  ) {
    return this.mailService.archiveThread(mailboxId, req.user.sub, threadId);
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
    return this.mailService.markRead(mailboxId, req.user.sub, threadId, unread);
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
