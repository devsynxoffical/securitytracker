'use client';

import { Suspense, useMemo, useState } from 'react';
import { Clock, Coffee, Moon, WifiOff, CircleDashed, Plane, RefreshCw } from 'lucide-react';
import { useIdParam } from '@/lib/useIdParam';
import { useLive, useOutToday, useDepartments, type LiveRow } from '@/lib/queries/people';
import { Avatar, Badge, Card, EmptyState, PageHeader, SearchInput, Skeleton } from '@/components/ui';
import { DataTable, FilterChip, KpiTile, ViewTabs, type Column, type SortState } from '@/components/ui/advanced';
import { EmployeeDrawer, hours, liveTone, OptionList } from '@/components/people/shared';
import { dateTime, fullName, relative } from '@/lib/format';

type Filter = 'all' | 'working' | 'break' | 'idle' | 'offline' | 'not_started';

const match = (filter: Filter, s: string) =>
  filter === 'all' ||
  (filter === 'working' && s.startsWith('Working')) ||
  (filter === 'break' && s.startsWith('On break')) ||
  (filter === 'idle' && s.startsWith('Idle')) ||
  (filter === 'offline' && s.startsWith('Offline')) ||
  (filter === 'not_started' && s === 'Not started');

export default function LivePage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Live /></Suspense>;
}

function Live() {
  const [id, setId] = useIdParam();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'status', direction: 'asc' });
  const q = useLive();
  const out = useOutToday();
  const departments = useDepartments();
  const all = q.data ?? [];
  const count = (f: Filter) => all.filter((r) => match(f, r.liveStatus)).length;

  const rows = useMemo(() => {
    const list = all.filter((r) => match(filter, r.liveStatus) && (!department || r.department === department) && (!search || `${r.name} ${r.code} ${r.department} ${r.team}`.toLowerCase().includes(search.toLowerCase())));
    const order = (s: string) => (s.startsWith('Working') ? 0 : s.startsWith('On break') ? 1 : s.startsWith('Idle') ? 2 : s.startsWith('Offline') ? 3 : 4);
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case 'name': return a.name.localeCompare(b.name) * dir;
        case 'department': return a.department.localeCompare(b.department) * dir;
        case 'active': return (a.activeSeconds - b.activeSeconds) * dir;
        case 'checkin': return ((a.checkInAt ?? '').localeCompare(b.checkInAt ?? '')) * dir;
        default: return (order(a.liveStatus) - order(b.liveStatus)) * dir || a.name.localeCompare(b.name);
      }
    });
  }, [all, filter, department, search, sort]);

  const cols: Column<LiveRow & { id: string }>[] = [
    { key: 'name', header: 'Employee', sortable: true, locked: true, cell: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.name} size={28} /><div className="min-w-0"><div className="truncate font-semibold text-ink">{r.name}</div><div className="font-mono text-xs text-ink-3">{r.code}</div></div></div> },
    { key: 'department', header: 'Department', sortable: true, cell: (r) => <>{r.department || <span className="text-ink-3">—</span>}{r.team && <div className="text-xs text-ink-3">{r.team}</div>}</> },
    { key: 'status', header: 'Status', sortable: true, cell: (r) => <Badge tone={liveTone(r.liveStatus)} dot>{r.liveStatus === 'Offline' && r.lastSeenAt ? `Offline (last seen ${new Date(r.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : r.liveStatus}</Badge> },
    { key: 'checkin', header: 'Check-in', sortable: true, mono: true, cell: (r) => (r.checkInAt ? dateTime(r.checkInAt) : <span className="text-ink-3">—</span>) },
    { key: 'active', header: 'Active', sortable: true, right: true, mono: true, cell: (r) => (r.checkInAt ? hours(r.activeSeconds) : <span className="text-ink-3">—</span>) },
    { key: 'break', header: 'Break', right: true, mono: true, cell: (r) => (r.checkInAt ? hours(r.breakSeconds) : <span className="text-ink-3">—</span>) },
  ];

  const deptOptions = useMemo(() => Array.from(new Set(all.map((r) => r.department).filter(Boolean))).sort().map((d) => ({ value: d, label: d })), [all]);

  return (
    <div>
      <PageHeader title="Live attendance" subtitle={<span className="inline-flex items-center gap-1.5"><RefreshCw size={12} className={q.isFetching ? 'animate-spin text-pri' : 'text-ink-3'} />Refreshes every 15 s · updated {q.dataUpdatedAt ? relative(new Date(q.dataUpdatedAt)) : '—'}</span>} />
      <div className="mb-4 grid grid-cols-6 gap-3">
        <KpiTile label="Working" value={count('working')} tone="green" loading={q.isLoading} icon={<Clock size={14} />} onClick={() => setFilter('working')} />
        <KpiTile label="On break" value={count('break')} tone="amber" loading={q.isLoading} icon={<Coffee size={14} />} onClick={() => setFilter('break')} />
        <KpiTile label="Idle" value={count('idle')} tone="amber" loading={q.isLoading} icon={<Moon size={14} />} onClick={() => setFilter('idle')} />
        <KpiTile label="Offline" value={count('offline')} tone="blue" loading={q.isLoading} icon={<WifiOff size={14} />} onClick={() => setFilter('offline')} />
        <KpiTile label="Not started" value={count('not_started')} tone="gray" loading={q.isLoading} icon={<CircleDashed size={14} />} onClick={() => setFilter('not_started')} />
        <KpiTile label="On leave today" value={out.data?.items.length ?? '—'} tone="violet" loading={out.isLoading} icon={<Plane size={14} />} />
      </div>
      <Card>
        <ViewTabs value={filter} onChange={setFilter} views={[
          { value: 'all', label: 'All', count: all.length }, { value: 'working', label: 'Working', count: count('working') }, { value: 'break', label: 'On break', count: count('break') }, { value: 'idle', label: 'Idle', count: count('idle') }, { value: 'offline', label: 'Offline', count: count('offline') }, { value: 'not_started', label: 'Not started', count: count('not_started') },
        ]} />
        <div className="flex flex-wrap items-center gap-2 border-b border-line-2 px-3 py-2.5">
          <SearchInput className="w-64" value={search} onChange={setSearch} />
          <FilterChip label="Department" value={department || undefined} onClear={() => setDepartment('')}>
            <OptionList value={department} onChange={setDepartment} options={deptOptions.length ? deptOptions : (departments.data ?? []).map((d) => ({ value: d.name, label: d.name }))} />
          </FilterChip>
        </div>
        <DataTable
          rows={rows.map((r) => ({ ...r, id: r.employeeId }))}
          columns={cols}
          loading={q.isLoading}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          sort={sort}
          onSort={setSort}
          onRowClick={(r) => setId(r.employeeId)}
          storageKey="people.live"
          empty={<EmptyState icon={<Clock size={20} />} title="Nobody matches" body="Employees appear here once they start a shift in the desktop app." />}
        />
      </Card>
      {out.data && out.data.items.length > 0 && (
        <Card className="mt-4" title="Out today" actions={<span className="text-xs text-ink-3">{out.data.upcomingThisWeek} more this week</span>}>
          <div className="flex flex-wrap gap-2 p-4">{out.data.items.map((r) => <span key={r.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-sm"><Avatar name={fullName(r.employee)} size={18} />{fullName(r.employee)}<span className="h-2 w-2 rounded-full" style={{ background: r.leaveType?.colour ?? 'var(--violet)' }} /><span className="text-ink-2">{r.leaveType?.name}</span></span>)}</div>
        </Card>
      )}
      <EmployeeDrawer id={id} onClose={() => setId(null)} />
    </div>
  );
}
