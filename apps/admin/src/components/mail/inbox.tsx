'use client';

import { useEffect, useState } from 'react';
import { Paperclip, MessageSquare, Send, FileText, ChevronDown, ChevronUp, Inbox, UserCircle2, Clock, CheckCircle2, Tag as TagIcon, X } from 'lucide-react';
import { clsx } from 'clsx';
import { http } from '@/lib/api';
import { useMailTemplates, useMailMutation, useMailLabels, type Conversation, type Mailbox, type MailLabel, type View, type Counts } from '@/lib/queries/mail';
import { Avatar, Badge, Button, Input, Textarea, useToast, Skeleton } from '@/components/ui';
import { Menu, Tooltip, Kbd } from '@/components/ui/advanced';
import { fullName, relative } from '@/lib/format';
import { MailboxSelect, StatusBadge } from './shared';

/* ---------------------------------------------------------------------------
   Left rail: mailbox selector, views with counts, labels
--------------------------------------------------------------------------- */

export const VIEWS: Array<{ value: View; label: string; icon: typeof Inbox }> = [
  { value: 'unassigned', label: 'Unassigned', icon: Inbox },
  { value: 'mine', label: 'Mine', icon: UserCircle2 },
  { value: 'open', label: 'All open', icon: Inbox },
  { value: 'snoozed', label: 'Snoozed', icon: Clock },
  { value: 'closed', label: 'Closed', icon: CheckCircle2 },
];

export function InboxRail({ mailboxes, mailboxId, onMailbox, view, onView, counts, labelId, onLabel }: { mailboxes: Mailbox[]; mailboxId: string; onMailbox: (id: string) => void; view: View; onView: (v: View) => void; counts?: Counts; labelId: string; onLabel: (id: string) => void }) {
  const labels = useMailLabels();
  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-line bg-surface-2/60">
      <div className="border-b border-line p-3">
        <MailboxSelect value={mailboxId} onChange={onMailbox} mailboxes={mailboxes} />
      </div>
      <nav className="p-2" aria-label="Inbox views">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const n = counts ? counts[v.value] : undefined;
          const active = view === v.value;
          return (
            <button key={v.value} type="button" onClick={() => onView(v.value)} className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-base font-medium transition-colors', active ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
              <Icon size={15} className={active ? 'text-pri' : 'text-ink-3'} />
              <span className="flex-1 text-left">{v.label}</span>
              {n !== undefined && <span className={clsx('rounded-full px-1.5 font-mono text-xs', active ? 'bg-surface text-pri-2' : 'bg-gray-soft text-ink-2', v.value === 'unassigned' && n > 0 && !active && 'bg-amber-soft text-amber-text')}>{n}</span>}
            </button>
          );
        })}
      </nav>
      <div className="mt-2 flex-1 overflow-y-auto border-t border-line-2 p-2">
        <div className="flex items-center justify-between px-2.5 pb-1 pt-1 text-2xs font-semibold uppercase text-ink-3">
          <span>Labels</span>
          {labelId && (
            <button type="button" onClick={() => onLabel('')} className="normal-case tracking-normal text-pri hover:underline">
              clear
            </button>
          )}
        </div>
        {labels.isLoading && <div className="space-y-1.5 px-2.5"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>}
        {labels.data?.map((l) => (
          <button key={l.id} type="button" onClick={() => onLabel(labelId === l.id ? '' : l.id)} className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[5px] text-sm transition-colors', labelId === l.id ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.colour }} />
            <span className="flex-1 truncate text-left">{l.name}</span>
            {l.usageCount !== undefined && <span className="font-mono text-2xs normal-case tracking-normal text-ink-3">{l.usageCount}</span>}
          </button>
        ))}
        {labels.data?.length === 0 && <div className="px-2.5 text-xs text-ink-3">No labels yet</div>}
      </div>
      <div className="border-t border-line-2 px-3 py-2 text-2xs normal-case tracking-normal text-ink-3">
        <Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>↵</Kbd> open
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------------------
   Conversation list row
--------------------------------------------------------------------------- */

function senderOf(c: Conversation, mailboxAddress: string): string {
  const other = (c.participants ?? []).find((p) => p.toLowerCase() !== mailboxAddress.toLowerCase());
  return other ?? c.participants?.[0] ?? mailboxAddress;
}

export function nameFromAddress(addr: string): string {
  const local = addr.split('@')[0] ?? addr;
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function ConversationRow({ c, mailboxAddress, selected, focused, onOpen }: { c: Conversation; mailboxAddress: string; selected: boolean; focused: boolean; onOpen: () => void }) {
  const sender = senderOf(c, mailboxAddress);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'true' : undefined}
      className={clsx('group relative flex w-full gap-3 border-b border-line-2 px-3 py-2.5 text-left transition-colors', selected ? 'bg-pri-soft/70' : focused ? 'bg-surface-2' : 'hover:bg-surface-2')}
    >
      {c.unread && <span className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-pri" aria-label="Unread" />}
      <Avatar name={nameFromAddress(sender)} size={32} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={clsx('truncate text-base', c.unread ? 'font-semibold text-ink' : 'font-medium text-ink-2')}>{nameFromAddress(sender)}</span>
          <span className="shrink-0 font-mono text-2xs normal-case tracking-normal text-ink-3">{relative(c.lastMessageAt)}</span>
        </div>
        <div className={clsx('truncate text-sm', c.unread ? 'font-semibold text-ink' : 'text-ink-2')}>{c.subject || '(no subject)'}</div>
        <div className="truncate text-xs text-ink-3">{c.snippet ?? ''}</div>
        <div className="mt-1.5 flex items-center gap-1.5">
          {c.assignee ? (
            <Tooltip label={fullName(c.assignee)}>
              <Avatar name={fullName(c.assignee)} size={18} />
            </Tooltip>
          ) : (
            <Badge tone="amber">Unassigned</Badge>
          )}
          {c.status !== 'open' && <StatusBadge status={c.status} />}
          {c.hasAttachments && <Paperclip size={12} className="text-ink-3" />}
          {(c._count?.comments ?? 0) > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-ink-3">
              <MessageSquare size={11} />
              {c._count!.comments}
            </span>
          )}
          <span className="ml-auto flex max-w-[55%] gap-1 overflow-hidden">
            {c.labels.slice(0, 3).map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1 truncate rounded-full px-1.5 py-px text-2xs normal-case tracking-normal font-semibold" style={{ background: `${l.colour}22`, color: l.colour }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.colour }} />
                {l.name}
              </span>
            ))}
            {c.labels.length > 3 && <span className="text-2xs normal-case tracking-normal text-ink-3">+{c.labels.length - 3}</span>}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Label chip strip with inline picker
--------------------------------------------------------------------------- */

export function LabelStrip({ labels, canEdit, onAdd, onRemove }: { labels: MailLabel[]; canEdit: boolean; onAdd: (id: string) => void; onRemove: (id: string) => void }) {
  const all = useMailLabels();
  const available = (all.data ?? []).filter((l) => !labels.some((x) => x.id === l.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {labels.map((l) => (
        <span key={l.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${l.colour}22`, color: l.colour }}>
          <TagIcon size={10} /> {l.name}
          {canEdit && (
            <button type="button" aria-label={`Remove ${l.name}`} onClick={() => onRemove(l.id)} className="ml-0.5 opacity-70 hover:opacity-100">
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {canEdit && available.length > 0 && (
        <Menu
          align="left"
          trigger={<span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 text-xs font-medium text-ink-3 hover:border-ink-3 hover:text-ink"><TagIcon size={10} /> Label</span>}
          items={available.map((l) => ({ label: l.name, icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.colour }} />, onSelect: () => onAdd(l.id) }))}
        />
      )}
      {labels.length === 0 && !canEdit && <span className="text-xs text-ink-3">No labels</span>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Reply composer docked at the bottom of the conversation pane
--------------------------------------------------------------------------- */

export function ReplyComposer({ mailbox, thread, canSend, onSent }: { mailbox: Mailbox; thread: { id: string; gmailThreadId: string; subject: string; participants: string[]; contactId: string | null }; canSend: boolean; onSent: () => void }) {
  const toast = useToast();
  const templates = useMailTemplates();
  const others = (thread.participants ?? []).filter((p) => p.toLowerCase() !== mailbox.address.toLowerCase());
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(others.join(', '));
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`);
  const [html, setHtml] = useState('');
  const send = useMailMutation((b: unknown) => http.post(`/mail/mailboxes/${mailbox.id}/send`, b));

  useEffect(() => {
    setTo(others.join(', '));
    setSubject(thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`);
    setHtml('');
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  const insertTemplate = async (id: string) => {
    try {
      const r = await http.post<{ subject: string; html: string }>(`/mail/templates/${id}/render`, { threadId: thread.id, contactId: thread.contactId ?? undefined });
      setHtml((h) => (h ? `${h}\n${r.html}` : r.html));
      if (r.subject && !subject) setSubject(r.subject);
      setOpen(true);
    } catch (e) {
      toast.push('error', (e as Error).message);
    }
  };
  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const submit = () =>
    send.mutate(
      { to: split(to), cc: showCc && cc ? split(cc) : undefined, bcc: showCc && bcc ? split(bcc) : undefined, subject, html, replyToThreadId: thread.gmailThreadId },
      { onSuccess: () => { toast.push('success', 'Sent'); setHtml(''); setOpen(false); onSent(); }, onError: (e) => toast.push('error', (e as Error).message) },
    );

  if (!canSend) return null;

  return (
    <div className="shrink-0 border-t border-line bg-surface">
      {!open ? (
        <div className="flex items-center gap-2 px-4 py-3">
          <Avatar name={mailbox.displayName} size={28} />
          <button type="button" onClick={() => setOpen(true)} className="h-9 flex-1 rounded-lg border border-line bg-surface-2 px-3 text-left text-base text-ink-3 hover:border-ink-3">
            Reply to {others[0] ? nameFromAddress(others[0]) : 'conversation'}…
          </button>
          {templates.data && templates.data.length > 0 && (
            <Menu
              trigger={<span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink-2 hover:text-ink"><FileText size={13} /> Template <ChevronDown size={12} /></span>}
              items={templates.data.map((t) => ({ label: t.name, icon: <FileText size={13} />, onSelect: () => void insertTemplate(t.id), shortcut: t.ownerId ? undefined : 'shared' }))}
            />
          )}
        </div>
      ) : (
        <div className="slide-in-right space-y-2 p-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-10 text-ink-3">To</span>
            <Input value={to} onChange={(e) => setTo(e.target.value)} className="h-8" />
            <button type="button" onClick={() => setShowCc((v) => !v)} className="shrink-0 text-xs font-medium text-ink-3 hover:text-ink">
              Cc/Bcc
            </button>
          </div>
          {showCc && (
            <>
              <div className="flex items-center gap-2 text-sm"><span className="w-10 text-ink-3">Cc</span><Input value={cc} onChange={(e) => setCc(e.target.value)} className="h-8" /></div>
              <div className="flex items-center gap-2 text-sm"><span className="w-10 text-ink-3">Bcc</span><Input value={bcc} onChange={(e) => setBcc(e.target.value)} className="h-8" /></div>
            </>
          )}
          <div className="flex items-center gap-2 text-sm"><span className="w-10 text-ink-3">Subject</span><Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8" /></div>
          <Textarea rows={6} value={html} onChange={(e) => setHtml(e.target.value)} placeholder="Write your reply (HTML allowed)…" autoFocus />
          <div className="flex items-center gap-2">
            <Button variant="primary" icon={<Send size={13} />} loading={send.isPending} disabled={!to.trim() || !html.trim()} onClick={submit}>
              Send
            </Button>
            {templates.data && templates.data.length > 0 && (
              <Menu
                align="left"
                trigger={<span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-sm font-medium text-ink-2 hover:text-ink"><FileText size={13} /> Insert template</span>}
                items={templates.data.map((t) => ({ label: t.name, onSelect: () => void insertTemplate(t.id) }))}
              />
            )}
            <span className="ml-auto text-xs text-ink-3">Sent as {mailbox.address} · logged in the mail audit</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-ink-3 hover:bg-surface-2" aria-label="Collapse composer">
              <ChevronUp size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
