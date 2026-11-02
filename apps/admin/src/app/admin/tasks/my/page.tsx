'use client';

import { Suspense } from 'react';
import { CheckSquare } from 'lucide-react';
import { useIdParam } from '@/lib/useIdParam';
import { useMyTasks } from '@/lib/queries/tasks';
import { Card, Skeleton, EmptyState, ErrorBanner, PageHeader, Badge } from '@/components/ui';
import { TaskDrawer, TaskRow } from '@/components/tasks/shared';

export default function MyTasksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <MyTasks />
    </Suspense>
  );
}

const SECTIONS: Array<{ range: string; label: string; tone: 'red' | 'amber' | 'blue' | 'gray' | 'green' }> = [
  { range: 'overdue', label: 'Overdue', tone: 'red' },
  { range: 'today', label: 'Today', tone: 'amber' },
  { range: 'upcoming', label: 'Upcoming', tone: 'blue' },
  { range: 'nodate', label: 'No date', tone: 'gray' },
  { range: 'done', label: 'Done', tone: 'green' },
];

function MyTasks() {
  const [id, setId] = useIdParam();
  return (
    <div>
      <PageHeader title="My Tasks" subtitle="Everything assigned to you across spaces (FR-TASK-13)" />
      <div className="space-y-4">
        {SECTIONS.map((s) => <Section key={s.range} range={s.range} label={s.label} tone={s.tone} onOpen={setId} />)}
      </div>
      <TaskDrawer id={id} onClose={() => setId(null)} onOpenTask={setId} />
    </div>
  );
}

function Section({ range, label, tone, onOpen }: { range: string; label: string; tone: 'red' | 'amber' | 'blue' | 'gray' | 'green'; onOpen: (id: string) => void }) {
  const q = useMyTasks(range);
  return (
    <Card title={<span className="flex items-center gap-2">{label} {q.data && <Badge tone={tone}>{q.data.items.length}</Badge>}</span>}>
      {q.isLoading && <div className="space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.items.length === 0 && <EmptyState icon={<CheckSquare size={20} />} title={range === 'done' ? 'Nothing completed yet' : 'Nothing here'} body={range === 'overdue' ? 'No overdue tasks. Keep it that way.' : undefined} />}
      {q.data && q.data.items.length > 0 && <div className="-mx-4 -mb-4 border-t border-line-2">{q.data.items.map((t) => <TaskRow key={t.id} task={t} onOpen={() => onOpen(t.id)} showList />)}</div>}
    </Card>
  );
}
