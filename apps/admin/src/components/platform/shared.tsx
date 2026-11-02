'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Badge, Field, Input, type Tone } from '@/components/ui';
import { useEmployees } from '@/lib/queries/crm';
import { fullName } from '@/lib/format';

/** `YYYY-MM-DD` in local time. */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

/** From / to date pair with quick presets. */
export function PeriodFilter({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const presets: Array<[string, () => [string, string]]> = [
    ['Today', () => [isoDate(new Date()), isoDate(new Date())]],
    ['7 days', () => [daysAgo(6), isoDate(new Date())]],
    ['30 days', () => [daysAgo(29), isoDate(new Date())]],
    ['This month', () => { const d = new Date(); return [isoDate(new Date(d.getFullYear(), d.getMonth(), 1)), isoDate(d)]; }],
  ];
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="From"><Input type="date" value={from} onChange={(e) => onChange(e.target.value, to)} /></Field>
      <Field label="To"><Input type="date" value={to} onChange={(e) => onChange(from, e.target.value)} /></Field>
      <div className="flex gap-1 pb-[1px]">
        {presets.map(([label, fn]) => (
          <button key={label} type="button" onClick={() => { const [f, t] = fn(); onChange(f, t); }} className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-2">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function usePeriod(defaultDays = 29): [string, string, (f: string, t: string) => void] {
  const [range, setRange] = useState<[string, string]>(() => [daysAgo(defaultDays), isoDate(new Date())]);
  return [range[0], range[1], (f, t) => setRange([f, t])];
}

export function statusTone(status: string | null | undefined): Tone {
  switch ((status ?? '').toLowerCase()) {
    case 'success': case 'approved': case 'active': case 'working': case 'present': case 'ok': return 'green';
    case 'pending': case 'on_break': case 'late': case 'warning': case 'idle': return 'amber';
    case 'rejected': case 'revoked': case 'bad_password': case 'locked': case 'disabled': case '2fa_failed': case 'critical': case 'high': case 'absent': case 'device_revoked': case 'failed': return 'red';
    case 'info': case 'offline': case 'device_pending': return 'blue';
    default: return 'gray';
  }
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  return <Badge tone={statusTone(status)} dot>{(status ?? '—').replace(/_/g, ' ')}</Badge>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[12.5px] ${className ?? ''}`}>{children}</span>;
}

/** Resolves an employee id to a display name from the shared employees query. */
export function useEmployeeName() {
  const { data } = useEmployees();
  const map = useMemo(() => new Map((data ?? []).map((e) => [e.id, e])), [data]);
  return (id: string | null | undefined) => (id ? fullName(map.get(id)) : '—');
}

export function hours(seconds: number | null | undefined): string {
  const s = Number(seconds ?? 0);
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Pretty-printed JSON block for audit before/after and alert details. */
export function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-ink-3">—</span>;
  return <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">{JSON.stringify(value, null, 2)}</pre>;
}
