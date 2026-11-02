using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace CompanyOS.Watchdog;

/// <summary>
/// Staged update apply (09 section 6 rule 4, 03 F18). The Desktop App downloads and verifies a release and
/// writes it to <c>{UpdateDropDir}\pending\{version}\</c> with a <c>manifest.json</c>:
/// <c>{"version":"1.2.0","files":[{"name":"CompanyOS.Agent.exe","sha256":"..."}]}</c>.
/// The service (which has write access to Program Files) verifies hashes and Authenticode signatures, stops the
/// agents, swaps the files atomically (old files kept in <c>previous\</c> for rollback) and lets the
/// supervisor restart them. No download happens here.
/// </summary>
internal sealed class UpdateApplier
{
    private readonly WatchdogOptions _opt;
    private readonly SignatureVerifier _verifier;
    private readonly ILogger _log;

    private sealed record Manifest(string Version, List<ManifestFile> Files);
    private sealed record ManifestFile(string Name, string Sha256);

    public UpdateApplier(WatchdogOptions opt, SignatureVerifier verifier, ILogger log)
    {
        _opt = opt;
        _verifier = verifier;
        _log = log;
    }

    /// <summary>Returns true when an update was applied (agents were stopped and must be restarted).</summary>
    public bool TryApplyPending(IEnumerable<Process> runningAgents)
    {
        var pendingRoot = Path.Combine(_opt.UpdateDropDir, "pending");
        if (!Directory.Exists(pendingRoot)) return false;
        var candidate = Directory.GetDirectories(pendingRoot).OrderBy(d => d, StringComparer.OrdinalIgnoreCase).FirstOrDefault();
        if (candidate is null) return false;

        var manifestPath = Path.Combine(candidate, "manifest.json");
        if (!File.Exists(manifestPath)) return false; // still being written by the app

        Manifest? manifest;
        try
        {
            manifest = JsonSerializer.Deserialize<Manifest>(File.ReadAllText(manifestPath), new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Invalid update manifest in {Dir}; quarantining", candidate);
            Quarantine(candidate);
            return false;
        }
        if (manifest is null || manifest.Files.Count == 0) { Quarantine(candidate); return false; }

        // 1. Verify every file: hash from manifest, Authenticode for executables.
        foreach (var f in manifest.Files)
        {
            var path = Path.Combine(candidate, f.Name);
            if (f.Name.Contains("..") || Path.IsPathRooted(f.Name) || !File.Exists(path))
            {
                _log.LogError("Update {Version}: file {Name} missing or invalid name", manifest.Version, f.Name);
                Quarantine(candidate);
                return false;
            }
            if (!Sha256Hex(path).Equals(f.Sha256, StringComparison.OrdinalIgnoreCase))
            {
                _log.LogError("Update {Version}: hash mismatch for {Name}", manifest.Version, f.Name);
                Quarantine(candidate);
                return false;
            }
            if (f.Name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || f.Name.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
            {
                var reason = _verifier.Verify(path);
                if (reason is not null)
                {
                    _log.LogError("Update {Version}: signature check failed for {Name}: {Reason}", manifest.Version, f.Name, reason);
                    Quarantine(candidate);
                    return false;
                }
            }
        }

        // 2. Stop agents gracefully (they flush on exit), then force after 10 s.
        foreach (var p in runningAgents)
        {
            try
            {
                if (!p.CloseMainWindow()) p.Kill(); // message-only window: CloseMainWindow returns false, so Kill. Agent checkpoints every 30 s.
                p.WaitForExit(10_000);
            }
            catch (Exception ex) { _log.LogWarning(ex, "Stopping agent pid {Pid} for update failed", p.Id); }
        }

        // 3. Swap files, keeping the previous version for rollback.
        var previous = Path.Combine(_opt.UpdateDropDir, "previous");
        Directory.CreateDirectory(previous);
        try
        {
            foreach (var f in manifest.Files)
            {
                var target = Path.Combine(_opt.InstallDir, f.Name);
                var staged = Path.Combine(candidate, f.Name);
                if (File.Exists(target)) File.Copy(target, Path.Combine(previous, f.Name), overwrite: true);
                var tmp = target + ".new";
                File.Copy(staged, tmp, overwrite: true);
                File.Move(tmp, target, overwrite: true);
            }
            File.WriteAllText(Path.Combine(_opt.InstallDir, "VERSION"), manifest.Version);
            Directory.Delete(candidate, recursive: true);
            _log.LogInformation("Applied update {Version}", manifest.Version);
            return true;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Applying update {Version} failed; rolling back", manifest.Version);
            foreach (var f in manifest.Files)
            {
                var backup = Path.Combine(previous, f.Name);
                if (File.Exists(backup)) { try { File.Copy(backup, Path.Combine(_opt.InstallDir, f.Name), overwrite: true); } catch { } }
            }
            Quarantine(candidate);
            return true; // agents were stopped; let the supervisor restart them
        }
    }

    private void Quarantine(string dir)
    {
        try
        {
            var q = Path.Combine(_opt.UpdateDropDir, "failed", Path.GetFileName(dir) + "-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss"));
            Directory.CreateDirectory(Path.GetDirectoryName(q)!);
            Directory.Move(dir, q);
        }
        catch (Exception ex) { _log.LogWarning(ex, "Quarantine of {Dir} failed", dir); }
    }

    private static string Sha256Hex(string path)
    {
        using var fs = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(fs));
    }
}
