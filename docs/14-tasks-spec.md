# 14 - Tasks Specification (Spaces, Lists, Tasks)

Extends 03 F11 and 04 section 8. Where this file and an older file disagree, this file wins for the Tasks module. Requirement IDs continue the FR-TASK series. The existing `tasks` table and the CRM "task" activity keep working; this module turns tasks into a full work-management system.

## 1. Object model

```text
space 1-n list 1-n task 1-n subtask (task.parent_id)
list 1-n status (ordered, grouped open | active | done | closed)
task n-n assignee (task_assignees, first one is primary = tasks.assignee_id)
task n-n watcher ; task n-n tag (record_tags, entity_type = task)
task 1-n checklist 1-n item ; task 1-n comment ; task 1-n time_entry ; task 1-n activity
task 0..1 -> lead | contact | account | deal (CRM links)
```

Rules:

1. A space groups lists for a department, team or project. `visibility` is `company` (everyone with `tasks.view`) or `private` (members only). Admins with `tasks.spaces.manage` see every space.
2. A list owns its statuses. A new list copies the space's default statuses: To do (open), In progress (active), In review (active), Done (done), Cancelled (closed). At least one status per group `open` and `done` must exist.
3. `tasks.status` (todo, in_progress, done, cancelled) stays as the coarse status for metrics and the desktop app and is derived from the status group on every write: open -> todo, active -> in_progress, done -> done, closed -> cancelled.
4. Moving a task to a `done` status sets `completed_at` and records `tasks_completed` once per task (F13). Reopening clears `completed_at`; the metric is not reversed.
5. A subtask belongs to the same list as its parent and has at most one level (no sub-subtasks).
6. Scope: a task is in scope when its creator or any assignee is in the caller's scope, or the caller is a member of a private space that contains it. Lists and spaces are visible when the caller may see the space.
7. Only an assignee, the creator or a user with `tasks.manage` in scope can change status, assignees or dates (F11).
8. Time entries are manual (start, end or duration) and count toward `time_spent_s` on the task. They never come from the tracker; tracker time stays in 16.

## 2. Functional requirements

| ID | Requirement | P |
|---|---|---|
| FR-TASK-06 | Spaces: name, colour, icon, visibility, members, default statuses | M |
| FR-TASK-07 | Lists per space with ordered custom statuses (name, colour, group) | M |
| FR-TASK-08 | Task fields: title, description (markdown), status, priority (urgent, high, normal, low, none), assignees, start and due date-time, time estimate, tags, parent, CRM link, custom fields (custom_field_defs entity task) | M |
| FR-TASK-09 | Subtasks, checklists with items, progress shown on the parent | M |
| FR-TASK-10 | Comments with @mentions (notify mentioned employees) and an append-only activity log per task | M |
| FR-TASK-11 | Watchers: assignees, creator and mentioned users are added automatically and notified on status, assignee and comment changes | M |
| FR-TASK-12 | Views per list: List (grouped by status), Board (columns = statuses, drag to move), Calendar (by due date), Table | M (list, board), S (calendar) |
| FR-TASK-13 | My Tasks across spaces grouped Today, Overdue, Upcoming, No date, Done; Workload view per assignee (open count, estimate) | M |
| FR-TASK-14 | Manual time entries on tasks (start, end or duration, note). Time spent vs estimate on the task | M |
| FR-TASK-15 | Bulk actions: status, assign, priority, due date, move to list, tag, archive | M |
| FR-TASK-16 | Archive (soft) and restore tasks and lists | M |
| FR-TASK-17 | Reminders: due soon (30 min) and overdue notifications to assignees and creator (job followup-reminder) | M |
| FR-TASK-18 | Recurring tasks | L |

## 3. Flows

### F24 - Task lifecycle (replaces F11 detail)

```text
Create task in a list (title, assignees, priority, due, estimate, description)
  -> status = first open status of the list ; watchers = creator + assignees ; activity created
  -> assignees notified (task_assigned)
  -> work: comments, checklist, subtasks, time entries, status moves (any to any)
  -> status in group done: completed_at set, metric tasks_completed, watchers notified
  -> archive: archived_at set, hidden from views, restorable
```

Overdue: `due_at < now` and status group not done or closed.

## 4. Permissions

| Key | Meaning |
|---|---|
| tasks.view (existing) | See tasks in scope |
| tasks.create (existing) | Create tasks for self (own) or for employees in scope |
| tasks.assign (existing) | Assign others in scope |
| tasks.manage (existing) | Edit any task in scope, archive, bulk, manage lists in visible spaces |
| tasks.spaces.manage (new) | Create, edit, archive spaces and their members; see every space |

Default matrix: `tasks.spaces.manage` Admin and Super Admin `all`, Manager `department`. Others unchanged from 05.

## 5. Data model

| Table | Key columns |
|---|---|
| task_spaces (SD) | company_id, name, colour, icon, visibility (company, private), default_statuses jsonb, position, created_by, archived_at |
| task_space_members | space_id, employee_id, role (member, admin). Unique (space_id, employee_id) |
| task_lists (SD) | company_id, space_id, name, description, position, archived_at |
| task_statuses | list_id, name, colour, group (open, active, done, closed), position. Unique (list_id, name) |
| tasks (changed) | add list_id null (null = legacy CRM task, shown in a system list "CRM follow-ups"), parent_id null, status_id null, start_at, time_estimate_s, time_spent_s, position, archived_at, custom jsonb, contact_id, account_id, deal_id, created_by (= creator_id) |
| task_assignees | task_id, employee_id, assigned_by, assigned_at. Unique (task_id, employee_id) |
| task_watchers | task_id, employee_id. Unique |
| task_checklists | task_id, title, position |
| task_checklist_items | checklist_id, title, done, done_by, done_at, position |
| task_comments | task_id, author_id, body, mentions uuid[], edited_at, deleted_at |
| task_time_entries | task_id, employee_id, started_at null, ended_at null, duration_s, note, created_at |
| task_activities | company_id, task_id, actor_id, type (created, status_changed, assigned, unassigned, field_changed, comment, checklist, subtask_added, time_logged, archived, restored, moved), data jsonb, occurred_at. Append-only |

## 6. API

All lists cursor paginated. Scope rules from section 1.

| Method | Path | Permission |
|---|---|---|
| GET, POST | /tasks/spaces | tasks.view / tasks.spaces.manage |
| PATCH, DELETE | /tasks/spaces/:id ; POST /tasks/spaces/:id/members, DELETE /tasks/spaces/:id/members/:employeeId | tasks.spaces.manage |
| GET, POST | /tasks/lists?spaceId= | tasks.view / tasks.manage |
| PATCH, DELETE | /tasks/lists/:id ; POST /tasks/lists/:id/statuses, PATCH /tasks/lists/:id/statuses/:statusId, DELETE ..., POST /tasks/lists/:id/statuses/reorder | tasks.manage |
| GET | /tasks (filters: listId, spaceId, assigneeId, statusId, group, priority, dueFrom, dueTo, tagId, search, includeArchived, parentId) | tasks.view |
| GET | /tasks/my?range=today|overdue|upcoming|nodate|done | tasks.view (own) |
| GET | /tasks/workload?spaceId= | tasks.view |
| GET | /tasks/board?listId= | tasks.view |
| POST | /tasks | tasks.create |
| GET, PATCH | /tasks/:id | tasks.view / tasks.view (+ rule 7) |
| POST | /tasks/:id/status, /tasks/:id/assignees, DELETE /tasks/:id/assignees/:employeeId | tasks.view (+ rule 7) |
| POST | /tasks/:id/comments ; PATCH, DELETE /tasks/:id/comments/:commentId | tasks.view |
| POST | /tasks/:id/checklists ; POST /tasks/:id/checklists/:cid/items ; PATCH /tasks/:id/checklists/:cid/items/:iid ; DELETE ... | tasks.view (+ rule 7) |
| GET, POST | /tasks/:id/time-entries ; DELETE /tasks/:id/time-entries/:entryId (author or tasks.manage) | tasks.view |
| GET | /tasks/:id/activities | tasks.view |
| POST | /tasks/:id/archive, /tasks/:id/restore | tasks.manage |
| POST | /tasks/bulk (action: status, assign, priority, due, move, add_tag, remove_tag, archive) | tasks.manage |
| PATCH | /tasks/:id/status keeps the legacy body `{status}` working for the desktop app by mapping to the list's first status of that group | tasks.view |

Error codes: `TASK_STATUS_NOT_IN_LIST`, `TASK_SUBTASK_DEPTH`, `SPACE_PRIVATE`.

## 7. Admin Panel screens

Module "Tasks": My Tasks, Spaces (sidebar tree space > list), List view (List, Board, Table, Calendar segmented), Task drawer (title, status, assignees, dates, priority, estimate vs spent, description, subtasks, checklists, comments, activity, time entries), Workload, Settings (spaces, members, statuses).

## 8. Tests

Unit: status group derivation, completed_at and metric once, scope (assignee, creator, private space member), subtask depth, bulk permission checks. Integration: one allowed and one denied role per endpoint.
