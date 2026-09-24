# Phase 6: Device Management & Device Authentication Documentation

## Overview & Architecture

The **DEVSYNX Activity Tracker** Device Management system provisions, authenticates, and enforces security boundaries for desktop workstations running the DEVSYNX Desktop Agent.

```
Desktop Agent (Windows / macOS)
        │
        │ Machine-to-Machine Credentials
        │ (X-Device-Token & X-Device-ID)
        ▼
HTTPS REST API (Node.js + Express)
        │
        │ SHA-256 Hash Verification
        ▼
Prisma ORM (Local SQLite: backend/prisma/devsynx.db)
```

---

## 1. Database Model & Schema

The device entity is defined in Prisma schema (`backend/prisma/schema.prisma`) using SQLite:

```prisma
model Device {
  id              String      @id @default(uuid())
  userId          String
  hostname        String
  osType          String      // "WINDOWS" | "MACOS"
  osVersion       String?
  agentVersion    String?
  deviceTokenHash String
  status          String      @default("ACTIVE") // "ACTIVE" | "DISABLED" | "REVOKED"
  isRevoked       Boolean     @default(false)
  lastSeenAt      DateTime?
  revokedAt       DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([status])
  @@index([deviceTokenHash])
}
```

---

## 2. Device ↔ Employee Relationship

* **One Device to One Employee**: Each registered device belongs to a specific employee (`userId`).
* **Multiple Devices per Employee**: An employee (e.g. Ali) may have multiple assigned workstations (e.g., a Windows Desktop and a MacBook).
* **Isolation**: Employees can only view their own assigned workstations. Only authorized Admins can assign or reassign devices.

---

## 3. Credential Security Architecture

To prevent token leakage and maintain zero-trust security:

1. **Cryptographic Secret Generation**:
   Credentials are generated on the server using Node.js `crypto.randomBytes(32)`, yielding 256-bit entropy formatted as `devsynx_dev_<hex>`.
2. **One-Time Provisioning**:
   The plaintext raw secret credential is returned **EXACTLY ONCE** in the API response during device registration or credential rotation.
3. **SHA-256 Storage**:
   The server computes `crypto.createHash('sha256').update(rawToken).digest('hex')` and stores **ONLY** the hash (`deviceTokenHash`) in SQLite. Plaintext credentials are **NEVER** stored in database tables, logs, error responses, or dashboard GET APIs.
4. **Prisma Projection Filtering**:
   All GET queries use `safeDeviceSelect` projection to explicitly omit `deviceTokenHash`.

---

## 4. Device Lifecycle States

* **`ACTIVE`**: The device is operational. Desktop agent can authenticate and ping `/api/v1/devices/ping`.
* **`DISABLED`**: Temporarily suspended by an Administrator. Desktop agent requests are rejected with HTTP 401 (`DEVICE_DISABLED`). Can be re-enabled later.
* **`REVOKED`**: Permanently invalidated credential. `revokedAt` timestamp set. Agent requests rejected with HTTP 401 (`DEVICE_REVOKED`).

---

## 5. Device Authentication Middleware (`requireDeviceAuth`)

The machine-to-machine authentication middleware protects agent-facing endpoints:

* **Headers**:
  * `X-Device-ID`: UUID of the registered device.
  * `X-Device-Token` (or `Authorization: Bearer <secret>`): Raw 256-bit secret token.
* **Validation Steps**:
  1. Hashes incoming token via SHA-256.
  2. Resolves device record by `id`.
  3. Verifies `deviceTokenHash === computedHash`.
  4. Checks `status !== 'DISABLED'` and `status !== 'REVOKED'`.
  5. Updates `device.lastSeenAt` timestamp asynchronously.
  6. Attaches `req.authenticatedDevice` and `req.authenticatedEmployee` context to the request.

---

## 6. REST API Specification (`/api/v1/devices`)

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/devices` | `requireUserAuth` | List devices (Admins see all; Managers see direct reports; Employees see own) |
| `GET` | `/api/v1/devices/:id` | `requireUserAuth` | Fetch details of a single device |
| `POST` | `/api/v1/devices` | `ADMIN`, `SUPER_ADMIN` | Register new device & return raw secret credential ONCE |
| `PATCH` | `/api/v1/devices/:id` | `ADMIN`, `SUPER_ADMIN` | Update hostname, OS version, or employee assignment |
| `POST` | `/api/v1/devices/:id/disable` | `ADMIN`, `SUPER_ADMIN` | Disable device authentication |
| `POST` | `/api/v1/devices/:id/enable` | `ADMIN`, `SUPER_ADMIN` | Re-enable device authentication |
| `POST` | `/api/v1/devices/:id/revoke` | `ADMIN`, `SUPER_ADMIN` | Permanently revoke device credential |
| `POST` | `/api/v1/devices/:id/rotate-credential` | `ADMIN`, `SUPER_ADMIN` | Rotate credential, invalidate old key & return new secret ONCE |
| `GET` | `/api/v1/devices/ping` | `requireDeviceAuth` | Agent heartbeat & credential validation endpoint |

---

## 7. Audit Trail & Logging

Administrative lifecycle actions record audit logs in SQLite (`AuditLog` table):

* `DEVICE_REGISTERED`
* `DEVICE_UPDATED`
* `DEVICE_DISABLED`
* `DEVICE_ENABLED`
* `DEVICE_REVOKED`
* `DEVICE_CREDENTIAL_ROTATED`

Raw credentials and `Authorization` headers are **STRICTLY EXCLUDED** from audit details.

---

## 8. Future Desktop Agent Compatibility (Phase 7+)

In future activity collection phases, activity ingestion endpoints such as:

```
POST /api/v1/activity/batches
```

will mount `requireDeviceAuth` middleware to inspect `req.authenticatedDevice` and `req.authenticatedEmployee` without requiring user passwords or interactive login.
