'use client';

import { Suspense, useMemo, useState } from 'react';
import { Download, Plus, Users } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useEmployeesList, useRoles, usePeopleMutation, PEOPLE_ALL, type EmployeeRow } from '@/lib/queries/people';
import { Avatar, Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, SearchInput, Select, Skeleton, Table, TableSkeleton, Td, Th, useToast } from '@/components/ui';
import { DepartmentSelect, TeamSelect, EmployeeDrawer, EmployeeSelect } from '@/components/people/shared';
import { dateOnly, downloadText, fullName, relative, titleCase } from '@/lib/format';

export default function DirectoryPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Directory /></Suspense>;
}

function Directory() {
  const { can } = useAuth();
  const toast = useToast();
  const [id, setId] = useIdParam();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useEmployeesList(status ? { status } : undefined);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((e) =>
      (!departmentId || e.department?.id === departmentId) &&
      (!teamId || e.team?.id === teamId) &&
      (!s || `${e.firstName} ${e.lastName} ${e.code} ${e.email ?? ''} ${e.role.name}`.toLowerCase().includes(s)),
    );
  }, [q.data, search, departmentId, teamId]);
  const exportCsv = () => http.text('/employees/export', status ? { status } : undefined).then((t) => downloadText('employees.csv', t)).catch((e) => toast.push('error', (e as Error).message));

  return (
    <div>
      <PageHeader title="Directory" subtitle={`${rows.length} employees`} actions={<>
        {can('reports.export') && <Button icon={<Download size={14} />} onClick={exportCsv}>Export</Button>}
        {can('employees.create') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New employee</Button>}
      </>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput className="w-64" value={search} onChange={setSearch} placeholder="Name, code, email, role…" />
        <div className="w-44"><DepartmentSelect value={departmentId} onChange={(v) => { setDepartmentId(v); setTeamId(''); }} /></div>
        <div className="w-40"><TeamSelect value={teamId} onChange={setTeamId} departmentId={departmentId || undefined} /></div>
        <div className="w-36"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="invited">Invited</option><option value="disabled">Disabled</option></Select></div>
      </div>
      <Card>
        {q.isLoading && <TableSkeleton cols={7} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && rows.length === 0 && <EmptyState icon={<Users size={20} />} title="No employees match" body="Adjust the filters or add an employee." action={can('employees.create') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New employee</Button> : undefined} />}
        {rows.length > 0 && (
          <Table>
            <thead><tr><Th>Employee</Th><Th>Role</Th><Th>Department</Th><Th>Team</Th><Th>Manager</Th><Th>Status</Th><Th>Joined</Th><Th right>Last login</Th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setId(e.id)}>
                  <Td><div className="flex items-center gap-2"><Avatar name={fullName(e)} size={24} /><div><div className="font-semibold">{fullName(e)}</div><div className="font-mono text-xs text-ink-3">{e.code}{e.email ? ` · ${e.email}` : ''}</div></div></div></Td>
                  <Td><Badge tone="violet">{e.role.name}</Badge></Td>
                  <Td>{e.department?.name ?? '—'}</Td>
                  <Td>{e.team?.name ?? '—'}</Td>
                  <Td>{e.manager ? fullName(e.manager) : '—'}</Td>
                  <Td><Badge tone={e.status === 'active' ? 'green' : e.status === 'disabled' ? 'red' : 'amber'} dot>{titleCase(e.status)}</Badge></Td>
                  <Td>{dateOnly(e.joinDate)}</Td>
                  <Td right className="text-ink-3">{relative(e.lastLoginAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <EmployeeDrawer id={id} onClose={() => setId(null)} />
      {creating && <NewEmployeeModal onClose={() => setCreating(false)} onCreated={(e) => { setCreating(false); setId(e.id); }} />}
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
        <p className="text-[13px] text-ink-2">Share these credentials once. The employee must change the password at first login (FR-AUTH-06).</p>
        <div className="mt-3 rounded-card border border-line bg-surface-2 p-3 font-mono text-[13px]"><div>Code: <b>{result.code}</b></div><div>Temporary password: <b>{result.password}</b></div></div>
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
