# Architectural Decision Records (ADR)

This document records the architectural and technology decisions that have been **explicitly confirmed** for `devsynx-activity-tracker`.

---

## ADR-001: Backend Framework and Language
* **Status**: Confirmed
* **Decision**: Use **Node.js** with **TypeScript** for the backend API services.
* **Rationale**: Strong ecosystem for REST API development, type safety for complex data models, excellent performance for I/O-intensive telemetry ingestion, and seamless maintenance across team members.

---

## ADR-002: Primary Storage Engine (Local SQLite File)
* **Status**: Confirmed
* **Decision**: Use a **Local SQLite database file (`devsynx.db`)** via Prisma ORM for backend server data storage.
* **Rationale**: Eliminates external database server overhead, allows complete local server data persistence in a single file (`backend/prisma/devsynx.db`), simplifies local installation, and provides zero-config deployment.

---

## ADR-003: Dashboard Framework and Authentication Strategy
* **Status**: Confirmed
* **Decision**: Build the management dashboard using **React** with **Google OAuth (SSO)** authentication.
* **Rationale**: React offers a modular UI architecture suitable for rich analytical charts and tables. Google OAuth aligns with enterprise SSO requirements without storing sensitive user password hashes locally.

---

## ADR-004: Desktop Agent Sampling and Idle Rules
* **Status**: Confirmed
* **Decision**:
  * Foreground application sampling frequency: **5 seconds**.
  * Idle threshold: **3 minutes (180 seconds)** of zero keyboard/mouse events.
  * Idle duration reported separately from active application usage sessions.
  * Batch upload payload window: **60 seconds**.
* **Rationale**: A 5-second sampling interval provides granular activity resolution while remaining lightweight on CPU resources. 3-minute idle marking ensures accurate distinction between active work and away-from-desk time.

---

## ADR-005: Offline Resilience via Local SQLite Queue
* **Status**: Confirmed
* **Decision**: Embed a lightweight **SQLite** database into the Desktop Agent to act as an offline queue for session telemetry.
* **Rationale**: Guarantees zero data loss when employee machines disconnect from corporate networks or experience internet outages. Payloads are queued locally and flushed via exponential backoff retries when HTTPS connectivity returns.

---

## ADR-006: Device Authentication Mechanism & Token Storage
* **Status**: Confirmed
* **Decision**: Desktop agents authenticate all HTTPS batch upload requests using a device-specific token. The backend database stores only a **SHA-256 hash** (`Device.deviceTokenHash`) of the token, never the raw plain-text secret.
* **Rationale**: Prevents credential leakage even if database backups are compromised.

---

## ADR-007: Privacy & Collection Boundaries
* **Status**: Confirmed
* **Decision**: Strict privacy enforcement: **NO** keystroke logging, **NO** screenshots, **NO** passwords, **NO** clipboard monitoring, **NO** file content reading, and **NO** browser DOM/page content scraping. Primary data collected is limited strictly to Application Name and Duration.
* **Rationale**: Complies with privacy laws, builds employee trust, and mitigates legal liabilities for DEVSYNX Private Limited.

---

## ADR-008: Core Data Entities Schema
* **Status**: Confirmed (Phase 2)
* **Decision**: Database schema implemented in Prisma with 5 core functional models: `User`, `Device`, `Session`, `DailyAggregate`, `AuditLog`, plus system `HealthCheck`.
* **Rationale**: Comprehensive relational representation supporting employee hierarchy, hashed device authentication, active vs. idle session segregation, analytical aggregation, and security logging.
