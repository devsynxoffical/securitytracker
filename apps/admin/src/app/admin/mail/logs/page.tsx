'use client';

import { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useMailAudit, useMailboxes } from '@/lib/queries/mail';
import { useEmployees } from '@/lib/queries/crm';
import { Card, Table, Th, Td, Badge, TableSkeleton, EmptyState, ErrorBanner, Select, PageHeader } from '@/components/ui';
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
  return (
    <div>
      <PageHeader title="Mail logs" subtitle="Who read, sent, replied or archived from which mailbox (FR-MAIL audit, 10 section 6)" />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="w-60"><Select value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}><option value="">All mailboxes</option>{mailboxes.data?.map((m) => <option key={m.id} value={m.id}>{m.address}</option>)}</Select></div>
        <div className="w-52"><Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">All employees</option>{employees.data?.map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select></div>
        <div className="w-44"><Select value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</Select></div>
      </div>
      <Card>
        {q.isLoading && <TableSkeleton cols={6} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data?.length === 0 && <EmptyState icon={<ScrollText size={28} />} title="No log entries" body="Mail actions appear here as employees use the inbox." />}
        {q.data && q.data.length > 0 && (
          <Table>
            <thead><tr><Th>Time</Th><Th>Employee</Th><Th>Mailbox</Th><Th>Action</Th><Th>Subject</Th><Th>Recipients</Th><Th>IP</Th></tr></thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <Td mono className="text-ink-2">{dateTime(r.occurredAt)}</Td>
                  <Td>{empName(r.employeeId)}</Td>
                  <Td className="text-ink-2">{mbName(r.mailboxId)}</Td>
                  <Td><Badge tone={r.action === 'send' || r.action === 'reply' ? 'blue' : 'gray'}>{r.action}</Badge></Td>
                  <Td className="max-w-xs truncate">{r.subject ?? <span className="text-ink-3">—</span>}</Td>
                  <Td className="max-w-xs truncate text-ink-2">{r.recipients.join(', ')}</Td>
                  <Td mono className="text-ink-3">{r.ip}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
