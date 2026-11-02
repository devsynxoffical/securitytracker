import { useEffect, useState } from 'react';
import { Inbox, Send, Reply, Mail as MailIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { http, errorMessage } from '../lib/bridge';
import { useQuery } from '../lib/useQuery';
import { relative, dateTime } from '../lib/format';
import type { Conversation, Mailbox, Page, ThreadDetail } from '../lib/types';
import { Badge, Button, Card, Empty, ErrorBanner, SkeletonRows, Select, Textarea, Input, Field, Tabs, Modal } from '../components/ui';

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

  if (mailboxes.loading) return <Card><SkeletonRows /></Card>;
  if (mailboxes.error) return <Card><ErrorBanner message={errorMessage(mailboxes.error)} onRetry={mailboxes.refetch} /></Card>;
  if (list.length === 0) return <Card><Empty icon={<MailIcon size={28} />} title="No mailbox assigned" body="An administrator assigns shared mailboxes to you under Mail → Mailboxes." /></Card>;

  return (
    <div className="flex h-full gap-3.5">
      <div className="flex w-[380px] shrink-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Select value={mailboxId} onChange={(e) => { setMailboxId(e.target.value); setThreadId(null); }}>
            {list.map((m) => (
              <option key={m.id} value={m.id}>{m.displayName || m.address}</option>
            ))}
          </Select>
          <Button variant="primary" disabled={!online || !canSend} onClick={() => setCompose(true)} title={canSend ? 'New email' : 'No send permission'}>
            <Send size={14} />
          </Button>
        </div>
        <Tabs value={view} onChange={setView} tabs={[{ value: 'mine', label: 'Mine', count: counts.data?.mine }, { value: 'unassigned', label: 'Unassigned', count: counts.data?.unassigned }, { value: 'open', label: 'All open', count: counts.data?.open }]} />
        <Card className="flex-1 overflow-y-auto p-0">
          {conversations.loading ? (
            <div className="p-3"><SkeletonRows rows={8} /></div>
          ) : conversations.error ? (
            <div className="p-3"><ErrorBanner message={errorMessage(conversations.error)} onRetry={conversations.refetch} /></div>
          ) : !conversations.data?.items.length ? (
            <Empty icon={<Inbox size={26} />} title={view === 'mine' ? 'Nothing assigned to you' : 'Inbox zero'} />
          ) : (
            <ul className="divide-y divide-line-2">
              {conversations.data.items.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setThreadId(c.id)} className={clsx('w-full px-3 py-2.5 text-left hover:bg-surface-2', threadId === c.id && 'bg-pri-soft')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={clsx('truncate text-[13px]', c.unread ? 'font-semibold text-ink' : 'text-ink-2')}>{c.subject || '(no subject)'}</span>
                      <span className="shrink-0 text-[11px] text-ink-3">{relative(c.lastMessageAt)}</span>
                    </div>
                    <div className="truncate text-[12px] text-ink-3">{c.snippet ?? ''}</div>
                    <div className="mt-1 flex gap-1">
                      {c.status !== 'open' && <Badge tone={c.status === 'closed' ? 'gray' : 'amber'}>{c.status}</Badge>}
                      {(c.labels ?? []).map((l) => (
                        <span key={l.label.id} className="rounded-full px-1.5 text-[10.5px] font-semibold" style={{ background: `${l.label.colour}22`, color: l.label.colour }}>{l.label.name}</span>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card className="flex-1 overflow-y-auto">
        {!threadId ? (
          <Empty icon={<MailIcon size={28} />} title="Select a conversation" />
        ) : (
          <ThreadPane mailboxId={mailboxId} threadId={threadId} online={online} canReply={canReply} canTriage={canTriage} meId={meId} onChanged={() => { void conversations.refetch(); void counts.refetch(); }} />
        )}
      </Card>
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

  if (thread.loading) return <SkeletonRows rows={6} />;
  if (thread.error || !thread.data) return <ErrorBanner message={errorMessage(thread.error)} onRetry={thread.refetch} />;
  const t = thread.data;
  const last = t.messages[t.messages.length - 1];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-start justify-between gap-2 border-b border-line pb-3">
        <h2 className="text-[15px] font-semibold text-ink">{t.subject || '(no subject)'}</h2>
        <div className="flex gap-1.5">
          {canTriage && t.assigneeId !== meId && (
            <Button size="sm" disabled={!online || busy} onClick={() => act(() => http.post(`/mail/mailboxes/${mailboxId}/threads/${threadId}/assign`, { assigneeId: meId }))}>Take</Button>
          )}
          {canTriage && t.status !== 'closed' && (
            <Button size="sm" disabled={!online || busy} onClick={() => act(() => http.post(`/mail/mailboxes/${mailboxId}/threads/${threadId}/status`, { status: 'closed' }))}>Close</Button>
          )}
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {t.messages.map((m) => (
          <div key={m.id} className="rounded-lg border border-line-2 p-3">
            <div className="flex justify-between text-[11.5px] text-ink-3">
              <span className="font-medium text-ink-2">{m.fromAddr}</span>
              <span className="font-mono">{dateTime(m.sentAt)}</span>
            </div>
            <div className="text-[11px] text-ink-3">to {m.toAddrs.join(', ')}</div>
            <p className="mt-2 whitespace-pre-line text-[12.5px] text-ink">{m.snippet ?? ''}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <Textarea placeholder={canReply ? 'Reply…' : 'You do not have reply permission on this mailbox'} value={reply} disabled={!canReply || !online} onChange={(e) => setReply(e.target.value)} />
        <div className="mt-2 flex justify-end">
          <Button variant="primary" size="sm" disabled={!canReply || !online || busy || !reply.trim() || !last} onClick={() => act(async () => { await http.post(`/mail/mailboxes/${mailboxId}/send`, { to: [last!.fromAddr], subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`, html: `<p>${reply.replace(/\n/g, '<br/>')}</p>`, replyToThreadId: threadId, replyToMessageId: last!.gmailMessageId }); setReply(''); })}>
            <Reply size={13} /> Send reply
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
    <Modal open onClose={onClose} title="New email" width={560} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !to || !subject || !body} onClick={send}><Send size={13} /> Send</Button></>}>
      {error && <ErrorBanner message={error} />}
      <div className="space-y-2">
        <Field label="To"><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, other@example.com" /></Field>
        <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message"><Textarea className="min-h-[180px]" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
