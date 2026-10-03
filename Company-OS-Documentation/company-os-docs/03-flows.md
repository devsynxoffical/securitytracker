# 03 - System Flows

Every flow lists the actor, the steps, the rules and the edge cases. Defaults in brackets are configurable in Settings.

## F1 - Setup and employee creation

Actor: Super Admin, Admin.

```text
Seed script creates Company + first Super Admin
  -> Super Admin logs in to Admin Panel, enrols TOTP 2FA (mandatory)
  -> Sets company settings (timezone, week start, idle threshold, break rules)
  -> Creates departments and teams
  -> Creates shift schedules and holidays
  -> Reviews default roles and permissions
  -> Creates employees
  -> Connects mailboxes (F14) and assigns them
  -> Creates pipeline stages, target metrics, targets
```

Create employee:

1. Admin enters name, company email (optional), department, team, role, schedule, manager.
2. Server generates employee code `EMP-0001` (sequential per company, never reused).
3. Server generates a temporary password, shown once to the admin. Flag `must_change_password = true`.
4. Employee status = `invited`. Becomes `active` after first successful login.

Rules:

- Login identifier is the employee code or the company email. Both are unique per company.
- An admin can never view an existing password. Only reset it.

## F2 - First login, device registration, consent

Actor: Employee.

```text
Install Desktop App (signed installer, per machine)
  -> Open app, enter employee code or email + temporary password
  -> App generates device key pair (private key stays on the PC)
  -> POST /auth/login with credentials + device info + device public key
  -> Server checks credentials, account status, lockout
  -> Device unknown:
        create device (status = pending), notify approvers
        app shows "Waiting for device approval" and polls
  -> Approver approves device in Admin Panel
  -> App receives approval, completes login, receives tokens
  -> Forced password change
  -> Monitoring consent screen (policy text, version) -> Accept
  -> Dashboard
```

Rules:

1. Device identity = server-issued `device_id` + public key. Device info (machine name, OS version, hardware hash) is stored for display only and is not trusted as proof.
2. Every token refresh is signed with the device private key. A copied token is useless on another PC.
3. Setting `device_approval_mode`: `manual` [default], `auto_first_device` (first device of an employee is approved automatically), `off`.
4. Maximum approved devices per employee [1]. Approving a new one requires revoking the old one or raising the limit.
5. Declining consent logs the employee out. Tracking never runs without a consent record for the current policy version.
6. Pending devices expire after [7] days.

## F3 - Normal login, session, logout

```text
Open app -> valid refresh token on this device?
   yes -> refresh silently -> Dashboard
   no  -> login form -> POST /auth/login (signed by device key)
            -> checks: credentials, status active, device approved,
               not locked out, consent current
            -> access token (15 min) + refresh token (30 days, rotating)
            -> open WebSocket -> Dashboard
```

Rules:

- Login does not start a shift. The employee presses Start Shift (F5). Setting `auto_start_shift_on_login` exists [off].
- Refresh tokens rotate on every use. Reuse of an old refresh token revokes the whole session family and raises a security alert.
- Logout while a shift is open is blocked: the app asks to end the shift first.
- Server can push `session.revoked` over WebSocket. The app then stops the agent, wipes tokens and returns to the login screen. If the app is offline, the next API call fails with 401 and has the same effect.
- Admin Panel login: email + password + TOTP. Session cookie, HttpOnly, Secure, SameSite=Strict, idle timeout [30 min], absolute timeout [12 h].

## F4 - Password reset and lockout

- [5] failed attempts within 15 minutes lock the account for [15] minutes. Counter per account and per IP.
- Employee has forgotten the password: asks an admin. Admin presses Reset Password, receives a new temporary password, `must_change_password = true`, all sessions revoked.
- Employee changes own password in Profile: current password required, all other sessions revoked.
- Password policy: minimum 10 characters, checked against a breached-password list, no forced periodic rotation.
- Admin Panel users reset their own password by email link (valid 30 minutes, single use). 2FA reset only by a Super Admin.

## F5 - Shift lifecycle

### States

| State | Meaning | Agent |
|---|---|---|
| OFF_SHIFT | No open shift | Stopped |
| WORKING | Shift open, employee working | Tracking |
| ON_BREAK | Shift open, break running | Paused |
| ENDED | Shift closed (terminal for that shift record) | Stopped |

### Transitions

| From | Event | To | Server action |
|---|---|---|---|
| OFF_SHIFT | Start Shift | WORKING | Create shift, set start time (server time), attendance check-in |
| WORKING | Start Break (type) | ON_BREAK | Create break record |
| ON_BREAK | End Break | WORKING | Close break record |
| WORKING, ON_BREAK | End Shift | ENDED | Close open break, set end time, compute totals |
| WORKING, ON_BREAK | Auto-close (job) | ENDED | End time = last heartbeat, flag `auto_closed`, notify employee and manager |

### Rules

1. One open shift per employee. Start Shift while another shift is open returns 409 with the open shift. If that shift belongs to this device it is resumed, otherwise the employee is told on which device it runs.
2. Heartbeat: the app sends a heartbeat every 60 s while a shift is open. It carries state, client clock and queue size.
3. Offline gap: no heartbeat for more than [5] minutes shows the employee as Offline on the live board. This is a display state only: tracking continues locally on the PC. When the queued segments are uploaded (F7), the period is filled with the real data.
4. Auto-close: no heartbeat for [2] hours, or shift longer than [14] hours, closes the shift provisionally. End time is the last heartbeat or the last uploaded segment, whichever is later. If the PC was only offline and data arrives later, the shift is rebuilt from that data (F7).
5. Idle: no input for [5] minutes starts an idle segment, backdated to the last input. Idle time stays inside the shift and is reported separately. It is not a break.
6. Long idle: an idle period longer than [15] minutes shows a dialog on return: "You were away for 23 minutes. Mark as: Break / Working away from PC (meeting, call)". The answer is stored as a claim on the segment. Managers see claimed time separately. Setting `long_idle_prompt` [on].
7. Screen lock: treated as idle from the moment of lock.
8. Sleep, hibernate, shutdown: agent closes the current segment. If the PC wakes within the auto-close window the shift continues and the sleep period is recorded as `offline`.
9. App crash or kill: the agent keeps tracking into its local queue, the watchdog relaunches the app in the tray, the app shows "Shift resumed" and continues. Nothing is lost.
10. Break allowance: total break time above [60] minutes per shift is flagged `break_exceeded` on the attendance day.
11. Clock: shift start, break and end timestamps are assigned by the server on receipt. When an event was performed offline, the client sends its monotonic elapsed time since the last server-confirmed sync and the server reconstructs the timestamp. Events with a reconstructed timestamp are flagged.
12. Changing the Windows clock has no effect on durations (monotonic clock). A detected jump of more than 2 minutes is logged as `clock_changed`.

### Working time formula

```text
shift_duration   = end - start
break_time       = sum(breaks)
offline_time     = sum(offline gaps without data)
tracked_time     = shift_duration - break_time - offline_time
active_time      = sum(active segments)
idle_time        = tracked_time - active_time
working_time     = tracked_time            (attendance and payroll view)
productive_time  = active_time in apps/sites classified productive
```

## F6 - Activity tracking and sync

```text
Agent (every input / window change)
  -> builds segments in memory
  -> closes a segment when: app changes, domain changes, active<->idle flips,
     lock, pause, or segment reaches 5 minutes
  -> writes closed segments to local SQLite queue

App main process (every 60 s, and at break/end)
  -> reads up to 500 queued segments from the agent over the pipe
  -> POST /tracking/segments (batch, each segment has a client UUID)
  -> server validates: shift belongs to employee and device, times inside
     shift window, no overlap beyond tolerance
  -> server upserts by UUID (idempotent), updates daily rollups
  -> responds with accepted and rejected UUIDs
  -> app tells the agent to delete accepted segments
```

Segment content: see 09. In short: shift id, start, end, kind (active, idle, locked), process name, app display name, domain (browsers only), key count, mouse count, exception reason.

Rules:

- No keystroke content, no clipboard, no window titles by default (setting `capture_window_titles` [off]).
- Website tracking stores the registrable domain only (for example `youtube.com`), never the full URL. Setting `capture_page_titles` [off].
- Incognito windows are not visible to the extension. Time is recorded as browser app time with domain `unknown`. Recommend disabling incognito by Chrome policy.
- Private or sensitive domains can be listed in `tracking_exclusions`. They are stored as domain `excluded`.

## F7 - Offline mode (tracker never stops)

Principle: losing the internet connection MUST NOT stop, pause or degrade tracking. The agent has no dependency on the network. It records to the local encrypted queue exactly as when online, and the Admin Panel is brought up to date automatically once the connection returns.

```text
Internet drops during a shift
  -> agent keeps tracking (it never knows about the network)
  -> app upload fails -> app switches to OFFLINE mode, shows a small
     "Offline - tracking continues, will sync" badge
  -> shift timer, break and End Shift keep working locally
  -> Admin Panel live board shows the employee as
     "Offline (last seen 10:42)" - not as stopped or absent
Internet returns
  -> app detects connectivity (retry with backoff: 5 s, 15 s, 30 s, 60 s)
  -> refreshes token -> sends queued shift events in order
  -> uploads queued segments in batches of 500 until the queue is empty
  -> server backfills shift, rollups, attendance, targets (active_hours)
  -> Admin Panel shows the complete timeline for the offline period,
     marked "synced late" with the sync time
```

| Function | Offline behaviour |
|---|---|
| Tracking during an open shift | Continues without limit in time. Queue capacity [30] days or [500] MB, oldest data is never dropped silently: at 90 percent the employee and, after sync, the admin are warned |
| PC restart while offline | Watchdog starts the agent, app starts with Windows, open shift resumes from local state, tracking continues |
| Start Shift | Allowed offline when the device holds a valid session (refresh token not expired). Queued, flagged `offline_start` |
| Break, Resume, End Shift | Allowed, queued, flagged |
| Auto-close by server (F5 rule 4) | Provisional only. When late data arrives, the shift is rebuilt from the real data and the flag becomes `recovered` |
| CRM, tasks, email | Read-only from last cached lists. No writes offline in 1.0 |
| First login on a device, or login after logout | Not possible offline (credentials are verified by the server) |
| Session revoked by admin while offline | Takes effect at the first contact with the server. Data recorded until then is still uploaded and kept |

Rules:

1. Timestamps recorded offline use the agent's monotonic clock anchored to the last server-confirmed time, so a wrong or changed Windows clock does not corrupt the data.
2. Sync order on reconnect: shift events, then segments (oldest first), then heartbeat. Uploads are idempotent (client UUID per event and segment), so an interrupted sync can be repeated safely.
3. Offline time with uploaded segments counts as normal tracked time. Only periods with no data at all (PC off, agent killed) remain `offline` gaps.
4. The server accepts late segments up to [30] days old. Attendance and reports for those days are recomputed automatically.
5. A flaky connection (frequent short drops) causes no visible change for the employee. The offline badge appears only after [60] s without a successful request.

## F8 - Attendance computation

Inputs: schedule assignment, holidays, approved leave, shifts.

Attendance date: a shift belongs to the date of the scheduled shift whose start is closest to the actual start (window: 4 hours before to 8 hours after the scheduled start). Night shift 20:00 to 04:00 belongs entirely to the start date. A shift with no matching schedule belongs to its start date in the company timezone and is flagged `unscheduled`.

Status per employee and date, computed by the attendance-close job [2] hours after the scheduled end and recomputed when a correction is approved:

| Status | Rule |
|---|---|
| Holiday | Date is a company holiday and no shift worked |
| Weekly off | Not a scheduled workday and no shift worked |
| On leave | Approved leave covers the date |
| Absent | Scheduled workday, no shift, no leave |
| Half day | Working time under [50] percent of scheduled hours |
| Late | First shift start later than scheduled start + grace [10 min] |
| Present | Otherwise |

Additional flags on the day: `left_early`, `break_exceeded`, `auto_closed`, `offline_time`, `unscheduled`, `corrected`. Live status in the admin list during the day: Working, On break, Idle, Offline, Not started.

Multiple shifts on one attendance date are allowed (split shift). Times are summed. Check-in is the first start, check-out the last end.

## F9 - Attendance correction and leave

Correction:

```text
Employee: Attendance -> day -> Request correction
   (type: missed start, missed end, wrong break, system issue) + times + reason
  -> Manager notified -> Approve / Reject with comment
  -> Approved: a manual adjustment record is added (original data untouched)
  -> Attendance recomputed, day flagged "corrected", audit log entry
```

Leave (basic): employee requests dates + type (annual, sick, unpaid, other) + reason, manager approves or rejects, approved days become On leave. No balance accounting in 1.0.

Rule: tracked activity data is never edited. Corrections only add adjustment records with an approver and reason.

## F10 - CRM lead lifecycle

```text
Create lead (manual, CSV import)        Actor: permission crm.leads.create
  -> duplicate check on normalized phone (E.164) and lowercased email
       match -> show existing lead, option: open / create anyway (permission)
  -> assign owner (employee) -> owner notified
  -> owner works the lead:
       log call (F12), add note, send email (F14), create task,
       schedule appointment, set follow-up date
  -> owner moves stage
  -> Won  -> lead becomes Client (flag + won date + value)
     Lost -> lost reason required
```

Default pipeline (stages are configurable per pipeline):

| Order | Stage | Type |
|---|---|---|
| 1 | New Lead | open |
| 2 | Attempted | open |
| 3 | Contacted | open |
| 4 | Interested | open |
| 5 | Follow-up | open |
| 6 | Meeting Scheduled | open |
| 7 | Proposal Sent | open |
| 8 | Negotiation | open |
| 9 | Won | won |
| 10 | Lost | lost |

Rules:

1. Any stage can move to any other stage. Every move is written to the timeline with actor, from, to and time. Reopening a Won or Lost lead needs permission `crm.leads.reopen`.
2. Stage type drives metrics: entering a stage of type `won` counts a closing. Stages can also be marked `counts_as_qualified` and `counts_as_meeting` for targets.
3. Every lead has exactly one owner. Reassignment (single or bulk) writes a timeline entry and notifies both employees.
4. Follow-up date due: reminder at the due time and listed under "Follow-ups Today" on the dashboard. Overdue follow-ups are highlighted and reported to the manager daily.
5. Employees see only leads in their scope (05). Export needs `crm.leads.export`.
6. Timeline is append-only: stage changes, notes, calls, emails, tasks, appointments, assignments, attachments.
7. CSV import: upload, column mapping, validation preview, duplicate report, assign rule (single owner or round robin across selected employees), import as a background job with a result report.

## F11 - Task lifecycle

```text
Creator (manager or employee for self) creates task:
   title, description, assignee, priority (low/normal/high/urgent),
   due date-time, optional lead link
  -> assignee notified
  -> statuses: To do -> In progress -> Done        (also: Cancelled)
  -> reminder [30 min] before due, overdue notification to assignee and creator
```

Rules: only the assignee or a user with `tasks.manage` in scope can change status. Completing a task linked to a lead writes a timeline entry. Recurring tasks are out of scope for 1.0.

## F12 - Call logging

Calls are logged by the employee from the lead screen.

```text
Lead -> "Log call" (or click phone number -> tel: link opens dialer,
        app shows the Log call form with a running timer)
  -> fields: direction (outbound/inbound), outcome, duration, notes,
     optional next follow-up date, optional stage change
  -> saved as call_log + timeline entry + metric events
```

Outcomes: Connected, No answer, Busy, Voicemail, Wrong number, Do not call. Outcome `Connected` counts toward the Connected Calls metric. Outcome `Do not call` sets the lead flag `do_not_call`, which blocks further call logging and shows a warning.

Rule: a call log can be edited by its author for [15] minutes, afterwards only with `crm.calls.manage`. If a telephony integration is added later (Q2), it writes the same `call_log` records with `source = integration`.

## F13 - Targets

Metric catalog (system-defined, computed from events):

| Metric key | Counted when |
|---|---|
| calls_total | call_log created |
| calls_connected | call_log created with outcome Connected |
| leads_created | lead created by or for the employee |
| leads_qualified | lead enters a stage marked `counts_as_qualified` (once per lead) |
| meetings_scheduled | appointment created, or lead enters a stage marked `counts_as_meeting` |
| closings | lead enters a stage of type won |
| revenue_won | sum of value of leads won |
| emails_sent | email sent from the app |
| tasks_completed | task set to Done |
| active_hours | active time from tracking |

Flow:

```text
Manager: Targets -> New target
   assignee: employee | team | role       period: daily | weekly | monthly
   metric + target value + valid from/to + active weekdays (daily only)
  -> each metric event updates target_progress for the current period
  -> desktop dashboard shows progress bars in real time
  -> at 80% and 100%: notification to employee; at period end below target:
     listed in manager report
  -> period end: snapshot row written (value, target, percent), new period starts
```

Rules:

- Period boundaries use the company timezone and configured week start. For night-shift employees the daily period follows the attendance date (F8), not midnight.
- A team target is the sum of member values. A role target applies individually to each employee with that role.
- An employee-level target overrides a role-level target for the same metric and period.
- Events are attributed to the acting employee at event time. Reassigning a lead later does not move past counts.
- Daily targets are not expected on leave days, holidays and weekly off days (shown as not applicable).

## F14 - Email

Full design in 10. Flow summary:

```text
Connect:  Admin -> Email -> Accounts -> Connect mailbox
            -> Google sign-in as that mailbox (internal OAuth app)
            -> backend stores encrypted refresh token, starts watch + first sync
Assign:   Admin -> Assign Accounts -> employee + mailbox + permissions
            (read, send, reply, draft, attach, download attachments,
             archive, mark read)  -> employee notified
Read:     App -> Email -> mailbox -> thread list (from server cache)
            -> open thread -> server fetches body from Gmail -> sanitized HTML
Send:     App -> compose / reply -> POST to server -> permission check
            -> server sends through Gmail API -> audit entry
            -> if recipient matches a lead: timeline entry + emails_sent metric
New mail: Gmail -> Pub/Sub -> server sync -> WebSocket "mail.new" -> badge
Remove:   Unassign or disable employee -> access gone immediately,
          nothing to revoke at Google because the employee never had a token
```

Rules: employees never receive a Google credential or token. Delete, settings, filters, forwarding and password actions do not exist in the API. Every read, send and download is written to the email audit log with the employee id.

## F15 - Notifications

| Event | Recipient | Channel |
|---|---|---|
| Lead assigned or reassigned | New owner, previous owner | In-app, toast |
| Task assigned, due soon, overdue | Assignee, creator (overdue) | In-app, toast |
| Follow-up due | Lead owner | In-app, toast |
| Target 80 percent, reached | Employee | In-app |
| New email in assigned mailbox | Assigned employees | Badge, optional toast |
| Device pending approval | Approvers | In-app (admin), email |
| Correction or leave requested, decided | Manager, employee | In-app, toast |
| Shift auto-closed | Employee, manager | In-app |
| Security alert (lockout, token reuse, tamper) | Admins with `security.view` | In-app (admin), email |
| Announcement from admin | Selected employees | In-app, toast |

Delivery: server stores the notification, pushes over WebSocket if online, otherwise delivered at next connect. Read state per recipient. Toasts respect a per-user mute setting except security and shift messages.

## F16 - Offboarding

```text
Admin -> Employee -> Disable
  -> dialog lists owned open items: leads, tasks, follow-ups, appointments
  -> admin selects new owner(s) (required when open items exist)
  -> confirm
  -> one transaction:
       status = disabled
       all sessions and refresh tokens revoked
       devices set to revoked
       mailbox assignments removed
       open shift auto-closed
       open items reassigned, timeline entries written
       targets ended
  -> WebSocket session.revoked -> app logs out, agent stops
  -> audit log entry
```

Rules: employee records are never hard-deleted (history and audit keep referencing them). Re-enable is possible and requires new device approval. The employee code is not reused. Reminder shown to the admin: also suspend the employee's own Google Workspace account, if they have one, in the Google Admin console.

## F17 - Lost, stolen or replaced device

```text
Admin -> Security -> Devices -> device -> Revoke
  -> device status = revoked, its sessions revoked, push session.revoked
  -> next login from that PC fails ("device not authorized")
Replacement PC -> F2 (new device pending -> approval)
```

Local data on the PC is limited to the encrypted segment queue and cached lists. On revoke with the app online, the app wipes its local cache and tokens.

## F18 - Desktop auto-update

```text
App checks updates.<domain> at start and every 4 hours
  -> newer version for this release channel (pilot | stable)?
  -> download in background, verify code signature
  -> no open shift: install on next app start
     open shift:   install at End Shift, or at next start
  -> version flagged "mandatory": app blocks Start Shift until updated
Agent and watchdog are shipped inside the same installer and updated together.
```

Server keeps `min_supported_version`. Older clients receive HTTP 426 and are forced to update.

## F19 - Viewing employee data (admin side)

```text
Manager -> Workforce -> Activity -> employee + date
  -> permission + scope check (own team only for Team Leader)
  -> day summary from rollups -> drill down: app -> domain -> time ranges
  -> every view of another person's activity detail is written to the audit log
```

## F20 - Daily journey summary

```text
Employee: open app -> auto login -> Start Shift -> dashboard
   -> works leads, calls, emails, tasks (targets update live)
   -> break / resume -> End Shift -> day summary shown -> close app
Manager: Admin Panel dashboard -> who is working / late / absent
   -> team targets -> overdue follow-ups -> approvals -> reports
```
