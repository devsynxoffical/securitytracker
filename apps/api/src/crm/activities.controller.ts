import { Controller, Get, Post, Patch, Param, Body, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import {
  CreateActivitySchema,
  UpdateActivityStatusSchema,
  ActivityListQuerySchema,
  AgendaQuerySchema,
  CrmEntityType,
  PermissionKey,
} from '@company-os/contracts';
import { CrmActivitiesService } from './shared/activities.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';

const VIEW_KEY: Record<string, PermissionKey> = {
  [CrmEntityType.LEAD]: 'crm.leads.view',
  [CrmEntityType.CONTACT]: 'crm.contacts.view',
  [CrmEntityType.ACCOUNT]: 'crm.accounts.view',
  [CrmEntityType.DEAL]: 'crm.deals.view',
};
const EDIT_KEY: Record<string, PermissionKey> = {
  [CrmEntityType.LEAD]: 'crm.leads.edit',
  [CrmEntityType.CONTACT]: 'crm.contacts.edit',
  [CrmEntityType.ACCOUNT]: 'crm.accounts.edit',
  [CrmEntityType.DEAL]: 'crm.deals.edit',
};

/**
 * Activities are guarded by the permission of their parent object. The decorator grants entry with
 * `crm.leads.view` (every CRM role has it); the handler then resolves the scope of the parent's own key.
 */
@Controller('crm/activities')
@UseGuards(JwtAuthGuard)
export class ActivitiesController {
  constructor(
    private activities: CrmActivitiesService,
    private permissions: PermissionsService,
  ) {}

  @Get()
  @RequirePermission('crm.leads.view')
  async list(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Query() query: unknown) {
    const q = ActivityListQuerySchema.parse(query);
    const scope = await this.scopeFor(user, req.scopeFilter, VIEW_KEY[q.entityType]!);
    return this.activities.list(scope, q);
  }

  @Get('agenda')
  @RequirePermission('crm.leads.view')
  agenda(@Req() req: any, @Query() query: unknown) {
    return this.activities.agenda(req.scopeFilter, AgendaQuerySchema.parse(query));
  }

  @Post()
  @RequirePermission('crm.leads.view')
  async create(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    const dto = CreateActivitySchema.parse(body);
    const scope = await this.scopeFor(user, req.scopeFilter, EDIT_KEY[dto.entityType]!);
    return this.activities.create(scope, user.id, dto);
  }

  @Patch(':id')
  @RequirePermission('crm.leads.view')
  async updateStatus(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() body: unknown) {
    const dto = UpdateActivityStatusSchema.parse(body);
    return this.activities.updateStatus(req.scopeFilter, user.id, id, dto.status);
  }

  /** Rebuilds the ScopeFilter using the parent object's permission scope. */
  private async scopeFor(user: AuthenticatedUser, base: ScopeFilter, key: PermissionKey): Promise<ScopeFilter> {
    const scope = await this.permissions.scopeOf(user, key);
    if (!scope) throw new ForbiddenException(`Permission missing: ${key}`);
    if (scope === base.scope) return base;
    if (scope === 'all') return { ...base, scope, allowedEmployeeIds: [] };
    if (scope === 'own') return { ...base, scope, allowedEmployeeIds: [user.id] };
    // team or department narrower/wider than the entry scope: fall back to the stricter of the two sets
    return base.scope === 'all' ? { ...base, scope, allowedEmployeeIds: [user.id] } : base;
  }
}
