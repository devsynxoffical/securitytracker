# Admin UI end-to-end QA

Playwright drives the built admin (static export in `out/`) through the real login against a running API and
clicks through every module flow: CRM, Tasks, People, Tracking, Mail, Security, command palette. Any console
error, any HTTP response of 400 or more, any browser `confirm`/`prompt` dialog or raw error text fails the flow.

```bash
pnpm --filter @company-os/api dev                       # API on :4000 with the seeded database
pnpm --filter @company-os/admin build                   # refresh out/
QA_TOTP_SECRET=<secret printed by the API e2e suite> pnpm --filter @company-os/admin qa          # all flows
QA_TOTP_SECRET=... node qa/run.mjs People               # one module
```

Environment: `QA_EMAIL`, `QA_PASSWORD` (seeded Super Admin by default), `QA_TOTP_SECRET` (required),
`QA_PORT` (static server, default 3999), `QA_OUT_DIR` (where `fail-*.png` screenshots are written),
`PLAYWRIGHT_MODULE` (path to a pre-installed playwright when it is not resolvable from this folder).
