namespace CompanyOS.Core.Storage;

/// <summary>Queue capacity rule (09 section 4): 30 days or 500 MB, warning at 90 percent.</summary>
public static class CapacityCalculator
{
    public const long MaxBytes = 500L * 1024 * 1024;
    public static readonly TimeSpan MaxAge = TimeSpan.FromDays(30);
    public const double WarningPercent = 90.0;

    /// <summary>Percent of capacity used: the larger of size share and age share, 0..100+.</summary>
    public static double Percent(long bytes, DateTime? oldestStartedAtUtc, DateTime nowUtc)
    {
        var bySize = bytes <= 0 ? 0 : (double)bytes / MaxBytes * 100.0;
        var byAge = 0.0;
        if (oldestStartedAtUtc is { } oldest && nowUtc > oldest)
        {
            byAge = (nowUtc - oldest).TotalSeconds / MaxAge.TotalSeconds * 100.0;
        }
        return Math.Round(Math.Max(bySize, byAge), 1);
    }

    public static bool ShouldWarn(double percent) => percent >= WarningPercent;
}
