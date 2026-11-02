'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Download, Plus, Check, X, Timer } from 'lucide-react';
import { http, qs, type ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTimesheet, useTeamTimesheet, useManualTime, useTrackingMutation, type TimesheetRow, type Totals } from '@/lib/queries/tracking';
import { Card, KpiCard, Table, Th, Td, TableSkeleton, EmptyState, ErrorBanner, PageHeader, Button, Segmented, Modal, Field, Input, Textarea, Badge, useToast, Tabs } from '@/components/ui';
import { EmployeePicker, OrgFilters, PeriodPicker, usePeriod, StackedBar, ActivityPercent, duration, clock } from '@/components/tracking/shared';
import { fullName, dateTime, downloadText } from '@/lib/format';
import { useIdParam } from '@/lib/useIdParam';

export default function TimesheetsPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={8} cols={8} />}>
      <TimesheetsInner />
    </Suspense>
  );
}

function TimesheetsInner() {
  const { me, can } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'employee' | 'team' | 'approvals'>('employee');
  const [employeeId, setEmployeeId] = useIdParam('employeeId');
  const [org, setOrg] = useState({ departmentId: '', teamId: '' });
  const period = usePeriod('week');
  const [addOpen, setAddOpen] = useState(false);
  const selected = employeeId ?? me?.id ?? '';

  const emp = useTimesheet({ employeeId: selected, from: period.period.from, to: period.period.to }, mode === 'employee' && Boolean(selected));
  const team = useTeamTimesheet({ from: period.period.from, to: period.period.to, departmentId: org.departmentId || undefined, teamId: org.teamId || undefined });
  const canApprove = can('tracking.timesheets.approve');

  const exportCsv = async () => {
    const path = mode === 'team' ? `/tracking/timesheet/team${qs({ ...period.period, departmentId: org.departmentId || undefined, teamId: org.teamId || undefined, format: 'csv' })}` : `/tracking/timesheet${qs({ employeeId: selected, from: period.period.from, to: period.period.to, format: 'csv' })}`;
    try {
      const text = await http.text(path);
      downloadText(`timesheet-${period.period.from}-${period.period.to}.csv`, text);
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
            {mode !== 'approvals' && <Button size="sm" icon={<Download size={14} />} onClick={exportCsv}>CSV</Button>}
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add time</Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'employee', label: 'Employee' }, { value: 'team', label: 'Team' }, ...(canApprove ? [{ value: 'approvals' as const, label: 'Approvals' }] : [])]} />
        {mode === 'employee' && <div className="w-64"><EmployeePicker value={selected} onChange={(v) => setEmployeeId(v || null)} /></div>}
        {mode === 'team' && <div className="flex gap-2"><OrgFilters departmentId={org.departmentId} teamId={org.teamId} onChange={setOrg} /></div>}
        {mode !== 'approvals' && <PeriodPicker {...period} modes={['week', 'month']} />}
      </div>

      {mode === 'employee' && (
        <>
          {emp.isError && <ErrorBanner message={(emp.error as Error).message} onRetry={() => emp.refetch()} />}
          {emp.data && <TotalsRow totals={emp.data.totals} />}
          <Card>
            {emp.isLoading && <TableSkeleton rows={7} cols={9} />}
            {emp.data && emp.data.rows.every((r) => r.shiftCount === 0 && r.manualS === 0) && <EmptyState icon={<Timer size={28} strokeWidth={1.75} />} title="No time in this period" body="Nothing was tracked and no manual time was approved." />}
            {emp.data && emp.data.rows.some((r) => r.shiftCount > 0 || r.manualS > 0) && (
              <Table>
                <thead><tr><Th>Date</Th><Th>Status</Th><Th>Start</Th><Th>End</Th><Th right>Tracked</Th><Th right>Active</Th><Th right>Idle</Th><Th right>Manual</Th><Th right>Break</Th><Th>Activity</Th></tr></thead>
                <tbody>
                  {emp.data.rows.map((r) => <DayRow key={r.date} r={r} employeeId={selected} />)}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {mode === 'team' && (
        <>
          {team.isError && <ErrorBanner message={(team.error as Error).message} onRetry={() => team.refetch()} />}
          {team.data && <TotalsRow totals={team.data.totals} />}
          <Card>
            {team.isLoading && <TableSkeleton rows={8} cols={8} />}
            {team.data && team.data.items.length === 0 && <EmptyState title="No employees in view" body="Adjust the department or team filter." />}
            {team.data && team.data.items.length > 0 && (
              <Table>
                <thead><tr><Th>Employee</Th><Th right>Days</Th><Th right>Tracked</Th><Th right>Active</Th><Th right>Idle</Th><Th right>Manual</Th><Th>Mix</Th><Th>Activity</Th></tr></thead>
                <tbody>
                  {team.data.items.map((i) => (
                    <tr key={i.employee.id} className="hover:bg-surface-2">
                      <Td><button type="button" className="font-semibold text-ink hover:text-pri" onClick={() => { setEmployeeId(i.employee.id); setMode('employee'); }}>{fullName(i.employee)}</button><div className="text-[11px] text-ink-3">{i.employee.department?.name ?? '—'}</div></Td>
                      <Td right mono>{i.days}</Td>
                      <Td right mono>{duration(i.totals.trackedS)}</Td>
                      <Td right mono>{duration(i.totals.activeS)}</Td>
                      <Td right mono>{duration(i.totals.idleS)}</Td>
                      <Td right mono>{i.totals.manualS ? duration(i.totals.manualS) : '—'}</Td>
                      <Td><div className="w-32"><StackedBar parts={[{ label: 'Productive', seconds: i.totals.productiveS, className: 'bg-green' }, { label: 'Neutral', seconds: i.totals.neutralS, className: 'bg-gray-bar' }, { label: 'Unproductive', seconds: i.totals.unproductiveS, className: 'bg-red' }]} /></div></Td>
                      <Td><ActivityPercent value={i.totals.activityPercent} warn={50} alert={30} none={i.totals.trackedS === 0} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {mode === 'approvals' && <Approvals />}

      <AddTimeModal open={addOpen} onClose={() => setAddOpen(false)} defaultEmployeeId={canApprove ? selected : me?.id ?? ''} canPickEmployee={canApprove} />
    </div>
  );
}

function TotalsRow({ totals }: { totals: Totals }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-6">
      <KpiCard label="Tracked" value={duration(totals.trackedS)} context={`${totals.daysWorked} day${totals.daysWorked === 1 ? '' : 's'} worked`} />
      <KpiCard label="Active" value={duration(totals.activeS)} tone="green" />
      <KpiCard label="Idle" value={duration(totals.idleS)} tone="amber" />
      <KpiCard label="Manual (approved)" value={duration(totals.manualS)} tone="blue" />
      <KpiCard label="Breaks" value={duration(totals.breakS)} />
      <KpiCard label="Activity" value={`${totals.activityPercent}%`} />
    </div>
  );
}

function DayRow({ r, employeeId }: { r: TimesheetRow; employeeId: string }) {
  const statusTone = r.status === 'present' ? 'green' : r.status === 'late' || r.status === 'half_day' ? 'amber' : r.status === 'absent' ? 'red' : r.status === 'holiday' ? 'blue' : r.status === 'on_leave' ? 'violet' : 'gray';
  return (
    <tr className="hover:bg-surface-2">
      <Td><Link href={`/admin/tracking/timeline?employeeId=${employeeId}&date=${r.date}`} className="font-mono text-xs text-pri hover:underline">{r.date}</Link>{r.openShift && <Badge tone="green" dot className="ml-2">open</Badge>}</Td>
      <Td>{r.status ? <Badge tone={statusTone}>{r.status.replace('_', ' ')}</Badge> : <span className="text-ink-3">—</span>}</Td>
      <Td mono>{clock(r.firstStart)}</Td>
      <Td mono>{clock(r.lastEnd)}</Td>
      <Td right mono>{r.trackedS ? duration(r.trackedS) : '—'}</Td>
      <Td right mono>{r.activeS ? duration(r.activeS) : '—'}</Td>
      <Td right mono>{r.idleS ? duration(r.idleS) : '—'}</Td>
      <Td right mono>{r.manualS ? duration(r.manualS) : '—'}</Td>
      <Td right mono>{r.breakS ? duration(r.breakS) : '—'}</Td>
      <Td><ActivityPercent value={r.activityPercent} warn={50} alert={30} none={r.trackedS === 0} /></Td>
    </tr>
  );
}

function Approvals() {
  const toast = useToast();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const q = useManualTime({ status });
  const decide = useTrackingMutation((a: { id: string; status: 'approved' | 'rejected'; comment?: string }) => http.post(`/tracking/manual-time/${a.id}/decide`, { status: a.status, comment: a.comment }));
  const items = q.data?.items ?? [];
  return (
    <Card>
      <Tabs value={status} onChange={setStatus} className="px-3" tabs={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]} />
      {q.isLoading && <TableSkeleton rows={5} cols={6} />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && items.length === 0 && <EmptyState icon={<Check size={28} strokeWidth={1.75} />} title={status === 'pending' ? 'Nothing to approve' : `No ${status} entries`} />}
      {items.length > 0 && (
        <Table>
          <thead><tr><Th>Employee</Th><Th>Date</Th><Th>Time</Th><Th right>Duration</Th><Th>Reason</Th><Th>{status === 'pending' ? 'Decision' : 'Decided'}</Th></tr></thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="hover:bg-surface-2">
                <Td className="font-semibold">{m.employee ? fullName(m.employee) : '—'}</Td>
                <Td mono>{m.date.slice(0, 10)}</Td>
                <Td mono>{clock(m.startedAt)}–{clock(m.endedAt)}</Td>
                <Td right mono>{duration(m.durationS)}</Td>
                <Td className="max-w-[320px]"><span className="block truncate" title={m.reason}>{m.reason}</span></Td>
                <Td>
                  {status === 'pending' ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="primary" icon={<Check size={13} />} loading={decide.isPending} onClick={() => decide.mutate({ id: m.id, status: 'approved' }, { onError: (e) => toast.push('error', (e as Error).message), onSuccess: () => toast.push('success', 'Approved') })}>Approve</Button>
                      <Button size="sm" variant="danger" icon={<X size={13} />} loading={decide.isPending} onClick={() => { const c = window.prompt('Reason for rejection (optional)') ?? undefined; decide.mutate({ id: m.id, status: 'rejected', comment: c }, { onError: (e) => toast.push('error', (e as Error).message) }); }}>Reject</Button>
                    </div>
                  ) : <span className="text-xs text-ink-3">{dateTime(m.decidedAt)}{m.comment ? ` · ${m.comment}` : ''}</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
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
    const startedAt = new Date(`${date}T${start}:00`).toISOString();
    const endedAt = new Date(`${date}T${end}:00`).toISOString();
    create.mutate(
      { employeeId: employeeId || undefined, date, startedAt, endedAt, reason },
      { onSuccess: () => { toast.push('success', 'Manual time submitted for approval'); onClose(); setReason(''); }, onError: (e) => setError((e as Error).message) },
    );
  };
  return (
    <Modal open={open} onClose={onClose} title="Add manual time" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit} disabled={reason.trim().length < 3}>Submit</Button></>}>
      <div className="space-y-3">
        <p className="text-xs text-ink-2">For work away from the PC. The entry stays pending until an approver accepts it and must not overlap tracked time.</p>
        {canPickEmployee && <Field label="Employee"><EmployeePicker value={employeeId} onChange={setEmployeeId} /></Field>}
        <div className="grid grid-cols-3 gap-2">
          <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="From" required><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="To" required><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Reason" required hint="At least 3 characters"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Client visit, offsite meeting…" /></Field>
        {error && <ErrorBanner message={error} />}
      </div>
    </Modal>
  );
}
