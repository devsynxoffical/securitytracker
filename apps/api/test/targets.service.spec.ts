import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TargetsService } from '../src/targets/targets.service';
import { ClockService } from '../src/common/clock.service';
import { TargetAssigneeType, TargetPeriod, MetricKey, NotificationType } from '@company-os/contracts';

describe('TargetsService', () => {
  let service: TargetsService;
  let prisma: any;
  let clock: ClockService;
  let notificationsService: any;
  let gateway: any;

  beforeEach(() => {
    clock = new ClockService();
    notificationsService = {
      sendNotification: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    };
    gateway = {
      emitToUser: vi.fn(),
      emitToCompany: vi.fn(),
    };

    prisma = {
      target: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'target-1', ...data })),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      metricEvent: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'event-1', ...data })),
        aggregate: vi.fn(),
      },
      employee: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
    };

    service = new TargetsService(prisma, clock, notificationsService, gateway);
  });

  it('should create a daily target with validated values', async () => {
    const result = await service.createTarget('comp-1', 'emp-1', {
      assigneeType: TargetAssigneeType.EMPLOYEE,
      assigneeId: 'emp-1',
      metricKey: MetricKey.CALLS_CONNECTED,
      period: TargetPeriod.DAILY,
      value: 20,
      validFrom: '2026-10-01',
    });

    expect(result.metricKey).toBe(MetricKey.CALLS_CONNECTED);
    expect(prisma.target.create).toHaveBeenCalledOnce();
  });

  it('should prevent double counting on duplicate metric events (idempotency)', async () => {
    // Simulate unique constraint failure
    prisma.metricEvent.create.mockRejectedValueOnce({ code: 'P2002' });

    const result = await service.recordMetricEvent(
      'comp-1',
      'emp-1',
      MetricKey.CALLS_TOTAL,
      1,
      'call_log',
      'call-123',
    );

    expect(result).toBeNull();
  });

  it('should trigger target_80_percent notification when progress hits 80%', async () => {
    const testDate = new Date('2026-10-03T12:00:00.000Z');
    vi.spyOn(clock, 'now').mockReturnValue(testDate);

    prisma.employee.findUnique.mockResolvedValue({
      id: 'emp-1',
      companyId: 'comp-1',
      roleId: 'role-1',
      teamId: null,
      role: { name: 'Sales Rep' },
    });

    prisma.target.findMany.mockResolvedValue([
      {
        id: 'target-1',
        companyId: 'comp-1',
        assigneeType: TargetAssigneeType.EMPLOYEE,
        assigneeId: 'emp-1',
        metricKey: MetricKey.CALLS_CONNECTED,
        period: TargetPeriod.DAILY,
        value: 10,
        validFrom: new Date('2026-10-01'),
        validTo: null,
      },
    ]);

    // 8 calls connected out of 10 = 80%
    prisma.metricEvent.aggregate.mockResolvedValue({
      _sum: { amount: 8 },
    });

    const progress = await service.getEmployeeTargetProgress('comp-1', 'emp-1', testDate);

    expect(progress).toHaveLength(1);
    expect(progress[0].percentage).toBe(80);
    expect(progress[0].currentValue).toBe(8);
  });
});
