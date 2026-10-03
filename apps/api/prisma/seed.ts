import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PermissionKeys, SystemRoleNames, DefaultRoleRank, Scope } from '@company-os/contracts';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with full live enterprise data...');

  // 1. Create Default Company
  const company = await prisma.company.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'DEVSYNX Technologies',
      timezone: 'UTC',
      weekStart: 1,
      settings: {
        idleThresholdSeconds: 300,
        breakAllowanceMinutes: 60,
        deviceApprovalMode: 'manual',
        deviceLimitPerEmployee: 1,
      },
    },
  });

  // 2. Create Roles and Permissions according to 05-roles-permissions.md
  const roleDefinitions: Record<string, { rank: number; isSystem: boolean; permissions: Record<string, Scope> }> = {
    [SystemRoleNames.SUPER_ADMIN]: {
      rank: DefaultRoleRank[SystemRoleNames.SUPER_ADMIN],
      isSystem: true,
      permissions: Object.fromEntries(PermissionKeys.map((key) => [key, 'all' as Scope])),
    },
    [SystemRoleNames.ADMIN]: {
      rank: DefaultRoleRank[SystemRoleNames.ADMIN],
      isSystem: true,
      permissions: {
        'admin.access': 'all',
        'employees.view': 'all',
        'employees.create': 'all',
        'employees.edit': 'all',
        'employees.disable': 'all',
        'employees.reset_password': 'all',
        'org.manage': 'all',
        'roles.view': 'all',
        'devices.view': 'all',
        'devices.approve': 'all',
        'devices.revoke': 'all',
        'sessions.view': 'all',
        'sessions.revoke': 'all',
        'attendance.view': 'all',
        'attendance.approve': 'all',
        'attendance.manage': 'all',
        'tracking.view_summary': 'all',
        'tracking.view_detail': 'all',
        'tracking.manage_rules': 'all',
        'crm.leads.view': 'all',
        'crm.leads.create': 'all',
        'crm.leads.edit': 'all',
        'crm.leads.assign': 'all',
        'crm.leads.reopen': 'all',
        'crm.leads.delete': 'all',
        'crm.leads.import': 'all',
        'crm.leads.export': 'all',
        'crm.pipelines.manage': 'all',
        'crm.calls.log': 'all',
        'crm.calls.manage': 'all',
        'tasks.view': 'all',
        'tasks.create': 'all',
        'tasks.assign': 'all',
        'tasks.manage': 'all',
        'targets.view': 'all',
        'targets.manage': 'all',
        'mail.use': 'own',
        'mail.assign': 'all',
        'mail.logs.view': 'all',
        'reports.view': 'all',
        'reports.export': 'all',
        'announcements.send': 'all',
        'security.view': 'all',
        'audit.view': 'all',
        'settings.manage': 'all',
      },
    },
    [SystemRoleNames.MANAGER]: {
      rank: DefaultRoleRank[SystemRoleNames.MANAGER],
      isSystem: true,
      permissions: {
        'admin.access': 'all',
        'employees.view': 'department',
        'devices.view': 'department',
        'attendance.view': 'department',
        'attendance.approve': 'department',
        'tracking.view_summary': 'department',
        'tracking.view_detail': 'department',
        'crm.leads.view': 'department',
        'crm.leads.create': 'department',
        'crm.leads.edit': 'department',
        'crm.leads.assign': 'department',
        'crm.leads.reopen': 'department',
        'crm.leads.import': 'department',
        'crm.leads.export': 'department',
        'crm.calls.log': 'department',
        'crm.calls.manage': 'department',
        'tasks.view': 'department',
        'tasks.create': 'department',
        'tasks.assign': 'department',
        'tasks.manage': 'department',
        'targets.view': 'department',
        'targets.manage': 'department',
        'mail.use': 'own',
        'reports.view': 'department',
        'reports.export': 'department',
        'announcements.send': 'department',
      },
    },
    [SystemRoleNames.TEAM_LEADER]: {
      rank: DefaultRoleRank[SystemRoleNames.TEAM_LEADER],
      isSystem: true,
      permissions: {
        'admin.access': 'all',
        'employees.view': 'team',
        'attendance.view': 'team',
        'attendance.approve': 'team',
        'tracking.view_summary': 'team',
        'crm.leads.view': 'team',
        'crm.leads.create': 'team',
        'crm.leads.edit': 'team',
        'crm.leads.assign': 'team',
        'crm.leads.reopen': 'team',
        'crm.calls.log': 'team',
        'crm.calls.manage': 'team',
        'tasks.view': 'team',
        'tasks.create': 'team',
        'tasks.assign': 'team',
        'tasks.manage': 'team',
        'targets.view': 'team',
        'mail.use': 'own',
        'reports.view': 'team',
        'announcements.send': 'team',
      },
    },
    [SystemRoleNames.EMPLOYEE]: {
      rank: DefaultRoleRank[SystemRoleNames.EMPLOYEE],
      isSystem: true,
      permissions: {
        'attendance.view': 'own',
        'tracking.view_summary': 'own',
        'tracking.view_detail': 'own',
        'crm.leads.view': 'own',
        'crm.leads.create': 'own',
        'crm.leads.edit': 'own',
        'crm.calls.log': 'own',
        'tasks.view': 'own',
        'tasks.create': 'own',
        'targets.view': 'own',
        'mail.use': 'own',
      },
    },
  };

  const createdRoles: Record<string, string> = {};

  for (const [roleName, def] of Object.entries(roleDefinitions)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { rank: def.rank, isSystem: def.isSystem },
      create: {
        name: roleName,
        rank: def.rank,
        isSystem: def.isSystem,
      },
    });
    createdRoles[roleName] = role.id;

    // Set role permissions
    for (const [key, scope] of Object.entries(def.permissions)) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionKey: {
            roleId: role.id,
            permissionKey: key,
          },
        },
        update: { scope },
        create: {
          roleId: role.id,
          permissionKey: key,
          scope,
        },
      });
    }
  }

  // 3. Create Departments & Teams
  const salesDept = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000050' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000050', companyId: company.id, name: 'Sales' },
  });

  const supportDept = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000051' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000051', companyId: company.id, name: 'Support' },
  });

  // 4. Create Users (Super Admin, Sales Exec Daniyal, Sam, Ahmed)
  const passwordHash = await argon2.hash('SuperAdmin123!', {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const empPasswordHash = await argon2.hash('password123', {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const superAdmin = await prisma.employee.upsert({
    where: { companyId_code: { companyId: company.id, code: 'EMP-0001' } },
    update: {},
    create: {
      companyId: company.id,
      code: 'EMP-0001',
      firstName: 'Sara',
      lastName: 'Malik',
      email: 'admin@devsynx.com',
      passwordHash,
      mustChangePassword: false,
      status: 'active',
      roleId: createdRoles[SystemRoleNames.SUPER_ADMIN]!,
    },
  });

  const employeeDaniyal = await prisma.employee.upsert({
    where: { companyId_code: { companyId: company.id, code: 'EMP-0021' } },
    update: {},
    create: {
      companyId: company.id,
      code: 'EMP-0021',
      firstName: 'Daniyal',
      lastName: 'Khan',
      email: 'daniyal.khan@company.com',
      passwordHash: empPasswordHash,
      mustChangePassword: false,
      status: 'active',
      departmentId: salesDept.id,
      roleId: createdRoles[SystemRoleNames.EMPLOYEE]!,
    },
  });

  const employeeSam = await prisma.employee.upsert({
    where: { companyId_code: { companyId: company.id, code: 'EMP-0022' } },
    update: {},
    create: {
      companyId: company.id,
      code: 'EMP-0022',
      firstName: 'Sam',
      lastName: 'Parker',
      email: 'sam.parker@company.com',
      passwordHash: empPasswordHash,
      mustChangePassword: false,
      status: 'active',
      departmentId: salesDept.id,
      roleId: createdRoles[SystemRoleNames.EMPLOYEE]!,
    },
  });

  await prisma.employee.upsert({
    where: { companyId_code: { companyId: company.id, code: 'EMP-0031' } },
    update: {},
    create: {
      companyId: company.id,
      code: 'EMP-0031',
      firstName: 'Ahmed',
      lastName: 'Raza',
      email: 'ahmed.raza@company.com',
      passwordHash: empPasswordHash,
      mustChangePassword: false,
      status: 'active',
      departmentId: supportDept.id,
      roleId: createdRoles[SystemRoleNames.EMPLOYEE]!,
    },
  });

  // 5. Create default CRM Pipeline and Stages
  const pipeline = await prisma.pipeline.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      companyId: company.id,
      name: 'Sales Pipeline',
      isDefault: true,
      stages: {
        create: [
          { name: 'New Lead', position: 1, type: 'open' },
          { name: 'Attempted', position: 2, type: 'open' },
          { name: 'Contacted', position: 3, type: 'open' },
          { name: 'Interested', position: 4, type: 'open' },
          { name: 'Follow-up', position: 5, type: 'open' },
          { name: 'Meeting Scheduled', position: 6, type: 'open', countsAsMeeting: true },
          { name: 'Proposal Sent', position: 7, type: 'open', countsAsQualified: true },
          { name: 'Negotiation', position: 8, type: 'open' },
          { name: 'Won', position: 9, type: 'won' },
          { name: 'Lost', position: 10, type: 'lost' },
        ],
      },
    },
  });

  const stages = await prisma.pipelineStage.findMany({ where: { pipelineId: pipeline.id } });
  const qualifiedStage = stages.find((s) => s.name === 'Proposal Sent') || stages[0]!;
  const contactedStage = stages.find((s) => s.name === 'Contacted') || stages[0]!;

  // 6. Create Demo Leads
  await prisma.lead.upsert({
    where: { id: '00000000-0000-0000-0000-000000000101' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000101',
      companyId: company.id,
      ownerId: employeeDaniyal.id,
      pipelineId: pipeline.id,
      stageId: qualifiedStage.id,
      name: 'Sarah Jenkins',
      companyName: 'Apex Logistics Inc',
      value: 28000,
      custom: { priority: 'High', jobTitle: 'VP of Operations' },
    },
  });

  await prisma.lead.upsert({
    where: { id: '00000000-0000-0000-0000-000000000102' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000102',
      companyId: company.id,
      ownerId: employeeSam.id,
      pipelineId: pipeline.id,
      stageId: contactedStage.id,
      name: 'Michael Chang',
      companyName: 'Nexus Health Systems',
      value: 45000,
      custom: { priority: 'High', jobTitle: 'Chief Information Officer' },
    },
  });

  // 7. Create Demo Tasks
  await prisma.task.upsert({
    where: { id: '00000000-0000-0000-0000-000000000201' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000201',
      companyId: company.id,
      creatorId: superAdmin.id,
      assigneeId: employeeDaniyal.id,
      title: 'Follow up with Apex Logistics on SLA agreement',
      priority: 'high',
      dueAt: new Date(),
      status: 'todo',
    },
  });

  // 8. Create Devices
  await prisma.device.upsert({
    where: { id: '00000000-0000-0000-0000-000000000301' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000301',
      companyId: company.id,
      name: 'Daniyal Workstation MacBook (PC-014)',
      employeeId: employeeDaniyal.id,
      hardwareHash: 'hash-mac-9821-b4',
      osVersion: 'macOS 15.1.1',
      appVersion: '1.0.0',
      publicKey: 'ecdsa-p256:04a1b2c3d4e5f6',
      status: 'approved',
    },
  });

  console.log(`Seed complete: Company ${company.name}, Super Admin ${superAdmin.email}, Daniyal (${employeeDaniyal.code})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
