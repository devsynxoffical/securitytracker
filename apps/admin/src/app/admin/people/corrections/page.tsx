'use client';

import { Suspense, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCorrections, usePeopleMutation, PEOPLE_ALL, type Correction } from '@/lib/queries/people';
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, Segmented, Skeleton, Table, TableSkeleton, Td, Th, useToast } from '@/components/ui';
import { DecisionModal, requestTone } from '@/components/people/shared';
import { dateOnly, dateTime, fullName, relative, titleCase } from '@/lib/format';

export default function CorrectionsPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Corrections /></Suspense>;
}

function Corrections() {
  const { can } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [decision, setDecision] = useState<{ c: Correction; status: 'approved' | 'rejected' } | null>(null);
  const q = useCorrections(status === 'all' ? undefined : status);
  const decide = usePeopleMutation(({ id, body }: { id: string; body: Record<string, unknown> }) => http.post(`/attendance/corrections/${id}/decide`, body), PEOPLE_ALL);

  return (
    <div>
      <PageHeader title="Attendance corrections" subtitle="Approved corrections add an adjustment; tracked data is never edited (F9)" />
      <div className="mb-3"><Segmented value={status} onChange={setStatus} options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' }]} /></div>
      <Card>
        {q.isLoading && <TableSkeleton cols={6} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && q.data.length === 0 && <EmptyState icon={<UserCheck size={20} />} title={status === 'pending' ? 'Nothing to review' : 'No corrections'} body="Employees request corrections from the desktop app." />}
        {q.data && q.data.length > 0 && (
          <Table>
            <thead><tr><Th>Employee</Th><Th>Date</Th><Th>Type</Th><Th>Requested times</Th><Th>Reason</Th><Th>Status</Th><Th right>Requested</Th>{can('attendance.approve') && <Th />}</tr></thead>
            <tbody>
              {q.data.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2">
                  <Td className="font-semibold">{c.employee ? fullName(c.employee) : '—'}<div className="text-xs font-normal text-ink-3">{c.employee?.department?.name ?? ''}</div></Td>
                  <Td>{dateOnly(c.date)}</Td>
                  <Td>{titleCase(c.type)}</Td>
                  <Td mono className="text-xs">{c.requestedStart ? dateTime(c.requestedStart) : '—'}{c.requestedEnd ? ` → ${dateTime(c.requestedEnd)}` : ''}</Td>
                  <Td className="max-w-xs text-ink-2">{c.reason}{c.comment && <div className="text-xs text-ink-3">Decision: {c.comment}</div>}</Td>
                  <Td><Badge tone={requestTone(c.status)}>{titleCase(c.status)}</Badge></Td>
                  <Td right className="text-ink-3">{relative(c.createdAt)}</Td>
                  {can('attendance.approve') && <Td right>{c.status === 'pending' && <div className="flex justify-end gap-1"><Button size="sm" variant="primary" onClick={() => setDecision({ c, status: 'approved' })}>Approve</Button><Button size="sm" variant="danger-outline" onClick={() => setDecision({ c, status: 'rejected' })}>Reject</Button></div>}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {decision && (
        <DecisionModal title={`${decision.status === 'approved' ? 'Approve' : 'Reject'} correction · ${decision.c.employee ? fullName(decision.c.employee) : ''}`} confirmLabel={titleCase(decision.status)} danger={decision.status === 'rejected'} loading={decide.isPending} onClose={() => setDecision(null)}
          onConfirm={(comment) => decide.mutate({ id: decision.c.id, body: { status: decision.status, comment: comment || undefined } }, { onSuccess: () => { toast.push('success', `Correction ${decision.status}`); setDecision(null); }, onError: (e) => toast.push('error', (e as Error).message) })} />
      )}
    </div>
  );
}
