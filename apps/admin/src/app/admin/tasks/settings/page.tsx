'use client';

import { Suspense, useEffect, useState } from 'react';
import { Plus, Trash2, Archive, ArrowUp, ArrowDown, Pencil, Lock, UserPlus, X } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSpaces, useLists, useTaskMutation, type Space, type TaskList, type TaskStatus, type StatusGroup, GROUPS } from '@/lib/queries/tasks';
import { useEmployees } from '@/lib/queries/crm';
import { Button, Card, Tabs, Modal, Field, Input, Select, Checkbox, Badge, Skeleton, EmptyState, ErrorBanner, PageHeader, useToast, Avatar } from '@/components/ui';
import { fullName } from '@/lib/format';

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
      <PageHeader title="Task settings" subtitle="Spaces, members and list statuses (FR-TASK-06, 07)" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'spaces', label: 'Spaces & members' }, { value: 'statuses', label: 'List statuses' }]} className="mb-4" />
      {tab === 'spaces' ? <SpacesTab /> : <StatusesTab />}
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
      {q.data?.length === 0 && <EmptyState title="No spaces yet" body="A space groups lists for a team or project." action={canManage ? <Button variant="primary" onClick={() => setEditing('new')}>Create space</Button> : undefined} />}
      {q.data?.map((s) => (
        <Card key={s.id} title={<span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: s.colour }} />{s.name}{s.visibility === 'private' ? <Badge tone="violet"><Lock size={10} className="mr-1 inline" />private</Badge> : <Badge tone="gray">company</Badge>}{s.archivedAt && <Badge tone="gray">archived</Badge>}</span>}
          actions={canManage ? <div className="flex gap-1"><Button size="sm" icon={<Pencil size={12} />} onClick={() => setEditing(s)}>Edit</Button>{!s.archivedAt && <Button size="sm" variant="danger-outline" icon={<Archive size={12} />} onClick={() => archive.mutate(s.id, { onSuccess: () => toast.push('success', 'Space archived'), onError: (e) => toast.push('error', (e as Error).message) })}>Archive</Button>}</div> : undefined}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold text-ink-3">LISTS ({s.lists.length})</div>
              <div className="flex flex-wrap gap-1">{s.lists.map((l) => <Badge key={l.id} tone="gray">{l.name}</Badge>)}{s.lists.length === 0 && <span className="text-xs text-ink-3">None</span>}</div>
              <div className="mt-3 mb-1 text-xs font-semibold text-ink-3">DEFAULT STATUSES</div>
              <div className="flex flex-wrap gap-1">{s.defaultStatuses.map((st, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px]"><span className="h-2 w-2 rounded-full" style={{ background: st.colour }} />{st.name} <span className="text-ink-3">({st.group})</span></span>)}</div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-ink-3">MEMBERS ({s.members.length})</div>
              <div className="space-y-1">
                {s.members.map((m) => (
                  <div key={m.employeeId} className="flex items-center gap-2 text-[13px]"><Avatar name={fullName(m.employee)} size={22} /><span className="flex-1">{fullName(m.employee)}</span><Badge tone={m.role === 'admin' ? 'primary' : 'gray'}>{m.role}</Badge>{canManage && <button type="button" className="text-ink-3 hover:text-red" onClick={() => removeMember.mutate({ spaceId: s.id, employeeId: m.employeeId })} aria-label="Remove member"><X size={13} /></button>}</div>
                ))}
                {canManage && <Select value="" onChange={(e) => e.target.value && addMember.mutate({ spaceId: s.id, employeeId: e.target.value, role: 'member' }, { onError: (err) => toast.push('error', (err as Error).message) })}><option value="">Add member…</option>{(employees ?? []).filter((e) => !s.members.some((m) => m.employeeId === e.id)).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>}
              </div>
            </div>
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
  const [visibility, setVisibility] = useState<'company' | 'private'>('company');
  const [statuses, setStatuses] = useState<Array<{ name: string; colour: string; group: StatusGroup }>>([]);
  const save = useTaskMutation((b: Record<string, unknown>) => (space === 'new' ? http.post('/tasks/spaces', b) : http.patch(`/tasks/spaces/${(space as Space).id}`, b)));
  useEffect(() => {
    if (space && space !== 'new') { setName(space.name); setColour(space.colour); setVisibility(space.visibility); setStatuses(space.defaultStatuses); }
    else if (space === 'new') { setName(''); setColour('#0F6B5C'); setVisibility('company'); setStatuses([{ name: 'To do', colour: '#5C666E', group: 'open' }, { name: 'In progress', colour: '#2459C4', group: 'active' }, { name: 'Done', colour: '#1E8E5A', group: 'done' }]); }
  }, [space]);
  const submit = () => {
    if (!name.trim()) return toast.push('error', 'Name is required');
    if (!statuses.some((s) => s.group === 'open') || !statuses.some((s) => s.group === 'done')) return toast.push('error', 'Default statuses need one open and one done');
    save.mutate({ name: name.trim(), colour, visibility, defaultStatuses: statuses }, { onSuccess: () => { toast.push('success', 'Saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) });
  };
  return (
    <Modal open={Boolean(space)} onClose={onClose} title={space === 'new' ? 'New space' : 'Edit space'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Save</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_90px] gap-3"><Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Colour"><Input type="color" value={colour} onChange={(e) => setColour(e.target.value)} /></Field></div>
        <Field label="Visibility"><Select value={visibility} onChange={(e) => setVisibility(e.target.value as 'company' | 'private')}><option value="company">Company — everyone with tasks.view</option><option value="private">Private — members only</option></Select></Field>
        <Field label="Default statuses for new lists">
          <div className="space-y-1.5">
            {statuses.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_60px_28px] gap-2">
                <Input value={s.name} onChange={(e) => setStatuses((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Select value={s.group} onChange={(e) => setStatuses((arr) => arr.map((x, j) => (j === i ? { ...x, group: e.target.value as StatusGroup } : x)))}>{GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}</Select>
                <Input type="color" value={s.colour} onChange={(e) => setStatuses((arr) => arr.map((x, j) => (j === i ? { ...x, colour: e.target.value } : x)))} />
                <button type="button" className="text-ink-3 hover:text-red" onClick={() => setStatuses((arr) => arr.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={14} /></button>
              </div>
            ))}
            <Button size="sm" icon={<Plus size={12} />} onClick={() => setStatuses((arr) => [...arr, { name: '', colour: '#5C666E', group: 'open' }])}>Add status</Button>
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
  const mut = useTaskMutation((a: { path: string; method: 'post' | 'patch' | 'del'; body?: unknown }) => (a.method === 'del' ? http.del(a.path) : a.method === 'patch' ? http.patch(a.path, a.body) : http.post(a.path, a.body)));
  const run = (path: string, method: 'post' | 'patch' | 'del', body?: unknown, ok?: string) => mut.mutate({ path, method, body }, { onSuccess: () => ok && toast.push('success', ok), onError: (e) => toast.push('error', (e as Error).message) });
  const statuses: TaskStatus[] = list?.statuses ?? [];
  const move = (i: number, dir: -1 | 1) => {
    if (!list) return;
    const ids = statuses.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    run(`/tasks/lists/${list.id}/statuses/reorder`, 'post', { statusIds: ids });
  };
  return (
    <Card>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="w-52"><Select value={effectiveSpace} onChange={(e) => { setSpaceId(e.target.value); setListId(''); }}>{spaces.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
        <div className="w-52"><Select value={list?.id ?? ''} onChange={(e) => setListId(e.target.value)}>{lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></div>
        {list && canManage && <Button variant="danger-outline" size="sm" icon={<Archive size={12} />} onClick={() => run(`/tasks/lists/${list.id}`, 'del', undefined, 'List archived')}>Archive list</Button>}
      </div>
      {lists.isLoading && <Skeleton className="h-32" />}
      {lists.isError && <ErrorBanner message={(lists.error as Error).message} onRetry={() => lists.refetch()} />}
      {lists.data && !list && <EmptyState title="No lists in this space" body="Create a list from the Spaces page." />}
      {list && (
        <div className="space-y-2">
          {statuses.map((s, i) => (
            <div key={s.id} className="grid grid-cols-[28px_1fr_120px_60px_auto] items-center gap-2 rounded-lg border border-line px-2 py-1.5">
              <span className="h-3 w-3 rounded-full" style={{ background: s.colour }} />
              <Input defaultValue={s.name} disabled={!canManage} onBlur={(e) => e.target.value !== s.name && e.target.value.trim() && run(`/tasks/lists/${list.id}/statuses/${s.id}`, 'patch', { name: e.target.value.trim() }, 'Renamed')} />
              <Select value={s.group} disabled={!canManage} onChange={(e) => run(`/tasks/lists/${list.id}/statuses/${s.id}`, 'patch', { group: e.target.value }, 'Group updated')}>{GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}</Select>
              <Input type="color" defaultValue={s.colour} disabled={!canManage} onBlur={(e) => e.target.value !== s.colour && run(`/tasks/lists/${list.id}/statuses/${s.id}`, 'patch', { colour: e.target.value })} />
              {canManage && <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => move(i, -1)} aria-label="Up"><ArrowUp size={13} /></Button><Button size="sm" variant="ghost" onClick={() => move(i, 1)} aria-label="Down"><ArrowDown size={13} /></Button><Button size="sm" variant="ghost" onClick={() => run(`/tasks/lists/${list.id}/statuses/${s.id}`, 'del', undefined, 'Status deleted')} aria-label="Delete"><Trash2 size={13} className="text-red" /></Button></div>}
            </div>
          ))}
          {canManage && (
            <form className="grid grid-cols-[28px_1fr_120px_60px_auto] items-center gap-2 px-2" onSubmit={(e) => { e.preventDefault(); if (!draft.name.trim()) return; run(`/tasks/lists/${list.id}/statuses`, 'post', { name: draft.name.trim(), group: draft.group, colour: draft.colour }, 'Status added'); setDraft({ name: '', group: 'open', colour: '#5C666E' }); }}>
              <span />
              <Input placeholder="New status name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              <Select value={draft.group} onChange={(e) => setDraft((d) => ({ ...d, group: e.target.value as StatusGroup }))}>{GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}</Select>
              <Input type="color" value={draft.colour} onChange={(e) => setDraft((d) => ({ ...d, colour: e.target.value }))} />
              <Button size="sm" type="submit" icon={<Plus size={12} />}>Add</Button>
            </form>
          )}
          <p className="text-xs text-ink-3">Groups drive the coarse status: open → to do, active → in progress, done → done, closed → cancelled. A list keeps at least one open and one done status.</p>
        </div>
      )}
      {!canManage && <p className="mt-2 text-xs text-ink-3"><UserPlus size={12} className="mr-1 inline" />You need tasks.manage to edit statuses.</p>}
    </Card>
  );
}
