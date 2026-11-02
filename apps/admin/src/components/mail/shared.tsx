'use client';

import { useState } from 'react';
import { Tag as TagIcon, X } from 'lucide-react';
import { Badge, Select, Button, Modal, Field, Input, type Tone } from '@/components/ui';
import { useEmployees } from '@/lib/queries/crm';
import { useMailLabels, useMailboxes, type Mailbox, type MailLabel } from '@/lib/queries/mail';
import { fullName } from '@/lib/format';

export const MAILBOX_PERMISSIONS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'read', label: 'Read', hint: 'See conversations and messages' },
  { key: 'reply', label: 'Reply', hint: 'Reply in existing conversations' },
  { key: 'send', label: 'Send', hint: 'Start new emails' },
  { key: 'draft', label: 'Draft', hint: 'Save drafts' },
  { key: 'attach', label: 'Attach', hint: 'Add attachments' },
  { key: 'download', label: 'Download', hint: 'Download attachments' },
  { key: 'archive', label: 'Archive', hint: 'Archive in Gmail' },
  { key: 'mark_read', label: 'Mark read', hint: 'Change unread state' },
  { key: 'triage', label: 'Triage', hint: 'Assign, close, snooze, label, link' },
  { key: 'comment', label: 'Comment', hint: 'Internal comments' },
];

export function statusTone(status: string): Tone {
  if (status === 'open') return 'green';
  if (status === 'snoozed') return 'amber';
  return 'gray';
}

export function healthTone(h: string): Tone {
  if (h === 'ok') return 'green';
  if (h === 'warning') return 'amber';
  return 'red';
}

export function MailboxSelect({ value, onChange, mailboxes }: { value: string; onChange: (v: string) => void; mailboxes: Mailbox[] }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {mailboxes.length === 0 && <option value="">No mailbox assigned to you</option>}
      {mailboxes.map((m) => (
        <option key={m.id} value={m.id}>
          {m.displayName} ({m.address})
        </option>
      ))}
    </Select>
  );
}

/** Employees who have an assignment on the mailbox (any permission). Falls back to all active employees. */
export function AssigneeSelect({ mailbox, value, onChange, allowUnassigned = true }: { mailbox: Mailbox | undefined; value: string; onChange: (v: string) => void; allowUnassigned?: boolean }) {
  const { data } = useEmployees();
  const admin = useMailboxes(true);
  const adminMailbox = admin.data?.find((m) => m.id === mailbox?.id);
  const allowed = adminMailbox?.assignments?.map((a) => a.employee) ?? data ?? [];
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowUnassigned && <option value="">Unassigned</option>}
      {allowed.map((e) => (
        <option key={e.id} value={e.id}>
          {fullName(e)}
        </option>
      ))}
    </Select>
  );
}

export function LabelChips({ labels, onRemove }: { labels: MailLabel[]; onRemove?: (id: string) => void }) {
  if (labels.length === 0) return <span className="text-xs text-ink-3">No labels</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span key={l.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${l.colour}22`, color: l.colour }}>
          <TagIcon size={10} /> {l.name}
          {onRemove && (
            <button type="button" aria-label={`Remove ${l.name}`} onClick={() => onRemove(l.id)} className="ml-0.5 opacity-70 hover:opacity-100">
              <X size={10} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

export function LabelPicker({ exclude, onPick }: { exclude: string[]; onPick: (id: string) => void }) {
  const { data } = useMailLabels();
  const options = (data ?? []).filter((l) => !exclude.includes(l.id));
  return (
    <Select value="" onChange={(e) => e.target.value && onPick(e.target.value)} disabled={options.length === 0}>
      <option value="">{options.length ? 'Add label…' : 'No more labels'}</option>
      {options.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </Select>
  );
}

export function SnoozeModal({ open, onClose, onConfirm, busy }: { open: boolean; onClose: () => void; onConfirm: (iso: string) => void; busy?: boolean }) {
  const [value, setValue] = useState('');
  const presets: Array<[string, number]> = [['In 3 hours', 3], ['Tomorrow 9:00', -1], ['In 2 days', 48], ['Next week', 24 * 7]];
  const preset = (hours: number) => {
    const d = new Date();
    if (hours === -1) {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else d.setTime(d.getTime() + hours * 3_600_000);
    onConfirm(d.toISOString());
  };
  return (
    <Modal open={open} onClose={onClose} title="Snooze conversation" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!value} loading={busy} onClick={() => onConfirm(new Date(value).toISOString())}>Snooze</Button></>}>
      <div className="mb-3 flex flex-wrap gap-2">
        {presets.map(([label, h]) => (
          <Button key={label} size="sm" onClick={() => preset(h)}>
            {label}
          </Button>
        ))}
      </div>
      <Field label="Or pick a time"><Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
    </Modal>
  );
}

export function StatusBadge({ status, snoozedUntil }: { status: string; snoozedUntil?: string | null }) {
  const label = status === 'snoozed' && snoozedUntil ? `Snoozed until ${new Date(snoozedUntil).toLocaleString()}` : status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge tone={statusTone(status)} dot>{label}</Badge>;
}
