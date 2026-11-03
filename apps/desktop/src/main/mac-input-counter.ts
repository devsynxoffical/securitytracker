import { spawn, type ChildProcess } from 'child_process';

/**
 * macOS keyboard and mouse COUNTS without a hook (AGENTS.md rule 8, 09 section 2 "counter increments only").
 * It reads the system-wide HID event counters through CGEventSourceCounterForEventType, the macOS
 * equivalent of the Windows Raw Input header count: the OS keeps a running total per event type and we
 * only read those totals. No event tap, no key codes, no Input Monitoring permission.
 *
 * One long-lived osascript (JXA) process prints "keys|mouse" totals every second on stderr.
 */
const KEY_DOWN = 10;
// left/right/other down, moved, left/right/other dragged, scroll wheel: what Windows Raw Input counts as mouse.
const MOUSE_EVENTS = [1, 3, 25, 5, 6, 7, 27, 22];
const HID_SYSTEM_STATE = 1;

const SCRIPT = `ObjC.import('CoreGraphics');
function c(t){ return $.CGEventSourceCounterForEventType(${HID_SYSTEM_STATE}, t); }
function run(){ while (true) { var m = 0; [${MOUSE_EVENTS.join(',')}].forEach(function(t){ m += c(t); }); console.log(c(${KEY_DOWN}) + '|' + m); delay(1); } }`;

export class MacInputCounter {
  private child: ChildProcess | null = null;
  private last: { keys: number; mouse: number } | null = null;
  private pending = { keys: 0, mouse: 0 };
  private buffer = '';

  start(): void {
    if (this.child || process.platform !== 'darwin') return;
    const child = spawn('osascript', ['-l', 'JavaScript', '-e', SCRIPT], { stdio: ['ignore', 'ignore', 'pipe'] });
    this.child = child;
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      this.buffer += chunk;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) this.onTotals(parseTotals(line));
    });
    child.on('exit', () => {
      if (this.child === child) this.child = null;
      this.last = null;
    });
    child.on('error', () => {
      if (this.child === child) this.child = null;
    });
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
    this.last = null;
    this.pending = { keys: 0, mouse: 0 };
  }

  /** Counts since the previous drain, then resets (same contract as the agent's DrainInputCounts). */
  drain(): { keys: number; mouse: number } {
    const out = this.pending;
    this.pending = { keys: 0, mouse: 0 };
    return out;
  }

  private onTotals(totals: { keys: number; mouse: number } | null): void {
    if (!totals) return;
    const d = countDelta(this.last, totals);
    this.pending.keys += d.keys;
    this.pending.mouse += d.mouse;
    this.last = totals;
  }
}

/** Parses one "keys|mouse" line of running totals; null for anything else. */
export function parseTotals(line: string): { keys: number; mouse: number } | null {
  const m = /^\s*(\d+)\|(\d+)\s*$/.exec(line);
  return m ? { keys: Number(m[1]), mouse: Number(m[2]) } : null;
}

/** Increase between two total readings. The first reading is the baseline; a counter reset counts as zero. */
export function countDelta(prev: { keys: number; mouse: number } | null, next: { keys: number; mouse: number }): { keys: number; mouse: number } {
  if (!prev) return { keys: 0, mouse: 0 };
  return { keys: Math.max(0, next.keys - prev.keys), mouse: Math.max(0, next.mouse - prev.mouse) };
}
