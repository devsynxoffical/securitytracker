'use client';

import { useMemo, useState } from 'react';
import { Check, Bell } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCrmMutation } from '@/lib/queries/crm';
import { useSecurityAlerts, type SecurityAlert } from '@/lib/queries/platform';
import { Button, Card, Badge, Segmented, EmptyState, PageHeader, useToast, Drawer, Row } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/advanced';
import { JsonBlock, useEmployeeName } from '@/components/platform/shared';
import { fullName, dateTime, relative, titleCase } from '@/lib/format';

function severityTone(s: string) {
  return s === 'critical' || s === 'high' ? ('red' as const) : s === 'warning' ? ('amber' as const) : ('blue' as const);
}

export default function AlertsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const nameOf = useEmployeeName();
  const [view, setView] = useState<'open' | 'acknowledged' | 'all'>('open');
  const q = useSecurityAlerts(view === 'all' ? undefined : view === 'acknowledged');
  const ack = useCrmMutation((id: string) => http.post(`/security-alerts/${id}/ack`), [['security-alerts']]);
  const [selected, setSelected] = useState<SecurityAlert | null>(null);

  const acknowledge = (id: string) => ack.mutate(id, { onSuccess: () => { toast.push('success', 'Alert acknowledged'); setSelected(null); }, onError: (e) => toast.push('error', (e as Error).message) });

  const columns = useMemo<Column<SecurityAlert>[]>(
    () => [
      { key: 'severity', header: 'Severity', locked: true, width: 110, cell: (a) => <Badge tone={severityTone(a.severity)} dot>{a.severity}</Badge> },
      { key: 'type', header: 'Alert', cell: (a) => <span className="font-semibold text-ink">{titleCase(a.type)}</span> },
      { key: 'employee', header: 'Employee', cell: (a) => fullName(a.actor) || <span className="text-ink-3">—</span> },
      { key: 'when', header: 'Raised', cell: (a) => <span className="text-ink-3" title={dateTime(a.createdAt)}>{relative(a.createdAt)}</span> },
      { key: 'ack', header: 'Acknowledged', cell: (a) => (a.acknowledgedAt ? <span className="text-xs text-ink-3">{nameOf(a.acknowledgedBy)} · {relative(a.acknowledgedAt)}</span> : <Badge tone="amber">Open</Badge>) },
    ],
    [nameOf],
  );

  return (
    <div>
      <PageHeader title="Security alerts" subtitle="Tamper signals, lockouts, token reuse and other events that need a human look (08)." />
      <div className="mb-3"><Segmented value={view} onChange={setView} options={[{ value: 'open', label: 'Open' }, { value: 'acknowledged', label: 'Acknowledged' }, { value: 'all', label: 'All' }]} /></div>
      <Card>
        <DataTable<SecurityAlert>
          rows={q.data ?? []}
          columns={columns}
          loading={q.isLoading}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          storageKey="alerts"
          onRowClick={setSelected}
          empty={<EmptyState icon={<Bell size={28} />} title={view === 'open' ? 'No open alerts' : 'No alerts'} body="Alerts are raised by the server when it detects tampering, lockouts or suspicious sessions." />}
          rowActions={(a) => (!a.acknowledgedAt && can('security.view') ? <Button size="sm" icon={<Check size={12} />} loading={ack.isPending} onClick={() => acknowledge(a.id)}>Acknowledge</Button> : null)}
        />
      </Card>
      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? titleCase(selected.type) : ''} subtitle={selected ? dateTime(selected.createdAt) : undefined} width={560} actions={selected && !selected.acknowledgedAt && can('security.view') ? <Button variant="primary" size="sm" icon={<Check size={12} />} loading={ack.isPending} onClick={() => acknowledge(selected.id)}>Acknowledge</Button> : undefined}>
        {selected && (
          <div className="p-5">
            <Row label="Severity"><Badge tone={severityTone(selected.severity)} dot>{selected.severity}</Badge></Row>
            <Row label="Employee">{fullName(selected.actor) || '—'}</Row>
            <Row label="Raised">{dateTime(selected.createdAt)}</Row>
            <Row label="Acknowledged">{selected.acknowledgedAt ? `${nameOf(selected.acknowledgedBy)} · ${dateTime(selected.acknowledgedAt)}` : 'Not yet'}</Row>
            <div className="mt-4 text-2xs font-semibold uppercase text-ink-3">Detail</div>
            <JsonBlock value={selected.detail} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
