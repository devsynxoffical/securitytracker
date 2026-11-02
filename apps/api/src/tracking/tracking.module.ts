import { Module } from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';
import { TrackingAdminController } from './tracking-admin.controller';
import { TimesheetsService } from './timesheets.service';
import { TrackingReportsService } from './reports.service';
import { ManualTimeService } from './manual-time.service';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { PermissionsService } from '../auth/permissions.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [TrackingController, TrackingAdminController],
  providers: [TrackingService, TimesheetsService, TrackingReportsService, ManualTimeService, PermissionsService, PrismaService, ClockService],
  exports: [TrackingService, TimesheetsService],
})
export class TrackingModule {}
