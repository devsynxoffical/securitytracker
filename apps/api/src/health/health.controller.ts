import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { Public } from '../auth/guards/jwt-auth.guard';

@Public()
@Controller()
export class HealthController {

  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: this.clock.nowIso(),
    };
  }

  @Get('health/ready')
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ready',
      database: 'connected',
      timestamp: this.clock.nowIso(),
    };
  }
}
