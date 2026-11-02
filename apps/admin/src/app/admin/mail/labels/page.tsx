'use client';

import { useState } from 'react';
import { Tags, Plus, Pencil, Trash2 } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMailLabels, useMailMutation, type MailLabel } from '@/lib/queries/mail';
import { Button, Card, Table, Th, Td, TableSkeleton, EmptyState, ErrorBanner, Modal, Field, Input, useToast, PageHeader } from '@/components/ui';
import { LabelChips } from '@/components/mail/shared';

export default function LabelsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const manage = can('mail.templates.manage');
  const q = useMailLabels();
  const [editing, setEditing] = useState<MailLabel | null | 'new'>(null);
  const del = useMailMutation((id: string) => http.del(`/mail/labels/${id}`));
  return (
    <div>
      <PageHeader title="Labels" subtitle="Company-wide conversation labels, independent from Gmail labels" actions={manage && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New label</Button>} />
      <Card>
        {q.isLoading && <TableSkeleton cols={3} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data?.length === 0 && <EmptyState icon={<Tags size={28} />} title="No labels" body="Labels help the team sort conversations: Billing, Support, Urgent…" action={manage ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New label</Button> : undefined} />}
        {q.data && q.data.length > 0 && (
          <Table>
            <thead><tr><Th>Label</Th><Th right>Conversations</Th><Th /></tr></thead>
            <tbody>
              {q.data.map((l) => (
                <tr key={l.id} className="hover:bg-surface-2">
                  <Td><LabelChips labels={[l]} /></Td>
                  <Td right mono>{l.usageCount ?? 0}</Td>
                  <Td right>{manage && <div className="flex justify-end gap-1"><Button size="sm" icon={<Pencil size={12} />} onClick={() => setEditing(l)}>Edit</Button><Button size="sm" variant="danger-outline" icon={<Trash2 size={12} />} onClick={() => window.confirm('Delete this label from every conversation?') && del.mutate(l.id, { onError: (e) => toast.push('error', (e as Error).message) })}>Delete</Button></div>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <LabelModal label={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function LabelModal({ label, onClose }: { label: MailLabel | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(label?.name ?? '');
  const [colour, setColour] = useState(label?.colour ?? '#2459C4');
  const save = useMailMutation((b: unknown) => (label ? http.patch(`/mail/labels/${label.id}`, b) : http.post('/mail/labels', b)));
  return (
    <Modal open onClose={onClose} title={label ? 'Edit label' : 'New label'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate({ name, colour }, { onSuccess: () => { toast.push('success', 'Label saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Save</Button></>}>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Colour"><Input type="color" value={colour} onChange={(e) => setColour(e.target.value)} /></Field>
      </div>
      <div className="mt-3"><LabelChips labels={[{ id: 'preview', name: name || 'Preview', colour }]} /></div>
    </Modal>
  );
}
