# DEVSYNX Activity Tracker (`devsynx-activity-tracker`)

Production-grade, privacy-first employee activity tracking system developed for **DEVSYNX Private Limited**.

---

## 📌 Project Overview

`devsynx-activity-tracker` is designed to track employee application usage and idle patterns while strictly enforcing privacy boundaries. The system consists of three main components:

1. **Desktop Agent**: Background service running on employee workstations (Windows/macOS) sampling foreground applications every 5 seconds, detecting keyboard/mouse inactivity, maintaining a local SQLite queue, and batch-uploading activity sessions over HTTPS every 60 seconds.
2. **Backend Services**: Node.js & TypeScript REST API backed by Prisma ORM and a **Local SQLite database (`file:./devsynx.db`)**, managing employee profiles, work information CRM, device provisioning, session storage, reporting, role-based authorization, and audit logging.
3. **Management Dashboard**: React 18 + TypeScript + Vite web application supporting Google OAuth authentication, Employee Directory, Employee Profile views, work updates, role-based access control, high-level and granular activity analytics, daily/weekly aggregate visualizations, idle time monitoring, device management, and CSV reporting exports.

---

## 🏗️ Architecture Overview

```
devsynx-activity-tracker/
├── docs/                 # Architectural specifications, API contracts, CRM, & security design
├── backend/              # Node.js + TypeScript Express REST API (Port 4000, Local SQLite)
├── dashboard/            # React + TypeScript + Vite Dashboard SPA (Port 5173)
├── agent/                # Desktop background agent project (Go / Python)
├── README.md             # Project documentation index
└── .gitignore            # Git ignore rules
```

---

## ⚙️ Prerequisites

- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **Database**: Zero external setup required (uses embedded Local SQLite `devsynx.db` file)

---

## 🚀 How to Start Local Development

### 1. Environment Setup

#### Backend Setup:
```bash
cd backend
cp .env.example .env
npm install
npm run db:generate
```

#### Dashboard Setup:
```bash
cd dashboard
cp .env.example .env
npm install
```

---

### 2. How to Start Backend

From the `/backend` directory:
```bash
# Run backend in development mode (with hot reloading)
npm run dev
```
The backend API starts at `http://localhost:4000`.

- Liveness check: `GET http://localhost:4000/health` -> `{"status": "ok"}`
- Readiness & DB check: `GET http://localhost:4000/ready` -> `{"status": "ready", "database": "connected"}`

To run backend tests:
```bash
npm test
```

---

### 3. How to Start Dashboard

From the `/dashboard` directory:
```bash
# Run dashboard in development mode
npm run dev
```
The dashboard application starts at `http://localhost:5173`.

---

## 🔒 Privacy Core Principles

Privacy is engineered into the architecture by design. The system explicitly prohibits collection of:
- Keystrokes or input logging
- Screenshots automatically
- Passwords or credentials
- Clipboard contents
- Local file content or system files
- Web browser page contents / DOM / URLs

---

## 📊 Phase Status

**Phase 5: Employee CRM / Profile & Work Information Module** (Completed ✅)
- [x] Prisma schema extended with `Skill`, `EmployeeSkill`, `Project`, `ProjectMember`, `WorkUpdate`, and `Attachment` models targeting SQLite.
- [x] Local storage service abstraction implemented (`backend/storage/employee-attachments/`).
- [x] Field-level self-service vs admin authorization enforced on profile endpoints.
- [x] Manager direct-report reporting boundary enforced on employee profile lookups.
- [x] React Employee Directory page (`/employees`) and Profile page (`/employees/:id`) built with Overview, Skills, Projects, Work Updates, Activity, and Devices tabs.
- [x] Work update creation, skills management, and self-service edit forms added.
- [x] Automated Vitest test suite (`backend/tests/employee.test.ts`) passing 100%.
