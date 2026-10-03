import { Module } from '@nestjs/common';
import { TargetsService } from './targets.service.js';
import { TargetsController } from './targets.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [TargetsController],
  providers: [TargetsService],
  exports: [TargetsService],
})
export class TargetsModule {}
