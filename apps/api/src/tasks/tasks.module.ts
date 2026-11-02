import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TargetsModule } from '../targets/targets.module';
import { PermissionsService } from '../auth/permissions.service';

/**
 * Work management module (14-tasks-spec.md): spaces, lists, statuses, tasks.
 * Controllers and services are registered here as they are built.
 */
@Module({
  imports: [NotificationsModule, TargetsModule],
  controllers: [],
  providers: [PermissionsService],
  exports: [],
})
export class TasksModule {}
