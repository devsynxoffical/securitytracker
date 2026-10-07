import { screen, BrowserWindow, powerMonitor } from 'electron';
import * as os from 'os';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);


export interface HardwareProfile {
  hostname: string;
  platform: string;
  osRelease: string;
  osVersion: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  cpuSpeedMhz: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  usedMemoryPercent: number;
  systemUptimeSeconds: number;
  macAddress: string;
  ipAddress: string;
  hardwareHash: string;
  displayInfo: {
    width: number;
    height: number;
    scaleFactor: number;
  };
}

export interface WindowActivityRecord {
  id: string;
  appName: string;
  processName: string;
  windowTitle: string;
  activeSeconds: number;
  lastActiveAt: string;
  category: 'PRODUCTIVE' | 'NEUTRAL' | 'UNPRODUCTIVE';
}

export interface LiveTelemetryState {
  isTracking: boolean;
  shiftId: string | null;
  shiftState: 'WORKING' | 'ON_BREAK' | 'OFFLINE';
  
  // Hardware Snapshot
  hardware: HardwareProfile;
  
  // Cursor & Mouse Telemetry
  cursorPosition: { x: number; y: number };
  cursorDistancePixels: number;
  cursorMovementSeconds: number;
  mouseClicksCount: number;
  mouseActive: boolean;
  
  // Keyboard Telemetry (Aggregate Counts Only - Rule 8 Compliant)
  keystrokeTapsCount: number;
  typingActiveSeconds: number;
  keyboardActive: boolean;
  
  // Active Application Telemetry
  activeApp: {
    name: string;
    processName: string;
    windowTitle: string;
    activeSeconds: number;
    category: 'PRODUCTIVE' | 'NEUTRAL' | 'UNPRODUCTIVE';
  };
  
  // Recent Windows & Application Radar
  recentWindows: WindowActivityRecord[];
  openWindowsCount: number;
  
  // Global Shift Counters
  shiftDurationSeconds: number;
  totalActiveSeconds: number;
  totalIdleSeconds: number;
  currentIdleStreakSeconds: number;
  isIdle: boolean;
  
  // Local Queue
  queuedSegmentsCount: number;
  lastSyncedAt: string | null;
}

export interface ActivitySegment {
  id: string;
  shiftId: string;
  startedAt: string;
  endedAt: string;
  kind: 'active' | 'idle' | 'locked';
  processName: string;
  appName: string;
  domain: string | null;
  windowTitle: string | null;
  keyCount: number;
  mouseCount: number;
  exception: 'none' | 'call_app' | 'meeting_app' | 'mic';
  claim: 'none' | 'break' | 'away_work';
  clockSource: 'anchored' | 'unanchored';
}

export class TelemetryEngine {
  private static instance: TelemetryEngine;
  private mainWindow: BrowserWindow | null = null;
  
  private trackingActive: boolean = false;
  private shiftId: string | null = null;
  private shiftState: 'WORKING' | 'ON_BREAK' | 'OFFLINE' = 'OFFLINE';
  
  private lastCursorPos: { x: number; y: number } = { x: 0, y: 0 };
  private totalCursorDistance: number = 0;
  private cursorMovementSeconds: number = 0;
  private mouseClicksCount: number = 0;
  private keystrokeTapsCount: number = 0;
  private typingActiveSeconds: number = 0;
  
  private shiftDurationSeconds: number = 0;
  private totalActiveSeconds: number = 0;
  private totalIdleSeconds: number = 0;
  private currentIdleStreakSeconds: number = 0;
  private readonly IDLE_THRESHOLD_SECONDS = 300; // 5 minutes
  
  private currentApp: {
    name: string;
    processName: string;
    windowTitle: string;
    activeSeconds: number;
    category: 'PRODUCTIVE' | 'NEUTRAL' | 'UNPRODUCTIVE';
  } = {
    name: 'WorkPulse Workstation',
    processName: 'WorkPulse.app',
    windowTitle: 'WorkPulse Workstation — Live Floor',
    activeSeconds: 0,
    category: 'PRODUCTIVE',
  };

  private recentWindows: WindowActivityRecord[] = [];


  private segmentBuffer: ActivitySegment[] = [];
  private currentSegmentStart: Date = new Date();
  private segmentKeyCount: number = 0;
  private segmentMouseCount: number = 0;
  private lastSyncedAt: string | null = null;
  
  private loopTimer: NodeJS.Timeout | null = null;
  private activeAppTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.initPowerMonitor();
  }

  public static getInstance(): TelemetryEngine {
    if (!TelemetryEngine.instance) {
      TelemetryEngine.instance = new TelemetryEngine();
    }
    return TelemetryEngine.instance;
  }

  public setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  public getHardwareProfile(): HardwareProfile {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
    
    // Primary Network Interface
    const nets = os.networkInterfaces();
    let mac = '00:00:00:00:00:00';
    let ip = '127.0.0.1';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (!net.internal && net.family === 'IPv4') {
          mac = net.mac;
          ip = net.address;
          break;
        }
      }
    }

    // Deterministic Hardware Fingerprint Hash
    const rawFingerprint = `${os.hostname()}-${os.platform()}-${os.arch()}-${cpus[0]?.model || 'cpu'}-${totalMem}-${mac}`;
    const hardwareHash = crypto.createHash('sha256').update(rawFingerprint).digest('hex');

    // Display Info
    let displayInfo = { width: 1920, height: 1080, scaleFactor: 2 };
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      if (primaryDisplay) {
        displayInfo = {
          width: primaryDisplay.size.width,
          height: primaryDisplay.size.height,
          scaleFactor: primaryDisplay.scaleFactor,
        };
      }
    } catch {
      // Screen not yet ready
    }

    return {
      hostname: os.hostname(),
      platform: os.platform(),
      osRelease: os.release(),
      osVersion: os.version ? os.version() : os.release(),
      arch: os.arch(),
      cpuModel: cpus[0]?.model || 'Unknown CPU',
      cpuCores: cpus.length,
      cpuSpeedMhz: cpus[0]?.speed || 0,
      totalMemoryMb: Math.round(totalMem / (1024 * 1024)),
      freeMemoryMb: Math.round(freeMem / (1024 * 1024)),
      usedMemoryPercent: usedPercent,
      systemUptimeSeconds: Math.round(os.uptime()),
      macAddress: mac,
      ipAddress: ip,
      hardwareHash,
      displayInfo,
    };
  }  public startShift(shiftId: string) {
    this.shiftId = shiftId;
    this.trackingActive = true;
    this.shiftState = 'WORKING';
    this.currentSegmentStart = new Date();
    this.segmentKeyCount = 0;
    this.segmentMouseCount = 0;
    this.shiftDurationSeconds = 0;
    this.totalActiveSeconds = 0;
    this.totalIdleSeconds = 0;
    this.currentIdleStreakSeconds = 0;
    this.totalCursorDistance = 0;
    this.cursorMovementSeconds = 0;
    this.mouseClicksCount = 0;
    this.keystrokeTapsCount = 0;
    this.typingActiveSeconds = 0;
    this.recentWindows = [];
    
    this.startTelemetryLoop();
  }

  public pauseShift(_reason: string = 'Break') {
    this.shiftState = 'ON_BREAK';
    this.closeCurrentSegment('idle', 'break');
  }

  public resumeShift() {
    this.shiftState = 'WORKING';
    this.currentSegmentStart = new Date();
  }

  public endShift() {
    this.closeCurrentSegment('active');
    this.trackingActive = false;
    this.shiftState = 'OFFLINE';
    this.stopTelemetryLoop();
  }

  public registerKeyTap(count: number = 1) {
    this.keystrokeTapsCount += count;
    this.segmentKeyCount += count;
    this.currentIdleStreakSeconds = 0;
    this.typingActiveSeconds += 1;
  }

  public registerMouseClick(count: number = 1) {
    this.mouseClicksCount += count;
    this.segmentMouseCount += count;
    this.currentIdleStreakSeconds = 0;
  }

  private startTelemetryLoop() {
    if (this.loopTimer) clearInterval(this.loopTimer);
    if (this.activeAppTimer) clearInterval(this.activeAppTimer);

    // 1-second Main Telemetry Tick
    this.loopTimer = setInterval(() => {
      this.tick();
    }, 1000);

    // 1-second Active Foreground App Poller
    this.activeAppTimer = setInterval(() => {
      this.detectActiveApplication();
    }, 1000);
  }

  private stopTelemetryLoop() {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.activeAppTimer) {
      clearInterval(this.activeAppTimer);
      this.activeAppTimer = null;
    }
  }

  private tick() {
    if (!this.trackingActive) return;

    this.shiftDurationSeconds += 1;

    // Measure Cursor Movement
    try {
      const currentPos = screen.getCursorScreenPoint();
      const dx = currentPos.x - this.lastCursorPos.x;
      const dy = currentPos.y - this.lastCursorPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 3) {
        this.totalCursorDistance += Math.round(distance);
        this.cursorMovementSeconds += 1;
        this.segmentMouseCount += 1;
        this.currentIdleStreakSeconds = 0;
      }
      this.lastCursorPos = currentPos;
    } catch {
      // Screen API error safeguard
    }

    // Determine Active vs Idle
    if (this.shiftState === 'WORKING') {
      if (this.currentIdleStreakSeconds >= this.IDLE_THRESHOLD_SECONDS) {
        this.totalIdleSeconds += 1;
      } else {
        this.totalActiveSeconds += 1;
        this.currentApp.activeSeconds += 1;
      }
      this.currentIdleStreakSeconds += 1;
    }

    // Checkpoint Segment Every 60 Seconds
    const segmentAgeSeconds = Math.floor((Date.now() - this.currentSegmentStart.getTime()) / 1000);
    if (segmentAgeSeconds >= 60) {
      this.closeCurrentSegment(
        this.currentIdleStreakSeconds >= this.IDLE_THRESHOLD_SECONDS ? 'idle' : 'active'
      );
      this.currentSegmentStart = new Date();
      this.segmentKeyCount = 0;
      this.segmentMouseCount = 0;
    }

    // Broadcast Real-Time Telemetry to Renderer UI
    this.broadcastState();
  }

  private async detectActiveApplication() {
    try {
      let appName = 'WorkPulse Workstation';
      let processName = 'WorkPulse.app';
      let windowTitle = 'WorkPulse Workstation — Active Session';

      if (process.platform === 'darwin') {
        const { stdout } = await execAsync(
          `osascript -e '
            tell application "System Events"
              try
                set frontApp to first application process whose frontmost is true
                set appName to name of frontApp
                set winTitle to ""
                try
                  tell frontApp to set winTitle to name of front window
                end try
                return appName & "|||" & winTitle
              on error
                return "WorkPulse Workstation|||Dashboard"
              end try
            end tell
          '`
        );
        const parts = stdout.trim().split('|||');
        appName = parts[0]?.trim() || 'WorkPulse Workstation';
        const rawTitle = parts[1]?.trim() || '';
        windowTitle = rawTitle ? `${appName} - ${rawTitle}` : `${appName} - Active Window`;
        processName = `${appName}.app`;
      } else if (process.platform === 'win32') {
        const { stdout } = await execAsync(
          `powershell -NoProfile -Command "
            Add-Type @'
              using System;
              using System.Runtime.InteropServices;
              using System.Text;
              public class WinUtil {
                [DllImport(\\"user32.dll\\")] public static extern IntPtr GetForegroundWindow();
                [DllImport(\\"user32.dll\\")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
                [DllImport(\\"user32.dll\\", SetLastError=true)] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
              }
'@
            $hwnd = [WinUtil]::GetForegroundWindow()
            $sb = New-Object System.Text.StringBuilder 256
            [void][WinUtil]::GetWindowText($hwnd, $sb, 256)
            $pid = 0
            [void][WinUtil]::GetWindowThreadProcessId($hwnd, [ref]$pid)
            $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
            [PSCustomObject]@{
              ProcessName = if ($p) { $p.ProcessName } else { 'WorkPulse' }
              WindowTitle = $sb.ToString()
            } | ConvertTo-Json -Compress
          "`
        );
        const data = JSON.parse(stdout.trim());
        appName = data.ProcessName || 'WorkPulse Workstation';
        processName = `${appName}.exe`;
        windowTitle = data.WindowTitle || `${appName} - Active Window`;
      }

      const category = this.categorizeApp(appName);

      // Update current active app
      this.currentApp = {
        name: appName,
        processName,
        windowTitle,
        activeSeconds: (this.currentApp && this.currentApp.name === appName ? this.currentApp.activeSeconds + 1 : 1),
        category,
      };

      // Record in recent windows list
      if (this.trackingActive) {
        const nowIso = new Date().toISOString();
        const existingIdx = this.recentWindows.findIndex(
          (w) => w.appName === appName && (w.windowTitle === windowTitle || !w.windowTitle)
        );
        if (existingIdx >= 0) {
          this.recentWindows[existingIdx].activeSeconds += 1;
          this.recentWindows[existingIdx].lastActiveAt = nowIso;
          this.recentWindows[existingIdx].windowTitle = windowTitle;
        } else {
          this.recentWindows.unshift({
            id: `win-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            appName,
            processName,
            windowTitle,
            activeSeconds: 1,
            lastActiveAt: nowIso,
            category,
          });
          if (this.recentWindows.length > 25) {
            this.recentWindows.pop();
          }
        }
      }

      this.broadcastState();
    } catch {
      // Non-blocking fallback
    }
  }

  private categorizeApp(name: string): 'PRODUCTIVE' | 'NEUTRAL' | 'UNPRODUCTIVE' {
    const lower = name.toLowerCase();
    const productiveApps = ['code', 'visual studio', 'cursor', 'antigravity', 'terminal', 'chrome', 'safari', 'firefox', 'figma', 'slack', 'teams', 'outlook', 'workpulse', 'notion', 'postman', 'dbeaver', 'excel', 'word', 'powerpoint', 'finder', 'explorer'];
    const unproductiveApps = ['steam', 'netflix', 'spotify', 'games', 'discord', 'tiktok', 'youtube'];

    if (productiveApps.some((p) => lower.includes(p))) return 'PRODUCTIVE';
    if (unproductiveApps.some((u) => lower.includes(u))) return 'UNPRODUCTIVE';
    return 'NEUTRAL';
  }

  private closeCurrentSegment(kind: 'active' | 'idle' | 'locked', claim: 'none' | 'break' | 'away_work' = 'none') {
    if (!this.shiftId) return;

    const endedAt = new Date();
    const segment: ActivitySegment = {
      id: crypto.randomUUID(),
      shiftId: this.shiftId,
      startedAt: this.currentSegmentStart.toISOString(),
      endedAt: endedAt.toISOString(),
      kind,
      processName: this.currentApp.processName,
      appName: this.currentApp.name,
      domain: null,
      windowTitle: this.currentApp.windowTitle,
      keyCount: this.segmentKeyCount,
      mouseCount: this.segmentMouseCount,
      exception: 'none',
      claim,
      clockSource: 'anchored',
    };

    this.segmentBuffer.push(segment);
    // Keep max 1000 in local buffer
    if (this.segmentBuffer.length > 1000) {
      this.segmentBuffer.shift();
    }
  }

  private initPowerMonitor() {
    powerMonitor.on('lock-screen', () => {
      this.closeCurrentSegment('locked');
    });
    powerMonitor.on('unlock-screen', () => {
      this.currentSegmentStart = new Date();
    });
    powerMonitor.on('suspend', () => {
      this.closeCurrentSegment('locked');
    });
    powerMonitor.on('resume', () => {
      this.currentSegmentStart = new Date();
    });
  }

  public getLiveTelemetryState(): LiveTelemetryState {
    const isIdle = this.currentIdleStreakSeconds >= this.IDLE_THRESHOLD_SECONDS;
    return {
      isTracking: this.trackingActive,
      shiftId: this.shiftId,
      shiftState: this.shiftState,
      hardware: this.getHardwareProfile(),
      cursorPosition: this.lastCursorPos,
      cursorDistancePixels: this.totalCursorDistance,
      cursorMovementSeconds: this.cursorMovementSeconds,
      mouseClicksCount: this.mouseClicksCount,
      mouseActive: this.currentIdleStreakSeconds < 5,
      keystrokeTapsCount: this.keystrokeTapsCount,
      typingActiveSeconds: this.typingActiveSeconds,
      keyboardActive: this.currentIdleStreakSeconds < 5 && this.segmentKeyCount > 0,
      activeApp: this.currentApp,
      recentWindows: this.recentWindows,
      openWindowsCount: this.recentWindows.length || (this.trackingActive ? 1 : 0),
      shiftDurationSeconds: this.shiftDurationSeconds,
      totalActiveSeconds: this.totalActiveSeconds,
      totalIdleSeconds: this.totalIdleSeconds,
      currentIdleStreakSeconds: this.currentIdleStreakSeconds,
      isIdle,
      queuedSegmentsCount: this.segmentBuffer.length,
      lastSyncedAt: this.lastSyncedAt,
    };
  }

  public getQueuedSegments(): ActivitySegment[] {
    return [...this.segmentBuffer];
  }

  public acknowledgeSegments(acceptedIds: string[]) {
    const acceptedSet = new Set(acceptedIds);
    this.segmentBuffer = this.segmentBuffer.filter((s) => !acceptedSet.has(s.id));
    this.lastSyncedAt = new Date().toISOString();
  }

  private broadcastState() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const state = this.getLiveTelemetryState();
      this.mainWindow.webContents.send('telemetry:update', state);
    }
  }
}
