using CompanyOS.Agent.Win32;
using CompanyOS.Core.Abstractions;

namespace CompanyOS.Agent;

/// <summary>
/// ISystemProbe over Win32: foreground (WinEvent hook + poll via the engine's 1 s tick), GetLastInputInfo,
/// raw input counts from the message window, Core Audio microphone state (sampled at most every 2 s because
/// the COM enumeration is comparatively expensive, 09 section 8 CPU budget), session lock state and signals.
/// </summary>
internal sealed class WindowsSystemProbe : ISystemProbe, IDisposable
{
    private readonly MessageWindow _window = new();
    private readonly ForegroundProbe _foreground = new();
    private readonly object _micGate = new();
    private DateTime _micSampledAt = DateTime.MinValue;
    private bool _micInUse;

    public event Action<SystemSignal>? Signal;

    public WindowsSystemProbe()
    {
        _window.Signal += s => Signal?.Invoke(s);
        _window.Start();
    }

    public ForegroundInfo GetForeground(bool includeTitle) => _foreground.Current(includeTitle);

    public TimeSpan SinceLastInput() => LastInput.SinceLastInput();

    public bool IsMicrophoneInUse()
    {
        lock (_micGate)
        {
            var now = DateTime.UtcNow;
            if (now - _micSampledAt >= TimeSpan.FromSeconds(2))
            {
                _micSampledAt = now;
                _micInUse = CoreAudioInterop.IsAnyCaptureSessionActive();
            }
            return _micInUse;
        }
    }

    public (int Keys, int Mouse) DrainInputCounts() => _window.DrainInputCounts();

    public bool IsSessionLocked => _window.IsSessionLocked;

    public void Dispose() => _window.Dispose();
}
