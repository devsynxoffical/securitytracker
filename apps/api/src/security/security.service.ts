import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';

@Injectable()
export class SecurityService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  async listAuditLogs(
    companyId: string,
    filters?: { actorId?: string; entityType?: string; from?: string; to?: string },
  ) {
    const where: any = { companyId };

    if (filters?.actorId) where.actorId = filters.actorId;
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.from || filters?.to) {
      where.occurredAt = {};
      if (filters.from) where.occurredAt.gte = new Date(filters.from);
      if (filters.to) where.occurredAt.lte = new Date(filters.to);
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }

  async listLoginEvents(limit = 100) {
    return this.prisma.loginEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async listSecurityAlerts() {
    return this.prisma.securityAlert.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async acknowledgeAlert(id: string, adminId: string) {
    const alert = await this.prisma.securityAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Security alert not found');

    return this.prisma.securityAlert.update({
      where: { id },
      data: {
        acknowledgedBy: adminId,
        acknowledgedAt: this.clock.now(),
      },
    });
  }
}
