using System.Security.Cryptography;
using CompanyOS.Core.Storage;

namespace CompanyOS.Agent;

/// <summary>
/// Random 256-bit queue key protected with DPAPI for the current user (09 section 4). The key file lives next
/// to queue.db; another Windows user or another machine cannot unprotect it.
/// </summary>
internal static class DpapiKeyStore
{
    public static AesGcmCipher LoadOrCreate(string keyPath)
    {
        var dir = Path.GetDirectoryName(keyPath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        if (File.Exists(keyPath))
        {
            try
            {
                var protectedBytes = File.ReadAllBytes(keyPath);
                var key = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.CurrentUser);
                if (key.Length == 32) return new AesGcmCipher(key);
            }
            catch (CryptographicException)
            {
                // Profile changed or file corrupt: old rows become unreadable (reported as skipped); start a new key.
                File.Move(keyPath, keyPath + ".unreadable-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss"), overwrite: true);
            }
        }

        var fresh = RandomNumberGenerator.GetBytes(32);
        File.WriteAllBytes(keyPath, ProtectedData.Protect(fresh, Entropy, DataProtectionScope.CurrentUser));
        return new AesGcmCipher(fresh);
    }

    // Fixed additional entropy so a different application using DPAPI cannot unprotect the blob by accident.
    private static readonly byte[] Entropy = "CompanyOS.Agent.QueueKey.v1"u8.ToArray();
}
