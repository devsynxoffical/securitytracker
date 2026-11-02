'use client';

import { Suspense, useMemo, useState } from 'react';
import { Network, ChevronDown, ChevronRight, Building2, Users, Maximize2, Minimize2 } from 'lucide-react';
import { useIdParam } from '@/lib/useIdParam';
import { useOrgChart, type OrgNode } from '@/lib/queries/people';
import { Avatar, Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, SearchInput, Skeleton } from '@/components/ui';
import { KpiTile, Section, ViewTabs } from '@/components/ui/advanced';
import { BarList } from '@/components/ui/charts';
import { EmployeeDrawer } from '@/components/people/shared';
import { fullName } from '@/lib/format';

export default function OrgChartPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><OrgChart /></Suspense>;
}

function countTree(n: OrgNode): number {
  return n.reports.reduce((s, r) => s + 1 + countTree(r), 0);
}

function OrgChart() {
  const [id, setId] = useIdParam();
  const [view, setView] = useState<'reporting' | 'departments'>('reporting');
  const [search, setSearch] = useState('');
  const [expandAll, setExpandAll] = useState<boolean | null>(null);
  const q = useOrgChart();
  const managers = useMemo(() => { let n = 0; const walk = (x: OrgNode) => { if (x.reports.length) n += 1; x.reports.forEach(walk); }; (q.data?.tree ?? []).forEach(walk); return n; }, [q.data]);
  const depth = useMemo(() => { const d = (x: OrgNode): number => 1 + Math.max(0, ...x.reports.map(d)); return Math.max(0, ...(q.data?.tree ?? []).map(d)); }, [q.data]);
  const matches = (n: OrgNode): boolean => { const s = search.trim().toLowerCase(); if (!s) return true; return `${n.firstName} ${n.lastName} ${n.code} ${n.role.name} ${n.profile?.designation ?? ''} ${n.department?.name ?? ''}`.toLowerCase().includes(s) || n.reports.some(matches); };
  return (
    <div>
      <PageHeader title="Org chart" subtitle="Reporting lines from the manager field; departments and teams from the structure (FR-HR-14)" actions={<SearchInput className="w-64" value={search} onChange={setSearch} placeholder="Find a person…" />} />
      <div className="mb-4 grid grid-cols-4 gap-3">
        <KpiTile label="Active employees" value={q.data?.total ?? '—'} loading={q.isLoading} icon={<Users size={14} />} />
        <KpiTile label="Managers" value={managers} loading={q.isLoading} icon={<Network size={14} />} />
        <KpiTile label="Reporting depth" value={depth} loading={q.isLoading} />
        <KpiTile label="Departments" value={q.data?.departments.length ?? '—'} loading={q.isLoading} icon={<Building2 size={14} />} onClick={() => setView('departments')} />
      </div>
      <Card>
        <div className="flex items-center justify-between pr-3">
          <ViewTabs value={view} onChange={setView} views={[{ value: 'reporting', label: 'Reporting lines' }, { value: 'departments', label: 'Departments' }]} />
          {view === 'reporting' && <div className="flex gap-1"><Button size="sm" variant="ghost" icon={<Maximize2 size={12} />} onClick={() => setExpandAll(true)}>Expand all</Button><Button size="sm" variant="ghost" icon={<Minimize2 size={12} />} onClick={() => setExpandAll(false)}>Collapse</Button></div>}
        </div>
        <div className="p-4">
          {q.isLoading && <Skeleton className="h-64" />}
          {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
          {q.data && q.data.total === 0 && <EmptyState icon={<Network size={20} />} title="No employees" body="Add employees and set their managers to build the chart." />}
          {q.data && q.data.total > 0 && view === 'reporting' && <div className="space-y-1">{q.data.tree.filter(matches).map((n) => <Node key={`${n.id}-${String(expandAll)}`} node={n} depth={0} onOpen={setId} forceOpen={expandAll} filter={matches} />)}</div>}
          {q.data && q.data.total > 0 && view === 'departments' && (
            <>
              <Section title="Headcount by department">
                <BarList data={q.data.departments.map((d) => ({ label: d.name, value: d._count.employees }))} series={0} format={(n) => `${n} people`} />
              </Section>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {q.data.departments.map((d) => (
                  <div key={d.id} className="rounded-card border border-line bg-surface p-4 shadow-card">
                    <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-base font-semibold text-ink"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-pri-soft text-pri"><Building2 size={14} /></span>{d.name}</div><Badge tone="gray">{d._count.employees} people</Badge></div>
                    <ul className="mt-3 divide-y divide-line-2">
                      {d.teams.length === 0 && <li className="py-1.5 text-xs text-ink-3">No teams</li>}
                      {d.teams.map((t) => <li key={t.id} className="flex items-center justify-between py-1.5 text-base"><span className="text-ink">{t.name}</span><span className="font-mono text-xs text-ink-2">{t._count.employees}</span></li>)}
                    </ul>
                  </div>
                ))}
                {q.data.departments.length === 0 && <EmptyState title="No departments" body="Create departments and teams under People → Departments & teams." />}
              </div>
            </>
          )}
        </div>
      </Card>
      <EmployeeDrawer id={id} onClose={() => setId(null)} />
    </div>
  );
}

function Node({ node, depth, onOpen, forceOpen, filter }: { node: OrgNode; depth: number; onOpen: (id: string) => void; forceOpen: boolean | null; filter: (n: OrgNode) => boolean }) {
  const [open, setOpen] = useState(forceOpen ?? depth < 2);
  const reports = node.reports.filter(filter);
  const has = reports.length > 0;
  const total = countTree(node);
  return (
    <div>
      <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-surface-2" style={{ marginLeft: depth * 24 }}>
        <button type="button" className={`rounded p-0.5 text-ink-3 hover:text-ink ${has ? '' : 'invisible'}`} onClick={() => setOpen((o) => !o)} aria-label={open ? 'Collapse' : 'Expand'}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => onOpen(node.id)}>
          <Avatar name={fullName(node)} size={30} />
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="truncate text-base font-semibold text-ink">{fullName(node)}</span><span className="font-mono text-2xs normal-case tracking-normal text-ink-3">{node.code}</span></div>
            <div className="truncate text-xs text-ink-2">{node.profile?.designation ?? node.role.name}{node.department ? ` · ${node.department.name}` : ''}{node.team ? ` · ${node.team.name}` : ''}</div>
          </div>
        </button>
        {node.reports.length > 0 && <Badge tone="gray" className="shrink-0"><Users size={10} /> {node.reports.length}{total !== node.reports.length ? ` / ${total}` : ''}</Badge>}
      </div>
      {open && has && <div className="border-l-2 border-line-2" style={{ marginLeft: depth * 24 + 15 }}>{reports.map((r) => <Node key={r.id} node={r} depth={depth + 1} onOpen={onOpen} forceOpen={forceOpen} filter={filter} />)}</div>}
    </div>
  );
}
