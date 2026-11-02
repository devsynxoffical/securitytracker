'use client';

import { useMemo, useState } from 'react';
import { Ban, Monitor, Globe } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCrmMutation, useEmployees } from '@/lib/queries/crm';
import { useSessions, type Session } from '@/lib/queries/platform';
import { Button, Card, Table, Th, Td, Badge, Select, Segmented, TableSkeleton, EmptyState, ErrorBanner, Pagination, PageHeader, useToast } from '@/components/ui';
import { fullName, dateTime, relative } from '@/lib/format';
import { Mono } from '@/components/platform/shared';

export default function SessionsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const employees = useEmployees();
  const [active, setActive] = useState<'true' | 'false' | ''>('true');
  const [client, setClient] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Session[][]>([]);
  const params = useMemo(() => ({ active: active || undefined, client: client || undefined, employeeId: employeeId || undefined, cursor, limit: 50 }), [active, client, employeeId, cursor]);
  const q = useSessions(params);
  const rows = useMemo(() => { const seen = new Set<string>(); return [...pages.flat(), ...(q.data?.items ?? [])].filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))); }, [pages, q.data]);
  const reset = () => { setCursor(undefined); setPages([]); };
  const revoke = useCrmMutation((id: string) => http.post(`/sessions/${id}/revoke`), [['sessions']]);
  const revokeAll = useCrmMutation((id: string) => http.post<{ revoked: number }>(`/employees/${id}/sessions/revoke-all`), [['sessions']]);

  return (
    <div>
      <PageHeader title="Sessions" subtitle="Desktop and admin sessions in your scope. Revoking is enforced on the next request (FR-AUTH-08)." actions={employeeId && can('sessions.revoke') ? <Button variant="danger-outline" icon={<Ban size={14} />} loading={revokeAll.isPending} onClick={() => window.confirm('Revoke every active session of this employee?') && revokeAll.mutate(employeeId, { onSuccess: (r) => { toast.push('success', `${r.revoked} sessions revoked`); reset(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Revoke all for employee</Button> : undefined} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={active} onChange={(v) => { setActive(v); reset(); }} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Ended' }, { value: '', label: 'All' }]} />
        <div className="w-40"><Select value={client} onChange={(e) => { setClient(e.target.value); reset(); }}><option value="">All clients</option><option value="desktop">Desktop</option><option value="admin">Admin panel</option></Select></div>
        <div className="w-56"><Select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); reset(); }}><option value="">All employees</option>{(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}</Select></div>
      </div>
      <Card>
        {q.isLoading && pages.length === 0 && <TableSkeleton cols={7} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && rows.length === 0 && <EmptyState title="No sessions" body="Change the filters to see ended sessions." />}
        {rows.length > 0 && (<>
          <Table>
            <thead><tr><Th>Employee</Th><Th>Client</Th><Th>Device</Th><Th>IP</Th><Th>Started</Th><Th>Expires</Th><Th>State</Th><Th /></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2">
                  <Td className="font-semibold">{fullName(s.employee)} <span className="font-normal text-ink-3">{s.employee?.code}</span></Td>
                  <Td><span className="inline-flex items-center gap-1">{s.client === 'admin' ? <Globe size={12} className="text-ink-3" /> : <Monitor size={12} className="text-ink-3" />}{s.client}</span></Td>
                  <Td className="text-ink-2">{s.device ? `${s.device.name} · ${s.device.osVersion}` : s.userAgent ? <span title={s.userAgent}>{s.userAgent.slice(0, 40)}…</span> : '—'}</Td>
                  <Td><Mono>{s.ip}</Mono></Td>
                  <Td className="text-ink-3">{dateTime(s.createdAt)}</Td>
                  <Td className="text-ink-3">{relative(s.expiresAt)}</Td>
                  <Td>{s.revokedAt ? <Badge tone="red">Revoked</Badge> : s.active ? <Badge tone="green" dot>Active</Badge> : <Badge tone="gray">Expired</Badge>}</Td>
                  <Td right>{s.active && can('sessions.revoke') && <Button size="sm" variant="danger-outline" icon={<Ban size={12} />} loading={revoke.isPending} onClick={() => revoke.mutate(s.id, { onSuccess: () => toast.push('success', 'Session revoked'), onError: (e) => toast.push('error', (e as Error).message) })}>Revoke</Button>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={() => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } }} loading={q.isFetching} />
        </>)}
      </Card>
    </div>
  );
}
