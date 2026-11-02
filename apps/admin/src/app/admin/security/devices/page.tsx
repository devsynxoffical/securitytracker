'use client';

import { confirmDialog, ConfirmHost } from '@/components/platform/confirm';

import { useMemo, useState } from 'react';
import { Check, X, Ban, MonitorSmartphone } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCrmMutation } from '@/lib/queries/crm';
import { useDevices, type Device } from '@/lib/queries/platform';
import { Button, Card, Segmented, SearchInput, EmptyState, PageHeader, useToast, Avatar } from '@/components/ui';
import { DataTable, Menu, type Column } from '@/components/ui/advanced';
import { StatusBadge, useEmployeeName, Mono } from '@/components/platform/shared';
import { relative, dateTime } from '@/lib/format';

type Filter = 'all' | 'pending' | 'approved' | 'revoked' | 'rejected';

function DevicesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const q = useDevices();
  const nameOf = useEmployeeName();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const act = useCrmMutation(({ id, action }: { id: string; action: 'approve' | 'reject' | 'revoke' }) => http.post(`/devices/${id}/${action}`), [['devices']]);

  const rows = useMemo(() => (q.data ?? []).filter((d) => (filter === 'all' || d.status === filter) && (!search || `${d.name} ${d.osVersion} ${nameOf(d.employeeId)}`.toLowerCase().includes(search.toLowerCase()))), [q.data, filter, search, nameOf]);
  const counts = useMemo(() => ({ pending: (q.data ?? []).filter((d) => d.status === 'pending').length }), [q.data]);
  const run = async (id: string, action: 'approve' | 'reject' | 'revoke') => {
    if (action === 'revoke' && !(await confirmDialog({ title: 'Revoke this device?', body: 'Its sessions end and the local cache is wiped on next contact (FR-DEV-06).', danger: true, confirmLabel: 'Revoke' }))) return;
    act.mutate({ id, action }, { onSuccess: () => toast.push('success', `Device ${action}d`), onError: (e) => toast.push('error', (e as Error).message) });
  };

  const columns = useMemo<Column<Device>[]>(
    () => [
      { key: 'device', header: 'Device', locked: true, cell: (d) => <div><div className="font-semibold text-ink">{d.name}</div><div className="text-xs text-ink-3"><Mono>{d.hardwareHash.slice(0, 16)}</Mono> · {d.releaseChannel}</div></div> },
      { key: 'employee', header: 'Employee', cell: (d) => <span className="inline-flex items-center gap-2"><Avatar name={nameOf(d.employeeId)} size={22} />{nameOf(d.employeeId)}</span> },
      { key: 'status', header: 'Status', cell: (d) => <StatusBadge status={d.status} /> },
      { key: 'os', header: 'OS', cell: (d) => <span className="text-ink-2">{d.osVersion}</span> },
      { key: 'versions', header: 'App / agent', mono: true, cell: (d) => `${d.appVersion ?? '—'} / ${d.agentVersion ?? '—'}` },
      { key: 'seen', header: 'Last seen', cell: (d) => <span className="text-ink-3">{d.lastSeenAt ? relative(d.lastSeenAt) : 'never'}</span> },
      { key: 'registered', header: 'Registered', cell: (d) => <span className="text-ink-3">{dateTime(d.createdAt)}</span> },
    ],
    [nameOf],
  );

  return (
    <div>
      <PageHeader title="Devices" subtitle={counts.pending ? `${counts.pending} awaiting approval` : 'Registered workstations in your scope (FR-DEV-03)'} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'pending', label: `Pending${counts.pending ? ` (${counts.pending})` : ''}` }, { value: 'approved', label: 'Approved' }, { value: 'revoked', label: 'Revoked' }, { value: 'rejected', label: 'Rejected' }]} />
        <SearchInput className="w-64" value={search} onChange={setSearch} placeholder="Device, OS, employee…" />
      </div>
      <Card>
        <DataTable<Device>
          rows={rows}
          columns={columns}
          loading={q.isLoading}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          storageKey="devices"
          empty={<EmptyState icon={<MonitorSmartphone size={28} />} title="No devices" body={filter === 'pending' ? 'Nothing is waiting for approval.' : 'Devices register on first login from the desktop app (F2).'} />}
          rowActions={(d) => (
            <>
              {d.status === 'pending' && can('devices.approve') && (
                <>
                  <Button size="sm" variant="primary" icon={<Check size={12} />} loading={act.isPending} onClick={() => run(d.id, 'approve')}>Approve</Button>
                  <Button size="sm" icon={<X size={12} />} onClick={() => run(d.id, 'reject')}>Reject</Button>
                </>
              )}
              {d.status === 'approved' && can('devices.revoke') && <Menu items={[{ label: 'Revoke device', icon: <Ban size={14} />, danger: true, onSelect: () => run(d.id, 'revoke') }]} />}
            </>
          )}
        />
      </Card>
    </div>
  );
}

export default function DevicesPageWithConfirm() {
  return (
    <>
      <DevicesPage />
      <ConfirmHost />
    </>
  );
}
