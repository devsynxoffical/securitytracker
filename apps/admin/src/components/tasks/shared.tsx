'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Plus, Trash2, Check, Clock, MessageSquare, ListChecks, Archive, RotateCcw, X, Flag } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEmployees, useTags } from '@/lib/queries/crm';
import {
  useTask, useComments, useTaskActivities, useTimeEntries, useList, useTaskMutation,
  type Task, type TaskStatus, type Priority, type Checklist, PRIORITIES,
} from '@/lib/queries/tasks';
import { Button, Badge, Avatar, Drawer, Modal, Field, Input, Select, Textarea, Tabs, Skeleton, ErrorBanner, EmptyState, Row, useToast, Checkbox, type Tone } from '@/components/ui';
import { fullName, dateTime, relative, toLocalInput, fromLocalInput } from '@/lib/format';

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

export function priorityTone(p: Priority | string): Tone {
  switch (p) {
    case 'urgent':
      return 'red';
    case 'high':
      return 'amber';
    case 'normal':
      return 'blue';
    case 'low':
      return 'gray';
    default:
      return 'gray';
  }
}

export function PriorityBadge({ priority }: { priority: Priority | string }) {
  if (priority === 'none') return <span className="text-xs text-ink-3">—</span>;
  return (
    <Badge tone={priorityTone(priority)}>
      <Flag size={10} className="mr-1 inline" />
      {priority}
    </Badge>
  );
}

export function StatusPill({ status, coarse }: { status: TaskStatus | null | undefined; coarse?: string }) {
  if (!status) {
    const map: Record<string, Tone> = { todo: 'gray', in_progress: 'blue', done: 'green', cancelled: 'gray' };
    return <Badge tone={map[coarse ?? 'todo'] ?? 'gray'}>{(coarse ?? 'todo').replace('_', ' ')}</Badge>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">
      <span className="h-2 w-2 rounded-full" style={{ background: status.colour }} />
      {status.name}
    </span>
  );
}

export function AssigneeStack({ assignees }: { assignees: Array<{ employee: { firstName: string; lastName: string } }> }) {
  if (!assignees.length) return <span className="text-xs text-ink-3">Unassigned</span>;
  return (
    <div className="flex -space-x-1.5">
      {assignees.slice(0, 3).map((a, i) => (
        <span key={i} title={fullName(a.employee)} className="ring-2 ring-surface rounded-full">
          <Avatar name={fullName(a.employee)} size={22} />
        </span>
      ))}
      {assignees.length > 3 && <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-gray-soft text-[10px] font-semibold text-ink-2 ring-2 ring-surface">+{assignees.length - 3}</span>}
    </div>
  );
}

export function fmtDuration(s: number | null | undefined): string {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function DueDate({ value, done }: { value: string | null; done?: boolean }) {
  if (!value) return <span className="text-xs text-ink-3">No date</span>;
  const d = new Date(value);
  const overdue = !done && d.getTime() < Date.now();
  return <span className={clsx('font-mono text-xs', overdue ? 'text-red font-semibold' : 'text-ink-2')}>{dateTime(value)}</span>;
}

export function EmployeeMultiSelect({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data } = useEmployees();
  const [pick, setPick] = useState('');
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {value.map((id) => {
          const e = data?.find((x) => x.id === id);
          return (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-pri-soft px-2 py-0.5 text-[11.5px] font-semibold text-pri-2">
              {e ? fullName(e) : id.slice(0, 8)}
              <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} aria-label="Remove"><X size={11} /></button>
            </span>
          );
        })}
      </div>
      <Select value={pick} onChange={(e) => { if (e.target.value) { onChange(Array.from(new Set([...value, e.target.value]))); setPick(''); } }}>
        <option value="">Add assignee…</option>
        {(data ?? []).filter((e) => !value.includes(e.id)).map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New task modal
// ---------------------------------------------------------------------------

export function NewTaskModal({ open, onClose, listId, parentId, defaultStatuses }: { open: boolean; onClose: () => void; listId: string; parentId?: string; defaultStatuses?: TaskStatus[] }) {
  const toast = useToast();
  const { me } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState('');
  const [startAt, setStartAt] = useState('');
  const [estimate, setEstimate] = useState('');
  const [statusId, setStatusId] = useState('');
  const create = useTaskMutation((body: Record<string, unknown>) => http.post<Task>('/tasks', body));
  useEffect(() => { if (open) { setTitle(''); setDescription(''); setPriority('normal'); setAssignees(me ? [me.id] : []); setDueAt(''); setStartAt(''); setEstimate(''); setStatusId(''); } }, [open, me]);
  const submit = () => {
    if (!title.trim()) return toast.push('error', 'Title is required');
    create.mutate(
      { listId, parentId, title: title.trim(), description: description || undefined, priority, assigneeIds: assignees.length ? assignees : undefined, dueAt: fromLocalInput(dueAt), startAt: fromLocalInput(startAt), timeEstimateSeconds: estimate ? Math.round(Number(estimate) * 3600) : undefined, statusId: statusId || undefined },
      { onSuccess: () => { toast.push('success', parentId ? 'Subtask created' : 'Task created'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) },
    );
  };
  return (
    <Modal open={open} onClose={onClose} title={parentId ? 'New subtask' : 'New task'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit}>Create</Button></>}>
      <div className="space-y-3">
        <Field label="Title" required><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" /></Field>
        <Field label="Description"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority"><Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
          {defaultStatuses && <Field label="Status"><Select value={statusId} onChange={(e) => setStatusId(e.target.value)}><option value="">First open status</option>{defaultStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>}
          <Field label="Start"><Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></Field>
          <Field label="Due"><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
          <Field label="Estimate (hours)"><Input type="number" min={0} step={0.25} value={estimate} onChange={(e) => setEstimate(e.target.value)} /></Field>
        </div>
        <Field label="Assignees"><EmployeeMultiSelect value={assignees} onChange={setAssignees} /></Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Task drawer
// ---------------------------------------------------------------------------

type Tab = 'overview' | 'subtasks' | 'checklists' | 'comments' | 'time' | 'activity';

export function TaskDrawer({ id, onClose, onOpenTask }: { id: string | null; onClose: () => void; onOpenTask?: (id: string) => void }) {
  const q = useTask(id);
  const { me, can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [subtaskModal, setSubtaskModal] = useState(false);
  const task = q.data;
  const canEdit = Boolean(task && me && (can('tasks.manage') || task.creatorId === me.id || task.assignees.some((a) => a.employeeId === me.id)));
  const canManage = can('tasks.manage');
  const statuses = useList(task?.listId ?? null);
  const mutate = useTaskMutation((args: { path: string; method: 'post' | 'patch' | 'del'; body?: unknown }) =>
    args.method === 'del' ? http.del(args.path) : args.method === 'patch' ? http.patch(args.path, args.body) : http.post(args.path, args.body),
  );
  const run = (path: string, method: 'post' | 'patch' | 'del', body?: unknown, ok?: string) =>
    mutate.mutate({ path, method, body }, { onSuccess: () => ok && toast.push('success', ok), onError: (e) => toast.push('error', (e as Error).message) });

  useEffect(() => { setTab('overview'); }, [id]);

  return (
    <Drawer open={Boolean(id)} onClose={onClose} width={760}
      title={task ? task.title : 'Task'}
      subtitle={task?.list ? <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: task.list.space.colour }} />{task.list.space.name} / {task.list.name}{task.parent && <> · subtask of <button type="button" className="text-pri underline" onClick={() => onOpenTask?.(task.parent!.id)}>{task.parent.title}</button></>}</span> : 'Legacy CRM task'}
      actions={task && canManage ? (task.archivedAt
        ? <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => run(`/tasks/${task.id}/restore`, 'post', undefined, 'Restored')}>Restore</Button>
        : <Button size="sm" variant="danger-outline" icon={<Archive size={13} />} onClick={() => run(`/tasks/${task.id}/archive`, 'post', undefined, 'Archived')}>Archive</Button>) : undefined}
    >
      {q.isLoading && <div className="space-y-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {task && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {task.statusRef && statuses.data?.statuses ? (
              <Select value={task.statusId ?? ''} disabled={!canEdit} onChange={(e) => run(`/tasks/${task.id}/status`, 'post', { statusId: e.target.value }, 'Status updated')} className="w-44">
                {statuses.data.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            ) : (
              <Select value={task.status} disabled={!canEdit} onChange={(e) => run(`/tasks/${task.id}/status`, 'post', { status: e.target.value }, 'Status updated')} className="w-44">
                {['todo', 'in_progress', 'done', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </Select>
            )}
            <Select value={task.priority} disabled={!canEdit} onChange={(e) => run(`/tasks/${task.id}`, 'patch', { priority: e.target.value }, 'Priority updated')} className="w-32">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
            {task.archivedAt && <Badge tone="gray">archived</Badge>}
            {task.completedAt && <Badge tone="green" dot>done {relative(task.completedAt)}</Badge>}
          </div>

          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'subtasks', label: 'Subtasks', count: task.subtasks?.length },
            { value: 'checklists', label: 'Checklists', count: task.checklists?.length },
            { value: 'comments', label: 'Comments', count: task._count?.comments },
            { value: 'time', label: 'Time' },
            { value: 'activity', label: 'Activity' },
          ]} />

          {tab === 'overview' && <Overview task={task} canEdit={canEdit} run={run} />}
          {tab === 'subtasks' && (
            <div className="space-y-2">
              {(task.subtasks ?? []).length === 0 && <EmptyState title="No subtasks" body="Break the task into smaller steps." action={canEdit && task.listId && !task.parentId ? <Button size="sm" icon={<Plus size={13} />} onClick={() => setSubtaskModal(true)}>Add subtask</Button> : undefined} />}
              {(task.subtasks ?? []).map((s) => (
                <button key={s.id} type="button" onClick={() => onOpenTask?.(s.id)} className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left text-[13px] hover:bg-surface-2">
                  <StatusPill status={s.statusRef} coarse={s.status} />
                  <span className={clsx('flex-1 truncate', s.status === 'done' && 'line-through text-ink-3')}>{s.title}</span>
                  <span className="text-xs text-ink-3">{s.assignee ? fullName(s.assignee) : ''}</span>
                </button>
              ))}
              {canEdit && task.listId && !task.parentId && (task.subtasks?.length ?? 0) > 0 && <Button size="sm" icon={<Plus size={13} />} onClick={() => setSubtaskModal(true)}>Add subtask</Button>}
              {task.listId && <NewTaskModal open={subtaskModal} onClose={() => setSubtaskModal(false)} listId={task.listId} parentId={task.id} />}
            </div>
          )}
          {tab === 'checklists' && <Checklists task={task} canEdit={canEdit} run={run} />}
          {tab === 'comments' && <Comments taskId={task.id} canManage={canManage} />}
          {tab === 'time' && <TimeTab task={task} canManage={canManage} />}
          {tab === 'activity' && <ActivityTab taskId={task.id} />}
        </div>
      )}
    </Drawer>
  );
}

type Run = (path: string, method: 'post' | 'patch' | 'del', body?: unknown, ok?: string) => void;

function Overview({ task, canEdit, run }: { task: Task; canEdit: boolean; run: Run }) {
  const [desc, setDesc] = useState(task.description ?? '');
  const [editing, setEditing] = useState(false);
  const [due, setDue] = useState(toLocalInput(task.dueAt));
  const [start, setStart] = useState(toLocalInput(task.startAt));
  const [estimate, setEstimate] = useState(task.timeEstimateS ? String(task.timeEstimateS / 3600) : '');
  const [addAssignee, setAddAssignee] = useState('');
  const { data: employees } = useEmployees();
  const { data: tags } = useTags();
  const [tagPick, setTagPick] = useState('');
  useEffect(() => { setDesc(task.description ?? ''); setDue(toLocalInput(task.dueAt)); setStart(toLocalInput(task.startAt)); setEstimate(task.timeEstimateS ? String(task.timeEstimateS / 3600) : ''); }, [task.id, task.description, task.dueAt, task.startAt, task.timeEstimateS]);
  const saveDates = () => run(`/tasks/${task.id}`, 'patch', { dueAt: fromLocalInput(due) ?? null, startAt: fromLocalInput(start) ?? null, timeEstimateSeconds: estimate ? Math.round(Number(estimate) * 3600) : undefined }, 'Saved');
  const taskTags = task.tags ?? [];
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_260px]">
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold text-ink-3">DESCRIPTION</span>{canEdit && !editing && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}</div>
          {editing ? (
            <div className="space-y-2">
              <Textarea rows={6} value={desc} onChange={(e) => setDesc(e.target.value)} />
              <div className="flex gap-2"><Button size="sm" variant="primary" onClick={() => { run(`/tasks/${task.id}`, 'patch', { description: desc }, 'Saved'); setEditing(false); }}>Save</Button><Button size="sm" onClick={() => { setDesc(task.description ?? ''); setEditing(false); }}>Cancel</Button></div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink">{task.description || <span className="text-ink-3">No description</span>}</div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Start"><Input type="datetime-local" value={start} disabled={!canEdit} onChange={(e) => setStart(e.target.value)} onBlur={saveDates} /></Field>
          <Field label="Due"><Input type="datetime-local" value={due} disabled={!canEdit} onChange={(e) => setDue(e.target.value)} onBlur={saveDates} /></Field>
          <Field label="Estimate (h)"><Input type="number" min={0} step={0.25} value={estimate} disabled={!canEdit} onChange={(e) => setEstimate(e.target.value)} onBlur={saveDates} /></Field>
        </div>
        <div className="rounded-lg border border-line p-3 text-[13px]">
          <div className="mb-1 flex items-center justify-between text-xs text-ink-3"><span>Time spent vs estimate</span><span className="font-mono">{fmtDuration(task.timeSpentS)} / {fmtDuration(task.timeEstimateS)}</span></div>
          <div className="h-2 overflow-hidden rounded bg-gray-soft"><div className={clsx('h-full', task.timeEstimateS && task.timeSpentS > task.timeEstimateS ? 'bg-amber-bar' : 'bg-pri')} style={{ width: `${task.timeEstimateS ? Math.min(100, (task.timeSpentS / task.timeEstimateS) * 100) : task.timeSpentS ? 100 : 0}%` }} /></div>
        </div>
      </div>
      <div className="space-y-3 text-[13px]">
        <div>
          <div className="mb-1 text-xs font-semibold text-ink-3">ASSIGNEES</div>
          <div className="space-y-1">
            {task.assignees.map((a) => (
              <div key={a.employeeId} className="flex items-center gap-2"><Avatar name={fullName(a.employee)} size={22} /><span className="flex-1 truncate">{fullName(a.employee)}</span>
                {canEdit && task.assignees.length > 1 && <button type="button" className="text-ink-3 hover:text-red" onClick={() => run(`/tasks/${task.id}/assignees/${a.employeeId}`, 'del', undefined, 'Unassigned')} aria-label="Remove"><X size={13} /></button>}
              </div>
            ))}
            {canEdit && <Select value={addAssignee} onChange={(e) => { if (e.target.value) { run(`/tasks/${task.id}/assignees`, 'post', { employeeIds: [e.target.value] }, 'Assigned'); setAddAssignee(''); } }}><option value="">Add assignee…</option>{(employees ?? []).filter((e) => !task.assignees.some((a) => a.employeeId === e.id)).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-ink-3">TAGS</div>
          <div className="flex flex-wrap gap-1">{taskTags.map((t) => <span key={t.id} className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: t.colour }}>{t.name}{canEdit && <button type="button" className="ml-1" onClick={() => run(`/tasks/${task.id}`, 'patch', { tagIds: taskTags.filter((x) => x.id !== t.id).map((x) => x.id) })} aria-label="Remove tag">×</button>}</span>)}{taskTags.length === 0 && <span className="text-xs text-ink-3">None</span>}</div>
          {canEdit && <Select className="mt-1" value={tagPick} onChange={(e) => { if (e.target.value) { run(`/tasks/${task.id}`, 'patch', { tagIds: [...taskTags.map((t) => t.id), e.target.value] }); setTagPick(''); } }}><option value="">Add tag…</option>{(tags ?? []).filter((t) => !taskTags.some((x) => x.id === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}
        </div>
        <Row label="Created">{dateTime(task.createdAt)}</Row>
        <Row label="Updated">{relative(task.updatedAt)}</Row>
        {task.lead && <Row label="Lead">{task.lead.name}</Row>}
        <Row label="Watchers">{task.watchers?.length ?? 0}</Row>
      </div>
    </div>
  );
}

function Checklists({ task, canEdit, run }: { task: Task; canEdit: boolean; run: Run }) {
  const [title, setTitle] = useState('');
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const lists: Checklist[] = task.checklists ?? [];
  return (
    <div className="space-y-3">
      {lists.length === 0 && <EmptyState icon={<ListChecks size={20} />} title="No checklists" body="Add a checklist to track steps inside this task." />}
      {lists.map((cl) => {
        const done = cl.items.filter((i) => i.done).length;
        return (
          <div key={cl.id} className="rounded-lg border border-line">
            <div className="flex items-center justify-between border-b border-line-2 px-3 py-2">
              <div className="text-[13px] font-semibold">{cl.title} <span className="ml-1 font-mono text-xs text-ink-3">{done}/{cl.items.length}</span></div>
              {canEdit && <button type="button" className="text-ink-3 hover:text-red" onClick={() => run(`/tasks/${task.id}/checklists/${cl.id}`, 'del', undefined, 'Checklist removed')} aria-label="Delete checklist"><Trash2 size={13} /></button>}
            </div>
            <div className="h-1 bg-gray-soft"><div className="h-full bg-green" style={{ width: `${cl.items.length ? (done / cl.items.length) * 100 : 0}%` }} /></div>
            <div className="divide-y divide-line-2">
              {cl.items.map((it) => (
                <div key={it.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                  <Checkbox checked={it.done} disabled={!canEdit} onChange={(e) => run(`/tasks/${task.id}/checklists/${cl.id}/items/${it.id}`, 'patch', { done: e.target.checked })} />
                  <span className={clsx('flex-1', it.done && 'line-through text-ink-3')}>{it.title}</span>
                  {canEdit && <button type="button" className="text-ink-3 hover:text-red" onClick={() => run(`/tasks/${task.id}/checklists/${cl.id}/items/${it.id}`, 'del')} aria-label="Delete item"><X size={12} /></button>}
                </div>
              ))}
            </div>
            {canEdit && (
              <form className="flex gap-2 px-3 py-2" onSubmit={(e) => { e.preventDefault(); const v = (newItem[cl.id] ?? '').trim(); if (v) { run(`/tasks/${task.id}/checklists/${cl.id}/items`, 'post', { title: v }); setNewItem((s) => ({ ...s, [cl.id]: '' })); } }}>
                <Input placeholder="Add item…" value={newItem[cl.id] ?? ''} onChange={(e) => setNewItem((s) => ({ ...s, [cl.id]: e.target.value }))} />
                <Button size="sm" type="submit" icon={<Plus size={12} />}>Add</Button>
              </form>
            )}
          </div>
        );
      })}
      {canEdit && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { run(`/tasks/${task.id}/checklists`, 'post', { title: title.trim() }, 'Checklist added'); setTitle(''); } }}>
          <Input placeholder="New checklist title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button type="submit" icon={<Plus size={13} />}>Checklist</Button>
        </form>
      )}
    </div>
  );
}

function Comments({ taskId, canManage }: { taskId: string; canManage: boolean }) {
  const q = useComments(taskId);
  const { me } = useAuth();
  const toast = useToast();
  const { data: employees } = useEmployees();
  const [body, setBody] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const add = useTaskMutation((b: { body: string; mentions: string[] }) => http.post(`/tasks/${taskId}/comments`, b));
  const del = useTaskMutation((id: string) => http.del(`/tasks/${taskId}/comments/${id}`));
  return (
    <div className="space-y-3">
      {q.isLoading && <Skeleton className="h-20" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.items.length === 0 && <EmptyState icon={<MessageSquare size={20} />} title="No comments yet" />}
      {q.data?.items.map((c) => (
        <div key={c.id} className="flex gap-2.5">
          <Avatar name={fullName(c.author)} size={26} />
          <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-ink-3"><span className="font-semibold text-ink-2">{fullName(c.author)}</span><span>{relative(c.createdAt)}{c.editedAt && ' · edited'}{(c.authorId === me?.id || canManage) && <button type="button" className="ml-2 hover:text-red" onClick={() => del.mutate(c.id, { onError: (e) => toast.push('error', (e as Error).message) })}>delete</button>}</span></div>
            <div className="mt-1 whitespace-pre-wrap text-[13px] text-ink">{c.body}</div>
          </div>
        </div>
      ))}
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (!body.trim()) return; add.mutate({ body: body.trim(), mentions }, { onSuccess: () => { setBody(''); setMentions([]); }, onError: (err) => toast.push('error', (err as Error).message) }); }}>
        <Textarea rows={3} placeholder="Write a comment…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex items-center gap-2">
          <Select value="" onChange={(e) => { if (e.target.value) setMentions((m) => Array.from(new Set([...m, e.target.value]))); }} className="w-48"><option value="">@ mention…</option>{(employees ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>
          <div className="flex flex-1 flex-wrap gap-1">{mentions.map((id) => <span key={id} className="rounded-full bg-blue-soft px-2 py-0.5 text-[11px] font-semibold text-blue">@{fullName(employees?.find((e) => e.id === id))}<button type="button" className="ml-1" onClick={() => setMentions((m) => m.filter((x) => x !== id))}>×</button></span>)}</div>
          <Button type="submit" variant="primary" size="sm" loading={add.isPending}>Comment</Button>
        </div>
      </form>
    </div>
  );
}

function TimeTab({ task, canManage }: { task: Task; canManage: boolean }) {
  const q = useTimeEntries(task.id);
  const { me } = useAuth();
  const toast = useToast();
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const add = useTaskMutation((b: { durationSeconds: number; note?: string }) => http.post(`/tasks/${task.id}/time-entries`, b));
  const del = useTaskMutation((id: string) => http.del(`/tasks/${task.id}/time-entries/${id}`));
  return (
    <div className="space-y-3">
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const h = Number(hours); if (!h || h <= 0) return toast.push('error', 'Enter hours'); add.mutate({ durationSeconds: Math.round(h * 3600), note: note || undefined }, { onSuccess: () => { setHours(''); setNote(''); toast.push('success', 'Time logged'); }, onError: (err) => toast.push('error', (err as Error).message) }); }}>
        <Field label="Hours" className="w-28"><Input type="number" min={0} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        <Field label="Note" className="flex-1"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you work on?" /></Field>
        <Button type="submit" variant="primary" icon={<Clock size={13} />} loading={add.isPending}>Log time</Button>
      </form>
      {q.isLoading && <Skeleton className="h-16" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="rounded-lg border border-line">
          <div className="flex justify-between border-b border-line-2 bg-surface-2 px-3 py-1.5 text-xs text-ink-3"><span>Entries</span><span className="font-mono">Total {fmtDuration(q.data.totalS)}</span></div>
          {q.data.items.length === 0 && <div className="px-3 py-4 text-center text-xs text-ink-3">No time logged</div>}
          {q.data.items.map((t) => (
            <div key={t.id} className="flex items-center gap-3 border-b border-line-2 px-3 py-2 text-[13px] last:border-0">
              <span className="font-mono w-16">{fmtDuration(t.durationS)}</span>
              <span className="flex-1 truncate text-ink-2">{t.note || '—'}</span>
              <span className="text-xs text-ink-3">{fullName(t.employee)} · {relative(t.createdAt)}</span>
              {(t.employeeId === me?.id || canManage) && <button type="button" className="text-ink-3 hover:text-red" onClick={() => del.mutate(t.id)} aria-label="Delete"><Trash2 size={13} /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityTab({ taskId }: { taskId: string }) {
  const q = useTaskActivities(taskId);
  const describe = (a: { type: string; data: Record<string, unknown> }): ReactNode => {
    const d = a.data as Record<string, any>;
    switch (a.type) {
      case 'created': return 'created the task';
      case 'status_changed': return <>changed status to <b>{String(d.to ?? '').replace('_', ' ')}</b></>;
      case 'assigned': return `assigned ${Array.isArray(d.employeeIds) ? d.employeeIds.length : 1} ${Array.isArray(d.employeeIds) && d.employeeIds.length > 1 ? 'people' : 'person'}`;
      case 'unassigned': return 'removed an assignee';
      case 'field_changed': return <>updated {Object.keys(d.changes ?? {}).join(', ') || 'fields'}</>;
      case 'comment': return <>commented: <i className="text-ink-2">{String(d.snippet ?? '')}</i></>;
      case 'checklist': return `checklist: ${String(d.action ?? '').replace('_', ' ')}${d.title ? ` — ${d.title}` : ''}`;
      case 'subtask_added': return <>added subtask <b>{String(d.title ?? '')}</b></>;
      case 'time_logged': return `logged ${fmtDuration(Number(d.durationS ?? 0))}`;
      case 'archived': return 'archived the task';
      case 'restored': return 'restored the task';
      case 'moved': return 'moved the task to another list';
      default: return a.type;
    }
  };
  return (
    <div className="space-y-2">
      {q.isLoading && <Skeleton className="h-24" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data?.items.length === 0 && <EmptyState title="No activity" />}
      {q.data?.items.map((a) => (
        <div key={a.id} className="flex items-start gap-2.5 text-[13px]">
          <Avatar name={fullName(a.actor)} size={22} />
          <div className="flex-1"><span className="font-semibold">{fullName(a.actor)}</span> {describe(a)}</div>
          <span className="text-xs text-ink-3">{relative(a.occurredAt)}</span>
        </div>
      ))}
    </div>
  );
}

/** Compact row used by My Tasks and list views. */
export function TaskRow({ task, onOpen, selected, onSelect, showList }: { task: Task; onOpen: () => void; selected?: boolean; onSelect?: (v: boolean) => void; showList?: boolean }) {
  const done = task.status === 'done';
  return (
    <div className={clsx('flex items-center gap-3 border-b border-line-2 px-3 py-2 text-[13px] hover:bg-surface-2', selected && 'bg-pri-soft/40')}>
      {onSelect && <Checkbox checked={Boolean(selected)} onChange={(e) => onSelect(e.target.checked)} />}
      <StatusPill status={task.statusRef} coarse={task.status} />
      <button type="button" onClick={onOpen} className={clsx('min-w-0 flex-1 truncate text-left font-medium hover:underline', done && 'line-through text-ink-3')}>{task.title}</button>
      {showList && task.list && <span className="hidden truncate text-xs text-ink-3 md:inline">{task.list.space.name} / {task.list.name}</span>}
      {(task._count?.subtasks ?? 0) > 0 && <span className="text-xs text-ink-3"><ListChecks size={12} className="mr-0.5 inline" />{task._count!.subtasks}</span>}
      {(task._count?.comments ?? 0) > 0 && <span className="text-xs text-ink-3"><MessageSquare size={12} className="mr-0.5 inline" />{task._count!.comments}</span>}
      <PriorityBadge priority={task.priority} />
      <DueDate value={task.dueAt} done={done} />
      <AssigneeStack assignees={task.assignees} />
    </div>
  );
}

export { Check };
