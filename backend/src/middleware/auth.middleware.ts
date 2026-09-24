import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyUserToken } from '../utils/jwt.js';
import { hashDeviceToken } from '../utils/crypto.js';
import { ApiError } from '../utils/api-error.js';
import { config } from '../config/env.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  department: string | null;
  role: string;
  isActive: boolean;
}

export interface AuthenticatedDevice {
  id: string;
  userId: string;
  hostname: string;
  osType: string;
  status: string;
  isRevoked: boolean;
}

export interface AuthenticatedEmployee {
  id: string;
  fullName: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      device?: AuthenticatedDevice;
      authenticatedDevice?: AuthenticatedDevice;
      authenticatedEmployee?: AuthenticatedEmployee;
    }
  }
}

/**
 * Authentication Boundary for Dashboard Users (Google OAuth / JWT Session).
 * Validates Bearer JWT, checks active user account lifecycle status,
 * and attaches safe `req.user` context.
 */
export async function requireUserAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(ApiError.unauthorized('Authentication required. Missing or malformed Bearer token'));
    }

    const token = authHeader.split(' ')[1];

    // Development Mode Fallback for Local Frontend Browsing
    if (config.NODE_ENV === 'development' && token.startsWith('dev-token-')) {
      const devUser = await prisma.user.findFirst({ where: { isActive: true } });
      if (devUser) {
        req.user = {
          id: devUser.id,
          email: devUser.email,
          fullName: devUser.fullName,
          department: devUser.department,
          role: devUser.role,
          isActive: devUser.isActive,
        };
        return next();
      }
    }

    const payload = verifyUserToken(token);

    if (!payload) {
      return next(ApiError.unauthorized('Invalid or expired authentication token'));
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        department: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      return next(ApiError.unauthorized('User account no longer exists'));
    }

    if (!user.isActive) {
      return next(new ApiError(401, 'USER_DISABLED', 'User account is disabled. Access denied.'));
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Authentication Boundary for Desktop Agents (Machine-to-Machine Device Token).
 * Validates X-Device-Token or Bearer token against SHA-256 database hash, verifies status & revocation,
 * updates heartbeat timestamp, and attaches safe `req.device` context.
 */
export async function requireDeviceAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let deviceToken = req.headers['x-device-token'] as string;
    const deviceId = req.headers['x-device-id'] as string;

    // Fallback to Bearer token if X-Device-Token header is omitted
    if (!deviceToken && req.headers.authorization?.startsWith('Bearer ')) {
      deviceToken = req.headers.authorization.split(' ')[1];
    }

    if (!deviceToken || !deviceId) {
      return next(ApiError.unauthorized('Device authentication required. Missing X-Device-Token or X-Device-ID header'));
    }

    const tokenHash = hashDeviceToken(deviceToken);

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        userId: true,
        hostname: true,
        osType: true,
        deviceTokenHash: true,
        status: true,
        isRevoked: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!device || device.deviceTokenHash !== tokenHash) {
      return next(ApiError.unauthorized('Invalid device authentication credentials'));
    }

    if (device.status === 'DISABLED') {
      return next(new ApiError(401, 'DEVICE_DISABLED', 'Device registration is disabled. Access denied.'));
    }

    if (device.isRevoked || device.status === 'REVOKED') {
      return next(new ApiError(401, 'DEVICE_REVOKED', 'Device registration has been revoked. Telemetry uploads disabled.'));
    }

    // Update device last seen timestamp asynchronously
    prisma.device
      .update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      })
      .catch((err) => console.error('[Device Heartbeat Update Error]:', err));

    const safeDeviceContext: AuthenticatedDevice = {
      id: device.id,
      userId: device.userId,
      hostname: device.hostname,
      osType: device.osType,
      status: device.status,
      isRevoked: device.isRevoked,
    };

    req.device = safeDeviceContext;
    req.authenticatedDevice = safeDeviceContext;
    if (device.user) {
      req.authenticatedEmployee = {
        id: device.user.id,
        fullName: device.user.fullName,
        email: device.user.email,
      };
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Reusable Role-Based Access Control (RBAC) Authorization Middleware.
 * Enforces role capabilities dynamically without hardcoding assumptions.
 */
export function requireRoles(allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Role '${req.user.role}' is not authorized to access this resource`));
    }

    next();
  };
}
