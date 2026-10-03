import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
} from '@company-os/contracts';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('departments')
@UseGuards(JwtAuthGuard)
export class DepartmentsController {
  constructor(private departmentsService: DepartmentsService) {}

  @Get()
  @RequirePermission('org.manage')
  async listDepartments(@CurrentUser() user: AuthenticatedUser) {
    return this.departmentsService.listDepartments(user.companyId);
  }

  @Post()
  @RequirePermission('org.manage')
  async createDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CreateDepartmentSchema.parse(body);
    return this.departmentsService.createDepartment(user.companyId, dto);
  }

  @Patch(':id')
  @RequirePermission('org.manage')
  async updateDepartment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = UpdateDepartmentSchema.parse(body);
    return this.departmentsService.updateDepartment(id, user.companyId, dto);
  }

  @Delete(':id')
  @RequirePermission('org.manage')
  async deleteDepartment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departmentsService.deleteDepartment(id, user.companyId);
  }
}
