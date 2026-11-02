'use client';

import { Suspense, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { useIdParam } from '@/lib/useIdParam';
import { useLive, useOutToday } from '@/lib/queries/people';
import { Avatar, Badge, Card, EmptyState, ErrorBanner, KpiCard, PageHeader, SearchInput, Segmented, Skeleton, Table, TableSkeleton, Td, Th } from '@/components/ui';
import { EmployeeDrawer, hours, liveTone } from '@/components/people/shared';
import { dateTime, fullName } from '@/lib/format';

type Filter = 'all' | 'working' | 'break' | 'offline' | 'not_started';

export default function LivePage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Live /></Suspense>;
}

function Live() {
  const [id, setId] = useIdParam();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const q = useLive();
  const out = useOutToday();
  const rows = useMemo(() => (q.data ?? []).filter((r) => {
    const s = r.liveStatus;
    const ok = filter === 'all' || (filter === 'working' && s.startsWith('Working')) || (filter === 'break' && s.startsWith('On break')) || (filter === 'offline' && s.startsWith('Offline')) || (filter === 'not_started' && s === 'Not started');
    return ok && (!search || `${r.name} ${r.code} ${r.department} ${r.team}`.toLowerCase().includes(search.toLowerCase()));
  }), [q.data, filter, search]);
  const count = (pred: (s: string) => boolean) => (q.data ?? []).filter((r) => pred(r.liveStatus)).length;

  return (
    <div>
      <PageHeader title="Live attendance" subtitle="Refreshes every 15 seconds" />
      <div className="mb-4 grid grid-cols-5 gap-3">
        <KpiCard label="Working" value={count((s) => s.startsWith('Working'))} tone="green" />
        <KpiCard label="On break" value={count((s) => s.startsWith('On break'))} tone="amber" />
        <KpiCard label="Offline" value={count((s) => s.startsWith('Offline'))} tone="blue" />
        <KpiCard label="Not started" value={count((s) => s === 'Not started')} tone="gray" />
        <KpiCard label="On leave today" value={out.data?.items.length ?? '—'} tone="violet" context={out.data ? `${out.data.upcomingThisWeek} upcoming this week` : undefined} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'working', label: 'Working' }, { value: 'break', label: 'On break' }, { value: 'offline', label: 'Offline' }, { value: 'not_started', label: 'Not started' }]} />
        <SearchInput className="w-64" value={search} onChange={setSearch} />
      </div>
      <Card>
        {q.isLoading && <TableSkeleton cols={6} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && rows.length === 0 && <EmptyState icon={<Clock size={20} />} title="Nobody matches" body="Employees appear here once they start a shift in the desktop app." />}
        {rows.length > 0 && (
          <Table>
            <thead><tr><Th>Employee</Th><Th>Department</Th><Th>Status</Th><Th>Check-in</Th><Th right>Active</Th><Th right>Break</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} className="cursor-pointer hover:bg-surface-2" onClick={() => setId(r.employeeId)}>
                  <Td><div className="flex items-center gap-2"><Avatar name={r.name} size={24} /><div><div className="font-semibold">{r.name}</div><div className="font-mono text-xs text-ink-3">{r.code}</div></div></div></Td>
                  <Td>{r.department}<div className="text-xs text-ink-3">{r.team}</div></Td>
                  <Td><Badge tone={liveTone(r.liveStatus)} dot>{r.liveStatus}</Badge></Td>
                  <Td mono>{r.checkInAt ? dateTime(r.checkInAt) : '—'}</Td>
                  <Td right mono>{r.checkInAt ? hours(r.activeSeconds) : '—'}</Td>
                  <Td right mono>{r.checkInAt ? hours(r.breakSeconds) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {out.data && out.data.items.length > 0 && (
        <Card className="mt-4" title="Out today">
          <div className="flex flex-wrap gap-2">{out.data.items.map((r) => <Badge key={r.id} tone="violet">{fullName(r.employee)} · {r.leaveType?.name}</Badge>)}</div>
        </Card>
      )}
      <EmployeeDrawer id={id} onClose={() => setId(null)} />
    </div>
  );
}
