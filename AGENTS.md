# Project rules for AI coding agents

## Source of truth
- docs/ is authoritative. Read the files named in the task before coding.
- If the task conflicts with docs/, stop and say so. Do not improvise.

## Stack
- Backend: NestJS, TypeScript strict, Prisma, PostgreSQL 16, Redis, BullMQ.
- Admin: Next.js App Router, React, Tailwind, shadcn/ui, TanStack Query.
- Desktop: Electron (electron-vite), React. Agent: C# .NET 8.
- Shared: packages/contracts (Zod). All DTOs, enums, permission keys, WebSocket events come from there.

## Hard rules
1. Every endpoint has @RequirePermission and uses the ScopeFilter in its repository query. No query on employee-owned data without it.
2. company_id comes from the session only. Never from the request body.
3. Every write creates an audit log entry through the audit interceptor.
4. Validate all input with the Zod schema from packages/contracts.
5. Timestamps: timestamptz in UTC. Use the injected Clock service, never Date.now() or new Date() in business logic.
6. No secrets, tokens, passwords or mail content in logs.
7. Desktop renderer has no Node access. All privileged work goes through the preload API. Tokens stay in the main process.
8. The tracker never records key values, clipboard, or screen content. Counts only. Do not add a keyboard hook.
9. The agent has no network code. Tracking must work with no internet.
10. Mail: no delete/trash/settings/filter endpoints. The backend is the only Gmail client.
11. Idempotency: desktop writes accept Idempotency-Key; ingest upserts by client UUID.
12. Migrations are forward-only and reviewed. Never edit an applied one.
13. Do not add dependencies without stating why. Pin versions.
14. Lists are paginated (cursor). No unbounded queries.

## Every feature must include
- contract (Zod) -> migration -> service -> controller -> tests -> UI
- tests: unit for rules, integration for the endpoint, one allowed and one denied case per role
- loading, empty and error states in the UI

## Style
- Small modules, one responsibility. No dead code. No TODO left behind without an issue reference.
- Error codes from packages/contracts/errors.ts.
- Commit message: "<area>: <change> (FR-XXX-NN)".

## When unsure
Ask. List the options and the doc section that is ambiguous.
