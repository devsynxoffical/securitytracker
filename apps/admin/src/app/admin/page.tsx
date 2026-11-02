'use client';

import Link from 'next/link';
import { ArrowRight, Briefcase, Target, Users, CheckSquare, Activity, Mail, Shield, MonitorSmartphone } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { http } from '@/lib/api';
import { useDashboard, type Activity as CrmActivity } from '@/lib/queries/crm';
import { useDevices, useLiveAttendance, useSecurityAlerts } from '@/lib/queries/platform';
import { useAuth } from '@/lib/auth';
import { KpiCard, Skeleton, ErrorBanner, Card, PageHeader, Badge, EmptyState } from '@/components/ui';
import { compactMoney, fullName, dateTime, titleCase } from '@/lib/format';

export default function AdminHome() {
  const { me, can } = useAuth();
  const canDeals = can('crm.deals.view');
  const canAtt = can('attendance.view');
  const canSec = can('security.view');
  const canDev = can('devices.view');

  const crm = useDashboard();
  const live = useLiveAttendance(canAtt);
  const alerts = useSecurityAlerts(canSec ? false : undefined);
  const devices = useDevices();
  const agenda = useQuery({
    queryKey: ['activities', 'agenda', 'today', 'home'],
    queryFn: () => http.get<{ items: CrmActivity[] }>('/crm/activities/agenda', { range: 'today', limit: 8 }),
    enabled: can('crm.leads.view'),
  });

  // Live board rows carry `liveStatus`: Working, On break, Offline (…), Not started.
  const liveRows = (live.data ?? []) as Array<{ liveStatus?: string }>;
  const working = liveRows.filter((r) => r.liveStatus === 'Working').length;
  const onBreak = liveRows.filter((r) => r.liveStatus === 'On break').length;
  const pendingDevices = (devices.data ?? []).filter((d) => d.status === 'pending').length;
  const openAlerts = (alerts.data ?? []).filter((a) => !a.acknowledgedAt).length;
  const anyLoading = (canDeals && crm.isLoading) || (canAtt && live.isLoading);

  return (
    <div>
      <PageHeader title={`Good day, ${me?.firstName ?? ''}`} subtitle="Live overview across your scope." />

      {anyLoading && <div className="grid grid-cols-4 gap-3.5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
      {canDeals && crm.isError && <ErrorBanner message={(crm.error as Error).message} onRetry={() => crm.refetch()} />}
      {!anyLoading && (
        <div className="grid grid-cols-4 gap-3.5">
          {canAtt && <KpiCard label="Working now" value={live.isError ? '—' : working} context={live.isError ? 'Live board unavailable' : `${onBreak} on break · ${liveRows.length} employees`} tone="green" />}
          {canDeals && crm.data && <KpiCard label="Open pipeline" value={compactMoney(crm.data.kpis.pipelineValue)} context={`${crm.data.kpis.openDeals} open deals · ${compactMoney(crm.data.kpis.weightedForecast)} weighted`} />}
          {canDeals && crm.data && <KpiCard label="Won this month" value={compactMoney(crm.data.kpis.revenueThisMonth)} context={`${crm.data.kpis.wonThisMonth} deals · ${crm.data.kpis.winRate}% win rate`} tone="green" />}
          {canDeals && crm.data && <KpiCard label="Activities today" value={crm.data.kpis.activitiesToday} context={crm.data.kpis.overdueActivities ? `${crm.data.kpis.overdueActivities} overdue` : 'Nothing overdue'} tone={crm.data.kpis.overdueActivities ? 'amber' : undefined} />}
          {canDev && <KpiCard label="Devices pending" value={devices.isError ? '—' : pendingDevices} context={pendingDevices ? 'Awaiting approval' : 'All devices reviewed'} tone={pendingDevices ? 'amber' : undefined} />}
          {canSec && <KpiCard label="Security alerts" value={alerts.isError ? '—' : openAlerts} context={openAlerts ? 'Unacknowledged' : 'No open alerts'} tone={openAlerts ? 'red' : undefined} />}
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3.5">
        <Card title="Follow-ups today" className="col-span-2">
          {agenda.isLoading && <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div>}
          {agenda.isError && <ErrorBanner message={(agenda.error as Error).message} onRetry={() => agenda.refetch()} />}
          {agenda.data && agenda.data.items.length === 0 && <EmptyState title="Nothing planned for today" body="Calls, meetings and tasks due today appear here." />}
          {agenda.data && agenda.data.items.length > 0 && (
            <ul className="divide-y divide-line-2">
              {agenda.data.items.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <Badge tone="blue">{titleCase(a.type)}</Badge>
                  <span className="flex-1 truncate font-medium text-ink">{a.subject || a.body || '—'}</span>
                  <span className="truncate text-ink-3">{a.entityName ?? ''}</span>
                  <span className="font-mono text-xs text-ink-3">{dateTime(a.dueAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line px-4 py-2 text-right">
            <Link href="/admin/crm/activities" className="inline-flex items-center gap-1 text-xs font-semibold text-pri hover:underline">All activities <ArrowRight size={12} /></Link>
          </div>
        </Card>
        <Card title="Security alerts">
          {!canSec && <EmptyState title="No access" body="Security alerts need the security.view permission." />}
          {canSec && alerts.isLoading && <div className="space-y-2 p-4">{[1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>}
          {canSec && alerts.isError && <ErrorBanner message={(alerts.error as Error).message} onRetry={() => alerts.refetch()} />}
          {canSec && alerts.data && openAlerts === 0 && <EmptyState title="No open alerts" />}
          {canSec && alerts.data && openAlerts > 0 && (
            <ul className="divide-y divide-line-2">
              {alerts.data.filter((a) => !a.acknowledgedAt).slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                  <Badge tone={a.severity === 'critical' || a.severity === 'high' ? 'red' : a.severity === 'warning' ? 'amber' : 'blue'}>{a.severity}</Badge>
                  <span className="flex-1 truncate">{titleCase(a.type)}</span>
                  <span className="text-xs text-ink-3">{fullName(a.actor)}</span>
                </li>
              ))}
            </ul>
          )}
          {canSec && (
            <div className="border-t border-line px-4 py-2 text-right">
              <Link href="/admin/security/alerts" className="inline-flex items-center gap-1 text-xs font-semibold text-pri hover:underline">All alerts <ArrowRight size={12} /></Link>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-3.5">
        <Shortcut href="/admin/crm/leads" icon={<Target size={18} />} title="CRM" body="Leads, contacts, accounts and the deal board." />
        <Shortcut href="/admin/tasks/my" icon={<CheckSquare size={18} />} title="Tasks" body="Spaces, lists, boards and your own task list." />
        <Shortcut href="/admin/people/directory" icon={<Users size={18} />} title="People" body="Directory, attendance, leave and onboarding." />
        <Shortcut href="/admin/tracking/team" icon={<Activity size={18} />} title="Tracking" body="Team activity, timesheets, apps and URLs." />
        <Shortcut href="/admin/mail/inbox" icon={<Mail size={18} />} title="Mail" body="Shared inboxes, assignments and templates." />
        <Shortcut href="/admin/reports" icon={<Briefcase size={18} />} title="Reports" body="Attendance, productivity, CRM and calls with CSV export." />
        <Shortcut href="/admin/security/devices" icon={<MonitorSmartphone size={18} />} title="Devices" body="Approve, reject and revoke workstations." />
        <Shortcut href="/admin/security/audit" icon={<Shield size={18} />} title="Security" body="Roles, sessions, login history and audit log." />
      </div>
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
      <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-pri opacity-0 transition group-hover:opacity-100">Open <ArrowRight size={12} /></div>
    </Link>
  );
}
