'use client';

import { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useEmployees } from '@/lib/queries/crm';
import { useLoginEvents, type LoginEvent } from '@/lib/queries/platform';
import { Card, EmptyState, Pagination, PageHeader } from '@/components/ui';
import { DataTable, FilterChip, type Column } from '@/components/ui/advanced';
import { StatusBadge, Mono } from '@/components/platform/shared';
import { fullName, dateTime } from '@/lib/format';

const RESULTS = ['success', 'bad_password', 'locked', 'device_pending', 'device_revoked', 'disabled', '2fa_failed'];

export default function LoginHistoryPage() {
  const employees = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [result, setResult] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<LoginEvent[][]>([]);
  const params = useMemo(() => ({ employeeId: employeeId || undefined, result: result || undefined, cursor, limit: 50 }), [employeeId, result, cursor]);
  const q = useLoginEvents(params);
  const rows = useMemo(() => { const seen = new Set<string>(); return [...pages.flat(), ...(q.data?.items ?? [])].filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))); }, [pages, q.data]);
  const reset = () => { setCursor(undefined); setPages([]); };

  const columns = useMemo<Column<LoginEvent>[]>(
    () => [
      { key: 'time', header: 'Time', locked: true, cell: (e) => <span className="text-ink-2">{dateTime(e.createdAt)}</span> },
      { key: 'identifier', header: 'Identifier', cell: (e) => <Mono>{e.identifier}</Mono> },
      { key: 'employee', header: 'Employee', cell: (e) => fullName(e.actor) || <span className="text-ink-3">unknown</span> },
      { key: 'result', header: 'Result', cell: (e) => <StatusBadge status={e.result} /> },
      { key: 'client', header: 'Client', cell: (e) => <span className="text-ink-2">{e.client}</span> },
      { key: 'ip', header: 'IP', cell: (e) => <Mono>{e.ip}</Mono> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Login history" subtitle="Every login attempt with result, client, IP and device (FR-AUTH-10)." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterChip label="Employee" value={employeeId ? fullName(employees.data?.find((e) => e.id === employeeId)) : undefined} onClear={() => { setEmployeeId(''); reset(); }}>
          <ul className="max-h-64 overflow-y-auto text-sm">{(employees.data ?? []).map((e) => <li key={e.id}><button type="button" onClick={() => { setEmployeeId(e.id); reset(); }} className="block w-full rounded px-2 py-1 text-left hover:bg-surface-2">{fullName(e)} <span className="text-ink-3">({e.code})</span></button></li>)}</ul>
        </FilterChip>
        <FilterChip label="Result" value={result ? result.replace(/_/g, ' ') : undefined} onClear={() => { setResult(''); reset(); }}>
          {RESULTS.map((r) => <button key={r} type="button" onClick={() => { setResult(r); reset(); }} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-surface-2">{r.replace(/_/g, ' ')}</button>)}
        </FilterChip>
      </div>
      <Card>
        <DataTable<LoginEvent>
          rows={rows}
          columns={columns}
          loading={q.isLoading && pages.length === 0}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          storageKey="logins"
          empty={<EmptyState icon={<ScrollText size={28} />} title="No login events" />}
          footer={rows.length > 0 ? <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={() => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } }} loading={q.isFetching} /> : undefined}
        />
      </Card>
    </div>
  );
}
