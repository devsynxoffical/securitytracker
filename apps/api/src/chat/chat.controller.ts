import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ChatSearchQuerySchema,
  CreateDirectChannelSchema,
  CreateGroupChannelSchema,
  EditMessageSchema,
  ListChannelsQuerySchema,
  ListMessagesQuerySchema,
  MarkReadSchema,
  SendMessageSchema,
  UpdateChannelSchema,
} from '@company-os/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';

/**
 * 22-internal-chat-spec.md section 5. Entry gate is chat.use on every route; membership and
 * chat.manage (moderation, rename, archive, delete-any) are checked in the service.
 */
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chat: ChatService) {}

  @Get('channels')
  @RequirePermission('chat.use')
  listChannels(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.chat.listChannels(user, ListChannelsQuerySchema.parse(query));
  }

  @Post('channels')
  @RequirePermission('chat.use')
  createGroup(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.chat.createGroup(user, CreateGroupChannelSchema.parse(body));
  }

  @Post('channels/direct')
  @RequirePermission('chat.use')
  createDirect(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.chat.createDirect(user, CreateDirectChannelSchema.parse(body));
  }

  @Patch('channels/:id')
  @RequirePermission('chat.use')
  updateChannel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.chat.updateChannel(user, id, UpdateChannelSchema.parse(body));
  }

  @Post('channels/:id/members/:employeeId')
  @RequirePermission('chat.use')
  addMember(@Param('id') id: string, @Param('employeeId') employeeId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.addMember(user, id, employeeId);
  }

  @Delete('channels/:id/members/:employeeId')
  @RequirePermission('chat.use')
  removeMember(@Param('id') id: string, @Param('employeeId') employeeId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.removeMember(user, id, employeeId);
  }

  @Post('channels/:id/leave')
  @RequirePermission('chat.use')
  @HttpCode(HttpStatus.OK)
  leave(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.leave(user, id);
  }

  @Get('channels/:id/messages')
  @RequirePermission('chat.use')
  listMessages(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.chat.listMessages(user, id, ListMessagesQuerySchema.parse(query));
  }

  @Post('channels/:id/messages')
  @RequirePermission('chat.use')
  sendMessage(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.chat.sendMessage(user, id, SendMessageSchema.parse(body), idempotencyKey);
  }

  @Patch('messages/:id')
  @RequirePermission('chat.use')
  editMessage(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.chat.editMessage(user, id, EditMessageSchema.parse(body));
  }

  @Delete('messages/:id')
  @RequirePermission('chat.use')
  deleteMessage(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.deleteMessage(user, id);
  }

  @Post('channels/:id/read')
  @RequirePermission('chat.use')
  @HttpCode(HttpStatus.OK)
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.chat.markRead(user, id, MarkReadSchema.parse(body));
  }

  @Post('channels/:id/typing')
  @RequirePermission('chat.use')
  @HttpCode(HttpStatus.OK)
  typing(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.typing(user, id);
  }

  @Get('search')
  @RequirePermission('chat.use')
  search(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.chat.search(user, ChatSearchQuerySchema.parse(query));
  }

  @Get('unread')
  @RequirePermission('chat.use')
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.unread(user);
  }
}
