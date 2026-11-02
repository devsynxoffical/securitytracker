using System.Diagnostics;
using CompanyOS.Core.Abstractions;
using CompanyOS.Shared.Models;

namespace CompanyOS.Core.Clock;

/// <summary>Default time source: Stopwatch for monotonic time, DateTime.UtcNow for the wall clock.</summary>
public sealed class SystemTimeSource : ITimeSource
{
    private readonly Stopwatch _stopwatch = Stopwatch.StartNew();
    public TimeSpan Monotonic => _stopwatch.Elapsed;
    public DateTime WallUtc => DateTime.UtcNow;
}

/// <summary>
/// Monotonic clock anchored to server time (09 section 2, 03 F7 rule 1). Segment timestamps are
/// anchor + monotonic elapsed since the anchor, so a changed Windows clock never corrupts durations.
/// Before the first anchor the wall clock is used and segments carry clockSource = unanchored.
/// </summary>
public sealed class AnchoredClock
{
    private readonly ITimeSource _source;
    private readonly object _gate = new();
    private DateTime? _anchorUtc;
    private TimeSpan _anchorMonotonic;

    // Wall clock change detection: remember the last (wall, monotonic) pair we checked.
    private DateTime _lastWall;
    private TimeSpan _lastMonotonic;

    /// <summary>Wall clock jumps larger than this (relative to monotonic progress) are reported.</summary>
    public TimeSpan ChangeTolerance { get; init; } = TimeSpan.FromSeconds(30);

    public AnchoredClock(ITimeSource source)
    {
        _source = source;
        _lastWall = source.WallUtc;
        _lastMonotonic = source.Monotonic;
    }

    public bool IsAnchored { get { lock (_gate) return _anchorUtc.HasValue; } }

    public string Source => IsAnchored ? ClockSource.Anchored : ClockSource.Unanchored;

    /// <summary>Called on setAnchor. Server time wins over anything local.</summary>
    public void SetAnchor(DateTime serverUtc)
    {
        lock (_gate)
        {
            _anchorUtc = DateTime.SpecifyKind(serverUtc.ToUniversalTime(), DateTimeKind.Utc);
            _anchorMonotonic = _source.Monotonic;
        }
    }

    /// <summary>Restores an anchor persisted before a restart: the monotonic clock restarted, so the
    /// persisted anchor is only valid when paired with the wall time at persistence. We re-anchor to
    /// persistedAnchor + (wallNow - wallAtPersist) and mark it anchored only if the wall clock looks sane.</summary>
    public void RestoreAnchor(DateTime persistedAnchorUtc, DateTime wallAtPersistUtc)
    {
        var wallNow = _source.WallUtc;
        var delta = wallNow - wallAtPersistUtc;
        if (delta < TimeSpan.Zero || delta > TimeSpan.FromDays(45)) return; // clock went backwards or absurd: stay unanchored
        SetAnchor(persistedAnchorUtc + delta);
    }

    /// <summary>Current time for segments: anchored when possible, otherwise the wall clock.</summary>
    public DateTime Now()
    {
        lock (_gate)
        {
            if (_anchorUtc is { } anchor) return anchor + (_source.Monotonic - _anchorMonotonic);
            return _source.WallUtc;
        }
    }

    public TimeSpan Monotonic => _source.Monotonic;

    /// <summary>Snapshot needed to persist the anchor across restarts.</summary>
    public (DateTime AnchorNow, DateTime WallNow)? AnchorSnapshot()
    {
        lock (_gate)
        {
            if (!_anchorUtc.HasValue) return null;
            return (Now(), _source.WallUtc);
        }
    }

    /// <summary>
    /// Compares wall clock progress with monotonic progress since the last call. Returns the jump when the
    /// wall clock moved by more than ChangeTolerance relative to monotonic time (09 test matrix: "change
    /// Windows clock by 3 h -> durations unchanged, clock_changed recorded"). Sleep does not trigger it:
    /// Stopwatch keeps counting through standby on Windows (QueryPerformanceCounter), so both advance equally.
    /// </summary>
    public TimeSpan? DetectWallClockChange()
    {
        var wall = _source.WallUtc;
        var mono = _source.Monotonic;
        var wallDelta = wall - _lastWall;
        var monoDelta = mono - _lastMonotonic;
        _lastWall = wall;
        _lastMonotonic = mono;
        var jump = wallDelta - monoDelta;
        return jump.Duration() > ChangeTolerance ? jump : null;
    }
}
