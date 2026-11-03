# Company OS - Tracker Agent, Watchdog and Native Host (.NET 8)

> Compiled and unit-tested on Windows by the Release desktop workflow (agent job). Run the manual test matrix in `docs/09-tracker-agent-spec.md` section 9 before a rollout.

Implements `docs/09-tracker-agent-spec.md`, `docs/02-architecture.md` section 3 and `docs/03-flows.md` F6/F7.

## Projects

| Project | Target | Role |
|---|---|---|
| `CompanyOS.Shared` | net8.0 | Pipe protocol DTOs (System.Text.Json source generated), segment and tamper models, config, UUID v7 |
| `CompanyOS.Core` | net8.0 | All logic with no Win32: `SegmentBuilder` (09 section 3 state machine), `DomainTracker`, `AnchoredClock`, `TrackingEngine`, `CommandHandler`, `SqliteQueueStore` + AES-GCM cipher, capacity rule |
| `CompanyOS.Agent` | net8.0-windows, WinExe | User-session process: Win32 probes (WinEvent hook, GetLastInputInfo, Raw Input header-only counting, WTS lock/unlock, power, Core Audio mic), DPAPI key store, named pipe server, composition root |
| `CompanyOS.NativeHost` | net8.0-windows | Native messaging stdio bridge started by Chrome/Edge; forwards `{domain, browser, ts}` to the agent pipe |
| `CompanyOS.Watchdog` | net8.0-windows, Worker | LocalSystem service: launches the agent per active session (`WTSQueryUserToken` + `CreateProcessAsUser`), restart with backoff, Authenticode check (`WinVerifyTrust`), staged update apply, app relaunch while a shift is open, event log |
| `CompanyOS.Agent.Tests` | net8.0 | xUnit tests for every pure component (run on any OS) |

## Build (Windows, .NET 8 SDK)

```powershell
cd agent
dotnet restore
dotnet build CompanyOS.sln -c Release
dotnet test CompanyOS.Agent.Tests -c Release
dotnet publish CompanyOS.Agent      -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o publish\agent
dotnet publish CompanyOS.NativeHost -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o publish\agent
dotnet publish CompanyOS.Watchdog   -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o publish\agent
```

Sign every `.exe` (Authenticode, the client's code signing certificate) before packaging. The watchdog refuses to
start unsigned binaries unless `Watchdog:EnforceSignatures` is `false` in its `appsettings.json` (development only).

## Install layout

```text
C:\Program Files\CompanyOS\
  WorkPulse.exe                       Desktop App (Electron)
  agent\
    CompanyOS.Agent.exe
    CompanyOS.NativeHost.exe
    CompanyOS.Watchdog.exe
    appsettings.json                  watchdog configuration
    com.companyos.agent.json          native messaging host manifest (from extension/host/, set the extension id)
    VERSION
C:\ProgramData\CompanyOS\updates\     staged updates: pending\<version>\manifest.json + files, previous\, failed\
%LOCALAPPDATA%\CompanyOS\agent\       per user: queue.db (+ -wal), queue.key (DPAPI), status.json, tamper-inbox\, logs\
```

Service registration (installer does this; manual equivalent):

```powershell
sc.exe create CompanyOSWatchdog binPath= "C:\Program Files\CompanyOS\agent\CompanyOS.Watchdog.exe" start= auto obj= LocalSystem DisplayName= "Company OS Watchdog"
sc.exe failure CompanyOSWatchdog reset= 86400 actions= restart/5000/restart/10000/restart/30000
sc.exe start CompanyOSWatchdog
```

Registry (installer writes, see `extension/host/register-native-host.reg`): native host manifest paths under
`HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.companyos.agent` and
`HKLM\SOFTWARE\Microsoft\Edge\NativeMessagingHosts\com.companyos.agent`; `ExtensionInstallForcelist` and
`IncognitoModeAvailability=1` policies for Chrome and Edge.

## Runtime behaviour summary

- Agent per interactive session, single instance (named mutex). Pipe `\\.\pipe\CompanyOS.Agent.<sessionId>`, JSON lines,
  ACL = current user + SYSTEM. Commands and events exactly as 09 section 4, plus the internal `extensionDomain`
  command used by the native host.
- Measurement loop every 1 s. Segments close on foreground/domain/kind change, lock, power event, pause/stop, 5 min cap.
  Idle split backdated to last input; call/meeting apps and microphone keep segments active with an exception.
  Flicker (< 2 s) merged. Window titles only with `captureWindowTitles`.
- Queue: SQLite WAL, payload encrypted AES-256-GCM, key protected with DPAPI (CurrentUser). Open segment checkpointed
  every 30 s; after a crash the checkpoint is queued as a closed segment (no invented time). Deleted only on ack.
  Capacity 500 MB / 30 days, `queueWarning` at 90 percent.
- Clock: Stopwatch anchored to `setAnchor` server time; anchor persisted with the wall time so it survives restarts.
  Wall clock jumps > 30 s relative to monotonic time produce `clock_changed` tamper events.
- Watchdog drops `agent_stopped` / `binary_mismatch` notices into the user's `tamper-inbox`; the agent converts them to
  tamper events on start. The agent writes `status.json` (`shiftOpen`) so the watchdog can relaunch the app to the tray.
- No network code in agent, native host or watchdog (AGENTS.md rule 9). No keyboard hook; Raw Input is read with
  `RID_HEADER` only, so key codes never enter the process (rule 8).

## Tests

`dotnet test agent/CompanyOS.Agent.Tests` covers: idle split and backdating, call-app/mic exceptions, long idle prompt,
5-minute cap, flicker merge, domain change, lock/unlock, title capture flag, anchored clock and clock-change detection,
anchor restore, capacity math, SQLite roundtrip/ack/checkpoint, AES-GCM, UUID v7 ordering, domain tracker rules,
engine state machine (stop/pause/resume, idempotent start, checkpoint and resume after crash, suspend flush, extension
missing once per shift, queue warning once), pipe command handler and the JSON field names of the server contract.

## Known uncertainties to verify on Windows

1. `CoreAudioInterop`: vtable order of `IAudioSessionManager2` and `IMMDevice.Activate` marshalling (`ref Guid` + `out object`).
2. `WINTRUST_DATA` layout with `pSignatureSettings` present (Windows 8+ size); `WinVerifyTrust` is called with `INVALID_HANDLE_VALUE`.
3. `SetWinEventHook` from the message window thread: the delegate is stored in a field so it is not collected.
4. `GetRawInputData(..., RID_HEADER, out RAWINPUTHEADER, ref size, headerSize)`: returns `uint.MaxValue` on error.
5. `CreateProcessAsUserW` from a service: LocalSystem has `SeTcbPrivilege`, `SeAssignPrimaryTokenPrivilege` and
   `SeIncreaseQuotaPrivilege`; `CREATE_BREAKAWAY_FROM_JOB` may fail if the service is in a job without that right - drop the flag then.
6. `NamedPipeServerStreamAcl.Create` requires `System.IO.Pipes.AccessControl` (inbox on net8.0-windows).
7. `GetUserProfileDirectoryW` returned length includes the terminating null (handled with `size - 1`).
