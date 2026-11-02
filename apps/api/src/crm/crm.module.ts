import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { PipelinesService } from './pipelines.service';
import { PipelinesController } from './pipelines.controller';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';
import { ActivitiesController } from './activities.controller';
import { CrmConfigService } from './crm-config.service';
import { CrmConfigController } from './crm-config.controller';
import { LeadConversionService } from './lead-conversion.service';
import { CrmImportService } from './import.service';
import { CrmImportController } from './import.controller';
import { CrmInsightsService } from './crm-insights.service';
import { CrmInsightsController } from './crm-insights.controller';
import { CrmExportService } from './crm-export.service';
import { CrmActivitiesService } from './shared/activities.service';
import { RecordTagsService } from './shared/tags.service';
import { CustomFieldsService } from './shared/custom-fields.service';
import { PermissionsService } from '../auth/permissions.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { TargetsModule } from '../targets/targets.module';

@Module({
  imports: [NotificationsModule, TargetsModule],
  controllers: [
    LeadsController,
    CallsController,
    TasksController,
    PipelinesController,
    AccountsController,
    ContactsController,
    DealsController,
    ActivitiesController,
    CrmConfigController,
    CrmImportController,
    CrmInsightsController,
  ],
  providers: [
    LeadsService,
    CallsService,
    TasksService,
    PipelinesService,
    AccountsService,
    ContactsService,
    DealsService,
    CrmConfigService,
    LeadConversionService,
    CrmImportService,
    CrmInsightsService,
    CrmExportService,
    CrmActivitiesService,
    RecordTagsService,
    CustomFieldsService,
    PermissionsService,
  ],
  exports: [LeadsService, CallsService, TasksService, PipelinesService, AccountsService, ContactsService, DealsService],
})
export class CrmModule {}
