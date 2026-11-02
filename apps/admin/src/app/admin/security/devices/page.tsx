'use client';

import { useMemo, useState } from 'react';
import { Check, X, Ban } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCrmMutation } from '@/lib/queries/crm';
import { useDevices, type Device } from '@/lib/queries/platform';
import { Button, Card, Table, Th, Td, Segmented, SearchInput, TableSkeleton, EmptyState, ErrorBanner, PageHeader, useToast } from '@/components/ui';
import { StatusBadge, useEmployeeName, Mono } from '@/components/platform/shared';
import { relative, dateTime } from '@/lib/format';

type Filter = 'all' | 'pending' | 'approved' | 'revoked' | 'rejected';

export default function DevicesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const q = useDevices();
  const nameOf = useEmployeeName();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const act = useCrmMutation(({ id, action }: { id: string; action: 'approve' | 'reject' | 'revoke' }) => http.post(`/devices/${id}/${action}`), [['devices']]);

  const rows = useMemo(() => (q.data ?? []).filter((d) => (filter === 'all' || d.status === filter) && (!search || `${d.name} ${d.osVersion} ${nameOf(d.employeeId)}`.toLowerCase().includes(search.toLowerCase()))), [q.data, filter, search, nameOf]);
  const counts = useMemo(() => ({ pending: (q.data ?? []).filter((d) => d.status === 'pending').length }), [q.data]);
  const run = (id: string, action: 'approve' | 'reject' | 'revoke') => {
    if (action === 'revoke' && !window.confirm('Revoke this device? Its sessions end and the local cache is wiped on next contact (FR-DEV-06).')) return;
    act.mutate({ id, action }, { onSuccess: () => toast.push('success', `Device ${action}d`), onError: (e) => toast.push('error', (e as Error).message) });
  };

  return (
    <div>
      <PageHeader title="Devices" subtitle={counts.pending ? `${counts.pending} awaiting approval` : 'Registered workstations in your scope (FR-DEV-03)'} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'pending', label: `Pending${counts.pending ? ` (${counts.pending})` : ''}` }, { value: 'approved', label: 'Approved' }, { value: 'revoked', label: 'Revoked' }, { value: 'rejected', label: 'Rejected' }]} />
        <SearchInput className="w-64" value={search} onChange={setSearch} placeholder="Device, OS, employee…" />
      </div>
      <Card>
        {q.isLoading && <TableSkeleton cols={7} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && rows.length === 0 && <EmptyState title="No devices" body={filter === 'pending' ? 'Nothing is waiting for approval.' : 'Devices register on first login from the desktop app (F2).'} />}
        {rows.length > 0 && (
          <Table>
            <thead><tr><Th>Device</Th><Th>Employee</Th><Th>Status</Th><Th>OS</Th><Th>App / agent</Th><Th>Last seen</Th><Th>Registered</Th><Th /></tr></thead>
            <tbody>
              {rows.map((d: Device) => (
                <tr key={d.id} className="hover:bg-surface-2">
                  <Td><div className="font-semibold">{d.name}</div><div className="text-xs text-ink-3"><Mono>{d.hardwareHash.slice(0, 16)}</Mono> · {d.releaseChannel}</div></Td>
                  <Td>{nameOf(d.employeeId)}</Td>
                  <Td><StatusBadge status={d.status} /></Td>
                  <Td className="text-ink-2">{d.osVersion}</Td>
                  <Td mono>{d.appVersion ?? '—'} / {d.agentVersion ?? '—'}</Td>
                  <Td className="text-ink-3">{d.lastSeenAt ? relative(d.lastSeenAt) : 'never'}</Td>
                  <Td className="text-ink-3">{dateTime(d.createdAt)}</Td>
                  <Td right>
                    <div className="flex justify-end gap-1">
                      {d.status === 'pending' && can('devices.approve') && <>
                        <Button size="sm" variant="primary" icon={<Check size={12} />} loading={act.isPending} onClick={() => run(d.id, 'approve')}>Approve</Button>
                        <Button size="sm" icon={<X size={12} />} onClick={() => run(d.id, 'reject')}>Reject</Button>
                      </>}
                      {d.status === 'approved' && can('devices.revoke') && <Button size="sm" variant="danger-outline" icon={<Ban size={12} />} onClick={() => run(d.id, 'revoke')}>Revoke</Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
