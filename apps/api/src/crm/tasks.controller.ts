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
import { CreateTaskSchema, UpdateTaskStatusSchema } from '@company-os/contracts';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  @RequirePermission('tasks.view')
  async listTasks(
    @Req() req: any,
    @Query('assigneeId') assigneeId?: string,
    @Query('leadId') leadId?: string,
    @Query('status') status?: string,
    @Query('dueToday') dueToday?: string,
  ) {
    return this.tasksService.listTasks(req.scopeFilter, {
      assigneeId,
      leadId,
      status,
      dueToday: dueToday === 'true',
    });
  }

  @Post()
  @RequirePermission('tasks.create')
  async createTask(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CreateTaskSchema.parse(body);
    return this.tasksService.createTask(user.companyId, user.id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('tasks.view')
  async updateTaskStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const dto = UpdateTaskStatusSchema.parse(body);
    return this.tasksService.updateTaskStatus(id, user.companyId, user.id, dto, req.scopeFilter);
  }
}
