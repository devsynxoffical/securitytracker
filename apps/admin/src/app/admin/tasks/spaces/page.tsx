'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Plus, Kanban, List as ListIcon, Table as TableIcon, FolderKanban, Lock, Archive } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useSpaces, useList, useTasks, useTaskBoard, useTaskMutation, type Task, type TaskStatus, type Priority, PRIORITIES } from '@/lib/queries/tasks';
import { useEmployees } from '@/lib/queries/crm';
import { Button, Card, Table, Th, Td, Skeleton, TableSkeleton, EmptyState, ErrorBanner, Pagination, BulkBar, Select, SearchInput, Segmented, Checkbox, useToast, PageHeader, Input } from '@/components/ui';
import { TaskDrawer, TaskRow, NewTaskModal, PriorityBadge, StatusPill, AssigneeStack, DueDate, fmtDuration } from '@/components/tasks/shared';
import { fullName } from '@/lib/format';

export default function SpacesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Spaces />
    </Suspense>
  );
}

function Spaces() {
  const params = useSearchParams();
  const router = useRouter();
  const { can } = useAuth();
  const toast = useToast();
  const [id, setId] = useIdParam();
  const listId = params.get('listId');
  const spaces = useSpaces();
  const [newListFor, setNewListFor] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const createList = useTaskMutation((b: { spaceId: string; name: string }) => http.post('/tasks/lists', b));

  const select = (next: string | null) => {
    const q = new URLSearchParams(params.toString());
    if (next) q.set('listId', next); else q.delete('listId');
    q.delete('id');
    router.replace(`/admin/tasks/spaces${q.toString() ? `?${q}` : ''}`, { scroll: false });
  };

  // default to the first list
  const firstList = spaces.data?.flatMap((s) => s.lists)[0]?.id ?? null;
  const activeList = listId ?? firstList;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <Card className="h-fit">
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Spaces</span>{can('tasks.spaces.manage') && <a href="/admin/tasks/settings" className="text-xs text-pri hover:underline">Manage</a>}</div>
        {spaces.isLoading && <div className="space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5" /><Skeleton className="h-5" /></div>}
        {spaces.isError && <ErrorBanner message={(spaces.error as Error).message} onRetry={() => spaces.refetch()} />}
        {spaces.data?.length === 0 && <EmptyState icon={<FolderKanban size={18} />} title="No spaces" body={can('tasks.spaces.manage') ? 'Create one in Settings.' : 'Ask an admin to add you to a space.'} />}
        <div className="space-y-3">
          {spaces.data?.map((s) => (
            <div key={s.id}>
              <div className="flex items-center gap-2 px-1 text-[13px] font-semibold text-ink"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.colour }} />{s.name}{s.visibility === 'private' && <Lock size={11} className="text-ink-3" />}</div>
              <div className="mt-1 space-y-0.5">
                {s.lists.map((l) => (
                  <button key={l.id} type="button" onClick={() => select(l.id)} className={clsx('flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[13px]', activeList === l.id ? 'bg-pri-soft text-pri-2 font-semibold' : 'text-ink-2 hover:bg-surface-2')}>
                    <span className="truncate">{l.name}</span><span className="font-mono text-[11px] text-ink-3">{l._count?.tasks ?? 0}</span>
                  </button>
                ))}
                {can('tasks.manage') && (newListFor === s.id ? (
                  <form className="flex gap-1 px-1 pt-1" onSubmit={(e) => { e.preventDefault(); if (!newListName.trim()) return; createList.mutate({ spaceId: s.id, name: newListName.trim() }, { onSuccess: () => { setNewListFor(null); setNewListName(''); toast.push('success', 'List created'); }, onError: (err) => toast.push('error', (err as Error).message) }); }}>
                    <Input autoFocus value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="List name" />
                    <Button size="sm" type="submit" variant="primary">Add</Button>
                  </form>
                ) : (
                  <button type="button" onClick={() => { setNewListFor(s.id); setNewListName(''); }} className="flex items-center gap-1 px-2 py-1 text-xs text-ink-3 hover:text-pri"><Plus size={12} /> New list</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="min-w-0">
        {activeList ? <ListView listId={activeList} onOpen={setId} /> : spaces.data && <EmptyState icon={<FolderKanban size={22} />} title="Select a list" body="Pick a list on the left or create one." />}
      </div>
      <TaskDrawer id={id} onClose={() => setId(null)} onOpenTask={setId} />
    </div>
  );
}

type View = 'list' | 'board' | 'table';

function ListView({ listId, onOpen }: { listId: string; onOpen: (id: string) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const list = useList(listId);
  const [view, setView] = useState<View>('list');
  const [search, setSearch] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('');
  const [statusId, setStatusId] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Task[][]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const { data: employees } = useEmployees();
  const params = useMemo(() => ({ listId, search: search || undefined, assigneeId: assigneeId || undefined, priority: priority || undefined, statusId: statusId || undefined, includeArchived, cursor, limit: 50, sort: 'position:asc' }), [listId, search, assigneeId, priority, statusId, includeArchived, cursor]);
  const q = useTasks(params, { enabled: view !== 'board' });
  const rows = useMemo(() => { const seen = new Set<string>(); return [...pages.flat(), ...(q.data?.items ?? [])].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))); }, [pages, q.data]);
  const reset = () => { setCursor(undefined); setPages([]); setSelected([]); };
  const bulk = useTaskMutation((b: Record<string, unknown>) => http.post('/tasks/bulk', { ids: selected, ...b }));
  const runBulk = (b: Record<string, unknown>) => bulk.mutate(b, { onSuccess: () => { setSelected([]); toast.push('success', 'Done'); }, onError: (e) => toast.push('error', (e as Error).message) });
  const statuses: TaskStatus[] = list.data?.statuses ?? [];

  return (
    <div>
      <PageHeader title={list.data?.name ?? 'List'} subtitle={list.data?.space ? `${list.data.space.name}${list.data.description ? ` · ${list.data.description}` : ''}` : undefined} actions={<>
        <Segmented value={view} onChange={setView} options={[{ value: 'list', label: <span className="flex items-center gap-1"><ListIcon size={13} /> List</span> }, { value: 'board', label: <span className="flex items-center gap-1"><Kanban size={13} /> Board</span> }, { value: 'table', label: <span className="flex items-center gap-1"><TableIcon size={13} /> Table</span> }]} />
        {can('tasks.create') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New task</Button>}
      </>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-60"><SearchInput value={search} onChange={(v) => { setSearch(v); reset(); }} placeholder="Search tasks…" /></div>
        <div className="w-44"><Select value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); reset(); }}><option value="">All assignees</option>{(employees ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select></div>
        <div className="w-32"><Select value={priority} onChange={(e) => { setPriority(e.target.value); reset(); }}><option value="">Any priority</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</Select></div>
        {view !== 'board' && <div className="w-40"><Select value={statusId} onChange={(e) => { setStatusId(e.target.value); reset(); }}><option value="">Any status</option>{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>}
        <Checkbox label={<span className="text-xs">Show archived</span>} checked={includeArchived} onChange={(e) => { setIncludeArchived(e.target.checked); reset(); }} />
      </div>

      {view === 'board' ? (
        <Board listId={listId} statuses={statuses} onOpen={onOpen} />
      ) : (
        <Card className="!p-0 overflow-hidden">
          {can('tasks.manage') && (
            <BulkBar count={selected.length} onClear={() => setSelected([])}>
              <Select className="w-40" value="" onChange={(e) => e.target.value && runBulk({ action: 'status', statusId: e.target.value })}><option value="">Set status…</option>{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              <Select className="w-40" value="" onChange={(e) => e.target.value && runBulk({ action: 'assign', employeeId: e.target.value })}><option value="">Assign…</option>{(employees ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>
              <Select className="w-32" value="" onChange={(e) => e.target.value && runBulk({ action: 'priority', priority: e.target.value as Priority })}><option value="">Priority…</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
              <Button size="sm" variant="danger-outline" icon={<Archive size={12} />} onClick={() => runBulk({ action: 'archive' })}>Archive</Button>
            </BulkBar>
          )}
          {q.isLoading && pages.length === 0 && <TableSkeleton rows={6} cols={6} />}
          {q.isError && <div className="p-4"><ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} /></div>}
          {q.data && rows.length === 0 && <EmptyState icon={<ListIcon size={22} />} title="No tasks" body="Create the first task in this list." action={can('tasks.create') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New task</Button> : undefined} />}
          {rows.length > 0 && view === 'list' && (
            <div>
              {statuses.length > 0 && !statusId ? (
                statuses.map((s) => {
                  const group = rows.filter((t) => t.statusId === s.id);
                  if (!group.length) return null;
                  return (
                    <div key={s.id}>
                      <div className="flex items-center gap-2 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2"><span className="h-2 w-2 rounded-full" style={{ background: s.colour }} />{s.name}<span className="font-mono text-ink-3">{group.length}</span></div>
                      {group.map((t) => <TaskRow key={t.id} task={t} onOpen={() => onOpen(t.id)} selected={selected.includes(t.id)} onSelect={can('tasks.manage') ? (v) => setSelected((sel) => (v ? [...sel, t.id] : sel.filter((x) => x !== t.id))) : undefined} />)}
                    </div>
                  );
                })
              ) : (
                rows.map((t) => <TaskRow key={t.id} task={t} onOpen={() => onOpen(t.id)} selected={selected.includes(t.id)} onSelect={can('tasks.manage') ? (v) => setSelected((sel) => (v ? [...sel, t.id] : sel.filter((x) => x !== t.id))) : undefined} />)
              )}
            </div>
          )}
          {rows.length > 0 && view === 'table' && (
            <Table>
              <thead><tr>{can('tasks.manage') && <Th><Checkbox checked={selected.length === rows.length} onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])} /></Th>}<Th>Task</Th><Th>Status</Th><Th>Priority</Th><Th>Assignees</Th><Th>Due</Th><Th right>Est.</Th><Th right>Spent</Th></tr></thead>
              <tbody>{rows.map((t) => (
                <tr key={t.id} className="hover:bg-surface-2">
                  {can('tasks.manage') && <Td><Checkbox checked={selected.includes(t.id)} onChange={(e) => setSelected((sel) => (e.target.checked ? [...sel, t.id] : sel.filter((x) => x !== t.id)))} /></Td>}
                  <Td><button type="button" className="font-medium hover:underline" onClick={() => onOpen(t.id)}>{t.title}</button>{t.archivedAt && <span className="ml-2 text-xs text-ink-3">(archived)</span>}</Td>
                  <Td><StatusPill status={t.statusRef} coarse={t.status} /></Td>
                  <Td><PriorityBadge priority={t.priority} /></Td>
                  <Td><AssigneeStack assignees={t.assignees} /></Td>
                  <Td><DueDate value={t.dueAt} done={t.status === 'done'} /></Td>
                  <Td right mono>{fmtDuration(t.timeEstimateS)}</Td>
                  <Td right mono>{fmtDuration(t.timeSpentS)}</Td>
                </tr>
              ))}</tbody>
            </Table>
          )}
          {q.data && rows.length > 0 && <Pagination count={rows.length} hasMore={Boolean(q.data.nextCursor)} loading={q.isFetching} onMore={() => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } }} />}
        </Card>
      )}
      <NewTaskModal open={creating} onClose={() => setCreating(false)} listId={listId} defaultStatuses={statuses} />
    </div>
  );
}

function Board({ listId, statuses, onOpen }: { listId: string; statuses: TaskStatus[]; onOpen: (id: string) => void }) {
  const q = useTaskBoard(listId);
  const toast = useToast();
  const { can, me } = useAuth();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const move = useTaskMutation((a: { id: string; statusId: string }) => http.post(`/tasks/${a.id}/status`, { statusId: a.statusId }));
  const drop = (statusId: string) => {
    if (!dragging) return;
    move.mutate({ id: dragging, statusId }, { onError: (e) => toast.push('error', (e as Error).message) });
    setDragging(null);
    setOver(null);
  };
  if (q.isLoading) return <div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}</div>;
  if (q.isError) return <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return null;
  const columns = q.data.columns.length ? q.data.columns : statuses.map((s) => ({ status: s, count: 0, tasks: [] as Task[] }));
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div key={col.status.id} className={clsx('flex w-72 shrink-0 flex-col rounded-card border bg-surface-2', over === col.status.id ? 'border-pri' : 'border-line')}
          onDragOver={(e) => { e.preventDefault(); setOver(col.status.id); }} onDragLeave={() => setOver(null)} onDrop={() => drop(col.status.id)}>
          <div className="flex items-center justify-between px-3 py-2"><div className="flex items-center gap-2 text-[13px] font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: col.status.colour }} />{col.status.name}</div><span className="font-mono text-xs text-ink-3">{col.count}</span></div>
          <div className="flex-1 space-y-2 px-2 pb-2">
            {col.tasks.length === 0 && <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-ink-3">Drop tasks here</div>}
            {col.tasks.map((t) => {
              const canDrag = can('tasks.manage') || t.creatorId === me?.id || t.assignees.some((a) => a.employeeId === me?.id);
              return (
                <div key={t.id} draggable={canDrag} onDragStart={() => setDragging(t.id)} onDragEnd={() => { setDragging(null); setOver(null); }} onClick={() => onOpen(t.id)}
                  className={clsx('cursor-pointer rounded-lg border border-line bg-surface p-2.5 shadow-card hover:border-pri', dragging === t.id && 'opacity-50')}>
                  <div className="text-[13px] font-medium text-ink">{t.title}</div>
                  <div className="mt-2 flex items-center justify-between gap-2"><PriorityBadge priority={t.priority} /><DueDate value={t.dueAt} done={t.status === 'done'} /></div>
                  <div className="mt-2 flex items-center justify-between"><AssigneeStack assignees={t.assignees} /><span className="text-[11px] text-ink-3">{(t._count?.subtasks ?? 0) > 0 && `${t._count!.subtasks} sub`}</span></div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
