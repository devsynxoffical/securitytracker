using CompanyOS.Watchdog;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

/// <summary>
/// CompanyOS.Watchdog Windows service (09 section 6). Install:
///   sc.exe create CompanyOSWatchdog binPath= "C:\Program Files\CompanyOS\agent\CompanyOS.Watchdog.exe" start= auto obj= LocalSystem
///   sc.exe failure CompanyOSWatchdog reset= 86400 actions= restart/5000/restart/10000/restart/30000
/// Runs as LocalSystem in session 0; needs SeTcbPrivilege (LocalSystem has it) for WTSQueryUserToken.
/// Configuration: appsettings.json next to the exe, section "Watchdog" (see WatchdogOptions).
/// </summary>
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(o => o.ServiceName = "CompanyOSWatchdog");
builder.Logging.AddEventLog(o => { o.SourceName = "CompanyOS Watchdog"; o.LogName = "Application"; });
builder.Services.Configure<WatchdogOptions>(builder.Configuration.GetSection("Watchdog"));
builder.Services.AddHostedService<AgentSupervisor>();
await builder.Build().RunAsync();
