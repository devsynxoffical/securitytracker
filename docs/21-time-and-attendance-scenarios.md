# 21 - Time and attendance: how the clock works, every scenario

Plain-language companion to 03 (F5 to F9) and 15. It answers "what happens when" for the desktop app, the tracker and the attendance computation. Settings in brackets are company settings (06 section 7, admin Settings → Shift policy); the value shown is the default.

## 1. Principles

1. **Nothing is counted until the employee presses Start shift.** Opening the laptop, logging into Windows, or opening WorkPulse does not start the clock. Optional policy `autoStartShiftOnLogin` [off] can start it automatically, but only inside the scheduled window (section 4).
2. **The server owns time.** Start, break and end timestamps are assigned by the server when the event arrives. Offline events carry the monotonic elapsed time since the last confirmed sync, so a wrong laptop clock cannot move them.
3. **Tracking only inside a shift, counts only.** Between End shift and the next Start shift the agent is stopped. During a shift it records which app or site was in front, for how long, how many keys and clicks happened, and whether the employee was active, idle or locked. Never key values, clipboard, screenshots or window titles [captureWindowTitles off].
4. **The schedule gives the meaning.** A shift schedule (workdays, start, end, grace, half-day percent) is assigned to each employee. It decides the attendance date, late, left early, half day, weekly off and the reminders. Without a schedule everything is still recorded and flagged `unscheduled`.
5. **Attendance is computed, never typed.** A shift is raw truth. Attendance days are derived from shifts, schedule, holidays and leave by a job, and recomputed when late data or an approved correction arrives. Corrections add adjustment records; they never edit tracked data.

## 2. A normal day

```text
08:55  Employee opens the laptop. App starts with Windows in the tray. Nothing is counted.
08:58  Opens WorkPulse, presses Start shift.   -> shift starts 08:58 (server time), tracking on,
                                                  live board shows "Working", attendance check-in 08:58
10:40  Walks away. After 5 min without input   -> idle segment, backdated to 10:40 [idleThresholdSeconds 300]
11:05  Returns (25 min away)                   -> "You were away for 25 minutes: Break / Working away from PC"
                                                  [longIdleThresholdSeconds 1800 → prompt at 30 min; shorter stays idle]
13:00  Presses Break (lunch)                   -> break record, tracking paused, timer shows break time
13:45  Presses Resume                          -> break closed, tracking on
18:03  Presses End shift                       -> end 18:03, totals computed, day summary shown
```

Working time formula (03 F5): `working = (end − start) − breaks − offline gaps`; `active` is the sum of active segments; `idle = working − active`.

## 3. Scenario matrix

| # | What the employee does | What the system does | Attendance effect |
|---|---|---|---|
| 1 | Opens the laptop or the app before the shift (07:30 for a 09:00 schedule) and does nothing else | Nothing is counted. Dashboard shows "Off shift · next shift today 09:00". | None |
| 2 | Presses Start shift early (07:30 for 09:00) | Shift starts 07:30. More than 60 min early → shift flagged `early_start`. If `countEarlyStart` [on] the time counts; if off, the minutes before 09:00 are stored but excluded from working time (`early_clipped`). | Check-in 07:30, flag `early_start` |
| 3 | Presses Start shift far outside the schedule (after scheduled end, on a weekly off, holiday or leave day) | The app asks "Your schedule today is 09:00–18:00. Start anyway?" Confirmed shifts are flagged `outside_schedule` (or `unscheduled` without a schedule) and still count. | Day computed from the real times; flag kept for the manager |
| 4 | Forgets to press Start shift | At scheduled start + grace [10 min] the app shows an OS notification and a dashboard banner with a Start button; repeated once at +30 min. The server sends the same notification (works when the app is closed) and tells the manager at +60 min. Live board shows "Not started". | If a shift starts later: `late`. If none all day: `absent` |
| 5 | Opens the app at midnight after work, just to look | Nothing is counted unless Start shift is pressed. If pressed by mistake and ended within [minShiftMinutes 5], the shift is flagged `short_shift`. | Short shift does not create "late" or "present" on its own; it is visible to the manager |
| 6 | Logs in on a day when `autoStartShiftOnLogin` is on | The shift starts automatically only when today is a workday, not a holiday or leave day, now is between scheduled start − [30 min] and scheduled end, and no shift was ended today already. Toast: "Shift started automatically at 09:02 (company policy)". Otherwise nothing happens. | As a normal start |
| 7 | Closes the WorkPulse window during a shift | The app keeps running in the tray; the shift continues. Quit asks: End shift and quit / Keep running in tray / Cancel. | None |
| 8 | Locks the screen | Treated as idle from the moment of lock. The shift stays open. | Idle time |
| 9 | Laptop goes to sleep, lid closed, for 20 minutes | Agent closes the segment. On wake the app reconciles with the server; the shift is still open (gap under the auto-close window). The sleep period is recorded as `offline`, not as working time. | 20 min offline, not counted as working |
| 10 | Closes the lid at 18:00 without End shift and opens it next morning | Heartbeats stop at 18:00. After [heartbeatTimeoutMinutes 10] the live board shows "Offline (last seen 18:00)". After 2 h without heartbeat (job every minute) the server closes the shift with end time = last heartbeat or last uploaded segment (18:00) and flags `auto_closed`; employee and manager are notified. Next morning the app receives `shift_closed`, shows "Your shift was closed automatically at 18:00 (no activity for 2 hours)" and is Off shift. | Check-out 18:00, flag `auto_closed`. Nothing is counted overnight |
| 11 | Forgets End shift but keeps the PC on with no input overnight | Idle segments accumulate; the heartbeat keeps coming, so no auto-close by inactivity. At scheduled end + [endReminderMinutes 15] the app asks "Your shift was scheduled to end at 18:00: End now / Keep working". If ignored, the shift closes at [maxShiftHours 16] with flag `auto_closed`, `max_length`. | Working time includes the idle hours until the auto-close; the manager sees a large idle share and the flag; a correction can fix the end time |
| 12 | Shuts the PC down or logs off Windows during a shift | With `autoEndShiftOnShutdown` [off] the shift stays open and is auto-closed later (as 10). With it on, the app queues an End event at the shutdown time and the shift ends exactly then. | Check-out at shutdown time (policy on) or last heartbeat (policy off) |
| 13 | Internet drops during a shift | Nothing changes for the employee except an "Offline, tracking continues" badge after 60 s. The agent records locally; Start, Break, Resume and End keep working and are queued. Live board shows "Offline (last seen …)". On reconnect, events then segments upload in order; the day is rebuilt and marked "synced late". | Full data once synced; only periods with no data at all stay `offline` |
| 14 | Offline for longer than the auto-close window, then reconnects | The server had closed the shift provisionally. Late data rebuilds it from the real segments; the flag becomes `recovered`. | Correct times after sync |
| 15 | PC restarts (crash, update) during a shift | Watchdog starts the agent, the app starts with Windows, the open shift resumes from local state ("Shift resumed"). The restart gap is `offline`. | Restart minutes not counted |
| 16 | App crashes or is killed | The agent keeps tracking to its local queue; the watchdog relaunches the app; nothing is lost. | None |
| 17 | Starts a shift on a second device while one is open elsewhere | 409: "Your shift is running on LAPTOP-01". The device limit [1 approved device] normally prevents this. | None |
| 18 | Changes the Windows clock | Durations use the monotonic clock, so nothing changes. A jump over 2 min is logged as `clock_changed` and shown to the manager. | None |
| 19 | Takes a break and forgets to resume | At [breakAllowanceMinutes 60] the app shows "Break allowance reached" with a Resume button and the server sends a notification. Breaks above the allowance flag the day `break_exceeded`. The shift still auto-closes at max length. | Break time excluded from working time; flag |
| 20 | Works a night shift 20:00–04:00 | The whole shift belongs to the start date (attendance date = the scheduled shift whose start is closest, window 4 h before to 8 h after). | One attendance day |
| 21 | Works a split shift (two shifts on one date) | Allowed. Times are summed, check-in = first start, check-out = last end. | One attendance day |
| 22 | Arrives late (09:25 for 09:00, grace 10) | Shift starts 09:25. | Status `late`, `lateSeconds` 1500 |
| 23 | Leaves early (16:30 for 18:00) | Shift ends 16:30. | Flag `left_early` (not when auto-closed) |
| 24 | Works 3 of 8 scheduled hours | Normal shift. | Status `half_day` (under [halfDayPercent 50]); `late` kept as a flag |
| 25 | Does not work on a weekly off, a holiday, or an approved leave day | Nothing to do. | `weekly_off`, `holiday`, `on_leave` |
| 26 | Does not work on a scheduled workday without leave | Reminders as in 4. | `absent` |
| 27 | Disagrees with a day (missed start, wrong break, system issue) | Attendance → day → Request correction with times and reason → manager approves or rejects → adjustment record added, day recomputed and flagged `corrected`. Tracked data is never edited. | Corrected values, flag |
| 28 | Manager edits time | Only through manual time (tracking) or corrections, both audited with approver and reason. | Flag `corrected` / manual time |
| 29 | Employee is revoked or offboarded during a shift | The next API call fails; the app ends the shift locally, uploads what it has, wipes tokens and returns to the login screen. | Shift ends at the last event |

Every flag is visible on the attendance sheet and the employee's day drawer in the admin panel, and in the CSV export.

## 4. Settings that change the behaviour (Settings → Shift policy)

| Setting | Default | Effect |
|---|---|---|
| `autoStartShiftOnLogin` | off | Start the shift automatically inside [scheduled start − `autoStartWindowMinutesBefore` (30), scheduled end] |
| `autoEndShiftOnShutdown` | off | End the shift at OS shutdown or log-off instead of leaving it for the auto-close |
| `countEarlyStart` | on | Count minutes worked before the scheduled start |
| `startReminderEnabled` | on | Reminders when the scheduled start + grace passes without a shift |
| `endReminderMinutes` | 15 | Minutes after the scheduled end before the "End your shift?" prompt |
| `breakReminderAtAllowance` | on | Prompt when a break reaches the allowance |
| `breakAllowanceMinutes` | 60 | Break time per shift before `break_exceeded` |
| `minShiftMinutes` | 5 | Shifts shorter than this are flagged `short_shift` |
| `idleThresholdSeconds` | 300 | No input before an idle segment starts |
| `longIdleThresholdSeconds` | 1800 | Idle length that triggers the Break / Working away prompt |
| `longIdlePrompt` | on | Show that prompt at all |
| `heartbeatTimeoutMinutes` | 10 | "Offline" on the live board after this many minutes without heartbeat |
| `maxShiftHours` | 16 | Auto-close a shift longer than this |
| Schedule `graceMinutes` | 10 | Late threshold and left-early tolerance |
| Schedule `halfDayPercent` | 50 | Half-day threshold |

## 5. The same care in the other modules

| Module | Edge rules already in place |
|---|---|
| CRM | Lead conversion is one transaction (account, contact, deal) and cannot double-convert; duplicate detection on email and phone at create and import; a deal's stage history is append-only; follow-up reminders fire once per activity (job every minute, idempotent); export respects the caller's scope |
| Tasks | One assignee change per event, status history append-only; a task cannot be its own parent and subtask depth is limited; due-soon and overdue reminders once per task per day; time entries cannot overlap for one employee |
| Mail | The server is the only mail client; no delete, trash, filter or settings endpoints; replies go through the company mailbox; two people opening the same conversation see each other (presence); internal notes are never sent; attachment downloads are permission-checked and audited |
| Leave | Balance checked before a request, overlap with an existing request rejected, working days counted against the schedule and holidays, approval and cancellation transitions are explicit and audited; approved leave feeds attendance as `on_leave` |
| Devices and sessions | One approved device per employee [1]; a copied token is useless on another PC (device signature); refresh token reuse revokes the family and raises an alert; pending devices expire after 7 days |
| Jobs | Every scheduled job is idempotent (notification keys, upsert by client UUID), can be run by hand from the admin panel, and reports its last outcome |
