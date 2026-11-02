import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CrmEntityType, CrmActivityStatus, CrmActivityType, PipelineEntity, StageType } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { ownerScopeWhere, normalizePhone } from './shared/crm.util';

/** Global CRM search (FR-CRM-32) and the CRM dashboard (FR-CRM-33). */
@Injectable()
export class CrmInsightsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  async search(scope: ScopeFilter, q: string, limit: number, allowed: { leads: boolean; contacts: boolean; accounts: boolean; deals: boolean }) {
    const ci = { contains: q, mode: 'insensitive' as const };
    const digits = normalizePhone(q);
    const lower = q.toLowerCase();
    const base = { companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope) };

    const [leads, contacts, accounts, deals] = await Promise.all([
      allowed.leads
        ? this.prisma.lead.findMany({
            where: { ...base, OR: [{ name: ci }, { companyName: ci }, { emails: { some: { emailLower: { contains: lower } } } }, ...(digits.length >= 4 ? [{ phones: { some: { phoneE164: { contains: digits } } } }] : [])] },
            select: { id: true, name: true, companyName: true, convertedAt: true, stage: { select: { name: true, type: true } } },
            take: limit,
          })
        : [],
      allowed.contacts
        ? this.prisma.crmContact.findMany({
            where: { ...base, OR: [{ firstName: ci }, { lastName: ci }, { account: { name: ci } }, { emails: { some: { emailLower: { contains: lower } } } }, ...(digits.length >= 4 ? [{ phones: { some: { phoneE164: { contains: digits } } } }] : [])] },
            select: { id: true, firstName: true, lastName: true, title: true, account: { select: { id: true, name: true } } },
            take: limit,
          })
        : [],
      allowed.accounts
        ? this.prisma.crmAccount.findMany({
            where: { companyId: scope.companyId, deletedAt: null, ...this.accountScope(scope), OR: [{ name: ci }, { domain: ci }] },
            select: { id: true, name: true, domain: true, lifecycle: true },
            take: limit,
          })
        : [],
      allowed.deals
        ? this.prisma.deal.findMany({
            where: { ...base, OR: [{ name: ci }, { account: { name: ci } }] },
            select: { id: true, name: true, amount: true, currency: true, stage: { select: { name: true, type: true } }, account: { select: { name: true } } },
            take: limit,
          })
        : [],
    ]);
    return { leads, contacts, accounts, deals };
  }

  async dashboard(scope: ScopeFilter) {
    const now = this.clock.now();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const base: Prisma.DealWhereInput = { companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope) };
    const actorScope = scope.scope === 'all' ? {} : { actorId: { in: scope.allowedEmployeeIds } };

    const [openDeals, wonThisMonth, lostThisMonth, createdThisMonth, activitiesToday, overdue, leadsOpen, leadsConvertedMonth, stages, leadersRaw] =
      await Promise.all([
        this.prisma.deal.findMany({ where: { ...base, wonAt: null, lostAt: null }, select: { amount: true, probability: true, stageId: true } }),
        this.prisma.deal.aggregate({ where: { ...base, wonAt: { gte: monthStart } }, _count: true, _sum: { amount: true } }),
        this.prisma.deal.count({ where: { ...base, lostAt: { gte: monthStart } } }),
        this.prisma.deal.count({ where: { ...base, createdAt: { gte: monthStart } } }),
        this.prisma.crmActivity.count({ where: { companyId: scope.companyId, ...actorScope, status: CrmActivityStatus.PLANNED, dueAt: { gte: dayStart, lt: dayEnd } } }),
        this.prisma.crmActivity.count({ where: { companyId: scope.companyId, ...actorScope, status: CrmActivityStatus.PLANNED, dueAt: { lt: dayStart } } }),
        this.prisma.lead.count({ where: { companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope), convertedAt: null, wonAt: null, lostAt: null } }),
        this.prisma.lead.count({ where: { companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope), convertedAt: { gte: monthStart } } }),
        this.prisma.pipelineStage.findMany({ where: { pipeline: { companyId: scope.companyId, entity: PipelineEntity.DEAL } }, orderBy: { position: 'asc' }, select: { id: true, name: true, type: true, pipelineId: true } }),
        this.prisma.deal.groupBy({ by: ['ownerId'], where: { ...base, wonAt: { gte: monthStart } }, _count: true, _sum: { amount: true } }),
      ]);

    const pipelineValue = openDeals.reduce((s, d) => s + Number(d.amount ?? 0), 0);
    const weighted = openDeals.reduce((s, d) => s + (Number(d.amount ?? 0) * d.probability) / 100, 0);
    const byStage = stages
      .filter((s) => s.type === StageType.OPEN)
      .map((s) => {
        const items = openDeals.filter((d) => d.stageId === s.id);
        return { stageId: s.id, name: s.name, count: items.length, total: items.reduce((x, d) => x + Number(d.amount ?? 0), 0) };
      });
    const closedThisMonth = wonThisMonth._count + lostThisMonth;
    const winRate = closedThisMonth > 0 ? Math.round((wonThisMonth._count / closedThisMonth) * 100) : 0;

    const ownerIds = leadersRaw.map((l) => l.ownerId).filter((x): x is string => Boolean(x));
    const owners = await this.prisma.employee.findMany({ where: { id: { in: ownerIds } }, select: { id: true, firstName: true, lastName: true, code: true } });
    const leaderboard = leadersRaw
      .map((l) => ({ owner: owners.find((o) => o.id === l.ownerId) ?? null, won: l._count, revenue: Number(l._sum.amount ?? 0) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const recent = await this.prisma.crmActivity.findMany({
      where: { companyId: scope.companyId, ...actorScope, type: { in: [CrmActivityType.NOTE, CrmActivityType.CALL, CrmActivityType.MEETING, CrmActivityType.STAGE_CHANGED, CrmActivityType.CONVERTED] } },
      orderBy: { occurredAt: 'desc' },
      take: 10,
    });

    return {
      kpis: {
        pipelineValue,
        weightedForecast: weighted,
        openDeals: openDeals.length,
        wonThisMonth: wonThisMonth._count,
        revenueThisMonth: Number(wonThisMonth._sum.amount ?? 0),
        winRate,
        dealsCreatedThisMonth: createdThisMonth,
        activitiesToday,
        overdueActivities: overdue,
        openLeads: leadsOpen,
        leadsConvertedThisMonth: leadsConvertedMonth,
      },
      byStage,
      leaderboard,
      recentActivities: recent,
      entity: CrmEntityType.DEAL,
    };
  }

  private accountScope(scope: ScopeFilter): Prisma.CrmAccountWhereInput {
    if (scope.scope === 'all') return {};
    const ids = scope.allowedEmployeeIds;
    return { OR: [{ ownerId: { in: ids } }, { contacts: { some: { ownerId: { in: ids }, deletedAt: null } } }, { deals: { some: { ownerId: { in: ids }, deletedAt: null } } }] };
  }
}
