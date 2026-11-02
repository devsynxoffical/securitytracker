using CompanyOS.Core.Abstractions;
using CompanyOS.Shared.Models;

namespace CompanyOS.Agent.Tests;

/// <summary>Controllable time: tests advance monotonic and wall clocks independently.</summary>
public sealed class FakeTime : ITimeSource
{
    public TimeSpan Monotonic { get; set; } = TimeSpan.Zero;
    public DateTime WallUtc { get; set; } = new(2026, 11, 2, 9, 0, 0, DateTimeKind.Utc);

    public void Advance(TimeSpan by) { Monotonic += by; WallUtc += by; }
}

public sealed class FakeProbe : ISystemProbe
{
    public ForegroundInfo Foreground { get; set; } = new("word.exe", "Microsoft Word", null, 10);
    public TimeSpan SinceInput { get; set; } = TimeSpan.Zero;
    public bool Mic { get; set; }
    public int Keys { get; set; }
    public int Mouse { get; set; }
    public bool IsSessionLocked { get; set; }
    public event Action<SystemSignal>? Signal;

    public ForegroundInfo GetForeground(bool includeTitle) => Foreground;
    public TimeSpan SinceLastInput() => SinceInput;
    public bool IsMicrophoneInUse() => Mic;
    public (int Keys, int Mouse) DrainInputCounts() { var r = (Keys, Mouse); Keys = 0; Mouse = 0; return r; }
    public void Raise(SystemSignal s) => Signal?.Invoke(s);
}

public sealed class MemoryQueue : IQueueStore
{
    public readonly List<ActivitySegment> Segments = new();
    public readonly List<TamperEvent> Tamper = new();
    public readonly Dictionary<string, string> State = new();
    public ActivitySegment? Checkpoint;
    public long Bytes;

    public void InsertSegment(ActivitySegment segment) { if (Segments.All(s => s.Id != segment.Id)) Segments.Add(segment.Clone()); }
    public void CheckpointOpenSegment(ActivitySegment? segment) => Checkpoint = segment?.Clone();
    public ActivitySegment? ReadOpenSegmentCheckpoint() => Checkpoint?.Clone();
    public IReadOnlyList<ActivitySegment> PullSegments(int max) => Segments.OrderBy(s => s.StartedAt).Take(max).ToList();
    public int AckSegments(IEnumerable<Guid> ids) { var set = ids.ToHashSet(); return Segments.RemoveAll(s => set.Contains(s.Id)); }
    public int CountSegments() => Segments.Count;
    public void InsertTamper(TamperEvent evt) => Tamper.Add(evt);
    public IReadOnlyList<TamperEvent> PullTamper(int max) => Tamper.Take(max).ToList();
    public int AckTamper(IEnumerable<Guid> ids) { var set = ids.ToHashSet(); return Tamper.RemoveAll(t => set.Contains(t.Id)); }
    public int CountTamper() => Tamper.Count;
    public string? GetState(string key) => State.TryGetValue(key, out var v) ? v : null;
    public void SetState(string key, string? value) { if (value is null) State.Remove(key); else State[key] = value; }
    public long SizeBytes() => Bytes;
    public DateTime? OldestSegmentStartedAt() => Segments.Count == 0 ? null : Segments.Min(s => s.StartedAt);
}

public sealed class CapturingEvents : IEventSink
{
    public readonly List<(string Name, object Payload)> Published = new();
    public void Publish(string eventName, object payload) => Published.Add((eventName, payload));
}

public sealed class NullLog : IAgentLog
{
    public readonly List<string> Lines = new();
    public void Info(string message) => Lines.Add("I " + message);
    public void Warn(string message) => Lines.Add("W " + message);
    public void Error(string message, Exception? ex = null) => Lines.Add("E " + message);
}
