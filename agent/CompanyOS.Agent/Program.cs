using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using CompanyOS.Shared;

namespace CompanyOS.Agent
{
    public class Program
    {
        private static bool _isRunning = true;
        private static TrackingConfigPayload _config = new();
        private static Guid _currentShiftId = Guid.Empty;
        private static bool _isTracking = false;

        public static async Task Main(string[] args)
        {
            Console.WriteLine("[CompanyOS.Agent] Starting background tracking agent in user session...");

            // Cancel on Ctrl+C / process terminate
            Console.CancelKeyPress += (s, e) =>
            {
                e.Cancel = true;
                _isRunning = false;
            };

            // Start Named Pipe server for Electron Desktop App communication
            var pipeServerTask = Task.Run(StartNamedPipeServer);

            // Start measurement loop (1 second tick)
            var measurementLoopTask = Task.Run(RunMeasurementLoop);

            await Task.WhenAll(pipeServerTask, measurementLoopTask);
            Console.WriteLine("[CompanyOS.Agent] Agent shut down cleanly.");
        }

        private static async Task StartNamedPipeServer()
        {
            var pipeName = "CompanyOS.Agent";
            Console.WriteLine($"[CompanyOS.Agent] Named Pipe server listening on \\\\.\\pipe\\{pipeName}");

            while (_isRunning)
            {
                try
                {
                    using var server = new NamedPipeServerStream(
                        pipeName,
                        PipeDirection.InOut,
                        1,
                        PipeTransmissionMode.Byte,
                        PipeOptions.Asynchronous);

                    await server.WaitForConnectionAsync();
                    Console.WriteLine("[CompanyOS.Agent] Desktop App connected via Named Pipe.");

                    using var reader = new StreamReader(server, Encoding.UTF8);
                    using var writer = new StreamWriter(server, Encoding.UTF8) { AutoFlush = true };

                    while (server.IsConnected && _isRunning)
                    {
                        var line = await reader.ReadLineAsync();
                        if (string.IsNullOrEmpty(line)) break;

                        var response = HandlePipeCommand(line);
                        await writer.WriteLineAsync(response);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[CompanyOS.Agent] Named Pipe error: {ex.Message}");
                    await Task.Delay(1000);
                }
            }
        }

        private static string HandlePipeCommand(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                var command = root.GetProperty("command").GetString();

                switch (command)
                {
                    case "hello":
                        return JsonSerializer.Serialize(new { status = "ok", version = "1.0.0", isTracking = _isTracking });

                    case "startTracking":
                        _currentShiftId = Guid.NewGuid();
                        _isTracking = true;
                        return JsonSerializer.Serialize(new { status = "ok", shiftId = _currentShiftId });

                    case "pauseTracking":
                    case "resumeTracking":
                        return JsonSerializer.Serialize(new { status = "ok" });

                    case "stopTracking":
                        _isTracking = false;
                        _currentShiftId = Guid.Empty;
                        return JsonSerializer.Serialize(new { status = "ok" });

                    case "status":
                        return JsonSerializer.Serialize(new
                        {
                            isTracking = _isTracking,
                            shiftId = _currentShiftId,
                            queueCount = 0,
                            memoryMb = GC.GetTotalMemory(false) / (1024 * 1024)
                        });

                    default:
                        return JsonSerializer.Serialize(new { status = "unknown_command" });
                }
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new { status = "error", message = ex.Message });
            }
        }

        private static async Task RunMeasurementLoop()
        {
            while (_isRunning)
            {
                if (_isTracking)
                {
                    // Measure foreground window & activity tick
                    // In real Windows execution: calls Win32 GetForegroundWindow and GetLastInputInfo
                }
                await Task.Delay(1000);
            }
        }
    }
}
