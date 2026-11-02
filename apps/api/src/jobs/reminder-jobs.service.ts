import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CrmActivityStatus, NotificationType } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobRegistry, JobResult } from './job-registry';

const DUE_SOON_MS = 30 * 60_000;
const LOOKBACK_MS = 24 * 3_600_000;

/**
 * followup-reminder (F10 rule 4, F11, FR-TASK-17, FR-CRM-22). Idempotency: a reminder is sent once per
 * (recipient, type, refId) by checking the notifications table before sending.
 */
@Injectable()
export class ReminderJobsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
    private registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('followup-reminder', '* * * * *', 'Lead follow-ups, planned CRM activities, task due-soon and overdue reminders', () => this.run());
  }

  @Cron('* * * * *', { timeZone: 'UTC' })
  scheduled() {
    return this.registry.scheduled('followup-reminder');
  }

  async run(): Promise<JobResult> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - LOOKBACK_MS);
    const soon = new Date(now.getTime() + DUE_SOON_MS);
    let sent = 0;

    const leads = await this.prisma.lead.findMany({
      where: { deletedAt: null, convertedAt: null, wonAt: null, lostAt: null, ownerId: { not: null }, followUpAt: { gte: since, lte: now } },
      select: { id: true, name: true, ownerId: true, followUpAt: true },
    });
    for (const lead of leads) {
      if (await this.notify(lead.ownerId!, NotificationType.FOLLOWUP_DUE, 'Follow-up due', `Follow-up with "${lead.name}" is due.`, { refId: lead.id, leadId: lead.id, dueAt: lead.followUpAt?.toISOString() })) sent += 1;
    }

    const activities = await this.prisma.crmActivity.findMany({
      where: { status: CrmActivityStatus.PLANNED, actorId: { not: null }, dueAt: { gte: since, lte: now } },
      select: { id: true, actorId: true, subject: true, type: true, entityType: true, entityId: true },
    });
    for (const a of activities) {
      if (await this.notify(a.actorId!, NotificationType.FOLLOWUP_DUE, `${a.type} due`, a.subject ?? `A planned ${a.type} is due.`, { refId: a.id, activityId: a.id, entityType: a.entityType, entityId: a.entityId })) sent += 1;
    }

    const openTasks = await this.prisma.task.findMany({
      where: { deletedAt: null, archivedAt: null, status: { in: ['todo', 'in_progress'] }, dueAt: { gte: since, lte: soon } },
      select: { id: true, title: true, creatorId: true, dueAt: true, assignees: { select: { employeeId: true } }, assigneeId: true },
    });
    for (const t of openTasks) {
      const recipients = new Set<string>([t.assigneeId, t.creatorId, ...t.assignees.map((a) => a.employeeId)]);
      const overdue = t.dueAt !== null && t.dueAt.getTime() < now.getTime();
      for (const r of recipients) {
        if (overdue) {
          if (await this.notify(r, NotificationType.TASK_OVERDUE, 'Task overdue', `"${t.title}" is overdue.`, { refId: t.id, taskId: t.id })) sent += 1;
        } else if (await this.notify(r, NotificationType.TASK_DUE_SOON, 'Task due soon', `"${t.title}" is due within 30 minutes.`, { refId: t.id, taskId: t.id })) sent += 1;
      }
    }
    return { leads: leads.length, activities: activities.length, tasks: openTasks.length, sent };
  }

  /** Sends once per recipient, type and refId. Returns true when a notification was created. */
  private async notify(recipientId: string, type: string, title: string, body: string, data: Record<string, unknown> & { refId: string }): Promise<boolean> {
    const existing = await this.prisma.notification.findFirst({
      where: { recipientId, type, data: { path: ['refId'], equals: data.refId } },
      select: { id: true },
    });
    if (existing) return false;
    await this.notifications.sendNotification(recipientId, type, title, body, data);
    return true;
  }
}
