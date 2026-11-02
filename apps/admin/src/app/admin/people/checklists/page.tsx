'use client';

import { confirmDialog, ConfirmHost } from '@/components/platform/confirm';

import { Suspense, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, ListTodo, CheckCircle2, UserCheck, UserX, Star } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTemplates, useChecklists, useMyItems, usePeopleMutation, PEOPLE_ALL, type ChecklistTemplate, type ChecklistTemplateItem, type Checklist } from '@/lib/queries/people';
import { Avatar, Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Select, Skeleton, useToast } from '@/components/ui';
import { DataTable, FilterChip, KpiTile, Menu, Progress, Toggle, ViewTabs, type Column } from '@/components/ui/advanced';
import { ChecklistList, EmployeeSelect, OptionList } from '@/components/people/shared';
import { dateOnly, fullName, titleCase } from '@/lib/format';

type Tab = 'active' | 'mine' | 'templates';

function ChecklistsPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Checklists /></Suspense>;
}

function Checklists() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>(can('hr.checklists.manage') ? 'active' : 'mine');
  const [starting, setStarting] = useState(false);
  const open = useChecklists({ status: 'open' });
  const mine = useMyItems();
  const overdue = useMemo(() => (open.data ?? []).reduce((s, c) => s + c.items.filter((i) => !i.done && new Date(i.dueAt).getTime() < Date.now()).length, 0), [open.data]);
  return (
    <div>
      <PageHeader title="Onboarding & offboarding" subtitle="Checklists from templates, items owned by HR, IT, manager or the employee (F26)" actions={can('hr.checklists.manage') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setStarting(true)}>Start checklist</Button>} />
      <div className="mb-4 grid grid-cols-4 gap-3">
        <KpiTile label="Open onboardings" value={open.data?.filter((c) => c.kind === 'onboarding').length ?? '—'} tone="primary" loading={open.isLoading} icon={<UserCheck size={14} />} />
        <KpiTile label="Open offboardings" value={open.data?.filter((c) => c.kind === 'offboarding').length ?? '—'} tone="amber" loading={open.isLoading} icon={<UserX size={14} />} />
        <KpiTile label="Overdue items" value={overdue} tone={overdue > 0 ? 'red' : undefined} loading={open.isLoading} />
        <KpiTile label="My open items" value={mine.data?.items.length ?? '—'} loading={mine.isLoading} icon={<ListTodo size={14} />} onClick={() => setTab('mine')} />
      </div>
      <Card>
        <ViewTabs value={tab} onChange={setTab} views={[...(can('hr.checklists.manage') ? [{ value: 'active' as Tab, label: 'Checklists', count: open.data?.length }] : []), { value: 'mine' as Tab, label: 'My items', count: mine.data?.items.length }, ...(can('hr.checklists.manage') ? [{ value: 'templates' as Tab, label: 'Templates' }] : [])]} />
        {tab === 'active' && <Active />}
        {tab === 'mine' && <MyItems />}
        {tab === 'templates' && <Templates />}
      </Card>
      {starting && <StartModal onClose={() => setStarting(false)} />}
    </div>
  );
}

function Active() {
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState<'open' | 'completed'>('open');
  const q = useChecklists({ kind: kind || undefined, status });
  const grouped = useMemo(() => {
    const list = q.data ?? [];
    return list.slice().sort((a: Checklist, b: Checklist) => {
      const od = (c: Checklist) => c.items.filter((i) => !i.done && new Date(i.dueAt).getTime() < Date.now()).length;
      return od(b) - od(a) || a.startedAt.localeCompare(b.startedAt);
    });
  }, [q.data]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-2 px-3 py-2.5">
        <FilterChip label="Kind" value={kind ? titleCase(kind) : undefined} onClear={() => setKind('')}>
          <OptionList value={kind} onChange={setKind} options={[{ value: 'onboarding', label: 'Onboarding' }, { value: 'offboarding', label: 'Offboarding' }]} />
        </FilterChip>
        <FilterChip label="Status" value={titleCase(status)} active>
          <OptionList value={status} onChange={(v) => setStatus((v || 'open') as 'open' | 'completed')} options={[{ value: 'open', label: 'Open' }, { value: 'completed', label: 'Completed' }]} emptyLabel="Open" />
        </FilterChip>
        <span className="ml-auto text-xs text-ink-3">Sorted by overdue items first</span>
      </div>
      <div className="p-4">
        {q.isLoading && <div className="grid gap-3 md:grid-cols-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && grouped.length === 0 && <EmptyState icon={<ListTodo size={20} />} title={status === 'open' ? 'No open checklists' : 'No completed checklists'} body="Start one from the button above or from an employee's profile." />}
        {grouped.length > 0 && <div className="grid gap-3 md:grid-cols-2"><ChecklistList checklists={grouped} /></div>}
      </div>
    </>
  );
}

function MyItems() {
  const toast = useToast();
  const q = useMyItems();
  const toggle = usePeopleMutation(({ checklistId, itemId }: { checklistId: string; itemId: string }) => http.patch(`/hr/checklists/${checklistId}/items/${itemId}`, { done: true }), PEOPLE_ALL);
  type Item = NonNullable<typeof q.data>['items'][number];
  const cols: Column<Item>[] = [
    { key: 'title', header: 'Item', locked: true, cell: (i) => <span className="font-semibold text-ink">{i.title}</span> },
    { key: 'employee', header: 'Employee', cell: (i) => <span className="inline-flex items-center gap-2"><Avatar name={fullName(i.employee)} size={22} />{fullName(i.employee)}</span> },
    { key: 'kind', header: 'Kind', cell: (i) => <Badge tone={i.kind === 'onboarding' ? 'primary' : 'amber'}>{titleCase(i.kind)}</Badge> },
    { key: 'role', header: 'Owner', cell: (i) => <Badge tone="gray">{i.ownerRole.toUpperCase()}</Badge> },
    { key: 'due', header: 'Due', cell: (i) => { const late = new Date(i.dueAt).getTime() < Date.now(); return <span className={late ? 'font-semibold text-red-text' : 'text-ink'}>{dateOnly(i.dueAt)}{late && <Badge tone="red" className="ml-1.5">Overdue</Badge>}</span>; } },
  ];
  return (
    <DataTable rows={q.data?.items ?? []} columns={cols} loading={q.isLoading} error={q.isError ? (q.error as Error).message : null} onRetry={() => q.refetch()} empty={<EmptyState icon={<CheckCircle2 size={20} />} title="Nothing to do" body="Items assigned to your role appear here when onboarding or offboarding starts." />}
      rowActions={(i) => <Button size="sm" variant="primary" loading={toggle.isPending} onClick={() => toggle.mutate({ checklistId: i.checklistId, itemId: i.id }, { onError: (e) => toast.push('error', (e as Error).message) })}>Done</Button>} />
  );
}

function Templates() {
  const toast = useToast();
  const q = useTemplates();
  const [editing, setEditing] = useState<ChecklistTemplate | 'new' | null>(null);
  const del = usePeopleMutation((id: string) => http.del(`/hr/checklist-templates/${id}`), PEOPLE_ALL);
  const makeDefault = usePeopleMutation((id: string) => http.patch(`/hr/checklist-templates/${id}`, { isDefault: true }), PEOPLE_ALL);
  return (
    <>
      <div className="flex items-center justify-between border-b border-line-2 px-3 py-2.5">
        <span className="text-sm text-ink-2">Item due dates are offsets from the join date (onboarding) or last day (offboarding).</span>
        <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing('new')}>New template</Button>
      </div>
      <div className="p-4">
        {q.isLoading && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div>}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && q.data.length === 0 && <EmptyState icon={<ListTodo size={20} />} title="No templates" body="Create an onboarding template to start." />}
        {q.data && q.data.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {q.data.map((t) => {
              const byRole = t.items.reduce<Record<string, number>>((acc, i) => ((acc[i.ownerRole] = (acc[i.ownerRole] ?? 0) + 1), acc), {});
              return (
                <div key={t.id} className="hover-reveal flex flex-col rounded-card border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${t.kind === 'onboarding' ? 'bg-pri-soft text-pri' : 'bg-amber-soft text-amber'}`}>{t.kind === 'onboarding' ? <UserCheck size={15} /> : <UserX size={15} />}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5"><span className="truncate text-base font-semibold text-ink">{t.name}</span>{t.isDefault && <Star size={12} className="shrink-0 fill-amber text-amber" aria-label="Default" />}</div>
                        <div className="text-2xs normal-case tracking-normal text-ink-3">{titleCase(t.kind)} · {t.items.length} items · used {t._count?.instances ?? 0}×</div>
                      </div>
                    </div>
                    <Menu items={[{ label: 'Edit', icon: <Pencil size={13} />, onSelect: () => setEditing(t) }, ...(!t.isDefault ? [{ label: 'Make default', icon: <Star size={13} />, onSelect: () => makeDefault.mutate(t.id, { onError: (e) => toast.push('error', (e as Error).message) }) }] : []), { separator: true, label: '' }, { label: 'Delete', icon: <Trash2 size={13} />, danger: true, onSelect: () => void confirmDialog({ title: `Delete ${t.name}?`, danger: true }).then((ok) => ok && del.mutate(t.id, { onError: (e) => toast.push('error', (e as Error).message) }) )}]} />
                  </div>
                  <ul className="mt-3 flex-1 space-y-1 text-sm text-ink-2">
                    {t.items.slice(0, 4).map((i, idx) => <li key={idx} className="flex items-center justify-between gap-2"><span className="truncate">{i.title}</span><span className="shrink-0 font-mono text-2xs normal-case tracking-normal text-ink-3">{i.offsetDays >= 0 ? `+${i.offsetDays}` : i.offsetDays} d</span></li>)}
                    {t.items.length > 4 && <li className="text-xs text-ink-3">+{t.items.length - 4} more</li>}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-1">{Object.entries(byRole).map(([r, n]) => <Badge key={r} tone="gray">{r.toUpperCase()} {n}</Badge>)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {editing && <TemplateModal template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
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
    <Modal open onClose={onClose} title={template ? 'Edit template' : 'New template'} width={680} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate({ name, kind, isDefault, items }, { onSuccess: () => { toast.push('success', 'Saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Kind"><Select value={kind} onChange={(e) => setKind(e.target.value as 'onboarding' | 'offboarding')}><option value="onboarding">Onboarding</option><option value="offboarding">Offboarding</option></Select></Field>
      </div>
      <div className="mt-3"><Toggle checked={isDefault} onChange={setDefault} label="Default template for this kind" /></div>
      <div className="mt-4 space-y-2">
        <div className="grid grid-cols-[1fr_130px_100px_32px] gap-2 text-2xs font-semibold uppercase text-ink-3"><span>Item</span><span>Owner</span><span>Offset days</span><span /></div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_130px_100px_32px] gap-2">
            <Input value={it.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="e.g. Create email account" />
            <Select value={it.ownerRole} onChange={(e) => set(i, { ownerRole: e.target.value as ChecklistTemplateItem['ownerRole'] })}><option value="hr">HR</option><option value="manager">Manager</option><option value="it">IT</option><option value="employee">Employee</option></Select>
            <Input type="number" value={it.offsetDays} onChange={(e) => set(i, { offsetDays: Number(e.target.value) })} />
            <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => setItems((arr) => arr.filter((_, idx) => idx !== i))} aria-label="Remove item" />
          </div>
        ))}
        <Button size="sm" icon={<Plus size={12} />} onClick={() => setItems((arr) => [...arr, { title: '', ownerRole: 'hr', offsetDays: 0 }])}>Add item</Button>
        <p className="text-xs text-ink-3">Negative offsets are due before the anchor date.</p>
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
        <Field label="Kind">
          <div className="flex gap-1.5">{(['onboarding', 'offboarding'] as const).map((k) => <button key={k} type="button" onClick={() => { setKind(k); setTemplateId(''); }} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${kind === k ? 'border-pri bg-pri-soft text-pri-2' : 'border-line bg-surface text-ink-2 hover:text-ink'}`}>{k === 'onboarding' ? <UserCheck size={13} /> : <UserX size={13} />}{titleCase(k)}</button>)}</div>
        </Field>
        <Field label="Template"><Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}><option value="">Default for {kind}</option>{(templates.data ?? []).filter((t) => t.kind === kind).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Anchor date" hint={kind === 'onboarding' ? 'Defaults to the join date' : 'Last working day; defaults to today'}><Input type="date" value={anchorDate} onChange={(e) => setAnchor(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export default function ChecklistsPageWithConfirm() {
  return (
    <>
      <ChecklistsPage />
      <ConfirmHost />
    </>
  );
}
