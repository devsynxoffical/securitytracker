'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, type Page } from '../api';

export interface Mailbox {
  id: string;
  address: string;
  displayName: string;
  tokenStatus: string;
  lastSyncAt: string | null;
  watchExpiresAt: string | null;
  permissions?: string[];
  assignments?: Array<{ id: string; employeeId: string; permissions: string[]; employee: { id: string; code: string; firstName: string; lastName: string; email: string | null } }>;
}
export interface MailboxHealth extends Mailbox {
  assignmentsCount: number;
  threadsCount: number;
  staleSync: boolean;
  watchExpired: boolean;
  health: 'ok' | 'warning' | 'error';
}
export interface MailLabel {
  id: string;
  name: string;
  colour: string;
  usageCount?: number;
}
export interface Conversation {
  id: string;
  mailboxId: string;
  gmailThreadId: string;
  subject: string;
  snippet: string | null;
  participants: string[];
  lastMessageAt: string;
  lastInboundAt: string | null;
  unread: boolean;
  hasAttachments: boolean;
  status: 'open' | 'closed' | 'snoozed';
  snoozedUntil: string | null;
  assigneeId: string | null;
  assignee: { id: string; firstName: string; lastName: string; code?: string } | null;
  contactId: string | null;
  dealId: string | null;
  leadId: string | null;
  labels: MailLabel[];
  _count?: { messages: number; comments: number };
}
export interface MailMessage {
  id: string;
  gmailMessageId: string;
  fromAddr: string;
  toAddrs: string[];
  ccAddrs: string[];
  sentAt: string;
  snippet: string | null;
  hasAttachments: boolean;
  sentByEmployeeId: string | null;
}
export interface ThreadDetail extends Omit<Conversation, 'labels' | 'assignee'> {
  messages: MailMessage[];
}
export interface MailComment {
  id: string;
  authorId: string;
  author: { id: string; firstName: string; lastName: string } | null;
  body: string;
  mentions: string[];
  createdAt: string;
}
export interface ThreadEvent {
  id: string;
  actorId: string | null;
  type: string;
  data: Record<string, unknown>;
  occurredAt: string;
}
export interface MailTemplate {
  id: string;
  ownerId: string | null;
  name: string;
  subject: string;
  bodyHtml: string;
}
export interface MailAuditRow {
  id: string;
  mailboxId: string;
  employeeId: string;
  action: string;
  subject: string | null;
  recipients: string[];
  ip: string;
  occurredAt: string;
}
export type View = 'unassigned' | 'mine' | 'open' | 'snoozed' | 'closed';
export interface Counts {
  unassigned: number;
  mine: number;
  open: number;
  snoozed: number;
  closed: number;
}

export const mailKeys = {
  mailboxes: (admin: boolean) => ['mail', 'mailboxes', admin] as const,
  health: ['mail', 'health'] as const,
  labels: ['mail', 'labels'] as const,
  templates: ['mail', 'templates'] as const,
  conversations: (mb: string, p: Record<string, unknown>) => ['mail', 'conversations', mb, p] as const,
  counts: (mb: string) => ['mail', 'counts', mb] as const,
  thread: (mb: string, t: string | null) => ['mail', 'thread', mb, t] as const,
  comments: (t: string | null) => ['mail', 'comments', t] as const,
  events: (t: string | null) => ['mail', 'events', t] as const,
  audit: (p: Record<string, unknown>) => ['mail', 'audit', p] as const,
};

export const useMailboxes = (admin = false) =>
  useQuery({ queryKey: mailKeys.mailboxes(admin), queryFn: () => http.get<Mailbox[]>('/mail/mailboxes', admin ? { admin: 'true' } : undefined) });
export const useMailboxHealth = () =>
  useQuery({ queryKey: mailKeys.health, queryFn: () => http.get<{ items: MailboxHealth[]; googleConfigured: boolean }>('/mail/mailboxes/health') });
export const useMailLabels = () => useQuery({ queryKey: mailKeys.labels, queryFn: () => http.get<MailLabel[]>('/mail/labels') });
export const useMailTemplates = () => useQuery({ queryKey: mailKeys.templates, queryFn: () => http.get<MailTemplate[]>('/mail/templates') });
export const useConversations = (mailboxId: string | null, p: { view: View; labelId?: string; assigneeId?: string; q?: string; cursor?: string }) =>
  useQuery({
    queryKey: mailKeys.conversations(mailboxId ?? '', p),
    queryFn: () => http.get<Page<Conversation>>(`/mail/mailboxes/${mailboxId}/conversations`, { ...p, limit: 30 }),
    enabled: Boolean(mailboxId),
  });
export const useCounts = (mailboxId: string | null) =>
  useQuery({ queryKey: mailKeys.counts(mailboxId ?? ''), queryFn: () => http.get<Counts>(`/mail/mailboxes/${mailboxId}/conversations/counts`), enabled: Boolean(mailboxId), refetchInterval: 30_000 });
export const useThread = (mailboxId: string | null, threadId: string | null) =>
  useQuery({ queryKey: mailKeys.thread(mailboxId ?? '', threadId), queryFn: () => http.get<ThreadDetail>(`/mail/mailboxes/${mailboxId}/threads/${threadId}`), enabled: Boolean(mailboxId && threadId) });
export const useComments = (mailboxId: string | null, threadId: string | null) =>
  useQuery({ queryKey: mailKeys.comments(threadId), queryFn: () => http.get<MailComment[]>(`/mail/mailboxes/${mailboxId}/threads/${threadId}/comments`), enabled: Boolean(mailboxId && threadId) });
export const useThreadEvents = (mailboxId: string | null, threadId: string | null) =>
  useQuery({ queryKey: mailKeys.events(threadId), queryFn: () => http.get<ThreadEvent[]>(`/mail/mailboxes/${mailboxId}/threads/${threadId}/events`), enabled: Boolean(mailboxId && threadId) });
export const useMailAudit = (p: { mailboxId?: string; employeeId?: string; action?: string }) =>
  useQuery({ queryKey: mailKeys.audit(p), queryFn: () => http.get<MailAuditRow[]>('/mail/audit', p) });

/** Mutation helper that invalidates mail query prefixes on success. */
export function useMailMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>, prefixes: ReadonlyArray<readonly unknown[]> = [['mail']]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const p of prefixes) void qc.invalidateQueries({ queryKey: p as unknown[] });
    },
  });
}
