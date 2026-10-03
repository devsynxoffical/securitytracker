import { Controller, Get, Post, Param, Req, UseGuards } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Get()
  @RequirePermission('devices.view')
  async listDevices(@Req() req: any) {
    return this.devicesService.listDevices(req.scopeFilter);
  }

  @Post(':id/approve')
  @RequirePermission('devices.approve')
  async approveDevice(
    @Param('id') deviceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.approveDevice(deviceId, user.id, user.companyId);
  }

  @Post(':id/reject')
  @RequirePermission('devices.approve')
  async rejectDevice(
    @Param('id') deviceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.rejectDevice(deviceId, user.companyId);
  }

  @Post(':id/revoke')
  @RequirePermission('devices.revoke')
  async revokeDevice(
    @Param('id') deviceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.revokeDevice(deviceId, user.companyId);
  }
}
