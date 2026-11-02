import { Injectable, Logger } from '@nestjs/common';
import { ClockService } from '../common/clock.service.js';
import { RedisService } from '../common/redis.service.js';

/**
 * FR-MAIL-19 collision warning. Heartbeats every 20 s mark an employee as viewing a conversation;
 * viewers of the last 60 s are returned to everybody else. Redis when it is connected (multi
 * instance), otherwise an in-process map, which is enough for a single API node.
 */
export interface Viewer {
  employeeId: string;
  name: string;
  at: string;
}

export const PRESENCE_TTL_MS = 60_000;

/** Pure: viewers seen within the TTL, excluding the caller, newest first. */
export function activeViewers(entries: Viewer[], now: Date, excludeEmployeeId: string | null, ttlMs = PRESENCE_TTL_MS): Viewer[] {
  const cutoff = now.getTime() - ttlMs;
  return entries
    .filter((v) => v.employeeId !== excludeEmployeeId && new Date(v.at).getTime() >= cutoff)
    .sort((a, b) => b.at.localeCompare(a.at));
}

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly memory = new Map<string, Map<string, Viewer>>();

  constructor(
    private readonly clock: ClockService,
    private readonly redis: RedisService,
  ) {}

  async heartbeat(threadId: string, viewer: { employeeId: string; name: string }, action: 'viewing' | 'left'): Promise<Viewer[]> {
    const now = this.clock.now();
    if (action === 'left') await this.remove(threadId, viewer.employeeId);
    else await this.put(threadId, { employeeId: viewer.employeeId, name: viewer.name, at: now.toISOString() });
    return this.viewers(threadId, viewer.employeeId);
  }

  async viewers(threadId: string, excludeEmployeeId: string | null): Promise<Viewer[]> {
    const entries = await this.all(threadId);
    const active = activeViewers(entries, this.clock.now(), excludeEmployeeId);
    this.prune(threadId, entries);
    return active;
  }

  // ---- storage ---------------------------------------------------------------

  private useRedis(): boolean {
    try {
      return this.redis.getClient().status === 'ready';
    } catch {
      return false;
    }
  }

  private key(threadId: string) {
    return `mail:presence:${threadId}`;
  }

  private async put(threadId: string, v: Viewer) {
    if (this.useRedis()) {
      try {
        const c = this.redis.getClient();
        await c.hset(this.key(threadId), v.employeeId, JSON.stringify(v));
        await c.pexpire(this.key(threadId), PRESENCE_TTL_MS * 2);
        return;
      } catch (e) {
        this.logger.warn(`presence redis write failed: ${(e as Error).message}`);
      }
    }
    const map = this.memory.get(threadId) ?? new Map<string, Viewer>();
    map.set(v.employeeId, v);
    this.memory.set(threadId, map);
  }

  private async remove(threadId: string, employeeId: string) {
    if (this.useRedis()) {
      try {
        await this.redis.getClient().hdel(this.key(threadId), employeeId);
      } catch (e) {
        this.logger.warn(`presence redis delete failed: ${(e as Error).message}`);
      }
    }
    this.memory.get(threadId)?.delete(employeeId);
  }

  private async all(threadId: string): Promise<Viewer[]> {
    if (this.useRedis()) {
      try {
        const raw = await this.redis.getClient().hgetall(this.key(threadId));
        return Object.values(raw).map((s) => JSON.parse(s) as Viewer);
      } catch (e) {
        this.logger.warn(`presence redis read failed: ${(e as Error).message}`);
      }
    }
    return Array.from(this.memory.get(threadId)?.values() ?? []);
  }

  private prune(threadId: string, entries: Viewer[]) {
    const map = this.memory.get(threadId);
    if (!map) return;
    const cutoff = this.clock.now().getTime() - PRESENCE_TTL_MS;
    for (const v of entries) if (new Date(v.at).getTime() < cutoff) map.delete(v.employeeId);
    if (map.size === 0) this.memory.delete(threadId);
  }
}
