using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using static CompanyOS.Watchdog.Win32.NativeMethods;

namespace CompanyOS.Watchdog;

/// <summary>Interactive sessions and launching a process inside one with the user's token (09 section 6 rule 1).</summary>
internal static class SessionLauncher
{
    public sealed record InteractiveSession(uint SessionId, string StationName);

    public static List<InteractiveSession> ActiveSessions()
    {
        var list = new List<InteractiveSession>();
        if (!WTSEnumerateSessionsW(WTS_CURRENT_SERVER_HANDLE, 0, 1, out var pInfo, out var count)) return list;
        try
        {
            var size = Marshal.SizeOf<WTS_SESSION_INFOW>();
            for (var i = 0; i < count; i++)
            {
                var info = Marshal.PtrToStructure<WTS_SESSION_INFOW>(pInfo + i * size);
                if (info.State == WTS_CONNECTSTATE_CLASS.WTSActive && info.SessionId != 0)
                {
                    list.Add(new InteractiveSession(info.SessionId, info.pWinStationName ?? string.Empty));
                }
            }
        }
        finally { WTSFreeMemory(pInfo); }
        return list;
    }

    /// <summary>Profile directory of the session's user (to find %LOCALAPPDATA%\CompanyOS\agent).</summary>
    public static string? ProfileDirectory(uint sessionId)
    {
        if (!WTSQueryUserToken(sessionId, out var token)) return null;
        try
        {
            var sb = new StringBuilder(1024);
            uint size = (uint)sb.Capacity;
            return GetUserProfileDirectoryW(token, sb, ref size) ? sb.ToString(0, (int)size - 1) : null;
        }
        finally { CloseHandle(token); }
    }

    /// <summary>Starts <paramref name="exePath"/> on the interactive desktop of the session as that user. Returns the pid.</summary>
    public static uint Launch(uint sessionId, string exePath, string? arguments, string workingDirectory)
    {
        if (!WTSQueryUserToken(sessionId, out var userToken))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "WTSQueryUserToken failed");

        IntPtr primary = IntPtr.Zero, env = IntPtr.Zero;
        try
        {
            if (!DuplicateTokenEx(userToken, MAXIMUM_ALLOWED, IntPtr.Zero, SECURITY_IMPERSONATION_LEVEL.SecurityIdentification, TOKEN_TYPE.TokenPrimary, out primary))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "DuplicateTokenEx failed");

            if (!CreateEnvironmentBlock(out env, primary, false))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateEnvironmentBlock failed");

            var si = new STARTUPINFOW
            {
                cb = (uint)Marshal.SizeOf<STARTUPINFOW>(),
                lpDesktop = @"winsta0\default",
            };
            var cmdLine = arguments is null ? $"\"{exePath}\"" : $"\"{exePath}\" {arguments}";

            if (!CreateProcessAsUserW(primary, exePath, cmdLine, IntPtr.Zero, IntPtr.Zero, false,
                    CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB, env, workingDirectory, ref si, out var pi))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateProcessAsUser failed");
            }
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
            return pi.dwProcessId;
        }
        finally
        {
            if (env != IntPtr.Zero) DestroyEnvironmentBlock(env);
            if (primary != IntPtr.Zero) CloseHandle(primary);
            CloseHandle(userToken);
        }
    }

    public static uint? SessionOf(int pid) => ProcessIdToSessionId((uint)pid, out var s) ? s : null;
}
