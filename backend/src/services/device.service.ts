import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { AuthenticatedUser } from '../middleware/auth.middleware.js';
import { generateDeviceToken } from '../utils/crypto.js';

export interface RegisterDeviceInput {
  userId: string;
  hostname: string;
  osType: string; // "WINDOWS" or "MACOS"
  osVersion?: string;
}

export interface UpdateDeviceInput {
  userId?: string;
  hostname?: string;
  osType?: string;
  osVersion?: string;
}

const safeDeviceSelect = {
  id: true,
  userId: true,
  hostname: true,
  osType: true,
  osVersion: true,
  agentVersion: true,
  status: true,
  isRevoked: true,
  lastSeenAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      department: true,
      jobTitle: true,
    },
  },
};

export class DeviceService {
  /**
   * Lists registered workstations filtered by user role and search query.
   * SECURITY: deviceTokenHash is NEVER included in responses.
   */
  static async listDevices(
    requester: AuthenticatedUser,
    query: { search?: string; status?: string; userId?: string }
  ) {
    const where: any = {};
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);

    if (!isAdmin) {
      if (requester.role === 'MANAGER') {
        // Manager can view devices of self or direct reports
        const directReports = await prisma.user.findMany({
          where: { managerId: requester.id },
          select: { id: true },
        });
        const allowedUserIds = [requester.id, ...directReports.map((r) => r.id)];
        where.userId = { in: allowedUserIds };
      } else {
        // Employee can strictly view own assigned devices
        where.userId = requester.id;
      }
    } else if (query.userId) {
      where.userId = query.userId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { hostname: { contains: query.search } },
        { user: { fullName: { contains: query.search } } },
        { user: { email: { contains: query.search } } },
      ];
    }

    const devices = await prisma.device.findMany({
      where,
      select: safeDeviceSelect,
      orderBy: { updatedAt: 'desc' },
    });

    return devices;
  }

  /**
   * Gets single device details by ID with RBAC boundary checks.
   */
  static async getDeviceById(deviceId: string, requester: AuthenticatedUser) {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: safeDeviceSelect,
    });

    if (!device) {
      throw ApiError.notFound('Device not found');
    }

    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    const isOwner = device.userId === requester.id;

    if (!isOwner && !isAdmin) {
      if (requester.role === 'MANAGER') {
        const ownerUser = await prisma.user.findUnique({
          where: { id: device.userId },
          select: { managerId: true },
        });
        if (ownerUser?.managerId !== requester.id) {
          throw ApiError.forbidden('Managers can only view devices of their direct reports');
        }
      } else {
        throw ApiError.forbidden('You are not authorized to view this device');
      }
    }

    return device;
  }

  /**
   * Admin-only registration of a new hardware workstation.
   * Generates a 256-bit token, stores only SHA-256 hash in DB, and returns raw token ONCE.
   */
  static async registerDevice(requester: AuthenticatedUser, data: RegisterDeviceInput) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    if (!isAdmin) {
      throw ApiError.forbidden('Only Administrators can register new workstation devices');
    }

    const targetUser = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!targetUser) {
      throw ApiError.badRequest('Assigned employee user does not exist');
    }

    const { rawToken, tokenHash } = generateDeviceToken();

    const device = await prisma.device.create({
      data: {
        userId: data.userId,
        hostname: data.hostname,
        osType: data.osType.toUpperCase(),
        osVersion: data.osVersion || null,
        deviceTokenHash: tokenHash,
        status: 'ACTIVE',
        isRevoked: false,
      },
      select: safeDeviceSelect,
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: requester.id,
        action: 'DEVICE_REGISTERED',
        targetEntity: `device:${device.id}`,
        detailsJson: JSON.stringify({
          hostname: data.hostname,
          osType: data.osType,
          assignedUserId: data.userId,
        }),
      },
    });

    return {
      device,
      rawCredential: rawToken,
      provisioningCredential: {
        rawToken,
        warning: 'Save this raw device token immediately. It will NEVER be displayed again.',
      },
    };
  }

  /**
   * Admin-only update or reassignment of workstation.
   */
  static async updateDevice(deviceId: string, requester: AuthenticatedUser, data: UpdateDeviceInput) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    if (!isAdmin) {
      throw ApiError.forbidden('Only Administrators can modify device configurations');
    }

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      throw ApiError.notFound('Device not found');
    }

    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: {
        ...(data.hostname !== undefined && { hostname: data.hostname }),
        ...(data.osType !== undefined && { osType: data.osType.toUpperCase() }),
        ...(data.osVersion !== undefined && { osVersion: data.osVersion }),
        ...(data.userId !== undefined && { userId: data.userId }),
      },
      select: safeDeviceSelect,
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: requester.id,
        action: data.userId && data.userId !== device.userId ? 'DEVICE_REASSIGNED' : 'DEVICE_UPDATED',
        targetEntity: `device:${deviceId}`,
        detailsJson: JSON.stringify(data),
      },
    });

    return updated;
  }

  /**
   * Admin-only disabling of device authentication.
   */
  static async disableDevice(deviceId: string, requester: AuthenticatedUser) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    if (!isAdmin) {
      throw ApiError.forbidden('Only Administrators can disable devices');
    }

    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: { status: 'DISABLED' },
      select: safeDeviceSelect,
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: requester.id,
        action: 'DEVICE_DISABLED',
        targetEntity: `device:${deviceId}`,
      },
    });

    return updated;
  }

  /**
   * Admin-only re-enabling of device authentication.
   */
  static async enableDevice(deviceId: string, requester: AuthenticatedUser) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    if (!isAdmin) {
      throw ApiError.forbidden('Only Administrators can enable devices');
    }

    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: { status: 'ACTIVE', isRevoked: false },
      select: safeDeviceSelect,
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: requester.id,
        action: 'DEVICE_ENABLED',
        targetEntity: `device:${deviceId}`,
      },
    });

    return updated;
  }

  /**
   * Admin-only revocation of device credentials.
   */
  static async revokeDevice(deviceId: string, requester: AuthenticatedUser) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    if (!isAdmin) {
      throw ApiError.forbidden('Only Administrators can revoke device credentials');
    }

    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'REVOKED',
        isRevoked: true,
        revokedAt: new Date(),
      },
      select: safeDeviceSelect,
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: requester.id,
        action: 'DEVICE_REVOKED',
        targetEntity: `device:${deviceId}`,
      },
    });

    return updated;
  }

  /**
   * Admin-only rotation of device credentials.
   * Invalidates old token hash, generates new raw token, stores SHA-256 hash, and returns raw token ONCE.
   */
  static async rotateCredential(deviceId: string, requester: AuthenticatedUser) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    if (!isAdmin) {
      throw ApiError.forbidden('Only Administrators can rotate device credentials');
    }

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      throw ApiError.notFound('Device not found');
    }

    const { rawToken, tokenHash } = generateDeviceToken();

    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: {
        deviceTokenHash: tokenHash,
        status: 'ACTIVE',
        isRevoked: false,
        revokedAt: null,
      },
      select: safeDeviceSelect,
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: requester.id,
        action: 'DEVICE_CREDENTIAL_ROTATED',
        targetEntity: `device:${deviceId}`,
      },
    });

    return {
      device: updated,
      rawCredential: rawToken,
      provisioningCredential: {
        rawToken,
        warning: 'Save this new raw device token immediately. It will NEVER be displayed again.',
      },
    };
  }
}
