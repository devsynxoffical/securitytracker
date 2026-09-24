# DEVSYNX Activity Tracker - Backend Service

Node.js + TypeScript REST API service for DEVSYNX Activity Tracker.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Generate Prisma Client
```bash
npm run db:generate
```

### 4. Run Development Server
```bash
npm run dev
```

The API will run at `http://localhost:4000`.

- **Liveness Check**: `GET http://localhost:4000/health`
- **Readiness Check**: `GET http://localhost:4000/ready`
- **API Version 1 Namespace**: `http://localhost:4000/api/v1`

### 5. Run Tests
```bash
npm test
```

### 6. Production Build
```bash
npm run build
npm start
```

---

## 📁 Layered Architecture

- `src/config/`: Zod environment variable loader & startup validator (`env.ts`)
- `src/lib/`: Prisma client singleton & database disconnect handlers (`prisma.ts`)
- `src/middleware/`: Security headers (`helmet`), CORS, Zod validation, rate limiting, request logging, and error handling
- `src/modules/`: Domain modules (`users`, `devices`, `sessions`, `activity`, `reports`, `audit`)
- `src/routes/`: Route aggregators (`v1.routes.ts`, `health.routes.ts`, `ready.routes.ts`)
- `src/utils/`: Custom error utilities (`api-error.ts`)
- `src/app.ts`: Express application assembly
- `src/server.ts`: Server startup entry point & graceful shutdown
