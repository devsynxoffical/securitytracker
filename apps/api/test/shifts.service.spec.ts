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
