import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RbacGuard } from '../auth/guards/rbac.guard.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RbacGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getMyNotifications(
    @Request() req: any,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.list(
      req.user.sub,
      unreadOnly === 'true',
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('read')
  async markRead(
    @Request() req: any,
    @Body() body: { ids?: string[]; all?: boolean },
  ) {
    return this.notificationsService.markRead(req.user.sub, body.ids, body.all);
  }

  @Post('announcement')
  @RequirePermission('announcements.send')
  async sendAnnouncement(
    @Request() req: any,
    @Body() body: { title: string; body: string; role?: string },
  ) {
    return this.notificationsService.broadcastAnnouncement(
      req.user.companyId,
      body.title,
      body.body,
      body.role,
    );
  }
}
