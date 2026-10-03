import { Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { MailController } from './mail.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TargetsModule } from '../targets/targets.module.js';

@Module({
  imports: [NotificationsModule, TargetsModule],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
