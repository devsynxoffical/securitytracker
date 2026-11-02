import { useState } from 'react';
import { Activity as ActivityIcon } from 'lucide-react';
import { http, errorMessage } from '../lib/bridge';
import { useQuery } from '../lib/useQuery';
import { hm, todayIso } from '../lib/format';
import type { ShiftSnapshot, TrackingSummary } from '../lib/types';
import { Card, Empty, ErrorBanner, Kpi, Progress, Segmented, SkeletonRows, Banner } from '../components/ui';

/** FR-TRK-13: the employee's own activity (Q10 default: yes, own data is visible). */
export function ActivityScreen({ meId, shift }: { meId: string; shift: ShiftSnapshot | null }) {
  const [range, setRange] = useState<'today' | 'week'>('today');
  const to = todayIso();
  const from = range === 'today' ? to : new Date(Date.now() - 6 * 86400e3).toISOString().slice(0, 10);
  const summary = useQuery(() => http.get<TrackingSummary>(`/tracking/summary?employeeId=${meId}&from=${from}&to=${to}`), [from, to], { intervalMs: 120_000 });
  const apps = useQuery(() => http.get<Array<{ appName: string; processName: string; category: string; activeS: number }> | { items: Array<{ appName: string; processName: string; category: string; activeS: number }> }>(`/tracking/apps?employeeId=${meId}&date=${to}`), [to], { intervalMs: 120_000 });
  const appList = Array.isArray(apps.data) ? apps.data : apps.data?.items ?? [];
  const s = summary.data;
  const total = (s?.trackedS ?? (s?.activeS ?? 0) + (s?.idleS ?? 0)) || 0;
  const pct = total ? Math.round(((s?.activeS ?? 0) / total) * 100) : 0;

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <Segmented value={range} onChange={setRange} options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'Last 7 days' }]} />
        <Banner tone="blue">Only applications, websites (domain) and activity counts are recorded. Never content.</Banner>
      </div>
      {summary.loading ? (
        <SkeletonRows rows={2} />
      ) : summary.error ? (
        <ErrorBanner message={errorMessage(summary.error)} onRetry={summary.refetch} />
      ) : (
        <div className="grid grid-cols-4 gap-3">
          <Kpi label="Tracked" value={hm(total)} context={range === 'today' && shift?.state !== 'OFF_SHIFT' ? 'shift running' : 'synced data'} />
          <Kpi label="Active" value={hm(s?.activeS ?? 0)} tone="green" context={<Progress value={pct} tone={pct >= 50 ? 'green' : 'amber'} />} />
          <Kpi label="Idle" value={hm(s?.idleS ?? 0)} tone="amber" context={`${100 - pct}% of tracked`} />
          <Kpi label="Productive" value={hm(s?.productiveS ?? 0)} tone="primary" context={`neutral ${hm(s?.neutralS ?? 0)} · unproductive ${hm(s?.unproductiveS ?? 0)}`} />
        </div>
      )}
      <Card title="Applications today">
        {apps.loading ? (
          <SkeletonRows />
        ) : apps.error ? (
          <ErrorBanner message={errorMessage(apps.error)} onRetry={apps.refetch} />
        ) : appList.length === 0 ? (
          <Empty icon={<ActivityIcon size={26} />} title="No activity synced yet" body="Data appears a minute after your shift starts and uploads." />
        ) : (
          <ul className="divide-y divide-line-2">
            {[...appList].sort((a, b) => b.activeS - a.activeS).slice(0, 15).map((a) => {
              const share = total ? Math.round((a.activeS / total) * 100) : 0;
              return (
                <li key={a.processName} className="flex items-center gap-3 py-2 text-[12.5px]">
                  <span className="w-48 truncate font-medium text-ink">{a.appName}</span>
                  <span className={`w-24 text-[11px] font-semibold uppercase ${a.category === 'productive' ? 'text-green' : a.category === 'unproductive' ? 'text-red' : 'text-ink-3'}`}>{a.category}</span>
                  <div className="flex-1"><Progress value={share} tone={a.category === 'productive' ? 'green' : a.category === 'unproductive' ? 'red' : 'gray'} /></div>
                  <span className="w-16 text-right font-mono text-ink-2">{hm(a.activeS)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {shift?.tracker && (
        <div className="text-[11.5px] text-ink-3">
          Tracker: {shift.tracker.source === 'agent' ? (shift.tracker.connected ? 'agent connected' : 'agent not connected') : 'development mode'} · queue {shift.tracker.queueSize}
          {shift.tracker.currentApp ? ` · now: ${shift.tracker.currentApp.appName}` : ''}
        </div>
      )}
    </div>
  );
}
