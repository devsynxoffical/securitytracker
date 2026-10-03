# 01 - Overview, Design Review and Scope

## 1. System summary

Company OS has five deliverable components.

| # | Component | Users | Purpose |
|---|---|---|---|
| 1 | Admin Web Panel | Super Admin, Admin, Manager, Team Leader | Manage employees, devices, CRM, targets, mailboxes, attendance, reports, security |
| 2 | Central Backend (API) | All clients | Authentication, business logic, data, Gmail integration, jobs, audit |
| 3 | Employee Desktop App (Windows) | Employee | Dashboard, CRM, tasks, email, targets, attendance, shift control |
| 4 | Tracker Agent + Watchdog Service (Windows) | None (background) | Measures apps, websites, active and idle time during a shift |
| 5 | Browser Extension (Chrome, Edge) | None (background) | Reports the active website domain to the agent |

```text
+---------------------+        HTTPS         +---------------------------+
|   ADMIN WEB PANEL   | -------------------> |      CENTRAL BACKEND      |
|   (browser)         | <--- WebSocket ----- |  API, Auth, Jobs, Audit   |
+---------------------+                      +-------------+-------------+
                                                           |
                              +----------------------------+-----------+
                              |               |            |           |
                         PostgreSQL         Redis     Object Store   Gmail API
                                                                    (Google)
                                                           ^
                                   HTTPS + WebSocket       |
+----------------------------------------------------------+-----------+
|                      EMPLOYEE WINDOWS PC                             |
|                                                                      |
|  +----------------+  named pipe  +---------------+  native  +------+ |
|  |  DESKTOP APP   | <----------> | TRACKER AGENT | <------> | EXT. | |
|  |  (UI, network) |              | (user session)| messaging|      | |
|  +----------------+              +-------+-------+          +------+ |
|                                          ^                           |
|                                  +-------+--------+                  |
|                                  | WATCHDOG SVC   |                  |
|                                  +----------------+                  |
+----------------------------------------------------------------------+
```

## 2. Review of the original design

The original concept is sound: one platform, employees never receive Google passwords, the admin controls everything. The items below were wrong, undefined or missing. Each one is fixed in this document set.

### 2.1 Corrections (things that would not work as written)

| # | Problem in original | Why it fails | Fix | Where |
|---|---|---|---|---|
| C1 | Tracker built as a "Native Windows Service" only | Windows services run in Session 0 and cannot see the user's foreground window or keyboard and mouse input | Tracking runs in a user-session agent process. A small service acts only as watchdog and updater | 09 |
| C2 | "Browser Websites" tracking with no mechanism | A native process cannot reliably read the URL of the active tab | Force-installed browser extension reports the active domain to the agent through native messaging. Fallback is app-level time only | 09 |
| C3 | Gmail through "OAuth / Google APIs" with per-permission toggles | Gmail API scopes are coarse. "Read yes, delete no" cannot be granted by Google per employee | Backend is the only Gmail client. Permissions are enforced by the backend, endpoint by endpoint. Connection method defined (per-mailbox OAuth, internal app) | 10 |
| C4 | Targets for "Calls" and "Connected Calls" | No data source for calls exists in the design | Call logging module in CRM. All target metrics are computed from recorded events, never typed in by hand | 03 F12, F13 |
| C5 | Idle time = no keyboard or mouse | Employees on phone calls or meetings produce no input and would be recorded as idle | Activity exceptions: listed call and meeting apps in foreground, or microphone in use, count as active | 09 |
| C6 | Attendance shows Late and Absent | No shift schedule exists to compare against | Shift schedules, grace period, holidays, leave, weekly off days | 03 F8 |
| C7 | Fixed 5-level role ladder | Real permission needs do not follow a strict ladder (for example a Team Leader who may reassign leads but not see tracking) | Permission keys with data scopes. The five roles are default bundles and remain editable | 05 |
| C8 | Three languages (Flutter, C#, Python or Node) | Larger surface, no shared types, harder for AI-assisted development | TypeScript everywhere (backend, admin, desktop UI) plus C# only for the agent | 02 |

### 2.2 Gaps (things not addressed)

| # | Gap | Fix | Where |
|---|---|---|---|
| G1 | Device authorization had no process | Device registration with admin approval, device key pair, revoke | 03 F2, F17 |
| G2 | No offline behaviour | Offline-first tracker: keeps working with no internet, local encrypted queue, automatic sync and backfill in the Admin Panel on reconnect | 03 F7 |
| G3 | No handling for forgotten End Shift, crash, sleep, lock, clock change | Shift state machine with heartbeat and auto-close rules | 03 F5 |
| G4 | Time taken from the employee PC | Server time is authoritative. Durations use a monotonic clock | 03 F5, 08 |
| G5 | Offboarding did not cover owned data | Mandatory reassignment of leads, tasks and follow-ups before disable completes | 03 F16 |
| G6 | Shared mailbox with no attribution | Email audit log: which employee read, sent or replied from which mailbox | 10 |
| G7 | Raw activity events at unlimited volume | Agent uploads segments, server keeps daily rollups, raw data has a retention period | 06, 09 |
| G8 | No transparency or consent for monitoring | Consent screen, visible tracking indicator, tracking only during a shift, monitoring policy text | 08 |
| G9 | No installer signing or auto-update | Signed installer and binaries, staged auto-update | 03 F18, 09 |
| G10 | Admin Panel security unspecified | Mandatory TOTP 2FA for all admin panel roles, IP allowlist option, session controls | 08 |
| G11 | Employees could bulk-export leads | Export is a separate permission, off for employees, all exports audited | 05 |
| G12 | "Creates Company" implies multi-tenant, undefined | Single deployment for this client, schema is tenant-ready (company_id on all rows) | 02 D7 |
| G13 | No lead import or duplicate handling | CSV import with duplicate detection on normalized phone and email | 04 |
| G14 | No productivity classification | App and website categories (productive, neutral, unproductive) per department | 04 |
| G15 | No attendance correction or leave | Correction requests with approval, basic leave requests | 03 F9 |
| G16 | No backup, monitoring, environments | Defined in architecture and security | 02, 08 |
| G17 | Password reset undefined | Admin-initiated reset with forced change, lockout policy | 03 F4 |
| G18 | Night shifts crossing midnight | Attendance date bound to scheduled shift start, not calendar midnight | 03 F8 |

## 3. Scope

### 3.1 In scope, version 1.0

1. Authentication: employee ID or company email + password, device registration and approval, sessions, lockout, admin 2FA.
2. Organisation: company, departments, teams, employees, roles, permissions.
3. Shift and attendance: start, break, resume, end, schedules, holidays, late and absent rules, corrections, basic leave.
4. Activity tracking: active and idle time, applications, website domains, keyboard and mouse counts (counts only), lock and unlock, offline gaps.
5. CRM: leads, pipeline stages, notes, call logs, appointments, follow-ups, attachments, timeline, CSV import, duplicate detection, reassignment.
6. Tasks: assign, priority, deadline, status, link to lead.
7. Targets: daily, weekly, monthly, per employee or team, automatic progress.
8. Email: connect Google Workspace mailboxes, assign to employees with permissions, read, send, reply, draft, attachments, audit log.
9. Notifications: in-app real time and Windows toast.
10. Reports: attendance, time, applications, websites, productivity, CRM, targets, with CSV export.
11. Security: audit log, login history, device and session management, RBAC.
12. Desktop delivery: signed installer, auto-update.

### 3.2 Version 1.1 (after pilot)

- Optional screenshots (off by default, see 08).
- Scheduled email reports to managers.
- Google sign-in (SSO) as an alternative login for employees who own a Workspace account.
- Firefox extension.
- PDF export of reports.

### 3.3 Out of scope

- Keystroke content recording, clipboard capture, webcam, screen recording video. Not built.
- Payroll and salary calculation.
- Built-in telephony or dialer. Calls are logged, not placed, by the system (see Q2).
- macOS and Linux desktop app (see Q6).
- Mobile apps.
- Google Calendar, Drive and Chat integration.
- Website blocking. The system measures, it does not block.

## 4. Assumptions

| # | Assumption |
|---|---|
| A1 | One client company, up to about 200 employees, Windows 10 and 11 PCs |
| A2 | The client owns a Google Workspace domain and the client's Super Admin will perform the one-time Google-side setup steps |
| A3 | Employees do not have local administrator rights on their PCs (strongly recommended, otherwise tamper resistance is limited) |
| A4 | Employees work fixed or rotating shifts that can be described as schedules, including night shifts |
| A5 | Employees are informed about monitoring in writing before rollout (client responsibility, see 08) |
| A6 | Chrome or Edge is the standard browser on employee PCs |
| A7 | The client provides or pays for a code signing certificate and hosting |

## 5. Open questions for the client

Development can start without these answers. The default in the last column is built unless the client decides otherwise.

| # | Question | Why it matters | Default if unanswered |
|---|---|---|---|
| Q1 | Does the built-in CRM replace the tools seen in the example (GoHighLevel, Lofty) or run next to them? | If they stay, leads and calls live elsewhere and targets need an integration instead of manual logging | Built-in CRM is the system of record. No integration in 1.0 |
| Q2 | Which phone system or dialer do employees use for calls? | Automatic call counts need an integration with that system | Manual call logging in the CRM with outcome and duration |
| Q3 | How many mailboxes and are they shared (sales@) or personal (name@)? | Decides mailbox connection method and assignment UI | Fewer than 20, mostly shared, per-mailbox OAuth |
| Q4 | Where are employees located and which law applies to monitoring? | Consent and retention requirements differ by country | Consent screen, written policy, 90 days raw retention |
| Q5 | Are screenshots required? | Storage cost, privacy impact | Not in 1.0 |
| Q6 | Any macOS users? | Separate agent implementation | Windows only |
| Q7 | Shift patterns: fixed hours, rotating, night shifts, weekly off days? | Attendance rules | Configurable schedules, one default schedule Monday to Friday |
| Q8 | Are breaks paid, and is there a daily break allowance? | Working time calculation | Breaks are unpaid and excluded from working time, allowance 60 minutes, excess flagged |
| Q9 | Who approves new devices: any Admin or only Super Admin? | Security flow | Any role holding the `devices.approve` permission |
| Q10 | Should employees see their own tracked data (apps and websites)? | Transparency, trust | Yes, own data visible in the app |
| Q11 | Hosting preference and data location (region)? | Compliance, latency | Single cloud VPS setup in a region near the employees |
| Q12 | Will this be resold to other companies later? | True multi-tenancy, billing, Google app verification | No. Tenant-ready schema only |
