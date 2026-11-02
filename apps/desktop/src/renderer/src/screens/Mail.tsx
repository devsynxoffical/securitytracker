import { useEffect, useState } from 'react';
import { Inbox, Send, Reply, Mail as MailIcon, UserCheck, Archive, PenSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { http, errorMessage } from '../lib/bridge';
import { useQuery } from '../lib/useQuery';
import { relative, dateTime, initials } from '../lib/format';
import type { Conversation, Mailbox, Page, ThreadDetail } from '../lib/types';
import { Badge, Button, Card, Empty, ErrorBanner, SkeletonRows, Select, Textarea, Input, Field, Tabs, Modal, PageHeader } from '../components/ui';

type View = 'mine' | 'unassigned' | 'open';

/** F14 + 17: mailboxes assigned to me, my conversations, read, reply and compose. */
export function MailScreen({ online, meId }: { online: boolean; meId: string }) {
  const mailboxes = useQuery(() => http.get<Mailbox[] | { items: Mailbox[] }>('/mail/mailboxes'), []);
  const list = Array.isArray(mailboxes.data) ? mailboxes.data : mailboxes.data?.items ?? [];
  const [mailboxId, setMailboxId] = useState<string>('');
  const [view, setView] = useState<View>('mine');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);
  useEffect(() => {
    if (!mailboxId && list[0]) setMailboxId(list[0].id);
  }, [list, mailboxId]);
  const mailbox = list.find((m) => m.id === mailboxId);
  const perms = mailbox?.permissions ?? [];
  const canSend = perms.length === 0 || perms.includes('send');
  const canReply = perms.length === 0 || perms.includes('reply');
  const canTriage = perms.includes('triage');

  const conversations = useQuery(() => http.get<Page<Conversation>>(`/mail/mailboxes/${mailboxId}/conversations?view=${view}&limit=50`), [mailboxId, view], { enabled: Boolean(mailboxId), intervalMs: 45_000 });
  const counts = useQuery(() => http.get<Record<string, number>>(`/mail/mailboxes/${mailboxId}/conversations/counts`), [mailboxId], { enabled: Boolean(mailboxId), intervalMs: 45_000 });

  const header = <PageHeader title="Mail" subtitle="Shared mailboxes assigned to you. Replies are sent through the company account." />;

  if (mailboxes.loading)
    return (
      <div>
        {header}
        <Card><SkeletonRows /></Card>
      </div>
    );
  if (mailboxes.error)
    return (
      <div>
        {header}
        <Card><ErrorBanner message={errorMessage(mailboxes.error)} onRetry={mailboxes.refetch} /></Card>
      </div>
    );
  if (list.length === 0)
    return (
      <div>
        {header}
        <Card>
          <Empty icon={<MailIcon size={22} />} title="No mailbox assigned" body="An administrator assigns shared mailboxes to you under Mail → Mailboxes." />
        </Card>
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Mail"
        subtitle={mailbox ? <span className="font-mono text-xs">{mailbox.address}</span> : undefined}
        actions={
          <>
            <Select value={mailboxId} className="h-[34px] w-56 text-xs" aria-label="Mailbox" onChange={(e) => { setMailboxId(e.target.value); setThreadId(null); }}>
              {list.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName || m.address}
                </option>
              ))}
            </Select>
            <Button variant="primary" disabled={!online || !canSend} icon={<PenSquare size={14} />} onClick={() => setCompose(true)} title={canSend ? 'New email' : 'No send permission'}>
              Compose
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 gap-3.5">
        <div className="flex w-[380px] shrink-0 flex-col">
          <Card padded={false} className="flex min-h-0 flex-1 flex-col">
            <div className="px-4 pt-2">
              <Tabs value={view} onChange={setView} tabs={[{ value: 'mine', label: 'Mine', count: counts.data?.mine }, { value: 'unassigned', label: 'Unassigned', count: counts.data?.unassigned }, { value: 'open', label: 'All open', count: counts.data?.open }]} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {conversations.loading ? (
                <div className="p-4"><SkeletonRows rows={8} /></div>
              ) : conversations.error ? (
                <div className="p-4"><ErrorBanner message={errorMessage(conversations.error)} onRetry={conversations.refetch} /></div>
              ) : !conversations.data?.items.length ? (
                <Empty icon={<Inbox size={22} />} title={view === 'mine' ? 'Nothing assigned to you' : 'Inbox zero'} body={view === 'mine' ? 'Conversations a colleague assigns to you appear here.' : 'Every open conversation has been handled.'} />
              ) : (
                <ul className="divide-y divide-line-2">
                  {conversations.data.items.map((c) => {
                    const from = Array.isArray(c.participants) ? (c.participants[0] as { name?: string; email: string } | undefined) : undefined;
                    const who = from?.name || from?.email || c.subject || '?';
                    return (
                      <li key={c.id}>
                        <button type="button" onClick={() => setThreadId(c.id)} className={clsx('relative flex w-full gap-3 px-4 py-3 text-left transition hover:bg-surface-2', threadId === c.id && 'bg-pri-soft/50')}>
                          {threadId === c.id && <span className="absolute inset-y-0 left-0 w-0.5 bg-pri" />}
                          <span className={clsx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', c.unread ? 'bg-pri-soft text-pri-2' : 'bg-gray-soft text-ink-2')}>{initials(who) || '?'}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className={clsx('truncate text-base', c.unread ? 'font-semibold text-ink' : 'text-ink-2')}>{c.subject || '(no subject)'}</span>
                              <span className="shrink-0 text-2xs normal-case tracking-normal text-ink-3">{relative(c.lastMessageAt)}</span>
                            </span>
                            <span className="block truncate text-xs text-ink-3">{c.snippet ?? ''}</span>
                            {(c.status !== 'open' || (c.labels ?? []).length > 0) && (
                              <span className="mt-1.5 flex flex-wrap gap-1">
                                {c.status !== 'open' && <Badge tone={c.status === 'closed' ? 'gray' : 'amber'}>{c.status}</Badge>}
                                {(c.labels ?? []).map((l) => (
                                  <span key={l.label.id} className="rounded-full px-1.5 text-2xs font-semibold normal-case tracking-normal" style={{ background: `${l.label.colour}22`, color: l.label.colour }}>
                                    {l.label.name}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>
        <Card padded={false} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!threadId ? (
            <div className="flex flex-1 items-center justify-center">
              <Empty icon={<MailIcon size={22} />} title="Select a conversation" body="Pick a thread on the left to read and reply." />
            </div>
          ) : (
            <ThreadPane mailboxId={mailboxId} threadId={threadId} online={online} canReply={canReply} canTriage={canTriage} meId={meId} onChanged={() => { void conversations.refetch(); void counts.refetch(); }} />
          )}
        </Card>
      </div>
      {compose && <ComposeModal mailboxId={mailboxId} onClose={() => setCompose(false)} onSent={() => { setCompose(false); void conversations.refetch(); }} />}
    </div>
  );
}

function ThreadPane({ mailboxId, threadId, online, canReply, canTriage, meId, onChanged }: { mailboxId: string; threadId: string; online: boolean; canReply: boolean; canTriage: boolean; meId: string; onChanged: () => void }) {
  const thread = useQuery(() => http.get<ThreadDetail & { assigneeId?: string | null; status?: string }>(`/mail/mailboxes/${mailboxId}/threads/${threadId}`), [mailboxId, threadId]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void http.post(`/mail/mailboxes/${mailboxId}/threads/${threadId}/read`).catch(() => undefined);
  }, [mailboxId, threadId]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await thread.refetch();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (thread.loading) return <div className="p-4"><SkeletonRows rows={6} /></div>;
  if (thread.error || !thread.data) return <div className="p-4"><ErrorBanner message={errorMessage(thread.error)} onRetry={thread.refetch} /></div>;
  const t = thread.data;
  const last = t.messages[t.messages.length - 1];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="truncate text-md font-semibold text-ink">{t.subject || '(no subject)'}</h2>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
            <span>{t.messages.length} message{t.messages.length === 1 ? '' : 's'}</span>
            {t.status && <Badge tone={t.status === 'closed' ? 'gray' : t.status === 'open' ? 'blue' : 'amber'}>{t.status}</Badge>}
            {t.assigneeId === meId && <Badge tone="primary">Assigned to you</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {canTriage && t.assigneeId !== meId && (
            <Button size="sm" disabled={!online || busy} icon={<UserCheck size={13} />} onClick={() => act(() => http.post(`/mail/mailboxes/${mailboxId}/threads/${threadId}/assign`, { assigneeId: meId }))}>
              Take
            </Button>
          )}
          {canTriage && t.status !== 'closed' && (
            <Button size="sm" disabled={!online || busy} icon={<Archive size={13} />} onClick={() => act(() => http.post(`/mail/mailboxes/${mailboxId}/threads/${threadId}/status`, { status: 'closed' }))}>
              Close
            </Button>
          )}
        </div>
      </header>
      {error && <ErrorBanner message={error} className="mx-5 mt-3" />}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {t.messages.map((m) => (
          <article key={m.id} className="rounded-card border border-line-2 bg-surface-2/40 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-soft text-xs font-semibold text-ink-2">{initials(m.fromAddr.split('@')[0]?.replace(/[._-]/g, ' ') ?? '') || '?'}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{m.fromAddr}</span>
                  <span className="shrink-0 font-mono text-2xs tracking-normal text-ink-3">{dateTime(m.sentAt)}</span>
                </div>
                <div className="truncate text-xs text-ink-3">to {m.toAddrs.join(', ')}</div>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{m.snippet ?? ''}</p>
          </article>
        ))}
      </div>
      <div className="border-t border-line bg-surface-2/40 px-5 py-3.5">
        <Textarea placeholder={canReply ? 'Write a reply…' : 'You do not have reply permission on this mailbox'} value={reply} disabled={!canReply || !online} onChange={(e) => setReply(e.target.value)} className="min-h-[72px]" />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-ink-3">{last ? `Replying to ${last.fromAddr}` : ''}</span>
          <Button variant="primary" size="sm" disabled={!canReply || !online || busy || !reply.trim() || !last} loading={busy} icon={<Reply size={13} />} onClick={() => act(async () => { await http.post(`/mail/mailboxes/${mailboxId}/send`, { to: [last!.fromAddr], subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`, html: `<p>${reply.replace(/\n/g, '<br/>')}</p>`, replyToThreadId: threadId, replyToMessageId: last!.gmailMessageId }); setReply(''); })}>
            Send reply
          </Button>
        </div>
      </div>
    </div>
  );
}

function ComposeModal({ mailboxId, onClose, onSent }: { mailboxId: string; onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await http.post(`/mail/mailboxes/${mailboxId}/send`, { to: to.split(/[,;\s]+/).filter(Boolean), subject, html: `<p>${body.replace(/\n/g, '<br/>')}</p>` });
      onSent();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="New email" width={560} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !to || !subject || !body} loading={busy} icon={<Send size={13} />} onClick={send}>Send</Button></>}>
      {error && <ErrorBanner message={error} className="mb-3" />}
      <div className="space-y-3">
        <Field label="To"><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, other@example.com" /></Field>
        <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message"><Textarea className="min-h-[180px]" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
