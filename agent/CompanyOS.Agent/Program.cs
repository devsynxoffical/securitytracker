using System.Text.Json;
using CompanyOS.Agent.Win32;
using CompanyOS.Core.Clock;
using CompanyOS.Core.Pipe;
using CompanyOS.Core.Storage;
using CompanyOS.Core.Tracking;
using CompanyOS.Shared.Models;
using CompanyOS.Shared.Protocol;

namespace CompanyOS.Agent;

/// <summary>
/// Composition root. Runs in the interactive user session (09 section 1), started by the watchdog at logon.
/// One instance per session: a named mutex guards against duplicates. No network code (AGENTS.md rule 9).
/// </summary>
internal static class Program
{
    private const string AgentVersion = "1.0.0";

    private static int Main(string[] args)
    {
        var log = FileLog.Default;
        if (!OperatingSystem.IsWindows())
        {
            Console.Error.WriteLine("CompanyOS.Agent runs on Windows only.");
            return 2;
        }

        NativeMethods.ProcessIdToSessionId((uint)Environment.ProcessId, out var sessionId);
        using var singleInstance = new Mutex(true, $"Local\\CompanyOS.Agent.{sessionId}", out var createdNew);
        if (!createdNew)
        {
            log.Warn("Another agent instance is already running in this session; exiting");
            return 0;
        }

        log.Info($"Agent {AgentVersion} starting in session {sessionId}");

        WindowsSystemProbe? probe = null;
        PipeServer? pipe = null;
        SqliteQueueStore? queue = null;
        try
        {
            var cipher = DpapiKeyStore.LoadOrCreate(AgentPaths.KeyFile);
            queue = new SqliteQueueStore(AgentPaths.QueueDb, cipher);
            probe = new WindowsSystemProbe();
            var clock = new AnchoredClock(new SystemTimeSource());

            TrackingEngine? engineRef = null;
            pipe = new PipeServer(PipeNames.ForSession((int)sessionId), () => new CommandHandler(engineRef!, (int)sessionId, AgentVersion), log);
            var engine = new TrackingEngine(probe, queue, pipe, log, clock);
            engineRef = engine;

            engine.Start();
            IngestWatchdogNotices(engine, log);
            pipe.Start();

            using var shutdown = new ManualResetEventSlim(false);
            Console.CancelKeyPress += (_, e) => { e.Cancel = true; shutdown.Set(); };
            AppDomain.CurrentDomain.ProcessExit += (_, _) => shutdown.Set();
            probe.Signal += s => { if (s == Core.Abstractions.SystemSignal.SessionEnding) shutdown.Set(); };

            // 1 s tick (09 section 2). PeriodicTimer keeps cadence without drift.
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
            var tickTask = Task.Run(async () =>
            {
                var lastStatusWrite = DateTime.MinValue;
                while (await timer.WaitForNextTickAsync() && !shutdown.IsSet)
                {
                    try { engine.Tick(); }
                    catch (Exception ex) { log.Error("Tick failed", ex); }

                    if (DateTime.UtcNow - lastStatusWrite > TimeSpan.FromSeconds(30))
                    {
                        lastStatusWrite = DateTime.UtcNow;
                        WriteStatusFile(engine);
                    }
                }
            });

            shutdown.Wait();
            log.Info("Agent shutting down");
            timer.Dispose();
            tickTask.Wait(TimeSpan.FromSeconds(3));
            engine.Stop();
            WriteStatusFile(engine);
            return 0;
        }
        catch (Exception ex)
        {
            log.Error("Agent crashed", ex);
            return 1;
        }
        finally
        {
            pipe?.Dispose();
            probe?.Dispose();
            queue?.Dispose();
        }
    }

    /// <summary>
    /// The watchdog cannot write into the user's encrypted queue, so it drops small JSON notices
    /// ({"type":"agent_stopped","gapSeconds":12}) into tamper-inbox. We convert and delete them (09 section 6).
    /// </summary>
    private static void IngestWatchdogNotices(TrackingEngine engine, FileLog log)
    {
        try
        {
            if (!Directory.Exists(AgentPaths.TamperInbox)) return;
            foreach (var file in Directory.EnumerateFiles(AgentPaths.TamperInbox, "*.json"))
            {
                try
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(file));
                    var root = doc.RootElement;
                    var type = root.TryGetProperty("type", out var t) ? t.GetString() ?? TamperType.AgentStopped : TamperType.AgentStopped;
                    var detail = new Dictionary<string, string>();
                    foreach (var p in root.EnumerateObject())
                    {
                        if (p.Name != "type") detail[p.Name] = p.Value.ToString();
                    }
                    engine.RecordTamper(type, detail);
                }
                catch (Exception ex) { log.Warn($"Bad watchdog notice {Path.GetFileName(file)}: {ex.Message}"); }
                finally { try { File.Delete(file); } catch { } }
            }
        }
        catch (Exception ex) { log.Warn("Tamper inbox scan failed: " + ex.Message); }
    }

    /// <summary>Non-sensitive status for the watchdog: whether a shift is open, so it relaunches the app (09 section 6 rule 2).</summary>
    private static void WriteStatusFile(TrackingEngine engine)
    {
        try
        {
            var s = engine.Status();
            var json = $"{{\"state\":\"{s.State}\",\"shiftOpen\":{(s.State != TrackingState.Stopped ? "true" : "false")},\"updatedAt\":\"{DateTime.UtcNow:O}\",\"pid\":{Environment.ProcessId}}}";
            File.WriteAllText(AgentPaths.StatusFile, json);
        }
        catch { }
    }
}
