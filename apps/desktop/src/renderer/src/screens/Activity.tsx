import { useState } from 'react';
import { Activity as ActivityIcon, EyeOff, Cpu } from 'lucide-react';
import { clsx } from 'clsx';
import { http, errorMessage } from '../lib/bridge';
import { useQuery } from '../lib/useQuery';
import { hm, todayIso } from '../lib/format';
import type { ShiftSnapshot, TrackingSummary } from '../lib/types';
import { Card, Empty, ErrorBanner, KpiTile, Progress, Segmented, Skeleton, SkeletonRows, Banner, PageHeader, Badge } from '../components/ui';

interface AppRow {
  appName: string;
  processName: string;
  category: string;
  activeS: number;
}

/** FR-TRK-13: the employee's own activity (Q10 default: yes, own data is visible). */
export function ActivityScreen({ meId, shift }: { meId: string; shift: ShiftSnapshot | null }) {
  const [range, setRange] = useState<'today' | 'week'>('today');
  const to = todayIso();
  const from = range === 'today' ? to : new Date(Date.now() - 6 * 86400e3).toISOString().slice(0, 10);
  const summary = useQuery(() => http.get<TrackingSummary>(`/tracking/summary?employeeId=${meId}&from=${from}&to=${to}`), [from, to], { intervalMs: 120_000 });
  const apps = useQuery(() => http.get<AppRow[] | { items: AppRow[] }>(`/tracking/apps?employeeId=${meId}&date=${to}`), [to], { intervalMs: 120_000 });
  const appList = Array.isArray(apps.data) ? apps.data : apps.data?.items ?? [];
  const s = summary.data;
  const total = (s?.trackedS ?? (s?.activeS ?? 0) + (s?.idleS ?? 0)) || 0;
  const pct = total ? Math.round(((s?.activeS ?? 0) / total) * 100) : 0;
  const productive = s?.productiveS ?? 0;
  const neutral = s?.neutralS ?? 0;
  const unproductive = s?.unproductiveS ?? 0;
  const catTotal = productive + neutral + unproductive;
  const tracker = shift?.tracker;

  return (
    <div className="space-y-4">
      <PageHeader title="My activity" subtitle="What was tracked while you were on shift. Only you and your manager can see this." actions={<Segmented value={range} onChange={setRange} options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'Last 7 days' }]} />} />

      <Banner tone="primary" icon={<EyeOff size={14} />}>
        Only applications, websites (domain only) and activity counts are recorded. Never what you type, copy or see.
      </Banner>

      {summary.loading ? (
        <div className="grid grid-cols-4 gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
      ) : summary.error ? (
        <ErrorBanner message={errorMessage(summary.error)} onRetry={summary.refetch} />
      ) : (
        <div className="grid grid-cols-4 gap-3.5">
          <KpiTile label="Tracked" value={hm(total)} context={range === 'today' && shift?.state !== 'OFF_SHIFT' ? 'shift running, updates every minute' : 'synced data'} />
          <KpiTile label="Active" value={hm(s?.activeS ?? 0)} tone="green" context={<span className="flex items-center gap-2"><span className="min-w-0 flex-1"><Progress value={pct} tone={pct >= 50 ? 'green' : 'amber'} size={4} /></span><span className="font-mono">{pct}%</span></span>} />
          <KpiTile label="Idle" value={hm(s?.idleS ?? 0)} tone="amber" context={`${total ? 100 - pct : 0}% of tracked · no input over 5 min`} />
          <KpiTile label="Productive" value={hm(productive)} tone="primary" context={`neutral ${hm(neutral)} · unproductive ${hm(unproductive)}`} />
        </div>
      )}

      {!summary.loading && !summary.error && catTotal > 0 && (
        <Card title="Time by category" subtitle={range === 'today' ? 'Today' : 'Last 7 days'}>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-soft">
            <span className="bg-green" style={{ width: `${(productive / catTotal) * 100}%` }} />
            <span className="bg-gray-bar" style={{ width: `${(neutral / catTotal) * 100}%` }} />
            <span className="bg-red" style={{ width: `${(unproductive / catTotal) * 100}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-5 text-xs text-ink-2">
            <Legend swatch="bg-green" label="Productive" value={hm(productive)} pct={Math.round((productive / catTotal) * 100)} />
            <Legend swatch="bg-gray-bar" label="Neutral" value={hm(neutral)} pct={Math.round((neutral / catTotal) * 100)} />
            <Legend swatch="bg-red" label="Unproductive" value={hm(unproductive)} pct={Math.round((unproductive / catTotal) * 100)} />
          </div>
        </Card>
      )}

      <Card title="Applications today" subtitle="Top 15 by active time" padded={false}>
        {apps.loading ? (
          <div className="p-4"><SkeletonRows /></div>
        ) : apps.error ? (
          <div className="p-4"><ErrorBanner message={errorMessage(apps.error)} onRetry={apps.refetch} /></div>
        ) : appList.length === 0 ? (
          <Empty icon={<ActivityIcon size={22} />} title="No activity synced yet" body="Data appears about a minute after your shift starts and the first upload completes." />
        ) : (
          <ul className="divide-y divide-line-2">
            {[...appList]
              .sort((a, b) => b.activeS - a.activeS)
              .slice(0, 15)
              .map((a) => {
                const share = total ? Math.round((a.activeS / total) * 100) : 0;
                return (
                  <li key={a.processName} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-3 ring-1 ring-line">
                      <Cpu size={13} />
                    </span>
                    <span className="w-52 min-w-0">
                      <span className="block truncate font-medium text-ink">{a.appName}</span>
                      <span className="block truncate font-mono text-2xs tracking-normal text-ink-3">{a.processName}</span>
                    </span>
                    <Badge tone={a.category === 'productive' ? 'green' : a.category === 'unproductive' ? 'red' : 'gray'} className="w-[104px] justify-center">
                      {a.category}
                    </Badge>
                    <div className="flex-1">
                      <Progress value={share} tone={a.category === 'productive' ? 'green' : a.category === 'unproductive' ? 'red' : 'gray'} size={6} />
                    </div>
                    <span className="w-10 text-right font-mono text-xs text-ink-3">{share}%</span>
                    <span className="w-16 text-right font-mono text-xs text-ink">{hm(a.activeS)}</span>
                  </li>
                );
              })}
          </ul>
        )}
      </Card>

      {tracker && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <span className={clsx('h-1.5 w-1.5 rounded-full', tracker.source === 'agent' ? (tracker.connected ? 'bg-green' : 'bg-amber') : 'bg-blue')} />
            Tracker: {tracker.source === 'agent' ? (tracker.connected ? 'agent connected' : 'agent not connected') : 'development mode'}
          </span>
          <span>
            Queue <span className="font-mono text-ink-2">{tracker.queueSize}</span>
          </span>
          {tracker.currentApp && (
            <span>
              Now: <span className="text-ink-2">{tracker.currentApp.appName}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Legend({ swatch, label, value, pct }: { swatch: string; label: string; value: string; pct: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={clsx('h-2.5 w-2.5 rounded-sm', swatch)} />
      <span className="text-ink-2">{label}</span>
      <span className="font-mono text-ink">{value}</span>
      <span className="font-mono text-ink-3">{pct}%</span>
    </span>
  );
}
