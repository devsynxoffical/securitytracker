# 04 - Module Specification

Functional requirements per module. Priority: M = MUST (1.0), S = SHOULD (1.0 if time allows), L = later.

## 1. Authentication (AUTH)

| ID | Requirement | P |
|---|---|---|
| FR-AUTH-01 | Employee login with employee code or company email + password | M |
| FR-AUTH-02 | Passwords hashed with Argon2id | M |
| FR-AUTH-03 | Access token 15 min (JWT), rotating refresh token 30 days bound to device | M |
| FR-AUTH-04 | Refresh requests signed with the device private key | M |
| FR-AUTH-05 | Lockout after 5 failed attempts in 15 min, rate limit per IP | M |
| FR-AUTH-06 | Forced password change on temporary password | M |
| FR-AUTH-07 | Admin Panel login with mandatory TOTP 2FA and recovery codes | M |
| FR-AUTH-08 | Session list and revoke (per session, per employee, all) | M |
| FR-AUTH-09 | Refresh token reuse detection revokes the session family | M |
| FR-AUTH-10 | Login history with time, IP, device, result | M |
| FR-AUTH-11 | Optional IP allowlist for the Admin Panel | S |
| FR-AUTH-12 | Google sign-in for employees | L |

## 2. Devices (DEV)

| ID | Requirement | P |
|---|---|---|
| FR-DEV-01 | Device registers on first login with public key and device info | M |
| FR-DEV-02 | Approval modes manual, auto first device, off | M |
| FR-DEV-03 | Approve, reject, revoke, rename devices in the Admin Panel | M |
| FR-DEV-04 | Limit of approved devices per employee | M |
| FR-DEV-05 | Device list shows last seen, app version, agent version, OS | M |
| FR-DEV-06 | Local cache and tokens wiped on revoke | M |

## 3. Organisation and employees (ORG)

| ID | Requirement | P |
|---|---|---|
| FR-ORG-01 | CRUD departments and teams, team has a leader, department has a manager | M |
| FR-ORG-02 | CRUD employees: code, name, email, phone, department, team, role, manager, schedule, join date, status | M |
| FR-ORG-03 | Employee statuses invited, active, disabled | M |
| FR-ORG-04 | Reset password, disable (F16), re-enable | M |
| FR-ORG-05 | Employee profile page with tabs: overview, attendance, activity, CRM, targets, devices, mail, audit | M |
| FR-ORG-06 | Bulk import of employees from CSV | S |

## 4. Roles and permissions (RBAC)

| ID | Requirement | P |
|---|---|---|
| FR-RBAC-01 | Permission keys with scope own, team, department, all (see 05) | M |
| FR-RBAC-02 | Five default roles, editable, plus custom roles | M |
| FR-RBAC-03 | Server enforces permission and scope on every endpoint. UI hiding is cosmetic only | M |
| FR-RBAC-04 | Super Admin role cannot be edited or removed, at least one must exist | M |
| FR-RBAC-05 | A user cannot grant permissions they do not hold | M |

## 5. Shift and attendance (ATT)

| ID | Requirement | P |
|---|---|---|
| FR-ATT-01 | Start, break (with type), resume, end shift from the Desktop App | M |
| FR-ATT-02 | Heartbeat, offline gap detection, auto-close per F5 | M |
| FR-ATT-03 | Shift schedules: name, workdays, start, end, grace minutes, may cross midnight | M |
| FR-ATT-04 | Assign schedule per employee with effective dates | M |
| FR-ATT-05 | Holidays calendar | M |
| FR-ATT-06 | Attendance day status per F8, recomputed on corrections | M |
| FR-ATT-07 | Live attendance board: status, check-in, active time, current app category | M |
| FR-ATT-08 | Correction requests with approval (F9) | M |
| FR-ATT-09 | Leave requests with approval (F9) | S |
| FR-ATT-10 | Monthly attendance sheet per employee and per team, CSV export | M |
| FR-ATT-11 | Long idle prompt (F5 rule 6) | S |

## 6. Activity tracking (TRK)

| ID | Requirement | P |
|---|---|---|
| FR-TRK-01 | Record active, idle and locked time per shift | M |
| FR-TRK-02 | Record time per application (process and display name) | M |
| FR-TRK-03 | Record time per website domain for Chrome and Edge through the extension | M |
| FR-TRK-04 | Record keyboard and mouse event counts per segment, never content | M |
| FR-TRK-05 | Activity exceptions for call and meeting apps and microphone use | M |
| FR-TRK-06 | Local encrypted queue, idempotent batch upload | M |
| FR-TRK-15 | Offline-first: tracking, shift timer, break and end shift keep working with no internet. Queue syncs automatically on reconnect and the Admin Panel backfills the full offline period (F7) | M |
| FR-TRK-07 | Daily rollups per employee, app, domain, category | M |
| FR-TRK-08 | Drill-down: day, app, domain, time ranges (as in the original example) | M |
| FR-TRK-09 | Productivity categories for apps and domains, default + per department override | M |
| FR-TRK-10 | Uncategorised apps and domains queue for admin classification | S |
| FR-TRK-11 | Tracking exclusions list | M |
| FR-TRK-12 | Tamper signals: agent stopped, extension missing, clock changed | M |
| FR-TRK-13 | Employee sees own activity summary in the app | S |
| FR-TRK-14 | Screenshots, optional, configurable interval, blur option | L |

## 7. CRM (CRM)

| ID | Requirement | P |
|---|---|---|
| FR-CRM-01 | Lead fields: name, company, phones, emails, source, owner, pipeline, stage, value, tags, follow-up date, custom fields | M |
| FR-CRM-02 | Pipelines and stages configurable, stage type open, won, lost, metric flags | M |
| FR-CRM-03 | List view with filters, search, saved views. Board (kanban) view per pipeline | M (list), S (board) |
| FR-CRM-04 | Timeline per lead, append-only | M |
| FR-CRM-05 | Notes, attachments (max 25 MB, type allowlist) | M |
| FR-CRM-06 | Call logging per F12 | M |
| FR-CRM-07 | Appointments: date-time, title, notes, reminder | M |
| FR-CRM-08 | Follow-up reminders and "Follow-ups Today" list | M |
| FR-CRM-09 | Duplicate detection on phone and email | M |
| FR-CRM-10 | CSV import with mapping, preview, round-robin assignment | M |
| FR-CRM-11 | Reassign single and bulk | M |
| FR-CRM-12 | Lost reason required, list configurable | M |
| FR-CRM-13 | Won lead flagged as client, Clients view | M |
| FR-CRM-14 | Export CSV, permission-gated and audited | M |
| FR-CRM-15 | Custom fields (text, number, date, select) defined by admin | S |
| FR-CRM-16 | Emails exchanged with a lead address appear in its timeline | S |

## 8. Tasks (TASK)

| ID | Requirement | P |
|---|---|---|
| FR-TASK-01 | Create, assign, prioritise, due date, optional lead link | M |
| FR-TASK-02 | Status flow To do, In progress, Done, Cancelled | M |
| FR-TASK-03 | Reminders and overdue notifications | M |
| FR-TASK-04 | My Tasks view grouped by today, upcoming, overdue, done | M |
| FR-TASK-05 | Comments on tasks | S |

## 9. Targets (TGT)

| ID | Requirement | P |
|---|---|---|
| FR-TGT-01 | Metric catalog per F13 | M |
| FR-TGT-02 | Targets per employee, team, role and period | M |
| FR-TGT-03 | Real-time progress in the app and Admin Panel | M |
| FR-TGT-04 | Period snapshots and history | M |
| FR-TGT-05 | Threshold notifications | S |
| FR-TGT-06 | Leaderboard per team and metric | S |

## 10. Email (MAIL)

| ID | Requirement | P |
|---|---|---|
| FR-MAIL-01 | Connect, reconnect and disconnect Workspace mailboxes | M |
| FR-MAIL-02 | Assign mailbox to employees with per-assignment permissions | M |
| FR-MAIL-03 | Thread list, thread view, search, unread state | M |
| FR-MAIL-04 | Compose, reply, reply all, forward, drafts, attachments | M |
| FR-MAIL-05 | HTML sanitised, remote images blocked until the user allows | M |
| FR-MAIL-06 | Near real-time new mail through Pub/Sub, fallback polling | M |
| FR-MAIL-07 | Email audit log | M |
| FR-MAIL-08 | No delete, no settings, no forwarding rules, no filters exposed | M |
| FR-MAIL-09 | Signature per mailbox and per employee | S |
| FR-MAIL-10 | Mailbox health status and alert when a token is revoked | M |

## 11. Notifications (NOTIF)

| ID | Requirement | P |
|---|---|---|
| FR-NOTIF-01 | Stored notifications with read state, list and badge | M |
| FR-NOTIF-02 | WebSocket push, Windows toast in the app | M |
| FR-NOTIF-03 | Admin announcements to selected employees | S |
| FR-NOTIF-04 | Email channel for security alerts to admins | M |

## 12. Reports (RPT)

| ID | Report | Content | P |
|---|---|---|---|
| FR-RPT-01 | Attendance | Per day, month, employee, team. Late, absent, half day counts | M |
| FR-RPT-02 | Time | Working, active, idle, break, offline per employee and period | M |
| FR-RPT-03 | Applications and websites | Top apps and domains, per employee, team, company | M |
| FR-RPT-04 | Productivity | Productive, neutral, unproductive share and trend | M |
| FR-RPT-05 | CRM | Leads by stage, source, owner. Conversion, overdue follow-ups | M |
| FR-RPT-06 | Calls | Calls and connect rate per employee and period | M |
| FR-RPT-07 | Targets | Achievement per employee, team, period | M |
| FR-RPT-08 | CSV export for every report, audited | M |
| FR-RPT-09 | Scheduled reports by email | L |

## 13. Audit and security (AUD)

| ID | Requirement | P |
|---|---|---|
| FR-AUD-01 | Append-only audit log: actor, action, entity, before and after, IP, device, time | M |
| FR-AUD-02 | Logged: all admin writes, permission changes, logins, device actions, exports, viewing another person's activity detail, mail access | M |
| FR-AUD-03 | Audit log viewer with filters, export | M |
| FR-AUD-04 | Security alerts list | M |

## 14. Settings (SET)

Company profile, timezone, week start, idle threshold, long idle prompt, break types and allowance, auto-close limits, device approval mode, device limit, tracking options (titles, exclusions, exception apps), productivity categories, lost reasons, lead sources, notification defaults, retention periods, monitoring policy text and version, release channel per device.

## 15. Desktop App screens

| Screen | Content |
|---|---|
| Login | Code or email, password, device pending state |
| Consent | Policy text, accept or decline |
| Dashboard | Greeting, shift control and timer, working time, targets, tasks summary, follow-ups today, new mail count |
| My Tasks | Grouped list, detail drawer |
| CRM | Leads list, lead detail with timeline, log call, note, email, task, appointment |
| Email | Mailbox switcher, thread list, thread view, compose |
| Targets | Daily, weekly, monthly progress, history |
| Attendance | Month calendar, day detail, correction and leave requests |
| Activity | Own day summary (if enabled) |
| Notifications | List |
| Profile | Details, change password, device info, policy |
| Tray | Status, Start or End Shift, Break, Open, Quit |

A visible indicator (tray icon colour and header badge) shows when tracking is running.

## 16. Admin Panel screens

Structure follows the original proposal with the additions marked (+).

```text
Dashboard            live board, KPIs, alerts, approvals (+)
Employees            Employees, Departments, Teams (+), Roles, Permissions, Devices
CRM                  Leads, Clients, Tasks, Pipelines, Import (+), Reports
Workforce            Attendance, Schedules (+), Holidays (+), Leave and
                     Corrections (+), Time Tracking, Activity, Applications,
                     Websites, Productivity Rules (+)
Targets              Targets, Metrics, History (+), Leaderboard (+)
Email                Accounts, Assign Accounts, Permissions, Email Logs
Reports              Attendance, Time, Productivity, CRM, Calls (+), Targets
Security             Login History, Devices, Sessions, IP Logs, Audit Logs,
                     Alerts (+), Access Control
Settings             Company, Tracking, Attendance rules, Notifications,
                     Retention (+), Policy text (+), Releases (+)
```
