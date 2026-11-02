namespace CompanyOS.Shared.Models;

/// <summary>Agent tracking state as reported over the pipe (09 section 4, 03 F5).</summary>
public static class TrackingState
{
    /// <summary>No open shift. The agent measures nothing.</summary>
    public const string Stopped = "stopped";

    /// <summary>Shift WORKING: segments are produced.</summary>
    public const string Tracking = "tracking";

    /// <summary>Shift ON_BREAK: no segments are produced.</summary>
    public const string Paused = "paused";
}

/// <summary>Persisted in the queue's state table so tracking resumes after a restart (09 section 4).</summary>
public sealed class PersistedTrackingState
{
    public string State { get; set; } = TrackingState.Stopped;
    public Guid? ShiftId { get; set; }
    public DateTime? ShiftStartedAt { get; set; }
    public string? PauseReason { get; set; }
    public bool ExtensionMissingReported { get; set; }
}
