using CompanyOS.Core.Clock;
using CompanyOS.Core.Storage;
using CompanyOS.Core.Tracking;
using CompanyOS.Shared;
using CompanyOS.Shared.Models;
using CompanyOS.Core.Abstractions;
using Xunit;

namespace CompanyOS.Agent.Tests;

public class AnchoredClockTests
{
    [Fact]
    public void Unanchored_uses_wall_clock_then_anchor_wins()
    {
        var time = new FakeTime();
        var clock = new AnchoredClock(time);
        Assert.False(clock.IsAnchored);
        Assert.Equal(time.WallUtc, clock.Now());
        Assert.Equal(ClockSource.Unanchored, clock.Source);

        var server = new DateTime(2026, 11, 2, 12, 0, 0, DateTimeKind.Utc); // PC clock is 3 h behind the server
        clock.SetAnchor(server);
        Assert.True(clock.IsAnchored);
        Assert.Equal(server, clock.Now());

        time.Advance(TimeSpan.FromSeconds(90));
        Assert.Equal(server.AddSeconds(90), clock.Now());
    }

    [Fact]
    public void Wall_clock_change_does_not_move_anchored_time_but_is_detected()
    {
        var time = new FakeTime();
        var clock = new AnchoredClock(time);
        clock.SetAnchor(time.WallUtc);
        clock.DetectWallClockChange();

        time.Monotonic += TimeSpan.FromSeconds(10);
        time.WallUtc += TimeSpan.FromSeconds(10) + TimeSpan.FromHours(3); // user moved the clock by 3 h

        var before = clock.Now();
        var jump = clock.DetectWallClockChange();
        Assert.NotNull(jump);
        Assert.Equal(TimeSpan.FromHours(3), jump!.Value);
        Assert.Equal(before, clock.Now()); // durations unaffected

        Assert.Null(clock.DetectWallClockChange()); // reported once
    }

    [Fact]
    public void Small_drift_is_not_reported()
    {
        var time = new FakeTime();
        var clock = new AnchoredClock(time);
        clock.DetectWallClockChange();
        time.Monotonic += TimeSpan.FromSeconds(60);
        time.WallUtc += TimeSpan.FromSeconds(62);
        Assert.Null(clock.DetectWallClockChange());
    }

    [Fact]
    public void Restore_anchor_after_restart_adds_wall_elapsed()
    {
        var time = new FakeTime();
        var clock = new AnchoredClock(time);
        var persistedAnchor = new DateTime(2026, 11, 2, 12, 0, 0, DateTimeKind.Utc);
        var wallAtPersist = time.WallUtc - TimeSpan.FromMinutes(5);
        clock.RestoreAnchor(persistedAnchor, wallAtPersist);
        Assert.True(clock.IsAnchored);
        Assert.Equal(persistedAnchor.AddMinutes(5), clock.Now());
    }

    [Fact]
    public void Restore_anchor_refuses_backwards_wall_clock()
    {
        var time = new FakeTime();
        var clock = new AnchoredClock(time);
        clock.RestoreAnchor(time.WallUtc, time.WallUtc + TimeSpan.FromHours(1));
        Assert.False(clock.IsAnchored);
    }
}

public class CapacityTests
{
    [Fact]
    public void Percent_is_max_of_size_and_age()
    {
        var now = new DateTime(2026, 11, 2, 0, 0, 0, DateTimeKind.Utc);
        Assert.Equal(0, CapacityCalculator.Percent(0, null, now));
        Assert.Equal(50.0, CapacityCalculator.Percent(CapacityCalculator.MaxBytes / 2, null, now));
        Assert.Equal(50.0, CapacityCalculator.Percent(0, now.AddDays(-15), now));
        Assert.Equal(90.0, CapacityCalculator.Percent(CapacityCalculator.MaxBytes / 10, now.AddDays(-27), now));
        Assert.True(CapacityCalculator.ShouldWarn(90.0));
        Assert.False(CapacityCalculator.ShouldWarn(89.9));
    }
}

public class SqliteQueueStoreTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), "companyos-test-" + Guid.NewGuid().ToString("N") + ".db");

    [Fact]
    public void Segments_roundtrip_in_order_and_delete_only_on_ack()
    {
        var key = new byte[32]; for (var i = 0; i < 32; i++) key[i] = (byte)i;
        using var store = new SqliteQueueStore(_path, new AesGcmCipher(key));
        var t = new DateTime(2026, 11, 2, 9, 0, 0, DateTimeKind.Utc);
        var a = Seg(t.AddSeconds(10)); var b = Seg(t); var c = Seg(t.AddSeconds(20));
        store.InsertSegment(a); store.InsertSegment(b); store.InsertSegment(c);
        store.InsertSegment(a); // duplicate ignored

        Assert.Equal(3, store.CountSegments());
        var pulled = store.PullSegments(2);
        Assert.Equal(new[] { b.Id, a.Id }, pulled.Select(s => s.Id));
        Assert.Equal("chrome.exe", pulled[0].ProcessName);
        Assert.Equal(3, store.CountSegments()); // pull does not delete
        Assert.Equal(2, store.AckSegments(new[] { a.Id, b.Id }));
        Assert.Equal(1, store.CountSegments());
        Assert.Equal(c.StartedAt, store.OldestSegmentStartedAt());
    }

    [Fact]
    public void Checkpoint_and_state_roundtrip()
    {
        using var store = new SqliteQueueStore(_path, new PlainCipher());
        Assert.Null(store.ReadOpenSegmentCheckpoint());
        var s = Seg(DateTime.UtcNow);
        store.CheckpointOpenSegment(s);
        Assert.Equal(s.Id, store.ReadOpenSegmentCheckpoint()!.Id);
        store.CheckpointOpenSegment(null);
        Assert.Null(store.ReadOpenSegmentCheckpoint());

        store.SetState("k", "v");
        Assert.Equal("v", store.GetState("k"));
        store.SetState("k", null);
        Assert.Null(store.GetState("k"));
    }

    [Fact]
    public void Tamper_roundtrip()
    {
        using var store = new SqliteQueueStore(_path, new PlainCipher());
        var evt = new TamperEvent { Id = UuidV7.New(DateTime.UtcNow), Type = TamperType.ClockChanged, Detail = new() { ["jumpSeconds"] = "10800" }, OccurredAt = DateTime.UtcNow };
        store.InsertTamper(evt);
        var pulled = store.PullTamper(10);
        Assert.Single(pulled);
        Assert.Equal("10800", pulled[0].Detail["jumpSeconds"]);
        Assert.Equal(1, store.AckTamper(new[] { evt.Id }));
        Assert.Equal(0, store.CountTamper());
    }

    private static ActivitySegment Seg(DateTime start) => new()
    {
        Id = UuidV7.New(start), ShiftId = Guid.NewGuid(), StartedAt = start, EndedAt = start.AddSeconds(5), Kind = SegmentKind.Active,
        ProcessName = "chrome.exe", AppName = "Google Chrome", Domain = "example.com", KeyCount = 3, MouseCount = 4, ClockSource = ClockSource.Anchored,
    };

    public void Dispose()
    {
        foreach (var suffix in new[] { "", "-wal", "-shm" }) { try { File.Delete(_path + suffix); } catch { } }
    }
}

public class AesGcmCipherTests
{
    [Fact]
    public void Roundtrip_and_tamper_detection()
    {
        var key = System.Security.Cryptography.RandomNumberGenerator.GetBytes(32);
        var cipher = new AesGcmCipher(key);
        var plain = System.Text.Encoding.UTF8.GetBytes("{\"a\":1}");
        var enc = cipher.Encrypt(plain);
        Assert.NotEqual(plain, enc);
        Assert.Equal(plain, cipher.Decrypt(enc));
        enc[^1] ^= 0xFF;
        Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(() => cipher.Decrypt(enc));
    }
}

public class UuidV7Tests
{
    [Fact]
    public void Version_timestamp_and_monotonic_within_millisecond()
    {
        var now = new DateTime(2026, 11, 2, 9, 0, 0, DateTimeKind.Utc);
        var ids = Enumerable.Range(0, 100).Select(_ => UuidV7.New(now)).ToList();
        Assert.All(ids, id => Assert.Equal(7, UuidV7.Version(id)));
        // The generator is monotonic for the whole process (a clock that steps back never reorders ids), so
        // when other tests already used later times the ids carry that later time. Assert the guarantees:
        // never earlier than the requested time, and non-decreasing.
        var nowMs = new DateTimeOffset(now).ToUnixTimeMilliseconds();
        var stamps = ids.Select(UuidV7.TimestampMs).ToList();
        Assert.All(stamps, ms => Assert.True(ms >= nowMs));
        Assert.True(stamps.Zip(stamps.Skip(1), (x, y) => y >= x).All(ok => ok), "timestamps must not decrease");
        Assert.Equal(100, ids.Distinct().Count());
        var strings = ids.Select(i => i.ToString("N")).ToList();
        Assert.True(strings.SequenceEqual(strings.OrderBy(s => s, StringComparer.Ordinal)), "ids created in one millisecond must sort in creation order");
    }
}

public class DomainTrackerTests
{
    private static readonly TrackingConfig Cfg = new() { Exclusions = new[] { "bank.example", "*.health.example" } };
    private static readonly ForegroundInfo Chrome = new("chrome.exe", "Google Chrome", null, 1);
    private static readonly ForegroundInfo Word = new("WINWORD.EXE", "Word", null, 2);

    [Fact]
    public void Domain_applies_only_to_matching_browser()
    {
        var d = new DomainTracker();
        d.OnExtensionMessage("chrome", "YouTube.com.", TimeSpan.FromSeconds(10));
        Assert.Equal(new DomainTracker.Resolution("youtube.com", false), d.Resolve(Chrome, Cfg, TimeSpan.FromSeconds(12)));
        Assert.Equal(new DomainTracker.Resolution(null, false), d.Resolve(Word, Cfg, TimeSpan.FromSeconds(12)));
        Assert.Equal(new DomainTracker.Resolution(DomainValues.Unknown, true), d.Resolve(new ForegroundInfo("msedge.exe", "Edge", null, 3), Cfg, TimeSpan.FromSeconds(12)));
    }

    [Fact]
    public void Stale_message_means_unknown_and_missing()
    {
        var d = new DomainTracker();
        d.OnExtensionMessage("chrome", "a.com", TimeSpan.FromSeconds(0));
        Assert.False(d.Resolve(Chrome, Cfg, TimeSpan.FromSeconds(59)).Missing);
        var r = d.Resolve(Chrome, Cfg, TimeSpan.FromSeconds(61));
        Assert.True(r.Missing);
        Assert.Equal(DomainValues.Unknown, r.Domain);
    }

    [Fact]
    public void Exclusions_exact_and_wildcard()
    {
        var d = new DomainTracker();
        d.OnExtensionMessage("chrome", "bank.example", TimeSpan.Zero);
        Assert.Equal(DomainValues.Excluded, d.Resolve(Chrome, Cfg, TimeSpan.Zero).Domain);
        d.OnExtensionMessage("chrome", "portal.health.example", TimeSpan.Zero);
        Assert.Equal(DomainValues.Excluded, d.Resolve(Chrome, Cfg, TimeSpan.Zero).Domain);
        d.OnExtensionMessage("chrome", "health.example", TimeSpan.Zero);
        Assert.Equal(DomainValues.Excluded, d.Resolve(Chrome, Cfg, TimeSpan.Zero).Domain);
        d.OnExtensionMessage("chrome", "nothealth.example", TimeSpan.Zero);
        Assert.Equal("nothealth.example", d.Resolve(Chrome, Cfg, TimeSpan.Zero).Domain);
    }

    [Fact]
    public void Browser_internal_passes_through_unexcluded()
    {
        var d = new DomainTracker();
        d.OnExtensionMessage("chrome", DomainValues.BrowserInternal, TimeSpan.Zero);
        Assert.Equal(DomainValues.BrowserInternal, d.Resolve(Chrome, Cfg, TimeSpan.Zero).Domain);
    }
}
