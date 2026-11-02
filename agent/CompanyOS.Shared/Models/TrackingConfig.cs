namespace CompanyOS.Shared.Models;

/// <summary>
/// Configuration pushed by the Desktop App with <c>setConfig</c> (09 section 4). All values have the
/// defaults from 09 and 16 so the agent works before the first setConfig arrives.
/// </summary>
public sealed class TrackingConfig
{
    /// <summary>Seconds without input before an active segment is split into idle (default 300).</summary>
    public int IdleThresholdSeconds { get; set; } = 300;

    /// <summary>Idle duration that triggers the long idle prompt on the next input (default 1800).</summary>
    public int LongIdleThresholdSeconds { get; set; } = 1800;

    /// <summary>Process names (lower case, with .exe) that keep a segment active without input: call apps.</summary>
    public string[] CallApps { get; set; } = Array.Empty<string>();

    /// <summary>Process names that keep a segment active without input: meeting apps.</summary>
    public string[] MeetingApps { get; set; } = Array.Empty<string>();

    /// <summary>Domain patterns stored as "excluded" (03 F6). Exact or "*.suffix" patterns.</summary>
    public string[] Exclusions { get; set; } = Array.Empty<string>();

    /// <summary>Off by default (03 F6). When on, GetWindowText is read into the segment.</summary>
    public bool CaptureWindowTitles { get; set; }

    /// <summary>A segment never exceeds this length (09 section 3: 5 minutes).</summary>
    public int SegmentMaxSeconds { get; set; } = 300;

    /// <summary>Foreground switches shorter than this merge into the previous segment (alt-tab flicker).</summary>
    public int FlickerMergeSeconds { get; set; } = 2;

    /// <summary>Seconds without an extension message while a browser is in the foreground before domain = unknown.</summary>
    public int ExtensionTimeoutSeconds { get; set; } = 60;

    /// <summary>Maximum shift length in hours; the agent stops on its own at this point (02 section 3 rule 3).</summary>
    public int MaxShiftHours { get; set; } = 16;

    /// <summary>Browser process name -> browser id reported by the extension ("chrome", "edge").</summary>
    public Dictionary<string, string> Browsers { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["chrome.exe"] = "chrome",
        ["msedge.exe"] = "edge",
    };
}
