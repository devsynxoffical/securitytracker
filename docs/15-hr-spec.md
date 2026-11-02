# 15 - HR and Attendance Specification (People)

Extends 03 F8 and F9, 04 sections 3 and 5. Where this file and an older file disagree, this file wins for the HR module. Requirement IDs continue the FR-ATT and FR-ORG series and add FR-HR.

## 1. Scope

The HR module adds leave management with balances, employee profiles and documents, onboarding and offboarding checklists, announcements, and the admin screens for the attendance data that the shift and tracking modules already produce.

## 2. Functional requirements

| ID | Requirement | P |
|---|---|---|
| FR-HR-01 | Leave types: name, code, colour, paid, annual allowance (days), accrual (upfront, monthly), carry-over max days, requires approval, allow half day, active | M |
| FR-HR-02 | Leave balances per employee, type and year: entitled, carried over, used, pending, available. Computed from approved and pending requests | M |
| FR-HR-03 | Leave requests: type, dates, half day, reason; working days counted from the employee's schedule and holidays; approval or rejection with comment; cancel by employee while pending or by approver after approval | M |
| FR-HR-04 | Leave calendar per team and month; who is out today on the dashboard | M |
| FR-HR-05 | Holidays: date, name, optional flag. Yearly import of a list | M |
| FR-HR-06 | Schedule assignment per employee with effective dates (CRUD, history) | M |
| FR-HR-07 | Attendance sheet: month grid per employee with status per day, totals; filters by department and team; CSV export | M |
| FR-HR-08 | Attendance corrections: list pending, approve or reject, recompute day (F9) | M |
| FR-HR-09 | Live attendance board: status, check-in, active time, idle, current app category (FR-ATT-07) | M |
| FR-HR-10 | Employee profile: personal (date of birth, gender, nationality), contact (personal email, address, emergency contact), job (designation, employment type, work location, join date, probation end, manager), custom fields (entity employee) | M |
| FR-HR-11 | Employee documents: metadata (name, type, issued, expires, note). File body through /files when object storage is configured; until then metadata only. Expiry reminders 30 days before | S |
| FR-HR-12 | Onboarding and offboarding checklists from templates: items with owner role, due offset days, done state; progress on the employee profile; offboarding runs together with F16 | M |
| FR-HR-13 | Announcements: title, body (markdown), audience (company, department, team, role), pin, publish at; read receipts; delivered as notifications | M |
| FR-HR-14 | Org chart from the manager tree and department structure | S |
| FR-HR-15 | Employee directory with search, filters and CSV export (FR-ORG-06 import stays) | M |
| FR-HR-16 | Celebrations: birthdays (from date of birth) and work anniversaries (from join date) for the next N days, `GET /hr/celebrations?days=`, a card on the home page, and a daily job that notifies the manager and HR a day ahead and the company on the day | M |

## 3. Flows

### F25 - Leave request with balances

```text
Employee requests leave (type, from, to, half day, reason)
  -> days = working days in range per schedule minus holidays (half day = 0.5)
  -> if type.requires_approval: status pending, pending_days += days, approver (manager, else attendance.approve in scope) notified
     else: approved immediately
  -> balance check: available = entitled + carried - used - pending >= days, otherwise LEAVE_BALANCE_EXCEEDED
     (unpaid types skip the check)
  -> approve: used += days, pending -= days, attendance days become on_leave, employee notified
     reject: pending -= days, employee notified with comment
     cancel: reverses used or pending
```

Balances are rows in `leave_balances` maintained by the service on each transition and rebuilt by `hr-leave-rebalance` nightly for the current year. Accrual: `upfront` credits the allowance on 1 January (or join date pro rata in the first year); `monthly` credits allowance / 12 at each month start.

### F26 - Onboarding checklist

```text
Employee created (F1) with template chosen (or default onboarding template)
  -> checklist instance created, items due = join_date + offset_days
  -> items assigned to a role (HR, Manager, IT, Employee) -> listed on "My HR tasks" of users holding that role in scope
  -> item done -> progress; all done -> checklist completed
Offboarding (F16): same with the offboarding template, started from the disable dialog
```

## 4. Permissions

| Key | Meaning |
|---|---|
| attendance.view / approve / manage (existing) | Attendance and leave data per 05 |
| hr.leave.manage (new) | Leave types, balance adjustments |
| hr.profiles.view (new) | Read employee profile and documents in scope |
| hr.profiles.edit (new) | Edit profile and documents in scope |
| hr.checklists.manage (new) | Templates and checklist instances |
| announcements.send (existing) | Publish announcements |

Default matrix: `hr.*` Admin and Super Admin `all`; Manager `department` for profiles.view and checklists.manage; Team Leader `team` for profiles.view; Employee `own` for hr.profiles.view (own profile) and leave requests through attendance.view own.

## 5. Data model

| Table | Key columns |
|---|---|
| leave_types | company_id, name, code, colour, paid, annual_allowance_days decimal, accrual (upfront, monthly), carry_over_max_days, requires_approval, allow_half_day, is_active, position. Unique (company_id, code) |
| leave_balances | company_id, employee_id, leave_type_id, year, entitled_days, carried_over_days, used_days, pending_days, adjustments_days, updated_at. Unique (employee_id, leave_type_id, year) |
| leave_requests (changed) | add leave_type_id, days decimal, half_day, approver_id, cancelled_at, company_id |
| holidays (changed) | add is_optional |
| employee_profiles | employee_id unique, date_of_birth, gender, nationality, personal_email, address jsonb, emergency_contact jsonb, designation, employment_type (full_time, part_time, contract, intern), work_location, probation_end, custom jsonb |
| hr_documents | company_id, employee_id, name, type, issued_at, expires_at, note, object_key null, uploaded_by |
| hr_checklist_templates | company_id, name, kind (onboarding, offboarding), items jsonb [{title, ownerRole, offsetDays}], is_default |
| hr_checklists | company_id, employee_id, template_id, kind, status (open, completed), items jsonb [{id, title, ownerRole, dueAt, done, doneBy, doneAt}], started_at, completed_at |
| announcements | company_id, title, body, audience_type (company, department, team, role), audience_id null, pinned, published_at, created_by |
| announcement_reads | announcement_id, employee_id, read_at. Unique |

## 6. API

| Method | Path | Permission |
|---|---|---|
| CRUD | /hr/leave-types | attendance.view (GET) / hr.leave.manage |
| GET | /hr/leave-balances?employeeId&year ; POST /hr/leave-balances/adjust | attendance.view / hr.leave.manage |
| GET, POST | /leave-requests (existing POST kept) ; POST /leave-requests/:id/decide (existing) ; POST /leave-requests/:id/cancel | attendance.view / attendance.approve |
| GET | /hr/leave-calendar?month&departmentId&teamId ; GET /hr/out-today | attendance.view |
| CRUD | /holidays (GET, POST existing; add PATCH, DELETE, POST /holidays/import) | attendance.view / attendance.manage |
| CRUD | /schedules (existing GET, POST; add PATCH, DELETE) ; GET, POST /employees/:id/schedules ; PATCH, DELETE /employees/:id/schedules/:assignmentId | attendance.manage |
| GET | /attendance/sheet?month&departmentId&teamId (format=csv) | attendance.view |
| GET | /attendance/corrections?status= (existing POST and decide kept) | attendance.view |
| GET, PATCH | /hr/profiles/:employeeId | hr.profiles.view / edit |
| GET, POST, PATCH, DELETE | /hr/profiles/:employeeId/documents | hr.profiles.view / edit |
| CRUD | /hr/checklist-templates | hr.checklists.manage |
| GET, POST | /hr/checklists?employeeId&kind ; PATCH /hr/checklists/:id/items/:itemId ; GET /hr/checklists/my-items | hr.checklists.manage (own items: any) |
| GET, POST, PATCH, DELETE | /hr/announcements ; POST /hr/announcements/:id/read | attendance.view (GET, read) / announcements.send |
| GET | /hr/org-chart | employees.view |
| GET | /employees/export (csv) | employees.view + reports.export |

Error codes: `LEAVE_BALANCE_EXCEEDED`, `LEAVE_OVERLAP`, `LEAVE_TYPE_INACTIVE`, `CHECKLIST_ITEM_NOT_FOUND`.

## 7. Admin Panel screens

Module "People": Directory, Employee profile (tabs Overview, Job, Attendance, Leave, Documents, Checklists, Devices, Activity), Live attendance, Attendance sheet, Corrections, Leave requests, Leave calendar, Leave types and balances, Schedules and holidays, Onboarding, Announcements, Org chart.

## 8. Tests

Unit: working day counting with schedule and holidays, balance transitions (request, approve, reject, cancel), overlap detection, accrual math, checklist due dates. Integration: one allowed and one denied role per endpoint.
