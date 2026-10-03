import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { CreatePipelineSchema, CreatePipelineStageSchema } from '@company-os/contracts';
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
  async listPipelines(@CurrentUser() user: AuthenticatedUser) {
    return this.pipelinesService.listPipelines(user.companyId);
  }

  @Post()
  @RequirePermission('crm.pipelines.manage')
  async createPipeline(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CreatePipelineSchema.parse(body);
    return this.pipelinesService.createPipeline(user.companyId, dto);
  }

  @Post(':id/stages')
  @RequirePermission('crm.pipelines.manage')
  async createStage(
    @Param('id') pipelineId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CreatePipelineStageSchema.parse(body);
    return this.pipelinesService.createStage(pipelineId, user.companyId, dto);
  }
}
