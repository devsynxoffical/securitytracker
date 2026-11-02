'use client';

import { useMemo, useState } from 'react';
import { Tags, Check } from 'lucide-react';
import { http } from '@/lib/api';
import { useUncategorised, useTrackingMutation, type UncategorisedItem } from '@/lib/queries/tracking';
import { useEmployees } from '@/lib/queries/crm';
import { Card, PageHeader, Segmented, Select, Button, BulkBar, useToast, Badge } from '@/components/ui';
import { DataTable, FilterChip, KpiTile, type Column } from '@/components/ui/advanced';
import { PeriodPicker, usePeriod, duration } from '@/components/tracking/shared';

type Cat = 'productive' | 'neutral' | 'unproductive';
type Row = UncategorisedItem & { id: string };

export default function UncategorisedPage() {
  const toast = useToast();
  const [type, setType] = useState<'app' | 'domain'>('app');
  const period = usePeriod('month');
  const q = useUncategorised({ from: period.period.from, to: period.period.to, type });
  const [choice, setChoice] = useState<Record<string, Cat>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState<Cat>('productive');
  const [departmentId, setDepartmentId] = useState('');
  const employees = useEmployees();
  const departments = useMemo(() => Array.from(new Map((employees.data ?? []).map((e) => e.department).filter(Boolean).map((d) => [d!.id, d!])).values()), [employees.data]);
  const categorise = useTrackingMutation((items: Array<{ type: 'app' | 'domain'; pattern: string; category: Cat; departmentId?: string }>) => http.post('/tracking/uncategorised/categorise', { items }));
  const rows = useMemo<Row[]>(() => (q.data?.items ?? []).map((i) => ({ ...i, id: i.key })), [q.data]);
  const totalS = rows.reduce((a, r) => a + r.activeS, 0);
  const touched = Object.keys(choice).filter((k) => rows.some((r) => r.key === k));

  const apply = (keys: string[], cat?: Cat) => {
    const payload = keys.map((k) => ({ type, pattern: k, category: cat ?? choice[k] ?? 'neutral', departmentId: departmentId || undefined }));
    categorise.mutate(payload, {
      onSuccess: () => { toast.push('success', `${payload.length} rule${payload.length === 1 ? '' : 's'} created`); setSelected(new Set()); setChoice((c) => { const n = { ...c }; keys.forEach((k) => delete n[k]); return n; }); },
      onError: (e) => toast.push('error', (e as Error).message),
    });
  };

  const columns: Column<Row>[] = [
    { key: 'label', header: type === 'app' ? 'Application' : 'Website', locked: true, cell: (i) => <div><div className="font-semibold text-ink">{i.label}</div>{type === 'app' && <div className="font-mono text-xs text-ink-3">{i.key}</div>}</div> },
    { key: 'active', header: 'Active time', right: true, mono: true, cell: (i) => duration(i.activeS) },
    { key: 'share', header: 'Share', right: true, mono: true, cell: (i) => `${totalS ? Math.round((i.activeS / totalS) * 100) : 0}%` },
    { key: 'employees', header: 'Employees', right: true, mono: true, cell: (i) => i.employees },
    {
      key: 'category', header: 'Category',
      cell: (i) => (
        <div className="w-40" onClick={(e) => e.stopPropagation()}>
          <Select value={choice[i.key] ?? ''} onChange={(e) => setChoice((c) => ({ ...c, [i.key]: e.target.value as Cat }))}>
            <option value="">Choose…</option><option value="productive">Productive</option><option value="neutral">Neutral</option><option value="unproductive">Unproductive</option>
          </Select>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Uncategorised"
        subtitle="Apps and websites with time tracked but no productivity rule, most used first. Categorising creates a rule and re-labels existing data."
        actions={
          <>
            <FilterChip label="Applies to" value={departmentId ? `Only ${departments.find((d) => d.id === departmentId)?.name ?? 'department'}` : 'Company-wide'} active={Boolean(departmentId)} onClear={() => setDepartmentId('')}>
              <button type="button" onClick={() => setDepartmentId('')} className="block w-full rounded px-2 py-1.5 text-left text-base text-ink hover:bg-surface-2">Company-wide rule</button>
              {departments.map((d) => <button key={d.id} type="button" onClick={() => setDepartmentId(d.id)} className="block w-full rounded px-2 py-1.5 text-left text-base text-ink hover:bg-surface-2">Only {d.name}</button>)}
            </FilterChip>
            {touched.length > 0 && <Button variant="primary" icon={<Check size={14} />} loading={categorise.isPending} onClick={() => apply(touched)}>Save {touched.length} rule{touched.length === 1 ? '' : 's'}</Button>}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented value={type} onChange={(v) => { setType(v); setSelected(new Set()); setChoice({}); }} options={[{ value: 'app', label: 'Applications' }, { value: 'domain', label: 'Websites' }]} />
        <PeriodPicker {...period} modes={['week', 'month']} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-3">
        <KpiTile label="Uncategorised items" value={q.data ? rows.length : '—'} tone={rows.length > 0 ? 'amber' : 'green'} loading={q.isLoading} icon={<Tags size={15} />} />
        <KpiTile label="Unlabelled time" value={q.data ? duration(totalS) : '—'} loading={q.isLoading} />
        <KpiTile label="Ready to save" value={touched.length} tone={touched.length ? 'primary' : undefined} />
      </div>
      <Card>
        {selected.size > 0 && (
          <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
            <div className="w-40"><Select value={bulkCat} onChange={(e) => setBulkCat(e.target.value as Cat)}><option value="productive">Productive</option><option value="neutral">Neutral</option><option value="unproductive">Unproductive</option></Select></div>
            <Button size="sm" variant="primary" icon={<Check size={13} />} loading={categorise.isPending} onClick={() => apply(Array.from(selected), bulkCat)}>Categorise selected</Button>
            {departmentId && <Badge tone="blue">department override</Badge>}
          </BulkBar>
        )}
        <DataTable<Row>
          rows={rows}
          columns={columns}
          loading={q.isLoading}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          selected={selected}
          onSelect={setSelected}
          storageKey="tracking.uncategorised"
          empty={<div className="px-6 py-14 text-center"><Tags size={28} strokeWidth={1.75} className="mx-auto mb-3 text-ink-3" /><div className="text-base font-semibold text-ink">Everything is categorised</div><div className="mt-1 text-sm text-ink-2">Every app and website seen in this period matches a rule.</div></div>}
          rowActions={(i) => (
            <Button size="sm" disabled={!choice[i.key]} loading={categorise.isPending} onClick={() => apply([i.key])}>Save rule</Button>
          )}
        />
      </Card>
    </div>
  );
}
