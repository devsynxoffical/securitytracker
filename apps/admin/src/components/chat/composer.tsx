'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Send, Link2, X, CheckSquare, Target } from 'lucide-react';
import { Avatar, Button } from '@/components/ui';
import { useSearch } from '@/lib/queries/crm';
import { useMyTasks } from '@/lib/queries/tasks';
import type { ChatMember, RecordRef } from '@/lib/queries/chat';

const MAX = 4000;

interface Picked {
  ref: RecordRef;
  title: string;
}

/**
 * Composer (22 section 6): Enter sends, Shift+Enter inserts a newline, `@` opens member autocomplete,
 * `/task` and `/lead` open record pickers. Typing is reported at most every 3.5 s (server limit 3 s).
 */
export function Composer({
  members,
  selfId,
  disabled,
  disabledReason,
  onSend,
  onTyping,
  channelKey,
}: {
  members: ChatMember[];
  selfId: string;
  disabled: boolean;
  disabledReason?: string;
  onSend: (input: { body: string; mentions: string[]; recordRef: RecordRef | null }) => Promise<unknown>;
  onTyping: () => void;
  channelKey: string;
}) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [picker, setPicker] = useState<'task' | 'lead' | null>(null);
  const [pickerQ, setPickerQ] = useState('');
  const [caret, setCaret] = useState(0);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  useEffect(() => {
    setValue('');
    setMentionIds([]);
    setPicked(null);
    setPicker(null);
    setError(null);
  }, [channelKey]);

  // @ autocomplete: the word after the last "@" before the caret
  const mentionQuery = useMemo(() => {
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1) return null;
    if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
    const q = before.slice(at + 1);
    if (/\n/.test(q) || q.length > 40) return null;
    return { start: at, q };
  }, [value, caret]);
  const candidates = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.q.toLowerCase();
    return members
      .filter((m) => m.employeeId !== selfId && m.status === 'active')
      .filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, members, selfId]);
  useEffect(() => setHi(0), [mentionQuery?.q]);

  // "/task" and "/lead" open the record picker
  useEffect(() => {
    const m = /^\/(task|lead)\s*$/.exec(value);
    if (m) {
      setPicker(m[1] as 'task' | 'lead');
      setPickerQ('');
      setValue('');
    }
  }, [value]);

  const pickMention = useCallback(
    (m: ChatMember) => {
      if (!mentionQuery) return;
      const name = `${m.firstName} ${m.lastName}`.trim();
      const next = `${value.slice(0, mentionQuery.start)}@${name} ${value.slice(caret)}`;
      setValue(next);
      setMentionIds((ids) => (ids.includes(m.employeeId) ? ids : [...ids, m.employeeId]));
      const pos = mentionQuery.start + name.length + 2;
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.setSelectionRange(pos, pos);
        setCaret(pos);
      });
    },
    [mentionQuery, value, caret],
  );

  const send = async () => {
    const body = value.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    setError(null);
    try {
      await onSend({ body, mentions: mentionIds, recordRef: picked?.ref ?? null });
      setValue('');
      setMentionIds([]);
      setPicked(null);
      ref.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the message');
    } finally {
      setSending(false);
    }
  };

  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(180, Math.max(40, el.scrollHeight))}px`;
  };
  useEffect(grow, [value]);

  return (
    <div className="border-t border-line bg-surface px-4 py-3">
      {disabled && disabledReason && <div className="mb-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">{disabledReason}</div>}
      {picked && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink">
          <Link2 size={12} className="text-ink-3" />
          <span className="uppercase tracking-[0.08em] text-ink-3">{picked.ref.type}</span>
          <span className="font-medium">{picked.title}</span>
          <button type="button" aria-label="Remove linked record" className="rounded p-0.5 text-ink-3 hover:text-ink" onClick={() => setPicked(null)}>
            <X size={12} />
          </button>
        </div>
      )}
      <div className="relative">
        {mentionQuery && candidates.length > 0 && !disabled && (
          <ul role="listbox" aria-label="Mention a member" className="pop-in absolute bottom-full left-0 z-30 mb-1.5 w-72 overflow-hidden rounded-card border border-line bg-surface shadow-pop">
            {candidates.map((m, i) => (
              <li key={m.employeeId} role="option" aria-selected={i === hi}>
                <button type="button" className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]', i === hi ? 'bg-pri-soft text-ink' : 'text-ink-2 hover:bg-surface-2')} onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(m)}>
                  <Avatar name={`${m.firstName} ${m.lastName}`} size={22} />
                  <span className="font-medium">{m.firstName} {m.lastName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {picker && <RecordPicker type={picker} q={pickerQ} onQ={setPickerQ} onClose={() => { setPicker(null); ref.current?.focus(); }} onPick={(p) => { setPicked(p); setPicker(null); ref.current?.focus(); }} />}
        <div className={clsx('flex items-end gap-2 rounded-lg border bg-surface-2 px-3 py-1.5 transition focus-within:border-pri focus-within:bg-surface', error ? 'border-red' : 'border-line')}>
          <textarea
            ref={ref}
            value={value}
            disabled={disabled}
            aria-label="Message"
            placeholder={disabled ? 'Sending is disabled' : 'Write a message… Enter to send, Shift+Enter for a new line, @ to mention, /task or /lead to link'}
            rows={1}
            maxLength={MAX}
            className="max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[13px] leading-[19px] text-ink placeholder:text-ink-3 focus:outline-none disabled:cursor-not-allowed"
            onChange={(e) => {
              setValue(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              const now = Date.now();
              if (e.target.value && now - lastTyping.current > 3500) {
                lastTyping.current = now;
                onTyping();
              }
            }}
            onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
            onKeyDown={(e) => {
              if (mentionQuery && candidates.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % candidates.length); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + candidates.length) % candidates.length); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(candidates[hi]!); return; }
                if (e.key === 'Escape') { e.preventDefault(); setCaret(0); return; }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button variant="primary" size="sm" icon={<Send size={13} />} aria-label="Send message" disabled={disabled || !value.trim()} loading={sending} onClick={() => void send()} className="mb-1">
            Send
          </Button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-2xs normal-case tracking-normal text-ink-3">
        <span>{error ? <span className="text-red">{error}</span> : 'Bold **text**, italic _text_, `code`, links. Messages stay in the system; no export.'}</span>
        <span className={clsx('font-mono', value.length > MAX - 200 && 'text-amber')}>{value.length}/{MAX}</span>
      </div>
    </div>
  );
}

function RecordPicker({ type, q, onQ, onClose, onPick }: { type: 'task' | 'lead'; q: string; onQ: (v: string) => void; onClose: () => void; onPick: (p: Picked) => void }) {
  const tasks = useMyTasks('open');
  const search = useSearch(q);
  const items: Picked[] = useMemo(() => {
    if (type === 'task') {
      const list = tasks.data?.items ?? [];
      return list.filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase())).slice(0, 8).map((t) => ({ ref: { type: 'task', id: t.id }, title: t.title }));
    }
    return (search.data?.leads ?? []).map((l) => ({ ref: { type: 'lead', id: l.id }, title: l.name }));
  }, [type, q, tasks.data, search.data]);
  const loading = type === 'task' ? tasks.isLoading : search.isLoading;
  return (
    <div className="pop-in absolute bottom-full left-0 z-30 mb-1.5 w-96 overflow-hidden rounded-card border border-line bg-surface shadow-pop" role="dialog" aria-label={`Link a ${type}`}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        {type === 'task' ? <CheckSquare size={14} className="text-ink-3" /> : <Target size={14} className="text-ink-3" />}
        <input autoFocus value={q} onChange={(e) => onQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onClose()} placeholder={type === 'task' ? 'Search your open tasks…' : 'Search leads (2+ characters)…'} className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-3 focus:outline-none" aria-label="Search records" />
        <button type="button" onClick={onClose} aria-label="Close picker" className="rounded p-0.5 text-ink-3 hover:text-ink"><X size={13} /></button>
      </div>
      <ul className="max-h-60 overflow-y-auto">
        {loading && <li className="px-3 py-3 text-xs text-ink-3">Loading…</li>}
        {!loading && items.length === 0 && <li className="px-3 py-3 text-xs text-ink-3">{type === 'lead' && q.trim().length < 2 ? 'Type to search leads.' : 'Nothing found.'}</li>}
        {items.map((p) => (
          <li key={p.ref.id}>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink hover:bg-surface-2" onClick={() => onPick(p)}>
              <Link2 size={12} className="text-ink-3" />
              <span className="truncate">{p.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
