import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { PipelinesService } from './pipelines.service';
import { PipelinesController } from './pipelines.controller';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { TargetsModule } from '../targets/targets.module';

@Module({
  imports: [NotificationsModule, TargetsModule],
  controllers: [
    LeadsController,
    CallsController,
    TasksController,
    PipelinesController,
  ],
  providers: [
    LeadsService,
    CallsService,
    TasksService,
    PipelinesService,
    PrismaService,
    ClockService,
  ],
  exports: [
    LeadsService,
    CallsService,
    TasksService,
    PipelinesService,
  ],
})
export class CrmModule {}
