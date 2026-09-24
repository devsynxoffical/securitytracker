import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateDeviceToken } from '../src/utils/crypto.js';

describe('Phase 7: Activity Ingestion API & Storage Tests', () => {
  let emp1Id: string;
  let activeDeviceId: string;
  let activeDeviceSecret: string;

  let disabledDeviceId: string;
  let disabledDeviceSecret: string;

  let revokedDeviceId: string;
  let revokedDeviceSecret: string;

  beforeAll(async () => {
    // 1. Create Employee User
    const emp = await prisma.user.create({
      data: {
        email: 'employee.activity@devsynx.com',
        fullName: 'Activity Test Employee',
        role: 'EMPLOYEE',
        isActive: true,
      },
    });
    emp1Id = emp.id;

    // 2. Create Active Device
    const token1 = generateDeviceToken();
    activeDeviceSecret = token1.rawToken;
    const dev1 = await prisma.device.create({
      data: {
        userId: emp1Id,
        hostname: 'WORKSTATION-ACT-01',
        osType: 'WINDOWS',
        osVersion: 'Windows 11',
        deviceTokenHash: token1.tokenHash,
        status: 'ACTIVE',
        isRevoked: false,
      },
    });
    activeDeviceId = dev1.id;

    // 3. Create Disabled Device
    const token2 = generateDeviceToken();
    disabledDeviceSecret = token2.rawToken;
    const dev2 = await prisma.device.create({
      data: {
        userId: emp1Id,
        hostname: 'WORKSTATION-ACT-DISABLED',
        osType: 'MACOS',
        deviceTokenHash: token2.tokenHash,
        status: 'DISABLED',
        isRevoked: false,
      },
    });
    disabledDeviceId = dev2.id;

    // 4. Create Revoked Device
    const token3 = generateDeviceToken();
    revokedDeviceSecret = token3.rawToken;
    const dev3 = await prisma.device.create({
      data: {
        userId: emp1Id,
        hostname: 'WORKSTATION-ACT-REVOKED',
        osType: 'WINDOWS',
        deviceTokenHash: token3.tokenHash,
        status: 'REVOKED',
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
    revokedDeviceId = dev3.id;
  });

  afterAll(async () => {
    // Clean up created activity test data
    await prisma.session.deleteMany({ where: { deviceId: { in: [activeDeviceId, disabledDeviceId, revokedDeviceId] } } });
    await prisma.activityBatch.deleteMany({ where: { deviceId: { in: [activeDeviceId, disabledDeviceId, revokedDeviceId] } } });
    await prisma.device.deleteMany({ where: { id: { in: [activeDeviceId, disabledDeviceId, revokedDeviceId] } } });
    await prisma.user.deleteMany({ where: { id: emp1Id } });
  });

  describe('Device Authentication Boundaries for Activity Ingestion', () => {
    it('should accept telemetry batch from valid active device', async () => {
      const batchId = `BATCH-TEST-INITIAL-${Date.now()}`;
      const response = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', activeDeviceId)
        .set('X-Device-Token', activeDeviceSecret)
        .send({
          batchId,
          samples: [
            {
              appName: 'Visual Studio Code',
              windowTitle: 'activity.service.ts - devsynx',
              startedAt: '2026-09-17T10:00:00Z',
              endedAt: '2026-09-17T10:01:00Z',
              isIdle: false,
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.batchId).toBe(batchId);
      expect(response.body.data.accepted).toBe(1);
      expect(response.body.data.duplicate).toBe(false);
    });

    it('should reject telemetry batch from disabled device (401 DEVICE_DISABLED)', async () => {
      const response = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', disabledDeviceId)
        .set('X-Device-Token', disabledDeviceSecret)
        .send({
          batchId: `BATCH-DISABLED-${Date.now()}`,
          samples: [
            {
              appName: 'Google Chrome',
              startedAt: '2026-09-17T10:00:00Z',
              endedAt: '2026-09-17T10:01:00Z',
            },
          ],
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('DEVICE_DISABLED');
    });

    it('should reject telemetry batch from revoked device (401 DEVICE_REVOKED)', async () => {
      const response = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', revokedDeviceId)
        .set('X-Device-Token', revokedDeviceSecret)
        .send({
          batchId: `BATCH-REVOKED-${Date.now()}`,
          samples: [
            {
              appName: 'Google Chrome',
              startedAt: '2026-09-17T10:00:00Z',
              endedAt: '2026-09-17T10:01:00Z',
            },
          ],
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('DEVICE_REVOKED');
    });

    it('should reject telemetry batch with invalid device secret (401 UNAUTHORIZED)', async () => {
      const response = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', activeDeviceId)
        .set('X-Device-Token', 'invalid_secret_credential')
        .send({
          batchId: `BATCH-INVALID-${Date.now()}`,
          samples: [
            {
              appName: 'Slack',
              startedAt: '2026-09-17T10:00:00Z',
              endedAt: '2026-09-17T10:01:00Z',
            },
          ],
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Idempotency & Duplicate Batch Protection', () => {
    it('should handle duplicate batch submission idempotently without duplicating database rows', async () => {
      const batchId = `BATCH-IDEMPOTENCY-CHECK-999`;

      // Initial batch submission
      const firstRes = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', activeDeviceId)
        .set('X-Device-Token', activeDeviceSecret)
        .send({
          batchId,
          samples: [
            {
              appName: 'Google Chrome',
              windowTitle: 'GitHub - DEVSYNX',
              startedAt: '2026-09-17T11:00:00Z',
              endedAt: '2026-09-17T11:02:00Z',
              isIdle: false,
            },
            {
              appName: 'System Idle',
              windowTitle: '',
              startedAt: '2026-09-17T11:02:00Z',
              endedAt: '2026-09-17T11:05:00Z',
              isIdle: true,
            },
          ],
        });

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.data.accepted).toBe(2);
      expect(firstRes.body.data.duplicate).toBe(false);

      const countBeforeDuplicate = await prisma.session.count({ where: { deviceId: activeDeviceId } });

      // Duplicate batch retry submission with same batchId
      const secondRes = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', activeDeviceId)
        .set('X-Device-Token', activeDeviceSecret)
        .send({
          batchId,
          samples: [
            {
              appName: 'Google Chrome',
              windowTitle: 'GitHub - DEVSYNX',
              startedAt: '2026-09-17T11:00:00Z',
              endedAt: '2026-09-17T11:02:00Z',
              isIdle: false,
            },
          ],
        });

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.accepted).toBe(0);
      expect(secondRes.body.data.duplicate).toBe(true);

      const countAfterDuplicate = await prisma.session.count({ where: { deviceId: activeDeviceId } });
      expect(countAfterDuplicate).toBe(countBeforeDuplicate); // Zero rows added on duplicate
    });
  });

  describe('Validation & Privacy Boundary Checks', () => {
    it('should reject batch with missing or empty appName (400 VALIDATION_ERROR)', async () => {
      const response = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', activeDeviceId)
        .set('X-Device-Token', activeDeviceSecret)
        .send({
          batchId: `BATCH-EMPTY-APP-${Date.now()}`,
          samples: [
            {
              appName: '',
              startedAt: '2026-09-17T10:00:00Z',
              endedAt: '2026-09-17T10:01:00Z',
            },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject batch with invalid startedAt >= endedAt timestamps (400 VALIDATION_ERROR)', async () => {
      const response = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', activeDeviceId)
        .set('X-Device-Token', activeDeviceSecret)
        .send({
          batchId: `BATCH-BAD-TIMESTAMPS-${Date.now()}`,
          samples: [
            {
              appName: 'Figma',
              startedAt: '2026-09-17T10:05:00Z',
              endedAt: '2026-09-17T10:00:00Z', // Invalid end before start
            },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('should reject batch payload containing prohibited data fields like keystrokes or screenshots (400 VALIDATION_ERROR)', async () => {
      const response = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', activeDeviceId)
        .set('X-Device-Token', activeDeviceSecret)
        .send({
          batchId: `BATCH-PROHIBITED-${Date.now()}`,
          samples: [
            {
              appName: 'Terminal',
              startedAt: '2026-09-17T10:00:00Z',
              endedAt: '2026-09-17T10:01:00Z',
            },
          ],
          keystrokes: 'secret_password_123', // Prohibited extra property
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject oversized batch exceeding 100 samples (400 VALIDATION_ERROR)', async () => {
      const oversizedSamples = Array.from({ length: 101 }, (_, i) => ({
        appName: `App ${i}`,
        startedAt: '2026-09-17T10:00:00Z',
        endedAt: '2026-09-17T10:00:05Z',
      }));

      const response = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', activeDeviceId)
        .set('X-Device-Token', activeDeviceSecret)
        .send({
          batchId: `BATCH-OVERSIZED-${Date.now()}`,
          samples: oversizedSamples,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Employee & Device Ownership Persistence Verification', () => {
    it('should bind ingested session records to authenticated device and employee', async () => {
      const batchId = `BATCH-OWNERSHIP-VERIFY-${Date.now()}`;
      const response = await request(app)
        .post('/api/v1/activity/batches')
        .set('X-Device-ID', activeDeviceId)
        .set('X-Device-Token', activeDeviceSecret)
        .send({
          batchId,
          samples: [
            {
              appName: 'Docker Desktop',
              windowTitle: 'Containers List',
              startedAt: '2026-09-17T12:00:00Z',
              endedAt: '2026-09-17T12:05:00Z',
              isIdle: false,
            },
          ],
        });

      expect(response.status).toBe(200);

      const savedSession = await prisma.session.findFirst({
        where: { deviceId: activeDeviceId, appName: 'Docker Desktop' },
      });

      expect(savedSession).toBeDefined();
      expect(savedSession!.deviceId).toBe(activeDeviceId);
      expect(savedSession!.userId).toBe(emp1Id);
      expect(savedSession!.durationSeconds).toBe(300); // 5 minutes = 300s
      expect(savedSession!.isIdle).toBe(false);
    });
  });
});
