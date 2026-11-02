'use client';

import { Suspense, useMemo, useState } from 'react';
import { CheckSquare, ChevronDown, ChevronRight, AlertTriangle, CalendarClock, Loader, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useMyTasks, type Task } from '@/lib/queries/tasks';
import { Card, Skeleton, EmptyState, ErrorBanner, PageHeader } from '@/components/ui';
import { KpiTile } from '@/components/ui/advanced';
import { TaskDrawer, TaskRow } from '@/components/tasks/shared';

export default function MyTasksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <MyTasks />
    </Suspense>
  );
}

const SECTIONS: Array<{ range: string; label: string; tone: 'red' | 'amber' | 'blue' | 'gray' | 'green'; hint?: string }> = [
  { range: 'overdue', label: 'Overdue', tone: 'red', hint: 'No overdue tasks. Keep it that way.' },
  { range: 'today', label: 'Today', tone: 'amber', hint: 'Nothing due today.' },
  { range: 'upcoming', label: 'Upcoming', tone: 'blue', hint: 'Nothing scheduled ahead.' },
  { range: 'nodate', label: 'No date', tone: 'gray', hint: 'Every task has a date.' },
  { range: 'done', label: 'Done', tone: 'green', hint: 'Nothing completed yet.' },
];

function MyTasks() {
  const [id, setId] = useIdParam();
  const { me } = useAuth();
  const overdue = useMyTasks('overdue');
  const today = useMyTasks('today');
  const upcoming = useMyTasks('upcoming');
  const nodate = useMyTasks('nodate');
  const done = useMyTasks('done');

  const kpis = useMemo(() => {
    const open = [...(today.data?.items ?? []), ...(upcoming.data?.items ?? []), ...(nodate.data?.items ?? []), ...(overdue.data?.items ?? [])];
    const inProgress = open.filter((t) => t.status === 'in_progress').length;
    const weekAgo = Date.now() - 7 * 86400e3;
    const doneItems = done.data?.items ?? [];
    const doneWeek = doneItems.filter((t) => t.completedAt && new Date(t.completedAt).getTime() >= weekAgo).length;
    const trend = Array.from({ length: 7 }, (_, i) => {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); dayStart.setDate(dayStart.getDate() - (6 - i));
      const dayEnd = dayStart.getTime() + 86400e3;
      return doneItems.filter((t) => t.completedAt && new Date(t.completedAt).getTime() >= dayStart.getTime() && new Date(t.completedAt).getTime() < dayEnd).length;
    });
    return { inProgress, doneWeek, trend };
  }, [today.data, upcoming.data, nodate.data, overdue.data, done.data]);

  const loading = overdue.isLoading || today.isLoading;
  const queries = { overdue, today, upcoming, nodate, done };

  return (
    <div>
      <PageHeader title={me ? `Good ${greeting()}, ${me.firstName}` : 'My Tasks'} subtitle="Everything assigned to you across spaces" />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Overdue" value={overdue.data?.items.length ?? '—'} tone={(overdue.data?.items.length ?? 0) > 0 ? 'red' : 'green'} icon={<AlertTriangle size={14} />} loading={loading} />
        <KpiTile label="Due today" value={today.data?.items.length ?? '—'} tone="amber" icon={<CalendarClock size={14} />} loading={loading} />
        <KpiTile label="In progress" value={kpis.inProgress} tone="blue" icon={<Loader size={14} />} loading={loading} />
        <KpiTile label="Done this week" value={kpis.doneWeek} trend={kpis.trend} series={2} icon={<CheckCircle2 size={14} />} loading={done.isLoading} deltaLabel="completed per day" />
      </div>
      <div className="space-y-3">
        {SECTIONS.map((s) => <Section key={s.range} {...s} query={queries[s.range as keyof typeof queries]} onOpen={setId} defaultOpen={s.range !== 'done'} />)}
      </div>
      <TaskDrawer id={id} onClose={() => setId(null)} onOpenTask={setId} />
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}

const TONE_PILL: Record<string, string> = { red: 'bg-red-soft text-red-text', amber: 'bg-amber-soft text-amber-text', blue: 'bg-blue-soft text-blue-text', gray: 'bg-gray-soft text-gray', green: 'bg-green-soft text-green-text' };

function Section({ range, label, tone, hint, query, onOpen, defaultOpen }: { range: string; label: string; tone: 'red' | 'amber' | 'blue' | 'gray' | 'green'; hint?: string; query: ReturnType<typeof useMyTasks>; onOpen: (id: string) => void; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const items: Task[] = query.data?.items ?? [];
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        {open ? <ChevronDown size={14} className="text-ink-3" /> : <ChevronRight size={14} className="text-ink-3" />}
        <span className="text-base font-semibold text-ink">{label}</span>
        {query.data && <span className={clsx('rounded-full px-2 py-0.5 font-mono text-xs font-semibold', TONE_PILL[tone])}>{items.length}</span>}
      </button>
      {open && (
        <div className="border-t border-line-2">
          {query.isLoading && <div className="space-y-px p-3"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>}
          {query.isError && <ErrorBanner message={(query.error as Error).message} onRetry={() => query.refetch()} />}
          {query.data && items.length === 0 && <EmptyState icon={<CheckSquare size={20} />} title={hint ?? 'Nothing here'} />}
          {items.map((t) => <TaskRow key={t.id} task={t} onOpen={() => onOpen(t.id)} showList canToggle />)}
          {range === 'done' && items.length > 0 && <div className="px-3 py-2 text-xs text-ink-3">Showing your most recently completed tasks.</div>}
        </div>
      )}
    </Card>
  );
}
