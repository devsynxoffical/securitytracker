'use client';

import { useState } from 'react';
import { Tags, Check } from 'lucide-react';
import { http } from '@/lib/api';
import { useUncategorised, useTrackingMutation } from '@/lib/queries/tracking';
import { useEmployees } from '@/lib/queries/crm';
import { Card, Table, Th, Td, TableSkeleton, EmptyState, ErrorBanner, PageHeader, Segmented, Select, Button, Checkbox, BulkBar, useToast } from '@/components/ui';
import { PeriodPicker, usePeriod, duration } from '@/components/tracking/shared';

type Cat = 'productive' | 'neutral' | 'unproductive';

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
  const departments = Array.from(new Map((employees.data ?? []).map((e) => e.department).filter(Boolean).map((d) => [d!.id, d!])).values());
  const categorise = useTrackingMutation((items: Array<{ type: 'app' | 'domain'; pattern: string; category: Cat; departmentId?: string }>) => http.post('/tracking/uncategorised/categorise', { items }));
  const items = q.data?.items ?? [];

  const apply = (keys: string[], cat?: Cat) => {
    const payload = keys.map((k) => ({ type, pattern: k, category: cat ?? choice[k] ?? 'neutral', departmentId: departmentId || undefined }));
    categorise.mutate(payload, {
      onSuccess: () => { toast.push('success', `${payload.length} rule${payload.length === 1 ? '' : 's'} created`); setSelected(new Set()); },
      onError: (e) => toast.push('error', (e as Error).message),
    });
  };
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div>
      <PageHeader title="Uncategorised" subtitle="Apps and websites with time tracked but no productivity rule, most used first. Categorising creates a rule and re-labels existing data." actions={<div className="w-56"><Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">Company-wide rule</option>{departments.map((d) => <option key={d.id} value={d.id}>Only {d.name}</option>)}</Select></div>} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented value={type} onChange={(v) => { setType(v); setSelected(new Set()); }} options={[{ value: 'app', label: 'Applications' }, { value: 'domain', label: 'Websites' }]} />
        <PeriodPicker {...period} modes={['week', 'month']} />
      </div>
      {selected.size > 0 && (
        <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
          <div className="w-40"><Select value={bulkCat} onChange={(e) => setBulkCat(e.target.value as Cat)}><option value="productive">Productive</option><option value="neutral">Neutral</option><option value="unproductive">Unproductive</option></Select></div>
          <Button size="sm" variant="primary" icon={<Check size={13} />} loading={categorise.isPending} onClick={() => apply(Array.from(selected), bulkCat)}>Categorise selected</Button>
        </BulkBar>
      )}
      <Card>
        {q.isLoading && <TableSkeleton rows={8} cols={5} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && items.length === 0 && <EmptyState icon={<Tags size={28} strokeWidth={1.75} />} title="Everything is categorised" body="Every app and website seen in this period matches a rule." />}
        {items.length > 0 && (
          <Table>
            <thead><tr><Th><Checkbox checked={selected.size === items.length} onChange={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.key)))} /></Th><Th>{type === 'app' ? 'Application' : 'Website'}</Th><Th right>Active</Th><Th right>Employees</Th><Th>Category</Th><Th /></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.key} className="hover:bg-surface-2">
                  <Td><Checkbox checked={selected.has(i.key)} onChange={() => toggle(i.key)} /></Td>
                  <Td><div className="font-semibold">{i.label}</div>{type === 'app' && <div className="font-mono text-[11px] text-ink-3">{i.key}</div>}</Td>
                  <Td right mono>{duration(i.activeS)}</Td>
                  <Td right mono>{i.employees}</Td>
                  <Td><div className="w-36"><Select value={choice[i.key] ?? 'neutral'} onChange={(e) => setChoice((c) => ({ ...c, [i.key]: e.target.value as Cat }))}><option value="productive">Productive</option><option value="neutral">Neutral</option><option value="unproductive">Unproductive</option></Select></div></Td>
                  <Td right><Button size="sm" onClick={() => apply([i.key])} loading={categorise.isPending}>Save rule</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
