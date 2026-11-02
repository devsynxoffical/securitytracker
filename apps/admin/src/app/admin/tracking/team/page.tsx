'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Clock, Users, AlertTriangle, ExternalLink } from 'lucide-react';
import { useTeamActivity, type TeamActivity } from '@/lib/queries/tracking';
import { Card, PageHeader, Avatar, Badge, Button } from '@/components/ui';
import { KpiTile, DataTable, type Column, type SortState, Tooltip } from '@/components/ui/advanced';
import { ActivityPercent, StatusBadge, CategoryBadge, OrgFilters, DateNav, duration, clock, isoToday } from '@/components/tracking/shared';
import { fullName } from '@/lib/format';

type Row = TeamActivity['items'][number] & { id: string };

export default function TeamActivityPage() {
  const router = useRouter();
  const [date, setDate] = useState(isoToday());
  const [org, setOrg] = useState({ departmentId: '', teamId: '' });
  const [sort, setSort] = useState<SortState>({ key: 'activity', direction: 'desc' });
  const q = useTeamActivity({ date, departmentId: org.departmentId || undefined, teamId: org.teamId || undefined });
  const d = q.data;
  const th = d?.summary.thresholds ?? { warn: 50, alert: 30 };

  const rows = useMemo<Row[]>(() => {
    const items = (d?.items ?? []).map((i) => ({ ...i, id: i.employee.id }));
    const dir = sort.direction === 'asc' ? 1 : -1;
    return items.sort((a, b) => {
      switch (sort.key) {
        case 'employee': return dir * fullName(a.employee).localeCompare(fullName(b.employee));
        case 'tracked': return dir * (a.trackedS - b.trackedS);
        case 'started': return dir * ((a.firstStart ?? '').localeCompare(b.firstStart ?? ''));
        default: {
          const av = a.level === 'none' ? -1 : a.activityPercent;
          const bv = b.level === 'none' ? -1 : b.activityPercent;
          return dir * (av - bv);
        }
      }
    });
  }, [d, sort]);

  const below = rows.filter((r) => r.level === 'warn' || r.level === 'alert').length;
  const open = (id: string) => router.push(`/admin/tracking/timeline?employeeId=${id}&date=${date}`);

  const columns: Column<Row>[] = [
    {
      key: 'employee', header: 'Employee', sortable: true, locked: true,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={fullName(r.employee)} size={26} />
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold text-ink">{fullName(r.employee)}</div>
            <div className="truncate text-xs text-ink-3">{r.employee.department?.name ?? '—'}{r.employee.team ? ` · ${r.employee.team.name}` : ''}</div>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'started', header: 'Started', sortable: true, mono: true, cell: (r) => clock(r.firstStart) },
    { key: 'tracked', header: 'Tracked', sortable: true, right: true, mono: true, cell: (r) => (r.trackedS ? duration(r.trackedS) : <span className="text-ink-3">—</span>) },
    { key: 'activity', header: 'Activity', sortable: true, cell: (r) => <ActivityPercent value={r.activityPercent} warn={th.warn} alert={th.alert} none={r.level === 'none'} /> },
    {
      key: 'topApp', header: 'Top app',
      cell: (r) => r.topApp ? (
        <span className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs">
          <span className="truncate font-medium text-ink">{r.topApp.name}</span>
          <CategoryBadge category={r.topApp.category} />
          <span className="font-mono text-ink-3">{duration(r.topApp.activeS)}</span>
        </span>
      ) : <span className="text-ink-3">—</span>,
    },
    {
      key: 'topDomain', header: 'Top site',
      cell: (r) => r.topDomain ? (
        <span className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs">
          <span className="truncate font-mono text-ink">{r.topDomain.domain}</span>
          <CategoryBadge category={r.topDomain.category} />
        </span>
      ) : <span className="text-ink-3">—</span>,
    },
    { key: 'idle', header: 'Idle', right: true, mono: true, hidden: false, cell: (r) => (r.idleS ? duration(r.idleS) : <span className="text-ink-3">—</span>) },
  ];

  return (
    <div>
      <PageHeader
        title="Team activity"
        subtitle="Who is working right now, how active they are and what they spend time on. Refreshes every 30 seconds."
        actions={
          <>
            <OrgFilters departmentId={org.departmentId} teamId={org.teamId} onChange={setOrg} />
            <DateNav date={date} onChange={setDate} />
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <KpiTile label="Tracked today" value={d ? duration(d.summary.trackedS) : '—'} icon={<Clock size={15} />} loading={q.isLoading} />
        <KpiTile label="Average activity" value={d ? `${d.summary.activityPercent}%` : '—'} tone={d ? (d.summary.activityPercent < th.alert ? 'red' : d.summary.activityPercent < th.warn ? 'amber' : 'green') : undefined} icon={<Activity size={15} />} loading={q.isLoading} />
        <KpiTile label="Working now" value={d ? d.summary.working : '—'} tone="green" icon={<Users size={15} />} loading={q.isLoading} />
        <KpiTile label="Below threshold" value={d ? below : '—'} tone={below > 0 ? 'amber' : undefined} icon={<AlertTriangle size={15} />} loading={q.isLoading} />
      </div>
      {d && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <Badge tone="green" dot>{d.summary.working} working</Badge>
          <Badge tone="amber" dot>{d.summary.onBreak} on break</Badge>
          <Badge tone="blue" dot>{d.summary.offline} offline</Badge>
          <Badge tone="red" dot>{d.summary.notStarted} not started</Badge>
          <span className="ml-auto">Amber below {th.warn}%, red below {th.alert}%</span>
        </div>
      )}

      <Card>
        <DataTable<Row>
          rows={rows}
          columns={columns}
          loading={q.isLoading}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          sort={sort}
          onSort={setSort}
          onRowClick={(r) => open(r.employee.id)}
          storageKey="tracking.team"
          empty={<div className="px-6 py-14 text-center"><Activity size={28} strokeWidth={1.75} className="mx-auto mb-3 text-ink-3" /><div className="text-base font-semibold text-ink">No employees in view</div><div className="mt-1 text-sm text-ink-2">Adjust the department or team filter.</div></div>}
          rowActions={(r) => (
            <Tooltip label="Open timeline">
              <Button size="sm" variant="ghost" aria-label="Open timeline" onClick={() => open(r.employee.id)}><ExternalLink size={14} /></Button>
            </Tooltip>
          )}
        />
      </Card>
    </div>
  );
}
