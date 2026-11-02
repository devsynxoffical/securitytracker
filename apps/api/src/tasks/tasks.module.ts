import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TargetsModule } from '../targets/targets.module';
import { PermissionsService } from '../auth/permissions.service';
import { SpacesService } from './spaces.service';
import { TasksService } from './tasks.service';
import { TaskDetailsService } from './task-details.service';
import { SpacesController, ListsController } from './spaces.controller';
import { TasksController } from './tasks.controller';

/**
 * Work management module (14-tasks-spec.md): spaces, lists, statuses, tasks.
 * Controller order matters: `/tasks/spaces` and `/tasks/lists` register before `/tasks/:id`.
 */
@Module({
  imports: [NotificationsModule, TargetsModule],
  controllers: [SpacesController, ListsController, TasksController],
  providers: [SpacesService, TasksService, TaskDetailsService, PermissionsService],
  exports: [TasksService],
})
export class TasksModule {}
