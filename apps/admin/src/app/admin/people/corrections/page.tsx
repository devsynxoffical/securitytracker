'use client';

import { Suspense, useState } from 'react';
import { UserCheck, Check, X } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCorrections, usePeopleMutation, PEOPLE_ALL, type Correction } from '@/lib/queries/people';
import { Avatar, Badge, Card, EmptyState, PageHeader, Skeleton, useToast } from '@/components/ui';
import { DataTable, Tooltip, ViewTabs, type Column } from '@/components/ui/advanced';
import { DecisionModal, requestTone } from '@/components/people/shared';
import { dateOnly, dateTime, fullName, relative, titleCase } from '@/lib/format';

type View = 'pending' | 'approved' | 'rejected' | 'all';

export default function CorrectionsPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Corrections /></Suspense>;
}

function Corrections() {
  const { can } = useAuth();
  const toast = useToast();
  const [view, setView] = useState<View>('pending');
  const [decision, setDecision] = useState<{ c: Correction; status: 'approved' | 'rejected' } | null>(null);
  const q = useCorrections(view === 'all' ? undefined : view);
  const pendingCount = useCorrections('pending');
  const decide = usePeopleMutation(({ id, body }: { id: string; body: Record<string, unknown> }) => http.post(`/attendance/corrections/${id}/decide`, body), PEOPLE_ALL);

  const cols: Column<Correction>[] = [
    { key: 'employee', header: 'Employee', locked: true, cell: (c) => <div className="flex items-center gap-2.5">{c.employee && <Avatar name={fullName(c.employee)} size={26} />}<div className="min-w-0"><div className="font-semibold text-ink">{c.employee ? fullName(c.employee) : '—'}</div><div className="text-xs text-ink-3">{c.employee?.department?.name ?? ''}</div></div></div> },
    { key: 'date', header: 'Date', mono: true, cell: (c) => dateOnly(c.date) },
    { key: 'type', header: 'Type', cell: (c) => <Badge tone="gray">{titleCase(c.type)}</Badge> },
    { key: 'times', header: 'Requested times', mono: true, cell: (c) => <span className="text-xs">{c.requestedStart ? dateTime(c.requestedStart) : '—'}{c.requestedEnd ? ` → ${dateTime(c.requestedEnd)}` : ''}</span> },
    { key: 'reason', header: 'Reason', cell: (c) => <div className="max-w-sm text-ink-2">{c.reason}{c.comment && <div className="text-xs text-ink-3">Decision: {c.comment}</div>}</div> },
    { key: 'status', header: 'Status', cell: (c) => <Badge tone={requestTone(c.status)}>{titleCase(c.status)}</Badge> },
    { key: 'created', header: 'Requested', right: true, cell: (c) => <span className="text-ink-3">{relative(c.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Attendance corrections" subtitle="Approved corrections add an adjustment; tracked data is never edited (F9)" />
      <Card>
        <ViewTabs value={view} onChange={setView} views={[{ value: 'pending', label: 'Pending', count: pendingCount.data?.length }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' }]} />
        <DataTable
          rows={q.data ?? []}
          columns={cols}
          loading={q.isLoading}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          storageKey="people.corrections"
          empty={<EmptyState icon={<UserCheck size={20} />} title={view === 'pending' ? 'Nothing to review' : 'No corrections'} body="Employees request corrections from the desktop app." />}
          rowActions={can('attendance.approve') ? (c) => c.status === 'pending' ? (
            <>
              <Tooltip label="Approve"><button type="button" className="rounded p-1 text-green hover:bg-green-soft" onClick={() => setDecision({ c, status: 'approved' })} aria-label="Approve"><Check size={14} /></button></Tooltip>
              <Tooltip label="Reject"><button type="button" className="rounded p-1 text-red hover:bg-red-soft" onClick={() => setDecision({ c, status: 'rejected' })} aria-label="Reject"><X size={14} /></button></Tooltip>
            </>
          ) : null : undefined}
        />
      </Card>
      {decision && (
        <DecisionModal title={`${decision.status === 'approved' ? 'Approve' : 'Reject'} correction · ${decision.c.employee ? fullName(decision.c.employee) : ''}`} confirmLabel={titleCase(decision.status)} danger={decision.status === 'rejected'} loading={decide.isPending} onClose={() => setDecision(null)}
          onConfirm={(comment) => decide.mutate({ id: decision.c.id, body: { status: decision.status, comment: comment || undefined } }, { onSuccess: () => { toast.push('success', `Correction ${decision.status}`); setDecision(null); }, onError: (e) => toast.push('error', (e as Error).message) })}>
          <div className="mb-3 rounded-card border border-line bg-surface-2 p-3 text-sm text-ink-2">
            <div><b className="text-ink">{titleCase(decision.c.type)}</b> on {dateOnly(decision.c.date)}</div>
            {decision.c.requestedStart && <div className="font-mono text-xs">{dateTime(decision.c.requestedStart)}{decision.c.requestedEnd ? ` → ${dateTime(decision.c.requestedEnd)}` : ''}</div>}
            <div className="mt-1">{decision.c.reason}</div>
          </div>
        </DecisionModal>
      )}
    </div>
  );
}
