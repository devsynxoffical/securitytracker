# API Specification: DEVSYNX Activity Tracker

**Status**: Phase 5 Verified REST API Specification  
**Base URL**: `https://api.tracker.devsynx.com`  
**API Version Prefix**: `/api/v1`

---

## 1. Overview & Architectural Principles

- **Versioned Business Namespace**: All domain business endpoints use `/api/v1/...`.
- **System Monitoring**: Liveness (`GET /health`) and Readiness (`GET /ready`) checks operate unversioned at root level.
- **Consistent Response Format**: All non-2xx responses return a standardized JSON error structure:
  ```json
  {
    "error": {
      "code": "ERROR_CODE_NAME",
      "message": "Human-readable description of error",
      "details": null
    }
  }
  ```

---

## 2. Authentication Endpoints

* `POST /api/v1/auth/google`: Exchanges Google OAuth ID token for backend JWT session.
* `GET /api/v1/auth/me`: Returns current authenticated user profile.
* `POST /api/v1/auth/logout`: Clears authentication session.

---

## 3. Employee CRM & Profile Endpoints

### 3.1 List Employee Directory (`GET /api/v1/users`)
* **HTTP Method**: `GET`
* **Path**: `/api/v1/users`
* **Auth**: User Authentication (`Bearer JWT`)
* **Query Parameters**: `search` (name/email/title), `department`, `status`
* **Success Response (200 OK)**: Returns list of employee cards with manager and skills.

### 3.2 Get Employee Profile (`GET /api/v1/users/:id`)
* **HTTP Method**: `GET`
* **Path**: `/api/v1/users/:id`
* **Auth**: User Authentication (`Bearer JWT`)
* **Access Rules**: Employee can view self, Manager can view direct reports, Admin can view all.

### 3.3 Self-Service Profile Update (`PATCH /api/v1/users/:id`)
* **HTTP Method**: `PATCH`
* **Path**: `/api/v1/users/:id`
* **Auth**: User Authentication (`Bearer JWT`)
* **Editable Fields**: `avatarUrl`, `bio`, `responsibilities`, `currentFocus`, `workLinksJson`

### 3.4 Admin Organizational Update (`PATCH /api/v1/users/:id/admin`)
* **HTTP Method**: `PATCH`
* **Path**: `/api/v1/users/:id/admin`
* **Auth**: Admin Authorization (`requireRoles(['ADMIN', 'SUPER_ADMIN'])`)
* **Editable Fields**: `employeeId`, `jobTitle`, `department`, `managerId`, `status`, `role`, `joiningDate`

### 3.5 Manage Skills
* `POST /api/v1/users/:id/skills`: Body `{ name, proficiency }`. Adds skill to profile.
* `DELETE /api/v1/users/:id/skills/:skillId`: Removes skill from profile.

### 3.6 Work Updates
* `POST /api/v1/users/:id/updates`: Body `{ title, description, projectId? }`. Posts a work update.
* `DELETE /api/v1/users/:id/updates/:updateId`: Deletes a work update.

---

---

## 4. Device Management & Authentication Endpoints

### 4.1 List Workstation Inventory (`GET /api/v1/devices`)
* **HTTP Method**: `GET`
* **Path**: `/api/v1/devices`
* **Auth**: User Authentication (`Bearer JWT`)
* **Query Parameters**: `search` (hostname/employee), `status` (`ACTIVE`/`DISABLED`/`REVOKED`), `userId`
* **Access Rules**: Admin sees all devices, Manager sees direct reports' devices, Employee sees own.
* **Security Projection**: `deviceTokenHash` is **STRICTLY EXCLUDED** from response.

### 4.2 Get Device Details (`GET /api/v1/devices/:id`)
* **HTTP Method**: `GET`
* **Path**: `/api/v1/devices/:id`
* **Auth**: User Authentication (`Bearer JWT`)

### 4.3 Register Hardware Workstation (`POST /api/v1/devices`)
* **HTTP Method**: `POST`
* **Path**: `/api/v1/devices`
* **Auth**: Admin Authorization (`requireRoles(['ADMIN', 'SUPER_ADMIN'])`)
* **Request Body**: `{ userId: UUID, hostname: string, osType: "WINDOWS" | "MACOS", osVersion?: string }`
* **Success Response (201 Created)**: Returns device record and 256-bit `rawCredential` secret **ONCE**.

### 4.4 Update Device Assignment (`PATCH /api/v1/devices/:id`)
* **HTTP Method**: `PATCH`
* **Path**: `/api/v1/devices/:id`
* **Auth**: Admin Authorization (`requireRoles(['ADMIN', 'SUPER_ADMIN'])`)

### 4.5 Disable Device (`POST /api/v1/devices/:id/disable`)
* **HTTP Method**: `POST`
* **Path**: `/api/v1/devices/:id/disable`
* **Auth**: Admin Authorization (`requireRoles(['ADMIN', 'SUPER_ADMIN'])`)
* **Effect**: Sets status to `DISABLED`. Blocks agent authentication.

### 4.6 Enable Device (`POST /api/v1/devices/:id/enable`)
* **HTTP Method**: `POST`
* **Path**: `/api/v1/devices/:id/enable`
* **Auth**: Admin Authorization (`requireRoles(['ADMIN', 'SUPER_ADMIN'])`)

### 4.7 Revoke Device (`POST /api/v1/devices/:id/revoke`)
* **HTTP Method**: `POST`
* **Path**: `/api/v1/devices/:id/revoke`
* **Auth**: Admin Authorization (`requireRoles(['ADMIN', 'SUPER_ADMIN'])`)
* **Effect**: Sets status to `REVOKED` and records `revokedAt`. Permanently blocks agent authentication.

### 4.8 Rotate Device Credential (`POST /api/v1/devices/:id/rotate-credential`)
* **HTTP Method**: `POST`
* **Path**: `/api/v1/devices/:id/rotate-credential`
* **Auth**: Admin Authorization (`requireRoles(['ADMIN', 'SUPER_ADMIN'])`)
* **Success Response (200 OK)**: Invalidates old credential hash, generates new SHA-256 hash, and returns new `rawCredential` secret **ONCE**.

### 4.9 Desktop Agent Ping / Credential Check (`GET /api/v1/devices/ping`)
* **HTTP Method**: `GET`
* **Path**: `/api/v1/devices/ping`
* **Auth Requirement**: Device Authentication (`X-Device-Token` & `X-Device-ID`, or `Authorization: Bearer <secret>`)
* **Success Response (200 OK)**: Returns `{ deviceId, hostname, employeeId, employeeEmail }` and updates `lastSeenAt` heartbeat timestamp.

---

## 5. Device Activity Ingestion Endpoint

### 5.1 Device Batch Upload (`POST /api/v1/activity/batches`)
* **HTTP Method**: `POST`
* **Path**: `/api/v1/activity/batches`
* **Auth Requirement**: Device Credentials (`X-Device-Token` & `X-Device-ID`, or `Authorization: Bearer <token>`)
* **Rate Limiter**: `telemetryRateLimiter` (60 requests / minute)
* **Request Body Schema**:
  ```json
  {
    "batchId": "BATCH-CLIENT-UUID-1234",
    "samples": [
      {
        "appName": "Visual Studio Code",
        "windowTitle": "activity.service.ts - devsynx",
        "startedAt": "2026-09-17T10:00:00Z",
        "endedAt": "2026-09-17T10:05:00Z",
        "isIdle": false
      }
    ]
  }
  ```
* **Success Response (200 OK - New Batch)**:
  ```json
  {
    "status": "success",
    "data": {
      "batchId": "BATCH-CLIENT-UUID-1234",
      "accepted": 1,
      "duplicate": false
    }
  }
  ```
* **Idempotent Response (200 OK - Duplicate Retry Batch)**:
  ```json
  {
    "status": "success",
    "data": {
      "batchId": "BATCH-CLIENT-UUID-1234",
      "accepted": 0,
      "duplicate": true,
      "message": "Batch has already been processed"
    }
  }
  ```
* **Privacy & Validation Rules**:
  - `deviceId` and `employeeId` are derived exclusively from device authentication middleware.
  - Prohibited fields (keystrokes, screenshots, clipboard) cause immediate validation failure (`400 VALIDATION_ERROR`).
---

## 6. Activity Reporting & Analytics Endpoints (Phase 10)

### 6.1 Get Activity Summary (`GET /api/v1/activity/summary`)
* **HTTP Method**: `GET`
* **Path**: `/api/v1/activity/summary`
* **Auth**: User Authentication (`Bearer JWT`)
* **Query Parameters**: `employeeId`, `deviceId`, `startDate`, `endDate`, `appName`, `isIdle`
* **Access Rules**: Admin sees all, Manager sees direct reports & self, Employee sees self only.
* **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "data": {
      "activeSeconds": 8100,
      "idleSeconds": 900,
      "totalTrackedSeconds": 9000,
      "sessionCount": 42
    }
  }
  ```

### 6.2 Get Application Usage Breakdown (`GET /api/v1/activity/applications`)
* **HTTP Method**: `GET`
* **Path**: `/api/v1/activity/applications`
* **Auth**: User Authentication (`Bearer JWT`)
* **Query Parameters**: `employeeId`, `deviceId`, `startDate`, `endDate`, `appName`, `isIdle`
* **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "data": [
      {
        "appName": "Google Chrome",
        "activeSeconds": 5400,
        "idleSeconds": 0,
        "sessionCount": 12
      }
    ]
  }
  ```

### 6.3 Get Daily Activity Trend (`GET /api/v1/activity/daily`)
* **HTTP Method**: `GET`
* **Path**: `/api/v1/activity/daily`
* **Auth**: User Authentication (`Bearer JWT`)
* **Query Parameters**: `employeeId`, `deviceId`, `startDate`, `endDate`, `appName`, `isIdle`
* **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "data": [
      {
        "date": "2026-09-18",
        "activeSeconds": 25200,
        "idleSeconds": 3600,
        "totalTrackedSeconds": 28800
      }
    ]
  }
  ```

### 6.4 Get Paginated Activity Sessions (`GET /api/v1/activity/sessions` or `GET /api/v1/activity`)
* **HTTP Method**: `GET`
* **Path**: `/api/v1/activity/sessions`
* **Auth**: User Authentication (`Bearer JWT`)
* **Query Parameters**: `employeeId`, `deviceId`, `startDate`, `endDate`, `appName`, `isIdle`, `page`, `limit` (max 100)
* **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": "SESSION-UUID-1234",
        "deviceId": "DEVICE-UUID",
        "userId": "USER-UUID",
        "appName": "Visual Studio Code",
        "windowTitle": "main.ts - VSCode",
        "startTime": "2026-09-18T09:00:00Z",
        "endTime": "2026-09-18T10:00:00Z",
        "durationSeconds": 3600,
        "isIdle": false,
        "device": { "hostname": "WIN-WORKSTATION-01", "osType": "WINDOWS" },
        "user": { "fullName": "Jane Doe", "email": "jane@devsynx.com" }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 125,
      "totalPages": 3
    }
  }
  ```

### 6.5 Export Activity CSV Report (`GET /api/v1/activity/export`)
* **HTTP Method**: `GET`
* **Path**: `/api/v1/activity/export`
* **Auth**: User Authentication (`Bearer JWT`)
* **Content-Type**: `text/csv`
* **Content-Disposition**: `attachment; filename="activity_report.csv"`



