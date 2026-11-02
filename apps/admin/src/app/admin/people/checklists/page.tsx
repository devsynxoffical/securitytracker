'use client';

import { Suspense, useState } from 'react';
import { Plus, Pencil, Trash2, ListTodo, CheckCircle2 } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTemplates, useChecklists, useMyItems, usePeopleMutation, PEOPLE_ALL, type ChecklistTemplate, type ChecklistTemplateItem } from '@/lib/queries/people';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Segmented, Select, Skeleton, Table, TableSkeleton, Tabs, Td, Th, useToast } from '@/components/ui';
import { ChecklistList, EmployeeSelect } from '@/components/people/shared';
import { dateOnly, fullName, titleCase } from '@/lib/format';

type Tab = 'active' | 'mine' | 'templates';

export default function ChecklistsPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Checklists /></Suspense>;
}

function Checklists() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>(can('hr.checklists.manage') ? 'active' : 'mine');
  const [starting, setStarting] = useState(false);
  return (
    <div>
      <PageHeader title="Onboarding & offboarding" subtitle="Checklists from templates, items owned by HR, IT, manager or the employee (F26)" actions={can('hr.checklists.manage') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setStarting(true)}>Start checklist</Button>} />
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[...(can('hr.checklists.manage') ? [{ value: 'active' as Tab, label: 'Checklists' }] : []), { value: 'mine', label: 'My items' }, ...(can('hr.checklists.manage') ? [{ value: 'templates' as Tab, label: 'Templates' }] : [])]} />
      {tab === 'active' && <Active />}
      {tab === 'mine' && <MyItems />}
      {tab === 'templates' && <Templates />}
      {starting && <StartModal onClose={() => setStarting(false)} />}
    </div>
  );
}

function Active() {
  const [kind, setKind] = useState<'all' | 'onboarding' | 'offboarding'>('all');
  const [status, setStatus] = useState<'open' | 'completed'>('open');
  const q = useChecklists({ kind: kind === 'all' ? undefined : kind, status });
  return (
    <>
      <div className="mb-3 flex gap-2">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'onboarding', label: 'Onboarding' }, { value: 'offboarding', label: 'Offboarding' }]} />
        <Segmented value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open' }, { value: 'completed', label: 'Completed' }]} />
      </div>
      {q.isLoading && <Skeleton className="h-40" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && <ChecklistList checklists={q.data} />}
    </>
  );
}

function MyItems() {
  const toast = useToast();
  const q = useMyItems();
  const toggle = usePeopleMutation(({ checklistId, itemId }: { checklistId: string; itemId: string }) => http.patch(`/hr/checklists/${checklistId}/items/${itemId}`, { done: true }), PEOPLE_ALL);
  return (
    <Card>
      {q.isLoading && <TableSkeleton cols={4} />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.items.length === 0 && <EmptyState icon={<CheckCircle2 size={20} />} title="Nothing to do" body="Items assigned to your role appear here when onboarding or offboarding starts." />}
      {q.data && q.data.items.length > 0 && (
        <Table>
          <thead><tr><Th>Item</Th><Th>Employee</Th><Th>Kind</Th><Th>Role</Th><Th>Due</Th><Th /></tr></thead>
          <tbody>{q.data.items.map((i) => <tr key={i.id} className="hover:bg-surface-2"><Td className="font-semibold">{i.title}</Td><Td>{fullName(i.employee)}</Td><Td>{titleCase(i.kind)}</Td><Td><Badge tone="gray">{i.ownerRole.toUpperCase()}</Badge></Td><Td className={new Date(i.dueAt).getTime() < Date.now() ? 'font-semibold text-red' : ''}>{dateOnly(i.dueAt)}</Td><Td right><Button size="sm" variant="primary" loading={toggle.isPending} onClick={() => toggle.mutate({ checklistId: i.checklistId, itemId: i.id }, { onError: (e) => toast.push('error', (e as Error).message) })}>Done</Button></Td></tr>)}</tbody>
        </Table>
      )}
    </Card>
  );
}

function Templates() {
  const toast = useToast();
  const q = useTemplates();
  const [editing, setEditing] = useState<ChecklistTemplate | 'new' | null>(null);
  const del = usePeopleMutation((id: string) => http.del(`/hr/checklist-templates/${id}`), PEOPLE_ALL);
  return (
    <Card title="Templates" actions={<Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing('new')}>New template</Button>}>
      {q.isLoading && <TableSkeleton cols={4} />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState icon={<ListTodo size={20} />} title="No templates" body="Create an onboarding template to start." />}
      {q.data && q.data.length > 0 && (
        <Table>
          <thead><tr><Th>Name</Th><Th>Kind</Th><Th right>Items</Th><Th right>Used</Th><Th /></tr></thead>
          <tbody>{q.data.map((t) => <tr key={t.id} className="hover:bg-surface-2"><Td className="font-semibold">{t.name}{t.isDefault && <Badge tone="primary" className="ml-2">Default</Badge>}</Td><Td>{titleCase(t.kind)}</Td><Td right mono>{t.items.length}</Td><Td right mono>{t._count?.instances ?? 0}</Td><Td right><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(t)} /><Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => window.confirm(`Delete ${t.name}?`) && del.mutate(t.id, { onError: (e) => toast.push('error', (e as Error).message) })} /></div></Td></tr>)}</tbody>
        </Table>
      )}
      {editing && <TemplateModal template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function TemplateModal({ template, onClose }: { template: ChecklistTemplate | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(template?.name ?? '');
  const [kind, setKind] = useState<'onboarding' | 'offboarding'>(template?.kind ?? 'onboarding');
  const [isDefault, setDefault] = useState(template?.isDefault ?? false);
  const [items, setItems] = useState<ChecklistTemplateItem[]>(template?.items ?? [{ title: '', ownerRole: 'hr', offsetDays: 0 }]);
  const save = usePeopleMutation((b: Record<string, unknown>) => (template ? http.patch(`/hr/checklist-templates/${template.id}`, b) : http.post('/hr/checklist-templates', b)), PEOPLE_ALL);
  const set = (i: number, patch: Partial<ChecklistTemplateItem>) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const valid = name.trim() && items.length > 0 && items.every((i) => i.title.trim());
  return (
    <Modal open onClose={onClose} title={template ? 'Edit template' : 'New template'} width={640} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate({ name, kind, isDefault, items }, { onSuccess: () => { toast.push('success', 'Saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Kind"><Select value={kind} onChange={(e) => setKind(e.target.value as 'onboarding' | 'offboarding')}><option value="onboarding">Onboarding</option><option value="offboarding">Offboarding</option></Select></Field>
      </div>
      <Checkbox checked={isDefault} onChange={(e) => setDefault(e.target.checked)} label="Default template for this kind" className="mt-2" />
      <div className="mt-4 space-y-2">
        <div className="grid grid-cols-[1fr_120px_90px_32px] gap-2 text-[11px] font-semibold uppercase text-ink-3"><span>Item</span><span>Owner</span><span>Offset days</span><span /></div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_90px_32px] gap-2">
            <Input value={it.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="e.g. Create email account" />
            <Select value={it.ownerRole} onChange={(e) => set(i, { ownerRole: e.target.value as ChecklistTemplateItem['ownerRole'] })}><option value="hr">HR</option><option value="manager">Manager</option><option value="it">IT</option><option value="employee">Employee</option></Select>
            <Input type="number" value={it.offsetDays} onChange={(e) => set(i, { offsetDays: Number(e.target.value) })} />
            <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => setItems((arr) => arr.filter((_, idx) => idx !== i))} />
          </div>
        ))}
        <Button size="sm" icon={<Plus size={12} />} onClick={() => setItems((arr) => [...arr, { title: '', ownerRole: 'hr', offsetDays: 0 }])}>Add item</Button>
        <p className="text-xs text-ink-3">Offset is relative to the join date (onboarding) or last day (offboarding). Negative values are due before.</p>
      </div>
    </Modal>
  );
}

function StartModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const templates = useTemplates();
  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState<'onboarding' | 'offboarding'>('onboarding');
  const [templateId, setTemplateId] = useState('');
  const [anchorDate, setAnchor] = useState('');
  const start = usePeopleMutation((b: Record<string, unknown>) => http.post('/hr/checklists', b), PEOPLE_ALL);
  return (
    <Modal open onClose={onClose} title="Start checklist" width={480} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!employeeId} loading={start.isPending} onClick={() => start.mutate({ employeeId, kind, templateId: templateId || undefined, anchorDate: anchorDate || undefined }, { onSuccess: () => { toast.push('success', 'Checklist started'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Start</Button></>}>
      <div className="space-y-3">
        <Field label="Employee" required><EmployeeSelect value={employeeId} onChange={setEmployeeId} emptyLabel="Choose…" /></Field>
        <Field label="Kind"><Select value={kind} onChange={(e) => { setKind(e.target.value as 'onboarding' | 'offboarding'); setTemplateId(''); }}><option value="onboarding">Onboarding</option><option value="offboarding">Offboarding</option></Select></Field>
        <Field label="Template"><Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}><option value="">Default for {kind}</option>{(templates.data ?? []).filter((t) => t.kind === kind).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Anchor date" hint={kind === 'onboarding' ? 'Defaults to the join date' : 'Last working day; defaults to today'}><Input type="date" value={anchorDate} onChange={(e) => setAnchor(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
