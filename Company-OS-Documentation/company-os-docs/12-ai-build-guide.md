# 12 - AI Build Guide

How to build this system with AI coding models without losing consistency.

## 1. Working method

1. Put all files of this documentation into `docs/` in the repository. Put the rules from section 3 into `AGENTS.md` (and `CLAUDE.md` if the tool reads that name) at the repository root.
2. Work in small vertical slices: one feature = contract + migration + endpoint + tests + UI. Never ask for a whole module in one prompt.
3. For each slice give the model: `AGENTS.md`, the relevant flow from 03, the FR ids from 04, the tables from 06, the endpoints from 07, and the existing code of the neighbouring feature as a pattern.
4. Build the first feature of each kind by hand-reviewing closely (one CRUD endpoint, one guarded list, one job, one admin page, one desktop page). These become the reference patterns the model copies.
5. Contracts first. Change `packages/contracts`, then server, then clients. Never let the model invent a field in the UI that the contract lacks.
6. Tests are part of the prompt, not a later step. Require the role-matrix test for every endpoint.
7. Run lint, typecheck and tests after every change. Paste failures back to the model instead of fixing around them.
8. One branch and one pull request per slice. Review the diff yourself. Pay most attention to: scope filters, company_id handling, migrations, anything touching tokens or mail.
9. When the model proposes something that contradicts the docs, either reject it or update the docs first. The docs stay the source of truth.

## 2. Suggested build order (slices)

```text
P0  repo, contracts package, api skeleton, db, ci
P1  auth login -> refresh -> device registration -> admin 2fa
    -> employees crud -> roles/permissions + guard -> audit interceptor
    -> devices admin -> sessions admin
P2  electron shell (secure) -> login + device pending -> consent
    -> shift events api -> shift ui + offline queue -> heartbeat + auto-close
    -> schedules -> attendance job -> live board -> corrections
P3  agent spike -> pipe protocol -> segments + queue -> ingest api
    -> rollups -> extension + native host -> watchdog -> admin activity views
P4  pipelines -> leads crud + scope -> timeline -> notes -> calls
    -> appointments + follow-ups -> tasks -> import -> export
P5  metric events -> targets -> progress ws -> notifications -> dashboards
P6  oauth connect -> sync worker -> thread list -> thread view + sanitiser
    -> send/reply -> drafts -> assignments -> audit -> lead linking
P7  reports -> retention -> installer + signing -> auto-update -> load test
```

## 3. AGENTS.md (copy into the repository root)

```text
# Project rules for AI coding agents

## Source of truth
- docs/ is authoritative. Read the files named in the task before coding.
- If the task conflicts with docs/, stop and say so. Do not improvise.

## Stack
- Backend: NestJS, TypeScript strict, Prisma, PostgreSQL 16, Redis, BullMQ.
- Admin: Next.js App Router, React, Tailwind, shadcn/ui, TanStack Query.
- Desktop: Electron (electron-vite), React. Agent: C# .NET 8.
- Shared: packages/contracts (Zod). All DTOs, enums, permission keys,
  WebSocket events come from there.

## Hard rules
1. Every endpoint has @RequirePermission and uses the ScopeFilter in its
   repository query. No query on employee-owned data without it.
2. company_id comes from the session only. Never from the request body.
3. Every write creates an audit log entry through the audit interceptor.
4. Validate all input with the Zod schema from packages/contracts.
5. Timestamps: timestamptz in UTC. Use the injected Clock service, never
   Date.now() or new Date() in business logic.
6. No secrets, tokens, passwords or mail content in logs.
7. Desktop renderer has no Node access. All privileged work goes through
   the preload API. Tokens stay in the main process.
8. The tracker never records key values, clipboard, or screen content.
   Counts only. Do not add a keyboard hook.
9. The agent has no network code. Tracking must work with no internet.
10. Mail: no delete/trash/settings/filter endpoints. The backend is the
    only Gmail client.
11. Idempotency: desktop writes accept Idempotency-Key; ingest upserts by
    client UUID.
12. Migrations are forward-only and reviewed. Never edit an applied one.
13. Do not add dependencies without stating why. Pin versions.
14. Lists are paginated (cursor). No unbounded queries.

## Every feature must include
- contract (Zod) -> migration -> service -> controller -> tests -> UI
- tests: unit for rules, integration for the endpoint, one allowed and
  one denied case per role
- loading, empty and error states in the UI

## Style
- Small modules, one responsibility. No dead code. No TODO left behind
  without an issue reference.
- Error codes from packages/contracts/errors.ts.
- Commit message: "<area>: <change> (FR-XXX-NN)".

## When unsure
Ask. List the options and the doc section that is ambiguous.
```

## 4. Prompt template for one slice

```text
Task: Implement <feature name>.

Read first:
- AGENTS.md
- docs/03-flows.md section <F..>
- docs/04-modules-spec.md requirements <FR-...>
- docs/06-data-model.md tables <...>
- docs/07-api-spec.md endpoints <...>
- Reference implementation to follow: <path of similar feature>

Deliver, in this order:
1. Zod schemas in packages/contracts
2. Prisma migration
3. Service + controller with permission and scope
4. Tests (unit, integration, role matrix)
5. UI: <admin page | desktop page> with loading/empty/error states

Constraints:
- Do not change unrelated files.
- Do not add libraries.
- Stop and ask if the docs do not cover a case.

Finish with: list of files changed, how to test manually, open questions.
```

## 5. Review checklist for AI output

| Check | Question |
|---|---|
| Scope | Does every query filter by company and by the caller's scope? |
| Identity | Is the acting employee taken from the session, never from input? |
| Audit | Is there an audit entry for each write? |
| Contract | Do client and server use the same schema from contracts? |
| Time | Is the Clock service used? Are periods computed in company timezone? |
| Idempotency | Can the request be repeated without duplicates? |
| Errors | Are error codes from the shared list, and no internals leaked? |
| Tests | Is there a denied-access test, not only a happy path? |
| Secrets | Anything sensitive logged or returned? |
| Offline | Desktop feature: what happens with no network? |
| Docs | Does behaviour match the flow? If not, which one changes? |

## 6. Known traps for AI-generated code in this project

1. Tracker written as a Windows service only. It will compile and record nothing useful. Measurement belongs in the user-session agent.
2. Keyboard counting through a low-level hook that reads key codes. Use Raw Input counters.
3. Using the PC clock for attendance. Server time and monotonic durations only.
4. Giving the Electron renderer direct access to tokens or Node.
5. Storing Gmail tokens unencrypted or sending Google tokens to the desktop.
6. Scope check in the controller but an unfiltered query in the service.
7. Midnight-based "today" for night shifts. Use the attendance date.
8. Double counting metrics on retries. Use the unique key on metric_events.
9. Rendering email HTML directly in the app DOM.
10. Stopping the tracker when an upload fails. Upload and tracking are independent.
