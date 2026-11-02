'use client';

import { useMemo, useState } from 'react';
import { Ban, Monitor, Globe, Shield } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCrmMutation, useEmployees } from '@/lib/queries/crm';
import { useSessions, type Session } from '@/lib/queries/platform';
import { Button, Card, Badge, Segmented, EmptyState, Pagination, PageHeader, useToast, Avatar } from '@/components/ui';
import { DataTable, FilterChip, Menu, type Column } from '@/components/ui/advanced';
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

  const columns = useMemo<Column<Session>[]>(
    () => [
      { key: 'employee', header: 'Employee', locked: true, cell: (s) => <span className="inline-flex items-center gap-2"><Avatar name={fullName(s.employee)} size={22} /><span className="font-semibold text-ink">{fullName(s.employee)}</span><span className="font-mono text-xs text-ink-3">{s.employee?.code}</span></span> },
      { key: 'client', header: 'Client', cell: (s) => <span className="inline-flex items-center gap-1.5 text-ink-2">{s.client === 'admin' ? <Globe size={12} className="text-ink-3" /> : <Monitor size={12} className="text-ink-3" />}{s.client}</span> },
      { key: 'device', header: 'Device', cell: (s) => <span className="text-ink-2">{s.device ? `${s.device.name} · ${s.device.osVersion}` : s.userAgent ? <span title={s.userAgent}>{s.userAgent.slice(0, 40)}…</span> : '—'}</span> },
      { key: 'ip', header: 'IP', cell: (s) => <Mono>{s.ip}</Mono> },
      { key: 'started', header: 'Started', cell: (s) => <span className="text-ink-3">{dateTime(s.createdAt)}</span> },
      { key: 'expires', header: 'Expires', cell: (s) => <span className="text-ink-3">{relative(s.expiresAt)}</span> },
      { key: 'state', header: 'State', cell: (s) => (s.revokedAt ? <Badge tone="red">Revoked</Badge> : s.active ? <Badge tone="green" dot>Active</Badge> : <Badge tone="gray">Expired</Badge>) },
    ],
    [],
  );
  const empName = employeeId ? fullName(employees.data?.find((e) => e.id === employeeId)) : undefined;

  return (
    <div>
      <PageHeader
        title="Sessions"
        subtitle="Desktop and admin sessions in your scope. Revoking is enforced on the next request (FR-AUTH-08)."
        actions={employeeId && can('sessions.revoke') ? <Button variant="danger-outline" icon={<Ban size={14} />} loading={revokeAll.isPending} onClick={() => window.confirm(`Revoke every active session of ${empName}?`) && revokeAll.mutate(employeeId, { onSuccess: (r) => { toast.push('success', `${r.revoked} sessions revoked`); reset(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Revoke all for {empName}</Button> : undefined}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={active} onChange={(v) => { setActive(v); reset(); }} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Ended' }, { value: '', label: 'All' }]} />
        <FilterChip label="Client" value={client ? (client === 'admin' ? 'Admin panel' : 'Desktop') : undefined} onClear={() => { setClient(''); reset(); }}>
          {[['desktop', 'Desktop'], ['admin', 'Admin panel']].map(([v, l]) => <button key={v} type="button" onClick={() => { setClient(v!); reset(); }} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-surface-2">{l}</button>)}
        </FilterChip>
        <FilterChip label="Employee" value={empName} onClear={() => { setEmployeeId(''); reset(); }}>
          <ul className="max-h-64 overflow-y-auto text-sm">{(employees.data ?? []).map((e) => <li key={e.id}><button type="button" onClick={() => { setEmployeeId(e.id); reset(); }} className="block w-full rounded px-2 py-1 text-left hover:bg-surface-2">{fullName(e)} <span className="text-ink-3">({e.code})</span></button></li>)}</ul>
        </FilterChip>
      </div>
      <Card>
        <DataTable<Session>
          rows={rows}
          columns={columns}
          loading={q.isLoading && pages.length === 0}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          storageKey="sessions"
          empty={<EmptyState icon={<Shield size={28} />} title="No sessions" body="Change the filters to see ended sessions." />}
          rowActions={(s) => (s.active && can('sessions.revoke') ? <Menu items={[{ label: 'Revoke session', icon: <Ban size={14} />, danger: true, onSelect: () => revoke.mutate(s.id, { onSuccess: () => toast.push('success', 'Session revoked'), onError: (e) => toast.push('error', (e as Error).message) }) }]} /> : null)}
          footer={rows.length > 0 ? <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={() => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } }} loading={q.isFetching} /> : undefined}
        />
      </Card>
    </div>
  );
}
