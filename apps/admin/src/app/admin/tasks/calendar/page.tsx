'use client';

import { Suspense, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useIdParam } from '@/lib/useIdParam';
import { useTasks, useSpaces, useTaskMutation, type Task } from '@/lib/queries/tasks';
import { useEmployees } from '@/lib/queries/crm';
import { http } from '@/lib/api';
import { Button, Select, Skeleton, EmptyState, ErrorBanner, PageHeader, useToast } from '@/components/ui';
import { TaskDrawer } from '@/components/tasks/shared';
import { MonthGrid, monthRange } from '@/components/tasks/calendar/MonthGrid';

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
  const toast = useToast();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() });
  const [spaceId, setSpaceId] = useState('');
  const [listId, setListId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  const range = useMemo(() => monthRange(cursor.year, cursor.month), [cursor]);
  const params = {
    dueFrom: range.from.toISOString(),
    dueTo: range.to.toISOString(),
    limit: 200,
    ...(spaceId ? { spaceId } : {}),
    ...(listId ? { listId } : {}),
    ...(assigneeId ? { assigneeId } : {}),
  };
  const tasks = useTasks(params);
  const spaces = useSpaces();
  const employees = useEmployees();
  const lists = spaces.data?.find((s) => s.id === spaceId)?.lists ?? [];

  const move = useTaskMutation(({ taskId, day, task }: { taskId: string; day: string; task: Task }) => {
    // keep the original time of day, change only the date
    const prev = task.dueAt ? new Date(task.dueAt) : new Date(Date.UTC(cursor.year, cursor.month, 1, 17, 0, 0));
    const next = new Date(`${day}T${prev.toISOString().slice(11)}`);
    return http.patch(`/tasks/${taskId}`, { dueAt: next.toISOString() });
  });

  const onMove = (taskId: string, day: string) => {
    const task = tasks.data?.items.find((t) => t.id === taskId);
    if (!task || (task.dueAt && task.dueAt.slice(0, 10) === day)) return;
    move.mutate({ taskId, day, task }, {
      onSuccess: () => toast.push('success', `"${task.title}" is now due ${day}`),
      onError: (e) => toast.push('error', (e as Error).message),
    });
  };

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };
  const today = now.toISOString().slice(0, 10);
  const count = tasks.data?.items.filter((t) => t.dueAt).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Tasks by due date. Drag a task to another day to reschedule it (FR-TASK-12)."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={14} /></Button>
            <span className="min-w-[150px] text-center text-[13px] font-semibold text-ink">{MONTHS[cursor.month]} {cursor.year}</span>
            <Button variant="default" size="sm" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={14} /></Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor({ year: now.getUTCFullYear(), month: now.getUTCMonth() })}>Today</Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={spaceId} onChange={(e) => { setSpaceId(e.target.value); setListId(''); }} className="w-48">
          <option value="">All spaces</option>
          {(spaces.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={listId} onChange={(e) => setListId(e.target.value)} className="w-48" disabled={!spaceId}>
          <option value="">All lists</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
        <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="w-52">
          <option value="">Any assignee</option>
          {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
        </Select>
        <span className="ml-auto text-[12px] text-ink-3">{tasks.data ? `${count} task${count === 1 ? '' : 's'} with a due date this month` : ''}</span>
      </div>

      {tasks.isLoading && <Skeleton className="h-[560px]" />}
      {tasks.isError && <ErrorBanner message={(tasks.error as Error).message} onRetry={() => tasks.refetch()} />}
      {tasks.data && count === 0 && (
        <EmptyState icon={<CalendarDays size={20} />} title="No tasks due this month" body="Tasks with a due date in this month appear here. Set due dates from the task drawer." />
      )}
      {tasks.data && count > 0 && (
        <MonthGrid year={cursor.year} month={cursor.month} tasks={tasks.data.items} onOpen={setId} onMove={onMove} today={today} />
      )}
      {tasks.data && tasks.data.nextCursor && (
        <p className="mt-2 text-[11.5px] text-amber">Showing the first 200 tasks of this month. Narrow the filters to see the rest.</p>
      )}

      <TaskDrawer id={id} onClose={() => setId(null)} onOpenTask={setId} />
    </div>
  );
}
