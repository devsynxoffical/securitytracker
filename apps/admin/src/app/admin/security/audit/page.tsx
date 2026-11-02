'use client';

import { Suspense, useMemo, useState } from 'react';
import { useEmployees } from '@/lib/queries/crm';
import { useAuditLogs, type AuditLog } from '@/lib/queries/platform';
import { useIdParam } from '@/lib/useIdParam';
import { Card, Table, Th, Td, Badge, Select, Input, Field, Skeleton, TableSkeleton, EmptyState, ErrorBanner, Pagination, PageHeader, Drawer, Row } from '@/components/ui';
import { JsonBlock, Mono } from '@/components/platform/shared';
import { fullName, dateTime } from '@/lib/format';

const ENTITY_TYPES = ['leads', 'crm', 'employees', 'departments', 'teams', 'roles', 'devices', 'sessions', 'shifts', 'attendance', 'tracking', 'tasks', 'targets', 'mail', 'settings', 'pipelines', 'auth', 'admin'];

export default function AuditPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Audit />
    </Suspense>
  );
}

function methodTone(action: string) {
  if (action.startsWith('DELETE')) return 'red' as const;
  if (action.startsWith('POST')) return 'green' as const;
  if (action.startsWith('PATCH') || action.startsWith('PUT')) return 'amber' as const;
  return 'blue' as const;
}

function Audit() {
  const employees = useEmployees();
  const [id, setId] = useIdParam();
  const [actorId, setActorId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<AuditLog[][]>([]);
  const params = useMemo(() => ({ actorId: actorId || undefined, entityType: entityType || undefined, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined, cursor, limit: 50 }), [actorId, entityType, from, to, cursor]);
  const q = useAuditLogs(params);
  const rows = useMemo(() => { const seen = new Set<string>(); return [...pages.flat(), ...(q.data?.items ?? [])].filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))); }, [pages, q.data]);
  const reset = () => { setCursor(undefined); setPages([]); };
  const selected = rows.find((r) => r.id === id) ?? null;

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Append-only record of every write, with actor, entity and payload (FR-AUD-01)." />
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="Actor"><div className="w-56"><Select value={actorId} onChange={(e) => { setActorId(e.target.value); reset(); }}><option value="">Anyone</option>{(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}</Select></div></Field>
        <Field label="Entity"><div className="w-40"><Select value={entityType} onChange={(e) => { setEntityType(e.target.value); reset(); }}><option value="">All</option>{ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></div></Field>
        <Field label="From"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} /></Field>
      </div>
      <Card>
        {q.isLoading && pages.length === 0 && <TableSkeleton cols={6} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && rows.length === 0 && <EmptyState title="No audit entries match" />}
        {rows.length > 0 && (<>
          <Table>
            <thead><tr><Th>Time</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Client</Th><Th>IP</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setId(r.id)}>
                  <Td className="text-ink-3">{dateTime(r.occurredAt)}</Td>
                  <Td><div className="font-semibold">{fullName(r.actor)}</div><div className="text-xs text-ink-3">{r.actorRole ?? ''}</div></Td>
                  <Td><Badge tone={methodTone(r.action)}>{r.action.split(' ')[0]}</Badge> <Mono className="ml-1 text-ink-2">{r.action.split(' ').slice(1).join(' ').replace(/^\/api\/v1/, '')}</Mono></Td>
                  <Td>{r.entityType}{r.entityId ? <span className="ml-1 text-xs text-ink-3"><Mono>{r.entityId.slice(0, 8)}</Mono></span> : null}</Td>
                  <Td>{r.client}</Td>
                  <Td><Mono>{r.ip}</Mono></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={() => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } }} loading={q.isFetching} />
        </>)}
      </Card>
      <Drawer open={Boolean(id)} onClose={() => setId(null)} title="Audit entry" subtitle={selected ? dateTime(selected.occurredAt) : undefined} width={640}>
        {id && !selected && <div className="p-5"><EmptyState title="Entry not loaded" body="Load more rows or clear the filters to find this entry." /></div>}
        {selected && (
          <div className="p-5">
            <Row label="Actor">{fullName(selected.actor)} <span className="text-ink-3">{selected.actorRole ?? ''}</span></Row>
            <Row label="Action"><Mono>{selected.action}</Mono></Row>
            <Row label="Entity">{selected.entityType} {selected.entityId ? <Mono>{selected.entityId}</Mono> : ''}</Row>
            <Row label="Client / IP">{selected.client} · <Mono>{selected.ip}</Mono></Row>
            <Row label="Device">{selected.deviceId ? <Mono>{selected.deviceId}</Mono> : '—'}</Row>
            <div className="mt-4 text-xs font-semibold text-ink-3">Before</div>
            <JsonBlock value={selected.before} />
            <div className="mt-3 text-xs font-semibold text-ink-3">After (sensitive fields redacted)</div>
            <JsonBlock value={selected.after} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
