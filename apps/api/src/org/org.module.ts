import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { DepartmentsService } from './departments.service';
import { DepartmentsController } from './departments.controller';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';

@Module({
  controllers: [
    EmployeesController,
    DepartmentsController,
    TeamsController,
    RolesController,
  ],
  providers: [
    EmployeesService,
    DepartmentsService,
    TeamsService,
    RolesService,
    PrismaService,
    ClockService,
  ],
  exports: [
    EmployeesService,
    DepartmentsService,
    TeamsService,
    RolesService,
  ],
})
export class OrgModule {}
