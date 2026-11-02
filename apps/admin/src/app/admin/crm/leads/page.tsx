'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Kanban, List, Sparkles, Phone, Mail, ArrowRight, Eye, UserPlus, Flag } from 'lucide-react';
import { clsx } from 'clsx';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useLeads, useLead, usePipelines, useSources, useCrmMutation, useAccounts, useActivities, type Lead, type Stage, type Pipeline } from '@/lib/queries/crm';
import { Button, Card, Badge, stageTone, Skeleton, EmptyState, ErrorBanner, Pagination, BulkBar, Modal, Field, Input, Select, Tabs, Segmented, Avatar, Checkbox, SearchInput, useToast, PageHeader } from '@/components/ui';
import { DataTable, Menu, AssociationCard, type Column, type MenuItem } from '@/components/ui/advanced';
import { OwnerSelect, LostReasonModal, CustomFieldInputs, ContactPointEditor, toPhones, toEmails, type ContactPoint } from '@/components/crm/shared';
import { ListShell, OwnerChip, SelectChip, SearchChipInput, useMergedRows, type Filters } from '@/components/crm/list-shell';
import { RecordPage, RecordHeader, KpiStrip, EditableProperties, ActivitiesTab, NotesTab, MetaFooter } from '@/components/crm/record';
import { money, fullName, relative, dateTime, dateOnly, phoneDisplay, titleCase } from '@/lib/format';

const PRIORITIES = [{ value: 'high', label: 'High' }, { value: 'normal', label: 'Normal' }, { value: 'low', label: 'Low' }];
const priorityTone = (p: string): 'red' | 'gray' | 'amber' => (p === 'high' ? 'red' : p === 'low' ? 'gray' : 'amber');

export default function LeadsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Leads />
    </Suspense>
  );
}

function Leads() {
  const { can, me } = useAuth();
  const toast = useToast();
  const [id, setId] = useIdParam();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [filters, setFiltersState] = useState<Filters>({});
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Lead[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [bulkOwner, setBulkOwner] = useState('');

  const pipelines = usePipelines('lead');
  const pipeline = pipelines.data?.find((p) => p.isDefault) ?? pipelines.data?.[0];
  const status = (filters.status as 'open' | 'clients' | 'all' | undefined) ?? 'open';

  const setFilters = useCallback((f: Filters) => {
    setFiltersState(f);
    setCursor(undefined);
    setPages([]);
    setSelected(new Set());
  }, []);
  const setFilter = (k: string, v: string) => setFilters({ ...filters, [k]: v });

  const params = useMemo(
    () => ({ search: filters.search || undefined, ownerId: filters.ownerId || undefined, stageId: filters.stageId || undefined, isClient: status === 'clients' ? true : undefined, cursor, limit: 50 }),
    [filters.search, filters.ownerId, filters.stageId, status, cursor],
  );
  const q = useLeads(params);
  const merged = useMergedRows(pages, q.data?.items);
  const rows = useMemo(() => merged.filter((l) => (status === 'open' ? !l.convertedAt && !l.wonAt && !l.lostAt : true)).filter((l) => (filters.priority ? l.priority === filters.priority : true)), [merged, status, filters.priority]);
  const loadMore = () => {
    if (q.data?.nextCursor) {
      setPages((p) => [...p, q.data!.items]);
      setCursor(q.data.nextCursor);
    }
  };

  const bulkAssign = useCrmMutation((o: string) => http.post('/leads/bulk-assign', { leadIds: [...selected], ownerId: o }), [['leads']]);
  const assignOne = useCrmMutation((a: { id: string; ownerId: string }) => http.post(`/leads/${a.id}/assign`, { ownerId: a.ownerId }), [['leads']]);

  if (id) return <LeadRecord id={id} onBack={() => setId(null)} pipeline={pipeline} />;

  const columns: Column<Lead>[] = [
    {
      key: 'name', header: 'Lead', locked: true,
      cell: (l) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={l.name} size={26} />
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink">{l.name}</div>
            <div className="truncate text-xs text-ink-3">{l.companyName ?? '—'}</div>
          </div>
        </div>
      ),
    },
    { key: 'stage', header: 'Stage', cell: (l) => <span className="flex items-center gap-1"><Badge tone={stageTone(l.stage.type)}>{l.stage.name}</Badge>{l.convertedAt && <Badge tone="violet">Converted</Badge>}</span> },
    { key: 'owner', header: 'Owner', cell: (l) => (l.owner ? <span className="flex items-center gap-2"><Avatar name={fullName(l.owner)} size={22} />{fullName(l.owner)}</span> : <span className="text-ink-3">Unassigned</span>) },
    { key: 'contact', header: 'Contact', cell: (l) => <div className="text-ink-2"><div className="font-mono text-xs">{l.phones[0] ? phoneDisplay(l.phones[0].phoneE164) : ''}</div><div className="text-xs">{l.emails[0]?.emailLower ?? ''}</div></div> },
    { key: 'value', header: 'Value', right: true, mono: true, cell: (l) => money(l.value, l.currency) },
    { key: 'priority', header: 'Priority', cell: (l) => <Badge tone={priorityTone(l.priority)}>{titleCase(l.priority)}</Badge> },
    { key: 'followUp', header: 'Follow-up', cell: (l) => (l.followUpAt ? <span className={clsx('text-xs', new Date(l.followUpAt) < new Date() ? 'text-red-text' : 'text-ink-2')}>{dateOnly(l.followUpAt)}</span> : <span className="text-ink-3">—</span>) },
    { key: 'lastActivity', header: 'Last activity', right: true, cell: (l) => <span className="text-ink-3">{relative(l.lastActivityAt)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={pipeline ? `${pipeline.name} · ${rows.length} shown` : undefined}
        actions={
          <>
            <Segmented value={view} onChange={setView} options={[{ value: 'list', label: <span className="flex items-center gap-1"><List size={13} /> List</span> }, { value: 'board', label: <span className="flex items-center gap-1"><Kanban size={13} /> Board</span> }]} />
            {can('crm.leads.create') && (
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
                New lead
              </Button>
            )}
          </>
        }
      />

      <ListShell
        entityType="lead"
        filters={filters}
        onFilters={setFilters}
        chips={
          <>
            <SearchChipInput value={filters.search ?? ''} onChange={(v) => setFilter('search', v)} placeholder="Search name or company…" />
            <SelectChip label="Status" value={filters.status ?? ''} onChange={(v) => setFilter('status', v)} options={[{ value: 'open', label: 'Open' }, { value: 'clients', label: 'Clients' }, { value: 'all', label: 'All' }]} />
            <OwnerChip value={filters.ownerId ?? ''} onChange={(v) => setFilter('ownerId', v)} />
            <SelectChip label="Stage" value={filters.stageId ?? ''} onChange={(v) => setFilter('stageId', v)} options={(pipeline?.stages ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            <SelectChip label="Priority" value={filters.priority ?? ''} onChange={(v) => setFilter('priority', v)} options={PRIORITIES} />
          </>
        }
      >
        {view === 'board' ? (
          <LeadBoard pipeline={pipeline} leads={rows} loading={q.isLoading || pipelines.isLoading} error={q.error as Error | null} onRetry={() => q.refetch()} onOpen={setId} canEdit={can('crm.leads.edit')} />
        ) : (
          <Card>
            <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
              {can('crm.leads.assign') && (
                <>
                  <div className="w-56"><OwnerSelect value={bulkOwner} onChange={setBulkOwner} emptyLabel="Assign to…" /></div>
                  <Button size="sm" variant="primary" disabled={!bulkOwner} loading={bulkAssign.isPending} onClick={() => bulkAssign.mutate(bulkOwner, { onSuccess: () => { setSelected(new Set()); toast.push('success', 'Leads reassigned'); } })}>
                    Assign
                  </Button>
                </>
              )}
            </BulkBar>
            <DataTable
              rows={rows}
              columns={columns}
              loading={q.isLoading && pages.length === 0}
              error={q.isError ? (q.error as Error).message : null}
              onRetry={() => q.refetch()}
              selected={selected}
              onSelect={setSelected}
              onRowClick={(l) => setId(l.id)}
              storageKey="crm.leads"
              empty={<EmptyState title="No leads match" body="Change the filters or create a lead." action={can('crm.leads.create') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New lead</Button> : undefined} />}
              rowActions={(l) => (
                <Menu
                  items={([
                    { label: 'Open', icon: <Eye size={14} />, onSelect: () => setId(l.id) },
                    ...(can('crm.leads.assign') && !l.convertedAt ? [{ label: 'Assign to me', icon: <UserPlus size={14} />, onSelect: () => assignToMe(l.id) }] : []),
                    ...(can('crm.leads.convert') && !l.convertedAt ? [{ label: 'Convert…', icon: <Sparkles size={14} />, onSelect: () => setId(l.id) }] : []),
                  ] as MenuItem[])}
                />
              )}
              footer={rows.length > 0 ? <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={loadMore} loading={q.isFetching} /> : undefined}
            />
          </Card>
        )}
      </ListShell>

      {creating && pipeline && <LeadFormModal pipeline={pipeline} onClose={() => setCreating(false)} />}
    </div>
  );

  function assignToMe(leadId: string) {
    if (!me) return;
    assignOne.mutate({ id: leadId, ownerId: me.id }, { onSuccess: () => toast.push('success', 'Assigned to you'), onError: (e) => toast.push('error', (e as Error).message) });
  }
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

function LeadBoard({ pipeline, leads, loading, error, onRetry, onOpen, canEdit }: { pipeline?: Pipeline; leads: Lead[]; loading: boolean; error: Error | null; onRetry: () => void; onOpen: (id: string) => void; canEdit: boolean }) {
  const toast = useToast();
  const [lostFor, setLostFor] = useState<{ leadId: string; stageId: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const move = useCrmMutation((a: { id: string; stageId: string; lostReasonId?: string }) => http.post(`/leads/${a.id}/stage`, { stageId: a.stageId, lostReasonId: a.lostReasonId }), [['leads']]);

  if (loading) return <div className="grid grid-cols-5 gap-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-72" />)}</div>;
  if (error) return <ErrorBanner message={error.message} onRetry={onRetry} />;
  if (!pipeline) return <EmptyState title="No lead pipeline" body="Create one under CRM → Settings → Pipelines." />;

  const drop = (stage: Stage) => {
    if (!dragging) return;
    const lead = leads.find((l) => l.id === dragging);
    setDragging(null);
    setOver(null);
    if (!lead || lead.stageId === stage.id) return;
    if (stage.type === 'lost') return setLostFor({ leadId: lead.id, stageId: stage.id });
    move.mutate({ id: lead.id, stageId: stage.id }, { onError: (e) => toast.push('error', (e as Error).message) });
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {pipeline.stages.map((s) => {
          const items = leads.filter((l) => l.stageId === s.id);
          const total = items.reduce((a, l) => a + Number(l.value ?? 0), 0);
          return (
            <div
              key={s.id}
              className={clsx('flex w-[264px] shrink-0 flex-col rounded-card border bg-surface-2 transition-colors', over === s.id ? 'border-pri bg-pri-soft/50 ring-2 ring-pri-soft' : dragging ? 'border-dashed border-ink-3' : 'border-line')}
              onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOver(s.id); } }}
              onDragLeave={() => setOver(null)}
              onDrop={() => canEdit && drop(s)}
            >
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between"><Badge tone={stageTone(s.type)} dot>{s.name}</Badge><span className="font-mono text-xs text-ink-3">{items.length}</span></div>
                <div className="mt-1 font-mono text-xs text-ink-2">{money(total)}</div>
              </div>
              <div className="min-h-[120px] flex-1 space-y-2 px-2 pb-2">
                {items.map((l) => (
                  <div key={l.id} draggable={canEdit} onDragStart={() => setDragging(l.id)} onDragEnd={() => { setDragging(null); setOver(null); }} onClick={() => onOpen(l.id)}
                    className={clsx('cursor-pointer rounded-lg border border-line bg-surface p-3 shadow-card transition hover:border-pri hover:shadow-pop', dragging === l.id && 'opacity-50')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="truncate text-base font-semibold text-ink">{l.name}</div><div className="truncate text-xs text-ink-3">{l.companyName ?? '—'}</div></div>
                      <Badge tone={priorityTone(l.priority)}>{titleCase(l.priority)}</Badge>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-xs">
                      <span className="font-mono text-ink">{money(l.value, l.currency)}</span>
                      <span className="flex items-center gap-1.5">
                        {l.followUpAt && <span className={clsx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium', new Date(l.followUpAt) < new Date() ? 'bg-red-soft text-red-text' : 'bg-surface-2 text-ink-2')}><Flag size={10} />{dateOnly(l.followUpAt)}</span>}
                        {l.owner && <Avatar name={fullName(l.owner)} size={20} />}
                      </span>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="rounded-lg border border-dashed border-line px-2 py-6 text-center text-xs text-ink-3">{dragging ? 'Drop here' : 'Empty'}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <LostReasonModal open={Boolean(lostFor)} onClose={() => setLostFor(null)} busy={move.isPending} onConfirm={(r) => lostFor && move.mutate({ id: lostFor.leadId, stageId: lostFor.stageId, lostReasonId: r }, { onSuccess: () => setLostFor(null), onError: (e) => toast.push('error', (e as Error).message) })} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Record page
// ---------------------------------------------------------------------------

function LeadRecord({ id, onBack, pipeline }: { id: string; onBack: () => void; pipeline?: Pipeline }) {
  const { can } = useAuth();
  const toast = useToast();
  const q = useLead(id);
  const activities = useActivities('lead', id);
  const [tab, setTab] = useState<'overview' | 'activities' | 'notes'>('overview');
  const [converting, setConverting] = useState(false);
  const [lostStage, setLostStage] = useState<string | null>(null);
  const [owner, setOwner] = useState('');
  const inv = [['leads'], ['activities']];
  const move = useCrmMutation((a: { stageId: string; lostReasonId?: string }) => http.post(`/leads/${id}/stage`, a), inv);
  const assign = useCrmMutation((ownerId: string) => http.post(`/leads/${id}/assign`, { ownerId }), inv);
  const lead = q.data;
  const stages = lead?.pipeline?.stages ?? pipeline?.stages ?? [];
  const frozen = Boolean(lead?.convertedAt);
  const canEdit = can('crm.leads.edit') && !frozen;

  const changeStage = (stageId: string) => {
    const s = stages.find((x) => x.id === stageId);
    if (!s) return;
    if (s.type === 'lost') return setLostStage(stageId);
    move.mutate({ stageId }, { onError: (e) => toast.push('error', (e as Error).message) });
  };

  const ageDays = lead ? Math.max(0, Math.round((Date.now() - new Date(lead.createdAt).getTime()) / 86_400_000)) : 0;
  const planned = (activities.data?.items ?? []).filter((a) => a.status === 'planned').length;

  return (
    <RecordPage
      onBack={onBack}
      loading={q.isLoading}
      error={q.isError ? (q.error as Error).message : null}
      onRetry={() => q.refetch()}
      header={
        lead && (
          <RecordHeader
            avatar={<Avatar name={lead.name} size={44} />}
            title={lead.name}
            subtitle={<span>{lead.companyName ?? 'No company'}</span>}
            badges={
              <>
                <Badge tone={stageTone(lead.stage.type)} dot>{lead.stage.name}</Badge>
                <Badge tone={priorityTone(lead.priority)}>{titleCase(lead.priority)} priority</Badge>
                {lead.convertedAt && <Badge tone="violet">Converted</Badge>}
                {lead.doNotCall && <Badge tone="red">Do not call</Badge>}
              </>
            }
            actions={
              <>
                {canEdit && (
                  <Select className="h-9 w-48 text-sm" value={lead.stageId} onChange={(e) => changeStage(e.target.value)} aria-label="Stage">
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                )}
                {can('crm.leads.assign') && !frozen && (
                  <div className="flex gap-1">
                    <div className="w-44"><OwnerSelect value={owner || lead.ownerId || ''} onChange={setOwner} allowEmpty={false} /></div>
                    <Button disabled={!owner || owner === lead.ownerId} loading={assign.isPending} onClick={() => assign.mutate(owner, { onSuccess: () => toast.push('success', 'Lead reassigned') })}>Assign</Button>
                  </div>
                )}
              </>
            }
            primary={!frozen && can('crm.leads.convert') ? <Button variant="primary" icon={<Sparkles size={14} />} onClick={() => setConverting(true)}>Convert</Button> : undefined}
          />
        )
      }
      left={
        lead && (
          <EditableProperties
            entityType="lead"
            patchPath={`/leads/${lead.id}`}
            canEdit={canEdit}
            invalidate={inv}
            custom={lead.custom}
            properties={[
              { key: 'name', label: 'Name', value: lead.name, raw: lead.name, editable: true },
              { key: 'companyName', label: 'Company', value: lead.companyName, raw: lead.companyName ?? '', editable: true },
              { key: 'value', label: 'Value', value: money(lead.value, lead.currency), raw: lead.value === null ? '' : String(lead.value), type: 'number', editable: true, mono: true },
              { key: 'priority', label: 'Priority', value: titleCase(lead.priority), raw: lead.priority, type: 'select', options: PRIORITIES, editable: true },
              { key: 'followUpAt', label: 'Follow-up', value: lead.followUpAt ? dateTime(lead.followUpAt) : null, raw: lead.followUpAt ? lead.followUpAt.slice(0, 10) : '', type: 'date', editable: true },
              { key: 'phones', label: 'Phones', value: lead.phones.length ? <span className="space-y-0.5">{lead.phones.map((p) => <span key={p.id} className="flex items-center gap-1 font-mono"><Phone size={11} />{phoneDisplay(p.phoneE164)} <span className="text-ink-3">{p.label}</span></span>)}</span> : null },
              { key: 'emails', label: 'Emails', value: lead.emails.length ? <span className="space-y-0.5">{lead.emails.map((e) => <span key={e.id} className="flex items-center gap-1"><Mail size={11} />{e.emailLower} <span className="text-ink-3">{e.label}</span></span>)}</span> : null },
              { key: 'owner', label: 'Owner', value: lead.owner ? fullName(lead.owner) : 'Unassigned' },
              { key: 'createdAt', label: 'Created', value: dateTime(lead.createdAt) },
            ]}
            map={(key, value) => {
              switch (key) {
                case 'value': return { value: value === '' ? undefined : Number(value) };
                case 'followUpAt': return { followUpAt: value ? new Date(value).toISOString() : undefined };
                case 'name': return { name: value };
                case 'companyName': return { companyName: value || undefined };
                case 'priority': return { priority: value };
                default: return null;
              }
            }}
          />
        )
      }
      main={
        lead && (
          <>
            {frozen && (
              <div className="mb-4 flex items-center justify-between rounded-lg bg-violet-soft px-3 py-2 text-base text-violet-text">
                <span>Converted {dateTime(lead.convertedAt)}. This lead is read-only.</span>
                <span className="flex gap-3 text-xs font-semibold">
                  {lead.contactId && <Link href={`/admin/crm/contacts?id=${lead.contactId}`} className="hover:underline">Contact <ArrowRight size={11} className="inline" /></Link>}
                  {lead.accountId && <Link href={`/admin/crm/accounts?id=${lead.accountId}`} className="hover:underline">Account <ArrowRight size={11} className="inline" /></Link>}
                  {lead.dealId && <Link href={`/admin/crm/deals?id=${lead.dealId}`} className="hover:underline">Deal <ArrowRight size={11} className="inline" /></Link>}
                </span>
              </div>
            )}
            <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'overview', label: 'Overview' }, { value: 'activities', label: 'Activities', count: activities.data?.items.length }, { value: 'notes', label: 'Notes' }]} />
            {tab === 'overview' && (
              <>
                <KpiStrip
                  items={[
                    { label: 'Value', value: money(lead.value, lead.currency) },
                    { label: 'Stage', value: <span className="text-base">{lead.stage.name}</span>, hint: `${stages.findIndex((s) => s.id === lead.stageId) + 1} of ${stages.length}` },
                    { label: 'Planned activities', value: planned, tone: planned ? 'amber' : undefined },
                    { label: 'Age', value: `${ageDays}d`, hint: `last activity ${relative(lead.lastActivityAt)}` },
                  ]}
                />
                <ActivitiesTab entityType="lead" entityId={lead.id} canEdit={canEdit} />
                {(lead.notes?.length || lead.callLogs?.length) ? (
                  <div className="mt-4">
                    <div className="mb-1 text-2xs font-semibold uppercase text-ink-3">Legacy notes and calls</div>
                    <ul className="space-y-1 text-base">
                      {lead.notes?.map((n) => <li key={n.id} className="rounded bg-surface-2 px-3 py-2"><span className="text-ink-3">{relative(n.createdAt)}</span> — {n.body}</li>)}
                      {lead.callLogs?.map((c) => <li key={c.id} className="rounded bg-surface-2 px-3 py-2"><span className="text-ink-3">{relative(c.occurredAt)}</span> — {c.direction} call, {c.outcome}, {Math.round(c.durationSeconds / 60)} min{c.notes ? ` — ${c.notes}` : ''}</li>)}
                    </ul>
                  </div>
                ) : null}
                <MetaFooter createdAt={lead.createdAt} lastActivityAt={lead.lastActivityAt} />
              </>
            )}
            {tab === 'activities' && <ActivitiesTab entityType="lead" entityId={lead.id} canEdit={canEdit} />}
            {tab === 'notes' && <NotesTab entityType="lead" entityId={lead.id} canEdit={canEdit} />}
            <LostReasonModal open={Boolean(lostStage)} onClose={() => setLostStage(null)} busy={move.isPending} onConfirm={(r) => lostStage && move.mutate({ stageId: lostStage, lostReasonId: r }, { onSuccess: () => setLostStage(null), onError: (e) => toast.push('error', (e as Error).message) })} />
            {converting && <ConvertModal lead={lead} onClose={() => setConverting(false)} />}
          </>
        )
      }
      right={
        lead && (
          <>
            <AssociationCard title="Converted to" emptyText={frozen ? 'No linked records' : 'Not converted yet'}>
              {frozen && (
                <ul className="space-y-1">
                  {lead.contactId && <li><Link className="block rounded px-2 py-1 text-pri hover:bg-surface-2" href={`/admin/crm/contacts?id=${lead.contactId}`}>Contact →</Link></li>}
                  {lead.accountId && <li><Link className="block rounded px-2 py-1 text-pri hover:bg-surface-2" href={`/admin/crm/accounts?id=${lead.accountId}`}>Account →</Link></li>}
                  {lead.dealId && <li><Link className="block rounded px-2 py-1 text-pri hover:bg-surface-2" href={`/admin/crm/deals?id=${lead.dealId}`}>Deal →</Link></li>}
                </ul>
              )}
            </AssociationCard>
            <AssociationCard title="Pipeline">
              <ol className="space-y-1">
                {stages.map((s) => (
                  <li key={s.id} className={clsx('flex items-center gap-2 rounded px-2 py-1 text-sm', s.id === lead.stageId ? 'bg-pri-soft font-semibold text-pri-2' : 'text-ink-2')}>
                    <span className={clsx('h-1.5 w-1.5 rounded-full', s.type === 'won' ? 'bg-green' : s.type === 'lost' ? 'bg-red' : 'bg-pri')} />
                    {s.name}
                  </li>
                ))}
              </ol>
            </AssociationCard>
          </>
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Convert (F21)
// ---------------------------------------------------------------------------

function ConvertModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const toast = useToast();
  const [first, ...rest] = lead.name.trim().split(/\s+/);
  const [firstName, setFirstName] = useState(first ?? '');
  const [lastName, setLastName] = useState(rest.join(' '));
  const [title, setTitle] = useState('');
  const [accountMode, setAccountMode] = useState<'none' | 'new' | 'existing'>(lead.companyName ? 'new' : 'none');
  const [accountName, setAccountName] = useState(lead.companyName ?? '');
  const [accountSearch, setAccountSearch] = useState('');
  const [accountId, setAccountId] = useState('');
  const [withDeal, setWithDeal] = useState(true);
  const [dealName, setDealName] = useState(`${lead.companyName ?? lead.name} deal`);
  const [amount, setAmount] = useState(lead.value ? String(lead.value) : '');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [ownerId, setOwnerId] = useState(lead.ownerId ?? '');
  const [allowDup, setAllowDup] = useState(false);
  const pipelines = usePipelines('deal');
  const accounts = useAccounts({ search: accountSearch || undefined, limit: 10 });
  const pipeline = pipelines.data?.find((p) => p.id === pipelineId) ?? pipelines.data?.find((p) => p.isDefault) ?? pipelines.data?.[0];
  const effectivePipelineId = pipeline?.id ?? '';
  const effectiveStageId = stageId || pipeline?.stages[0]?.id || '';
  const convert = useCrmMutation((payload: Record<string, unknown>) => http.post<{ contactId: string; accountId: string | null; dealId: string | null }>(`/leads/${lead.id}/convert`, payload), [['leads'], ['contacts'], ['accounts'], ['deals'], ['activities'], ['crm', 'dashboard']]);

  const submit = () =>
    convert.mutate(
      {
        contact: { firstName, lastName, title: title || undefined },
        account: accountMode === 'none' ? { mode: 'none' } : accountMode === 'existing' ? { mode: 'existing', accountId } : { mode: 'new', name: accountName },
        deal: withDeal ? { name: dealName, pipelineId: effectivePipelineId, stageId: effectiveStageId, amount: amount ? Number(amount) : undefined, currency: lead.currency } : undefined,
        ownerId: ownerId || undefined,
        allowDuplicate: allowDup,
      },
      {
        onSuccess: () => { toast.push('success', 'Lead converted'); onClose(); },
        onError: (e) => toast.push('error', (e as Error).message),
      },
    );

  const valid = firstName.trim() && (accountMode !== 'new' || accountName.trim()) && (accountMode !== 'existing' || accountId) && (!withDeal || (dealName.trim() && effectivePipelineId && effectiveStageId));

  return (
    <Modal open onClose={onClose} title={`Convert “${lead.name}”`} width={620} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Sparkles size={13} />} disabled={!valid} loading={convert.isPending} onClick={submit}>Convert lead</Button></>}>
      <div className="space-y-5">
        <FormSection title="Contact" hint="Phones and emails are copied from the lead.">
          <div className="grid grid-cols-3 gap-3">
            <Field label="First name" required><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></Field>
            <Field label="Last name"><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
            <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Operations Manager" /></Field>
          </div>
        </FormSection>
        <FormSection title="Account">
          <Segmented value={accountMode} onChange={setAccountMode} options={[{ value: 'new', label: 'Create new' }, { value: 'existing', label: 'Use existing' }, { value: 'none', label: 'None' }]} />
          {accountMode === 'new' && <Field label="Account name" required className="mt-3"><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} /></Field>}
          {accountMode === 'existing' && (
            <div className="mt-3 space-y-2">
              <SearchInput value={accountSearch} onChange={setAccountSearch} placeholder="Search accounts…" />
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select account…</option>
                {accounts.data?.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </div>
          )}
        </FormSection>
        <FormSection title="Deal">
          <Checkbox checked={withDeal} onChange={(e) => setWithDeal(e.target.checked)} label="Create a deal" />
          {withDeal && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Deal name" required><Input value={dealName} onChange={(e) => setDealName(e.target.value)} /></Field>
              <Field label={`Amount (${lead.currency})`}><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="Pipeline" required><Select value={effectivePipelineId} onChange={(e) => { setPipelineId(e.target.value); setStageId(''); }}>{pipelines.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field label="Stage" required><Select value={effectiveStageId} onChange={(e) => setStageId(e.target.value)}>{pipeline?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            </div>
          )}
        </FormSection>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner of new records"><OwnerSelect value={ownerId} onChange={setOwnerId} emptyLabel="Same as lead owner" /></Field>
          <div className="flex items-end pb-2"><Checkbox checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} label="Create even if a duplicate contact exists" /></div>
        </div>
      </div>
    </Modal>
  );
}

function FormSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2"><span className="text-base font-semibold text-ink">{title}</span>{hint && <span className="text-xs text-ink-3">{hint}</span>}</div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New lead
// ---------------------------------------------------------------------------

function LeadFormModal({ pipeline, onClose }: { pipeline: Pipeline; onClose: () => void }) {
  const toast = useToast();
  const sources = useSources();
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [stageId, setStageId] = useState(pipeline.stages[0]?.id ?? '');
  const [ownerId, setOwnerId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [value, setValue] = useState('');
  const [priority, setPriority] = useState('normal');
  const [followUp, setFollowUp] = useState('');
  const [phones, setPhones] = useState<ContactPoint[]>([{ value: '', label: 'Mobile' }]);
  const [emails, setEmails] = useState<ContactPoint[]>([{ value: '', label: 'Work' }]);
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [allowDup, setAllowDup] = useState(false);
  const [dupMatches, setDupMatches] = useState<Array<{ id: string; name: string }> | null>(null);
  const create = useCrmMutation((payload: Record<string, unknown>) => http.post<Lead>('/leads', payload), [['leads'], ['crm', 'dashboard']]);

  const submit = () =>
    create.mutate(
      {
        name, companyName: companyName || undefined, pipelineId: pipeline.id, stageId, ownerId: ownerId || undefined, sourceId: sourceId || undefined,
        value: value ? Number(value) : undefined, priority, followUpAt: followUp ? new Date(followUp).toISOString() : undefined,
        phones: toPhones(phones), emails: toEmails(emails), customFields: Object.keys(custom).length ? custom : undefined, allowDuplicate: allowDup,
      },
      {
        onSuccess: () => { toast.push('success', 'Lead created'); onClose(); },
        onError: (e) => {
          const err = e as { code?: string; details?: { matches?: Array<{ id: string; name: string }> }; message: string };
          if (err.code === 'LEAD_DUPLICATE') setDupMatches(err.details?.matches ?? []);
          else toast.push('error', err.message);
        },
      },
    );

  return (
    <Modal open onClose={onClose} title="New lead" width={620} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim() || !stageId} loading={create.isPending} onClick={submit}>Create lead</Button></>}>
      <div className="space-y-4">
        {dupMatches && (
          <div className="rounded-lg bg-amber-soft px-3 py-2 text-base text-amber-text">
            A lead with this phone or email exists: {dupMatches.map((m) => m.name).join(', ') || 'see list'}.
            <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} /> Create anyway</label>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label="Company"><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></Field>
          <Field label="Stage" required><Select value={stageId} onChange={(e) => setStageId(e.target.value)}>{pipeline.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Owner"><OwnerSelect value={ownerId} onChange={setOwnerId} /></Field>
          <Field label="Source"><Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}><option value="">—</option>{sources.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Value (USD)"><Input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
          <Field label="Priority"><Select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></Select></Field>
          <Field label="Follow-up"><Input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} /></Field>
        </div>
        <Field label="Phones"><ContactPointEditor kind="phone" items={phones} onChange={setPhones} /></Field>
        <Field label="Emails"><ContactPointEditor kind="email" items={emails} onChange={setEmails} /></Field>
        <CustomFieldInputs entityType="lead" value={custom} onChange={setCustom} />
      </div>
    </Modal>
  );
}
