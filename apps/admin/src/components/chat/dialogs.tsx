'use client';

import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { UserMinus, UserPlus } from 'lucide-react';
import { Avatar, Button, Field, Input, Modal, SearchInput, Select, Skeleton } from '@/components/ui';
import { useChatEmployees, type ChatChannel } from '@/lib/queries/chat';

const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

export function NewGroupModal({ open, onClose, selfId, onCreate, busy }: { open: boolean; onClose: () => void; selfId: string; onCreate: (input: { name: string; memberIds: string[] }) => Promise<unknown>; busy: boolean }) {
  const [groupName, setGroupName] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const employees = useChatEmployees();
  const list = useMemo(() => (employees.data ?? []).filter((e) => e.id !== selfId).filter((e) => !q || name(e).toLowerCase().includes(q.toLowerCase())), [employees.data, q, selfId]);
  const reset = () => { setGroupName(''); setQ(''); setPicked([]); setError(null); };
  const submit = async () => {
    if (!groupName.trim()) { setError('Give the group a name.'); return; }
    try {
      await onCreate({ name: groupName.trim(), memberIds: picked });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the group');
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="New group channel"
      footer={
        <>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>Create group</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required error={error ?? undefined}>
          <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Launch week" autoFocus maxLength={80} />
        </Field>
        <Field label={`Members (${picked.length} selected)`} group>
          <div className="space-y-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search people…" />
            <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
              {employees.isLoading && <div className="space-y-2 p-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" /></div>}
              {employees.isError && <div className="p-3 text-xs text-red">Could not load people.</div>}
              {list.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-2.5 border-b border-line-2 px-3 py-1.5 text-[13px] last:border-0 hover:bg-surface-2">
                  <input type="checkbox" className="accent-pri" checked={picked.includes(e.id)} onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))} />
                  <Avatar name={name(e)} size={22} />
                  <span className="text-ink">{name(e)}</span>
                  <span className="ml-auto font-mono text-2xs normal-case tracking-normal text-ink-3">{e.code}</span>
                </label>
              ))}
              {!employees.isLoading && list.length === 0 && <div className="p-3 text-xs text-ink-3">No one matches.</div>}
            </div>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

export function NewDirectModal({ open, onClose, selfId, onPick, busy }: { open: boolean; onClose: () => void; selfId: string; onPick: (employeeId: string) => Promise<unknown>; busy: boolean }) {
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const employees = useChatEmployees();
  const list = useMemo(() => (employees.data ?? []).filter((e) => e.id !== selfId).filter((e) => !q || name(e).toLowerCase().includes(q.toLowerCase())).slice(0, 50), [employees.data, q, selfId]);
  return (
    <Modal open={open} onClose={onClose} title="New direct message" width={460}>
      <div className="space-y-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search people…" />
        {error && <div className="text-xs text-red">{error}</div>}
        <div className="max-h-72 overflow-y-auto rounded-lg border border-line">
          {employees.isLoading && <div className="space-y-2 p-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" /></div>}
          {list.map((e) => (
            <button
              key={e.id}
              type="button"
              disabled={busy}
              className="flex w-full items-center gap-2.5 border-b border-line-2 px-3 py-2 text-left text-[13px] last:border-0 hover:bg-surface-2 disabled:opacity-60"
              onClick={() => onPick(e.id).then(onClose).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not open the conversation'))}
            >
              <Avatar name={name(e)} size={26} />
              <span className="text-ink">{name(e)}</span>
              <span className="ml-auto font-mono text-2xs normal-case tracking-normal text-ink-3">{e.code}</span>
            </button>
          ))}
          {!employees.isLoading && list.length === 0 && <div className="p-3 text-xs text-ink-3">No one matches.</div>}
        </div>
      </div>
    </Modal>
  );
}

export function MembersModal({ open, onClose, channel, canManage, onAdd, onRemove, busy }: { open: boolean; onClose: () => void; channel: ChatChannel; canManage: boolean; onAdd: (employeeId: string) => Promise<unknown>; onRemove: (employeeId: string) => Promise<unknown>; busy: boolean }) {
  const [adding, setAdding] = useState('');
  const employees = useChatEmployees();
  const candidates = (employees.data ?? []).filter((e) => !channel.members.some((m) => m.employeeId === e.id));
  const editable = canManage && channel.kind === 'group';
  return (
    <Modal open={open} onClose={onClose} title={`Members · ${channel.name}`} width={480}>
      <div className="space-y-3">
        {editable && (
          <div className="flex items-end gap-2">
            <Field label="Add a member" className="flex-1">
              <Select value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Choose…</option>
                {candidates.map((e) => (
                  <option key={e.id} value={e.id}>{name(e)} ({e.code})</option>
                ))}
              </Select>
            </Field>
            <Button variant="primary" icon={<UserPlus size={13} />} disabled={!adding} loading={busy} onClick={() => void onAdd(adding).then(() => setAdding(''))}>Add</Button>
          </div>
        )}
        {!editable && channel.kind !== 'group' && <p className="text-xs text-ink-3">Membership of {channel.kind} channels follows the organisation and cannot be edited here.</p>}
        <ul className="max-h-80 divide-y divide-line-2 overflow-y-auto rounded-lg border border-line">
          {channel.members.map((m) => (
            <li key={m.employeeId} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
              <Avatar name={name(m)} size={24} />
              <span className={clsx('flex-1 text-ink', m.status !== 'active' && 'text-ink-3 line-through')}>{name(m)}</span>
              {m.employeeId === channel.createdBy && <span className="rounded bg-gray-soft px-1.5 text-2xs normal-case tracking-normal text-ink-2">creator</span>}
              {editable && (
                <Button size="sm" variant="ghost" icon={<UserMinus size={12} />} aria-label={`Remove ${name(m)}`} disabled={busy} onClick={() => void onRemove(m.employeeId)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

export function RenameModal({ open, onClose, current, onSave, busy }: { open: boolean; onClose: () => void; current: string; onSave: (name: string) => Promise<unknown>; busy: boolean }) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rename channel"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => (value.trim() ? onSave(value.trim()).then(onClose).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not rename')) : setError('Name is required'))}>Save</Button>
        </>
      }
    >
      <Field label="Name" required error={error ?? undefined}>
        <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus maxLength={80} onKeyDown={(e) => e.key === 'Enter' && value.trim() && void onSave(value.trim()).then(onClose)} />
      </Field>
    </Modal>
  );
}

export function ConfirmModal({ open, onClose, title, body, confirmLabel, danger, onConfirm, busy }: { open: boolean; onClose: () => void; title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<unknown>; busy: boolean }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={() => onConfirm().then(onClose).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Action failed'))}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-[13px] text-ink-2">{body}</p>
      {error && <p className="mt-2 text-xs text-red">{error}</p>}
    </Modal>
  );
}
