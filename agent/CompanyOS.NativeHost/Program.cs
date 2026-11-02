using System.Buffers.Binary;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using CompanyOS.Shared.Protocol;

namespace CompanyOS.NativeHost;

/// <summary>
/// Native messaging host (09 section 5). Chrome and Edge start this process with the extension origin as the
/// first argument and talk over stdio: 4-byte little-endian length + UTF-8 JSON. Each {domain, browser, ts}
/// message is forwarded to the agent's pipe as the internal command <c>extensionDomain</c>. The host holds no
/// state, no network, no file access. It exits when the browser closes stdin.
/// </summary>
internal static class Program
{
    private static readonly string[] AllowedOriginPrefixes = { "chrome-extension://" };

    private static async Task<int> Main(string[] args)
    {
        // Chrome passes the origin as argv[1] (and on Windows also --parent-window=<hwnd>). Reject anything odd.
        var origin = args.FirstOrDefault(a => a.StartsWith("chrome-extension://", StringComparison.Ordinal));
        if (origin is null || !AllowedOriginPrefixes.Any(p => origin.StartsWith(p, StringComparison.Ordinal)))
        {
            // Still serve: the browser only launches hosts whose manifest lists the extension (allowed_origins).
        }

        using var stdin = Console.OpenStandardInput();
        using var stdout = Console.OpenStandardOutput();

        uint sessionId = 0;
        if (OperatingSystem.IsWindows()) ProcessIdToSessionId((uint)Environment.ProcessId, out sessionId);
        var pipeName = PipeNames.ForSession((int)sessionId);

        NamedPipeClientStream? pipe = null;
        StreamWriter? pipeWriter = null;
        var lengthBuf = new byte[4];

        while (true)
        {
            if (!await ReadExactAsync(stdin, lengthBuf, 4)) break;
            var length = BinaryPrimitives.ReadUInt32LittleEndian(lengthBuf);
            if (length == 0 || length > 64 * 1024) break; // protocol violation: stop
            var body = new byte[length];
            if (!await ReadExactAsync(stdin, body, (int)length)) break;

            ExtensionDomainMessage? msg;
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                msg = new ExtensionDomainMessage
                {
                    Domain = root.TryGetProperty("domain", out var d) ? d.GetString() ?? "unknown" : "unknown",
                    Browser = root.TryGetProperty("browser", out var b) ? b.GetString() ?? "chrome" : "chrome",
                    Ts = root.TryGetProperty("ts", out var ts) && ts.TryGetInt64(out var tsv) ? tsv : 0,
                };
            }
            catch
            {
                await ReplyAsync(stdout, "{\"ok\":false,\"error\":\"invalid_json\"}");
                continue;
            }

            var ok = false;
            for (var attempt = 0; attempt < 2 && !ok; attempt++)
            {
                try
                {
                    if (pipe is null || !pipe.IsConnected)
                    {
                        pipe?.Dispose();
                        pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
                        await pipe.ConnectAsync(1500);
                        pipeWriter = new StreamWriter(pipe, new UTF8Encoding(false)) { AutoFlush = true, NewLine = "\n" };
                    }
                    var request = new PipeRequest { Command = Commands.ExtensionDomain, Payload = PipeJson.ToElement(msg!) };
                    await pipeWriter!.WriteLineAsync(PipeJson.Serialize(request));
                    // Response is read and discarded to keep the pipe in sync; a reader per line.
                    using var reader = new StreamReader(pipe, new UTF8Encoding(false), false, 4096, leaveOpen: true);
                    using var cts = new CancellationTokenSource(1500);
                    var response = await reader.ReadLineAsync(cts.Token);
                    ok = response is not null;
                }
                catch
                {
                    pipe?.Dispose();
                    pipe = null;
                    pipeWriter = null;
                }
            }

            await ReplyAsync(stdout, ok ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"agent_unavailable\"}");
        }

        pipe?.Dispose();
        return 0;
    }

    private static async Task<bool> ReadExactAsync(Stream s, byte[] buf, int count)
    {
        var read = 0;
        while (read < count)
        {
            var n = await s.ReadAsync(buf.AsMemory(read, count - read));
            if (n <= 0) return false;
            read += n;
        }
        return true;
    }

    private static async Task ReplyAsync(Stream stdout, string json)
    {
        var body = Encoding.UTF8.GetBytes(json);
        var len = new byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(len, (uint)body.Length);
        await stdout.WriteAsync(len);
        await stdout.WriteAsync(body);
        await stdout.FlushAsync();
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ProcessIdToSessionId(uint dwProcessId, out uint pSessionId);
}
