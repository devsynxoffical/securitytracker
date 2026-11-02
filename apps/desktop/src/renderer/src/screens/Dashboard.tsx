import { CalendarCheck, Megaphone, Plane, Target } from 'lucide-react';
import { http } from '../lib/bridge';
import { useQuery } from '../lib/useQuery';
import { hm, hms, time, relative, dateTime } from '../lib/format';
import type { Activity, Announcement, Me, ShiftSnapshot, TargetProgress } from '../lib/types';
import { Card, Kpi, Progress, Skeleton, Empty, ErrorBanner, Badge, Button } from '../components/ui';

const METRIC_LABEL: Record<string, string> = {
  calls_total: 'Calls',
  calls_connected: 'Connected calls',
  leads_created: 'Leads created',
  leads_qualified: 'Leads qualified',
  meetings_scheduled: 'Meetings',
  closings: 'Closings',
  revenue_won: 'Revenue won',
  emails_sent: 'Emails sent',
  tasks_completed: 'Tasks completed',
  active_hours: 'Active hours',
};

export function Dashboard({ me, shift, onOpen }: { me: Me; shift: ShiftSnapshot | null; onOpen: (s: 'tasks' | 'crm' | 'leave') => void }) {
  const targets = useQuery(() => http.get<TargetProgress[] | { items: TargetProgress[] }>('/targets/me'), [], { intervalMs: 60_000 });
  const followUps = useQuery(() => http.get<{ items: Activity[] }>('/crm/activities/agenda?range=today'), [], { intervalMs: 120_000 });
  const announcements = useQuery(() => http.get<Announcement[] | { items: Announcement[] }>('/hr/announcements'), [], { intervalMs: 300_000 });
  const outToday = useQuery(() => http.get<Array<{ employee?: { firstName: string; lastName: string }; firstName?: string; lastName?: string; leaveType?: { name: string } }>>('/hr/out-today'), [], { intervalMs: 600_000 });

  const targetList = Array.isArray(targets.data) ? targets.data : targets.data?.items ?? [];
  const annList = (Array.isArray(announcements.data) ? announcements.data : announcements.data?.items ?? []).slice(0, 4);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[22px] font-semibold text-ink">
            {greeting}, {me.firstName}
          </div>
          <div className="text-[12.5px] text-ink-2">{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        {shift && !shift.online && <Badge tone="amber" dot>Offline — tracking continues and will sync</Badge>}
      </div>

      <div className="grid grid-cols-4 gap-3.5">
        <Kpi label="Shift timer" value={<span className="text-[30px]">{hms(shift?.durationSeconds ?? 0)}</span>} context={shift?.startedAt ? `Started ${time(shift.startedAt)}` : 'No shift running'} />
        <Kpi label="Active today" value={hm(shift?.activeSeconds ?? 0)} context="input or call/meeting" tone="green" />
        <Kpi label="Idle today" value={hm(shift?.idleSeconds ?? 0)} context="no input over 5 min" tone="amber" />
        <Kpi label="Break" value={hm(shift?.breakSeconds ?? 0)} context={shift?.state === 'ON_BREAK' ? `On ${shift.currentBreakType}` : 'allowance 60 min'} tone="blue" />
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        <Card title={<span className="flex items-center gap-1.5"><Target size={14} /> My targets</span>} className="col-span-2">
          {targets.loading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : targets.error ? (
            <ErrorBanner message="Could not load targets" onRetry={targets.refetch} />
          ) : targetList.length === 0 ? (
            <Empty title="No targets set" body="Your manager has not assigned targets for this period." />
          ) : (
            <div className="space-y-3">
              {targetList.map((t, i) => {
                const pct = t.percent ?? (t.targetValue ? Math.round((Number(t.value) / Number(t.targetValue)) * 100) : 0);
                return (
                  <div key={t.targetId ?? i}>
                    <div className="mb-1 flex items-center justify-between text-[12.5px]">
                      <span className="font-medium text-ink">
                        {METRIC_LABEL[t.metricKey] ?? t.metricKey} <span className="text-ink-3">· {t.period}</span>
                      </span>
                      <span className="font-mono tabular-nums text-ink-2">
                        {Number(t.value)} / {Number(t.targetValue)} <span className={pct >= 100 ? 'text-green' : pct >= 80 ? 'text-amber' : 'text-ink-3'}>({pct}%)</span>
                      </span>
                    </div>
                    <Progress value={pct} tone={pct >= 100 ? 'green' : pct >= 80 ? 'primary' : pct > 0 ? 'amber' : 'gray'} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-1.5"><CalendarCheck size={14} /> Follow-ups today</span>} actions={<Button size="sm" variant="ghost" onClick={() => onOpen('crm')}>Open CRM</Button>}>
          {followUps.loading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-7" />)}</div>
          ) : followUps.error ? (
            <ErrorBanner message="Could not load follow-ups" onRetry={followUps.refetch} />
          ) : !followUps.data?.items.length ? (
            <Empty title="Nothing due today" />
          ) : (
            <ul className="divide-y divide-line-2">
              {followUps.data.items.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center justify-between py-1.5 text-[12.5px]">
                  <span className="truncate text-ink">{a.subject || a.entityName || a.type}</span>
                  <span className="font-mono text-[11px] text-ink-3">{time(a.dueAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        <Card title={<span className="flex items-center gap-1.5"><Megaphone size={14} /> Announcements</span>} className="col-span-2">
          {announcements.loading ? (
            <Skeleton className="h-16" />
          ) : announcements.error ? (
            <ErrorBanner message="Could not load announcements" onRetry={announcements.refetch} />
          ) : annList.length === 0 ? (
            <Empty title="No announcements" />
          ) : (
            <ul className="space-y-2">
              {annList.map((a) => (
                <li key={a.id} className="rounded-lg border border-line-2 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-semibold text-ink">
                      {a.pinned && <Badge tone="violet" className="mr-1.5">Pinned</Badge>}
                      {a.title}
                    </div>
                    <span className="shrink-0 text-[11px] text-ink-3">{relative(a.publishedAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-[12.5px] text-ink-2">{a.body}</p>
                  {!a.read && !a.readAt && (
                    <button type="button" className="mt-1 text-[11.5px] font-semibold text-pri" onClick={() => void http.post(`/hr/announcements/${a.id}/read`).then(() => announcements.refetch())}>
                      Mark as read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-1.5"><Plane size={14} /> Out today</span>} actions={<Button size="sm" variant="ghost" onClick={() => onOpen('leave')}>Leave</Button>}>
          {outToday.loading ? (
            <Skeleton className="h-12" />
          ) : outToday.error ? (
            <ErrorBanner message="Could not load" onRetry={outToday.refetch} />
          ) : !outToday.data?.length ? (
            <Empty title="Everyone is in" />
          ) : (
            <ul className="divide-y divide-line-2">
              {outToday.data.slice(0, 8).map((o, i) => (
                <li key={i} className="flex items-center justify-between py-1.5 text-[12.5px]">
                  <span>{o.employee ? `${o.employee.firstName} ${o.employee.lastName}` : `${o.firstName ?? ''} ${o.lastName ?? ''}`}</span>
                  <Badge tone="violet">{o.leaveType?.name ?? 'Leave'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {shift?.lastSyncAt && <div className="text-right text-[11px] text-ink-3">Last sync {dateTime(shift.lastSyncAt)}</div>}
    </div>
  );
}
