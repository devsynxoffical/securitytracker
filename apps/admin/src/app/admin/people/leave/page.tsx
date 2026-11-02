'use client';

import { confirmDialog, ConfirmHost } from '@/components/platform/confirm';

import { Suspense, useMemo, useState } from 'react';
import { Plane, Plus, Pencil, Trash2, Check, X, Ban } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLeaveRequests, useLeaveCalendar, useLeaveTypes, useBalances, useDepartments, useTeams, useEmployeesList, usePeopleMutation, PEOPLE_ALL, type LeaveRequest, type LeaveType } from '@/lib/queries/people';
import { Avatar, Badge, Button, Card, Checkbox, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Pagination, Select, Skeleton, Textarea, useToast } from '@/components/ui';
import { DataTable, FilterChip, KpiTile, Menu, Progress, Toggle, Tooltip, ViewTabs, type Column } from '@/components/ui/advanced';
import { DecisionModal, EmployeeSelect, MonthPicker, OptionList, requestTone, thisMonth, daysOf, isWeekend, monthLabel } from '@/components/people/shared';
import { dateOnly, fullName, relative, titleCase } from '@/lib/format';

type Tab = 'requests' | 'calendar' | 'balances' | 'types';

function LeavePage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Leave /></Suspense>;
}

function Leave() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('requests');
  const [requesting, setRequesting] = useState(false);
  const pending = useLeaveRequests({ status: 'pending', limit: 200 });
  const month = thisMonth();
  const cal = useLeaveCalendar({ month });
  const outNow = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (cal.data?.requests ?? []).filter((r) => r.status === 'approved' && r.dateFrom.slice(0, 10) <= today && r.dateTo.slice(0, 10) >= today).length;
  }, [cal.data]);
  const approvedDays = useMemo(() => (cal.data?.requests ?? []).filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.days), 0), [cal.data]);
  return (
    <div>
      <PageHeader title="Leave" subtitle="Requests, calendar, balances and types (15 F25)" actions={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setRequesting(true)}>New request</Button>} />
      <div className="mb-4 grid grid-cols-4 gap-3">
        <KpiTile label="Pending approval" value={pending.data?.items.length ?? '—'} tone={(pending.data?.items.length ?? 0) > 0 ? 'amber' : undefined} loading={pending.isLoading} onClick={() => setTab('requests')} />
        <KpiTile label="Out today" value={outNow} tone="violet" loading={cal.isLoading} onClick={() => setTab('calendar')} />
        <KpiTile label={`Approved days · ${monthLabel(month)}`} value={approvedDays} loading={cal.isLoading} />
        <KpiTile label="Holidays this month" value={cal.data?.holidays.length ?? '—'} tone="blue" loading={cal.isLoading} />
      </div>
      <Card>
        <ViewTabs value={tab} onChange={setTab} views={[{ value: 'requests', label: 'Requests', count: pending.data?.items.length }, { value: 'calendar', label: 'Calendar' }, { value: 'balances', label: 'Balances' }, ...(can('hr.leave.manage') ? [{ value: 'types' as Tab, label: 'Leave types' }] : [])]} />
        {tab === 'requests' && <Requests />}
        {tab === 'calendar' && <Calendar />}
        {tab === 'balances' && <Balances />}
        {tab === 'types' && <Types />}
      </Card>
      {requesting && <RequestModal onClose={() => setRequesting(false)} />}
    </div>
  );
}

function Requests() {
  const { can, me } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'cancelled' | 'all'>('pending');
  const [employeeId, setEmployeeId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<LeaveRequest[][]>([]);
  const [decision, setDecision] = useState<{ r: LeaveRequest; action: 'approved' | 'rejected' | 'cancel' } | null>(null);
  const employees = useEmployeesList();
  const types = useLeaveTypes(true);
  const params = useMemo(() => ({ status: status === 'all' ? undefined : status, employeeId: employeeId || undefined, cursor, limit: 50 }), [status, employeeId, cursor]);
  const q = useLeaveRequests(params);
  const rows = useMemo(() => { const seen = new Set<string>(); return [...pages.flat(), ...(q.data?.items ?? [])].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).filter((r) => !typeId || r.leaveTypeId === typeId); }, [pages, q.data, typeId]);
  const reset = () => { setCursor(undefined); setPages([]); };
  const decide = usePeopleMutation(({ id, body }: { id: string; body: Record<string, unknown> }) => http.post(`/leave-requests/${id}/decide`, body), PEOPLE_ALL);
  const cancel = usePeopleMutation(({ id, comment }: { id: string; comment?: string }) => http.post(`/leave-requests/${id}/cancel`, { comment }), PEOPLE_ALL);

  const cols: Column<LeaveRequest>[] = [
    { key: 'employee', header: 'Employee', locked: true, cell: (r) => <div className="flex items-center gap-2.5">{r.employee && <Avatar name={fullName(r.employee)} size={26} />}<div className="min-w-0"><div className="font-semibold text-ink">{r.employee ? fullName(r.employee) : '—'}</div><div className="text-xs text-ink-3">{r.employee?.department?.name ?? ''}</div></div></div> },
    { key: 'type', header: 'Type', cell: (r) => <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: r.leaveType?.colour ?? 'var(--gray)' }} />{r.leaveType?.name ?? titleCase(r.type)}</span> },
    { key: 'dates', header: 'Dates', cell: (r) => <>{dateOnly(r.dateFrom)}{r.dateFrom !== r.dateTo && ` – ${dateOnly(r.dateTo)}`}{r.halfDay && <Badge tone="gray" className="ml-1">½</Badge>}</> },
    { key: 'days', header: 'Days', right: true, mono: true, cell: (r) => Number(r.days) },
    { key: 'reason', header: 'Reason', cell: (r) => <div className="max-w-xs text-ink-2">{r.reason}{r.comment && <div className="text-xs text-ink-3">Decision: {r.comment}</div>}</div> },
    { key: 'status', header: 'Status', cell: (r) => <Badge tone={requestTone(r.status)}>{titleCase(r.status)}</Badge> },
    { key: 'requested', header: 'Requested', right: true, cell: (r) => <span className="text-ink-3">{relative(r.createdAt)}</span> },
  ];
  const empName = employees.data?.find((e) => e.id === employeeId);
  const typeName = types.data?.find((t) => t.id === typeId)?.name;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-2 px-3 py-2.5">
        <FilterChip label="Status" value={status === 'all' ? undefined : titleCase(status)} onClear={() => { setStatus('all'); reset(); }}>
          <OptionList value={status === 'all' ? '' : status} onChange={(v) => { setStatus((v || 'all') as typeof status); reset(); }} options={['pending', 'approved', 'rejected', 'cancelled'].map((s) => ({ value: s, label: titleCase(s) }))} />
        </FilterChip>
        <FilterChip label="Employee" value={empName ? fullName(empName) : undefined} onClear={() => { setEmployeeId(''); reset(); }}>
          <OptionList value={employeeId} onChange={(v) => { setEmployeeId(v); reset(); }} options={(employees.data ?? []).map((e) => ({ value: e.id, label: fullName(e) }))} />
        </FilterChip>
        <FilterChip label="Type" value={typeName} onClear={() => setTypeId('')}>
          <OptionList value={typeId} onChange={setTypeId} options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        </FilterChip>
      </div>
      <DataTable
        rows={rows}
        columns={cols}
        loading={q.isLoading && pages.length === 0}
        error={q.isError ? (q.error as Error).message : null}
        onRetry={() => q.refetch()}
        storageKey="people.leave.requests"
        empty={<EmptyState icon={<Plane size={20} />} title="No leave requests" body="Requests from the desktop app and this panel appear here." />}
        rowActions={(r) => {
          const mine = r.employeeId === me?.id;
          return (
            <>
              {r.status === 'pending' && can('attendance.approve') && <>
                <Tooltip label="Approve"><button type="button" className="rounded p-1 text-green hover:bg-green-soft" onClick={() => setDecision({ r, action: 'approved' })} aria-label="Approve"><Check size={14} /></button></Tooltip>
                <Tooltip label="Reject"><button type="button" className="rounded p-1 text-red hover:bg-red-soft" onClick={() => setDecision({ r, action: 'rejected' })} aria-label="Reject"><X size={14} /></button></Tooltip>
              </>}
              {((r.status === 'pending' && mine) || (r.status === 'approved' && can('attendance.approve'))) && <Tooltip label="Cancel request"><button type="button" className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" onClick={() => setDecision({ r, action: 'cancel' })} aria-label="Cancel"><Ban size={14} /></button></Tooltip>}
            </>
          );
        }}
        footer={rows.length > 0 ? <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={() => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } }} loading={q.isFetching} /> : undefined}
      />
      {decision && (
        <DecisionModal title={`${decision.action === 'cancel' ? 'Cancel' : decision.action === 'approved' ? 'Approve' : 'Reject'} leave · ${decision.r.employee ? fullName(decision.r.employee) : ''}`} confirmLabel={decision.action === 'cancel' ? 'Cancel request' : titleCase(decision.action)} danger={decision.action !== 'approved'} loading={decide.isPending || cancel.isPending} onClose={() => setDecision(null)}
          onConfirm={(comment) => {
            const done = { onSuccess: () => { toast.push('success', 'Updated'); setDecision(null); }, onError: (e: unknown) => toast.push('error', (e as Error).message) };
            if (decision.action === 'cancel') cancel.mutate({ id: decision.r.id, comment: comment || undefined }, done);
            else decide.mutate({ id: decision.r.id, body: { status: decision.action, comment: comment || undefined } }, done);
          }}>
          <div className="mb-3 rounded-card border border-line bg-surface-2 p-3 text-sm text-ink-2">
            <div className="flex items-center gap-1.5 font-semibold text-ink"><span className="h-2 w-2 rounded-full" style={{ background: decision.r.leaveType?.colour ?? 'var(--gray)' }} />{decision.r.leaveType?.name ?? titleCase(decision.r.type)} · {Number(decision.r.days)} day{Number(decision.r.days) === 1 ? '' : 's'}</div>
            <div className="font-mono text-xs">{dateOnly(decision.r.dateFrom)}{decision.r.dateFrom !== decision.r.dateTo && ` – ${dateOnly(decision.r.dateTo)}`}</div>
            <div className="mt-1">{decision.r.reason}</div>
          </div>
        </DecisionModal>
      )}
    </>
  );
}

function Calendar() {
  const [month, setMonth] = useState(thisMonth());
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const departments = useDepartments();
  const teams = useTeams();
  const q = useLeaveCalendar({ month, departmentId: departmentId || undefined, teamId: teamId || undefined });
  const dates = daysOf(month);
  const today = new Date().toISOString().slice(0, 10);
  const people = useMemo(() => {
    const map = new Map<string, { employee: NonNullable<LeaveRequest['employee']>; requests: LeaveRequest[] }>();
    for (const r of q.data?.requests ?? []) { if (!r.employee) continue; const e = map.get(r.employeeId) ?? { employee: r.employee, requests: [] }; e.requests.push(r); map.set(r.employeeId, e); }
    return Array.from(map.values()).sort((a, b) => a.employee.lastName.localeCompare(b.employee.lastName));
  }, [q.data]);
  const perDay = useMemo(() => dates.map((d) => (q.data?.requests ?? []).filter((r) => r.status === 'approved' && r.dateFrom.slice(0, 10) <= d && r.dateTo.slice(0, 10) >= d).length), [dates, q.data]);
  const deptName = departments.data?.find((d) => d.id === departmentId)?.name;
  const teamName = teams.data?.find((t) => t.id === teamId)?.name;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-2 px-3 py-2.5">
        <MonthPicker value={month} onChange={setMonth} />
        <FilterChip label="Department" value={deptName} onClear={() => { setDepartmentId(''); setTeamId(''); }}>
          <OptionList value={departmentId} onChange={(v) => { setDepartmentId(v); setTeamId(''); }} options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        </FilterChip>
        <FilterChip label="Team" value={teamName} onClear={() => setTeamId('')}>
          <OptionList value={teamId} onChange={setTeamId} options={(teams.data ?? []).filter((t) => !departmentId || t.departmentId === departmentId).map((t) => ({ value: t.id, label: t.name }))} />
        </FilterChip>
        <div className="ml-auto flex gap-3 text-xs text-ink-2"><span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-pri" />Approved</span><span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-sm border border-dashed border-amber bg-amber-soft" />Pending</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue" />Holiday</span></div>
      </div>
      {q.isLoading && <div className="p-4"><Skeleton className="h-48" /></div>}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && people.length === 0 && <EmptyState icon={<Plane size={20} />} title="Nobody is out this month" body="Approved and pending leave shows up on the calendar." />}
      {q.data && people.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-2 text-2xs font-semibold uppercase text-ink-3">
                <th className="sticky left-0 z-20 min-w-[200px] bg-surface-2 px-3 py-2 text-left">Employee</th>
                {dates.map((d) => { const hol = q.data!.holidays.find((h) => h.date.slice(0, 10) === d); return <th key={d} className={`w-7 px-0 py-2 text-center font-semibold ${hol ? 'text-blue-text' : isWeekend(d) ? 'text-ink-3/60' : ''} ${d === today ? 'text-pri' : ''}`}>{hol ? <Tooltip label={hol.name}><span>{Number(d.slice(8))}</span></Tooltip> : Number(d.slice(8))}</th>; })}
              </tr>
              <tr className="bg-surface-2 text-2xs text-ink-3">
                <th className="sticky left-0 z-20 bg-surface-2 px-3 py-1 text-left font-medium normal-case tracking-normal">Out per day</th>
                {perDay.map((n, i) => <th key={dates[i]} className="px-0 py-1 text-center font-mono font-medium">{n > 0 ? n : ''}</th>)}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.employee.id} className="group border-t border-line-2 hover:bg-surface-2">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-[var(--row-py)] group-hover:bg-surface-2"><div className="flex items-center gap-2"><Avatar name={fullName(p.employee)} size={24} /><div className="min-w-0"><div className="truncate font-semibold text-ink">{fullName(p.employee)}</div><div className="text-2xs normal-case tracking-normal text-ink-3">{p.employee.department?.name ?? ''}</div></div></div></td>
                  {dates.map((d) => {
                    const r = p.requests.find((x) => x.dateFrom.slice(0, 10) <= d && x.dateTo.slice(0, 10) >= d);
                    const start = r && r.dateFrom.slice(0, 10) === d;
                    const end = r && r.dateTo.slice(0, 10) === d;
                    return (
                      <td key={d} className={`px-0 py-[var(--row-py)] ${isWeekend(d) ? 'bg-surface-2/50' : ''}`}>
                        {r ? (
                          <Tooltip label={`${r.leaveType?.name ?? r.type} · ${titleCase(r.status)} · ${Number(r.days)} d`}>
                            <span className={`block h-3.5 w-full ${start ? 'ml-0.5 rounded-l' : ''} ${end ? 'mr-0.5 rounded-r' : ''} ${r.status === 'pending' ? 'border border-dashed border-amber bg-amber-soft' : ''}`} style={r.status === 'approved' ? { background: r.leaveType?.colour ?? 'var(--pri)' } : undefined} />
                          </Tooltip>
                        ) : <span className="block h-3.5" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Balances() {
  const { can } = useAuth();
  const toast = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [employeeId, setEmployeeId] = useState('');
  const [adjusting, setAdjusting] = useState<{ employeeId: string; leaveTypeId: string; name: string } | null>(null);
  const [days, setDays] = useState('1');
  const [reason, setReason] = useState('');
  const employees = useEmployeesList();
  const q = useBalances({ year, employeeId: employeeId || undefined });
  const adjust = usePeopleMutation((b: Record<string, unknown>) => http.post('/hr/leave-balances/adjust', b), PEOPLE_ALL);
  const types = useMemo(() => Array.from(new Map((q.data?.items ?? []).map((b) => [b.leaveTypeId, b.leaveType])).entries()), [q.data]);
  const rows = (q.data?.employees ?? []).map((e) => ({ ...e, id: e.id }));
  const empName = employees.data?.find((e) => e.id === employeeId);
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'employee', header: 'Employee', locked: true, cell: (e) => <div className="flex items-center gap-2.5"><Avatar name={fullName(e)} size={26} /><div className="min-w-0"><div className="font-semibold text-ink">{fullName(e)}</div><div className="text-xs text-ink-3">{e.department?.name ?? ''}</div></div></div> },
    ...types.map(([tid, t]): Column<(typeof rows)[number]> => ({
      key: tid,
      header: <span className="inline-flex items-center gap-1.5 normal-case tracking-normal"><span className="h-2 w-2 rounded-full" style={{ background: t.colour }} />{t.name}</span>,
      width: 180,
      cell: (e) => {
        const b = q.data!.items.find((x) => x.employeeId === e.id && x.leaveTypeId === tid);
        if (!b) return <span className="text-ink-3">—</span>;
        const total = Number(b.entitledDays) + Number(b.carriedOverDays) + Number(b.adjustmentsDays);
        return (
          <button type="button" className="w-full text-left disabled:cursor-default" disabled={!can('hr.leave.manage')} onClick={() => setAdjusting({ employeeId: e.id, leaveTypeId: tid, name: `${fullName(e)} · ${t.name}` })} title={`Entitled ${b.entitledDays} · Carried ${b.carriedOverDays} · Used ${b.usedDays} · Pending ${b.pendingDays} · Adjustments ${b.adjustmentsDays}`}>
            <div className="flex items-baseline justify-between font-mono text-xs"><span className={Number(b.availableDays) <= 0 ? 'font-semibold text-red-text' : 'font-semibold text-ink'}>{Number(b.availableDays)}</span><span className="text-ink-3">/ {total}</span></div>
            <Progress value={Number(b.usedDays) + Number(b.pendingDays)} max={total || 1} size={5} tone={Number(b.availableDays) <= 0 ? 'red' : 'violet'} />
          </button>
        );
      },
    })),
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-2 px-3 py-2.5">
        <FilterChip label="Year" value={String(year)} active>
          <OptionList value={String(year)} onChange={(v) => v && setYear(Number(v))} options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))} emptyLabel="Current" />
        </FilterChip>
        <FilterChip label="Employee" value={empName ? fullName(empName) : undefined} onClear={() => setEmployeeId('')}>
          <OptionList value={employeeId} onChange={setEmployeeId} options={(employees.data ?? []).map((e) => ({ value: e.id, label: fullName(e) }))} />
        </FilterChip>
        <span className="ml-auto text-xs text-ink-3">Available / total · bar = used + pending{can('hr.leave.manage') ? ' · click a cell to adjust' : ''}</span>
      </div>
      <DataTable rows={rows} columns={cols} loading={q.isLoading} error={q.isError ? (q.error as Error).message : null} onRetry={() => q.refetch()} storageKey="people.leave.balances" empty={<EmptyState title="No balances" body="Balances are created when leave types exist and employees are active." />} />
      {adjusting && (
        <Modal open onClose={() => setAdjusting(null)} title={`Adjust balance · ${adjusting.name}`} width={440} footer={<><Button onClick={() => setAdjusting(null)}>Cancel</Button><Button variant="primary" disabled={!reason.trim() || !Number(days)} loading={adjust.isPending} onClick={() => adjust.mutate({ employeeId: adjusting.employeeId, leaveTypeId: adjusting.leaveTypeId, year, days: Number(days), reason }, { onSuccess: () => { toast.push('success', 'Balance adjusted'); setAdjusting(null); setReason(''); }, onError: (e) => toast.push('error', (e as Error).message) })}>Apply</Button></>}>
          <Field label="Days (negative removes)"><Input type="number" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
          <Field label="Reason" required><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  );
}

function Types() {
  const toast = useToast();
  const q = useLeaveTypes(true);
  const [editing, setEditing] = useState<LeaveType | 'new' | null>(null);
  const del = usePeopleMutation((id: string) => http.del(`/hr/leave-types/${id}`), PEOPLE_ALL);
  const toggleActive = usePeopleMutation(({ id, isActive }: { id: string; isActive: boolean }) => http.patch(`/hr/leave-types/${id}`, { isActive }), PEOPLE_ALL);
  const cols: Column<LeaveType>[] = [
    { key: 'name', header: 'Name', locked: true, cell: (t) => <span className="inline-flex items-center gap-2 font-semibold text-ink"><span className="h-2.5 w-2.5 rounded-full" style={{ background: t.colour }} />{t.name}</span> },
    { key: 'code', header: 'Code', mono: true, cell: (t) => t.code },
    { key: 'allowance', header: 'Allowance', right: true, mono: true, cell: (t) => `${Number(t.annualAllowanceDays)} d` },
    { key: 'accrual', header: 'Accrual', cell: (t) => <>{titleCase(t.accrual)}{Number(t.carryOverMaxDays) > 0 && <div className="text-xs text-ink-3">carry over ≤ {Number(t.carryOverMaxDays)}</div>}</> },
    { key: 'rules', header: 'Rules', cell: (t) => <div className="flex flex-wrap gap-1"><Badge tone={t.paid ? 'green' : 'gray'}>{t.paid ? 'Paid' : 'Unpaid'}</Badge><Badge tone={t.requiresApproval ? 'amber' : 'blue'}>{t.requiresApproval ? 'Approval' : 'Auto-approve'}</Badge>{t.allowHalfDay && <Badge tone="gray">Half days</Badge>}</div> },
    { key: 'active', header: 'Active', cell: (t) => <Toggle checked={t.isActive} onChange={(v) => toggleActive.mutate({ id: t.id, isActive: v }, { onError: (e) => toast.push('error', (e as Error).message) })} /> },
  ];
  return (
    <>
      <div className="flex items-center justify-between border-b border-line-2 px-3 py-2.5">
        <span className="text-sm text-ink-2">Types in use are deactivated rather than deleted.</span>
        <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing('new')}>New type</Button>
      </div>
      <DataTable rows={q.data ?? []} columns={cols} loading={q.isLoading} error={q.isError ? (q.error as Error).message : null} onRetry={() => q.refetch()} empty={<EmptyState title="No leave types" body="Create Annual, Sick and Unpaid to start." />}
        rowActions={(t) => <Menu items={[{ label: 'Edit', icon: <Pencil size={13} />, onSelect: () => setEditing(t) }, { separator: true, label: '' }, { label: 'Remove', icon: <Trash2 size={13} />, danger: true, onSelect: () => void confirmDialog({ title: `Remove ${t.name}? Types in use are deactivated.`, danger: true }).then((ok) => ok && del.mutate(t.id, { onError: (e) => toast.push('error', (e as Error).message) }) )}]} />} />
      {editing && <TypeModal type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TypeModal({ type, onClose }: { type: LeaveType | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(type?.name ?? '');
  const [code, setCode] = useState(type?.code ?? '');
  const [colour, setColour] = useState(type?.colour ?? '#6B46C1');
  const [paid, setPaid] = useState(type?.paid ?? true);
  const [allowance, setAllowance] = useState(String(type?.annualAllowanceDays ?? 0));
  const [accrual, setAccrual] = useState<'upfront' | 'monthly'>(type?.accrual ?? 'upfront');
  const [carry, setCarry] = useState(String(type?.carryOverMaxDays ?? 0));
  const [requiresApproval, setRequiresApproval] = useState(type?.requiresApproval ?? true);
  const [allowHalfDay, setAllowHalfDay] = useState(type?.allowHalfDay ?? true);
  const [isActive, setIsActive] = useState(type?.isActive ?? true);
  const save = usePeopleMutation((b: Record<string, unknown>) => (type ? http.patch(`/hr/leave-types/${type.id}`, b) : http.post('/hr/leave-types', b)), PEOPLE_ALL);
  return (
    <Modal open onClose={onClose} title={type ? 'Edit leave type' : 'New leave type'} width={520} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim() || !code.trim()} loading={save.isPending} onClick={() => save.mutate({ name, code: code.toUpperCase(), colour, paid, annualAllowanceDays: Number(allowance), accrual, carryOverMaxDays: Number(carry), requiresApproval, allowHalfDay, isActive }, { onSuccess: () => { toast.push('success', 'Saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Code" required hint="UPPER_SNAKE"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} disabled={Boolean(type)} /></Field>
        <Field label="Colour"><Input type="color" value={colour} onChange={(e) => setColour(e.target.value)} /></Field>
        <Field label="Annual allowance (days)"><Input type="number" step="0.5" value={allowance} onChange={(e) => setAllowance(e.target.value)} /></Field>
        <Field label="Accrual"><Select value={accrual} onChange={(e) => setAccrual(e.target.value as 'upfront' | 'monthly')}><option value="upfront">Upfront on 1 January</option><option value="monthly">Monthly (allowance / 12)</option></Select></Field>
        <Field label="Carry-over max (days)"><Input type="number" step="0.5" value={carry} onChange={(e) => setCarry(e.target.value)} /></Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Toggle checked={paid} onChange={setPaid} label="Paid (balance enforced)" />
        <Toggle checked={requiresApproval} onChange={setRequiresApproval} label="Requires approval" />
        <Toggle checked={allowHalfDay} onChange={setAllowHalfDay} label="Allow half day" />
        <Toggle checked={isActive} onChange={setIsActive} label="Active" />
      </div>
    </Modal>
  );
}

function RequestModal({ onClose }: { onClose: () => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const types = useLeaveTypes();
  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [dateFrom, setFrom] = useState('');
  const [dateTo, setTo] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const balances = useBalances({ employeeId: employeeId || me?.id });
  const selected = types.data?.find((t) => t.id === leaveTypeId);
  const balance = balances.data?.items.find((b) => b.leaveTypeId === leaveTypeId);
  const create = usePeopleMutation((b: Record<string, unknown>) => http.post('/leave-requests', b), PEOPLE_ALL);
  const total = balance ? Number(balance.entitledDays) + Number(balance.carriedOverDays) + Number(balance.adjustmentsDays) : 0;
  return (
    <Modal open onClose={onClose} title="New leave request" width={520} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!leaveTypeId || !dateFrom || !dateTo || !reason.trim()} loading={create.isPending} onClick={() => create.mutate({ employeeId: employeeId || undefined, leaveTypeId, dateFrom, dateTo: halfDay ? dateFrom : dateTo, halfDay, reason }, { onSuccess: () => { toast.push('success', 'Leave requested'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Submit</Button></>}>
      <div className="space-y-3">
        {can('attendance.approve') && <Field label="Employee"><EmployeeSelect value={employeeId} onChange={setEmployeeId} emptyLabel="Myself" /></Field>}
        <Field label="Leave type" required group>
          <div className="flex flex-wrap gap-1.5">
            {(types.data ?? []).map((t) => <button key={t.id} type="button" onClick={() => setLeaveTypeId(t.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition ${leaveTypeId === t.id ? 'border-pri bg-pri-soft text-pri-2' : 'border-line bg-surface text-ink-2 hover:text-ink'}`}><span className="h-2 w-2 rounded-full" style={{ background: t.colour }} />{t.name}{!t.paid && <span className="text-2xs normal-case tracking-normal text-ink-3">unpaid</span>}</button>)}
          </div>
        </Field>
        {balance && (
          <div className="rounded-card border border-line bg-surface-2 p-3">
            <div className="flex items-baseline justify-between text-sm"><span className="text-ink-2">Available</span><span className="font-mono"><b className="text-ink">{Number(balance.availableDays)}</b> <span className="text-ink-3">/ {total} days</span></span></div>
            <div className="mt-1.5"><Progress value={Number(balance.usedDays) + Number(balance.pendingDays)} max={total || 1} size={6} tone="violet" /></div>
            <div className="mt-1 text-2xs normal-case tracking-normal text-ink-3">used {Number(balance.usedDays)} · pending {Number(balance.pendingDays)}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" required><Input type="date" value={dateFrom} onChange={(e) => { setFrom(e.target.value); if (!dateTo || halfDay) setTo(e.target.value); }} /></Field>
          <Field label="To" required><Input type="date" value={halfDay ? dateFrom : dateTo} min={dateFrom} disabled={halfDay} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        {selected?.allowHalfDay && <Checkbox checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} label="Half day (single day, counts 0.5)" />}
        <Field label="Reason" required><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export default function LeavePageWithConfirm() {
  return (
    <>
      <LeavePage />
      <ConfirmHost />
    </>
  );
}
