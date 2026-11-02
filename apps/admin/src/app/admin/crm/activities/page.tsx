'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Phone, CalendarClock, CheckSquare, Check, X } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAgenda, useCrmMutation, useEmployees, type Activity } from '@/lib/queries/crm';
import { Card, Tabs, Badge, Skeleton, EmptyState, ErrorBanner, Select, Button, useToast, PageHeader } from '@/components/ui';
import { OwnerFilter } from '@/components/crm/shared';
import { dateTime, relative, titleCase, fullName } from '@/lib/format';

type Range = 'today' | 'overdue' | 'upcoming' | 'done';
const icons: Record<string, React.ReactNode> = { call: <Phone size={14} />, meeting: <CalendarClock size={14} />, task: <CheckSquare size={14} /> };
const hrefFor = (a: Activity) => `/admin/crm/${a.entityType === 'lead' ? 'leads' : `${a.entityType}s`}?id=${a.entityId}`;

export default function ActivitiesPage() {
  const { me } = useAuth();
  const toast = useToast();
  const [range, setRange] = useState<Range>('today');
  const [ownerId, setOwnerId] = useState('');
  const [type, setType] = useState('');
  const q = useAgenda(range, ownerId || undefined);
  const employees = useEmployees();
  const setStatus = useCrmMutation((a: { id: string; status: string }) => http.patch(`/crm/activities/${a.id}`, { status: a.status }), [['activities'], ['crm', 'dashboard']]);
  const items = (q.data?.items ?? []).filter((a) => !type || a.type === type);
  const actorName = (id: string | null) => (id === me?.id ? 'You' : fullName(employees.data?.find((e) => e.id === id)));

  const grouped = items.reduce<Record<string, Activity[]>>((acc, a) => {
    const key = range === 'done' ? (a.completedAt ?? a.occurredAt).slice(0, 10) : (a.dueAt ?? a.occurredAt).slice(0, 10);
    (acc[key] ??= []).push(a);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader title="Activities" subtitle="Planned calls, meetings and tasks across leads, contacts, accounts and deals." actions={<>
        <div className="w-48"><OwnerFilter value={ownerId} onChange={setOwnerId} /></div>
        <div className="w-36"><Select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option><option value="call">Calls</option><option value="meeting">Meetings</option><option value="task">Tasks</option></Select></div>
      </>} />
      <Card>
        <Tabs value={range} onChange={setRange} className="px-3" tabs={[{ value: 'today', label: 'Today' }, { value: 'overdue', label: 'Overdue' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'done', label: 'Done' }]} />
        {q.isLoading && <div className="space-y-2 p-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && items.length === 0 && <EmptyState icon={range === 'overdue' ? <Check size={28} strokeWidth={1.75} /> : undefined} title={range === 'overdue' ? 'Nothing overdue' : range === 'today' ? 'Nothing planned for today' : range === 'done' ? 'No completed items yet' : 'Nothing upcoming'} body="Plan calls, meetings and tasks from any record’s Activities tab." />}
        {Object.entries(grouped).map(([day, list]) => (
          <div key={day}>
            <div className="bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">{new Date(day).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })}</div>
            <ul className="divide-y divide-line-2">
              {list.map((a) => {
                const overdue = a.status === 'planned' && a.dueAt && new Date(a.dueAt).getTime() < Date.now();
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    {a.status === 'planned' ? (
                      <button type="button" aria-label="Mark done" onClick={() => setStatus.mutate({ id: a.id, status: 'done' }, { onError: (e) => toast.push('error', (e as Error).message) })} className="flex h-5 w-5 items-center justify-center rounded border border-line bg-surface text-transparent hover:border-pri hover:text-pri"><Check size={13} /></button>
                    ) : <span className="flex h-5 w-5 items-center justify-center rounded border border-green bg-green-soft text-green"><Check size={13} /></span>}
                    <span className="text-ink-3">{icons[a.type] ?? <CheckSquare size={14} />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[13px]"><span className="font-semibold text-ink">{a.subject ?? titleCase(a.type)}</span>{overdue && <Badge tone="red">Overdue</Badge>}{a.status === 'cancelled' && <Badge tone="gray">Cancelled</Badge>}</div>
                      <div className="truncate text-xs text-ink-3">{titleCase(a.type)} · <Link className="text-pri hover:underline" href={hrefFor(a)}>{a.entityName ?? titleCase(a.entityType)}</Link> · {actorName(a.actorId)}{a.body ? ` · ${a.body}` : ''}</div>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-ink-2" title={dateTime(a.dueAt ?? a.occurredAt)}>{range === 'done' ? relative(a.completedAt) : a.dueAt ? new Date(a.dueAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                    {a.status === 'planned' && <Button size="sm" variant="ghost" aria-label="Cancel" onClick={() => setStatus.mutate({ id: a.id, status: 'cancelled' })}><X size={13} /></Button>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </Card>
    </div>
  );
}
