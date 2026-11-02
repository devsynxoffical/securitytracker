import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { CryptoUtil } from '../src/common/crypto.util';
import { SystemRoleNames } from '@company-os/contracts';
import { ensureDefaultRoles, seedCompanyDefaults } from '../src/setup/default-roles';

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

  // 2. Roles and permissions (05-roles-permissions.md), shared with the first-run bootstrap
  const createdRoles = await ensureDefaultRoles(prisma);

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

  // 5. Company defaults (pipelines, lookups, tags, task space, leave types, templates, labels)
  const defaults = await seedCompanyDefaults(prisma, company.id, superAdmin.id, {
    leadPipeline: '00000000-0000-0000-0000-000000000010',
    dealPipeline: '00000000-0000-0000-0000-000000000020',
    space: '00000000-0000-0000-0000-000000000030',
    list: '00000000-0000-0000-0000-000000000031',
  });
  const pipeline = { id: defaults.leadPipelineId };

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

  // 9. DEMO MAILBOX (development only, SEED_DEMO_MAILBOX=true). Synthetic example.com data so the
  //    shared inbox can be exercised without Google credentials. tokenStatus 'demo' blocks send/sync.
  if (process.env.SEED_DEMO_MAILBOX === 'true') {
    const encKey = process.env.ENCRYPTION_SECRET || process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const demoMailbox = await prisma.mailbox.upsert({
      where: { address: 'demo-sales@example.com' },
      update: { tokenStatus: 'demo' },
      create: {
        companyId: company.id,
        address: 'demo-sales@example.com',
        displayName: 'Demo Sales (synthetic)',
        refreshTokenEnc: CryptoUtil.encryptField('demo', encKey),
        tokenStatus: 'demo',
        connectedBy: superAdmin.id,
        lastSyncAt: new Date(),
      },
    });
    const allPerms = ['read', 'send', 'reply', 'draft', 'attach', 'download', 'archive', 'mark_read', 'triage', 'comment'];
    for (const emp of [superAdmin, employeeDaniyal]) {
      await prisma.mailboxAssignment.upsert({
        where: { mailboxId_employeeId: { mailboxId: demoMailbox.id, employeeId: emp.id } },
        update: { permissions: allPerms },
        create: { mailboxId: demoMailbox.id, employeeId: emp.id, permissions: allPerms, assignedBy: superAdmin.id },
      });
    }

    // Two synthetic contacts whose addresses match senders below, so auto-linking is visible.
    const demoContacts: Array<[string, string, string]> = [
      ['Priya', 'Natarajan', 'priya.natarajan@example.com'],
      ['Marcus', 'Oyelaran', 'marcus@oyelaran-roofing.example.com'],
    ];
    const contactIds: Record<string, string> = {};
    for (const [first, last, email] of demoContacts) {
      const existing = await prisma.crmContact.findFirst({ where: { companyId: company.id, emails: { some: { emailLower: email } } }, select: { id: true } });
      if (existing) {
        contactIds[email] = existing.id;
        continue;
      }
      const c = await prisma.crmContact.create({
        data: { companyId: company.id, firstName: first, lastName: last, ownerId: employeeDaniyal.id, lifecycle: 'prospect', createdBy: superAdmin.id, emails: { create: [{ emailLower: email, label: 'Work', isPrimary: true }] } },
      });
      contactIds[email] = c.id;
    }

    const labels = await prisma.mailLabel.findMany({ where: { companyId: company.id } });
    const labelId = (name: string) => labels.find((l) => l.name === name)?.id;
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
    type DemoThread = { id: string; from: string; subject: string; msgs: Array<[string, string, number]>; unread?: boolean; assignee?: string; status?: string; snoozeHours?: number; labels?: string[] };
    const senders = {
      priya: 'priya.natarajan@example.com',
      marcus: 'marcus@oyelaran-roofing.example.com',
      hale: 'accounts@hale-properties.example.com',
      jen: 'jen.walsh@example.com',
      support: 'support@storm-guard.example.com',
      omar: 'omar.haddad@example.com',
    };
    const threads: DemoThread[] = [
      { id: 'demo-t-001', from: senders.priya, subject: 'Quote request: 24 units, Maple Court', unread: true, labels: ['Sales'], msgs: [[senders.priya, 'Could you send a quote for re-roofing 24 townhouse units at Maple Court? Inspection photos attached.', 2]] },
      { id: 'demo-t-002', from: senders.marcus, subject: 'Re: Subcontract terms for Q1', assignee: 'daniyal', labels: ['Sales'], msgs: [[senders.marcus, 'We can commit two crews from January if the per-square rate holds.', 30], ['demo-sales@example.com', 'Thanks Marcus, confirming the rate through March. Draft agreement to follow.', 26], [senders.marcus, 'Received. One question on the payment schedule, see below.', 5]] },
      { id: 'demo-t-003', from: senders.hale, subject: 'Invoice #4471 overdue', unread: true, labels: ['Billing', 'Urgent'], msgs: [[senders.hale, 'Invoice #4471 ($18,400) is 15 days overdue. Please advise on payment date.', 20]] },
      { id: 'demo-t-004', from: senders.jen, subject: 'Leak after last week\'s storm', unread: true, labels: ['Support'], msgs: [[senders.jen, 'There is water coming in near the chimney flashing you replaced in August.', 7]] },
      { id: 'demo-t-005', from: senders.support, subject: 'Your StormGuard warranty registration', status: 'closed', msgs: [[senders.support, 'Warranty registration confirmed for job SG-2201.', 72]] },
      { id: 'demo-t-006', from: senders.omar, subject: 'Can we move the site visit to Thursday?', assignee: 'admin', msgs: [[senders.omar, 'Thursday afternoon works better for us, does 2pm suit?', 9], ['demo-sales@example.com', '2pm Thursday is fine, see you then.', 8]] },
      { id: 'demo-t-007', from: senders.priya, subject: 'Re: Quote request: material options', assignee: 'daniyal', labels: ['Sales'], msgs: [[senders.priya, 'Do you offer a standing-seam metal option as an alternative to asphalt?', 50], ['demo-sales@example.com', 'Yes, I will include both options in the quote.', 48]] },
      { id: 'demo-t-008', from: senders.hale, subject: 'W-9 and insurance certificate', status: 'snoozed', snoozeHours: 48, labels: ['Billing'], msgs: [[senders.hale, 'Please send an updated W-9 and COI before we release the next payment.', 28]] },
      { id: 'demo-t-009', from: senders.jen, subject: 'Thank you!', status: 'closed', msgs: [[senders.jen, 'The crew was great, roof looks fantastic.', 240]] },
      { id: 'demo-t-010', from: senders.marcus, subject: 'Crew availability next week', unread: true, msgs: [[senders.marcus, 'Crew B is free Tuesday to Friday if you need extra hands.', 1]] },
      { id: 'demo-t-011', from: senders.omar, subject: 'Referral: neighbour at 14 Elm St', unread: true, labels: ['Sales'], msgs: [[senders.omar, 'My neighbour wants a similar job done, I gave her your number.', 3]] },
      { id: 'demo-t-012', from: senders.support, subject: 'Shingle batch recall notice', labels: ['Urgent', 'Support'], msgs: [[senders.support, 'Batch 7731 is subject to a voluntary recall. Affected jobs listed in the attachment.', 12]] },
    ];
    for (const t of threads) {
      const first = t.msgs[0]!;
      const last = t.msgs[t.msgs.length - 1]!;
      const assigneeId = t.assignee === 'daniyal' ? employeeDaniyal.id : t.assignee === 'admin' ? superAdmin.id : null;
      const inbound = t.msgs.filter((m) => m[0] !== 'demo-sales@example.com');
      const thread = await prisma.mailThread.upsert({
        where: { mailboxId_gmailThreadId: { mailboxId: demoMailbox.id, gmailThreadId: t.id } },
        update: {},
        create: {
          mailboxId: demoMailbox.id,
          gmailThreadId: t.id,
          subject: t.subject,
          snippet: last[1].slice(0, 120),
          participants: Array.from(new Set(['demo-sales@example.com', ...t.msgs.map((m) => m[0])])),
          lastMessageAt: hoursAgo(last[2]),
          lastInboundAt: hoursAgo(inbound[inbound.length - 1]?.[2] ?? first[2]),
          unread: Boolean(t.unread),
          hasAttachments: /attached|attachment/i.test(first[1]),
          labelIds: ['INBOX'],
          assigneeId,
          assignmentChangedAt: assigneeId ? hoursAgo(first[2]) : null,
          status: t.status ?? 'open',
          snoozedUntil: t.snoozeHours ? new Date(Date.now() + t.snoozeHours * 3600_000) : null,
          closedAt: t.status === 'closed' ? hoursAgo(last[2] - 1) : null,
          contactId: contactIds[t.from] ?? null,
          messages: {
            create: t.msgs.map(([from, body, h], i) => ({
              gmailMessageId: `${t.id}-m${i + 1}`,
              fromAddr: from,
              toAddrs: from === 'demo-sales@example.com' ? [t.from] : ['demo-sales@example.com'],
              sentAt: hoursAgo(h),
              snippet: body.slice(0, 120),
              hasAttachments: /attached|attachment/i.test(body),
              sentByEmployeeId: from === 'demo-sales@example.com' ? employeeDaniyal.id : null,
            })),
          },
          labels: { create: (t.labels ?? []).map((n) => labelId(n)).filter((id): id is string => Boolean(id)).map((id) => ({ labelId: id })) },
          events: {
            create: [
              ...(assigneeId ? [{ actorId: superAdmin.id, type: 'assigned', data: { assigneeId }, occurredAt: hoursAgo(first[2]) }] : []),
              ...(t.status === 'closed' ? [{ actorId: employeeDaniyal.id, type: 'status_changed', data: { from: 'open', to: 'closed' }, occurredAt: hoursAgo(last[2] - 1) }] : []),
              ...(contactIds[t.from] ? [{ actorId: null, type: 'linked', data: { contactId: contactIds[t.from], reason: 'participant_match' }, occurredAt: hoursAgo(first[2]) }] : []),
            ],
          },
        },
      });
      void thread;
    }
    console.log('Demo mailbox seeded: demo-sales@example.com with 12 synthetic threads');
  }

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
