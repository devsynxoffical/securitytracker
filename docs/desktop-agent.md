# Phase 8: DEVSYNX Desktop Activity Agent Documentation

## Overview & Architecture

The **DEVSYNX Desktop Activity Agent** is a lightweight, cross-platform background application written in Python for Windows and macOS. It monitors the currently active foreground application (~5s interval), detects user idle states (3-minute threshold), merges contiguous samples into activity sessions, buffers batches locally in a client SQLite database (`agent_data.sqlite`), and uploads telemetry to the backend (`POST /api/v1/activity/batches`).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DEVSYNX Desktop Agent                           │
│                                                                        │
│ ┌──────────────────────────┐             ┌───────────────────────────┐ │
│ │ Foreground App Collector │             │    User Idle Detector     │ │
│ │  (Windows ctypes / Mac)  │             │ (GetLastInputInfo - 180s) │ │
│ └────────────┬─────────────┘             └─────────────┬─────────────┘ │
│              │                                         │               │
│              └──────────────────┬──────────────────────┘               │
│                                 ▼                                      │
│                     ┌───────────────────────┐                          │
│                     │   SessionAggregator   │                          │
│                     │(App/Idle Merging 5s)  │                          │
│                     └───────────┬───────────┘                          │
│                                 ▼                                      │
│                     ┌───────────────────────┐                          │
│                     │  Local SQLite Queue   │                          │
│                     │  (agent_data.sqlite)  │                          │
│                     └───────────┬───────────┘                          │
└─────────────────────────────────┼──────────────────────────────────────┘
                                  │
                                  │ HTTPS Upload (Every 60s)
                                  │ X-Device-ID & X-Device-Token
                                  ▼
                   ┌─────────────────────────────┐
                   │  DEVSYNX Backend REST API   │
                   │ (POST /api/v1/activity/batch)│
                   └─────────────────────────────┘
```

---

## 1. What the Agent Collects

- **Executable Application Name** (`appName`): E.g., `Google Chrome`, `Visual Studio Code`.
- **Optional Window Title** (`windowTitle`): Optional application window title (Disabled by default via `"window_title_enabled": false`).
- **Start & End Timestamps** (`startedAt`, `endedAt`): ISO 8601 UTC timestamps (`YYYY-MM-DDTHH:MM:SSZ`).
- **Duration** (`durationSeconds`): Calculated integer duration in seconds.
- **Idle State Flag** (`isIdle`): Boolean (`true` or `false`) indicating system idle state during the session.

---

## 2. Strict Privacy Protections & Exclusions

> [!IMPORTANT]
> The DEVSYNX Desktop Agent is strictly an activity metadata collector. It is **NOT** a keylogger or surveillance tool.

The agent explicitly does **NOT** collect:
- Keystrokes or keyboard input contents
- Screenshots or screen recordings
- Clipboard contents
- Passwords or sensitive input fields
- Document or file contents
- Chat or email message contents
- Web browsing history or page URLs
- Webcam or microphone streams

---

## 3. Supported Operating Systems & Permissions

### Windows (10 / 11 / Server)
- Uses standard Win32 APIs via Python `ctypes.windll.user32` (`GetForegroundWindow`, `GetWindowTextW`, `GetWindowThreadProcessId`, `QueryFullProcessImageNameW`, `GetLastInputInfo`).
- **Permissions**: Requires standard user permissions (No Administrator/Elevated rights required).

### macOS (10.15+)
- Uses `AppKit` (`NSWorkspace.sharedWorkspace().frontmostApplication()`).
- **Permissions**: Requires standard Accessibility permission (`System Settings -> Privacy & Security -> Accessibility`) to query frontmost application name.

---

## 4. Configuration Specification (`config.json`)

```json
{
  "backend_url": "http://localhost:4000",
  "device_id": "9904f012-58bd-4b24-99a1-9552b6711b07",
  "device_token": "devsynx_dev_3e9812a8f09d8123bc",
  "sample_interval_seconds": 5,
  "idle_threshold_seconds": 180,
  "upload_interval_seconds": 60,
  "window_title_enabled": false,
  "db_path": "agent_data.sqlite"
}
```

### Configuration Parameters
- `backend_url`: URL of the DEVSYNX backend REST API server.
- `device_id`: Workstation Device UUID generated during Phase 6 device registration.
- `device_token`: Secret 256-bit raw device token returned once during registration or credential rotation.
- `sample_interval_seconds`: OS foreground check interval (Default: 5 seconds).
- `idle_threshold_seconds`: User inactivity duration before triggering idle state (Default: 180 seconds / 3 minutes).
- `upload_interval_seconds`: Periodicity of background uploader worker (Default: 60 seconds).
- `window_title_enabled`: Boolean flag to enable or disable window title collection (Default: `false`).

---

## 5. Offline Queueing & Retry Mechanism

- **Local SQLite Queue**: Telemetry batches are saved to `agent_data.sqlite` in the `pending_batches` table before uploading.
- **Network Resiliency**: If backend connection fails (network drop, offline, 503 error, server maintenance), activity collection continues uninterrupted. Batches remain securely buffered in `agent_data.sqlite`.
- **Idempotency**: Each batch generates a permanent `batchId` (e.g. `BATCH-UUID`). On upload retries, the SAME `batchId` is transmitted so the server rejects duplicate insertions idempotently without duplicating session rows.
- **Exponential Backoff**: Retry delays increase exponentially on consecutive failures (`5s`, `10s`, `20s`, `40s`, up to max `300s`).

---

## 6. How to Run & Test

### Installation
```bash
cd agent
pip install -r requirements.txt
cp config.example.json config.json
```

### Compilation to Standalone Executable (Phase 9)
```bash
python build_agent.py
```
Outputs standalone `.exe` binary at `agent/dist/devsynx-agent.exe`. For detailed production deployment, macOS launchd services, and Task Scheduler setup, see [`docs/deployment.md`](file:///d:/devsynx-activity-tracker/docs/deployment.md).

### Running Test Suite
```bash
python -m pytest
```
Runs 24 unit & end-to-end integration tests covering session aggregation, idle state transitions, privacy boundaries, device credential lifecycle states (`ACTIVE`, `DISABLED`, `REVOKED`), idempotent duplicate retries, process restart persistence, and queue drainage.

---

## 7. Graceful Shutdown & Uninstallation

- **Stopping Agent**: Send `Ctrl+C` (SIGINT) or `SIGTERM`. The agent closes active application sessions, flushes remaining samples into the local queue, performs a final upload pass, and terminates cleanly.
- **Uninstallation**:
  1. Revoke device in Dashboard (`Devices -> Revoke`).
  2. Stop agent executable/process.
  3. Remove installation directory and `agent_data.sqlite`. See [`docs/deployment.md`](file:///d:/devsynx-activity-tracker/docs/deployment.md) for full uninstallation steps.
