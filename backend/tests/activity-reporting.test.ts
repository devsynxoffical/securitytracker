import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signUserToken } from '../src/utils/jwt.js';
import { generateDeviceToken } from '../src/utils/crypto.js';

describe('Phase 10: Activity Dashboard & Analytics Reporting Tests', () => {
  let adminUser: any;
  let adminToken: string;

  let managerUser: any;
  let managerToken: string;

  let reportUser: any;
  let reportToken: string;

  let otherUser: any;
  let otherToken: string;

  let testDevice: any;

  beforeAll(async () => {
    // 1. Create Users
    adminUser = await prisma.user.create({
      data: {
        email: `admin.reporting.${Date.now()}@devsynx.com`,
        fullName: 'Admin Reporting User',
        role: 'ADMIN',
        isActive: true,
      },
    });
    adminToken = signUserToken({ userId: adminUser.id, email: adminUser.email, role: adminUser.role });

    managerUser = await prisma.user.create({
      data: {
        email: `manager.reporting.${Date.now()}@devsynx.com`,
        fullName: 'Manager Reporting User',
        role: 'MANAGER',
        isActive: true,
      },
    });
    managerToken = signUserToken({ userId: managerUser.id, email: managerUser.email, role: managerUser.role });

    reportUser = await prisma.user.create({
      data: {
        email: `report.employee.${Date.now()}@devsynx.com`,
        fullName: 'Report Employee',
        role: 'EMPLOYEE',
        managerId: managerUser.id,
        isActive: true,
      },
    });
    reportToken = signUserToken({ userId: reportUser.id, email: reportUser.email, role: reportUser.role });

    otherUser = await prisma.user.create({
      data: {
        email: `other.employee.${Date.now()}@devsynx.com`,
        fullName: 'Other Employee',
        role: 'EMPLOYEE',
        isActive: true,
      },
    });
    otherToken = signUserToken({ userId: otherUser.id, email: otherUser.email, role: otherUser.role });

    // 2. Create Device
    const { tokenHash } = generateDeviceToken();
    testDevice = await prisma.device.create({
      data: {
        hostname: 'REPORTING-WORKSTATION-01',
        osType: 'WINDOWS',
        user: { connect: { id: reportUser.id } },
        deviceTokenHash: tokenHash,
        status: 'ACTIVE',
      },
    });

    // 3. Seed Deterministic Accuracy Test Scenario (#21)
    // Date: 2026-09-18
    // 09:00 - 10:00 Chrome ACTIVE (3600s)
    // 10:00 - 10:15 IDLE IDLE (900s)
    // 10:15 - 11:00 VS Code ACTIVE (2700s)
    // 11:00 - 11:30 Chrome ACTIVE (1800s)
    await prisma.session.createMany({
      data: [
        {
          userId: reportUser.id,
          deviceId: testDevice.id,
          appName: 'Google Chrome',
          windowTitle: 'Dashboard - Google Chrome',
          startTime: new Date('2026-09-18T09:00:00.000Z'),
          endTime: new Date('2026-09-18T10:00:00.000Z'),
          durationSeconds: 3600,
          isIdle: false,
        },
        {
          userId: reportUser.id,
          deviceId: testDevice.id,
          appName: 'System Idle',
          windowTitle: null,
          startTime: new Date('2026-09-18T10:00:00.000Z'),
          endTime: new Date('2026-09-18T10:15:00.000Z'),
          durationSeconds: 900,
          isIdle: true,
        },
        {
          userId: reportUser.id,
          deviceId: testDevice.id,
          appName: 'Visual Studio Code',
          windowTitle: 'main.ts - VS Code',
          startTime: new Date('2026-09-18T10:15:00.000Z'),
          endTime: new Date('2026-09-18T11:00:00.000Z'),
          durationSeconds: 2700,
          isIdle: false,
        },
        {
          userId: reportUser.id,
          deviceId: testDevice.id,
          appName: 'Google Chrome',
          windowTitle: 'Documentation - Google Chrome',
          startTime: new Date('2026-09-18T11:00:00.000Z'),
          endTime: new Date('2026-09-18T11:30:00.000Z'),
          durationSeconds: 1800,
          isIdle: false,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({
      where: { userId: { in: [adminUser.id, managerUser.id, reportUser.id, otherUser.id] } },
    });
    await prisma.device.deleteMany({
      where: { id: testDevice.id },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminUser.id, managerUser.id, reportUser.id, otherUser.id] } },
    });
  });

  describe('Important Data Accuracy Test (Test Scenario #21)', () => {
    it('should accurately calculate active time, idle time, total tracked time, and app breakdown', async () => {
      const res = await request(app)
        .get('/api/v1/activity/summary')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ employeeId: reportUser.id, startDate: '2026-09-18', endDate: '2026-09-18' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toEqual({
        activeSeconds: 8100, // 3600 + 2700 + 1800 = 8100s (2h 15m)
        idleSeconds: 900, // 900s (15m)
        totalTrackedSeconds: 9000, // 9000s (2h 30m)
        sessionCount: 4,
      });

      // App Usage Breakdown Test
      const appRes = await request(app)
        .get('/api/v1/activity/applications')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ employeeId: reportUser.id, startDate: '2026-09-18', endDate: '2026-09-18' });

      expect(appRes.status).toBe(200);
      const apps = appRes.body.data;
      expect(apps).toHaveLength(3);

      const chrome = apps.find((a: any) => a.appName === 'Google Chrome');
      expect(chrome).toBeDefined();
      expect(chrome.activeSeconds).toBe(5400); // 3600 + 1800 = 5400s (1h 30m)

      const vscode = apps.find((a: any) => a.appName === 'Visual Studio Code');
      expect(vscode).toBeDefined();
      expect(vscode.activeSeconds).toBe(2700); // 2700s (45m)
    });
  });

  describe('Server-Side Authorization Boundaries', () => {
    it('should allow EMPLOYEE to view own activity summary', async () => {
      const res = await request(app)
        .get('/api/v1/activity/summary')
        .set('Authorization', `Bearer ${reportToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.sessionCount).toBe(4);
    });

    it("should REJECT EMPLOYEE attempting to view another employee's activity (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .get('/api/v1/activity/summary')
        .set('Authorization', `Bearer ${otherToken}`)
        .query({ employeeId: reportUser.id });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it("should allow MANAGER to view direct report's activity", async () => {
      const res = await request(app)
        .get('/api/v1/activity/summary')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ employeeId: reportUser.id });

      expect(res.status).toBe(200);
      expect(res.body.data.sessionCount).toBe(4);
    });

    it("should REJECT MANAGER attempting to view non-direct report's activity (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .get('/api/v1/activity/summary')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ employeeId: otherUser.id });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow ADMIN to view any employee activity', async () => {
      const res = await request(app)
        .get('/api/v1/activity/summary')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ employeeId: reportUser.id });

      expect(res.status).toBe(200);
      expect(res.body.data.sessionCount).toBe(4);
    });
  });

  describe('Paginated Activity Sessions API', () => {
    it('should return paginated sessions list with device and user details', async () => {
      const res = await request(app)
        .get('/api/v1/activity/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ employeeId: reportUser.id, page: 1, limit: 2 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 4,
        totalPages: 2,
      });

      expect(res.body.data[0].device).toBeDefined();
      expect(res.body.data[0].device.hostname).toBe('REPORTING-WORKSTATION-01');
      expect(res.body.data[0].user).toBeDefined();
    });
  });

  describe('Daily Trend API', () => {
    it('should aggregate daily active vs idle durations', async () => {
      const res = await request(app)
        .get('/api/v1/activity/daily')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ employeeId: reportUser.id });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toEqual({
        date: '2026-09-18',
        activeSeconds: 8100,
        idleSeconds: 900,
        totalTrackedSeconds: 9000,
      });
    });
  });

  describe('CSV Export API', () => {
    it('should export activity sessions in CSV format with proper headers', async () => {
      const res = await request(app)
        .get('/api/v1/activity/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ employeeId: reportUser.id });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Employee,Email,Date,Device,Application,Window Title,Start Time,End Time,Duration (Seconds),Type');
      expect(res.text).toContain('Google Chrome');
      expect(res.text).toContain('REPORTING-WORKSTATION-01');
    });

    it('should ENFORCE authorization bounds on CSV export (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get('/api/v1/activity/export')
        .set('Authorization', `Bearer ${otherToken}`)
        .query({ employeeId: reportUser.id });

      expect(res.status).toBe(403);
    });
  });
});
