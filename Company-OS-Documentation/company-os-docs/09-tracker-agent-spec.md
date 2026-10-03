# 09 - Tracker Agent, Watchdog and Browser Extension

## 1. Processes

| Process | Runs as | Session | Lifetime | Job |
|---|---|---|---|---|
| CompanyOS.Agent.exe | Logged-in user | User session | From logon, idle until told to track | Measure activity, queue segments, host native messaging |
| CompanyOS.Watchdog.exe | LocalSystem (Windows service, auto start) | Session 0 | Always | Start agent in the user session, restart it, verify signatures, apply updates |
| Desktop App (Electron) | Logged-in user | User session | Auto start at logon, tray | UI, network, commands the agent |
| Browser extension | Browser | User session | With browser | Report active tab domain |

Why not a service alone: Windows services run isolated in Session 0. Calls such as `GetForegroundWindow` and `GetLastInputInfo` return nothing useful there. All measurement must happen inside the interactive user session.

The agent has no network code. It works identically with or without internet. All server communication is done by the Desktop App, which drains the agent queue when a connection exists (03 F7).

## 2. What the agent collects and how

| Data | Windows mechanism | Notes |
|---|---|---|
| Foreground application | `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` + `GetForegroundWindow`, `GetWindowThreadProcessId`, process image path. 1 s polling as safety net | Process name, product name from file version info. UWP apps resolved through `ApplicationFrameHost` child window |
| Last input time | `GetLastInputInfo` every second | Basis for idle detection |
| Keyboard and mouse counts | Raw Input (`RegisterRawInputDevices` with `RIDEV_INPUTSINK`) on a hidden message window | Counter increments only. The key code field is never read, stored or logged. No low-level keyboard hook |
| Lock and unlock | `WTSRegisterSessionNotification` (`WTS_SESSION_LOCK`, `WTS_SESSION_UNLOCK`) | Lock starts a `locked` segment |
| Sleep, resume, shutdown | `PowerModeChanged`, `SessionEnding` events | Close segment, flush queue |
| Microphone in use | Core Audio API, active capture sessions | Activity exception `mic` |
| Website domain | Browser extension through native messaging | Section 5 |
| Window title | `GetWindowText`, only if `capture_window_titles` is on | Off by default |
| Clock | `Stopwatch` (monotonic) anchored to server time given by the app | Wall clock changes detected and reported |

Not collected, by design: key values, typed text, clipboard, screen content (1.0), audio, camera, files, full URLs.

## 3. Segments

A segment is one continuous period with the same kind, process and domain.

```text
segment {
  id            UUID v7 (created by agent)
  shiftId
  startedAt, endedAt      UTC, from anchored monotonic clock
  kind          active | idle | locked
  processName   "chrome.exe"
  appName       "Google Chrome"
  domain        "youtube.com" | "unknown" | "excluded" | null
  windowTitle   null unless enabled
  keyCount, mouseCount
  exception     none | call_app | meeting_app | mic
  clockSource   anchored | unanchored
}
```

Segment is closed and a new one opened when: foreground process changes, domain changes, kind changes, pause or stop command, lock, power event, or the segment reaches 5 minutes.

Idle logic:

```text
every second:
  sinceInput = now - lastInputTime
  if kind == active and sinceInput >= idleThreshold (default 300 s):
      if foreground process in exceptionApps or microphone in use:
          stay active, set exception
      else:
          split current segment at lastInputTime
          the part after lastInputTime becomes an idle segment
  if kind == idle and new input arrives:
      close idle segment, open active segment
      if idle duration >= longIdleThreshold: notify app (long idle prompt)
```

Switches shorter than 2 seconds (alt-tab flicker) are merged into the previous segment.

## 4. Local queue and pipe protocol

Queue: SQLite database in `%LOCALAPPDATA%\CompanyOS\agent\queue.db`, encrypted (SQLCipher or encrypted payload column) with a random key protected by DPAPI. Tables: `segments`, `state` (current shift, anchor, config), `tamper`.

- Segments are written when closed and additionally the open segment is checkpointed every 30 s, so a crash or power loss loses at most 30 s.
- Capacity [30] days or [500] MB. At 90 percent a warning is raised. Data is deleted only after the server confirmed it.
- After a PC restart with an open shift recorded in `state`, the agent resumes tracking as soon as the user logs in, without waiting for the app or the network.

Named pipe `\\.\pipe\CompanyOS.Agent.<sessionId>`, JSON lines, ACL for the current user only.

| Command (app -> agent) | Meaning |
|---|---|
| hello {appVersion} | Handshake, returns agent version and state |
| setAnchor {serverTime} | Anchor the monotonic clock |
| setConfig {...} | Idle thresholds, exception apps, exclusions, capture flags |
| startTracking {shiftId} | Begin segments |
| pauseTracking {reason} | Break |
| resumeTracking | End of break |
| stopTracking | End shift, flush |
| pullSegments {max} | Returns queued segments |
| ackSegments {ids} | Delete confirmed segments |
| pullTamper / ackTamper | Tamper events |
| status | State, queue size, extension connected, last input |

| Event (agent -> app) | Meaning |
|---|---|
| longIdleEnded {from, to} | Show long idle prompt |
| queueWarning {percent} | Queue nearly full |
| stateChanged | Tracking state changed |

## 5. Browser extension

| Item | Specification |
|---|---|
| Type | Manifest V3, Chrome and Edge. Firefox in 1.1 |
| Permissions | `tabs`, `nativeMessaging`. No content scripts, no page access, no history |
| Logic | On `tabs.onActivated`, `tabs.onUpdated` (URL change), `windows.onFocusChanged`: read the active tab URL, reduce to registrable domain (public suffix list), send `{domain, browser, ts}` to the native host |
| Native host | The agent registers a native messaging host manifest (`com.companyos.agent`) under HKLM for Chrome and Edge. A small stdio bridge forwards messages to the agent |
| Internal pages | `chrome://`, `edge://`, extension pages, local files -> domain `browser-internal` |
| Installation | Force-installed by policy `ExtensionInstallForcelist` (registry under HKLM written by the installer, or pushed from Google Admin console Chrome management). Users cannot remove a force-installed extension |
| Hosting | Chrome Web Store as unlisted item, or self-hosted update URL referenced in the policy |
| Incognito | Extensions do not run in incognito by default. Recommended policy: `IncognitoModeAvailability = 1` (disabled). Otherwise domain is `unknown` |
| Other browsers | Time is recorded as application time without domain. Report shows them as "browser without extension". The client may restrict browsers by policy |

Agent side: the domain reported by the extension is applied only while the foreground process is that browser. If no message arrived from the extension for 60 s while a supported browser is in the foreground, domain = `unknown` and a tamper event `extension_missing` is recorded (once per shift).

## 6. Watchdog service

1. Starts at boot. On user logon (`WTS_SESSION_LOGON`) launches the agent in that session with the user's token (`WTSQueryUserToken` + `CreateProcessAsUser`).
2. Checks every 10 s that the agent is running, restarts it if not. Records `agent_stopped` with the gap length. Also relaunches the Desktop App (tray) if it is not running while a shift is open.
3. Verifies the Authenticode signature and publisher of the agent and app binaries before launch.
4. Performs the file replacement part of updates (the app downloads and verifies, the service installs), so no administrator prompt is shown to the employee.
5. Holds no credentials and has no network access.

Multiple Windows users on one PC: one agent per session, queue per user profile. Remote Desktop sessions are supported the same way.

## 7. Installer

- electron-builder NSIS, per-machine install to `Program Files`, requires elevation once (IT or admin installs).
- Installs: Desktop App, agent, watchdog service (registered and started), native messaging manifests, extension policy keys, autostart entry for the app (tray, minimised).
- Silent install switch for mass rollout (`/S`), suitable for deployment through endpoint management.
- Uninstall requires administrator rights.
- Everything signed. Submit the signed installer to the antivirus vendor used by the client for allowlisting before rollout.

## 8. Performance and quality budgets

| Metric | Budget |
|---|---|
| Agent CPU | Under 1 percent average, under 3 percent peak |
| Agent memory | Under 80 MB |
| Disk writes | Batched, at most one write per 5 s outside segment closes |
| Data lost on power failure | At most 30 s |
| Segment timing accuracy | Within 2 s |

## 9. Test matrix

| Case | Expected |
|---|---|
| Switch between 5 apps quickly | Correct segments, flicker merged |
| No input 6 min in Word | Idle segment backdated to last input |
| No input 10 min in listed call app | Active with exception `call_app` |
| Lock screen 20 min | `locked` segment, long idle prompt on unlock |
| Sleep 1 h, wake | Segment closed at sleep, tracking continues, gap offline |
| Unplug network 3 h, work, reconnect | Full data appears in Admin Panel after sync, flagged late |
| Network off, restart PC, work, reconnect next day | Shift resumed locally, all data synced, attendance recomputed |
| Kill agent in Task Manager | Restarted within 10 s, tamper event |
| Kill app during shift | Agent keeps tracking, app relaunched to tray, shift resumes |
| Change Windows clock by 3 h | Durations unchanged, `clock_changed` recorded |
| Incognito window | Domain `unknown` |
| Two monitors, video playing on second, typing on first | Foreground app only is counted |
| Duplicate upload of same batch | No double counting |
| Windows 10 and 11, standard user, with common antivirus | Install and run without blocks |
