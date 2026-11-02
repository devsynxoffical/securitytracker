# 22 - Internal chat

Team messaging inside the system so that work conversations never leave it (08 section 9). Requirement IDs FR-CHAT. Applies to the desktop app (employees) and the admin panel (admins and managers).

## 1. Concepts

| Term | Definition |
|---|---|
| Channel | A named conversation with members. Kinds: `company` (everyone, created at setup, cannot be deleted), `department`, `team` (created automatically with the org unit, membership follows it), `group` (created by hand, invited members), `direct` (exactly two members, created on first message) |
| Message | Text up to 4000 characters, Markdown subset (bold, italic, code, links), @mentions, optional link to a system record (task, lead, deal, contact, mail conversation) rendered as a card |
| Read cursor | Per member per channel: last read message id. Unread count = messages after the cursor, excluding own |
| Mention | `@Firstname Lastname` resolved to an employee id at send time; mentioned members get a notification (FR-NOTIF-01/02) |
| Retention | Messages kept for `chatRetentionDays` [365] then purged by the maintenance job. No export (08 section 9) |

## 2. Functional requirements

| ID | Requirement | P |
|---|---|---|
| FR-CHAT-01 | Company, department and team channels exist automatically; membership follows the employee's department and team and updates when they move | M |
| FR-CHAT-02 | Direct messages between any two active employees of the company | M |
| FR-CHAT-03 | Group channels: create, rename, add and remove members (creator or `chat.manage`), leave, archive | M |
| FR-CHAT-04 | Send, edit (own, within 15 minutes, marked edited) and delete (own, or `chat.manage`; shows "message deleted") | M |
| FR-CHAT-05 | Realtime delivery over the existing WebSocket namespace `/ws`: `chat.message.created`, `chat.message.updated`, `chat.message.deleted`, `chat.typing`, `chat.read` | M |
| FR-CHAT-06 | Unread counts per channel and in total; badge in the desktop sidebar and the admin topbar; read cursor advances when the channel is open and the window is focused | M |
| FR-CHAT-07 | @mentions with autocomplete; mentioned employees notified; "Mentions" filter | M |
| FR-CHAT-08 | Link a record: paste a system link or use "/task", "/lead" picker; rendered as a card with title and status, permission-checked at read time (no card when the viewer may not see the record) | S |
| FR-CHAT-09 | Search messages in channels the caller belongs to (full text, Postgres `tsvector`), cursor pagination | S |
| FR-CHAT-10 | Suspended, disabled or offboarded employees are removed from every channel immediately; their history stays visible | M |
| FR-CHAT-11 | No attachments in 1.0. Files are shared as links to the system's own documents (files module) which are permission-checked | M |
| FR-CHAT-12 | No export, no email digest, no forwarding outside the system; copy is possible on screen only (08 section 9) | M |
| FR-CHAT-13 | Admins with `chat.manage` can read any channel of their scope for moderation; every such read of a channel they are not a member of is audited | M |
| FR-CHAT-14 | Offline: the desktop shows the cached last 200 messages per channel read-only; sending is disabled with "Offline" until reconnect | M |

## 3. Permissions

| Key | Default roles |
|---|---|
| `chat.use` | every role (own) |
| `chat.manage` | Admin, Super Admin (all); Manager (department) |

## 4. Data model

| Table | Key columns |
|---|---|
| chat_channels | id, company_id, kind (company, department, team, group, direct), name, department_id null, team_id null, created_by null, archived_at null, last_message_at, created_at. Unique (company_id, kind, department_id), (company_id, kind, team_id); direct channels unique on the sorted member pair (`direct_key` = `min(id):max(id)`) |
| chat_members | channel_id, employee_id, joined_at, last_read_message_id null, muted bool. Unique (channel_id, employee_id) |
| chat_messages | id (uuid v7, time-ordered for cursors), channel_id, author_id, body text, mentions uuid[], record_ref jsonb null ({type, id}), edited_at null, deleted_at null, created_at. Index (channel_id, id desc). `search tsvector` generated column with GIN index |

Retention purge: `chat-retention` job daily, deletes messages older than `chatRetentionDays`, audited with counts.

## 5. API (all `chat.use`; cursor pagination; company from session)

| Method | Path | Notes |
|---|---|---|
| GET | /chat/channels | My channels with unread counts and last message preview, sorted by last_message_at |
| POST | /chat/channels | {kind: group, name, memberIds} |
| POST | /chat/channels/direct | {employeeId} → existing or new direct channel |
| PATCH | /chat/channels/:id | rename, archive (creator or chat.manage) |
| POST, DELETE | /chat/channels/:id/members/:employeeId | group channels only |
| POST | /chat/channels/:id/leave | group channels only |
| GET | /chat/channels/:id/messages?cursor&limit=50 | newest first; `before` cursor = message id |
| POST | /chat/channels/:id/messages | {body, mentions?, recordRef?}; Idempotency-Key honoured |
| PATCH, DELETE | /chat/messages/:id | own within 15 min / chat.manage |
| POST | /chat/channels/:id/read | {lastReadMessageId} |
| POST | /chat/channels/:id/typing | rate limited 1/3 s, broadcast only |
| GET | /chat/search?q&channelId?&cursor | FR-CHAT-09 |
| GET | /chat/unread | total and per channel, for badges |
| GET | /chat/directory?q&cursor&limit | Active colleagues of the caller's company for the direct-message picker (id, name, code, department, team); excludes the caller and suspended, disabled, invited employees; needs only `chat.use` |

WebSocket (namespace `/ws`, same auth as notifications): server emits the events in FR-CHAT-05 to channel members; clients join rooms `chat:<channelId>` after auth.

Error codes: `CHAT_NOT_MEMBER`, `CHAT_EDIT_WINDOW`, `CHAT_DIRECT_SELF`, `CHAT_CHANNEL_ARCHIVED`.

## 6. Screens

Desktop: "Chat" in the sidebar with unread badge. Left list (channels, direct, search), message pane (day separators, author, time, edited mark, mention highlight, record cards), composer (Enter sends, Shift+Enter newline, @ autocomplete, /task /lead pickers), typing indicator, offline state, loading, empty ("Say hello to your team") and error states.

Admin panel: module "Chat" with the same screens plus the moderation view for `chat.manage` (channel list across scope, read-only unless a member).

## 7. Tests

Unit: membership derivation from org units, direct key, edit window, unread computation, mention parsing, retention cutoff. Integration: one allowed and one denied case per endpoint (non-member 403, archived channel, edit after window, suspended employee removed). Gateway: room join requires membership.
