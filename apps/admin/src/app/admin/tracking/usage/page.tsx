'use client';

import { Fragment, useMemo, useState } from 'react';
import { Globe, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useUsage, useUsageEmployees, type UsageItem } from '@/lib/queries/tracking';
import { Card, PageHeader, Segmented, Skeleton, Avatar, ErrorBanner, EmptyState, TableSkeleton } from '@/components/ui';
import { KpiTile, FilterChip, Progress } from '@/components/ui/advanced';
import { Donut } from '@/components/ui/charts';
import { OrgFilters, PeriodPicker, usePeriod, CategoryBadge, duration } from '@/components/tracking/shared';
import { fullName } from '@/lib/format';

const CATS = [{ value: 'productive', label: 'Productive' }, { value: 'neutral', label: 'Neutral' }, { value: 'unproductive', label: 'Unproductive' }];

export default function UsagePage() {
  const [type, setType] = useState<'apps' | 'domains'>('apps');
  const [category, setCategory] = useState('');
  const [org, setOrg] = useState({ departmentId: '', teamId: '' });
  const period = usePeriod('week');
  const [open, setOpen] = useState<string | null>(null);
  const params = { from: period.period.from, to: period.period.to, departmentId: org.departmentId || undefined, teamId: org.teamId || undefined, category: category || undefined };
  const q = useUsage(type, params);
  const d = q.data;
  const keyOf = (i: UsageItem) => (type === 'apps' ? i.processName! : i.domain!);
  const byCat = useMemo(() => (c: string) => (d?.items ?? []).filter((i) => i.category === c).reduce((a, i) => a + i.activeS, 0), [d]);

  return (
    <div>
      <PageHeader
        title="Apps & URLs"
        subtitle="Time per application and website across the selected employees. Expand a row to see who used it."
        actions={
          <>
            <OrgFilters departmentId={org.departmentId} teamId={org.teamId} onChange={setOrg} />
            <FilterChip label="Category" value={CATS.find((c) => c.value === category)?.label} onClear={() => setCategory('')}>
              {CATS.map((c) => (
                <button key={c.value} type="button" onClick={() => setCategory(c.value === category ? '' : c.value)} className={clsx('block w-full rounded px-2 py-1.5 text-left text-base', c.value === category ? 'bg-pri-soft text-pri-2' : 'text-ink hover:bg-surface-2')}>{c.label}</button>
              ))}
            </FilterChip>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented value={type} onChange={(v) => { setType(v); setOpen(null); }} options={[{ value: 'apps', label: 'Applications' }, { value: 'domains', label: 'Websites' }]} />
        <PeriodPicker {...period} />
      </div>
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      <div className="mb-4 grid gap-3.5 lg:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
          <KpiTile label="Total active" value={d ? duration(d.totalActiveS) : '—'} loading={q.isLoading} />
          <KpiTile label="Productive" value={d ? duration(byCat('productive')) : '—'} tone="green" loading={q.isLoading} />
          <KpiTile label="Neutral" value={d ? duration(byCat('neutral')) : '—'} loading={q.isLoading} />
          <KpiTile label="Unproductive" value={d ? duration(byCat('unproductive')) : '—'} tone="red" loading={q.isLoading} />
        </div>
        <Card className="p-4">
          {q.isLoading ? <Skeleton className="h-28" /> : <Donut size={110} data={[{ label: 'Productive', value: byCat('productive'), series: 2 }, { label: 'Neutral', value: byCat('neutral'), series: 3 }, { label: 'Unproductive', value: byCat('unproductive'), series: 7 }]} format={duration} />}
        </Card>
      </div>
      <Card>
        {q.isLoading && <TableSkeleton rows={10} cols={5} />}
        {d && d.items.length === 0 && <EmptyState icon={<Globe size={28} strokeWidth={1.75} />} title="No usage in this period" body="Nothing was tracked for the selected employees and dates." />}
        {d && d.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-base">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="w-8 bg-surface-2 px-3 py-2.5" />
                  <th className="bg-surface-2 px-3.5 py-2.5 text-left text-2xs font-semibold uppercase text-ink-3">{type === 'apps' ? 'Application' : 'Website'}</th>
                  <th className="bg-surface-2 px-3.5 py-2.5 text-left text-2xs font-semibold uppercase text-ink-3">Category</th>
                  <th className="bg-surface-2 px-3.5 py-2.5 text-right text-2xs font-semibold uppercase text-ink-3">Active</th>
                  <th className="w-56 bg-surface-2 px-3.5 py-2.5 text-left text-2xs font-semibold uppercase text-ink-3">Share</th>
                  <th className="bg-surface-2 px-3.5 py-2.5 text-right text-2xs font-semibold uppercase text-ink-3">Employees</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((i) => {
                  const k = keyOf(i);
                  const expanded = open === k;
                  return (
                    <Fragment key={k}>
                      <tr className={clsx('cursor-pointer transition-colors hover:bg-surface-2', expanded && 'bg-surface-2')} onClick={() => setOpen(expanded ? null : k)} aria-expanded={expanded}>
                        <td className="border-t border-line-2 px-3 py-[var(--row-py)] text-ink-3">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td className="border-t border-line-2 px-3.5 py-[var(--row-py)]"><div className="font-semibold text-ink">{type === 'apps' ? i.appName : i.domain}</div>{type === 'apps' && <div className="font-mono text-xs text-ink-3">{i.processName}</div>}</td>
                        <td className="border-t border-line-2 px-3.5 py-[var(--row-py)]"><CategoryBadge category={i.category} /></td>
                        <td className="border-t border-line-2 px-3.5 py-[var(--row-py)] text-right font-mono text-ink">{duration(i.activeS)}</td>
                        <td className="border-t border-line-2 px-3.5 py-[var(--row-py)]"><Progress value={i.share} size={6} label={`${i.share}%`} /></td>
                        <td className="border-t border-line-2 px-3.5 py-[var(--row-py)] text-right font-mono text-ink">{i.employees}</td>
                      </tr>
                      {expanded && <DrillRows type={type} itemKey={k} from={params.from} to={params.to} departmentId={params.departmentId} teamId={params.teamId} total={i.activeS} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function DrillRows({ type, itemKey, from, to, departmentId, teamId, total }: { type: 'apps' | 'domains'; itemKey: string; from: string; to: string; departmentId?: string; teamId?: string; total: number }) {
  const q = useUsageEmployees({ type: type === 'apps' ? 'app' : 'domain', key: itemKey, from, to, departmentId, teamId }, true);
  if (q.isLoading) return <tr><td colSpan={6} className="border-t border-line-2 bg-surface-2/60 px-6 py-3"><Skeleton className="h-4 w-1/3" /></td></tr>;
  if (q.isError) return <tr><td colSpan={6} className="border-t border-line-2 px-6 py-2 text-sm text-red-text">{(q.error as Error).message}</td></tr>;
  const rows = q.data ?? [];
  if (rows.length === 0) return <tr><td colSpan={6} className="border-t border-line-2 bg-surface-2/60 px-10 py-2 text-xs text-ink-3">No employee detail in scope.</td></tr>;
  return (
    <>
      {rows.map((r) => (
        <tr key={r.employeeId} className="bg-surface-2/60">
          <td className="border-t border-line-2" />
          <td className="border-t border-line-2 px-3.5 py-1.5 pl-6" colSpan={2}>
            <span className="inline-flex items-center gap-2 text-sm text-ink"><Avatar name={r.employee ? fullName(r.employee) : '?'} size={20} />{r.employee ? fullName(r.employee) : r.employeeId}<span className="text-xs text-ink-3">· {r.days} day{r.days === 1 ? '' : 's'}</span></span>
          </td>
          <td className="border-t border-line-2 px-3.5 py-1.5 text-right font-mono text-sm text-ink">{duration(r.activeS)}</td>
          <td className="border-t border-line-2 px-3.5 py-1.5"><Progress value={total ? (r.activeS / total) * 100 : 0} size={4} tone="gray" /></td>
          <td className="border-t border-line-2" />
        </tr>
      ))}
    </>
  );
}
