import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import {
  ConversationListQuerySchema,
  AssignConversationSchema,
  SetConversationStatusSchema,
  LinkConversationSchema,
  CreateMailCommentSchema,
} from '@company-os/contracts';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

/** Entry gate is mail.use; the per-mailbox assignment permission is checked in the service (17 section 4). */
@Controller('mail/mailboxes/:id')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private conversations: ConversationsService) {}

  @Get('conversations')
  @RequirePermission('mail.use')
  list(@Param('id') mailboxId: string, @CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.conversations.list(mailboxId, user.id, ConversationListQuerySchema.parse(query));
  }

  @Get('conversations/counts')
  @RequirePermission('mail.use')
  counts(@Param('id') mailboxId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.counts(mailboxId, user.id);
  }

  @Post('threads/:threadId/assign')
  @RequirePermission('mail.use')
  assign(@Param('id') mailboxId: string, @Param('threadId') threadId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.conversations.assign(mailboxId, user.id, threadId, AssignConversationSchema.parse(body).assigneeId);
  }

  @Post('threads/:threadId/status')
  @RequirePermission('mail.use')
  status(@Param('id') mailboxId: string, @Param('threadId') threadId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.conversations.setStatus(mailboxId, user.id, threadId, SetConversationStatusSchema.parse(body));
  }

  @Post('threads/:threadId/labels/:labelId')
  @RequirePermission('mail.use')
  addLabel(@Param('id') mailboxId: string, @Param('threadId') threadId: string, @Param('labelId') labelId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.addLabel(mailboxId, user.id, threadId, labelId);
  }

  @Delete('threads/:threadId/labels/:labelId')
  @RequirePermission('mail.use')
  removeLabel(@Param('id') mailboxId: string, @Param('threadId') threadId: string, @Param('labelId') labelId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.removeLabel(mailboxId, user.id, threadId, labelId);
  }

  @Post('threads/:threadId/link')
  @RequirePermission('mail.use')
  link(@Param('id') mailboxId: string, @Param('threadId') threadId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.conversations.link(mailboxId, user.id, threadId, LinkConversationSchema.parse(body));
  }

  @Get('threads/:threadId/comments')
  @RequirePermission('mail.use')
  listComments(@Param('id') mailboxId: string, @Param('threadId') threadId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.listComments(mailboxId, user.id, threadId);
  }

  @Post('threads/:threadId/comments')
  @RequirePermission('mail.use')
  addComment(@Param('id') mailboxId: string, @Param('threadId') threadId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.conversations.addComment(mailboxId, user.id, threadId, CreateMailCommentSchema.parse(body));
  }

  @Delete('threads/:threadId/comments/:commentId')
  @RequirePermission('mail.use')
  deleteComment(@Param('id') mailboxId: string, @Param('threadId') threadId: string, @Param('commentId') commentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.deleteComment(mailboxId, user.id, threadId, commentId);
  }

  @Get('threads/:threadId/events')
  @RequirePermission('mail.use')
  events(@Param('id') mailboxId: string, @Param('threadId') threadId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.listEvents(mailboxId, user.id, threadId);
  }
}
