# 08 - Security and Privacy

## 1. Threats considered

| Threat | Main controls |
|---|---|
| Stolen or guessed employee password | Device approval, device-bound tokens, lockout, breached-password check |
| Token copied to another PC | Refresh requires signature by the device private key |
| Former employee keeps access | Offboarding transaction, immediate session revoke, no Google credentials ever issued |
| Employee exports the lead database | Scope limits, export permission, audit, rate limits on list endpoints |
| Employee stops or fakes tracking | Watchdog, tamper events, server-side validation, no local admin rights |
| Compromised admin account | Mandatory 2FA, IP allowlist option, audit log, rank rules |
| Backend compromise exposes mailboxes | Tokens encrypted with a key outside the database, per-mailbox OAuth (limited blast radius), minimal scopes |
| Malicious email content | HTML sanitising, sandboxed rendering, remote content blocked |
| Malicious update | Code signing, signature check before install |
| Insider views colleagues' data | Scopes, audit of detail views, restricted default for tracking detail |

## 2. Authentication details

| Item | Specification |
|---|---|
| Password hash | Argon2id, memory 64 MB, iterations 3, parallelism 1, per-user salt |
| Access token | JWT, EdDSA or RS256, 15 min, claims: sub, company, session, device, role version |
| Refresh token | 256-bit random, stored hashed (SHA-256), rotating, 30 days sliding, bound to device and session family |
| Device key | ECDSA P-256 key pair generated on the PC. Private key non-exportable in the Windows key store (CNG, TPM-backed when available) |
| Proof | Login and refresh send `signature = sign(deviceKey, nonce + timestamp + body hash)`. Server verifies against the stored public key. Timestamp tolerance 2 min, nonce single use |
| Token storage, desktop | Electron `safeStorage` (DPAPI). Never in plain files, never in the renderer |
| Admin 2FA | TOTP (RFC 6238), 10 single-use recovery codes, secret encrypted at rest |
| Admin session | Opaque session id in HttpOnly, Secure, SameSite=Strict cookie. CSRF token on writes |

## 3. Transport and data protection

- TLS 1.2 or higher everywhere. HSTS on all domains. The desktop app pins the API host name and rejects invalid certificates. No fallback to HTTP.
- Database on encrypted volumes. Backups encrypted.
- Field-level encryption (AES-256-GCM, key from the secret manager, key id stored with the value) for: Gmail refresh tokens, TOTP secrets.
- Object storage private. Access only through short-lived presigned URLs (5 min) issued after a permission check.
- Local agent queue: SQLite file encrypted with a random key protected by DPAPI for the user.
- Secrets never logged. Logs carry request id, user id, no passwords, tokens or mail content.

## 4. Application security checklist

| Area | Requirement |
|---|---|
| Input | Zod validation on every endpoint, reject unknown fields |
| SQL | Prisma or parameterised SQL only |
| Authorisation | Global guard, scope filter mandatory in repositories, tests per role |
| Tenant isolation | `company_id` taken from the session, never from the request body |
| Uploads | Size limit, MIME allowlist, stored with random keys, served with `Content-Disposition: attachment` |
| Admin Panel | Strict CSP, no inline scripts, `X-Frame-Options: DENY`, dependency audit in CI |
| Electron | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, narrow preload API, navigation and new windows blocked, CSP, external links open in the system browser |
| Email HTML | Server-side sanitise (allowlist), render in a sandboxed iframe without scripts, remote images proxied or blocked until allowed, links show real target |
| Webhooks | Pub/Sub push verified through Google-signed OIDC token and audience |
| Rate limiting | Per IP, per session, per device, in Redis |
| Dependencies | Lockfiles, automated vulnerability scan, no unpinned install scripts |
| Errors | Generic messages to clients, details only in logs |

## 5. Desktop and agent integrity

1. Installer and all binaries are signed with the company's code signing certificate (OV or EV). Unsigned monitoring software is commonly blocked by antivirus products and SmartScreen.
2. Installation is per machine and requires administrator rights. Employees run as standard users and cannot stop the watchdog service or replace files.
3. The watchdog verifies the signature of the agent before starting it and restarts it if it exits during a shift.
4. The named pipe is restricted by ACL to the logged-in user and both ends verify the peer process path and signature.
5. Tamper signals sent to the server: agent not running during an open shift, extension not connected while a browser is in the foreground, clock jump, binary signature mismatch, queue file modified.
6. The server validates plausibility: segments must lie within the shift, must not overlap, input counts must be within human limits. Anomalies raise a security alert. The server never trusts the client for attendance times.
7. Limits to state honestly: a user with local administrator rights can defeat any client-side tracker. The control for that is device management (standard user accounts), not software.

## 6. Monitoring transparency and legal basis

This system processes employee behavioural data. The legal requirements depend on where the employees are located and on the client's jurisdiction, and must be confirmed by the client's legal adviser (Q4). The design assumes transparent, proportionate monitoring:

| Principle | Implementation |
|---|---|
| Notice | Written monitoring policy shown at first login and available in Profile. Version tracked, acceptance recorded |
| Work time only | Tracking runs only between Start Shift and End Shift and is paused during breaks |
| Visibility | Tray icon and header badge show when tracking is on. No hidden or stealth mode exists |
| Data minimisation | No keystroke content, no clipboard, no webcam, no audio. Domains instead of URLs. Window titles off by default. Counts instead of content |
| Access limitation | Detail data restricted by role and scope, every detail view audited |
| Own data | Employees can see their own tracked summary (Q10) |
| Retention | Raw data deleted after the retention period (06) |
| Exclusions | Domains such as banking or health portals can be excluded |
| Screenshots (1.1) | Off by default. If enabled: announced in policy, optional blur, short retention, access audited |

Keyboard counting is implemented without reading key values (see 09). This is also what keeps the agent from behaving like, and being classified as, a keylogger.

## 7. Audit

Audit entries are append-only (database grants) and cover: authentication events, employee and role changes, permission changes, device and session actions, settings changes, target changes, lead reassignment, import, export, deletion, mailbox connection and assignment, every mail action, viewing another employee's activity detail, report export, attendance decisions and adjustments, release publishing.

Each entry: actor, role at the time, action, entity, before and after values (sensitive fields masked), IP, device, client, timestamp, request id.

## 8. Operations

| Topic | Requirement |
|---|---|
| Backups | Daily full + point-in-time recovery, 30 days, stored in a second location, monthly restore test |
| Recovery targets | RPO 15 minutes, RTO 4 hours |
| Access to production | Named accounts, SSH keys or SSO, MFA, no shared passwords, access logged |
| Database access | API role with least privilege. Migrations run with a separate role |
| Monitoring | Error tracking, uptime, queue depth, failed login spikes, mailbox token failures |
| Incident handling | Security alerts to admins by email. Runbook: revoke sessions, rotate keys, disconnect mailboxes |
| Key rotation | JWT signing keys and field encryption keys rotatable (key id in data), rotate yearly or on incident |
| Pre-release | Dependency scan, OWASP ASVS level 2 self-check, external penetration test recommended before full rollout |
