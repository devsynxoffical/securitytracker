'use client';

import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, Button, Select, Segmented, type Tone } from '@/components/ui';
import { FilterChip, Progress } from '@/components/ui/advanced';
import { useEmployees } from '@/lib/queries/crm';
import { fullName } from '@/lib/format';
import type { LiveStatus, Segment, TimelineDetail } from '@/lib/queries/tracking';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** 5400 -> "1h 30m"; under a minute -> "0m". */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Hours with one decimal for chart axes: 5400 -> "1.5h". */
export function hoursLabel(seconds: number): string {
  return `${Math.round((seconds / 3600) * 10) / 10}h`;
}

export function clock(v: string | Date | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function shortDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit' });
}

/** Monday to Sunday containing `date` (ISO week). */
export function weekOf(date: string): { from: string; to: string } {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  const from = shiftDate(date, -dow);
  return { from, to: shiftDate(from, 6) };
}

export function monthOf(date: string): { from: string; to: string } {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${date.slice(0, 7)}-01`, to: `${date.slice(0, 7)}-${String(last).padStart(2, '0')}` };
}

export const categoryTone: Record<string, Tone> = { productive: 'green', neutral: 'gray', unproductive: 'red' };
export function CategoryBadge({ category }: { category: string }) {
  return <Badge tone={categoryTone[category] ?? 'gray'}>{category}</Badge>;
}

const statusMeta: Record<LiveStatus, { label: string; tone: Tone }> = {
  working: { label: 'Working', tone: 'green' },
  on_break: { label: 'On break', tone: 'amber' },
  offline: { label: 'Offline', tone: 'blue' },
  off_shift: { label: 'Off shift', tone: 'gray' },
  not_started: { label: 'Not started', tone: 'red' },
};
export function StatusBadge({ status }: { status: LiveStatus }) {
  const m = statusMeta[status];
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

/** Activity percent as a progress bar coloured by the company thresholds (FR-TRK-18). */
export function ActivityPercent({ value, warn, alert, none }: { value: number; warn: number; alert: number; none?: boolean }) {
  if (none) return <span className="font-mono text-ink-3">—</span>;
  const tone: Tone = value < alert ? 'red' : value < warn ? 'amber' : 'green';
  return (
    <div className="min-w-[120px]">
      <Progress value={value} tone={tone} size={6} label={`${value}%`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pickers and filters
// ---------------------------------------------------------------------------

export function EmployeePicker({ value, onChange, allowAll = false, label = 'All employees' }: { value: string; onChange: (v: string) => void; allowAll?: boolean; label?: string }) {
  const { data, isLoading } = useEmployees();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={isLoading}>
      {allowAll && <option value="">{label}</option>}
      {(data ?? []).map((e) => (
        <option key={e.id} value={e.id}>
          {fullName(e)} ({e.code})
        </option>
      ))}
    </Select>
  );
}

function uniq<T extends { id: string; name?: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  items.forEach((i) => seen.set(i.id, i));
  return Array.from(seen.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Department and team filter chips derived from the employee directory (no extra endpoint). */
export function OrgFilters({ departmentId, teamId, onChange }: { departmentId: string; teamId: string; onChange: (v: { departmentId: string; teamId: string }) => void }) {
  const { data } = useEmployees();
  const departments = useMemo(() => uniq((data ?? []).map((e) => e.department).filter(Boolean) as Array<{ id: string; name: string }>), [data]);
  const teams = useMemo(() => uniq((data ?? []).map((e) => e.team).filter(Boolean) as Array<{ id: string; name: string }>), [data]);
  const dept = departments.find((d) => d.id === departmentId);
  const team = teams.find((t) => t.id === teamId);
  return (
    <>
      <FilterChip label="Department" value={dept?.name} onClear={() => onChange({ departmentId: '', teamId })}>
        <ChipList items={departments} value={departmentId} onPick={(id) => onChange({ departmentId: id, teamId })} />
      </FilterChip>
      <FilterChip label="Team" value={team?.name} onClear={() => onChange({ departmentId, teamId: '' })}>
        <ChipList items={teams} value={teamId} onPick={(id) => onChange({ departmentId, teamId: id })} />
      </FilterChip>
    </>
  );
}

function ChipList({ items, value, onPick }: { items: Array<{ id: string; name: string }>; value: string; onPick: (id: string) => void }) {
  if (items.length === 0) return <div className="px-2 py-1 text-xs text-ink-3">None available</div>;
  return (
    <ul className="max-h-64 overflow-y-auto">
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" onClick={() => onPick(i.id === value ? '' : i.id)} className={clsx('block w-full rounded px-2 py-1.5 text-left text-base', i.id === value ? 'bg-pri-soft text-pri-2' : 'text-ink hover:bg-surface-2')}>
            {i.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DateNav({ date, onChange, max = isoToday() }: { date: string; onChange: (d: string) => void; max?: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
      <Button size="sm" variant="ghost" aria-label="Previous day" onClick={() => onChange(shiftDate(date, -1))}><ChevronLeft size={14} /></Button>
      <input type="date" value={date} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} className="h-7 bg-transparent px-1 font-mono text-xs text-ink focus:outline-none" />
      <Button size="sm" variant="ghost" aria-label="Next day" onClick={() => onChange(shiftDate(date, 1))} disabled={date >= max}><ChevronRight size={14} /></Button>
    </div>
  );
}

export type PeriodMode = 'day' | 'week' | 'month';
export interface Period { mode: PeriodMode; anchor: string; from: string; to: string }

export function usePeriod(initialMode: PeriodMode = 'week', initialAnchor = isoToday()) {
  const [mode, setMode] = useState<PeriodMode>(initialMode);
  const [anchor, setAnchor] = useState(initialAnchor);
  const range = mode === 'day' ? { from: anchor, to: anchor } : mode === 'week' ? weekOf(anchor) : monthOf(anchor);
  const step = (dir: 1 | -1) => {
    if (mode === 'day') setAnchor(shiftDate(anchor, dir));
    else if (mode === 'week') setAnchor(shiftDate(anchor, 7 * dir));
    else {
      const [y, m] = anchor.split('-').map(Number);
      const d = new Date(Date.UTC(y!, m! - 1 + dir, 1));
      setAnchor(d.toISOString().slice(0, 10));
    }
  };
  const period: Period = { mode, anchor, ...range };
  return { period, setMode, setAnchor, step };
}

export function PeriodPicker({ period, setMode, setAnchor, step, modes = ['day', 'week', 'month'] }: ReturnType<typeof usePeriod> & { modes?: PeriodMode[] }) {
  const label =
    period.mode === 'day'
      ? new Date(`${period.from}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
      : period.mode === 'week'
        ? `${shortDay(period.from)} – ${shortDay(period.to)} ${period.to.slice(0, 4)}`
        : new Date(`${period.from}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented value={period.mode} onChange={setMode} options={modes.map((m) => ({ value: m, label: m[0]!.toUpperCase() + m.slice(1) }))} />
      <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
        <Button size="sm" variant="ghost" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft size={14} /></Button>
        <span className="min-w-[170px] text-center font-mono text-xs text-ink-2">{label}</span>
        <Button size="sm" variant="ghost" aria-label="Next" onClick={() => step(1)}><ChevronRight size={14} /></Button>
      </div>
      <input type="date" value={period.anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className="h-8 rounded-lg border border-line bg-surface px-2 font-mono text-xs text-ink" aria-label="Jump to date" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

/** Stacked horizontal bar of durations with 2px gaps between fills. */
export function StackedBar({ parts, height = 8 }: { parts: Array<{ label: string; seconds: number; className: string }>; height?: number }) {
  const total = parts.reduce((a, p) => a + p.seconds, 0);
  if (total <= 0) return <div className="w-full rounded-full bg-gray-soft" style={{ height }} />;
  return (
    <div className="flex w-full gap-px overflow-hidden rounded-full bg-gray-soft" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label} ${duration(p.seconds)}`).join(', ')}>
      {parts.filter((p) => p.seconds > 0).map((p) => (
        <div key={p.label} className={clsx('rounded-sm', p.className)} style={{ width: `${(p.seconds / total) * 100}%` }} title={`${p.label}: ${duration(p.seconds)}`} />
      ))}
    </div>
  );
}

const kindClass: Record<string, string> = { active: 'bg-pri', idle: 'bg-amber-bar', locked: 'bg-gray-bar', break: 'bg-blue', offline: 'bg-gray-bar' };

/**
 * 24-hour segmented bar (FR-TRK-22): shifts as a soft band, breaks blue, segments active/idle/locked.
 * Hover shows a detail card with app, domain and counts (counts only, never content).
 */
export function TimelineBar({ detail, dayStart }: { detail: TimelineDetail; dayStart: string }) {
  const [hover, setHover] = useState<{ seg: Segment; x: number } | null>(null);
  const start = new Date(`${dayStart}T00:00:00Z`).getTime();
  const pct = (iso: string) => Math.min(100, Math.max(0, ((new Date(iso).getTime() - start) / 86_400_000) * 100));
  const width = (a: string, b: string | null) => Math.max(0.15, pct(b ?? new Date().toISOString()) - pct(a));
  return (
    <div className="relative">
      <div className="relative h-[22px] w-full overflow-hidden rounded-md bg-surface-2 ring-1 ring-line">
        {detail.shifts.map((s) => (
          <div key={s.id} className="absolute inset-y-0 bg-pri-soft" style={{ left: `${pct(s.startedAt)}%`, width: `${width(s.startedAt, s.endedAt)}%` }} title={`Shift ${clock(s.startedAt)} – ${s.endedAt ? clock(s.endedAt) : 'open'}`} />
        ))}
        {detail.segments.map((seg) => (
          <div
            key={seg.id}
            className={clsx('absolute inset-y-[3px] cursor-default rounded-[2px]', kindClass[seg.kind] ?? 'bg-gray-bar', hover?.seg.id === seg.id && 'ring-2 ring-surface ring-offset-1 ring-offset-ink')}
            style={{ left: `${pct(seg.startedAt)}%`, width: `${width(seg.startedAt, seg.endedAt)}%` }}
            onMouseEnter={() => setHover({ seg, x: pct(seg.startedAt) + width(seg.startedAt, seg.endedAt) / 2 })}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {detail.shifts.flatMap((s) => s.breaks).map((b) => (
          <div key={b.id} className="absolute inset-y-0 bg-blue/70" style={{ left: `${pct(b.startedAt)}%`, width: `${width(b.startedAt, b.endedAt)}%` }} title={`Break ${clock(b.startedAt)} – ${b.endedAt ? clock(b.endedAt) : 'ongoing'}`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-3">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => <span key={h}>{String(h).padStart(2, '0')}:00</span>)}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-2">
        <Legend className="bg-pri" label="Active" /><Legend className="bg-amber-bar" label="Idle" /><Legend className="bg-blue" label="Break" /><Legend className="bg-gray-bar" label="Locked / offline" /><Legend className="bg-pri-soft ring-1 ring-line" label="Shift" />
      </div>
      {hover ? (
        <div className="pop-in pointer-events-none absolute -top-2 z-10 w-64 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface p-3 text-xs shadow-pop" style={{ left: `${Math.min(92, Math.max(8, hover.x))}%` }}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-ink">{clock(hover.seg.startedAt)}–{clock(hover.seg.endedAt)}</span>
            <Badge tone={hover.seg.kind === 'active' ? 'primary' : hover.seg.kind === 'idle' ? 'amber' : 'gray'}>{hover.seg.kind}{hover.seg.exception !== 'none' ? ` · ${hover.seg.exception}` : ''}</Badge>
          </div>
          <div className="mt-1.5 truncate font-semibold text-ink">{hover.seg.appName}</div>
          {hover.seg.domain && <div className="truncate font-mono text-ink-2">{hover.seg.domain}</div>}
          <div className="mt-1.5 flex gap-3 font-mono text-ink-3">
            <span>{duration(hover.seg.durationS)}</span><span>keys {hover.seg.keyCount}</span><span>clicks {hover.seg.mouseCount}</span>
          </div>
        </div>
      ) : (
        <div className="mt-2 text-xs text-ink-3">Hover a segment for detail. Counts only — no content is recorded.</div>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={clsx('inline-block h-2.5 w-2.5 rounded-sm', className)} />{label}</span>;
}
