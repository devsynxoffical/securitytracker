'use client';

import { Suspense, useMemo, useState } from 'react';
import { Download, BarChart3 } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useReport, useDepartments, useTeams } from '@/lib/queries/platform';
import { useEmployees } from '@/lib/queries/crm';
import { Button, Card, Skeleton, EmptyState, ErrorBanner, PageHeader, Segmented, Badge } from '@/components/ui';
import { DataTable, FilterChip, type Column } from '@/components/ui/advanced';
import { ColumnChart, LineChart } from '@/components/ui/charts';
import { usePeriod, hours, statusTone, isoDate, daysAgo } from '@/components/platform/shared';
import { downloadText, fullName, money, titleCase, compactMoney } from '@/lib/format';

type Kind = 'attendance' | 'productivity' | 'crm' | 'calls';
type Row = Record<string, unknown> & { id: string };

export default function ReportsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Reports />
    </Suspense>
  );
}

const PRESETS: Array<{ label: string; range: () => [string, string] }> = [
  { label: 'Today', range: () => [isoDate(new Date()), isoDate(new Date())] },
  { label: 'Last 7 days', range: () => [daysAgo(6), isoDate(new Date())] },
  { label: 'Last 30 days', range: () => [daysAgo(29), isoDate(new Date())] },
  { label: 'This month', range: () => { const d = new Date(); return [isoDate(new Date(d.getFullYear(), d.getMonth(), 1)), isoDate(d)]; } },
];

function Reports() {
  const { can } = useAuth();
  const [kind, setKind] = useState<Kind>('attendance');
  const [from, to, setPeriod] = usePeriod(29);
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const employees = useEmployees();
  const departments = useDepartments(can('org.manage'));
  const teams = useTeams(can('org.manage'));
  const params = useMemo(() => ({ from, to, employeeId: employeeId || undefined, departmentId: departmentId || undefined, teamId: teamId || undefined }), [from, to, employeeId, departmentId, teamId]);
  const q = useReport<Record<string, unknown>>(kind, params, Boolean(from && to));
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const text = await http.text(`/reports/${kind}`, { ...params, format: 'csv' });
      downloadText(`${kind}-report-${from}-${to}.csv`, text);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const rows: Row[] = useMemo(() => (q.data?.data ?? []).slice(0, 500).map((r, i) => ({ ...r, id: String(r.id ?? i) })), [q.data]);
  const columns = useMemo<Column<Row>[]>(() => COLUMNS[kind].map((c) => ({ key: c.key, header: c.label, right: c.kind === 'number' || c.kind === 'seconds' || c.kind === 'money' || c.kind === 'percent', mono: c.kind !== 'text' && c.kind !== 'status' && c.kind !== undefined, cell: (r) => <Cell col={c} value={r[c.key]} />, locked: c.key === COLUMNS[kind][0]!.key })), [kind]);
  const chart = useMemo(() => buildChart(kind, q.data?.data ?? []), [kind, q.data]);
  const periodLabel = PRESETS.find((p) => { const [f, t] = p.range(); return f === from && t === to; })?.label ?? `${from} → ${to}`;

  const pick = (items: Array<{ value: string; label: string }>, value: string, onPick: (v: string) => void) => (
    <ul className="max-h-64 overflow-y-auto text-sm">
      {items.map((o) => (
        <li key={o.value}><button type="button" onClick={() => onPick(o.value)} className={`block w-full rounded px-2 py-1 text-left hover:bg-surface-2 ${value === o.value ? 'font-semibold text-pri' : 'text-ink'}`}>{o.label}</button></li>
      ))}
    </ul>
  );

  return (
    <div>
      <PageHeader title="Reports" subtitle="Attendance, productivity, CRM and calls for your scope." actions={can('reports.export') ? <Button icon={<Download size={14} />} loading={exporting} onClick={exportCsv} disabled={!q.data || q.data.totalRecords === 0}>Export CSV</Button> : undefined} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'attendance', label: 'Attendance' }, { value: 'productivity', label: 'Productivity' }, { value: 'crm', label: 'CRM' }, { value: 'calls', label: 'Calls' }]} />
        <span className="mx-1 h-5 w-px bg-line" />
        <FilterChip label="Period" value={periodLabel} active>
          <div className="space-y-1">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => { const [f, t] = p.range(); setPeriod(f, t); }} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-surface-2">{p.label}</button>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line-2 pt-2">
              <input type="date" value={from} onChange={(e) => setPeriod(e.target.value, to)} className="h-8 rounded-md border border-line bg-surface px-2 text-xs" />
              <input type="date" value={to} onChange={(e) => setPeriod(from, e.target.value)} className="h-8 rounded-md border border-line bg-surface px-2 text-xs" />
            </div>
          </div>
        </FilterChip>
        <FilterChip label="Employee" value={employeeId ? fullName(employees.data?.find((e) => e.id === employeeId)) : undefined} onClear={() => setEmployeeId('')}>
          {pick((employees.data ?? []).map((e) => ({ value: e.id, label: `${fullName(e)} (${e.code})` })), employeeId, setEmployeeId)}
        </FilterChip>
        {departments.data && (
          <FilterChip label="Department" value={departments.data.find((d) => d.id === departmentId)?.name} onClear={() => setDepartmentId('')}>
            {pick(departments.data.map((d) => ({ value: d.id, label: d.name })), departmentId, setDepartmentId)}
          </FilterChip>
        )}
        {teams.data && (
          <FilterChip label="Team" value={teams.data.find((t) => t.id === teamId)?.name} onClear={() => setTeamId('')}>
            {pick(teams.data.map((t) => ({ value: t.id, label: t.name })), teamId, setTeamId)}
          </FilterChip>
        )}
      </div>
      {exportError && <div className="mb-3"><ErrorBanner message={exportError} onRetry={exportCsv} /></div>}

      {q.data && chart && (
        <Card className="mb-3.5" title={chart.title}>
          <div className="p-4">
            {chart.kind === 'line' ? <LineChart labels={chart.labels} series={chart.series} format={chart.format} height={180} /> : <ColumnChart categories={chart.labels} series={chart.series} format={chart.format} height={180} stacked={chart.stacked} />}
          </div>
        </Card>
      )}

      <Card title={`${titleCase(kind)} report`} actions={q.data ? <span className="font-mono text-xs text-ink-3">{q.data.totalRecords} rows</span> : undefined}>
        <DataTable<Row>
          rows={rows}
          columns={columns}
          loading={q.isLoading}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          storageKey={`report-${kind}`}
          empty={<EmptyState icon={<BarChart3 size={28} />} title="No data for this period" body="Widen the date range or clear the filters." />}
          footer={q.data && q.data.data.length > 500 ? <div className="border-t border-line px-4 py-2 text-xs text-ink-3">Showing the first 500 rows. Export CSV for the full report.</div> : undefined}
        />
      </Card>
    </div>
  );
}

interface Col { key: string; label: string; kind?: 'text' | 'number' | 'seconds' | 'money' | 'status' | 'percent' }

function Cell({ col, value }: { col: Col; value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-ink-3">—</span>;
  switch (col.kind) {
    case 'seconds': return <>{hours(Number(value))}</>;
    case 'number': return <>{Number(value).toLocaleString()}</>;
    case 'money': return <>{money(Number(value))}</>;
    case 'percent': return <>{Math.round(Number(value))}%</>;
    case 'status': return <Badge tone={statusTone(String(value))}>{titleCase(String(value))}</Badge>;
    default: return <>{String(value)}</>;
  }
}

/** Chart on top of each report: grouped by date when present, else by employee. */
function buildChart(kind: Kind, data: Record<string, unknown>[]): { title: string; kind: 'line' | 'column'; labels: string[]; series: Array<{ name: string; values: number[] }>; format?: (n: number) => string; stacked?: boolean } | null {
  if (data.length === 0) return null;
  const toH = (v: unknown) => Math.round((Number(v ?? 0) / 3600) * 10) / 10;
  const hasDate = data.some((r) => typeof r.date === 'string');
  if ((kind === 'attendance' || kind === 'productivity') && hasDate) {
    const byDate = new Map<string, { a: number; b: number; c: number }>();
    for (const r of data) {
      const d = String(r.date).slice(0, 10);
      const cur = byDate.get(d) ?? { a: 0, b: 0, c: 0 };
      if (kind === 'attendance') { cur.a += toH(r.activeSeconds); cur.b += toH(r.idleSeconds); cur.c += toH(r.breakSeconds); }
      else { cur.a += toH(r.productiveSeconds); cur.b += toH(r.neutralSeconds); cur.c += toH(r.unproductiveSeconds); }
      byDate.set(d, cur);
    }
    const labels = [...byDate.keys()].sort();
    const v = labels.map((l) => byDate.get(l)!);
    return kind === 'attendance'
      ? { title: 'Hours per day', kind: 'column', stacked: true, labels: labels.map((l) => l.slice(5)), series: [{ name: 'Active', values: v.map((x) => x.a) }, { name: 'Idle', values: v.map((x) => x.b) }, { name: 'Break', values: v.map((x) => x.c) }], format: (n) => `${n}h` }
      : { title: 'Productive, neutral and unproductive hours per day', kind: 'column', stacked: true, labels: labels.map((l) => l.slice(5)), series: [{ name: 'Productive', values: v.map((x) => x.a) }, { name: 'Neutral', values: v.map((x) => x.b) }, { name: 'Unproductive', values: v.map((x) => x.c) }], format: (n) => `${n}h` };
  }
  const top = [...data].slice(0, 12);
  const labels = top.map((r) => String(r.employeeName ?? r.employeeCode ?? '—'));
  if (kind === 'crm') return { title: 'Revenue won by employee', kind: 'column', labels, series: [{ name: 'Revenue won', values: top.map((r) => Number(r.revenueWon ?? 0)) }], format: (n) => compactMoney(n) };
  if (kind === 'calls') return { title: 'Calls by employee', kind: 'column', labels, series: [{ name: 'Calls', values: top.map((r) => Number(r.callsTotal ?? 0)) }, { name: 'Connected', values: top.map((r) => Number(r.callsConnected ?? 0)) }] };
  return { title: 'Active hours by employee', kind: 'column', labels, series: [{ name: 'Active hours', values: top.map((r) => toH(r.activeSeconds)) }], format: (n) => `${n}h` };
}

const COLUMNS: Record<Kind, Col[]> = {
  attendance: [
    { key: 'date', label: 'Date' }, { key: 'employeeCode', label: 'Code' }, { key: 'employeeName', label: 'Employee' }, { key: 'department', label: 'Department' }, { key: 'team', label: 'Team' },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'workingSeconds', label: 'Working', kind: 'seconds' }, { key: 'activeSeconds', label: 'Active', kind: 'seconds' }, { key: 'idleSeconds', label: 'Idle', kind: 'seconds' }, { key: 'breakSeconds', label: 'Break', kind: 'seconds' }, { key: 'offlineSeconds', label: 'Offline', kind: 'seconds' }, { key: 'flags', label: 'Flags' },
  ],
  productivity: [
    { key: 'date', label: 'Date' }, { key: 'employeeCode', label: 'Code' }, { key: 'employeeName', label: 'Employee' }, { key: 'department', label: 'Department' },
    { key: 'trackedSeconds', label: 'Tracked', kind: 'seconds' }, { key: 'activeSeconds', label: 'Active', kind: 'seconds' }, { key: 'idleSeconds', label: 'Idle', kind: 'seconds' },
    { key: 'productiveSeconds', label: 'Productive', kind: 'seconds' }, { key: 'neutralSeconds', label: 'Neutral', kind: 'seconds' }, { key: 'unproductiveSeconds', label: 'Unproductive', kind: 'seconds' }, { key: 'productivityPercent', label: 'Productivity', kind: 'percent' },
  ],
  crm: [
    { key: 'employeeCode', label: 'Code' }, { key: 'employeeName', label: 'Employee' }, { key: 'leadsCreated', label: 'Leads created', kind: 'number' }, { key: 'leadsQualified', label: 'Qualified', kind: 'number' },
    { key: 'leadsWon', label: 'Won', kind: 'number' }, { key: 'leadsLost', label: 'Lost', kind: 'number' }, { key: 'revenueWon', label: 'Revenue won', kind: 'money' }, { key: 'appointments', label: 'Appointments', kind: 'number' }, { key: 'notes', label: 'Notes', kind: 'number' },
  ],
  calls: [
    { key: 'employeeCode', label: 'Code' }, { key: 'employeeName', label: 'Employee' }, { key: 'callsTotal', label: 'Calls', kind: 'number' }, { key: 'callsConnected', label: 'Connected', kind: 'number' },
    { key: 'connectRate', label: 'Connect rate', kind: 'percent' }, { key: 'totalDurationSeconds', label: 'Talk time', kind: 'seconds' }, { key: 'avgDurationSeconds', label: 'Avg duration', kind: 'seconds' },
  ],
};
