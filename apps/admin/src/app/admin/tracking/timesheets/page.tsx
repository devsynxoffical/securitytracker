'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Plus, Check, X, Timer, Clock, Activity, Hand, Coffee } from 'lucide-react';
import { http, qs, type ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useExportAllowed } from '@/lib/queries/platform';
import { useTimesheet, useTeamTimesheet, useManualTime, useTrackingMutation, type TimesheetRow, type Totals, type ManualTime, type TeamTimesheet } from '@/lib/queries/tracking';
import { Card, PageHeader, Button, Modal, Field, Input, Textarea, Badge, useToast, Avatar, TableSkeleton, Segmented, type Tone } from '@/components/ui';
import { KpiTile, DataTable, ViewTabs, type Column } from '@/components/ui/advanced';
import { ColumnChart, Sparkline } from '@/components/ui/charts';
import { EmployeePicker, OrgFilters, PeriodPicker, usePeriod, StackedBar, ActivityPercent, duration, clock, hoursLabel, shortDay } from '@/components/tracking/shared';
import { fullName, dateTime, downloadText } from '@/lib/format';
import { useIdParam } from '@/lib/useIdParam';

type Mode = 'employee' | 'team' | 'approvals';

export default function TimesheetsPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={8} cols={8} />}>
      <TimesheetsInner />
    </Suspense>
  );
}

function TimesheetsInner() {
  const { me, can } = useAuth();
  const exportAllowed = useExportAllowed();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('employee');
  const [employeeId, setEmployeeId] = useIdParam('employeeId');
  const [org, setOrg] = useState({ departmentId: '', teamId: '' });
  const period = usePeriod('week');
  const [addOpen, setAddOpen] = useState(false);
  const selected = employeeId ?? me?.id ?? '';
  const canApprove = can('tracking.timesheets.approve');

  const emp = useTimesheet({ employeeId: selected, from: period.period.from, to: period.period.to }, mode === 'employee' && Boolean(selected));
  const team = useTeamTimesheet({ from: period.period.from, to: period.period.to, departmentId: org.departmentId || undefined, teamId: org.teamId || undefined });
  const pending = useManualTime({ status: 'pending' });

  const exportCsv = async () => {
    const path = mode === 'team'
      ? `/tracking/timesheet/team${qs({ ...period.period, departmentId: org.departmentId || undefined, teamId: org.teamId || undefined, format: 'csv' })}`
      : `/tracking/timesheet${qs({ employeeId: selected, from: period.period.from, to: period.period.to, format: 'csv' })}`;
    try {
      downloadText(`timesheet-${period.period.from}-${period.period.to}.csv`, await http.text(path));
    } catch (e) {
      toast.push('error', (e as ApiError).message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Timesheets"
        subtitle="Tracked, active, idle and approved manual time per day. Activity % is active ÷ (active + idle)."
        actions={
          <>
            {exportAllowed && mode !== 'approvals' && <Button size="sm" icon={<Download size={14} />} onClick={exportCsv}>CSV</Button>}
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add time</Button>
          </>
        }
      />
      <ViewTabs<Mode>
        value={mode}
        onChange={setMode}
        views={[{ value: 'employee', label: 'Employee' }, { value: 'team', label: 'Team' }, ...(canApprove ? [{ value: 'approvals' as Mode, label: 'Approvals', count: pending.data?.items.length }] : [])]}
      />
      <div className="my-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'employee' && <div className="w-64"><EmployeePicker value={selected} onChange={(v) => setEmployeeId(v || null)} /></div>}
          {mode === 'team' && <OrgFilters departmentId={org.departmentId} teamId={org.teamId} onChange={setOrg} />}
        </div>
        {mode !== 'approvals' && <PeriodPicker {...period} modes={['week', 'month']} />}
      </div>

      {mode === 'employee' && <EmployeeView rows={emp.data?.rows ?? []} totals={emp.data?.totals} loading={emp.isLoading} error={emp.isError ? (emp.error as Error).message : null} retry={() => emp.refetch()} employeeId={selected} />}
      {mode === 'team' && <TeamView data={team.data} loading={team.isLoading} error={team.isError ? (team.error as Error).message : null} retry={() => team.refetch()} onPick={(id) => { setEmployeeId(id); setMode('employee'); }} />}
      {mode === 'approvals' && <Approvals />}

      <AddTimeModal open={addOpen} onClose={() => setAddOpen(false)} defaultEmployeeId={canApprove ? selected : me?.id ?? ''} canPickEmployee={canApprove} />
    </div>
  );
}

function TotalsStrip({ totals, loading }: { totals?: Totals; loading: boolean }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-6">
      <KpiTile label="Tracked" value={totals ? duration(totals.trackedS) : '—'} icon={<Clock size={15} />} loading={loading} />
      <KpiTile label="Active" value={totals ? duration(totals.activeS) : '—'} tone="green" icon={<Activity size={15} />} loading={loading} />
      <KpiTile label="Idle" value={totals ? duration(totals.idleS) : '—'} tone="amber" loading={loading} />
      <KpiTile label="Manual (approved)" value={totals ? duration(totals.manualS) : '—'} tone="blue" icon={<Hand size={15} />} loading={loading} />
      <KpiTile label="Breaks" value={totals ? duration(totals.breakS) : '—'} icon={<Coffee size={15} />} loading={loading} />
      <KpiTile label="Activity" value={totals ? `${totals.activityPercent}%` : '—'} tone={totals ? (totals.activityPercent < 30 ? 'red' : totals.activityPercent < 50 ? 'amber' : 'green') : undefined} loading={loading} />
    </div>
  );
}

const statusTone = (s: string | null): Tone => (s === 'present' ? 'green' : s === 'late' || s === 'half_day' ? 'amber' : s === 'absent' ? 'red' : s === 'holiday' ? 'blue' : s === 'on_leave' ? 'violet' : 'gray');

function EmployeeView({ rows, totals, loading, error, retry, employeeId }: { rows: TimesheetRow[]; totals?: Totals; loading: boolean; error: string | null; retry: () => void; employeeId: string }) {
  const router = useRouter();
  const worked = rows.filter((r) => r.shiftCount > 0 || r.manualS > 0);
  const tableRows = useMemo(() => rows.map((r) => ({ ...r, id: r.date })), [rows]);
  const columns: Column<TimesheetRow & { id: string }>[] = [
    { key: 'date', header: 'Date', locked: true, cell: (r) => <span className="inline-flex items-center gap-2"><span className="font-mono text-xs text-pri">{r.date}</span>{r.openShift && <Badge tone="green" dot>open</Badge>}</span> },
    { key: 'status', header: 'Status', cell: (r) => (r.status ? <Badge tone={statusTone(r.status)}>{r.status.replace('_', ' ')}</Badge> : <span className="text-ink-3">—</span>) },
    { key: 'start', header: 'First start', mono: true, cell: (r) => clock(r.firstStart) },
    { key: 'end', header: 'Last end', mono: true, cell: (r) => clock(r.lastEnd) },
    { key: 'tracked', header: 'Tracked', right: true, mono: true, cell: (r) => (r.trackedS ? duration(r.trackedS) : <span className="text-ink-3">—</span>) },
    { key: 'active', header: 'Active', right: true, mono: true, cell: (r) => (r.activeS ? duration(r.activeS) : <span className="text-ink-3">—</span>) },
    { key: 'idle', header: 'Idle', right: true, mono: true, cell: (r) => (r.idleS ? duration(r.idleS) : <span className="text-ink-3">—</span>) },
    { key: 'manual', header: 'Manual', right: true, mono: true, cell: (r) => (r.manualS ? duration(r.manualS) : <span className="text-ink-3">—</span>) },
    { key: 'break', header: 'Break', right: true, mono: true, cell: (r) => (r.breakS ? duration(r.breakS) : <span className="text-ink-3">—</span>) },
    { key: 'activity', header: 'Activity', cell: (r) => <ActivityPercent value={r.activityPercent} warn={50} alert={30} none={r.trackedS === 0} /> },
  ];
  return (
    <>
      <TotalsStrip totals={totals} loading={loading} />
      {worked.length > 0 && (
        <Card className="mb-4 p-4" title="Daily breakdown">
          <ColumnChart
            categories={rows.map((r) => shortDay(r.date))}
            series={[
              { name: 'Active', values: rows.map((r) => r.activeS) },
              { name: 'Idle', values: rows.map((r) => r.idleS) },
              { name: 'Manual', values: rows.map((r) => r.manualS) },
            ]}
            stacked
            height={190}
            format={hoursLabel}
          />
        </Card>
      )}
      <Card>
        <DataTable
          rows={loading ? [] : worked.length === 0 ? [] : tableRows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={retry}
          onRowClick={(r) => router.push(`/admin/tracking/timeline?employeeId=${employeeId}&date=${r.date}`)}
          storageKey="tracking.timesheet"
          empty={<div className="px-6 py-14 text-center"><Timer size={28} strokeWidth={1.75} className="mx-auto mb-3 text-ink-3" /><div className="text-base font-semibold text-ink">No time in this period</div><div className="mt-1 text-sm text-ink-2">Nothing was tracked and no manual time was approved.</div></div>}
          footer={totals && worked.length > 0 ? (
            <footer className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-line bg-surface-2 px-4 py-2 text-xs text-ink-2">
              <span className="font-semibold uppercase tracking-[0.05em] text-ink-3">Totals · {totals.daysWorked} day{totals.daysWorked === 1 ? '' : 's'}</span>
              <span className="flex gap-4 font-mono text-ink">
                <span>tracked {duration(totals.trackedS)}</span><span>active {duration(totals.activeS)}</span><span>idle {duration(totals.idleS)}</span><span>manual {duration(totals.manualS)}</span><span>break {duration(totals.breakS)}</span>
              </span>
            </footer>
          ) : undefined}
        />
      </Card>
    </>
  );
}

type TeamRow = TeamTimesheet['items'][number] & { id: string };

function TeamView({ data, loading, error, retry, onPick }: { data?: TeamTimesheet; loading: boolean; error: string | null; retry: () => void; onPick: (id: string) => void }) {
  const rows = useMemo<TeamRow[]>(() => (data?.items ?? []).map((i) => ({ ...i, id: i.employee.id })), [data]);
  const sparkFor = (r: TeamRow) => (r.days > 0 ? [r.totals.activeS, r.totals.idleS, r.totals.manualS, r.totals.trackedS] : []);
  const columns: Column<TeamRow>[] = [
    {
      key: 'employee', header: 'Employee', locked: true,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={fullName(r.employee)} size={26} />
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold text-ink">{fullName(r.employee)}</div>
            <div className="truncate text-xs text-ink-3">{r.employee.department?.name ?? '—'}</div>
          </div>
        </div>
      ),
    },
    { key: 'days', header: 'Days', right: true, mono: true, cell: (r) => r.days },
    { key: 'tracked', header: 'Tracked', right: true, mono: true, cell: (r) => duration(r.totals.trackedS) },
    { key: 'trend', header: 'Trend', cell: (r) => (sparkFor(r).length ? <Sparkline values={sparkFor(r)} width={80} height={22} /> : <span className="text-ink-3">—</span>) },
    { key: 'active', header: 'Active', right: true, mono: true, cell: (r) => duration(r.totals.activeS) },
    { key: 'idle', header: 'Idle', right: true, mono: true, cell: (r) => duration(r.totals.idleS) },
    { key: 'manual', header: 'Manual', right: true, mono: true, cell: (r) => (r.totals.manualS ? duration(r.totals.manualS) : <span className="text-ink-3">—</span>) },
    { key: 'mix', header: 'Productivity mix', cell: (r) => <div className="w-32"><StackedBar parts={[{ label: 'Productive', seconds: r.totals.productiveS, className: 'bg-green' }, { label: 'Neutral', seconds: r.totals.neutralS, className: 'bg-gray-bar' }, { label: 'Unproductive', seconds: r.totals.unproductiveS, className: 'bg-red' }]} /></div> },
    { key: 'activity', header: 'Activity', cell: (r) => <ActivityPercent value={r.totals.activityPercent} warn={50} alert={30} none={r.totals.trackedS === 0} /> },
  ];
  return (
    <>
      <TotalsStrip totals={data?.totals} loading={loading} />
      <Card>
        <DataTable rows={rows} columns={columns} loading={loading} error={error} onRetry={retry} onRowClick={(r) => onPick(r.employee.id)} storageKey="tracking.team-timesheet" empty={<div className="px-6 py-14 text-center text-sm text-ink-2"><div className="text-base font-semibold text-ink">No employees in view</div>Adjust the department or team filter.</div>} />
      </Card>
    </>
  );
}

function Approvals() {
  const toast = useToast();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [reject, setReject] = useState<ManualTime | null>(null);
  const [comment, setComment] = useState('');
  const q = useManualTime({ status });
  const decide = useTrackingMutation((a: { id: string; status: 'approved' | 'rejected'; comment?: string }) => http.post(`/tracking/manual-time/${a.id}/decide`, { status: a.status, comment: a.comment }));
  const items = q.data?.items ?? [];
  const err = (e: unknown) => toast.push('error', (e as Error).message);
  const columns: Column<ManualTime>[] = [
    { key: 'employee', header: 'Employee', locked: true, cell: (m) => (m.employee ? <span className="inline-flex items-center gap-2"><Avatar name={fullName(m.employee)} size={24} /><span className="font-semibold">{fullName(m.employee)}</span></span> : '—') },
    { key: 'date', header: 'Date', mono: true, cell: (m) => m.date.slice(0, 10) },
    { key: 'time', header: 'Time', mono: true, cell: (m) => `${clock(m.startedAt)}–${clock(m.endedAt)}` },
    { key: 'duration', header: 'Duration', right: true, mono: true, cell: (m) => duration(m.durationS) },
    { key: 'reason', header: 'Reason', cell: (m) => <span className="block max-w-[320px] truncate" title={m.reason}>{m.reason}</span> },
    {
      key: 'decision', header: status === 'pending' ? 'Decision' : 'Decided',
      cell: (m) => status === 'pending' ? (
        <div className="flex gap-1">
          <Button size="sm" variant="primary" icon={<Check size={13} />} loading={decide.isPending} onClick={() => decide.mutate({ id: m.id, status: 'approved' }, { onError: err, onSuccess: () => toast.push('success', 'Approved') })}>Approve</Button>
          <Button size="sm" variant="danger-outline" icon={<X size={13} />} onClick={() => { setReject(m); setComment(''); }}>Reject</Button>
        </div>
      ) : <span className="text-xs text-ink-3">{dateTime(m.decidedAt)}{m.comment ? ` · ${m.comment}` : ''}</span>,
    },
  ];
  return (
    <Card>
      <div className="px-3 pt-2">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]} />
      </div>
      <div className="mt-2">
        <DataTable rows={items} columns={columns} loading={q.isLoading} error={q.isError ? (q.error as Error).message : null} onRetry={() => q.refetch()} empty={<div className="px-6 py-14 text-center"><Check size={28} strokeWidth={1.75} className="mx-auto mb-3 text-ink-3" /><div className="text-base font-semibold text-ink">{status === 'pending' ? 'Nothing to approve' : `No ${status} entries`}</div></div>} />
      </div>
      <Modal
        open={Boolean(reject)}
        onClose={() => setReject(null)}
        title="Reject manual time"
        footer={<><Button onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" loading={decide.isPending} onClick={() => reject && decide.mutate({ id: reject.id, status: 'rejected', comment: comment.trim() || undefined }, { onError: err, onSuccess: () => { toast.push('success', 'Rejected'); setReject(null); } })}>Reject</Button></>}
      >
        {reject && (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">{reject.employee ? fullName(reject.employee) : 'Employee'} · {reject.date.slice(0, 10)} · {clock(reject.startedAt)}–{clock(reject.endedAt)} ({duration(reject.durationS)})</p>
            <Field label="Comment to the employee" hint="Optional"><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Why this entry is not accepted…" /></Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function AddTimeModal({ open, onClose, defaultEmployeeId, canPickEmployee }: { open: boolean; onClose: () => void; defaultEmployeeId: string; canPickEmployee: boolean }) {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useTrackingMutation((body: Record<string, unknown>) => http.post('/tracking/manual-time', body));
  const submit = () => {
    setError(null);
    create.mutate(
      { employeeId: employeeId || undefined, date, startedAt: new Date(`${date}T${start}:00`).toISOString(), endedAt: new Date(`${date}T${end}:00`).toISOString(), reason },
      { onSuccess: () => { toast.push('success', 'Manual time submitted for approval'); onClose(); setReason(''); }, onError: (e) => setError((e as Error).message) },
    );
  };
  return (
    <Modal open={open} onClose={onClose} title="Add manual time" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit} disabled={reason.trim().length < 3}>Submit for approval</Button></>}>
      <div className="space-y-3">
        <p className="text-xs text-ink-2">For work away from the PC. The entry stays pending until an approver accepts it and must not overlap tracked time.</p>
        {canPickEmployee && <Field label="Employee"><EmployeePicker value={employeeId} onChange={setEmployeeId} /></Field>}
        <div className="grid grid-cols-3 gap-2">
          <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="From" required><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="To" required><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Reason" required hint="At least 3 characters"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Client visit, offsite meeting…" /></Field>
        {error && <div className="rounded-lg bg-red-soft px-3 py-2 text-sm text-red-text">{error}</div>}
      </div>
    </Modal>
  );
}

