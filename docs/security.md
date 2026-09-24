# Security & Privacy Specification: DEVSYNX Activity Tracker

**Status**: Phase 3 Verified Security Architecture Baseline

---

## 1. Security Boundaries: User Auth vs Device Auth

The system maintains a strict architectural boundary between human user authentication and machine device authentication:

```
[ Dashboard User ] --------> (Google OAuth 2.0 / JWT) -------> [ User Auth Boundary ]
                                                                       |
[ Desktop Agent  ] --------> (SHA-256 Hashed Token Header) ---> [ Device Auth Boundary ]
```

1. **User Authentication (Dashboard Humans)**:
   - Authenticated via **Google OAuth 2.0 (SSO)**.
   - Authorizes administrative actions, report generation, and employee analytics via JWT tokens.
2. **Device Authentication (Desktop Agents)**:
   - Authenticated via `X-Device-Token` and `X-Device-ID` HTTP headers.
   - Machine-to-machine validation strictly scoped to batch telemetry upload endpoints (`POST /api/v1/activity/batches`).

---

## 2. Device Authentication & Token Storage Strategy

- **Provisioning**: Admins pre-register devices in the dashboard. The backend generates a cryptographically random 256-bit token.
- **Database Storage**: The raw token is **NEVER** stored in the database. Only a **SHA-256 hash** is saved in `Device.deviceTokenHash`.
- **Validation**: Incoming requests present `X-Device-Token`. The backend computes `SHA256(X-Device-Token)` and matches it against `Device.deviceTokenHash` where `isRevoked = false`.
- **Revocation & Instantly Invalided Credentials**: Admins can revoke a device instantly in the dashboard. The backend sets `isRevoked = true`, rejecting subsequent uploads with `401 Unauthorized`.

---

## 3. Strict Logging Policy

To preserve employee privacy and security integrity:
- **Prohibited Log Contents**: Passwords, raw device tokens, Google OAuth tokens, clipboard contents, window titles, or full HTTP request bodies containing telemetry MUST NOT be logged to console or files.
- **Allowed Log Contents**: ISO timestamps, HTTP method, route path, status code, and request execution time in milliseconds.

---

## 4. Secret Handling & Startup Validation

- All environment variables (`NODE_ENV`, `PORT`, `CORS_ORIGIN`, `DATABASE_URL`) are stored in `.env` files and excluded from git version control via `.gitignore`.
- Startup validation is enforced by **Zod** in `backend/src/config/env.ts`. If required variables are missing or invalid, the backend process immediately aborts startup with a clear error message.

---

## 5. Security Middleware & Defense in Depth

- **Security Headers (`helmet`)**: Configures HTTP headers (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `X-XSS-Protection`) to prevent clickjacking and XSS.
- **CORS Protection**: Restricted strictly to configured dashboard origins (`config.CORS_ORIGIN`).
- **Rate Limiting (`express-rate-limit`)**:
  - Global API: 100 requests / 15 minutes per IP (`apiRateLimiter`).
  - Telemetry Ingestion: 60 requests / minute per IP (`telemetryRateLimiter`).
- **Production Error Masking**: `errorHandler` middleware strips stack traces, SQL internals, and internal paths from production JSON error responses.
