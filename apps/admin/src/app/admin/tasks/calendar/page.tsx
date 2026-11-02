'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, List as ListIcon } from 'lucide-react';
import { useIdParam } from '@/lib/useIdParam';
import { useTasks, useSpaces, useTaskMutation, type Task } from '@/lib/queries/tasks';
import { useEmployees } from '@/lib/queries/crm';
import { http } from '@/lib/api';
import { Button, Skeleton, EmptyState, ErrorBanner, PageHeader, useToast, Avatar } from '@/components/ui';
import { FilterChip, Kbd } from '@/components/ui/advanced';
import { TaskDrawer } from '@/components/tasks/shared';
import { MonthGrid, monthRange } from '@/components/tasks/calendar/MonthGrid';
import { fullName } from '@/lib/format';

export default function TaskCalendarPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <TaskCalendar />
    </Suspense>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function TaskCalendar() {
  const [id, setId] = useIdParam();
  const params = useSearchParams();
  const toast = useToast();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() });
  const spaces = useSpaces();
  const initialList = params.get('listId') ?? '';
  const initialSpace = useMemo(() => spaces.data?.find((s) => s.lists.some((l) => l.id === initialList))?.id ?? '', [spaces.data, initialList]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [listId, setListId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const effSpace = spaceId ?? initialSpace;
  const effList = listId ?? initialList;

  const range = useMemo(() => monthRange(cursor.year, cursor.month), [cursor]);
  const tasks = useTasks({
    dueFrom: range.from.toISOString(),
    dueTo: range.to.toISOString(),
    limit: 200,
    ...(effSpace ? { spaceId: effSpace } : {}),
    ...(effList ? { listId: effList } : {}),
    ...(assigneeId ? { assigneeId } : {}),
  });
  const employees = useEmployees();
  const lists = spaces.data?.find((s) => s.id === effSpace)?.lists ?? [];

  const move = useTaskMutation(({ taskId, day, task }: { taskId: string; day: string; task: Task }) => {
    const prev = task.dueAt ? new Date(task.dueAt) : new Date(Date.UTC(cursor.year, cursor.month, 1, 17, 0, 0));
    const next = new Date(`${day}T${prev.toISOString().slice(11)}`);
    return http.patch(`/tasks/${taskId}`, { dueAt: next.toISOString() });
  });
  const onMove = (taskId: string, day: string) => {
    const task = tasks.data?.items.find((t) => t.id === taskId);
    if (!task || (task.dueAt && task.dueAt.slice(0, 10) === day)) return;
    move.mutate({ taskId, day, task }, { onSuccess: () => toast.push('success', `"${task.title}" is now due ${day}`), onError: (e) => toast.push('error', (e as Error).message) });
  };
  const shift = (delta: number) => { const d = new Date(Date.UTC(cursor.year, cursor.month + delta, 1)); setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() }); };
  const today = now.toISOString().slice(0, 10);
  const count = tasks.data?.items.filter((t) => t.dueAt).length ?? 0;
  const overdue = tasks.data?.items.filter((t) => t.dueAt && t.status !== 'done' && t.status !== 'cancelled' && new Date(t.dueAt).getTime() < Date.now()).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={<span>Tasks by due date. Drag a task to another day to reschedule it. {tasks.data && <span className="font-mono text-ink-3">{count} due this month{overdue ? <span className="text-red-text"> · {overdue} overdue</span> : null}</span>}</span>}
        actions={
          <div className="flex items-center gap-2">
            {effList && <Link href={`/admin/tasks/spaces?listId=${effList}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-xs font-semibold text-ink-2 hover:text-ink"><ListIcon size={13} /> List view</Link>}
            <div className="inline-flex items-center rounded-lg border border-line bg-surface">
              <button type="button" onClick={() => shift(-1)} className="px-2 py-1.5 text-ink-3 hover:text-ink" aria-label="Previous month"><ChevronLeft size={14} /></button>
              <span className="min-w-[150px] text-center text-base font-semibold text-ink">{MONTHS[cursor.month]} {cursor.year}</span>
              <button type="button" onClick={() => shift(1)} className="px-2 py-1.5 text-ink-3 hover:text-ink" aria-label="Next month"><ChevronRight size={14} /></button>
            </div>
            <Button variant="default" size="sm" onClick={() => setCursor({ year: now.getUTCFullYear(), month: now.getUTCMonth() })}>Today</Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterChip label="Space" value={effSpace ? spaces.data?.find((s) => s.id === effSpace)?.name : undefined} onClear={() => { setSpaceId(''); setListId(''); }}>
          {(spaces.data ?? []).map((s) => <button key={s.id} type="button" onClick={() => { setSpaceId(s.id); setListId(''); }} className={clsx('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-surface-2', effSpace === s.id && 'bg-pri-soft')}><span className="h-2 w-2 rounded-sm" style={{ background: s.colour }} />{s.name}</button>)}
        </FilterChip>
        <FilterChip label="List" value={effList ? lists.find((l) => l.id === effList)?.name : undefined} onClear={() => setListId('')} active={Boolean(effList)}>
          {lists.length === 0 ? <div className="px-2 py-1 text-xs text-ink-3">Pick a space first</div> : lists.map((l) => <button key={l.id} type="button" onClick={() => setListId(l.id)} className={clsx('block w-full rounded px-2 py-1 text-left text-sm hover:bg-surface-2', effList === l.id && 'bg-pri-soft')}>{l.name}</button>)}
        </FilterChip>
        <FilterChip label="Assignee" value={assigneeId ? fullName(employees.data?.find((e) => e.id === assigneeId)) : undefined} onClear={() => setAssigneeId('')}>
          <div className="max-h-64 overflow-y-auto">{(employees.data ?? []).map((e) => <button key={e.id} type="button" onClick={() => setAssigneeId(e.id)} className={clsx('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-surface-2', assigneeId === e.id && 'bg-pri-soft')}><Avatar name={fullName(e)} size={18} />{fullName(e)}</button>)}</div>
        </FilterChip>
        <span className="ml-auto hidden items-center gap-1 text-xs text-ink-3 md:inline-flex">Drag a card to a day · <Kbd>Esc</Kbd> closes the task</span>
      </div>

      {tasks.isLoading && <Skeleton className="h-[560px]" />}
      {tasks.isError && <ErrorBanner message={(tasks.error as Error).message} onRetry={() => tasks.refetch()} />}
      {tasks.data && count === 0 && <EmptyState icon={<CalendarDays size={20} />} title="No tasks due this month" body="Tasks with a due date in this month appear here. Set due dates from the task drawer." />}
      {tasks.data && count > 0 && <MonthGrid year={cursor.year} month={cursor.month} tasks={tasks.data.items} onOpen={setId} onMove={onMove} today={today} />}
      {tasks.data && tasks.data.nextCursor && <p className="mt-2 text-xs text-amber-text">Showing the first 200 tasks of this month. Narrow the filters to see the rest.</p>}

      <TaskDrawer id={id} onClose={() => setId(null)} onOpenTask={setId} />
    </div>
  );
}
