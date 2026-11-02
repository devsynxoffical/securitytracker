# End-to-end API suites

Black-box checks against a running API with the seeded database (docs/11 section 4, integration level).
Each script logs in as the seeded Super Admin, exercises real endpoints in order and exits non-zero on
any failed check. They create their own records with unique suffixes and are safe to re-run.

| Script | Covers |
|---|---|
| `crm.e2e.mjs` | 2FA enrolment and login, CRM config, accounts, contacts, deals and board, activities and agenda, lead conversion, bulk actions, CSV import job, search, dashboard, export, saved views, stage reorder, audit |
| `modules.e2e.mjs` | Tasks (spaces, lists, tasks, subtasks, status, comments, checklists, time, board, workload, bulk), HR (leave types, balances, requests, calendar, holidays, sheet, corrections, profiles, documents, checklists, announcements, org chart, export), Tracking (timesheets, team activity, usage, uncategorised, rules, manual time, idle, tamper, settings), Mail config, Security, Settings, Reports, Targets |
| `auth-mail.e2e.mjs` | Setup status and bootstrap guard, forgot and reset password, mail collaboration on the demo mailbox (assign, comment, labels, snooze validation, close, reopen, events, send refusal), templates, CRM thread links, mailbox health, jobs status and manual run, files status |

Run:

```bash
export DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/company_os
pnpm --filter @company-os/api prisma:migrate && SEED_DEMO_MAILBOX=true pnpm --filter @company-os/api prisma:seed
pnpm --filter @company-os/api dev   # in another terminal
pnpm --filter @company-os/api test:e2e
```

The first run enrols 2FA for the Super Admin and prints `SMOKE_TOTP_SECRET=...`; export it for later runs.
`API_BASE_URL` overrides the target (default `http://localhost:4000/api/v1`).
