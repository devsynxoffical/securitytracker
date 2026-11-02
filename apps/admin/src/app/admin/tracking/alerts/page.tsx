'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Moon } from 'lucide-react';
import { useIdleReport, useTamperEvents } from '@/lib/queries/tracking';
import { Card, Table, Th, Td, TableSkeleton, EmptyState, ErrorBanner, PageHeader, Tabs, Select, Badge } from '@/components/ui';
import { EmployeePicker, PeriodPicker, usePeriod, duration, clock } from '@/components/tracking/shared';
import { fullName, dateTime } from '@/lib/format';

const tamperTone: Record<string, 'red' | 'amber' | 'blue'> = { agent_stopped: 'red', binary_mismatch: 'red', extension_missing: 'amber', clock_changed: 'amber' };

export default function AlertsPage() {
  const [tab, setTab] = useState<'idle' | 'tamper'>('idle');
  const [employeeId, setEmployeeId] = useState('');
  const [minIdle, setMinIdle] = useState(900);
  const period = usePeriod('week');
  const idle = useIdleReport({ from: period.period.from, to: period.period.to, employeeId: employeeId || undefined, minIdleSeconds: minIdle });
  const tamper = useTamperEvents({ from: period.period.from, to: period.period.to, employeeId: employeeId || undefined });

  return (
    <div>
      <PageHeader title="Idle & tamper" subtitle="Long idle periods and signals that the tracker was stopped, the extension removed or the clock changed (FR-TRK-12)." actions={<><div className="w-56"><EmployeePicker value={employeeId} onChange={setEmployeeId} allowAll /></div>{tab === 'idle' && <div className="w-40"><Select value={String(minIdle)} onChange={(e) => setMinIdle(Number(e.target.value))}><option value="600">Idle ≥ 10 min</option><option value="900">Idle ≥ 15 min</option><option value="1800">Idle ≥ 30 min</option><option value="3600">Idle ≥ 1 h</option></Select></div>}</>} />
      <div className="mb-3 flex justify-end"><PeriodPicker {...period} /></div>
      <Card>
        <Tabs value={tab} onChange={setTab} className="px-3" tabs={[{ value: 'idle', label: 'Long idle', count: idle.data?.segments.length }, { value: 'tamper', label: 'Tamper events', count: tamper.data?.items.length }]} />
        {tab === 'idle' && (
          <>
            {idle.isLoading && <TableSkeleton rows={6} cols={5} />}
            {idle.isError && <ErrorBanner message={(idle.error as Error).message} onRetry={() => idle.refetch()} />}
            {idle.data && idle.data.segments.length === 0 && <EmptyState icon={<Moon size={28} strokeWidth={1.75} />} title="No long idle periods" body={`Nothing idle for ${duration(minIdle)} or more in this period.`} />}
            {idle.data && idle.data.perEmployee.length > 0 && (
              <>
                <Table>
                  <thead><tr><Th>Employee</Th><Th right>Periods</Th><Th right>Total idle</Th><Th right>Longest</Th></tr></thead>
                  <tbody>{idle.data.perEmployee.map((p) => <tr key={p.employee?.id ?? Math.random()} className="hover:bg-surface-2"><Td className="font-semibold">{p.employee ? fullName(p.employee) : '—'}</Td><Td right mono>{p.count}</Td><Td right mono>{duration(p.idleS)}</Td><Td right mono>{duration(p.longest)}</Td></tr>)}</tbody>
                </Table>
                <div className="border-t border-line bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">Periods</div>
                <Table>
                  <thead><tr><Th>Employee</Th><Th>Date</Th><Th>From</Th><Th>To</Th><Th right>Idle</Th><Th>Last app</Th></tr></thead>
                  <tbody>{idle.data.segments.map((s) => <tr key={s.id} className="hover:bg-surface-2"><Td>{s.employee ? fullName(s.employee) : '—'}</Td><Td><Link className="font-mono text-xs text-pri hover:underline" href={`/admin/tracking/timeline?employeeId=${s.employeeId}&date=${s.startedAt.slice(0, 10)}`}>{s.startedAt.slice(0, 10)}</Link></Td><Td mono>{clock(s.startedAt)}</Td><Td mono>{clock(s.endedAt)}</Td><Td right mono>{duration(s.durationS)}</Td><Td className="text-xs">{s.appName}</Td></tr>)}</tbody>
                </Table>
              </>
            )}
          </>
        )}
        {tab === 'tamper' && (
          <>
            {tamper.isLoading && <TableSkeleton rows={6} cols={5} />}
            {tamper.isError && <ErrorBanner message={(tamper.error as Error).message} onRetry={() => tamper.refetch()} />}
            {tamper.data && tamper.data.items.length === 0 && <EmptyState icon={<AlertTriangle size={28} strokeWidth={1.75} />} title="No tamper events" body="No agent stops, missing extensions or clock changes were reported." />}
            {tamper.data && tamper.data.items.length > 0 && (
              <Table>
                <thead><tr><Th>When</Th><Th>Employee</Th><Th>Device</Th><Th>Type</Th><Th>Detail</Th></tr></thead>
                <tbody>{tamper.data.items.map((t) => <tr key={t.id} className="hover:bg-surface-2"><Td mono>{dateTime(t.occurredAt)}</Td><Td>{t.employee ? fullName(t.employee) : '—'}</Td><Td className="text-xs">{t.device?.name ?? t.deviceId}</Td><Td><Badge tone={tamperTone[t.type] ?? 'gray'}>{t.type.replace('_', ' ')}</Badge></Td><Td className="font-mono text-[11px] text-ink-2">{Object.keys(t.detail ?? {}).length ? JSON.stringify(t.detail) : '—'}</Td></tr>)}</tbody>
              </Table>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
