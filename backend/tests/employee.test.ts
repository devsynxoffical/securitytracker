import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signUserToken } from '../src/utils/jwt.js';

describe('Phase 5: Employee CRM & Work Profile Module Tests', () => {
  let emp1Id: string;
  let emp1Token: string;
  let emp2Id: string;
  let emp2Token: string;
  let managerId: string;
  let managerToken: string;
  let adminId: string;
  let adminToken: string;

  beforeAll(async () => {
    // 1. Create Manager
    const manager = await prisma.user.create({
      data: {
        email: 'manager.crm@devsynx.com',
        fullName: 'Manager User',
        role: 'MANAGER',
        isActive: true,
      },
    });
    managerId = manager.id;
    managerToken = signUserToken({ userId: managerId, email: manager.email, role: manager.role });

    // 2. Create Employee 1 (Reports to Manager)
    const emp1 = await prisma.user.create({
      data: {
        email: 'employee1.crm@devsynx.com',
        fullName: 'Employee One',
        role: 'EMPLOYEE',
        isActive: true,
        managerId: managerId,
      },
    });
    emp1Id = emp1.id;
    emp1Token = signUserToken({ userId: emp1Id, email: emp1.email, role: emp1.role });

    // 3. Create Employee 2 (Unrelated / Reports to nobody)
    const emp2 = await prisma.user.create({
      data: {
        email: 'employee2.crm@devsynx.com',
        fullName: 'Employee Two',
        role: 'EMPLOYEE',
        isActive: true,
      },
    });
    emp2Id = emp2.id;
    emp2Token = signUserToken({ userId: emp2Id, email: emp2.email, role: emp2.role });

    // 4. Create Admin
    const admin = await prisma.user.create({
      data: {
        email: 'admin.crm@devsynx.com',
        fullName: 'Admin CRM',
        role: 'ADMIN',
        isActive: true,
      },
    });
    adminId = admin.id;
    adminToken = signUserToken({ userId: adminId, email: admin.email, role: admin.role });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.workUpdate.deleteMany({ where: { userId: { in: [emp1Id, emp2Id] } } });
    await prisma.employeeSkill.deleteMany({ where: { userId: { in: [emp1Id, emp2Id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [emp1Id, emp2Id, managerId, adminId] } } });
  });

  describe('Employee Profile Access & Self-Service Field Updates', () => {
    it('should allow employee to view own profile (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${emp1Id}`)
        .set('Authorization', `Bearer ${emp1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe('employee1.crm@devsynx.com');
    });

    it('should allow employee to update self-service fields (bio, responsibilities)', async () => {
      const response = await request(app)
        .patch(`/api/v1/users/${emp1Id}`)
        .set('Authorization', `Bearer ${emp1Token}`)
        .send({
          bio: 'Senior developer working on cloud platform',
          responsibilities: 'Lead architecture and REST APIs',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.bio).toBe('Senior developer working on cloud platform');
    });

    it('should prevent employee from updating another employee profile (403 FORBIDDEN)', async () => {
      const response = await request(app)
        .patch(`/api/v1/users/${emp2Id}`)
        .set('Authorization', `Bearer ${emp1Token}`)
        .send({ bio: 'Hacked bio' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should prevent non-admin from modifying admin-protected fields (403 FORBIDDEN)', async () => {
      const response = await request(app)
        .patch(`/api/v1/users/${emp1Id}/admin`)
        .set('Authorization', `Bearer ${emp1Token}`)
        .send({ role: 'ADMIN', department: 'Executive' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow Admin to update organizational fields (jobTitle, department, employeeId)', async () => {
      const response = await request(app)
        .patch(`/api/v1/users/${emp1Id}/admin`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: 'EMP-TEST-9999',
          jobTitle: 'Senior Full Stack Engineer',
          department: 'Engineering',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.employeeId).toBe('EMP-TEST-9999');
      expect(response.body.data.department).toBe('Engineering');
    });
  });

  describe('Manager Access Boundaries', () => {
    it('should allow Manager to view profile of direct report employee', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${emp1Id}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(emp1Id);
    });

    it('should reject Manager attempting to view profile of unrelated employee (403 FORBIDDEN)', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${emp2Id}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Skills Management', () => {
    it('should allow employee to add a skill to own profile', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${emp1Id}/skills`)
        .set('Authorization', `Bearer ${emp1Token}`)
        .send({ name: 'TypeScript', proficiency: 'EXPERT' });

      expect(response.status).toBe(201);
      expect(response.body.data.skill.name).toBe('TypeScript');
    });
  });

  describe('Work Updates', () => {
    let createdUpdateId: string;

    it('should allow employee to post a work update', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${emp1Id}/updates`)
        .set('Authorization', `Bearer ${emp1Token}`)
        .send({
          title: 'Phase 5 Employee CRM Completed',
          description: 'Finished implementing profile, skills, projects, and work updates.',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.title).toBe('Phase 5 Employee CRM Completed');
      createdUpdateId = response.body.data.id;
    });

    it('should reject invalid work update with short title or description (400 VALIDATION_ERROR)', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${emp1Id}/updates`)
        .set('Authorization', `Bearer ${emp1Token}`)
        .send({ title: '', description: '' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should prevent employee from deleting another employee work update', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${emp1Id}/updates/${createdUpdateId}`)
        .set('Authorization', `Bearer ${emp2Token}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow owner employee to delete own work update', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${emp1Id}/updates/${createdUpdateId}`)
        .set('Authorization', `Bearer ${emp1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });
});
