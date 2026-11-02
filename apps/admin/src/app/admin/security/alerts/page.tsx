'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCrmMutation } from '@/lib/queries/crm';
import { useSecurityAlerts } from '@/lib/queries/platform';
import { Button, Card, Badge, Segmented, Skeleton, EmptyState, ErrorBanner, PageHeader, useToast } from '@/components/ui';
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
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div>
      <PageHeader title="Security alerts" subtitle="Tamper signals, lockouts, token reuse and other events that need a human look (08)." />
      <div className="mb-3"><Segmented value={view} onChange={setView} options={[{ value: 'open', label: 'Open' }, { value: 'acknowledged', label: 'Acknowledged' }, { value: 'all', label: 'All' }]} /></div>
      <Card>
        {q.isLoading && <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && q.data.length === 0 && <EmptyState title={view === 'open' ? 'No open alerts' : 'No alerts'} body="Alerts are raised by the server when it detects tampering, lockouts or suspicious sessions." />}
        {q.data && q.data.length > 0 && (
          <ul className="divide-y divide-line-2">
            {q.data.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <div className="flex items-center gap-3 text-[13px]">
                  <Badge tone={severityTone(a.severity)} dot>{a.severity}</Badge>
                  <button type="button" className="flex-1 truncate text-left font-semibold hover:underline" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>{titleCase(a.type)}</button>
                  <span className="text-ink-2">{fullName(a.actor)}</span>
                  <span className="text-xs text-ink-3" title={dateTime(a.createdAt)}>{relative(a.createdAt)}</span>
                  {a.acknowledgedAt ? (
                    <span className="text-xs text-ink-3">Acknowledged by {nameOf(a.acknowledgedBy)} · {relative(a.acknowledgedAt)}</span>
                  ) : (
                    can('security.view') && <Button size="sm" icon={<Check size={12} />} loading={ack.isPending} onClick={() => ack.mutate(a.id, { onSuccess: () => toast.push('success', 'Alert acknowledged'), onError: (e) => toast.push('error', (e as Error).message) })}>Acknowledge</Button>
                  )}
                </div>
                {expanded === a.id && <div className="mt-3"><JsonBlock value={a.detail} /></div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
