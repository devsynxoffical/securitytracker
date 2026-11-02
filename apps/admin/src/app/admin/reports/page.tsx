'use client';

import { Suspense, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useReport, useDepartments, useTeams } from '@/lib/queries/platform';
import { useEmployees } from '@/lib/queries/crm';
import { Button, Card, Table, Th, Td, Select, Field, Skeleton, TableSkeleton, EmptyState, ErrorBanner, PageHeader, Segmented, Badge } from '@/components/ui';
import { PeriodFilter, usePeriod, hours, statusTone } from '@/components/platform/shared';
import { downloadText, fullName, money, titleCase } from '@/lib/format';

type Kind = 'attendance' | 'productivity' | 'crm' | 'calls';

export default function ReportsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Reports />
    </Suspense>
  );
}

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

  const columns = COLUMNS[kind];

  return (
    <div>
      <PageHeader title="Reports" subtitle="Attendance, productivity, CRM and calls for your scope." actions={can('reports.export') ? <Button icon={<Download size={14} />} loading={exporting} onClick={exportCsv}>Export CSV</Button> : undefined} />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'attendance', label: 'Attendance' }, { value: 'productivity', label: 'Productivity' }, { value: 'crm', label: 'CRM' }, { value: 'calls', label: 'Calls' }]} />
        <PeriodFilter from={from} to={to} onChange={setPeriod} />
        <Field label="Employee"><Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">All</option>{(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}</Select></Field>
        {departments.data && <Field label="Department"><Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">All</option>{departments.data.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>}
        {teams.data && <Field label="Team"><Select value={teamId} onChange={(e) => setTeamId(e.target.value)}><option value="">All</option>{teams.data.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>}
      </div>
      {exportError && <div className="mb-3"><ErrorBanner message={exportError} onRetry={exportCsv} /></div>}
      <Card title={`${titleCase(kind)} report`} actions={q.data ? <span className="text-xs text-ink-3">{q.data.totalRecords} rows</span> : undefined}>
        {q.isLoading && <TableSkeleton cols={columns.length} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && q.data.data.length === 0 && <EmptyState title="No data for this period" body="Widen the date range or clear the filters." />}
        {q.data && q.data.data.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <thead><tr>{columns.map((c) => <Th key={c.key} right={c.kind === 'number' || c.kind === 'seconds' || c.kind === 'money'}>{c.label}</Th>)}</tr></thead>
              <tbody>
                {q.data.data.slice(0, 500).map((row, i) => (
                  <tr key={i} className="hover:bg-surface-2">
                    {columns.map((c) => <Cell key={c.key} col={c} value={row[c.key]} />)}
                  </tr>
                ))}
              </tbody>
            </Table>
            {q.data.data.length > 500 && <div className="border-t border-line px-4 py-2 text-xs text-ink-3">Showing the first 500 rows. Export CSV for the full report.</div>}
          </div>
        )}
      </Card>
    </div>
  );
}

interface Col { key: string; label: string; kind?: 'text' | 'number' | 'seconds' | 'money' | 'status' | 'percent' }

function Cell({ col, value }: { col: Col; value: unknown }) {
  if (value === null || value === undefined || value === '') return <Td className="text-ink-3">—</Td>;
  switch (col.kind) {
    case 'seconds': return <Td right mono>{hours(Number(value))}</Td>;
    case 'number': return <Td right mono>{Number(value).toLocaleString()}</Td>;
    case 'money': return <Td right mono>{money(Number(value))}</Td>;
    case 'percent': return <Td right mono>{Math.round(Number(value))}%</Td>;
    case 'status': return <Td><Badge tone={statusTone(String(value))}>{titleCase(String(value))}</Badge></Td>;
    default: return <Td>{String(value)}</Td>;
  }
}

/** Column sets per report; unknown extra fields from the API are ignored, missing ones render as —. */
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
