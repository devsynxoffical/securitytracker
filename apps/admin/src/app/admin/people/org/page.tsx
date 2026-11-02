'use client';

import { Suspense, useState } from 'react';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDepartments, useTeams, usePeopleMutation, PEOPLE_ALL, type Department, type Team } from '@/lib/queries/people';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Skeleton, Table, TableSkeleton, Td, Th, useToast } from '@/components/ui';
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
  return (
    <div>
      <PageHeader title="Departments & teams" subtitle="A department has a manager, a team has a leader (FR-ORG-01). Scopes follow this structure." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Departments" actions={manage && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditingDept('new')}>New department</Button>}>
          {departments.isLoading && <TableSkeleton cols={4} />}
          {departments.isError && <ErrorBanner message={(departments.error as Error).message} onRetry={() => departments.refetch()} />}
          {departments.data && departments.data.length === 0 && <EmptyState icon={<Building2 size={20} />} title="No departments" body="Create the first department." />}
          {departments.data && departments.data.length > 0 && (
            <Table>
              <thead><tr><Th>Name</Th><Th>Manager</Th><Th right>Teams</Th><Th right>People</Th><Th /></tr></thead>
              <tbody>{departments.data.map((d) => <tr key={d.id} className="hover:bg-surface-2"><Td className="font-semibold">{d.name}</Td><Td>{d.manager ? fullName(d.manager) : <span className="text-ink-3">—</span>}</Td><Td right mono>{d._count?.teams ?? 0}</Td><Td right mono>{d._count?.employees ?? 0}</Td><Td right>{manage && <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditingDept(d)} /><Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => window.confirm(`Delete ${d.name}?`) && delDept.mutate(d.id, { onError: (e) => toast.push('error', (e as Error).message) })} /></div>}</Td></tr>)}</tbody>
            </Table>
          )}
        </Card>
        <Card title="Teams" actions={manage && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditingTeam('new')}>New team</Button>}>
          {teams.isLoading && <TableSkeleton cols={4} />}
          {teams.isError && <ErrorBanner message={(teams.error as Error).message} onRetry={() => teams.refetch()} />}
          {teams.data && teams.data.length === 0 && <EmptyState title="No teams" body="Teams belong to a department and have a leader." />}
          {teams.data && teams.data.length > 0 && (
            <Table>
              <thead><tr><Th>Name</Th><Th>Department</Th><Th>Leader</Th><Th right>People</Th><Th /></tr></thead>
              <tbody>{teams.data.map((t) => <tr key={t.id} className="hover:bg-surface-2"><Td className="font-semibold">{t.name}</Td><Td><Badge tone="gray">{t.department?.name ?? departments.data?.find((d) => d.id === t.departmentId)?.name ?? '—'}</Badge></Td><Td>{t.leader ? fullName(t.leader) : <span className="text-ink-3">—</span>}</Td><Td right mono>{t._count?.employees ?? 0}</Td><Td right>{manage && <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditingTeam(t)} /><Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => window.confirm(`Delete ${t.name}?`) && delTeam.mutate(t.id, { onError: (e) => toast.push('error', (e as Error).message) })} /></div>}</Td></tr>)}</tbody>
            </Table>
          )}
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
      <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label="Manager"><EmployeeSelect value={managerId} onChange={setManagerId} emptyLabel="No manager" /></Field>
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
      <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label="Department" required><DepartmentSelect value={departmentId} onChange={setDepartmentId} emptyLabel="Choose…" /></Field>
      <Field label="Team leader"><EmployeeSelect value={leaderId} onChange={setLeaderId} emptyLabel="No leader" /></Field>
    </Modal>
  );
}
