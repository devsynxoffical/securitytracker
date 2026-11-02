'use client';

import { Suspense, useMemo } from 'react';
import { Clock, Keyboard, MousePointerClick, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTimelineDetail } from '@/lib/queries/tracking';
import { Card, Skeleton, EmptyState, ErrorBanner, PageHeader, Badge, Avatar } from '@/components/ui';
import { KpiTile, Section } from '@/components/ui/advanced';
import { BarList, Donut } from '@/components/ui/charts';
import { useEmployees } from '@/lib/queries/crm';
import { EmployeePicker, TimelineBar, DateNav, duration, clock, isoToday } from '@/components/tracking/shared';
import { useIdParam } from '@/lib/useIdParam';
import { fullName } from '@/lib/format';

export default function TimelinePage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <TimelineInner />
    </Suspense>
  );
}

function TimelineInner() {
  const { me } = useAuth();
  const [employeeParam, setEmployee] = useIdParam('employeeId');
  const [dateParam, setDate] = useIdParam('date');
  const employeeId = employeeParam ?? me?.id ?? '';
  const date = dateParam ?? isoToday();
  const q = useTimelineDetail(employeeId, date);
  const employees = useEmployees();
  const person = employees.data?.find((e) => e.id === employeeId);
  const d = q.data;

  const totals = useMemo(() => (d?.segments ?? []).reduce((a, s) => ({ ...a, [s.kind]: (a[s.kind] ?? 0) + s.durationS, keys: a.keys + s.keyCount, clicks: a.clicks + s.mouseCount }), { active: 0, idle: 0, locked: 0, keys: 0, clicks: 0 } as Record<string, number>), [d]);
  const domains = useMemo(() => {
    const m = new Map<string, number>();
    (d?.segments ?? []).filter((s) => s.kind === 'active' && s.domain && s.domain !== 'unknown' && s.domain !== 'excluded').forEach((s) => m.set(s.domain!, (m.get(s.domain!) ?? 0) + s.durationS));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
  }, [d]);
  const apps = (d?.apps ?? []).slice(0, 10).map((a) => ({ label: a.appName, value: a.activeS, meta: a.processName }));
  const activePct = totals.active + totals.idle > 0 ? Math.round((totals.active / (totals.active + totals.idle)) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Activity timeline"
        subtitle="One day of one employee: shifts, breaks and every app or site segment."
        actions={<><div className="w-64"><EmployeePicker value={employeeId} onChange={(v) => setEmployee(v || null)} /></div><DateNav date={date} onChange={(v) => setDate(v)} /></>}
      />
      {person && (
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={fullName(person)} size={40} />
          <div className="leading-tight">
            <div className="text-md font-semibold text-ink">{fullName(person)}</div>
            <div className="text-xs text-ink-3">{person.code}{person.department ? ` · ${person.department.name}` : ''}{person.team ? ` · ${person.team.name}` : ''}</div>
          </div>
          {d && d.shifts.length > 0 && <Badge tone={d.shifts.some((s) => !s.endedAt) ? 'green' : 'gray'} dot className="ml-2">{d.shifts.some((s) => !s.endedAt) ? 'Shift open' : `${d.shifts.length} shift${d.shifts.length === 1 ? '' : 's'}`}</Badge>}
        </div>
      )}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-5">
        <KpiTile label="Active" value={duration(totals.active)} tone="green" loading={q.isLoading} />
        <KpiTile label="Idle" value={duration(totals.idle)} tone="amber" loading={q.isLoading} />
        <KpiTile label="Locked" value={duration(totals.locked)} icon={<Lock size={15} />} loading={q.isLoading} />
        <KpiTile label="Key presses" value={totals.keys.toLocaleString()} icon={<Keyboard size={15} />} loading={q.isLoading} />
        <KpiTile label="Clicks" value={totals.clicks.toLocaleString()} icon={<MousePointerClick size={15} />} loading={q.isLoading} />
      </div>
      {q.isLoading && <Skeleton className="mb-4 h-28" />}
      {d && (
        <>
          <Card className="mb-4 p-4">
            {d.segments.length === 0 && d.shifts.length === 0 ? (
              <EmptyState icon={<Clock size={28} strokeWidth={1.75} />} title="No activity on this day" body="No shift was started and no segments were uploaded." />
            ) : (
              <TimelineBar detail={d} dayStart={date} />
            )}
          </Card>
          {d.shifts.length > 0 && (
            <Section title="Shifts">
              <div className="flex flex-wrap gap-2">
                {d.shifts.map((s) => (
                  <div key={s.id} className="rounded-card border border-line bg-surface px-3 py-2 text-xs shadow-card">
                    <div className="font-mono text-ink">{clock(s.startedAt)} – {s.endedAt ? clock(s.endedAt) : 'open'}</div>
                    <div className="mt-0.5 text-ink-3">{s.state.toLowerCase().replace('_', ' ')}{s.breaks.length ? ` · ${s.breaks.length} break${s.breaks.length === 1 ? '' : 's'}` : ''}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          <div className="grid gap-3.5 lg:grid-cols-3">
            <Card title="Applications" className="p-4 pt-0 lg:col-span-1"><div className="pt-3"><BarList data={apps} format={duration} series={0} /></div></Card>
            <Card title="Websites" className="p-4 pt-0 lg:col-span-1"><div className="pt-3"><BarList data={domains} format={duration} series={2} /></div></Card>
            <Card title="Time quality" className="p-4 pt-0 lg:col-span-1">
              <div className="pt-3">
                <Donut data={[{ label: 'Active', value: totals.active, series: 2 }, { label: 'Idle', value: totals.idle, series: 3 }, { label: 'Locked', value: totals.locked, series: 1 }]} format={duration} centre={<><div className="font-mono text-lg font-semibold text-ink">{activePct}%</div><div className="text-2xs normal-case tracking-normal text-ink-3">active</div></>} />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
