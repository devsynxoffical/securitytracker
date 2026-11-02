import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionsService } from '../auth/permissions.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatMembershipService } from './chat-membership.service';

/** Internal chat (22-internal-chat-spec.md). ChatMembershipService is exported for the employees service (FR-CHAT-01, FR-CHAT-10). */
@Module({
  imports: [JwtModule.register({}), NotificationsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, ChatMembershipService, PermissionsService],
  exports: [ChatMembershipService],
})
export class ChatModule {}
