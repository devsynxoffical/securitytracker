'use client';

import { useState } from 'react';
import { Tags, Plus, Pencil, Trash2, Tag as TagIcon } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMailLabels, useMailMutation, type MailLabel } from '@/lib/queries/mail';
import { Button, Card, Skeleton, EmptyState, ErrorBanner, Modal, Field, Input, useToast, PageHeader } from '@/components/ui';
import { Menu } from '@/components/ui/advanced';

const SWATCHES = ['#C2362B', '#B26A00', '#1E8E5A', '#0F6B5C', '#2459C4', '#6B46C1', '#5C666E', '#E0921A'];

export default function LabelsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const manage = can('mail.templates.manage');
  const q = useMailLabels();
  const [editing, setEditing] = useState<MailLabel | null | 'new'>(null);
  const del = useMailMutation((id: string) => http.del(`/mail/labels/${id}`));
  return (
    <div>
      <PageHeader title="Labels" subtitle="Company-wide conversation labels, independent from Gmail labels." actions={manage && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New label</Button>} />
      {q.isLoading && <div className="grid grid-cols-4 gap-3.5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
      {q.isError && <Card><ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} /></Card>}
      {q.data?.length === 0 && <Card><EmptyState icon={<Tags size={28} />} title="No labels" body="Labels help the team sort conversations: Billing, Support, Urgent…" action={manage ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New label</Button> : undefined} /></Card>}
      {q.data && q.data.length > 0 && (
        <div className="grid grid-cols-4 gap-3.5">
          {q.data.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition hover:border-pri">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${l.colour}22`, color: l.colour }}><TagIcon size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-ink">{l.name}</div>
                <div className="font-mono text-xs text-ink-3">{l.usageCount ?? 0} conversation{(l.usageCount ?? 0) === 1 ? '' : 's'}</div>
              </div>
              {manage && (
                <Menu
                  items={[
                    { label: 'Edit', icon: <Pencil size={14} />, onSelect: () => setEditing(l) },
                    { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => window.confirm('Delete this label from every conversation?') && del.mutate(l.id, { onError: (e) => toast.push('error', (e as Error).message) }) },
                  ]}
                />
              )}
            </div>
          ))}
        </div>
      )}
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
      <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label="Colour" className="mt-3">
        <div className="flex items-center gap-2">
          {SWATCHES.map((c) => (
            <button key={c} type="button" aria-label={c} onClick={() => setColour(c)} className="h-7 w-7 rounded-full border-2 transition" style={{ background: c, borderColor: colour === c ? 'var(--ink)' : 'transparent' }} />
          ))}
          <Input type="color" value={colour} onChange={(e) => setColour(e.target.value)} className="h-7 w-10 p-0.5" />
        </div>
      </Field>
      <div className="mt-4 rounded-card border border-line bg-surface-2 p-3 text-xs text-ink-3">
        Preview: <span className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${colour}22`, color: colour }}><TagIcon size={10} /> {name || 'Label'}</span>
      </div>
    </Modal>
  );
}
