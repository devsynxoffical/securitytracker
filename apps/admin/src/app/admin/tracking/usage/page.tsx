'use client';

import { useState } from 'react';
import { Globe } from 'lucide-react';
import { useUsage, useUsageEmployees, type UsageItem } from '@/lib/queries/tracking';
import { Card, KpiCard, Table, Th, Td, TableSkeleton, EmptyState, ErrorBanner, PageHeader, Segmented, Select, Drawer, Skeleton } from '@/components/ui';
import { OrgFilters, PeriodPicker, usePeriod, CategoryBadge, duration } from '@/components/tracking/shared';
import { fullName } from '@/lib/format';

export default function UsagePage() {
  const [type, setType] = useState<'apps' | 'domains'>('apps');
  const [category, setCategory] = useState('');
  const [org, setOrg] = useState({ departmentId: '', teamId: '' });
  const period = usePeriod('week');
  const [drill, setDrill] = useState<UsageItem | null>(null);
  const params = { from: period.period.from, to: period.period.to, departmentId: org.departmentId || undefined, teamId: org.teamId || undefined, category: category || undefined };
  const q = useUsage(type, params);
  const keyOf = (i: UsageItem) => (type === 'apps' ? i.processName! : i.domain!);
  const drillQ = useUsageEmployees({ type: type === 'apps' ? 'app' : 'domain', key: drill ? keyOf(drill) : '', from: params.from, to: params.to, departmentId: params.departmentId, teamId: params.teamId }, Boolean(drill));
  const d = q.data;
  const byCat = (c: string) => (d?.items ?? []).filter((i) => i.category === c).reduce((a, i) => a + i.activeS, 0);

  return (
    <div>
      <PageHeader title="Apps & URLs" subtitle="Time per application and website across the selected employees. Click a row to see who used it." actions={<><OrgFilters departmentId={org.departmentId} teamId={org.teamId} onChange={setOrg} /><div className="w-40"><Select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option><option value="productive">Productive</option><option value="neutral">Neutral</option><option value="unproductive">Unproductive</option></Select></div></>} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented value={type} onChange={setType} options={[{ value: 'apps', label: 'Applications' }, { value: 'domains', label: 'Websites' }]} />
        <PeriodPicker {...period} />
      </div>
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <KpiCard label="Total active" value={d ? duration(d.totalActiveS) : '—'} />
        <KpiCard label="Productive" value={d ? duration(byCat('productive')) : '—'} tone="green" />
        <KpiCard label="Neutral" value={d ? duration(byCat('neutral')) : '—'} />
        <KpiCard label="Unproductive" value={d ? duration(byCat('unproductive')) : '—'} tone="red" />
      </div>
      <Card>
        {q.isLoading && <TableSkeleton rows={10} cols={5} />}
        {d && d.items.length === 0 && <EmptyState icon={<Globe size={28} strokeWidth={1.75} />} title="No usage in this period" body="Nothing was tracked for the selected employees and dates." />}
        {d && d.items.length > 0 && (
          <Table>
            <thead><tr><Th>{type === 'apps' ? 'Application' : 'Website'}</Th><Th>Category</Th><Th right>Active</Th><Th right>Share</Th><Th right>Employees</Th></tr></thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={keyOf(i)} className="cursor-pointer hover:bg-surface-2" onClick={() => setDrill(i)}>
                  <Td><div className="font-semibold text-ink">{type === 'apps' ? i.appName : i.domain}</div>{type === 'apps' && <div className="font-mono text-[11px] text-ink-3">{i.processName}</div>}</Td>
                  <Td><CategoryBadge category={i.category} /></Td>
                  <Td right mono>{duration(i.activeS)}</Td>
                  <Td right><span className="inline-flex items-center gap-2"><span className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-soft"><span className="block h-full rounded-full bg-pri" style={{ width: `${Math.min(100, i.share)}%` }} /></span><span className="font-mono text-xs">{i.share}%</span></span></Td>
                  <Td right mono>{i.employees}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Drawer open={Boolean(drill)} onClose={() => setDrill(null)} title={drill ? (type === 'apps' ? drill.appName ?? '' : drill.domain ?? '') : ''} subtitle={drill ? `${duration(drill.activeS)} active · ${period.period.from} → ${period.period.to}` : undefined} width={520}>
        {drillQ.isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
        {drillQ.isError && <ErrorBanner message={(drillQ.error as Error).message} onRetry={() => drillQ.refetch()} />}
        {drillQ.data && (
          <Table>
            <thead><tr><Th>Employee</Th><Th right>Days</Th><Th right>Active</Th></tr></thead>
            <tbody>{drillQ.data.map((r) => <tr key={r.employeeId}><Td className="font-semibold">{r.employee ? fullName(r.employee) : r.employeeId}</Td><Td right mono>{r.days}</Td><Td right mono>{duration(r.activeS)}</Td></tr>)}</tbody>
          </Table>
        )}
      </Drawer>
    </div>
  );
}
