using CompanyOS.Shared.Models;

namespace CompanyOS.Core.Abstractions;

/// <summary>Monotonic and wall-clock readings. Replaced in tests with a fake.</summary>
public interface ITimeSource
{
    /// <summary>Monotonic elapsed time since process start (Stopwatch). Never jumps.</summary>
    TimeSpan Monotonic { get; }

    /// <summary>Windows wall clock, UTC. Can jump when the user changes the clock.</summary>
    DateTime WallUtc { get; }
}

/// <summary>What the agent currently sees in the foreground.</summary>
public sealed record ForegroundInfo(string ProcessName, string AppName, string? WindowTitle, int ProcessId)
{
    public static readonly ForegroundInfo Unknown = new("unknown", "Unknown", null, 0);

    /// <summary>Same "app" for segment purposes: process name, case insensitive.</summary>
    public bool SameAppAs(ForegroundInfo other) => string.Equals(ProcessName, other.ProcessName, StringComparison.OrdinalIgnoreCase);
}

/// <summary>
/// Everything the tracking engine needs from Windows, behind an interface so the engine and its tests
/// never touch Win32. The Windows implementation lives in CompanyOS.Agent.
/// </summary>
public interface ISystemProbe
{
    /// <summary>Foreground window owner. Never throws; returns ForegroundInfo.Unknown on failure.</summary>
    ForegroundInfo GetForeground(bool includeTitle);

    /// <summary>Time since the last keyboard or mouse input in this session (GetLastInputInfo).</summary>
    TimeSpan SinceLastInput();

    /// <summary>True when any capture (microphone) audio session is active.</summary>
    bool IsMicrophoneInUse();

    /// <summary>Takes and resets the raw input counters accumulated since the last call. Counts only.</summary>
    (int Keys, int Mouse) DrainInputCounts();

    /// <summary>True while the session is locked (WTS_SESSION_LOCK seen without UNLOCK).</summary>
    bool IsSessionLocked { get; }

    /// <summary>Raised on lock, unlock, suspend, resume, session ending. Delivered on an arbitrary thread.</summary>
    event Action<SystemSignal>? Signal;
}

public enum SystemSignal
{
    SessionLocked,
    SessionUnlocked,
    Suspending,
    Resumed,
    SessionEnding,
}

/// <summary>Durable queue (09 section 4). Implemented over SQLite; tests use an in-memory SQLite file.</summary>
public interface IQueueStore
{
    void InsertSegment(ActivitySegment segment);
    void CheckpointOpenSegment(ActivitySegment? segment);
    ActivitySegment? ReadOpenSegmentCheckpoint();
    IReadOnlyList<ActivitySegment> PullSegments(int max);
    int AckSegments(IEnumerable<Guid> ids);
    int CountSegments();

    void InsertTamper(TamperEvent evt);
    IReadOnlyList<TamperEvent> PullTamper(int max);
    int AckTamper(IEnumerable<Guid> ids);
    int CountTamper();

    string? GetState(string key);
    void SetState(string key, string? value);

    long SizeBytes();
    DateTime? OldestSegmentStartedAt();
}

/// <summary>Encrypts the queue payload column. The Windows implementation uses AES-GCM with a DPAPI protected key.</summary>
public interface IPayloadCipher
{
    byte[] Encrypt(byte[] plaintext);
    byte[] Decrypt(byte[] ciphertext);
}

/// <summary>Sink for pipe events (agent -> app). The pipe server implements it; tests capture.</summary>
public interface IEventSink
{
    void Publish(string eventName, object payload);
}

/// <summary>Minimal logger so Core has no logging dependency.</summary>
public interface IAgentLog
{
    void Info(string message);
    void Warn(string message);
    void Error(string message, Exception? ex = null);
}
