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
  CreateLeadSchema,
  UpdateLeadSchema,
  UpdateLeadStageSchema,
  AssignLeadSchema,
  BulkAssignLeadsSchema,
  AddNoteSchema,
  ScheduleAppointmentSchema,
  CheckDuplicateLeadSchema,
} from '@company-os/contracts';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  @Get()
  @RequirePermission('crm.leads.view')
  async listLeads(
    @Req() req: any,
    @Query('ownerId') ownerId?: string,
    @Query('pipelineId') pipelineId?: string,
    @Query('stageId') stageId?: string,
    @Query('isClient') isClient?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leadsService.listLeads(req.scopeFilter, {
      ownerId,
      pipelineId,
      stageId,
      isClient: isClient !== undefined ? isClient === 'true' : undefined,
      search,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('crm.leads.view')
  async getLeadById(@Param('id') id: string, @Req() req: any) {
    return this.leadsService.getLeadById(id, req.scopeFilter);
  }

  @Post('check-duplicate')
  @RequirePermission('crm.leads.create')
  async checkDuplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CheckDuplicateLeadSchema.parse(body);
    return this.leadsService.checkDuplicate(user.companyId, dto.phones, dto.emails);
  }

  @Post()
  @RequirePermission('crm.leads.create')
  async createLead(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CreateLeadSchema.parse(body);
    return this.leadsService.createLead(user.companyId, user.id, dto);
  }

  @Patch(':id')
  @RequirePermission('crm.leads.edit')
  async updateLead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const dto = UpdateLeadSchema.parse(body);
    return this.leadsService.updateLead(id, user.companyId, user.id, dto, req.scopeFilter);
  }

  @Post(':id/stage')
  @RequirePermission('crm.leads.edit')
  async updateLeadStage(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const dto = UpdateLeadStageSchema.parse(body);
    return this.leadsService.updateLeadStage(id, user.companyId, user.id, dto, req.scopeFilter);
  }

  @Post(':id/assign')
  @RequirePermission('crm.leads.assign')
  async assignLead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const dto = AssignLeadSchema.parse(body);
    return this.leadsService.assignLead(id, user.companyId, user.id, dto, req.scopeFilter);
  }

  @Post('bulk-assign')
  @RequirePermission('crm.leads.assign')
  async bulkAssignLeads(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = BulkAssignLeadsSchema.parse(body);
    return this.leadsService.bulkAssignLeads(user.companyId, user.id, dto);
  }

  @Post(':id/notes')
  @RequirePermission('crm.leads.edit')
  async addNote(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const dto = AddNoteSchema.parse(body);
    return this.leadsService.addNote(id, user.companyId, user.id, dto, req.scopeFilter);
  }

  @Post(':id/appointments')
  @RequirePermission('crm.leads.edit')
  async scheduleAppointment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const dto = ScheduleAppointmentSchema.parse(body);
    return this.leadsService.scheduleAppointment(id, user.companyId, user.id, dto, req.scopeFilter);
  }
}
