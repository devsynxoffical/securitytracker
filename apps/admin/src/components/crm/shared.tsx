'use client';

import { useState, type ReactNode } from 'react';
import { StickyNote, Phone, Mail, CalendarClock, CheckSquare, ArrowRightLeft, UserPlus, Pencil, Sparkles, Upload, Tag as TagIcon, Plus, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { http } from '@/lib/api';
import {
  useActivities,
  useEmployees,
  useTags,
  useLostReasons,
  useCustomFields,
  useCrmMutation,
  keys,
  type Activity,
  type EntityType,
  type Tag,
  type CustomFieldDef,
} from '@/lib/queries/crm';
import { Button, Field, Input, Select, Textarea, Modal, Skeleton, EmptyState, ErrorBanner, TagChip, Badge, Checkbox, useToast } from '@/components/ui';
import { fullName, dateTime, relative, fromLocalInput } from '@/lib/format';

// ---------------------------------------------------------------------------
// Owner select
// ---------------------------------------------------------------------------

export function OwnerSelect({ value, onChange, allowEmpty = true, emptyLabel = 'Me (default)' }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean; emptyLabel?: string }) {
  const { data, isLoading } = useEmployees();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={isLoading}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {(data ?? []).map((e) => (
        <option key={e.id} value={e.id}>
          {fullName(e)} ({e.code})
        </option>
      ))}
    </Select>
  );
}

export function OwnerFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <OwnerSelect value={value} onChange={onChange} emptyLabel="All owners" />;
}

// ---------------------------------------------------------------------------
// Tag picker
// ---------------------------------------------------------------------------

export function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data } = useTags();
  const tags = data ?? [];
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((t) => t !== id) : [...value, id]);
  if (tags.length === 0) return <div className="text-xs text-ink-3">No tags defined. Create them under CRM → Settings → Tags.</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => {
        const on = value.includes(t.id);
        return (
          <button key={t.id} type="button" onClick={() => toggle(t.id)} className={clsx('rounded-full border px-2 py-0.5 text-[11.5px] font-semibold transition', on ? 'border-transparent' : 'border-line bg-surface text-ink-2 hover:bg-surface-2')} style={on ? { backgroundColor: `${t.colour}22`, color: t.colour } : undefined}>
            {on && <Check size={10} className="mr-1 inline" />}
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

export function TagFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useTags();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All tags</option>
      {(data ?? []).map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  );
}

export function TagList({ tags }: { tags: Tag[] }) {
  if (!tags?.length) return <span className="text-ink-3">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <TagChip key={t.id} name={t.name} colour={t.colour} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

export function CustomFieldInputs({ entityType, value, onChange }: { entityType: EntityType; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const { data } = useCustomFields(entityType);
  const defs = data ?? [];
  if (defs.length === 0) return null;
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3">
      {defs.map((d) => (
        <Field key={d.id} label={d.label} required={d.required}>
          <CustomFieldInput def={d} value={value[d.key]} onChange={(v) => set(d.key, v)} />
        </Field>
      ))}
    </div>
  );
}

function CustomFieldInput({ def, value, onChange }: { def: CustomFieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const s = (value ?? '') as string;
  switch (def.type) {
    case 'number':
      return <Input type="number" value={s} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'date':
      return <Input type="date" value={s} onChange={(e) => onChange(e.target.value || null)} />;
    case 'checkbox':
      return <Checkbox checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} label={def.label} />;
    case 'select':
      return (
        <Select value={s} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {def.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
      );
    case 'multi_select': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-2 py-2">
          {def.options.map((o) => (
            <Checkbox key={o} label={o} checked={arr.includes(o)} onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} />
          ))}
        </div>
      );
    }
    case 'url':
      return <Input type="url" value={s} onChange={(e) => onChange(e.target.value || null)} placeholder="https://" />;
    case 'email':
      return <Input type="email" value={s} onChange={(e) => onChange(e.target.value || null)} />;
    default:
      return <Input value={s} onChange={(e) => onChange(e.target.value || null)} />;
  }
}

export function CustomFieldValues({ entityType, values }: { entityType: EntityType; values: Record<string, unknown> }) {
  const { data } = useCustomFields(entityType);
  const defs = (data ?? []).filter((d) => values?.[d.key] !== undefined && values?.[d.key] !== null && values?.[d.key] !== '');
  if (defs.length === 0) return null;
  return (
    <div className="rounded-card border border-line bg-surface-2 p-3">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Custom fields</div>
      {defs.map((d) => (
        <div key={d.id} className="grid grid-cols-[140px_1fr] gap-3 py-1 text-[13px]">
          <span className="text-ink-3">{d.label}</span>
          <span className="text-ink">{Array.isArray(values[d.key]) ? (values[d.key] as string[]).join(', ') : String(values[d.key])}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lost reason modal
// ---------------------------------------------------------------------------

export function LostReasonModal({ open, onClose, onConfirm, busy }: { open: boolean; onClose: () => void; onConfirm: (lostReasonId: string) => void; busy?: boolean }) {
  const { data } = useLostReasons();
  const [reason, setReason] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark as lost"
      width={420}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!reason} loading={busy} onClick={() => onConfirm(reason)}>
            Mark lost
          </Button>
        </>
      }
    >
      <Field label="Lost reason" required hint="Required for every lost record (FR-CRM-12).">
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Select a reason…</option>
          {(data ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Activity timeline + composer
// ---------------------------------------------------------------------------

const icon: Record<string, ReactNode> = {
  note: <StickyNote size={14} />,
  call: <Phone size={14} />,
  email: <Mail size={14} />,
  meeting: <CalendarClock size={14} />,
  task: <CheckSquare size={14} />,
  stage_changed: <ArrowRightLeft size={14} />,
  assigned: <UserPlus size={14} />,
  field_changed: <Pencil size={14} />,
  converted: <Sparkles size={14} />,
  created: <Plus size={14} />,
  created_from_lead: <Sparkles size={14} />,
  imported: <Upload size={14} />,
  tag_added: <TagIcon size={14} />,
  tag_removed: <TagIcon size={14} />,
};

function describe(a: Activity): string {
  const d = a.data ?? {};
  switch (a.type) {
    case 'stage_changed':
      return `Stage: ${String(d.fromStageName ?? d.stageName ?? '')} → ${String(d.toStageName ?? d.stageName ?? '')}`.replace(':  →', ': moved to');
    case 'assigned':
      return d.bulk ? 'Owner changed (bulk)' : 'Owner changed';
    case 'field_changed': {
      const ch = (d.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
      return Object.entries(ch)
        .map(([k, v]) => `${k}: ${String(v.from ?? '—')} → ${String(v.to ?? '—')}`)
        .join(', ');
    }
    case 'converted':
      return 'Lead converted';
    case 'created':
      return 'Record created';
    case 'created_from_lead':
      return 'Created from lead conversion';
    case 'imported':
      return d.updated ? 'Updated by import' : 'Created by import';
    case 'tag_added':
      return 'Tag added';
    case 'tag_removed':
      return 'Tag removed';
    default:
      return a.subject ?? a.type;
  }
}

export function ActivityTimeline({ entityType, entityId, canEdit }: { entityType: EntityType; entityId: string; canEdit: boolean }) {
  const q = useActivities(entityType, entityId);
  const invalidate = [keys.activities(entityType, entityId), ['activities', 'agenda']];
  const setStatus = useCrmMutation((a: { id: string; status: string }) => http.patch(`/crm/activities/${a.id}`, { status: a.status }), invalidate);

  return (
    <div className="space-y-4">
      {canEdit && <ActivityComposer entityType={entityType} entityId={entityId} />}
      {q.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      )}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.items.length === 0 && <EmptyState title="No activity yet" body="Notes, calls, meetings and changes will appear here." />}
      {q.data && q.data.items.length > 0 && (
        <ol className="relative space-y-3 border-l border-line-2 pl-5">
          {q.data.items.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[27px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-ink-3">{icon[a.type] ?? <Pencil size={14} />}</span>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-semibold text-ink">{a.subject || describe(a)}</span>
                    {a.status && <Badge tone={a.status === 'done' ? 'green' : a.status === 'cancelled' ? 'gray' : 'amber'}>{a.status}</Badge>}
                    {a.dueAt && a.status === 'planned' && <span className="text-xs text-ink-3">due {dateTime(a.dueAt)}</span>}
                  </div>
                  {a.body && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink-2">{a.body}</p>}
                  {a.subject && a.type !== 'note' && <div className="text-xs text-ink-3">{describe(a)}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {a.status === 'planned' && canEdit && (
                    <Button size="sm" onClick={() => setStatus.mutate({ id: a.id, status: 'done' })} icon={<Check size={12} />}>
                      Done
                    </Button>
                  )}
                  <span className="text-xs text-ink-3" title={dateTime(a.occurredAt)}>
                    {relative(a.occurredAt)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

type ActType = 'note' | 'call' | 'meeting' | 'task' | 'email';

export function ActivityComposer({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const toast = useToast();
  const [type, setType] = useState<ActType>('note');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [due, setDue] = useState('');
  const [duration, setDuration] = useState('');
  const [status, setStatus] = useState<'planned' | 'done'>('done');
  const m = useCrmMutation(
    (payload: Record<string, unknown>) => http.post('/crm/activities', payload),
    [keys.activities(entityType, entityId), ['activities', 'agenda'], [entityType === 'lead' ? 'leads' : entityType === 'deal' ? 'deals' : `${entityType}s`]],
  );
  const schedulable = type === 'call' || type === 'meeting' || type === 'task';

  const submit = () => {
    if (!body.trim() && !subject.trim()) return;
    m.mutate(
      {
        entityType,
        entityId,
        type,
        subject: subject.trim() || undefined,
        body: body.trim() || undefined,
        status: schedulable ? status : undefined,
        dueAt: schedulable && status === 'planned' ? fromLocalInput(due) : undefined,
        durationSeconds: type === 'call' && duration ? Number(duration) * 60 : undefined,
      },
      {
        onSuccess: () => {
          setSubject('');
          setBody('');
          setDue('');
          setDuration('');
          toast.push('success', 'Activity logged');
        },
        onError: (e) => toast.push('error', (e as Error).message),
      },
    );
  };

  return (
    <div className="rounded-card border border-line bg-surface-2 p-3">
      <div className="mb-2 flex flex-wrap gap-1">
        {(['note', 'call', 'meeting', 'task', 'email'] as ActType[]).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={clsx('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold capitalize', type === t ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:bg-surface')}>
            {icon[t]} {t}
          </button>
        ))}
      </div>
      {type !== 'note' && <Input className="mb-2" placeholder={type === 'task' ? 'Task title' : 'Subject'} value={subject} onChange={(e) => setSubject(e.target.value)} />}
      <Textarea placeholder={type === 'note' ? 'Write a note…' : 'Details (optional)'} value={body} onChange={(e) => setBody(e.target.value)} />
      {schedulable && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value as 'planned' | 'done')}>
            <option value="done">Already done</option>
            <option value="planned">Planned</option>
          </Select>
          {status === 'planned' && <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />}
          {type === 'call' && <Input type="number" min={0} placeholder="Duration (min)" value={duration} onChange={(e) => setDuration(e.target.value)} />}
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <Button variant="primary" size="sm" loading={m.isPending} onClick={submit} disabled={!body.trim() && !subject.trim()}>
          Log {type}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phone / email list editors
// ---------------------------------------------------------------------------

export interface ContactPoint {
  value: string;
  label: string;
}

export function ContactPointEditor({ kind, items, onChange }: { kind: 'phone' | 'email'; items: ContactPoint[]; onChange: (v: ContactPoint[]) => void }) {
  const labels = kind === 'phone' ? ['Mobile', 'Work', 'Home', 'Other'] : ['Work', 'Personal', 'Other'];
  const update = (i: number, patch: Partial<ContactPoint>) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <Input type={kind === 'phone' ? 'tel' : 'email'} value={it.value} onChange={(e) => update(i, { value: e.target.value })} placeholder={kind === 'phone' ? '+1 555 0100' : 'name@company.com'} />
          <Select className="w-32" value={it.label} onChange={(e) => update(i, { label: e.target.value })}>
            {labels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
          <Button variant="ghost" onClick={() => onChange(items.filter((_, idx) => idx !== i))} aria-label="Remove">
            ×
          </Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => onChange([...items, { value: '', label: labels[0]! }])}>
        Add {kind}
      </Button>
    </div>
  );
}

export function toPhones(items: ContactPoint[]) {
  const list = items.filter((i) => i.value.trim());
  return list.length ? list.map((i, idx) => ({ phone: i.value.trim(), label: i.label, isPrimary: idx === 0 })) : undefined;
}
export function toEmails(items: ContactPoint[]) {
  const list = items.filter((i) => i.value.trim());
  return list.length ? list.map((i, idx) => ({ email: i.value.trim(), label: i.label, isPrimary: idx === 0 })) : undefined;
}
