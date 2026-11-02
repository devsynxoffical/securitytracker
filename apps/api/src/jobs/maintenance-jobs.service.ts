import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TargetPeriod } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { JobRegistry, JobResult } from './job-registry';
import { periodEndedYesterday, retentionCutoff, retentionDaysFrom } from './jobs.util';

/** retention-purge (06 section 8), partition-maintenance and target-progress rollover (F13). */
@Injectable()
export class MaintenanceJobsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('retention-purge', '45 2 * * *', 'Deletes raw segments, notifications and login events past retention', () => this.retentionPurge());
    this.registry.register('partition-maintenance', '0 4 1 * *', 'Monthly partition housekeeping (no-op: activity_segments is not partitioned in Prisma)', () => this.partitionMaintenance());
    this.registry.register('target-progress', '5 0 * * *', 'Period rollover check for targets whose daily, weekly or monthly period ended', () => this.targetRollover());
  }

  @Cron('45 2 * * *', { timeZone: 'UTC' })
  scheduledPurge() {
    return this.registry.scheduled('retention-purge');
  }

  @Cron('0 4 1 * *', { timeZone: 'UTC' })
  scheduledPartition() {
    return this.registry.scheduled('partition-maintenance');
  }

  @Cron('5 0 * * *', { timeZone: 'UTC' })
  scheduledTargets() {
    return this.registry.scheduled('target-progress');
  }

  /** Retention per company from settings (activitySegmentRetentionDays, default 90); 90 d notifications, 1 y login events. */
  async retentionPurge(): Promise<JobResult> {
    const now = this.clock.now();
    const companies = await this.prisma.company.findMany({ select: { id: true, settings: true } });
    let segments = 0;
    for (const c of companies) {
      const days = retentionDaysFrom(c.settings, 'activitySegmentRetentionDays', 90);
      const employees = await this.prisma.employee.findMany({ where: { companyId: c.id }, select: { id: true } });
      const r = await this.prisma.activitySegment.deleteMany({ where: { employeeId: { in: employees.map((e) => e.id) }, startedAt: { lt: retentionCutoff(now, days) } } });
      segments += r.count;
    }
    const notifications = await this.prisma.notification.deleteMany({ where: { createdAt: { lt: retentionCutoff(now, 90) } } });
    const loginEvents = await this.prisma.loginEvent.deleteMany({ where: { createdAt: { lt: retentionCutoff(now, 365) } } });
    return { segments, notifications: notifications.count, loginEvents: loginEvents.count };
  }

  /**
   * 06 section 3 describes range partitioning by month. The Prisma schema maps activity_segments as a
   * plain table, so there is nothing to create or drop; retention-purge covers expiry.
   */
  async partitionMaintenance(): Promise<JobResult> {
    const count = await this.prisma.activitySegment.count();
    return { partitioned: false, segments: count };
  }

  /**
   * F13 period end. There is no target_progress table in the schema, so no snapshot row is written;
   * the job counts the targets whose period rolled over so the gap is visible on /jobs/status.
   */
  async targetRollover(): Promise<JobResult> {
    const now = this.clock.now();
    const targets = await this.prisma.target.findMany({ select: { period: true, validTo: true, validFrom: true } });
    const active = targets.filter((t) => (!t.validTo || t.validTo >= now) && t.validFrom <= now);
    const rolled = active.filter((t) => periodEndedYesterday(t.period as (typeof TargetPeriod)[keyof typeof TargetPeriod], now)).length;
    return { activeTargets: active.length, periodsEnded: rolled, snapshotsWritten: 0, snapshotTableExists: false };
  }
}
