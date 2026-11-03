import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShiftsService } from '../src/shifts/shifts.service';
import { ClockService } from '../src/common/clock.service';
import { ShiftEventType, ShiftState, ErrorCodes } from '@company-os/contracts';

describe('ShiftsService (Unit)', () => {
  let shiftsService: ShiftsService;
  let prismaMock: any;
  let clockService: ClockService;

  beforeEach(() => {
    clockService = new ClockService();
    prismaMock = {
      shift: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      shiftEvent: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      shiftBreak: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      employeeSchedule: {
        findFirst: vi.fn(),
      },
      company: {
        findUnique: vi.fn().mockResolvedValue({ timezone: 'UTC', settings: {} }),
      },
      $transaction: vi.fn((cb) => (typeof cb === 'function' ? cb(prismaMock) : Promise.all(cb))),
    };

    shiftsService = new ShiftsService(prismaMock, clockService);
  });

  it('should successfully start a shift when none is open', async () => {
    prismaMock.shiftEvent.findUnique.mockResolvedValue(null);
    prismaMock.shift.findFirst.mockResolvedValue(null);
    prismaMock.employeeSchedule.findFirst.mockResolvedValue(null);

    const createdShift = {
      id: 'shift-1',
      employeeId: 'emp-1',
      deviceId: 'dev-1',
      state: ShiftState.WORKING,
      attendanceDate: new Date('2026-10-03T00:00:00.000Z'),
      startedAt: new Date('2026-10-03T09:00:00.000Z'),
      breaks: [],
    };
    prismaMock.shift.create.mockResolvedValue(createdShift);
    prismaMock.shiftEvent.create.mockResolvedValue({});
    // No open shift before the start; afterwards the current shift is the created one.
    prismaMock.shift.findFirst.mockResolvedValueOnce(null).mockResolvedValue(createdShift);

    const result = await shiftsService.processEvents(
      'emp-1',
      'dev-1',
      'comp-1',
      {
        events: [
          {
            clientEventId: '00000000-0000-0000-0000-000000000001',
            type: ShiftEventType.START,
            occurredAt: '2026-10-03T09:00:00.000Z',
          },
        ],
      },
    );

    expect(result.success).toBe(true);
    expect(result.processedEventsCount).toBe(1);
    expect(prismaMock.shift.create).toHaveBeenCalled();
    // The desktop swaps its provisional id for this one; without it every heartbeat looked like a closed shift.
    expect((result as { shiftId?: string | null }).shiftId).toBe(createdShift.id);
  });

  it('should throw ConflictException if shift is open on another device', async () => {
    prismaMock.shiftEvent.findUnique.mockResolvedValue(null);
    prismaMock.shift.findFirst.mockResolvedValue({
      id: 'shift-open',
      deviceId: 'dev-other',
      state: ShiftState.WORKING,
      device: { name: 'Office-PC-014' },
    });

    await expect(
      shiftsService.processEvents(
        'emp-1',
        'dev-my-pc',
        'comp-1',
        {
          events: [
            {
              clientEventId: '00000000-0000-0000-0000-000000000002',
              type: ShiftEventType.START,
              occurredAt: '2026-10-03T09:00:00.000Z',
            },
          ],
        },
      ),
    ).rejects.toThrow();
  });
});

describe('ShiftsService: schedule-aware start, heartbeat commands, events on a closed shift', () => {
  const SCHEDULE = { id: 'sch', workdays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', graceMinutes: 10, halfDayPercent: 50 };
  const EVT = (n: number) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
  let svc: ShiftsService;
  let prisma: any;
  let clock: ClockService;

  beforeEach(() => {
    clock = new ClockService();
    clock.setMockTime(new Date('2026-11-02T05:00:00.000Z'));
    prisma = {
      shift: { findFirst: vi.fn(), create: vi.fn(async ({ data }: any) => ({ id: 'shift-new', ...data, breaks: [] })), update: vi.fn(), updateMany: vi.fn() },
      shiftEvent: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      shiftBreak: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() },
      employeeSchedule: { findFirst: vi.fn().mockResolvedValue({ id: 'as', schedule: SCHEDULE }) },
      company: { findUnique: vi.fn().mockResolvedValue({ timezone: 'Asia/Karachi', settings: { minShiftMinutes: 5 } }) },
      $transaction: vi.fn((cb: any) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb))),
    };
    svc = new ShiftsService(prisma, clock);
  });

  const start = (occurredAt: string) => svc.processEvents('emp-1', 'dev-1', 'comp-1', { events: [{ clientEventId: EVT(1), type: ShiftEventType.START, occurredAt }] });

  it('binds the attendance date through the schedule and flags early_start', async () => {
    prisma.shift.findFirst.mockResolvedValue(null);
    const res = await start('2026-11-02T02:30:00.000Z'); // 07:30 local, 90 min early
    const data = prisma.shift.create.mock.calls[0][0].data;
    expect(data.attendanceDate.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(data.flags).toEqual(['early_start']);
    expect(res.acknowledgedEventIds).toEqual([EVT(1)]);
    expect(res.closedShift).toBeNull();
  });

  it('flags unscheduled and outside_schedule on a non-workday, unscheduled without a schedule', async () => {
    prisma.shift.findFirst.mockResolvedValue(null);
    await start('2026-11-07T05:00:00.000Z'); // Saturday
    expect(prisma.shift.create.mock.calls[0][0].data.flags).toEqual(['unscheduled', 'outside_schedule']);
    prisma.employeeSchedule.findFirst.mockResolvedValue(null);
    await start('2026-11-02T05:00:00.000Z');
    expect(prisma.shift.create.mock.calls[1][0].data.flags).toEqual(['unscheduled']);
  });

  it('flags short_shift on end when the duration is under minShiftMinutes', async () => {
    const open = { id: 'shift-1', employeeId: 'emp-1', deviceId: 'dev-1', state: ShiftState.WORKING, startedAt: new Date('2026-11-02T04:00:00.000Z'), flags: [] };
    prisma.shift.findFirst.mockResolvedValueOnce(open).mockResolvedValue(null);
    await svc.processEvents('emp-1', 'dev-1', 'comp-1', { events: [{ clientEventId: EVT(2), type: ShiftEventType.END, occurredAt: '2026-11-02T04:02:00.000Z' }] });
    const data = prisma.shift.update.mock.calls[0][0].data;
    expect(data.flags).toEqual(['short_shift']);
    expect(data.endReason).toBe('manual');
  });

  it('acknowledges break/end events for a closed shift and reports closedShift', async () => {
    const closed = { id: 'shift-old', employeeId: 'emp-1', deviceId: 'dev-1', state: ShiftState.ENDED, endedAt: new Date('2026-11-02T03:00:00.000Z'), endReason: 'auto_closed', flags: ['auto_closed', 'no_heartbeat'] };
    prisma.shift.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(closed).mockResolvedValue(null);
    const res = await svc.processEvents('emp-1', 'dev-1', 'comp-1', { events: [{ clientEventId: EVT(3), type: ShiftEventType.END, occurredAt: '2026-11-02T04:30:00.000Z' }] });
    expect(res.acknowledgedEventIds).toEqual([EVT(3)]);
    expect(res.closedShift).toEqual({ id: 'shift-old', endedAt: '2026-11-02T03:00:00.000Z', reason: 'auto_closed_no_heartbeat' });
    expect(res.currentShift).toBeNull();
    expect(prisma.shiftEvent.create).not.toHaveBeenCalled();
  });

  it('acknowledges duplicate events without creating anything', async () => {
    prisma.shiftEvent.findUnique.mockResolvedValue({ id: 'seen' });
    prisma.shift.findFirst.mockResolvedValue(null);
    const res = await svc.processEvents('emp-1', 'dev-1', 'comp-1', { events: [{ clientEventId: EVT(4), type: ShiftEventType.START, occurredAt: '2026-11-02T04:00:00.000Z' }] });
    expect(res.acknowledgedEventIds).toEqual([EVT(4)]);
    expect(prisma.shift.create).not.toHaveBeenCalled();
  });

  describe('heartbeat', () => {
    const hb = (shiftId: string, deviceId = 'dev-1') => svc.heartbeat('emp-1', deviceId, { state: ShiftState.WORKING, clientClock: '2026-11-02T05:00:00.000Z', queueSize: 0, shiftId });
    const SHIFT = '10000000-0000-0000-0000-000000000001';
    const ended = (extra: Record<string, unknown>) => ({ id: SHIFT, employeeId: 'emp-1', deviceId: 'dev-1', state: ShiftState.ENDED, endedAt: new Date('2026-11-02T04:00:00.000Z'), endReason: 'manual', flags: [], ...extra });

    it('open shift: touches lastHeartbeatAt and returns no commands', async () => {
      prisma.shift.findFirst.mockResolvedValue({ ...ended({}), state: ShiftState.WORKING, endedAt: null });
      const res = await hb(SHIFT);
      expect(res.commands).toEqual([]);
      expect(res.serverTime).toBe('2026-11-02T05:00:00.000Z');
      expect(res.configVersion).toBe(1);
      expect(prisma.shift.update).toHaveBeenCalled();
    });

    it('auto-closed shifts report the auto-close reason', async () => {
      prisma.shift.findFirst.mockResolvedValue(ended({ endReason: 'auto_closed', flags: ['auto_closed', 'no_heartbeat'] }));
      expect((await hb(SHIFT)).commands).toEqual([{ type: 'shift_closed', shiftId: SHIFT, endedAt: '2026-11-02T04:00:00.000Z', reason: 'auto_closed_no_heartbeat' }]);
      prisma.shift.findFirst.mockResolvedValue(ended({ endReason: 'auto_closed', flags: ['auto_closed', 'max_length'] }));
      expect((await hb(SHIFT)).commands[0]!.reason).toBe('auto_closed_max_length');
    });

    it('ended by an admin or from another device is ended_elsewhere, same device is ended', async () => {
      prisma.shift.findFirst.mockResolvedValue(ended({ endReason: 'admin' }));
      expect((await hb(SHIFT)).commands[0]!.reason).toBe('ended_elsewhere');
      prisma.shift.findFirst.mockResolvedValue(ended({ deviceId: 'dev-other' }));
      expect((await hb(SHIFT)).commands[0]!.reason).toBe('ended_elsewhere');
      prisma.shift.findFirst.mockResolvedValue(ended({}));
      expect((await hb(SHIFT)).commands[0]!.reason).toBe('ended');
    });

    it('unknown shift id: shift_closed with reason ended and no endedAt', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);
      const res = await hb(SHIFT);
      expect(res.commands).toEqual([{ type: 'shift_closed', shiftId: SHIFT, endedAt: null, reason: 'ended' }]);
      expect(prisma.shift.update).not.toHaveBeenCalled();
    });
  });
});
