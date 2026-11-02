'use client';

import { Suspense, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { http, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEmployees, useCrmMutation } from '@/lib/queries/crm';
import { useTargets, useTargetProgress, useRoles, useTeams, type Target } from '@/lib/queries/platform';
import { Button, Card, Table, Th, Td, Badge, Select, Field, Input, Modal, Skeleton, TableSkeleton, EmptyState, ErrorBanner, PageHeader, Checkbox, useToast, Tabs } from '@/components/ui';
import { fullName, titleCase, dateOnly } from '@/lib/format';
import { isoDate } from '@/components/platform/shared';

/** Metric catalog from 03 F13; keys match packages/contracts MetricKey. */
const METRICS: Array<{ key: string; label: string; unit: string }> = [
  { key: 'calls_total', label: 'Calls made', unit: 'calls' },
  { key: 'calls_connected', label: 'Connected calls', unit: 'calls' },
  { key: 'leads_created', label: 'Leads created', unit: 'leads' },
  { key: 'leads_qualified', label: 'Leads qualified', unit: 'leads' },
  { key: 'meetings_scheduled', label: 'Meetings scheduled', unit: 'meetings' },
  { key: 'closings', label: 'Closings', unit: 'deals' },
  { key: 'revenue_won', label: 'Revenue won', unit: 'currency' },
  { key: 'emails_sent', label: 'Emails sent', unit: 'emails' },
  { key: 'tasks_completed', label: 'Tasks completed', unit: 'tasks' },
  { key: 'active_hours', label: 'Active hours', unit: 'hours' },
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TargetsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Targets />
    </Suspense>
  );
}

function Targets() {
  const { can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'targets' | 'progress'>(can('targets.manage') ? 'targets' : 'progress');
  const [assigneeType, setAssigneeType] = useState('');
  const [editing, setEditing] = useState<Target | 'new' | null>(null);
  const params = useMemo(() => ({ assigneeType: assigneeType || undefined }), [assigneeType]);
  const q = useTargets(params);
  const employees = useEmployees();
  const roles = useRoles();
  const teams = useTeams(can('org.manage'));
  const del = useCrmMutation((id: string) => http.del(`/targets/${id}`), [['targets']]);

  const nameOf = (t: Target) => {
    if (t.assigneeType === 'employee') return fullName((employees.data ?? []).find((e) => e.id === t.assigneeId));
    if (t.assigneeType === 'role') return (roles.data ?? []).find((r) => r.id === t.assigneeId)?.name ?? '—';
    return (teams.data ?? []).find((x) => x.id === t.assigneeId)?.name ?? '—';
  };
  const metricLabel = (k: string) => METRICS.find((m) => m.key === k)?.label ?? titleCase(k);

  return (
    <div>
      <PageHeader title="Targets" subtitle="Metric targets per employee, team or role. Progress is computed from recorded events (F13)." actions={can('targets.manage') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New target</Button> : undefined} />
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[...(can('targets.manage') ? [{ value: 'targets' as const, label: 'All targets' }] : []), { value: 'progress' as const, label: 'Employee progress' }]} />

      {tab === 'targets' && can('targets.manage') && (
        <>
          <div className="mb-3 w-48"><Select value={assigneeType} onChange={(e) => setAssigneeType(e.target.value)}><option value="">All assignee types</option><option value="employee">Employee</option><option value="team">Team</option><option value="role">Role</option></Select></div>
          <Card>
            {q.isLoading && <TableSkeleton cols={7} />}
            {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
            {q.data && q.data.length === 0 && <EmptyState title="No targets yet" body="Create a target to track calls, leads, closings or revenue." action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New target</Button>} />}
            {q.data && q.data.length > 0 && (
              <Table>
                <thead><tr><Th>Assignee</Th><Th>Type</Th><Th>Metric</Th><Th>Period</Th><Th right>Target</Th><Th>Weekdays</Th><Th>Valid</Th><Th /></tr></thead>
                <tbody>
                  {q.data.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-2">
                      <Td className="font-semibold">{nameOf(t)}</Td>
                      <Td><Badge tone={t.assigneeType === 'employee' ? 'blue' : t.assigneeType === 'team' ? 'violet' : 'gray'}>{titleCase(t.assigneeType)}</Badge></Td>
                      <Td>{metricLabel(t.metricKey)}</Td>
                      <Td>{titleCase(t.period)}</Td>
                      <Td right mono>{Number(t.value).toLocaleString()}</Td>
                      <Td className="text-ink-3">{t.period === 'daily' && t.weekdays?.length ? t.weekdays.map((d) => WEEKDAYS[d]).join(' ') : '—'}</Td>
                      <Td className="text-ink-3">{dateOnly(t.validFrom)} → {t.validTo ? dateOnly(t.validTo) : 'open'}</Td>
                      <Td right>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(t)}>Edit</Button>
                          <Button size="sm" variant="danger-outline" icon={<Trash2 size={12} />} loading={del.isPending} onClick={() => window.confirm('Delete this target?') && del.mutate(t.id, { onSuccess: () => toast.push('success', 'Target deleted'), onError: (e) => toast.push('error', (e as Error).message) })}>Delete</Button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === 'progress' && <ProgressView metricLabel={metricLabel} />}

      {editing && <TargetModal target={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProgressView({ metricLabel }: { metricLabel: (k: string) => string }) {
  const employees = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const q = useTargetProgress(employeeId || null);
  return (
    <Card title="Progress for the current period">
      <div className="flex items-end gap-3 border-b border-line p-4">
        <Field label="Employee" className="w-72"><Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Select an employee…</option>{(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}</Select></Field>
      </div>
      {!employeeId && <EmptyState title="Pick an employee" body="Progress bars show each applicable target for the current daily, weekly and monthly period." />}
      {employeeId && q.isLoading && <div className="space-y-3 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="No targets apply" body="This employee has no employee, team or role target for the current period." />}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y divide-line-2">
          {q.data.map((p) => {
            const pct = Math.min(100, Math.round(p.percentage));
            const tone = pct >= 100 ? 'bg-green' : pct >= 80 ? 'bg-pri' : 'bg-amber-bar';
            return (
              <li key={p.targetId} className="px-4 py-3">
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span className="font-semibold">{metricLabel(p.metricKey)} <span className="ml-1 font-normal text-ink-3">{titleCase(p.period)}</span></span>
                  <span className="font-mono">{Number(p.currentValue).toLocaleString()} / {Number(p.targetValue).toLocaleString()} · {pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-soft"><div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function TargetModal({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const employees = useEmployees();
  const roles = useRoles();
  const teams = useTeams(can('org.manage'));
  const [assigneeType, setAssigneeType] = useState<Target['assigneeType']>(target?.assigneeType ?? 'employee');
  const [assigneeId, setAssigneeId] = useState(target?.assigneeId ?? '');
  const [metricKey, setMetricKey] = useState(target?.metricKey ?? METRICS[0]!.key);
  const [period, setPeriod] = useState<Target['period']>(target?.period ?? 'monthly');
  const [value, setValue] = useState(String(target?.value ?? ''));
  const [weekdays, setWeekdays] = useState<number[]>(target?.weekdays ?? [1, 2, 3, 4, 5]);
  const [validFrom, setValidFrom] = useState(target?.validFrom?.slice(0, 10) ?? isoDate(new Date()));
  const [validTo, setValidTo] = useState(target?.validTo?.slice(0, 10) ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useCrmMutation(
    (body: Record<string, unknown>) => (target ? api(`/targets/${target.id}`, { method: 'PUT', body: JSON.stringify(body) }) : http.post('/targets', body)),
    [['targets']],
  );

  const submit = () => {
    setError(null);
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return setError('Target value must be a positive number.');
    if (!target && !assigneeId) return setError('Choose an assignee.');
    const body = target
      ? { value: n, weekdays: period === 'daily' ? weekdays : [], validTo: validTo || null }
      : { assigneeType, assigneeId, metricKey, period, value: n, weekdays: period === 'daily' ? weekdays : [], validFrom, validTo: validTo || undefined };
    save.mutate(body, { onSuccess: () => { toast.push('success', target ? 'Target updated' : 'Target created'); onClose(); }, onError: (e) => setError((e as Error).message) });
  };

  const assigneeOptions = assigneeType === 'employee'
    ? (employees.data ?? []).map((e) => ({ id: e.id, label: `${fullName(e)} (${e.code})` }))
    : assigneeType === 'role'
      ? (roles.data ?? []).map((r) => ({ id: r.id, label: r.name }))
      : (teams.data ?? []).map((t) => ({ id: t.id, label: t.name }));

  return (
    <Modal open onClose={onClose} title={target ? 'Edit target' : 'New target'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>{target ? 'Save' : 'Create'}</Button></>}>
      <div className="space-y-3">
        {error && <ErrorBanner message={error} />}
        {!target && (
          <>
            <Field label="Assignee type"><Select value={assigneeType} onChange={(e) => { setAssigneeType(e.target.value as Target['assigneeType']); setAssigneeId(''); }}><option value="employee">Employee</option><option value="team">Team</option><option value="role">Role</option></Select></Field>
            <Field label="Assignee" required><Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}><option value="">Select…</option>{assigneeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></Field>
            <Field label="Metric"><Select value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>{METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select></Field>
            <Field label="Period"><Select value={period} onChange={(e) => setPeriod(e.target.value as Target['period'])}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Select></Field>
          </>
        )}
        <Field label={`Target value (${METRICS.find((m) => m.key === metricKey)?.unit ?? ''})`} required><Input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        {period === 'daily' && (
          <Field label="Active weekdays" hint="Daily targets are not expected on other days, leave days and holidays.">
            <div className="flex flex-wrap gap-3">{WEEKDAYS.map((d, i) => <Checkbox key={d} label={d} checked={weekdays.includes(i)} onChange={(e) => setWeekdays((w) => (e.target.checked ? [...w, i].sort() : w.filter((x) => x !== i)))} />)}</div>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          {!target && <Field label="Valid from" required><Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></Field>}
          <Field label="Valid to" hint="Leave empty for open-ended"><Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
