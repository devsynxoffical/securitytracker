'use client';

import { Suspense, useMemo, useState } from 'react';
import { Download, Plus, Users, KeyRound, UserX, ExternalLink, Clock, Plane, UserCheck } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useEmployeesList, useRoles, useDepartments, useTeams, useLive, useOutToday, useCorrections, usePeopleMutation, PEOPLE_ALL, type EmployeeRow } from '@/lib/queries/people';
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchInput, Select, Skeleton, useToast } from '@/components/ui';
import { DataTable, FilterChip, KpiTile, Tooltip, ViewTabs, type Column, type SortState } from '@/components/ui/advanced';
import { DepartmentSelect, TeamSelect, EmployeeDrawer, EmployeeSelect, OptionList, employeeTone } from '@/components/people/shared';
import { dateOnly, downloadText, fullName, relative, titleCase } from '@/lib/format';

type View = 'all' | 'active' | 'invited' | 'disabled';

export default function DirectoryPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Directory /></Suspense>;
}

function Directory() {
  const { can, me } = useAuth();
  const toast = useToast();
  const [id, setId] = useIdParam();
  const [view, setView] = useState<View>('all');
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'name', direction: 'asc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [disabling, setDisabling] = useState<EmployeeRow | null>(null);
  const q = useEmployeesList();
  const departments = useDepartments();
  const teams = useTeams();
  const roles = useRoles();
  const live = useLive();
  const out = useOutToday();
  const pending = useCorrections('pending');
  const reset = usePeopleMutation((eid: string) => http.post<{ temporaryPassword?: string }>(`/employees/${eid}/reset-password`), PEOPLE_ALL);
  const disable = usePeopleMutation((eid: string) => http.post(`/employees/${eid}/disable`, {}), PEOPLE_ALL);
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);

  const all = q.data ?? [];
  const counts = { all: all.length, active: all.filter((e) => e.status === 'active').length, invited: all.filter((e) => e.status === 'invited').length, disabled: all.filter((e) => e.status === 'disabled').length };
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = all.filter((e) =>
      (view === 'all' || e.status === view) &&
      (!departmentId || e.department?.id === departmentId) &&
      (!teamId || e.team?.id === teamId) &&
      (!roleId || e.role.id === roleId) &&
      (!s || `${e.firstName} ${e.lastName} ${e.code} ${e.email ?? ''} ${e.role.name}`.toLowerCase().includes(s)),
    );
    const dir = sort.direction === 'asc' ? 1 : -1;
    const key = (e: EmployeeRow): string => {
      switch (sort.key) {
        case 'role': return e.role.name;
        case 'department': return e.department?.name ?? '';
        case 'team': return e.team?.name ?? '';
        case 'status': return e.status;
        case 'joined': return e.joinDate ?? '';
        case 'login': return e.lastLoginAt ?? '';
        default: return fullName(e);
      }
    };
    return [...list].sort((a, b) => key(a).localeCompare(key(b)) * dir);
  }, [all, view, search, departmentId, teamId, roleId, sort]);

  const exportCsv = () => http.text('/employees/export', view !== 'all' ? { status: view } : undefined).then((t) => downloadText('employees.csv', t)).catch((e) => toast.push('error', (e as Error).message));
  const activeToday = live.data?.filter((r) => r.checkInAt).length;

  const cols: Column<EmployeeRow>[] = [
    { key: 'name', header: 'Employee', sortable: true, locked: true, cell: (e) => <div className="flex items-center gap-2.5"><Avatar name={fullName(e)} size={28} /><div className="min-w-0"><div className="truncate font-semibold text-ink">{fullName(e)}</div><div className="truncate font-mono text-xs text-ink-3">{e.code}{e.email ? ` · ${e.email}` : ''}</div></div></div> },
    { key: 'role', header: 'Role', sortable: true, cell: (e) => <Badge tone="violet">{e.role.name}</Badge> },
    { key: 'department', header: 'Department', sortable: true, cell: (e) => e.department?.name ?? <span className="text-ink-3">—</span> },
    { key: 'team', header: 'Team', sortable: true, cell: (e) => e.team?.name ?? <span className="text-ink-3">—</span> },
    { key: 'manager', header: 'Manager', cell: (e) => (e.manager ? fullName(e.manager) : <span className="text-ink-3">—</span>) },
    { key: 'status', header: 'Status', sortable: true, cell: (e) => <Badge tone={employeeTone(e.status)} dot>{titleCase(e.status)}</Badge> },
    { key: 'joined', header: 'Joined', sortable: true, cell: (e) => dateOnly(e.joinDate) },
    { key: 'login', header: 'Last login', sortable: true, right: true, cell: (e) => <span className="text-ink-3">{relative(e.lastLoginAt)}</span> },
  ];

  const deptName = departments.data?.find((d) => d.id === departmentId)?.name;
  const teamName = teams.data?.find((t) => t.id === teamId)?.name;
  const roleName = roles.data?.find((r) => r.id === roleId)?.name;

  return (
    <div>
      <PageHeader title="Directory" subtitle="Everyone in the company, their role, team and status" actions={<>
        {can('reports.export') && <Button icon={<Download size={14} />} onClick={exportCsv}>Export</Button>}
        {can('employees.create') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New employee</Button>}
      </>} />

      <div className="mb-4 grid grid-cols-4 gap-3">
        <KpiTile label="Headcount" value={counts.active} loading={q.isLoading} icon={<Users size={14} />} deltaLabel="" />
        <KpiTile label="Working today" value={activeToday ?? '—'} tone="green" loading={live.isLoading} icon={<Clock size={14} />} />
        <KpiTile label="On leave today" value={out.data?.items.length ?? '—'} tone="violet" loading={out.isLoading} icon={<Plane size={14} />} />
        <KpiTile label="Pending corrections" value={pending.data?.length ?? '—'} tone={(pending.data?.length ?? 0) > 0 ? 'amber' : undefined} loading={pending.isLoading} icon={<UserCheck size={14} />} />
      </div>

      <Card>
        <ViewTabs value={view} onChange={(v) => { setView(v); setSelected(new Set()); }} views={[
          { value: 'all', label: 'All', count: counts.all }, { value: 'active', label: 'Active', count: counts.active }, { value: 'invited', label: 'Invited', count: counts.invited }, { value: 'disabled', label: 'Disabled', count: counts.disabled },
        ]} />
        <div className="flex flex-wrap items-center gap-2 border-b border-line-2 px-3 py-2.5">
          <SearchInput className="w-64" value={search} onChange={setSearch} placeholder="Name, code, email, role…" />
          <FilterChip label="Department" value={deptName} onClear={() => { setDepartmentId(''); setTeamId(''); }}>
            <OptionList value={departmentId} onChange={(v) => { setDepartmentId(v); setTeamId(''); }} options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))} />
          </FilterChip>
          <FilterChip label="Team" value={teamName} onClear={() => setTeamId('')}>
            <OptionList value={teamId} onChange={setTeamId} options={(teams.data ?? []).filter((t) => !departmentId || t.departmentId === departmentId).map((t) => ({ value: t.id, label: t.name }))} />
          </FilterChip>
          <FilterChip label="Role" value={roleName} onClear={() => setRoleId('')}>
            <OptionList value={roleId} onChange={setRoleId} options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} />
          </FilterChip>
          <span className="ml-auto text-xs text-ink-3">{rows.length} of {counts.all}</span>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-3 border-b border-line bg-pri-soft px-4 py-2 text-base text-pri-2">
            <span className="font-semibold">{selected.size} selected</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            <span className="text-xs text-ink-2">Bulk actions on employees are deliberate single steps (F16); open each record to disable or reset.</span>
          </div>
        )}
        <DataTable
          rows={rows}
          columns={cols}
          loading={q.isLoading}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          sort={sort}
          onSort={setSort}
          selected={selected}
          onSelect={setSelected}
          onRowClick={(e) => setId(e.id)}
          storageKey="people.directory"
          empty={<EmptyState icon={<Users size={20} />} title="No employees match" body="Adjust the filters or add an employee." action={can('employees.create') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New employee</Button> : undefined} />}
          rowActions={(e) => (
            <>
              <Tooltip label="Open"><button type="button" className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" onClick={() => setId(e.id)} aria-label="Open"><ExternalLink size={13} /></button></Tooltip>
              {can('employees.reset_password') && e.id !== me?.id && <Tooltip label="Reset password"><button type="button" className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" onClick={() => reset.mutate(e.id, { onSuccess: (r) => setTempPassword({ name: fullName(e), password: r?.temporaryPassword ?? 'Sent' }), onError: (err) => toast.push('error', (err as Error).message) })} aria-label="Reset password"><KeyRound size={13} /></button></Tooltip>}
              {can('employees.disable') && e.status !== 'disabled' && e.id !== me?.id && <Tooltip label="Disable"><button type="button" className="rounded p-1 text-ink-3 hover:bg-red-soft hover:text-red" onClick={() => setDisabling(e)} aria-label="Disable"><UserX size={13} /></button></Tooltip>}
            </>
          )}
          footer={<div className="flex items-center justify-between border-t border-line-2 bg-surface-2 px-4 py-2 text-xs text-ink-2"><span className="font-mono">{rows.length} rows</span><span>Click a row to open the profile</span></div>}
        />
      </Card>

      <EmployeeDrawer id={id} onClose={() => setId(null)} />
      {creating && <NewEmployeeModal onClose={() => setCreating(false)} onCreated={(e) => { setCreating(false); setId(e.id); }} />}
      {disabling && (
        <Modal open onClose={() => setDisabling(null)} title={`Disable ${fullName(disabling)}`} width={460} footer={<><Button onClick={() => setDisabling(null)}>Cancel</Button><Button variant="danger" loading={disable.isPending} onClick={() => disable.mutate(disabling.id, { onSuccess: () => { toast.push('success', 'Employee disabled'); setDisabling(null); }, onError: (e) => toast.push('error', (e as Error).message) })}>Disable</Button></>}>
          <p className="text-base text-ink-2">Sessions and devices are revoked and mailbox access removed. Open the profile to reassign leads and tasks first (F16).</p>
        </Modal>
      )}
      {tempPassword && (
        <Modal open onClose={() => setTempPassword(null)} title={`Password reset · ${tempPassword.name}`} width={440} footer={<Button variant="primary" onClick={() => setTempPassword(null)}>Done</Button>}>
          <p className="text-base text-ink-2">Share once. The employee must change it at next login (FR-AUTH-06).</p>
          <div className="mt-3 rounded-card border border-line bg-surface-2 p-3 font-mono text-base">Temporary password: <b>{tempPassword.password}</b></div>
        </Modal>
      )}
    </div>
  );
}

function NewEmployeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (e: EmployeeRow) => void }) {
  const toast = useToast();
  const roles = useRoles();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [joinDate, setJoinDate] = useState(new Date().toISOString().slice(0, 10));
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<{ code: string; password?: string } | null>(null);
  const create = usePeopleMutation((b: Record<string, unknown>) => http.post<EmployeeRow & { temporaryPassword?: string }>('/employees', b), PEOPLE_ALL);
  const submit = () => create.mutate(
    { firstName, lastName, email: email || undefined, phone: phone || undefined, roleId: roleId || undefined, departmentId: departmentId || undefined, teamId: teamId || undefined, managerId: managerId || undefined, joinDate: joinDate || undefined, password: password || undefined },
    { onSuccess: (e) => { toast.push('success', 'Employee created'); if (e.temporaryPassword) setResult({ code: e.code, password: e.temporaryPassword }); else onCreated(e); }, onError: (e) => toast.push('error', (e as Error).message) },
  );
  if (result) {
    return (
      <Modal open onClose={onClose} title="Employee created" width={480} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <p className="text-base text-ink-2">Share these credentials once. The employee must change the password at first login (FR-AUTH-06).</p>
        <div className="mt-3 rounded-card border border-line bg-surface-2 p-3 font-mono text-base"><div>Code: <b>{result.code}</b></div><div>Temporary password: <b>{result.password}</b></div></div>
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} title="New employee" width={620} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!firstName.trim() || !lastName.trim()} loading={create.isPending} onClick={submit}>Create</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" required><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus /></Field>
        <Field label="Last name" required><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
        <Field label="Company email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Role"><Select value={roleId} onChange={(e) => setRoleId(e.target.value)}><option value="">Employee (default)</option>{(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Manager"><EmployeeSelect value={managerId} onChange={setManagerId} emptyLabel="No manager" /></Field>
        <Field label="Department"><DepartmentSelect value={departmentId} onChange={(v) => { setDepartmentId(v); setTeamId(''); }} emptyLabel="No department" /></Field>
        <Field label="Team"><TeamSelect value={teamId} onChange={setTeamId} departmentId={departmentId || undefined} emptyLabel="No team" /></Field>
        <Field label="Join date"><Input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} /></Field>
        <Field label="Temporary password" hint="Leave empty to generate one"><Input value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
