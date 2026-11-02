'use client';

import { Suspense, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Plus, Trash2, Archive, Pencil, Lock, UserPlus, X, GripVertical, Globe2 } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSpaces, useLists, useTaskMutation, type Space, type TaskList, type TaskStatus, type StatusGroup, GROUPS } from '@/lib/queries/tasks';
import { useEmployees } from '@/lib/queries/crm';
import { Button, Card, Tabs, Modal, Field, Input, Select, Badge, Skeleton, EmptyState, ErrorBanner, PageHeader, useToast, Avatar } from '@/components/ui';
import { Section, Toggle, Tooltip, Menu } from '@/components/ui/advanced';
import { fullName } from '@/lib/format';

const SWATCHES = ['#0F6B5C', '#2459C4', '#6B46C1', '#1E8E5A', '#B26A00', '#C2362B', '#E0921A', '#5C666E', '#8A939B', '#0E7490', '#BE185D', '#4D7C0F'];
const GROUP_LABEL: Record<StatusGroup, string> = { open: 'Open (to do)', active: 'Active (in progress)', done: 'Done', closed: 'Closed (cancelled)' };

export default function TaskSettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const [tab, setTab] = useState<'spaces' | 'statuses'>('spaces');
  return (
    <div>
      <PageHeader title="Task settings" subtitle="Spaces, members and list statuses" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'spaces', label: 'Spaces & members' }, { value: 'statuses', label: 'List statuses' }]} className="mb-4" />
      {tab === 'spaces' ? <SpacesTab /> : <StatusesTab />}
    </div>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SWATCHES.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={c} className={clsx('h-6 w-6 rounded-full border-2 transition', value.toLowerCase() === c.toLowerCase() ? 'scale-110 border-ink' : 'border-transparent hover:scale-105')} style={{ background: c }} />
      ))}
      <label className="relative ml-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-line text-2xs text-ink-3" title="Custom colour">
        +<input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

function SpacesTab() {
  const { can } = useAuth();
  const toast = useToast();
  const q = useSpaces(true);
  const [editing, setEditing] = useState<Space | 'new' | null>(null);
  const canManage = can('tasks.spaces.manage');
  const archive = useTaskMutation((id: string) => http.del(`/tasks/spaces/${id}`));
  const removeMember = useTaskMutation((a: { spaceId: string; employeeId: string }) => http.del(`/tasks/spaces/${a.spaceId}/members/${a.employeeId}`));
  const addMember = useTaskMutation((a: { spaceId: string; employeeId: string; role: string }) => http.post(`/tasks/spaces/${a.spaceId}/members`, { employeeId: a.employeeId, role: a.role }));
  const { data: employees } = useEmployees();
  return (
    <div className="space-y-3">
      {canManage && <div className="flex justify-end"><Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New space</Button></div>}
      {q.isLoading && <Skeleton className="h-40" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <Card><EmptyState title="No spaces yet" body="A space groups lists for a team or project." action={canManage ? <Button variant="primary" onClick={() => setEditing('new')}>Create space</Button> : undefined} /></Card>}
      {q.data?.map((s) => (
        <Card key={s.id} className={clsx(s.archivedAt && 'opacity-70')}
          title={<span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: s.colour }} />{s.name}{s.visibility === 'private' ? <Badge tone="violet"><Lock size={10} className="mr-1 inline" />private</Badge> : <Badge tone="gray"><Globe2 size={10} className="mr-1 inline" />company</Badge>}{s.archivedAt && <Badge tone="gray">archived</Badge>}</span>}
          actions={canManage ? <Menu items={[{ label: 'Edit space', icon: <Pencil size={13} />, onSelect: () => setEditing(s) }, { separator: true, label: '' }, { label: 'Archive space', icon: <Archive size={13} />, danger: true, disabled: Boolean(s.archivedAt), onSelect: () => archive.mutate(s.id, { onSuccess: () => toast.push('success', 'Space archived'), onError: (e) => toast.push('error', (e as Error).message) }) }]} /> : undefined}>
          <div className="grid gap-5 p-4 md:grid-cols-2">
            <div>
              <Section title={`Lists (${s.lists.length})`}>
                <div className="flex flex-wrap gap-1.5">{s.lists.map((l) => <a key={l.id} href={`/admin/tasks/spaces?listId=${l.id}`} className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-ink-2 hover:border-pri hover:text-pri">{l.name} <span className="font-mono text-ink-3">{l._count?.tasks ?? 0}</span></a>)}{s.lists.length === 0 && <span className="text-xs text-ink-3">None</span>}</div>
              </Section>
              <Section title="Default statuses for new lists">
                <div className="flex flex-wrap gap-1.5">{s.defaultStatuses.map((st, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold" style={{ borderColor: `${st.colour}55`, background: `${st.colour}18`, color: st.colour }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: st.colour }} />{st.name}<span className="font-normal opacity-70">· {st.group}</span></span>)}</div>
              </Section>
            </div>
            <Section title={`Members (${s.members.length})`}>
              <div className="space-y-1">
                {s.members.map((m) => (
                  <div key={m.employeeId} className="hover-reveal flex items-center gap-2 rounded-md px-1 py-1 text-base hover:bg-surface-2"><Avatar name={fullName(m.employee)} size={22} /><span className="flex-1 truncate">{fullName(m.employee)}</span><Badge tone={m.role === 'admin' ? 'primary' : 'gray'}>{m.role}</Badge>{canManage && <button type="button" className="row-actions text-ink-3 hover:text-red" onClick={() => removeMember.mutate({ spaceId: s.id, employeeId: m.employeeId })} aria-label="Remove member"><X size={13} /></button>}</div>
                ))}
                {s.members.length === 0 && <div className="text-xs text-ink-3">{s.visibility === 'private' ? 'No members yet — nobody can see this space.' : 'Everyone with tasks.view can see this space.'}</div>}
                {canManage && <Select className="!h-8 !text-xs" value="" onChange={(e) => e.target.value && addMember.mutate({ spaceId: s.id, employeeId: e.target.value, role: 'member' }, { onError: (err) => toast.push('error', (err as Error).message) })}><option value="">+ Add member</option>{(employees ?? []).filter((e) => !s.members.some((m) => m.employeeId === e.id)).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>}
              </div>
            </Section>
          </div>
        </Card>
      ))}
      <SpaceModal space={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function SpaceModal({ space, onClose }: { space: Space | 'new' | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [colour, setColour] = useState('#0F6B5C');
  const [isPrivate, setPrivate] = useState(false);
  const [statuses, setStatuses] = useState<Array<{ name: string; colour: string; group: StatusGroup }>>([]);
  const save = useTaskMutation((b: Record<string, unknown>) => (space === 'new' ? http.post('/tasks/spaces', b) : http.patch(`/tasks/spaces/${(space as Space).id}`, b)));
  useEffect(() => {
    if (space && space !== 'new') { setName(space.name); setColour(space.colour); setPrivate(space.visibility === 'private'); setStatuses(space.defaultStatuses); }
    else if (space === 'new') { setName(''); setColour('#0F6B5C'); setPrivate(false); setStatuses([{ name: 'To do', colour: '#5C666E', group: 'open' }, { name: 'In progress', colour: '#2459C4', group: 'active' }, { name: 'Done', colour: '#1E8E5A', group: 'done' }]); }
  }, [space]);
  const submit = () => {
    if (!name.trim()) return toast.push('error', 'Name is required');
    if (!statuses.some((s) => s.group === 'open') || !statuses.some((s) => s.group === 'done')) return toast.push('error', 'Default statuses need one open and one done');
    save.mutate({ name: name.trim(), colour, visibility: isPrivate ? 'private' : 'company', defaultStatuses: statuses }, { onSuccess: () => { toast.push('success', 'Saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) });
  };
  return (
    <Modal open={Boolean(space)} onClose={onClose} title={space === 'new' ? 'New space' : 'Edit space'} width={600} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Save</Button></>}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-md font-semibold text-white" style={{ background: colour }}>{name.trim().slice(0, 2).toUpperCase() || 'SP'}</span>
          <Field label="Name" required className="flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales, Engineering, Q4 launch…" /></Field>
        </div>
        <Field label="Colour"><Swatches value={colour} onChange={setColour} /></Field>
        <div className="rounded-lg border border-line p-3">
          <Toggle checked={isPrivate} onChange={setPrivate} label={<span><span className="font-semibold">Private space</span><span className="block text-xs text-ink-3">{isPrivate ? 'Only members can see lists and tasks.' : 'Everyone with tasks.view can see this space.'}</span></span>} />
        </div>
        <Field label="Default statuses for new lists">
          <div className="space-y-1.5">
            {statuses.map((s, i) => (
              <div key={i} className="grid grid-cols-[28px_1fr_150px_auto_28px] items-center gap-2">
                <label className="relative h-6 w-6 cursor-pointer rounded-full" style={{ background: s.colour }} title="Colour"><input type="color" value={s.colour} onChange={(e) => setStatuses((arr) => arr.map((x, j) => (j === i ? { ...x, colour: e.target.value } : x)))} className="absolute inset-0 cursor-pointer opacity-0" /></label>
                <Input className="!h-8 !text-xs" value={s.name} onChange={(e) => setStatuses((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Status name" />
                <Select className="!h-8 !text-xs" value={s.group} onChange={(e) => setStatuses((arr) => arr.map((x, j) => (j === i ? { ...x, group: e.target.value as StatusGroup } : x)))}>{GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}</Select>
                <span />
                <button type="button" className="text-ink-3 hover:text-red" onClick={() => setStatuses((arr) => arr.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={14} /></button>
              </div>
            ))}
            <Button size="sm" icon={<Plus size={12} />} onClick={() => setStatuses((arr) => [...arr, { name: '', colour: SWATCHES[arr.length % SWATCHES.length]!, group: 'open' }])}>Add status</Button>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function StatusesTab() {
  const { can } = useAuth();
  const toast = useToast();
  const spaces = useSpaces();
  const [spaceId, setSpaceId] = useState('');
  const effectiveSpace = spaceId || spaces.data?.[0]?.id || '';
  const lists = useLists(effectiveSpace || undefined);
  const [listId, setListId] = useState('');
  const list: TaskList | undefined = lists.data?.find((l) => l.id === listId) ?? lists.data?.[0];
  const canManage = can('tasks.manage');
  const [draft, setDraft] = useState({ name: '', group: 'open' as StatusGroup, colour: '#5C666E' });
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const mut = useTaskMutation((a: { path: string; method: 'post' | 'patch' | 'del'; body?: unknown }) => (a.method === 'del' ? http.del(a.path) : a.method === 'patch' ? http.patch(a.path, a.body) : http.post(a.path, a.body)));
  const run = (path: string, method: 'post' | 'patch' | 'del', body?: unknown, ok?: string) => mut.mutate({ path, method, body }, { onSuccess: () => ok && toast.push('success', ok), onError: (e) => toast.push('error', (e as Error).message) });
  const statuses: TaskStatus[] = list?.statuses ?? [];
  const dropOn = (targetId: string) => {
    if (!list || !dragging || dragging === targetId) return;
    const ids = statuses.map((s) => s.id);
    const from = ids.indexOf(dragging);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragging);
    run(`/tasks/lists/${list.id}/statuses/reorder`, 'post', { statusIds: ids }, 'Reordered');
    setDragging(null); setOver(null);
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-2 p-4">
        <div className="w-52"><Select value={effectiveSpace} onChange={(e) => { setSpaceId(e.target.value); setListId(''); }}>{spaces.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
        <div className="w-52"><Select value={list?.id ?? ''} onChange={(e) => setListId(e.target.value)}>{lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></div>
        {list && canManage && <Button variant="danger-outline" size="sm" icon={<Archive size={12} />} className="ml-auto" onClick={() => run(`/tasks/lists/${list.id}`, 'del', undefined, 'List archived')}>Archive list</Button>}
      </div>
      <div className="p-4">
        {lists.isLoading && <Skeleton className="h-32" />}
        {lists.isError && <ErrorBanner message={(lists.error as Error).message} onRetry={() => lists.refetch()} />}
        {lists.data && !list && <EmptyState title="No lists in this space" body="Create a list from the Spaces page." />}
        {list && (
          <div className="space-y-2">
            {GROUPS.map((g) => {
              const inGroup = statuses.filter((s) => s.group === g);
              if (!inGroup.length) return null;
              return (
                <Section key={g} title={GROUP_LABEL[g]}>
                  <div className="space-y-1.5">
                    {inGroup.map((s) => (
                      <div
                        key={s.id}
                        draggable={canManage}
                        onDragStart={() => setDragging(s.id)}
                        onDragEnd={() => { setDragging(null); setOver(null); }}
                        onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
                        onDrop={() => dropOn(s.id)}
                        className={clsx('grid grid-cols-[20px_28px_1fr_170px_auto] items-center gap-2 rounded-lg border bg-surface px-2 py-1.5 transition', over === s.id && dragging !== s.id ? 'border-pri bg-pri-soft/40' : 'border-line', dragging === s.id && 'opacity-50')}
                      >
                        <span className={clsx('text-ink-3', canManage ? 'cursor-grab' : 'opacity-30')} aria-hidden><GripVertical size={14} /></span>
                        <Tooltip label="Change colour"><label className="relative block h-6 w-6 cursor-pointer rounded-full ring-2 ring-surface" style={{ background: s.colour }}><input type="color" defaultValue={s.colour} disabled={!canManage} onBlur={(e) => e.target.value !== s.colour && run(`/tasks/lists/${list.id}/statuses/${s.id}`, 'patch', { colour: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" /></label></Tooltip>
                        <Input className="!h-8 !text-sm" defaultValue={s.name} disabled={!canManage} onBlur={(e) => e.target.value !== s.name && e.target.value.trim() && run(`/tasks/lists/${list.id}/statuses/${s.id}`, 'patch', { name: e.target.value.trim() }, 'Renamed')} />
                        <Select className="!h-8 !text-xs" value={s.group} disabled={!canManage} onChange={(e) => run(`/tasks/lists/${list.id}/statuses/${s.id}`, 'patch', { group: e.target.value }, 'Group updated')}>{GROUPS.map((gg) => <option key={gg} value={gg}>{GROUP_LABEL[gg]}</option>)}</Select>
                        {canManage ? <Tooltip label="Delete status"><button type="button" className="rounded p-1 text-ink-3 hover:bg-red-soft hover:text-red" onClick={() => run(`/tasks/lists/${list.id}/statuses/${s.id}`, 'del', undefined, 'Status deleted')} aria-label="Delete"><Trash2 size={13} /></button></Tooltip> : <span />}
                      </div>
                    ))}
                  </div>
                </Section>
              );
            })}
            {canManage && (
              <form className="grid grid-cols-[20px_28px_1fr_170px_auto] items-center gap-2 rounded-lg border border-dashed border-line px-2 py-1.5" onSubmit={(e) => { e.preventDefault(); if (!draft.name.trim()) return; run(`/tasks/lists/${list.id}/statuses`, 'post', { name: draft.name.trim(), group: draft.group, colour: draft.colour }, 'Status added'); setDraft({ name: '', group: 'open', colour: SWATCHES[(statuses.length + 1) % SWATCHES.length]! }); }}>
                <span />
                <label className="relative block h-6 w-6 cursor-pointer rounded-full" style={{ background: draft.colour }}><input type="color" value={draft.colour} onChange={(e) => setDraft((d) => ({ ...d, colour: e.target.value }))} className="absolute inset-0 cursor-pointer opacity-0" /></label>
                <Input className="!h-8 !text-sm" placeholder="New status name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                <Select className="!h-8 !text-xs" value={draft.group} onChange={(e) => setDraft((d) => ({ ...d, group: e.target.value as StatusGroup }))}>{GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}</Select>
                <Button size="sm" type="submit" icon={<Plus size={12} />}>Add</Button>
              </form>
            )}
            <p className="text-xs text-ink-3">Drag rows to reorder. Groups drive the coarse status: open → to do, active → in progress, done → done, closed → cancelled. A list keeps at least one open and one done status.</p>
          </div>
        )}
        {!canManage && <p className="mt-2 text-xs text-ink-3"><UserPlus size={12} className="mr-1 inline" />You need tasks.manage to edit statuses.</p>}
      </div>
    </Card>
  );
}
