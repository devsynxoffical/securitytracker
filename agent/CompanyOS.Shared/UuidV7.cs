using System.Buffers.Binary;
using System.Security.Cryptography;

namespace CompanyOS.Shared;

/// <summary>
/// RFC 9562 UUID version 7 (time ordered). .NET 8 has no Guid.CreateVersion7, so it is built here.
/// Layout: 48-bit Unix milliseconds, 4-bit version (7), 12-bit random, 2-bit variant (10), 62-bit random.
/// Within one millisecond a 12-bit counter keeps ids monotonic for sorting in the queue and on the server.
/// </summary>
public static class UuidV7
{
    private static readonly object Gate = new();
    private static long _lastMs = -1;
    private static int _counter;

    public static Guid New(DateTime utcNow)
    {
        long ms = new DateTimeOffset(utcNow.ToUniversalTime()).ToUnixTimeMilliseconds();
        int seq;
        lock (Gate)
        {
            if (ms <= _lastMs)
            {
                ms = _lastMs;
                _counter = (_counter + 1) & 0x0FFF;
                if (_counter == 0) { ms = ++_lastMs; }
            }
            else
            {
                _lastMs = ms;
                _counter = RandomNumberGenerator.GetInt32(0, 0x0800); // leave headroom below 0x0FFF
            }
            seq = _counter;
        }

        Span<byte> bytes = stackalloc byte[16];
        RandomNumberGenerator.Fill(bytes[8..]);
        // 48-bit timestamp big endian
        bytes[0] = (byte)(ms >> 40);
        bytes[1] = (byte)(ms >> 32);
        bytes[2] = (byte)(ms >> 24);
        bytes[3] = (byte)(ms >> 16);
        bytes[4] = (byte)(ms >> 8);
        bytes[5] = (byte)ms;
        // version 7 + 12-bit sequence
        bytes[6] = (byte)(0x70 | ((seq >> 8) & 0x0F));
        bytes[7] = (byte)(seq & 0xFF);
        // variant 10xx
        bytes[8] = (byte)((bytes[8] & 0x3F) | 0x80);

        // Guid(byte[]) expects the first three fields little endian; build from RFC byte order.
        int a = BinaryPrimitives.ReadInt32BigEndian(bytes[0..4]);
        short b = BinaryPrimitives.ReadInt16BigEndian(bytes[4..6]);
        short c = BinaryPrimitives.ReadInt16BigEndian(bytes[6..8]);
        return new Guid(a, b, c, bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]);
    }

    /// <summary>Unix milliseconds encoded in a v7 id (for tests and diagnostics).</summary>
    public static long TimestampMs(Guid id)
    {
        var s = id.ToString("N");
        return Convert.ToInt64(s[..12], 16);
    }

    public static int Version(Guid id) => Convert.ToInt32(id.ToString("N")[12].ToString(), 16);
}
