import { Prisma } from '@prisma/client';
import { PermissionKeys, SystemRoleNames, DefaultRoleRank, Scope } from '@company-os/contracts';

/**
 * Default roles and permission matrix (05-roles-permissions.md section 3) and the
 * company defaults every workspace starts with (13, 14, 15, 17). Shared by the
 * seed script and the first-run bootstrap (03 F29).
 */

export interface RoleDefinition {
  rank: number;
  isSystem: boolean;
  permissions: Record<string, Scope>;
}

type Db = Prisma.TransactionClient;

export const DEFAULT_ROLE_DEFINITIONS: Record<string, RoleDefinition> = {
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
      'crm.leads.convert': 'all',
      'crm.contacts.view': 'all',
      'crm.contacts.create': 'all',
      'crm.contacts.edit': 'all',
      'crm.contacts.assign': 'all',
      'crm.contacts.delete': 'all',
      'crm.contacts.import': 'all',
      'crm.contacts.export': 'all',
      'crm.accounts.view': 'all',
      'crm.accounts.create': 'all',
      'crm.accounts.edit': 'all',
      'crm.accounts.assign': 'all',
      'crm.accounts.delete': 'all',
      'crm.accounts.import': 'all',
      'crm.accounts.export': 'all',
      'crm.deals.view': 'all',
      'crm.deals.create': 'all',
      'crm.deals.edit': 'all',
      'crm.deals.assign': 'all',
      'crm.deals.reopen': 'all',
      'crm.deals.delete': 'all',
      'crm.deals.export': 'all',
      'crm.pipelines.manage': 'all',
      'crm.config.manage': 'all',
      'tasks.spaces.manage': 'all',
      'tracking.timesheets.approve': 'all',
      'mail.templates.manage': 'all',
      'hr.leave.manage': 'all',
      'hr.profiles.view': 'all',
      'hr.profiles.edit': 'all',
      'hr.checklists.manage': 'all',
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
      'crm.leads.convert': 'department',
      'crm.contacts.view': 'department',
      'crm.contacts.create': 'department',
      'crm.contacts.edit': 'department',
      'crm.contacts.assign': 'department',
      'crm.contacts.import': 'department',
      'crm.contacts.export': 'department',
      'crm.accounts.view': 'department',
      'crm.accounts.create': 'department',
      'crm.accounts.edit': 'department',
      'crm.accounts.assign': 'department',
      'crm.accounts.import': 'department',
      'crm.accounts.export': 'department',
      'crm.deals.view': 'department',
      'crm.deals.create': 'department',
      'crm.deals.edit': 'department',
      'crm.deals.assign': 'department',
      'crm.deals.reopen': 'department',
      'crm.deals.export': 'department',
      'tasks.spaces.manage': 'department',
      'tracking.timesheets.approve': 'department',
      'hr.profiles.view': 'department',
      'hr.checklists.manage': 'department',
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
      'crm.leads.convert': 'team',
      'crm.contacts.view': 'team',
      'crm.contacts.create': 'team',
      'crm.contacts.edit': 'team',
      'crm.contacts.assign': 'team',
      'crm.accounts.view': 'team',
      'crm.accounts.create': 'team',
      'crm.accounts.edit': 'team',
      'crm.accounts.assign': 'team',
      'crm.deals.view': 'team',
      'crm.deals.create': 'team',
      'crm.deals.edit': 'team',
      'crm.deals.assign': 'team',
      'crm.deals.reopen': 'team',
      'tracking.timesheets.approve': 'team',
      'hr.profiles.view': 'team',
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
      'crm.leads.convert': 'own',
      'crm.contacts.view': 'own',
      'crm.contacts.create': 'own',
      'crm.contacts.edit': 'own',
      'crm.accounts.view': 'own',
      'crm.accounts.create': 'own',
      'crm.accounts.edit': 'own',
      'crm.deals.view': 'own',
      'crm.deals.create': 'own',
      'crm.deals.edit': 'own',
      'hr.profiles.view': 'own',
      'crm.calls.log': 'own',
      'tasks.view': 'own',
      'tasks.create': 'own',
      'targets.view': 'own',
      'mail.use': 'own',
    },
  },
};

/** Upserts the five system roles and their grants. Returns role name -> id. */
export async function ensureDefaultRoles(db: Db): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const [roleName, def] of Object.entries(DEFAULT_ROLE_DEFINITIONS)) {
    const role = await db.role.upsert({
      where: { name: roleName },
      update: { rank: def.rank, isSystem: def.isSystem },
      create: { name: roleName, rank: def.rank, isSystem: def.isSystem },
    });
    ids[roleName] = role.id;
    for (const [key, scope] of Object.entries(def.permissions)) {
      await db.rolePermission.upsert({
        where: { roleId_permissionKey: { roleId: role.id, permissionKey: key } },
        update: { scope },
        create: { roleId: role.id, permissionKey: key, scope },
      });
    }
  }
  return ids;
}

export interface CompanyDefaultIds {
  leadPipeline?: string;
  dealPipeline?: string;
  space?: string;
  list?: string;
}

export const DEFAULT_TASK_STATUSES = [
  { name: 'To do', colour: '#5C666E', group: 'open' },
  { name: 'In progress', colour: '#2459C4', group: 'active' },
  { name: 'In review', colour: '#6B46C1', group: 'active' },
  { name: 'Done', colour: '#1E8E5A', group: 'done' },
  { name: 'Cancelled', colour: '#8A939B', group: 'closed' },
];

/**
 * Creates the defaults a new company needs: lead and deal pipelines, lead sources,
 * lost reasons, tags, a task space with one list, leave types, onboarding and
 * offboarding templates, mail labels. Idempotent (upserts on natural keys or fixed ids).
 */
export async function seedCompanyDefaults(db: Db, companyId: string, createdBy: string | null, ids: CompanyDefaultIds = {}) {
  const leadPipeline = ids.leadPipeline
    ? await db.pipeline.upsert({ where: { id: ids.leadPipeline }, update: {}, create: { id: ids.leadPipeline, ...leadPipelineData(companyId) } })
    : (await db.pipeline.findFirst({ where: { companyId, entity: 'lead' } })) ?? (await db.pipeline.create({ data: leadPipelineData(companyId) }));

  const dealPipeline = ids.dealPipeline
    ? await db.pipeline.upsert({ where: { id: ids.dealPipeline }, update: {}, create: { id: ids.dealPipeline, ...dealPipelineData(companyId) } })
    : (await db.pipeline.findFirst({ where: { companyId, entity: 'deal' } })) ?? (await db.pipeline.create({ data: dealPipelineData(companyId) }));

  const sources = ['Website', 'Referral', 'Cold Call', 'Social Media', 'Trade Show', 'Partner'];
  for (const [i, name] of sources.entries()) {
    await db.leadSource.upsert({ where: { companyId_name: { companyId, name } }, update: {}, create: { companyId, name, position: i + 1 } });
  }
  const lostReasons = ['Budget', 'Timing', 'Competitor', 'No decision', 'Not a fit', 'Unresponsive'];
  for (const [i, name] of lostReasons.entries()) {
    await db.lostReason.upsert({ where: { companyId_name: { companyId, name } }, update: {}, create: { companyId, name, position: i + 1 } });
  }
  const tags: Array<[string, string]> = [['Hot', '#C2362B'], ['Enterprise', '#6B46C1'], ['SMB', '#2459C4'], ['Renewal', '#1E8E5A'], ['Upsell', '#B26A00']];
  for (const [name, colour] of tags) {
    await db.tag.upsert({ where: { companyId_name: { companyId, name } }, update: {}, create: { companyId, name, colour } });
  }

  const spaceData = { companyId, name: 'General', colour: '#0F6B5C', visibility: 'company', defaultStatuses: DEFAULT_TASK_STATUSES, createdBy };
  const space = ids.space
    ? await db.taskSpace.upsert({ where: { id: ids.space }, update: {}, create: { id: ids.space, ...spaceData } })
    : (await db.taskSpace.findFirst({ where: { companyId, name: 'General' } })) ?? (await db.taskSpace.create({ data: spaceData }));
  const listData = {
    companyId,
    spaceId: space.id,
    name: 'Team tasks',
    statuses: { create: DEFAULT_TASK_STATUSES.map((st, i) => ({ ...st, position: i + 1 })) },
  };
  if (ids.list) await db.taskList.upsert({ where: { id: ids.list }, update: {}, create: { id: ids.list, ...listData } });
  else if (!(await db.taskList.findFirst({ where: { spaceId: space.id } }))) await db.taskList.create({ data: listData });

  const leaveTypes: Array<[string, string, string, number, boolean]> = [
    ['Annual leave', 'ANNUAL', '#1E8E5A', 20, true],
    ['Sick leave', 'SICK', '#C2362B', 10, true],
    ['Unpaid leave', 'UNPAID', '#5C666E', 0, false],
    ['Casual leave', 'CASUAL', '#B26A00', 5, true],
  ];
  for (const [i, [name, code, colour, allowance, paid]] of leaveTypes.entries()) {
    await db.leaveType.upsert({ where: { companyId_code: { companyId, code } }, update: {}, create: { companyId, name, code, colour, annualAllowanceDays: allowance, paid, position: i + 1 } });
  }

  if (!(await db.hrChecklistTemplate.findFirst({ where: { companyId, kind: 'onboarding' } }))) {
    await db.hrChecklistTemplate.create({
      data: {
        companyId, name: 'Standard onboarding', kind: 'onboarding', isDefault: true,
        items: [
          { title: 'Create company email account', ownerRole: 'it', offsetDays: -2 },
          { title: 'Prepare workstation and install the desktop app', ownerRole: 'it', offsetDays: -1 },
          { title: 'Sign monitoring policy and contract', ownerRole: 'hr', offsetDays: 0 },
          { title: 'Welcome meeting with manager', ownerRole: 'manager', offsetDays: 0 },
          { title: 'Assign CRM pipeline and targets', ownerRole: 'manager', offsetDays: 1 },
          { title: 'Complete profile and emergency contact', ownerRole: 'employee', offsetDays: 3 },
          { title: '30-day check-in', ownerRole: 'manager', offsetDays: 30 },
        ],
      },
    });
  }
  if (!(await db.hrChecklistTemplate.findFirst({ where: { companyId, kind: 'offboarding' } }))) {
    await db.hrChecklistTemplate.create({
      data: {
        companyId, name: 'Standard offboarding', kind: 'offboarding', isDefault: true,
        items: [
          { title: 'Reassign leads, deals and tasks', ownerRole: 'manager', offsetDays: -3 },
          { title: 'Remove mailbox assignments', ownerRole: 'it', offsetDays: 0 },
          { title: 'Revoke devices and sessions', ownerRole: 'it', offsetDays: 0 },
          { title: 'Exit interview', ownerRole: 'hr', offsetDays: 0 },
          { title: 'Return equipment', ownerRole: 'employee', offsetDays: 0 },
        ],
      },
    });
  }

  for (const [name, colour] of [['Urgent', '#C2362B'], ['Billing', '#B26A00'], ['Support', '#2459C4'], ['Sales', '#1E8E5A']] as Array<[string, string]>) {
    await db.mailLabel.upsert({ where: { companyId_name: { companyId, name } }, update: {}, create: { companyId, name, colour } });
  }

  return { leadPipelineId: leadPipeline.id, dealPipelineId: dealPipeline.id, spaceId: space.id };
}

function leadPipelineData(companyId: string) {
  return {
    companyId,
    name: 'Sales Pipeline',
    entity: 'lead',
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
  };
}

function dealPipelineData(companyId: string) {
  return {
    companyId,
    name: 'Deal Pipeline',
    entity: 'deal',
    isDefault: true,
    stages: {
      create: [
        { name: 'Qualification', position: 1, type: 'open', probability: 10 },
        { name: 'Discovery', position: 2, type: 'open', probability: 25 },
        { name: 'Proposal', position: 3, type: 'open', probability: 50, countsAsQualified: true },
        { name: 'Negotiation', position: 4, type: 'open', probability: 75 },
        { name: 'Closed Won', position: 5, type: 'won', probability: 100 },
        { name: 'Closed Lost', position: 6, type: 'lost', probability: 0 },
      ],
    },
  };
}
