/**
 * Server-anchored clock (03 F5 rule 11, F7 rule 1; NFR-08).
 * Wall-clock offset is measured from X-Server-Time on every response. Durations use a
 * monotonic source so a changed Windows clock cannot corrupt them.
 */
export class AnchoredClock {
  private offsetMs = 0;
  private anchored = false;
  private lastWallMs = Date.now();
  private lastMonoNs = process.hrtime.bigint();
  private jumpListeners: Array<(jumpMs: number) => void> = [];

  /** Call with the X-Server-Time header value. */
  anchor(serverIso: string): void {
    const server = Date.parse(serverIso);
    if (Number.isNaN(server)) return;
    this.offsetMs = server - Date.now();
    this.anchored = true;
  }

  isAnchored(): boolean {
    return this.anchored;
  }

  /** Best estimate of server time right now. */
  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  nowIso(): string {
    return this.now().toISOString();
  }

  /** Monotonic milliseconds since process start. */
  monotonicMs(): number {
    return Number(process.hrtime.bigint() / 1_000_000n);
  }

  onClockJump(fn: (jumpMs: number) => void): void {
    this.jumpListeners.push(fn);
  }

  /**
   * Detects wall-clock changes (F5 rule 12: a jump above 2 minutes is reported as clock_changed).
   * Called once per second by the shift manager.
   */
  tick(): void {
    const wall = Date.now();
    const mono = process.hrtime.bigint();
    const wallDelta = wall - this.lastWallMs;
    const monoDelta = Number((mono - this.lastMonoNs) / 1_000_000n);
    const jump = wallDelta - monoDelta;
    if (Math.abs(jump) > 120_000) {
      // keep server time estimate stable across the jump
      this.offsetMs -= jump;
      this.jumpListeners.forEach((l) => l(jump));
    }
    this.lastWallMs = wall;
    this.lastMonoNs = mono;
  }
}
