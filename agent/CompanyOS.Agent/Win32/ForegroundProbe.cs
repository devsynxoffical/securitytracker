using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using CompanyOS.Core.Abstractions;
using static CompanyOS.Agent.Win32.NativeMethods;

namespace CompanyOS.Agent.Win32;

/// <summary>
/// Resolves the foreground window to process name and product name (09 section 2). UWP apps are hosted by
/// ApplicationFrameHost.exe; their real process owns a visible child window of class Windows.UI.Core.CoreWindow.
/// Results are cached per process id so FileVersionInfo is read once per app.
/// </summary>
internal sealed class ForegroundProbe
{
    private readonly Dictionary<uint, (string Process, string App)> _cache = new();
    private readonly object _gate = new();

    public ForegroundInfo Current(bool includeTitle)
    {
        try
        {
            var hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return ForegroundInfo.Unknown;

            GetWindowThreadProcessId(hwnd, out var pid);
            if (pid == 0) return ForegroundInfo.Unknown;

            var (process, app) = Describe(pid);

            if (process.Equals("ApplicationFrameHost.exe", StringComparison.OrdinalIgnoreCase))
            {
                var child = FindCoreWindowChild(hwnd);
                if (child != IntPtr.Zero)
                {
                    GetWindowThreadProcessId(child, out var childPid);
                    if (childPid != 0 && childPid != pid) (process, app) = Describe(childPid);
                }
            }

            string? title = null;
            if (includeTitle)
            {
                var sb = new StringBuilder(512);
                var n = GetWindowTextW(hwnd, sb, sb.Capacity);
                title = n > 0 ? sb.ToString(0, n) : null;
            }
            return new ForegroundInfo(process, app, title, (int)pid);
        }
        catch
        {
            return ForegroundInfo.Unknown;
        }
    }

    private (string Process, string App) Describe(uint pid)
    {
        lock (_gate)
        {
            if (_cache.TryGetValue(pid, out var cached)) return cached;
        }

        var path = ImagePath(pid);
        var process = path is null ? $"pid-{pid}" : Path.GetFileName(path);
        var app = process;
        if (path is not null)
        {
            try
            {
                var info = FileVersionInfo.GetVersionInfo(path);
                var product = info.ProductName?.Trim();
                var desc = info.FileDescription?.Trim();
                app = !string.IsNullOrEmpty(desc) ? desc! : !string.IsNullOrEmpty(product) ? product! : Path.GetFileNameWithoutExtension(path);
            }
            catch { app = Path.GetFileNameWithoutExtension(path); }
        }

        lock (_gate)
        {
            if (_cache.Count > 512) _cache.Clear(); // pids recycle; keep the cache small
            _cache[pid] = (process, app);
        }
        return (process, app);
    }

    private static string? ImagePath(uint pid)
    {
        var h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (h == IntPtr.Zero) return null;
        try
        {
            var sb = new StringBuilder(1024);
            uint size = (uint)sb.Capacity;
            return QueryFullProcessImageNameW(h, 0, sb, ref size) ? sb.ToString(0, (int)size) : null;
        }
        finally { CloseHandle(h); }
    }

    private static IntPtr FindCoreWindowChild(IntPtr frameHost)
    {
        var found = IntPtr.Zero;
        var cls = new StringBuilder(256);
        EnumChildWindows(frameHost, (child, _) =>
        {
            cls.Clear();
            var n = GetClassNameW(child, cls, cls.Capacity);
            if (n > 0 && cls.ToString(0, n) == "Windows.UI.Core.CoreWindow" && IsWindowVisible(child))
            {
                found = child;
                return false; // stop
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}

/// <summary>GetLastInputInfo with 32-bit tick wrap handling (09 section 2).</summary>
internal static class LastInput
{
    public static TimeSpan SinceLastInput()
    {
        var info = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>() };
        if (!GetLastInputInfo(ref info)) return TimeSpan.Zero; // treat failure as "input just now": never over-report idle
        var now = GetTickCount();
        var elapsed = unchecked(now - info.dwTime); // uint arithmetic handles the 49.7 day wrap
        return TimeSpan.FromMilliseconds(elapsed);
    }
}
