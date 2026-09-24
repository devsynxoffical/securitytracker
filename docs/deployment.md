# DEVSYNX Desktop Activity Agent — Deployment & Installation Guide

This document outlines the enterprise deployment, installation, permissions configuration, auto-start options, and maintenance routines for the **DEVSYNX Desktop Activity Agent** on Windows and macOS workstations.

---

## 1. Windows Installation & Deployment

### 1.1 Prerequisites
- Windows 10 / Windows 11 (64-bit)
- Network connectivity to the DEVSYNX backend server (`/api/v1/activity/batches`)

### 1.2 Standalone Executable Compilation
To package the agent into a single self-contained `.exe` binary without external Python runtime dependencies:

```powershell
# From project root
python agent/build_agent.py
```

The compiled binary will be placed at:
```text
agent/dist/devsynx-agent.exe
```

### 1.3 Machine Configuration Setup
1. Copy `devsynx-agent.exe` to a permanent system directory (e.g. `C:\Program Files\DEVSYNX\Agent\devsynx-agent.exe`).
2. Create `config.json` in the same directory (or in `%APPDATA%\DEVSYNX\config.json`):

```json
{
  "backend_url": "https://your-devsynx-server.com",
  "device_id": "YOUR_ASSIGNED_DEVICE_UUID",
  "device_token": "YOUR_SECRET_DEVICE_TOKEN",
  "sample_interval_seconds": 5,
  "idle_threshold_seconds": 180,
  "upload_interval_seconds": 30,
  "window_title_enabled": true,
  "db_path": "agent_data.sqlite"
}
```

> ⚠️ **Security Warning:** Never commit `config.json` containing live `device_token` credentials to Git.

### 1.4 Windows Auto-Start via Task Scheduler
To configure silent background auto-start upon user login without showing a command window:

```powershell
# PowerShell (Admin)
$action = New-ScheduledTaskAction -Execute "C:\Program Files\DEVSYNX\Agent\devsynx-agent.exe"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "DEVSYNXActivityAgent" -Action $action -Trigger $trigger -Settings $settings -Description "DEVSYNX Employee Activity Monitoring Agent"
```

---

## 2. macOS Installation & Deployment

### 2.1 macOS System Permissions (Accessibility API)
To capture foreground application names and window titles on macOS (via Quartz Window Services / NSWorkspace):

1. Open **System Settings** -> **Privacy & Security** -> **Accessibility**.
2. Click **+** and add `/Applications/DEVSYNX Agent.app` or the terminal process running the agent script (`/usr/local/bin/python3`).
3. Toggle the permission switch to **ON**.

### 2.2 macOS Background Service Setup (`launchd`)
Create a launch daemon property list at `/Library/LaunchDaemons/com.devsynx.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.devsynx.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/python3</string>
        <string>/Library/DEVSYNX/agent/src/main.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/Library/DEVSYNX/agent</string>
    <key>StandardOutPath</key>
    <string>/var/log/devsynx_agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/devsynx_agent_err.log</string>
</dict>
</plist>
```

Load and start the service:
```bash
sudo chown root:wheel /Library/LaunchDaemons/com.devsynx.agent.plist
sudo chmod 644 /Library/LaunchDaemons/com.devsynx.agent.plist
sudo launchctl load -w /Library/LaunchDaemons/com.devsynx.agent.plist
```

---

## 3. Uninstallation & Removal Instructions

### 3.1 Windows Uninstallation
1. Stop and unregister the scheduled task:
   ```powershell
   Unregister-ScheduledTask -TaskName "DEVSYNXActivityAgent" -Confirm:$false
   ```
2. Remove agent binary and configuration:
   ```powershell
   Remove-Item -Recurse -Force "C:\Program Files\DEVSYNX\Agent"
   ```

### 3.2 macOS Uninstallation
1. Unload the `launchd` service:
   ```bash
   sudo launchctl unload -w /Library/LaunchDaemons/com.devsynx.agent.plist
   sudo rm /Library/LaunchDaemons/com.devsynx.agent.plist
   ```
2. Delete agent folder and local SQLite database:
   ```bash
   sudo rm -rf /Library/DEVSYNX/agent
   ```
