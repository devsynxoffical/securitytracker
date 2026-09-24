# Requirements Specification: DEVSYNX Activity Tracker

**Client**: DEVSYNX Private Limited  
**Project Name**: `devsynx-activity-tracker`  
**Status**: Initial Requirements Analysis (Phase 0)

---

## 1. Confirmed Requirements

### 1.1 Desktop Agent Requirements (DA)
- **[DA-01] Operating System Support**: Must run as a background service on Windows and macOS.
- **[DA-02] Sampling Frequency**: Samples the active foreground application every **5 seconds**.
- **[DA-03] Application Change Detection**: Detects when the employee switches foreground applications.
- **[DA-04] Session Merging**: Merges consecutive 5-second samples of the same active application into continuous activity sessions.
- **[DA-05] Inactivity Detection**: Tracks global keyboard and mouse input events to determine user activity/inactivity.
- **[DA-06] Idle Marking**: Automatically marks the employee state as **idle** after **3 consecutive minutes** without keyboard or mouse input.
- **[DA-07] Idle Segregation**: Idle time must be calculated and reported separately from active application usage sessions.
- **[DA-08] Batch Uploading**: Aggregates activity session records and uploads them to the backend API every **60 seconds** over HTTPS.
- **[DA-09] Offline Persistence**: Uses a local **SQLite** database queue to store activity records locally when network connectivity is lost.
- **[DA-10] Retry Mechanism**: Automatically retries failed payload uploads with exponential backoff / retry logic upon network restoration.
- **[DA-11] Device Authentication**: Authenticates every payload request using a unique device-specific credential/token.

### 1.2 Backend API Requirements (BE)
- **[BE-01] Tech Stack**: Built using **Node.js** with **TypeScript**.
- **[BE-02] Storage Engine**: Uses **PostgreSQL** relational database.
- **[BE-03] API Protocol**: Exposes a standard **REST API** for agents and dashboard clients.
- **[BE-04] Batch Ingestion**: Ingests activity and idle batch uploads securely from desktop agents.
- **[BE-05] Device Authentication**: Validates device credentials/tokens before accepting telemetry payloads.
- **[BE-06] Entity Management**: Stores and manages `users`, `devices`, `sessions`, and `daily_aggregates`.
- **[BE-07] Reporting API**: Exposes query endpoints for historical employee activity, idle duration, and application usage.
- **[BE-08] Dashboard API**: Exposes endpoints serving metrics for high-level administration and monitoring interfaces.
- **[BE-09] Authorization**: Enforces strict Role-Based Access Control (RBAC) across all administrative endpoints.
- **[BE-10] Audit Logging**: Records administrative actions (login, role modification, device registration/revocation, exports) in audit logs.

### 1.3 Dashboard Requirements (DB)
- **[DB-01] Frontend Stack**: Built using **React**.
- **[DB-02] Authentication**: Authenticates administrative/employee users via **Google OAuth (SSO)**.
- **[DB-03] Activity Overview**: Displays organization-wide aggregate metrics and high-level activity trends.
- **[DB-04] Per-Employee Analytics**: Views specific employee activity timelines, total active time, and idle duration.
- **[DB-05] Per-Application Analytics**: Views system-wide or per-user application usage breakdown (e.g., time spent in VS Code, Slack, Browser).
- **[DB-06] Aggregations**: Displays daily and weekly usage totals per employee/department.
- **[DB-07] Idle Time Tracking**: Dedicated UI breakdown showing accumulated idle duration vs active work time.
- **[DB-08] Device Management**: Lists registered devices, their online/sync status, OS versions, and associated employee accounts.
- **[DB-09] Data Export**: Supports exporting activity summaries and raw session logs into **CSV** format.

### 1.4 Strict Privacy Boundaries (PR)
- **[PR-01] Prohibited Collection**: The system **MUST NOT** collect, record, or transmit:
  - Keystrokes or keylogging data
  - Screenshots or visual display recordings
  - Passwords or credentials
  - Clipboard contents
  - Local file content or system files
  - Web browser page DOM, form data, or full page contents
- **[PR-02] Primary Data Bounds**: Primary collection is strictly limited to **Application Name** and **Duration**.

---

## 2. Assumptions (To be validated)

- **[ASM-01] Desktop Agent Language**: Go is assumed for the Desktop Agent due to easy cross-compilation into standalone binaries without external runtime dependencies (Python remains an option if client infrastructure prefers scriptable runtime).
- **[ASM-02] Device Provisioning**: Admins pre-register devices in the dashboard to generate a registration key/token, which is then embedded into the desktop agent config during installation.
- **[ASM-03] Deployment Environment**: Backend services and PostgreSQL database will be deployed in a cloud Linux environment (e.g. AWS / Docker containerized).
- **[ASM-04] Working Hours / Timezone**: Activity analytics should be calculated relative to the local timezone configured per employee or company-wide default timezone.
- **[ASM-05] Data Retention**: Detailed raw session data (`sessions`) will be retained for 90 days before archiving, while `daily_aggregates` will be stored indefinitely for historical trend analysis.

---

## 3. Open Questions for Client (DEVSYNX)

Before proceeding to Phase 1 implementation, DEVSYNX leadership must clarify the following business & technical questions:

### ❓ Business & Compliance Questions
1. **Window Title Collection**: Should the Desktop Agent capture the active window title (e.g., `document1.docx - Microsoft Word`), or strictly the application executable/process name (e.g., `WINWORD.EXE` / `Microsoft Word`)?  
   *Note: Window titles may inadvertently contain sensitive privacy information such as client names, bank account details, or private document titles.*
2. **Role Matrix & Access Permissions**: What specific roles are required? (e.g., `SuperAdmin`, `HRManager`, `TeamLead`, `Employee`). Can employees view their own activity dashboard, or is the dashboard strictly management-facing?
3. **Google Authentication Domain Restriction**: Should Google OAuth login be restricted strictly to corporate email domains (e.g., `@devsynx.com`)?
4. **Agent Visibility & User Control**: Should the Desktop Agent run completely silently in the system tray/background without employee interaction, or should employees have a system tray menu to view their connection status / pause tracking (e.g., for official break time)?

### ❓ Technical & Infrastructure Questions
5. **Desktop Agent Technology Preference**: Do you prefer **Go** (recommended: zero runtime, low CPU/RAM footprint, single executable binary) or **Python** (requires embedded Python runtime/PyInstaller)?
6. **Agent Auto-Update**: Is auto-updating the Desktop Agent required for Windows and macOS, or will deployment/updates be managed via MDM (Mobile Device Management) / Active Directory Group Policy?
7. **Offline Queue Limits**: What is the maximum local SQLite storage threshold or maximum retention duration when an agent remains offline for extended periods (e.g., maximum 30 days of offline storage)?
8. **Network Proxy Support**: Do client workstations operate behind corporate HTTP/HTTPS proxies requiring proxy auto-discovery (PAC/WPAD) or custom TLS CA certificate injection?
