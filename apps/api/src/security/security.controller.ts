import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SecurityService } from './security.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class SecurityController {
  constructor(private securityService: SecurityService) {}

  @Get('audit-logs')
  @RequirePermission('audit.view')
  async listAuditLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('actorId') actorId?: string,
    @Query('entityType') entityType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.securityService.listAuditLogs(user.companyId, {
      actorId,
      entityType,
      from,
      to,
    });
  }

  @Get('login-events')
  @RequirePermission('security.view')
  async listLoginEvents(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    return this.securityService.listLoginEvents(parsedLimit);
  }

  @Get('security-alerts')
  @RequirePermission('security.view')
  async listSecurityAlerts() {
    return this.securityService.listSecurityAlerts();
  }

  @Post('security-alerts/:id/ack')
  @RequirePermission('security.view')
  async acknowledgeAlert(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.securityService.acknowledgeAlert(id, user.id);
  }
}
