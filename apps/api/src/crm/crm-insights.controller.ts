import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { CrmSearchQuerySchema } from '@company-os/contracts';
import { CrmInsightsService } from './crm-insights.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';

@Controller('crm')
@UseGuards(JwtAuthGuard)
export class CrmInsightsController {
  constructor(
    private insights: CrmInsightsService,
    private permissions: PermissionsService,
  ) {}

  @Get('search')
  @RequirePermission('crm.leads.view')
  async search(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Query() query: unknown) {
    const q = CrmSearchQuerySchema.parse(query);
    const perms = await this.permissions.hasAll(user, ['crm.leads.view', 'crm.contacts.view', 'crm.accounts.view', 'crm.deals.view']);
    return this.insights.search(req.scopeFilter, q.q, q.limit, {
      leads: perms['crm.leads.view'] ?? false,
      contacts: perms['crm.contacts.view'] ?? false,
      accounts: perms['crm.accounts.view'] ?? false,
      deals: perms['crm.deals.view'] ?? false,
    });
  }

  @Get('dashboard')
  @RequirePermission('crm.deals.view')
  dashboard(@Req() req: any) {
    return this.insights.dashboard(req.scopeFilter);
  }
}
