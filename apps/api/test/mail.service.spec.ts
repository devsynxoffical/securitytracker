import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MailService } from '../src/mail/mail.service';
import { ClockService } from '../src/common/clock.service';
import { ConfigService } from '@nestjs/config';
import { MailboxPermission, MetricKey } from '@company-os/contracts';

describe('MailService (Unit)', () => {
  let mailService: MailService;
  let prismaMock: any;
  let clockService: ClockService;
  let configService: ConfigService;
  let redisService: any;
  let gatewayMock: any;
  let targetsMock: any;

  beforeEach(() => {
    clockService = new ClockService();
    configService = new ConfigService({
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    redisService = {
      get: vi.fn(),
      set: vi.fn(),
    };
    gatewayMock = {
      emitToUser: vi.fn(),
    };
    targetsMock = {
      recordMetricEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
    };

    prismaMock = {
      mailbox: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
      mailboxAssignment: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
      mailThread: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      mailMessage: {
        create: vi.fn(),
      },
      mailAudit: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
      lead: {
        findMany: vi.fn(),
      },
      leadTimeline: {
        create: vi.fn(),
      },
    };

    mailService = new MailService(
      prismaMock,
      clockService,
      configService,
      redisService,
      gatewayMock,
      targetsMock,
    );
  });

  it('should throw ForbiddenException if employee lacks required mailbox permission', async () => {
    prismaMock.mailboxAssignment.findUnique.mockResolvedValue({
      permissions: [MailboxPermission.READ], // Only READ, no SEND
    });

    await expect(
      mailService.verifyPermission('mb-1', 'emp-1', MailboxPermission.SEND),
    ).rejects.toThrow('Missing required mailbox permission: send');
  });

  it('should send email, write audit log, link to lead timeline, and emit emails_sent metric', async () => {
    prismaMock.mailboxAssignment.findUnique.mockResolvedValue({
      permissions: [MailboxPermission.READ, MailboxPermission.SEND],
    });
    prismaMock.mailbox.findUnique.mockResolvedValue({
      id: 'mb-1',
      address: 'sales@company.com',
    });
    prismaMock.mailThread.upsert.mockResolvedValue({
      id: 'thread-1',
      gmailThreadId: 'th-1',
    });
    prismaMock.mailMessage.create.mockResolvedValue({
      id: 'msg-1',
      threadId: 'thread-1',
    });
    prismaMock.mailAudit.create.mockResolvedValue({ id: 'audit-1' });
    prismaMock.lead.findMany.mockResolvedValue([
      { id: 'lead-1', name: 'Prospect Lead' },
    ]);
    prismaMock.leadTimeline.create.mockResolvedValue({});

    const result = await mailService.sendMail(
      'mb-1',
      'emp-1',
      'comp-1',
      {
        to: ['client@prospect.com'],
        subject: 'Contract Proposal',
        html: '<p>Please find proposal attached.</p>',
      },
      '192.168.1.1',
    );

    expect(result.id).toBe('msg-1');
    expect(prismaMock.mailAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mailboxId: 'mb-1',
          employeeId: 'emp-1',
          action: 'send',
          subject: 'Contract Proposal',
        }),
      }),
    );
    expect(prismaMock.leadTimeline.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadId: 'lead-1',
          type: 'email',
        }),
      }),
    );
    expect(targetsMock.recordMetricEvent).toHaveBeenCalledWith(
      'comp-1',
      'emp-1',
      MetricKey.EMAILS_SENT,
      1,
      'mail_message',
      'msg-1',
      expect.any(Date),
    );
  });
});
