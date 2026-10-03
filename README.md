# Company OS

**Company OS** is an enterprise-grade, unified platform for Employee Management, Attendance, Activity Tracking, and Google Workspace CRM built to specifications across `docs/` and [AGENTS.md](AGENTS.md).

---

## Workspace Structure

```
securitytracker/
├── AGENTS.md                                # Project Hard Rules & Commit Conventions
├── package.json                             # Monorepo root (pnpm + Turborepo)
├── pnpm-workspace.yaml                      # Workspaces configuration
├── turbo.json                               # Build cache & pipeline orchestration
├── infra/
│   └── docker-compose.yml                   # Postgres 16, Redis 7, MinIO
├── packages/
│   ├── contracts/                           # Single source of truth (Zod DTOs, enums, errors, events, reports)
│   └── config/                              # Shared TSConfig & linting rules
├── apps/
│   ├── api/                                 # NestJS + Prisma + Socket.IO Backend
│   ├── admin/                               # Next.js 15 (App Router) + Tailwind Admin Control Center
│   └── desktop/                             # Electron (electron-vite) + React Workstation Client
├── extension/                               # Chrome/Edge Manifest V3 Domain Reporter
└── agent/
    ├── CompanyOS.Agent/                     # .NET 8 User Session Background Agent
    ├── CompanyOS.Watchdog/                  # .NET 8 Session 0 Windows Service
    └── CompanyOS.Shared/                    # Shared C# IPC Models
```

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v22 LTS
- **pnpm**: v12+
- **Docker & Docker Compose**: For PostgreSQL 16, Redis 7, and MinIO
- **.NET 8 SDK** (optional, for building Windows Agent binaries)

---

### 2. Infrastructure Setup (Docker)

Start the backing database, cache, and object storage:

```bash
docker compose -f infra/docker-compose.yml up -d
```

---

### 3. Install Dependencies & Build

```bash
# Install workspace dependencies
pnpm install

# Build all packages (contracts, api, admin, desktop)
pnpm build
```

---

### 4. Database Setup & Seeding

```bash
# Generate Prisma Client
pnpm --filter @company-os/api prisma:generate

# Run Migrations
pnpm --filter @company-os/api prisma:migrate

# Seed database with baseline Company, Roles, Schedules, and Super Admin
pnpm --filter @company-os/api prisma:seed
```

---

### 5. Running the Application

Run the complete stack in development mode:

```bash
# Start all apps simultaneously (API on :4000, Admin on :3000, Desktop Electron app)
pnpm dev
```

Or run individual apps:

```bash
# Central Backend (NestJS on http://localhost:4000/api/v1)
pnpm --filter @company-os/api dev

# Admin Web Control Center (Next.js on http://localhost:3000)
pnpm --filter @company-os/admin dev

# Desktop Workstation Client (Electron)
pnpm --filter @company-os/desktop dev
```

---

## Testing & Quality Verification

```bash
# Run unit & integration test suites
pnpm test

# Run TypeScript strict typecheck across all packages
pnpm typecheck

# Format codebase
pnpm format
```

---

## Security & Privacy Highlights

- **Zero Keystroke/Clipboard Capture**: Counts only (`keyCount`, `mouseCount`); zero keyboard hooks.
- **Privacy Domain-Level Tracking**: URLs stripped of paths and query parameters by the Manifest V3 browser extension.
- **Isolated Mailbox Proxy**: Backend is the exclusive Gmail API client; refresh tokens stored with AES-256-GCM encryption; employees never receive Google credentials.
- **Multitenancy & Scope Filtering**: Every endpoint enforces `@RequirePermission` and dynamic `ScopeFilter` (`own`, `team`, `department`, `all`).
- **Immutable Audit Trail**: All state-modifying operations are written to `audit_logs` and `mail_audit`.
