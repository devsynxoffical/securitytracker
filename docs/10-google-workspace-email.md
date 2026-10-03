# 10 - Google Workspace Email Integration

## 1. Principle

Employees never receive a Google password, token or session. The backend is the only Gmail API client. The Desktop App talks only to the backend, and the backend decides per request whether the employee may perform the action on that mailbox.

```text
Desktop App --(our API, our permissions)--> Backend --(Gmail API)--> Google
```

Gmail API scopes are coarse (read, send, modify, full). Fine-grained rules such as "may reply but not delete" do not exist at Google. They are implemented as backend permission checks, and functions that must never happen (delete, settings, forwarding, filters) simply have no endpoint.

## 2. Connection method

| Option | How | Pros | Cons | Decision |
|---|---|---|---|---|
| A. Per-mailbox OAuth, internal app | Admin clicks Connect and signs in once as each mailbox. Backend stores a refresh token per mailbox | Access exists only for connected mailboxes. Revocable per mailbox. No verification needed for an Internal app | One sign-in per mailbox | Chosen for 1.0 |
| B. Service account with domain-wide delegation | Super Admin authorises the service account for the Gmail scope. Backend can act as any user | No per-mailbox sign-in, suits many mailboxes | The key can access every mailbox in the domain, including management. High impact if leaked | Alternative when more than about 20 mailboxes. Needs backend allowlist and strict key handling |
| C. IMAP and SMTP with app passwords | Store mailbox passwords | None | Stores passwords, weak, being phased out by Google | Rejected |

A connectable mailbox must be a real Workspace user account (licensed mailbox). Aliases and Google Groups (collaborative inboxes) are not mailboxes and cannot be connected. Confirm with the client which addresses are user accounts (Q3).

With option A the OAuth client lives in a Google Cloud project owned by the client's Workspace organisation and has user type Internal. Internal apps are limited to the organisation's own users and do not go through Google's public verification. If the product is later sold to other companies (Q12), a public app with restricted Gmail scopes requires Google verification and a recurring security assessment. That is a separate project.

## 3. One-time setup (client Super Admin + developer)

1. Create a Google Cloud project inside the client's organisation.
2. Enable Gmail API and Cloud Pub/Sub API.
3. OAuth consent screen: user type Internal, scope `https://www.googleapis.com/auth/gmail.modify`.
4. Create OAuth client (Web application), redirect URI `https://api.<domain>/api/v1/mail/oauth/callback`.
5. Admin console, Security, API controls, App access control: mark the app as Trusted. If the organisation restricts Gmail to trusted apps (recommended), only this app can use the scope.
6. Create Pub/Sub topic `gmail-push`. Grant publisher role on the topic to `gmail-api-push@system.gserviceaccount.com`.
7. Create a push subscription to `https://api.<domain>/api/v1/mail/google/push` with OIDC authentication (dedicated service account, audience = the endpoint URL).
8. Store client id, client secret, topic name and expected OIDC service account in the backend secret manager.

Scope `gmail.modify` permits reading, sending, drafts, labels and moving to trash. It does not permit permanent deletion that bypasses Trash. The backend exposes no trash function at all.

## 4. Flows

### 4.1 Connect mailbox

```text
Admin (mail.accounts.manage) -> Connect mailbox
  -> redirect to Google (access_type=offline, prompt=consent, state=signed)
  -> sign in as the mailbox (for example sales@company.com), consent
  -> callback: exchange code, read profile (address must be in company domain)
  -> store refresh token encrypted, token_status = ok
  -> users.watch(topic, labelIds=[INBOX, SENT]) -> store historyId, expiry
  -> queue initial sync (last 30 days of threads, metadata only)
  -> audit entry
```

### 4.2 Incremental sync

```text
Gmail change -> Pub/Sub push {emailAddress, historyId}
  -> verify OIDC token -> enqueue gmail-sync(mailbox)   (deduplicated)
  -> users.history.list(startHistoryId = stored historyId)
  -> for added/changed messages: messages.get(format=metadata)
  -> upsert mail_threads / mail_messages, update unread, labels
  -> store new historyId
  -> WebSocket mail.new to assigned employees
  -> link thread to lead when a participant address matches lead_emails
```

- History id too old (HTTP 404): run a full metadata resync for the last 30 days.
- Fallback: poll every 2 minutes per mailbox in case push is delayed.
- `gmail-watch-renew` runs daily. A watch expires after 7 days.
- Errors `invalid_grant`: set token_status = revoked, alert admins, show "Reconnect" in the Admin Panel, show "Mailbox unavailable" to employees.

### 4.3 Read

```text
App: GET threads -> served from mail_threads (fast, searchable by subject,
     participant). Full-text search passes q to Gmail (messages.list).
App: GET thread -> backend: permission read -> threads.get(format=full)
     -> parse MIME -> sanitise HTML -> rewrite inline images (cid) to API URLs
     -> response. Cached in Redis for 5 minutes, encrypted.
     -> mail_audit(open)
```

Bodies are not stored in the database. This keeps mail content out of backups and limits what a database leak exposes.

### 4.4 Send, reply, forward, draft

```text
App: POST send {to, cc, bcc, subject, html, attachments[], replyTo?}
  -> permission: send (new, forward) or reply (reply); attach if files
  -> validate recipients, size (25 MB total), attachment types
  -> build MIME: From = mailbox, In-Reply-To + References + threadId on reply,
     signature appended (mailbox signature + employee name if configured)
  -> users.messages.send
  -> mail_messages.sent_by_employee_id = employee
  -> mail_audit(send | reply | forward)
  -> matching lead: timeline entry, metric event emails_sent
```

Drafts are stored as Gmail drafts (`users.drafts`) so they are shared across employees assigned to the same mailbox and tagged with the author in our database.

## 5. Permission mapping

| Assignment permission | Enables |
|---|---|
| read | Thread list, open thread, search |
| send | Compose new mail, forward |
| reply | Reply, reply all |
| draft | Create, edit, discard own drafts |
| attach | Add attachments when sending |
| download | Download received attachments |
| archive | Remove from Inbox (label change) |
| mark_read | Change read state |

Never available to any role through this system: delete or trash, empty trash, account settings, forwarding addresses, filters, delegation, password, labels administration.

Recommended default for sales staff: read, send, reply, draft, attach, mark_read. `download` is granted deliberately because downloaded files leave the controlled environment.

## 6. Shared mailbox behaviour

- Several employees may be assigned to one mailbox. Read state is shared (it is the mailbox state).
- The thread view shows which employee sent each outgoing message (from `sent_by_employee_id`).
- Collision hint: when another assigned employee has the same thread open or a draft reply exists, the app shows "Ahmed is replying" (WebSocket presence, best effort).
- Optional thread assignment to one employee is a 1.1 item.

## 7. Limits and error handling

| Topic | Handling |
|---|---|
| Gmail API quota | Per-mailbox token bucket in Redis, exponential backoff on 429 and 5xx, batch metadata requests |
| Sending limits | Google Workspace daily sending limits apply per mailbox. On limit error show a clear message and alert admins |
| Large mailboxes | Initial sync limited to 30 days, older mail reachable through search |
| Attachments | Streamed through the backend, never written to disk unencrypted, size cap 25 MB |
| Token secrecy | Refresh tokens encrypted (08). Access tokens kept in memory or Redis with TTL only |
| Disconnect | Revoke token at Google, delete stored token, keep audit and thread metadata per retention |

## 8. Offboarding effect

Disabling an employee or removing an assignment needs no action at Google: the employee never held a credential. Access ends with the next API request. The mailbox, its password and its tokens are unaffected, so nothing has to be rotated when staff leave. This is the main security gain over sharing mailbox passwords.

## 9. Out of scope for 1.0

Calendar, contacts sync, label management, mail templates and sequences, tracking pixels, thread assignment, non-Google mail providers.
