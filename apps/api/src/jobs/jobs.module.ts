import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Background jobs (02-architecture.md section 6). Scheduled work uses @nestjs/schedule;
 * event-driven queues use BullMQ with lazy Redis connection. Providers are registered as built.
 */
@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule],
  providers: [],
  exports: [],
})
export class JobsModule {}
