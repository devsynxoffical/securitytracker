import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrackingService } from '../src/tracking/tracking.service';
import { ClockService } from '../src/common/clock.service';
import { ProductivityCategory, SegmentKind } from '@company-os/contracts';

describe('TrackingService (Unit)', () => {
  let trackingService: TrackingService;
  let prismaMock: any;
  let clockService: ClockService;

  beforeEach(() => {
    clockService = new ClockService();
    prismaMock = {
      shift: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      productivityRule: {
        findMany: vi.fn(),
      },
      trackingExclusion: {
        findMany: vi.fn(),
      },
      activitySegment: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      activityDailyApp: {
        upsert: vi.fn(),
      },
      activityDailyDomain: {
        upsert: vi.fn(),
      },
      activityDailySummary: {
        upsert: vi.fn(),
      },
    };

    trackingService = new TrackingService(prismaMock, clockService);
  });

  it('should accept valid segments, evaluate productivity and update daily rollups', async () => {
    const shiftId = '00000000-0000-0000-0000-000000000001';
    const employeeId = 'emp-1';
    const deviceId = 'dev-1';
    const segId = '00000000-0000-0000-0000-000000000002';

    prismaMock.shift.findFirst.mockResolvedValue({
      id: shiftId,
      attendanceDate: new Date('2026-10-03T00:00:00.000Z'),
      employee: { companyId: 'comp-1', departmentId: 'dept-1' },
    });

    prismaMock.productivityRule.findMany.mockResolvedValue([
      {
        targetType: 'domain',
        pattern: 'github.com',
        category: ProductivityCategory.PRODUCTIVE,
      },
    ]);
    prismaMock.trackingExclusion.findMany.mockResolvedValue([]);
    prismaMock.activitySegment.findUnique.mockResolvedValue(null);
    prismaMock.activitySegment.create.mockResolvedValue({});
    prismaMock.shift.update.mockResolvedValue({});
    prismaMock.activityDailyApp.upsert.mockResolvedValue({});
    prismaMock.activityDailyDomain.upsert.mockResolvedValue({});
    prismaMock.activityDailySummary.upsert.mockResolvedValue({});

    const result = await trackingService.ingestSegments(employeeId, deviceId, {
      shiftId,
      segments: [
        {
          id: segId,
          startedAt: '2026-10-03T09:00:00.000Z',
          endedAt: '2026-10-03T09:05:00.000Z',
          kind: SegmentKind.ACTIVE,
          processName: 'chrome.exe',
          appName: 'Google Chrome',
          domain: 'github.com',
          keyCount: 45,
          mouseCount: 120,
          exception: 'none',
          claim: 'none',
          clockSource: 'anchored',
        },
      ],
    });

    expect(result.accepted).toContain(segId);
    expect(result.rejected).toHaveLength(0);
    expect(prismaMock.activitySegment.create).toHaveBeenCalled();
    expect(prismaMock.activityDailyDomain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          domain: 'github.com',
          category: ProductivityCategory.PRODUCTIVE,
          activeS: 300,
        }),
      }),
    );
  });

  it('should treat previously uploaded segment IDs as accepted without double insert', async () => {
    const shiftId = '00000000-0000-0000-0000-000000000001';
    const segId = '00000000-0000-0000-0000-000000000002';

    prismaMock.shift.findFirst.mockResolvedValue({
      id: shiftId,
      attendanceDate: new Date('2026-10-03T00:00:00.000Z'),
      employee: { companyId: 'comp-1' },
    });
    prismaMock.productivityRule.findMany.mockResolvedValue([]);
    prismaMock.trackingExclusion.findMany.mockResolvedValue([]);
    prismaMock.activitySegment.findUnique.mockResolvedValue({ id: segId }); // Already exists

    const result = await trackingService.ingestSegments('emp-1', 'dev-1', {
      shiftId,
      segments: [
        {
          id: segId,
          startedAt: '2026-10-03T09:00:00.000Z',
          endedAt: '2026-10-03T09:05:00.000Z',
          kind: SegmentKind.ACTIVE,
          processName: 'chrome.exe',
          appName: 'Google Chrome',
          domain: 'github.com',
          keyCount: 45,
          mouseCount: 120,
          exception: 'none',
          claim: 'none',
          clockSource: 'anchored',
        },
      ],
    });

    expect(result.accepted).toContain(segId);
    expect(prismaMock.activitySegment.create).not.toHaveBeenCalled();
  });
});
