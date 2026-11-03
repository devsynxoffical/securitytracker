# 19 - Go-live guide (Hostinger VPS or any Docker host)

Operational companion to 02 section 5 and `infra/README.md`. Follow it top to bottom the first time. Every command runs on the server unless marked "workstation".

## 1. What you need before you start

| Item | Why | Notes |
|---|---|---|
| A VPS, not shared hosting | The stack is Docker (API, worker, Postgres, Redis, Caddy). Shared web hosting (public_html, FTP) cannot run it | Hostinger KVM 2 or larger: 2 vCPU, 8 GB RAM, 100 GB NVMe is the minimum for up to ~50 employees; 4 vCPU / 8 GB (02 section 5) for 200. Ubuntu 24.04 LTS image |
| A domain you control | Three hostnames: `api.`, `admin.`, `updates.` | Example: `api.company.com`, `admin.company.com`, `updates.company.com` |
| SSH access with a key | Deploys and releases use SSH; password logins get disabled | Hostinger hPanel: VPS → SSH access → add your public key |
| GitHub repository access | CI publishes images to GHCR; releases publish installers | Repository secrets and variables listed in section 8 |
| (Optional) Google Cloud project | Gmail mailboxes (10 section 3) | Not needed for IMAP/SMTP mailboxes (Hostinger, GoDaddy, Zoho, Outlook) |
| (Optional) Code signing certificates | Signed Windows installer and notarised Mac app; otherwise users click through SmartScreen / Gatekeeper once | Section 9 |

Rotate every credential that ever touched a chat, a script or git history before going live. The old FTP/SSH deploy scripts for shared hosting are gone; the only deployment paths are this guide (VPS) and section 11 (web hosting for the static site).

## 2. DNS

Create A records pointing at the VPS public IP. All three must resolve before the first start, because Caddy requests Let's Encrypt certificates on boot.

```text
api.company.com      A   <VPS IP>
admin.company.com    A   <VPS IP>
updates.company.com  A   <VPS IP>
```

Check from a workstation: `dig +short api.company.com` returns the IP.

## 3. Prepare the server (once)

```bash
# as root over SSH
apt-get update && apt-get -y upgrade
apt-get -y install ca-certificates curl git ufw
# Docker Engine + Compose v2 (official repository)
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
# a deploy user that owns the checkout and can run docker
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh
# firewall: SSH, HTTP, HTTPS only
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
# disable password SSH logins
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart ssh
```

Hostinger note: hPanel also has a firewall tab. Open 22, 80 and 443 there as well or the host firewall rules never see the traffic.

## 4. Get the code and configure

```bash
# as deploy
sudo mkdir -p /opt/companyos && sudo chown deploy:deploy /opt/companyos
git clone https://github.com/devsynxoffical/securitytracker.git /opt/companyos
cd /opt/companyos
cp infra/.env.prod.example infra/.env.prod
chmod 600 infra/.env.prod
```

Fill `infra/.env.prod`:

| Variable | Value |
|---|---|
| `DOMAIN` | `company.com` (the hostnames are derived: `api.`, `admin.`, `updates.`) |
| `ACME_EMAIL` | an address that receives certificate warnings |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32` |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `ENCRYPTION_SECRET` | `openssl rand -hex 32` (exactly 64 hex characters). Back it up: it encrypts 2FA secrets and mailbox credentials |
| `GOOGLE_*` | leave empty until the Google project exists (10 section 3) |
| `S3_*` | leave empty, or use the bundled MinIO profile for attachments and documents |

| `SMTP_*`, `MAIL_FROM` | Transactional mail (password resets). Any SMTP account works, including the company's own Hostinger or GoDaddy mailbox. Empty disables delivery |

A private repository needs a read token for `git clone` and for `docker compose pull` from GHCR: `docker login ghcr.io -u <github user> -p <token with read:packages>`.

## 5. First start

```bash
cd /opt/companyos
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml pull     # or: build
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d postgres redis
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d    # api runs migrations, then worker, admin, proxy
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml ps
curl -fsS https://api.company.com/api/v1/health/ready
```

Create the first company and Super Admin through the sign-up screen: open `https://admin.company.com/admin`. On an empty database the panel shows "Set up your company" (`POST /setup/bootstrap`, available only while no company exists). Enter the company name, timezone, your name, email and a strong password, then enrol 2FA with the QR code on the next screen. From then on `/admin` is the normal login.

Demo data (staging only, never on the production database): `docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml run --rm -e RUN_SEED=true -e SEED_DEMO_MAILBOX=true api` seeds the DEVSYNX example company, four employees with known passwords and a synthetic mailbox.

## 6. First-hour checklist in the admin panel

1. Settings → Company: name, timezone, working week, device approval mode (`manual` recommended).
2. People → Departments and Roles: create departments, review the role matrix (05).
3. People → Directory: add employees (employee code, email, role, manager, shift schedule). Each employee gets a password through the reset-password mail.
4. Security → Devices: approve the first desktop logins as they arrive (F2).
5. Mail → Mailboxes → Connect: IMAP/SMTP for Hostinger, GoDaddy, Zoho or any provider; Google Workspace once the Google credentials are set. Assign mailboxes to employees with the permission checkboxes.
6. Tracking → Settings: idle thresholds, exception apps (calls, meetings), exclusions.
7. Install page: `https://admin.company.com/install` is public. Send it to employees after the first desktop release exists (section 9).

## 7. Updates, backups, monitoring

- Upgrades, rollback, backups and the monthly restore test are in `infra/README.md`. Backups land in the `backups` Docker volume; copy them off the server nightly.
- Health: `GET /api/v1/health` (process) and `/api/v1/health/ready` (database). Add an external uptime check on both.
- Logs: `docker compose ... logs -f api worker`. Caddy access logs are JSON under the `caddy_data` volume.

## 8. GitHub configuration (CI, deploy, releases)

Repository → Settings → Secrets and variables → Actions.

| Kind | Name | Used by | Value |
|---|---|---|---|
| Variable | `STAGING_DOMAIN` | deploy-staging.yml | `company.com` |
| Secret | `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY` | deploy-staging.yml | VPS IP, `deploy`, private key |
| Variable | `API_PUBLIC_URL` | release-desktop.yml | `https://api.company.com/api/v1` (baked into the desktop app; users can still change it) |
| Variable | `DOWNLOADS_PUBLIC_URL` | release-desktop.yml | `https://admin.company.com/downloads` (asset links in latest.json) |
| Secret | `UPDATES_SSH_HOST`, `UPDATES_SSH_USER`, `UPDATES_SSH_KEY` | release-desktop.yml | same VPS and deploy user; files land in `/opt/companyos/infra/updates` |
| Secret | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | release-desktop.yml | base64 of the `.pfx` and its password (optional) |
| Secret | `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | release-desktop.yml | Developer ID certificate and notarisation (optional) |

`deploy-staging.yml` runs on every push to `main`: builds the images, pushes them to GHCR, deploys over SSH, and checks `/health/ready`. Promote to production by running the same workflow manually against a `production` environment with reviewers (02 section 5).

## 9. Publishing the desktop app

1. Bump `"version"` in `apps/desktop/package.json` (and `agent/Directory.Build.props`), commit, push.
2. Tag and push: `git tag desktop-v1.0.0 && git push origin desktop-v1.0.0`.
3. The workflow builds on Windows, macOS and Linux runners, runs the Electron smoke test on each packaged build, builds the .NET agent, creates the GitHub Release `desktop-v1.0.0` with `latest.json`, and copies everything to `infra/updates/releases/1.0.0/` on the server when the `UPDATES_SSH_*` secrets exist.
4. `https://admin.company.com/install` shows the new version within five minutes (manifest cache).

Manual alternative without the SSH secrets: download the release assets from GitHub and place them under `/opt/companyos/infra/updates/releases/<version>/` with `latest.json` copied to `/opt/companyos/infra/updates/latest.json`.

Signing: unsigned builds work but Windows SmartScreen and macOS Gatekeeper show a warning on first launch (the install page explains the click-through). For a rollout without warnings buy an OV/EV code signing certificate (Windows) and an Apple Developer ID (macOS), add the secrets above, and re-run the release.

## 10. Smoke test after go-live

| Check | Expected |
|---|---|
| `https://admin.company.com/` | public landing with download buttons (or "No release has been published yet") |
| `https://admin.company.com/admin` | sign-up on the empty database, then login, 2FA, home dashboard |
| `https://api.company.com/api/v1/health/ready` | `{"status":"ok", ...}` |
| Desktop app first launch | server screen → `api.company.com` → "Connected" → login → "Device awaiting approval" |
| Admin → Security → Devices | pending device appears; approve; the app signs in within 30 s |
| Start shift on the desktop | Attendance shows the employee as present; Tracking → Team activity updates within a minute |
| Mail → Mailboxes → Connect IMAP | "Test connection" passes against the real provider; first sync fills the inbox |
| Forgot password on `/admin` | mail arrives through `SMTP_*`; link opens the reset form |

## 11. Hostinger web hosting for the website and admin panel, VPS for the API

Hostinger's Web and Cloud plans run a single Node.js process without PostgreSQL, Redis, inbound WebSockets or background workers, so the API, worker and database cannot live there. They can serve the public site and the admin panel, which are a static export, while the API runs on the VPS from sections 2 to 7.

hPanel → Websites → your domain → Deployments → Deployment settings:

| Setting | Value |
|---|---|
| Repository / branch | this repository, `main` |
| Root directory | `./` |
| Build command | `build` (the root script builds the contracts and the admin static export; no turbo, no native modules) |
| Output directory | `apps/admin/out` |
| Application type | Static |
| Node version | 22 |

hPanel → Environment variables (build-time, used by Next.js):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.company.com/api/v1` (the VPS) |
| `NEXT_PUBLIC_DOWNLOADS_URL` | `https://updates.company.com/latest.json` |

On the VPS set `UPDATES_CORS_ORIGIN=https://roofingclients.us` (your web host origin) in `infra/.env.prod` so the install page may read the release manifest, and leave `GOOGLE_REDIRECT_URI` and `ADMIN_ORIGIN` pointing at the site users open. The static export ships its own `.htaccess` (apps/admin/public) for clean routes on Apache and LiteSpeed. Redeploy from hPanel after every merge to `main`, or enable automatic deployments.

The desktop app talks to `api.company.com` directly; it never needs the web host.

## 12. Railway for the API (instead of a VPS)

Railway runs the same Docker image as the VPS stack (`railway.toml` at the repository root points it at `infra/docker/api.Dockerfile`). Website and admin panel stay on Hostinger (section 11).

1. In the Railway project add **PostgreSQL** and **Redis** (New → Database). Supabase also works for the database: use its *Session pooler* connection string, because the direct `db.<ref>.supabase.co` host is IPv6 only.
2. The `securitytracker` service deploys from GitHub `main`. Settings → Networking → Generate domain (or add `api.company.com` as a custom domain and create the CNAME Railway shows).
3. Variables on the service:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (or the Supabase session pooler string) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `ENCRYPTION_SECRET` | `openssl rand -hex 32`, keep a copy offline |
| `RUN_MIGRATIONS` | `true` |
| `JOBS_ENABLED` | `true` (scheduled jobs; set on exactly one service) |
| `WORKER_ENABLED` | `true` (mail sync queue; fine in the same service while it runs one replica) |
| `ADMIN_ORIGIN` | `https://roofingclients.us` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | any SMTP mailbox, for password resets |

Railway sets `PORT`; the image listens on it. The API refuses to start in production without `JWT_SECRET` and `ENCRYPTION_SECRET`.

4. Deploy. The logs show `All migrations have been successfully applied` and `Company OS Central Backend running`. Check `https://<railway domain>/api/v1/health/ready`.
5. The same image serves the admin panel and public site from the same address: `https://<railway domain>/admin` (sign-up on the first visit, then login), `/` and `/install`. They call the API at the relative `/api/v1`, so no CORS or extra variable is needed. Optionally also keep the Hostinger copy (section 11) with `NEXT_PUBLIC_API_URL=https://<railway domain>/api/v1`.

Desktop downloads: without a VPS there is no `updates.` host. Leave `NEXT_PUBLIC_DOWNLOADS_URL` pointing at a `latest.json` you upload to the website's `downloads/` folder, or make the GitHub repository's releases public and use the manifest from the release (section 9).

### Locked out of the admin panel (break-glass)

If nobody knows the Super Admin password, or the authenticator phone is lost:

1. Railway → service → Variables: add `ADMIN_RECOVERY_EMAIL` (the Super Admin's email) and `ADMIN_RECOVERY_PASSWORD` (a new password, at least 10 characters). Deploy.
2. The deploy log shows `Admin recovery applied for i***@domain` (or, when the email matches no Super Admin, the masked emails of those that exist).
3. Sign in with the new password; the panel asks to set up 2FA again. All earlier sessions were signed out.
4. Delete both variables and deploy again. The action is recorded in the audit log as `admin_recovery`.

Only someone with access to the server's settings can use this. On a database without any account the panel shows "Create your workspace" instead of the sign-in.

### Turning off the authenticator requirement

Railway → service → Variables: `ADMIN_2FA_REQUIRED` = `false`, then deploy. Admins sign in with email and password only (docs/08 section 10). Delete the variable to require the authenticator again.

