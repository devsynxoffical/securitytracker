# Phase 10 — DEVSYNX Activity Dashboard & Analytics Documentation

## 1. Overview & Architecture

The **Phase 10 Activity Dashboard & Analytics Module** provides authorized managers, system administrators, and employees with read-only visibility into application activity and workstation time tracking.

```text
React Dashboard (/activity & Employee Profile)
       ↓ HTTPS (Bearer JWT Authentication)
Express Backend REST API (/api/v1/activity/*)
       ↓ Prisma ORM
Local SQLite Database (backend/prisma/devsynx.db)
```

---

## 2. API Endpoints Reference

All activity reporting endpoints are protected by `requireUserAuth` middleware and require a valid Bearer JWT.

| HTTP Method | Route | Description | Query Parameters |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/activity/summary` | High-level metrics (`activeSeconds`, `idleSeconds`, `totalTrackedSeconds`, `sessionCount`) | `employeeId`, `deviceId`, `startDate`, `endDate`, `appName`, `isIdle` |
| `GET` | `/api/v1/activity/applications` | Aggregated application usage list sorted by active duration | `employeeId`, `deviceId`, `startDate`, `endDate`, `appName`, `isIdle` |
| `GET` | `/api/v1/activity/daily` | Daily trend breakdown (`date`, `activeSeconds`, `idleSeconds`, `totalTrackedSeconds`) | `employeeId`, `deviceId`, `startDate`, `endDate`, `appName`, `isIdle` |
| `GET` | `/api/v1/activity/sessions` | Paginated list of activity sessions with device & user details | `employeeId`, `deviceId`, `startDate`, `endDate`, `appName`, `isIdle`, `page`, `limit` |
| `GET` | `/api/v1/activity/export` | Download CSV activity report | `employeeId`, `deviceId`, `startDate`, `endDate`, `appName`, `isIdle` |

---

## 3. Server-Side Role-Based Authorization Scoping

Authorization is strictly enforced on the backend:
- **`ADMIN` / `SUPER_ADMIN`**: Can query activity for all employees or filter by specific employees.
- **`MANAGER`**: Can query activity for themselves and their direct reports (`user.managerId === req.user.id`). Querying unauthorized employees returns `HTTP 403 Forbidden`.
- **`EMPLOYEE`**: Restricted strictly to querying their own activity (`userId === req.user.id`). Manually overriding query parameters returns `HTTP 403 Forbidden`.

---

## 4. Timezone & Date Strategy

- **Internal Storage**: All session timestamps are stored in UTC ISO 8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`).
- **Date Range Filters**: `startDate` parses as `00:00:00.000Z` and `endDate` parses as `23:59:59.999Z` to prevent off-by-one day discrepancies across timezones.
- **Dashboard Display**: Timestamps are formatted locally in the browser using standard JS `toLocaleTimeString()` and `formatDuration()`.

---

## 5. Privacy Boundaries & Compliance

- **No Productivity Scores**: The system tracks application active time, idle time, and sessions neutrally. No performance rankings or productivity scores are computed.
- **Privacy Enforcement**: Zero collection or exposure of keyloggers, screenshots, clipboards, browser URLs/history, passwords, webcam, or microphone.

---

## 6. CSV Export

The `GET /api/v1/activity/export` endpoint outputs downloadable CSV streams adhering to the user's RBAC scope with headers:
`Employee,Email,Date,Device,Application,Window Title,Start Time,End Time,Duration (Seconds),Type`
