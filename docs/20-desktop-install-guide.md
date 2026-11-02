# 20 - Desktop app: platforms, install, verification

Source for the public install page (`apps/admin/src/app/install`) and for IT. Complements 09 (tracker agent) and 03 F2/F3.

## 1. Platform support

| Platform | Package | Tracking source | Status |
|---|---|---|---|
| Windows 10 22H2 and Windows 11 (x64) | `WorkPulse-Setup-<v>.exe` (NSIS, per-machine) and `WorkPulse-Portable-<v>.exe` | C# agent + watchdog service (09) when bundled, otherwise built-in source | Installer built and smoke-tested on `windows-latest` by `release-desktop.yml`; the agent code still needs its first compile on Windows (agent/README.md) |
| macOS 12 Monterey and later, Intel and Apple Silicon | `WorkPulse-<v>-mac-universal.dmg` and `.zip` (universal binary) | Built-in source: frontmost app name and system idle time through Electron (`powerMonitor`), counts only | Built and smoke-tested on `macos-latest` |
| Linux (x64) | `WorkPulse-<v>-linux-x64.AppImage` | Built-in source | Built and smoke-tested on `ubuntu-latest`; used for CI, offered to employees only on request |

Windows ARM and 32-bit Windows are not built. Older macOS (11 and below) is not supported by the bundled Electron.

## 2. What "works" means (verified automatically)

`apps/desktop/test/smoke.mjs` runs against every packaged build on every OS in the release workflow and against the unpacked build in CI:

1. The app launches and the window opens with the title `WorkPulse Workstation`.
2. The renderer boots without errors (console and page errors are collected; font and network noise is ignored).
3. First run shows the server screen; an unreachable address is rejected with a readable message; a reachable API is accepted and the login form appears.
4. With `WORKPULSE_API_URL` set, a wrong password gets the server's answer through the signed login path (device key, timestamp, signature), proving the end-to-end request chain.
5. Tokens are never written in plain text to `state.json` (safeStorage: DPAPI on Windows, Keychain on macOS).

Manual matrix before a company rollout (09 section 9): offline work and restart, idle claim, break and resume, lock screen, clock change, antivirus, standard user account.

## 3. Install

### Windows

1. Download `WorkPulse-Setup-<version>.exe` from the install page.
2. Run it. Accept the one-time UAC prompt (per-machine install into `C:\Program Files\WorkPulse`). If SmartScreen appears on an unsigned build: More info → Run anyway.
3. The installer registers the Company OS Watchdog service and the Chrome/Edge native messaging host when the tracker agent is bundled. Without the agent the app still installs and runs; app-level tracking then uses the built-in source.
4. WorkPulse starts after the install and at every logon (tray icon). Silent install for IT: `WorkPulse-Setup-<version>.exe /S`.

### macOS

1. Download `WorkPulse-<version>-mac-universal.dmg`, open it, drag WorkPulse to Applications.
2. First launch of an un-notarised build: right-click the app → Open → Open, or System Settings → Privacy & Security → Open Anyway.
3. No Accessibility or Screen Recording permission is needed. The app only reads the frontmost application name and the system idle time.
4. The app lives in the menu bar and starts at login.

### First sign-in (both)

1. Server address: `api.company.com` (the app adds `https://` and `/api/v1`). It checks the server before saving.
2. Employee code or company email + password.
3. "Device awaiting approval": an administrator approves the device under Security → Devices. The app rechecks every 30 s.

## 4. Data locations

| OS | App data (state, device key, queue) | Agent (Windows only) |
|---|---|---|
| Windows | `%APPDATA%\WorkPulse` | `C:\Program Files\WorkPulse\resources\agent`, per-user queue under `%LOCALAPPDATA%\CompanyOS\agent` |
| macOS | `~/Library/Application Support/WorkPulse` | - |
| Linux | `~/.config/WorkPulse` | - |

Reinstalling keeps the device identity (the key pair lives in app data). Deleting the app data folder creates a new device that needs approval again.

## 5. Updates

New versions are published through `release-desktop.yml` (19 section 9) and appear on the install page. In-app auto-update with pilot and stable channels (11 section 5) is planned; until then IT redistributes the installer (silent install upgrades in place).
