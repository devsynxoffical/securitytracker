import { Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { MailController } from './mail.controller.js';
import { ConversationsService } from './conversations.service.js';
import { ConversationsController } from './conversations.controller.js';
import { MailConfigService } from './mail-config.service.js';
import { MailConfigController } from './mail-config.controller.js';
import { CrmThreadsController } from './crm-threads.controller.js';
import { PermissionsService } from '../auth/permissions.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TargetsModule } from '../targets/targets.module.js';

@Module({
  imports: [NotificationsModule, TargetsModule],
  controllers: [MailConfigController, MailController, ConversationsController, CrmThreadsController],
  providers: [MailService, ConversationsService, MailConfigService, PermissionsService],
  exports: [MailService, ConversationsService],
})
export class MailModule {}
