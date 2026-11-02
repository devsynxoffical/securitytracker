'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, MessageSquarePlus, Users, Pencil, Archive, ArchiveRestore, LogOut, AtSign, Search, ShieldCheck, Lock, Eye } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useSocketUp } from '@/lib/ws';
import { Button, Skeleton, Badge, Banner, SearchInput, Segmented, Tabs, useToast, EmptyState } from '@/components/ui';
import { Menu, Tooltip } from '@/components/ui/advanced';
import {
  useChannels,
  useMessages,
  useChatSearch,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  useMarkRead,
  useTyping,
  useCreateGroup,
  useCreateDirect,
  useUpdateChannel,
  useAddMember,
  useRemoveMember,
  useLeaveChannel,
  useTypingFeed,
  type ChatChannel,
  type ChatMessage,
  type TypingEvent,
} from '@/lib/queries/chat';
import { ChannelList, kindIcon } from '@/components/chat/channel-list';
import { MessagePane } from '@/components/chat/message-pane';
import { Composer } from '@/components/chat/composer';
import { ConfirmModal, MembersModal, NewDirectModal, NewGroupModal, RenameModal } from '@/components/chat/dialogs';
import { previewText } from '@/components/chat/body';
import { relative } from '@/lib/format';

export default function ChatPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <ChatView />
    </Suspense>
  );
}

type ListTab = 'channels' | 'direct';

function ChatView() {
  const { me, can } = useAuth();
  const toast = useToast();
  const canManage = can('chat.manage');
  const socketUp = useSocketUp();
  const [channelId, setChannelId] = useIdParam('channel');
  const [tab, setTab] = useState<ListTab>('channels');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [q, setQ] = useState('');
  const [mentionsOnly, setMentionsOnly] = useState(false);
  const [typing, setTyping] = useState<TypingEvent[]>([]);
  const [dialog, setDialog] = useState<'group' | 'direct' | 'members' | 'rename' | 'archive' | 'leave' | null>(null);

  const channels = useChannels(scope);
  const list = channels.data ?? [];
  const channel = useMemo(() => list.find((c) => c.id === channelId) ?? null, [list, channelId]);

  // first channel opens by default
  useEffect(() => {
    if (!channelId && list.length) setChannelId(list[0]!.id);
  }, [channelId, list, setChannelId]);

  const filtered = useMemo(() => {
    const byTab = list.filter((c) => (tab === 'direct' ? c.kind === 'direct' : c.kind !== 'direct'));
    return byTab;
  }, [list, tab]);
  const unreadTotal = list.reduce((s, c) => s + c.unreadCount, 0);
  const directUnread = list.filter((c) => c.kind === 'direct').reduce((s, c) => s + c.unreadCount, 0);

  const search = useChatSearch(q, undefined);
  const messages = useMessages(channel?.id ?? null);
  const flat: ChatMessage[] = useMemo(() => messages.data?.pages.flatMap((p) => p.items) ?? [], [messages.data]);

  const send = useSendMessage(channel?.id ?? '');
  const edit = useEditMessage();
  const del = useDeleteMessage();
  const markRead = useMarkRead();
  const typingMut = useTyping();
  const createGroup = useCreateGroup();
  const createDirect = useCreateDirect();
  const update = useUpdateChannel();
  const addMember = useAddMember();
  const removeMember = useRemoveMember();
  const leave = useLeaveChannel();

  const onTyping = useCallback((events: TypingEvent[]) => setTyping(events), []);
  useTypingFeed(channel?.id ?? null, me?.id, onTyping);

  // FR-CHAT-06: the read cursor advances while the channel is open and the window is focused
  const newest = flat[0];
  useEffect(() => {
    if (!channel || !channel.isMember || !newest || !me) return;
    const run = () => {
      if (!document.hasFocus()) return;
      if (channel.unreadCount === 0 && newest.authorId === me.id) return;
      markRead.mutate({ channelId: channel.id, lastReadMessageId: newest.id });
    };
    run();
    window.addEventListener('focus', run);
    return () => window.removeEventListener('focus', run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id, newest?.id, channel?.unreadCount]);

  const mentionNames = useMemo(() => (channel?.members ?? []).map((m) => ({ id: m.employeeId, name: `${m.firstName} ${m.lastName}`.trim() })), [channel]);
  const isCreator = Boolean(channel && me && channel.createdBy === me.id);
  const mayManageChannel = Boolean(channel && channel.kind === 'group' && (isCreator || canManage));

  if (!me) return <Skeleton className="h-64" />;

  const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
  const composerDisabled = !channel || !channel.isMember || Boolean(channel.archivedAt);
  const disabledReason = !channel ? undefined : channel.archivedAt ? 'This channel is archived. Messages are read-only.' : !channel.isMember ? 'Moderation view: you are reading this channel without being a member, so sending is disabled.' : undefined;

  return (
    <div className="flex h-[calc(100vh-56px-40px)] min-h-[520px] overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {/* ------------------------------------------------ left: channels */}
      <aside className="flex w-[290px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
          <h2 className="text-md font-semibold text-ink">
            Chat {unreadTotal > 0 && <span className="ml-1 rounded-full bg-pri px-1.5 font-mono text-[10.5px] font-semibold text-white">{unreadTotal}</span>}
          </h2>
          <div className="flex items-center gap-1">
            <Tooltip label="New direct message" side="bottom">
              <Button size="sm" variant="ghost" icon={<MessageSquarePlus size={14} />} aria-label="New direct message" onClick={() => setDialog('direct')} />
            </Tooltip>
            <Tooltip label="New group" side="bottom">
              <Button size="sm" variant="primary" icon={<Plus size={14} />} aria-label="New group" onClick={() => setDialog('group')}>
                Group
              </Button>
            </Tooltip>
          </div>
        </div>
        <div className="px-3 pb-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search messages…" />
        </div>
        {canManage && (
          <div className="px-3 pb-2">
            <Segmented value={scope} onChange={(v) => setScope(v)} options={[{ value: 'mine', label: 'My channels' }, { value: 'all', label: <span className="inline-flex items-center gap-1"><ShieldCheck size={12} /> All channels</span> }]} />
          </div>
        )}
        {!q && <Tabs value={tab} onChange={setTab} tabs={[{ value: 'channels', label: 'Channels', count: unreadTotal - directUnread || undefined }, { value: 'direct', label: 'Direct', count: directUnread || undefined }]} className="px-3" />}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {q ? (
            <SearchResults loading={search.isLoading} error={search.isError ? errorText(search.error) : null} onRetry={() => void search.refetch()} items={search.data?.items ?? []} channels={list} onOpen={(id) => { setChannelId(id); setQ(''); }} />
          ) : (
            <ChannelList
              channels={filtered}
              loading={channels.isLoading}
              error={channels.isError ? errorText(channels.error) : null}
              onRetry={() => void channels.refetch()}
              selectedId={channel?.id ?? null}
              selfId={me.id}
              onOpen={(id) => { setChannelId(id); setMentionsOnly(false); }}
              emptyTitle={tab === 'direct' ? 'No direct messages yet' : 'No channels yet'}
              emptyBody={tab === 'direct' ? 'Start a conversation with a colleague.' : 'Your company, department and team channels appear here automatically.'}
            />
          )}
        </div>
        <div className="flex items-center gap-1.5 border-t border-line px-3 py-1.5 text-2xs normal-case tracking-normal text-ink-3">
          <span className={clsx('h-1.5 w-1.5 rounded-full', socketUp ? 'bg-green' : 'bg-amber')} />
          {socketUp ? 'Live' : 'Reconnecting… polling every 10 s'}
        </div>
      </aside>

      {/* ------------------------------------------------ right: messages */}
      <section className="flex min-w-0 flex-1 flex-col bg-bg/40" aria-label="Messages">
        {!channel ? (
          channels.isLoading ? (
            <div className="flex-1 p-6"><Skeleton className="h-6 w-48" /><Skeleton className="mt-4 h-4 w-80" /></div>
          ) : (
            <EmptyState icon={<Users size={28} strokeWidth={1.75} />} title="Pick a channel" body="Choose a channel on the left or start a direct message." action={<Button variant="primary" icon={<MessageSquarePlus size={14} />} onClick={() => setDialog('direct')}>New direct message</Button>} />
          )
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 text-ink-2">{channel.archivedAt ? <Lock size={15} /> : channel.kind === 'direct' ? <AtSign size={15} /> : kindIcon(channel.kind, 16)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-md font-semibold text-ink">{channel.name || 'Direct message'}</h3>
                  <Badge tone={channel.kind === 'direct' ? 'violet' : channel.kind === 'group' ? 'blue' : 'gray'}>{channel.kind}</Badge>
                  {channel.archivedAt && <Badge tone="amber" dot>archived</Badge>}
                  {!channel.isMember && <Badge tone="amber"><Eye size={10} className="mr-1 inline" />moderation, read-only</Badge>}
                </div>
                <button type="button" className="text-xs text-ink-3 hover:text-ink" onClick={() => setDialog('members')}>
                  {channel.members.length} member{channel.members.length === 1 ? '' : 's'}
                  {channel.lastMessageAt ? ` · last message ${relative(channel.lastMessageAt)}` : ''}
                </button>
              </div>
              <Button size="sm" variant={mentionsOnly ? 'primary' : 'default'} icon={<AtSign size={13} />} onClick={() => setMentionsOnly((v) => !v)} aria-pressed={mentionsOnly}>
                Mentions
              </Button>
              <Menu
                trigger={<Button size="sm" variant="default" aria-label="Channel actions">⋯</Button>}
                items={[
                  { label: 'Members', icon: <Users size={13} />, onSelect: () => setDialog('members') },
                  ...(mayManageChannel ? [{ label: 'Rename', icon: <Pencil size={13} />, onSelect: () => setDialog('rename') }, { label: channel.archivedAt ? 'Unarchive' : 'Archive', icon: channel.archivedAt ? <ArchiveRestore size={13} /> : <Archive size={13} />, onSelect: () => setDialog('archive') }] : []),
                  ...(channel.kind === 'group' && channel.isMember ? [{ separator: true, label: '' }, { label: 'Leave channel', icon: <LogOut size={13} />, danger: true, onSelect: () => setDialog('leave') }] : []),
                ]}
              />
            </header>
            {!channel.isMember && <div className="px-5 pt-3"><Banner tone="amber">You are viewing this channel with chat.manage. The read is recorded in the audit log.</Banner></div>}
            <MessagePane
              messages={flat}
              loading={messages.isLoading}
              error={messages.isError ? errorText(messages.error) : null}
              onRetry={() => void messages.refetch()}
              hasMore={Boolean(messages.hasNextPage)}
              loadingMore={messages.isFetchingNextPage}
              onLoadMore={() => void messages.fetchNextPage()}
              mentionNames={mentionNames}
              selfId={me.id}
              canModerate={canManage}
              onEdit={(id, body) => edit.mutateAsync({ id, body }).catch((e: unknown) => { toast.push('error', `Edit failed: ${errorText(e)}`); throw e; })}
              onDelete={(id) => del.mutate({ id, channelId: channel.id }, { onError: (e) => toast.push('error', `Delete failed: ${errorText(e)}`) })}
              typing={typing.map((t) => t.name)}
              mentionsOnly={mentionsOnly}
            />
            <Composer
              channelKey={channel.id}
              members={channel.members}
              selfId={me.id}
              disabled={composerDisabled}
              disabledReason={disabledReason}
              onSend={(input) => send.mutateAsync(input)}
              onTyping={() => typingMut.mutate(channel.id)}
            />
          </>
        )}
      </section>

      {/* ------------------------------------------------ dialogs */}
      <NewGroupModal open={dialog === 'group'} onClose={() => setDialog(null)} selfId={me.id} busy={createGroup.isPending} onCreate={(input) => createGroup.mutateAsync(input).then((c) => { setChannelId(c.id); setTab('channels'); })} />
      <NewDirectModal open={dialog === 'direct'} onClose={() => setDialog(null)} selfId={me.id} busy={createDirect.isPending} onPick={(id) => createDirect.mutateAsync(id).then((c) => { setChannelId(c.id); setTab('direct'); })} />
      {channel && (
        <>
          <MembersModal open={dialog === 'members'} onClose={() => setDialog(null)} channel={channel} canManage={mayManageChannel} busy={addMember.isPending || removeMember.isPending} onAdd={(employeeId) => addMember.mutateAsync({ id: channel.id, employeeId })} onRemove={(employeeId) => removeMember.mutateAsync({ id: channel.id, employeeId })} />
          {dialog === 'rename' && <RenameModal open current={channel.name} onClose={() => setDialog(null)} busy={update.isPending} onSave={(name) => update.mutateAsync({ id: channel.id, name })} />}
          <ConfirmModal
            open={dialog === 'archive'}
            onClose={() => setDialog(null)}
            title={channel.archivedAt ? 'Unarchive channel' : 'Archive channel'}
            body={channel.archivedAt ? 'Members can send messages again.' : 'The channel stays readable but nobody can send messages until it is unarchived.'}
            confirmLabel={channel.archivedAt ? 'Unarchive' : 'Archive'}
            busy={update.isPending}
            onConfirm={() => update.mutateAsync({ id: channel.id, archived: !channel.archivedAt })}
          />
          <ConfirmModal
            open={dialog === 'leave'}
            onClose={() => setDialog(null)}
            title="Leave channel"
            body={`You will stop receiving messages from "${channel.name}". The creator or an admin can add you again.`}
            confirmLabel="Leave"
            danger
            busy={leave.isPending}
            onConfirm={() => leave.mutateAsync(channel.id).then(() => setChannelId(null))}
          />
        </>
      )}
    </div>
  );
}

function SearchResults({ loading, error, onRetry, items, channels, onOpen }: { loading: boolean; error: string | null; onRetry: () => void; items: ChatMessage[]; channels: ChatChannel[]; onOpen: (channelId: string) => void }) {
  if (loading) return <div className="space-y-2 p-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" /></div>;
  if (error) return <div className="p-3"><Button size="sm" variant="danger-outline" onClick={onRetry}>Retry search</Button><p className="mt-2 text-xs text-red">{error}</p></div>;
  if (items.length === 0) return <EmptyState icon={<Search size={24} strokeWidth={1.75} />} title="No messages found" body="Search covers the channels you belong to." />;
  return (
    <ul>
      {items.map((m) => {
        const c = channels.find((x) => x.id === m.channelId);
        return (
          <li key={m.id}>
            <button type="button" className="w-full border-b border-line-2 px-3 py-2 text-left hover:bg-surface-2" onClick={() => onOpen(m.channelId)}>
              <div className="flex items-center justify-between gap-2 text-2xs normal-case tracking-normal text-ink-3">
                <span className="truncate">{c?.name ?? 'Channel'} · {m.author ? `${m.author.firstName} ${m.author.lastName}` : 'Former employee'}</span>
                <span className="shrink-0">{relative(m.createdAt)}</span>
              </div>
              <div className="mt-0.5 line-clamp-2 text-[13px] text-ink">{previewText(m.body, 140)}</div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
