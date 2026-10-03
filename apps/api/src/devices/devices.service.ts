import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';

@Injectable()
export class DevicesService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  async listDevices(scopeFilter: ScopeFilter) {
    const where: any = { companyId: scopeFilter.companyId };

    if (scopeFilter.scope !== 'all' && scopeFilter.allowedEmployeeIds.length > 0) {
      where.employeeId = { in: scopeFilter.allowedEmployeeIds };
    }

    return this.prisma.device.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveDevice(deviceId: string, approverId: string, companyId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, companyId },
    });

    if (!device) throw new NotFoundException('Device not found');

    return this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'approved',
        approvedBy: approverId,
        approvedAt: this.clock.now(),
      },
    });
  }

  async rejectDevice(deviceId: string, companyId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, companyId },
    });

    if (!device) throw new NotFoundException('Device not found');

    return this.prisma.device.update({
      where: { id: deviceId },
      data: { status: 'rejected' },
    });
  }

  async revokeDevice(deviceId: string, companyId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, companyId },
    });

    if (!device) throw new NotFoundException('Device not found');

    // Revoke all active sessions on this device
    await this.prisma.$transaction([
      this.prisma.device.update({
        where: { id: deviceId },
        data: { status: 'revoked' },
      }),
      this.prisma.session.updateMany({
        where: { deviceId, revokedAt: null },
        data: {
          revokedAt: this.clock.now(),
          revokedReason: 'device_revoked',
        },
      }),
    ]);

    return { success: true, message: 'Device and its active sessions revoked' };
  }
}
