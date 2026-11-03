import { Controller, Get, Post, Param, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SecurityService } from './security.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

const AuditQuerySchema = z.object({
  actorId: z.string().guid().optional(),
  entityType: z.string().max(60).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  cursor: z.string().guid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const LoginEventsQuerySchema = z.object({
  employeeId: z.string().guid().optional(),
  result: z.string().max(40).optional(),
  cursor: z.string().guid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const SessionsQuerySchema = z.object({
  employeeId: z.string().guid().optional(),
  active: z.enum(['true', 'false']).optional(),
  client: z.enum(['desktop', 'admin']).optional(),
  cursor: z.string().guid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

@Controller()
@UseGuards(JwtAuthGuard)
export class SecurityController {
  constructor(private securityService: SecurityService) {}

  @Get('audit-logs')
  @RequirePermission('audit.view')
  listAuditLogs(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.securityService.listAuditLogs(user.companyId, AuditQuerySchema.parse(query));
  }

  @Get('login-events')
  @RequirePermission('security.view')
  listLoginEvents(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.securityService.listLoginEvents(user.companyId, LoginEventsQuerySchema.parse(query));
  }

  @Get('security-alerts')
  @RequirePermission('security.view')
  listSecurityAlerts(@CurrentUser() user: AuthenticatedUser, @Query('acknowledged') acknowledged?: string) {
    const ack = acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined;
    return this.securityService.listSecurityAlerts(user.companyId, ack);
  }

  @Post('security-alerts/:id/ack')
  @RequirePermission('security.view')
  acknowledgeAlert(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.securityService.acknowledgeAlert(id, user.id);
  }

  // ---- Sessions (FR-AUTH-08)

  @Get('sessions')
  @RequirePermission('sessions.view')
  listSessions(@Req() req: any, @Query() query: unknown) {
    const q = SessionsQuerySchema.parse(query);
    return this.securityService.listSessions(req.scopeFilter, {
      ...q,
      active: q.active === undefined ? undefined : q.active === 'true',
    });
  }

  @Post('sessions/:id/revoke')
  @RequirePermission('sessions.revoke')
  revokeSession(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    return this.securityService.revokeSession(req.scopeFilter, user.id, id);
  }

  @Post('employees/:id/sessions/revoke-all')
  @RequirePermission('sessions.revoke')
  revokeAll(@Param('id') employeeId: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    return this.securityService.revokeAllSessions(req.scopeFilter, user.id, employeeId);
  }
}
