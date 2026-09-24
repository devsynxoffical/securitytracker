import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signUserToken } from '../src/utils/jwt.js';
import { generateDeviceToken } from '../src/utils/crypto.js';

describe('Phase 4: Authentication & Authorization Tests', () => {
  let activeUserId: string;
  let activeUserToken: string;
  let disabledUserId: string;
  let disabledUserToken: string;
  let adminUserId: string;
  let adminUserToken: string;

  let activeDeviceId: string;
  let activeDeviceRawToken: string;
  let revokedDeviceId: string;
  let revokedDeviceRawToken: string;

  beforeAll(async () => {
    // 1. Create Test Users
    const activeUser = await prisma.user.create({
      data: {
        email: 'employee.active@devsynx.com',
        fullName: 'Active Employee',
        role: 'EMPLOYEE',
        isActive: true,
      },
    });
    activeUserId = activeUser.id;
    activeUserToken = signUserToken({ userId: activeUserId, email: activeUser.email, role: activeUser.role });

    const disabledUser = await prisma.user.create({
      data: {
        email: 'employee.disabled@devsynx.com',
        fullName: 'Disabled Employee',
        role: 'EMPLOYEE',
        isActive: false,
      },
    });
    disabledUserId = disabledUser.id;
    disabledUserToken = signUserToken({ userId: disabledUserId, email: disabledUser.email, role: disabledUser.role });

    const adminUser = await prisma.user.create({
      data: {
        email: 'admin.user@devsynx.com',
        fullName: 'Admin User',
        role: 'ADMIN',
        isActive: true,
      },
    });
    adminUserId = adminUser.id;
    adminUserToken = signUserToken({ userId: adminUserId, email: adminUser.email, role: adminUser.role });

    // 2. Create Test Devices
    const dev1Creds = generateDeviceToken();
    activeDeviceRawToken = dev1Creds.rawToken;
    const activeDevice = await prisma.device.create({
      data: {
        userId: activeUserId,
        hostname: 'WORKSTATION-ACTIVE',
        osType: 'WINDOWS',
        deviceTokenHash: dev1Creds.tokenHash,
        isRevoked: false,
      },
    });
    activeDeviceId = activeDevice.id;

    const dev2Creds = generateDeviceToken();
    revokedDeviceRawToken = dev2Creds.rawToken;
    const revokedDevice = await prisma.device.create({
      data: {
        userId: activeUserId,
        hostname: 'WORKSTATION-REVOKED',
        osType: 'MACOS',
        deviceTokenHash: dev2Creds.tokenHash,
        isRevoked: true,
      },
    });
    revokedDeviceId = revokedDevice.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.device.deleteMany({ where: { id: { in: [activeDeviceId, revokedDeviceId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [activeUserId, disabledUserId, adminUserId] } } });
  });

  describe('Dashboard User Authentication Boundary', () => {
    it('should reject unauthenticated request with 401 UNAUTHORIZED', async () => {
      const response = await request(app).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should allow valid authenticated user to access GET /api/v1/auth/me (200 OK)', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${activeUserToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.email).toBe('employee.active@devsynx.com');
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should reject malformed or invalid token with 401 UNAUTHORIZED', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token-string');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject disabled user account with 401 USER_DISABLED', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${disabledUserToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('USER_DISABLED');
    });

    it('should support logout endpoint (200 OK)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${activeUserToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });

  describe('Google OAuth SSO Exchange Boundary', () => {
    it('should authenticate user with mock Google token and auto-create user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/google')
        .send({ idToken: 'mock-google-token:new.sso.employee@devsynx.com|SSO User' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.email).toBe('new.sso.employee@devsynx.com');

      // Cleanup auto-created user
      await prisma.user.delete({ where: { email: 'new.sso.employee@devsynx.com' } });
    });

    it('should reject Google emails outside authorized Workspace domain', async () => {
      const response = await request(app)
        .post('/api/v1/auth/google')
        .send({ idToken: 'mock-google-token:hacker@externaldomain.com|External' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Device Authentication Boundary', () => {
    it('should reject telemetry upload without device headers with 401 UNAUTHORIZED', async () => {
      const response = await request(app).post('/api/v1/activity/batches').send({});
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid device token with 401 UNAUTHORIZED', async () => {
      const response = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', activeDeviceId)
        .set('X-Device-Token', 'wrong-token')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject revoked device with 401 DEVICE_REVOKED', async () => {
      const response = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', revokedDeviceId)
        .set('X-Device-Token', revokedDeviceRawToken)
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('DEVICE_REVOKED');
    });
  });
});
