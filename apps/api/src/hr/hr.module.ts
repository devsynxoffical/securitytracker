import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { PermissionsService } from '../auth/permissions.service';

/**
 * HR module (15-hr-spec.md): leave types and balances, profiles, documents,
 * checklists, announcements. Controllers and services are registered here as they are built.
 */
@Module({
  imports: [NotificationsModule, AttendanceModule],
  controllers: [],
  providers: [PermissionsService],
  exports: [],
})
export class HrModule {}
