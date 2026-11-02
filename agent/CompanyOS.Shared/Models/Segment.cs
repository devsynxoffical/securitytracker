namespace CompanyOS.Shared.Models;

/// <summary>String values match the server contract (packages/contracts enums.ts SegmentKind).</summary>
public static class SegmentKind
{
    public const string Active = "active";
    public const string Idle = "idle";
    public const string Locked = "locked";
}

/// <summary>Activity exception (09 section 2 and 3). Matches contracts ActivityException.</summary>
public static class ActivityException
{
    public const string None = "none";
    public const string CallApp = "call_app";
    public const string MeetingApp = "meeting_app";
    public const string Mic = "mic";
}

public static class ClockSource
{
    public const string Anchored = "anchored";
    public const string Unanchored = "unanchored";
}

/// <summary>Reserved domain values (09 section 3 and 5).</summary>
public static class DomainValues
{
    public const string Unknown = "unknown";
    public const string Excluded = "excluded";
    public const string BrowserInternal = "browser-internal";
}

/// <summary>
/// One continuous period with the same kind, process and domain (09 section 3).
/// Times are UTC from the anchored monotonic clock. Mutable while open, immutable once queued.
/// </summary>
public sealed class ActivitySegment
{
    public Guid Id { get; set; }
    public Guid ShiftId { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime EndedAt { get; set; }
    public string Kind { get; set; } = SegmentKind.Active;
    public string ProcessName { get; set; } = string.Empty;
    public string AppName { get; set; } = string.Empty;
    public string? Domain { get; set; }
    public string? WindowTitle { get; set; }
    public int KeyCount { get; set; }
    public int MouseCount { get; set; }
    public string Exception { get; set; } = ActivityException.None;
    public string ClockSource { get; set; } = Models.ClockSource.Unanchored;

    public int DurationSeconds => (int)Math.Max(0, Math.Round((EndedAt - StartedAt).TotalSeconds));

    public ActivitySegment Clone() => new()
    {
        Id = Id, ShiftId = ShiftId, StartedAt = StartedAt, EndedAt = EndedAt, Kind = Kind, ProcessName = ProcessName,
        AppName = AppName, Domain = Domain, WindowTitle = WindowTitle, KeyCount = KeyCount, MouseCount = MouseCount,
        Exception = Exception, ClockSource = ClockSource,
    };
}

/// <summary>Tamper signal (04 FR-TRK-12). Types: agent_stopped, extension_missing, clock_changed, binary_mismatch.</summary>
public sealed class TamperEvent
{
    public Guid Id { get; set; }
    public string Type { get; set; } = string.Empty;
    public Dictionary<string, string> Detail { get; set; } = new();
    public DateTime OccurredAt { get; set; }
}

public static class TamperType
{
    public const string AgentStopped = "agent_stopped";
    public const string ExtensionMissing = "extension_missing";
    public const string ClockChanged = "clock_changed";
    public const string BinaryMismatch = "binary_mismatch";
}
