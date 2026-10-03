# Company OS - Development Documentation

Employee Management + Security + CRM Platform

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 2026-10-03 |
| Prepared by | DEVSYNX Private Limited |
| Status | Ready for development, pending the open questions in file 01 |
| Working title | Company OS (rename freely) |

## 1. What this is

One platform with which a company controls identity, CRM, company email access, attendance, targets, activity tracking, devices and security from a single Admin Panel. Employees receive only a Windows desktop application and log in with company-issued credentials.

## 2. Document set

| File | Content | Read when |
|---|---|---|
| 00-README.md | Index, conventions, glossary | First |
| 01-overview-and-scope.md | System summary, review of the original design with fixes, scope, assumptions, open questions | First |
| 02-architecture.md | Components, tech stack, repo layout, deployment, non-functional requirements | Before any code |
| 03-flows.md | Every end-to-end flow with states, rules and edge cases | Before each feature |
| 04-modules-spec.md | Functional requirements per module with IDs, screen lists | During each feature |
| 05-roles-permissions.md | Permission keys, scopes, default role matrix | Auth and every endpoint |
| 06-data-model.md | Database tables, columns, indexes, retention | Backend work |
| 07-api-spec.md | REST and WebSocket contracts | Backend and clients |
| 08-security-privacy.md | Auth design, device binding, hardening, monitoring transparency, retention | Throughout |
| 09-tracker-agent-spec.md | Windows tracker agent, watchdog service, browser extension | Tracker work |
| 10-google-workspace-email.md | Gmail integration design and setup | Email module |
| 11-build-plan.md | Phases, deliverables, acceptance criteria, testing, risks | Planning |
| 12-ai-build-guide.md | How to drive AI coding models with these documents, rules file, prompt templates | Every AI session |

## 3. Conventions

- Requirement IDs look like `FR-AUTH-03`. Reference them in commits, tickets and AI prompts.
- MUST = mandatory for release. SHOULD = expected unless there is a documented reason. MAY = optional.
- Flow IDs look like `F5`. Decision IDs look like `D3`. Open questions look like `Q4`.
- All timestamps are stored in UTC. Display uses the company timezone unless stated.
- "Server" always means the central backend. "App" means the desktop application. "Agent" means the tracker agent process.

## 4. Glossary

| Term | Meaning |
|---|---|
| Admin Panel | Web application for Super Admin, Admin, Manager and Team Leader |
| Desktop App | Windows application used by employees (UI) |
| Tracker Agent | Background process in the employee's Windows session that measures activity |
| Watchdog Service | Windows service that keeps the agent alive and applies updates |
| Shift | One continuous working session of an employee, from Start Shift to End Shift |
| Segment | One continuous period of a single activity (one app or one website) inside a shift |
| Active time | Shift time with keyboard or mouse input, or covered by an activity exception (call, meeting) |
| Idle time | Shift time without input beyond the idle threshold |
| Rollup | Pre-aggregated daily totals per employee, app and domain |
| Mailbox | A Google Workspace mailbox connected to the platform (for example sales@company.com) |
| Scope (permission) | The data range a permission applies to: own, team, department, all |
| Attendance date | The calendar date a shift belongs to, defined by the scheduled shift start |
