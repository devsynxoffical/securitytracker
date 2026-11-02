'use client';

import { Suspense, useState } from 'react';
import { Network, ChevronDown, ChevronRight } from 'lucide-react';
import { useIdParam } from '@/lib/useIdParam';
import { useOrgChart, type OrgNode } from '@/lib/queries/people';
import { Avatar, Badge, Card, EmptyState, ErrorBanner, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { EmployeeDrawer } from '@/components/people/shared';
import { fullName } from '@/lib/format';

export default function OrgChartPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><OrgChart /></Suspense>;
}

function OrgChart() {
  const [id, setId] = useIdParam();
  const [view, setView] = useState<'reporting' | 'departments'>('reporting');
  const q = useOrgChart();
  return (
    <div>
      <PageHeader title="Org chart" subtitle={q.data ? `${q.data.total} active employees` : undefined} actions={<Segmented value={view} onChange={setView} options={[{ value: 'reporting', label: 'Reporting lines' }, { value: 'departments', label: 'Departments' }]} />} />
      <Card>
        {q.isLoading && <Skeleton className="h-64" />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && q.data.total === 0 && <EmptyState icon={<Network size={20} />} title="No employees" body="Add employees and set their managers to build the chart." />}
        {q.data && q.data.total > 0 && view === 'reporting' && <div className="space-y-1">{q.data.tree.map((n) => <Node key={n.id} node={n} depth={0} onOpen={setId} />)}</div>}
        {q.data && q.data.total > 0 && view === 'departments' && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {q.data.departments.map((d) => (
              <div key={d.id} className="rounded-card border border-line p-3">
                <div className="flex items-center justify-between"><div className="text-[13px] font-semibold">{d.name}</div><Badge tone="gray">{d._count.employees} people</Badge></div>
                <ul className="mt-2 space-y-1">{d.teams.length === 0 && <li className="text-xs text-ink-3">No teams</li>}{d.teams.map((t) => <li key={t.id} className="flex items-center justify-between text-[13px]"><span>{t.name}</span><span className="font-mono text-xs text-ink-3">{t._count.employees}</span></li>)}</ul>
              </div>
            ))}
            {q.data.departments.length === 0 && <EmptyState title="No departments" body="Create departments and teams under People → Departments & teams." />}
          </div>
        )}
      </Card>
      <EmployeeDrawer id={id} onClose={() => setId(null)} />
    </div>
  );
}

function Node({ node, depth, onOpen }: { node: OrgNode; depth: number; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(depth < 2);
  const has = node.reports.length > 0;
  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2" style={{ marginLeft: depth * 24 }}>
        <button type="button" className={`text-ink-3 ${has ? '' : 'invisible'}`} onClick={() => setOpen((o) => !o)} aria-label={open ? 'Collapse' : 'Expand'}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onOpen(node.id)}>
          <Avatar name={fullName(node)} size={26} />
          <span className="truncate text-[13px] font-semibold">{fullName(node)}</span>
          <span className="truncate text-xs text-ink-3">{node.profile?.designation ?? node.role.name}{node.department ? ` · ${node.department.name}` : ''}</span>
        </button>
        {has && <Badge tone="gray">{node.reports.length}</Badge>}
      </div>
      {open && has && <div className="border-l border-line-2" style={{ marginLeft: depth * 24 + 15 }}>{node.reports.map((r) => <Node key={r.id} node={r} depth={depth + 1} onOpen={onOpen} />)}</div>}
    </div>
  );
}
