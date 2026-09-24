# Database Specification: DEVSYNX Activity Tracker

**Status**: Phase 2 Verified Complete Database Specification  
**Database Engine**: SQLite 3 (`backend/prisma/devsynx.db`) via Prisma ORM

---

## 1. Database Technology Selection

The backend data storage uses **SQLite 3** managed via **Prisma ORM** (`backend/prisma/schema.prisma`).

### Why SQLite is Being Used:
- **Zero-Dependency Infrastructure**: Stores the entire relational database in a single local server file (`devsynx.db`). Eliminates external database daemon setup, network configuration, and complex cluster management.
- **Embedded Performance**: Executes in-process within the Node.js backend environment, providing sub-millisecond read latency for local activity lookups.
- **Simplified Deployment & Backups**: Backing up the database consists of creating a snapshot copy of the single `devsynx.db` file or issuing a standard SQLite online backup command.
- **ACID Compliance**: Full transactional guarantees for agent batch ingestions and administrative operations.

---

## 2. Core Entities Overview

The database schema defines 5 functional entities plus 1 system check model:

1. **`User`**: Represents employee profiles, manager hierarchy, and administrative roles.
2. **`Device`**: Represents employee workstations running the Desktop Agent. Stores cryptographically hashed device authentication tokens.
3. **`Session`**: Represents a consolidated block of application activity or a segregated idle period.
4. **`DailyAggregate`**: Pre-aggregated daily activity totals per employee and per application for rapid dashboard chart queries.
5. **`AuditLog`**: Stores administrative and security event logs for accountability.
6. **`HealthCheck`**: System diagnostic baseline table.

---

## 3. Data Relationships Diagram

```
                       +-------------------+
                       |       User        | <---+ (Manager Self-Reference)
                       +-------------------+     |
                         |     |        |  +-----+
                         |     |        |
        +----------------+     |        +----------------+
        | (1..N)               | (1..N)                  | (1..N)
        v                      v                         v
+---------------+     +------------------+     +-------------------+
|    Device     |     | DailyAggregate   |     |    AuditLog       |
+---------------+     +------------------+     +-------------------+
        |
        | (1..N)
        v
+---------------+
|    Session    |
+---------------+
```

### Self-Referencing Manager Relationship:
- `User.managerId` references `User.id`.
- An employee can have at most one Manager (`User.manager`).
- A Manager can have multiple direct report employees (`User.directReports`).
- Delete behavior: `onDelete: SetNull` ensures removing a manager user preserves employee records while resetting `managerId` to `null`.

---

## 4. Complete Field & Model Specifications

### 4.1 `User` Model
```prisma
model User {
  id              String           @id @default(uuid())
  email           String           @unique
  fullName        String
  department      String?
  role            String           @default("EMPLOYEE")
  isActive        Boolean          @default(true)

  managerId       String?
  manager         User?            @relation("UserManager", fields: [managerId], references: [id], onDelete: SetNull)
  directReports   User[]           @relation("UserManager")

  devices         Device[]
  sessions        Session[]
  dailyAggregates DailyAggregate[]
  auditLogs       AuditLog[]

  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  @@index([managerId])
  @@index([department])
}
```

### 4.2 `Device` Model
```prisma
model Device {
  id              String           @id @default(uuid())
  userId          String
  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  hostname        String
  osType          String           // "WINDOWS" or "MACOS"
  osVersion       String?
  agentVersion    String?

  deviceTokenHash String           @unique // Cryptographic hash of device token

  isRevoked       Boolean          @default(false)
  lastSeenAt      DateTime?

  sessions        Session[]

  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  @@index([userId])
  @@index([isRevoked])
}
```

### 4.3 `Session` Model
```prisma
model Session {
  id              String           @id @default(uuid())
  deviceId        String
  device          Device           @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  userId          String
  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  appName         String
  windowTitle     String?          // OPTIONAL requirement requiring client confirmation

  startTime       DateTime
  endTime         DateTime
  durationSeconds Int

  isIdle          Boolean          @default(false)

  createdAt       DateTime         @default(now())

  @@index([userId, startTime])
  @@index([deviceId, startTime])
  @@index([appName, startTime])
  @@index([isIdle])
}
```

### 4.4 `DailyAggregate` Model
```prisma
model DailyAggregate {
  id                 String        @id @default(uuid())
  userId             String
  user               User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  date               String        // Format: YYYY-MM-DD
  totalActiveSeconds Int           @default(0)
  totalIdleSeconds   Int           @default(0)
  topAppsJson        String?       // Pre-computed top apps JSON summary

  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  @@unique([userId, date])
  @@index([date])
}
```

### 4.5 `AuditLog` Model
```prisma
model AuditLog {
  id           String              @id @default(uuid())
  actorUserId  String?
  actorUser    User?               @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  action       String              // e.g. "USER_CREATED", "DEVICE_REGISTERED", "DEVICE_REVOKED"
  targetEntity String?             // e.g. "device:123e4567..."
  ipAddress    String?
  detailsJson  String?             // Sanitized JSON details

  createdAt    DateTime            @default(now())

  @@index([actorUserId, createdAt])
  @@index([action])
}
```

---

## 5. Indexing Strategy & Rationale

- `User(managerId)`: Speeds up queries fetching all direct reports for a manager.
- `User(department)`: Fast department-wide filter queries on the dashboard.
- `Device(userId)`: Fast retrieval of all registered hardware for a given employee.
- `Device(isRevoked)`: Allows quick authentication filtering for active device payloads.
- `Session(userId, startTime)`: Optimizes per-employee time range queries (e.g. daily/weekly timelines).
- `Session(deviceId, startTime)`: Optimizes per-device activity investigations.
- `Session(appName, startTime)`: Speeds up system-wide application usage distribution reports.
- `Session(isIdle)`: Enables fast filtering between active work sessions and segregated idle time blocks.
- `DailyAggregate(userId, date)` **(UNIQUE)**: Enforces single aggregate record per user per day and provides instant chart fetching.
- `AuditLog(actorUserId, createdAt)`: Speeds up security audit trail reports per administrator.

---

## 6. Privacy & Security Architecture

1. **Zero Raw Token Storage**: The server never stores plain-text device tokens. Provisioning generates a random 256-bit token; only its SHA-256 hash is saved in `Device.deviceTokenHash`.
2. **Optional Window Title**: `Session.windowTitle` is strictly optional (`String?`). If window title collection is not confirmed by the client, the field defaults to `null`.
3. **Prohibited Collection Safeguard**: Schema enforces storage of process metadata (`appName`, duration, timestamp, `isIdle`) only. No keystrokes, screenshots, or DOM content can be represented in this schema.
4. **Sanitized Audit Trails**: `AuditLog.detailsJson` prohibits recording passwords, auth tokens, or private payload details.

---

## 7. SQLite Operational Considerations

- **Write Concurrency & WAL Mode**: Enable **Write-Ahead Logging (WAL mode)** (`PRAGMA journal_mode=WAL;`) on the SQLite file to allow simultaneous read operations while batch ingestion transactions execute.
- **File Permissions**: The `devsynx.db` database file must be restricted to system backend execution privileges (`rw-------` / `600` file permissions) to prevent unauthorized local file access.
- **Data Retention & Pruning**: High-frequency raw `Session` records older than 90 days can be pruned safely because historical trends are preserved in `DailyAggregate`.
- **Backup & Recovery Strategy**: Implement a automated daily cron script taking a backup copy of `devsynx.db` using SQLite `.backup` command or filesystem copy when low traffic occurs.
- **Migration Approach**: Use `npx prisma migrate dev` in local development and `npx prisma migrate deploy` in production environments.
