# 17 - Shared Inbox Collaboration

Extends 10 (Gmail integration) and 04 section 10. The Gmail connection, sync and send rules of 10 are unchanged. This file adds the team-inbox layer: assigning conversations to employees, internal comments, labels, snooze, templates and CRM linking. Requirement IDs continue the FR-MAIL series.

## 1. Concepts

| Term | Definition |
|---|---|
| Mailbox | A connected Google Workspace mailbox (10). Shared (sales@) or personal |
| Conversation | A Gmail thread as stored in `mail_threads`, plus the collaboration state below |
| Assignee | The employee responsible for answering the conversation. One at a time |
| Status | open, closed, snoozed. Closing does not touch Gmail; archive in Gmail stays a separate action per 10 |
| Internal comment | A note on the conversation visible only to employees with access to the mailbox. Never sent to the customer |
| Label | Company-wide tag applied to conversations, independent from Gmail labels |
| Template | Canned response with placeholders ({{contact.firstName}}, {{me.firstName}}, {{account.name}}) |

## 2. Functional requirements

| ID | Requirement | P |
|---|---|---|
| FR-MAIL-11 | Assign and unassign a conversation; assignee notified; assignment history in the conversation | M |
| FR-MAIL-12 | Conversation status open, closed, snoozed (until date-time). A new inbound message reopens closed and snoozed conversations | M |
| FR-MAIL-13 | Inbox views per mailbox: Unassigned, Mine, All open, Snoozed, Closed; counts in the sidebar | M |
| FR-MAIL-14 | Internal comments with @mentions; mentioned employees notified | M |
| FR-MAIL-15 | Labels: company-wide list with colour; apply and remove on conversations; filter by label | M |
| FR-MAIL-16 | Templates: name, subject, body (HTML), shared or private; insert into compose with placeholder substitution | M |
| FR-MAIL-17 | Link a conversation to a CRM contact, deal or lead. Automatic link when a participant address matches a contact email (FR-CRM-34). Linked threads appear on the CRM record's Emails tab | M |
| FR-MAIL-18 | Mailbox assignment permissions extended with `triage` (assign, status, labels) and `comment` | M |
| FR-MAIL-19 | Collision warning: when two employees open the same conversation within 2 minutes (presence through WebSocket) | S |
| FR-MAIL-20 | Mailbox health view: token status, last sync, watch expiry, reconnect action (10 section 7) | M |
| FR-MAIL-21 | Rules: auto-assign by sender domain or subject keyword | L |

## 3. Flows

### F28 - Triage a shared inbox

```text
New inbound message synced (10 F14)
  -> conversation status = open, assignee unchanged (null for new threads)
  -> participant match against crm_contact_emails -> contact_id (and the contact's open deal if exactly one)
  -> "Unassigned" count updates over WebSocket (mail.conversation.updated)
Agent with triage: assigns to self or a colleague -> assignee notified
Agent replies (10, permission reply) -> status stays open
Agent closes -> status closed, closed_at; snooze -> snoozed_until, job mail-unsnooze reopens at that time
Internal comment -> visible in the conversation, never sent
```

## 4. Permissions

Mailbox assignment `permissions` array gains `triage` and `comment` (MailboxPermission enum). `mail.use` remains the gate; the per-mailbox array decides the action, as in 10 section 5. New key `mail.templates.manage` for shared templates (Admin, Super Admin `all`). Private templates need only `mail.use`.

## 5. Data model

| Table | Key columns |
|---|---|
| mail_threads (changed) | add assignee_id, status (open, closed, snoozed) default open, snoozed_until, closed_at, contact_id, deal_id, last_inbound_at, assignment_changed_at |
| mail_labels | company_id, name, colour. Unique (company_id, name) |
| mail_thread_labels | thread_id, label_id. Unique |
| mail_comments | thread_id, author_id, body, mentions uuid[], created_at, deleted_at |
| mail_templates | company_id, owner_id null (null = shared), name, subject, body_html, created_at, updated_at |
| mail_thread_events | thread_id, actor_id, type (assigned, unassigned, status_changed, label_added, label_removed, linked, comment), data jsonb, occurred_at. Append-only |

## 6. API

All under `/mail`, gated by `mail.use` plus the mailbox assignment permission named in the last column.

| Method | Path | Mailbox permission |
|---|---|---|
| GET | /mail/mailboxes/:id/conversations?view=unassigned|mine|open|snoozed|closed&labelId&assigneeId&q&cursor | read |
| GET | /mail/mailboxes/:id/conversations/counts | read |
| POST | /mail/mailboxes/:id/threads/:threadId/assign {assigneeId null} | triage |
| POST | /mail/mailboxes/:id/threads/:threadId/status {status, snoozedUntil?} | triage |
| POST, DELETE | /mail/mailboxes/:id/threads/:threadId/labels/:labelId | triage |
| POST | /mail/mailboxes/:id/threads/:threadId/link {contactId?, dealId?, leadId?} | triage |
| GET, POST | /mail/mailboxes/:id/threads/:threadId/comments ; DELETE .../comments/:commentId (author) | read / comment |
| GET | /mail/mailboxes/:id/threads/:threadId/events | read |
| CRUD | /mail/labels | mail.use (GET) / mail.templates.manage |
| CRUD | /mail/templates (shared need mail.templates.manage, private any mail.use) ; POST /mail/templates/:id/render {threadId?, contactId?} | mail.use |
| GET | /mail/mailboxes/health | mail.accounts.manage |
| GET | /crm/contacts/:id/threads, /crm/deals/:id/threads | crm.contacts.view / crm.deals.view (+ mail.use read on the mailbox, otherwise metadata only) |

Existing endpoints (threads list and detail, send, drafts, archive, read, audit, oauth) stay as in 10.

Error codes: `MAILBOX_PERMISSION_MISSING` (reuse MAIL_ACTION_FORBIDDEN), `MAIL_SNOOZE_IN_PAST`, `MAIL_TEMPLATE_PRIVATE`.

## 7. Admin Panel screens

Module "Mail": Mailboxes (connect, health, assignments with permission checkboxes), Inbox (mailbox selector, view tabs with counts, conversation list, conversation pane with messages, internal comments, assignee, status, labels, CRM link, reply with templates), Templates, Labels, Logs (mail audit).

Without Google credentials configured the Mailboxes screen shows a setup banner with the steps from 10 section 3; every other screen works against synced data.

## 8. Tests

Unit: view filters, reopen on inbound, snooze validation, template placeholder rendering, participant to contact matching, mailbox permission checks (triage, comment). Integration: one allowed and one denied case per endpoint.
