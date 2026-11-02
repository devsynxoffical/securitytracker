import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { MailModule } from '../mail/mail.module';
import { JobRegistry } from './job-registry';
import { ShiftJobsService } from './shift-jobs.service';
import { AttendanceJobsService } from './attendance-jobs.service';
import { ReminderJobsService } from './reminder-jobs.service';
import { HrJobsService } from './hr-jobs.service';
import { MailJobsService } from './mail-jobs.service';
import { MaintenanceJobsService } from './maintenance-jobs.service';
import { JobsController } from './jobs.controller';

/**
 * Background jobs (02-architecture.md section 6). Scheduled work uses @nestjs/schedule and runs only
 * with JOBS_ENABLED=true; the gmail-sync BullMQ worker runs only with WORKER_ENABLED=true, so the same
 * codebase starts as API or worker (02 section 2).
 */
@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule, AttendanceModule, MailModule],
  controllers: [JobsController],
  providers: [JobRegistry, ShiftJobsService, AttendanceJobsService, ReminderJobsService, HrJobsService, MailJobsService, MaintenanceJobsService],
  exports: [JobRegistry, MailJobsService],
})
export class JobsModule {}
