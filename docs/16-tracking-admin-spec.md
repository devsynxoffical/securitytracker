# 16 - Productivity Tracking: Timesheets and Reports

Extends 03 F6 and F7, 04 section 6 and 09. Agent-side behaviour stays in 09. This file specifies what the server computes and what the Admin Panel shows. Requirement IDs continue the FR-TRK series.

## 1. Concepts

| Term | Definition |
|---|---|
| Tracked time | Time inside a shift in state WORKING covered by segments (active + idle), excluding locked |
| Active time | Segments of kind active, including activity exceptions (call, meeting, mic) |
| Idle time | Segments of kind idle |
| Activity percent | active / (active + idle) for the period, 0 when nothing tracked |
| Manual time | Time added by the employee for work away from the PC, approved by a manager. Shown separately, never mixed into activity percent |
| Productive, neutral, unproductive | Category from productivity rules applied to app and domain, default neutral |
| Uncategorised | App or domain seen in rollups with no matching rule |

## 2. Functional requirements

| ID | Requirement | P |
|---|---|---|
| FR-TRK-16 | Timesheet per employee: daily rows for a week or month with tracked, active, idle, manual, break, activity percent, first start, last end; team view with one row per employee; CSV export | M |
| FR-TRK-17 | Manual time entries: date, start, end, reason; pending until approved by `tracking.timesheets.approve` in scope; approved time appears on the timesheet and attendance day as `manual_s` | M |
| FR-TRK-18 | Team activity dashboard for a day: per employee tracked time, activity percent, top app, top domain, current status; sort and threshold highlighting (below 50 percent amber, below 30 red) | M |
| FR-TRK-19 | Apps and URLs report: aggregated across selected employees and period, time per app and per domain, category, employee count, drill to employees | M |
| FR-TRK-20 | Uncategorised queue: apps and domains without a rule ordered by total time, bulk categorise creates rules (FR-TRK-10) | M |
| FR-TRK-21 | Productivity rules UI: company default and per department override, pattern matching (exact, prefix, wildcard) | M |
| FR-TRK-22 | Activity timeline per employee and day: 24 h bar with active, idle, break, offline, locked segments and app detail on hover (FR-TRK-08) | M |
| FR-TRK-23 | Idle and tamper report: long idle periods above threshold, tamper events per employee and device | M |
| FR-TRK-24 | Tracking settings: idle threshold, long idle threshold, capture window titles, exception apps, exclusions | M |
| FR-TRK-25 | Weekly activity summary email to managers | L |
| FR-TRK-26 | Screenshots | L (08 section 3) |

Rule 8 of AGENTS.md applies: counts only, never key values, clipboard or screen content.

## 3. Flows

### F27 - Manual time

```text
Employee: Timesheet -> day -> Add time (start, end, reason)   permission attendance.view own
  -> must not overlap tracked segments or another manual entry of the day -> MANUAL_TIME_OVERLAP
  -> pending; approver (tracking.timesheets.approve in scope) notified
  -> approve: attendance_day.manual_s += duration, timesheet shows it, audit
     reject: comment, employee notified
```

## 4. Permissions

| Key | Meaning |
|---|---|
| tracking.view_summary / view_detail / manage_rules (existing) | Per 05 |
| tracking.timesheets.approve (new) | Approve manual time. Default: Team Leader team, Manager department, Admin all |

## 5. Data model

| Table | Key columns |
|---|---|
| manual_time_entries | company_id, employee_id, date, started_at, ended_at, duration_s, reason, status (pending, approved, rejected), decided_by, decided_at, comment |
| attendance_days (changed) | add manual_s |
| activity_daily_summaries (changed) | add locked_s, long_idle_count |

Everything else uses the existing rollups (`activity_daily_summaries`, `activity_daily_apps`, `activity_daily_domains`), `shifts`, `attendance_days` and `tamper_events`.

## 6. API

| Method | Path | Permission |
|---|---|---|
| GET | /tracking/timesheet?employeeId&from&to (format=csv) | tracking.view_summary |
| GET | /tracking/timesheet/team?date&from&to&departmentId&teamId | tracking.view_summary |
| GET | /tracking/team-activity?date | tracking.view_summary |
| GET | /tracking/reports/apps?from&to&employeeIds&departmentId ; /tracking/reports/domains | tracking.view_detail |
| GET | /tracking/uncategorised?from&to&type=app|domain ; POST /tracking/uncategorised/categorise {items:[{type, pattern, category, departmentId?}]} | tracking.manage_rules |
| PATCH, DELETE | /tracking/productivity-rules/:id (DELETE exists) ; DELETE /tracking/exclusions/:id ; DELETE /tracking/exception-apps/:id | tracking.manage_rules |
| GET | /tracking/idle-report?from&to ; GET /tracking/tamper-events?from&to&employeeId | tracking.view_detail |
| GET, POST | /tracking/manual-time ; POST /tracking/manual-time/:id/decide ; DELETE /tracking/manual-time/:id (own pending) | attendance.view / tracking.timesheets.approve |
| GET, PATCH | /tracking/settings | tracking.manage_rules |

Existing endpoints (`/tracking/summary`, `/apps`, `/domains`, `/timeline`) stay.

Error codes: `MANUAL_TIME_OVERLAP`, `MANUAL_TIME_INVALID_STATE`.

## 7. Admin Panel screens

Module "Tracking": Team activity (today), Timesheets (employee and team, week and month, approve manual time), Activity timeline (employee, day), Apps and URLs, Uncategorised, Productivity rules, Idle and tamper, Settings.

## 8. Tests

Unit: activity percent, timesheet aggregation across shifts of one day, manual time overlap, uncategorised detection, rule pattern matching. Integration: one allowed and one denied role per endpoint.
