import { powerMonitor } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { MacInputCounter } from './mac-input-counter';
import { macForeground } from './mac-foreground';
import type { TrackerConfig, TrackerEvent, TrackerSegment, TrackerSource, TrackerStatus, TamperEvent } from './tracker-source';

const execAsync = promisify(exec);

/**
 * DEV MODE FALLBACK ONLY. Used when the C# agent pipe is not available (macOS/Linux development).
 * Production tracking is the agent (09). This source observes the foreground application name and
 * system idle time (powerMonitor.getSystemIdleTime, no hooks). On macOS keyCount and mouseCount come from the
 * system HID event counters (MacInputCounter, no hook); elsewhere they are 0. It never reads key values,
 * clipboard or screen content (AGENTS.md rule 8).
 */
export class DevTelemetrySource implements TrackerSource {
  private listeners: Array<(e: TrackerEvent) => void> = [];
  private queue: TrackerSegment[] = [];
  private tamper: TamperEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private shiftId: string | null = null;
  private paused = false;
  private config: TrackerConfig = { idleThresholdSeconds: 300, longIdleThresholdSeconds: 900, captureWindowTitles: false, exceptionApps: [], exclusions: [] };
  private current: { start: Date; kind: TrackerSegment['kind']; processName: string; appName: string; keyCount: number; mouseCount: number } | null = null;
  private readonly input = new MacInputCounter();
  private idleSince: Date | null = null;
  private currentApp: TrackerStatus['currentApp'] = null;
  private anchorOffsetMs = 0;

  async connect(): Promise<void> {
    this.emit({ type: 'connected' });
  }
  async setAnchor(serverTimeIso: string): Promise<void> {
    this.anchorOffsetMs = Date.parse(serverTimeIso) - Date.now();
  }
  async setConfig(config: TrackerConfig): Promise<void> {
    this.config = config;
  }

  async startTracking(shiftId: string): Promise<void> {
    this.shiftId = shiftId;
    this.paused = false;
    this.input.start();
    if (!this.timer) this.timer = setInterval(() => void this.tick(), 1000);
    this.emit({ type: 'stateChanged' });
  }
  async pauseTracking(): Promise<void> {
    this.closeSegment();
    this.paused = true;
    this.emit({ type: 'stateChanged' });
  }
  async resumeTracking(): Promise<void> {
    this.paused = false;
    this.emit({ type: 'stateChanged' });
  }
  async stopTracking(): Promise<void> {
    this.closeSegment();
    this.shiftId = null;
    this.input.stop();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.emit({ type: 'stateChanged' });
  }

  async pullSegments(max: number): Promise<TrackerSegment[]> {
    return this.queue.slice(0, max);
  }
  async ackSegments(ids: string[]): Promise<void> {
    const set = new Set(ids);
    this.queue = this.queue.filter((s) => !set.has(s.id));
  }
  async pullTamper(): Promise<TamperEvent[]> {
    return [...this.tamper];
  }
  async ackTamper(ids: string[]): Promise<void> {
    const set = new Set(ids);
    this.tamper = this.tamper.filter((t) => !set.has(t.id));
  }

  async status(): Promise<TrackerStatus> {
    return {
      source: 'dev',
      connected: true,
      agentVersion: null,
      tracking: Boolean(this.shiftId),
      paused: this.paused,
      queueSize: this.queue.length,
      queuePercent: Math.min(100, Math.round((this.queue.length / 5000) * 100)),
      extensionConnected: false,
      lastInputAgeSeconds: powerMonitor.getSystemIdleTime(),
      currentApp: this.currentApp,
    };
  }

  on(listener: (e: TrackerEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
  dispose(): void {
    this.input.stop();
    if (this.timer) clearInterval(this.timer);
  }

  private now(): Date {
    return new Date(Date.now() + this.anchorOffsetMs);
  }

  private async tick(): Promise<void> {
    // Drain every tick so input made while paused never lands in the next segment.
    const counts = this.input.drain();
    if (!this.shiftId || this.paused) return;
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const idle = idleSeconds >= this.config.idleThresholdSeconds;
    const app = await this.foregroundApp();
    this.currentApp = { processName: app.processName, appName: app.appName, domain: null };
    const kind: TrackerSegment['kind'] = idle ? 'idle' : 'active';

    if (idle && !this.idleSince) {
      // backdate the idle start to the last input (F5 rule 5)
      this.idleSince = new Date(this.now().getTime() - idleSeconds * 1000);
      this.closeSegment(this.idleSince);
    }
    if (!idle && this.idleSince) {
      const idleFor = Math.round((this.now().getTime() - this.idleSince.getTime()) / 1000);
      if (idleFor >= this.config.longIdleThresholdSeconds) {
        this.emit({ type: 'longIdleEnded', from: this.idleSince.toISOString(), to: this.now().toISOString(), seconds: idleFor });
      }
      this.closeSegment();
      this.idleSince = null;
    }

    let start = this.idleSince ?? this.now();
    if (this.current) {
      const changed = this.current.kind !== kind || this.current.processName !== app.processName;
      const tooLong = this.now().getTime() - this.current.start.getTime() >= 5 * 60_000;
      if (changed || tooLong) {
        this.closeSegment();
        start = this.now();
      }
    }
    if (!this.current) {
      this.current = { start, kind, processName: app.processName, appName: app.appName, keyCount: 0, mouseCount: 0 };
    }
    // Counts of this tick belong to the segment that is current after a switch (as in the agent, 09 section 3).
    this.current.keyCount += counts.keys;
    this.current.mouseCount += counts.mouse;
  }

  private closeSegment(endAt: Date = this.now()): void {
    if (!this.current || !this.shiftId) {
      this.current = null;
      return;
    }
    if (endAt.getTime() - this.current.start.getTime() >= 2000) {
      this.queue.push({
        id: randomUUID(),
        shiftId: this.shiftId,
        startedAt: this.current.start.toISOString(),
        endedAt: endAt.toISOString(),
        kind: this.current.kind,
        processName: this.current.processName,
        appName: this.current.appName,
        domain: null,
        windowTitle: null,
        keyCount: this.current.keyCount,
        mouseCount: this.current.mouseCount,
        exception: 'none',
        claim: 'none',
        clockSource: this.anchorOffsetMs === 0 ? 'unanchored' : 'anchored',
      });
    }
    this.current = null;
  }

  private async foregroundApp(): Promise<{ processName: string; appName: string }> {
    try {
      if (process.platform === 'darwin') {
        // Ask for the name shown in the Dock plus the bundle id and pid: Electron-based apps (Slack, VS Code,
        // Notion, ...) often report the process name "Electron", which says nothing about the app in front.
        const { stdout } = await execAsync(
          `osascript -e 'tell application "System Events" to set p to first application process whose frontmost is true' -e 'return (displayed name of p) & "|" & (unix id of p) & "|" & (bundle identifier of p)'`,
        );
        return macForeground(stdout, process.pid);
      }
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(
          `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\\"user32.dll\\")]public static extern IntPtr GetForegroundWindow();[DllImport(\\"user32.dll\\")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}';$p=0;[void][W]::GetWindowThreadProcessId([W]::GetForegroundWindow(),[ref]$p);(Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName"`,
        );
        const name = stdout.trim() || 'Unknown';
        return { processName: `${name}.exe`, appName: name };
      }
    } catch {
      /* fall through */
    }
    return { processName: 'unknown', appName: 'Unknown' };
  }

  private emit(e: TrackerEvent): void {
    this.listeners.forEach((l) => l(e));
  }
}
