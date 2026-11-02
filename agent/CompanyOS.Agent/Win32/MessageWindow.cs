using System.Runtime.InteropServices;
using CompanyOS.Core.Abstractions;
using static CompanyOS.Agent.Win32.NativeMethods;

namespace CompanyOS.Agent.Win32;

/// <summary>
/// Hidden message-only window on its own thread. It is the single place that receives:
/// WM_INPUT (raw input counts, header only), WM_WTSSESSION_CHANGE (lock, unlock), WM_POWERBROADCAST
/// (suspend, resume) and WM_QUERYENDSESSION/WM_ENDSESSION (logoff, shutdown). The WinEvent foreground
/// hook also needs a message loop, so it is installed from this thread.
/// </summary>
internal sealed class MessageWindow : IDisposable
{
    private const string ClassName = "CompanyOS.Agent.MessageWindow";

    private readonly Thread _thread;
    private readonly ManualResetEventSlim _ready = new(false);
    private readonly WndProc _wndProc; // kept alive: the callback must not be collected
    private WinEventDelegate? _winEventProc; // kept alive as well
    private IntPtr _hwnd;
    private IntPtr _hook;
    private volatile bool _locked;
    private int _keys;
    private int _mouse;

    public event Action<SystemSignal>? Signal;
    public event Action? ForegroundChanged;

    public bool IsSessionLocked => _locked;

    public MessageWindow()
    {
        _wndProc = WndProcImpl;
        _thread = new Thread(Run) { IsBackground = true, Name = "CompanyOS.MessageLoop" };
        _thread.SetApartmentState(ApartmentState.STA);
    }

    public void Start()
    {
        _thread.Start();
        if (!_ready.Wait(TimeSpan.FromSeconds(10))) throw new InvalidOperationException("Message window did not start");
    }

    /// <summary>Takes the counters accumulated since the last call. Interlocked so the tick thread can read safely.</summary>
    public (int Keys, int Mouse) DrainInputCounts() => (Interlocked.Exchange(ref _keys, 0), Interlocked.Exchange(ref _mouse, 0));

    private void Run()
    {
        var hInstance = GetModuleHandleW(null);
        var wc = new WNDCLASSEXW
        {
            cbSize = (uint)Marshal.SizeOf<WNDCLASSEXW>(),
            lpfnWndProc = _wndProc,
            hInstance = hInstance,
            lpszClassName = ClassName,
        };
        if (RegisterClassExW(ref wc) == 0 && Marshal.GetLastWin32Error() != 1410 /* ERROR_CLASS_ALREADY_EXISTS */)
        {
            throw new InvalidOperationException("RegisterClassExW failed: " + Marshal.GetLastWin32Error());
        }

        _hwnd = CreateWindowExW(0, ClassName, "CompanyOS Agent", 0, 0, 0, 0, 0, new IntPtr(HWND_MESSAGE), IntPtr.Zero, hInstance, IntPtr.Zero);
        if (_hwnd == IntPtr.Zero) throw new InvalidOperationException("CreateWindowExW failed: " + Marshal.GetLastWin32Error());

        // Raw input: keyboard and mouse, INPUTSINK so we receive input even when not in the foreground.
        // Counts only. We never request RID_INPUT, so key codes are never copied into this process.
        var devices = new[]
        {
            new RAWINPUTDEVICE { usUsagePage = HID_USAGE_PAGE_GENERIC, usUsage = HID_USAGE_GENERIC_KEYBOARD, dwFlags = RIDEV_INPUTSINK, hwndTarget = _hwnd },
            new RAWINPUTDEVICE { usUsagePage = HID_USAGE_PAGE_GENERIC, usUsage = HID_USAGE_GENERIC_MOUSE, dwFlags = RIDEV_INPUTSINK, hwndTarget = _hwnd },
        };
        if (!RegisterRawInputDevices(devices, (uint)devices.Length, (uint)Marshal.SizeOf<RAWINPUTDEVICE>()))
        {
            FileLog.Default.Warn("RegisterRawInputDevices failed: " + Marshal.GetLastWin32Error());
        }

        if (!WTSRegisterSessionNotification(_hwnd, NOTIFY_FOR_THIS_SESSION))
        {
            FileLog.Default.Warn("WTSRegisterSessionNotification failed: " + Marshal.GetLastWin32Error());
        }

        _winEventProc = (_, _, _, _, _, _, _) => ForegroundChanged?.Invoke();
        _hook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, IntPtr.Zero, _winEventProc, 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
        if (_hook == IntPtr.Zero) FileLog.Default.Warn("SetWinEventHook failed; relying on the 1 s poll");

        _ready.Set();

        while (GetMessageW(out var msg, IntPtr.Zero, 0, 0) > 0)
        {
            TranslateMessage(ref msg);
            DispatchMessageW(ref msg);
        }

        if (_hook != IntPtr.Zero) UnhookWinEvent(_hook);
        WTSUnRegisterSessionNotification(_hwnd);
        DestroyWindow(_hwnd);
    }

    private IntPtr WndProcImpl(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        switch ((int)msg)
        {
            case WM_INPUT:
            {
                // Header only: dwType tells us keyboard or mouse. Nothing else is read.
                uint size = (uint)Marshal.SizeOf<RAWINPUTHEADER>();
                if (GetRawInputData(lParam, RID_HEADER, out var header, ref size, (uint)Marshal.SizeOf<RAWINPUTHEADER>()) != uint.MaxValue)
                {
                    if (header.dwType == RIM_TYPEKEYBOARD) Interlocked.Increment(ref _keys);
                    else if (header.dwType == RIM_TYPEMOUSE) Interlocked.Increment(ref _mouse);
                }
                return DefWindowProcW(hWnd, msg, wParam, lParam); // required for WM_INPUT cleanup
            }
            case WM_WTSSESSION_CHANGE:
            {
                var reason = (int)wParam;
                if (reason == WTS_SESSION_LOCK) { _locked = true; Signal?.Invoke(SystemSignal.SessionLocked); }
                else if (reason == WTS_SESSION_UNLOCK) { _locked = false; Signal?.Invoke(SystemSignal.SessionUnlocked); }
                return IntPtr.Zero;
            }
            case WM_POWERBROADCAST:
            {
                var evt = (int)wParam;
                if (evt == PBT_APMSUSPEND) Signal?.Invoke(SystemSignal.Suspending);
                else if (evt is PBT_APMRESUMEAUTOMATIC or PBT_APMRESUMESUSPEND) Signal?.Invoke(SystemSignal.Resumed);
                return new IntPtr(1); // TRUE
            }
            case WM_QUERYENDSESSION:
                Signal?.Invoke(SystemSignal.SessionEnding);
                return new IntPtr(1); // allow shutdown; flush happened synchronously in the handler
            case WM_ENDSESSION:
                return IntPtr.Zero;
            case WM_APP_QUIT:
                PostQuitMessage(0);
                return IntPtr.Zero;
            case WM_DESTROY:
                return IntPtr.Zero;
            default:
                return DefWindowProcW(hWnd, msg, wParam, lParam);
        }
    }

    public void Dispose()
    {
        if (_hwnd != IntPtr.Zero) PostMessageW(_hwnd, (uint)WM_APP_QUIT, IntPtr.Zero, IntPtr.Zero);
        _thread.Join(TimeSpan.FromSeconds(5));
        _ready.Dispose();
    }
}
