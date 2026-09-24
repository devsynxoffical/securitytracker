import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signUserToken } from '../src/utils/jwt.js';

describe('Phase 6: Device Management & Device Authentication Tests', () => {
  let adminId: string;
  let adminToken: string;
  let emp1Id: string;
  let emp1Token: string;
  let emp2Id: string;
  let emp2Token: string;

  let createdDeviceId: string;
  let rawCredentialSecret: string;

  beforeAll(async () => {
    // 1. Create Admin
    const admin = await prisma.user.create({
      data: {
        email: 'admin.device@devsynx.com',
        fullName: 'Admin Device Test',
        role: 'ADMIN',
        isActive: true,
      },
    });
    adminId = admin.id;
    adminToken = signUserToken({ userId: adminId, email: admin.email, role: admin.role });

    // 2. Create Employee 1
    const emp1 = await prisma.user.create({
      data: {
        email: 'emp1.device@devsynx.com',
        fullName: 'Employee Device One',
        role: 'EMPLOYEE',
        isActive: true,
      },
    });
    emp1Id = emp1.id;
    emp1Token = signUserToken({ userId: emp1Id, email: emp1.email, role: emp1.role });

    // 3. Create Employee 2
    const emp2 = await prisma.user.create({
      data: {
        email: 'emp2.device@devsynx.com',
        fullName: 'Employee Device Two',
        role: 'EMPLOYEE',
        isActive: true,
      },
    });
    emp2Id = emp2.id;
    emp2Token = signUserToken({ userId: emp2Id, email: emp2.email, role: emp2.role });
  });

  afterAll(async () => {
    // Clean up created test data
    await prisma.device.deleteMany({ where: { userId: { in: [emp1Id, emp2Id, adminId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [emp1Id, emp2Id, adminId] } } });
  });

  describe('Device Registration & Credential Provisioning', () => {
    it('should allow Admin to register a new workstation device and return raw secret ONCE', async () => {
      const response = await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: emp1Id,
          hostname: 'WORKSTATION-EMP1-WIN11',
          osType: 'WINDOWS',
          osVersion: 'Windows 11 Pro 23H2',
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.device).toBeDefined();
      expect(response.body.data.device.hostname).toBe('WORKSTATION-EMP1-WIN11');
      expect(response.body.data.device.status).toBe('ACTIVE');
      expect(response.body.data.rawCredential).toBeDefined();
      expect(typeof response.body.data.rawCredential).toBe('string');
      expect(response.body.data.device.deviceTokenHash).toBeUndefined(); // Must NOT leak hash

      createdDeviceId = response.body.data.device.id;
      rawCredentialSecret = response.body.data.rawCredential;
    });

    it('should prevent non-Admin (EMPLOYEE) from registering a device (403 FORBIDDEN)', async () => {
      const response = await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${emp1Token}`)
        .send({
          userId: emp2Id,
          hostname: 'UNAUTHORIZED-PC',
          osType: 'MACOS',
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject device registration with invalid input (400 VALIDATION_ERROR)', async () => {
      const response = await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: 'invalid-uuid',
          hostname: '',
          osType: 'LINUX_UNSUPPORTED',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Credential Leak Protections on GET Endpoints', () => {
    it('should NEVER return raw credentials or credential hashes in GET /api/v1/devices', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      const foundDevice = response.body.data.find((d: any) => d.id === createdDeviceId);
      expect(foundDevice).toBeDefined();
      expect(foundDevice.deviceTokenHash).toBeUndefined();
      expect(foundDevice.rawCredential).toBeUndefined();
    });

    it('should NEVER return raw credentials or credential hashes in GET /api/v1/devices/:id', async () => {
      const response = await request(app)
        .get(`/api/v1/devices/${createdDeviceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.deviceTokenHash).toBeUndefined();
      expect(response.body.data.rawCredential).toBeUndefined();
    });
  });

  describe('Device Authentication Middleware (`requireDeviceAuth`)', () => {
    it('should authenticate successfully with valid device credential & ID', async () => {
      const response = await request(app)
        .get('/api/v1/devices/ping')
        .set('X-Device-ID', createdDeviceId)
        .set('X-Device-Token', rawCredentialSecret);

      expect(response.status).toBe(200);
      expect(response.body.data.deviceId).toBe(createdDeviceId);
      expect(response.body.data.employeeId).toBe(emp1Id);
      expect(response.body.data.employeeEmail).toBe('emp1.device@devsynx.com');
    });

    it('should also authenticate successfully with Bearer token header syntax', async () => {
      const response = await request(app)
        .get('/api/v1/devices/ping')
        .set('X-Device-ID', createdDeviceId)
        .set('Authorization', `Bearer ${rawCredentialSecret}`);

      expect(response.status).toBe(200);
      expect(response.body.data.deviceId).toBe(createdDeviceId);
    });

    it('should reject request with wrong/tampered device secret (401 UNAUTHORIZED)', async () => {
      const response = await request(app)
        .get('/api/v1/devices/ping')
        .set('X-Device-ID', createdDeviceId)
        .set('X-Device-Token', 'invalid_secret_token_123456');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject request with missing device headers (401 UNAUTHORIZED)', async () => {
      const response = await request(app).get('/api/v1/devices/ping');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Device Status Lifecycle (Disable, Enable, Revoke)', () => {
    it('should allow Admin to disable a device and block device authentication (401 DEVICE_DISABLED)', async () => {
      // 1. Admin disables device
      const disableRes = await request(app)
        .post(`/api/v1/devices/${createdDeviceId}/disable`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(disableRes.status).toBe(200);
      expect(disableRes.body.data.status).toBe('DISABLED');

      // 2. Disabled device attempts authentication -> rejected
      const authRes = await request(app)
        .get('/api/v1/devices/ping')
        .set('X-Device-ID', createdDeviceId)
        .set('X-Device-Token', rawCredentialSecret);

      expect(authRes.status).toBe(401);
      expect(authRes.body.error.message).toContain('disabled');
    });

    it('should allow Admin to re-enable a disabled device and restore device authentication', async () => {
      // 1. Admin enables device
      const enableRes = await request(app)
        .post(`/api/v1/devices/${createdDeviceId}/enable`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(enableRes.status).toBe(200);
      expect(enableRes.body.data.status).toBe('ACTIVE');

      // 2. Device attempts authentication -> succeeds again
      const authRes = await request(app)
        .get('/api/v1/devices/ping')
        .set('X-Device-ID', createdDeviceId)
        .set('X-Device-Token', rawCredentialSecret);

      expect(authRes.status).toBe(200);
      expect(authRes.body.data.deviceId).toBe(createdDeviceId);
    });

    it('should allow Admin to rotate device credential, invalidating old credential & returning new secret', async () => {
      // 1. Rotate credential
      const rotateRes = await request(app)
        .post(`/api/v1/devices/${createdDeviceId}/rotate-credential`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(rotateRes.status).toBe(200);
      expect(rotateRes.body.data.rawCredential).toBeDefined();
      const newSecret = rotateRes.body.data.rawCredential;
      expect(newSecret).not.toBe(rawCredentialSecret);

      // 2. Old credential attempt -> 401
      const oldAuthRes = await request(app)
        .get('/api/v1/devices/ping')
        .set('X-Device-ID', createdDeviceId)
        .set('X-Device-Token', rawCredentialSecret);

      expect(oldAuthRes.status).toBe(401);

      // 3. New credential attempt -> 200
      const newAuthRes = await request(app)
        .get('/api/v1/devices/ping')
        .set('X-Device-ID', createdDeviceId)
        .set('X-Device-Token', newSecret);

      expect(newAuthRes.status).toBe(200);

      // Update secret reference
      rawCredentialSecret = newSecret;
    });

    it('should allow Admin to revoke device, permanently setting REVOKED and blocking authentication', async () => {
      // 1. Revoke device
      const revokeRes = await request(app)
        .post(`/api/v1/devices/${createdDeviceId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.status).toBe('REVOKED');
      expect(revokeRes.body.data.revokedAt).toBeDefined();

      // 2. Revoked device attempt -> 401
      const authRes = await request(app)
        .get('/api/v1/devices/ping')
        .set('X-Device-ID', createdDeviceId)
        .set('X-Device-Token', rawCredentialSecret);

      expect(authRes.status).toBe(401);
      expect(authRes.body.error.message).toContain('revoked');
    });
  });

  describe('RBAC & Isolation Security Checks', () => {
    it('should prevent non-Admin from modifying device lifecycle state (disable/revoke/rotate)', async () => {
      const resDisable = await request(app)
        .post(`/api/v1/devices/${createdDeviceId}/disable`)
        .set('Authorization', `Bearer ${emp1Token}`);
      expect(resDisable.status).toBe(403);

      const resRevoke = await request(app)
        .post(`/api/v1/devices/${createdDeviceId}/revoke`)
        .set('Authorization', `Bearer ${emp1Token}`);
      expect(resRevoke.status).toBe(403);

      const resRotate = await request(app)
        .post(`/api/v1/devices/${createdDeviceId}/rotate-credential`)
        .set('Authorization', `Bearer ${emp1Token}`);
      expect(resRotate.status).toBe(403);
    });
  });
});
