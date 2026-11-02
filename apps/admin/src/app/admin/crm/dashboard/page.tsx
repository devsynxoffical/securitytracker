'use client';

import Link from 'next/link';
import { useDashboard } from '@/lib/queries/crm';
import { KpiCard, Skeleton, ErrorBanner, Card, EmptyState, Avatar, PageHeader, Table, Th, Td } from '@/components/ui';
import { compactMoney, money, fullName, relative, titleCase } from '@/lib/format';

export default function CrmDashboardPage() {
  const q = useDashboard();

  if (q.isLoading) {
    return (
      <div className="space-y-3.5">
        <div className="grid grid-cols-4 gap-3.5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (q.isError) return <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const maxStage = Math.max(1, ...d.byStage.map((s) => s.total));

  return (
    <div>
      <PageHeader title="CRM dashboard" subtitle="Pipeline, revenue and activity across your scope." />
      <div className="grid grid-cols-4 gap-3.5">
        <KpiCard label="Pipeline value" value={compactMoney(d.kpis.pipelineValue)} context={`${d.kpis.openDeals} open deals`} />
        <KpiCard label="Weighted forecast" value={compactMoney(d.kpis.weightedForecast)} context="amount × stage probability" tone="primary" />
        <KpiCard label="Revenue this month" value={compactMoney(d.kpis.revenueThisMonth)} context={`${d.kpis.wonThisMonth} won · ${d.kpis.winRate}% win rate`} tone="green" />
        <KpiCard label="Deals created" value={d.kpis.dealsCreatedThisMonth} context="this month" />
        <KpiCard label="Open leads" value={d.kpis.openLeads} context={`${d.kpis.leadsConvertedThisMonth} converted this month`} />
        <KpiCard label="Activities today" value={d.kpis.activitiesToday} context="planned calls, meetings, tasks" />
        <KpiCard label="Overdue" value={d.kpis.overdueActivities} context="planned items past due" tone={d.kpis.overdueActivities ? 'red' : 'gray'} />
        <KpiCard label="Win rate" value={`${d.kpis.winRate}%`} context="closed deals this month" />
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-3.5">
        <Card title="Open pipeline by stage" className="col-span-2">
          {d.byStage.length === 0 ? (
            <EmptyState title="No deal pipeline configured" body="Create a deal pipeline under CRM → Settings." />
          ) : (
            <div className="space-y-2.5 p-4">
              {d.byStage.map((s) => (
                <div key={s.stageId}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="font-medium text-ink">{s.name}</span>
                    <span className="font-mono text-ink-2">
                      {s.count} · {money(s.total)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-soft">
                    <div className="h-2 rounded-full bg-pri" style={{ width: `${Math.max(2, (s.total / maxStage) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Leaderboard · won this month">
          {d.leaderboard.length === 0 ? (
            <EmptyState title="No closed deals yet" />
          ) : (
            <ul className="divide-y divide-line-2">
              {d.leaderboard.map((l, i) => (
                <li key={l.owner?.id ?? i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-4 font-mono text-xs text-ink-3">{i + 1}</span>
                  <Avatar name={fullName(l.owner)} size={26} />
                  <span className="flex-1 truncate text-[13px] font-medium text-ink">{fullName(l.owner)}</span>
                  <span className="text-right">
                    <span className="block font-mono text-[13px] text-ink">{money(l.revenue)}</span>
                    <span className="block text-[11px] text-ink-3">{l.won} won</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-3.5" title="Recent activity">
        {d.recentActivities.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>Record</Th>
                <Th>Summary</Th>
                <Th right>When</Th>
              </tr>
            </thead>
            <tbody>
              {d.recentActivities.map((a) => (
                <tr key={a.id} className="hover:bg-surface-2">
                  <Td>{titleCase(a.type)}</Td>
                  <Td>
                    <Link className="text-pri hover:underline" href={`/admin/crm/${a.entityType === 'lead' ? 'leads' : `${a.entityType}s`}?id=${a.entityId}`}>
                      {titleCase(a.entityType)}
                    </Link>
                  </Td>
                  <Td className="max-w-md truncate text-ink-2">{a.subject || a.body || '—'}</Td>
                  <Td right className="text-ink-3">
                    {relative(a.occurredAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
