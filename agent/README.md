# Company OS — Tracker Agent & Watchdog (.NET 8)

The tracker agent runs locally inside the user's interactive Windows session to collect non-invasive activity metrics without capturing keystroke values, clipboard content, or screenshots.

## Architecture

- **`CompanyOS.Agent.exe`**: User session background process measuring foreground window changes, idle state (`GetLastInputInfo`), raw input event counts (`keyCount`, `mouseCount`), and hosting Native Messaging for the browser extension.
- **`CompanyOS.Watchdog.exe`**: Session 0 LocalSystem Windows service checking agent health every 10 seconds and restarting it if stopped (tamper recovery).
- **`CompanyOS.Shared`**: Shared models, enums (`SegmentKind`, `ActivityExceptionType`), and named pipe contract types.
- **IPC Protocol**: Named Pipe `\\.\pipe\CompanyOS.Agent.<sessionId>` communicating with the Electron Desktop App.

## Privacy Rules

1. Key counts only — zero low-level keyboard hooks, zero key codes captured or logged.
2. Domain-level web tracking only — paths, query parameters, and form data are never captured.
3. Offline queueing — SQLite database encrypted with DPAPI keys (`%LOCALAPPDATA%\CompanyOS\agent\queue.db`).
