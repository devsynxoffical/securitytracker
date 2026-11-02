import { useMemo } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, Bell, CalendarCheck, Cake, CheckSquare, Clock, Coffee, Inbox, Megaphone, Plane, Target, Timer, TrendingUp, WifiOff } from 'lucide-react';
import { http } from '../lib/bridge';
import { useQuery } from '../lib/useQuery';
import { hm, hms, time, relative, dateTime, date, todayIso } from '../lib/format';
import type { Activity, Announcement, LeaveBalance, Me, NotificationItem, Page, ShiftSnapshot, TargetProgress, Task, TrackingSummary } from '../lib/types';
import type { Screen } from '../shell/Shell';
import { Card, KpiTile, Progress, Skeleton, Empty, ErrorBanner, Badge, Button, PageHeader, StatusDot, Banner, priorityTone } from '../components/ui';

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

function items<T>(x: T[] | Page<T> | { items: T[] } | { balances?: T[] } | undefined): T[] {
  if (Array.isArray(x)) return x;
  if (x && 'items' in x && Array.isArray(x.items)) return x.items;
  if (x && 'balances' in x && Array.isArray(x.balances)) return x.balances;
  return [];
}

function isForbidden(e: unknown): boolean {
  return (e as { status?: number } | null)?.status === 403;
}

function weekStartIso(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

interface Celebration {
  employee?: { id: string; firstName: string; lastName: string };
  firstName?: string;
  lastName?: string;
  type: string;
  date: string;
  years?: number;
}

export function Dashboard({ me, shift, unread, notifications, longIdle, onClaimIdle, onOpen, onBell }: { me: Me; shift: ShiftSnapshot | null; unread: number; notifications: NotificationItem[]; longIdle: { seconds: number } | null; onClaimIdle: (claim: 'break' | 'away_work') => void; onOpen: (s: Screen) => void; onBell: () => void }) {
  const today = todayIso();
  const weekStart = weekStartIso();
  const dueToday = useQuery(() => http.get<Task[] | Page<Task>>('/tasks/my?range=today&limit=50'), [], { intervalMs: 120_000 });
  const overdue = useQuery(() => http.get<Task[] | Page<Task>>('/tasks/my?range=overdue&limit=200'), [], { intervalMs: 120_000 });
  const upcoming = useQuery(() => http.get<Task[] | Page<Task>>('/tasks/my?range=upcoming&limit=200'), [], { intervalMs: 300_000 });
  const balances = useQuery(() => http.get<LeaveBalance[] | { balances: LeaveBalance[] }>(`/hr/leave-balances?employeeId=${me.id}`), [me.id], { intervalMs: 600_000 });
  const week = useQuery(() => http.get<TrackingSummary>(`/tracking/summary?employeeId=${me.id}&from=${weekStart}&to=${today}`), [me.id, weekStart, today], { intervalMs: 300_000 });
  const targets = useQuery(() => http.get<TargetProgress[] | { items: TargetProgress[] }>('/targets/me'), [], { intervalMs: 60_000 });
  const followUps = useQuery(() => http.get<{ items: Activity[] }>('/crm/activities/agenda?range=today'), [], { intervalMs: 120_000 });
  const announcements = useQuery(() => http.get<Announcement[] | { items: Announcement[] }>('/hr/announcements'), [], { intervalMs: 300_000 });
  const outToday = useQuery(() => http.get<Array<{ employee?: { firstName: string; lastName: string }; firstName?: string; lastName?: string; leaveType?: { name: string } }>>('/hr/out-today'), [], { intervalMs: 600_000 });
  const celebrations = useQuery(() => http.get<{ items: Celebration[] }>('/hr/celebrations?days=14'), [], { intervalMs: 3_600_000 });

  const dueList = items(dueToday.data);
  const overdueList = items(overdue.data);
  const openCount = dueList.length + overdueList.length + items(upcoming.data).length;
  const balanceList = items(balances.data);
  const leaveDays = balanceList.reduce((sum, b) => sum + Number(b.availableDays ?? Number(b.entitledDays) + Number(b.carriedOverDays) + Number(b.adjustmentsDays) - Number(b.usedDays) - Number(b.pendingDays)), 0);
  const weekSeconds = week.data?.trackedS ?? (week.data ? (week.data.activeS ?? 0) + (week.data.idleS ?? 0) : 0);
  const targetList = items(targets.data);
  const annList = items(announcements.data).slice(0, 4);
  const celebList = celebrations.data?.items ?? [];
  const recentNotifs = notifications.slice(0, 6);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const state = shift?.state ?? 'OFF_SHIFT';
  const tracking = state === 'WORKING' && (shift?.tracker?.tracking ?? true);
  const activePct = useMemo(() => {
    const total = (shift?.activeSeconds ?? 0) + (shift?.idleSeconds ?? 0);
    return total ? Math.round(((shift?.activeSeconds ?? 0) / total) * 100) : 0;
  }, [shift?.activeSeconds, shift?.idleSeconds]);

  const todayItems = useMemo(() => {
    const tasks = [...overdueList, ...dueList].slice(0, 6).map((t) => ({ id: `t-${t.id}`, kind: 'task' as const, title: t.title, meta: t.list?.space?.name ? `${t.list.space.name} › ${t.list.name}` : t.lead ? `Lead: ${t.lead.name}` : 'Task', at: t.dueAt, overdue: Boolean(t.dueAt && new Date(t.dueAt) < new Date() && t.status !== 'done'), priority: t.priority }));
    const meetings = (followUps.data?.items ?? []).slice(0, 6).map((a) => ({ id: `a-${a.id}`, kind: 'followup' as const, title: a.subject || a.entityName || a.type, meta: a.entityName ? `${a.type} · ${a.entityName}` : a.type, at: a.dueAt, overdue: false, priority: null }));
    return [...tasks, ...meetings];
  }, [overdueList, dueList, followUps.data]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting}, ${me.firstName}`}
        subtitle={state === 'WORKING' ? `On shift since ${time(shift?.startedAt)} · ${tracking ? 'tracking on' : 'tracker not connected'}` : state === 'ON_BREAK' ? `On a ${shift?.currentBreakType?.toLowerCase() ?? 'break'} since ${time(shift?.breakStartedAt)}` : 'No shift running. Start one from the sidebar to begin tracking.'}
        actions={
          shift && !shift.online ? (
            <Badge tone="amber" dot>
              <WifiOff size={12} /> Offline · tracking continues, will sync
            </Badge>
          ) : undefined
        }
      />

      {longIdle && (
        <div className="flex items-center gap-3 rounded-card border border-amber/40 bg-amber-soft/60 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-soft text-amber-text">
            <AlertTriangle size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-ink">You were away for {hm(longIdle.seconds)}</div>
            <div className="text-sm text-ink-2">Tell us how to record this time so your shift stays accurate.</div>
          </div>
          <Button size="sm" onClick={() => onClaimIdle('break')}>Record as break</Button>
          <Button size="sm" variant="primary" onClick={() => onClaimIdle('away_work')}>Working away from PC</Button>
        </div>
      )}

      {/* Hero shift card */}
      <section className={clsx('grid grid-cols-[1.25fr_2fr] overflow-hidden rounded-card border shadow-card', state === 'OFF_SHIFT' ? 'border-line bg-surface' : 'border-pri/30 bg-surface')}>
        <div className={clsx('relative flex flex-col justify-between p-5 text-white', state === 'OFF_SHIFT' ? 'bg-surface-2 text-ink' : 'brand-gradient')}>
          <div className="flex items-center justify-between gap-2">
            <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-semibold uppercase', state === 'OFF_SHIFT' ? 'bg-gray-soft text-ink-2' : 'bg-white/15 text-white ring-1 ring-white/25')}>
              <StatusDot tone={state === 'WORKING' ? 'green' : state === 'ON_BREAK' ? 'amber' : 'gray'} live={state !== 'OFF_SHIFT'} className={state !== 'OFF_SHIFT' ? 'text-white' : undefined} />
              {state === 'WORKING' ? 'Working' : state === 'ON_BREAK' ? 'On break' : 'Off shift'}
            </span>
            <Timer size={15} className={state === 'OFF_SHIFT' ? 'text-ink-3' : 'text-white/70'} />
          </div>
          <div>
            <div className={clsx('font-mono text-4xl font-semibold leading-none', state === 'OFF_SHIFT' ? 'text-ink' : 'text-white')}>{hms(shift?.durationSeconds ?? 0)}</div>
            <div className={clsx('mt-2 text-xs', state === 'OFF_SHIFT' ? 'text-ink-3' : 'text-white/75')}>{state === 'OFF_SHIFT' ? 'Shift timer' : `Started ${time(shift?.startedAt)} · break ${hm(shift?.breakSeconds ?? 0)}`}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-line-2">
          <HeroStat icon={<Clock size={14} />} label="Worked today" value={hm(shift?.durationSeconds ?? 0)} context={shift?.startedAt ? `since ${time(shift.startedAt)}` : 'no shift yet'} />
          <HeroStat icon={<TrendingUp size={14} />} label="Active" value={hm(shift?.activeSeconds ?? 0)} context={<Progress value={activePct} tone={activePct >= 50 ? 'green' : 'amber'} size={4} />} tone="green" />
          <HeroStat icon={<Coffee size={14} />} label="Break" value={hm(shift?.breakSeconds ?? 0)} context={state === 'ON_BREAK' ? `on ${shift?.currentBreakType?.toLowerCase()}` : 'allowance 60 min'} tone={state === 'ON_BREAK' ? 'amber' : undefined} />
        </div>
      </section>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-3.5">
        <KpiTile label="Due today" icon={<CheckSquare size={14} />} loading={dueToday.loading} value={dueList.length} context={overdueList.length ? `${overdueList.length} overdue` : 'nothing overdue'} tone={overdueList.length ? 'red' : undefined} onClick={() => onOpen('tasks')} />
        <KpiTile label="Open tasks" icon={<Target size={14} />} loading={dueToday.loading || overdue.loading || upcoming.loading} value={openCount} context="not done yet" onClick={() => onOpen('tasks')} />
        <KpiTile label="Unread" icon={<Bell size={14} />} value={unread} context={unread ? 'notifications waiting' : 'you are caught up'} tone={unread ? 'blue' : undefined} onClick={onBell} />
        <KpiTile label="Leave balance" icon={<Plane size={14} />} loading={balances.loading} value={balances.error ? '—' : `${Math.round(leaveDays * 10) / 10}`} context={balances.error ? 'could not load' : balanceList.length ? `days across ${balanceList.length} type${balanceList.length === 1 ? '' : 's'}` : 'no leave types yet'} onClick={() => onOpen('leave')} />
        <KpiTile label="This week" icon={<Clock size={14} />} loading={week.loading} value={week.error ? '—' : hm(weekSeconds)} context={week.error ? 'could not load' : `tracked since ${date(weekStart)}`} onClick={() => onOpen('activity')} />
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        <Card title="Today" subtitle="Tasks due and follow-ups" className="col-span-2" padded={false} actions={<Button size="sm" variant="ghost" onClick={() => onOpen('tasks')}>All tasks</Button>}>
          {dueToday.loading || followUps.loading ? (
            <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : dueToday.error && followUps.error ? (
            <div className="p-4"><ErrorBanner message="Could not load today's items" onRetry={() => { void dueToday.refetch(); void followUps.refetch(); }} /></div>
          ) : todayItems.length === 0 ? (
            <Empty compact icon={<CalendarCheck size={18} />} title="Nothing scheduled for today" body="Tasks due today and CRM follow-ups will appear here." />
          ) : (
            <ul className="divide-y divide-line-2">
              {todayItems.map((it) => (
                <li key={it.id}>
                  <button type="button" onClick={() => onOpen(it.kind === 'task' ? 'tasks' : 'crm')} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2">
                    <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', it.kind === 'task' ? 'bg-blue-soft text-blue-text' : 'bg-violet-soft text-violet-text')}>{it.kind === 'task' ? <CheckSquare size={13} /> : <CalendarCheck size={13} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium text-ink">{it.title}</span>
                      <span className="block truncate text-xs text-ink-3">{it.meta}</span>
                    </span>
                    {it.priority && <Badge tone={priorityTone(it.priority)}>{it.priority}</Badge>}
                    <span className={clsx('shrink-0 font-mono text-xs', it.overdue ? 'text-red-text' : 'text-ink-3')}>{it.at ? (it.overdue ? dateTime(it.at) : time(it.at)) : '—'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent notifications" padded={false} actions={<Button size="sm" variant="ghost" onClick={onBell}>Open</Button>}>
          {recentNotifs.length === 0 ? (
            <Empty compact icon={<Inbox size={18} />} title="You are all caught up" body="New mentions, approvals and reminders land here." />
          ) : (
            <ul className="divide-y divide-line-2">
              {recentNotifs.map((n) => (
                <li key={n.id} className="flex gap-2.5 px-4 py-2.5">
                  <span className={clsx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.readAt ? 'bg-gray-bar' : 'bg-pri')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className={clsx('truncate text-sm', n.readAt ? 'text-ink-2' : 'font-semibold text-ink')}>{n.title}</span>
                      <span className="shrink-0 text-2xs normal-case tracking-normal text-ink-3">{relative(n.createdAt)}</span>
                    </div>
                    <div className="line-clamp-1 text-xs text-ink-3">{n.body}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        <Card title="My targets" subtitle="This period" className="col-span-2">
          {targets.loading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : targets.error ? (
            <ErrorBanner message="Could not load targets" onRetry={targets.refetch} />
          ) : targetList.length === 0 ? (
            <Empty compact icon={<Target size={18} />} title="No targets set" body="Your manager has not assigned targets for this period." />
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {targetList.map((t, i) => {
                const pct = t.percent ?? (t.targetValue ? Math.round((Number(t.value) / Number(t.targetValue)) * 100) : 0);
                return (
                  <div key={t.targetId ?? i}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-ink">
                        {METRIC_LABEL[t.metricKey] ?? t.metricKey} <span className="text-ink-3">· {t.period}</span>
                      </span>
                      <span className="font-mono text-xs text-ink-2">
                        {Number(t.value)} / {Number(t.targetValue)} <span className={pct >= 100 ? 'text-green-text' : pct >= 80 ? 'text-amber-text' : 'text-ink-3'}>({pct}%)</span>
                      </span>
                    </div>
                    <Progress value={pct} tone={pct >= 100 ? 'green' : pct >= 80 ? 'primary' : pct > 0 ? 'amber' : 'gray'} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Out today" padded={false} actions={<Button size="sm" variant="ghost" onClick={() => onOpen('leave')}>Leave</Button>}>
          {outToday.loading ? (
            <div className="p-4"><Skeleton className="h-12" /></div>
          ) : outToday.error ? (
            <div className="p-4"><ErrorBanner message="Could not load" onRetry={outToday.refetch} /></div>
          ) : !outToday.data?.length ? (
            <Empty compact icon={<Plane size={18} />} title="Everyone is in" body="Colleagues on leave today show up here." />
          ) : (
            <ul className="divide-y divide-line-2">
              {outToday.data.slice(0, 8).map((o, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="truncate text-ink">{o.employee ? `${o.employee.firstName} ${o.employee.lastName}` : `${o.firstName ?? ''} ${o.lastName ?? ''}`}</span>
                  <Badge tone="violet">{o.leaveType?.name ?? 'Leave'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        <Card title="Announcements" className={clsx(celebrations.error && isForbidden(celebrations.error) ? 'col-span-3' : 'col-span-2')} padded={false}>
          {announcements.loading ? (
            <div className="p-4"><Skeleton className="h-16" /></div>
          ) : announcements.error ? (
            <div className="p-4"><ErrorBanner message="Could not load announcements" onRetry={announcements.refetch} /></div>
          ) : annList.length === 0 ? (
            <Empty compact icon={<Megaphone size={18} />} title="No announcements" body="Company news from HR and your managers appears here." />
          ) : (
            <ul className="divide-y divide-line-2">
              {annList.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5 text-base font-semibold text-ink">
                      {a.pinned && <Badge tone="violet">Pinned</Badge>}
                      <span className="truncate">{a.title}</span>
                    </div>
                    <span className="shrink-0 text-2xs normal-case tracking-normal text-ink-3">{relative(a.publishedAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-ink-2">{a.body}</p>
                  {!a.read && !a.readAt && (
                    <button type="button" className="mt-1.5 rounded text-xs font-semibold text-pri hover:underline" onClick={() => void http.post(`/hr/announcements/${a.id}/read`).then(() => announcements.refetch())}>
                      Mark as read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {!(celebrations.error && isForbidden(celebrations.error)) && (
          <Card title="Celebrations" subtitle="Next 14 days" padded={false}>
            {celebrations.loading ? (
              <div className="p-4"><Skeleton className="h-12" /></div>
            ) : celebrations.error ? (
              <div className="p-4"><ErrorBanner message="Could not load" onRetry={celebrations.refetch} /></div>
            ) : celebList.length === 0 ? (
              <Empty compact icon={<Cake size={18} />} title="Nothing coming up" body="Birthdays and work anniversaries show here." />
            ) : (
              <ul className="divide-y divide-line-2">
                {celebList.slice(0, 6).map((c, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{c.employee ? `${c.employee.firstName} ${c.employee.lastName}` : `${c.firstName ?? ''} ${c.lastName ?? ''}`}</span>
                      <span className="block text-xs text-ink-3">{c.type === 'anniversary' ? `${c.years ?? ''} year${c.years === 1 ? '' : 's'} anniversary`.trim() : 'Birthday'}</span>
                    </span>
                    <span className="font-mono text-xs text-ink-2">{date(c.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {shift?.lastSyncAt && (
        <Banner tone="primary" className="text-xs">
          Last sync {dateTime(shift.lastSyncAt)}
          {shift.pendingEvents + shift.queuedSegments > 0 ? ` · ${shift.pendingEvents + shift.queuedSegments} items queued` : ' · everything is uploaded'}
        </Banner>
      )}
    </div>
  );
}

function HeroStat({ icon, label, value, context, tone }: { icon: React.ReactNode; label: string; value: string; context: React.ReactNode; tone?: 'green' | 'amber' }) {
  return (
    <div className="flex flex-col justify-between p-5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-3">
        {icon} {label}
      </div>
      <div className={clsx('mt-3 font-mono text-2xl font-semibold', tone === 'green' ? 'text-green-text' : tone === 'amber' ? 'text-amber-text' : 'text-ink')}>{value}</div>
      <div className="mt-1.5 text-xs text-ink-2">{context}</div>
    </div>
  );
}
