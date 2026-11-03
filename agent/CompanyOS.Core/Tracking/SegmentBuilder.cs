using CompanyOS.Core.Abstractions;
using CompanyOS.Shared;
using CompanyOS.Shared.Models;

namespace CompanyOS.Core.Tracking;

/// <summary>Input for one tick of the builder (once per second).</summary>
public readonly record struct TickInput(
    DateTime Now,
    ForegroundInfo Foreground,
    string? Domain,
    TimeSpan SinceInput,
    bool MicrophoneInUse,
    int KeysSinceLastTick,
    int MouseSinceLastTick,
    bool SessionLocked);

/// <summary>
/// Pure segment state machine implementing 09 section 3: open and close segments on foreground, domain and
/// kind changes, the 5-minute cap, idle split backdated to the last input, activity exceptions, lock, and the
/// 2-second alt-tab flicker merge. Emits closed segments through <see cref="Emit"/> and long idle prompts
/// through <see cref="LongIdleEnded"/>. Not thread safe: the engine calls it from one thread.
/// </summary>
public sealed class SegmentBuilder
{
    private readonly TrackingConfig _config;
    private readonly Func<string> _clockSource;
    private readonly Func<DateTime, Guid> _newId;

    private ActivitySegment? _current;

    /// <summary>Last closed segment held back for the flicker merge (09 section 3 last line).</summary>
    private ActivitySegment? _pending;

    /// <summary>When the current segment started in the "kind changed to idle" sense, to measure idle length.</summary>
    private DateTime? _idleSince;

    public Guid ShiftId { get; }

    public event Action<ActivitySegment>? Emit;
    public event Action<DateTime, DateTime>? LongIdleEnded;

    public ActivitySegment? Current => _current;

    public SegmentBuilder(Guid shiftId, TrackingConfig config, Func<string> clockSource, Func<DateTime, Guid>? newId = null)
    {
        ShiftId = shiftId;
        _config = config;
        _clockSource = clockSource;
        _newId = newId ?? UuidV7.New;
    }

    /// <summary>Restores an open segment from the 30 s checkpoint after a crash (09 section 4).</summary>
    public void RestoreOpen(ActivitySegment checkpoint)
    {
        _current = checkpoint;
        _idleSince = checkpoint.Kind == SegmentKind.Idle ? checkpoint.StartedAt : null;
    }

    public void Tick(in TickInput t)
    {
        if (_current is null)
        {
            Open(t.Now, t.SessionLocked ? SegmentKind.Locked : (t.SinceInput >= IdleThreshold ? SegmentKind.Idle : SegmentKind.Active), t);
            if (_current!.Kind == SegmentKind.Idle) _idleSince = t.Now - t.SinceInput;
            AddCounts(t);
            return;
        }

        // 1. Lock state drives the kind before anything else.
        if (t.SessionLocked)
        {
            if (_current.Kind != SegmentKind.Locked) Switch(t.Now, SegmentKind.Locked, t, "lock");
            AddCounts(t);
            Cap(t);
            return;
        }
        if (_current.Kind == SegmentKind.Locked)
        {
            // Unlock behaves like input: back to active, prompt when the lock was long (09 test matrix).
            var lockedFor = t.Now - _current.StartedAt;
            Switch(t.Now, SegmentKind.Active, t, "unlock");
            AddCounts(t);
            if (lockedFor >= LongIdleThreshold) LongIdleEnded?.Invoke(t.Now - lockedFor, t.Now);
            Cap(t);
            return;
        }

        // 2. Foreground or domain change closes the segment (with flicker merge). Counts of this tick belong
        //    to the segment that is current after the switch.
        var fgChanged = !_current.ProcessName.Equals(t.Foreground.ProcessName, StringComparison.OrdinalIgnoreCase)
                        || !string.Equals(_current.Domain, t.Domain, StringComparison.Ordinal);
        if (fgChanged)
        {
            Switch(t.Now, _current.Kind == SegmentKind.Idle ? SegmentKind.Idle : SegmentKind.Active, t, "foreground");
        }
        AddCounts(t);

        // Once the new segment has outlived the flicker window the held-back predecessor is final: queue it,
        // so a crash never loses more than the 30 s checkpoint allows (09 section 4).
        if (_pending is not null && t.Now - _current!.StartedAt >= FlickerMerge)
        {
            Emit?.Invoke(_pending);
            _pending = null;
        }

        // 3. Idle logic (09 section 3 pseudo code).
        var exception = ExceptionFor(t);
        if (_current!.Kind == SegmentKind.Active)
        {
            if (exception != ActivityException.None) _current.Exception = exception;

            if (t.SinceInput >= IdleThreshold && exception == ActivityException.None)
            {
                var lastInput = t.Now - t.SinceInput;
                SplitToIdleAt(lastInput, t);
            }
        }
        else if (_current.Kind == SegmentKind.Idle && t.SinceInput < IdleThreshold)
        {
            var from = _idleSince ?? _current.StartedAt;
            Switch(t.Now, SegmentKind.Active, t, "input");
            if (t.Now - from >= LongIdleThreshold) LongIdleEnded?.Invoke(from, t.Now);
        }

        Cap(t);
    }

    /// <summary>Break or stop: close everything and flush, nothing stays open.</summary>
    public void Flush(DateTime now)
    {
        if (_current is not null)
        {
            _current.EndedAt = now;
            EmitPendingThen(_current);
            _current = null;
        }
        else if (_pending is not null)
        {
            Emit?.Invoke(_pending);
            _pending = null;
        }
        _idleSince = null;
    }

    /// <summary>Sleep or shutdown: like Flush, but the next tick reopens (09 section 2 power events).</summary>
    public void CloseForPowerEvent(DateTime now) => Flush(now);

    // ---- internals -------------------------------------------------------------------------

    private TimeSpan IdleThreshold => TimeSpan.FromSeconds(_config.IdleThresholdSeconds);
    private TimeSpan LongIdleThreshold => TimeSpan.FromSeconds(_config.LongIdleThresholdSeconds);
    private TimeSpan SegmentMax => TimeSpan.FromSeconds(_config.SegmentMaxSeconds);
    private TimeSpan FlickerMerge => TimeSpan.FromSeconds(_config.FlickerMergeSeconds);

    private void AddCounts(in TickInput t)
    {
        if (_current is null) return;
        _current.KeyCount += t.KeysSinceLastTick;
        _current.MouseCount += t.MouseSinceLastTick;
    }

    private string ExceptionFor(in TickInput t)
    {
        var p = t.Foreground.ProcessName;
        if (_config.CallApps.Any(a => a.Equals(p, StringComparison.OrdinalIgnoreCase))) return ActivityException.CallApp;
        if (_config.MeetingApps.Any(a => a.Equals(p, StringComparison.OrdinalIgnoreCase))) return ActivityException.MeetingApp;
        if (t.MicrophoneInUse) return ActivityException.Mic;
        return ActivityException.None;
    }

    private void Open(DateTime now, string kind, in TickInput t)
    {
        _current = new ActivitySegment
        {
            Id = _newId(now),
            ShiftId = ShiftId,
            StartedAt = now,
            EndedAt = now,
            Kind = kind,
            ProcessName = t.Foreground.ProcessName,
            AppName = t.Foreground.AppName,
            Domain = t.Domain,
            WindowTitle = _config.CaptureWindowTitles ? t.Foreground.WindowTitle : null,
            Exception = ActivityException.None,
            ClockSource = _clockSource(),
        };
        _idleSince = kind == SegmentKind.Idle ? now : null;
    }

    /// <summary>Closes the current segment at <paramref name="now"/> and opens a new one of <paramref name="kind"/>.
    /// Implements the flicker merge: a closed segment shorter than FlickerMergeSeconds that sits between two
    /// segments of the same app, domain and kind is folded into the earlier one.</summary>
    private void Switch(DateTime now, string kind, in TickInput t, string reason)
    {
        var closing = _current!;
        closing.EndedAt = now;

        if (reason == "foreground" && _pending is not null
            && now - closing.StartedAt < FlickerMerge
            && SameKey(_pending, t.Foreground, t.Domain, kind))
        {
            // Flicker: drop `closing`, give its counts to the pending segment and reopen it.
            _pending.KeyCount += closing.KeyCount;
            _pending.MouseCount += closing.MouseCount;
            _current = _pending;
            _pending = null;
            _idleSince = _current.Kind == SegmentKind.Idle ? _idleSince : null;
            return;
        }

        if (_pending is not null) Emit?.Invoke(_pending);
        _pending = closing;
        Open(now, kind, t);

        // Only foreground switches are merge candidates. Any other close reason flushes immediately so the
        // queue sees the data (power, lock, idle, cap).
        if (reason != "foreground")
        {
            Emit?.Invoke(_pending);
            _pending = null;
        }
    }

    private static bool SameKey(ActivitySegment s, ForegroundInfo fg, string? domain, string kind)
        => s.Kind == kind
           && s.ProcessName.Equals(fg.ProcessName, StringComparison.OrdinalIgnoreCase)
           && string.Equals(s.Domain, domain, StringComparison.Ordinal);

    /// <summary>Idle split: the part after the last input becomes an idle segment (09 section 3).</summary>
    private void SplitToIdleAt(DateTime lastInput, in TickInput t)
    {
        var cur = _current!;
        if (lastInput <= cur.StartedAt)
        {
            // No input at all inside this segment: it was idle from its start.
            cur.Kind = SegmentKind.Idle;
            _idleSince = lastInput < cur.StartedAt ? cur.StartedAt : lastInput;
            return;
        }

        cur.EndedAt = lastInput;
        var idle = new ActivitySegment
        {
            Id = _newId(lastInput),
            ShiftId = ShiftId,
            StartedAt = lastInput,
            EndedAt = t.Now,
            Kind = SegmentKind.Idle,
            ProcessName = cur.ProcessName,
            AppName = cur.AppName,
            Domain = cur.Domain,
            WindowTitle = cur.WindowTitle,
            ClockSource = _clockSource(),
        };
        EmitPendingThen(cur);
        _current = idle;
        _idleSince = lastInput;
    }

    private void Cap(in TickInput t)
    {
        if (_current is null) return;
        _current.EndedAt = t.Now;
        if (t.Now - _current.StartedAt >= SegmentMax)
        {
            var kind = _current.Kind;
            var cur = _current;
            var idleSince = _idleSince;

            // An active segment whose tail has had no input yet is cut at the last input, not at the cap:
            // the tail continues as its own segment, so if it turns out to be idle the idle split can still be
            // backdated to the last input instead of counting up to the idle threshold as active (09 section 3).
            // Exceptions (calls, meetings, microphone) keep the plain cap: their quiet time is active by rule.
            var lastInput = t.Now - t.SinceInput;
            var capAt = kind == SegmentKind.Active && t.SinceInput > TimeSpan.Zero && ExceptionFor(t) == ActivityException.None && lastInput > cur.StartedAt
                ? lastInput
                : t.Now;

            cur.EndedAt = capAt;
            EmitPendingThen(cur);
            Open(capAt, kind, t);
            _current!.EndedAt = t.Now;

            // The long-idle clock keeps running across caps; it measures the whole absence, not the last slice.
            if (kind == SegmentKind.Idle) _idleSince = idleSince ?? cur.StartedAt;
        }
    }

    private void EmitPendingThen(ActivitySegment s)
    {
        if (_pending is not null) { Emit?.Invoke(_pending); _pending = null; }
        Emit?.Invoke(s);
    }
}
