using System.Text.Json;
using CompanyOS.Core.Abstractions;
using CompanyOS.Core.Clock;
using CompanyOS.Core.Pipe;
using CompanyOS.Core.Tracking;
using CompanyOS.Shared.Models;
using CompanyOS.Shared.Protocol;
using Xunit;

namespace CompanyOS.Agent.Tests;

public class TrackingEngineTests
{
    private static (TrackingEngine Engine, FakeTime Time, FakeProbe Probe, MemoryQueue Queue, CapturingEvents Events) Make()
    {
        var time = new FakeTime();
        var probe = new FakeProbe();
        var queue = new MemoryQueue();
        var events = new CapturingEvents();
        var engine = new TrackingEngine(probe, queue, events, new NullLog(), new AnchoredClock(time));
        engine.Start();
        return (engine, time, probe, queue, events);
    }

    private static void Run(TrackingEngine e, FakeTime t, FakeProbe p, int seconds, Action<int>? each = null)
    {
        for (var i = 0; i < seconds; i++) { each?.Invoke(i); p.Keys = 1; e.Tick(); t.Advance(TimeSpan.FromSeconds(1)); }
    }

    [Fact]
    public void Nothing_is_recorded_while_stopped_or_paused()
    {
        var (e, t, p, q, _) = Make();
        Run(e, t, p, 30);
        Assert.Empty(q.Segments);

        var shift = Guid.NewGuid();
        e.StartTracking(shift);
        Run(e, t, p, 30);
        e.PauseTracking("lunch");
        var afterPause = q.Segments.Count;
        Assert.True(afterPause >= 1);
        Run(e, t, p, 30);
        Assert.Equal(afterPause, q.Segments.Count);
        e.ResumeTracking();
        Run(e, t, p, 30);
        e.StopTracking();
        Assert.True(q.Segments.Count > afterPause);
        Assert.All(q.Segments, s => Assert.Equal(shift, s.ShiftId));
    }

    [Fact]
    public void Start_is_idempotent_for_same_shift_and_persists_state()
    {
        var (e, _, _, q, events) = Make();
        var shift = Guid.NewGuid();
        e.StartTracking(shift);
        e.StartTracking(shift);
        Assert.Single(events.Published.Where(x => x.Name == Events.StateChanged));
        var persisted = PipeJson.Deserialize<PersistedTrackingState>(q.State["tracking_state"])!;
        Assert.Equal(TrackingState.Tracking, persisted.State);
        Assert.Equal(shift, persisted.ShiftId);
    }

    [Fact]
    public void Checkpoint_every_30_seconds_and_resume_after_restart_closes_open_segment()
    {
        var (e, t, p, q, _) = Make();
        var shift = Guid.NewGuid();
        e.SetAnchor(t.WallUtc);
        e.StartTracking(shift);
        Run(e, t, p, 45);
        Assert.NotNull(q.Checkpoint);
        Assert.Equal(shift, q.Checkpoint!.ShiftId);
        var countBefore = q.Segments.Count;

        // "Crash": new engine over the same queue. It must resume tracking and persist the checkpointed segment.
        var engine2 = new TrackingEngine(p, q, new CapturingEvents(), new NullLog(), new AnchoredClock(t));
        engine2.Start();
        Assert.Equal(countBefore + 1, q.Segments.Count);
        Assert.Null(q.Checkpoint);
        Assert.Equal(TrackingState.Tracking, engine2.Status().State);
        Assert.Equal(shift, engine2.Status().ShiftId);
        Assert.True(engine2.Clock.IsAnchored, "anchor restored from persisted state");
    }

    [Fact]
    public void Clock_change_records_tamper_event()
    {
        var (e, t, p, q, _) = Make();
        e.Tick(); // establishes baseline
        t.Advance(TimeSpan.FromSeconds(6));
        e.Tick();
        t.Monotonic += TimeSpan.FromSeconds(6);
        t.WallUtc += TimeSpan.FromSeconds(6) + TimeSpan.FromHours(3);
        e.Tick();
        Assert.Contains(q.Tamper, x => x.Type == TamperType.ClockChanged && x.Detail["jumpSeconds"] == "10800");
    }

    [Fact]
    public void Extension_missing_is_recorded_once_per_shift()
    {
        var (e, t, p, q, _) = Make();
        p.Foreground = new ForegroundInfo("chrome.exe", "Google Chrome", null, 5);
        e.StartTracking(Guid.NewGuid());
        Run(e, t, p, 5);
        Assert.Single(q.Tamper.Where(x => x.Type == TamperType.ExtensionMissing));
        Assert.All(q.Segments.Concat(new[] { q.Checkpoint! }).Where(s => s is not null), s => Assert.Equal(DomainValues.Unknown, s!.Domain));
    }

    [Fact]
    public void Extension_domain_is_applied_to_browser_segments()
    {
        var (e, t, p, q, _) = Make();
        p.Foreground = new ForegroundInfo("chrome.exe", "Google Chrome", null, 5);
        e.StartTracking(Guid.NewGuid());
        e.OnExtensionDomain(new ExtensionDomainMessage { Browser = "chrome", Domain = "docs.google.com", Ts = 0 });
        Run(e, t, p, 10);
        e.StopTracking();
        Assert.All(q.Segments, s => Assert.Equal("docs.google.com", s.Domain));
        Assert.Empty(q.Tamper.Where(x => x.Type == TamperType.ExtensionMissing));
    }

    [Fact]
    public void Suspend_signal_flushes_and_clears_checkpoint()
    {
        var (e, t, p, q, _) = Make();
        e.StartTracking(Guid.NewGuid());
        Run(e, t, p, 40);
        Assert.NotNull(q.Checkpoint);
        p.Raise(SystemSignal.Suspending);
        Assert.Null(q.Checkpoint);
        Assert.True(q.Segments.Count >= 1);
        var last = q.Segments.Max(s => s.EndedAt);
        Assert.Equal(e.Clock.Now(), last);
    }

    [Fact]
    public void Queue_warning_once_when_capacity_reached()
    {
        var (e, t, p, q, events) = Make();
        e.StartTracking(Guid.NewGuid());
        q.Bytes = (long)(CompanyOS.Core.Storage.CapacityCalculator.MaxBytes * 0.95);
        Run(e, t, p, 70);
        Assert.Single(events.Published.Where(x => x.Name == Events.QueueWarning));
    }

    [Fact]
    public void Pull_and_ack_follow_the_app_contract()
    {
        var (e, t, p, q, _) = Make();
        e.StartTracking(Guid.NewGuid());
        Run(e, t, p, 10, i => { if (i == 5) p.Foreground = new ForegroundInfo("excel.exe", "Excel", null, 6); });
        e.StopTracking();
        var pulled = e.PullSegments(1);
        Assert.Single(pulled.Segments);
        Assert.Equal(q.Segments.Count - 1, pulled.Remaining);
        Assert.Equal(1, e.AckSegments(pulled.Segments.Select(s => s.Id)));
        Assert.Equal(q.Segments.Count, e.Status().QueuedSegments);
    }
}

public class CommandHandlerTests
{
    private static (CommandHandler Handler, TrackingEngine Engine, MemoryQueue Queue) Make()
    {
        var time = new FakeTime();
        var queue = new MemoryQueue();
        var engine = new TrackingEngine(new FakeProbe(), queue, new CapturingEvents(), new NullLog(), new AnchoredClock(time));
        engine.Start();
        return (new CommandHandler(engine, 1, "1.0.0"), engine, queue);
    }

    [Fact]
    public void Hello_returns_version_and_state()
    {
        var (h, _, _) = Make();
        var res = h.Handle("{\"command\":\"hello\",\"id\":\"1\",\"payload\":{\"appVersion\":\"2.0.0\"}}");
        Assert.True(res.Ok);
        Assert.Equal("1", res.Id);
        var hello = PipeJson.Deserialize<HelloResponse>(res.Payload!.Value)!;
        Assert.Equal("1.0.0", hello.AgentVersion);
        Assert.Equal(TrackingState.Stopped, hello.State);
        Assert.Equal(1, hello.SessionId);
    }

    [Fact]
    public void Full_shift_sequence_over_json()
    {
        var (h, engine, queue) = Make();
        var shift = Guid.NewGuid();
        Assert.True(h.Handle($"{{\"command\":\"setAnchor\",\"payload\":{{\"serverTime\":\"2026-11-02T12:00:00Z\"}}}}").Ok);
        Assert.True(h.Handle("{\"command\":\"setConfig\",\"payload\":{\"idleThresholdSeconds\":120,\"callApps\":[\"teams.exe\"]}}").Ok);
        Assert.True(h.Handle($"{{\"command\":\"startTracking\",\"payload\":{{\"shiftId\":\"{shift}\"}}}}").Ok);
        var status = PipeJson.Deserialize<StatusResponse>(h.Handle("{\"command\":\"status\"}").Payload!.Value)!;
        Assert.Equal(TrackingState.Tracking, status.State);
        Assert.True(status.Anchored);
        Assert.True(h.Handle("{\"command\":\"pauseTracking\",\"payload\":{\"reason\":\"break\"}}").Ok);
        Assert.Equal(TrackingState.Paused, engine.Status().State);
        Assert.True(h.Handle("{\"command\":\"resumeTracking\"}").Ok);
        Assert.True(h.Handle("{\"command\":\"stopTracking\"}").Ok);
        Assert.Equal(TrackingState.Stopped, engine.Status().State);

        var pull = PipeJson.Deserialize<PullSegmentsResponse>(h.Handle("{\"command\":\"pullSegments\",\"payload\":{\"max\":500}}").Payload!.Value)!;
        Assert.NotNull(pull.Segments);
        var cfg = PipeJson.Deserialize<TrackingConfig>(queue.State["config"])!;
        Assert.Equal(120, cfg.IdleThresholdSeconds);
    }

    [Fact]
    public void Validation_errors_are_reported_not_thrown()
    {
        var (h, _, _) = Make();
        Assert.False(h.Handle("not json").Ok);
        Assert.False(h.Handle("{\"command\":\"\"}").Ok);
        Assert.False(h.Handle("{\"command\":\"startTracking\",\"payload\":{}}").Ok);
        Assert.False(h.Handle("{\"command\":\"setConfig\",\"payload\":{\"idleThresholdSeconds\":5}}").Ok);
        Assert.Equal("unknown_command", h.Handle("{\"command\":\"deleteEverything\"}").Error);
    }

    [Fact]
    public void Segment_json_matches_server_contract_field_names()
    {
        var seg = new ActivitySegment
        {
            Id = Guid.Parse("018f3a1e-0000-7000-8000-000000000001"), ShiftId = Guid.NewGuid(),
            StartedAt = new DateTime(2026, 11, 2, 9, 0, 0, DateTimeKind.Utc), EndedAt = new DateTime(2026, 11, 2, 9, 5, 0, DateTimeKind.Utc),
            Kind = SegmentKind.Active, ProcessName = "chrome.exe", AppName = "Google Chrome", Domain = "youtube.com", KeyCount = 12, MouseCount = 34,
            Exception = ActivityException.None, ClockSource = ClockSource.Anchored,
        };
        using var doc = JsonDocument.Parse(PipeJson.Serialize(seg));
        var root = doc.RootElement;
        foreach (var name in new[] { "id", "shiftId", "startedAt", "endedAt", "kind", "processName", "appName", "domain", "keyCount", "mouseCount", "exception", "clockSource" })
        {
            Assert.True(root.TryGetProperty(name, out _), $"missing {name}");
        }
        Assert.False(root.TryGetProperty("windowTitle", out _)); // null omitted
        Assert.Equal("active", root.GetProperty("kind").GetString());
        Assert.Equal("2026-11-02T09:00:00Z", root.GetProperty("startedAt").GetString());
    }
}
