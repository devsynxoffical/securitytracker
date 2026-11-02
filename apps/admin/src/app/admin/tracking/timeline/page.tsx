'use client';

import { Suspense } from 'react';
import { Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTimelineDetail } from '@/lib/queries/tracking';
import { Card, KpiCard, Table, Th, Td, Skeleton, EmptyState, ErrorBanner, PageHeader } from '@/components/ui';
import { EmployeePicker, TimelineBar, duration, clock, isoToday } from '@/components/tracking/shared';
import { useIdParam } from '@/lib/useIdParam';

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
  const d = q.data;
  const totals = d?.segments.reduce((a, s) => ({ ...a, [s.kind]: (a[s.kind] ?? 0) + s.durationS, keys: a.keys + s.keyCount, clicks: a.clicks + s.mouseCount }), { active: 0, idle: 0, locked: 0, keys: 0, clicks: 0 } as Record<string, number>);

  return (
    <div>
      <PageHeader
        title="Activity timeline"
        subtitle="One day of one employee: shifts, breaks and every app or site segment. Hover for detail."
        actions={
          <>
            <div className="w-64"><EmployeePicker value={employeeId} onChange={(v) => setEmployee(v || null)} /></div>
            <input type="date" value={date} max={isoToday()} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 rounded-lg border border-line bg-surface px-2 font-mono text-xs" />
          </>
        }
      />
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.isLoading && <Skeleton className="mb-4 h-24" />}
      {d && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-5">
            <KpiCard label="Active" value={duration(totals?.active ?? 0)} tone="green" />
            <KpiCard label="Idle" value={duration(totals?.idle ?? 0)} tone="amber" />
            <KpiCard label="Locked" value={duration(totals?.locked ?? 0)} />
            <KpiCard label="Key presses" value={totals?.keys ?? 0} context="count only" />
            <KpiCard label="Clicks" value={totals?.clicks ?? 0} context="count only" />
          </div>
          <Card className="mb-4">
            {d.segments.length === 0 && d.shifts.length === 0 ? (
              <EmptyState icon={<Clock size={28} strokeWidth={1.75} />} title="No activity on this day" body="No shift was started and no segments were uploaded." />
            ) : (
              <TimelineBar detail={d} dayStart={date} />
            )}
          </Card>
          {d.shifts.length > 0 && (
            <Card title="Shifts" className="mb-4">
              <Table>
                <thead><tr><Th>Start</Th><Th>End</Th><Th>State</Th><Th>Breaks</Th></tr></thead>
                <tbody>
                  {d.shifts.map((s) => (
                    <tr key={s.id}><Td mono>{clock(s.startedAt)}</Td><Td mono>{s.endedAt ? clock(s.endedAt) : 'open'}</Td><Td>{s.state}</Td><Td className="text-xs text-ink-2">{s.breaks.length === 0 ? '—' : s.breaks.map((b) => `${b.type} ${clock(b.startedAt)}–${b.endedAt ? clock(b.endedAt) : '…'}`).join(', ')}</Td></tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
          {d.apps.length > 0 && (
            <Card title="Applications">
              <Table>
                <thead><tr><Th>Application</Th><Th>Process</Th><Th right>Active</Th><Th right>Idle</Th></tr></thead>
                <tbody>
                  {d.apps.map((a) => <tr key={a.processName} className="hover:bg-surface-2"><Td className="font-semibold">{a.appName}</Td><Td mono className="text-ink-3">{a.processName}</Td><Td right mono>{duration(a.activeS)}</Td><Td right mono>{a.idleS ? duration(a.idleS) : '—'}</Td></tr>)}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
