'use client';

import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { api, http, type Page } from '../api';
import { getSocket, useSocketUp } from '../ws';

/** Mirrors packages/contracts/src/chat.ts (22-internal-chat-spec.md). */
export type ChannelKind = 'company' | 'department' | 'team' | 'group' | 'direct';
export type RecordRefType = 'task' | 'lead' | 'deal' | 'contact' | 'mail';

export interface ChatAuthor {
  id: string;
  firstName: string;
  lastName: string;
}
export interface ChatMember extends Omit<ChatAuthor, 'id'> {
  employeeId: string;
  status: string;
  joinedAt: string;
}
export interface ChatChannel {
  id: string;
  kind: ChannelKind;
  name: string;
  departmentId: string | null;
  teamId: string | null;
  createdBy: string | null;
  archivedAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  isMember: boolean;
  unreadCount: number;
  lastMessage: { id: string; authorId: string; body: string; createdAt: string } | null;
  members: ChatMember[];
  counterpart: ChatAuthor | null;
}
export interface RecordRef {
  type: RecordRefType;
  id: string;
}
export interface RecordCard extends RecordRef {
  title: string;
  status: string | null;
}
export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  author: ChatAuthor | null;
  body: string;
  mentions: string[];
  recordRef: RecordRef | null;
  recordCard: RecordCard | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}
export interface ChatUnread {
  total: number;
  channels: Array<{ channelId: string; unreadCount: number }>;
}
export interface EmployeeOption {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  department: string | null;
  team: string | null;
}

export const chatKeys = {
  all: ['chat'] as const,
  channels: (scope: 'mine' | 'all') => ['chat', 'channels', scope] as const,
  messages: (channelId: string) => ['chat', 'messages', channelId] as const,
  unread: ['chat', 'unread'] as const,
  search: (q: string, channelId?: string) => ['chat', 'search', q, channelId ?? ''] as const,
  employees: ['chat', 'employees'] as const,
};

/** 10 s polling while the socket is down, otherwise realtime keeps the cache fresh (FR-CHAT-05). */
function pollInterval(up: boolean, slow = 60_000) {
  return up ? slow : 10_000;
}

export function useChannels(scope: 'mine' | 'all' = 'mine') {
  const up = useSocketUp();
  return useQuery({ queryKey: chatKeys.channels(scope), queryFn: () => http.get<ChatChannel[]>('/chat/channels', { scope }), refetchInterval: pollInterval(up) });
}

export function useUnread(enabled = true) {
  const up = useSocketUp();
  return useQuery({ queryKey: chatKeys.unread, queryFn: () => http.get<ChatUnread>('/chat/unread'), refetchInterval: pollInterval(up), enabled });
}

export function useMessages(channelId: string | null) {
  const up = useSocketUp();
  return useInfiniteQuery({
    queryKey: chatKeys.messages(channelId ?? ''),
    queryFn: ({ pageParam }) => http.get<Page<ChatMessage>>(`/chat/channels/${channelId}/messages`, { limit: 50, cursor: pageParam || undefined }),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(channelId),
    refetchInterval: pollInterval(up, 0) || false,
  });
}

export function useChatSearch(q: string, channelId?: string) {
  return useQuery({ queryKey: chatKeys.search(q, channelId), queryFn: () => http.get<Page<ChatMessage>>('/chat/search', { q, channelId, limit: 30 }), enabled: q.trim().length > 0 });
}

/** /chat/directory: active colleagues (no employees.view needed), already excludes the caller. */
export function useChatEmployees() {
  return useQuery({ queryKey: chatKeys.employees, queryFn: () => http.get<Page<EmployeeOption>>('/chat/directory', { limit: 100 }), select: (d) => d.items });
}

function useChatMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>, keys: ReadonlyArray<readonly unknown[]> = [chatKeys.all]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of keys) void qc.invalidateQueries({ queryKey: k as unknown[] });
    },
  });
}

export function useSendMessage(channelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; mentions?: string[]; recordRef?: RecordRef | null }) =>
      api<ChatMessage>(`/chat/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(input), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    onSuccess: (msg) => {
      upsertMessage(qc, msg);
      void qc.invalidateQueries({ queryKey: chatKeys.channels('mine') });
    },
  });
}
export function useEditMessage() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: { id: string; body: string }) => http.patch<ChatMessage>(`/chat/messages/${input.id}`, { body: input.body }), onSuccess: (msg) => upsertMessage(qc, msg) });
}
export function useDeleteMessage() {
  return useChatMutation((input: { id: string; channelId: string }) => http.del<{ id: string; deletedAt: string }>(`/chat/messages/${input.id}`), [chatKeys.all]);
}
export function useMarkRead() {
  return useChatMutation((input: { channelId: string; lastReadMessageId: string }) => http.post(`/chat/channels/${input.channelId}/read`, { lastReadMessageId: input.lastReadMessageId }), [chatKeys.unread, chatKeys.channels('mine'), chatKeys.channels('all')]);
}
export function useTyping() {
  return useMutation({ mutationFn: (channelId: string) => http.post(`/chat/channels/${channelId}/typing`) });
}
export function useCreateGroup() {
  return useChatMutation((input: { name: string; memberIds: string[] }) => http.post<ChatChannel>('/chat/channels', { kind: 'group', ...input }));
}
export function useCreateDirect() {
  return useChatMutation((employeeId: string) => http.post<ChatChannel>('/chat/channels/direct', { employeeId }));
}
export function useUpdateChannel() {
  return useChatMutation((input: { id: string; name?: string; archived?: boolean }) => http.patch<ChatChannel>(`/chat/channels/${input.id}`, { name: input.name, archived: input.archived }));
}
export function useAddMember() {
  return useChatMutation((input: { id: string; employeeId: string }) => http.post<ChatChannel>(`/chat/channels/${input.id}/members/${input.employeeId}`));
}
export function useRemoveMember() {
  return useChatMutation((input: { id: string; employeeId: string }) => http.del<ChatChannel>(`/chat/channels/${input.id}/members/${input.employeeId}`));
}
export function useLeaveChannel() {
  return useChatMutation((id: string) => http.post<{ left: true }>(`/chat/channels/${id}/leave`));
}

type MessagesData = InfiniteData<Page<ChatMessage>, string>;

/** Inserts or replaces a message in the newest-first infinite cache of its channel. */
function upsertMessage(qc: ReturnType<typeof useQueryClient>, msg: ChatMessage) {
  qc.setQueryData<MessagesData>(chatKeys.messages(msg.channelId), (data) => {
    if (!data) return data;
    const exists = data.pages.some((p) => p.items.some((m) => m.id === msg.id));
    if (exists) {
      return { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.id === msg.id ? { ...m, ...msg, recordCard: msg.recordCard ?? m.recordCard } : m)) })) };
    }
    const [first, ...rest] = data.pages;
    if (!first) return data;
    return { ...data, pages: [{ ...first, items: [msg, ...first.items] }, ...rest] };
  });
}

/**
 * Mounted once in the shell: applies chat.message.* and chat.read events to the query cache and
 * refreshes channel and unread lists so badges stay current (FR-CHAT-05, FR-CHAT-06).
 */
export function useChatRealtime(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const s = getSocket();
    if (!s) return;
    const onCreated = (msg: ChatMessage) => {
      upsertMessage(qc, msg);
      void qc.invalidateQueries({ queryKey: chatKeys.unread });
      void qc.invalidateQueries({ queryKey: ['chat', 'channels'] });
    };
    const onUpdated = (msg: ChatMessage) => upsertMessage(qc, msg);
    const onDeleted = (p: { channelId: string; id: string; deletedAt: string }) => {
      qc.setQueryData<MessagesData>(chatKeys.messages(p.channelId), (data) =>
        data ? { ...data, pages: data.pages.map((pg) => ({ ...pg, items: pg.items.map((m) => (m.id === p.id ? { ...m, body: '', deletedAt: p.deletedAt, recordCard: null, recordRef: null } : m)) })) } : data,
      );
      void qc.invalidateQueries({ queryKey: ['chat', 'channels'] });
      void qc.invalidateQueries({ queryKey: chatKeys.unread });
    };
    const onChannel = () => {
      void qc.invalidateQueries({ queryKey: ['chat', 'channels'] });
      void qc.invalidateQueries({ queryKey: chatKeys.unread });
    };
    const onReconnect = () => void qc.invalidateQueries({ queryKey: chatKeys.all });
    s.on('chat.message.created', onCreated);
    s.on('chat.message.updated', onUpdated);
    s.on('chat.message.deleted', onDeleted);
    s.on('chat.channel.changed', onChannel);
    s.on('connect', onReconnect);
    return () => {
      s.off('chat.message.created', onCreated);
      s.off('chat.message.updated', onUpdated);
      s.off('chat.message.deleted', onDeleted);
      s.off('chat.channel.changed', onChannel);
      s.off('connect', onReconnect);
    };
  }, [enabled, qc]);
}

export interface TypingEvent {
  channelId: string;
  employeeId: string;
  name: string;
  at: string;
}

/** Typing indicator feed for one channel; entries expire after 4 s. */
export function useTypingFeed(channelId: string | null, selfId: string | undefined, onTyping: (events: TypingEvent[]) => void) {
  useEffect(() => {
    if (!channelId) return;
    const s = getSocket();
    if (!s) return;
    const active = new Map<string, TypingEvent>();
    let timer: ReturnType<typeof setInterval> | null = null;
    const flush = () => {
      const now = Date.now();
      for (const [k, v] of active) if (now - new Date(v.at).getTime() > 4000) active.delete(k);
      onTyping(Array.from(active.values()));
      if (active.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const handler = (e: TypingEvent) => {
      if (e.channelId !== channelId || e.employeeId === selfId) return;
      active.set(e.employeeId, { ...e, at: new Date().toISOString() });
      flush();
      if (!timer) timer = setInterval(flush, 1000);
    };
    s.on('chat.typing', handler);
    return () => {
      s.off('chat.typing', handler);
      if (timer) clearInterval(timer);
      onTyping([]);
    };
  }, [channelId, selfId, onTyping]);
}
