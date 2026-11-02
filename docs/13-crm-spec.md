# 13 - CRM Specification (Leads, Contacts, Accounts, Deals)

Extends 03 F10 to F12, 04 section 7, 05, 06 section 4 and 07 section 6. Where this file and an older file disagree, this file wins for the CRM module. Requirement IDs continue the FR-CRM series.

## 1. Object model

The CRM has four primary objects. Every object carries `company_id`, `owner_id`, `custom jsonb`, tags and a timeline.

| Object | Table | Purpose | Example |
|---|---|---|---|
| Lead | `leads` | Unqualified person or company, worked in a lead pipeline until converted, won or lost | "John Doe, Acme, from web form" |
| Contact | `crm_contacts` | A person we have a relationship with. Created manually or by converting a lead | "John Doe, CFO at Acme" |
| Account | `crm_accounts` | A company or organisation. Has many contacts and deals | "Acme Roofing Inc." |
| Deal | `deals` | A revenue opportunity on an account, worked in a deal pipeline | "Acme - 40 roofs, $120,000" |

```text
lead ---convert---> contact (1)  +  account (0..1)  +  deal (0..1)
account 1-n contact
account 1-n deal ; deal n-n contact (deal_contacts, one primary)
any object 1-n crm_activities (append-only timeline)
any object n-n tags (record_tags)
```

Rules:

1. A lead is converted at most once (`converted_at`, `contact_id`, `account_id`, `deal_id`). After conversion the lead is read-only and shows links to the created records.
2. Deals and leads use pipelines. A pipeline has `entity` = `lead` or `deal`. Stage rules from F10 (type open, won, lost, metric flags) apply to both.
3. Accounts and contacts have a `lifecycle` field instead of a pipeline: `lead`, `prospect`, `customer`, `churned`, `partner`. Winning a deal sets the account to `customer`.
4. Duplicate detection (F10) runs on leads and contacts: normalised phone (digits only) and lowercased email. Accounts are checked by normalised name and domain.
5. Every object has exactly one owner. Scope filtering uses `owner_id` for leads, contacts and deals. For accounts the scope is satisfied when the account owner is in scope or any deal or contact on the account is owned by someone in scope.

## 2. Functional requirements

| ID | Requirement | P |
|---|---|---|
| FR-CRM-17 | Contacts: first name, last name, title, phones, emails, account link, owner, lifecycle, address, tags, custom fields, do-not-contact flags | M |
| FR-CRM-18 | Accounts: name, domain, industry, size, phone, website, address, owner, lifecycle, parent account, tags, custom fields | M |
| FR-CRM-19 | Deals: name, account, contacts (one primary), pipeline, stage, amount, currency, expected close date, probability (from stage, overridable), owner, lost reason, tags, custom fields | M |
| FR-CRM-20 | Lead conversion: one action creates contact, optional new or existing account, optional deal. Timeline, notes, calls and tasks of the lead are copied as activities onto the new records | M |
| FR-CRM-21 | Unified activity timeline per record: note, call, email, meeting, task, stage change, assignment, field change, conversion, import. Append-only | M |
| FR-CRM-22 | Activities of type call, meeting and task carry a status (planned, done, cancelled) and due time and appear in the Activities list (today, overdue, upcoming) | M |
| FR-CRM-23 | Custom field definitions per object: text, number, date, select, multi_select, checkbox, url, phone, email. Required flag, position, options. Values validated on write | M |
| FR-CRM-24 | Tags: company-wide list with colour. Any record can carry any number of tags | M |
| FR-CRM-25 | Lead sources and lost reasons configurable | M |
| FR-CRM-26 | Saved views per object: name, filters, sort, columns, visibility (private, team, company) | S |
| FR-CRM-27 | Deal board (kanban) per pipeline with amount totals per stage and weighted forecast | M |
| FR-CRM-28 | Import CSV for leads, contacts and accounts with column mapping, preview, duplicate handling (skip, update, create) and owner assignment (fixed or round robin) | M |
| FR-CRM-29 | Export CSV for every object list, respects scope and filters, permission gated and audited | M |
| FR-CRM-30 | Bulk actions on lists: assign owner, add or remove tag, change stage, delete (soft) | M |
| FR-CRM-31 | Record detail: header, KPI strip, tabs (Overview, Activities, Notes, Deals or Contacts, Emails, Files), right rail with related records | M |
| FR-CRM-32 | Global CRM search across leads, contacts, accounts and deals by name, email, phone and account name | M |
| FR-CRM-33 | CRM dashboard: pipeline value by stage, deals won this month, conversion rate, activities today, leaderboard | S |
| FR-CRM-34 | Emails from a connected mailbox (10) that match a contact email are attached to the contact and deal timeline | S |

## 3. Flows

### F21 - Lead conversion

```text
Lead (open, not converted)  Actor: crm.leads.convert
  -> Convert dialog
       Contact: prefilled from lead (name split, phones, emails)       required
       Account: "create new" (prefilled company_name) | "use existing" | none
       Deal:    "create" (name, pipeline, stage, amount from lead value) | none
       Owner:   defaults to lead owner
  -> server, in one transaction:
       duplicate check for contact (phone, email) unless allowDuplicate
       create contact (+ account, + deal)
       copy lead activities to contact (and deal if created) with ref to the lead
       set lead.converted_at, contact_id, account_id, deal_id; lead moves to a stage
       of type won if the pipeline has one, otherwise keeps its stage
       activity 'converted' on the lead and 'created_from_lead' on new records
       metric event leads_converted (once per lead)
  -> notify new owner if different from actor
```

### F22 - Deal lifecycle

```text
Create deal (manual, from conversion, from account or contact page)
  -> owner notified
  -> stage moves (any to any), amount and close date edits write field_change activities
  -> Won: won_at, account.lifecycle = customer, metric closings + revenue_won
     Lost: lost reason required, lost_at
  -> reopening won or lost needs crm.deals.reopen
```

Probability: each stage has `probability` 0 to 100. A deal's `probability` defaults to the stage value on each stage move and can be overridden. Weighted forecast = sum(amount * probability / 100) of open deals.

### F23 - Import

```text
Upload CSV (max 20 MB, 50,000 rows)  Actor: crm.<object>.import
  -> server parses header, returns preview (first 20 rows) and import_job (status mapping)
  -> client sends mapping {column -> field | custom field | ignore}, options
       duplicates: skip | update | create
       owner: fixed employee | round robin [employee ids]
       tags to add, source, pipeline + stage (leads)
  -> job runs in the worker: validates each row with the Zod schema, applies duplicate
     rule, writes rows in batches of 500, writes import activity on each record
  -> result: totals {created, updated, skipped, failed}, error report CSV (row, reason)
```

## 4. Permissions

Added to the catalog in 05. Scope semantics are unchanged.

| Group | Keys |
|---|---|
| CRM leads | existing keys plus `crm.leads.convert` |
| CRM contacts | `crm.contacts.view`, `crm.contacts.create`, `crm.contacts.edit`, `crm.contacts.assign`, `crm.contacts.delete`, `crm.contacts.import`, `crm.contacts.export` |
| CRM accounts | `crm.accounts.view`, `crm.accounts.create`, `crm.accounts.edit`, `crm.accounts.assign`, `crm.accounts.delete`, `crm.accounts.import`, `crm.accounts.export` |
| CRM deals | `crm.deals.view`, `crm.deals.create`, `crm.deals.edit`, `crm.deals.assign`, `crm.deals.reopen`, `crm.deals.delete`, `crm.deals.export` |
| CRM config | `crm.pipelines.manage` (existing), `crm.config.manage` (custom fields, tags, sources, lost reasons, company saved views) |

Default role matrix additions (cell = scope):

| Permission | Employee | Team Leader | Manager | Admin | Super Admin |
|---|---|---|---|---|---|
| crm.leads.convert | own | team | department | all | all |
| crm.contacts.view / create / edit | own | team | department | all | all |
| crm.accounts.view / create / edit | own | team | department | all | all |
| crm.deals.view / create / edit | own | team | department | all | all |
| crm.*.assign | | team | department | all | all |
| crm.deals.reopen | | team | department | all | all |
| crm.*.delete | | | | all | all |
| crm.*.import / export | | | department | all | all |
| crm.config.manage | | | | all | all |

## 5. Data model

New tables. Conventions from 06 apply (uuid ids, `company_id`, timestamptz, soft delete through `deleted_at` where marked SD).

| Table | Key columns |
|---|---|
| crm_accounts (SD) | name, name_normalized, domain, industry, size, phone, website, address jsonb, owner_id, lifecycle, parent_account_id, custom jsonb, created_by, last_activity_at. Unique (company_id, name_normalized) where deleted_at is null |
| crm_contacts (SD) | first_name, last_name, title, account_id null, owner_id, lifecycle, address jsonb, do_not_call, do_not_email, custom jsonb, lead_id null (origin), created_by, last_activity_at |
| crm_contact_phones | contact_id, phone_e164, label, is_primary. Index on phone_e164 |
| crm_contact_emails | contact_id, email_lower, label, is_primary. Index on email_lower |
| deals (SD) | name, account_id null, pipeline_id, stage_id, amount, currency, probability, expected_close_at, owner_id, won_at, lost_at, lost_reason_id, custom jsonb, lead_id null (origin), created_by, last_activity_at |
| deal_contacts | deal_id, contact_id, role, is_primary. Unique (deal_id, contact_id) |
| crm_activities | company_id, entity_type (lead, contact, account, deal), entity_id, type (note, call, email, meeting, task, stage_changed, assigned, field_changed, converted, created, created_from_lead, imported, tag_added, tag_removed), actor_id, subject, body, status (planned, done, cancelled) null, due_at null, completed_at null, duration_s null, data jsonb, ref_type, ref_id, occurred_at. Append-only except status and completed_at on planned items. Index (company_id, entity_type, entity_id, occurred_at), (company_id, actor_id, due_at) |
| lead_sources | company_id, name, position, is_active |
| lost_reasons | company_id, name, position, is_active |
| tags | company_id, name, colour. Unique (company_id, name) |
| record_tags | company_id, entity_type, entity_id, tag_id. Unique (entity_type, entity_id, tag_id) |
| custom_field_defs | company_id, entity_type, key, label, type, options jsonb, required, position, is_active. Unique (company_id, entity_type, key) |
| saved_views | company_id, entity_type, name, owner_id, visibility (private, team, company), filters jsonb, sort jsonb, columns jsonb, is_default |
| import_jobs | company_id, entity_type, uploader_id, file_key, status (mapping, queued, running, done, failed), mapping jsonb, options jsonb, totals jsonb, report_key |

Changes to existing tables:

| Table | Change |
|---|---|
| pipelines | add `entity` (lead, deal), default lead |
| pipeline_stages | add `probability` int default 0 |
| leads | add `converted_at`, `contact_id`, `account_id`, `deal_id`, `priority` (low, normal, high) |
| lead_timeline | kept for existing leads. New lead events are written to `crm_activities`. Readers merge both until a data migration moves the rows |

## 6. API

All list endpoints: cursor pagination (`cursor`, `limit` max 200), `search`, `ownerId`, `tag`, `sort`, plus object filters. Responses follow 07 section 1.

| Method | Path | Permission |
|---|---|---|
| GET, POST | /crm/contacts | crm.contacts.view / create |
| GET, PATCH, DELETE | /crm/contacts/:id | view / edit / delete |
| POST | /crm/contacts/:id/assign, /crm/contacts/bulk | assign / edit |
| POST | /crm/contacts/check-duplicate | create |
| GET, POST | /crm/accounts | crm.accounts.view / create |
| GET, PATCH, DELETE | /crm/accounts/:id | view / edit / delete |
| POST | /crm/accounts/:id/assign, /crm/accounts/bulk | assign / edit |
| GET, POST | /crm/deals | crm.deals.view / create |
| GET, PATCH, DELETE | /crm/deals/:id | view / edit / delete |
| POST | /crm/deals/:id/stage, /crm/deals/:id/assign, /crm/deals/bulk | edit / assign / edit |
| GET | /crm/deals/board?pipelineId= | view (stages with deals and totals) |
| POST | /leads/:id/convert | crm.leads.convert |
| GET, POST | /crm/activities?entityType&entityId | view of the parent object |
| GET | /crm/activities/agenda?range=today|overdue|upcoming | own activities, or scope with crm.*.view |
| PATCH | /crm/activities/:id (status, completed_at only) | edit of the parent object |
| CRUD | /crm/config/sources, /crm/config/lost-reasons, /crm/config/tags, /crm/config/custom-fields | crm.config.manage (GET needs any crm.*.view) |
| GET, POST, PATCH, DELETE | /crm/views | any crm.*.view; company visibility needs crm.config.manage |
| POST | /crm/:entity/import (JSON `{fileName, csv}`, text up to 20 MB) -> job, POST /crm/import/:jobId/start, GET /crm/import/:jobId | crm.<entity>.import |
| GET | /crm/accounts/export, /crm/contacts/export, /crm/deals/export (CSV, same filters as the list, max 10,000 rows, audited) | crm.<entity>.export |
| GET | /crm/search?q= | any crm.*.view, results filtered per object permission and scope |
| GET | /crm/dashboard | crm.deals.view |

Error codes added to `packages/contracts/errors.ts`: `LEAD_ALREADY_CONVERTED`, `CONTACT_DUPLICATE`, `ACCOUNT_DUPLICATE`, `LOST_REASON_REQUIRED`, `CUSTOM_FIELD_INVALID`, `IMPORT_JOB_INVALID_STATE`, `PIPELINE_ENTITY_MISMATCH`.

## 7. Admin Panel screens

Module "CRM" in the sidebar: Dashboard, Leads, Contacts, Accounts, Deals, Activities, Import, Settings.

| Screen | Layout |
|---|---|
| List (every object) | Filter row: saved view selector, search, owner, tag, stage or lifecycle chips, "New" primary button. Table card with column chooser, row selection and bulk action bar, pagination footer. Leads and Deals have a List / Board segmented control |
| Board | One column per stage, header with count and amount total, drag card to move stage (lost asks for reason). Footer shows weighted forecast |
| Detail (drawer 720 px or full page) | Header card: name, badges (stage or lifecycle, tags), owner, primary actions (Log call, Note, Task, Meeting, Email, Convert). KPI strip. Tabs per FR-CRM-31. Right rail: related records and custom fields |
| Activities | Agenda grouped Today, Overdue, Upcoming, Done. Filter by type and owner |
| Import | Stepper: Upload, Map columns, Options, Review, Result |
| Settings | Tabs: Pipelines and stages (per entity, drag to reorder, probability), Custom fields (per object), Tags, Lead sources, Lost reasons |

Each screen implements the states in company-os-design/DESIGN-SYSTEM.md section 6. The UI hides controls the user lacks permission for. The server still enforces.

## 8. Tests

- Unit: conversion (creates contact, account and deal, copies activities, rejects a second conversion), deal stage rules (lost reason required, probability default, account becomes customer), custom field validation, import row validation and duplicate rules, scope filter on accounts (owner or related owner).
- Integration: each endpoint with one allowed and one denied role per 05, 404 for records outside scope, idempotency of import job start.
