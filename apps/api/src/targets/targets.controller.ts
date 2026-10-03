import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TargetsService } from './targets.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RbacGuard } from '../auth/guards/rbac.guard.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import {
  CreateTargetSchema,
  UpdateTargetSchema,
  CreateTargetDto,
  UpdateTargetDto,
} from '@company-os/contracts';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

@Controller('targets')
@UseGuards(JwtAuthGuard, RbacGuard)
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Post()
  @RequirePermission('targets.manage')
  async createTarget(
    @Request() req: any,
    @Body(new ZodValidationPipe(CreateTargetSchema)) dto: CreateTargetDto,
  ) {
    return this.targetsService.createTarget(req.user.companyId, req.user.sub, dto);
  }

  @Get()
  @RequirePermission('targets.manage')
  async listTargets(
    @Request() req: any,
    @Query('assigneeType') assigneeType?: string,
    @Query('assigneeId') assigneeId?: string,
  ) {
    return this.targetsService.listTargets(req.user.companyId, assigneeType, assigneeId);
  }

  @Get('me')
  async getMyProgress(@Request() req: any) {
    return this.targetsService.getEmployeeTargetProgress(
      req.user.companyId,
      req.user.sub,
    );
  }

  @Get('employee/:id')
  @RequirePermission('targets.view')
  async getEmployeeProgress(
    @Request() req: any,
    @Param('id') employeeId: string,
  ) {
    return this.targetsService.getEmployeeTargetProgress(
      req.user.companyId,
      employeeId,
    );
  }

  @Put(':id')
  @RequirePermission('targets.manage')
  async updateTarget(
    @Request() req: any,
    @Param('id') targetId: string,
    @Body(new ZodValidationPipe(UpdateTargetSchema)) dto: UpdateTargetDto,
  ) {
    return this.targetsService.updateTarget(req.user.companyId, targetId, dto);
  }

  @Delete(':id')
  @RequirePermission('targets.manage')
  async deleteTarget(@Request() req: any, @Param('id') targetId: string) {
    return this.targetsService.deleteTarget(req.user.companyId, targetId);
  }
}
