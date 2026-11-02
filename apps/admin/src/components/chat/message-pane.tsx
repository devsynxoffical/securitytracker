'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Pencil, Trash2, Link2, MessageSquare, CheckSquare, Target, Briefcase, Contact, Mail } from 'lucide-react';
import { Avatar, Button, Skeleton, EmptyState, ErrorBanner, Textarea } from '@/components/ui';
import { Menu, Tooltip } from '@/components/ui/advanced';
import type { ChatMessage, RecordCard } from '@/lib/queries/chat';
import { renderBody, type MentionName } from './body';

const WINDOW_MS = 15 * 60_000;
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return dayFmt.format(d);
}

export function recordHref(card: RecordCard): string {
  switch (card.type) {
    case 'task': return `/admin/tasks/my?id=${card.id}`;
    case 'lead': return `/admin/crm/leads?id=${card.id}`;
    case 'deal': return `/admin/crm/deals?id=${card.id}`;
    case 'contact': return `/admin/crm/contacts?id=${card.id}`;
    case 'mail': return `/admin/mail/inbox?thread=${card.id}`;
  }
}

function recordIcon(type: RecordCard['type']) {
  const size = 14;
  return { task: <CheckSquare size={size} />, lead: <Target size={size} />, deal: <Briefcase size={size} />, contact: <Contact size={size} />, mail: <Mail size={size} /> }[type];
}

export function RecordCardView({ card }: { card: RecordCard }) {
  return (
    <Link href={recordHref(card)} className="mt-1.5 inline-flex max-w-full items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2 text-left transition hover:border-pri hover:bg-surface">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-pri-soft text-pri-2">{recordIcon(card.type)}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-ink">{card.title}</span>
        <span className="block text-2xs uppercase tracking-[0.08em] text-ink-3">
          {card.type}
          {card.status ? ` · ${card.status}` : ''}
        </span>
      </span>
    </Link>
  );
}

export interface PaneMessage extends ChatMessage {
  mine: boolean;
  mentionsMe: boolean;
}

export function MessagePane({
  messages,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onLoadMore,
  mentionNames,
  selfId,
  canModerate,
  onEdit,
  onDelete,
  typing,
  mentionsOnly,
}: {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  mentionNames: MentionName[];
  selfId: string;
  canModerate: boolean;
  onEdit: (id: string, body: string) => Promise<unknown>;
  onDelete: (id: string) => void;
  typing: string[];
  mentionsOnly: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const ordered = useMemo(() => {
    const list = [...messages].reverse();
    return mentionsOnly ? list.filter((m) => m.mentions.includes(selfId)) : list;
  }, [messages, mentionsOnly, selfId]);

  // Stick to the bottom when a new message arrives while the viewer is near the bottom.
  const lastId = ordered[ordered.length - 1]?.id;
  const stick = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [lastId, loading]);
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 overflow-hidden p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className={clsx('h-3', i % 2 ? 'w-3/4' : 'w-1/2')} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error) return <div className="flex-1"><ErrorBanner message={error} onRetry={onRetry} /></div>;

  return (
    <div ref={scroller} onScroll={onScroll} className="relative flex-1 overflow-y-auto px-5 py-3" aria-live="polite">
      {hasMore && (
        <div className="flex justify-center py-2">
          <Button size="sm" variant="ghost" loading={loadingMore} onClick={onLoadMore}>
            Load older messages
          </Button>
        </div>
      )}
      {ordered.length === 0 && (
        <EmptyState icon={<MessageSquare size={26} strokeWidth={1.75} />} title={mentionsOnly ? 'No mentions here yet' : 'Say hello to your team'} body={mentionsOnly ? 'Messages that mention you will show up here.' : 'Messages stay inside the system and are kept for the retention period.'} />
      )}
      {ordered.map((m, i) => {
        const prev = ordered[i - 1];
        const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
        const grouped = !newDay && prev && prev.authorId === m.authorId && !prev.deletedAt && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
        const mine = m.authorId === selfId;
        const mentionsMe = m.mentions.includes(selfId);
        const canEdit = mine && !m.deletedAt && now - new Date(m.createdAt).getTime() <= WINDOW_MS;
        const canDelete = !m.deletedAt && (mine || canModerate);
        const name = m.author ? `${m.author.firstName} ${m.author.lastName}`.trim() : 'Former employee';
        return (
          <div key={m.id}>
            {newDay && (
              <div className="my-3 flex items-center gap-3" role="separator">
                <span className="h-px flex-1 bg-line" />
                <span className="text-2xs uppercase tracking-[0.08em] text-ink-3">{dayLabel(m.createdAt)}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
            <div className={clsx('group/msg relative flex gap-3 rounded-lg px-2 py-1 -mx-2', grouped ? 'mt-0' : 'mt-2.5', mentionsMe && !m.deletedAt && 'bg-amber-soft/40', 'hover:bg-surface-2/70')} data-message-id={m.id}>
              <div className="w-8 shrink-0">{!grouped && <Avatar name={name} size={30} />}</div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-ink">{mine ? 'You' : name}</span>
                    <span className="text-2xs normal-case tracking-normal text-ink-3">{timeFmt.format(new Date(m.createdAt))}</span>
                  </div>
                )}
                {editing?.id === m.id ? (
                  <EditBox
                    value={editing.body}
                    onChange={(body) => setEditing({ id: m.id, body })}
                    onCancel={() => setEditing(null)}
                    onSave={async () => {
                      if (editing.body.trim()) await onEdit(m.id, editing.body.trim());
                      setEditing(null);
                    }}
                  />
                ) : m.deletedAt ? (
                  <p className="text-[13px] italic text-ink-3">Message deleted</p>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-[19px] text-ink">
                      {renderBody(m.body, mentionNames, selfId)}
                      {m.editedAt && <span className="ml-1.5 text-2xs normal-case tracking-normal text-ink-3">(edited)</span>}
                    </p>
                    {m.recordCard ? <RecordCardView card={m.recordCard} /> : m.recordRef ? <span className="mt-1 inline-flex items-center gap-1 text-xs text-ink-3"><Link2 size={12} /> Linked record not visible to you</span> : null}
                  </>
                )}
              </div>
              {(canEdit || canDelete) && !editing && (
                <div className="absolute -top-2 right-2 hidden items-center gap-0.5 rounded-md border border-line bg-surface p-0.5 shadow-pop group-hover/msg:flex">
                  {canEdit && (
                    <Tooltip label="Edit (15 min window)">
                      <button type="button" aria-label="Edit message" className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" onClick={() => setEditing({ id: m.id, body: m.body })}>
                        <Pencil size={13} />
                      </button>
                    </Tooltip>
                  )}
                  {canDelete && (
                    <Menu
                      trigger={
                        <span className="inline-flex rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-red" aria-label="Delete message">
                          <Trash2 size={13} />
                        </span>
                      }
                      items={[{ label: 'Delete message', icon: <Trash2 size={13} />, danger: true, onSelect: () => onDelete(m.id) }]}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {typing.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-ink-3" aria-live="polite">
          <span className="inline-flex gap-0.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-3" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-3 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-3 [animation-delay:300ms]" />
          </span>
          {typing.length === 1 ? `${typing[0]} is typing…` : typing.length === 2 ? `${typing[0]} and ${typing[1]} are typing…` : 'Several people are typing…'}
        </div>
      )}
    </div>
  );
}

function EditBox({ value, onChange, onCancel, onSave }: { value: string; onChange: (v: string) => void; onCancel: () => void; onSave: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="mt-1 space-y-1.5">
      <Textarea
        value={value}
        rows={2}
        autoFocus
        aria-label="Edit message"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            setSaving(true);
            void onSave().finally(() => setSaving(false));
          }
        }}
      />
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <Button size="sm" variant="primary" loading={saving} onClick={() => { setSaving(true); void onSave().finally(() => setSaving(false)); }}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span>Enter to save, Esc to cancel</span>
      </div>
    </div>
  );
}
