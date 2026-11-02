using CompanyOS.Core.Abstractions;
using CompanyOS.Core.Clock;
using CompanyOS.Core.Storage;
using CompanyOS.Shared;
using CompanyOS.Shared.Models;
using CompanyOS.Shared.Protocol;

namespace CompanyOS.Core.Tracking;

/// <summary>
/// Orchestrates measurement: owns the state machine (stopped, tracking, paused), the SegmentBuilder for the
/// open shift, the domain tracker, the queue and the 30 s checkpoint. <see cref="Tick"/> is called once per
/// second by the host. All public members are serialised by one lock so pipe commands and ticks never race.
/// Contains no Win32 and no network code (AGENTS.md rule 9).
/// </summary>
public sealed class TrackingEngine
{
    private const string StateKey = "tracking_state";
    private const string ConfigKey = "config";
    private const string AnchorKey = "anchor";

    private readonly ISystemProbe _probe;
    private readonly IQueueStore _queue;
    private readonly IEventSink _events;
    private readonly IAgentLog _log;
    private readonly DomainTracker _domains = new();
    private readonly object _gate = new();

    private TrackingConfig _config = new();
    private PersistedTrackingState _state = new();
    private SegmentBuilder? _builder;
    private DateTime _lastCheckpoint = DateTime.MinValue;
    private bool _warnedCapacity;
    private DateTime _lastClockCheck = DateTime.MinValue;
    private string? _lastForegroundProcess;
    private string? _lastKind;
    private int _lastSinceInput;

    public AnchoredClock Clock { get; }

    public TrackingEngine(ISystemProbe probe, IQueueStore queue, IEventSink events, IAgentLog log, AnchoredClock clock)
    {
        _probe = probe;
        _queue = queue;
        _events = events;
        _log = log;
        Clock = clock;
        _probe.Signal += OnSignal;
    }

    // ---- lifecycle -------------------------------------------------------------------------------

    /// <summary>Loads config, anchor and state; resumes a shift that was open before a restart (09 section 4).</summary>
    public void Start()
    {
        lock (_gate)
        {
            var cfg = _queue.GetState(ConfigKey);
            if (cfg is not null) _config = PipeJson.Deserialize<TrackingConfig>(cfg) ?? new TrackingConfig();

            var anchor = _queue.GetState(AnchorKey);
            if (anchor is not null)
            {
                var parts = anchor.Split('|');
                if (parts.Length == 2
                    && DateTime.TryParse(parts[0], null, System.Globalization.DateTimeStyles.RoundtripKind, out var a)
                    && DateTime.TryParse(parts[1], null, System.Globalization.DateTimeStyles.RoundtripKind, out var w))
                {
                    Clock.RestoreAnchor(a.ToUniversalTime(), w.ToUniversalTime());
                }
            }

            var st = _queue.GetState(StateKey);
            if (st is not null) _state = PipeJson.Deserialize<PersistedTrackingState>(st) ?? new PersistedTrackingState();

            if (_state.State != TrackingState.Stopped && _state.ShiftId is { } shiftId)
            {
                _builder = NewBuilder(shiftId);
                var checkpoint = _queue.ReadOpenSegmentCheckpoint();
                if (checkpoint is not null && checkpoint.ShiftId == shiftId)
                {
                    // The segment that was open when we died: close it at the checkpoint time so no time is invented.
                    _queue.InsertSegment(checkpoint);
                    _queue.CheckpointOpenSegment(null);
                }
                _log.Info($"Resumed shift {shiftId} in state {_state.State} after restart");
            }
        }
    }

    public void Stop()
    {
        lock (_gate)
        {
            if (_builder is not null)
            {
                _builder.Flush(Clock.Now());
                _queue.CheckpointOpenSegment(null);
            }
            PersistAnchor();
        }
    }

    // ---- commands (09 section 4) ------------------------------------------------------------------

    public HelloResponse Hello(int sessionId, string agentVersion)
    {
        lock (_gate) return new HelloResponse { AgentVersion = agentVersion, State = _state.State, ShiftId = _state.ShiftId, Anchored = Clock.IsAnchored, SessionId = sessionId };
    }

    public void SetAnchor(DateTime serverTime)
    {
        lock (_gate)
        {
            Clock.SetAnchor(serverTime);
            PersistAnchor();
        }
    }

    public void SetConfig(TrackingConfig config)
    {
        lock (_gate)
        {
            _config = config;
            _queue.SetState(ConfigKey, PipeJson.Serialize(config));
            // A running builder keeps the config object it was created with; thresholds apply from the next shift
            // except idle thresholds, which read live through the shared instance below.
            if (_builder is not null)
            {
                _builder.Flush(Clock.Now());
                _builder = NewBuilder(_builder.ShiftId);
            }
        }
    }

    public void StartTracking(Guid shiftId)
    {
        lock (_gate)
        {
            if (_state.State != TrackingState.Stopped && _state.ShiftId == shiftId)
            {
                if (_state.State == TrackingState.Paused) ResumeTracking();
                return; // idempotent
            }
            if (_builder is not null) _builder.Flush(Clock.Now());
            _builder = NewBuilder(shiftId);
            _state = new PersistedTrackingState { State = TrackingState.Tracking, ShiftId = shiftId, ShiftStartedAt = Clock.Now() };
            PersistState();
            _events.Publish(Events.StateChanged, new StateChangedEvent { State = _state.State, ShiftId = shiftId });
            _log.Info($"Tracking started for shift {shiftId}");
        }
    }

    public void PauseTracking(string? reason)
    {
        lock (_gate)
        {
            if (_state.State != TrackingState.Tracking) return;
            _builder?.Flush(Clock.Now());
            _queue.CheckpointOpenSegment(null);
            _state.State = TrackingState.Paused;
            _state.PauseReason = reason;
            PersistState();
            _events.Publish(Events.StateChanged, new StateChangedEvent { State = _state.State, ShiftId = _state.ShiftId });
        }
    }

    public void ResumeTracking()
    {
        lock (_gate)
        {
            if (_state.State != TrackingState.Paused) return;
            _state.State = TrackingState.Tracking;
            _state.PauseReason = null;
            PersistState();
            _events.Publish(Events.StateChanged, new StateChangedEvent { State = _state.State, ShiftId = _state.ShiftId });
        }
    }

    public void StopTracking()
    {
        lock (_gate)
        {
            if (_state.State == TrackingState.Stopped) return;
            _builder?.Flush(Clock.Now());
            _builder = null;
            _queue.CheckpointOpenSegment(null);
            _state = new PersistedTrackingState();
            PersistState();
            _events.Publish(Events.StateChanged, new StateChangedEvent { State = TrackingState.Stopped, ShiftId = null });
            _log.Info("Tracking stopped");
        }
    }

    public PullSegmentsResponse PullSegments(int max)
    {
        lock (_gate)
        {
            var items = _queue.PullSegments(max);
            return new PullSegmentsResponse { Segments = items.ToList(), Remaining = Math.Max(0, _queue.CountSegments() - items.Count) };
        }
    }

    public int AckSegments(IEnumerable<Guid> ids)
    {
        lock (_gate)
        {
            var n = _queue.AckSegments(ids);
            if (_warnedCapacity && !CapacityCalculator.ShouldWarn(CapacityPercent())) _warnedCapacity = false;
            return n;
        }
    }

    public PullTamperResponse PullTamper(int max) { lock (_gate) return new PullTamperResponse { Events = _queue.PullTamper(max).ToList() }; }

    public int AckTamper(IEnumerable<Guid> ids) { lock (_gate) return _queue.AckTamper(ids); }

    public void OnExtensionDomain(ExtensionDomainMessage msg)
    {
        lock (_gate) _domains.OnExtensionMessage(msg.Browser, msg.Domain, Clock.Monotonic);
    }

    /// <summary>Written by the watchdog when it restarted us (09 section 6 rule 2); turned into a tamper event.</summary>
    public void RecordTamper(string type, Dictionary<string, string> detail)
    {
        lock (_gate) _queue.InsertTamper(new TamperEvent { Id = UuidV7.New(Clock.Now()), Type = type, Detail = detail, OccurredAt = Clock.Now() });
    }

    public StatusResponse Status()
    {
        lock (_gate)
        {
            return new StatusResponse
            {
                State = _state.State,
                ShiftId = _state.ShiftId,
                Anchored = Clock.IsAnchored,
                AgentNow = Clock.Now(),
                QueuedSegments = _queue.CountSegments(),
                QueuedTamper = _queue.CountTamper(),
                QueueBytes = _queue.SizeBytes(),
                QueuePercent = CapacityPercent(),
                ExtensionConnected = _domains.ExtensionConnected(Clock.Monotonic, _config),
                SecondsSinceInput = _lastSinceInput,
                ForegroundProcess = _lastForegroundProcess,
                CurrentKind = _lastKind,
                MemoryBytes = GC.GetTotalMemory(false),
            };
        }
    }

    // ---- tick ------------------------------------------------------------------------------------

    /// <summary>Called every second by the host. Cheap when not tracking.</summary>
    public void Tick()
    {
        lock (_gate)
        {
            var now = Clock.Now();

            // Wall clock change detection runs always (tamper even outside a shift is useful), once per 5 s.
            if ((now - _lastClockCheck).Duration() >= TimeSpan.FromSeconds(5))
            {
                _lastClockCheck = now;
                if (Clock.DetectWallClockChange() is { } jump)
                {
                    _log.Warn($"Wall clock changed by {jump}");
                    RecordTamper(TamperType.ClockChanged, new Dictionary<string, string> { ["jumpSeconds"] = ((long)jump.TotalSeconds).ToString(), ["anchored"] = Clock.IsAnchored.ToString() });
                }
            }

            var sinceInput = _probe.SinceLastInput();
            _lastSinceInput = (int)sinceInput.TotalSeconds;

            if (_state.State != TrackingState.Tracking || _builder is null)
            {
                _probe.DrainInputCounts(); // do not accumulate counts across breaks
                return;
            }

            // Maximum shift length: stop on our own (02 section 3 rule 3).
            if (_state.ShiftStartedAt is { } started && now - started > TimeSpan.FromHours(_config.MaxShiftHours))
            {
                _log.Warn("Maximum shift length reached, stopping tracking");
                StopTracking();
                return;
            }

            var fg = _probe.GetForeground(_config.CaptureWindowTitles);
            var (keys, mouse) = _probe.DrainInputCounts();
            var locked = _probe.IsSessionLocked;
            var domain = _domains.Resolve(fg, _config, Clock.Monotonic);

            if (domain.Missing && !_state.ExtensionMissingReported && !locked)
            {
                _state.ExtensionMissingReported = true; // once per shift (09 section 5)
                PersistState();
                RecordTamper(TamperType.ExtensionMissing, new Dictionary<string, string> { ["process"] = fg.ProcessName });
            }

            _builder.Tick(new TickInput(now, fg, domain.Domain, sinceInput, _probe.IsMicrophoneInUse(), keys, mouse, locked));
            _lastForegroundProcess = fg.ProcessName;
            _lastKind = _builder.Current?.Kind;

            if ((now - _lastCheckpoint).Duration() >= TimeSpan.FromSeconds(30))
            {
                _lastCheckpoint = now;
                _queue.CheckpointOpenSegment(_builder.Current);
                PersistAnchor();
                var pct = CapacityPercent();
                if (CapacityCalculator.ShouldWarn(pct) && !_warnedCapacity)
                {
                    _warnedCapacity = true;
                    _events.Publish(Events.QueueWarning, new QueueWarningEvent { Percent = pct });
                }
            }
        }
    }

    // ---- internals -------------------------------------------------------------------------------

    private SegmentBuilder NewBuilder(Guid shiftId)
    {
        var b = new SegmentBuilder(shiftId, _config, () => Clock.Source);
        b.Emit += seg => _queue.InsertSegment(seg);
        b.LongIdleEnded += (from, to) => _events.Publish(Events.LongIdleEnded, new LongIdleEndedEvent { From = from, To = to });
        return b;
    }

    private void OnSignal(SystemSignal signal)
    {
        lock (_gate)
        {
            var now = Clock.Now();
            switch (signal)
            {
                case SystemSignal.Suspending:
                case SystemSignal.SessionEnding:
                    // Close and flush so power loss or logoff loses nothing (09 section 2).
                    _builder?.CloseForPowerEvent(now);
                    _queue.CheckpointOpenSegment(null);
                    PersistAnchor();
                    break;
                case SystemSignal.Resumed:
                    // Nothing to reopen explicitly: the next tick opens a new segment. The gap stays offline.
                    break;
                case SystemSignal.SessionLocked:
                case SystemSignal.SessionUnlocked:
                    // Handled through IsSessionLocked on the next tick; nothing else to do.
                    break;
            }
        }
    }

    private double CapacityPercent() => CapacityCalculator.Percent(_queue.SizeBytes(), _queue.OldestSegmentStartedAt(), Clock.Now());

    private void PersistState() => _queue.SetState(StateKey, PipeJson.Serialize(_state));

    private void PersistAnchor()
    {
        if (Clock.AnchorSnapshot() is { } snap) _queue.SetState(AnchorKey, $"{snap.AnchorNow:O}|{snap.WallNow:O}");
    }
}
