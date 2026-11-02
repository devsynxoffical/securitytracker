using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CompanyOS.Watchdog;

public sealed class WatchdogOptions
{
    public string InstallDir { get; set; } = @"C:\Program Files\CompanyOS\agent";
    public string AgentExe { get; set; } = "CompanyOS.Agent.exe";
    /// <summary>Desktop App executable; relaunched to the tray while a shift is open (09 section 6 rule 2).</summary>
    public string? AppExe { get; set; } = @"C:\Program Files\CompanyOS\WorkPulse.exe";
    public string? ExpectedPublisher { get; set; } = "DEVSYNX";
    public bool EnforceSignatures { get; set; } = true;
    public int CheckIntervalSeconds { get; set; } = 10;
    public string UpdateDropDir { get; set; } = @"C:\ProgramData\CompanyOS\updates";
}

/// <summary>
/// Keeps one agent alive per active interactive session (09 section 6): launches at logon (detected by
/// polling active sessions every 10 s, which also covers the service starting after the user), restarts
/// with backoff when killed, records the gap as an agent_stopped notice for the agent, relaunches the
/// Desktop App when a shift is open, and applies staged updates. No credentials, no network.
/// </summary>
public sealed class AgentSupervisor : BackgroundService
{
    private readonly ILogger<AgentSupervisor> _log;
    private readonly WatchdogOptions _opt;
    private readonly SignatureVerifier _verifier;
    private readonly UpdateApplier _updates;

    private sealed class SessionTrack
    {
        public DateTime? LastSeenRunning;
        public DateTime? LastLaunchAttempt;
        public int ConsecutiveFailures;
        public bool EverLaunched;
    }

    private readonly Dictionary<uint, SessionTrack> _sessions = new();

    public AgentSupervisor(ILogger<AgentSupervisor> log, IOptions<WatchdogOptions> options)
    {
        _log = log;
        _opt = options.Value;
        _verifier = new SignatureVerifier(_opt.ExpectedPublisher, _opt.EnforceSignatures);
        _updates = new UpdateApplier(_opt, _verifier, log);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("CompanyOS watchdog started. Install dir {Dir}, signatures enforced: {Enforce}", _opt.InstallDir, _verifier.Enforced);
        if (!_verifier.Enforced) _log.LogWarning("Signature enforcement is OFF. Only acceptable on development machines.");

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(Math.Clamp(_opt.CheckIntervalSeconds, 5, 60)));
        do
        {
            try { Supervise(); }
            catch (Exception ex) { _log.LogError(ex, "Supervision pass failed"); }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }

    private void Supervise()
    {
        var agentPath = Path.Combine(_opt.InstallDir, _opt.AgentExe);
        var running = AgentProcessesBySession();

        if (_updates.TryApplyPending(running.Values.SelectMany(p => p)))
        {
            // Agents were stopped for the update; they restart on this same pass below.
            running = AgentProcessesBySession();
        }

        var active = SessionLauncher.ActiveSessions();
        foreach (var session in active)
        {
            var track = _sessions.TryGetValue(session.SessionId, out var t) ? t : _sessions[session.SessionId] = new SessionTrack();
            var now = DateTime.UtcNow;

            if (running.TryGetValue(session.SessionId, out var procs) && procs.Count > 0)
            {
                track.LastSeenRunning = now;
                track.ConsecutiveFailures = 0;
                track.EverLaunched = true;
                RelaunchAppIfShiftOpen(session.SessionId, now);
                continue;
            }

            // Backoff: 0, 10, 20, 40, 80 s ... capped at 5 minutes.
            var backoff = TimeSpan.FromSeconds(Math.Min(300, track.ConsecutiveFailures == 0 ? 0 : 10 * Math.Pow(2, track.ConsecutiveFailures - 1)));
            if (track.LastLaunchAttempt is { } last && now - last < backoff) continue;

            var reason = _verifier.Verify(agentPath);
            if (reason is not null)
            {
                _log.LogError("Refusing to start agent in session {Session}: {Reason}", session.SessionId, reason);
                DropNotice(session.SessionId, new { type = "binary_mismatch", reason, path = agentPath });
                track.ConsecutiveFailures++;
                track.LastLaunchAttempt = now;
                continue;
            }

            try
            {
                if (track.EverLaunched && track.LastSeenRunning is { } seen)
                {
                    var gap = (int)(now - seen).TotalSeconds;
                    _log.LogWarning("Agent missing in session {Session} for {Gap}s; restarting", session.SessionId, gap);
                    DropNotice(session.SessionId, new { type = "agent_stopped", gapSeconds = gap, detectedAt = now.ToString("O") });
                }
                else
                {
                    _log.LogInformation("Starting agent in session {Session} ({Station})", session.SessionId, session.StationName);
                }

                var pid = SessionLauncher.Launch(session.SessionId, agentPath, null, _opt.InstallDir);
                _log.LogInformation("Agent started in session {Session} with pid {Pid}", session.SessionId, pid);
                track.EverLaunched = true;
                track.LastSeenRunning = now;
                track.ConsecutiveFailures = 0;
            }
            catch (Exception ex)
            {
                track.ConsecutiveFailures++;
                _log.LogError(ex, "Failed to start agent in session {Session} (attempt {N})", session.SessionId, track.ConsecutiveFailures);
            }
            track.LastLaunchAttempt = now;
        }

        // Forget sessions that ended.
        foreach (var gone in _sessions.Keys.Where(id => active.All(s => s.SessionId != id)).ToList()) _sessions.Remove(gone);
    }

    private Dictionary<uint, List<Process>> AgentProcessesBySession()
    {
        var name = Path.GetFileNameWithoutExtension(_opt.AgentExe);
        var map = new Dictionary<uint, List<Process>>();
        foreach (var p in Process.GetProcessesByName(name))
        {
            var sid = SessionLauncher.SessionOf(p.Id);
            if (sid is null) { p.Dispose(); continue; }
            (map.TryGetValue(sid.Value, out var l) ? l : map[sid.Value] = new List<Process>()).Add(p);
        }
        return map;
    }

    private readonly Dictionary<uint, DateTime> _lastAppLaunch = new();

    /// <summary>09 section 6 rule 2: relaunch the Desktop App (tray) if a shift is open and the app is not running.</summary>
    private void RelaunchAppIfShiftOpen(uint sessionId, DateTime now)
    {
        if (string.IsNullOrEmpty(_opt.AppExe) || !File.Exists(_opt.AppExe)) return;
        var profile = SessionLauncher.ProfileDirectory(sessionId);
        if (profile is null) return;
        var statusPath = Path.Combine(profile, "AppData", "Local", "CompanyOS", "agent", "status.json");
        if (!File.Exists(statusPath)) return;

        bool shiftOpen;
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(statusPath));
            shiftOpen = doc.RootElement.TryGetProperty("shiftOpen", out var v) && v.ValueKind == JsonValueKind.True;
        }
        catch { return; }
        if (!shiftOpen) return;

        var appName = Path.GetFileNameWithoutExtension(_opt.AppExe);
        var appRunning = Process.GetProcessesByName(appName).Any(p => SessionLauncher.SessionOf(p.Id) == sessionId);
        if (appRunning) return;
        if (_lastAppLaunch.TryGetValue(sessionId, out var last) && now - last < TimeSpan.FromSeconds(60)) return;

        var reason = _verifier.Verify(_opt.AppExe);
        if (reason is not null) { _log.LogError("Not relaunching app: {Reason}", reason); return; }

        try
        {
            SessionLauncher.Launch(sessionId, _opt.AppExe, "--tray", Path.GetDirectoryName(_opt.AppExe)!);
            _lastAppLaunch[sessionId] = now;
            _log.LogInformation("Relaunched Desktop App to tray in session {Session} (shift open)", sessionId);
        }
        catch (Exception ex) { _log.LogError(ex, "App relaunch failed in session {Session}", sessionId); }
    }

    /// <summary>Writes a small JSON notice into the user's agent tamper-inbox (the agent turns it into a tamper event).</summary>
    private void DropNotice(uint sessionId, object notice)
    {
        try
        {
            var profile = SessionLauncher.ProfileDirectory(sessionId);
            if (profile is null) return;
            var dir = Path.Combine(profile, "AppData", "Local", "CompanyOS", "agent", "tamper-inbox");
            Directory.CreateDirectory(dir);
            File.WriteAllText(Path.Combine(dir, $"{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}.json"), JsonSerializer.Serialize(notice));
        }
        catch (Exception ex) { _log.LogWarning(ex, "Could not write tamper notice for session {Session}", sessionId); }
    }
}
