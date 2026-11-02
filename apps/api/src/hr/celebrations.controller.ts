import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CelebrationsService } from './celebrations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

const QuerySchema = z.object({ days: z.coerce.number().int().min(0).max(90).default(14) });

/** FR-HR-16: who has a birthday or work anniversary coming up, within the caller's employee scope. */
@Controller('hr')
@UseGuards(JwtAuthGuard)
export class CelebrationsController {
  constructor(private celebrations: CelebrationsService) {}

  @Get('celebrations')
  @RequirePermission('employees.view')
  async upcoming(@Req() req: any, @Query() query: unknown) {
    const q = QuerySchema.parse(query);
    const items = await this.celebrations.upcoming(req.scopeFilter, q.days);
    return { days: q.days, items };
  }
}
