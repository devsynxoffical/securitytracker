# 18 - Flow Verification Matrix

How every flow in this documentation set is proven to work. Evidence columns: **Unit** (vitest, `apps/api/test/*.spec.ts`), **API e2e** (`apps/api/test/e2e/*.mjs` against a running API and seeded database), **UI e2e** (Playwright click-through, `apps/admin/qa/`), **Manual** (needs an environment this repository cannot provide). A flow is "verified" only when the stated evidence runs green on the current commit.

Re-run everything: `pnpm test` (unit), `pnpm --filter @company-os/api test:e2e` (API), `pnpm --filter @company-os/admin qa` (UI), CI runs unit, build and migration drift on every push.

## 1. Platform and identity

| Flow | What it covers | Unit | API e2e | UI e2e | Manual |
|---|---|---|---|---|---|
| F1 Setup | `GET /setup/status`, `POST /setup/bootstrap` creates company, system roles, Super Admin and module defaults; refused once any employee exists | setup.service.spec (3) | auth-mail (status, bootstrap guard) | sign-up wizard | - |
| F2 First login, device registration, consent | Desktop login with device key pair, pending approval, consent | auth.service.spec (3: pending device, bad password, bad signature) | - | - | Desktop app on Windows |
| F3 Login, session, logout | Admin login with mandatory TOTP, enrol, verify, session cookie, logout | auth.service.spec | crm (2FA enrol, confirm, verify, single call) | login + 2FA boxes | - |
| F4 Password reset and lockout | Lockout after 5 failures; forgot and reset with single-use 30 minute token revoking sessions | auth.service.spec (lockout) | auth-mail (forgot, reset, single use) | forgot and reset forms | Mailer (none shipped) |
| FR-AUTH-04 Device signature | Login proves device key; desktop refresh bound to approved device | auth.service.spec | - | - | Desktop app |
| FR-AUTH-08 Sessions | List and revoke sessions per employee, scope-filtered | security.sessions.spec (6) | modules (sessions list) | security sessions page | - |
| F16 Offboarding | Disable with reassignment preview | employees.service (existing) | - | profile disable modal | - |
| F17 Lost device | Revoke device, wipe on next contact | devices.service | modules (devices list) | devices page | Desktop app |
| Roles and permissions | Matrix edit, R1 to R5 guards, scope resolution own/team/department/all | rbac.guard.spec, crm-objects (allowed and denied per scope), hr.service.spec, tracking-admin.spec, tasks.service.spec | every suite runs as Super Admin; scope denial covered in unit tests | roles page | - |
| Audit log | Every write audited through the interceptor; exports audited | - | crm (audit entries present) | audit page with before/after | - |
| Settings | Company settings get and patch with allowlist | settings.service.spec (3) | modules | settings page | - |

## 2. CRM (13)

| Flow | Unit | API e2e | UI e2e |
|---|---|---|---|
| F10 Lead lifecycle: create with duplicate check, assign, notes, calls, appointments, stage moves, won/lost | crm.service.spec | crm (lead create, convert, frozen) | leads list, board drag, record page |
| F12 Call logging and metrics | crm.service.spec | crm | log call from record |
| F21 Lead conversion to contact, account, deal with history copy, single conversion | crm-objects.spec (3) | crm (convert, second refused, deal amount from lead) | convert dialog |
| F22 Deal lifecycle: stage rules, lost reason, won marks account customer, reopen permission, board totals | crm-objects.spec (5) | crm (lost without reason, won, account customer, board) | deal board, mark won |
| Accounts and contacts: scope through related owners, duplicates, bulk, tags | crm-objects.spec (6) | crm (duplicates, bulk tag, tag filter) | lists, record pages, bulk bar |
| Activities and agenda | crm-objects.spec (2) | crm (planned task, agenda, done, timeline) | activities page, record timeline |
| F23 CSV import with mapping, duplicates, round robin | crm-objects.spec (CSV parse) | crm (upload, suggested mapping, start, totals, idempotent start) | import stepper |
| Export, search, dashboard, saved views, custom fields, pipelines and stages | crm-objects.spec (custom fields) | crm (export, search, dashboard, views, reorder) | export download, palette search, dashboard, settings |

## 3. Tasks (14)

| Flow | Unit | API e2e | UI e2e |
|---|---|---|---|
| F24 Task lifecycle: spaces, lists with default statuses, tasks with assignees, status groups, completed_at and metric once, subtask depth, comments with mentions, checklists, time entries, activities, archive, bulk | tasks.service.spec (15) | modules (space, list, task, subtask depth, status, comment, checklist, time, done, my, board, workload, activities, bulk, legacy route) | spaces page list/board/table, drawer, calendar drag |

## 4. People and attendance (15)

| Flow | Unit | API e2e | UI e2e |
|---|---|---|---|
| F8 Attendance computation | attendance.service.spec | modules (sheet json and csv) | attendance sheet |
| F9 Corrections and leave approval | attendance.service.spec, hr.service.spec | modules (corrections list, leave approve) | corrections, leave requests |
| F25 Leave with balances: working days, overlap, balance check, approve/reject/cancel transitions | hr.service.spec (15) | modules (request, overlap, approve, used days) | leave tabs, request modal |
| F26 Onboarding and offboarding checklists | hr.service.spec | modules (templates, start, item done) | onboarding page, profile tab |
| Profiles, documents, announcements, org chart, schedules, holidays, directory export | hr.service.spec | modules | directory, profile record, announcements, org chart, schedules |

## 5. Tracking (16)

| Flow | Unit | API e2e | UI e2e |
|---|---|---|---|
| F6 Segment ingest and rollups | tracking.service.spec | - | - (needs agent) |
| F7 Offline queue and backfill | - | - | Desktop app (manual) |
| F27 Manual time with overlap and approval into attendance | tracking-admin.spec | modules (pending, overlap, approve) | timesheets approvals |
| Timesheets, team activity, usage, uncategorised and categorise, rules, idle, tamper, settings | tracking-admin.spec (13) | modules | tracking pages |
| Agent behaviour (09 section 9 matrix) | CompanyOS.Agent.Tests (40 xUnit, not yet compiled) | - | - | Windows 10 and 11 |

## 6. Mail (10, 17)

| Flow | Unit | API e2e | UI e2e |
|---|---|---|---|
| F14 Connect mailbox, sync, send (Gmail) | mail-sync.spec (12), mail.service.spec | auth-mail (demo refusals, health) | Mailboxes connect button | Google Cloud project and credentials |
| F28 Triage: views and counts, assign, status and snooze, labels, comments with mentions, events, CRM link, templates | mail-collab.spec (10) | auth-mail (assign, filter, comment, label, snooze validation, close, reopen, events, template render, contact threads) | inbox three-pane, assignments drawer |
| Mailbox assignments with per-permission toggles | mail.service.spec | crm (assign route in earlier suite) | assignments drawer |

## 7. Background jobs (02 section 6)

| Job | Unit | API e2e |
|---|---|---|
| shift-heartbeat-check, attendance-close, activity-rollup, followup-reminder, hr-leave-rebalance, hr-document-expiry, mail-unsnooze, gmail-watch-renew, gmail-sync, retention-purge, partition-maintenance, target-progress | jobs.spec (11) | auth-mail (status, manual run) |

Known inert jobs, visible on `/jobs/status`: `partition-maintenance` (segments table is not partitioned in Prisma), `target-progress` snapshots (no `target_progress` table in the schema). Both are documented limitations, not placeholders.

## 8. Not verifiable in this repository

| Item | Needs |
|---|---|
| Windows agent, watchdog, extension end to end | Windows 10/11 machine with .NET 8, signing certificate |
| Desktop app runtime (Electron launch, tray, pipe to agent) | Windows machine; `electron-vite build` and `tsc` pass here |
| Real Gmail sync and send | Google Cloud project per 10 section 3 |
| Password reset email delivery | A mailer (none shipped; dev link is returned outside production) |
| Object storage uploads | S3-compatible bucket; endpoints return 503 until configured |
