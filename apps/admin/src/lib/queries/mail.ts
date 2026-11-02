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
  /** 'gmail' (Google Workspace OAuth) or 'imap' (IMAP/SMTP with stored credentials). */
  provider?: 'gmail' | 'imap';
  imapHost?: string | null;
  imapPort?: number | null;
  imapSecure?: boolean | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  username?: string | null;
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
export interface MailAttachment {
  partId: string;
  fileName: string;
  mime: string;
  size: number;
}
export interface MessageBody {
  html: string | null;
  text: string | null;
  attachments: MailAttachment[];
}
export interface PresenceViewer {
  employeeId: string;
  firstName: string;
  lastName: string;
  since: string;
}
export interface ImapTestResult {
  imap: boolean;
  smtp: boolean;
  error?: string;
}
export interface ImapMailboxSettings {
  address: string;
  displayName: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
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
  body: (mb: string, m: string, remote: boolean) => ['mail', 'body', mb, m, remote] as const,
  presence: (mb: string, t: string | null) => ['mail', 'presence', mb, t] as const,
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

/** Message body (HTML sanitised server-side, plain text, attachment metadata), fetched on demand (10 §4.3). */
export const useMessageBody = (mailboxId: string, messageId: string, opts: { enabled: boolean; allowRemote: boolean }) =>
  useQuery({
    queryKey: mailKeys.body(mailboxId, messageId, opts.allowRemote),
    queryFn: () => http.get<MessageBody>(`/mail/mailboxes/${mailboxId}/messages/${messageId}/body`, opts.allowRemote ? { allowRemote: 'true' } : undefined),
    enabled: opts.enabled,
    staleTime: 5 * 60_000,
  });
/** Other viewers of a conversation in the last 60 s (FR-MAIL-19). Polled while the pane is open. */
export const usePresence = (mailboxId: string, threadId: string | null, intervalMs = 20_000) =>
  useQuery({
    queryKey: mailKeys.presence(mailboxId, threadId),
    queryFn: () => http.get<{ viewers: PresenceViewer[] }>(`/mail/mailboxes/${mailboxId}/threads/${threadId}/presence`),
    enabled: Boolean(mailboxId && threadId),
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
    retry: false,
  });
export const presenceHeartbeat = (mailboxId: string, threadId: string, action: 'viewing' | 'left') =>
  http.post(`/mail/mailboxes/${mailboxId}/threads/${threadId}/presence`, { action });

/** IMAP/SMTP mailbox lifecycle (10 §2 option D). Passwords travel once, are stored encrypted and never returned. */
export const testImapMailbox = (b: ImapMailboxSettings) => http.post<ImapTestResult>('/mail/mailboxes/imap/test', b);
export const useCreateImapMailbox = () => useMailMutation((b: ImapMailboxSettings) => http.post<Mailbox>('/mail/mailboxes/imap', b));
export const useUpdateImapMailbox = (id: string | null) => useMailMutation((b: Partial<Omit<ImapMailboxSettings, 'address'>>) => http.patch<Mailbox>(`/mail/mailboxes/${id}/imap`, b));
export const useDeleteMailbox = () => useMailMutation((id: string) => http.del(`/mail/mailboxes/${id}`));

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
