using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using CompanyOS.Core.Abstractions;
using CompanyOS.Core.Pipe;
using CompanyOS.Shared.Protocol;

namespace CompanyOS.Agent;

/// <summary>
/// Named pipe server \\.\pipe\CompanyOS.Agent.&lt;sessionId&gt; (09 section 4). JSON lines in both directions.
/// ACL: the current user only (plus SYSTEM for the watchdog's health probe). Several clients may be connected
/// (Desktop App and the native messaging host); events are broadcast to all of them.
/// </summary>
internal sealed class PipeServer : IEventSink, IDisposable
{
    private const int MaxInstances = 8;
    private readonly string _pipeName;
    private readonly Func<CommandHandler> _handlerFactory;
    private readonly IAgentLog _log;
    private readonly CancellationTokenSource _cts = new();
    private readonly List<StreamWriter> _clients = new();
    private readonly object _clientsGate = new();
    private readonly List<Task> _acceptors = new();

    public PipeServer(string pipeName, Func<CommandHandler> handlerFactory, IAgentLog log)
    {
        _pipeName = pipeName;
        _handlerFactory = handlerFactory;
        _log = log;
    }

    public void Start()
    {
        for (var i = 0; i < 2; i++) _acceptors.Add(Task.Run(AcceptLoop));
        _log.Info($"Pipe server listening on \\\\.\\pipe\\{_pipeName}");
    }

    private async Task AcceptLoop()
    {
        while (!_cts.IsCancellationRequested)
        {
            NamedPipeServerStream? server = null;
            try
            {
                server = Create();
                await server.WaitForConnectionAsync(_cts.Token).ConfigureAwait(false);
                _ = Task.Run(() => Serve(server), _cts.Token);
                server = null;
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _log.Error("Pipe accept failed", ex);
                await Task.Delay(1000, _cts.Token).ContinueWith(_ => { });
            }
            finally { server?.Dispose(); }
        }
    }

    private NamedPipeServerStream Create()
    {
        if (OperatingSystem.IsWindows())
        {
            var security = new PipeSecurity();
            var me = WindowsIdentity.GetCurrent().User!;
            security.AddAccessRule(new PipeAccessRule(me, PipeAccessRights.ReadWrite | PipeAccessRights.CreateNewInstance, AccessControlType.Allow));
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), PipeAccessRights.ReadWrite, AccessControlType.Allow));
            // Everyone else is implicitly denied: no rule, no access.
            return NamedPipeServerStreamAcl.Create(_pipeName, PipeDirection.InOut, MaxInstances, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 64 * 1024, 64 * 1024, security);
        }
        return new NamedPipeServerStream(_pipeName, PipeDirection.InOut, MaxInstances, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
    }

    private async Task Serve(NamedPipeServerStream pipe)
    {
        var handler = _handlerFactory();
        using var reader = new StreamReader(pipe, new UTF8Encoding(false), false, 64 * 1024, leaveOpen: true);
        var writer = new StreamWriter(pipe, new UTF8Encoding(false), 64 * 1024, leaveOpen: true) { AutoFlush = true, NewLine = "\n" };
        lock (_clientsGate) _clients.Add(writer);
        try
        {
            while (pipe.IsConnected && !_cts.IsCancellationRequested)
            {
                var line = await reader.ReadLineAsync(_cts.Token).ConfigureAwait(false);
                if (line is null) break;
                if (line.Length == 0) continue;
                if (line.Length > 1_000_000) { await WriteAsync(writer, PipeJson.Serialize(new PipeResponse { Ok = false, Error = "line_too_long" })); continue; }
                var response = handler.Handle(line);
                await WriteAsync(writer, PipeJson.Serialize(response)).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) { }
        catch (IOException) { /* client went away */ }
        catch (Exception ex) { _log.Error("Pipe client error", ex); }
        finally
        {
            lock (_clientsGate) _clients.Remove(writer);
            try { pipe.Dispose(); } catch { }
        }
    }

    public void Publish(string eventName, object payload)
    {
        string line;
        try
        {
            line = payload switch
            {
                LongIdleEndedEvent e => PipeJson.Serialize(PipeJson.Event(eventName, e)),
                QueueWarningEvent e => PipeJson.Serialize(PipeJson.Event(eventName, e)),
                StateChangedEvent e => PipeJson.Serialize(PipeJson.Event(eventName, e)),
                _ => PipeJson.Serialize(new PipeEvent { Event = eventName }),
            };
        }
        catch (Exception ex) { _log.Error("Event serialisation failed", ex); return; }

        List<StreamWriter> targets;
        lock (_clientsGate) targets = _clients.ToList();
        foreach (var w in targets)
        {
            _ = WriteAsync(w, line);
        }
    }

    private static async Task WriteAsync(StreamWriter w, string line)
    {
        try
        {
            await w.WriteLineAsync(line).ConfigureAwait(false);
        }
        catch { /* disconnected client; removed by its Serve loop */ }
    }

    public void Dispose()
    {
        _cts.Cancel();
        lock (_clientsGate)
        {
            foreach (var c in _clients) { try { c.Dispose(); } catch { } }
            _clients.Clear();
        }
        _cts.Dispose();
    }
}
