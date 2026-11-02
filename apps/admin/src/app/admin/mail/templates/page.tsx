'use client';

import { confirmDialog, ConfirmHost } from '@/components/platform/confirm';

import { useRef, useState } from 'react';
import { FileText, Plus, Pencil, Trash2, Users, Lock } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMailTemplates, useMailMutation, type MailTemplate } from '@/lib/queries/mail';
import { Button, Card, Badge, Skeleton, EmptyState, ErrorBanner, Modal, Field, Input, useToast, PageHeader } from '@/components/ui';
import { Menu, Toggle } from '@/components/ui/advanced';

const PLACEHOLDERS: Array<{ token: string; label: string }> = [
  { token: '{{contact.firstName}}', label: 'Contact first name' },
  { token: '{{contact.lastName}}', label: 'Contact last name' },
  { token: '{{account.name}}', label: 'Account name' },
  { token: '{{me.firstName}}', label: 'My first name' },
  { token: '{{me.lastName}}', label: 'My last name' },
];

function TemplatesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const q = useMailTemplates();
  const [editing, setEditing] = useState<MailTemplate | null | 'new'>(null);
  const del = useMailMutation((id: string) => http.del(`/mail/templates/${id}`));
  const shared = (q.data ?? []).filter((t) => !t.ownerId);
  const mine = (q.data ?? []).filter((t) => t.ownerId);

  const grid = (items: MailTemplate[]) => (
    <div className="grid grid-cols-3 gap-3.5">
      {items.map((t) => (
        <div key={t.id} className="hover-reveal group flex flex-col rounded-card border border-line bg-surface p-4 shadow-card transition hover:border-pri">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pri-soft text-pri"><FileText size={15} /></span>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-ink">{t.name}</div>
                <div className="truncate text-xs text-ink-3">{t.subject || 'Keeps the conversation subject'}</div>
              </div>
            </div>
            <Menu
              items={[
                { label: 'Edit', icon: <Pencil size={14} />, onSelect: () => setEditing(t) },
                ...(t.ownerId || can('mail.templates.manage') ? [{ label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => void confirmDialog({ title: 'Delete this template?', danger: true }).then((ok) => ok && del.mutate(t.id, { onError: (e) => toast.push('error', (e as Error).message) }) )}] : []),
              ]}
            />
          </div>
          <div className="mt-3 line-clamp-4 flex-1 text-sm text-ink-2" dangerouslySetInnerHTML={{ __html: t.bodyHtml.replace(/<[^>]+>/g, ' ').slice(0, 320) }} />
          <div className="mt-3 flex items-center justify-between">
            <Badge tone={t.ownerId ? 'gray' : 'violet'}>{t.ownerId ? <><Lock size={10} className="mr-1 inline" />Private</> : <><Users size={10} className="mr-1 inline" />Shared</>}</Badge>
            <Button size="sm" variant="ghost" className="row-actions" icon={<Pencil size={12} />} onClick={() => setEditing(t)}>Edit</Button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader title="Templates" subtitle="Canned responses with placeholders that fill from the linked contact and your profile." actions={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New template</Button>} />
      {q.isLoading && <div className="grid grid-cols-3 gap-3.5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}</div>}
      {q.isError && <Card><ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} /></Card>}
      {q.data?.length === 0 && (
        <Card><EmptyState icon={<FileText size={28} />} title="No templates yet" body="Create a shared template for the team or a private one for yourself." action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New template</Button>} /></Card>
      )}
      {shared.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-2xs font-semibold uppercase text-ink-3">Shared with the company</h2>
          {grid(shared)}
        </section>
      )}
      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 text-2xs font-semibold uppercase text-ink-3">My private templates</h2>
          {grid(mine)}
        </section>
      )}
      {editing && <TemplateModal template={editing === 'new' ? null : editing} canShare={can('mail.templates.manage')} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateModal({ template, canShare, onClose }: { template: MailTemplate | null; canShare: boolean; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [bodyHtml, setBodyHtml] = useState(template?.bodyHtml ?? '<p>Hi {{contact.firstName}},</p>\n<p></p>\n<p>Best regards,<br/>{{me.firstName}}</p>');
  const [shared, setShared] = useState(template ? template.ownerId === null : false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const save = useMailMutation((b: unknown) => (template ? http.patch(`/mail/templates/${template.id}`, b) : http.post('/mail/templates', b)));

  const insert = (token: string) => {
    const el = bodyRef.current;
    if (!el) return setBodyHtml((b) => b + token);
    const start = el.selectionStart ?? bodyHtml.length;
    const end = el.selectionEnd ?? start;
    const next = bodyHtml.slice(0, start) + token + bodyHtml.slice(end);
    setBodyHtml(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={template ? 'Edit template' : 'New template'}
      width={680}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || !bodyHtml.trim()} loading={save.isPending} onClick={() => save.mutate({ name, subject, bodyHtml, shared }, { onSuccess: () => { toast.push('success', 'Template saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>
            Save template
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pricing follow-up" /></Field>
          <Field label="Subject" hint="Optional; empty keeps the conversation subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        </div>
        <Field label="Body (HTML)" required>
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((p) => (
              <button key={p.token} type="button" onClick={() => insert(p.token)} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-2xs normal-case tracking-normal text-ink-2 hover:border-pri hover:text-pri" title={p.label}>
                {p.token}
              </button>
            ))}
          </div>
          <textarea ref={bodyRef} rows={10} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-pri focus:outline-none" />
        </Field>
        <div className="flex items-center justify-between rounded-card border border-line bg-surface-2/60 px-3 py-2.5">
          <span>
            <span className="block text-base font-semibold text-ink">Share with the whole company</span>
            <span className="block text-xs text-ink-3">{canShare ? 'Everyone with mail access can insert it.' : 'Shared templates need the mail.templates.manage permission.'}</span>
          </span>
          <Toggle checked={shared} disabled={!canShare} onChange={setShared} />
        </div>
      </div>
    </Modal>
  );
}

export default function TemplatesPageWithConfirm() {
  return (
    <>
      <TemplatesPage />
      <ConfirmHost />
    </>
  );
}
