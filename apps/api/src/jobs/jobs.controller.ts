import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JobRegistry } from './job-registry';

/** Admin visibility and manual trigger for background jobs. */
@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(private registry: JobRegistry) {}

  @Get('status')
  @RequirePermission('settings.manage')
  status() {
    return { schedulingEnabled: this.registry.schedulingEnabled, jobs: this.registry.list() };
  }

  @Post(':name/run')
  @RequirePermission('settings.manage')
  run(@Param('name') name: string) {
    return this.registry.run(name);
  }
}
