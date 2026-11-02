'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Inbox, Paperclip, UserCheck, Clock, CheckCircle2, RotateCcw, Link2, MessageSquare, MoreHorizontal, Mail as MailIcon, Tag as TagIcon, History } from 'lucide-react';
import { clsx } from 'clsx';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useMailboxes, useConversations, useCounts, useThread, useComments, useThreadEvents, useMailMutation, type Conversation, type View, type Mailbox } from '@/lib/queries/mail';
import { useSearch } from '@/lib/queries/crm';
import { Button, Card, Badge, Skeleton, EmptyState, ErrorBanner, Pagination, Textarea, SearchInput, Modal, useToast, PageHeader, Avatar, Tabs } from '@/components/ui';
import { Menu, Tooltip, TimelineItem } from '@/components/ui/advanced';
import { AssigneeSelect, SnoozeModal, StatusBadge } from '@/components/mail/shared';
import { InboxRail, ConversationRow, LabelStrip, ReplyComposer, nameFromAddress } from '@/components/mail/inbox';
import { MessageBody } from '@/components/mail/message-body';
import { PresenceBanner } from '@/components/mail/presence';
import { fullName, relative, dateTime } from '@/lib/format';

export default function InboxPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <InboxView />
    </Suspense>
  );
}

function InboxView() {
  const mailboxes = useMailboxes(false);
  const [mailboxId, setMailboxId] = useState('');
  const [threadId, setThreadId] = useIdParam('thread');
  const [view, setView] = useState<View>('open');
  const [q, setQ] = useState('');
  const [labelId, setLabelId] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Conversation[][]>([]);
  const [focus, setFocus] = useState(-1);

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
  const reset = () => { setCursor(undefined); setPages([]); setFocus(-1); };
  const loadMore = () => { if (list.data?.nextCursor) { setPages((p) => [...p, list.data!.items]); setCursor(list.data.nextCursor); } };

  // j / k / Enter keyboard navigation when no field is focused
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === 'j') setFocus((f) => Math.min(rows.length - 1, f + 1));
      if (e.key === 'k') setFocus((f) => Math.max(0, f - 1));
      if (e.key === 'Enter' && focus >= 0 && rows[focus]) setThreadId(rows[focus]!.id);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [rows, focus, setThreadId]);

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
    <div className="-mx-[22px] -my-5 flex h-[calc(100vh-56px)] overflow-hidden">
      <InboxRail
        mailboxes={mailboxes.data}
        mailboxId={mailboxId}
        onMailbox={(v) => { setMailboxId(v); setThreadId(null); reset(); }}
        view={view}
        onView={(v) => { setView(v); reset(); }}
        counts={counts.data}
        labelId={labelId}
        onLabel={(id) => { setLabelId(id); reset(); }}
      />
      <section className="flex w-[360px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line p-2.5">
          <SearchInput value={q} onChange={(v) => { setQ(v); reset(); }} placeholder="Search subject or snippet…" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.isLoading && pages.length === 0 && (
            <div className="space-y-px">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex gap-3 border-b border-line-2 px-3 py-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-2.5 w-2/3" /></div>
                </div>
              ))}
            </div>
          )}
          {list.isError && <ErrorBanner message={(list.error as Error).message} onRetry={() => list.refetch()} />}
          {list.data && rows.length === 0 && <EmptyState icon={<Inbox size={24} />} title="Nothing here" body={view === 'unassigned' ? 'Every conversation has an owner.' : 'No conversations match this view.'} />}
          {rows.map((c, i) => (
            <ConversationRow key={c.id} c={c} mailboxAddress={mailbox?.address ?? ''} selected={threadId === c.id} focused={focus === i} onOpen={() => { setFocus(i); setThreadId(c.id); }} />
          ))}
          {rows.length > 0 && <Pagination count={rows.length} hasMore={Boolean(list.data?.nextCursor)} onMore={loadMore} loading={list.isFetching} />}
        </div>
      </section>
      <section className="flex min-w-0 flex-1 flex-col bg-bg">
        {!threadId && (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={<MailIcon size={32} strokeWidth={1.5} />} title="Select a conversation" body="Pick a conversation to read, add internal notes, assign it and reply." />
          </div>
        )}
        {threadId && mailbox && <ConversationPane key={threadId} mailbox={mailbox} threadId={threadId} listRow={rows.find((r) => r.id === threadId)} />}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Conversation pane
--------------------------------------------------------------------------- */

function ConversationPane({ mailbox, threadId, listRow }: { mailbox: Mailbox; threadId: string; listRow?: Conversation }) {
  const { me } = useAuth();
  const toast = useToast();
  const perms = mailbox.permissions ?? [];
  const can = (p: string) => perms.includes(p);
  const thread = useThread(mailbox.id, threadId);
  const comments = useComments(mailbox.id, threadId);
  const events = useThreadEvents(mailbox.id, threadId);
  const [tab, setTab] = useState<'conversation' | 'history'>('conversation');
  const [snooze, setSnooze] = useState(false);
  const [link, setLink] = useState(false);
  const [comment, setComment] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const base = `/mail/mailboxes/${mailbox.id}/threads/${threadId}`;
  const assign = useMailMutation((assigneeId: string | null) => http.post(`${base}/assign`, { assigneeId }));
  const status = useMailMutation((b: { status: string; snoozedUntil?: string }) => http.post(`${base}/status`, b));
  const addLabel = useMailMutation((labelId: string) => http.post(`${base}/labels/${labelId}`));
  const removeLabel = useMailMutation((labelId: string) => http.del(`${base}/labels/${labelId}`));
  const addComment = useMailMutation((body: string) => http.post(`${base}/comments`, { body }));
  const onErr = (e: unknown) => toast.push('error', (e as Error).message);
  const t = thread.data;
  const meta = listRow;
  const latestMessageId = useMemo(() => {
    const ms = t?.messages ?? [];
    return ms.length ? [...ms].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0]!.id : null;
  }, [t]);
  const isExpanded = (id: string) => expanded.has(id) || id === latestMessageId;
  const linked = Boolean(t?.contactId || t?.dealId || t?.leadId);

  // Merge messages and internal comments into one chronological stream (Missive style).
  const stream = useMemo(() => {
    const items: Array<{ kind: 'message'; at: string; m: NonNullable<typeof t>['messages'][number] } | { kind: 'comment'; at: string; c: NonNullable<typeof comments.data>[number] }> = [];
    for (const m of t?.messages ?? []) items.push({ kind: 'message', at: m.sentAt, m });
    for (const c of comments.data ?? []) items.push({ kind: 'comment', at: c.createdAt, c });
    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [t, comments.data]);

  return (
    <>
      <header className="shrink-0 border-b border-line bg-surface px-5 py-3.5">
        {thread.isLoading && <div className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>}
        {thread.isError && <ErrorBanner message={(thread.error as Error).message} onRetry={() => thread.refetch()} />}
        {t && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-ink">{t.subject || '(no subject)'}</h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
                  <span className="truncate">{(t.participants ?? []).join(', ')}</span>
                  <span>·</span>
                  <span>{t.messages.length} message{t.messages.length === 1 ? '' : 's'}</span>
                  {t.hasAttachments && <Paperclip size={12} />}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={t.status} snoozedUntil={t.snoozedUntil} />
                {can('triage') && (
                  <Menu
                    trigger={<span className="inline-flex rounded-md border border-line bg-surface p-1.5 text-ink-3 hover:text-ink"><MoreHorizontal size={15} /></span>}
                    items={[
                      ...(t.status === 'open'
                        ? [
                            { label: 'Close conversation', icon: <CheckCircle2 size={14} />, onSelect: () => status.mutate({ status: 'closed' }, { onError: onErr }) },
                            { label: 'Snooze…', icon: <Clock size={14} />, onSelect: () => setSnooze(true) },
                          ]
                        : [{ label: 'Reopen', icon: <RotateCcw size={14} />, onSelect: () => status.mutate({ status: 'open' }, { onError: onErr }) }]),
                      { separator: true, label: '' },
                      { label: linked ? 'Change CRM link…' : 'Link to CRM record…', icon: <Link2 size={14} />, onSelect: () => setLink(true) },
                    ]}
                  />
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {can('triage') ? (
                <div className="w-56"><AssigneeSelect mailbox={mailbox} value={t.assigneeId ?? ''} onChange={(v) => assign.mutate(v || null, { onError: onErr })} /></div>
              ) : (
                <Badge tone={t.assigneeId ? 'blue' : 'amber'}>{meta?.assignee ? fullName(meta.assignee) : 'Unassigned'}</Badge>
              )}
              {can('triage') && me && t.assigneeId !== me.id && (
                <Button size="sm" icon={<UserCheck size={13} />} onClick={() => assign.mutate(me.id, { onError: onErr })}>
                  Take
                </Button>
              )}
              {can('triage') && t.status === 'open' && (
                <Tooltip label="Close">
                  <Button size="sm" variant="ghost" icon={<CheckCircle2 size={13} />} onClick={() => status.mutate({ status: 'closed' }, { onError: onErr })}>Close</Button>
                </Tooltip>
              )}
              {linked && (
                <button type="button" onClick={() => can('triage') && setLink(true)} className="inline-flex items-center gap-1 rounded-full bg-blue-soft px-2 py-0.5 text-xs font-semibold text-blue-text">
                  <Link2 size={11} /> {t.contactId ? 'Contact' : t.dealId ? 'Deal' : 'Lead'} linked
                </button>
              )}
              <div className="ml-auto">
                <LabelStrip labels={meta?.labels ?? []} canEdit={can('triage')} onAdd={(id) => addLabel.mutate(id, { onError: onErr })} onRemove={(id) => removeLabel.mutate(id, { onError: onErr })} />
              </div>
            </div>
            <Tabs
              className="-mb-3.5 mt-3"
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'conversation', label: 'Conversation', count: t.messages.length + (comments.data?.length ?? 0) },
                { value: 'history', label: 'History', count: events.data?.length },
              ]}
            />
          </>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === 'conversation' && t && (
          <div className="mx-auto max-w-3xl space-y-3">
            <PresenceBanner mailboxId={mailbox.id} threadId={threadId} />
            {comments.isError && <ErrorBanner message={(comments.error as Error).message} onRetry={() => comments.refetch()} />}
            {stream.map((it) =>
              it.kind === 'message' ? (
                <article key={it.m.id} className={clsx('rounded-card border border-line bg-surface p-4 shadow-card', it.m.sentByEmployeeId && 'border-pri-soft bg-pri-soft/20')}>
                  <div className="flex items-center gap-3">
                    <Avatar name={nameFromAddress(it.m.fromAddr)} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-base font-semibold text-ink">{nameFromAddress(it.m.fromAddr)} <span className="font-normal text-ink-3">&lt;{it.m.fromAddr}&gt;</span></span>
                        <span className="shrink-0 font-mono text-xs text-ink-3" title={dateTime(it.m.sentAt)}>{relative(it.m.sentAt)}</span>
                      </div>
                      <div className="truncate text-xs text-ink-3">to {it.m.toAddrs.join(', ')}{it.m.ccAddrs.length ? ` · cc ${it.m.ccAddrs.join(', ')}` : ''}</div>
                    </div>
                  </div>
                  <MessageBody mailboxId={mailbox.id} message={it.m} expanded={isExpanded(it.m.id)} onExpand={() => setExpanded((s) => new Set(s).add(it.m.id))} canDownload={can('download')} />
                  {!isExpanded(it.m.id) && it.m.hasAttachments && <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-ink-2"><Paperclip size={12} /> Has attachments</div>}
                </article>
              ) : (
                <article key={it.c.id} className="rounded-card border-l-[3px] border-amber bg-amber-soft/50 p-3.5">
                  <div className="flex items-center gap-2">
                    <Avatar name={fullName(it.c.author)} size={24} />
                    <span className="text-sm font-semibold text-ink">{fullName(it.c.author)}</span>
                    <span className="rounded-full bg-amber-soft px-1.5 text-2xs font-semibold uppercase text-amber-text">Internal note</span>
                    <span className="ml-auto font-mono text-xs text-ink-3">{relative(it.c.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 whitespace-pre-wrap text-base text-ink">{it.c.body}</div>
                </article>
              ),
            )}
            {stream.length === 0 && !comments.isLoading && <EmptyState icon={<MessageSquare size={22} />} title="No messages yet" />}
            {can('comment') && (
              <div className="rounded-card border border-dashed border-amber/60 bg-amber-soft/30 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-text"><MessageSquare size={12} /> Internal note — visible to the team only, never sent</div>
                <div className="flex gap-2">
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add context for a colleague, @mention to notify…" rows={2} className="flex-1 bg-surface" />
                  <Button variant="primary" disabled={!comment.trim()} loading={addComment.isPending} onClick={() => addComment.mutate(comment, { onSuccess: () => setComment(''), onError: onErr })}>
                    Note
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {tab === 'history' && (
          <div className="mx-auto max-w-3xl">
            {events.isLoading && <Skeleton className="h-16" />}
            {events.isError && <ErrorBanner message={(events.error as Error).message} onRetry={() => events.refetch()} />}
            {events.data?.length === 0 && <EmptyState icon={<History size={22} />} title="No events yet" />}
            <ul>
              {events.data?.map((e) => (
                <TimelineItem key={e.id} icon={eventIcon(e.type)} tone={eventTone(e.type)} title={e.type.replace(/_/g, ' ')} meta={dateTime(e.occurredAt)}>
                  {summariseEvent(e.type, e.data)}
                </TimelineItem>
              ))}
            </ul>
          </div>
        )}
      </div>

      {t && <ReplyComposer mailbox={mailbox} thread={t} canSend={can('reply') || can('send')} onSent={() => thread.refetch()} />}
      <SnoozeModal open={snooze} onClose={() => setSnooze(false)} busy={status.isPending} onConfirm={(iso) => status.mutate({ status: 'snoozed', snoozedUntil: iso }, { onSuccess: () => setSnooze(false), onError: onErr })} />
      {link && <LinkModal base={base} onClose={() => setLink(false)} />}
    </>
  );
}

function eventIcon(type: string) {
  if (type.startsWith('label')) return <TagIcon size={13} />;
  if (type === 'status_changed') return <CheckCircle2 size={13} />;
  if (type === 'linked') return <Link2 size={13} />;
  if (type === 'comment') return <MessageSquare size={13} />;
  return <UserCheck size={13} />;
}
function eventTone(type: string): 'green' | 'amber' | 'blue' | 'violet' | 'gray' {
  if (type === 'assigned') return 'blue';
  if (type === 'status_changed') return 'green';
  if (type === 'linked') return 'violet';
  if (type === 'comment') return 'amber';
  return 'gray';
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
  const empty = q && search.data && !search.data.contacts.length && !search.data.deals.length && !search.data.leads.length;
  return (
    <Modal open onClose={onClose} title="Link to CRM record" footer={<><Button variant="ghost" onClick={() => pick({ contactId: null, dealId: null, leadId: null })}>Unlink all</Button><Button onClick={onClose}>Close</Button></>}>
      <SearchInput value={q} onChange={setQ} placeholder="Search contacts, deals, leads…" />
      <div className="mt-3 max-h-72 space-y-1 overflow-y-auto text-base">
        {search.data?.contacts.map((c) => <button key={c.id} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => pick({ contactId: c.id })}><Badge tone="blue">Contact</Badge><span>{fullName(c)}{c.account ? <span className="text-ink-3"> · {c.account.name}</span> : ''}</span></button>)}
        {search.data?.deals.map((d) => <button key={d.id} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => pick({ dealId: d.id })}><Badge tone="violet">Deal</Badge><span>{d.name}</span></button>)}
        {search.data?.leads.map((l) => <button key={l.id} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => pick({ leadId: l.id })}><Badge tone="green">Lead</Badge><span>{l.name}</span></button>)}
        {empty && <div className="p-2 text-ink-3">No matches</div>}
        {!q && <div className="p-2 text-xs text-ink-3">Type to search. Conversations link automatically when a participant matches a contact email.</div>}
      </div>
    </Modal>
  );
}
