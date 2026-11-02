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

Rotate every credential that ever touched a chat, a script or git history before going live. The deploy scripts read `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PASSWORD` from the environment only.

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

Transactional mail (password resets) uses the API's `SMTP_*` variables. Add them to the `x-api-env` block in `infra/docker-compose.prod.yml` or to `.env.prod` and reference them the same way as `GOOGLE_*`. Any mailbox works, including the company's own IMAP/SMTP account.

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

Seed the first company and Super Admin exactly once:

```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml exec api sh -c "cd /app/apps/api && npx prisma db seed"
```

Then open `https://admin.company.com/admin`, sign in with the seeded Super Admin, enrol 2FA (the QR code appears on first login), and change the password immediately under Settings → Security.

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
| `https://admin.company.com/admin` | login, 2FA, home dashboard |
| `https://api.company.com/api/v1/health/ready` | `{"status":"ok", ...}` |
| Desktop app first launch | server screen → `api.company.com` → "Connected" → login → "Device awaiting approval" |
| Admin → Security → Devices | pending device appears; approve; the app signs in within 30 s |
| Start shift on the desktop | Attendance shows the employee as present; Tracking → Team activity updates within a minute |
| Mail → Mailboxes → Connect IMAP | "Test connection" passes against the real provider; first sync fills the inbox |
| Forgot password on `/admin` | mail arrives through `SMTP_*`; link opens the reset form |
