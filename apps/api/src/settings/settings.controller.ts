import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { SettingsService, CompanySettingsSchema } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  @RequirePermission('settings.manage')
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.get(user.companyId);
  }

  @Patch()
  @RequirePermission('settings.manage')
  update(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.settings.update(user.companyId, CompanySettingsSchema.strict().parse(body));
  }
}
