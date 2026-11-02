import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { PermissionsService } from '../auth/permissions.service';
import { CustomFieldsService } from '../crm/shared/custom-fields.service';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';
import { ProfilesService } from './profiles.service';
import { ChecklistsService } from './checklists.service';
import { AnnouncementsService } from './announcements.service';
import { HrController } from './hr.controller';
import { CelebrationsService } from './celebrations.service';
import { CelebrationsController } from './celebrations.controller';

/**
 * HR module (15-hr-spec.md): leave types and balances, requests, profiles, documents,
 * checklists, announcements, org chart.
 */
@Module({
  imports: [NotificationsModule, AttendanceModule],
  controllers: [LeaveController, HrController, CelebrationsController],
  providers: [LeaveService, ProfilesService, ChecklistsService, AnnouncementsService, CelebrationsService, PermissionsService, CustomFieldsService],
  exports: [LeaveService, ChecklistsService, CelebrationsService],
})
export class HrModule {}
