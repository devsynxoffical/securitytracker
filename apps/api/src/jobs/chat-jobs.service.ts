import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { CHAT_RETENTION_DAYS_DEFAULT } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { JobRegistry, JobResult } from './job-registry';
import { retentionCutoff, retentionDaysFrom } from './jobs.util';

export const CHAT_RETENTION_SETTING = 'chatRetentionDays';

/**
 * chat-retention (22 section 4): deletes chat messages older than `chatRetentionDays` per company
 * (default 365, read from company.settings) and writes one audit entry per company with the count.
 */
@Injectable()
export class ChatJobsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('chat-retention', '20 3 * * *', 'Purges chat messages older than chatRetentionDays per company (default 365), audited with counts', () => this.purge());
  }

  @Cron('20 3 * * *', { timeZone: 'UTC' })
  scheduled() {
    return this.registry.scheduled('chat-retention');
  }

  async purge(): Promise<JobResult> {
    const now = this.clock.now();
    const companies = await this.prisma.company.findMany({ select: { id: true, settings: true } });
    let deleted = 0;
    for (const c of companies) {
      const days = retentionDaysFrom(c.settings, CHAT_RETENTION_SETTING, CHAT_RETENTION_DAYS_DEFAULT);
      const cutoff = retentionCutoff(now, days);
      const r = await this.prisma.chatMessage.deleteMany({ where: { channel: { companyId: c.id }, createdAt: { lt: cutoff } } });
      deleted += r.count;
      if (r.count > 0) {
        await this.prisma.auditLog.create({
          data: {
            companyId: c.id,
            actorId: null,
            actorRole: 'system',
            action: 'chat.retention.purge',
            entityType: 'chat_messages',
            entityId: null,
            before: Prisma.JsonNull,
            after: { deleted: r.count, retentionDays: days, cutoff: cutoff.toISOString() },
            ip: 'server',
            client: 'job',
            occurredAt: now,
          },
        });
      }
    }
    return { companies: companies.length, deleted };
  }
}
