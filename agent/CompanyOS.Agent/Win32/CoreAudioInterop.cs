using System.Runtime.InteropServices;

namespace CompanyOS.Agent.Win32;

/// <summary>
/// Minimal Core Audio COM interop to answer one question: is any application capturing from a microphone?
/// Enumerates active capture endpoints and their audio sessions; a session in state Active means capture.
/// Interface vtables below follow mmdeviceapi.h and audiopolicy.h; only the methods we call are typed,
/// the rest are placeholders in the correct slot order. VERIFY on Windows (see README).
/// </summary>
internal static class CoreAudioInterop
{
    private const int EDataFlow_eCapture = 1;
    private const int DEVICE_STATE_ACTIVE = 0x00000001;
    private const int AudioSessionStateActive = 1;
    private const int CLSCTX_ALL = 23;

    private static readonly Guid CLSID_MMDeviceEnumerator = new("BCDE0395-E52F-467C-8E3D-C4579291692E");
    private static readonly Guid IID_IAudioSessionManager2 = new("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IMMDeviceCollection? ppDevices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice? ppEndpoint);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice? ppDevice);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr pClient);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr pClient);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out uint pcDevices);
        [PreserveSig] int Item(uint nDevice, out IMMDevice? ppDevice);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object? ppInterface);
        [PreserveSig] int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string? ppstrId);
        [PreserveSig] int GetState(out int pdwState);
    }

    // IAudioSessionManager2 : IAudioSessionManager. Slots: GetAudioSessionControl, GetSimpleAudioVolume (base),
    // then GetSessionEnumerator, RegisterSessionNotification, UnregisterSessionNotification,
    // RegisterDuckNotification, UnregisterDuckNotification.
    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(IntPtr audioSessionGuid, uint streamFlags, out IntPtr sessionControl);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr audioSessionGuid, uint streamFlags, out IntPtr audioVolume);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator? sessionEnum);
        [PreserveSig] int RegisterSessionNotification(IntPtr sessionNotification);
        [PreserveSig] int UnregisterSessionNotification(IntPtr sessionNotification);
        [PreserveSig] int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId, IntPtr duckNotification);
        [PreserveSig] int UnregisterDuckNotification(IntPtr duckNotification);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int sessionCount);
        [PreserveSig] int GetSession(int sessionCount, out IAudioSessionControl? session);
    }

    [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl
    {
        [PreserveSig] int GetState(out int pRetVal);
        // remaining methods (GetDisplayName, SetDisplayName, GetIconPath, SetIconPath, GetGroupingParam,
        // SetGroupingParam, RegisterAudioSessionNotification, UnregisterAudioSessionNotification) are not called.
    }

    /// <summary>True when at least one audio session on an active capture endpoint is in state Active.</summary>
    public static bool IsAnyCaptureSessionActive()
    {
        object? enumeratorObj = null;
        try
        {
            var type = Type.GetTypeFromCLSID(CLSID_MMDeviceEnumerator);
            if (type is null) return false;
            enumeratorObj = Activator.CreateInstance(type);
            if (enumeratorObj is not IMMDeviceEnumerator enumerator) return false;

            if (enumerator.EnumAudioEndpoints(EDataFlow_eCapture, DEVICE_STATE_ACTIVE, out var devices) < 0 || devices is null) return false;
            if (devices.GetCount(out var count) < 0) return false;

            for (uint i = 0; i < count; i++)
            {
                if (devices.Item(i, out var device) < 0 || device is null) continue;
                try
                {
                    var iid = IID_IAudioSessionManager2;
                    if (device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out var mgrObj) < 0 || mgrObj is not IAudioSessionManager2 mgr) continue;
                    try
                    {
                        if (mgr.GetSessionEnumerator(out var sessions) < 0 || sessions is null) continue;
                        try
                        {
                            if (sessions.GetCount(out var n) < 0) continue;
                            for (var s = 0; s < n; s++)
                            {
                                if (sessions.GetSession(s, out var ctl) < 0 || ctl is null) continue;
                                try
                                {
                                    if (ctl.GetState(out var state) >= 0 && state == AudioSessionStateActive) return true;
                                }
                                finally { Marshal.ReleaseComObject(ctl); }
                            }
                        }
                        finally { Marshal.ReleaseComObject(sessions); }
                    }
                    finally { Marshal.ReleaseComObject(mgr); }
                }
                finally { Marshal.ReleaseComObject(device); }
            }
            Marshal.ReleaseComObject(devices);
            return false;
        }
        catch
        {
            return false; // never let audio failures affect tracking
        }
        finally
        {
            if (enumeratorObj is not null && Marshal.IsComObject(enumeratorObj)) Marshal.ReleaseComObject(enumeratorObj);
        }
    }
}
