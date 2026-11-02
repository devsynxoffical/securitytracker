'use client';

import { Suspense, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { useEmployees } from '@/lib/queries/crm';
import { useAuditLogs, type AuditLog } from '@/lib/queries/platform';
import { useIdParam } from '@/lib/useIdParam';
import { Card, Badge, Skeleton, EmptyState, Pagination, PageHeader, Drawer, Row, Avatar } from '@/components/ui';
import { DataTable, FilterChip, type Column } from '@/components/ui/advanced';
import { JsonBlock, Mono } from '@/components/platform/shared';
import { fullName, dateTime } from '@/lib/format';

const ENTITY_TYPES = ['leads', 'crm', 'employees', 'departments', 'teams', 'roles', 'devices', 'sessions', 'shifts', 'attendance', 'tracking', 'tasks', 'targets', 'mail', 'settings', 'pipelines', 'auth', 'admin', 'hr'];

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

  const columns = useMemo<Column<AuditLog>[]>(
    () => [
      { key: 'time', header: 'Time', locked: true, width: 170, cell: (r) => <span className="text-ink-2">{dateTime(r.occurredAt)}</span> },
      { key: 'actor', header: 'Actor', cell: (r) => <span className="inline-flex items-center gap-2"><Avatar name={fullName(r.actor) || 'System'} size={22} /><span><span className="block font-semibold text-ink">{fullName(r.actor) || 'System'}</span><span className="block text-xs text-ink-3">{r.actorRole ?? ''}</span></span></span> },
      { key: 'action', header: 'Action', cell: (r) => <span className="inline-flex items-center gap-1.5"><Badge tone={methodTone(r.action)}>{r.action.split(' ')[0]}</Badge><Mono className="text-ink-2">{r.action.split(' ').slice(1).join(' ').replace(/^\/api\/v1/, '')}</Mono></span> },
      { key: 'entity', header: 'Entity', cell: (r) => <span>{r.entityType}{r.entityId ? <span className="ml-1 text-xs text-ink-3"><Mono>{r.entityId.slice(0, 8)}</Mono></span> : null}</span> },
      { key: 'client', header: 'Client', cell: (r) => <span className="text-ink-2">{r.client}</span> },
      { key: 'ip', header: 'IP', cell: (r) => <Mono>{r.ip}</Mono> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Append-only record of every write, with actor, entity and payload (FR-AUD-01)." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterChip label="Actor" value={actorId ? fullName(employees.data?.find((e) => e.id === actorId)) : undefined} onClear={() => { setActorId(''); reset(); }}>
          <ul className="max-h-64 overflow-y-auto text-sm">{(employees.data ?? []).map((e) => <li key={e.id}><button type="button" onClick={() => { setActorId(e.id); reset(); }} className="block w-full rounded px-2 py-1 text-left hover:bg-surface-2">{fullName(e)} <span className="text-ink-3">({e.code})</span></button></li>)}</ul>
        </FilterChip>
        <FilterChip label="Entity" value={entityType || undefined} onClear={() => { setEntityType(''); reset(); }}>
          <ul className="max-h-64 overflow-y-auto text-sm">{ENTITY_TYPES.map((t) => <li key={t}><button type="button" onClick={() => { setEntityType(t); reset(); }} className="block w-full rounded px-2 py-1 text-left hover:bg-surface-2">{t}</button></li>)}</ul>
        </FilterChip>
        <FilterChip label="Period" value={from || to ? `${from || '…'} → ${to || '…'}` : undefined} onClear={() => { setFrom(''); setTo(''); reset(); }}>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} className="h-8 rounded-md border border-line bg-surface px-2 text-xs" />
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} className="h-8 rounded-md border border-line bg-surface px-2 text-xs" />
          </div>
        </FilterChip>
      </div>
      <Card>
        <DataTable<AuditLog>
          rows={rows}
          columns={columns}
          loading={q.isLoading && pages.length === 0}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          storageKey="audit"
          onRowClick={(r) => setId(r.id)}
          empty={<EmptyState icon={<FileText size={28} />} title="No audit entries match" />}
          footer={rows.length > 0 ? <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={() => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } }} loading={q.isFetching} /> : undefined}
        />
      </Card>
      <Drawer open={Boolean(id)} onClose={() => setId(null)} title="Audit entry" subtitle={selected ? dateTime(selected.occurredAt) : undefined} width={820}>
        {id && !selected && <div className="p-5"><EmptyState title="Entry not loaded" body="Load more rows or clear the filters to find this entry." /></div>}
        {selected && (
          <div className="p-5">
            <div className="grid grid-cols-2 gap-x-6">
              <Row label="Actor">{fullName(selected.actor) || 'System'} <span className="text-ink-3">{selected.actorRole ?? ''}</span></Row>
              <Row label="Action"><Badge tone={methodTone(selected.action)}>{selected.action.split(' ')[0]}</Badge> <Mono>{selected.action.split(' ').slice(1).join(' ')}</Mono></Row>
              <Row label="Entity">{selected.entityType} {selected.entityId ? <Mono>{selected.entityId}</Mono> : ''}</Row>
              <Row label="Client / IP">{selected.client} · <Mono>{selected.ip}</Mono></Row>
              <Row label="Device">{selected.deviceId ? <Mono>{selected.deviceId}</Mono> : '—'}</Row>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-2xs font-semibold uppercase text-ink-3">Before</div>
                <JsonBlock value={selected.before} />
              </div>
              <div>
                <div className="mb-1 text-2xs font-semibold uppercase text-ink-3">After <span className="normal-case tracking-normal">(sensitive fields redacted)</span></div>
                <JsonBlock value={selected.after} />
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
