import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import {
  CreatePipelineSchema,
  CreatePipelineStageSchema,
  UpdatePipelineStageSchema,
  ReorderStagesSchema,
  PipelineEntity,
  PipelineEntityValue,
} from '@company-os/contracts';
import { PipelinesService } from './pipelines.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('pipelines')
@UseGuards(JwtAuthGuard)
export class PipelinesController {
  constructor(private pipelinesService: PipelinesService) {}

  @Get()
  @RequirePermission('crm.leads.view')
  listPipelines(@CurrentUser() user: AuthenticatedUser, @Query('entity') entity?: string) {
    const et = entity === PipelineEntity.DEAL || entity === PipelineEntity.LEAD ? (entity as PipelineEntityValue) : undefined;
    return this.pipelinesService.listPipelines(user.companyId, et);
  }

  @Post()
  @RequirePermission('crm.pipelines.manage')
  createPipeline(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.pipelinesService.createPipeline(user.companyId, CreatePipelineSchema.parse(body));
  }

  @Patch(':id')
  @RequirePermission('crm.pipelines.manage')
  updatePipeline(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.pipelinesService.updatePipeline(user.companyId, id, CreatePipelineSchema.partial().parse(body));
  }

  @Delete(':id')
  @RequirePermission('crm.pipelines.manage')
  deletePipeline(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pipelinesService.deletePipeline(user.companyId, id);
  }

  @Post(':id/stages')
  @RequirePermission('crm.pipelines.manage')
  createStage(@Param('id') pipelineId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.pipelinesService.createStage(pipelineId, user.companyId, CreatePipelineStageSchema.parse(body));
  }

  @Patch(':id/stages/:stageId')
  @RequirePermission('crm.pipelines.manage')
  updateStage(@Param('id') pipelineId: string, @Param('stageId') stageId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.pipelinesService.updateStage(user.companyId, pipelineId, stageId, UpdatePipelineStageSchema.parse(body));
  }

  @Delete(':id/stages/:stageId')
  @RequirePermission('crm.pipelines.manage')
  deleteStage(@Param('id') pipelineId: string, @Param('stageId') stageId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pipelinesService.deleteStage(user.companyId, pipelineId, stageId);
  }

  @Post(':id/stages/reorder')
  @RequirePermission('crm.pipelines.manage')
  reorder(@Param('id') pipelineId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.pipelinesService.reorderStages(user.companyId, pipelineId, ReorderStagesSchema.parse(body));
  }
}
