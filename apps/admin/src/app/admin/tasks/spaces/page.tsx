'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Plus, Kanban, List as ListIcon, Table as TableIcon, CalendarDays, FolderKanban, Lock, Archive, ChevronDown, ChevronRight, Settings2, Flag } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useSpaces, useList, useTasks, useTaskBoard, useTaskMutation, type Task, type TaskStatus, type Priority, PRIORITIES } from '@/lib/queries/tasks';
import { useEmployees, useTags } from '@/lib/queries/crm';
import { Button, Card, Skeleton, EmptyState, ErrorBanner, Pagination, BulkBar, Select, SearchInput, Segmented, useToast, Input, Avatar } from '@/components/ui';
import { DataTable, FilterChip, ViewTabs, Tooltip, type Column, type SortState } from '@/components/ui/advanced';
import { TaskDrawer, TaskRow, NewTaskModal, QuickAdd, PriorityFlag, StatusPill, AssigneeStack, DueChip, SubtaskProgress, fmtDuration, PRIORITY_LABEL } from '@/components/tasks/shared';
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const createList = useTaskMutation((b: { spaceId: string; name: string }) => http.post('/tasks/lists', b));

  const select = (next: string | null) => {
    const q = new URLSearchParams(params.toString());
    if (next) q.set('listId', next); else q.delete('listId');
    q.delete('id');
    router.replace(`/admin/tasks/spaces${q.toString() ? `?${q}` : ''}`, { scroll: false });
  };

  const firstList = spaces.data?.flatMap((s) => s.lists)[0]?.id ?? null;
  const activeList = listId ?? firstList;

  return (
    <div className="-mx-[22px] -my-5 flex min-h-[calc(100vh-56px)]">
      {/* Rail */}
      <aside className="w-[240px] shrink-0 border-r border-line bg-surface">
        <div className="flex h-11 items-center justify-between border-b border-line px-3">
          <span className="text-2xs font-semibold uppercase text-ink-3">Spaces</span>
          {can('tasks.spaces.manage') && <Tooltip label="Manage spaces"><Link href="/admin/tasks/settings" className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"><Settings2 size={14} /></Link></Tooltip>}
        </div>
        <div className="space-y-2 overflow-y-auto p-2">
          {spaces.isLoading && <div className="space-y-2 p-1"><Skeleton className="h-5" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-5 w-2/3" /></div>}
          {spaces.isError && <ErrorBanner message={(spaces.error as Error).message} onRetry={() => spaces.refetch()} />}
          {spaces.data?.length === 0 && <EmptyState icon={<FolderKanban size={18} />} title="No spaces" body={can('tasks.spaces.manage') ? 'Create one in Settings.' : 'Ask an admin to add you to a space.'} />}
          {spaces.data?.map((s) => {
            const open = !collapsed[s.id];
            const total = s.lists.reduce((a, l) => a + (l._count?.tasks ?? 0), 0);
            return (
              <div key={s.id}>
                <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [s.id]: !c[s.id] }))} className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-base font-semibold text-ink hover:bg-surface-2">
                  {open ? <ChevronDown size={12} className="text-ink-3" /> : <ChevronRight size={12} className="text-ink-3" />}
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.colour }} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {s.visibility === 'private' && <Lock size={11} className="text-ink-3" />}
                  <span className="font-mono text-2xs normal-case tracking-normal text-ink-3">{total}</span>
                </button>
                {open && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-line-2 pl-2">
                    {s.lists.map((l) => (
                      <button key={l.id} type="button" onClick={() => select(l.id)} className={clsx('flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-base', activeList === l.id ? 'bg-pri-soft font-semibold text-pri-2' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
                        <span className="truncate">{l.name}</span><span className="font-mono text-2xs normal-case tracking-normal text-ink-3">{l._count?.tasks ?? 0}</span>
                      </button>
                    ))}
                    {can('tasks.manage') && (newListFor === s.id ? (
                      <form className="flex gap-1 py-1" onSubmit={(e) => { e.preventDefault(); if (!newListName.trim()) return; createList.mutate({ spaceId: s.id, name: newListName.trim() }, { onSuccess: () => { setNewListFor(null); setNewListName(''); toast.push('success', 'List created'); }, onError: (err) => toast.push('error', (err as Error).message) }); }}>
                        <Input autoFocus className="!h-7 !text-xs" value={newListName} onChange={(e) => setNewListName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setNewListFor(null)} placeholder="List name" />
                        <Button size="sm" type="submit" variant="primary">Add</Button>
                      </form>
                    ) : (
                      <button type="button" onClick={() => { setNewListFor(s.id); setNewListName(''); }} className="flex items-center gap-1 px-2 py-1 text-xs text-ink-3 hover:text-pri"><Plus size={12} /> New list</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0 flex-1 px-[22px] py-5">
        {activeList ? <ListView listId={activeList} onOpen={setId} /> : spaces.data && <EmptyState icon={<FolderKanban size={22} />} title="Select a list" body="Pick a list on the left or create one." />}
      </div>
      <TaskDrawer id={id} onClose={() => setId(null)} onOpenTask={setId} />
    </div>
  );
}

type View = 'list' | 'board' | 'table';
type Scope = 'all' | 'mine' | 'overdue' | 'done';
type DuePreset = '' | 'overdue' | 'today' | 'week' | 'none';

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function ListView({ listId, onOpen }: { listId: string; onOpen: (id: string) => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const list = useList(listId);
  const [view, setView] = useState<View>('list');
  const [scope, setScope] = useState<Scope>('all');
  const [search, setSearch] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('');
  const [statusId, setStatusId] = useState('');
  const [tagId, setTagId] = useState('');
  const [due, setDue] = useState<DuePreset>('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: 'position', direction: 'asc' });
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Task[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const { data: employees } = useEmployees();
  const { data: tags } = useTags();

  const dueRange = useMemo(() => {
    const now = new Date();
    if (due === 'overdue' || scope === 'overdue') return { dueTo: now.toISOString() };
    if (due === 'today') return { dueFrom: startOfDay().toISOString(), dueTo: new Date(startOfDay().getTime() + 86400e3).toISOString() };
    if (due === 'week') return { dueFrom: startOfDay().toISOString(), dueTo: new Date(startOfDay().getTime() + 7 * 86400e3).toISOString() };
    return {};
  }, [due, scope]);

  const params = useMemo(() => ({
    listId,
    search: search || undefined,
    assigneeId: scope === 'mine' ? me?.id : assigneeId || undefined,
    priority: priority || undefined,
    statusId: statusId || undefined,
    tagId: tagId || undefined,
    group: scope === 'done' ? 'done' : undefined,
    includeArchived,
    cursor,
    limit: 50,
    sort: `${sort.key}:${sort.direction}`,
    ...dueRange,
  }), [listId, search, assigneeId, priority, statusId, tagId, includeArchived, cursor, sort, scope, me?.id, dueRange]);
  const q = useTasks(params, { enabled: view !== 'board' });
  const reset = () => { setCursor(undefined); setPages([]); setSelected(new Set()); };
  useEffect(reset, [listId, scope, search, assigneeId, priority, statusId, tagId, due, includeArchived, sort.key, sort.direction]);

  const rows = useMemo(() => {
    const seen = new Set<string>();
    let all = [...pages.flat(), ...(q.data?.items ?? [])].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    if (scope === 'overdue' || due === 'overdue') all = all.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    if (due === 'none') all = all.filter((t) => !t.dueAt);
    return all;
  }, [pages, q.data, scope, due]);

  const bulk = useTaskMutation((b: Record<string, unknown>) => http.post('/tasks/bulk', { ids: [...selected], ...b }));
  const runBulk = (b: Record<string, unknown>) => bulk.mutate(b, { onSuccess: () => { setSelected(new Set()); toast.push('success', 'Done'); }, onError: (e) => toast.push('error', (e as Error).message) });
  const statuses: TaskStatus[] = list.data?.statuses ?? [];
  const doneStatus = statuses.find((s) => s.group === 'done');
  const openStatus = statuses.find((s) => s.group === 'open');
  const canToggle = (t: Task) => can('tasks.manage') || t.creatorId === me?.id || t.assignees.some((a) => a.employeeId === me?.id);
  const toggleSel = (id: string, v: boolean) => setSelected((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });

  const columns: Column<Task>[] = [
    { key: 'title', header: 'Task', sortable: true, locked: true, cell: (t) => <button type="button" className={clsx('text-left font-medium hover:text-pri', t.status === 'done' && 'text-ink-3 line-through')} onClick={() => onOpen(t.id)}>{t.title}{t.archivedAt && <span className="ml-2 text-xs text-ink-3">(archived)</span>}</button> },
    { key: 'status', header: 'Status', cell: (t) => <StatusPill status={t.statusRef} coarse={t.status} size="sm" /> },
    { key: 'priority', header: 'Priority', sortable: true, cell: (t) => <PriorityFlag priority={t.priority} withLabel /> },
    { key: 'assignees', header: 'Assignees', cell: (t) => <AssigneeStack assignees={t.assignees} /> },
    { key: 'dueAt', header: 'Due', sortable: true, cell: (t) => <DueChip value={t.dueAt} done={t.status === 'done'} compact /> },
    { key: 'subtasks', header: 'Subtasks', cell: (t) => <SubtaskProgress task={t} /> },
    { key: 'timeEstimateS', header: 'Est.', right: true, mono: true, cell: (t) => fmtDuration(t.timeEstimateS) },
    { key: 'timeSpentS', header: 'Spent', right: true, mono: true, cell: (t) => fmtDuration(t.timeSpentS) },
    { key: 'createdAt', header: 'Created', sortable: true, hidden: false, cell: (t) => <span className="text-xs text-ink-3">{new Date(t.createdAt).toLocaleDateString()}</span> },
  ];

  const activeFilters = [assigneeId, priority, statusId, tagId, due].filter(Boolean).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {list.data?.space && <span className="h-3 w-3 rounded-sm" style={{ background: list.data.space.colour }} />}
            <h2 className="truncate text-xl font-semibold text-ink">{list.data?.name ?? <Skeleton className="h-6 w-40" />}</h2>
            {list.data?.space && <span className="text-sm text-ink-3">in {list.data.space.name}</span>}
          </div>
          {list.data?.description && <p className="mt-0.5 text-sm text-ink-2">{list.data.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={view} onChange={setView} options={[
            { value: 'list', label: <span className="flex items-center gap-1"><ListIcon size={13} /> List</span> },
            { value: 'board', label: <span className="flex items-center gap-1"><Kanban size={13} /> Board</span> },
            { value: 'table', label: <span className="flex items-center gap-1"><TableIcon size={13} /> Table</span> },
          ]} />
          <Tooltip label="Calendar view"><Link href={`/admin/tasks/calendar?listId=${listId}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-xs font-semibold text-ink-2 hover:text-ink"><CalendarDays size={13} /> Calendar</Link></Tooltip>
          {can('tasks.create') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New task</Button>}
        </div>
      </div>

      <ViewTabs value={scope} onChange={setScope} views={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'Mine' }, { value: 'overdue', label: 'Overdue' }, { value: 'done', label: 'Done' }]} />

      <div className="my-3 flex flex-wrap items-center gap-2">
        <div className="w-56"><SearchInput value={search} onChange={setSearch} placeholder="Search tasks…" /></div>
        <FilterChip label="Assignee" value={assigneeId ? fullName(employees?.find((e) => e.id === assigneeId)) : undefined} onClear={() => setAssigneeId('')}>
          <div className="max-h-64 overflow-y-auto">{(employees ?? []).map((e) => <button key={e.id} type="button" onClick={() => setAssigneeId(e.id)} className={clsx('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-surface-2', assigneeId === e.id && 'bg-pri-soft')}><Avatar name={fullName(e)} size={18} />{fullName(e)}</button>)}</div>
        </FilterChip>
        {view !== 'board' && (
          <FilterChip label="Status" value={statusId ? statuses.find((s) => s.id === statusId)?.name : undefined} onClear={() => setStatusId('')}>
            {statuses.map((s) => <button key={s.id} type="button" onClick={() => setStatusId(s.id)} className={clsx('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-surface-2', statusId === s.id && 'bg-pri-soft')}><span className="h-2 w-2 rounded-full" style={{ background: s.colour }} />{s.name}</button>)}
          </FilterChip>
        )}
        <FilterChip label="Priority" value={priority ? PRIORITY_LABEL[priority] : undefined} onClear={() => setPriority('')}>
          {PRIORITIES.map((p) => <button key={p} type="button" onClick={() => setPriority(p)} className={clsx('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-surface-2', priority === p && 'bg-pri-soft')}><Flag size={12} className={{ urgent: 'text-red', high: 'text-amber', normal: 'text-blue', low: 'text-ink-3', none: 'text-ink-3' }[p]} />{PRIORITY_LABEL[p]}</button>)}
        </FilterChip>
        <FilterChip label="Tag" value={tagId ? tags?.find((t) => t.id === tagId)?.name : undefined} onClear={() => setTagId('')}>
          {(tags ?? []).map((t) => <button key={t.id} type="button" onClick={() => setTagId(t.id)} className={clsx('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-surface-2', tagId === t.id && 'bg-pri-soft')}><span className="h-2 w-2 rounded-full" style={{ background: t.colour }} />{t.name}</button>)}
          {(tags ?? []).length === 0 && <div className="px-2 py-1 text-xs text-ink-3">No tags</div>}
        </FilterChip>
        <FilterChip label="Due" value={due ? { overdue: 'Overdue', today: 'Today', week: 'This week', none: 'No date' }[due] : undefined} onClear={() => setDue('')}>
          {(['overdue', 'today', 'week', 'none'] as DuePreset[]).map((d) => <button key={d} type="button" onClick={() => setDue(d)} className={clsx('block w-full rounded px-2 py-1 text-left text-sm hover:bg-surface-2', due === d && 'bg-pri-soft')}>{{ overdue: 'Overdue', today: 'Today', week: 'This week', none: 'No date', '': '' }[d]}</button>)}
        </FilterChip>
        {activeFilters > 0 && <Button size="sm" variant="ghost" onClick={() => { setAssigneeId(''); setPriority(''); setStatusId(''); setTagId(''); setDue(''); }}>Clear {activeFilters}</Button>}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-2"><input type="checkbox" className="h-3.5 w-3.5 accent-pri" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} /> Archived</label>
      </div>

      {view === 'board' ? (
        <Board listId={listId} statuses={statuses} onOpen={onOpen} />
      ) : (
        <Card className="overflow-hidden">
          {can('tasks.manage') && (
            <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
              <Select className="!h-8 !w-40 !text-xs" value="" onChange={(e) => e.target.value && runBulk({ action: 'status', statusId: e.target.value })}><option value="">Set status…</option>{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              <Select className="!h-8 !w-40 !text-xs" value="" onChange={(e) => e.target.value && runBulk({ action: 'assign', employeeId: e.target.value })}><option value="">Assign…</option>{(employees ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>
              <Select className="!h-8 !w-32 !text-xs" value="" onChange={(e) => e.target.value && runBulk({ action: 'priority', priority: e.target.value as Priority })}><option value="">Priority…</option>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</Select>
              <Select className="!h-8 !w-36 !text-xs" value="" onChange={(e) => e.target.value && runBulk({ action: 'add_tag', tagId: e.target.value })}><option value="">Add tag…</option>{(tags ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
              <Button size="sm" variant="danger-outline" icon={<Archive size={12} />} onClick={() => runBulk({ action: 'archive' })}>Archive</Button>
            </BulkBar>
          )}
          {view === 'list' && (
            <>
              {q.isLoading && pages.length === 0 && <div className="space-y-px p-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9" />)}</div>}
              {q.isError && <div className="p-4"><ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} /></div>}
              {q.data && rows.length === 0 && (
                <EmptyState icon={<ListIcon size={22} />} title={scope === 'done' ? 'Nothing completed yet' : activeFilters || search ? 'No tasks match these filters' : 'No tasks yet'} body={!activeFilters && !search && scope === 'all' ? 'Create the first task in this list.' : undefined} action={can('tasks.create') && scope === 'all' && !activeFilters ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New task</Button> : undefined} />
              )}
              {rows.length > 0 && (statuses.length > 0 && !statusId && scope !== 'done' ? (
                statuses.map((s) => {
                  const group = rows.filter((t) => t.statusId === s.id);
                  const open = !collapsedGroups[s.id];
                  if (!group.length && (s.group === 'closed' || s.group === 'done')) return null;
                  return (
                    <div key={s.id}>
                      <button type="button" onClick={() => setCollapsedGroups((c) => ({ ...c, [s.id]: !c[s.id] }))} className="flex w-full items-center gap-2 border-b border-line-2 bg-surface-2/70 px-3 py-1.5 text-left">
                        {open ? <ChevronDown size={12} className="text-ink-3" /> : <ChevronRight size={12} className="text-ink-3" />}
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${s.colour}22`, color: s.colour }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: s.colour }} />{s.name}</span>
                        <span className="font-mono text-xs text-ink-3">{group.length}</span>
                      </button>
                      {open && group.map((t) => <TaskRow key={t.id} task={t} onOpen={() => onOpen(t.id)} selected={selected.has(t.id)} onSelect={can('tasks.manage') ? (v) => toggleSel(t.id, v) : undefined} doneStatusId={doneStatus?.id} reopenStatusId={openStatus?.id} canToggle={canToggle(t)} />)}
                      {open && can('tasks.create') && <QuickAdd listId={listId} statusId={s.id} className="border-b border-line-2" />}
                    </div>
                  );
                })
              ) : (
                rows.map((t) => <TaskRow key={t.id} task={t} onOpen={() => onOpen(t.id)} selected={selected.has(t.id)} onSelect={can('tasks.manage') ? (v) => toggleSel(t.id, v) : undefined} doneStatusId={doneStatus?.id} reopenStatusId={openStatus?.id} canToggle={canToggle(t)} />)
              ))}
              {q.data && rows.length > 0 && <Pagination count={rows.length} hasMore={Boolean(q.data.nextCursor)} loading={q.isFetching} onMore={() => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } }} />}
            </>
          )}
          {view === 'table' && (
            <DataTable<Task>
              rows={rows}
              columns={columns}
              loading={q.isLoading && pages.length === 0}
              error={q.isError ? (q.error as Error).message : null}
              onRetry={() => q.refetch()}
              sort={sort}
              onSort={setSort}
              selected={can('tasks.manage') ? selected : undefined}
              onSelect={can('tasks.manage') ? setSelected : undefined}
              onRowClick={(t) => onOpen(t.id)}
              storageKey={`tasks.list`}
              empty={<EmptyState icon={<TableIcon size={22} />} title="No tasks" body="Nothing matches these filters." />}
              footer={q.data && rows.length > 0 ? <Pagination count={rows.length} hasMore={Boolean(q.data.nextCursor)} loading={q.isFetching} onMore={() => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } }} /> : undefined}
            />
          )}
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
  if (q.isLoading) return <div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}</div>;
  if (q.isError) return <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return null;
  const columns = q.data.columns.length ? q.data.columns : statuses.map((s) => ({ status: s, count: 0, tasks: [] as Task[] }));
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {columns.map((col) => (
        <div
          key={col.status.id}
          className={clsx('flex w-[280px] shrink-0 flex-col rounded-card border bg-surface-2/70 transition-colors', over === col.status.id ? 'border-pri bg-pri-soft/40' : 'border-line')}
          onDragOver={(e) => { e.preventDefault(); setOver(col.status.id); }}
          onDragLeave={() => setOver(null)}
          onDrop={() => drop(col.status.id)}
        >
          <div className="h-1 rounded-t-card" style={{ background: col.status.colour }} />
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2 text-base font-semibold text-ink"><span className="h-2.5 w-2.5 rounded-full" style={{ background: col.status.colour }} />{col.status.name}</div>
            <span className="rounded-full bg-surface px-2 font-mono text-xs text-ink-2">{col.count}</span>
          </div>
          <div className="flex-1 space-y-2 px-2 pb-2">
            {col.tasks.length === 0 && <div className={clsx('rounded-lg border border-dashed px-3 py-6 text-center text-xs', over === col.status.id ? 'border-pri text-pri' : 'border-line text-ink-3')}>Drop tasks here</div>}
            {col.tasks.map((t) => {
              const canDrag = can('tasks.manage') || t.creatorId === me?.id || t.assignees.some((a) => a.employeeId === me?.id);
              return (
                <div key={t.id} draggable={canDrag} onDragStart={() => setDragging(t.id)} onDragEnd={() => { setDragging(null); setOver(null); }} onClick={() => onOpen(t.id)}
                  className={clsx('cursor-pointer rounded-lg border border-line bg-surface p-3 shadow-card transition hover:-translate-y-px hover:border-pri hover:shadow-pop', dragging === t.id && 'opacity-40', canDrag && 'cursor-grab active:cursor-grabbing')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className={clsx('text-base font-medium text-ink', t.status === 'done' && 'text-ink-3 line-through')}>{t.title}</div>
                    <PriorityFlag priority={t.priority} size={13} />
                  </div>
                  {(t.tags?.length ?? 0) > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{t.tags!.slice(0, 3).map((tg) => <span key={tg.id} className="rounded-full px-1.5 text-2xs normal-case tracking-normal font-semibold" style={{ background: `${tg.colour}22`, color: tg.colour }}>{tg.name}</span>)}</div>}
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><DueChip value={t.dueAt} done={t.status === 'done'} compact /><SubtaskProgress task={t} /></div>
                    <AssigneeStack assignees={t.assignees} size={20} />
                  </div>
                </div>
              );
            })}
            {can('tasks.create') && <QuickAdd listId={listId} statusId={col.status.id} className="rounded-lg" placeholder="New task in this column…" />}
          </div>
        </div>
      ))}
    </div>
  );
}
