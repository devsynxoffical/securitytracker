import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
  DisableEmployeeSchema,
} from '@company-os/contracts';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private employeesService: EmployeesService) {}

  @Get()
  @RequirePermission('employees.view')
  async listEmployees(@Req() req: any, @Query('status') status?: string) {
    return this.employeesService.listEmployees(req.scopeFilter, status);
  }

  @Get(':id')
  @RequirePermission('employees.view')
  async getEmployeeById(@Param('id') id: string, @Req() req: any) {
    return this.employeesService.getEmployeeById(id, req.scopeFilter);
  }

  @Post()
  @RequirePermission('employees.create')
  async createEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CreateEmployeeSchema.parse(body);
    return this.employeesService.createEmployee(user.companyId, dto);
  }

  @Patch(':id')
  @RequirePermission('employees.edit')
  async updateEmployee(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = UpdateEmployeeSchema.parse(body);
    return this.employeesService.updateEmployee(id, user.companyId, dto);
  }

  @Post(':id/reset-password')
  @RequirePermission('employees.reset_password')
  async resetPassword(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.resetPassword(id, user.companyId);
  }

  @Get(':id/offboarding-preview')
  @RequirePermission('employees.disable')
  async getOffboardingPreview(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.getOffboardingPreview(id, user.companyId);
  }

  @Post(':id/disable')
  @RequirePermission('employees.disable')
  async disableEmployee(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = DisableEmployeeSchema.parse(body);
    return this.employeesService.disableEmployee(id, user.companyId, dto);
  }

  @Post(':id/enable')
  @RequirePermission('employees.edit')
  async enableEmployee(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.enableEmployee(id, user.companyId);
  }
}
