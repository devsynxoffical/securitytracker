# Authentication & Authorization Architecture: DEVSYNX Activity Tracker

**Status**: Phase 4 Verified Authentication & Authorization Specification  
**Client**: DEVSYNX Private Limited  
**Storage**: Local SQLite File (`backend/prisma/devsynx.db`) via Prisma ORM

---

## 1. Executive Summary & Dual Authentication Domains

The DEVSYNX Activity Tracker implements two completely separate authentication domains:

```
+-----------------------------------------------------------------------------------+
|                            1. DASHBOARD USER AUTH DOMAIN                          |
|  (Human Users / Admins / Managers -> Google OAuth 2.0 / OIDC -> JWT Session)      |
+-----------------------------------------------------------------------------------+

+-----------------------------------------------------------------------------------+
|                             2. DEVICE AUTH DOMAIN                                 |
|  (Desktop Agent Machines -> X-Device-Token Header -> SHA-256 Hash -> Telemetry)   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Dashboard User Authentication (Human SSO)

### 2.1 Google OAuth / OIDC Integration Boundary
Dashboard human users authenticate using Google Workspace Single Sign-On (SSO):
1. User logs into Google via the React Dashboard using Google Workspace credentials.
2. React Dashboard sends the Google ID Token to `POST /api/v1/auth/google`.
3. Backend verifies ID token claims and enforces the corporate domain restriction:
   - `verifiedEmail.endsWith("@" + config.GOOGLE_ALLOWED_DOMAIN)` (e.g. `@devsynx.com`).
4. Database lookup in `User` table:
   - If user account exists, checks `user.isActive === true`.
   - If user account does not exist, auto-provisions user with role `EMPLOYEE`.
5. Backend issues a signed, time-limited JWT session token (`24h` expiration).

### 2.2 User Session Strategy
- Session tokens are signed using HMAC SHA-256 (`JWT_SECRET`).
- Payload contains: `{ userId, email, role }`.
- Frontend sends `Authorization: Bearer <token>` header on API requests.
- Logout (`POST /api/v1/auth/logout`) invalidates client-side session state and records an audit log event.

---

## 3. Device Authentication Architecture (Desktop Agent)

### 3.1 Machine Authentication Principles
- Desktop agents do **NOT** log in as human users and do **NOT** use browser cookies or Google SSO.
- Every telemetry upload request MUST contain device-specific HTTP headers:
  ```http
  X-Device-Token: <PLAINTEXT_DEVICE_CREDENTIAL_TOKEN>
  X-Device-ID: <UUID_DEVICE_IDENTIFIER>
  ```

### 3.2 Secure Token Hashing & Storage
- **Zero Raw Token Storage**: Plain-text device tokens are generated once during device provisioning and presented to the installer. The backend stores ONLY a **SHA-256 hash** in `Device.deviceTokenHash`.
- **Validation Flow**:
  1. Middleware `requireDeviceAuth` receives `X-Device-Token` and `X-Device-ID`.
  2. Computes `hash = SHA256(X-Device-Token)`.
  3. Queries database for `Device` matching `id` and `deviceTokenHash`.
  4. Checks `isRevoked === false`. Rejects revoked devices with HTTP 401 `DEVICE_REVOKED`.
  5. Updates `lastSeenAt` heartbeat timestamp asynchronously.

---

## 4. Role-Based Access Control (RBAC) Architecture

### 4.1 Role Hierarchy
- **`SUPER_ADMIN`**: Full system administration, role assignment, device revocation.
- **`ADMIN`**: Employee management, device registration, audit report views.
- **`MANAGER`**: Team timeline viewing for direct reports (`User.managerId`).
- **`EMPLOYEE`**: Self-service profile and personal activity timeline view.

### 4.2 Middleware Guards
Authorization is enforced by reusable middleware functions:
- `requireUserAuth`: Enforces valid user JWT and `isActive === true`.
- `requireDeviceAuth`: Enforces valid device token hash and `isRevoked === false`.
- `requireRoles(['ADMIN', 'SUPER_ADMIN'])`: Enforces role-based capabilities, returning HTTP 403 `FORBIDDEN` if unauthorized.

---

## 5. Account & Device Lifecycle Security

### 5.1 Account Disabling
When an employee leaves DEVSYNX or is suspended, an admin sets `User.isActive = false`:
- Immediate Access Rejection: `requireUserAuth` checks `user.isActive` on every request and rejects disabled users with HTTP 401 `USER_DISABLED`.

### 5.2 Device Revocation
When a workstation is decommissioned or compromised, an admin sets `Device.isRevoked = true`:
- Immediate Telemetry Rejection: `requireDeviceAuth` rejects batch uploads from revoked devices with HTTP 401 `DEVICE_REVOKED`.

---

## 6. What is Implemented Now vs Deferred

### Implemented in Phase 4:
- [x] Dual authentication boundaries (`requireUserAuth` and `requireDeviceAuth`).
- [x] Zod environment variable validation (`JWT_SECRET`, `GOOGLE_ALLOWED_DOMAIN`).
- [x] SHA-256 device token hashing and verification (`crypto.ts`).
- [x] User JWT signing and verification (`jwt.ts`).
- [x] Google OAuth verification boundary and auto-provisioning service (`auth.service.ts`).
- [x] Auth routes (`POST /api/v1/auth/google`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`).
- [x] Telemetry endpoint device auth guard (`POST /api/v1/activity/batches`).
- [x] React Auth Context abstraction (`AuthProvider`, `useAuth`, `ProtectedRoute`).
- [x] Automated Vitest test suite (`backend/tests/auth.test.ts`).

### Deferred to Future Phases:
- [ ] Production Google Client Secret / OAuth Library setup (Awaiting Google Workspace Console credentials).
- [ ] Employee CRUD APIs.
- [ ] Device registration UI and token generation dialog.
- [ ] Full session batch processing & idle aggregation.

---

## 7. Required Google Workspace Configuration

To complete production Google SSO integration in future phases, DEVSYNX administrators must configure in Google Cloud Console:
1. **OAuth 2.0 Client ID**: Web application credentials.
2. **Authorized JavaScript Origins**: `https://dashboard.tracker.devsynx.com` (and `http://localhost:5173` for dev).
3. **Authorized Redirect URIs**: `https://dashboard.tracker.devsynx.com`
4. **Environment Variables Needed**:
   - `GOOGLE_CLIENT_ID`: `<YOUR_GOOGLE_CLIENT_ID>.apps.googleusercontent.com`
   - `GOOGLE_ALLOWED_DOMAIN`: `devsynx.com`
