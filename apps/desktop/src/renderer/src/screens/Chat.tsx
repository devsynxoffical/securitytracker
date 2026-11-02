import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Hash, Users, MessageSquare, PenSquare, Search, WifiOff, Pencil, Trash2, Check, X, CheckSquare, Target, Briefcase, Contact, Mail as MailIcon, Radio, ArrowUp } from 'lucide-react';
import { bridge, http, errorMessage, errorStatus, isOfflineError } from '../lib/bridge';
import { useQuery } from '../lib/useQuery';
import { useRealtime, useRealtimeConnected, type RealtimeEvent } from '../lib/realtime';
import { fullName, time } from '../lib/format';
import type { ChatChannel, ChatMember, ChatMessage, ChatMessageDeletedPayload, ChatReadPayload, ChatRecordCard, ChatTypingPayload, DirectoryEmployee, Me, Page } from '../lib/types';
import { Avatar, Badge, Button, Empty, ErrorBanner, IconButton, Input, Modal, Skeleton, SkeletonRows } from '../components/ui';

const EDIT_WINDOW_MS = 15 * 60_000; // FR-CHAT-04
const TYPING_THROTTLE_MS = 3_000; // docs/22 section 5: 1 per 3 s
const TYPING_VISIBLE_MS = 5_000;
const MESSAGE_POLL_MS = 10_000; // fallback when the main-process socket is down
const CHANNELS_POLL_MS = 30_000;
const MESSAGE_MAX = 4000;

type ChannelsState = { kind: 'ready'; channels: ChatChannel[] } | { kind: 'unavailable' };

/**
 * Internal chat (docs/22 section 6, desktop). Channels and direct messages on the left, the message
 * pane with composer on the right. Realtime events come from the main-process socket through the
 * bridge; without a socket the open channel is polled. Offline shows the cached messages read-only
 * (FR-CHAT-14). A server without the chat module (404) shows one calm "not available" state.
 */
export function ChatScreen({ online, me, onUnreadChanged }: { online: boolean; me: Me; onUnreadChanged: () => void }) {
  const live = useRealtimeConnected();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [picker, setPicker] = useState(false);

  const channelsQuery = useQuery<ChannelsState>(
    () =>
      http
        .get<ChatChannel[] | Page<ChatChannel>>('/chat/channels')
        .then((d) => ({ kind: 'ready', channels: Array.isArray(d) ? d : d.items }) as ChannelsState)
        .catch((e) => (errorStatus(e) === 404 ? ({ kind: 'unavailable' } as ChannelsState) : Promise.reject(e))),
    [],
    { intervalMs: CHANNELS_POLL_MS },
  );
  const channels = channelsQuery.data?.kind === 'ready' ? channelsQuery.data.channels : [];
  const unavailable = channelsQuery.data?.kind === 'unavailable';

  useRealtime((e) => {
    if (e.event === 'chat.channel.changed' || e.event === 'chat.message.created') void channelsQuery.refetch();
  });

  useEffect(() => {
    if (!selected && channels.length) setSelected(channels[0]!.id);
    if (selected && channels.length && !channels.some((c) => c.id === selected)) setSelected(channels[0]!.id);
  }, [channels, selected]);

  const channel = channels.find((c) => c.id === selected) ?? null;
  const q = filter.trim().toLowerCase();
  const visible = q ? channels.filter((c) => channelName(c).toLowerCase().includes(q)) : channels;
  const groups = visible.filter((c) => c.kind !== 'direct');
  const directs = visible.filter((c) => c.kind === 'direct');

  const openDirect = async (employeeId: string) => {
    const c = await http.post<ChatChannel>('/chat/channels/direct', { employeeId });
    setPicker(false);
    await channelsQuery.refetch();
    setSelected(c.id);
  };

  if (unavailable) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Empty icon={<MessageSquare size={22} strokeWidth={1.75} />} title="Chat is not available on this server yet" body="Your company's server does not have the chat module enabled. Everything else keeps working; this screen switches on by itself once the server is updated." action={<Button size="sm" onClick={() => void channelsQuery.refetch()}>Check again</Button>} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0" data-testid="chat-screen">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-3">
          <div className="leading-tight">
            <h1 className="text-md font-semibold text-ink">Chat</h1>
            <div className="flex items-center gap-1.5 text-2xs text-ink-3">
              <span className={clsx('inline-block h-1.5 w-1.5 rounded-full', !online ? 'bg-amber' : live ? 'bg-green' : 'bg-gray-bar')} />
              {!online ? 'Offline' : live ? 'Live' : 'Polling'}
            </div>
          </div>
          <IconButton label="New message" onClick={() => setPicker(true)} disabled={!online}>
            <PenSquare size={15} />
          </IconButton>
        </div>
        <div className="px-3 pt-2.5">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a channel or person" className="h-8 pl-8 text-sm" aria-label="Filter channels" />
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-label="Channels">
          {channelsQuery.loading && !channelsQuery.data ? (
            <div className="p-2"><SkeletonRows rows={6} /></div>
          ) : channelsQuery.error && channels.length === 0 ? (
            <div className="p-2"><ErrorBanner message={errorMessage(channelsQuery.error)} onRetry={channelsQuery.refetch} /></div>
          ) : channels.length === 0 ? (
            <Empty compact icon={<Users size={18} />} title="No channels yet" body="Your company and team channels appear here as soon as you are added to one." />
          ) : (
            <>
              <ChannelGroup title="Channels" items={groups} selected={selected} onSelect={setSelected} />
              <ChannelGroup title="Direct messages" items={directs} selected={selected} onSelect={setSelected} empty="Use New message to start one" />
            </>
          )}
        </nav>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col bg-bg">
        {channel ? (
          <MessagePane key={channel.id} channel={channel} me={me} online={online} live={live} onUnreadChanged={onUnreadChanged} />
        ) : channelsQuery.loading && !channelsQuery.data ? (
          <div className="flex-1 p-6"><SkeletonRows rows={8} /></div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <Empty icon={<MessageSquare size={22} strokeWidth={1.75} />} title="Say hello to your team" body="Pick a channel on the left or start a direct message." action={<Button size="sm" variant="primary" icon={<PenSquare size={13} />} onClick={() => setPicker(true)} disabled={!online}>New message</Button>} />
          </div>
        )}
      </section>
      {picker && <DirectPicker meId={me.id} onClose={() => setPicker(false)} onPick={openDirect} />}
    </div>
  );
}

function channelName(c: ChatChannel): string {
  if (c.kind === 'direct') return c.counterpart ? fullName(c.counterpart) : c.name || 'Direct message';
  return c.name;
}

function ChannelGroup({ title, items, selected, onSelect, empty }: { title: string; items: ChatChannel[]; selected: string | null; onSelect: (id: string) => void; empty?: string }) {
  if (items.length === 0 && !empty) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 px-2 text-2xs font-semibold uppercase text-ink-3">{title}</div>
      {items.length === 0 ? (
        <div className="px-2 py-1 text-xs text-ink-3">{empty}</div>
      ) : (
        <ul className="space-y-0.5">
          {items.map((c) => {
            const active = c.id === selected;
            const name = channelName(c);
            return (
              <li key={c.id}>
                <button type="button" onClick={() => onSelect(c.id)} aria-current={active ? 'true' : undefined} className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors', active ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
                  {c.kind === 'direct' ? <Avatar name={name} size={24} /> : <span className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', active ? 'bg-pri/20 text-pri-2' : 'bg-surface-2 text-ink-3')}>{c.kind === 'group' ? <Users size={13} /> : <Hash size={13} />}</span>}
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className={clsx('block truncate text-sm', c.unreadCount ? 'font-semibold text-ink' : 'font-medium')}>{name}</span>
                    {c.lastMessage && <span className="block truncate text-2xs normal-case tracking-normal text-ink-3">{c.lastMessage.body || 'Message deleted'}</span>}
                  </span>
                  {c.unreadCount > 0 && <span className="rounded-full bg-pri px-1.5 font-mono text-2xs tracking-normal text-on-pri">{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message pane
// ---------------------------------------------------------------------------

interface MessagesState {
  items: ChatMessage[]; // ascending by createdAt
  nextCursor: string | null;
  loading: boolean;
  error: unknown;
  fromCache: boolean;
}

function byCreated(a: ChatMessage, b: ChatMessage): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

function upsert(items: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const i = items.findIndex((m) => m.id === msg.id);
  if (i === -1) return [...items, msg].sort(byCreated);
  const next = items.slice();
  next[i] = { ...next[i]!, ...msg, pending: false, failed: false };
  return next;
}

function MessagePane({ channel, me, online, live, onUnreadChanged }: { channel: ChatChannel; me: Me; online: boolean; live: boolean; onUnreadChanged: () => void }) {
  const channelId = channel.id;
  const [state, setState] = useState<MessagesState>({ items: [], nextCursor: null, loading: true, error: null, fromCache: false });
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({});
  const [members, setMembers] = useState<ChatMember[]>(channel.members ?? []);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastReadSent = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await http.get<Page<ChatMessage> | ChatMessage[]>(`/chat/channels/${channelId}/messages?limit=50`);
      const list = Array.isArray(page) ? page : page.items;
      const nextCursor = Array.isArray(page) ? null : page.nextCursor;
      setState((s) => {
        const pending = s.items.filter((m) => m.pending || m.failed);
        return { items: [...list, ...pending.filter((p) => !list.some((m) => m.id === p.id))].sort(byCreated), nextCursor, loading: false, error: null, fromCache: false };
      });
    } catch (e) {
      const cached = ((await bridge.chat.cacheGet(channelId).catch(() => [])) as ChatMessage[]) ?? [];
      setState((s) => {
        if (s.items.length) return { ...s, loading: false, error: isOfflineError(e) ? null : e };
        if (cached.length) return { items: cached.slice().sort(byCreated), nextCursor: null, loading: false, error: isOfflineError(e) ? null : e, fromCache: true };
        return { ...s, loading: false, error: e };
      });
    }
  }, [channelId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Members for @autocomplete: from the list payload, else one fetch of the channel.
  useEffect(() => {
    if (channel.members?.length) {
      setMembers(channel.members);
      return;
    }
    void http
      .get<ChatChannel>(`/chat/channels/${channelId}`)
      .then((c) => setMembers(c.members ?? []))
      .catch(() => undefined);
  }, [channelId, channel.members]);

  // Polling fallback when the main-process socket is not connected.
  useEffect(() => {
    if (live || !online) return;
    const t = setInterval(() => void load(), MESSAGE_POLL_MS);
    return () => clearInterval(t);
  }, [live, online, load]);

  // Realtime events for this channel.
  useRealtime((e: RealtimeEvent) => {
    const p = e.payload as { channelId?: string } | undefined;
    if (!p || p.channelId !== channelId) return;
    if (e.event === 'chat.message.created' || e.event === 'chat.message.updated') {
      const msg = e.payload as ChatMessage;
      setState((s) => ({ ...s, items: upsert(s.items, msg) }));
      if (e.event === 'chat.message.created') setTyping((t) => omit(t, (e.payload as ChatMessage).authorId));
    } else if (e.event === 'chat.message.deleted') {
      const d = e.payload as ChatMessageDeletedPayload;
      setState((s) => ({ ...s, items: s.items.map((m) => (m.id === d.id ? { ...m, body: '', deletedAt: d.deletedAt } : m)) }));
    } else if (e.event === 'chat.typing') {
      const t = e.payload as ChatTypingPayload;
      if (t.employeeId !== me.id) setTyping((cur) => ({ ...cur, [t.employeeId]: { name: t.name, at: Date.now() } }));
    } else if (e.event === 'chat.read') {
      const r = e.payload as ChatReadPayload;
      if (r.employeeId === me.id) onUnreadChanged();
    }
  });

  // Expire typing indicators.
  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const t = setInterval(() => setTyping((cur) => Object.fromEntries(Object.entries(cur).filter(([, v]) => Date.now() - v.at < TYPING_VISIBLE_MS))), 1_000);
    return () => clearInterval(t);
  }, [typing]);

  // Offline cache (FR-CHAT-14): newest 200 confirmed messages.
  useEffect(() => {
    if (state.fromCache || state.loading) return;
    const confirmed = state.items.filter((m) => !m.pending && !m.failed);
    if (confirmed.length) void bridge.chat.cachePut(channelId, confirmed.slice(-200).reverse()).catch(() => undefined);
  }, [state.items, state.fromCache, state.loading, channelId]);

  // Read cursor (FR-CHAT-06): newest confirmed message while the pane is open and the window focused.
  useEffect(() => {
    if (!online || state.fromCache) return;
    const newest = [...state.items].reverse().find((m) => !m.pending && !m.failed);
    if (!newest || newest.id === lastReadSent.current) return;
    const send = () => {
      if (!document.hasFocus() || newest.id === lastReadSent.current) return;
      lastReadSent.current = newest.id;
      void http.post(`/chat/channels/${channelId}/read`, { lastReadMessageId: newest.id }).then(onUnreadChanged).catch(() => undefined);
    };
    send();
    window.addEventListener('focus', send);
    return () => window.removeEventListener('focus', send);
  }, [state.items, state.fromCache, online, channelId, onUnreadChanged]);

  // Keep the newest message in view unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [state.items.length, typing]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const loadOlder = async () => {
    const oldest = state.items.find((m) => !m.pending);
    if (!oldest || !state.nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const page = await http.get<Page<ChatMessage>>(`/chat/channels/${channelId}/messages?limit=50&cursor=${encodeURIComponent(state.nextCursor)}`);
      setState((s) => ({ ...s, items: [...page.items.filter((m) => !s.items.some((x) => x.id === m.id)), ...s.items].sort(byCreated), nextCursor: page.nextCursor }));
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    } catch {
      // keep what we have; the user can scroll again
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async (body: string, mentions: string[], existing?: ChatMessage) => {
    const key = existing?.id ?? uuid();
    const optimistic: ChatMessage = existing
      ? { ...existing, pending: true, failed: false }
      : { id: key, channelId, authorId: me.id, author: { id: me.id, firstName: me.firstName, lastName: me.lastName }, body, mentions, recordRef: null, recordCard: null, editedAt: null, deletedAt: null, createdAt: new Date().toISOString(), pending: true };
    stickToBottom.current = true;
    setState((s) => ({ ...s, items: upsert(s.items, optimistic).map((m) => (m.id === key ? { ...m, pending: true, failed: false } : m)) }));
    try {
      // Idempotency-Key = the optimistic id, reused when the same message is retried (AGENTS.md rule 11).
      const saved = await http.post<ChatMessage>(`/chat/channels/${channelId}/messages`, { body, mentions: mentions.length ? mentions : undefined }, { 'Idempotency-Key': key });
      setState((s) => ({ ...s, items: upsert(s.items.filter((m) => m.id !== key || m.id === saved.id), saved) }));
    } catch {
      setState((s) => ({ ...s, items: s.items.map((m) => (m.id === key ? { ...m, pending: false, failed: true } : m)) }));
    }
  };

  const edit = async (msg: ChatMessage, body: string) => {
    const mentions = resolveMentions(body, members);
    setState((s) => ({ ...s, items: s.items.map((m) => (m.id === msg.id ? { ...m, body, pending: true } : m)) }));
    try {
      const saved = await http.patch<ChatMessage>(`/chat/messages/${msg.id}`, { body, mentions: mentions.length ? mentions : undefined });
      setState((s) => ({ ...s, items: upsert(s.items, saved) }));
    } catch (e) {
      setState((s) => ({ ...s, items: s.items.map((m) => (m.id === msg.id ? { ...msg } : m)) }));
      throw e;
    }
  };

  const remove = async (msg: ChatMessage) => {
    if (msg.failed) {
      setState((s) => ({ ...s, items: s.items.filter((m) => m.id !== msg.id) }));
      return;
    }
    try {
      await http.del(`/chat/messages/${msg.id}`);
      setState((s) => ({ ...s, items: s.items.map((m) => (m.id === msg.id ? { ...m, body: '', deletedAt: new Date().toISOString() } : m)) }));
    } catch {
      // the realtime/poll refresh shows the truth
    }
  };

  const typingNames = Object.values(typing).map((t) => t.name);
  const title = channelName(channel);
  const memberCount = members.length || channel.members?.length || 0;

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {channel.kind === 'direct' ? <Avatar name={title} size={30} /> : <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-pri-soft text-pri-2">{channel.kind === 'group' ? <Users size={15} /> : <Hash size={15} />}</span>}
          <div className="min-w-0 leading-tight">
            <h2 className="truncate text-md font-semibold text-ink" data-testid="chat-channel-title">{title}</h2>
            <div className="truncate text-xs text-ink-3">{channel.kind === 'direct' ? 'Direct message' : `${kindLabel(channel.kind)}${memberCount ? ` · ${memberCount} member${memberCount === 1 ? '' : 's'}` : ''}`}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {channel.archivedAt && <Badge tone="gray">Archived</Badge>}
          {state.fromCache && <Badge tone="amber" dot>Cached</Badge>}
          {!online && <Badge tone="amber"><WifiOff size={11} /> Offline</Badge>}
        </div>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-testid="chat-messages">
        {state.loading ? (
          <div className="space-y-4" aria-busy>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className={clsx('h-3', i % 2 ? 'w-2/3' : 'w-1/2')} />
                </div>
              </div>
            ))}
          </div>
        ) : state.error && state.items.length === 0 ? (
          <ErrorBanner message={errorMessage(state.error)} onRetry={() => void load()} />
        ) : state.items.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Empty icon={<MessageSquare size={22} strokeWidth={1.75} />} title="Say hello to your team" body={channel.kind === 'direct' ? `This is the start of your conversation with ${title}.` : `This is the start of #${title}. Messages here are visible to every member.`} />
          </div>
        ) : (
          <>
            {state.nextCursor && !state.fromCache && (
              <div className="mb-3 flex justify-center">
                <Button size="sm" variant="ghost" onClick={() => void loadOlder()} loading={loadingOlder} icon={<ArrowUp size={12} />}>Load earlier messages</Button>
              </div>
            )}
            {state.error && <ErrorBanner className="mb-3" message={errorMessage(state.error)} onRetry={() => void load()} />}
            <MessageList items={state.items} meId={me.id} members={members} canAct={online && !state.fromCache} onEdit={edit} onDelete={remove} onRetry={(m) => void send(m.body, m.mentions, m)} />
          </>
        )}
      </div>

      <div className="h-5 px-5 text-xs text-ink-3" aria-live="polite">
        {typingNames.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Radio size={11} className="text-pri" />
            {typingNames.length === 1 ? `${typingNames[0]} is typing…` : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing…` : 'Several people are typing…'}
          </span>
        )}
      </div>

      <Composer channelId={channelId} members={members} disabled={!online || Boolean(channel.archivedAt)} disabledReason={!online ? 'Offline: you can read cached messages, sending resumes when the connection returns.' : channel.archivedAt ? 'This channel is archived.' : undefined} onSend={(body, mentions) => void send(body, mentions)} />
    </>
  );
}

function kindLabel(kind: ChatChannel['kind']): string {
  return kind === 'company' ? 'Company channel' : kind === 'department' ? 'Department channel' : kind === 'team' ? 'Team channel' : 'Group';
}

function omit<T>(obj: Record<string, T>, key: string): Record<string, T> {
  if (!(key in obj)) return obj;
  const { [key]: _drop, ...rest } = obj;
  void _drop;
  return rest;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------------------
// Message list
// ---------------------------------------------------------------------------

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: '2-digit', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function MessageList({ items, meId, members, canAct, onEdit, onDelete, onRetry }: { items: ChatMessage[]; meId: string; members: ChatMember[]; canAct: boolean; onEdit: (m: ChatMessage, body: string) => Promise<void>; onDelete: (m: ChatMessage) => void; onRetry: (m: ChatMessage) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const names = useMemo(() => members.map((m) => `${m.firstName} ${m.lastName}`.trim()).filter(Boolean), [members]);
  const rows: ReactNode[] = [];
  let lastDay = '';
  let prev: ChatMessage | null = null;
  for (const m of items) {
    const day = new Date(m.createdAt).toDateString();
    if (day !== lastDay) {
      rows.push(
        <div key={`day-${day}`} className="my-4 flex items-center gap-3 first:mt-0">
          <span className="h-px flex-1 bg-line-2" />
          <span className="text-2xs font-semibold uppercase text-ink-3">{dayLabel(m.createdAt)}</span>
          <span className="h-px flex-1 bg-line-2" />
        </div>,
      );
      lastDay = day;
      prev = null;
    }
    const grouped = Boolean(prev && prev.authorId === m.authorId && !prev.deletedAt && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000);
    rows.push(<MessageRow key={m.id} msg={m} grouped={grouped} mine={m.authorId === meId} names={names} canAct={canAct} editing={editing === m.id} onStartEdit={() => setEditing(m.id)} onCancelEdit={() => setEditing(null)} onEdit={async (body) => { await onEdit(m, body); setEditing(null); }} onDelete={() => onDelete(m)} onRetry={() => onRetry(m)} />);
    prev = m;
  }
  return <ol>{rows}</ol>;
}

function MessageRow({ msg, grouped, mine, names, canAct, editing, onStartEdit, onCancelEdit, onEdit, onDelete, onRetry }: { msg: ChatMessage; grouped: boolean; mine: boolean; names: string[]; canAct: boolean; editing: boolean; onStartEdit: () => void; onCancelEdit: () => void; onEdit: (body: string) => Promise<void>; onDelete: () => void; onRetry: () => void }) {
  const author = msg.author ? fullName(msg.author) : 'Unknown';
  const canEdit = mine && !msg.deletedAt && !msg.pending && !msg.failed && Date.now() - new Date(msg.createdAt).getTime() < EDIT_WINDOW_MS;
  const canDelete = mine && !msg.deletedAt && !msg.pending;
  return (
    <li className={clsx('hover-reveal group relative flex gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-surface', grouped ? 'mt-0' : 'mt-2.5', msg.failed && 'bg-red-soft/40')} data-testid="chat-message">
      <div className="w-8 shrink-0 pt-0.5">{grouped ? <span className="block whitespace-nowrap pt-1 text-right font-mono text-[10px] leading-4 text-ink-3 opacity-0 group-hover:opacity-100">{time(msg.createdAt).replace(/\s?[AP]M$/i, '')}</span> : <Avatar name={author} size={30} />}</div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2 leading-tight">
            <span className="truncate text-sm font-semibold text-ink">{mine ? 'You' : author}</span>
            <span className="shrink-0 font-mono text-[10px] text-ink-3">{time(msg.createdAt)}</span>
          </div>
        )}
        {editing ? (
          <InlineEdit initial={msg.body} onCancel={onCancelEdit} onSave={onEdit} />
        ) : msg.deletedAt ? (
          <div className="text-sm italic text-ink-3">Message deleted</div>
        ) : (
          <div className={clsx('select-text whitespace-pre-wrap break-words text-base leading-relaxed text-ink', msg.pending && 'opacity-60')}>
            {renderBody(msg.body, names)}
            {msg.editedAt && <span className="ml-1.5 text-2xs normal-case tracking-normal text-ink-3">(edited)</span>}
          </div>
        )}
        {msg.recordCard && !msg.deletedAt && <RecordCard card={msg.recordCard} />}
        {msg.failed && (
          <div className="mt-1 flex items-center gap-2 text-xs text-red-text">
            Not sent.
            <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={onRetry}>Retry</button>
            <button type="button" className="text-ink-3 hover:text-ink" onClick={onDelete}>Discard</button>
          </div>
        )}
      </div>
      {canAct && !editing && (canEdit || canDelete) && (
        <div className="row-actions absolute -top-2.5 right-3 flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5 shadow-card">
          {canEdit && (
            <IconButton label="Edit message" className="h-6 w-6" onClick={onStartEdit}>
              <Pencil size={12} />
            </IconButton>
          )}
          {canDelete && (
            <IconButton label="Delete message" className="h-6 w-6 hover:text-red-text" onClick={onDelete}>
              <Trash2 size={12} />
            </IconButton>
          )}
        </div>
      )}
    </li>
  );
}

function InlineEdit({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (body: string) => Promise<void> }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const body = value.trim();
    if (!body || body === initial) return onCancel();
    setBusy(true);
    setError(null);
    try {
      await onSave(body);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-1">
      <textarea
        autoFocus
        value={value}
        maxLength={MESSAGE_MAX}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
        }}
        rows={Math.min(8, Math.max(1, value.split('\n').length))}
        className="w-full resize-none rounded-lg border border-pri bg-surface px-3 py-2 text-base leading-relaxed text-ink focus:outline-none focus:ring-[3px] focus:ring-pri-soft"
      />
      <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">
        <Button size="sm" variant="primary" onClick={() => void save()} loading={busy} icon={<Check size={12} />}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} icon={<X size={12} />}>Cancel</Button>
        <span>Enter saves, Esc cancels. Within 15 minutes only.</span>
        {error && <span className="text-red-text">{error}</span>}
      </div>
    </div>
  );
}

const RECORD_ICON: Record<ChatRecordCard['type'], typeof CheckSquare> = { task: CheckSquare, lead: Target, deal: Briefcase, contact: Contact, mail: MailIcon };
const RECORD_LABEL: Record<ChatRecordCard['type'], string> = { task: 'Task', lead: 'Lead', deal: 'Deal', contact: 'Contact', mail: 'Mail conversation' };

/** FR-CHAT-08: rendered from the fields the API resolved for this viewer; no extra fetch. */
function RecordCard({ card }: { card: ChatRecordCard }) {
  const Icon = RECORD_ICON[card.type] ?? CheckSquare;
  return (
    <div className="mt-1.5 inline-flex max-w-md items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 shadow-card" data-testid="chat-record-card">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-soft text-blue-text">
        <Icon size={14} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-2xs font-semibold uppercase text-ink-3">{RECORD_LABEL[card.type] ?? card.type}</span>
        <span className="select-text block truncate text-sm font-medium text-ink">{card.title}</span>
      </span>
      {card.status && <Badge tone="blue" className="ml-1 shrink-0">{card.status.replace(/_/g, ' ')}</Badge>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Body rendering: Markdown subset (bold, italic, code, links) + @mention highlight
// ---------------------------------------------------------------------------

const TOKEN = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s<>)]+|@[A-Za-zÀ-ɏ'-]+(?: [A-Za-zÀ-ɏ'-]+)?)/g;

function renderBody(body: string, names: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of body.matchAll(TOKEN)) {
    const tok = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(body.slice(last, at));
    last = at + tok.length;
    const key = i++;
    if (tok.startsWith('`')) out.push(<code key={key} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-ink">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('**')) out.push(<strong key={key} className="font-semibold">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('*') || tok.startsWith('_')) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else if (tok.startsWith('http')) out.push(<button key={key} type="button" className="text-pri underline-offset-2 hover:underline" onClick={() => void bridge.app.openExternal(tok)}>{tok}</button>);
    else {
      // @mention: highlight when it names a channel member ("@First Last"), otherwise keep "@First" and fall back.
      const full = tok.slice(1);
      const match = names.find((n) => n === full) ?? names.find((n) => full.startsWith(n));
      if (match) {
        out.push(<span key={key} className="rounded bg-pri-soft px-1 font-medium text-pri-2">@{match}</span>);
        const rest = full.slice(match.length);
        if (rest) out.push(rest);
      } else out.push(tok);
    }
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

function resolveMentions(body: string, members: ChatMember[]): string[] {
  return members.filter((m) => body.includes(`@${m.firstName} ${m.lastName}`.trim())).map((m) => m.employeeId);
}

// ---------------------------------------------------------------------------
// Composer with @autocomplete and throttled typing
// ---------------------------------------------------------------------------

function Composer({ channelId, members, disabled, disabledReason, onSend }: { channelId: string; members: ChatMember[]; disabled: boolean; disabledReason?: string; onSend: (body: string, mentions: string[]) => void }) {
  const [value, setValue] = useState('');
  const [mentionQuery, setMentionQuery] = useState<{ start: number; q: string } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  const suggestions = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.q.toLowerCase();
    return members.filter((m) => m.status !== 'suspended' && `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, members]);

  const updateMentionQuery = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,30}(?: [^\s@]{0,30})?)$/.exec(before);
    if (!m) return setMentionQuery(null);
    setMentionQuery({ start: caret - m[2]!.length - 1, q: m[2]! });
    setHighlight(0);
  };

  const onChange = (text: string, caret: number) => {
    setValue(text);
    updateMentionQuery(text, caret);
    const now = Date.now();
    if (text.trim() && now - lastTyping.current > TYPING_THROTTLE_MS) {
      lastTyping.current = now;
      void http.post(`/chat/channels/${channelId}/typing`).catch(() => undefined);
    }
  };

  const pick = (m: ChatMember) => {
    if (!mentionQuery || !ref.current) return;
    const caret = ref.current.selectionStart ?? value.length;
    const insert = `@${m.firstName} ${m.lastName} `;
    const next = value.slice(0, mentionQuery.start) + insert + value.slice(caret);
    setValue(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const pos = mentionQuery.start + insert.length;
      ref.current?.setSelectionRange(pos, pos);
      ref.current?.focus();
    });
  };

  const submit = () => {
    const body = value.trim();
    if (!body || disabled) return;
    onSend(body.slice(0, MESSAGE_MAX), resolveMentions(body, members));
    setValue('');
    setMentionQuery(null);
    lastTyping.current = 0;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery && suggestions.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        return setHighlight((h) => (h + 1) % suggestions.length);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        return setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        return pick(suggestions[highlight]!);
      }
      if (e.key === 'Escape') return setMentionQuery(null);
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const rows = Math.min(8, Math.max(1, value.split('\n').length));
  return (
    <div className="border-t border-line bg-surface px-5 py-3">
      <div className="relative">
        {mentionQuery && suggestions.length > 0 && !disabled && (
          <ul className="pop-in absolute bottom-full left-0 z-10 mb-1.5 w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-pop" role="listbox" data-testid="mention-list">
            {suggestions.map((m, i) => (
              <li key={m.employeeId}>
                <button type="button" role="option" aria-selected={i === highlight} onMouseDown={(e) => { e.preventDefault(); pick(m); }} className={clsx('flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm', i === highlight ? 'bg-pri-soft text-pri-2' : 'text-ink hover:bg-surface-2')}>
                  <Avatar name={`${m.firstName} ${m.lastName}`} size={20} />
                  <span className="truncate">{m.firstName} {m.lastName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={clsx('flex items-end gap-2 rounded-xl border bg-bg px-3 py-2 transition', disabled ? 'border-line-2 opacity-70' : 'border-line focus-within:border-pri focus-within:ring-[3px] focus-within:ring-pri-soft')}>
          <textarea
            ref={ref}
            value={value}
            disabled={disabled}
            rows={rows}
            maxLength={MESSAGE_MAX}
            placeholder={disabled ? (disabledReason ?? 'Sending is disabled') : 'Write a message… Enter sends, Shift+Enter for a new line, @ to mention'}
            aria-label="Message"
            data-testid="chat-composer"
            onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={onKeyDown}
            onClick={(e) => updateMentionQuery(value, (e.target as HTMLTextAreaElement).selectionStart ?? value.length)}
            className="max-h-48 min-h-[24px] w-full resize-none border-0 bg-transparent text-base leading-relaxed text-ink placeholder:text-ink-3 focus:outline-none focus-visible:!shadow-none disabled:cursor-not-allowed"
          />
          <Button size="sm" variant="primary" onClick={submit} disabled={disabled || !value.trim()} className="h-7">
            Send
          </Button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-2xs text-ink-3">
        <span>{disabled && disabledReason ? <span className="inline-flex items-center gap-1 text-amber-text"><WifiOff size={11} /> {disabledReason}</span> : 'Messages stay inside your company. Copy on screen only, no export.'}</span>
        {value.length > MESSAGE_MAX * 0.8 && <span className={clsx('font-mono', value.length >= MESSAGE_MAX && 'text-red-text')}>{value.length}/{MESSAGE_MAX}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New direct message picker
// ---------------------------------------------------------------------------

function DirectPicker({ meId, onClose, onPick }: { meId: string; onClose: () => void; onPick: (employeeId: string) => Promise<void> }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Directory as the desktop can read it (`employees.view`, scoped). A 403 means the role cannot list colleagues.
  const dir = useQuery(() => http.get<DirectoryEmployee[] | Page<DirectoryEmployee>>('/employees?status=active&limit=200'), []);
  const all = (Array.isArray(dir.data) ? dir.data : dir.data?.items ?? []).filter((e) => e.id !== meId && e.status !== 'suspended' && e.status !== 'disabled');
  const needle = q.trim().toLowerCase();
  const list = needle ? all.filter((e) => `${e.firstName} ${e.lastName} ${e.code} ${e.department?.name ?? ''}`.toLowerCase().includes(needle)) : all;
  const forbidden = errorStatus(dir.error) === 403;

  const pick = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await onPick(id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={onClose} title="New message" subtitle="Start a direct conversation with a colleague" width={440}>
      <div className="relative mb-3">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, code or department" className="pl-8" aria-label="Search colleagues" />
      </div>
      {error && <ErrorBanner className="mb-3" message={error} />}
      {dir.loading ? (
        <SkeletonRows rows={5} />
      ) : forbidden ? (
        <Empty compact icon={<Users size={18} />} title="Your role cannot browse the directory" body="Direct messages still work: colleagues who message you appear in your list, and your team channels are open. Ask your administrator if you need the directory." />
      ) : dir.error ? (
        <ErrorBanner message={errorMessage(dir.error)} onRetry={dir.refetch} />
      ) : list.length === 0 ? (
        <Empty compact icon={<Users size={18} />} title={needle ? 'No one matches' : 'No colleagues listed'} body={needle ? 'Try another name or employee code.' : 'Only people your role may see are listed here. Your team channels are the place to reach everyone else.'} />
      ) : (
        <ul className="max-h-[48vh] divide-y divide-line-2 overflow-y-auto rounded-lg border border-line">
          {list.map((e) => {
            const name = fullName(e);
            return (
              <li key={e.id}>
                <button type="button" disabled={busy !== null} onClick={() => void pick(e.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-2 disabled:opacity-60">
                  <Avatar name={name} size={28} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-medium text-ink">{name}</span>
                    <span className="block truncate text-2xs normal-case tracking-normal text-ink-3">{e.code}{e.department?.name ? ` · ${e.department.name}` : ''}{e.role?.name ? ` · ${e.role.name}` : ''}</span>
                  </span>
                  {busy === e.id && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent text-ink-3" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
