# 05 - Roles and Permissions

## 1. Model

- A permission is a key such as `crm.leads.view`.
- A role is a named set of permissions, each granted with a scope.
- Each employee has exactly one role. Individual overrides (grant or deny a key) are possible and audited.
- Scope defines whose data the permission reaches.

| Scope | Reaches |
|---|---|
| own | Records owned by or assigned to the user |
| team | Records of members of teams the user leads, plus own |
| department | Records of all employees in departments the user manages, plus own |
| all | Everything in the company |

Server check for every request: `has(permission) AND target within scope`. A request outside scope returns 404 for single records (do not reveal existence) and filters lists silently.

Access channels: the Desktop App is for every employee. The Admin Panel needs the permission `admin.access` and 2FA.

## 2. Permission catalog

| Group | Keys |
|---|---|
| Admin | `admin.access` |
| Employees | `employees.view`, `employees.create`, `employees.edit`, `employees.disable`, `employees.reset_password` |
| Organisation | `org.manage` (departments, teams) |
| Roles | `roles.view`, `roles.manage` |
| Devices | `devices.view`, `devices.approve`, `devices.revoke` |
| Sessions | `sessions.view`, `sessions.revoke` |
| Attendance | `attendance.view`, `attendance.manage` (schedules, holidays), `attendance.approve` (corrections, leave) |
| Tracking | `tracking.view_summary` (totals), `tracking.view_detail` (apps, domains, time ranges), `tracking.manage_rules` |
| CRM leads | `crm.leads.view`, `crm.leads.create`, `crm.leads.edit`, `crm.leads.assign`, `crm.leads.reopen`, `crm.leads.delete`, `crm.leads.import`, `crm.leads.export`, `crm.leads.create_duplicate` |
| CRM config | `crm.pipelines.manage` |
| Calls | `crm.calls.log`, `crm.calls.manage` |
| Tasks | `tasks.view`, `tasks.create`, `tasks.assign`, `tasks.manage` |
| Targets | `targets.view`, `targets.manage` |
| Mail | `mail.use` (assigned mailboxes), `mail.accounts.manage`, `mail.assign`, `mail.logs.view` |
| Reports | `reports.view`, `reports.export` |
| Notifications | `announcements.send` |
| Security | `security.view` (login history, alerts), `audit.view`, `audit.export` |
| Settings | `settings.manage` |

Keys live in `packages/contracts` as a typed constant. Adding a key requires a migration that updates the default roles.

## 3. Default role matrix

Cell value = scope. Empty = not granted.

| Permission | Employee | Team Leader | Manager | Admin | Super Admin |
|---|---|---|---|---|---|
| admin.access | | yes | yes | yes | yes |
| employees.view | | team | department | all | all |
| employees.create / edit | | | | all | all |
| employees.disable / reset_password | | | | all | all |
| org.manage | | | | all | all |
| roles.view | | | | all | all |
| roles.manage | | | | | all |
| devices.view | | | department | all | all |
| devices.approve / revoke | | | | all | all |
| sessions.view / revoke | | | | all | all |
| attendance.view | own | team | department | all | all |
| attendance.approve | | team | department | all | all |
| attendance.manage | | | | all | all |
| tracking.view_summary | own | team | department | all | all |
| tracking.view_detail | own | | department | all | all |
| tracking.manage_rules | | | | all | all |
| crm.leads.view / edit | own | team | department | all | all |
| crm.leads.create | own | team | department | all | all |
| crm.leads.assign | | team | department | all | all |
| crm.leads.reopen | | team | department | all | all |
| crm.leads.delete | | | | all | all |
| crm.leads.import / export | | | department | all | all |
| crm.pipelines.manage | | | | all | all |
| crm.calls.log | own | team | department | all | all |
| crm.calls.manage | | team | department | all | all |
| tasks.view | own | team | department | all | all |
| tasks.create | own | team | department | all | all |
| tasks.assign / manage | | team | department | all | all |
| targets.view | own | team | department | all | all |
| targets.manage | | | department | all | all |
| mail.use | own | own | own | own | own |
| mail.accounts.manage | | | | | all |
| mail.assign | | | | all | all |
| mail.logs.view | | | | all | all |
| reports.view | | team | department | all | all |
| reports.export | | | department | all | all |
| announcements.send | | team | department | all | all |
| security.view | | | | all | all |
| audit.view | | | | all | all |
| audit.export | | | | | all |
| settings.manage | | | | all | all |

Notes:

1. Team Leaders see tracking totals of their team but not the app and website detail by default. This is a privacy-minded default and can be changed per role.
2. `mail.use` always has scope own: a user sees only mailboxes assigned to them, regardless of role. Admins manage assignments but do not read mail unless a mailbox is assigned to them.
3. `mail.accounts.manage` (connecting a mailbox) is Super Admin only by default because it creates access to a Google mailbox.
4. Lead deletion is a soft delete and restricted to Admin.

## 4. Rules

| ID | Rule |
|---|---|
| R1 | Super Admin role is fixed and has every permission with scope all |
| R2 | At least one active Super Admin must exist. The last one cannot be disabled or demoted |
| R3 | A user cannot edit their own role or permissions |
| R4 | A user can only grant permissions and scopes they hold themselves |
| R5 | A user cannot act on an employee with a higher role rank (rank: Employee 1, Team Leader 2, Manager 3, Admin 4, Super Admin 5, custom roles carry a rank) |
| R6 | Permission and role changes take effect on the next request (permissions are loaded per request from cache, invalidated on change) |
| R7 | Every permission or role change is written to the audit log with before and after |
| R8 | Tracking data of Admin and Super Admin users is visible only to Super Admin |

## 5. Implementation notes

- NestJS: `@RequirePermission('crm.leads.view')` decorator + global guard. The guard resolves the scope and attaches a `ScopeFilter` to the request. Every repository query MUST apply that filter. No query on employee-owned data without it.
- Scope resolution: `own` -> `employee_id = me`. `team` -> `employee_id IN members(teams led by me) + me`. `department` -> `employee_id IN employees(departments managed by me) + me`. `all` -> `company_id` only.
- Membership sets are cached in Redis per user for 60 s and invalidated on org changes.
- Tests: for every endpoint one test per role proving allowed and denied access (see 11).
