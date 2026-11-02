using CompanyOS.Core.Abstractions;
using CompanyOS.Core.Tracking;
using CompanyOS.Shared.Models;
using Xunit;

namespace CompanyOS.Agent.Tests;

public class SegmentBuilderTests
{
    private static readonly DateTime T0 = new(2026, 11, 2, 9, 0, 0, DateTimeKind.Utc);
    private static readonly ForegroundInfo Word = new("WINWORD.EXE", "Microsoft Word", null, 1);
    private static readonly ForegroundInfo Chrome = new("chrome.exe", "Google Chrome", null, 2);
    private static readonly ForegroundInfo Teams = new("Teams.exe", "Microsoft Teams", null, 3);

    private static (SegmentBuilder Builder, List<ActivitySegment> Emitted, List<(DateTime, DateTime)> Prompts) Make(TrackingConfig? cfg = null)
    {
        cfg ??= new TrackingConfig();
        var emitted = new List<ActivitySegment>();
        var prompts = new List<(DateTime, DateTime)>();
        var b = new SegmentBuilder(Guid.NewGuid(), cfg, () => ClockSource.Anchored);
        b.Emit += s => emitted.Add(s.Clone());
        b.LongIdleEnded += (f, t) => prompts.Add((f, t));
        return (b, emitted, prompts);
    }

    private static TickInput Tick(DateTime now, ForegroundInfo fg, TimeSpan sinceInput, string? domain = null, bool mic = false, int keys = 0, int mouse = 0, bool locked = false)
        => new(now, fg, domain, sinceInput, mic, keys, mouse, locked);

    /// <summary>Runs one tick per second from <paramref name="from"/> for <paramref name="seconds"/> with input every second.</summary>
    private static DateTime Work(SegmentBuilder b, DateTime from, int seconds, ForegroundInfo fg, string? domain = null)
    {
        var t = from;
        for (var i = 0; i < seconds; i++)
        {
            b.Tick(Tick(t, fg, TimeSpan.Zero, domain, keys: 1));
            t = t.AddSeconds(1);
        }
        return t;
    }

    [Fact]
    public void Foreground_change_closes_segment_and_opens_new_one()
    {
        var (b, emitted, _) = Make();
        var t = Work(b, T0, 10, Word);
        t = Work(b, t, 10, Chrome, "youtube.com");
        b.Flush(t);

        Assert.Equal(2, emitted.Count);
        Assert.Equal("WINWORD.EXE", emitted[0].ProcessName);
        Assert.Equal(T0, emitted[0].StartedAt);
        Assert.Equal(T0.AddSeconds(10), emitted[0].EndedAt);
        Assert.Equal(10, emitted[0].KeyCount);
        Assert.Equal("chrome.exe", emitted[1].ProcessName);
        Assert.Equal("youtube.com", emitted[1].Domain);
        Assert.Equal(SegmentKind.Active, emitted[1].Kind);
    }

    [Fact]
    public void Idle_split_is_backdated_to_last_input()
    {
        var (b, emitted, _) = Make(new TrackingConfig { IdleThresholdSeconds = 300 });
        var t = Work(b, T0, 60, Word); // 60 s typing
        // Then no input: sinceInput grows. At 300 s the split happens at lastInput = T0+60.
        for (var i = 1; i <= 300; i++) b.Tick(Tick(t.AddSeconds(i - 1), Word, TimeSpan.FromSeconds(i)));
        b.Flush(t.AddSeconds(300));

        // Last input was the tick at T0+59. The idle segment reaches the 5 minute cap at T0+359 and a 1 s
        // remainder closes at the flush (T0+360).
        Assert.Equal(3, emitted.Count);
        Assert.Equal(SegmentKind.Active, emitted[0].Kind);
        Assert.Equal(T0.AddSeconds(59), emitted[0].EndedAt); // closed at last input, not at detection time
        Assert.Equal(SegmentKind.Idle, emitted[1].Kind);
        Assert.Equal(T0.AddSeconds(59), emitted[1].StartedAt);
        Assert.Equal(T0.AddSeconds(359), emitted[1].EndedAt);
        Assert.Equal(SegmentKind.Idle, emitted[2].Kind);
        Assert.Equal(T0.AddSeconds(360), emitted[2].EndedAt);
    }

    [Fact]
    public void Idle_in_call_app_stays_active_with_exception()
    {
        var cfg = new TrackingConfig { IdleThresholdSeconds = 300, CallApps = new[] { "teams.exe" } };
        var (b, emitted, _) = Make(cfg);
        var t = T0;
        for (var i = 0; i < 600; i++) { b.Tick(Tick(t, Teams, TimeSpan.FromSeconds(i))); t = t.AddSeconds(1); }
        b.Flush(t);

        // 600 s => two 5-minute capped segments, all active with call_app.
        Assert.All(emitted, s => Assert.Equal(SegmentKind.Active, s.Kind));
        Assert.Contains(emitted, s => s.Exception == ActivityException.CallApp);
        Assert.DoesNotContain(emitted, s => s.Kind == SegmentKind.Idle);
    }

    [Fact]
    public void Microphone_in_use_counts_as_exception()
    {
        var (b, emitted, _) = Make(new TrackingConfig { IdleThresholdSeconds = 60 });
        var t = T0;
        for (var i = 0; i < 120; i++) { b.Tick(Tick(t, Word, TimeSpan.FromSeconds(i), mic: true)); t = t.AddSeconds(1); }
        b.Flush(t);
        Assert.Single(emitted);
        Assert.Equal(ActivityException.Mic, emitted[0].Exception);
        Assert.Equal(SegmentKind.Active, emitted[0].Kind);
    }

    [Fact]
    public void Input_after_long_idle_raises_prompt_and_reopens_active()
    {
        var cfg = new TrackingConfig { IdleThresholdSeconds = 300, LongIdleThresholdSeconds = 1800, SegmentMaxSeconds = 300 };
        var (b, emitted, prompts) = Make(cfg);
        var t = Work(b, T0, 10, Word);
        // 40 minutes without input
        for (var i = 1; i <= 2400; i++) b.Tick(Tick(t.AddSeconds(i - 1), Word, TimeSpan.FromSeconds(i)));
        t = t.AddSeconds(2400);
        // input returns
        b.Tick(Tick(t, Word, TimeSpan.Zero, keys: 1));
        b.Flush(t.AddSeconds(1));

        Assert.Single(prompts);
        Assert.Equal(T0.AddSeconds(9), prompts[0].Item1); // idle began at the last input (tick at T0+9)
        Assert.Equal(t, prompts[0].Item2);
        Assert.Contains(emitted, s => s.Kind == SegmentKind.Idle);
        Assert.Equal(SegmentKind.Active, emitted.Last().Kind);
    }

    [Fact]
    public void Segment_is_capped_at_five_minutes()
    {
        var (b, emitted, _) = Make();
        var t = Work(b, T0, 650, Word);
        b.Flush(t);
        Assert.Equal(3, emitted.Count);
        Assert.Equal(300, emitted[0].DurationSeconds);
        Assert.Equal(300, emitted[1].DurationSeconds);
        Assert.Equal(50, emitted[2].DurationSeconds);
        Assert.Equal(emitted[0].EndedAt, emitted[1].StartedAt);
    }

    [Fact]
    public void Alt_tab_flicker_is_merged_into_previous_segment()
    {
        var (b, emitted, _) = Make();
        var t = Work(b, T0, 30, Word);
        // 1 second in Chrome, then back to Word.
        b.Tick(Tick(t, Chrome, TimeSpan.Zero, "mail.google.com", keys: 1)); t = t.AddSeconds(1);
        t = Work(b, t, 30, Word);
        b.Flush(t);

        Assert.Single(emitted);
        Assert.Equal("WINWORD.EXE", emitted[0].ProcessName);
        Assert.Equal(61, emitted[0].DurationSeconds);
        Assert.Equal(61, emitted[0].KeyCount); // the flicker's count folded in
    }

    [Fact]
    public void Switch_longer_than_flicker_window_is_kept()
    {
        var (b, emitted, _) = Make();
        var t = Work(b, T0, 30, Word);
        t = Work(b, t, 3, Chrome, "mail.google.com");
        t = Work(b, t, 30, Word);
        b.Flush(t);
        Assert.Equal(3, emitted.Count);
        Assert.Equal("chrome.exe", emitted[1].ProcessName);
    }

    [Fact]
    public void Domain_change_within_browser_closes_segment()
    {
        var (b, emitted, _) = Make();
        var t = Work(b, T0, 20, Chrome, "docs.google.com");
        t = Work(b, t, 20, Chrome, "youtube.com");
        b.Flush(t);
        Assert.Equal(2, emitted.Count);
        Assert.Equal("docs.google.com", emitted[0].Domain);
        Assert.Equal("youtube.com", emitted[1].Domain);
    }

    [Fact]
    public void Lock_produces_locked_segment_and_prompt_on_long_unlock()
    {
        var cfg = new TrackingConfig { LongIdleThresholdSeconds = 600, SegmentMaxSeconds = 3600 };
        var (b, emitted, prompts) = Make(cfg);
        var t = Work(b, T0, 10, Word);
        for (var i = 0; i < 1200; i++) { b.Tick(Tick(t, Word, TimeSpan.FromSeconds(i), locked: true)); t = t.AddSeconds(1); }
        b.Tick(Tick(t, Word, TimeSpan.Zero, keys: 1)); // unlocked, input
        b.Flush(t.AddSeconds(1));

        Assert.Contains(emitted, s => s.Kind == SegmentKind.Locked && s.DurationSeconds == 1200);
        Assert.Single(prompts);
        Assert.Equal(SegmentKind.Active, emitted.Last().Kind);
    }

    [Fact]
    public void Window_title_only_when_enabled()
    {
        var fg = new ForegroundInfo("WINWORD.EXE", "Microsoft Word", "Secret.docx - Word", 1);
        var (b1, e1, _) = Make(new TrackingConfig { CaptureWindowTitles = false });
        b1.Tick(Tick(T0, fg, TimeSpan.Zero)); b1.Flush(T0.AddSeconds(5));
        Assert.Null(e1[0].WindowTitle);

        var (b2, e2, _) = Make(new TrackingConfig { CaptureWindowTitles = true });
        b2.Tick(Tick(T0, fg, TimeSpan.Zero)); b2.Flush(T0.AddSeconds(5));
        Assert.Equal("Secret.docx - Word", e2[0].WindowTitle);
    }

    [Fact]
    public void Flush_emits_everything_and_leaves_nothing_open()
    {
        var (b, emitted, _) = Make();
        var t = Work(b, T0, 5, Word);
        b.Flush(t);
        Assert.Single(emitted);
        Assert.Null(b.Current);
        // ticking again opens a fresh segment
        b.Tick(Tick(t.AddSeconds(60), Word, TimeSpan.Zero));
        Assert.NotNull(b.Current);
        Assert.Equal(t.AddSeconds(60), b.Current!.StartedAt);
    }

    [Fact]
    public void Ids_are_unique_and_time_ordered()
    {
        var (b, emitted, _) = Make();
        var t = Work(b, T0, 10, Word);
        t = Work(b, t, 10, Chrome, "a.com");
        t = Work(b, t, 10, Word);
        b.Flush(t);
        Assert.Equal(3, emitted.Select(s => s.Id).Distinct().Count());
        var ts = emitted.Select(s => CompanyOS.Shared.UuidV7.TimestampMs(s.Id)).ToList();
        Assert.True(ts.SequenceEqual(ts.OrderBy(x => x)));
    }
}
