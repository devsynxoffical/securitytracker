using CompanyOS.Core.Abstractions;

namespace CompanyOS.Agent;

/// <summary>
/// Small rolling text log in %LOCALAPPDATA%\CompanyOS\agent\logs. Never logs window titles, domains or
/// counts (AGENTS.md rule 6 spirit: operational messages only). 5 files of 2 MB.
/// </summary>
internal sealed class FileLog : IAgentLog
{
    public static FileLog Default { get; } = new(Path.Combine(AgentPaths.Root, "logs"));

    private readonly string _dir;
    private readonly object _gate = new();
    private const long MaxBytes = 2 * 1024 * 1024;
    private const int MaxFiles = 5;

    public FileLog(string dir) { _dir = dir; }

    public void Info(string message) => Write("INFO", message);
    public void Warn(string message) => Write("WARN", message);
    public void Error(string message, Exception? ex = null) => Write("ERROR", ex is null ? message : $"{message}: {ex.GetType().Name}: {ex.Message}");

    private void Write(string level, string message)
    {
        try
        {
            lock (_gate)
            {
                Directory.CreateDirectory(_dir);
                var path = Path.Combine(_dir, "agent.log");
                if (File.Exists(path) && new FileInfo(path).Length > MaxBytes) Roll(path);
                File.AppendAllText(path, $"{DateTime.UtcNow:O} [{level}] {message}{Environment.NewLine}");
            }
        }
        catch
        {
            // Logging must never affect tracking.
        }
    }

    private static void Roll(string path)
    {
        for (var i = MaxFiles - 1; i >= 1; i--)
        {
            var from = i == 1 ? path : $"{path}.{i - 1}";
            var to = $"{path}.{i}";
            if (File.Exists(from)) File.Move(from, to, overwrite: true);
        }
    }
}

internal static class AgentPaths
{
    public static string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CompanyOS", "agent");
    public static string QueueDb => Path.Combine(Root, "queue.db");
    public static string KeyFile => Path.Combine(Root, "queue.key");
    /// <summary>Watchdog drops restart notices here (09 section 6 rule 2); the agent converts them to tamper events.</summary>
    public static string TamperInbox => Path.Combine(Root, "tamper-inbox");
    /// <summary>Plain, non-sensitive status for the watchdog (shift open yes/no) so it can relaunch the app.</summary>
    public static string StatusFile => Path.Combine(Root, "status.json");
}
