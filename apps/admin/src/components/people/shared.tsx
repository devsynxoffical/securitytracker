'use client';

import { useState, type ReactNode } from 'react';
import { Pencil, Plus, Trash2, FileText, CheckCircle2, Circle } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Badge, Button, Checkbox, Drawer, EmptyState, ErrorBanner, Field, Input, Modal, Row, Select, Skeleton, Table, Tabs, Td, Th, Textarea, useToast, type Tone,
} from '@/components/ui';
import { dateOnly, dateTime, fullName, relative, titleCase } from '@/lib/format';
import {
  useEmployeesList, useDepartments, useTeams, useProfile, useAssignments, useSchedules, useBalances, useLeaveRequests, useSheet, usePeopleMutation, PEOPLE_ALL,
  type Profile, type HrDocument, type Checklist, type ChecklistItem,
} from '@/lib/queries/people';

// ---------------------------------------------------------------------------
// Status helpers (DESIGN-SYSTEM.md section 1 status colour mapping)
// ---------------------------------------------------------------------------

export function attendanceTone(status: string | undefined): Tone {
  switch (status) {
    case 'present': return 'green';
    case 'late': case 'half_day': return 'amber';
    case 'absent': return 'red';
    case 'on_leave': return 'violet';
    case 'holiday': return 'blue';
    case 'weekly_off': return 'gray';
    default: return 'gray';
  }
}

export function requestTone(status: string): Tone {
  switch (status) {
    case 'approved': return 'green';
    case 'pending': return 'amber';
    case 'rejected': return 'red';
    default: return 'gray';
  }
}

export function liveTone(status: string): Tone {
  if (status.startsWith('Working')) return 'green';
  if (status.startsWith('On break')) return 'amber';
  if (status.startsWith('Offline')) return 'blue';
  return 'gray';
}

export function hours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export const WEEKDAYS = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' }, { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 7, label: 'Sun' },
];

export function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

export function EmployeeSelect({ value, onChange, emptyLabel = 'All employees', allowEmpty = true }: { value: string; onChange: (v: string) => void; emptyLabel?: string; allowEmpty?: boolean }) {
  const { data, isLoading } = useEmployeesList();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={isLoading}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {(data ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}
    </Select>
  );
}

export function DepartmentSelect({ value, onChange, emptyLabel = 'All departments' }: { value: string; onChange: (v: string) => void; emptyLabel?: string }) {
  const { data } = useDepartments();
  return <Select value={value} onChange={(e) => onChange(e.target.value)}><option value="">{emptyLabel}</option>{(data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>;
}

export function TeamSelect({ value, onChange, departmentId, emptyLabel = 'All teams' }: { value: string; onChange: (v: string) => void; departmentId?: string; emptyLabel?: string }) {
  const { data } = useTeams();
  const teams = (data ?? []).filter((t) => !departmentId || t.departmentId === departmentId);
  return <Select value={value} onChange={(e) => onChange(e.target.value)}><option value="">{emptyLabel}</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>;
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Previous month">‹</Button>
      <Input type="month" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="w-40" />
      <Button size="sm" onClick={() => onChange(shiftMonth(value, 1))} aria-label="Next month">›</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee profile drawer (FR-HR-10, 11, 12) — reused by Directory, Live and Org chart
// ---------------------------------------------------------------------------

type ProfileTab = 'overview' | 'job' | 'attendance' | 'leave' | 'documents' | 'checklists';

export function EmployeeDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can } = useAuth();
  const q = useProfile(id);
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [editing, setEditing] = useState(false);
  const p = q.data;
  return (
    <Drawer open={Boolean(id)} onClose={onClose} title={p ? fullName(p) : 'Employee'} subtitle={p ? [p.code, p.profile.designation, p.department?.name].filter(Boolean).join(' · ') : undefined}
      actions={p && can('hr.profiles.edit') && <Button size="sm" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>Edit profile</Button>}>
      {q.isLoading && <div className="space-y-3 p-5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
      {q.isError && <div className="p-5"><ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} /></div>}
      {p && (
        <div className="p-5">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Status"><Badge tone={p.status === 'active' ? 'green' : p.status === 'disabled' ? 'red' : 'amber'} dot>{titleCase(p.status)}</Badge></Stat>
            <Stat label="Role">{p.role.name}</Stat>
            <Stat label="Manager">{p.manager ? fullName(p.manager) : '—'}</Stat>
          </div>
          <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
            { value: 'overview', label: 'Overview' }, { value: 'job', label: 'Job' }, { value: 'attendance', label: 'Attendance' }, { value: 'leave', label: 'Leave' },
            { value: 'documents', label: 'Documents', count: p.documents.length }, { value: 'checklists', label: 'Checklists', count: p.checklists.filter((c) => c.status === 'open').length },
          ]} />
          {tab === 'overview' && (
            <div>
              <Row label="Email">{p.email ?? '—'}</Row>
              <Row label="Phone">{p.phone ?? '—'}</Row>
              <Row label="Personal email">{p.profile.personalEmail ?? '—'}</Row>
              <Row label="Date of birth">{dateOnly(p.profile.dateOfBirth)}</Row>
              <Row label="Gender">{p.profile.gender ?? '—'}</Row>
              <Row label="Nationality">{p.profile.nationality ?? '—'}</Row>
              <Row label="Address">{[p.profile.address?.line1, p.profile.address?.city, p.profile.address?.country].filter(Boolean).join(', ') || '—'}</Row>
              <Row label="Emergency contact">{p.profile.emergencyContact?.name ? `${p.profile.emergencyContact.name} (${p.profile.emergencyContact.relation ?? 'contact'}) ${p.profile.emergencyContact.phone ?? ''}` : '—'}</Row>
              <Row label="Direct reports">{p.directReports.length ? p.directReports.map((r) => fullName(r)).join(', ') : '—'}</Row>
              <Row label="Last login">{dateTime(p.lastLoginAt)}</Row>
            </div>
          )}
          {tab === 'job' && (
            <div>
              <Row label="Designation">{p.profile.designation ?? '—'}</Row>
              <Row label="Employment type">{titleCase(p.profile.employmentType)}</Row>
              <Row label="Department">{p.department?.name ?? '—'}</Row>
              <Row label="Team">{p.team?.name ?? '—'}</Row>
              <Row label="Work location">{p.profile.workLocation ?? '—'}</Row>
              <Row label="Join date">{dateOnly(p.joinDate)}</Row>
              <Row label="Probation ends">{dateOnly(p.profile.probationEnd)}</Row>
              <div className="mt-4">
                <div className="mb-2 text-[13px] font-semibold">Schedule history</div>
                <ScheduleAssignments employeeId={p.id} />
              </div>
              <div className="mt-4">
                <div className="mb-2 text-[13px] font-semibold">Devices</div>
                {p.devices.length === 0 ? <div className="text-xs text-ink-3">No devices</div> : (
                  <Table><thead><tr><Th>Device</Th><Th>OS</Th><Th>Status</Th><Th right>Last seen</Th></tr></thead><tbody>
                    {p.devices.map((d) => <tr key={d.id}><Td>{d.name}</Td><Td>{d.osVersion}</Td><Td><Badge tone={d.status === 'approved' ? 'green' : d.status === 'pending' ? 'amber' : 'red'}>{titleCase(d.status)}</Badge></Td><Td right className="text-ink-3">{relative(d.lastSeenAt)}</Td></tr>)}
                  </tbody></Table>
                )}
              </div>
            </div>
          )}
          {tab === 'attendance' && <EmployeeAttendance employeeId={p.id} />}
          {tab === 'leave' && <EmployeeLeave employeeId={p.id} />}
          {tab === 'documents' && <Documents employeeId={p.id} documents={p.documents} />}
          {tab === 'checklists' && <ChecklistList checklists={p.checklists} />}
        </div>
      )}
      {p && editing && <ProfileEditModal profile={p} onClose={() => setEditing(false)} />}
    </Drawer>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">{label}</div><div className="mt-1 text-[13px] font-semibold">{children}</div></div>;
}

function ScheduleAssignments({ employeeId }: { employeeId: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const q = useAssignments(employeeId);
  const schedules = useSchedules();
  const [scheduleId, setScheduleId] = useState('');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const assign = usePeopleMutation((p: Record<string, unknown>) => http.post(`/employees/${employeeId}/schedules`, p), PEOPLE_ALL);
  const del = usePeopleMutation((id: string) => http.del(`/employees/${employeeId}/schedules/${id}`), PEOPLE_ALL);
  if (q.isLoading) return <Skeleton className="h-10" />;
  if (q.isError) return <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-2">
      {(q.data ?? []).length === 0 ? <div className="text-xs text-ink-3">No schedule assigned. Monday to Friday is assumed.</div> : (
        <Table><thead><tr><Th>Schedule</Th><Th>Hours</Th><Th>From</Th><Th>To</Th><Th /></tr></thead><tbody>
          {q.data!.map((a) => <tr key={a.id}><Td className="font-semibold">{a.schedule.name}</Td><Td mono>{a.schedule.startTime}–{a.schedule.endTime}</Td><Td>{dateOnly(a.effectiveFrom)}</Td><Td>{a.effectiveTo ? dateOnly(a.effectiveTo) : <Badge tone="green">Current</Badge>}</Td><Td right>{can('attendance.manage') && <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => del.mutate(a.id)} />}</Td></tr>)}
        </tbody></Table>
      )}
      {can('attendance.manage') && (
        <div className="flex items-end gap-2">
          <Field label="Assign schedule" className="flex-1"><Select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}><option value="">Choose…</option>{(schedules.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Effective from"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Button size="sm" disabled={!scheduleId || !from} loading={assign.isPending} onClick={() => assign.mutate({ scheduleId, effectiveFrom: from }, { onSuccess: () => { setScheduleId(''); toast.push('success', 'Schedule assigned'); }, onError: (e) => toast.push('error', (e as Error).message) })}>Assign</Button>
        </div>
      )}
    </div>
  );
}

function EmployeeAttendance({ employeeId }: { employeeId: string }) {
  const [month, setMonth] = useState(thisMonth());
  const q = useSheet({ month, employeeId });
  const row = q.data?.rows[0];
  return (
    <div className="space-y-3">
      <MonthPicker value={month} onChange={setMonth} />
      {q.isLoading && <Skeleton className="h-24" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && !row && <EmptyState title="No attendance data" body="Attendance days appear once the employee has worked a shift." />}
      {row && (
        <>
          <div className="grid grid-cols-4 gap-2 text-center">
            {([['Present', row.totals.present, 'green'], ['Late', row.totals.late, 'amber'], ['Absent', row.totals.absent, 'red'], ['On leave', row.totals.onLeave, 'violet']] as Array<[string, number, Tone]>).map(([l, v, t]) => (
              <div key={l} className="rounded-card border border-line p-2"><div className="text-[11px] text-ink-3">{l}</div><Badge tone={t} className="mt-1 font-mono">{v}</Badge></div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {q.data!.dates.map((d) => { const day = row.days[d]; return <div key={d} title={`${d}: ${titleCase(day?.status) || 'No data'}`} className="rounded border border-line p-1 text-center"><div className="text-[10px] text-ink-3">{d.slice(8)}</div>{day?.status ? <Badge tone={attendanceTone(day.status)} className="mt-0.5 !px-1 text-[9px]">{day.status === 'weekly_off' ? 'Off' : day.status === 'on_leave' ? 'Leave' : day.status === 'half_day' ? 'Half' : titleCase(day.status).slice(0, 7)}</Badge> : <span className="text-[10px] text-ink-3">·</span>}</div>; })}
          </div>
          <div className="text-xs text-ink-3">Working {hours(row.totals.workingSeconds)} · Active {hours(row.totals.activeSeconds)}</div>
        </>
      )}
    </div>
  );
}

function EmployeeLeave({ employeeId }: { employeeId: string }) {
  const balances = useBalances({ employeeId });
  const requests = useLeaveRequests({ employeeId, limit: 20 });
  return (
    <div className="space-y-4">
      {balances.isLoading && <Skeleton className="h-16" />}
      {balances.isError && <ErrorBanner message={(balances.error as Error).message} onRetry={() => balances.refetch()} />}
      {balances.data && (
        <div className="grid grid-cols-2 gap-2">
          {balances.data.items.map((b) => (
            <div key={b.id} className="rounded-card border border-line p-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: b.leaveType.colour }} />{b.leaveType.name}</div>
              <div className="mt-1 font-mono text-lg font-semibold">{b.availableDays} <span className="text-xs font-normal text-ink-3">available</span></div>
              <div className="text-[11px] text-ink-3">Entitled {b.entitledDays} · Used {b.usedDays} · Pending {b.pendingDays}{b.adjustmentsDays ? ` · Adj ${b.adjustmentsDays}` : ''}</div>
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="mb-2 text-[13px] font-semibold">Requests</div>
        {requests.isLoading && <Skeleton className="h-10" />}
        {requests.data && requests.data.items.length === 0 && <div className="text-xs text-ink-3">No leave requests</div>}
        {requests.data && requests.data.items.length > 0 && (
          <Table><thead><tr><Th>Type</Th><Th>Dates</Th><Th right>Days</Th><Th>Status</Th></tr></thead><tbody>
            {requests.data.items.map((r) => <tr key={r.id}><Td>{r.leaveType?.name ?? titleCase(r.type)}</Td><Td>{dateOnly(r.dateFrom)} – {dateOnly(r.dateTo)}</Td><Td right mono>{Number(r.days)}</Td><Td><Badge tone={requestTone(r.status)}>{titleCase(r.status)}</Badge></Td></tr>)}
          </tbody></Table>
        )}
      </div>
    </div>
  );
}

function Documents({ employeeId, documents }: { employeeId: string; documents: HrDocument[] }) {
  const { can } = useAuth();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('Contract');
  const [issuedAt, setIssued] = useState('');
  const [expiresAt, setExpires] = useState('');
  const [note, setNote] = useState('');
  const add = usePeopleMutation((p: Record<string, unknown>) => http.post(`/hr/profiles/${employeeId}/documents`, p), PEOPLE_ALL);
  const del = usePeopleMutation((id: string) => http.del(`/hr/profiles/${employeeId}/documents/${id}`), PEOPLE_ALL);
  const soon = Date.now() + 30 * 86_400_000;
  return (
    <div className="space-y-3">
      {documents.length === 0 ? <EmptyState icon={<FileText size={20} />} title="No documents" body="Document metadata is kept here; files attach once object storage is configured (15 FR-HR-11)." /> : (
        <Table><thead><tr><Th>Name</Th><Th>Type</Th><Th>Issued</Th><Th>Expires</Th><Th /></tr></thead><tbody>
          {documents.map((d) => <tr key={d.id}><Td className="font-semibold">{d.name}{d.note && <div className="text-xs font-normal text-ink-3">{d.note}</div>}</Td><Td>{d.type}</Td><Td>{dateOnly(d.issuedAt)}</Td><Td>{d.expiresAt ? <span className={new Date(d.expiresAt).getTime() < soon ? 'font-semibold text-amber' : ''}>{dateOnly(d.expiresAt)}</span> : '—'}</Td><Td right>{can('hr.profiles.edit') && <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => window.confirm('Remove this document?') && del.mutate(d.id)} />}</Td></tr>)}
        </tbody></Table>
      )}
      {can('hr.profiles.edit') && !adding && <Button size="sm" icon={<Plus size={13} />} onClick={() => setAdding(true)}>Add document</Button>}
      {adding && (
        <div className="rounded-card border border-line p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Type"><Select value={type} onChange={(e) => setType(e.target.value)}>{['Contract', 'ID', 'Passport', 'Visa', 'Certificate', 'NDA', 'Policy acknowledgement', 'Other'].map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Issued"><Input type="date" value={issuedAt} onChange={(e) => setIssued(e.target.value)} /></Field>
            <Field label="Expires"><Input type="date" value={expiresAt} onChange={(e) => setExpires(e.target.value)} /></Field>
          </div>
          <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="mt-2 flex justify-end gap-2"><Button size="sm" onClick={() => setAdding(false)}>Cancel</Button><Button size="sm" variant="primary" disabled={!name.trim()} loading={add.isPending} onClick={() => add.mutate({ name, type, issuedAt: issuedAt || undefined, expiresAt: expiresAt || undefined, note: note || undefined }, { onSuccess: () => { setAdding(false); setName(''); toast.push('success', 'Document added'); }, onError: (e) => toast.push('error', (e as Error).message) })}>Save</Button></div>
        </div>
      )}
    </div>
  );
}

export function ChecklistList({ checklists, compact = false }: { checklists: Checklist[]; compact?: boolean }) {
  if (checklists.length === 0) return <EmptyState title="No checklists" body="Start onboarding or offboarding from People → Onboarding." />;
  return <div className="space-y-3">{checklists.map((c) => <ChecklistCard key={c.id} checklist={c} compact={compact} />)}</div>;
}

export function ChecklistCard({ checklist, compact }: { checklist: Checklist; compact?: boolean }) {
  const toast = useToast();
  const toggle = usePeopleMutation(({ itemId, done }: { itemId: string; done: boolean }) => http.patch(`/hr/checklists/${checklist.id}/items/${itemId}`, { done }), PEOPLE_ALL);
  const done = checklist.items.filter((i) => i.done).length;
  const pct = checklist.items.length ? Math.round((done / checklist.items.length) * 100) : 0;
  return (
    <div className="rounded-card border border-line p-3">
      <div className="flex items-center justify-between">
        <div><span className="text-[13px] font-semibold">{titleCase(checklist.kind)}</span>{checklist.template && <span className="ml-2 text-xs text-ink-3">{checklist.template.name}</span>}{checklist.employee && <span className="ml-2 text-xs text-ink-2">· {fullName(checklist.employee)}</span>}</div>
        <Badge tone={checklist.status === 'completed' ? 'green' : 'amber'}>{done}/{checklist.items.length}</Badge>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-gray-soft"><div className="h-full bg-pri" style={{ width: `${pct}%` }} /></div>
      {!compact && (
        <ul className="mt-3 space-y-1.5">
          {checklist.items.map((i: ChecklistItem) => (
            <li key={i.id} className="flex items-center gap-2 text-[13px]">
              <button type="button" className="text-pri disabled:opacity-50" disabled={toggle.isPending} onClick={() => toggle.mutate({ itemId: i.id, done: !i.done }, { onError: (e) => toast.push('error', (e as Error).message) })} aria-label={i.done ? 'Mark not done' : 'Mark done'}>
                {i.done ? <CheckCircle2 size={16} /> : <Circle size={16} className="text-ink-3" />}
              </button>
              <span className={i.done ? 'line-through text-ink-3' : ''}>{i.title}</span>
              <Badge tone="gray" className="ml-auto">{i.ownerRole.toUpperCase()}</Badge>
              <span className={`w-24 text-right text-xs ${!i.done && new Date(i.dueAt).getTime() < Date.now() ? 'font-semibold text-red' : 'text-ink-3'}`}>{dateOnly(i.dueAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProfileEditModal({ profile: p, onClose }: { profile: Profile; onClose: () => void }) {
  const toast = useToast();
  const pr = p.profile;
  const [designation, setDesignation] = useState(pr.designation ?? '');
  const [employmentType, setEmploymentType] = useState(pr.employmentType ?? '');
  const [workLocation, setWorkLocation] = useState(pr.workLocation ?? '');
  const [probationEnd, setProbationEnd] = useState(pr.probationEnd?.slice(0, 10) ?? '');
  const [dateOfBirth, setDob] = useState(pr.dateOfBirth?.slice(0, 10) ?? '');
  const [gender, setGender] = useState(pr.gender ?? '');
  const [nationality, setNationality] = useState(pr.nationality ?? '');
  const [personalEmail, setPersonalEmail] = useState(pr.personalEmail ?? '');
  const [line1, setLine1] = useState(pr.address?.line1 ?? '');
  const [city, setCity] = useState(pr.address?.city ?? '');
  const [country, setCountry] = useState(pr.address?.country ?? '');
  const [ecName, setEcName] = useState(pr.emergencyContact?.name ?? '');
  const [ecRelation, setEcRelation] = useState(pr.emergencyContact?.relation ?? '');
  const [ecPhone, setEcPhone] = useState(pr.emergencyContact?.phone ?? '');
  const save = usePeopleMutation((body: Record<string, unknown>) => http.patch(`/hr/profiles/${p.id}`, body), PEOPLE_ALL);
  const submit = () => save.mutate({
    designation: designation || null, employmentType: employmentType || null, workLocation: workLocation || null, probationEnd: probationEnd || null,
    dateOfBirth: dateOfBirth || null, gender: gender || null, nationality: nationality || null, personalEmail: personalEmail || null,
    address: { line1: line1 || undefined, city: city || undefined, country: country || undefined },
    emergencyContact: { name: ecName || undefined, relation: ecRelation || undefined, phone: ecPhone || undefined },
  }, { onSuccess: () => { toast.push('success', 'Profile saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) });
  return (
    <Modal open onClose={onClose} title={`Edit profile · ${fullName(p)}`} width={640} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Designation"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></Field>
        <Field label="Employment type"><Select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}><option value="">—</option>{['full_time', 'part_time', 'contract', 'intern'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
        <Field label="Work location"><Input value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} /></Field>
        <Field label="Probation ends"><Input type="date" value={probationEnd} onChange={(e) => setProbationEnd(e.target.value)} /></Field>
        <Field label="Date of birth"><Input type="date" value={dateOfBirth} onChange={(e) => setDob(e.target.value)} /></Field>
        <Field label="Gender"><Input value={gender} onChange={(e) => setGender(e.target.value)} /></Field>
        <Field label="Nationality"><Input value={nationality} onChange={(e) => setNationality(e.target.value)} /></Field>
        <Field label="Personal email"><Input type="email" value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} /></Field>
        <Field label="Address line"><Input value={line1} onChange={(e) => setLine1(e.target.value)} /></Field>
        <Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        <Field label="Country"><Input value={country} onChange={(e) => setCountry(e.target.value)} /></Field>
        <Field label="Emergency contact name"><Input value={ecName} onChange={(e) => setEcName(e.target.value)} /></Field>
        <Field label="Relation"><Input value={ecRelation} onChange={(e) => setEcRelation(e.target.value)} /></Field>
        <Field label="Emergency phone"><Input value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** Confirm dialog with an optional comment field, used for approve/reject/cancel actions. */
export function DecisionModal({ title, confirmLabel, danger, onClose, onConfirm, loading }: { title: string; confirmLabel: string; danger?: boolean; onClose: () => void; onConfirm: (comment: string) => void; loading?: boolean }) {
  const [comment, setComment] = useState('');
  return (
    <Modal open onClose={onClose} title={title} width={480} footer={<><Button onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={() => onConfirm(comment)}>{confirmLabel}</Button></>}>
      <Field label="Comment (optional)"><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
    </Modal>
  );
}

export { Checkbox };
