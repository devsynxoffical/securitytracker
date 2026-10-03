import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AttendanceService } from '../src/attendance/attendance.service';
import { ClockService } from '../src/common/clock.service';
import { AttendanceStatus } from '@company-os/contracts';

describe('AttendanceService (Unit)', () => {
  let attendanceService: AttendanceService;
  let prismaMock: any;
  let clockService: ClockService;

  beforeEach(() => {
    clockService = new ClockService();
    prismaMock = {
      shift: {
        findMany: vi.fn(),
      },
      holiday: {
        findFirst: vi.fn(),
      },
      leaveRequest: {
        findFirst: vi.fn(),
      },
      attendanceDay: {
        upsert: vi.fn((args) => args.create),
      },
    };

    attendanceService = new AttendanceService(prismaMock, clockService);
  });

  it('should mark status as HOLIDAY when date matches company holiday and no shift was worked', async () => {
    const testDate = new Date('2026-12-25T00:00:00.000Z');
    prismaMock.shift.findMany.mockResolvedValue([]);
    prismaMock.holiday.findFirst.mockResolvedValue({ id: 'h-1', name: 'Christmas Day' });
    prismaMock.leaveRequest.findFirst.mockResolvedValue(null);

    const result = await attendanceService.computeDailyAttendance('emp-1', testDate);

    expect(result.status).toBe(AttendanceStatus.HOLIDAY);
  });

  it('should mark status as PRESENT and flag break_exceeded if breaks exceed 60 minutes', async () => {
    const testDate = new Date('2026-10-03T00:00:00.000Z');
    prismaMock.shift.findMany.mockResolvedValue([
      {
        id: 's-1',
        startedAt: new Date('2026-10-03T09:00:00.000Z'),
        endedAt: new Date('2026-10-03T18:00:00.000Z'),
        durationSeconds: 32400,
        breakSeconds: 4000, // > 3600 (60 min)
        offlineSeconds: 0,
        activeSeconds: 28000,
        idleSeconds: 400,
      },
    ]);
    prismaMock.holiday.findFirst.mockResolvedValue(null);
    prismaMock.leaveRequest.findFirst.mockResolvedValue(null);

    const result = await attendanceService.computeDailyAttendance('emp-1', testDate);

    expect(result.status).toBe(AttendanceStatus.PRESENT);
    expect(result.flags).toContain('break_exceeded');
  });
});
