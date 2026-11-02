import { useState } from 'react';
import { CheckSquare, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { http, errorMessage } from '../lib/bridge';
import { useQuery } from '../lib/useQuery';
import { dateTime, hm, fullName, relative } from '../lib/format';
import type { Page, Task, TaskComment } from '../lib/types';
import { Badge, Button, Card, Empty, ErrorBanner, SkeletonRows, Select, Modal, Row, priorityTone, statusTone, Tabs } from '../components/ui';

type Range = 'today' | 'overdue' | 'upcoming' | 'nodate' | 'done';
const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'nodate', label: 'No date' },
  { value: 'done', label: 'Done' },
];

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
    <div className="space-y-3">
      <Tabs value={range} onChange={setRange} tabs={RANGES} />
      <Card>
        {list.loading ? (
          <SkeletonRows />
        ) : list.error ? (
          <ErrorBanner message={errorMessage(list.error)} onRetry={list.refetch} />
        ) : tasks.length === 0 ? (
          <Empty icon={<CheckSquare size={28} />} title={range === 'done' ? 'Nothing completed yet' : 'No tasks here'} body={range === 'overdue' ? 'You are up to date.' : undefined} />
        ) : (
          <ul className="divide-y divide-line-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                <button type="button" onClick={() => setSelected(t)} className="min-w-0 flex-1 text-left">
                  <div className={clsx('truncate text-[13px] font-medium', t.status === 'done' ? 'text-ink-3 line-through' : 'text-ink')}>{t.title}</div>
                  <div className="truncate text-[11.5px] text-ink-3">
                    {t.list?.space?.name ? `${t.list.space.name} › ${t.list.name}` : t.lead ? `Lead: ${t.lead.name}` : 'CRM follow-ups'}
                  </div>
                </button>
                <span className={clsx('font-mono text-[11.5px]', t.dueAt && new Date(t.dueAt) < new Date() && t.status !== 'done' ? 'text-red' : 'text-ink-3')}>{t.dueAt ? dateTime(t.dueAt) : '—'}</span>
                <Badge tone={statusTone(t.status)}>{t.statusRef?.name ?? t.status.replace('_', ' ')}</Badge>
              </li>
            ))}
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
    <Modal open onClose={onClose} title={d.title} width={620}>
      {error && <ErrorBanner message={error} />}
      <div className="grid grid-cols-2 gap-x-6">
        <div>
          <Row label="Status">
            <Select value={statuses.length ? d.statusId ?? '' : d.status} disabled={busy || !online} onChange={(e) => void setStatus(e.target.value)} className="h-8 w-44 text-[12px]">
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
          <Row label="Due">{d.dueAt ? dateTime(d.dueAt) : '—'}</Row>
          <Row label="Start">{d.startAt ? dateTime(d.startAt) : '—'}</Row>
        </div>
        <div>
          <Row label="Assignees">{d.assignees?.length ? d.assignees.map((a) => fullName(a.employee)).join(', ') : '—'}</Row>
          <Row label="Estimate">{d.timeEstimateS ? hm(d.timeEstimateS) : '—'}</Row>
          <Row label="Time spent">{hm(d.timeSpentS ?? 0)}</Row>
          <Row label="List">{d.list?.space?.name ? `${d.list.space.name} › ${d.list.name}` : d.lead ? `Lead: ${d.lead.name}` : '—'}</Row>
        </div>
      </div>
      {d.description && <div className="mt-3 whitespace-pre-line rounded-lg bg-surface-2 p-3 text-[12.5px] text-ink-2">{d.description}</div>}
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
          <MessageSquare size={13} /> Comments
        </div>
        {comments.loading ? (
          <SkeletonRows rows={2} />
        ) : comments.error ? (
          <ErrorBanner message={errorMessage(comments.error)} onRetry={comments.refetch} />
        ) : items(comments.data).length === 0 ? (
          <div className="text-[12px] text-ink-3">No comments yet.</div>
        ) : (
          <ul className="space-y-2">
            {items(comments.data).map((c) => (
              <li key={c.id} className="rounded-lg border border-line-2 p-2.5 text-[12.5px]">
                <div className="mb-0.5 flex justify-between text-[11px] text-ink-3">
                  <span>{c.author ? fullName(c.author) : 'Team member'}</span>
                  <span>{relative(c.createdAt)}</span>
                </div>
                <div className="whitespace-pre-line text-ink">{c.body}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!online && <div className="mt-3 text-[11.5px] text-amber">Offline: tasks are read-only until the connection returns.</div>}
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
