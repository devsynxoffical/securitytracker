import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  UsageReportQueryDto,
  UncategorisedQueryDto,
  CategoriseDto,
  UpdateProductivityRuleDto,
  IdleReportQueryDto,
  TamperQueryDto,
  UpdateTrackingSettingsDto,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { toCursorPage } from '../crm/shared/crm.util';
import { dayStart, dayEnd, isUncategorised, trackingSettingsFrom, categorise } from './tracking-admin.util';

/** Apps and URLs reports, uncategorised queue, idle and tamper reports, rules maintenance, settings (FR-TRK-19 to 24). */
@Injectable()
export class TrackingReportsService {
  constructor(private prisma: PrismaService) {}

  /** Resolves the employee ids the caller may see, narrowed by explicit ids, department or team. */
  private async employeeIds(scope: ScopeFilter, f: { employeeIds?: string; departmentId?: string; teamId?: string; employeeId?: string }): Promise<string[]> {
    const where: Prisma.EmployeeWhereInput = { companyId: scope.companyId, deletedAt: null };
    if (scope.scope !== 'all') where.id = { in: scope.allowedEmployeeIds };
    const explicit = f.employeeId ? [f.employeeId] : f.employeeIds ? f.employeeIds.split(',').map((s) => s.trim()).filter(Boolean) : null;
    if (explicit) {
      if (scope.scope !== 'all' && explicit.some((id) => !scope.allowedEmployeeIds.includes(id))) {
        throw new ForbiddenException('One or more employees are outside your scope');
      }
      where.id = { in: explicit };
    }
    if (f.departmentId) where.departmentId = f.departmentId;
    if (f.teamId) where.teamId = f.teamId;
    const rows = await this.prisma.employee.findMany({ where, select: { id: true } });
    return rows.map((r) => r.id);
  }

  private async rules(companyId: string) {
    return this.prisma.productivityRule.findMany({ where: { companyId } });
  }

  async usageApps(scope: ScopeFilter, q: UsageReportQueryDto) {
    const rows = await this.prisma.activityDailyApp.findMany({
      where: { date: { gte: dayStart(q.from), lte: dayStart(q.to) }, employeeId: { in: await this.employeeIds(scope, q) }, ...(q.category ? { category: q.category } : {}) },
      select: { processName: true, appName: true, category: true, activeS: true, idleS: true, employeeId: true },
    });
    const agg = new Map<string, { processName: string; appName: string; category: string; activeS: number; idleS: number; employees: Set<string> }>();
    for (const r of rows) {
      const a = agg.get(r.processName) ?? { processName: r.processName, appName: r.appName, category: r.category, activeS: 0, idleS: 0, employees: new Set<string>() };
      a.activeS += r.activeS;
      a.idleS += r.idleS;
      a.employees.add(r.employeeId);
      agg.set(r.processName, a);
    }
    const total = rows.reduce((s, r) => s + r.activeS, 0);
    const items = Array.from(agg.values())
      .sort((a, b) => b.activeS - a.activeS)
      .slice(0, q.limit)
      .map((a) => ({ ...a, employees: a.employees.size, share: total ? Math.round((a.activeS / total) * 1000) / 10 : 0 }));
    return { from: q.from, to: q.to, totalActiveS: total, items };
  }

  async usageDomains(scope: ScopeFilter, q: UsageReportQueryDto) {
    const rows = await this.prisma.activityDailyDomain.findMany({
      where: { date: { gte: dayStart(q.from), lte: dayStart(q.to) }, employeeId: { in: await this.employeeIds(scope, q) }, ...(q.category ? { category: q.category } : {}) },
      select: { domain: true, category: true, activeS: true, employeeId: true },
    });
    const agg = new Map<string, { domain: string; category: string; activeS: number; employees: Set<string> }>();
    for (const r of rows) {
      const a = agg.get(r.domain) ?? { domain: r.domain, category: r.category, activeS: 0, employees: new Set<string>() };
      a.activeS += r.activeS;
      a.employees.add(r.employeeId);
      agg.set(r.domain, a);
    }
    const total = rows.reduce((s, r) => s + r.activeS, 0);
    const items = Array.from(agg.values())
      .sort((a, b) => b.activeS - a.activeS)
      .slice(0, q.limit)
      .map((a) => ({ ...a, employees: a.employees.size, share: total ? Math.round((a.activeS / total) * 1000) / 10 : 0 }));
    return { from: q.from, to: q.to, totalActiveS: total, items };
  }

  /** Drill-down: which employees used an app or domain in the period. */
  async usageEmployees(scope: ScopeFilter, q: UsageReportQueryDto & { type: 'app' | 'domain'; key: string }) {
    const where = { date: { gte: dayStart(q.from), lte: dayStart(q.to) }, employeeId: { in: await this.employeeIds(scope, q) } };
    const rows =
      q.type === 'app'
        ? await this.prisma.activityDailyApp.findMany({ where: { ...where, processName: q.key }, select: { employeeId: true, activeS: true, date: true } })
        : await this.prisma.activityDailyDomain.findMany({ where: { ...where, domain: q.key }, select: { employeeId: true, activeS: true, date: true } });
    const agg = new Map<string, { employeeId: string; activeS: number; days: number }>();
    for (const r of rows) {
      const a = agg.get(r.employeeId) ?? { employeeId: r.employeeId, activeS: 0, days: 0 };
      a.activeS += r.activeS;
      a.days += 1;
      agg.set(r.employeeId, a);
    }
    const employees = await this.prisma.employee.findMany({ where: { id: { in: Array.from(agg.keys()) } }, select: { id: true, code: true, firstName: true, lastName: true } });
    return Array.from(agg.values())
      .map((a) => ({ ...a, employee: employees.find((e) => e.id === a.employeeId) ?? null }))
      .sort((a, b) => b.activeS - a.activeS);
  }

  /** FR-TRK-20: apps or domains seen in rollups with no matching rule, ordered by time. */
  async uncategorised(scope: ScopeFilter, q: UncategorisedQueryDto) {
    const rules = await this.rules(scope.companyId);
    const companyEmployees = await this.prisma.employee.findMany({ where: { companyId: scope.companyId }, select: { id: true } });
    const where = { date: { gte: dayStart(q.from), lte: dayStart(q.to) }, employeeId: { in: companyEmployees.map((e) => e.id) } };
    if (q.type === 'app') {
      const rows = await this.prisma.activityDailyApp.findMany({ where, select: { processName: true, appName: true, activeS: true, employeeId: true } });
      const agg = new Map<string, { key: string; label: string; activeS: number; employees: Set<string> }>();
      for (const r of rows) {
        if (!isUncategorised('app', r.processName, rules)) continue;
        const a = agg.get(r.processName) ?? { key: r.processName, label: r.appName, activeS: 0, employees: new Set<string>() };
        a.activeS += r.activeS;
        a.employees.add(r.employeeId);
        agg.set(r.processName, a);
      }
      return { type: q.type, items: Array.from(agg.values()).sort((a, b) => b.activeS - a.activeS).slice(0, q.limit).map((a) => ({ ...a, employees: a.employees.size })) };
    }
    const rows = await this.prisma.activityDailyDomain.findMany({ where: { ...where, domain: { notIn: ['unknown', 'excluded', 'browser-internal'] } }, select: { domain: true, activeS: true, employeeId: true } });
    const agg = new Map<string, { key: string; label: string; activeS: number; employees: Set<string> }>();
    for (const r of rows) {
      if (!isUncategorised('domain', r.domain, rules)) continue;
      const a = agg.get(r.domain) ?? { key: r.domain, label: r.domain, activeS: 0, employees: new Set<string>() };
      a.activeS += r.activeS;
      a.employees.add(r.employeeId);
      agg.set(r.domain, a);
    }
    return { type: q.type, items: Array.from(agg.values()).sort((a, b) => b.activeS - a.activeS).slice(0, q.limit).map((a) => ({ ...a, employees: a.employees.size })) };
  }

  /** Bulk categorise: creates rules and recategorises existing rollups so reports change immediately. */
  async categorise(companyId: string, dto: CategoriseDto) {
    const created = await this.prisma.$transaction(
      dto.items.map((i) =>
        this.prisma.productivityRule.create({ data: { companyId, targetType: i.type, pattern: i.pattern, category: i.category, departmentId: i.departmentId ?? null } }),
      ),
    );
    await this.recategoriseRollups(companyId);
    return { created: created.length, rules: created };
  }

  async updateRule(companyId: string, id: string, dto: UpdateProductivityRuleDto) {
    const rule = await this.prisma.productivityRule.findFirst({ where: { id, companyId } });
    if (!rule) throw new NotFoundException('Rule not found');
    const updated = await this.prisma.productivityRule.update({ where: { id }, data: { pattern: dto.pattern, category: dto.category, departmentId: dto.departmentId === undefined ? undefined : dto.departmentId } });
    await this.recategoriseRollups(companyId);
    return updated;
  }

  async deleteExclusion(companyId: string, id: string) {
    const row = await this.prisma.trackingExclusion.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Exclusion not found');
    return this.prisma.trackingExclusion.delete({ where: { id } });
  }

  async deleteExceptionApp(companyId: string, id: string) {
    const row = await this.prisma.activityExceptionApp.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Exception app not found');
    return this.prisma.activityExceptionApp.delete({ where: { id } });
  }

  /** Re-applies the rule set to app and domain rollups of the last 93 days (bounded, idempotent). */
  private async recategoriseRollups(companyId: string) {
    const rules = await this.rules(companyId);
    const since = new Date(Date.now() - 93 * 86_400_000);
    const employees = await this.prisma.employee.findMany({ where: { companyId }, select: { id: true, departmentId: true } });
    const deptOf = new Map(employees.map((e) => [e.id, e.departmentId]));
    const [apps, domains] = await Promise.all([
      this.prisma.activityDailyApp.findMany({ where: { date: { gte: since }, employeeId: { in: employees.map((e) => e.id) } }, select: { id: true, processName: true, category: true, employeeId: true } }),
      this.prisma.activityDailyDomain.findMany({ where: { date: { gte: since }, employeeId: { in: employees.map((e) => e.id) } }, select: { id: true, domain: true, category: true, employeeId: true } }),
    ]);
    const appUpdates = apps.filter((a) => categorise('app', a.processName, rules, deptOf.get(a.employeeId)) !== a.category);
    const domUpdates = domains.filter((d) => categorise('domain', d.domain, rules, deptOf.get(d.employeeId)) !== d.category);
    await this.prisma.$transaction([
      ...appUpdates.map((a) => this.prisma.activityDailyApp.update({ where: { id: a.id }, data: { category: categorise('app', a.processName, rules, deptOf.get(a.employeeId)) } })),
      ...domUpdates.map((d) => this.prisma.activityDailyDomain.update({ where: { id: d.id }, data: { category: categorise('domain', d.domain, rules, deptOf.get(d.employeeId)) } })),
    ]);
  }

  /** FR-TRK-23: idle segments at or above the threshold. */
  async idleReport(scope: ScopeFilter, q: IdleReportQueryDto) {
    const segments = await this.prisma.activitySegment.findMany({
      where: { kind: 'idle', durationS: { gte: q.minIdleSeconds }, startedAt: { gte: dayStart(q.from), lt: dayEnd(q.to) }, employeeId: { in: await this.employeeIds(scope, q) } },
      orderBy: { durationS: 'desc' },
      take: 500,
      select: { id: true, employeeId: true, startedAt: true, endedAt: true, durationS: true, processName: true, appName: true },
    });
    const ids = Array.from(new Set(segments.map((s) => s.employeeId)));
    const employees = await this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, firstName: true, lastName: true } });
    const perEmployee = ids.map((id) => {
      const mine = segments.filter((s) => s.employeeId === id);
      return { employee: employees.find((e) => e.id === id) ?? null, count: mine.length, idleS: mine.reduce((a, s) => a + s.durationS, 0), longest: mine[0]?.durationS ?? 0 };
    });
    return { minIdleSeconds: q.minIdleSeconds, perEmployee: perEmployee.sort((a, b) => b.idleS - a.idleS), segments: segments.map((s) => ({ ...s, employee: employees.find((e) => e.id === s.employeeId) ?? null })) };
  }

  async tamperEvents(scope: ScopeFilter, q: TamperQueryDto) {
    const where: Prisma.TamperEventWhereInput = { employeeId: { in: await this.employeeIds(scope, q) } };
    if (q.from || q.to) where.occurredAt = { ...(q.from ? { gte: dayStart(q.from) } : {}), ...(q.to ? { lt: dayEnd(q.to) } : {}) };
    const rows = await this.prisma.tamperEvent.findMany({
      where,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    const page = toCursorPage(rows, q.limit);
    const [employees, devices] = await Promise.all([
      this.prisma.employee.findMany({ where: { id: { in: page.items.map((r) => r.employeeId) } }, select: { id: true, code: true, firstName: true, lastName: true } }),
      this.prisma.device.findMany({ where: { id: { in: page.items.map((r) => r.deviceId) } }, select: { id: true, name: true } }),
    ]);
    return {
      ...page,
      items: page.items.map((r) => ({ ...r, employee: employees.find((e) => e.id === r.employeeId) ?? null, device: devices.find((d) => d.id === r.deviceId) ?? null })),
    };
  }

  async getSettings(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } });
    return trackingSettingsFrom(company?.settings);
  }

  async updateSettings(companyId: string, dto: UpdateTrackingSettingsDto) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } });
    const current = (company?.settings as Record<string, unknown> | null) ?? {};
    const next = { ...current, ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) };
    await this.prisma.company.update({ where: { id: companyId }, data: { settings: next as Prisma.InputJsonValue } });
    return trackingSettingsFrom(next);
  }
}
