'use client';

import { Suspense, useState } from 'react';
import { Plus, Pin, Trash2, Megaphone, Pencil } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAnnouncements, useDepartments, useTeams, useRoles, usePeopleMutation, PEOPLE_ALL, type Announcement } from '@/lib/queries/people';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea, useToast } from '@/components/ui';
import { dateTime, titleCase } from '@/lib/format';

export default function AnnouncementsPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Announcements /></Suspense>;
}

function Announcements() {
  const { can } = useAuth();
  const toast = useToast();
  const q = useAnnouncements();
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const read = usePeopleMutation((id: string) => http.post(`/hr/announcements/${id}/read`), PEOPLE_ALL);
  const del = usePeopleMutation((id: string) => http.del(`/hr/announcements/${id}`), PEOPLE_ALL);
  const pin = usePeopleMutation(({ id, pinned }: { id: string; pinned: boolean }) => http.patch(`/hr/announcements/${id}`, { pinned }), PEOPLE_ALL);
  return (
    <div>
      <PageHeader title="Announcements" subtitle="Delivered as notifications to the chosen audience (FR-HR-13)" actions={can('announcements.send') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New announcement</Button>} />
      {q.isLoading && <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <Card><EmptyState icon={<Megaphone size={20} />} title="No announcements" body="Company news, policy updates and reminders go here." /></Card>}
      <div className="space-y-3">
        {(q.data ?? []).map((a) => (
          <Card key={a.id} className={a.pinned ? 'border-pri' : undefined}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {a.pinned && <Pin size={13} className="text-pri" />}
                  <h3 className="text-[14px] font-semibold">{a.title}</h3>
                  <Badge tone={a.audienceType === 'company' ? 'blue' : 'violet'}>{titleCase(a.audienceType)}</Badge>
                  {new Date(a.publishedAt).getTime() > Date.now() && <Badge tone="amber">Scheduled</Badge>}
                  {!a.readAt && <Badge tone="green" dot>New</Badge>}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] text-ink-2">{a.body}</p>
                <div className="mt-2 text-xs text-ink-3">{dateTime(a.publishedAt)} · {a.readCount} read</div>
              </div>
              <div className="flex shrink-0 gap-1">
                {!a.readAt && <Button size="sm" onClick={() => read.mutate(a.id)}>Mark read</Button>}
                {can('announcements.send') && <>
                  <Button size="sm" variant="ghost" icon={<Pin size={12} />} title={a.pinned ? 'Unpin' : 'Pin'} onClick={() => pin.mutate({ id: a.id, pinned: !a.pinned })} />
                  <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(a)} />
                  <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => window.confirm('Delete this announcement?') && del.mutate(a.id, { onError: (e) => toast.push('error', (e as Error).message) })} />
                </>}
              </div>
            </div>
          </Card>
        ))}
      </div>
      {editing && <AnnouncementModal announcement={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AnnouncementModal({ announcement: a, onClose }: { announcement: Announcement | null; onClose: () => void }) {
  const toast = useToast();
  const departments = useDepartments();
  const teams = useTeams();
  const roles = useRoles();
  const [title, setTitle] = useState(a?.title ?? '');
  const [body, setBody] = useState(a?.body ?? '');
  const [audienceType, setAudienceType] = useState<Announcement['audienceType']>(a?.audienceType ?? 'company');
  const [audienceId, setAudienceId] = useState(a?.audienceId ?? '');
  const [pinned, setPinned] = useState(a?.pinned ?? false);
  const [publishedAt, setPublishedAt] = useState('');
  const save = usePeopleMutation((b: Record<string, unknown>) => (a ? http.patch(`/hr/announcements/${a.id}`, b) : http.post('/hr/announcements', b)), PEOPLE_ALL);
  const options = audienceType === 'department' ? departments.data : audienceType === 'team' ? teams.data : audienceType === 'role' ? roles.data : [];
  const valid = title.trim() && body.trim() && (audienceType === 'company' || audienceId);
  return (
    <Modal open onClose={onClose} title={a ? 'Edit announcement' : 'New announcement'} width={600} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate({ title, body, audienceType, audienceId: audienceType === 'company' ? undefined : audienceId, pinned, publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined }, { onSuccess: () => { toast.push('success', a ? 'Updated' : 'Published'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>{a ? 'Save' : 'Publish'}</Button></>}>
      <div className="space-y-3">
        <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
        <Field label="Message" required><Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Audience"><Select value={audienceType} onChange={(e) => { setAudienceType(e.target.value as Announcement['audienceType']); setAudienceId(''); }}><option value="company">Whole company</option><option value="department">Department</option><option value="team">Team</option><option value="role">Role</option></Select></Field>
          {audienceType !== 'company' && <Field label={titleCase(audienceType)} required><Select value={audienceId} onChange={(e) => setAudienceId(e.target.value)}><option value="">Choose…</option>{(options ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>}
          {!a && <Field label="Publish at" hint="Empty = now"><Input type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} /></Field>}
        </div>
        <Checkbox checked={pinned} onChange={(e) => setPinned(e.target.checked)} label="Pin to the top" />
      </div>
    </Modal>
  );
}
