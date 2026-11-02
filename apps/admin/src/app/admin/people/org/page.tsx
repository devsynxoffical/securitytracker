'use client';

import { Suspense, useState } from 'react';
import { Plus, Pencil, Trash2, Building2, Users } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDepartments, useTeams, usePeopleMutation, PEOPLE_ALL, type Department, type Team } from '@/lib/queries/people';
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Skeleton, useToast } from '@/components/ui';
import { DataTable, KpiTile, Menu, type Column } from '@/components/ui/advanced';
import { DepartmentSelect, EmployeeSelect } from '@/components/people/shared';
import { fullName } from '@/lib/format';

export default function OrgPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Org /></Suspense>;
}

function Org() {
  const { can } = useAuth();
  const toast = useToast();
  const departments = useDepartments();
  const teams = useTeams();
  const [editingDept, setEditingDept] = useState<Department | 'new' | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | 'new' | null>(null);
  const delDept = usePeopleMutation((id: string) => http.del(`/departments/${id}`), PEOPLE_ALL);
  const delTeam = usePeopleMutation((id: string) => http.del(`/teams/${id}`), PEOPLE_ALL);
  const manage = can('org.manage');
  const people = (departments.data ?? []).reduce((s, d) => s + (d._count?.employees ?? 0), 0);
  const noManager = (departments.data ?? []).filter((d) => !d.managerId).length;

  const deptCols: Column<Department>[] = [
    { key: 'name', header: 'Department', locked: true, cell: (d) => <span className="inline-flex items-center gap-2 font-semibold text-ink"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-pri-soft text-pri"><Building2 size={13} /></span>{d.name}</span> },
    { key: 'manager', header: 'Manager', cell: (d) => (d.manager ? <span className="inline-flex items-center gap-2"><Avatar name={fullName(d.manager)} size={22} />{fullName(d.manager)}</span> : <Badge tone="amber">No manager</Badge>) },
    { key: 'teams', header: 'Teams', right: true, mono: true, cell: (d) => d._count?.teams ?? 0 },
    { key: 'people', header: 'People', right: true, mono: true, cell: (d) => d._count?.employees ?? 0 },
  ];
  const teamCols: Column<Team>[] = [
    { key: 'name', header: 'Team', locked: true, cell: (t) => <span className="inline-flex items-center gap-2 font-semibold text-ink"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-soft text-blue"><Users size={13} /></span>{t.name}</span> },
    { key: 'department', header: 'Department', cell: (t) => <Badge tone="gray">{t.department?.name ?? departments.data?.find((d) => d.id === t.departmentId)?.name ?? '—'}</Badge> },
    { key: 'leader', header: 'Leader', cell: (t) => (t.leader ? <span className="inline-flex items-center gap-2"><Avatar name={fullName(t.leader)} size={22} />{fullName(t.leader)}</span> : <Badge tone="amber">No leader</Badge>) },
    { key: 'people', header: 'People', right: true, mono: true, cell: (t) => t._count?.employees ?? 0 },
  ];

  return (
    <div>
      <PageHeader title="Departments & teams" subtitle="A department has a manager, a team has a leader (FR-ORG-01). Permission scopes follow this structure." />
      <div className="mb-4 grid grid-cols-4 gap-3">
        <KpiTile label="Departments" value={departments.data?.length ?? '—'} loading={departments.isLoading} icon={<Building2 size={14} />} />
        <KpiTile label="Teams" value={teams.data?.length ?? '—'} loading={teams.isLoading} icon={<Users size={14} />} />
        <KpiTile label="People placed" value={people} loading={departments.isLoading} />
        <KpiTile label="Departments without manager" value={noManager} tone={noManager ? 'amber' : undefined} loading={departments.isLoading} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Departments" actions={manage && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditingDept('new')}>New department</Button>}>
          <DataTable rows={departments.data ?? []} columns={deptCols} loading={departments.isLoading} error={departments.isError ? (departments.error as Error).message : null} onRetry={() => departments.refetch()} stickyHeader={false} empty={<EmptyState icon={<Building2 size={20} />} title="No departments" body="Create the first department." />}
            rowActions={manage ? (d) => <Menu items={[{ label: 'Edit', icon: <Pencil size={13} />, onSelect: () => setEditingDept(d) }, { separator: true, label: '' }, { label: 'Delete', icon: <Trash2 size={13} />, danger: true, onSelect: () => window.confirm(`Delete ${d.name}?`) && delDept.mutate(d.id, { onError: (e) => toast.push('error', (e as Error).message) }) }]} /> : undefined} />
        </Card>
        <Card title="Teams" actions={manage && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditingTeam('new')}>New team</Button>}>
          <DataTable rows={teams.data ?? []} columns={teamCols} loading={teams.isLoading} error={teams.isError ? (teams.error as Error).message : null} onRetry={() => teams.refetch()} stickyHeader={false} empty={<EmptyState icon={<Users size={20} />} title="No teams" body="Teams belong to a department and have a leader." />}
            rowActions={manage ? (t) => <Menu items={[{ label: 'Edit', icon: <Pencil size={13} />, onSelect: () => setEditingTeam(t) }, { separator: true, label: '' }, { label: 'Delete', icon: <Trash2 size={13} />, danger: true, onSelect: () => window.confirm(`Delete ${t.name}?`) && delTeam.mutate(t.id, { onError: (e) => toast.push('error', (e as Error).message) }) }]} /> : undefined} />
        </Card>
      </div>
      {editingDept && <DepartmentModal department={editingDept === 'new' ? null : editingDept} onClose={() => setEditingDept(null)} />}
      {editingTeam && <TeamModal team={editingTeam === 'new' ? null : editingTeam} onClose={() => setEditingTeam(null)} />}
    </div>
  );
}

function DepartmentModal({ department, onClose }: { department: Department | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(department?.name ?? '');
  const [managerId, setManagerId] = useState(department?.managerId ?? '');
  const save = usePeopleMutation((b: Record<string, unknown>) => (department ? http.patch(`/departments/${department.id}`, b) : http.post('/departments', b)), PEOPLE_ALL);
  return (
    <Modal open onClose={onClose} title={department ? 'Edit department' : 'New department'} width={440} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate(department ? { name, managerId: managerId || null } : { name, managerId: managerId || undefined }, { onSuccess: () => { toast.push('success', 'Saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Manager" hint="Gets department scope for permissions granted at that level"><EmployeeSelect value={managerId} onChange={setManagerId} emptyLabel="No manager" /></Field>
      </div>
    </Modal>
  );
}

function TeamModal({ team, onClose }: { team: Team | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(team?.name ?? '');
  const [departmentId, setDepartmentId] = useState(team?.departmentId ?? '');
  const [leaderId, setLeaderId] = useState(team?.leaderId ?? '');
  const save = usePeopleMutation((b: Record<string, unknown>) => (team ? http.patch(`/teams/${team.id}`, b) : http.post('/teams', b)), PEOPLE_ALL);
  return (
    <Modal open onClose={onClose} title={team ? 'Edit team' : 'New team'} width={440} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim() || !departmentId} loading={save.isPending} onClick={() => save.mutate(team ? { name, departmentId, leaderId: leaderId || null } : { name, departmentId, leaderId: leaderId || undefined }, { onSuccess: () => { toast.push('success', 'Saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Department" required><DepartmentSelect value={departmentId} onChange={setDepartmentId} emptyLabel="Choose…" /></Field>
        <Field label="Team leader" hint="Gets team scope for permissions granted at that level"><EmployeeSelect value={leaderId} onChange={setLeaderId} emptyLabel="No leader" /></Field>
      </div>
    </Modal>
  );
}
