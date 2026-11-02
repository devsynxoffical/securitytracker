'use client';

import { useState } from 'react';
import { FileText, Plus, Pencil, Trash2 } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMailTemplates, useMailMutation, type MailTemplate } from '@/lib/queries/mail';
import { Button, Card, Table, Th, Td, Badge, TableSkeleton, EmptyState, ErrorBanner, Modal, Field, Input, Textarea, Checkbox, useToast, PageHeader } from '@/components/ui';

export default function TemplatesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const q = useMailTemplates();
  const [editing, setEditing] = useState<MailTemplate | null | 'new'>(null);
  const del = useMailMutation((id: string) => http.del(`/mail/templates/${id}`));
  return (
    <div>
      <PageHeader title="Templates" subtitle="Canned responses with {{contact.firstName}}, {{account.name}} and {{me.firstName}} placeholders" actions={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New template</Button>} />
      <Card>
        {q.isLoading && <TableSkeleton cols={4} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data?.length === 0 && <EmptyState icon={<FileText size={28} />} title="No templates yet" body="Create a shared template for the team or a private one for yourself." action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New template</Button>} />}
        {q.data && q.data.length > 0 && (
          <Table>
            <thead><tr><Th>Name</Th><Th>Subject</Th><Th>Visibility</Th><Th /></tr></thead>
            <tbody>
              {q.data.map((t) => (
                <tr key={t.id} className="hover:bg-surface-2">
                  <Td className="font-semibold">{t.name}</Td>
                  <Td className="text-ink-2">{t.subject || <span className="text-ink-3">—</span>}</Td>
                  <Td><Badge tone={t.ownerId ? 'gray' : 'violet'}>{t.ownerId ? 'Private' : 'Shared'}</Badge></Td>
                  <Td right><div className="flex justify-end gap-1">
                    <Button size="sm" icon={<Pencil size={12} />} onClick={() => setEditing(t)}>Edit</Button>
                    {(t.ownerId || can('mail.templates.manage')) && <Button size="sm" variant="danger-outline" icon={<Trash2 size={12} />} onClick={() => window.confirm('Delete this template?') && del.mutate(t.id, { onError: (e) => toast.push('error', (e as Error).message) })}>Delete</Button>}
                  </div></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
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
  const save = useMailMutation((b: unknown) => (template ? http.patch(`/mail/templates/${template.id}`, b) : http.post('/mail/templates', b)));
  return (
    <Modal open onClose={onClose} title={template ? 'Edit template' : 'New template'} width={620} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim() || !bodyHtml.trim()} loading={save.isPending} onClick={() => save.mutate({ name, subject, bodyHtml, shared }, { onSuccess: () => { toast.push('success', 'Template saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Subject" hint="Optional. Leave empty to keep the conversation subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Body (HTML)" required><Textarea rows={10} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} className="font-mono text-xs" /></Field>
        <Checkbox checked={shared} disabled={!canShare} onChange={(e) => setShared(e.target.checked)} label={canShare ? 'Shared with the whole company' : 'Shared templates need the mail.templates.manage permission'} />
      </div>
    </Modal>
  );
}
