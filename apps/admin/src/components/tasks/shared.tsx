'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import {
  Plus, Trash2, Check, Clock, MessageSquare, ListChecks, Archive, RotateCcw, X, Flag, Paperclip, CircleCheck, Circle, GitBranch, Tag as TagIcon, UserPlus, Pencil, Eye, Activity as ActivityIcon, CalendarClock, Hourglass, ArrowRightLeft, FilePlus2,
} from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEmployees, useTags } from '@/lib/queries/crm';
import {
  useTask, useComments, useTaskActivities, useTimeEntries, useList, useTaskMutation,
  type Task, type TaskStatus, type Priority, type Checklist, PRIORITIES,
} from '@/lib/queries/tasks';
import { Button, Badge, Avatar, Drawer, Modal, Field, Input, Select, Textarea, Tabs, Skeleton, ErrorBanner, EmptyState, useToast, Checkbox, type Tone } from '@/components/ui';
import { Progress, PropertyList, Section, Tooltip, TimelineItem, Menu, type PropertyDef } from '@/components/ui/advanced';
import { fullName, dateTime, relative, toLocalInput, fromLocalInput, dateOnly } from '@/lib/format';

// ---------------------------------------------------------------------------
// Tokens and small presentational pieces
// ---------------------------------------------------------------------------

export function priorityTone(p: Priority | string): Tone {
  switch (p) {
    case 'urgent': return 'red';
    case 'high': return 'amber';
    case 'normal': return 'blue';
    default: return 'gray';
  }
}

const PRIORITY_TEXT: Record<string, string> = { urgent: 'text-red', high: 'text-amber', normal: 'text-blue', low: 'text-ink-3', none: 'text-ink-3' };
export const PRIORITY_LABEL: Record<string, string> = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low', none: 'No priority' };

/** Icon-only priority flag (ClickUp style). `none` is a hollow flag. */
export function PriorityFlag({ priority, size = 14, withLabel }: { priority: Priority | string; size?: number; withLabel?: boolean }) {
  const cls = PRIORITY_TEXT[priority] ?? 'text-ink-3';
  return (
    <Tooltip label={PRIORITY_LABEL[priority] ?? priority}>
      <span className={clsx('inline-flex items-center gap-1 text-xs font-medium', cls)}>
        <Flag size={size} strokeWidth={2} fill={priority === 'none' || priority === 'low' ? 'none' : 'currentColor'} />
        {withLabel && PRIORITY_LABEL[priority]}
      </span>
    </Tooltip>
  );
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

/** Inline priority picker rendered as a flag button with a menu. */
export function PriorityPicker({ value, onChange, disabled }: { value: Priority | string; onChange: (p: Priority) => void; disabled?: boolean }) {
  if (disabled) return <PriorityFlag priority={value} withLabel />;
  return (
    <Menu
      align="left"
      width={160}
      trigger={<span className={clsx('inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-xs font-medium hover:border-ink-3', PRIORITY_TEXT[value])}><Flag size={13} fill={value === 'none' || value === 'low' ? 'none' : 'currentColor'} />{PRIORITY_LABEL[value]}</span>}
      items={PRIORITIES.map((p) => ({ label: PRIORITY_LABEL[p]!, icon: <Flag size={13} className={PRIORITY_TEXT[p]} fill={p === 'none' || p === 'low' ? 'none' : 'currentColor'} />, onSelect: () => onChange(p) }))}
    />
  );
}

const COARSE_TONE: Record<string, Tone> = { todo: 'gray', in_progress: 'blue', done: 'green', cancelled: 'gray' };

export function StatusPill({ status, coarse, size = 'md' }: { status: TaskStatus | null | undefined; coarse?: string; size?: 'sm' | 'md' }) {
  if (!status) return <Badge tone={COARSE_TONE[coarse ?? 'todo'] ?? 'gray'}>{(coarse ?? 'todo').replace('_', ' ')}</Badge>;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2 font-semibold whitespace-nowrap', size === 'sm' ? 'py-0 text-[10.5px]' : 'py-0.5 text-xs')} style={{ borderColor: `${status.colour}55`, background: `${status.colour}18`, color: status.colour }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.colour }} />
      {status.name}
    </span>
  );
}

/** Status pill that opens a menu of the list's statuses. */
export function StatusPicker({ task, statuses, onChange, disabled }: { task: Task; statuses: TaskStatus[]; onChange: (statusId: string) => void; disabled?: boolean }) {
  if (disabled || statuses.length === 0) return <StatusPill status={task.statusRef} coarse={task.status} />;
  return (
    <Menu
      align="left"
      width={200}
      trigger={<span className="inline-flex cursor-pointer rounded-full ring-offset-1 hover:ring-2 hover:ring-line"><StatusPill status={task.statusRef} coarse={task.status} /></span>}
      items={statuses.map((s) => ({ label: s.name, icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.colour }} />, onSelect: () => onChange(s.id), shortcut: s.id === task.statusId ? '✓' : undefined }))}
    />
  );
}

export function AssigneeStack({ assignees, size = 22, max = 3 }: { assignees: Array<{ employee: { firstName: string; lastName: string } }>; size?: number; max?: number }) {
  if (assignees.length === 0) return <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-dashed border-line text-ink-3" title="Unassigned"><UserPlus size={11} /></span>;
  return (
    <div className="flex -space-x-1.5">
      {assignees.slice(0, max).map((a, i) => (
        <Tooltip key={i} label={fullName(a.employee)}>
          <span className="rounded-full ring-2 ring-surface"><Avatar name={fullName(a.employee)} size={size} /></span>
        </Tooltip>
      ))}
      {assignees.length > max && <span className="flex items-center justify-center rounded-full bg-gray-soft font-semibold text-ink-2 ring-2 ring-surface" style={{ width: size, height: size, fontSize: size * 0.42 }}>+{assignees.length - max}</span>}
    </div>
  );
}

export function fmtDuration(s: number | null | undefined): string {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function fmtHours(s: number | null | undefined): string {
  if (!s) return '0h';
  return `${Math.round((s / 3600) * 10) / 10}h`;
}

function dueState(value: string | null, done?: boolean): 'none' | 'done' | 'overdue' | 'soon' | 'later' {
  if (!value) return 'none';
  if (done) return 'done';
  const diff = new Date(value).getTime() - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 24 * 3600e3) return 'soon';
  return 'later';
}

function shortDue(value: string): string {
  const d = new Date(value);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const dayDiff = Math.round((new Date(d.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86400e3);
  if (dayDiff === 0) return `Today ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  if (dayDiff === 1) return 'Tomorrow';
  if (dayDiff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Due chip: red when overdue, amber inside 24 h, muted otherwise. */
export function DueChip({ value, done, compact }: { value: string | null; done?: boolean; compact?: boolean }) {
  const state = dueState(value, done);
  if (state === 'none') return compact ? <span className="text-xs text-ink-3">—</span> : <span className="inline-flex items-center gap-1 text-xs text-ink-3"><CalendarClock size={12} /> No date</span>;
  const cls = { done: 'bg-green-soft text-green-text line-through', overdue: 'bg-red-soft text-red-text', soon: 'bg-amber-soft text-amber-text', later: 'bg-surface-2 text-ink-2' }[state];
  return (
    <Tooltip label={dateTime(value)}>
      <span className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-medium whitespace-nowrap', cls)}>
        <CalendarClock size={11} />
        {shortDue(value!)}
      </span>
    </Tooltip>
  );
}

/** Back-compat alias used by other modules. */
export function DueDate({ value, done }: { value: string | null; done?: boolean }) {
  return <DueChip value={value} done={done} compact />;
}

export function SubtaskProgress({ task }: { task: Task }) {
  const total = task.subtasks?.length ?? task._count?.subtasks ?? 0;
  if (!total) return null;
  const done = task.subtasks ? task.subtasks.filter((s) => s.status === 'done').length : null;
  return (
    <Tooltip label={done === null ? `${total} subtasks` : `${done} of ${total} subtasks done`}>
      <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink-2">
        <GitBranch size={11} className="text-ink-3" />
        {done === null ? total : `${done}/${total}`}
      </span>
    </Tooltip>
  );
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
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-pri-soft pl-0.5 pr-2 py-0.5 text-xs font-semibold text-pri-2">
              <Avatar name={e ? fullName(e) : '?'} size={16} />
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
// Quick add + new task modal
// ---------------------------------------------------------------------------

/** One-line "+ New task" row used at the bottom of status groups and board columns. */
export function QuickAdd({ listId, statusId, placeholder = 'New task…', className }: { listId: string; statusId?: string; placeholder?: string; className?: string }) {
  const toast = useToast();
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const create = useTaskMutation((body: Record<string, unknown>) => http.post<Task>('/tasks', body));
  const submit = () => {
    const t = title.trim();
    if (!t) return setOpen(false);
    create.mutate({ listId, statusId, title: t, assigneeIds: me ? [me.id] : undefined }, {
      onSuccess: () => setTitle(''),
      onError: (e) => toast.push('error', (e as Error).message),
    });
  };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-3 hover:bg-surface-2 hover:text-pri', className)}>
        <Plus size={13} /> New task
      </button>
    );
  }
  return (
    <form className={clsx('flex items-center gap-2 px-3 py-1.5', className)} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <Circle size={14} className="shrink-0 text-ink-3" />
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => !title.trim() && setOpen(false)} onKeyDown={(e) => e.key === 'Escape' && (setTitle(''), setOpen(false))} placeholder={placeholder} className="h-7 flex-1 rounded-md border border-pri bg-surface px-2 text-base text-ink focus:outline-none" />
      <Button size="sm" type="submit" variant="primary" loading={create.isPending}>Add</Button>
    </form>
  );
}

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
    <Modal open={open} onClose={onClose} title={parentId ? 'New subtask' : 'New task'} width={620} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit}>Create</Button></>}>
      <div className="space-y-3">
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task name" className="w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-xl font-semibold text-ink placeholder:text-ink-3 focus:border-pri focus:outline-none" onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add a description… (markdown: **bold**, - bullets)" />
        <div className="flex flex-wrap items-center gap-2">
          <PriorityPicker value={priority} onChange={setPriority} />
          {defaultStatuses && (
            <Select value={statusId} onChange={(e) => setStatusId(e.target.value)} className="!h-7 !w-44 !text-xs">
              <option value="">First open status</option>
              {defaultStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
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
// Markdown-ish rendering (bold, italics, bullets, numbered, code, links)
// ---------------------------------------------------------------------------

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k++} className="rounded bg-surface-3 px-1 font-mono text-[12px]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('_')) out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    else out.push(<a key={k++} href={tok} target="_blank" rel="noreferrer" className="text-pri underline">{tok}</a>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdownish({ text, className }: { text: string; className?: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.type;
    blocks.push(<Tag key={blocks.length} className={clsx('mb-2 pl-5', list.type === 'ul' ? 'list-disc' : 'list-decimal')}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</Tag>);
    list = null;
  };
  for (const line of lines) {
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const todo = /^\s*[-*]\s+\[( |x)\]\s+(.*)$/i.exec(line);
    if (todo) {
      if (!list || list.type !== 'ul') { flush(); list = { type: 'ul', items: [] }; }
      list.items.push(`${todo[1]!.toLowerCase() === 'x' ? '☑ ' : '☐ '}${todo[2]}`);
    } else if (ul) {
      if (!list || list.type !== 'ul') { flush(); list = { type: 'ul', items: [] }; }
      list.items.push(ul[1]!);
    } else if (ol) {
      if (!list || list.type !== 'ol') { flush(); list = { type: 'ol', items: [] }; }
      list.items.push(ol[1]!);
    } else {
      flush();
      if (/^#{1,3}\s/.test(line)) blocks.push(<div key={blocks.length} className="mb-1 mt-2 text-md font-semibold text-ink">{inline(line.replace(/^#{1,3}\s/, ''))}</div>);
      else if (line.trim() === '') blocks.push(<div key={blocks.length} className="h-2" />);
      else blocks.push(<p key={blocks.length} className="mb-1">{inline(line)}</p>);
    }
  }
  flush();
  return <div className={clsx('text-base leading-relaxed text-ink', className)}>{blocks}</div>;
}

// ---------------------------------------------------------------------------
// Task drawer
// ---------------------------------------------------------------------------

type Tab = 'comments' | 'activity' | 'time';
type Run = (path: string, method: 'post' | 'patch' | 'del', body?: unknown, ok?: string) => void;

export function TaskDrawer({ id, onClose, onOpenTask }: { id: string | null; onClose: () => void; onOpenTask?: (id: string) => void }) {
  const q = useTask(id);
  const { me, can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('comments');
  const [subtaskModal, setSubtaskModal] = useState(false);
  const [titleEdit, setTitleEdit] = useState<string | null>(null);
  const task = q.data;
  const canEdit = Boolean(task && me && (can('tasks.manage') || task.creatorId === me.id || task.assignees.some((a) => a.employeeId === me.id)));
  const canManage = can('tasks.manage');
  const listQ = useList(task?.listId ?? null);
  const statuses: TaskStatus[] = listQ.data?.statuses ?? [];
  const mutate = useTaskMutation((args: { path: string; method: 'post' | 'patch' | 'del'; body?: unknown }) =>
    args.method === 'del' ? http.del(args.path) : args.method === 'patch' ? http.patch(args.path, args.body) : http.post(args.path, args.body),
  );
  const run: Run = (path, method, body, ok) => mutate.mutate({ path, method, body }, { onSuccess: () => ok && toast.push('success', ok), onError: (e) => toast.push('error', (e as Error).message) });

  useEffect(() => { setTab('comments'); setTitleEdit(null); }, [id]);

  const header = task ? (
    <div className="flex min-w-0 items-center gap-2">
      {titleEdit === null ? (
        <button type="button" disabled={!canEdit} onClick={() => setTitleEdit(task.title)} className={clsx('group/title inline-flex min-w-0 items-center gap-2 text-left', canEdit && 'hover:text-pri')} title={canEdit ? 'Click to rename' : undefined}>
          <span className={clsx('truncate', task.status === 'done' && 'text-ink-3 line-through')}>{task.title}</span>
          {canEdit && <Pencil size={13} className="shrink-0 text-ink-3 opacity-0 group-hover/title:opacity-100" />}
        </button>
      ) : (
        <input
          autoFocus
          value={titleEdit}
          onChange={(e) => setTitleEdit(e.target.value)}
          onBlur={() => { if (titleEdit.trim() && titleEdit.trim() !== task.title) run(`/tasks/${task.id}`, 'patch', { title: titleEdit.trim() }, 'Renamed'); setTitleEdit(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setTitleEdit(null); }}
          className="w-full rounded-md border border-pri bg-surface px-2 py-0.5 text-xl font-semibold text-ink focus:outline-none"
        />
      )}
    </div>
  ) : 'Task';

  const crumbs = task?.list ? (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: task.list.space.colour }} />
      <span>{task.list.space.name}</span><span className="text-ink-3">/</span><span>{task.list.name}</span>
      {task.parent && <><span className="text-ink-3">/</span><button type="button" className="text-pri hover:underline" onClick={() => onOpenTask?.(task.parent!.id)}>{task.parent.title}</button></>}
      <span className="ml-2 font-mono text-2xs normal-case tracking-normal text-ink-3">#{task.id.slice(0, 8)}</span>
    </span>
  ) : 'Legacy CRM task';

  return (
    <Drawer open={Boolean(id)} onClose={onClose} width={880} title={header} subtitle={crumbs}
      actions={task ? (
        <div className="flex items-center gap-1">
          <Tooltip label={`${task.watchers?.length ?? 0} watching`}><span className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-3"><Eye size={13} />{task.watchers?.length ?? 0}</span></Tooltip>
          {canManage && (task.archivedAt
            ? <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => run(`/tasks/${task.id}/restore`, 'post', undefined, 'Restored')}>Restore</Button>
            : <Menu items={[{ label: 'Archive task', icon: <Archive size={13} />, danger: true, onSelect: () => run(`/tasks/${task.id}/archive`, 'post', undefined, 'Archived') }]} />)}
        </div>
      ) : undefined}
    >
      {q.isLoading && <div className="space-y-3 p-5"><Skeleton className="h-7 w-1/2" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>}
      {q.isError && <div className="p-4"><ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} /></div>}
      {task && (
        <div className="flex h-full flex-col">
          {/* status / priority bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/60 px-5 py-2.5">
            {statuses.length > 0 ? (
              <StatusPicker task={task} statuses={statuses} disabled={!canEdit} onChange={(statusId) => run(`/tasks/${task.id}/status`, 'post', { statusId }, 'Status updated')} />
            ) : (
              <Select value={task.status} disabled={!canEdit} onChange={(e) => run(`/tasks/${task.id}/status`, 'post', { status: e.target.value }, 'Status updated')} className="!h-7 !w-40 !text-xs">
                {['todo', 'in_progress', 'done', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </Select>
            )}
            <PriorityPicker value={task.priority} disabled={!canEdit} onChange={(p) => run(`/tasks/${task.id}`, 'patch', { priority: p }, 'Priority updated')} />
            <DueChip value={task.dueAt} done={task.status === 'done'} />
            {task.archivedAt && <Badge tone="gray">archived</Badge>}
            {task.completedAt && <Badge tone="green" dot>done {relative(task.completedAt)}</Badge>}
            {canEdit && task.listId && !task.parentId && <Button size="sm" variant="ghost" icon={<Plus size={13} />} className="ml-auto" onClick={() => setSubtaskModal(true)}>Subtask</Button>}
          </div>

          <div className="grid flex-1 grid-cols-[1fr_300px]">
            <div className="min-w-0 space-y-5 p-5">
              <Description task={task} canEdit={canEdit} run={run} />
              <Subtasks task={task} canEdit={canEdit} onOpenTask={onOpenTask} onAdd={() => setSubtaskModal(true)} />
              <Checklists task={task} canEdit={canEdit} run={run} />
              <Section title={<span className="inline-flex items-center gap-1"><Paperclip size={12} /> Attachments</span>} collapsible defaultOpen={false}>
                <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">
                  <FilePlus2 size={16} className="mx-auto mb-1" />
                  File uploads use object storage (02 D9). Attachments appear here once storage is configured.
                </div>
              </Section>
              <div className="border-t border-line pt-3">
                <Tabs value={tab} onChange={setTab} tabs={[
                  { value: 'comments', label: <span className="inline-flex items-center gap-1"><MessageSquare size={13} /> Comments</span>, count: task._count?.comments },
                  { value: 'activity', label: <span className="inline-flex items-center gap-1"><ActivityIcon size={13} /> Activity</span> },
                  { value: 'time', label: <span className="inline-flex items-center gap-1"><Hourglass size={13} /> Time</span> },
                ]} className="mb-3" />
                {tab === 'comments' && <Comments taskId={task.id} canManage={canManage} />}
                {tab === 'activity' && <ActivityTab taskId={task.id} />}
                {tab === 'time' && <TimeTab task={task} canManage={canManage} />}
              </div>
            </div>
            <aside className="border-l border-line bg-surface-2/40 p-4">
              <Properties task={task} canEdit={canEdit} run={run} />
            </aside>
          </div>
          {task.listId && <NewTaskModal open={subtaskModal} onClose={() => setSubtaskModal(false)} listId={task.listId} parentId={task.id} />}
        </div>
      )}
    </Drawer>
  );
}

function Description({ task, canEdit, run }: { task: Task; canEdit: boolean; run: Run }) {
  const [desc, setDesc] = useState(task.description ?? '');
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => { setDesc(task.description ?? ''); setEditing(false); }, [task.id, task.description]);
  return (
    <Section title="Description" actions={canEdit && !editing ? <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(true)}>Edit</Button> : undefined}>
      {editing ? (
        <div className="rounded-lg border border-pri bg-surface">
          <div className="flex items-center gap-1 border-b border-line-2 px-2 py-1 text-xs">
            <button type="button" onClick={() => setPreview(false)} className={clsx('rounded px-2 py-0.5 font-semibold', !preview ? 'bg-pri-soft text-pri-2' : 'text-ink-2')}>Write</button>
            <button type="button" onClick={() => setPreview(true)} className={clsx('rounded px-2 py-0.5 font-semibold', preview ? 'bg-pri-soft text-pri-2' : 'text-ink-2')}>Preview</button>
            <span className="ml-auto text-ink-3">**bold** · _italic_ · - bullet · - [ ] todo · `code`</span>
          </div>
          {preview ? <div className="min-h-[120px] px-3 py-2"><Markdownish text={desc || '_Nothing to preview_'} /></div> : <textarea rows={7} value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full resize-y bg-transparent px-3 py-2 text-base text-ink focus:outline-none" autoFocus />}
          <div className="flex justify-end gap-2 border-t border-line-2 px-2 py-1.5">
            <Button size="sm" onClick={() => { setDesc(task.description ?? ''); setEditing(false); }}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={() => { run(`/tasks/${task.id}`, 'patch', { description: desc }, 'Saved'); setEditing(false); }}>Save</Button>
          </div>
        </div>
      ) : task.description ? (
        <div className={clsx('rounded-lg px-1', canEdit && 'cursor-text hover:bg-surface-2')} onClick={() => canEdit && setEditing(true)}><Markdownish text={task.description} /></div>
      ) : (
        <button type="button" disabled={!canEdit} onClick={() => setEditing(true)} className="w-full rounded-lg border border-dashed border-line px-3 py-3 text-left text-sm text-ink-3 hover:border-pri hover:text-ink-2">Add a description…</button>
      )}
    </Section>
  );
}

function Subtasks({ task, canEdit, onOpenTask, onAdd }: { task: Task; canEdit: boolean; onOpenTask?: (id: string) => void; onAdd: () => void }) {
  const subs = task.subtasks ?? [];
  if (subs.length === 0 && (task.parentId || !task.listId)) return null;
  const done = subs.filter((s) => s.status === 'done').length;
  return (
    <Section title={<span className="inline-flex items-center gap-2">Subtasks {subs.length > 0 && <span className="font-mono text-ink-2">{done}/{subs.length}</span>}</span>} actions={canEdit && !task.parentId && task.listId ? <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={onAdd}>Add</Button> : undefined}>
      {subs.length > 0 && <Progress value={done} max={subs.length} tone="green" size={4} />}
      <div className="mt-2 divide-y divide-line-2 rounded-lg border border-line">
        {subs.length === 0 && <div className="px-3 py-3 text-xs text-ink-3">Break the task into smaller steps.</div>}
        {subs.map((s) => (
          <button key={s.id} type="button" onClick={() => onOpenTask?.(s.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-base hover:bg-surface-2">
            {s.status === 'done' ? <CircleCheck size={15} className="shrink-0 text-green" /> : <Circle size={15} className="shrink-0 text-ink-3" />}
            <span className={clsx('min-w-0 flex-1 truncate', s.status === 'done' && 'text-ink-3 line-through')}>{s.title}</span>
            <StatusPill status={s.statusRef} coarse={s.status} size="sm" />
            <PriorityFlag priority={s.priority} size={12} />
            {s.assignee && <Avatar name={fullName(s.assignee)} size={18} />}
          </button>
        ))}
      </div>
    </Section>
  );
}

function Properties({ task, canEdit, run }: { task: Task; canEdit: boolean; run: Run }) {
  const { data: employees } = useEmployees();
  const { data: tags } = useTags();
  const [addAssignee, setAddAssignee] = useState('');
  const [tagPick, setTagPick] = useState('');
  const taskTags = task.tags ?? [];
  const over = Boolean(task.timeEstimateS && task.timeSpentS > task.timeEstimateS);
  const props: PropertyDef[] = [
    { key: 'startAt', label: 'Start date', value: task.startAt ? dateTime(task.startAt) : null, raw: toLocalInput(task.startAt), type: 'text', editable: canEdit, mono: true },
    { key: 'dueAt', label: 'Due date', value: task.dueAt ? <DueChip value={task.dueAt} done={task.status === 'done'} /> : null, raw: toLocalInput(task.dueAt), type: 'text', editable: canEdit },
    { key: 'timeEstimateSeconds', label: 'Estimate (hours)', value: task.timeEstimateS ? fmtDuration(task.timeEstimateS) : null, raw: task.timeEstimateS ? String(task.timeEstimateS / 3600) : '', type: 'number', editable: canEdit, mono: true },
  ];
  const save = (key: string, value: string) => {
    if (key === 'timeEstimateSeconds') return run(`/tasks/${task.id}`, 'patch', { timeEstimateSeconds: value ? Math.round(Number(value) * 3600) : null }, 'Saved');
    return run(`/tasks/${task.id}`, 'patch', { [key]: value ? fromLocalInput(value) ?? new Date(value).toISOString() : null }, 'Saved');
  };
  return (
    <div className="space-y-4 text-base">
      <div>
        <div className="mb-1.5 text-2xs font-semibold uppercase text-ink-3">Assignees</div>
        <div className="space-y-1">
          {task.assignees.map((a) => (
            <div key={a.employeeId} className="hover-reveal flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-surface-2">
              <Avatar name={fullName(a.employee)} size={22} /><span className="flex-1 truncate">{fullName(a.employee)}</span>
              {canEdit && task.assignees.length > 1 && <button type="button" className="row-actions text-ink-3 hover:text-red" onClick={() => run(`/tasks/${task.id}/assignees/${a.employeeId}`, 'del', undefined, 'Unassigned')} aria-label="Remove"><X size={13} /></button>}
            </div>
          ))}
          {task.assignees.length === 0 && <div className="text-xs text-ink-3">Unassigned</div>}
          {canEdit && <Select value={addAssignee} className="!h-8 !text-xs" onChange={(e) => { if (e.target.value) { run(`/tasks/${task.id}/assignees`, 'post', { employeeIds: [e.target.value] }, 'Assigned'); setAddAssignee(''); } }}><option value="">+ Add assignee</option>{(employees ?? []).filter((e) => !task.assignees.some((a) => a.employeeId === e.id)).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>}
        </div>
      </div>

      <PropertyList properties={props} onSave={canEdit ? save : undefined} />

      <div>
        <div className="mb-1 flex items-center justify-between text-2xs font-semibold uppercase text-ink-3"><span>Time tracked</span><span className={clsx('font-mono normal-case tracking-normal', over ? 'text-amber-text' : 'text-ink-2')}>{fmtDuration(task.timeSpentS)} / {fmtDuration(task.timeEstimateS)}</span></div>
        <Progress value={task.timeSpentS} max={task.timeEstimateS || Math.max(task.timeSpentS, 1)} tone={over ? 'amber' : 'primary'} size={6} />
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-1 text-2xs font-semibold uppercase text-ink-3"><TagIcon size={11} /> Tags</div>
        <div className="flex flex-wrap gap-1">
          {taskTags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${t.colour}22`, color: t.colour }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.colour }} />{t.name}
              {canEdit && <button type="button" onClick={() => run(`/tasks/${task.id}`, 'patch', { tagIds: taskTags.filter((x) => x.id !== t.id).map((x) => x.id) })} aria-label="Remove tag"><X size={10} /></button>}
            </span>
          ))}
          {taskTags.length === 0 && <span className="text-xs text-ink-3">None</span>}
        </div>
        {canEdit && <Select className="mt-1.5 !h-8 !text-xs" value={tagPick} onChange={(e) => { if (e.target.value) { run(`/tasks/${task.id}`, 'patch', { tagIds: [...taskTags.map((t) => t.id), e.target.value] }); setTagPick(''); } }}><option value="">+ Add tag</option>{(tags ?? []).filter((t) => !taskTags.some((x) => x.id === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}
      </div>

      {(task.lead || task.leadId || task.contactId || task.accountId || task.dealId) && (
        <div>
          <div className="mb-1.5 text-2xs font-semibold uppercase text-ink-3">Linked records</div>
          <div className="space-y-1 text-sm">
            {task.lead && <a href={`/admin/crm/leads?id=${task.lead.id}`} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 hover:bg-surface-2"><ArrowRightLeft size={12} className="text-ink-3" /><span className="truncate">Lead · {task.lead.name}</span></a>}
            {task.contactId && <a href={`/admin/crm/contacts?id=${task.contactId}`} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 hover:bg-surface-2"><ArrowRightLeft size={12} className="text-ink-3" />Contact</a>}
            {task.accountId && <a href={`/admin/crm/accounts?id=${task.accountId}`} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 hover:bg-surface-2"><ArrowRightLeft size={12} className="text-ink-3" />Account</a>}
            {task.dealId && <a href={`/admin/crm/deals?id=${task.dealId}`} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 hover:bg-surface-2"><ArrowRightLeft size={12} className="text-ink-3" />Deal</a>}
          </div>
        </div>
      )}

      <dl className="space-y-1 border-t border-line-2 pt-3 text-xs text-ink-3">
        <div className="flex justify-between"><dt>Created</dt><dd className="font-mono text-ink-2">{dateOnly(task.createdAt)}</dd></div>
        <div className="flex justify-between"><dt>Updated</dt><dd className="text-ink-2">{relative(task.updatedAt)}</dd></div>
        {task.completedAt && <div className="flex justify-between"><dt>Completed</dt><dd className="font-mono text-ink-2">{dateOnly(task.completedAt)}</dd></div>}
      </dl>
    </div>
  );
}

function Checklists({ task, canEdit, run }: { task: Task; canEdit: boolean; run: Run }) {
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const lists: Checklist[] = task.checklists ?? [];
  return (
    <Section title={<span className="inline-flex items-center gap-1"><ListChecks size={12} /> Checklists</span>} actions={canEdit ? <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => setAdding(true)}>Add</Button> : undefined}>
      {lists.length === 0 && !adding && <div className="text-xs text-ink-3">Track steps inside this task with a checklist.</div>}
      <div className="space-y-3">
        {lists.map((cl) => {
          const done = cl.items.filter((i) => i.done).length;
          return (
            <div key={cl.id} className="rounded-lg border border-line">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-base font-semibold"><span className="truncate">{cl.title}</span><span className="font-mono text-xs text-ink-3">{done}/{cl.items.length}</span></div>
                  <Progress value={done} max={cl.items.length || 1} tone="green" size={4} />
                </div>
                {canEdit && <button type="button" className="text-ink-3 hover:text-red" onClick={() => run(`/tasks/${task.id}/checklists/${cl.id}`, 'del', undefined, 'Checklist removed')} aria-label="Delete checklist"><Trash2 size={13} /></button>}
              </div>
              <div className="divide-y divide-line-2 border-t border-line-2">
                {cl.items.map((it) => (
                  <label key={it.id} className="hover-reveal flex items-center gap-2 px-3 py-1.5 text-base hover:bg-surface-2">
                    <input type="checkbox" className="h-4 w-4 accent-pri" checked={it.done} disabled={!canEdit} onChange={(e) => run(`/tasks/${task.id}/checklists/${cl.id}/items/${it.id}`, 'patch', { done: e.target.checked })} />
                    <span className={clsx('flex-1', it.done && 'text-ink-3 line-through')}>{it.title}</span>
                    {canEdit && <button type="button" className="row-actions text-ink-3 hover:text-red" onClick={() => run(`/tasks/${task.id}/checklists/${cl.id}/items/${it.id}`, 'del')} aria-label="Delete item"><X size={12} /></button>}
                  </label>
                ))}
              </div>
              {canEdit && (
                <form className="flex gap-2 border-t border-line-2 px-3 py-1.5" onSubmit={(e) => { e.preventDefault(); const v = (newItem[cl.id] ?? '').trim(); if (v) { run(`/tasks/${task.id}/checklists/${cl.id}/items`, 'post', { title: v }); setNewItem((s) => ({ ...s, [cl.id]: '' })); } }}>
                  <input placeholder="+ Add item" value={newItem[cl.id] ?? ''} onChange={(e) => setNewItem((s) => ({ ...s, [cl.id]: e.target.value }))} className="h-7 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none" />
                </form>
              )}
            </div>
          );
        })}
        {adding && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { run(`/tasks/${task.id}/checklists`, 'post', { title: title.trim() }, 'Checklist added'); setTitle(''); setAdding(false); } }}>
            <Input autoFocus placeholder="Checklist title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
            <Button type="submit" size="sm" variant="primary">Create</Button>
            <Button type="button" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
          </form>
        )}
      </div>
    </Section>
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
      {q.data && q.data.items.length === 0 && <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">No comments yet. Start the conversation.</div>}
      {q.data?.items.map((c) => (
        <div key={c.id} className="hover-reveal flex gap-2.5">
          <Avatar name={fullName(c.author)} size={26} />
          <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 shadow-card">
            <div className="flex items-center justify-between text-xs text-ink-3">
              <span className="font-semibold text-ink-2">{fullName(c.author)}</span>
              <span className="inline-flex items-center gap-2">{relative(c.createdAt)}{c.editedAt && ' · edited'}{(c.authorId === me?.id || canManage) && <button type="button" className="row-actions hover:text-red" onClick={() => del.mutate(c.id, { onError: (e) => toast.push('error', (e as Error).message) })}>Delete</button>}</span>
            </div>
            <div className="mt-1"><Markdownish text={c.body} /></div>
          </div>
        </div>
      ))}
      <form className="rounded-lg border border-line bg-surface" onSubmit={(e) => { e.preventDefault(); if (!body.trim()) return; add.mutate({ body: body.trim(), mentions }, { onSuccess: () => { setBody(''); setMentions([]); }, onError: (err) => toast.push('error', (err as Error).message) }); }}>
        <textarea rows={3} placeholder="Write a comment… use **bold**, - bullets" value={body} onChange={(e) => setBody(e.target.value)} className="w-full resize-y bg-transparent px-3 py-2 text-base text-ink placeholder:text-ink-3 focus:outline-none" />
        <div className="flex items-center gap-2 border-t border-line-2 px-2 py-1.5">
          <Select value="" className="!h-7 !w-40 !text-xs" onChange={(e) => { if (e.target.value) setMentions((m) => Array.from(new Set([...m, e.target.value]))); }}><option value="">@ mention…</option>{(employees ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>
          <div className="flex flex-1 flex-wrap gap-1">{mentions.map((id) => <span key={id} className="rounded-full bg-blue-soft px-2 py-0.5 text-xs font-semibold text-blue-text">@{fullName(employees?.find((e) => e.id === id))}<button type="button" className="ml-1" onClick={() => setMentions((m) => m.filter((x) => x !== id))}>×</button></span>)}</div>
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
      <form className="flex items-end gap-2 rounded-lg border border-line bg-surface-2/60 p-3" onSubmit={(e) => { e.preventDefault(); const h = Number(hours); if (!h || h <= 0) return toast.push('error', 'Enter hours'); add.mutate({ durationSeconds: Math.round(h * 3600), note: note || undefined }, { onSuccess: () => { setHours(''); setNote(''); toast.push('success', 'Time logged'); }, onError: (err) => toast.push('error', (err as Error).message) }); }}>
        <Field label="Hours" className="w-28"><Input type="number" min={0} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="1.5" /></Field>
        <Field label="Note" className="flex-1"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you work on?" /></Field>
        <Button type="submit" variant="primary" icon={<Clock size={13} />} loading={add.isPending}>Log time</Button>
      </form>
      {q.isLoading && <Skeleton className="h-16" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="rounded-lg border border-line">
          <div className="flex justify-between border-b border-line-2 bg-surface-2 px-3 py-1.5 text-xs text-ink-3"><span>{q.data.items.length} entries</span><span className="font-mono">Total {fmtDuration(q.data.totalS)}</span></div>
          {q.data.items.length === 0 && <div className="px-3 py-4 text-center text-xs text-ink-3">No time logged</div>}
          {q.data.items.map((t) => (
            <div key={t.id} className="hover-reveal flex items-center gap-3 border-b border-line-2 px-3 py-2 text-base last:border-0 hover:bg-surface-2">
              <span className="w-16 font-mono font-semibold">{fmtDuration(t.durationS)}</span>
              <span className="flex-1 truncate text-ink-2">{t.note || '—'}</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-3"><Avatar name={fullName(t.employee)} size={16} />{fullName(t.employee)} · {relative(t.createdAt)}</span>
              {(t.employeeId === me?.id || canManage) && <button type="button" className="row-actions text-ink-3 hover:text-red" onClick={() => del.mutate(t.id)} aria-label="Delete"><Trash2 size={13} /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityTab({ taskId }: { taskId: string }) {
  const q = useTaskActivities(taskId);
  const describe = (a: { type: string; data: Record<string, unknown> }): { text: ReactNode; icon: ReactNode; tone: Tone } => {
    const d = a.data as Record<string, any>;
    switch (a.type) {
      case 'created': return { text: 'created the task', icon: <Plus size={13} />, tone: 'primary' };
      case 'status_changed': return { text: <>changed status to <b>{String(d.toName ?? d.to ?? '').replace('_', ' ')}</b></>, icon: <ArrowRightLeft size={13} />, tone: 'blue' };
      case 'assigned': return { text: `assigned ${Array.isArray(d.employeeIds) ? d.employeeIds.length : 1} ${Array.isArray(d.employeeIds) && d.employeeIds.length > 1 ? 'people' : 'person'}`, icon: <UserPlus size={13} />, tone: 'violet' };
      case 'unassigned': return { text: 'removed an assignee', icon: <X size={13} />, tone: 'gray' };
      case 'field_changed': return { text: <>updated {Object.keys(d.changes ?? {}).join(', ') || 'fields'}</>, icon: <Pencil size={13} />, tone: 'gray' };
      case 'comment': return { text: <>commented: <i className="text-ink-2">{String(d.snippet ?? '')}</i></>, icon: <MessageSquare size={13} />, tone: 'blue' };
      case 'checklist': return { text: `checklist: ${String(d.action ?? '').replace('_', ' ')}${d.title ? ` — ${d.title}` : ''}`, icon: <ListChecks size={13} />, tone: 'green' };
      case 'subtask_added': return { text: <>added subtask <b>{String(d.title ?? '')}</b></>, icon: <GitBranch size={13} />, tone: 'primary' };
      case 'time_logged': return { text: `logged ${fmtDuration(Number(d.durationS ?? 0))}`, icon: <Clock size={13} />, tone: 'amber' };
      case 'archived': return { text: 'archived the task', icon: <Archive size={13} />, tone: 'red' };
      case 'restored': return { text: 'restored the task', icon: <RotateCcw size={13} />, tone: 'green' };
      case 'moved': return { text: 'moved the task to another list', icon: <ArrowRightLeft size={13} />, tone: 'gray' };
      default: return { text: a.type, icon: <ActivityIcon size={13} />, tone: 'gray' };
    }
  };
  return (
    <div>
      {q.isLoading && <Skeleton className="h-24" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data?.items.length === 0 && <EmptyState title="No activity" />}
      <ul>
        {q.data?.items.map((a) => {
          const d = describe(a);
          return <TimelineItem key={a.id} icon={d.icon} tone={d.tone} title={<><span className="font-semibold">{fullName(a.actor)}</span> {d.text}</>} meta={relative(a.occurredAt)} />;
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task row (list views)
// ---------------------------------------------------------------------------

export function TaskRow({ task, onOpen, selected, onSelect, showList, doneStatusId, reopenStatusId, canToggle }: {
  task: Task;
  onOpen: () => void;
  selected?: boolean;
  onSelect?: (v: boolean) => void;
  showList?: boolean;
  /** Status to use when the done toggle is checked (falls back to the legacy `{status}` body). */
  doneStatusId?: string;
  reopenStatusId?: string;
  canToggle?: boolean;
}) {
  const toast = useToast();
  const done = task.status === 'done';
  const toggle = useTaskMutation((body: Record<string, unknown>) => http.post(`/tasks/${task.id}/status`, body));
  const onToggle = () => {
    const body = done ? (reopenStatusId ? { statusId: reopenStatusId } : { status: 'todo' }) : doneStatusId ? { statusId: doneStatusId } : { status: 'done' };
    toggle.mutate(body, { onError: (e) => toast.push('error', (e as Error).message) });
  };
  return (
    <div className={clsx('group/row flex items-center gap-3 border-b border-line-2 px-3 py-[var(--row-py)] text-base transition-colors hover:bg-surface-2', selected && 'bg-pri-soft/40')}>
      {onSelect && <input type="checkbox" className="h-4 w-4 accent-pri" checked={Boolean(selected)} onChange={(e) => onSelect(e.target.checked)} aria-label="Select task" />}
      <button type="button" disabled={!canToggle || toggle.isPending} onClick={onToggle} aria-label={done ? 'Reopen task' : 'Mark done'} className={clsx('shrink-0', canToggle ? 'hover:scale-110' : 'cursor-default')}>
        {done ? <CircleCheck size={16} className="text-green" /> : <Circle size={16} className="text-ink-3 group-hover/row:text-pri" />}
      </button>
      <button type="button" onClick={onOpen} className={clsx('min-w-0 flex-1 truncate text-left font-medium hover:text-pri', done && 'text-ink-3 line-through')}>{task.title}</button>
      {showList && task.list && <span className="hidden items-center gap-1 truncate text-xs text-ink-3 md:inline-flex"><span className="h-1.5 w-1.5 rounded-full" style={{ background: task.list.space.colour }} />{task.list.name}</span>}
      {!showList && <span className="hidden lg:inline"><StatusPill status={task.statusRef} coarse={task.status} size="sm" /></span>}
      <SubtaskProgress task={task} />
      {(task._count?.comments ?? 0) > 0 && <span className="inline-flex items-center gap-0.5 text-xs text-ink-3"><MessageSquare size={12} />{task._count!.comments}</span>}
      <PriorityFlag priority={task.priority} />
      <DueChip value={task.dueAt} done={done} compact />
      <div className="w-16 shrink-0 text-right"><AssigneeStack assignees={task.assignees} /></div>
    </div>
  );
}

export { Check };
