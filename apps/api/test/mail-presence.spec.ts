import { describe, it, expect, vi } from 'vitest';
import { ClockService } from '../src/common/clock.service';
import { PresenceService, activeViewers } from '../src/mail/presence.service';

const at = (iso: string) => iso;

describe('presence (FR-MAIL-19)', () => {
  it('activeViewers drops stale entries and the caller, newest first', () => {
    const now = new Date('2026-11-02T10:01:00.000Z');
    const entries = [
      { employeeId: 'me', name: 'Me', at: at('2026-11-02T10:00:59.000Z') },
      { employeeId: 'a', name: 'Ann', at: at('2026-11-02T10:00:10.000Z') },
      { employeeId: 'b', name: 'Bob', at: at('2026-11-02T09:59:59.000Z') },
      { employeeId: 'c', name: 'Cy', at: at('2026-11-02T10:00:30.000Z') },
    ];
    expect(activeViewers(entries, now, 'me').map((v) => v.employeeId)).toEqual(['c', 'a']);
  });

  it('heartbeats expire after 60 s and "left" removes immediately (in-memory store)', async () => {
    const clock = new ClockService();
    clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));
    const redis: any = { getClient: () => ({ status: 'wait' }) };
    const svc = new PresenceService(clock, redis);

    expect(await svc.heartbeat('t1', { employeeId: 'a', name: 'Ann' }, 'viewing')).toEqual([]);
    const seenByBob = await svc.heartbeat('t1', { employeeId: 'b', name: 'Bob' }, 'viewing');
    expect(seenByBob).toEqual([{ employeeId: 'a', name: 'Ann', at: '2026-11-02T10:00:00.000Z' }]);
    expect(await svc.viewers('t1', 'a')).toMatchObject([{ employeeId: 'b' }]);
    expect(await svc.viewers('t2', 'a')).toEqual([]);

    clock.setMockTime(new Date('2026-11-02T10:00:59.000Z'));
    expect(await svc.viewers('t1', 'c')).toHaveLength(2);
    clock.setMockTime(new Date('2026-11-02T10:01:01.000Z'));
    expect(await svc.viewers('t1', 'c')).toEqual([]);

    await svc.heartbeat('t1', { employeeId: 'a', name: 'Ann' }, 'viewing');
    expect(await svc.viewers('t1', 'b')).toHaveLength(1);
    await svc.heartbeat('t1', { employeeId: 'a', name: 'Ann' }, 'left');
    expect(await svc.viewers('t1', 'b')).toEqual([]);
  });

  it('uses redis hashes when the client is ready', async () => {
    const clock = new ClockService();
    clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));
    const store: Record<string, string> = {};
    const client = {
      status: 'ready',
      hset: vi.fn(async (_k: string, f: string, v: string) => void (store[f] = v)),
      pexpire: vi.fn(async () => 1),
      hdel: vi.fn(async (_k: string, f: string) => void delete store[f]),
      hgetall: vi.fn(async () => ({ ...store })),
    };
    const svc = new PresenceService(clock, { getClient: () => client } as any);
    await svc.heartbeat('t1', { employeeId: 'a', name: 'Ann' }, 'viewing');
    expect(client.hset).toHaveBeenCalledWith('mail:presence:t1', 'a', expect.any(String));
    expect(await svc.viewers('t1', 'b')).toMatchObject([{ employeeId: 'a' }]);
    await svc.heartbeat('t1', { employeeId: 'a', name: 'Ann' }, 'left');
    expect(client.hdel).toHaveBeenCalled();
    expect(await svc.viewers('t1', 'b')).toEqual([]);
  });
});
