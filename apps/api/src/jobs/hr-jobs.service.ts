import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { LeaveStatus, NotificationType } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobRegistry, JobResult } from './job-registry';
import { addDays, utcDayStart } from './jobs.util';

/** hr-leave-rebalance (15 F25) and hr-document-expiry (FR-HR-11). */
@Injectable()
export class HrJobsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
    private registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('hr-leave-rebalance', '15 1 * * *', 'Recomputes used and pending leave days for the current year from requests', () => this.leaveRebalance());
    this.registry.register('hr-document-expiry', '0 7 * * *', 'Warns employees and HR about documents expiring within 30 days', () => this.documentExpiry());
  }

  @Cron('15 1 * * *', { timeZone: 'UTC' })
  scheduledRebalance() {
    return this.registry.scheduled('hr-leave-rebalance');
  }

  @Cron('0 7 * * *', { timeZone: 'UTC' })
  scheduledExpiry() {
    return this.registry.scheduled('hr-document-expiry');
  }

  /**
   * Source of truth is leave_requests: approved -> used, pending -> pending, per employee, type and year
   * of dateFrom. Balance rows that drifted are corrected; nothing else on the row is touched.
   */
  async leaveRebalance(year?: number): Promise<JobResult> {
    const y = year ?? this.clock.now().getUTCFullYear();
    const from = new Date(Date.UTC(y, 0, 1));
    const to = new Date(Date.UTC(y + 1, 0, 1));
    const requests = await this.prisma.leaveRequest.findMany({
      where: { leaveTypeId: { not: null }, status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] }, dateFrom: { gte: from, lt: to } },
      select: { employeeId: true, leaveTypeId: true, status: true, days: true },
    });
    const totals = aggregateLeave(requests as Array<{ employeeId: string; leaveTypeId: string | null; status: string; days: Prisma.Decimal | number }>);
    const balances = await this.prisma.leaveBalance.findMany({ where: { year: y } });
    let corrected = 0;
    for (const b of balances) {
      const t = totals.get(`${b.employeeId}:${b.leaveTypeId}`) ?? { used: 0, pending: 0 };
      if (Number(b.usedDays) !== t.used || Number(b.pendingDays) !== t.pending) {
        await this.prisma.leaveBalance.update({ where: { id: b.id }, data: { usedDays: t.used, pendingDays: t.pending } });
        corrected += 1;
      }
    }
    return { year: y, requests: requests.length, balances: balances.length, corrected };
  }

  async documentExpiry(): Promise<JobResult> {
    const now = this.clock.now();
    const today = utcDayStart(now);
    const until = addDays(today, 30);
    const docs = await this.prisma.hrDocument.findMany({
      where: { expiresAt: { gte: today, lte: until } },
      select: { id: true, companyId: true, employeeId: true, name: true, expiresAt: true },
    });
    let sent = 0;
    for (const d of docs) {
      const recipients = new Set<string>([d.employeeId]);
      const hr = await this.prisma.employee.findMany({
        where: { companyId: d.companyId, status: 'active', deletedAt: null, role: { permissions: { some: { permissionKey: 'hr.profiles.edit', scope: 'all' } } } },
        select: { id: true },
      });
      hr.forEach((e) => recipients.add(e.id));
      const emp = await this.prisma.employee.findUnique({ where: { id: d.employeeId }, select: { managerId: true } });
      if (emp?.managerId) recipients.add(emp.managerId);
      for (const r of recipients) {
        const exists = await this.prisma.notification.findFirst({ where: { recipientId: r, type: NotificationType.ANNOUNCEMENT, data: { path: ['documentId'], equals: d.id } }, select: { id: true } });
        if (exists) continue;
        await this.notifications.sendNotification(r, NotificationType.ANNOUNCEMENT, 'Document expiring', `"${d.name}" expires on ${d.expiresAt?.toISOString().slice(0, 10)}.`, { documentId: d.id, employeeId: d.employeeId, kind: 'document_expiry' });
        sent += 1;
      }
    }
    return { documents: docs.length, sent };
  }
}

/** Pure aggregation used by the rebalance job. */
export function aggregateLeave(requests: Array<{ employeeId: string; leaveTypeId: string | null; status: string; days: Prisma.Decimal | number }>) {
  const totals = new Map<string, { used: number; pending: number }>();
  for (const r of requests) {
    if (!r.leaveTypeId) continue;
    const key = `${r.employeeId}:${r.leaveTypeId}`;
    const t = totals.get(key) ?? { used: 0, pending: 0 };
    const days = Number(r.days);
    if (r.status === LeaveStatus.APPROVED) t.used = round2(t.used + days);
    else if (r.status === LeaveStatus.PENDING) t.pending = round2(t.pending + days);
    totals.set(key, t);
  }
  return totals;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
