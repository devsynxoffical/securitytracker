# 07 - API Specification

This file defines conventions and the endpoint inventory. Exact request and response shapes are the Zod schemas in `packages/contracts`. OpenAPI is generated from them and is the binding reference once code exists.

## 1. Conventions

| Topic | Rule |
|---|---|
| Base URL | `https://api.<domain>/api/v1` |
| Format | JSON, UTF-8, camelCase field names, ISO 8601 UTC timestamps |
| Auth, desktop | `Authorization: Bearer <access token>` + `X-Device-Id` |
| Auth, admin | Session cookie + CSRF token header on writes |
| Pagination | Cursor based: `?limit=50&cursor=...` -> `{ items, nextCursor }`. Max limit 200 |
| Filtering | Query parameters, documented per endpoint. Dates as `from`, `to` |
| Idempotency | Writes from the desktop carry `Idempotency-Key` (UUID). Server stores result for 24 h |
| Versioning | Path version. `X-Client-Version` header on every request. Below minimum -> 426 |
| Rate limits | Login 10 per minute per IP. General 300 per minute per session. Ingest 30 per minute per device |
| Time | Every response includes header `X-Server-Time` |

Error body:

```json
{
  "error": {
    "code": "SHIFT_ALREADY_OPEN",
    "message": "A shift is already open on another device.",
    "details": { "shiftId": "...", "deviceName": "PC-014" },
    "requestId": "..."
  }
}
```

| HTTP | Use |
|---|---|
| 400 | Validation failed (`VALIDATION_ERROR` with field list) |
| 401 | Not authenticated, token expired, session revoked |
| 403 | Authenticated but permission missing |
| 404 | Not found or outside scope |
| 409 | State conflict |
| 422 | Business rule violated |
| 426 | Client version too old |
| 429 | Rate limited |

## 2. Auth and devices

| Method | Path | Purpose |
|---|---|---|
| POST | /auth/login | Desktop login. Body: identifier, password, device {id?, publicKey, name, os, hardwareHash}, signature. Returns tokens, or `DEVICE_PENDING` |
| GET | /auth/device-status | Poll while device is pending |
| POST | /auth/refresh | Rotating refresh, signed by device key |
| POST | /auth/logout | Revoke current session |
| POST | /auth/change-password | Current + new password |
| POST | /auth/consent | Accept policy version |
| GET | /me | Profile, permissions with scopes, settings relevant to the client, open shift |
| POST | /admin/auth/login, /admin/auth/2fa, /admin/auth/logout | Admin Panel login |
| POST | /admin/auth/2fa/enroll, /admin/auth/2fa/verify | TOTP enrolment |
| GET | /devices | List (scope) |
| POST | /devices/:id/approve, /reject, /revoke | Device actions |
| GET | /sessions, DELETE /sessions/:id | Session management |
| GET | /login-events | Login history |

## 3. Organisation

| Method | Path |
|---|---|
| GET, POST | /employees |
| GET, PATCH | /employees/:id |
| POST | /employees/:id/reset-password |
| GET | /employees/:id/offboarding-preview |
| POST | /employees/:id/disable (body: reassignment map), /employees/:id/enable |
| CRUD | /departments, /teams |
| CRUD | /roles, PUT /roles/:id/permissions |
| GET | /permissions (catalog) |

## 4. Shift and attendance

| Method | Path | Purpose |
|---|---|---|
| POST | /shifts/events | Batch of shift events (start, break_start, break_end, end), each with clientEventId, monotonic offset. Used online and for offline replay |
| POST | /shifts/heartbeat | State, client clock, queue size. Response: server time, config version, commands |
| GET | /shifts/current | Open shift |
| GET | /attendance/days | Filter employee, team, from, to |
| GET | /attendance/live | Live board |
| CRUD | /schedules, /employee-schedules, /holidays |
| POST, GET | /attendance/corrections, POST /attendance/corrections/:id/decide |
| POST, GET | /leave-requests, POST /leave-requests/:id/decide |

## 5. Tracking

| Method | Path | Purpose |
|---|---|---|
| POST | /tracking/segments | Batch ingest, max 500 |
| POST | /tracking/tamper-events | Tamper signals |
| GET | /tracking/config | Idle threshold, exception apps, exclusions, capture flags |
| GET | /tracking/summary | Totals per employee and date range |
| GET | /tracking/apps, /tracking/domains | Rollups with drill-down parameters |
| GET | /tracking/timeline | Segments for one employee and day (permission `tracking.view_detail`, audited) |
| CRUD | /tracking/productivity-rules, /tracking/exclusions, /tracking/exception-apps |
| GET | /tracking/uncategorised | Apps and domains without a rule |

Ingest example:

```json
POST /tracking/segments
{
  "shiftId": "0192...",
  "segments": [
    {
      "id": "0192f3a1-...",
      "startedAt": "2026-10-03T05:20:00Z",
      "endedAt": "2026-10-03T05:24:10Z",
      "kind": "active",
      "processName": "chrome.exe",
      "appName": "Google Chrome",
      "domain": "youtube.com",
      "keyCount": 12,
      "mouseCount": 240,
      "exception": "none",
      "clockSource": "anchored"
    }
  ]
}
-> 200 { "accepted": ["0192f3a1-..."], "rejected": [] }
```

Rejected items carry a reason (`OUTSIDE_SHIFT`, `OVERLAP`, `TOO_OLD`, `INVALID`). The client deletes accepted and permanently rejected segments from its queue and keeps the rest for retry.

## 6. CRM, tasks, calls

| Method | Path |
|---|---|
| GET, POST | /leads (filters: owner, stage, pipeline, source, tag, followUp, search) |
| GET, PATCH, DELETE | /leads/:id |
| POST | /leads/:id/stage, /leads/:id/assign, /leads/bulk-assign |
| GET | /leads/:id/timeline |
| POST | /leads/:id/notes, /leads/:id/calls, /leads/:id/appointments, /leads/:id/attachments |
| POST | /leads/check-duplicate |
| POST | /leads/import (upload), GET /leads/import/:jobId |
| POST | /leads/export (creates a job, returns download link) |
| CRUD | /pipelines, /pipelines/:id/stages, /lead-sources, /lost-reasons, /tags, /custom-fields |
| GET, POST | /tasks, GET, PATCH /tasks/:id, POST /tasks/:id/comments |
| GET | /follow-ups (today, overdue, upcoming) |
| POST | /files/presign (upload URL), GET /files/:id (download redirect, permission checked) |

## 7. Targets

| Method | Path |
|---|---|
| GET | /metrics |
| CRUD | /targets |
| GET | /targets/progress (mine or by employee, team, period) |
| GET | /targets/history, /targets/leaderboard |

## 8. Mail

| Method | Path | Purpose |
|---|---|---|
| GET | /mail/oauth/start, /mail/oauth/callback | Connect mailbox |
| GET, DELETE | /mailboxes, /mailboxes/:id | Manage |
| CRUD | /mailboxes/:id/assignments | Assign with permissions |
| GET | /mail/my-mailboxes | Mailboxes assigned to the caller with permissions |
| GET | /mail/:mailboxId/threads | List, search `q`, label filter |
| GET | /mail/:mailboxId/threads/:threadId | Messages with sanitised bodies |
| POST | /mail/:mailboxId/send | New, reply, forward. Attachments by file ids |
| POST, PUT, DELETE | /mail/:mailboxId/drafts | Drafts |
| POST | /mail/:mailboxId/threads/:threadId/mark-read, /archive | State |
| GET | /mail/:mailboxId/messages/:id/attachments/:attId | Download (permission `download`) |
| POST | /mail/google/push | Pub/Sub webhook, verified by Google OIDC token |
| GET | /mail/audit | Email logs |

## 9. Notifications, reports, audit, settings, releases

| Method | Path |
|---|---|
| GET | /notifications, POST /notifications/:id/read, POST /notifications/read-all |
| POST | /announcements |
| GET | /reports/attendance, /reports/time, /reports/apps, /reports/productivity, /reports/crm, /reports/calls, /reports/targets (each accepts `format=csv`) |
| GET | /dashboard/admin, /dashboard/me |
| GET | /audit-logs, /security-alerts, POST /security-alerts/:id/ack |
| GET, PATCH | /settings |
| GET | /releases/latest?channel= (desktop), CRUD /releases (admin) |
| GET | /health, /health/ready |

## 10. WebSocket

Connection: `wss://api.<domain>/ws`, authenticated with the access token, re-authenticated on refresh. Rooms: user, team, company-admins.

| Event (server -> client) | Payload | Client action |
|---|---|---|
| session.revoked | reason | Stop agent, wipe tokens, show login |
| config.updated | version | Refetch config |
| notification.new | notification | Badge, toast |
| mail.new | mailboxId, threadId | Refresh list, badge |
| target.progress | targetId, value | Update bars |
| lead.assigned | leadId | Refresh |
| task.updated | taskId | Refresh |
| device.approved | deviceId | Continue login |
| live.attendance | employeeId, status | Admin live board |
| update.available | version, mandatory | Start update flow |

Clients treat WebSocket events as hints and refetch through REST. No business data is trusted from the socket alone.
