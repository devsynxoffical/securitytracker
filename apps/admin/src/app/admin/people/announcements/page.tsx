'use client';

import { confirmDialog, ConfirmHost } from '@/components/platform/confirm';

import { Suspense, useMemo, useState } from 'react';
import { Plus, Pin, PinOff, Trash2, Megaphone, Pencil, Building2, Users, KeyRound, Globe, Eye, Clock } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAnnouncements, useDepartments, useTeams, useRoles, usePeopleMutation, PEOPLE_ALL, type Announcement } from '@/lib/queries/people';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea, useToast } from '@/components/ui';
import { FilterChip, KpiTile, Menu, Toggle, ViewTabs } from '@/components/ui/advanced';
import { OptionList } from '@/components/people/shared';
import { dateTime, relative, titleCase } from '@/lib/format';

type View = 'all' | 'unread' | 'pinned' | 'scheduled';

function AnnouncementsPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Announcements /></Suspense>;
}

const AUDIENCE_ICON = { company: Globe, department: Building2, team: Users, role: KeyRound } as const;

function Announcements() {
  const { can } = useAuth();
  const toast = useToast();
  const q = useAnnouncements();
  const departments = useDepartments();
  const teams = useTeams();
  const roles = useRoles();
  const [view, setView] = useState<View>('all');
  const [audience, setAudience] = useState('');
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const read = usePeopleMutation((id: string) => http.post(`/hr/announcements/${id}/read`), PEOPLE_ALL);
  const del = usePeopleMutation((id: string) => http.del(`/hr/announcements/${id}`), PEOPLE_ALL);
  const pin = usePeopleMutation(({ id, pinned }: { id: string; pinned: boolean }) => http.patch(`/hr/announcements/${id}`, { pinned }), PEOPLE_ALL);
  const all = q.data ?? [];
  const now = Date.now();
  const counts = { all: all.length, unread: all.filter((a) => !a.readAt).length, pinned: all.filter((a) => a.pinned).length, scheduled: all.filter((a) => new Date(a.publishedAt).getTime() > now).length };
  const rows = useMemo(() => all.filter((a) => (view === 'all' || (view === 'unread' && !a.readAt) || (view === 'pinned' && a.pinned) || (view === 'scheduled' && new Date(a.publishedAt).getTime() > now)) && (!audience || a.audienceType === audience)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt)), [all, view, audience, now]);
  const audienceName = (a: Announcement) => a.audienceType === 'company' ? 'Whole company' : a.audienceType === 'department' ? departments.data?.find((d) => d.id === a.audienceId)?.name : a.audienceType === 'team' ? teams.data?.find((t) => t.id === a.audienceId)?.name : roles.data?.find((r) => r.id === a.audienceId)?.name;

  return (
    <div>
      <PageHeader title="Announcements" subtitle="Delivered as notifications to the chosen audience (FR-HR-13)" actions={can('announcements.send') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New announcement</Button>} />
      <div className="mb-4 grid grid-cols-4 gap-3">
        <KpiTile label="Published" value={counts.all - counts.scheduled} loading={q.isLoading} icon={<Megaphone size={14} />} />
        <KpiTile label="Unread by me" value={counts.unread} tone={counts.unread ? 'green' : undefined} loading={q.isLoading} icon={<Eye size={14} />} onClick={() => setView('unread')} />
        <KpiTile label="Pinned" value={counts.pinned} tone="primary" loading={q.isLoading} icon={<Pin size={14} />} onClick={() => setView('pinned')} />
        <KpiTile label="Scheduled" value={counts.scheduled} tone="amber" loading={q.isLoading} icon={<Clock size={14} />} onClick={() => setView('scheduled')} />
      </div>
      <Card>
        <ViewTabs value={view} onChange={setView} views={[{ value: 'all', label: 'All', count: counts.all }, { value: 'unread', label: 'Unread', count: counts.unread }, { value: 'pinned', label: 'Pinned', count: counts.pinned }, { value: 'scheduled', label: 'Scheduled', count: counts.scheduled }]} />
        <div className="flex flex-wrap items-center gap-2 border-b border-line-2 px-3 py-2.5">
          <FilterChip label="Audience" value={audience ? titleCase(audience) : undefined} onClear={() => setAudience('')}>
            <OptionList value={audience} onChange={setAudience} options={['company', 'department', 'team', 'role'].map((a) => ({ value: a, label: titleCase(a) }))} />
          </FilterChip>
          <span className="ml-auto text-xs text-ink-3">{rows.length} shown</span>
        </div>
        <div className="p-4">
          {q.isLoading && <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
          {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
          {q.data && rows.length === 0 && <EmptyState icon={<Megaphone size={20} />} title="No announcements" body="Company news, policy updates and reminders go here." action={can('announcements.send') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New announcement</Button> : undefined} />}
          <div className="space-y-3">
            {rows.map((a) => {
              const Icon = AUDIENCE_ICON[a.audienceType];
              const scheduled = new Date(a.publishedAt).getTime() > now;
              return (
                <article key={a.id} className={`hover-reveal rounded-card border bg-surface p-4 shadow-card transition ${a.pinned ? 'border-pri' : 'border-line'} ${!a.readAt ? 'ring-1 ring-pri-soft' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${a.pinned ? 'bg-pri-soft text-pri' : 'bg-surface-2 text-ink-3'}`}><Megaphone size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-md font-semibold text-ink">{a.title}</h3>
                        {a.pinned && <Badge tone="primary"><Pin size={10} /> Pinned</Badge>}
                        <Badge tone={a.audienceType === 'company' ? 'blue' : 'violet'}><Icon size={10} /> {audienceName(a) ?? titleCase(a.audienceType)}</Badge>
                        {scheduled && <Badge tone="amber">Scheduled</Badge>}
                        {!a.readAt && <Badge tone="green" dot>New</Badge>}
                      </div>
                      <p className="prose-sm mt-2 whitespace-pre-wrap text-base text-ink-2">{a.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-3">
                        <span title={dateTime(a.publishedAt)}>{scheduled ? `Publishes ${dateTime(a.publishedAt)}` : relative(a.publishedAt)}</span>
                        <span className="inline-flex items-center gap-1"><Eye size={11} /> {a.readCount} read</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!a.readAt && <Button size="sm" onClick={() => read.mutate(a.id)}>Mark read</Button>}
                      {can('announcements.send') && (
                        <Menu items={[
                          { label: a.pinned ? 'Unpin' : 'Pin to top', icon: a.pinned ? <PinOff size={13} /> : <Pin size={13} />, onSelect: () => pin.mutate({ id: a.id, pinned: !a.pinned }, { onError: (e) => toast.push('error', (e as Error).message) }) },
                          { label: 'Edit', icon: <Pencil size={13} />, onSelect: () => setEditing(a) },
                          { separator: true, label: '' },
                          { label: 'Delete', icon: <Trash2 size={13} />, danger: true, onSelect: () => void confirmDialog({ title: 'Delete this announcement?', danger: true }).then((ok) => ok && del.mutate(a.id, { onError: (e) => toast.push('error', (e as Error).message) }) )},
                        ]} />
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </Card>
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
    <Modal open onClose={onClose} title={a ? 'Edit announcement' : 'New announcement'} width={620} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate({ title, body, audienceType, audienceId: audienceType === 'company' ? undefined : audienceId, pinned, publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined }, { onSuccess: () => { toast.push('success', a ? 'Updated' : 'Published'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>{a ? 'Save' : publishedAt ? 'Schedule' : 'Publish'}</Button></>}>
      <div className="space-y-3">
        <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
        <Field label="Message" required hint="Plain text with line breaks"><Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Field label="Audience">
          <div className="flex flex-wrap gap-1.5">{(['company', 'department', 'team', 'role'] as const).map((t) => { const Icon = AUDIENCE_ICON[t]; return <button key={t} type="button" onClick={() => { setAudienceType(t); setAudienceId(''); }} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition ${audienceType === t ? 'border-pri bg-pri-soft text-pri-2' : 'border-line bg-surface text-ink-2 hover:text-ink'}`}><Icon size={13} />{t === 'company' ? 'Whole company' : titleCase(t)}</button>; })}</div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {audienceType !== 'company' && <Field label={titleCase(audienceType)} required><Select value={audienceId} onChange={(e) => setAudienceId(e.target.value)}><option value="">Choose…</option>{(options ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>}
          {!a && <Field label="Publish at" hint="Empty = now"><Input type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} /></Field>}
        </div>
        <Toggle checked={pinned} onChange={setPinned} label="Pin to the top" />
      </div>
    </Modal>
  );
}

export default function AnnouncementsPageWithConfirm() {
  return (
    <>
      <AnnouncementsPage />
      <ConfirmHost />
    </>
  );
}
