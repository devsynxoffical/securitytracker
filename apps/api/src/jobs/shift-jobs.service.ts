import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType, ShiftEndReason, ShiftState } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobRegistry, JobResult } from './job-registry';
import { autoCloseEndTime, autoCloseRulesFrom, shouldAutoClose } from './jobs.util';

/**
 * shift-heartbeat-check (02 section 6, F5 rule 4). Offline gaps (rule 3) are a display state derived
 * from lastHeartbeatAt by the live board and need no persistence here.
 */
@Injectable()
export class ShiftJobsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
    private registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('shift-heartbeat-check', '* * * * *', 'Auto-closes stale shifts (no heartbeat or over max length)', () => this.heartbeatCheck());
  }

  @Cron('* * * * *', { timeZone: 'UTC' })
  scheduled() {
    return this.registry.scheduled('shift-heartbeat-check');
  }

  async heartbeatCheck(): Promise<JobResult> {
    const now = this.clock.now();
    const open = await this.prisma.shift.findMany({
      where: { state: { in: [ShiftState.WORKING, ShiftState.ON_BREAK] } },
      include: { employee: { select: { id: true, companyId: true, managerId: true, company: { select: { settings: true } } } } },
    });
    let closed = 0;
    let failed = 0;
    for (const shift of open) {
      try {
        const rules = autoCloseRulesFrom(shift.employee.company.settings);
        const reason = shouldAutoClose(shift, now, rules);
        if (!reason) continue;
        await this.autoClose(shift.id, shift.employeeId, shift.employee.managerId, reason, now);
        closed += 1;
      } catch {
        failed += 1;
      }
    }
    return { open: open.length, closed, failed };
  }

  private async autoClose(shiftId: string, employeeId: string, managerId: string | null, reason: 'no_heartbeat' | 'max_length', now: Date) {
    await this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findUnique({ where: { id: shiftId }, include: { breaks: true } });
      if (!shift || shift.state === ShiftState.ENDED) return; // idempotent: another worker closed it
      const lastSegment = await tx.activitySegment.findFirst({ where: { shiftId }, orderBy: { endedAt: 'desc' }, select: { endedAt: true } });
      const endedAt = autoCloseEndTime(shift, lastSegment?.endedAt ?? null);
      let breakSeconds = 0;
      for (const b of shift.breaks) {
        const end = b.endedAt ?? endedAt;
        breakSeconds += Math.max(0, Math.floor((end.getTime() - b.startedAt.getTime()) / 1000));
      }
      await tx.shiftBreak.updateMany({ where: { shiftId, endedAt: null }, data: { endedAt } });
      await tx.shift.update({
        where: { id: shiftId },
        data: {
          state: ShiftState.ENDED,
          endedAt,
          endReason: ShiftEndReason.AUTO_CLOSED,
          durationSeconds: Math.max(0, Math.floor((endedAt.getTime() - shift.startedAt.getTime()) / 1000)),
          breakSeconds,
          flags: Array.from(new Set([...shift.flags, 'auto_closed', reason])),
        },
      });
    });
    const body = reason === 'no_heartbeat' ? 'Your shift was closed because the app stopped sending heartbeats.' : 'Your shift was closed because it reached the maximum length.';
    await this.notifications.sendNotification(employeeId, NotificationType.SHIFT_AUTO_CLOSED, 'Shift auto-closed', body, { shiftId, reason, at: now.toISOString() });
    if (managerId) {
      await this.notifications.sendNotification(managerId, NotificationType.SHIFT_AUTO_CLOSED, 'Shift auto-closed', 'A shift of a team member was closed automatically.', { shiftId, employeeId, reason });
    }
  }
}
