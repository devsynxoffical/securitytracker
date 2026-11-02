'use client';

import { useMemo, useState } from 'react';
import { useEmployees } from '@/lib/queries/crm';
import { useLoginEvents, type LoginEvent } from '@/lib/queries/platform';
import { Card, Table, Th, Td, Select, TableSkeleton, EmptyState, ErrorBanner, Pagination, PageHeader } from '@/components/ui';
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

  return (
    <div>
      <PageHeader title="Login history" subtitle="Every login attempt with result, client, IP and device (FR-AUTH-10)." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-56"><Select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); reset(); }}><option value="">All employees</option>{(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}</Select></div>
        <div className="w-44"><Select value={result} onChange={(e) => { setResult(e.target.value); reset(); }}><option value="">All results</option>{RESULTS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}</Select></div>
      </div>
      <Card>
        {q.isLoading && pages.length === 0 && <TableSkeleton cols={6} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && rows.length === 0 && <EmptyState title="No login events" />}
        {rows.length > 0 && (<>
          <Table>
            <thead><tr><Th>Time</Th><Th>Identifier</Th><Th>Employee</Th><Th>Result</Th><Th>Client</Th><Th>IP</Th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-surface-2">
                  <Td className="text-ink-3">{dateTime(e.createdAt)}</Td>
                  <Td><Mono>{e.identifier}</Mono></Td>
                  <Td>{fullName(e.actor)}</Td>
                  <Td><StatusBadge status={e.result} /></Td>
                  <Td>{e.client}</Td>
                  <Td><Mono>{e.ip}</Mono></Td>
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
