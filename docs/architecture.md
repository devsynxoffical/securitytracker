# System Architecture: DEVSYNX Activity Tracker

**Status**: Phase 3 Complete Backend Architecture & Foundations Baseline

---

## 1. Confirmed Stack & Architecture

- **Backend**: Node.js + TypeScript REST API (`Express.js`)
- **Database Engine**: Local SQLite 3 File (`backend/prisma/devsynx.db`) via Prisma ORM
- **Dashboard**: React 18 + TypeScript + Vite Single Page Application
- **Desktop Agent**: Python or Go background agent (Pending Phase 4+ implementation)

---

## 2. Backend Layer Separation & Flow

```
HTTP Request
     │
     ▼
[ Security & Middleware Layer ]  (helmet, cors, rate-limiter, logger, validator)
     │
     ▼
[ Route Layer ]                  (/api/v1/..., /health, /ready)
     │
     ▼
[ Controller Layer ]             (Handles HTTP request parsing & response formatting)
     │
     ▼
[ Service Layer ]                (Executes business logic, rules, and aggregates)
     │
     ▼
[ Prisma ORM ]                   (Singleton client instance in lib/prisma.ts)
     │
     ▼
[ SQLite Database File ]         (backend/prisma/devsynx.db)
```

### Layer Responsibilities:
- **Routes (`/routes`, `/modules/*/index.ts`)**: Defines endpoint paths and maps HTTP verbs to controllers.
- **Controllers**: Validates request inputs via Zod, invokes services, and sends standardized JSON responses. Business logic is strictly kept out of controllers.
- **Services**: Encapsulates core application logic, session processing, aggregation rules, and audit logging.
- **Prisma Client (`lib/prisma.ts`)**: Manages database queries, transactions, and connection lifecycle with graceful shutdown.

---

## 3. Directory & Module Specifications

```
backend/
├── src/
│   ├── config/             # Environment validation & app configuration (env.ts)
│   ├── lib/                # Database singletons & client instances (prisma.ts)
│   ├── middleware/         # Security headers, auth, validation, rate limiting, logging, error handler
│   ├── modules/            # Domain-driven business modules
│   │   ├── users/          # Employee profiles & user management
│   │   ├── devices/        # Workstation registry & auth provisioning
│   │   ├── sessions/       # Granular activity & idle session retrieval
│   │   ├── activity/       # Desktop agent telemetry batch ingestion
│   │   ├── reports/        # Analytical charts & CSV export generator
│   │   └── audit/          # Administrative audit trail logs
│   ├── routes/             # Route aggregators (v1.routes.ts, health.routes.ts, ready.routes.ts)
│   ├── utils/              # Custom utilities (api-error.ts)
│   ├── app.ts              # Express application assembly
│   └── server.ts           # HTTP server listener & graceful shutdown
├── prisma/
│   ├── schema.prisma       # Prisma schema (SQLite provider)
│   ├── devsynx.db          # Active SQLite database file
│   └── migrations/         # Prisma migration history
├── tests/
│   ├── foundation.test.ts  # Endpoint, validation, and error tests
│   └── health.test.ts      # Liveness & readiness tests
├── .env.example            # Environment template
├── package.json            # Node.js dependencies & scripts
├── tsconfig.json           # Strict TypeScript configuration
└── README.md               # Backend documentation & quickstart
```
