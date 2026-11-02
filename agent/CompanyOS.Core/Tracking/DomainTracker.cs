using CompanyOS.Core.Abstractions;
using CompanyOS.Shared.Models;

namespace CompanyOS.Core.Tracking;

/// <summary>
/// Applies the domain reported by the browser extension (09 section 5): only while the foreground process
/// is that browser; "unknown" plus one extension_missing tamper per shift when no message arrived for
/// ExtensionTimeoutSeconds; "excluded" for domains in the exclusion list; null for non-browsers.
/// Pure logic: time is injected as monotonic TimeSpan.
/// </summary>
public sealed class DomainTracker
{
    private readonly object _gate = new();
    private readonly Dictionary<string, (string Domain, TimeSpan At)> _lastByBrowser = new(StringComparer.OrdinalIgnoreCase);
    private TimeSpan? _lastAnyMessageAt;

    public bool ExtensionConnected(TimeSpan now, TrackingConfig config)
    {
        lock (_gate) return _lastAnyMessageAt is { } t && now - t <= TimeSpan.FromSeconds(config.ExtensionTimeoutSeconds);
    }

    public void OnExtensionMessage(string browser, string domain, TimeSpan nowMonotonic)
    {
        lock (_gate)
        {
            _lastByBrowser[browser] = (NormaliseDomain(domain), nowMonotonic);
            _lastAnyMessageAt = nowMonotonic;
        }
    }

    /// <summary>Resolution result. <c>Missing</c> is true when a supported browser is in front with no fresh message.</summary>
    public readonly record struct Resolution(string? Domain, bool Missing);

    public Resolution Resolve(ForegroundInfo foreground, TrackingConfig config, TimeSpan nowMonotonic)
    {
        // Case insensitive on purpose: the dictionary may come from JSON (setConfig) without a comparer.
        var browserId = config.Browsers.FirstOrDefault(kv => kv.Key.Equals(foreground.ProcessName, StringComparison.OrdinalIgnoreCase)).Value;
        if (string.IsNullOrEmpty(browserId)) return new Resolution(null, false);

        (string Domain, TimeSpan At)? last;
        lock (_gate) last = _lastByBrowser.TryGetValue(browserId, out var v) ? v : null;

        if (last is null || nowMonotonic - last.Value.At > TimeSpan.FromSeconds(config.ExtensionTimeoutSeconds))
        {
            return new Resolution(DomainValues.Unknown, true);
        }

        var domain = last.Value.Domain;
        if (domain == DomainValues.BrowserInternal || domain == DomainValues.Unknown) return new Resolution(domain, false);
        return new Resolution(IsExcluded(domain, config.Exclusions) ? DomainValues.Excluded : domain, false);
    }

    /// <summary>Exact match or "*.suffix" (also matches the bare suffix). Case insensitive.</summary>
    public static bool IsExcluded(string domain, IEnumerable<string> exclusions)
    {
        foreach (var raw in exclusions)
        {
            var pattern = raw.Trim().ToLowerInvariant();
            if (pattern.Length == 0) continue;
            if (pattern.StartsWith("*.", StringComparison.Ordinal))
            {
                var suffix = pattern[2..];
                if (domain == suffix || domain.EndsWith("." + suffix, StringComparison.Ordinal)) return true;
            }
            else if (domain == pattern) return true;
        }
        return false;
    }

    private static string NormaliseDomain(string domain)
    {
        var d = domain.Trim().ToLowerInvariant().TrimEnd('.');
        return d.Length == 0 ? DomainValues.Unknown : d;
    }
}
