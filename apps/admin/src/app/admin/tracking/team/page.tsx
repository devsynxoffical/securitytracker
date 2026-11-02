'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { useTeamActivity } from '@/lib/queries/tracking';
import { Card, KpiCard, Table, Th, Td, TableSkeleton, EmptyState, ErrorBanner, PageHeader, Button } from '@/components/ui';
import { ActivityPercent, StatusBadge, CategoryBadge, OrgFilters, duration, clock, isoToday, shiftDate } from '@/components/tracking/shared';
import { fullName } from '@/lib/format';

export default function TeamActivityPage() {
  const [date, setDate] = useState(isoToday());
  const [org, setOrg] = useState({ departmentId: '', teamId: '' });
  const q = useTeamActivity({ date, departmentId: org.departmentId || undefined, teamId: org.teamId || undefined });
  const d = q.data;
  const th = d?.summary.thresholds ?? { warn: 50, alert: 30 };

  return (
    <div>
      <PageHeader
        title="Team activity"
        subtitle="Who is working right now, how active they are and what they spend time on. Refreshes every 30 seconds."
        actions={
          <>
            <OrgFilters departmentId={org.departmentId} teamId={org.teamId} onChange={setOrg} />
            <Button size="sm" variant="ghost" onClick={() => setDate(shiftDate(date, -1))}>‹</Button>
            <input type="date" value={date} max={isoToday()} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 rounded-lg border border-line bg-surface px-2 font-mono text-xs" />
            <Button size="sm" variant="ghost" onClick={() => setDate(shiftDate(date, 1))} disabled={date >= isoToday()}>›</Button>
          </>
        }
      />

      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}

      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-5">
        <KpiCard label="Working" value={d ? d.summary.working : '—'} tone="green" context={d ? `${d.summary.onBreak} on break` : undefined} />
        <KpiCard label="Offline" value={d ? d.summary.offline : '—'} tone="blue" context="heartbeat older than 2 min" />
        <KpiCard label="Not started" value={d ? d.summary.notStarted : '—'} tone="red" context={d ? `of ${d.summary.employees}` : undefined} />
        <KpiCard label="Tracked today" value={d ? duration(d.summary.trackedS) : '—'} />
        <KpiCard label="Team activity" value={d ? `${d.summary.activityPercent}%` : '—'} context={`amber below ${th.warn}%, red below ${th.alert}%`} />
      </div>

      <Card>
        {q.isLoading && <TableSkeleton rows={8} cols={7} />}
        {d && d.items.length === 0 && <EmptyState icon={<Activity size={28} strokeWidth={1.75} />} title="No employees in view" body="Adjust the department or team filter." />}
        {d && d.items.length > 0 && (
          <Table>
            <thead><tr><Th>Employee</Th><Th>Status</Th><Th>Started</Th><Th right>Tracked</Th><Th>Activity</Th><Th>Top app</Th><Th>Top site</Th></tr></thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.employee.id} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/admin/tracking/timeline?employeeId=${i.employee.id}&date=${date}`} className="font-semibold text-ink hover:text-pri">{fullName(i.employee)}</Link>
                    <div className="text-[11px] text-ink-3">{i.employee.department?.name ?? '—'}{i.employee.team ? ` · ${i.employee.team.name}` : ''}</div>
                  </Td>
                  <Td><StatusBadge status={i.status} /></Td>
                  <Td mono>{clock(i.firstStart)}</Td>
                  <Td right mono>{i.trackedS ? duration(i.trackedS) : '—'}</Td>
                  <Td><ActivityPercent value={i.activityPercent} warn={th.warn} alert={th.alert} none={i.level === 'none'} /></Td>
                  <Td>{i.topApp ? <span className="inline-flex items-center gap-1.5 text-xs"><span className="truncate max-w-[160px]">{i.topApp.name}</span><CategoryBadge category={i.topApp.category} /><span className="font-mono text-ink-3">{duration(i.topApp.activeS)}</span></span> : <span className="text-ink-3">—</span>}</Td>
                  <Td>{i.topDomain ? <span className="inline-flex items-center gap-1.5 text-xs"><span className="truncate max-w-[160px]">{i.topDomain.domain}</span><CategoryBadge category={i.topDomain.category} /></span> : <span className="text-ink-3">—</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
