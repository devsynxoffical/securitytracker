export const Scopes = ['own', 'team', 'department', 'all'] as const;
export type Scope = (typeof Scopes)[number];

export const PermissionKeys = [
  // Admin
  'admin.access',

  // Employees
  'employees.view',
  'employees.create',
  'employees.edit',
  'employees.disable',
  'employees.reset_password',

  // Organisation
  'org.manage',

  // Roles
  'roles.view',
  'roles.manage',

  // Devices
  'devices.view',
  'devices.approve',
  'devices.revoke',

  // Sessions
  'sessions.view',
  'sessions.revoke',

  // Attendance
  'attendance.view',
  'attendance.manage',
  'attendance.approve',

  // Tracking
  'tracking.view_summary',
  'tracking.view_detail',
  'tracking.manage_rules',

  // CRM leads
  'crm.leads.view',
  'crm.leads.create',
  'crm.leads.edit',
  'crm.leads.assign',
  'crm.leads.reopen',
  'crm.leads.delete',
  'crm.leads.import',
  'crm.leads.export',
  'crm.leads.create_duplicate',

  // CRM config
  'crm.pipelines.manage',

  // Calls
  'crm.calls.log',
  'crm.calls.manage',

  // Tasks
  'tasks.view',
  'tasks.create',
  'tasks.assign',
  'tasks.manage',

  // Targets
  'targets.view',
  'targets.manage',

  // Mail
  'mail.use',
  'mail.accounts.manage',
  'mail.assign',
  'mail.logs.view',

  // Reports
  'reports.view',
  'reports.export',

  // Notifications
  'announcements.send',

  // Security & Audit
  'security.view',
  'audit.view',
  'audit.export',

  // Settings
  'settings.manage',
] as const;

export type PermissionKey = (typeof PermissionKeys)[number];

export interface RolePermissionGrant {
  key: PermissionKey;
  scope: Scope;
}

export const SystemRoleNames = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  TEAM_LEADER: 'Team Leader',
  EMPLOYEE: 'Employee',
} as const;

export const DefaultRoleRank = {
  [SystemRoleNames.EMPLOYEE]: 1,
  [SystemRoleNames.TEAM_LEADER]: 2,
  [SystemRoleNames.MANAGER]: 3,
  [SystemRoleNames.ADMIN]: 4,
  [SystemRoleNames.SUPER_ADMIN]: 5,
} as const;
