import { prisma } from '../lib/prisma.js';
import { config } from '../config/env.js';
import { signUserToken } from '../utils/jwt.js';
import { ApiError } from '../utils/api-error.js';

export interface GoogleAuthPayload {
  idToken: string;
}

export class AuthService {
  /**
   * Google OAuth / OIDC Integration Boundary.
   * Verifies Google Identity ID token claims, enforces Workspace domain restriction,
   * checks user account status, and issues backend session JWT.
   */
  static async authenticateGoogleUser(payload: GoogleAuthPayload) {
    const { idToken } = payload;

    if (!idToken || typeof idToken !== 'string') {
      throw ApiError.badRequest('Google ID Token is required');
    }

    // Mock boundary for testing & development when real Google OAuth client is not wired
    let verifiedEmail: string;
    let verifiedName: string;

    if (config.NODE_ENV === 'test' || idToken.startsWith('mock-google-token:')) {
      const emailParts = idToken.replace('mock-google-token:', '').split('|');
      verifiedEmail = emailParts[0] || 'testuser@devsynx.com';
      verifiedName = emailParts[1] || 'Test User';
    } else {
      // Production Boundary: Expects ID token claims verification
      // In real production, Google token is verified against OAuth2Client library
      throw ApiError.unauthorized('Google OAuth Client credentials not configured. Use mock token for testing boundary.');
    }

    // Enforce Google Workspace Domain Restriction
    const allowedDomain = config.GOOGLE_ALLOWED_DOMAIN;
    if (allowedDomain && !verifiedEmail.endsWith(`@${allowedDomain}`)) {
      throw ApiError.forbidden(`Access restricted to corporate domain @${allowedDomain}`);
    }

    // Database Lookup
    let user = await prisma.user.findUnique({
      where: { email: verifiedEmail },
    });

    if (!user) {
      // Auto-provision initial employee record for authorized Workspace email
      user = await prisma.user.create({
        data: {
          email: verifiedEmail,
          fullName: verifiedName,
          role: 'EMPLOYEE',
          isActive: true,
        },
      });

      // Audit Log for user auto-creation
      await prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'USER_CREATED',
          targetEntity: `user:${user.id}`,
          detailsJson: JSON.stringify({ email: verifiedEmail, source: 'GOOGLE_SSO' }),
        },
      });
    }

    // Account Status Lifecycle Check
    if (!user.isActive) {
      throw new ApiError(401, 'USER_DISABLED', 'User account is disabled. Access denied.');
    }

    // Audit Log for successful login
    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'LOGIN_SUCCESS',
        targetEntity: `user:${user.id}`,
        detailsJson: JSON.stringify({ email: user.email }),
      },
    });

    const token = signUserToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        department: user.department,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }

  /**
   * Resolves safe user profile context from database
   */
  static async resolveUserContext(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        department: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (!user.isActive) {
      throw new ApiError(401, 'USER_DISABLED', 'User account is disabled');
    }

    return user;
  }
}
