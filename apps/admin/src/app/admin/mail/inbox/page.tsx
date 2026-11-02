'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Inbox, Paperclip, Send, UserCheck, Clock, CheckCircle2, RotateCcw, Link2, MessageSquare, FileText } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import {
  useMailboxes, useConversations, useCounts, useThread, useComments, useThreadEvents, useMailTemplates, useMailMutation,
  type Conversation, type View, type Mailbox,
} from '@/lib/queries/mail';
import { useSearch } from '@/lib/queries/crm';
import { Button, Card, Badge, Skeleton, EmptyState, ErrorBanner, Pagination, Tabs, Field, Input, Textarea, Select, SearchInput, Modal, useToast, PageHeader, Avatar, Banner } from '@/components/ui';
import { MailboxSelect, AssigneeSelect, LabelChips, LabelPicker, SnoozeModal, StatusBadge } from '@/components/mail/shared';
import { fullName, relative, dateTime } from '@/lib/format';

export default function InboxPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <InboxView />
    </Suspense>
  );
}

const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'mine', label: 'Mine' },
  { value: 'open', label: 'All open' },
  { value: 'snoozed', label: 'Snoozed' },
  { value: 'closed', label: 'Closed' },
];

function InboxView() {
  const mailboxes = useMailboxes(false);
  const [mailboxId, setMailboxId] = useState('');
  const [threadId, setThreadId] = useIdParam('thread');
  const [view, setView] = useState<View>('open');
  const [q, setQ] = useState('');
  const [labelId, setLabelId] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Conversation[][]>([]);

  useEffect(() => {
    if (!mailboxId && mailboxes.data?.length) setMailboxId(mailboxes.data[0]!.id);
  }, [mailboxes.data, mailboxId]);

  const mailbox = mailboxes.data?.find((m) => m.id === mailboxId);
  const params = useMemo(() => ({ view, q: q || undefined, labelId: labelId || undefined, cursor }), [view, q, labelId, cursor]);
  const list = useConversations(mailboxId || null, params);
  const counts = useCounts(mailboxId || null);
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return [...pages.flat(), ...(list.data?.items ?? [])].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  }, [pages, list.data]);
  const reset = () => { setCursor(undefined); setPages([]); };
  const loadMore = () => { if (list.data?.nextCursor) { setPages((p) => [...p, list.data!.items]); setCursor(list.data.nextCursor); } };

  if (mailboxes.isLoading) return <Skeleton className="h-64" />;
  if (mailboxes.isError) return <ErrorBanner message={(mailboxes.error as Error).message} onRetry={() => mailboxes.refetch()} />;
  if (!mailboxes.data?.length) {
    return (
      <div>
        <PageHeader title="Inbox" />
        <Card><EmptyState icon={<Inbox size={28} />} title="No mailbox assigned to you" body="An administrator assigns mailboxes under Mail → Mailboxes." /></Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px-40px)] flex-col">
      <PageHeader title="Inbox" subtitle={mailbox ? mailbox.address : undefined} actions={<div className="w-72"><MailboxSelect value={mailboxId} onChange={(v) => { setMailboxId(v); setThreadId(null); reset(); }} mailboxes={mailboxes.data} /></div>} />
      <div className="grid min-h-0 flex-1 grid-cols-[380px_1fr] gap-3">
        <Card className="flex min-h-0 flex-col overflow-hidden !p-0">
          <div className="border-b border-line p-3">
            <Tabs value={view} onChange={(v) => { setView(v); reset(); }} tabs={VIEWS.map((v) => ({ ...v, count: counts.data ? counts.data[v.value] : undefined }))} />
            <div className="mt-2 flex gap-2">
              <SearchInput className="flex-1" value={q} onChange={(v) => { setQ(v); reset(); }} placeholder="Subject or snippet…" />
              <div className="w-36"><LabelPicker exclude={labelId ? [labelId] : []} onPick={(id) => { setLabelId(id); reset(); }} /></div>
            </div>
            {labelId && <div className="mt-2 text-xs text-ink-2">Filtered by label · <button type="button" className="text-pri underline" onClick={() => { setLabelId(''); reset(); }}>clear</button></div>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.isLoading && pages.length === 0 && <div className="space-y-2 p-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
            {list.isError && <ErrorBanner message={(list.error as Error).message} onRetry={() => list.refetch()} />}
            {list.data && rows.length === 0 && <EmptyState icon={<Inbox size={24} />} title="Nothing here" body={view === 'unassigned' ? 'Every conversation has an owner.' : 'No conversations match this view.'} />}
            {rows.map((c) => (
              <button key={c.id} type="button" onClick={() => setThreadId(c.id)} className={`block w-full border-b border-line-2 px-3 py-2.5 text-left hover:bg-surface-2 ${threadId === c.id ? 'bg-pri-soft' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-[13px] ${c.unread ? 'font-semibold text-ink' : 'text-ink-2'}`}>{c.subject || '(no subject)'}</span>
                  <span className="shrink-0 text-[11px] text-ink-3">{relative(c.lastMessageAt)}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-3">{c.snippet ?? ''}</div>
                <div className="mt-1 flex items-center gap-2">
                  {c.assignee ? <span className="inline-flex items-center gap-1 text-[11px] text-ink-2"><Avatar name={fullName(c.assignee)} size={16} />{fullName(c.assignee)}</span> : <Badge tone="amber">Unassigned</Badge>}
                  {c.status !== 'open' && <StatusBadge status={c.status} />}
                  {c.hasAttachments && <Paperclip size={12} className="text-ink-3" />}
                  {(c._count?.comments ?? 0) > 0 && <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-3"><MessageSquare size={11} />{c._count!.comments}</span>}
                  <span className="ml-auto"><LabelChips labels={c.labels} /></span>
                </div>
              </button>
            ))}
            {rows.length > 0 && <Pagination count={rows.length} hasMore={Boolean(list.data?.nextCursor)} onMore={loadMore} loading={list.isFetching} />}
          </div>
        </Card>
        <Card className="flex min-h-0 flex-col overflow-hidden !p-0">
          {!threadId && <EmptyState icon={<Inbox size={28} />} title="Select a conversation" body="Pick a conversation on the left to read, comment and reply." />}
          {threadId && mailbox && <ConversationPane mailbox={mailbox} threadId={threadId} listRow={rows.find((r) => r.id === threadId)} />}
        </Card>
      </div>
    </div>
  );
}

function ConversationPane({ mailbox, threadId, listRow }: { mailbox: Mailbox; threadId: string; listRow?: Conversation }) {
  const { me } = useAuth();
  const toast = useToast();
  const perms = mailbox.permissions ?? [];
  const can = (p: string) => perms.includes(p);
  const thread = useThread(mailbox.id, threadId);
  const comments = useComments(mailbox.id, threadId);
  const events = useThreadEvents(mailbox.id, threadId);
  const [tab, setTab] = useState<'messages' | 'comments' | 'history'>('messages');
  const [snooze, setSnooze] = useState(false);
  const [link, setLink] = useState(false);
  const [reply, setReply] = useState(false);
  const [comment, setComment] = useState('');
  const base = `/mail/mailboxes/${mailbox.id}/threads/${threadId}`;
  const assign = useMailMutation((assigneeId: string | null) => http.post(`${base}/assign`, { assigneeId }));
  const status = useMailMutation((b: { status: string; snoozedUntil?: string }) => http.post(`${base}/status`, b));
  const addLabel = useMailMutation((labelId: string) => http.post(`${base}/labels/${labelId}`));
  const removeLabel = useMailMutation((labelId: string) => http.del(`${base}/labels/${labelId}`));
  const addComment = useMailMutation((body: string) => http.post(`${base}/comments`, { body }));
  const onErr = (e: unknown) => toast.push('error', (e as Error).message);
  const t = thread.data;
  const meta = listRow;

  return (
    <>
      <div className="border-b border-line p-4">
        {thread.isLoading && <Skeleton className="h-6 w-2/3" />}
        {thread.isError && <ErrorBanner message={(thread.error as Error).message} onRetry={() => thread.refetch()} />}
        {t && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-semibold text-ink">{t.subject || '(no subject)'}</h2>
                <div className="mt-0.5 text-xs text-ink-3">{(t.participants ?? []).join(', ')}</div>
              </div>
              <StatusBadge status={t.status} snoozedUntil={t.snoozedUntil} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {can('triage') ? (
                <div className="w-52"><AssigneeSelect mailbox={mailbox} value={t.assigneeId ?? ''} onChange={(v) => assign.mutate(v || null, { onError: onErr })} /></div>
              ) : (
                <Badge tone={t.assigneeId ? 'blue' : 'amber'}>{meta?.assignee ? fullName(meta.assignee) : 'Unassigned'}</Badge>
              )}
              {can('triage') && me && t.assigneeId !== me.id && <Button size="sm" icon={<UserCheck size={13} />} onClick={() => assign.mutate(me.id, { onError: onErr })}>Take</Button>}
              {can('triage') && t.status === 'open' && <Button size="sm" icon={<CheckCircle2 size={13} />} onClick={() => status.mutate({ status: 'closed' }, { onError: onErr })}>Close</Button>}
              {can('triage') && t.status === 'open' && <Button size="sm" icon={<Clock size={13} />} onClick={() => setSnooze(true)}>Snooze</Button>}
              {can('triage') && t.status !== 'open' && <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => status.mutate({ status: 'open' }, { onError: onErr })}>Reopen</Button>}
              {can('triage') && <Button size="sm" icon={<Link2 size={13} />} onClick={() => setLink(true)}>{t.contactId || t.dealId || t.leadId ? 'Linked' : 'Link to CRM'}</Button>}
              {(can('reply') || can('send')) && <Button size="sm" variant="primary" icon={<Send size={13} />} onClick={() => setReply(true)}>Reply</Button>}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <LabelChips labels={meta?.labels ?? []} onRemove={can('triage') ? (id) => removeLabel.mutate(id, { onError: onErr }) : undefined} />
              {can('triage') && <div className="w-36"><LabelPicker exclude={(meta?.labels ?? []).map((l) => l.id)} onPick={(id) => addLabel.mutate(id, { onError: onErr })} /></div>}
            </div>
          </>
        )}
      </div>
      <div className="border-b border-line px-4">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'messages', label: 'Messages', count: t?.messages.length }, { value: 'comments', label: 'Internal comments', count: comments.data?.length }, { value: 'history', label: 'History' }]} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'messages' && t && (
          <div className="space-y-3">
            <Banner tone="blue">Message bodies are fetched from Gmail on demand and are not stored (10 section 4.3). Snippets shown.</Banner>
            {t.messages.map((m) => (
              <div key={m.id} className="rounded-card border border-line p-3">
                <div className="flex items-center justify-between text-xs text-ink-3"><span className="font-semibold text-ink-2">{m.fromAddr}</span><span>{dateTime(m.sentAt)}</span></div>
                <div className="text-xs text-ink-3">to {m.toAddrs.join(', ')}{m.ccAddrs.length ? ` · cc ${m.ccAddrs.join(', ')}` : ''}</div>
                <div className="mt-2 text-[13px] text-ink">{m.snippet ?? ''}</div>
                {m.hasAttachments && <div className="mt-1 inline-flex items-center gap-1 text-xs text-ink-3"><Paperclip size={12} /> attachments</div>}
              </div>
            ))}
          </div>
        )}
        {tab === 'comments' && (
          <div className="space-y-3">
            {comments.isLoading && <Skeleton className="h-16" />}
            {comments.isError && <ErrorBanner message={(comments.error as Error).message} onRetry={() => comments.refetch()} />}
            {comments.data?.length === 0 && <EmptyState icon={<MessageSquare size={22} />} title="No internal comments" body="Comments are visible to the team only, never sent to the customer." />}
            {comments.data?.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Avatar name={fullName(c.author)} size={24} />
                <div className="flex-1 rounded-card bg-amber-soft/60 p-2.5">
                  <div className="flex items-center justify-between text-xs"><span className="font-semibold text-ink">{fullName(c.author)}</span><span className="text-ink-3">{relative(c.createdAt)}</span></div>
                  <div className="mt-1 whitespace-pre-wrap text-[13px] text-ink">{c.body}</div>
                </div>
              </div>
            ))}
            {can('comment') && (
              <div className="flex gap-2">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Internal note for the team…" rows={2} className="flex-1" />
                <Button variant="primary" disabled={!comment.trim()} loading={addComment.isPending} onClick={() => addComment.mutate(comment, { onSuccess: () => setComment(''), onError: onErr })}>Comment</Button>
              </div>
            )}
          </div>
        )}
        {tab === 'history' && (
          <div className="space-y-2">
            {events.isLoading && <Skeleton className="h-16" />}
            {events.data?.length === 0 && <EmptyState title="No events yet" />}
            {events.data?.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-md border border-line-2 px-3 py-2 text-xs">
                <span className="text-ink-2"><Badge tone="gray">{e.type.replace('_', ' ')}</Badge> <span className="ml-2 text-ink-3">{summariseEvent(e.type, e.data)}</span></span>
                <span className="text-ink-3">{dateTime(e.occurredAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <SnoozeModal open={snooze} onClose={() => setSnooze(false)} busy={status.isPending} onConfirm={(iso) => status.mutate({ status: 'snoozed', snoozedUntil: iso }, { onSuccess: () => setSnooze(false), onError: onErr })} />
      {link && <LinkModal base={base} onClose={() => setLink(false)} />}
      {reply && t && <ReplyModal mailbox={mailbox} thread={t} onClose={() => setReply(false)} />}
    </>
  );
}

function summariseEvent(type: string, data: Record<string, unknown>): string {
  if (type === 'status_changed') return `${String(data.from)} → ${String(data.to)}${data.reason ? ` (${String(data.reason)})` : ''}`;
  if (type === 'label_added' || type === 'label_removed') return String(data.name ?? '');
  if (type === 'linked') return [data.contactId && 'contact', data.dealId && 'deal', data.leadId && 'lead'].filter(Boolean).join(', ') || 'unlinked';
  return '';
}

function LinkModal({ base, onClose }: { base: string; onClose: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const search = useSearch(q);
  const link = useMailMutation((b: Record<string, string | null>) => http.post(`${base}/link`, b));
  const pick = (b: Record<string, string | null>) => link.mutate(b, { onSuccess: () => { toast.push('success', 'Linked'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) });
  return (
    <Modal open onClose={onClose} title="Link to CRM record" footer={<><Button onClick={() => pick({ contactId: null, dealId: null, leadId: null })}>Unlink all</Button><Button onClick={onClose}>Close</Button></>}>
      <SearchInput value={q} onChange={setQ} placeholder="Search contacts, deals, leads…" />
      <div className="mt-3 max-h-72 space-y-1 overflow-y-auto text-[13px]">
        {search.data?.contacts.map((c) => <button key={c.id} type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => pick({ contactId: c.id })}><Badge tone="blue">Contact</Badge> <span className="ml-2">{fullName(c)}{c.account ? ` · ${c.account.name}` : ''}</span></button>)}
        {search.data?.deals.map((d) => <button key={d.id} type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => pick({ dealId: d.id })}><Badge tone="violet">Deal</Badge> <span className="ml-2">{d.name}</span></button>)}
        {search.data?.leads.map((l) => <button key={l.id} type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => pick({ leadId: l.id })}><Badge tone="green">Lead</Badge> <span className="ml-2">{l.name}</span></button>)}
        {q && search.data && !search.data.contacts.length && !search.data.deals.length && !search.data.leads.length && <div className="p-2 text-ink-3">No matches</div>}
      </div>
    </Modal>
  );
}

function ReplyModal({ mailbox, thread, onClose }: { mailbox: Mailbox; thread: { id: string; gmailThreadId: string; subject: string; participants: string[]; contactId: string | null } ; onClose: () => void }) {
  const toast = useToast();
  const templates = useMailTemplates();
  const others = (thread.participants ?? []).filter((p) => p.toLowerCase() !== mailbox.address.toLowerCase());
  const [to, setTo] = useState(others.join(', '));
  const [subject, setSubject] = useState(thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`);
  const [html, setHtml] = useState('');
  const [templateId, setTemplateId] = useState('');
  const send = useMailMutation((b: unknown) => http.post(`/mail/mailboxes/${mailbox.id}/send`, b));
  const insert = async (id: string) => {
    setTemplateId(id);
    if (!id) return;
    try {
      const r = await http.post<{ subject: string; html: string }>(`/mail/templates/${id}/render`, { threadId: thread.id, contactId: thread.contactId ?? undefined });
      setHtml((h) => (h ? `${h}\n${r.html}` : r.html));
      if (r.subject && !subject) setSubject(r.subject);
    } catch (e) {
      toast.push('error', (e as Error).message);
    }
  };
  return (
    <Modal open onClose={onClose} title="Reply" width={620} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Send size={13} />} loading={send.isPending} disabled={!to.trim() || !html.trim()} onClick={() => send.mutate({ to: to.split(',').map((s) => s.trim()).filter(Boolean), subject, html, replyToThreadId: thread.gmailThreadId }, { onSuccess: () => { toast.push('success', 'Sent'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Send</Button></>}>
      <div className="space-y-3">
        <Field label="To"><Input value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Template"><Select value={templateId} onChange={(e) => void insert(e.target.value)}><option value="">Insert a template…</option>{templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.ownerId ? '' : ' (shared)'}</option>)}</Select></Field>
        <Field label="Message (HTML)"><Textarea rows={8} value={html} onChange={(e) => setHtml(e.target.value)} /></Field>
        <div className="flex items-center gap-1 text-xs text-ink-3"><FileText size={12} /> Sent through {mailbox.address}; every send is written to the mail audit log.</div>
      </div>
    </Modal>
  );
}
