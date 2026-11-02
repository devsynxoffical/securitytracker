'use client';

import { Suspense, useMemo, useState } from 'react';
import { Gauge, Users, ListTodo, AlertTriangle, Hourglass } from 'lucide-react';
import { useSpaces, useWorkload, type WorkloadRow } from '@/lib/queries/tasks';
import { Card, Select, Skeleton, EmptyState, ErrorBanner, PageHeader, Avatar, Badge } from '@/components/ui';
import { KpiTile, DataTable, Progress, type Column } from '@/components/ui/advanced';
import { BarList } from '@/components/ui/charts';
import { fmtDuration, fmtHours } from '@/components/tasks/shared';
import { fullName } from '@/lib/format';

export default function WorkloadPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Workload />
    </Suspense>
  );
}

type Row = WorkloadRow & { id: string };

function Workload() {
  const [spaceId, setSpaceId] = useState('');
  const spaces = useSpaces();
  const q = useWorkload(spaceId || undefined);
  const items: Row[] = useMemo(() => (q.data?.items ?? []).map((r) => ({ ...r, id: r.employee.id })), [q.data]);
  const totals = items.reduce((a, i) => ({ open: a.open + i.open, overdue: a.overdue + i.overdue, est: a.est + i.estimateS, spent: a.spent + i.spentS }), { open: 0, overdue: 0, est: 0, spent: 0 });
  const byOpen = [...items].sort((a, b) => b.open - a.open).slice(0, 12).map((r) => ({ label: fullName(r.employee), value: r.open, meta: r.overdue ? `${r.overdue} overdue` : undefined }));
  const byEstimate = [...items].filter((r) => r.estimateS > 0).sort((a, b) => b.estimateS - a.estimateS).slice(0, 12).map((r) => ({ label: fullName(r.employee), value: Math.round((r.estimateS / 3600) * 10) / 10 }));

  const columns: Column<Row>[] = [
    { key: 'employee', header: 'Employee', locked: true, cell: (r) => <div className="flex items-center gap-2"><Avatar name={fullName(r.employee)} size={26} /><div className="leading-tight"><div className="font-medium text-ink">{fullName(r.employee)}</div><div className="text-xs text-ink-3">{r.employee.team?.name ?? r.employee.code}</div></div></div> },
    { key: 'load', header: 'Load', width: 220, cell: (r) => <Progress value={r.open} max={Math.max(1, ...items.map((i) => i.open))} tone={r.overdue ? 'amber' : 'primary'} size={6} label={`${r.open}`} /> },
    { key: 'inProgress', header: 'In progress', right: true, mono: true, cell: (r) => r.inProgress },
    { key: 'overdue', header: 'Overdue', right: true, cell: (r) => (r.overdue ? <Badge tone="red">{r.overdue}</Badge> : <span className="font-mono text-ink-3">0</span>) },
    { key: 'urgent', header: 'Urgent', right: true, cell: (r) => (r.urgent ? <Badge tone="amber">{r.urgent}</Badge> : <span className="font-mono text-ink-3">0</span>) },
    { key: 'capacity', header: 'Estimate vs spent', width: 220, cell: (r) => r.estimateS ? <Progress value={r.spentS} max={r.estimateS} tone={r.spentS > r.estimateS ? 'amber' : 'green'} size={6} label={`${fmtHours(r.spentS)} / ${fmtHours(r.estimateS)}`} /> : <span className="text-xs text-ink-3">No estimate</span> },
  ];

  return (
    <div>
      <PageHeader title="Workload" subtitle="Open tasks, overdue items and estimates per assignee" actions={<div className="w-56"><Select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}><option value="">All spaces</option>{spaces.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="People with open tasks" value={q.data ? items.length : '—'} icon={<Users size={14} />} loading={q.isLoading} />
        <KpiTile label="Open tasks" value={q.data ? totals.open : '—'} icon={<ListTodo size={14} />} loading={q.isLoading} />
        <KpiTile label="Overdue" value={q.data ? totals.overdue : '—'} tone={totals.overdue ? 'red' : 'green'} icon={<AlertTriangle size={14} />} loading={q.isLoading} />
        <KpiTile label="Estimated / spent" value={q.data ? `${fmtHours(totals.est)} / ${fmtHours(totals.spent)}` : '—'} icon={<Hourglass size={14} />} loading={q.isLoading} />
      </div>
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && items.length === 0 && <Card><EmptyState icon={<Gauge size={22} />} title="No open tasks" body="Workload appears once tasks are assigned." /></Card>}
      {items.length > 0 && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card title="Open tasks per person"><div className="p-4"><BarList data={byOpen} series={0} /></div></Card>
          <Card title="Estimated hours per person"><div className="p-4">{byEstimate.length ? <BarList data={byEstimate} series={3} format={(n) => `${n}h`} /> : <div className="py-6 text-center text-xs text-ink-3">No estimates on open tasks yet.</div>}</div></Card>
        </div>
      )}
      <Card className="overflow-hidden">
        <DataTable<Row> rows={items} columns={columns} loading={q.isLoading} storageKey="tasks.workload" empty={<EmptyState icon={<Gauge size={22} />} title="No open tasks" />} />
        {items.length > 0 && <div className="border-t border-line-2 bg-surface-2 px-4 py-2 text-xs text-ink-3">Totals: {totals.open} open · {totals.overdue} overdue · {fmtDuration(totals.est)} estimated · {fmtDuration(totals.spent)} spent</div>}
      </Card>
    </div>
  );
}
