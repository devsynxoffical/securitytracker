import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LeadsService } from '../src/crm/leads.service';
import { CallsService } from '../src/crm/calls.service';
import { ClockService } from '../src/common/clock.service';
import { CallOutcome } from '@company-os/contracts';

describe('CRM & Calls Services (Unit)', () => {
  let leadsService: LeadsService;
  let callsService: CallsService;
  let prismaMock: any;
  let clockService: ClockService;

  beforeEach(() => {
    clockService = new ClockService();
    prismaMock = {
      lead: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      leadTimeline: {
        create: vi.fn(),
      },
      callLog: {
        create: vi.fn(),
      },
      metricEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn((cb) => (typeof cb === 'function' ? cb(prismaMock) : Promise.all(cb))),
    };

    const notifMock: any = {
      sendNotification: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    };
    const gatewayMock: any = {
      emitToUser: vi.fn(),
      emitToCompany: vi.fn(),
    };
    const targetsMock: any = {
      recordMetricEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
    };

    leadsService = new LeadsService(prismaMock, clockService, notifMock, gatewayMock, targetsMock);
    callsService = new CallsService(prismaMock, clockService);
  });

  it('should reject lead creation with duplicate phone when allowDuplicate is false', async () => {
    prismaMock.lead.findMany.mockResolvedValue([
      { id: 'lead-existing', name: 'Existing Lead', phones: [{ phoneE164: '1234567890' }] },
    ]);

    await expect(
      leadsService.createLead('comp-1', 'emp-1', {
        name: 'New Lead',
        pipelineId: '00000000-0000-0000-0000-000000000010',
        stageId: '00000000-0000-0000-0000-000000000011',
        phones: [{ phone: '123-456-7890' }],
      }),
    ).rejects.toThrow();
  });

  it('should create lead and append created timeline entry when valid', async () => {
    prismaMock.lead.findMany.mockResolvedValue([]);
    prismaMock.lead.create.mockResolvedValue({
      id: 'lead-new',
      name: 'Acme Corp Lead',
    });
    prismaMock.leadTimeline.create.mockResolvedValue({});

    const result = await leadsService.createLead('comp-1', 'emp-1', {
      name: 'Acme Corp Lead',
      pipelineId: '00000000-0000-0000-0000-000000000010',
      stageId: '00000000-0000-0000-0000-000000000011',
      phones: [{ phone: '9876543210' }],
    });

    expect(result.id).toBe('lead-new');
    expect(prismaMock.lead.create).toHaveBeenCalled();
    expect(prismaMock.leadTimeline.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadId: 'lead-new',
          type: 'created',
        }),
      }),
    );
  });

  it('should log a connected call, record calls_total and calls_connected metrics, and append to timeline', async () => {
    prismaMock.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      companyId: 'comp-1',
      ownerId: 'emp-1',
      doNotCall: false,
    });
    prismaMock.callLog.create.mockResolvedValue({ id: 'call-1' });
    prismaMock.lead.update.mockResolvedValue({});
    prismaMock.leadTimeline.create.mockResolvedValue({});
    prismaMock.metricEvent.create.mockResolvedValue({});

    const result = await callsService.logCall(
      'emp-1',
      'comp-1',
      {
        leadId: 'lead-1',
        direction: 'outbound',
        outcome: CallOutcome.CONNECTED,
        durationSeconds: 180,
        notes: 'Great conversation, demo booked.',
      },
      {
        scope: 'own',
        companyId: 'comp-1',
        employeeId: 'emp-1',
        allowedEmployeeIds: ['emp-1'],
      },
    );

    expect(result.id).toBe('call-1');
    expect(prismaMock.callLog.create).toHaveBeenCalled();
    expect(prismaMock.metricEvent.create).toHaveBeenCalledTimes(2); // total + connected
    expect(prismaMock.leadTimeline.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'call',
        }),
      }),
    );
  });

  it('should set doNotCall flag on lead when outcome is Do not call', async () => {
    prismaMock.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      companyId: 'comp-1',
      ownerId: 'emp-1',
      doNotCall: false,
    });
    prismaMock.callLog.create.mockResolvedValue({ id: 'call-2' });
    prismaMock.lead.update.mockResolvedValue({});
    prismaMock.leadTimeline.create.mockResolvedValue({});
    prismaMock.metricEvent.create.mockResolvedValue({});

    await callsService.logCall(
      'emp-1',
      'comp-1',
      {
        leadId: 'lead-1',
        direction: 'outbound',
        outcome: CallOutcome.DO_NOT_CALL,
        durationSeconds: 30,
      },
      {
        scope: 'own',
        companyId: 'comp-1',
        employeeId: 'emp-1',
        allowedEmployeeIds: ['emp-1'],
      },
    );

    expect(prismaMock.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          doNotCall: true,
        }),
      }),
    );
  });
});
