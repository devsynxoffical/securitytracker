import { useState } from 'react';
import { CheckSquare, MessageSquare, Clock, Circle, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import { http, errorMessage } from '../lib/bridge';
import { useQuery } from '../lib/useQuery';
import { dateTime, hm, fullName, relative, isToday, time } from '../lib/format';
import type { Page, Task, TaskComment } from '../lib/types';
import { Badge, Button, Card, Empty, ErrorBanner, SkeletonRows, Select, Modal, Row, priorityTone, statusTone, Tabs, PageHeader } from '../components/ui';

type Range = 'today' | 'overdue' | 'upcoming' | 'nodate' | 'done';
const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'nodate', label: 'No date' },
  { value: 'done', label: 'Done' },
];
const EMPTY: Record<Range, { title: string; body: string }> = {
  overdue: { title: 'Nothing overdue', body: 'You are up to date. Overdue tasks assigned to you will show here.' },
  today: { title: 'Nothing due today', body: 'Tasks with a due date of today appear here.' },
  upcoming: { title: 'Nothing coming up', body: 'Tasks due later this week and beyond appear here.' },
  nodate: { title: 'No undated tasks', body: 'Tasks assigned to you without a due date appear here.' },
  done: { title: 'Nothing completed yet', body: 'Tasks you finish move here.' },
};

function items<T>(x: T[] | Page<T> | undefined): T[] {
  return Array.isArray(x) ? x : x?.items ?? [];
}

/** FR-TASK-04/13: My Tasks grouped by due; status change by the assignee (F11 rule). */
export function TasksScreen({ online }: { online: boolean }) {
  const [range, setRange] = useState<Range>('today');
  const [selected, setSelected] = useState<Task | null>(null);
  const list = useQuery(() => http.get<Task[] | Page<Task>>(`/tasks/my?range=${range}&limit=200`), [range], { intervalMs: 60_000 });
  const tasks = items(list.data);

  return (
    <div>
      <PageHeader title="My tasks" subtitle="Everything assigned to you, grouped by due date." actions={!online ? <Badge tone="amber" dot>Offline · read-only</Badge> : undefined} />
      <Tabs value={range} onChange={setRange} tabs={RANGES.map((r) => (r.value === range ? { ...r, count: list.loading ? undefined : tasks.length } : r))} className="mb-4" />
      <Card padded={false}>
        {list.loading ? (
          <div className="p-4"><SkeletonRows rows={6} /></div>
        ) : list.error ? (
          <div className="p-4"><ErrorBanner message={errorMessage(list.error)} onRetry={list.refetch} /></div>
        ) : tasks.length === 0 ? (
          <Empty icon={<CheckSquare size={22} />} title={EMPTY[range].title} body={EMPTY[range].body} />
        ) : (
          <ul className="divide-y divide-line-2">
            {tasks.map((t) => {
              const late = Boolean(t.dueAt && new Date(t.dueAt) < new Date() && t.status !== 'done');
              const done = t.status === 'done';
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => setSelected(t)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2">
                    <span className={clsx('shrink-0', done ? 'text-green-text' : 'text-ink-3')}>{done ? <CheckCircle2 size={16} /> : <Circle size={16} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className={clsx('block truncate text-base font-medium', done ? 'text-ink-3 line-through' : 'text-ink')}>{t.title}</span>
                      <span className="block truncate text-xs text-ink-3">{t.list?.space?.name ? `${t.list.space.name} › ${t.list.name}` : t.lead ? `Lead: ${t.lead.name}` : 'CRM follow-ups'}</span>
                    </span>
                    <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                    <span className={clsx('w-[112px] shrink-0 text-right font-mono text-xs', late ? 'text-red-text' : 'text-ink-3')}>{t.dueAt ? (isToday(t.dueAt) ? `Today ${time(t.dueAt)}` : dateTime(t.dueAt)) : '—'}</span>
                    <Badge tone={statusTone(t.status)} className="w-[92px] justify-center">{t.statusRef?.name ?? t.status.replace('_', ' ')}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {selected && <TaskDrawer task={selected} online={online} onClose={() => setSelected(null)} onChanged={() => void list.refetch()} />}
    </div>
  );
}

function TaskDrawer({ task, online, onClose, onChanged }: { task: Task; online: boolean; onClose: () => void; onChanged: () => void }) {
  const detail = useQuery(() => http.get<Task & { statuses?: Array<{ id: string; name: string; group: string }>; list?: Task['list'] & { statuses?: Array<{ id: string; name: string; group: string }> }; comments?: TaskComment[] }>(`/tasks/${task.id}`), [task.id]);
  const comments = useQuery(() => http.get<TaskComment[] | Page<TaskComment>>(`/tasks/${task.id}/comments`), [task.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = detail.data ?? task;
  const statuses = detail.data?.list?.statuses ?? detail.data?.statuses ?? [];

  const setStatus = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const body = statuses.length ? { statusId: value } : { status: value };
      await http.post(`/tasks/${task.id}/status`, body);
      await detail.refetch();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={d.title} subtitle={d.list?.space?.name ? `${d.list.space.name} › ${d.list.name}` : d.lead ? `Lead: ${d.lead.name}` : undefined} width={640} footer={<Button onClick={onClose}>Close</Button>}>
      {error && <ErrorBanner message={error} className="mb-3" />}
      <div className="grid grid-cols-2 gap-x-6">
        <div>
          <Row label="Status">
            <Select value={statuses.length ? d.statusId ?? '' : d.status} disabled={busy || !online} onChange={(e) => void setStatus(e.target.value)} className="h-8 w-44 text-xs" aria-label="Status">
              {statuses.length
                ? statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                : ['todo', 'in_progress', 'done', 'cancelled'].map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
            </Select>
          </Row>
          <Row label="Priority">
            <Badge tone={priorityTone(d.priority)}>{d.priority}</Badge>
          </Row>
          <Row label="Due">
            <span className="font-mono text-xs">{d.dueAt ? dateTime(d.dueAt) : '—'}</span>
          </Row>
          <Row label="Start">
            <span className="font-mono text-xs">{d.startAt ? dateTime(d.startAt) : '—'}</span>
          </Row>
        </div>
        <div>
          <Row label="Assignees">{d.assignees?.length ? d.assignees.map((a) => fullName(a.employee)).join(', ') : '—'}</Row>
          <Row label="Estimate">
            <span className="font-mono text-xs">{d.timeEstimateS ? hm(d.timeEstimateS) : '—'}</span>
          </Row>
          <Row label="Time spent">
            <span className="font-mono text-xs">{hm(d.timeSpentS ?? 0)}</span>
          </Row>
          <Row label="List">{d.list?.space?.name ? `${d.list.space.name} › ${d.list.name}` : d.lead ? `Lead: ${d.lead.name}` : '—'}</Row>
        </div>
      </div>
      {d.description && <div className="mt-3 whitespace-pre-line rounded-card border border-line bg-surface-2 p-3 text-sm leading-relaxed text-ink-2">{d.description}</div>}
      <div className="mt-5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-2">
          <MessageSquare size={13} /> Comments
        </div>
        {comments.loading ? (
          <SkeletonRows rows={2} />
        ) : comments.error ? (
          <ErrorBanner message={errorMessage(comments.error)} onRetry={comments.refetch} />
        ) : items(comments.data).length === 0 ? (
          <div className="rounded-card border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">No comments yet.</div>
        ) : (
          <ul className="space-y-2">
            {items(comments.data).map((c) => (
              <li key={c.id} className="rounded-card border border-line-2 bg-surface-2/50 p-3 text-sm">
                <div className="mb-1 flex justify-between text-xs text-ink-3">
                  <span className="font-medium text-ink-2">{c.author ? fullName(c.author) : 'Team member'}</span>
                  <span className="inline-flex items-center gap-1"><Clock size={11} /> {relative(c.createdAt)}</span>
                </div>
                <div className="whitespace-pre-line leading-relaxed text-ink">{c.body}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!online && <div className="mt-3 text-xs text-amber-text">Offline: tasks are read-only until the connection returns.</div>}
    </Modal>
  );
}
