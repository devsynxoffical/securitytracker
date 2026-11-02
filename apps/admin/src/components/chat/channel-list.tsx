'use client';

import { Hash, Building2, Users, Lock, MessageSquare, Eye } from 'lucide-react';
import { clsx } from 'clsx';
import { Avatar, Skeleton, EmptyState, ErrorBanner } from '@/components/ui';
import { relative } from '@/lib/format';
import type { ChatChannel } from '@/lib/queries/chat';
import { previewText } from './body';

export function kindIcon(kind: ChatChannel['kind'], size = 15) {
  if (kind === 'company') return <Building2 size={size} />;
  if (kind === 'department') return <Hash size={size} />;
  if (kind === 'team') return <Users size={size} />;
  if (kind === 'group') return <MessageSquare size={size} />;
  return null;
}

export function ChannelRow({ c, selected, selfId, onOpen }: { c: ChatChannel; selected: boolean; selfId: string; onOpen: () => void }) {
  const last = c.lastMessage;
  const lastAuthor = last ? (last.authorId === selfId ? 'You' : c.members.find((m) => m.employeeId === last.authorId)?.firstName ?? '') : '';
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'true' : undefined}
      className={clsx('flex w-full items-center gap-2.5 border-b border-line-2 px-3 py-2.5 text-left transition-colors', selected ? 'bg-pri-soft/60' : 'hover:bg-surface-2')}
    >
      {c.kind === 'direct' ? (
        <Avatar name={c.name || '?'} size={30} />
      ) : (
        <span className={clsx('inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg', selected ? 'bg-pri text-white' : 'bg-surface-3 text-ink-2')}>{c.archivedAt ? <Lock size={14} /> : kindIcon(c.kind)}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={clsx('flex-1 truncate text-[13px]', c.unreadCount > 0 ? 'font-semibold text-ink' : 'font-medium text-ink')}>{c.name || 'Direct message'}</span>
          {!c.isMember && (
            <span className="inline-flex items-center gap-0.5 rounded bg-gray-soft px-1 text-2xs normal-case tracking-normal text-ink-2" title="Moderation view, read-only">
              <Eye size={10} /> read-only
            </span>
          )}
          {last && <span className="shrink-0 text-2xs normal-case tracking-normal text-ink-3">{relative(last.createdAt)}</span>}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex-1 truncate text-xs text-ink-3">{last ? `${lastAuthor ? `${lastAuthor}: ` : ''}${previewText(last.body)}` : c.archivedAt ? 'Archived' : 'No messages yet'}</span>
          {c.unreadCount > 0 && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pri px-1.5 font-mono text-[10.5px] font-semibold text-white">{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>}
        </span>
      </span>
    </button>
  );
}

export function ChannelList({ channels, loading, error, onRetry, selectedId, selfId, onOpen, emptyTitle, emptyBody }: { channels: ChatChannel[]; loading: boolean; error: string | null; onRetry: () => void; selectedId: string | null; selfId: string; onOpen: (id: string) => void; emptyTitle: string; emptyBody?: string }) {
  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="h-[30px] w-[30px] rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error) return <ErrorBanner message={error} onRetry={onRetry} />;
  if (channels.length === 0) return <EmptyState icon={<MessageSquare size={26} strokeWidth={1.75} />} title={emptyTitle} body={emptyBody} />;
  return (
    <div role="list" aria-label="Channels">
      {channels.map((c) => (
        <ChannelRow key={c.id} c={c} selected={c.id === selectedId} selfId={selfId} onOpen={() => onOpen(c.id)} />
      ))}
    </div>
  );
}
