'use client';

import { Suspense, useState } from 'react';
import { Gauge } from 'lucide-react';
import { useSpaces, useWorkload } from '@/lib/queries/tasks';
import { Card, Table, Th, Td, Select, Skeleton, TableSkeleton, EmptyState, ErrorBanner, PageHeader, KpiCard, Avatar, Badge } from '@/components/ui';
import { fmtDuration } from '@/components/tasks/shared';
import { fullName } from '@/lib/format';

export default function WorkloadPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Workload />
    </Suspense>
  );
}

function Workload() {
  const [spaceId, setSpaceId] = useState('');
  const spaces = useSpaces();
  const q = useWorkload(spaceId || undefined);
  const items = q.data?.items ?? [];
  const maxOpen = Math.max(1, ...items.map((i) => i.open));
  const totals = items.reduce((a, i) => ({ open: a.open + i.open, overdue: a.overdue + i.overdue, est: a.est + i.estimateS, spent: a.spent + i.spentS }), { open: 0, overdue: 0, est: 0, spent: 0 });
  return (
    <div>
      <PageHeader title="Workload" subtitle="Open tasks and estimates per assignee (FR-TASK-13)" actions={<div className="w-52"><Select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}><option value="">All spaces</option>{spaces.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="People with open tasks" value={q.data ? items.length : '—'} />
        <KpiCard label="Open tasks" value={q.data ? totals.open : '—'} />
        <KpiCard label="Overdue" value={q.data ? totals.overdue : '—'} tone={totals.overdue ? 'red' : 'green'} />
        <KpiCard label="Estimated / spent" value={q.data ? `${fmtDuration(totals.est)} / ${fmtDuration(totals.spent)}` : '—'} />
      </div>
      <Card className="!p-0 overflow-hidden">
        {q.isLoading && <TableSkeleton rows={6} cols={6} />}
        {q.isError && <div className="p-4"><ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} /></div>}
        {q.data && items.length === 0 && <EmptyState icon={<Gauge size={22} />} title="No open tasks" body="Workload appears once tasks are assigned." />}
        {items.length > 0 && (
          <Table>
            <thead><tr><Th>Employee</Th><Th>Load</Th><Th right>Open</Th><Th right>In progress</Th><Th right>Overdue</Th><Th right>Urgent</Th><Th right>Estimate</Th><Th right>Spent</Th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.employee.id} className="hover:bg-surface-2">
                  <Td><div className="flex items-center gap-2"><Avatar name={fullName(r.employee)} size={24} /><div><div className="font-medium">{fullName(r.employee)}</div><div className="text-xs text-ink-3">{r.employee.team?.name ?? r.employee.code}</div></div></div></Td>
                  <Td><div className="h-2 w-40 overflow-hidden rounded bg-gray-soft"><div className={r.overdue ? 'h-full bg-amber-bar' : 'h-full bg-pri'} style={{ width: `${(r.open / maxOpen) * 100}%` }} /></div></Td>
                  <Td right mono>{r.open}</Td>
                  <Td right mono>{r.inProgress}</Td>
                  <Td right>{r.overdue ? <Badge tone="red">{r.overdue}</Badge> : <span className="font-mono text-ink-3">0</span>}</Td>
                  <Td right>{r.urgent ? <Badge tone="amber">{r.urgent}</Badge> : <span className="font-mono text-ink-3">0</span>}</Td>
                  <Td right mono>{fmtDuration(r.estimateS)}</Td>
                  <Td right mono>{fmtDuration(r.spentS)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
