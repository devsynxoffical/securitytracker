'use client';

import { confirmDialog } from '@/components/platform/confirm';

import { useMemo, useState, type ReactNode } from 'react';
import { Pencil, Plus, Trash2, FileText, CheckCircle2, Circle, KeyRound, UserX, UserCheck, ListTodo, Monitor, Users, CalendarCheck, Activity, Mail, Phone, ShieldOff, ShieldCheck } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Avatar, Badge, Button, Checkbox, Drawer, EmptyState, ErrorBanner, Field, Input, Modal, Select, Skeleton, Tabs, Textarea, useToast, type Tone,
} from '@/components/ui';
import { AssociationCard, DataTable, KpiTile, Menu, Progress, PropertyList, RecordHeader, RecordLayout, Section, Tooltip, type Column, type PropertyDef } from '@/components/ui/advanced';
import { SegmentedBar, Sparkline } from '@/components/ui/charts';
import { dateOnly, dateTime, fullName, relative, titleCase } from '@/lib/format';
import {
  useEmployeesList, useDepartments, useTeams, useRoles, useProfile, useAssignments, useSchedules, useBalances, useLeaveRequests, useSheet, useTemplates, useActivitySummary, usePeopleMutation, PEOPLE_ALL,
  type Profile, type HrDocument, type Checklist, type ChecklistItem, type LeaveRequest,
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

/** Solid dot colour classes for compact grids (sheet, calendar). */
export function attendanceDot(status: string | undefined): string {
  switch (status) {
    case 'present': return 'bg-green';
    case 'late': case 'half_day': return 'bg-amber-bar';
    case 'absent': return 'bg-red';
    case 'on_leave': return 'bg-violet';
    case 'holiday': return 'bg-blue';
    case 'weekly_off': return 'bg-gray-bar';
    default: return 'bg-line';
  }
}

export const ATTENDANCE_LEGEND: Array<[string, string]> = [['present', 'Present'], ['late', 'Late'], ['half_day', 'Half day'], ['absent', 'Absent'], ['on_leave', 'On leave'], ['holiday', 'Holiday'], ['weekly_off', 'Weekly off']];

export function requestTone(status: string): Tone {
  switch (status) {
    case 'approved': return 'green';
    case 'pending': return 'amber';
    case 'rejected': return 'red';
    default: return 'gray';
  }
}

export function employeeTone(status: string): Tone {
  // invited and suspended are both amber (suspended is temporary, FR-SEC-24)
  return status === 'active' ? 'green' : status === 'disabled' ? 'red' : 'amber';
}

export function liveTone(status: string): Tone {
  if (status.startsWith('Working')) return 'green';
  if (status.startsWith('On break')) return 'amber';
  if (status.startsWith('Idle')) return 'amber';
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

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function daysOf(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export function isWeekend(date: string): boolean {
  const d = new Date(date + 'T00:00:00Z').getUTCDay();
  return d === 0 || d === 6;
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
    <div className="inline-flex items-center rounded-lg border border-line bg-surface">
      <button type="button" className="px-2.5 py-1.5 text-ink-2 hover:text-ink" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Previous month">‹</button>
      <input type="month" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="h-8 w-36 border-x border-line bg-transparent px-2 text-center text-sm font-semibold text-ink focus:outline-none" aria-label="Month" />
      <button type="button" className="px-2.5 py-1.5 text-ink-2 hover:text-ink" onClick={() => onChange(shiftMonth(value, 1))} aria-label="Next month">›</button>
    </div>
  );
}

/** Dropdown body used inside FilterChip for a simple option list. */
export function OptionList({ value, onChange, options, emptyLabel = 'All' }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; emptyLabel?: string }) {
  return (
    <ul className="max-h-64 overflow-y-auto text-sm">
      {[{ value: '', label: emptyLabel }, ...options].map((o) => (
        <li key={o.value}>
          <button type="button" onClick={() => onChange(o.value)} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-surface-2 ${value === o.value ? 'font-semibold text-pri-2' : 'text-ink'}`}>
            {o.label}
            {value === o.value && <CheckCircle2 size={13} className="text-pri" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Employee record (FR-HR-10, 11, 12): HubSpot-style three columns in a wide drawer.
// Reused by Directory, Live, Sheet and Org chart as `EmployeeDrawer`.
// ---------------------------------------------------------------------------

type ProfileTab = 'overview' | 'attendance' | 'leave' | 'documents' | 'checklists' | 'activity';

export function EmployeeDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useProfile(id);
  const p = q.data;
  return (
    <Drawer open={Boolean(id)} onClose={onClose} width={1180} title={p ? fullName(p) : 'Employee'} subtitle={p ? [p.code, p.profile.designation, p.department?.name].filter(Boolean).join(' · ') : undefined}>
      {q.isLoading && <div className="grid grid-cols-[300px_1fr_300px] gap-4 p-5">{[1, 2, 3].map((i) => <div key={i} className="space-y-3"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>)}</div>}
      {q.isError && <div className="p-5"><ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} /></div>}
      {p && <EmployeeRecord profile={p} onClose={onClose} />}
    </Drawer>
  );
}

function EmployeeRecord({ profile: p, onClose }: { profile: Profile; onClose: () => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [editing, setEditing] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [starting, setStarting] = useState<'onboarding' | 'offboarding' | null>(null);
  const departments = useDepartments();
  const teams = useTeams();
  const roles = useRoles();
  const employees = useEmployeesList();
  const saveProfile = usePeopleMutation((body: Record<string, unknown>) => http.patch(`/hr/profiles/${p.id}`, body), PEOPLE_ALL);
  const saveEmployee = usePeopleMutation((body: Record<string, unknown>) => http.patch(`/employees/${p.id}`, body), PEOPLE_ALL);
  const reset = usePeopleMutation(() => http.post<{ temporaryPassword?: string }>(`/employees/${p.id}/reset-password`), PEOPLE_ALL);
  const enable = usePeopleMutation(() => http.post(`/employees/${p.id}/enable`), PEOPLE_ALL);
  const restore = usePeopleMutation(() => http.post(`/employees/${p.id}/restore`), PEOPLE_ALL);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const onSaveProfile = async (key: string, value: string) => {
    const body: Record<string, unknown> = {};
    if (key.startsWith('address.')) body.address = { ...p.profile.address, [key.slice(8)]: value || undefined };
    else if (key.startsWith('ec.')) body.emergencyContact = { ...p.profile.emergencyContact, [key.slice(3)]: value || undefined };
    else body[key] = value || null;
    try {
      await saveProfile.mutateAsync(body);
      toast.push('success', 'Saved');
    } catch (e) {
      toast.push('error', (e as Error).message);
      throw e;
    }
  };
  const onSaveJob = async (key: string, value: string) => {
    try {
      await saveEmployee.mutateAsync({ [key]: value || null });
      toast.push('success', 'Saved');
    } catch (e) {
      toast.push('error', (e as Error).message);
      throw e;
    }
  };
  const canEditProfile = can('hr.profiles.edit');
  const canEditJob = can('employees.edit');
  const notSelf = me?.id !== p.id;

  const personal: PropertyDef[] = [
    { key: 'email', label: 'Company email', value: p.email, editable: false },
    { key: 'phone', label: 'Phone', value: p.phone, editable: false },
    { key: 'personalEmail', label: 'Personal email', value: p.profile.personalEmail, raw: p.profile.personalEmail ?? '', type: 'text', editable: canEditProfile },
    { key: 'dateOfBirth', label: 'Date of birth', value: dateOnly(p.profile.dateOfBirth), raw: p.profile.dateOfBirth?.slice(0, 10) ?? '', type: 'date', editable: canEditProfile },
    { key: 'gender', label: 'Gender', value: p.profile.gender, raw: p.profile.gender ?? '', type: 'text', editable: canEditProfile },
    { key: 'nationality', label: 'Nationality', value: p.profile.nationality, raw: p.profile.nationality ?? '', type: 'text', editable: canEditProfile },
    { key: 'address.line1', label: 'Address', value: p.profile.address?.line1, raw: p.profile.address?.line1 ?? '', type: 'text', editable: canEditProfile },
    { key: 'address.city', label: 'City', value: p.profile.address?.city, raw: p.profile.address?.city ?? '', type: 'text', editable: canEditProfile },
    { key: 'address.country', label: 'Country', value: p.profile.address?.country, raw: p.profile.address?.country ?? '', type: 'text', editable: canEditProfile },
    { key: 'ec.name', label: 'Emergency contact', value: p.profile.emergencyContact?.name ? `${p.profile.emergencyContact.name}${p.profile.emergencyContact.relation ? ` (${p.profile.emergencyContact.relation})` : ''}` : null, raw: p.profile.emergencyContact?.name ?? '', type: 'text', editable: canEditProfile },
    { key: 'ec.phone', label: 'Emergency phone', value: p.profile.emergencyContact?.phone, raw: p.profile.emergencyContact?.phone ?? '', type: 'text', mono: true, editable: canEditProfile },
  ];
  const job: PropertyDef[] = [
    { key: 'designation', label: 'Designation', value: p.profile.designation, raw: p.profile.designation ?? '', type: 'text', editable: canEditProfile },
    { key: 'employmentType', label: 'Employment type', value: titleCase(p.profile.employmentType), raw: p.profile.employmentType ?? '', type: 'select', options: ['full_time', 'part_time', 'contract', 'intern'].map((v) => ({ value: v, label: titleCase(v) })), editable: canEditProfile },
    { key: 'workLocation', label: 'Work location', value: p.profile.workLocation, raw: p.profile.workLocation ?? '', type: 'text', editable: canEditProfile },
    { key: 'probationEnd', label: 'Probation ends', value: dateOnly(p.profile.probationEnd), raw: p.profile.probationEnd?.slice(0, 10) ?? '', type: 'date', editable: canEditProfile },
  ];
  const org: PropertyDef[] = [
    { key: 'roleId', label: 'Role', value: p.role.name, raw: p.role.id, type: 'select', options: (roles.data ?? []).map((r) => ({ value: r.id, label: r.name })), editable: canEditJob && notSelf },
    { key: 'departmentId', label: 'Department', value: p.department?.name, raw: p.department?.id ?? '', type: 'select', options: (departments.data ?? []).map((d) => ({ value: d.id, label: d.name })), editable: canEditJob },
    { key: 'teamId', label: 'Team', value: p.team?.name, raw: p.team?.id ?? '', type: 'select', options: (teams.data ?? []).filter((t) => !p.department || t.departmentId === p.department.id).map((t) => ({ value: t.id, label: t.name })), editable: canEditJob },
    { key: 'managerId', label: 'Manager', value: p.manager ? fullName(p.manager) : null, raw: p.manager?.id ?? '', type: 'select', options: (employees.data ?? []).filter((e) => e.id !== p.id).map((e) => ({ value: e.id, label: `${fullName(e)} (${e.code})` })), editable: canEditJob },
    { key: 'joinDate', label: 'Join date', value: dateOnly(p.joinDate), raw: p.joinDate?.slice(0, 10) ?? '', type: 'date', editable: canEditJob },
  ];

  const openChecklists = p.checklists.filter((c) => c.status === 'open');
  const soon = Date.now() + 30 * 86_400_000;
  const expiring = p.documents.filter((d) => d.expiresAt && new Date(d.expiresAt).getTime() < soon).length;

  const header = (
    <RecordHeader
      avatar={<Avatar name={fullName(p)} size={56} />}
      title={fullName(p)}
      subtitle={<span className="font-mono text-xs text-ink-3">{p.code}</span>}
      badges={<>
        <Badge tone="violet">{p.role.name}</Badge>
        <Badge tone={employeeTone(p.status)} dot>{titleCase(p.status)}</Badge>
        <span className="text-sm text-ink-2">{[p.profile.designation, p.department?.name, p.team?.name].filter(Boolean).join(' · ')}</span>
      </>}
      actions={<>
        {canEditProfile && <Button size="sm" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>Edit</Button>}
        {can('employees.reset_password') && notSelf && <Button size="sm" icon={<KeyRound size={13} />} loading={reset.isPending} onClick={() => reset.mutate(undefined, { onSuccess: (r) => setTempPassword(r?.temporaryPassword ?? 'Sent'), onError: (e) => toast.push('error', (e as Error).message) })}>Reset password</Button>}
        {can('hr.checklists.manage') && (
          <Menu
            trigger={<span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-[7px] text-base font-semibold text-ink hover:bg-surface-2"><ListTodo size={13} /> Checklist</span>}
            items={[
              { label: 'Start onboarding', icon: <UserCheck size={14} />, onSelect: () => setStarting('onboarding') },
              { label: 'Start offboarding', icon: <UserX size={14} />, onSelect: () => setStarting('offboarding') },
            ]}
          />
        )}
      </>}
      primary={
        p.status === 'disabled'
          ? can('employees.edit') && <Button size="sm" variant="primary" icon={<UserCheck size={13} />} loading={enable.isPending} onClick={() => enable.mutate(undefined, { onSuccess: () => toast.push('success', 'Employee re-enabled'), onError: (e) => toast.push('error', (e as Error).message) })}>Enable</Button>
          : p.status === 'suspended'
            ? can('employees.disable') && <Button size="sm" variant="primary" icon={<ShieldCheck size={13} />} loading={restore.isPending} onClick={() => restore.mutate(undefined, { onSuccess: () => toast.push('success', 'Access restored. Devices must be approved again.'), onError: (e) => toast.push('error', (e as Error).message) })}>Restore access</Button>
            : can('employees.disable') && notSelf && (
              <>
                <Button size="sm" variant="danger-outline" icon={<ShieldOff size={13} />} onClick={() => setSuspending(true)}>Suspend access</Button>
                <Button size="sm" variant="danger-outline" icon={<UserX size={13} />} onClick={() => setDisabling(true)}>Disable</Button>
              </>
            )
      }
    />
  );

  const left = (
    <>
      <Section title="About" collapsible>
        <PropertyList properties={personal} onSave={canEditProfile ? onSaveProfile : undefined} />
      </Section>
      <Section title="Job" collapsible>
        <PropertyList properties={job} onSave={canEditProfile ? onSaveProfile : undefined} />
      </Section>
      <Section title="Organisation" collapsible>
        <PropertyList properties={org} onSave={canEditJob ? onSaveJob : undefined} />
      </Section>
      <div className="text-2xs normal-case tracking-normal text-ink-3">Last login {relative(p.lastLoginAt)} · Created {dateOnly(p.createdAt)}</div>
    </>
  );

  const main = (
    <>
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { value: 'overview', label: 'Overview' }, { value: 'attendance', label: 'Attendance' }, { value: 'leave', label: 'Leave' },
        { value: 'documents', label: 'Documents', count: p.documents.length }, { value: 'checklists', label: 'Checklists', count: openChecklists.length }, { value: 'activity', label: 'Activity' },
      ]} />
      {tab === 'overview' && <EmployeeOverview profile={p} expiring={expiring} openChecklists={openChecklists} />}
      {tab === 'attendance' && <EmployeeAttendance employeeId={p.id} />}
      {tab === 'leave' && <EmployeeLeave employeeId={p.id} />}
      {tab === 'documents' && <Documents employeeId={p.id} documents={p.documents} />}
      {tab === 'checklists' && <ChecklistList checklists={p.checklists} />}
      {tab === 'activity' && <EmployeeActivity employeeId={p.id} />}
    </>
  );

  const right = (
    <>
      <AssociationCard title="Manager" emptyText="No manager set">
        {p.manager && <PersonRow name={fullName(p.manager)} sub={p.manager.code} />}
      </AssociationCard>
      <AssociationCard title="Direct reports" count={p.directReports.length} emptyText="No direct reports">
        {p.directReports.length > 0 && <div className="space-y-1">{p.directReports.map((r) => <PersonRow key={r.id} name={fullName(r)} sub={r.code} />)}</div>}
      </AssociationCard>
      <AssociationCard title="Devices" count={p.devices.length} emptyText="No registered devices">
        {p.devices.length > 0 && (
          <ul className="space-y-1.5">
            {p.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-md px-1 py-1">
                <Monitor size={14} className="shrink-0 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{d.name}</div>
                  <div className="text-2xs normal-case tracking-normal text-ink-3">{d.osVersion} · {relative(d.lastSeenAt)}</div>
                </div>
                <Badge tone={d.status === 'approved' ? 'green' : d.status === 'pending' ? 'amber' : 'red'}>{titleCase(d.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </AssociationCard>
      <AssociationCard title="Schedule" emptyText="No schedule assigned. Monday to Friday is assumed.">
        <ScheduleAssignments employeeId={p.id} current={p.employeeSchedules} />
      </AssociationCard>
    </>
  );

  return (
    <>
      <RecordLayout header={header} left={left} main={main} right={right} />
      {editing && <ProfileEditModal profile={p} onClose={() => setEditing(false)} />}
      {disabling && <DisableModal profile={p} onClose={() => setDisabling(false)} onDone={onClose} />}
      {suspending && <SuspendModal profile={p} onClose={() => setSuspending(false)} />}
      {starting && <StartChecklistModal employeeId={p.id} kind={starting} joinDate={p.joinDate} onClose={() => setStarting(null)} />}
      {tempPassword && (
        <Modal open onClose={() => setTempPassword(null)} title="Password reset" width={440} footer={<Button variant="primary" onClick={() => setTempPassword(null)}>Done</Button>}>
          <p className="text-base text-ink-2">Share once. The employee must change it at next login (FR-AUTH-06).</p>
          <div className="mt-3 rounded-card border border-line bg-surface-2 p-3 font-mono text-base">Temporary password: <b>{tempPassword}</b></div>
        </Modal>
      )}
    </>
  );
}

function PersonRow({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-1 py-1">
      <Avatar name={name} size={24} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink">{name}</div>
        {sub && <div className="font-mono text-2xs normal-case tracking-normal text-ink-3">{sub}</div>}
      </div>
    </div>
  );
}

function EmployeeOverview({ profile: p, expiring, openChecklists }: { profile: Profile; expiring: number; openChecklists: Checklist[] }) {
  const month = thisMonth();
  const sheet = useSheet({ month, employeeId: p.id });
  const balances = useBalances({ employeeId: p.id });
  const row = sheet.data?.rows[0];
  const scheduled = row ? row.totals.present + row.totals.late + row.totals.halfDay + row.totals.absent : 0;
  const attendancePct = scheduled ? Math.round(((row!.totals.present + row!.totals.late + row!.totals.halfDay) / scheduled) * 100) : null;
  const available = balances.data?.items.reduce((s, b) => s + (b.leaveType.paid ? Number(b.availableDays) : 0), 0);
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = `${month}-${String(new Date(Date.UTC(y!, m!, 0)).getUTCDate()).padStart(2, '0')}`;
  const activity = useActivitySummary({ employeeId: p.id, from, to });
  const activeH = activity.data ? activity.data.reduce((s, d) => s + d.activeS, 0) / 3600 : null;
  const trend = useMemo(() => (activity.data ? [...activity.data].sort((a, b) => a.date.localeCompare(b.date)).map((d) => d.activeS / 3600) : []), [activity.data]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <KpiTile label="Attendance this month" value={attendancePct === null ? '—' : `${attendancePct}%`} tone={attendancePct === null ? undefined : attendancePct >= 90 ? 'green' : attendancePct >= 75 ? 'amber' : 'red'} loading={sheet.isLoading} icon={<CalendarCheck size={14} />} />
        <KpiTile label="Active hours" value={activeH === null ? '—' : activeH.toFixed(1)} trend={trend} series={2} loading={activity.isLoading} icon={<Activity size={14} />} />
        <KpiTile label="Paid leave available" value={available === undefined ? '—' : Number(available.toFixed(1))} tone="violet" loading={balances.isLoading} />
        <KpiTile label="Open checklist items" value={openChecklists.reduce((s, c) => s + c.items.filter((i) => !i.done).length, 0)} tone={expiring > 0 ? 'amber' : undefined} icon={<ListTodo size={14} />} />
      </div>
      {row && (
        <Section title="This month">
          <SegmentedBar
            format={(n) => `${n} d`}
            segments={[
              { label: 'Present', value: row.totals.present, colour: 'var(--green)' },
              { label: 'Late', value: row.totals.late, colour: 'var(--amber-bar)' },
              { label: 'Half day', value: row.totals.halfDay, colour: 'var(--amber)' },
              { label: 'Absent', value: row.totals.absent, colour: 'var(--red)' },
              { label: 'On leave', value: row.totals.onLeave, colour: 'var(--violet)' },
              { label: 'Holiday', value: row.totals.holiday, colour: 'var(--blue)' },
              { label: 'Weekly off', value: row.totals.weeklyOff, colour: 'var(--gray-bar)' },
            ]}
          />
        </Section>
      )}
      {expiring > 0 && <div className="rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber-text">{expiring} document{expiring > 1 ? 's' : ''} expire within 30 days.</div>}
      <div className="grid grid-cols-2 gap-4">
        <Section title="Contact">
          <ul className="space-y-1.5 text-base text-ink">
            <li className="flex items-center gap-2"><Mail size={13} className="text-ink-3" />{p.email ?? <span className="text-ink-3">—</span>}</li>
            <li className="flex items-center gap-2"><Phone size={13} className="text-ink-3" /><span className="font-mono">{p.phone ?? '—'}</span></li>
            <li className="flex items-center gap-2"><Users size={13} className="text-ink-3" />{p.manager ? `Reports to ${fullName(p.manager)}` : 'No manager'}</li>
          </ul>
        </Section>
        <Section title="Open checklists">
          {openChecklists.length === 0 ? <div className="text-sm text-ink-3">None</div> : <div className="space-y-2">{openChecklists.map((c) => <ChecklistCard key={c.id} checklist={c} compact />)}</div>}
        </Section>
      </div>
    </div>
  );
}

function ScheduleAssignments({ employeeId, current }: { employeeId: string; current: Profile['employeeSchedules'] }) {
  const { can } = useAuth();
  const toast = useToast();
  const q = useAssignments(employeeId);
  const schedules = useSchedules();
  const [adding, setAdding] = useState(false);
  const [scheduleId, setScheduleId] = useState('');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const assign = usePeopleMutation((p: Record<string, unknown>) => http.post(`/employees/${employeeId}/schedules`, p), PEOPLE_ALL);
  const del = usePeopleMutation((id: string) => http.del(`/employees/${employeeId}/schedules/${id}`), PEOPLE_ALL);
  const list = q.data ?? current;
  if (q.isLoading && !current.length) return <Skeleton className="h-10" />;
  return (
    <div className="space-y-2">
      {list.length === 0 && <div className="px-1 py-1 text-xs text-ink-3">No schedule assigned. Monday to Friday is assumed.</div>}
      {list.map((a) => (
        <div key={a.id} className="hover-reveal flex items-center gap-2 rounded-md px-1 py-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">{a.schedule.name}{!a.effectiveTo && <Badge tone="green">Current</Badge>}</div>
            <div className="font-mono text-2xs normal-case tracking-normal text-ink-3">{a.schedule.startTime}–{a.schedule.endTime} · from {dateOnly(a.effectiveFrom)}{a.effectiveTo ? ` to ${dateOnly(a.effectiveTo)}` : ''}</div>
          </div>
          {can('attendance.manage') && <button type="button" className="row-actions rounded p-1 text-ink-3 hover:bg-red-soft hover:text-red" onClick={() => del.mutate(a.id, { onError: (e) => toast.push('error', (e as Error).message) })} aria-label="Remove assignment"><Trash2 size={12} /></button>}
        </div>
      ))}
      {can('attendance.manage') && !adding && <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => setAdding(true)}>Assign schedule</Button>}
      {adding && (
        <div className="space-y-2 rounded-lg border border-line bg-surface p-2">
          <Select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}><option value="">Choose schedule…</option>{(schedules.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <div className="flex justify-end gap-1"><Button size="sm" onClick={() => setAdding(false)}>Cancel</Button><Button size="sm" variant="primary" disabled={!scheduleId || !from} loading={assign.isPending} onClick={() => assign.mutate({ scheduleId, effectiveFrom: from }, { onSuccess: () => { setAdding(false); setScheduleId(''); toast.push('success', 'Schedule assigned'); }, onError: (e) => toast.push('error', (e as Error).message) })}>Assign</Button></div>
        </div>
      )}
    </div>
  );
}

function EmployeeAttendance({ employeeId }: { employeeId: string }) {
  const [month, setMonth] = useState(thisMonth());
  const q = useSheet({ month, employeeId });
  const row = q.data?.rows[0];
  const dates = daysOf(month);
  const first = new Date(dates[0] + 'T00:00:00Z').getUTCDay();
  const lead = (first + 6) % 7; // Monday first
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthPicker value={month} onChange={setMonth} />
        <div className="flex flex-wrap gap-2">{ATTENDANCE_LEGEND.map(([k, l]) => <span key={k} className="inline-flex items-center gap-1 text-xs text-ink-2"><span className={`h-2 w-2 rounded-full ${attendanceDot(k)}`} />{l}</span>)}</div>
      </div>
      {q.isLoading && <Skeleton className="h-48" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && !row && <EmptyState title="No attendance data" body="Attendance days appear once the employee has worked a shift." />}
      {row && (
        <>
          <div className="grid grid-cols-5 gap-2">
            {([['Present', row.totals.present, 'green'], ['Late', row.totals.late, 'amber'], ['Half day', row.totals.halfDay, 'amber'], ['Absent', row.totals.absent, 'red'], ['On leave', row.totals.onLeave, 'violet']] as Array<[string, number, Tone]>).map(([l, v, t]) => (
              <div key={l} className="rounded-card border border-line bg-surface p-2.5"><div className="text-2xs font-semibold uppercase text-ink-3">{l}</div><div className={`mt-1 font-mono text-lg font-semibold ${t === 'green' ? 'text-green-text' : t === 'amber' ? 'text-amber-text' : t === 'red' ? 'text-red-text' : 'text-violet-text'}`}>{v}</div></div>
            ))}
          </div>
          <div className="rounded-card border border-line bg-surface p-3">
            <div className="grid grid-cols-7 gap-1 text-center text-2xs font-semibold uppercase text-ink-3">{WEEKDAYS.map((d) => <div key={d.n}>{d.label}</div>)}</div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: lead }).map((_, i) => <div key={`lead-${i}`} />)}
              {dates.map((d) => {
                const day = row.days[d];
                const hol = q.data!.holidays.find((h) => h.date.slice(0, 10) === d);
                return (
                  <Tooltip key={d} label={`${d} · ${day?.status ? titleCase(day.status) : hol ? hol.name : 'No data'}${day?.workingSeconds ? ` · ${hours(day.workingSeconds)}` : ''}${day?.flags?.length ? ` · ${day.flags.join(', ')}` : ''}`}>
                    <div className={`flex h-12 w-full flex-col items-center justify-center rounded-md border border-line-2 ${isWeekend(d) ? 'bg-surface-2' : 'bg-surface'}`}>
                      <span className="text-xs text-ink-2">{Number(d.slice(8))}</span>
                      <span className={`mt-1 h-2 w-2 rounded-full ${day?.status ? attendanceDot(day.status) : hol ? 'bg-blue' : 'bg-transparent'}`} />
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          </div>
          <SegmentedBar format={(n) => hours(n)} segments={[{ label: 'Active', value: row.totals.activeSeconds, colour: 'var(--pri)' }, { label: 'Other working', value: Math.max(0, row.totals.workingSeconds - row.totals.activeSeconds), colour: 'var(--gray-bar)' }]} />
        </>
      )}
    </div>
  );
}

function EmployeeLeave({ employeeId }: { employeeId: string }) {
  const balances = useBalances({ employeeId });
  const requests = useLeaveRequests({ employeeId, limit: 20 });
  const cols: Column<LeaveRequest>[] = [
    { key: 'type', header: 'Type', cell: (r) => <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: r.leaveType?.colour ?? 'var(--gray)' }} />{r.leaveType?.name ?? titleCase(r.type)}</span> },
    { key: 'dates', header: 'Dates', cell: (r) => <>{dateOnly(r.dateFrom)}{r.dateFrom !== r.dateTo && ` – ${dateOnly(r.dateTo)}`}{r.halfDay && <Badge tone="gray" className="ml-1">½</Badge>}</> },
    { key: 'days', header: 'Days', right: true, mono: true, cell: (r) => Number(r.days) },
    { key: 'status', header: 'Status', cell: (r) => <Badge tone={requestTone(r.status)}>{titleCase(r.status)}</Badge> },
    { key: 'reason', header: 'Reason', cell: (r) => <span className="text-ink-2">{r.reason}</span> },
  ];
  return (
    <div className="space-y-4">
      {balances.isLoading && <Skeleton className="h-16" />}
      {balances.isError && <ErrorBanner message={(balances.error as Error).message} onRetry={() => balances.refetch()} />}
      {balances.data && (
        <div className="grid grid-cols-2 gap-3">
          {balances.data.items.map((b) => {
            const total = Number(b.entitledDays) + Number(b.carriedOverDays) + Number(b.adjustmentsDays);
            return (
              <div key={b.id} className="rounded-card border border-line bg-surface p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-base font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: b.leaveType.colour }} />{b.leaveType.name}</div>
                  <span className="font-mono text-base"><b>{Number(b.availableDays)}</b> <span className="text-ink-3">/ {total}</span></span>
                </div>
                <div className="mt-2"><Progress value={Number(b.usedDays) + Number(b.pendingDays)} max={total || 1} tone={Number(b.availableDays) <= 0 ? 'red' : 'violet'} /></div>
                <div className="mt-1 text-2xs normal-case tracking-normal text-ink-3">Used {Number(b.usedDays)} · Pending {Number(b.pendingDays)}{Number(b.adjustmentsDays) ? ` · Adj ${Number(b.adjustmentsDays)}` : ''}</div>
              </div>
            );
          })}
          {balances.data.items.length === 0 && <div className="col-span-2 text-sm text-ink-3">No balances yet.</div>}
        </div>
      )}
      <Section title="Requests">
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <DataTable rows={requests.data?.items ?? []} columns={cols} loading={requests.isLoading} error={requests.isError ? (requests.error as Error).message : null} onRetry={() => requests.refetch()} empty={<EmptyState title="No leave requests" />} stickyHeader={false} />
        </div>
      </Section>
    </div>
  );
}

function EmployeeActivity({ employeeId }: { employeeId: string }) {
  const [month, setMonth] = useState(thisMonth());
  const dates = daysOf(month);
  const q = useActivitySummary({ employeeId, from: dates[0]!, to: dates[dates.length - 1]! });
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [q.data]);
  const totals = rows.reduce((t, d) => ({ tracked: t.tracked + d.trackedS, active: t.active + d.activeS, idle: t.idle + d.idleS, productive: t.productive + d.productiveS, neutral: t.neutral + d.neutralS, unproductive: t.unproductive + d.unproductiveS }), { tracked: 0, active: 0, idle: 0, productive: 0, neutral: 0, unproductive: 0 });
  const pct = totals.active + totals.idle ? Math.round((totals.active / (totals.active + totals.idle)) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><MonthPicker value={month} onChange={setMonth} /><span className="text-xs text-ink-3">Counts only. No content is recorded.</span></div>
      {q.isLoading && <Skeleton className="h-32" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && rows.length === 0 && <EmptyState icon={<Activity size={20} />} title="No tracked activity" body="Activity appears after the employee works a shift with the tracker running." />}
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <KpiTile label="Tracked" value={hours(totals.tracked)} trend={rows.map((d) => d.trackedS)} series={0} />
            <KpiTile label="Active" value={hours(totals.active)} trend={rows.map((d) => d.activeS)} series={2} />
            <KpiTile label="Activity" value={`${pct}%`} tone={pct >= 50 ? 'green' : pct >= 30 ? 'amber' : 'red'} />
          </div>
          <Section title="Productivity mix">
            <SegmentedBar format={hours} segments={[{ label: 'Productive', value: totals.productive, colour: 'var(--green)' }, { label: 'Neutral', value: totals.neutral, colour: 'var(--gray-bar)' }, { label: 'Unproductive', value: totals.unproductive, colour: 'var(--red)' }]} />
          </Section>
          <Section title="Daily">
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-2 text-left text-2xs font-semibold uppercase text-ink-3"><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Tracked</th><th className="px-3 py-2 text-right">Active</th><th className="px-3 py-2 text-right">Idle</th><th className="px-3 py-2">Activity</th></tr></thead>
                <tbody>{rows.map((d) => { const a = d.activeS + d.idleS ? Math.round((d.activeS / (d.activeS + d.idleS)) * 100) : 0; return <tr key={d.id} className="border-t border-line-2"><td className="px-3 py-1.5 font-mono text-ink">{d.date.slice(0, 10)}</td><td className="px-3 py-1.5 text-right font-mono">{hours(d.trackedS)}</td><td className="px-3 py-1.5 text-right font-mono">{hours(d.activeS)}</td><td className="px-3 py-1.5 text-right font-mono text-ink-2">{hours(d.idleS)}</td><td className="px-3 py-1.5 w-40"><Progress value={a} tone="auto" label={`${a}%`} size={6} /></td></tr>; })}</tbody>
              </table>
            </div>
          </Section>
        </>
      )}
      {rows.length > 0 && <div className="hidden"><Sparkline values={rows.map((d) => d.activeS)} /></div>}
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
  const expiry = (d: HrDocument) => {
    if (!d.expiresAt) return <span className="text-ink-3">—</span>;
    const t = new Date(d.expiresAt).getTime();
    if (t < Date.now()) return <Badge tone="red">Expired {dateOnly(d.expiresAt)}</Badge>;
    if (t < soon) return <Badge tone="amber">Expires {dateOnly(d.expiresAt)}</Badge>;
    return <span>{dateOnly(d.expiresAt)}</span>;
  };
  const cols: Column<HrDocument>[] = [
    { key: 'name', header: 'Name', locked: true, cell: (d) => <><div className="font-semibold">{d.name}</div>{d.note && <div className="text-xs text-ink-3">{d.note}</div>}</> },
    { key: 'type', header: 'Type', cell: (d) => <Badge tone="gray">{d.type}</Badge> },
    { key: 'issued', header: 'Issued', cell: (d) => dateOnly(d.issuedAt) },
    { key: 'expires', header: 'Expires', cell: expiry },
  ];
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <DataTable rows={documents} columns={cols} stickyHeader={false} empty={<EmptyState icon={<FileText size={20} />} title="No documents" body="Document metadata is kept here; files attach once object storage is configured (15 FR-HR-11)." />}
          rowActions={can('hr.profiles.edit') ? (d) => <Tooltip label="Remove"><button type="button" className="rounded p-1 text-ink-3 hover:bg-red-soft hover:text-red" onClick={() => void confirmDialog({ title: 'Remove this document?', danger: true }).then((ok) => ok && del.mutate(d.id, { onError: (e) => toast.push('error', (e as Error).message) }))} aria-label="Remove document"><Trash2 size={13} /></button></Tooltip> : undefined} />
      </div>
      {can('hr.profiles.edit') && !adding && <Button size="sm" icon={<Plus size={13} />} onClick={() => setAdding(true)}>Add document</Button>}
      {adding && (
        <div className="rounded-card border border-line bg-surface p-3">
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
  if (checklists.length === 0) return <EmptyState icon={<ListTodo size={20} />} title="No checklists" body="Start onboarding or offboarding from People → Onboarding." />;
  return <div className="space-y-3">{checklists.map((c) => <ChecklistCard key={c.id} checklist={c} compact={compact} />)}</div>;
}

export function ChecklistCard({ checklist, compact }: { checklist: Checklist; compact?: boolean }) {
  const toast = useToast();
  const toggle = usePeopleMutation(({ itemId, done }: { itemId: string; done: boolean }) => http.patch(`/hr/checklists/${checklist.id}/items/${itemId}`, { done }), PEOPLE_ALL);
  const done = checklist.items.filter((i) => i.done).length;
  const overdue = checklist.items.filter((i) => !i.done && new Date(i.dueAt).getTime() < Date.now()).length;
  return (
    <div className="rounded-card border border-line bg-surface p-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${checklist.kind === 'onboarding' ? 'bg-pri-soft text-pri' : 'bg-amber-soft text-amber'}`}>{checklist.kind === 'onboarding' ? <UserCheck size={14} /> : <UserX size={14} />}</span>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-ink">{titleCase(checklist.kind)}{checklist.employee && <span className="font-normal text-ink-2"> · {fullName(checklist.employee)}</span>}</div>
            <div className="text-2xs normal-case tracking-normal text-ink-3">{checklist.template?.name ?? 'Custom'} · started {dateOnly(checklist.startedAt)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {overdue > 0 && <Badge tone="red">{overdue} overdue</Badge>}
          <Badge tone={checklist.status === 'completed' ? 'green' : 'amber'}>{done}/{checklist.items.length}</Badge>
        </div>
      </div>
      <div className="mt-2"><Progress value={done} max={checklist.items.length || 1} tone={checklist.status === 'completed' ? 'green' : 'primary'} size={6} /></div>
      {!compact && (
        <ul className="mt-3 divide-y divide-line-2">
          {checklist.items.map((i: ChecklistItem) => (
            <li key={i.id} className="flex items-center gap-2 py-1.5 text-base">
              <button type="button" className="text-pri disabled:opacity-50" disabled={toggle.isPending} onClick={() => toggle.mutate({ itemId: i.id, done: !i.done }, { onError: (e) => toast.push('error', (e as Error).message) })} aria-label={i.done ? 'Mark not done' : 'Mark done'}>
                {i.done ? <CheckCircle2 size={16} /> : <Circle size={16} className="text-ink-3" />}
              </button>
              <span className={`flex-1 ${i.done ? 'line-through text-ink-3' : 'text-ink'}`}>{i.title}</span>
              <Badge tone="gray">{i.ownerRole.toUpperCase()}</Badge>
              <span className={`w-24 text-right text-xs ${!i.done && new Date(i.dueAt).getTime() < Date.now() ? 'font-semibold text-red-text' : 'text-ink-3'}`}>{dateOnly(i.dueAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StartChecklistModal({ employeeId, kind, joinDate, onClose }: { employeeId: string; kind: 'onboarding' | 'offboarding'; joinDate: string | null; onClose: () => void }) {
  const toast = useToast();
  const templates = useTemplates();
  const [templateId, setTemplateId] = useState('');
  const [anchorDate, setAnchor] = useState(kind === 'onboarding' ? joinDate?.slice(0, 10) ?? '' : new Date().toISOString().slice(0, 10));
  const start = usePeopleMutation((b: Record<string, unknown>) => http.post('/hr/checklists', b), PEOPLE_ALL);
  return (
    <Modal open onClose={onClose} title={`Start ${kind}`} width={440} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={start.isPending} onClick={() => start.mutate({ employeeId, kind, templateId: templateId || undefined, anchorDate: anchorDate || undefined }, { onSuccess: () => { toast.push('success', 'Checklist started'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Start</Button></>}>
      <div className="space-y-3">
        <Field label="Template"><Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}><option value="">Default for {kind}</option>{(templates.data ?? []).filter((t) => t.kind === kind).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Anchor date" hint={kind === 'onboarding' ? 'Join date; item due dates are offsets from it' : 'Last working day'}><Input type="date" value={anchorDate} onChange={(e) => setAnchor(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function DisableModal({ profile: p, onClose, onDone }: { profile: Profile; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const preview = useProfileOffboardingPreview(p.id);
  const [leadsOwnerId, setLeadsOwner] = useState('');
  const [tasksAssigneeId, setTasksAssignee] = useState('');
  const disable = usePeopleMutation((b: Record<string, unknown>) => http.post(`/employees/${p.id}/disable`, b), PEOPLE_ALL);
  return (
    <Modal open onClose={onClose} title={`Disable ${fullName(p)}`} width={520} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" loading={disable.isPending} onClick={() => disable.mutate({ reassignmentMap: { leadsOwnerId: leadsOwnerId || undefined, tasksAssigneeId: tasksAssigneeId || undefined } }, { onSuccess: () => { toast.push('success', 'Employee disabled'); onClose(); onDone(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Disable employee</Button></>}>
      <p className="text-base text-ink-2">Sessions and devices are revoked and mailbox assignments removed (F16). Owned records must be reassigned first.</p>
      {preview.data && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {Object.entries(preview.data).filter(([, v]) => typeof v === 'number').map(([k, v]) => <div key={k} className="rounded-card border border-line bg-surface-2 p-2"><div className="text-2xs font-semibold uppercase text-ink-3">{titleCase(k)}</div><div className="font-mono text-lg font-semibold text-ink">{v as number}</div></div>)}
        </div>
      )}
      <div className="mt-3 space-y-3">
        <Field label="Reassign leads to"><EmployeeSelect value={leadsOwnerId} onChange={setLeadsOwner} emptyLabel="Keep unassigned" /></Field>
        <Field label="Reassign tasks to"><EmployeeSelect value={tasksAssigneeId} onChange={setTasksAssignee} emptyLabel="Keep unassigned" /></Field>
      </div>
    </Modal>
  );
}

/** FR-SEC-24: suspend access. Unlike disable, nothing is reassigned; the employee reappears unchanged on restore. */
function SuspendModal({ profile: p, onClose }: { profile: Profile; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const suspend = usePeopleMutation((b: Record<string, unknown>) => http.post(`/employees/${p.id}/suspend`, b), PEOPLE_ALL);
  return (
    <Modal open onClose={onClose} title={`Suspend access for ${fullName(p)}`} width={480} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!reason.trim()} loading={suspend.isPending} onClick={() => suspend.mutate({ reason: reason.trim() }, { onSuccess: () => { toast.push('success', 'Access suspended'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Suspend access</Button></>}>
      <p className="text-base text-ink-2">All sessions and devices are revoked right away and the desktop app signs out. Leads, tasks, targets and mailboxes stay assigned. Restore access later from this record; devices must be approved again (FR-SEC-24, FR-SEC-26).</p>
      <div className="mt-3">
        <Field label="Reason" required hint="Recorded in the audit log."><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus /></Field>
      </div>
    </Modal>
  );
}

function useProfileOffboardingPreview(id: string) {
  return useQueryLite(() => http.get<Record<string, unknown>>(`/employees/${id}/offboarding-preview`), id);
}

/** Tiny one-shot fetch for modals that should not pollute the query cache keys. */
function useQueryLite<T>(fn: () => Promise<T>, dep: string) {
  const [state, setState] = useState<{ dep: string; data?: T }>({ dep: '' });
  if (state.dep !== dep) {
    setState({ dep });
    fn().then((data) => setState((s) => (s.dep === dep ? { dep, data } : s))).catch(() => undefined);
  }
  return { data: state.data };
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
export function DecisionModal({ title, confirmLabel, danger, onClose, onConfirm, loading, children }: { title: string; confirmLabel: string; danger?: boolean; onClose: () => void; onConfirm: (comment: string) => void; loading?: boolean; children?: ReactNode }) {
  const [comment, setComment] = useState('');
  return (
    <Modal open onClose={onClose} title={title} width={480} footer={<><Button onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={() => onConfirm(comment)}>{confirmLabel}</Button></>}>
      {children}
      <Field label="Comment (optional)"><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
    </Modal>
  );
}

export { Checkbox };
