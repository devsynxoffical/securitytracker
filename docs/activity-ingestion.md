# Phase 7: Activity Ingestion API & Storage Documentation

## Overview & Architecture

The **DEVSYNX Activity Ingestion API** (`POST /api/v1/activity/batches`) receives application usage telemetry from desktop agents, validates incoming payloads against strict privacy boundaries, enforces idempotency to prevent duplicate telemetry on network retries, and records application sessions in the local SQLite database via Prisma.

```
Desktop Agent (Windows / macOS)
        │
        │ Machine-to-Machine Credentials
        │ (X-Device-Token & X-Device-ID)
        ▼
HTTPS REST API (POST /api/v1/activity/batches)
        │
        ├── 1. requireDeviceAuth Middleware (Verifies status, derives deviceId & userId)
        ├── 2. validateRequest(ingestBatchSchema) (Zod payload validation & privacy boundary check)
        ├── 3. Idempotency Check (ActivityBatch model lookup by batchId)
        └── 4. Prisma Atomic Transaction ($transaction)
                ├── Insert ActivityBatch (Idempotency record)
                ├── Bulk Insert Sessions (Session model)
                └── Update Device.lastSeenAt Heartbeat
        │
        ▼
Prisma ORM (Local SQLite: backend/prisma/devsynx.db)
```

---

## 1. Database Model & Schema

The activity ingestion system uses two SQLite tables defined in `backend/prisma/schema.prisma`:

### `ActivityBatch` (Idempotency & Duplicate Tracking)
```prisma
model ActivityBatch {
  id          String   @id @default(uuid())
  batchId     String   @unique
  deviceId    String
  userId      String
  sampleCount Int
  createdAt   DateTime @default(now())

  @@index([batchId])
  @@index([deviceId])
  @@index([userId])
}
```

### `Session` (Application Activity Storage)
```prisma
model Session {
  id              String   @id @default(uuid())
  deviceId        String
  device          Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  appName         String
  windowTitle     String?
  startTime       DateTime
  endTime         DateTime
  durationSeconds Int
  isIdle          Boolean  @default(false)
  createdAt       DateTime @default(now())

  @@index([userId, startTime])
  @@index([deviceId, startTime])
  @@index([appName, startTime])
  @@index([isIdle])
}
```

---

## 2. Privacy Requirements & Data Boundaries

The system strictly enforces privacy metadata collection rules.

### Allowed Metadata Fields
* `appName`: Executable/application name (e.g., `Google Chrome`, `Visual Studio Code`).
* `windowTitle`: Optional application window title.
* `startedAt`: ISO 8601 start timestamp string.
* `endedAt`: ISO 8601 end timestamp string.
* `durationSeconds`: Duration of session in seconds.
* `isIdle`: Boolean flag indicating system idle state during the session.

### Prohibited Data Types (Strictly Rejected)
* Keystrokes / Keylogging
* Screenshots & Screen Recordings
* Clipboard Contents
* Passwords / Credentials
* File / Document / Message contents

> [!IMPORTANT]
> The Zod validation schema uses `.strict()` mode. Any payload containing unrecognized or prohibited fields is rejected immediately with HTTP 400 (`VALIDATION_ERROR`).

---

## 3. Device & Employee Ownership Binding

- **No Client Spoofing**: The server **NEVER** trusts `deviceId` or `employeeId` from the client request body.
- **Server-Side Binding**: The device identity (`deviceId`) and assigned employee (`userId`) are derived exclusively from `req.authenticatedDevice` populated by `requireDeviceAuth` middleware.
- **Isolation Guarantee**: An agent authenticated as Device A can **NEVER** submit activity for Employee B.

---

## 4. Idempotency & Duplicate Batch Handling

Desktop agents retry failed uploads due to network drops or offline queues. To guarantee retry safety without creating duplicate database rows:

1. Client provides a unique `batchId` (UUID or client-generated string).
2. Server queries `ActivityBatch` by `batchId`.
3. If `batchId` exists: Server returns `{ status: 'success', data: { batchId, accepted: 0, duplicate: true } }` without modifying session tables.
4. If `batchId` is new: Server creates `ActivityBatch` and `Session` records inside a single Prisma `$transaction`.

---

## 5. Ingestion Validation Rules & Limits

* **Max Batch Size**: 100 samples per batch payload.
* **Max App Name Length**: 255 characters.
* **Max Window Title Length**: 512 characters.
* **Max Session Duration**: 86,400 seconds (24 hours).
* **Timestamp Order**: `startedAt` must be strictly prior to `endedAt`.
* **Clock Skew Tolerance**: Future timestamps beyond 300 seconds (5 minutes) are rejected.
* **Past Retention Limit**: Timestamps older than 30 days are rejected.

---

## 6. REST API Endpoint Specification

### Batch Telemetry Upload (`POST /api/v1/activity/batches`)

- **HTTP Method**: `POST`
- **Path**: `/api/v1/activity/batches`
- **Authentication**: Device Credentials (`X-Device-Token` & `X-Device-ID`, or `Authorization: Bearer <token>`)
- **Rate Limit**: `telemetryRateLimiter` (60 requests / minute)

#### Sample Request Body
```json
{
  "batchId": "BATCH-CLIENT-994812",
  "samples": [
    {
      "appName": "Visual Studio Code",
      "windowTitle": "activity.service.ts - devsynx",
      "startedAt": "2026-09-17T10:00:00Z",
      "endedAt": "2026-09-17T10:05:00Z",
      "isIdle": false
    },
    {
      "appName": "System Idle",
      "windowTitle": "",
      "startedAt": "2026-09-17T10:05:00Z",
      "endedAt": "2026-09-17T10:10:00Z",
      "isIdle": true
    }
  ]
}
```

#### Success Response (200 OK - New Batch)
```json
{
  "status": "success",
  "data": {
    "batchId": "BATCH-CLIENT-994812",
    "accepted": 2,
    "duplicate": false
  }
}
```

#### Idempotent Response (200 OK - Duplicate Retry Batch)
```json
{
  "status": "success",
  "data": {
    "batchId": "BATCH-CLIENT-994812",
    "accepted": 0,
    "duplicate": true,
    "message": "Batch has already been processed"
  }
}
```

---

## 7. Security & Error Handling

- **401 UNAUTHORIZED**: Missing, invalid, disabled, or revoked device credentials.
- **400 VALIDATION_ERROR / BAD_REQUEST**: Malformed batch, invalid timestamps, or prohibited fields.
- **Silent Logging**: Ingestion logs record high-level metadata (batch ID, device ID, sample count). Window titles and raw credentials are **NEVER** logged.
