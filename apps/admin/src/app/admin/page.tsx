'use client';

import Link from 'next/link';
import { ArrowRight, Briefcase, Target, Users, CheckSquare, Activity, Mail, Shield, MonitorSmartphone, Megaphone, Plane, Clock, Timer, Bell, CalendarCheck, Phone, Video, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { http } from '@/lib/api';
import { useDashboard, type Activity as CrmActivity } from '@/lib/queries/crm';
import { useDevices, useLiveAttendance, useSecurityAlerts } from '@/lib/queries/platform';
import { useOutToday, useAnnouncements, useCorrections, useLeaveRequests } from '@/lib/queries/people';
import { useManualTime } from '@/lib/queries/tracking';
import { useAuth } from '@/lib/auth';
import { Skeleton, ErrorBanner, Card, Badge, EmptyState, Avatar } from '@/components/ui';
import { KpiTile, TimelineItem, Section } from '@/components/ui/advanced';
import { ColumnChart } from '@/components/ui/charts';
import { compactMoney, fullName, dateTime, titleCase, relative, dateOnly } from '@/lib/format';

const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : Array.isArray((x as { items?: T[] } | null)?.items) ? (x as { items: T[] }).items : []);
const TONE_CLASS = { amber: 'bg-amber-soft text-amber-text', red: 'bg-red-soft text-red-text', blue: 'bg-blue-soft text-blue-text' } as const;

export default function AdminHome() {
  const { me, can } = useAuth();
  const canDeals = can('crm.deals.view');
  const canAtt = can('attendance.view');
  const canSec = can('security.view');
  const canDev = can('devices.view');
  const canApprove = can('attendance.approve');
  const canTime = can('tracking.timesheets.approve');

  const crm = useDashboard();
  const live = useLiveAttendance(canAtt);
  const alerts = useSecurityAlerts(canSec ? false : undefined);
  const devices = useDevices();
  const agenda = useQuery({
    queryKey: ['activities', 'agenda', 'today', 'home'],
    queryFn: () => http.get<{ items: CrmActivity[] }>('/crm/activities/agenda', { range: 'today', limit: 8 }),
    enabled: can('crm.leads.view'),
  });
  const out = useOutToday();
  const announcements = useAnnouncements();
  const corrections = useCorrections('pending');
  const leave = useLeaveRequests({ status: 'pending', limit: 20 });
  const manual = useManualTime({ status: 'pending' });

  const liveRows = (live.data ?? []) as Array<{ liveStatus?: string }>;
  const working = liveRows.filter((r) => r.liveStatus === 'Working').length;
  const onBreak = liveRows.filter((r) => r.liveStatus === 'On break').length;
  const pendingDevices = (devices.data ?? []).filter((d) => d.status === 'pending').length;
  const openAlerts = (alerts.data ?? []).filter((a) => !a.acknowledgedAt).length;
  const pendingCorrections = arr<{ id: string }>(corrections.data).length;
  const pendingLeave = arr<{ id: string }>(leave.data).length;
  const pendingManual = arr<{ id: string }>(manual.data).length;
  const anyLoading = (canDeals && crm.isLoading) || (canAtt && live.isLoading);
  const today = new Date();
  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const attention: Array<{ label: string; count: number; href: string; icon: React.ReactNode; tone: keyof typeof TONE_CLASS }> = [
    ...(canApprove ? [{ label: 'Attendance corrections', count: pendingCorrections, href: '/admin/people/corrections', icon: <Clock size={14} />, tone: 'amber' as const }] : []),
    ...(canApprove ? [{ label: 'Leave requests', count: pendingLeave, href: '/admin/people/leave', icon: <Plane size={14} />, tone: 'amber' as const }] : []),
    ...(canTime ? [{ label: 'Manual time approvals', count: pendingManual, href: '/admin/tracking/timesheets', icon: <Timer size={14} />, tone: 'amber' as const }] : []),
    ...(canDev ? [{ label: 'Devices awaiting approval', count: pendingDevices, href: '/admin/security/devices', icon: <MonitorSmartphone size={14} />, tone: 'blue' as const }] : []),
    ...(canSec ? [{ label: 'Open security alerts', count: openAlerts, href: '/admin/security/alerts', icon: <Bell size={14} />, tone: 'red' as const }] : []),
  ];
  const totalAttention = attention.reduce((s, a) => s + a.count, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{greeting}, {me?.firstName ?? ''}</h1>
          <p className="mt-0.5 text-base text-ink-2">{today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · live overview across your scope</p>
        </div>
        {totalAttention > 0 && <Badge tone="amber" dot>{totalAttention} item{totalAttention === 1 ? '' : 's'} need attention</Badge>}
      </div>

      {canDeals && crm.isError && <ErrorBanner message={(crm.error as Error).message} onRetry={() => crm.refetch()} />}
      <div className="grid grid-cols-6 gap-3.5">
        {anyLoading && [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-[108px]" />)}
        {!anyLoading && (
          <>
            {canAtt && <KpiTile label="Working now" value={live.isError ? '—' : working} tone="green" icon={<Users size={14} />} />}
            {canDeals && crm.data && <KpiTile label="Open pipeline" value={compactMoney(crm.data.kpis.pipelineValue)} icon={<Briefcase size={14} />} trend={crm.data.byStage.length > 1 ? crm.data.byStage.map((s) => s.total) : undefined} series={0} />}
            {canDeals && crm.data && <KpiTile label="Won this month" value={compactMoney(crm.data.kpis.revenueThisMonth)} tone="green" icon={<Target size={14} />} delta={crm.data.kpis.winRate} deltaLabel="win rate" />}
            {canDeals && crm.data && <KpiTile label="Activities today" value={crm.data.kpis.activitiesToday} tone={crm.data.kpis.overdueActivities ? 'amber' : undefined} icon={<CalendarCheck size={14} />} />}
            {canDev && <KpiTile label="Devices pending" value={devices.isError ? '—' : pendingDevices} tone={pendingDevices ? 'amber' : undefined} icon={<MonitorSmartphone size={14} />} />}
            {canSec && <KpiTile label="Open alerts" value={alerts.isError ? '—' : openAlerts} tone={openAlerts ? 'red' : undefined} icon={<Shield size={14} />} />}
          </>
        )}
      </div>
      {canAtt && !live.isError && liveRows.length > 0 && <p className="-mt-3 text-xs text-ink-3">{onBreak} on break · {liveRows.length} employees on the live board</p>}

      <div className="grid grid-cols-3 gap-3.5">
        <div className="col-span-2 space-y-3.5">
          {canDeals && crm.data && crm.data.byStage.length > 0 && (
            <Card title="Open pipeline by stage" actions={<Link href="/admin/crm/deals" className="inline-flex items-center gap-1 text-xs font-semibold text-pri hover:underline">Deal board <ArrowRight size={12} /></Link>}>
              <div className="p-4">
                <ColumnChart categories={crm.data.byStage.map((s) => s.name)} series={[{ name: 'Amount', values: crm.data.byStage.map((s) => s.total) }]} format={(n) => compactMoney(n)} height={170} />
              </div>
            </Card>
          )}
          <Card title="Today" actions={<Link href="/admin/crm/activities" className="inline-flex items-center gap-1 text-xs font-semibold text-pri hover:underline">All activities <ArrowRight size={12} /></Link>}>
            <div className="p-4">
              <Section title="Follow-ups">
                {agenda.isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
                {agenda.isError && <ErrorBanner message={(agenda.error as Error).message} onRetry={() => agenda.refetch()} />}
                {agenda.data && agenda.data.items.length === 0 && <EmptyState title="Nothing planned for today" body="Calls, meetings and tasks due today appear here." />}
                {agenda.data && agenda.data.items.length > 0 && (
                  <ul>
                    {agenda.data.items.map((a) => (
                      <TimelineItem key={a.id} icon={a.type === 'call' ? <Phone size={12} /> : a.type === 'meeting' ? <Video size={12} /> : <CheckSquare size={12} />} tone={a.type === 'call' ? 'blue' : a.type === 'meeting' ? 'violet' : 'primary'} title={a.subject || a.body || titleCase(a.type)} meta={a.dueAt ? dateTime(a.dueAt) : ''}>
                        <Link href={`/admin/crm/${a.entityType}s?id=${a.entityId}`} className="hover:underline">{a.entityName ?? titleCase(a.entityType)}</Link>
                      </TimelineItem>
                    ))}
                  </ul>
                )}
              </Section>
              <Section title="Out today">
                {out.isLoading && <Skeleton className="h-8" />}
                {out.data && out.data.items.length === 0 && <div className="text-sm text-ink-3">Everyone is in.{out.data.upcomingThisWeek ? ` ${out.data.upcomingThisWeek} leave day${out.data.upcomingThisWeek === 1 ? '' : 's'} later this week.` : ''}</div>}
                {out.data && out.data.items.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {out.data.items.map((l) => {
                      const emp = (l as { employee?: { firstName: string; lastName: string } | null }).employee;
                      return (
                        <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs">
                          <Avatar name={fullName(emp)} size={16} />
                          {fullName(emp)} <span className="text-ink-3">· until {dateOnly(l.dateTo)}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </Section>
              <Section title="Announcements" actions={<Link href="/admin/people/announcements" className="text-xs font-semibold text-pri hover:underline">All</Link>}>
                {announcements.isLoading && <Skeleton className="h-8" />}
                {announcements.data && announcements.data.length === 0 && <div className="text-sm text-ink-3">No announcements yet.</div>}
                <ul className="space-y-2">
                  {(announcements.data ?? []).slice(0, 3).map((a) => (
                    <li key={a.id} className="flex items-start gap-2.5 rounded-card border border-line bg-surface-2/60 p-3">
                      <span className="mt-0.5 text-ink-3"><Megaphone size={14} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2"><span className="truncate text-base font-semibold text-ink">{a.title}</span><span className="shrink-0 text-xs text-ink-3">{relative(a.publishedAt)}</span></div>
                        <div className="line-clamp-2 text-sm text-ink-2">{a.body}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          </Card>
        </div>

        <div className="space-y-3.5">
          <Card title="Needs attention">
            {attention.length === 0 && <EmptyState title="Nothing to review" body="Approvals and alerts in your scope appear here." />}
            <ul className="divide-y divide-line-2">
              {attention.map((a) => (
                <li key={a.label}>
                  <Link href={a.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-md ${a.count ? TONE_CLASS[a.tone] : 'bg-gray-soft text-ink-3'}`}>{a.icon}</span>
                    <span className="flex-1 text-base text-ink">{a.label}</span>
                    <span className={`font-mono text-base font-semibold ${a.count ? 'text-ink' : 'text-ink-3'}`}>{a.count}</span>
                    <ArrowRight size={13} className="text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          {canSec && (
            <Card title="Latest alerts" actions={<Link href="/admin/security/alerts" className="text-xs font-semibold text-pri hover:underline">All</Link>}>
              {alerts.isLoading && <div className="space-y-2 p-4">{[1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>}
              {alerts.isError && <ErrorBanner message={(alerts.error as Error).message} onRetry={() => alerts.refetch()} />}
              {alerts.data && openAlerts === 0 && <EmptyState title="No open alerts" />}
              {alerts.data && openAlerts > 0 && (
                <ul className="divide-y divide-line-2">
                  {alerts.data.filter((a) => !a.acknowledgedAt).slice(0, 5).map((a) => (
                    <li key={a.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                      <Badge tone={a.severity === 'critical' || a.severity === 'high' ? 'red' : a.severity === 'warning' ? 'amber' : 'blue'}>{a.severity}</Badge>
                      <span className="flex-1 truncate text-ink">{titleCase(a.type)}</span>
                      <span className="text-xs text-ink-3">{relative(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {canDeals && crm.data && crm.data.leaderboard.length > 0 && (
            <Card title="Top closers this month">
              <ul className="divide-y divide-line-2">
                {crm.data.leaderboard.slice(0, 5).map((l, i) => (
                  <li key={l.owner?.id ?? i} className="flex items-center gap-2.5 px-4 py-2">
                    <span className="w-4 font-mono text-xs text-ink-3">{i + 1}</span>
                    <Avatar name={fullName(l.owner)} size={24} />
                    <span className="flex-1 truncate text-base text-ink">{fullName(l.owner)}</span>
                    <span className="font-mono text-sm text-ink">{compactMoney(l.revenue)}</span>
                    <span className="text-xs text-ink-3">{l.won} won</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-2xs font-semibold uppercase text-ink-3">Modules</h2>
        <div className="grid grid-cols-4 gap-3.5">
          <Shortcut href="/admin/crm/dashboard" icon={<Target size={18} />} title="CRM" body="Leads, contacts, accounts and the deal board." />
          <Shortcut href="/admin/tasks/my" icon={<CheckSquare size={18} />} title="Tasks" body="Spaces, lists, boards and your own task list." />
          <Shortcut href="/admin/people/directory" icon={<Users size={18} />} title="People" body="Directory, attendance, leave and onboarding." />
          <Shortcut href="/admin/tracking/team" icon={<Activity size={18} />} title="Tracking" body="Team activity, timesheets, apps and URLs." />
          <Shortcut href="/admin/mail/inbox" icon={<Mail size={18} />} title="Mail" body="Shared inboxes, assignments and templates." />
          <Shortcut href="/admin/reports" icon={<FileText size={18} />} title="Reports" body="Attendance, productivity, CRM and calls with CSV export." />
          <Shortcut href="/admin/targets" icon={<Target size={18} />} title="Targets" body="Metric targets per employee, team or role." />
          <Shortcut href="/admin/security/audit" icon={<Shield size={18} />} title="Security" body="Roles, sessions, login history and audit log." />
        </div>
      </div>
    </div>
  );
}

function Shortcut({ href, icon, title, body }: { href: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Link href={href} className="group rounded-card border border-line bg-surface p-4 shadow-card transition hover:border-pri hover:shadow-pop">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-pri-soft text-pri">{icon}</div>
      <div className="text-base font-semibold text-ink">{title}</div>
      <div className="mt-0.5 text-sm text-ink-2">{body}</div>
      <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-pri opacity-0 transition group-hover:opacity-100">Open <ArrowRight size={12} /></div>
    </Link>
  );
}
