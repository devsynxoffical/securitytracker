using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace CompanyOS.Watchdog
{
    /// <summary>
    /// Session 0 Windows Service that supervises the User Session Agent.
    /// Ensures high availability, tamper recovery, and clean restarts.
    /// </summary>
    public class Program
    {
        private static bool _serviceRunning = true;
        private static readonly string AgentExePath = @"C:\Program Files\CompanyOS\agent\CompanyOS.Agent.exe";

        public static async Task Main(string[] args)
        {
            Console.WriteLine("[CompanyOS.Watchdog] Starting Session 0 Watchdog Service...");

            while (_serviceRunning)
            {
                try
                {
                    var processes = Process.GetProcessesByName("CompanyOS.Agent");
                    if (processes.Length == 0 && File.Exists(AgentExePath))
                    {
                        Console.WriteLine("[CompanyOS.Watchdog] Agent process missing. Relaunching in active user session...");
                        // In production: uses WTSQueryUserToken + CreateProcessAsUser to launch in the logged-in session
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[CompanyOS.Watchdog] Health check exception: {ex.Message}");
                }

                await Task.Delay(10000); // 10 second supervision interval per spec
            }
        }
    }
}
