# Infrastructure runbook

Implements 02-architecture.md section 5 and 08-security-privacy.md section 4.

| File | Purpose |
|---|---|
| `docker-compose.yml` | Local development backing services (Postgres, Redis, MinIO). Unchanged. |
| `docker-compose.prod.yml` | Production stack: Caddy proxy, api, worker, admin, postgres, redis, backup, optional MinIO (`--profile storage`). |
| `docker/api.Dockerfile` | API and worker image (same image, `WORKER_ENABLED=true` for the worker). |
| `docker/admin.Dockerfile` | Admin Panel static export served by Caddy on 8080. |
| `caddy/Caddyfile` | Public TLS termination for `api.`, `admin.`, `updates.` with HSTS and security headers. |
| `backup/pg-backup.sh` | Daily `pg_dump` with 30 day retention; WAL archived by Postgres into the same volume. |
| `.env.prod.example` | Every variable the stack reads. Copy to `.env.prod`, never commit. |
| `updates/` | Desktop installers and `latest.json`, served as `updates.<DOMAIN>` and `admin.<DOMAIN>/downloads/`. Filled by `release-desktop.yml` (19 section 9). |

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `DOMAIN`, `ACME_EMAIL` | proxy, admin build | Hostnames `api.<DOMAIN>`, `admin.<DOMAIN>`, `updates.<DOMAIN>` must point at the server before first start (Let's Encrypt). |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | postgres, api, backup | `DATABASE_URL` is assembled from these. |
| `JWT_SECRET` | api | 32+ random characters. Rotating it logs every session out. |
| `ENCRYPTION_SECRET` | api | 64 hex characters. Encrypts TOTP secrets and Gmail refresh tokens. Rotating it invalidates stored secrets: re-enrol 2FA and reconnect mailboxes. |
| `REDIS_URL` | api, worker | Set by compose to the internal `redis` service. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PUBSUB_TOPIC` | api, worker | From the client's Google Cloud project (10 section 3). Empty disables mailbox connect; the admin shows the setup steps. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` | api | Object storage for attachments and documents through presigned URLs. Empty makes `/files/*` answer 503 "Object storage not configured". For bundled MinIO use `http://minio:9000` and `S3_FORCE_PATH_STYLE=true`. |
| `IMAGE_API`, `IMAGE_ADMIN` | compose | Image tags; CI publishes `ghcr.io/<owner>/companyos-api` and `companyos-admin`. |

Secrets live in the host's secret store or `infra/.env.prod` with mode 600. Nothing in the repository.

## First deployment

1. Server: 4 vCPU, 8 GB RAM, 160 GB SSD (02 section 5), Docker Engine 24+ with Compose v2, ports 80 and 443 open. DNS A records for the three hostnames.
2. `git clone` the repository, `cp infra/.env.prod.example infra/.env.prod`, fill every value.
3. Build or pull images:
   `docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml build` (or `pull` after CI published them).
4. Start the data services first and confirm health:
   `docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d postgres redis`
5. Start the API. Its entrypoint runs `prisma migrate deploy` before listening (`RUN_MIGRATIONS=true`), then the worker, admin and proxy:
   `docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d`
6. Seed the first company and Super Admin once (never again on that database):
   `docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml exec api node -e "require('child_process').execSync('./node_modules/.bin/prisma db seed', {stdio:'inherit'})"`
   or run `pnpm --filter @company-os/api prisma:seed` from a workstation with `DATABASE_URL` pointing at the server over an SSH tunnel.
7. Open `https://admin.<DOMAIN>`, sign in, enrol 2FA, change the seeded password.

## Health endpoints

| URL | Meaning |
|---|---|
| `GET /api/v1/health` | Process up. Used by the Docker healthcheck and Caddy. |
| `GET /api/v1/health/ready` | Database reachable. Used before the proxy routes traffic. |

## Upgrades

1. CI publishes new image tags on `main`. Set `IMAGE_API` and `IMAGE_ADMIN` in `.env.prod` to the new tag (or keep `latest` and `pull`).
2. `docker compose ... pull api worker admin`
3. `docker compose ... up -d api` — migrations run first; the old container keeps serving until the new one is healthy only if you use `--no-deps --scale api=2` style rolling restarts; for a single node a few seconds of downtime is expected (NFR-06 allows it).
4. `docker compose ... up -d worker admin proxy`

Migrations are forward only (AGENTS.md rule 12). A failed migration stops the container before it serves; fix forward with a new migration.

## Rollback

1. Set `IMAGE_API` / `IMAGE_ADMIN` back to the previous tag and `up -d`.
2. If the failed release contained a migration that the previous code cannot run against, restore the database from the last dump (below) instead of editing migrations.

## Backups and restore test

- `backup` service: `pg_dump --format=custom` daily to the `backups` volume (`/backups/full`), checksum next to each dump, 30 day retention. Postgres archives WAL to `/backups/wal` for point in time recovery.
- Copy the `backups` volume off the host nightly (object storage, another region).
- Monthly restore test (02 section 5):
  ```bash
  docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml exec postgres sh -c \
    'createdb -U $POSTGRES_USER restore_test && pg_restore -U $POSTGRES_USER --no-owner --dbname=restore_test $(ls -t /backups/full/*.dump | head -1) && psql -U $POSTGRES_USER restore_test -c "select count(*) from employees" && dropdb -U $POSTGRES_USER restore_test'
  ```
  Record the date and result in the operations log.

## Monitoring

Structured JSON access logs in the `caddy_data` volume (`/data/logs`). Add uptime checks on both health endpoints, disk alerts on the `postgres_data` and `backups` volumes, and forward container logs to the log platform of choice. Error tracking DSN (Sentry) is read by the API from `SENTRY_DSN` when configured.

## Security checklist (08 section 4)

- TLS 1.2+ only, HSTS preload, security headers: `caddy/Caddyfile`.
- Containers run as non-root (`app` user), read-only Caddyfile mounts, resource limits.
- No secrets in images or the repository; `.env.prod` is git-ignored.
- Database reachable only on the internal compose network. MinIO console is not published; use an SSH tunnel.
- Rotate `POSTGRES_PASSWORD`, `JWT_SECRET` and API keys on staff changes; see variable notes above for the effect of each rotation.
