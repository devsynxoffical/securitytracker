# 02 - Architecture

## 1. Technology decisions

| ID | Decision | Choice | Reason |
|---|---|---|---|
| D1 | Backend | Node.js 22 LTS, NestJS, TypeScript | Structured modules, guards for RBAC, good fit for AI-assisted work, shared types with clients |
| D2 | Database | PostgreSQL 16, Prisma ORM, raw SQL for partitioned activity tables | Relational data, partitioning, reliable |
| D3 | Cache, queues, pub/sub | Redis 7, BullMQ | Jobs (Gmail sync, rollups, auto-close), WebSocket fan-out, rate limits |
| D4 | Admin Panel | Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui, TanStack Query | Standard, fast to build |
| D5 | Desktop App UI | Electron + React + TypeScript (electron-vite, electron-builder) | Same language and UI components as the Admin Panel, native HTML email rendering, mature auto-update |
| D6 | Tracker Agent and Watchdog | C# on .NET 8, self-contained build | Direct Win32 access, small footprint, no runtime install |
| D7 | Tenancy | Single deployment, every table carries `company_id` | Ready for more companies later without a rewrite |
| D8 | Realtime | WebSocket (Socket.IO gateway in NestJS, Redis adapter) | Notifications, force logout, live dashboards |
| D9 | File storage | S3-compatible object storage, private bucket, presigned URLs | Attachments, optional screenshots, installers |
| D10 | Validation and contracts | Zod schemas in a shared package, OpenAPI generated from the backend | One source of truth for request and response shapes |

Note on Flutter: the original proposal used Flutter for the desktop UI. Flutter desktop is workable, but it adds a third language, cannot share components with the Admin Panel and needs an embedded WebView to render HTML email. If Flutter is still preferred, only `apps/desktop` changes. The backend, the agent and all contracts stay as specified.

## 2. Logical architecture

```text
                        +----------------------------------+
   Admin Panel  ------> |  Reverse proxy (TLS, rate limit) |
   Desktop App  ------> |  Caddy or Nginx                  |
   Gmail Pub/Sub -----> +----------------+-----------------+
                                         |
                        +----------------v-----------------+
                        |        NestJS API (stateless)    |
                        |  auth  org  rbac  devices        |
                        |  shifts  attendance  tracking    |
                        |  crm  tasks  calls  targets      |
                        |  mail  notifications  reports    |
                        |  audit  settings  releases       |
                        +---+----------+----------+--------+
                            |          |          |
                    +-------v--+  +----v----+  +--v-----------+
                    | Postgres |  |  Redis  |  | Object store |
                    +----------+  +----+----+  +--------------+
                                       |
                        +--------------v-------------------+
                        |   Worker process (BullMQ)        |
                        |   gmail-sync, rollups,           |
                        |   shift-autoclose, attendance,   |
                        |   targets, notifications,        |
                        |   retention-purge, reports       |
                        +----------------------------------+
```

The API and the worker are the same codebase started in two modes. Both are stateless and can be scaled horizontally.

## 3. Desktop architecture

```text
+------------------------------- Windows user session -------------------+
|                                                                        |
|  Electron main process                                                 |
|   - holds tokens (encrypted with safeStorage / DPAPI)                  |
|   - only component that talks to the server                            |
|   - pulls segments from the agent and uploads them                     |
|   - tray icon, toasts, auto-update                                     |
|        ^                         |                                     |
|        | contextBridge (IPC)     | named pipe (ACL: current user)      |
|        v                         v                                     |
|  Electron renderer          Tracker Agent (.NET)                       |
|   - React UI                 - foreground app, input counts, idle      |
|   - no Node access           - lock, sleep, session events             |
|                              - local SQLite queue (encrypted)          |
|                              - native messaging host for the extension |
|                                         ^                              |
|                                         | native messaging (stdio)     |
|                              Browser extension (Chrome, Edge)          |
+------------------------------------------------------------------------+
+------------------------------- Session 0 ------------------------------+
|  Watchdog Service (.NET, LocalSystem)                                  |
|   - starts the agent in the user session at logon, restarts if killed  |
|   - verifies binary signatures, applies agent updates                  |
+------------------------------------------------------------------------+
```

Rules:

1. Only the Electron main process holds credentials and calls the server. The agent has no network access of its own.
2. The agent tracks only while a shift is in state WORKING. It is told to start and stop by the app over the pipe.
3. If the app crashes during a shift, the agent keeps tracking into its local queue. The watchdog relaunches the app in the tray and the shift resumes (F5). The agent stops on its own only when the maximum shift length is reached.
4. Closing the app window minimises to tray while a shift is open. Quit while on shift asks: End shift, or keep running.

## 4. Repository layout

One monorepo (pnpm workspaces + Turborepo) plus the .NET solution.

```text
company-os/
  apps/
    api/            NestJS backend and worker
    admin/          Next.js Admin Panel
    desktop/        Electron app (main, preload, renderer)
  packages/
    contracts/      Zod schemas, DTO types, permission keys, enums, WS events
    ui/             Shared React components
    config/         eslint, tsconfig, tailwind presets
  agent/
    CompanyOS.Agent/        user-session tracker
    CompanyOS.Watchdog/     Windows service
    CompanyOS.Shared/       pipe protocol, models
    CompanyOS.Agent.Tests/
  extension/        Browser extension (Manifest V3)
  installer/        electron-builder config, NSIS scripts, policy templates
  infra/            docker-compose, Caddyfile, backup scripts
  docs/             this documentation
  AGENTS.md         rules for AI coding models (see 12)
```

## 5. Deployment

| Item | Specification |
|---|---|
| Environments | local (docker compose), staging, production |
| Runtime | Docker containers: proxy, api, worker, postgres, redis. Object storage external (AWS S3, Cloudflare R2 or MinIO) |
| Minimum production size | 4 vCPU, 8 GB RAM, 160 GB SSD for up to 200 employees. Database on a managed service is preferred |
| TLS | TLS 1.2+ only, HSTS, certificates by Let's Encrypt or cloud provider |
| Domains | `api.<domain>`, `admin.<domain>`, `updates.<domain>` |
| CI/CD | GitHub Actions: lint, typecheck, unit tests, build, migrations check, deploy to staging on main, manual promotion to production |
| Migrations | Prisma migrations, forward only, run before the new API version starts |
| Secrets | Environment variables injected from a secret manager. Never in the repository |
| Backups | Postgres: continuous WAL archiving or daily full backup plus point-in-time recovery, 30 days. Restore test monthly |
| Monitoring | Health endpoints, structured JSON logs, error tracking (Sentry), uptime check, queue depth alert, disk alert |

## 6. Background jobs

| Job | Trigger | Function |
|---|---|---|
| shift-heartbeat-check | Every minute | Marks offline gaps, auto-closes stale shifts (F5) |
| activity-rollup | On each ingest batch + nightly reconcile | Updates daily rollups per employee, app, domain |
| attendance-close | Per schedule, after shift end + buffer | Computes attendance status per employee and date (F8) |
| target-progress | On each metric event + period end | Updates progress, writes period snapshot (F13) |
| gmail-sync | Pub/Sub push + fallback every 2 minutes | Incremental mailbox sync (F14) |
| gmail-watch-renew | Daily | Renews Gmail watch for every connected mailbox |
| followup-reminder | Every minute | Sends due follow-up and task reminders |
| retention-purge | Nightly | Deletes data past its retention period (08) |
| partition-maintenance | Monthly | Creates next activity partitions, drops expired ones |

All jobs are idempotent and safe to retry.

## 7. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | API p95 response under 300 ms for standard reads, under 1 s for reports on rollups |
| NFR-02 | Activity ingest handles 200 concurrent agents sending a batch per minute without backlog |
| NFR-03 | Agent CPU under 1 percent average, memory under 80 MB, no visible input lag |
| NFR-04 | Desktop App cold start under 5 s on a standard office PC |
| NFR-05 | Tracking never stops when the internet is down. No activity data loss for offline periods up to 30 days. Automatic backfill on reconnect |
| NFR-06 | Availability target 99.5 percent monthly. The app keeps working offline for shift and tracking |
| NFR-07 | All times stored as `timestamptz` in UTC. Company timezone set in settings. Week start configurable |
| NFR-08 | Server time is authoritative. Client clock offset is measured at login and on every heartbeat |
| NFR-09 | Every list endpoint is paginated. No unbounded queries |
| NFR-10 | Admin Panel works on current Chrome, Edge, Firefox. Desktop App supports Windows 10 21H2+ and Windows 11, x64 |
| NFR-11 | UI language English. Strings kept in resource files for later translation |
