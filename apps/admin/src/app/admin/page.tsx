'use client';

import Link from 'next/link';
import { ArrowRight, Briefcase, Target, CalendarCheck, Users } from 'lucide-react';
import { useDashboard } from '@/lib/queries/crm';
import { useAuth } from '@/lib/auth';
import { KpiCard, Skeleton, ErrorBanner, Card, PageHeader } from '@/components/ui';
import { compactMoney, fullName } from '@/lib/format';

export default function AdminHome() {
  const { me, can } = useAuth();
  const q = useDashboard();
  const canDeals = can('crm.deals.view');

  return (
    <div>
      <PageHeader title={`Good day, ${me?.firstName ?? ''}`} subtitle="Overview across your scope. CRM is live; the other modules are being rebuilt and still open in the legacy console." />

      {canDeals && q.isLoading && (
        <div className="grid grid-cols-4 gap-3.5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}
      {canDeals && q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {canDeals && q.data && (
        <div className="grid grid-cols-4 gap-3.5">
          <KpiCard label="Open pipeline" value={compactMoney(q.data.kpis.pipelineValue)} context={`${q.data.kpis.openDeals} open deals`} />
          <KpiCard label="Won this month" value={compactMoney(q.data.kpis.revenueThisMonth)} context={`${q.data.kpis.wonThisMonth} deals · ${q.data.kpis.winRate}% win rate`} tone="green" />
          <KpiCard label="Open leads" value={q.data.kpis.openLeads} context={`${q.data.kpis.leadsConvertedThisMonth} converted this month`} />
          <KpiCard label="Activities today" value={q.data.kpis.activitiesToday} context={q.data.kpis.overdueActivities ? `${q.data.kpis.overdueActivities} overdue` : 'Nothing overdue'} tone={q.data.kpis.overdueActivities ? 'amber' : undefined} />
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3.5">
        <Shortcut href="/admin/crm/leads" icon={<Target size={18} />} title="Leads" body="Work new leads, move stages, convert to contacts and deals." />
        <Shortcut href="/admin/crm/deals" icon={<Briefcase size={18} />} title="Deals" body="Pipeline board with stage totals and weighted forecast." />
        <Shortcut href="/admin/crm/activities" icon={<CalendarCheck size={18} />} title="Activities" body="Today, overdue and upcoming calls, meetings and tasks." />
      </div>

      <Card className="mt-5" title="Operations modules">
        <div className="flex items-center justify-between gap-4 px-4 py-3 text-[13px] text-ink-2">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-ink-3" />
            Employees, attendance, tracking, mail, reports and security are being rebuilt as modules. Until then they run in the legacy console.
          </div>
          <Link href="/admin/legacy" className="flex items-center gap-1 font-semibold text-pri hover:underline">
            Open legacy console <ArrowRight size={14} />
          </Link>
        </div>
      </Card>
      {me && <p className="mt-4 text-xs text-ink-3">Signed in as {fullName(me)} · {me.role.name}</p>}
    </div>
  );
}

function Shortcut({ href, icon, title, body }: { href: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Link href={href} className="group rounded-card border border-line bg-surface p-4 shadow-card transition hover:border-pri">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-pri-soft text-pri">{icon}</div>
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      <div className="mt-0.5 text-[13px] text-ink-2">{body}</div>
      <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-pri opacity-0 transition group-hover:opacity-100">
        Open <ArrowRight size={12} />
      </div>
    </Link>
  );
}
