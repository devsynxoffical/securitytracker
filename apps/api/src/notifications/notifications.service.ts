import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service.js';
import { ClockService } from '../common/clock.service.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { WebSocketEvents } from '@company-os/contracts';
import { Prisma } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async sendNotification(
    recipientId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        recipientId,
        type,
        title,
        body,
        data: data as Prisma.InputJsonValue,
        createdAt: this.clock.now(),
      },
    });

    this.gateway.emitToUser(recipientId, WebSocketEvents.NOTIFICATION_NEW, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      createdAt: notification.createdAt.toISOString(),
    });

    return notification;
  }

  async list(recipientId: string, unreadOnly = false, limit = 50) {
    return this.prisma.notification.findMany({
      where: {
        recipientId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  async markRead(recipientId: string, ids?: string[], all = false) {
    const now = this.clock.now();
    if (all) {
      await this.prisma.notification.updateMany({
        where: { recipientId, readAt: null },
        data: { readAt: now },
      });
      return { success: true, count: 'all' };
    }

    if (ids && ids.length > 0) {
      const updated = await this.prisma.notification.updateMany({
        where: { recipientId, id: { in: ids } },
        data: { readAt: now },
      });
      return { success: true, count: updated.count };
    }

    return { success: true, count: 0 };
  }

  async broadcastAnnouncement(
    companyId: string,
    title: string,
    body: string,
    role?: string,
  ) {
    const employees = await this.prisma.employee.findMany({
      where: {
        companyId,
        status: 'active',
        ...(role ? { role: { name: role } } : {}),
      },
      select: { id: true },
    });

    for (const emp of employees) {
      await this.sendNotification(emp.id, 'announcement', title, body, { role });
    }

    return { sent: employees.length };
  }
}
