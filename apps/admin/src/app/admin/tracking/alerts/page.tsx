'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Moon, ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { useIdleReport, useTamperEvents, type IdleReport, type TamperEvent } from '@/lib/queries/tracking';
import { Card, PageHeader, Badge, Avatar, type Tone } from '@/components/ui';
import { DataTable, FilterChip, KpiTile, Section, type Column } from '@/components/ui/advanced';
import { EmployeePicker, PeriodPicker, usePeriod, duration, clock } from '@/components/tracking/shared';
import { fullName, dateTime } from '@/lib/format';

const tamperMeta: Record<string, { tone: Tone; severity: string }> = {
  agent_stopped: { tone: 'red', severity: 'Critical' },
  binary_mismatch: { tone: 'red', severity: 'Critical' },
  extension_missing: { tone: 'amber', severity: 'Warning' },
  clock_changed: { tone: 'amber', severity: 'Warning' },
};
const IDLE_OPTIONS = [[600, 'Idle ≥ 10 min'], [900, 'Idle ≥ 15 min'], [1800, 'Idle ≥ 30 min'], [3600, 'Idle ≥ 1 h']] as const;

type IdleSeg = IdleReport['segments'][number];
type PerEmp = IdleReport['perEmployee'][number] & { id: string };

export default function AlertsPage() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState('');
  const [minIdle, setMinIdle] = useState(900);
  const period = usePeriod('week');
  const idle = useIdleReport({ from: period.period.from, to: period.period.to, employeeId: employeeId || undefined, minIdleSeconds: minIdle });
  const tamper = useTamperEvents({ from: period.period.from, to: period.period.to, employeeId: employeeId || undefined });
  const perEmp = useMemo<PerEmp[]>(() => (idle.data?.perEmployee ?? []).map((p, i) => ({ ...p, id: p.employee?.id ?? `row-${i}` })), [idle.data]);
  const tamperItems = tamper.data?.items ?? [];
  const critical = tamperItems.filter((t) => tamperMeta[t.type]?.severity === 'Critical').length;

  const perEmpCols: Column<PerEmp>[] = [
    { key: 'employee', header: 'Employee', locked: true, cell: (p) => (p.employee ? <span className="inline-flex items-center gap-2"><Avatar name={fullName(p.employee)} size={24} /><span className="font-semibold">{fullName(p.employee)}</span></span> : '—') },
    { key: 'count', header: 'Periods', right: true, mono: true, cell: (p) => p.count },
    { key: 'total', header: 'Total idle', right: true, mono: true, cell: (p) => duration(p.idleS) },
    { key: 'longest', header: 'Longest', right: true, mono: true, cell: (p) => <span className={clsx(p.longest >= 3600 && 'text-red-text', p.longest >= 1800 && p.longest < 3600 && 'text-amber-text')}>{duration(p.longest)}</span> },
  ];
  const segCols: Column<IdleSeg>[] = [
    { key: 'employee', header: 'Employee', locked: true, cell: (s) => (s.employee ? <span className="inline-flex items-center gap-2"><Avatar name={fullName(s.employee)} size={22} />{fullName(s.employee)}</span> : '—') },
    { key: 'date', header: 'Date', mono: true, cell: (s) => <span className="text-pri">{s.startedAt.slice(0, 10)}</span> },
    { key: 'from', header: 'From', mono: true, cell: (s) => clock(s.startedAt) },
    { key: 'to', header: 'To', mono: true, cell: (s) => clock(s.endedAt) },
    { key: 'idle', header: 'Idle', right: true, mono: true, cell: (s) => <Badge tone={s.durationS >= 3600 ? 'red' : 'amber'}>{duration(s.durationS)}</Badge> },
    { key: 'app', header: 'Last app', cell: (s) => <span className="text-sm">{s.appName}</span> },
  ];
  const tamperCols: Column<TamperEvent>[] = [
    { key: 'when', header: 'When', mono: true, locked: true, cell: (t) => dateTime(t.occurredAt) },
    { key: 'severity', header: 'Severity', cell: (t) => <Badge tone={tamperMeta[t.type]?.tone ?? 'gray'} dot>{tamperMeta[t.type]?.severity ?? 'Info'}</Badge> },
    { key: 'type', header: 'Type', cell: (t) => <span className="font-medium">{t.type.replace(/_/g, ' ')}</span> },
    { key: 'employee', header: 'Employee', cell: (t) => (t.employee ? <span className="inline-flex items-center gap-2"><Avatar name={fullName(t.employee)} size={22} />{fullName(t.employee)}</span> : '—') },
    { key: 'device', header: 'Device', cell: (t) => <span className="text-sm">{t.device?.name ?? <span className="font-mono text-xs text-ink-3">{t.deviceId}</span>}</span> },
    { key: 'detail', header: 'Detail', cell: (t) => <span className="font-mono text-xs text-ink-2">{Object.keys(t.detail ?? {}).length ? JSON.stringify(t.detail) : '—'}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Idle & tamper"
        subtitle="Long idle periods and signals that the tracker was stopped, the extension removed or the clock changed (FR-TRK-12)."
        actions={
          <>
            <div className="w-56"><EmployeePicker value={employeeId} onChange={setEmployeeId} allowAll /></div>
            <FilterChip label="Threshold" value={IDLE_OPTIONS.find(([v]) => v === minIdle)?.[1]} active>
              {IDLE_OPTIONS.map(([v, l]) => <button key={v} type="button" onClick={() => setMinIdle(v)} className={clsx('block w-full rounded px-2 py-1.5 text-left text-base', v === minIdle ? 'bg-pri-soft text-pri-2' : 'text-ink hover:bg-surface-2')}>{l}</button>)}
            </FilterChip>
            <PeriodPicker {...period} />
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <KpiTile label="Long idle periods" value={idle.data ? idle.data.segments.length : '—'} tone={idle.data && idle.data.segments.length ? 'amber' : undefined} icon={<Moon size={15} />} loading={idle.isLoading} />
        <KpiTile label="Idle time flagged" value={idle.data ? duration(idle.data.segments.reduce((a, s) => a + s.durationS, 0)) : '—'} loading={idle.isLoading} />
        <KpiTile label="Tamper events" value={tamper.data ? tamperItems.length : '—'} tone={tamperItems.length ? 'amber' : undefined} icon={<ShieldAlert size={15} />} loading={tamper.isLoading} />
        <KpiTile label="Critical" value={tamper.data ? critical : '—'} tone={critical ? 'red' : 'green'} icon={<AlertTriangle size={15} />} loading={tamper.isLoading} />
      </div>

      <Section title={`Long idle · ${duration(minIdle)} or more`} collapsible>
        <Card className="mb-3">
          <DataTable<PerEmp> rows={perEmp} columns={perEmpCols} loading={idle.isLoading} error={idle.isError ? (idle.error as Error).message : null} onRetry={() => idle.refetch()} empty={<div className="px-6 py-10 text-center"><Moon size={26} strokeWidth={1.75} className="mx-auto mb-2 text-ink-3" /><div className="text-base font-semibold text-ink">No long idle periods</div><div className="mt-1 text-sm text-ink-2">Nothing idle for {duration(minIdle)} or more in this period.</div></div>} />
        </Card>
        {idle.data && idle.data.segments.length > 0 && (
          <Card>
            <div className="border-b border-line-2 px-4 py-2 text-2xs font-semibold uppercase text-ink-3">Periods</div>
            <DataTable<IdleSeg> rows={idle.data.segments} columns={segCols} onRowClick={(s) => router.push(`/admin/tracking/timeline?employeeId=${s.employeeId}&date=${s.startedAt.slice(0, 10)}`)} storageKey="tracking.idle" maxHeight={420} />
          </Card>
        )}
      </Section>

      <Section title="Tamper events" collapsible>
        <Card>
          <DataTable<TamperEvent> rows={tamperItems} columns={tamperCols} loading={tamper.isLoading} error={tamper.isError ? (tamper.error as Error).message : null} onRetry={() => tamper.refetch()} storageKey="tracking.tamper" empty={<div className="px-6 py-10 text-center"><ShieldAlert size={26} strokeWidth={1.75} className="mx-auto mb-2 text-ink-3" /><div className="text-base font-semibold text-ink">No tamper events</div><div className="mt-1 text-sm text-ink-2">No agent stops, missing extensions or clock changes were reported.</div></div>} />
        </Card>
      </Section>
    </div>
  );
}
