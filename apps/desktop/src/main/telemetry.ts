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
    name: 'WorkPulse',
    processName: 'WorkPulse.app',
    windowTitle: 'WorkPulse — Desktop Workstation',
    activeSeconds: 0,
    category: 'PRODUCTIVE',
  };


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
  }

  public startShift(shiftId: string) {
    this.shiftId = shiftId;
    this.trackingActive = true;
    this.shiftState = 'WORKING';
    this.currentSegmentStart = new Date();
    this.segmentKeyCount = 0;
    this.segmentMouseCount = 0;
    
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

    // 3-second Active Foreground App Poller
    this.activeAppTimer = setInterval(() => {
      this.detectActiveApplication();
    }, 3000);
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
      if (process.platform === 'darwin') {
        const { stdout } = await execAsync(
          `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`
        );
        const appName = stdout.trim();
        if (appName && appName !== this.currentApp.name) {
          this.currentApp = {
            name: appName,
            processName: `${appName}.app`,
            windowTitle: `${appName} Active Session`,
            activeSeconds: 0,
            category: this.categorizeApp(appName),
          };
        }
      } else if (process.platform === 'win32') {
        const { stdout } = await execAsync(
          `powershell -NoProfile -Command "(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Sort-Object CPU -Descending | Select-Object -First 1).ProcessName"`
        );
        const procName = stdout.trim();
        if (procName && procName !== this.currentApp.name) {
          this.currentApp = {
            name: procName,
            processName: `${procName}.exe`,
            windowTitle: `${procName} Window`,
            activeSeconds: 0,
            category: this.categorizeApp(procName),
          };
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }

  private categorizeApp(name: string): 'PRODUCTIVE' | 'NEUTRAL' | 'UNPRODUCTIVE' {
    const lower = name.toLowerCase();
    const productiveApps = ['code', 'visual studio', 'cursor', 'terminal', 'chrome', 'figma', 'slack', 'teams', 'outlook', 'workpulse', 'notion', 'postman', 'dbeaver'];
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
