# 11 - Build Plan

Durations are planning estimates for a small team (1 to 2 developers) working with AI coding models. They are not commitments and should be re-estimated after Phase 1.

## 1. Phases

| Phase | Name | Estimate | Depends on |
|---|---|---|---|
| P0 | Foundation | 1 week | - |
| P1 | Identity, organisation, RBAC, devices, audit | 2 weeks | P0 |
| P2 | Desktop shell, shift, attendance | 2 weeks | P1 |
| P3 | Tracker agent, extension, activity reports | 3 weeks | P2 |
| P4 | CRM, tasks, calls | 3 weeks | P1 |
| P5 | Targets, notifications, dashboards | 1.5 weeks | P3, P4 |
| P6 | Email | 2.5 weeks | P1, P4 |
| P7 | Reports, hardening, installer, update, pilot | 2 weeks | all |
| | Total | about 17 weeks | |

P3 and P4 can run in parallel with two developers, which shortens the calendar time to about 13 weeks.

Risk-first note: build a throwaway spike of the agent (foreground app + idle + pipe + extension message) in the first week. It is the part with the most platform risk (antivirus, permissions, Session 0) and should be proven on a real employee PC early.

## 2. Phase details

### P0 - Foundation

Deliverables: monorepo, lint and format, TypeScript strict, `packages/contracts`, NestJS skeleton with health endpoint, Prisma + first migration, Docker Compose (Postgres, Redis, MinIO), CI pipeline, staging environment, error tracking, seed script (company + Super Admin), `AGENTS.md`.

Acceptance: `pnpm dev` starts everything locally. CI green. Staging reachable over HTTPS.

### P1 - Identity, organisation, RBAC, devices, audit

Deliverables: FR-AUTH-01 to 10, FR-DEV-01 to 05, FR-ORG-01 to 05, FR-RBAC-01 to 05, FR-AUD-01 to 03. Admin Panel: login with 2FA, employees, departments, teams, roles, devices, sessions, login history, audit viewer.

Acceptance:

- Flows F1, F3 (admin side), F4 pass end to end.
- Role matrix tests pass for all endpoints built so far.
- Disabled employee cannot log in. Revoked session is rejected within one request.
- Audit entries exist for every write.

### P2 - Desktop shell, shift, attendance

Deliverables: Electron app with secure defaults, login, device registration and approval (F2), consent, token storage, WebSocket, tray, dashboard skeleton, shift control (F5 without agent data), heartbeat, offline queue for shift events, schedules, holidays, attendance computation (F8), live board, corrections and leave (F9), auto-close job.

Acceptance:

- F2, F3, F5, F8, F9 pass.
- Shift survives app restart. Start, break and end work with the network cable unplugged and sync afterwards.
- Night shift 20:00 to 04:00 is attributed to one attendance date.
- Token copied to another PC cannot refresh.

### P3 - Tracker agent, extension, activity reports

Deliverables: agent, watchdog, pipe protocol, local encrypted queue, extension + native host, ingest endpoint, rollups, partitioning, productivity rules, exclusions, exception apps, tamper events, Admin Panel views (time tracking, activity drill-down, applications, websites), own activity view, long idle prompt.

Acceptance: the complete test matrix in 09 section 9 passes on Windows 10 and Windows 11 with a standard user account. In particular: 3 hours offline work and an offline PC restart both appear completely in the Admin Panel after reconnect. Drill-down matches the original example (app, domain, time ranges).

### P4 - CRM, tasks, calls

Deliverables: FR-CRM-01 to 14, FR-TASK-01 to 04, pipelines config, list and detail in the Desktop App, admin CRM pages, import job, duplicate check, call logging, appointments, follow-ups, attachments, timeline.

Acceptance: F10, F11, F12 pass. Employee cannot see or guess another employee's lead (404). Import of 10,000 rows completes with a duplicate report. Export is blocked without permission and audited with it.

### P5 - Targets, notifications, dashboards

Deliverables: metric events, targets, progress, snapshots, leaderboard, notifications store + WebSocket + toasts, employee dashboard complete, admin dashboard.

Acceptance: F13, F15 pass. Logging a connected call moves both call metrics once. Editing or resending the same call does not double count. Period rollover creates a snapshot.

### P6 - Email

Deliverables: Google setup with the client, connect flow, sync worker, watch renewal, thread list and view, sanitiser, compose, reply, forward, drafts, attachments, assignments with permissions, mail audit, lead linking, mailbox health.

Acceptance: F14 passes. An employee without `send` cannot send through any endpoint. No endpoint can delete mail. New mail appears in the app within 15 seconds. Revoking the token at Google produces an admin alert and a reconnect action. Unassigning removes access immediately.

### P7 - Reports, hardening, installer, update, pilot

Deliverables: all reports with CSV export, retention purge, backups and restore test, rate limits, security checklist (08 section 4), signed installer, auto-update with channels, mandatory update, silent install, load test, runbook, admin and employee user guides, pilot with 5 to 10 employees for 2 weeks, fixes.

Acceptance: F16, F17, F18, F19 pass. Load test with 200 simulated agents. Restore from backup proven. Pilot exit criteria: no data loss, tracker accuracy within 2 percent of a manual sample, no antivirus blocks, sign-off by the client.

## 3. Definition of done (every feature)

1. Matches the referenced FR ids and flows.
2. Zod contract in `packages/contracts`, used by server and client.
3. Permission and scope enforced on the server, with tests per role.
4. Audit entry for every write.
5. Unit tests for business rules, integration test for the endpoint.
6. Loading, empty and error states in the UI.
7. No secrets in code, no new lint or type errors.
8. Migration included and reversible in staging.
9. Documentation updated when behaviour deviates from these files.

## 4. Testing strategy

| Level | Tool | Coverage |
|---|---|---|
| Unit | Vitest (TS), xUnit (.NET) | Rules: shift state machine, attendance status, idle splitting, target periods, scope resolution |
| Integration | Vitest + Testcontainers (Postgres, Redis) | Every endpoint, role matrix, idempotency |
| Contract | Generated OpenAPI + schema tests | Client and server stay in sync |
| End to end, admin | Playwright | Main admin flows |
| End to end, desktop | Playwright for Electron | Login, shift, CRM, mail basics |
| Agent | xUnit + scripted manual matrix on real PCs | 09 section 9 |
| Load | k6 | Ingest, heartbeat, reports |
| Security | Dependency scan, ASVS checklist, external penetration test (recommended) | Before rollout |

Time-dependent logic (attendance, targets, auto-close) MUST use an injectable clock so tests can simulate days and timezones.

## 5. Rollout

1. Staging with test accounts.
2. Pilot channel: 5 to 10 employees, one team, 2 weeks. Daily check of tracker data against reality.
3. Monitoring policy communicated to all staff by the client before company-wide rollout.
4. Rollout by department. Installer deployed silently by IT.
5. Stable channel updates follow pilot by at least 3 days.

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Antivirus flags the agent | Rollout blocked | Code signing from the first pilot build, no keyboard hooks, vendor allowlisting, early spike |
| Employees have local admin rights | Tracking can be defeated | Standard user accounts through endpoint management, tamper alerts |
| Google setup delayed by client | Email phase blocked | Request the setup in P1, email is last feature phase |
| Scope growth (dialer, screenshots, payroll) | Delay | Open questions decided before P4, change requests priced separately |
| Legal objection to monitoring | Feature removal | Transparency design, policy, client legal confirmation before pilot |
| AI-generated code skips scope checks | Data leak between employees | Mandatory role-matrix tests, review checklist, guard + repository pattern |
| Clock and timezone bugs | Wrong attendance | Server time, injectable clock, night-shift tests |
| Large activity tables | Slow reports | Partitioning, rollups, retention from day one |

## 7. Items needed from the client

Answers to Q1 to Q12 (01), Google Workspace Super Admin availability for the setup in 10, code signing certificate, hosting account, list of mailboxes and assignments, shift schedules and holidays, employee list with roles, monitoring policy text approved by their adviser, pilot team.
