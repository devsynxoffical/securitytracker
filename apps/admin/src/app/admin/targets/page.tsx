'use client';

import { confirmDialog, ConfirmHost } from '@/components/platform/confirm';

import { Suspense, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Target as TargetIcon, Users, UserCircle2, Shield } from 'lucide-react';
import { http, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEmployees, useCrmMutation } from '@/lib/queries/crm';
import { useTargets, useTargetProgress, useRoles, useTeams, type Target } from '@/lib/queries/platform';
import { Button, Card, Badge, Select, Field, Input, Modal, Skeleton, EmptyState, ErrorBanner, PageHeader, Checkbox, useToast, Avatar } from '@/components/ui';
import { Menu, Progress, FilterChip, ViewTabs } from '@/components/ui/advanced';
import { BarList } from '@/components/ui/charts';
import { fullName, titleCase, dateOnly } from '@/lib/format';
import { isoDate } from '@/components/platform/shared';

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

function TargetsPage() {
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
  const [period, setPeriodFilter] = useState('');
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
  const rows = (q.data ?? []).filter((t) => !period || t.period === period);

  return (
    <div>
      <PageHeader title="Targets" subtitle="Metric targets per employee, team or role. Progress is computed from recorded events (F13)." actions={can('targets.manage') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New target</Button> : undefined} />
      <ViewTabs value={tab} onChange={setTab} views={[...(can('targets.manage') ? [{ value: 'targets' as const, label: 'All targets', count: q.data?.length }] : []), { value: 'progress' as const, label: 'Employee progress' }]} />

      {tab === 'targets' && can('targets.manage') && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <FilterChip label="Assignee type" value={assigneeType ? titleCase(assigneeType) : undefined} onClear={() => setAssigneeType('')}>
              {['employee', 'team', 'role'].map((v) => <button key={v} type="button" onClick={() => setAssigneeType(v)} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-surface-2">{titleCase(v)}</button>)}
            </FilterChip>
            <FilterChip label="Period" value={period ? titleCase(period) : undefined} onClear={() => setPeriodFilter('')}>
              {['daily', 'weekly', 'monthly'].map((v) => <button key={v} type="button" onClick={() => setPeriodFilter(v)} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-surface-2">{titleCase(v)}</button>)}
            </FilterChip>
          </div>
          {q.isLoading && <div className="grid grid-cols-3 gap-3.5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div>}
          {q.isError && <Card><ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} /></Card>}
          {q.data && rows.length === 0 && <Card><EmptyState icon={<TargetIcon size={28} />} title="No targets yet" body="Create a target to track calls, leads, closings or revenue." action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New target</Button>} /></Card>}
          <div className="grid grid-cols-3 gap-3.5">
            {rows.map((t) => {
              const Icon = t.assigneeType === 'employee' ? UserCircle2 : t.assigneeType === 'team' ? Users : Shield;
              return (
                <div key={t.id} className="flex flex-col rounded-card border border-line bg-surface p-4 shadow-card transition hover:border-pri">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {t.assigneeType === 'employee' ? <Avatar name={nameOf(t)} size={32} /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-soft text-violet-text"><Icon size={15} /></span>}
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-ink">{nameOf(t)}</div>
                        <div className="text-xs text-ink-3">{titleCase(t.assigneeType)}</div>
                      </div>
                    </div>
                    <Menu
                      items={[
                        { label: 'Edit', icon: <Pencil size={14} />, onSelect: () => setEditing(t) },
                        { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => void confirmDialog({ title: 'Delete this target?', danger: true }).then((ok) => ok && del.mutate(t.id, { onSuccess: () => toast.push('success', 'Target deleted'), onError: (e) => toast.push('error', (e as Error).message) }) )},
                      ]}
                    />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-ink-3">{metricLabel(t.metricKey)}</div>
                      <div className="font-mono text-2xl font-semibold text-ink">{Number(t.value).toLocaleString()}</div>
                    </div>
                    <Badge tone={t.period === 'daily' ? 'blue' : t.period === 'weekly' ? 'violet' : 'primary'}>{titleCase(t.period)}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line-2 pt-2 text-xs text-ink-3">
                    <span>{t.period === 'daily' && t.weekdays?.length ? t.weekdays.map((d) => WEEKDAYS[d]).join(' ') : `${dateOnly(t.validFrom)} → ${t.validTo ? dateOnly(t.validTo) : 'open'}`}</span>
                    {t.period === 'daily' && <span>until {t.validTo ? dateOnly(t.validTo) : 'open'}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'progress' && <div className="mt-4"><ProgressView metricLabel={metricLabel} /></div>}
      {editing && <TargetModal target={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProgressView({ metricLabel }: { metricLabel: (k: string) => string }) {
  const employees = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const q = useTargetProgress(employeeId || null);
  const emp = employees.data?.find((e) => e.id === employeeId);
  return (
    <div className="grid grid-cols-[1fr_320px] gap-3.5">
      <Card title="Progress for the current period" actions={<div className="w-64"><Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Select an employee…</option>{(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}</Select></div>}>
        {!employeeId && <EmptyState icon={<TargetIcon size={26} />} title="Pick an employee" body="Progress bars show each applicable target for the current daily, weekly and monthly period." />}
        {employeeId && q.isLoading && <div className="space-y-3 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && q.data.length === 0 && <EmptyState title="No targets apply" body="This employee has no employee, team or role target for the current period." />}
        {q.data && q.data.length > 0 && (
          <ul className="divide-y divide-line-2">
            {q.data.map((p) => (
              <li key={p.targetId} className="px-4 py-3">
                <div className="mb-1.5 flex items-center justify-between text-base">
                  <span className="font-semibold text-ink">{metricLabel(p.metricKey)} <Badge tone="gray" className="ml-1">{titleCase(p.period)}</Badge></span>
                  <span className="font-mono text-sm text-ink-2">{Number(p.currentValue).toLocaleString()} / {Number(p.targetValue).toLocaleString()}</span>
                </div>
                <Progress value={p.percentage} tone="auto" label={`${Math.min(999, Math.round(p.percentage))}%`} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={emp ? fullName(emp) : 'Attainment'}>
        <div className="p-4">
          {!q.data?.length && <div className="text-sm text-ink-3">Attainment per metric appears here.</div>}
          {q.data && q.data.length > 0 && <BarList data={q.data.map((p) => ({ label: metricLabel(p.metricKey), value: Math.round(p.percentage), meta: titleCase(p.period) }))} max={100} format={(n) => `${n}%`} />}
        </div>
      </Card>
    </div>
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
    <Modal open onClose={onClose} title={target ? 'Edit target' : 'New target'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>{target ? 'Save' : 'Create target'}</Button></>}>
      <div className="space-y-3">
        {error && <ErrorBanner message={error} />}
        {!target && (
          <>
            <Field label="Assignee type">
              <div className="grid grid-cols-3 gap-2">
                {(['employee', 'team', 'role'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => { setAssigneeType(t); setAssigneeId(''); }} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${assigneeType === t ? 'border-pri bg-pri-soft text-pri-2' : 'border-line text-ink-2 hover:text-ink'}`}>{titleCase(t)}</button>
                ))}
              </div>
            </Field>
            <Field label="Assignee" required><Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}><option value="">Select…</option>{assigneeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Metric"><Select value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>{METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select></Field>
              <Field label="Period"><Select value={period} onChange={(e) => setPeriod(e.target.value as Target['period'])}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Select></Field>
            </div>
          </>
        )}
        <Field label={`Target value (${METRICS.find((m) => m.key === metricKey)?.unit ?? ''})`} required><Input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" /></Field>
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

export default function TargetsPageWithConfirm() {
  return (
    <>
      <TargetsPage />
      <ConfirmHost />
    </>
  );
}
