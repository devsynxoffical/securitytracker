'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Briefcase, Target, CalendarCheck, AlertTriangle, StickyNote, Phone, CalendarClock, ArrowRightLeft, Sparkles, Pencil, Trophy } from 'lucide-react';
import { useDashboard } from '@/lib/queries/crm';
import { Skeleton, ErrorBanner, Card, EmptyState, PageHeader, Badge } from '@/components/ui';
import { KpiTile, TimelineItem } from '@/components/ui/advanced';
import { ColumnChart, Donut, BarList } from '@/components/ui/charts';
import { compactMoney, money, fullName, relative, titleCase } from '@/lib/format';

const activityIcon: Record<string, React.ReactNode> = {
  note: <StickyNote size={14} />,
  call: <Phone size={14} />,
  meeting: <CalendarClock size={14} />,
  stage_changed: <ArrowRightLeft size={14} />,
  converted: <Sparkles size={14} />,
};
const entityPath = (t: string) => (t === 'lead' ? 'leads' : `${t}s`);

export default function CrmDashboardPage() {
  const q = useDashboard();
  const d = q.data;

  const mix = useMemo(() => {
    if (!d) return [];
    const won = d.kpis.wonThisMonth;
    // closed = won / winRate; lost is derived because the API reports win rate, not a lost count
    const lost = d.kpis.winRate > 0 ? Math.max(0, Math.round((won * 100) / d.kpis.winRate) - won) : 0;
    return [
      { label: 'Open', value: d.kpis.openDeals, series: 0 },
      { label: 'Won this month', value: won, series: 2 },
      { label: 'Lost this month', value: lost, series: 7 },
    ].filter((x) => x.value > 0);
  }, [d]);

  if (q.isLoading) {
    return (
      <div className="space-y-3.5">
        <div className="grid grid-cols-4 gap-3.5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        <div className="grid grid-cols-3 gap-3.5"><Skeleton className="col-span-2 h-72" /><Skeleton className="h-72" /></div>
      </div>
    );
  }
  if (q.isError) return <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!d) return null;

  return (
    <div>
      <PageHeader title="CRM dashboard" subtitle="Pipeline, revenue and activity across your scope." />

      <div className="grid grid-cols-4 gap-3.5">
        <KpiTile label="Pipeline value" value={compactMoney(d.kpis.pipelineValue)} icon={<Briefcase size={14} />} />
        <KpiTile label="Weighted forecast" value={compactMoney(d.kpis.weightedForecast)} tone="primary" icon={<Target size={14} />} />
        <KpiTile label="Revenue this month" value={compactMoney(d.kpis.revenueThisMonth)} tone="green" icon={<Trophy size={14} />} />
        <KpiTile label="Win rate" value={`${d.kpis.winRate}%`} icon={<Target size={14} />} />
        <KpiTile label="Open deals" value={d.kpis.openDeals} />
        <KpiTile label="Deals created" value={d.kpis.dealsCreatedThisMonth} />
        <KpiTile label="Open leads" value={d.kpis.openLeads} />
        <KpiTile label="Converted this month" value={d.kpis.leadsConvertedThisMonth} />
        <KpiTile label="Activities today" value={d.kpis.activitiesToday} icon={<CalendarCheck size={14} />} />
        <KpiTile label="Overdue activities" value={d.kpis.overdueActivities} tone={d.kpis.overdueActivities ? 'red' : undefined} icon={<AlertTriangle size={14} />} />
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-3.5">
        <Card title="Open pipeline by stage" className="col-span-2">
          <div className="p-4">
            {d.byStage.length === 0 ? (
              <EmptyState title="No deal pipeline configured" body="Create a deal pipeline under CRM → Settings." />
            ) : (
              <ColumnChart categories={d.byStage.map((s) => s.name)} series={[{ name: 'Pipeline', values: d.byStage.map((s) => s.total) }]} format={(n) => compactMoney(n)} height={220} />
            )}
          </div>
        </Card>
        <Card title="Deal mix">
          <div className="p-4">
            {mix.length === 0 ? <EmptyState title="No deals yet" /> : <Donut data={mix} size={150} centre={<><div className="font-mono text-lg font-semibold text-ink">{d.kpis.openDeals}</div><div className="text-2xs normal-case tracking-normal text-ink-3">open</div></>} />}
            <div className="mt-3 text-xs text-ink-3">Lost count is derived from the monthly win rate.</div>
          </div>
        </Card>
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-3.5">
        <Card title="Leaderboard · won this month">
          <div className="p-4">
            {d.leaderboard.length === 0 ? (
              <EmptyState title="No closed deals yet" />
            ) : (
              <BarList data={d.leaderboard.map((l) => ({ label: fullName(l.owner) || 'Unassigned', value: l.revenue, meta: `${l.won} won` }))} format={(n) => money(n)} series={2} />
            )}
          </div>
        </Card>
        <Card title="Recent activity" className="col-span-2">
          <div className="p-4">
            {d.recentActivities.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ol>
                {d.recentActivities.map((a) => (
                  <TimelineItem
                    key={a.id}
                    tone={a.type === 'converted' ? 'green' : a.type === 'stage_changed' ? 'primary' : a.type === 'call' ? 'blue' : 'gray'}
                    icon={activityIcon[a.type] ?? <Pencil size={14} />}
                    title={<span className="flex items-center gap-2">{a.subject || titleCase(a.type)} <Badge tone="gray">{titleCase(a.entityType)}</Badge></span>}
                    meta={<span className="flex items-center gap-2"><Link className="text-pri hover:underline" href={`/admin/crm/${entityPath(a.entityType)}?id=${a.entityId}`}>Open</Link><span>{relative(a.occurredAt)}</span></span>}
                  >
                    {a.body && <span className="line-clamp-2">{a.body}</span>}
                  </TimelineItem>
                ))}
              </ol>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
