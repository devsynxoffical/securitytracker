using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;
using static CompanyOS.Watchdog.Win32.NativeMethods;

namespace CompanyOS.Watchdog;

/// <summary>
/// Authenticode verification (09 section 6 rule 3): WinVerifyTrust must succeed with the chain built from the
/// local cache only (no network, rule 5), and the leaf certificate subject must contain the configured
/// publisher name. In Development builds (unsigned binaries) verification can be disabled by configuration;
/// the service logs loudly when that is the case.
/// </summary>
internal sealed class SignatureVerifier
{
    private readonly string? _expectedPublisher;
    private readonly bool _enforce;

    public SignatureVerifier(string? expectedPublisher, bool enforce)
    {
        _expectedPublisher = expectedPublisher;
        _enforce = enforce;
    }

    public bool Enforced => _enforce;

    /// <summary>Returns null when trusted, otherwise a reason.</summary>
    public string? Verify(string path)
    {
        if (!_enforce) return null;
        if (!File.Exists(path)) return "file missing";

        var fileInfo = new WINTRUST_FILE_INFO
        {
            cbStruct = (uint)Marshal.SizeOf<WINTRUST_FILE_INFO>(),
            pcwszFilePath = path,
            hFile = IntPtr.Zero,
            pgKnownSubject = IntPtr.Zero,
        };
        var pFile = Marshal.AllocHGlobal(Marshal.SizeOf<WINTRUST_FILE_INFO>());
        var pData = Marshal.AllocHGlobal(Marshal.SizeOf<WINTRUST_DATA>());
        try
        {
            Marshal.StructureToPtr(fileInfo, pFile, false);
            var data = new WINTRUST_DATA
            {
                cbStruct = (uint)Marshal.SizeOf<WINTRUST_DATA>(),
                dwUIChoice = WTD_UI_NONE,
                fdwRevocationChecks = WTD_REVOKE_NONE,
                dwUnionChoice = WTD_CHOICE_FILE,
                pFile = pFile,
                dwStateAction = WTD_STATEACTION_VERIFY,
                dwProvFlags = WTD_CACHE_ONLY_URL_RETRIEVAL | WTD_REVOCATION_CHECK_NONE,
            };
            Marshal.StructureToPtr(data, pData, false);

            var result = WinVerifyTrust(INVALID_HANDLE_VALUE, WINTRUST_ACTION_GENERIC_VERIFY_V2, pData);

            // Release state handle regardless of outcome.
            data = Marshal.PtrToStructure<WINTRUST_DATA>(pData);
            data.dwStateAction = WTD_STATEACTION_CLOSE;
            Marshal.StructureToPtr(data, pData, true);
            WinVerifyTrust(INVALID_HANDLE_VALUE, WINTRUST_ACTION_GENERIC_VERIFY_V2, pData);

            if (result != 0) return $"WinVerifyTrust failed 0x{result:X8}";
        }
        finally
        {
            Marshal.DestroyStructure<WINTRUST_FILE_INFO>(pFile);
            Marshal.FreeHGlobal(pFile);
            Marshal.FreeHGlobal(pData);
        }

        if (string.IsNullOrWhiteSpace(_expectedPublisher)) return null;
        try
        {
            using var cert = new X509Certificate2(X509Certificate.CreateFromSignedFile(path));
            var subject = cert.GetNameInfo(X509NameType.SimpleName, false);
            return subject.Contains(_expectedPublisher, StringComparison.OrdinalIgnoreCase)
                ? null
                : $"publisher mismatch: '{subject}'";
        }
        catch (Exception ex)
        {
            return "certificate read failed: " + ex.Message;
        }
    }
}
