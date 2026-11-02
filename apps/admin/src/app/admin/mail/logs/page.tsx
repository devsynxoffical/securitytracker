'use client';

import { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useMailAudit, useMailboxes, type MailAuditRow } from '@/lib/queries/mail';
import { useEmployees } from '@/lib/queries/crm';
import { Card, Badge, EmptyState, PageHeader } from '@/components/ui';
import { DataTable, FilterChip, type Column } from '@/components/ui/advanced';
import { fullName, dateTime } from '@/lib/format';

const ACTIONS = ['open', 'send', 'reply', 'forward', 'draft', 'download_attachment', 'archive', 'mark_read'];

export default function MailLogsPage() {
  const [mailboxId, setMailboxId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [action, setAction] = useState('');
  const params = useMemo(() => ({ mailboxId: mailboxId || undefined, employeeId: employeeId || undefined, action: action || undefined }), [mailboxId, employeeId, action]);
  const q = useMailAudit(params);
  const mailboxes = useMailboxes(true);
  const employees = useEmployees();
  const mbName = (id: string) => mailboxes.data?.find((m) => m.id === id)?.address ?? id.slice(0, 8);
  const empName = (id: string) => { const e = employees.data?.find((x) => x.id === id); return e ? fullName(e) : id.slice(0, 8); };

  const columns = useMemo<Column<MailAuditRow>[]>(
    () => [
      { key: 'time', header: 'Time', mono: true, cell: (r) => <span className="text-ink-2">{dateTime(r.occurredAt)}</span>, width: 170 },
      { key: 'employee', header: 'Employee', cell: (r) => <span className="font-medium text-ink">{empName(r.employeeId)}</span> },
      { key: 'mailbox', header: 'Mailbox', cell: (r) => <span className="font-mono text-xs text-ink-2">{mbName(r.mailboxId)}</span> },
      { key: 'action', header: 'Action', cell: (r) => <Badge tone={r.action === 'send' || r.action === 'reply' || r.action === 'forward' ? 'blue' : r.action === 'download_attachment' ? 'amber' : 'gray'}>{r.action.replace('_', ' ')}</Badge> },
      { key: 'subject', header: 'Subject', cell: (r) => <span className="block max-w-xs truncate">{r.subject ?? <span className="text-ink-3">—</span>}</span> },
      { key: 'recipients', header: 'Recipients', cell: (r) => <span className="block max-w-xs truncate text-ink-2">{r.recipients.join(', ') || <span className="text-ink-3">—</span>}</span> },
      { key: 'ip', header: 'IP', mono: true, cell: (r) => <span className="text-ink-3">{r.ip}</span> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mailboxes.data, employees.data],
  );

  const chipList = (items: Array<{ value: string; label: string }>, value: string, onPick: (v: string) => void) => (
    <ul className="max-h-64 overflow-y-auto text-sm">
      {items.map((o) => (
        <li key={o.value}>
          <button type="button" onClick={() => onPick(o.value)} className={`block w-full rounded px-2 py-1 text-left hover:bg-surface-2 ${value === o.value ? 'font-semibold text-pri' : 'text-ink'}`}>{o.label}</button>
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <PageHeader title="Mail logs" subtitle="Who read, sent, replied or archived from which mailbox (10 §6)." />
      <div className="mb-3 flex flex-wrap gap-2">
        <FilterChip label="Mailbox" value={mailboxId ? mbName(mailboxId) : undefined} onClear={() => setMailboxId('')}>
          {chipList((mailboxes.data ?? []).map((m) => ({ value: m.id, label: m.address })), mailboxId, setMailboxId)}
        </FilterChip>
        <FilterChip label="Employee" value={employeeId ? empName(employeeId) : undefined} onClear={() => setEmployeeId('')}>
          {chipList((employees.data ?? []).map((e) => ({ value: e.id, label: fullName(e) })), employeeId, setEmployeeId)}
        </FilterChip>
        <FilterChip label="Action" value={action ? action.replace('_', ' ') : undefined} onClear={() => setAction('')}>
          {chipList(ACTIONS.map((a) => ({ value: a, label: a.replace('_', ' ') })), action, setAction)}
        </FilterChip>
      </div>
      <Card>
        <DataTable<MailAuditRow>
          rows={q.data ?? []}
          columns={columns}
          loading={q.isLoading}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          storageKey="mail-logs"
          empty={<EmptyState icon={<ScrollText size={28} />} title="No log entries" body="Mail actions appear here as employees use the inbox." />}
          footer={q.data && q.data.length > 0 ? <div className="border-t border-line-2 bg-surface-2 px-4 py-2 font-mono text-xs text-ink-2">{q.data.length} entries</div> : undefined}
        />
      </Card>
    </div>
  );
}
