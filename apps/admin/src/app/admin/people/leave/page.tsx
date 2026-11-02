'use client';

import { Suspense, useMemo, useState } from 'react';
import { Plane, Plus, Pencil, Trash2 } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLeaveRequests, useLeaveCalendar, useLeaveTypes, useBalances, usePeopleMutation, PEOPLE_ALL, type LeaveRequest, type LeaveType } from '@/lib/queries/people';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Pagination, Segmented, Select, Skeleton, Table, TableSkeleton, Tabs, Td, Textarea, Th, useToast } from '@/components/ui';
import { DecisionModal, DepartmentSelect, EmployeeSelect, MonthPicker, TeamSelect, requestTone, thisMonth } from '@/components/people/shared';
import { dateOnly, fullName, relative, titleCase } from '@/lib/format';

type Tab = 'requests' | 'calendar' | 'types' | 'balances';

export default function LeavePage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Leave /></Suspense>;
}

function Leave() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('requests');
  const [requesting, setRequesting] = useState(false);
  return (
    <div>
      <PageHeader title="Leave" subtitle="Requests, calendar, types and balances (15 F25)" actions={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setRequesting(true)}>New request</Button>} />
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'requests', label: 'Requests' }, { value: 'calendar', label: 'Calendar' }, { value: 'balances', label: 'Balances' }, ...(can('hr.leave.manage') ? [{ value: 'types' as Tab, label: 'Leave types' }] : [])]} />
      {tab === 'requests' && <Requests />}
      {tab === 'calendar' && <Calendar />}
      {tab === 'balances' && <Balances />}
      {tab === 'types' && <Types />}
      {requesting && <RequestModal onClose={() => setRequesting(false)} />}
    </div>
  );
}

function Requests() {
  const { can, me } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'cancelled' | 'all'>('pending');
  const [employeeId, setEmployeeId] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<LeaveRequest[][]>([]);
  const [decision, setDecision] = useState<{ r: LeaveRequest; action: 'approved' | 'rejected' | 'cancel' } | null>(null);
  const params = useMemo(() => ({ status: status === 'all' ? undefined : status, employeeId: employeeId || undefined, cursor, limit: 50 }), [status, employeeId, cursor]);
  const q = useLeaveRequests(params);
  const rows = useMemo(() => { const seen = new Set<string>(); return [...pages.flat(), ...(q.data?.items ?? [])].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))); }, [pages, q.data]);
  const reset = () => { setCursor(undefined); setPages([]); };
  const decide = usePeopleMutation(({ id, body }: { id: string; body: Record<string, unknown> }) => http.post(`/leave-requests/${id}/decide`, body), PEOPLE_ALL);
  const cancel = usePeopleMutation(({ id, comment }: { id: string; comment?: string }) => http.post(`/leave-requests/${id}/cancel`, { comment }), PEOPLE_ALL);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={status} onChange={(v) => { setStatus(v); reset(); }} options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All' }]} />
        <div className="w-56"><EmployeeSelect value={employeeId} onChange={(v) => { setEmployeeId(v); reset(); }} /></div>
      </div>
      <Card>
        {q.isLoading && pages.length === 0 && <TableSkeleton cols={7} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && rows.length === 0 && <EmptyState icon={<Plane size={20} />} title="No leave requests" body="Requests from the desktop app and this panel appear here." />}
        {rows.length > 0 && (
          <>
            <Table>
              <thead><tr><Th>Employee</Th><Th>Type</Th><Th>Dates</Th><Th right>Days</Th><Th>Reason</Th><Th>Status</Th><Th right>Requested</Th><Th /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const mine = r.employeeId === me?.id;
                  return (
                    <tr key={r.id} className="hover:bg-surface-2">
                      <Td className="font-semibold">{r.employee ? fullName(r.employee) : '—'}<div className="text-xs font-normal text-ink-3">{r.employee?.department?.name ?? ''}</div></Td>
                      <Td><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: r.leaveType?.colour ?? '#5C666E' }} />{r.leaveType?.name ?? titleCase(r.type)}</span></Td>
                      <Td>{dateOnly(r.dateFrom)}{r.dateFrom !== r.dateTo && ` – ${dateOnly(r.dateTo)}`}{r.halfDay && <Badge tone="gray" className="ml-1">½</Badge>}</Td>
                      <Td right mono>{Number(r.days)}</Td>
                      <Td className="max-w-xs text-ink-2">{r.reason}{r.comment && <div className="text-xs text-ink-3">Decision: {r.comment}</div>}</Td>
                      <Td><Badge tone={requestTone(r.status)}>{titleCase(r.status)}</Badge></Td>
                      <Td right className="text-ink-3">{relative(r.createdAt)}</Td>
                      <Td right>
                        <div className="flex justify-end gap-1">
                          {r.status === 'pending' && can('attendance.approve') && <><Button size="sm" variant="primary" onClick={() => setDecision({ r, action: 'approved' })}>Approve</Button><Button size="sm" variant="danger-outline" onClick={() => setDecision({ r, action: 'rejected' })}>Reject</Button></>}
                          {((r.status === 'pending' && mine) || (r.status === 'approved' && can('attendance.approve'))) && <Button size="sm" variant="ghost" onClick={() => setDecision({ r, action: 'cancel' })}>Cancel</Button>}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={() => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } }} loading={q.isFetching} />
          </>
        )}
      </Card>
      {decision && (
        <DecisionModal title={`${decision.action === 'cancel' ? 'Cancel' : decision.action === 'approved' ? 'Approve' : 'Reject'} leave · ${decision.r.employee ? fullName(decision.r.employee) : ''}`} confirmLabel={decision.action === 'cancel' ? 'Cancel request' : titleCase(decision.action)} danger={decision.action !== 'approved'} loading={decide.isPending || cancel.isPending} onClose={() => setDecision(null)}
          onConfirm={(comment) => {
            const done = { onSuccess: () => { toast.push('success', 'Updated'); setDecision(null); }, onError: (e: unknown) => toast.push('error', (e as Error).message) };
            if (decision.action === 'cancel') cancel.mutate({ id: decision.r.id, comment: comment || undefined }, done);
            else decide.mutate({ id: decision.r.id, body: { status: decision.action, comment: comment || undefined } }, done);
          }} />
      )}
    </>
  );
}

function Calendar() {
  const [month, setMonth] = useState(thisMonth());
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const q = useLeaveCalendar({ month, departmentId: departmentId || undefined, teamId: teamId || undefined });
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const people = useMemo(() => {
    const map = new Map<string, { employee: NonNullable<LeaveRequest['employee']>; requests: LeaveRequest[] }>();
    for (const r of q.data?.requests ?? []) { if (!r.employee) continue; const e = map.get(r.employeeId) ?? { employee: r.employee, requests: [] }; e.requests.push(r); map.set(r.employeeId, e); }
    return Array.from(map.values()).sort((a, b) => a.employee.lastName.localeCompare(b.employee.lastName));
  }, [q.data]);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MonthPicker value={month} onChange={setMonth} />
        <div className="w-44"><DepartmentSelect value={departmentId} onChange={(v) => { setDepartmentId(v); setTeamId(''); }} /></div>
        <div className="w-40"><TeamSelect value={teamId} onChange={setTeamId} departmentId={departmentId || undefined} /></div>
        <div className="ml-auto flex gap-2 text-xs"><Badge tone="green">Approved</Badge><Badge tone="amber">Pending</Badge><Badge tone="blue">Holiday</Badge></div>
      </div>
      <Card>
        {q.isLoading && <Skeleton className="h-48" />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && people.length === 0 && <EmptyState icon={<Plane size={20} />} title="Nobody is out this month" body="Approved and pending leave shows up on the calendar." />}
        {q.data && people.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11.5px]">
              <thead><tr className="bg-surface-2 text-[10px] uppercase text-ink-3"><th className="sticky left-0 bg-surface-2 px-3 py-2 text-left">Employee</th>{dates.map((d) => { const hol = q.data!.holidays.find((h) => h.date.slice(0, 10) === d); return <th key={d} title={hol?.name} className={`px-1 py-2 text-center ${hol ? 'text-blue' : ''}`}>{d.slice(8)}</th>; })}</tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.employee.id} className="border-t border-line-2">
                    <td className="sticky left-0 bg-surface px-3 py-1.5 font-semibold">{fullName(p.employee)}</td>
                    {dates.map((d) => { const r = p.requests.find((x) => x.dateFrom.slice(0, 10) <= d && x.dateTo.slice(0, 10) >= d); return <td key={d} className="px-0.5 py-1 text-center" title={r ? `${r.leaveType?.name ?? r.type} · ${r.status}` : undefined}>{r ? <span className="inline-block h-4 w-6 rounded" style={{ background: r.status === 'approved' ? r.leaveType?.colour ?? '#1E8E5A' : '#E0921A', opacity: r.status === 'approved' ? 1 : 0.6 }} /> : <span className="text-ink-3">·</span>}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
  const q = useBalances({ year, employeeId: employeeId || undefined });
  const adjust = usePeopleMutation((b: Record<string, unknown>) => http.post('/hr/leave-balances/adjust', b), PEOPLE_ALL);
  const types = useMemo(() => Array.from(new Map((q.data?.items ?? []).map((b) => [b.leaveTypeId, b.leaveType])).entries()), [q.data]);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">{[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}</Select>
        <div className="w-56"><EmployeeSelect value={employeeId} onChange={setEmployeeId} /></div>
      </div>
      <Card>
        {q.isLoading && <TableSkeleton cols={5} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && q.data.employees.length === 0 && <EmptyState title="No balances" body="Balances are created when leave types exist and employees are active." />}
        {q.data && q.data.employees.length > 0 && (
          <Table>
            <thead><tr><Th>Employee</Th>{types.map(([id, t]) => <Th key={id} right>{t.name}</Th>)}</tr></thead>
            <tbody>
              {q.data.employees.map((e) => (
                <tr key={e.id} className="hover:bg-surface-2">
                  <Td className="font-semibold">{fullName(e)}<div className="text-xs font-normal text-ink-3">{e.department?.name ?? ''}</div></Td>
                  {types.map(([tid, t]) => { const b = q.data!.items.find((x) => x.employeeId === e.id && x.leaveTypeId === tid); return (
                    <Td key={tid} right>
                      {b ? <button type="button" className="font-mono hover:underline disabled:no-underline" disabled={!can('hr.leave.manage')} onClick={() => setAdjusting({ employeeId: e.id, leaveTypeId: tid, name: `${fullName(e)} · ${t.name}` })} title={`Entitled ${b.entitledDays} · Used ${b.usedDays} · Pending ${b.pendingDays} · Adjustments ${b.adjustmentsDays}`}>
                        <span className={b.availableDays <= 0 ? 'text-red' : ''}>{b.availableDays}</span><span className="text-ink-3"> / {b.entitledDays + b.carriedOverDays + b.adjustmentsDays}</span>
                      </button> : '—'}
                    </Td>
                  ); })}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
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
  return (
    <Card title="Leave types" actions={<Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing('new')}>New type</Button>}>
      {q.isLoading && <TableSkeleton cols={6} />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="No leave types" body="Create Annual, Sick and Unpaid to start." />}
      {q.data && q.data.length > 0 && (
        <Table>
          <thead><tr><Th>Name</Th><Th>Code</Th><Th right>Allowance</Th><Th>Accrual</Th><Th>Rules</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {q.data.map((t) => (
              <tr key={t.id} className="hover:bg-surface-2">
                <Td><span className="inline-flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: t.colour }} />{t.name}</span></Td>
                <Td mono>{t.code}</Td>
                <Td right mono>{Number(t.annualAllowanceDays)} d</Td>
                <Td>{titleCase(t.accrual)}{Number(t.carryOverMaxDays) > 0 && <div className="text-xs text-ink-3">carry over ≤ {Number(t.carryOverMaxDays)}</div>}</Td>
                <Td className="text-xs text-ink-2">{[t.paid ? 'Paid' : 'Unpaid', t.requiresApproval ? 'Approval' : 'Auto-approve', t.allowHalfDay ? 'Half days' : null].filter(Boolean).join(' · ')}</Td>
                <Td><Badge tone={t.isActive ? 'green' : 'gray'}>{t.isActive ? 'Active' : 'Inactive'}</Badge></Td>
                <Td right><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(t)} /><Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => window.confirm(`Remove ${t.name}? Types in use are deactivated.`) && del.mutate(t.id, { onError: (e) => toast.push('error', (e as Error).message) })} /></div></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <TypeModal type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
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
      <div className="mt-3 flex flex-wrap gap-5">
        <Checkbox checked={paid} onChange={(e) => setPaid(e.target.checked)} label="Paid (balance enforced)" />
        <Checkbox checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} label="Requires approval" />
        <Checkbox checked={allowHalfDay} onChange={(e) => setAllowHalfDay(e.target.checked)} label="Allow half day" />
        <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} label="Active" />
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
  return (
    <Modal open onClose={onClose} title="New leave request" width={520} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!leaveTypeId || !dateFrom || !dateTo || !reason.trim()} loading={create.isPending} onClick={() => create.mutate({ employeeId: employeeId || undefined, leaveTypeId, dateFrom, dateTo: halfDay ? dateFrom : dateTo, halfDay, reason }, { onSuccess: () => { toast.push('success', 'Leave requested'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Submit</Button></>}>
      <div className="space-y-3">
        {can('attendance.approve') && <Field label="Employee"><EmployeeSelect value={employeeId} onChange={setEmployeeId} emptyLabel="Myself" /></Field>}
        <Field label="Leave type" required><Select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}><option value="">Choose…</option>{(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}{t.paid ? '' : ' (unpaid)'}</option>)}</Select></Field>
        {balance && <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">Available: <b className="font-mono">{balance.availableDays}</b> days · used {balance.usedDays} · pending {balance.pendingDays}</div>}
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
