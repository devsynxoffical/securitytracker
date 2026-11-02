'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Download, Kanban, List, Pencil, Trash2, Check, Eye, UserPlus, CalendarClock } from 'lucide-react';
import { clsx } from 'clsx';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useDeals, useDeal, useBoard, usePipelines, useAccounts, useContacts, useActivities, useCrmMutation, type Deal, type Pipeline, type Stage } from '@/lib/queries/crm';
import { Button, Card, Badge, stageTone, Skeleton, EmptyState, ErrorBanner, Pagination, BulkBar, Modal, Field, Input, Select, Tabs, Avatar, Segmented, useToast, PageHeader } from '@/components/ui';
import { DataTable, Menu, AssociationCard, Progress, type Column, type SortState, type MenuItem } from '@/components/ui/advanced';
import { OwnerSelect, TagFilter, TagList, TagPicker, LostReasonModal, CustomFieldInputs } from '@/components/crm/shared';
import { ListShell, OwnerChip, SelectChip, TagFilterChip, SearchChipInput, useMergedRows, type Filters } from '@/components/crm/list-shell';
import { RecordPage, RecordHeader, KpiStrip, EditableProperties, ActivitiesTab, NotesTab, EmailsTab, MetaFooter } from '@/components/crm/record';
import { money, compactMoney, fullName, relative, dateOnly, dateTime, downloadText, toLocalInput, fromLocalInput } from '@/lib/format';

/** Close-date chip: amber within 7 days, red when past, only for open deals. */
function CloseChip({ at, closed }: { at: string | null; closed: boolean }) {
  if (!at) return null;
  const days = Math.ceil((new Date(at).getTime() - Date.now()) / 86_400_000);
  const tone = closed ? 'bg-surface-2 text-ink-3' : days < 0 ? 'bg-red-soft text-red-text' : days <= 7 ? 'bg-amber-soft text-amber-text' : 'bg-surface-2 text-ink-2';
  const label = closed ? dateOnly(at) : days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'today' : days <= 7 ? `in ${days}d` : dateOnly(at);
  return <span className={clsx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium', tone)}><CalendarClock size={10} />{label}</span>;
}

export default function DealsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Deals />
    </Suspense>
  );
}

function Deals() {
  const { can, me } = useAuth();
  const toast = useToast();
  const [id, setId] = useIdParam();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [filters, setFiltersState] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>({ key: 'lastActivityAt', direction: 'desc' });
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Deal[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Deal | null | 'new'>(null);
  const [bulkOwner, setBulkOwner] = useState('');
  const [bulkTag, setBulkTag] = useState('');

  const pipelines = usePipelines('deal');
  const pipeline = pipelines.data?.find((p) => p.id === filters.pipelineId) ?? pipelines.data?.find((p) => p.isDefault) ?? pipelines.data?.[0];
  const reset = () => { setCursor(undefined); setPages([]); setSelected(new Set()); };
  const setFilters = useCallback((f: Filters) => { setFiltersState(f); setCursor(undefined); setPages([]); setSelected(new Set()); }, []);
  const setFilter = (k: string, v: string) => setFilters({ ...filters, [k]: v });
  const onSort = (s: SortState) => { setSort(s); reset(); };

  const params = useMemo(() => ({ pipelineId: pipeline?.id, ownerId: filters.ownerId || undefined, search: filters.search || undefined, tagId: filters.tagId || undefined, status: filters.status || undefined, stageId: filters.stageId || undefined, sort: `${sort.key}:${sort.direction}`, cursor, limit: 50 }), [pipeline?.id, filters, sort, cursor]);
  const q = useDeals(params, { enabled: view === 'list' && Boolean(pipeline) });
  const rows = useMergedRows(pages, q.data?.items);
  const loadMore = () => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } };
  const bulk = useCrmMutation((b: Record<string, unknown>) => http.post('/crm/deals/bulk', { ids: [...selected], ...b }), [['deals']]);
  const runBulk = (b: Record<string, unknown>) => bulk.mutate(b, { onSuccess: () => { setSelected(new Set()); toast.push('success', 'Done'); }, onError: (e) => toast.push('error', (e as Error).message) });
  const assignOne = useCrmMutation((a: { id: string; ownerId: string }) => http.post(`/crm/deals/${a.id}/assign`, { ownerId: a.ownerId }), [['deals']]);
  const delOne = useCrmMutation((did: string) => http.del(`/crm/deals/${did}`), [['deals']]);
  const exportCsv = () => http.text('/crm/deals/export', { pipelineId: pipeline?.id, ownerId: filters.ownerId || undefined, search: filters.search || undefined, tagId: filters.tagId || undefined, status: filters.status || undefined }).then((t) => downloadText('deals-export.csv', t)).catch((e) => toast.push('error', (e as Error).message));

  if (id) return <DealRecord id={id} onBack={() => setId(null)} onEdit={(d) => setEditing(d)} editing={editing} onCloseEdit={() => setEditing(null)} pipelines={pipelines.data ?? []} />;

  const columns: Column<Deal>[] = [
    { key: 'name', header: 'Deal', sortable: true, locked: true, cell: (d) => <div className="min-w-0"><div className="truncate font-semibold text-ink">{d.name}</div><div className="truncate text-xs text-ink-3">{d.account?.name ?? '—'}</div></div> },
    { key: 'stage', header: 'Stage', cell: (d) => <Badge tone={stageTone(d.stage.type)}>{d.stage.name}</Badge> },
    { key: 'amount', header: 'Amount', sortable: true, right: true, mono: true, cell: (d) => money(d.amount, d.currency) },
    { key: 'probability', header: 'Prob.', sortable: true, right: true, cell: (d) => <div className="flex items-center justify-end gap-2"><div className="w-16"><Progress value={d.probability} size={6} /></div><span className="font-mono text-xs text-ink-2">{d.probability}%</span></div> },
    { key: 'expectedCloseAt', header: 'Close', sortable: true, cell: (d) => <CloseChip at={d.expectedCloseAt} closed={Boolean(d.wonAt || d.lostAt)} /> },
    { key: 'owner', header: 'Owner', cell: (d) => (d.owner ? <span className="flex items-center gap-2"><Avatar name={fullName(d.owner)} size={22} />{fullName(d.owner)}</span> : <span className="text-ink-3">Unassigned</span>) },
    { key: 'tags', header: 'Tags', cell: (d) => <TagList tags={d.tags} /> },
    { key: 'createdAt', header: 'Created', sortable: true, cell: (d) => <span className="text-ink-3">{relative(d.createdAt)}</span> },
    { key: 'lastActivityAt', header: 'Last activity', sortable: true, right: true, cell: (d) => <span className="text-ink-3">{relative(d.lastActivityAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Deals" subtitle={pipeline?.name} actions={<>
        <Segmented value={view} onChange={setView} options={[{ value: 'board', label: <span className="flex items-center gap-1"><Kanban size={13} /> Board</span> }, { value: 'list', label: <span className="flex items-center gap-1"><List size={13} /> List</span> }]} />
        {can('crm.deals.export') && <Button icon={<Download size={14} />} onClick={exportCsv}>Export</Button>}
        {can('crm.deals.create') && pipeline && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New deal</Button>}
      </>} />

      <ListShell
        entityType="deal"
        filters={filters}
        onFilters={setFilters}
        chips={
          <>
            {(pipelines.data?.length ?? 0) > 1 && <SelectChip label="Pipeline" value={pipeline?.id ?? ''} onChange={(v) => setFilter('pipelineId', v)} options={(pipelines.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />}
            <OwnerChip value={filters.ownerId ?? ''} onChange={(v) => setFilter('ownerId', v)} />
            {view === 'list' && (
              <>
                <SearchChipInput value={filters.search ?? ''} onChange={(v) => setFilter('search', v)} placeholder="Deal or account…" />
                <SelectChip label="Status" value={filters.status ?? ''} onChange={(v) => setFilter('status', v)} options={[{ value: 'open', label: 'Open' }, { value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }]} />
                <SelectChip label="Stage" value={filters.stageId ?? ''} onChange={(v) => setFilter('stageId', v)} options={(pipeline?.stages ?? []).map((s) => ({ value: s.id, label: s.name }))} />
                <TagFilterChip value={filters.tagId ?? ''} onChange={(v) => setFilter('tagId', v)} />
              </>
            )}
          </>
        }
      >
        {pipelines.isLoading && <Skeleton className="h-72" />}
        {pipelines.isError && <ErrorBanner message={(pipelines.error as Error).message} onRetry={() => pipelines.refetch()} />}
        {pipelines.data && !pipeline && <Card><EmptyState title="No deal pipeline" body="Create a deal pipeline under CRM → Settings → Pipelines." /></Card>}

        {pipeline && view === 'board' && <DealBoard pipelineId={pipeline.id} ownerId={filters.ownerId || undefined} onOpen={setId} canEdit={can('crm.deals.edit')} />}

        {pipeline && view === 'list' && (
          <Card>
            <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
              {can('crm.deals.assign') && <><div className="w-52"><OwnerSelect value={bulkOwner} onChange={setBulkOwner} emptyLabel="Assign to…" /></div><Button size="sm" disabled={!bulkOwner} loading={bulk.isPending} onClick={() => runBulk({ action: 'assign', ownerId: bulkOwner })}>Assign</Button></>}
              <div className="w-40"><TagFilter value={bulkTag} onChange={setBulkTag} /></div>
              <Button size="sm" disabled={!bulkTag} onClick={() => runBulk({ action: 'add_tag', tagId: bulkTag })}>Add tag</Button>
              {can('crm.deals.delete') && <Button size="sm" variant="danger-outline" icon={<Trash2 size={12} />} onClick={() => window.confirm(`Delete ${selected.size} deals?`) && runBulk({ action: 'delete' })}>Delete</Button>}
            </BulkBar>
            <DataTable
              rows={rows}
              columns={columns}
              loading={q.isLoading && pages.length === 0}
              error={q.isError ? (q.error as Error).message : null}
              onRetry={() => q.refetch()}
              sort={sort}
              onSort={onSort}
              selected={selected}
              onSelect={setSelected}
              onRowClick={(d) => setId(d.id)}
              storageKey="crm.deals"
              empty={<EmptyState title="No deals match" action={can('crm.deals.create') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New deal</Button> : undefined} />}
              rowActions={(d) => (
                <Menu
                  items={([
                    { label: 'Open', icon: <Eye size={14} />, onSelect: () => setId(d.id) },
                    ...(can('crm.deals.edit') ? [{ label: 'Edit', icon: <Pencil size={14} />, onSelect: () => setEditing(d) }] : []),
                    ...(can('crm.deals.assign') && me ? [{ label: 'Assign to me', icon: <UserPlus size={14} />, onSelect: () => assignOne.mutate({ id: d.id, ownerId: me.id }, { onError: (e) => toast.push('error', (e as Error).message) }) }] : []),
                    ...(can('crm.deals.delete') ? [{ separator: true } as const, { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => window.confirm(`Delete ${d.name}?`) && delOne.mutate(d.id, { onSuccess: () => toast.push('success', 'Deal deleted'), onError: (e) => toast.push('error', (e as Error).message) }) }] : []),
                  ] as MenuItem[])}
                />
              )}
              footer={rows.length > 0 ? <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={loadMore} loading={q.isFetching} /> : undefined}
            />
          </Card>
        )}
      </ListShell>

      {editing && pipeline && <DealFormModal deal={editing === 'new' ? null : editing} pipeline={pipeline} pipelines={pipelines.data ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board (FR-CRM-27)
// ---------------------------------------------------------------------------

function DealBoard({ pipelineId, ownerId, onOpen, canEdit }: { pipelineId: string; ownerId?: string; onOpen: (id: string) => void; canEdit: boolean }) {
  const toast = useToast();
  const q = useBoard(pipelineId, ownerId);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<{ dealId: string; stageId: string } | null>(null);
  const move = useCrmMutation((a: { id: string; stageId: string; lostReasonId?: string }) => http.post(`/crm/deals/${a.id}/stage`, { stageId: a.stageId, lostReasonId: a.lostReasonId }), [['deals'], ['crm', 'dashboard'], ['accounts']]);

  if (q.isLoading) return <div className="grid grid-cols-5 gap-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-80" />)}</div>;
  if (q.isError) return <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const board = q.data!;
  const drop = (stage: Stage) => {
    const dealId = dragging;
    setDragging(null);
    setOver(null);
    if (!dealId) return;
    const current = board.columns.find((c) => c.deals.some((d) => d.id === dealId));
    if (!current || current.stage.id === stage.id) return;
    if (stage.type === 'lost') return setLostFor({ dealId, stageId: stage.id });
    move.mutate({ id: dealId, stageId: stage.id }, { onError: (e) => toast.push('error', (e as Error).message) });
  };
  const total = board.columns.reduce((s, c) => s + c.total, 0);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {board.columns.map((col) => (
          <div
            key={col.stage.id}
            className={clsx('flex w-[276px] shrink-0 flex-col rounded-card border bg-surface-2 transition-colors', over === col.stage.id ? 'border-pri bg-pri-soft/50 ring-2 ring-pri-soft' : dragging ? 'border-dashed border-ink-3' : 'border-line')}
            onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOver(col.stage.id); } }}
            onDragLeave={() => setOver(null)}
            onDrop={() => canEdit && drop(col.stage)}
          >
            <div className="px-3 py-2.5">
              <div className="flex items-center justify-between"><Badge tone={stageTone(col.stage.type)} dot>{col.stage.name}</Badge><span className="font-mono text-xs text-ink-3">{col.count}</span></div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="font-mono font-semibold text-ink">{money(col.total)}</span>
                {col.stage.type === 'open' && <span className="font-mono text-ink-3" title="Weighted by stage probability">{col.stage.probability}% · {compactMoney(col.weighted)}</span>}
              </div>
            </div>
            <div className="min-h-[120px] flex-1 space-y-2 px-2 pb-2">
              {col.deals.map((d) => (
                <div
                  key={d.id}
                  draggable={canEdit}
                  onDragStart={() => setDragging(d.id)}
                  onDragEnd={() => { setDragging(null); setOver(null); }}
                  onClick={() => onOpen(d.id)}
                  className={clsx('group cursor-pointer rounded-lg border border-line bg-surface p-3 shadow-card transition hover:border-pri hover:shadow-pop', dragging === d.id && 'opacity-50 ring-2 ring-pri-soft')}
                >
                  <div className="truncate text-base font-semibold text-ink">{d.name}</div>
                  <div className="truncate text-xs text-ink-3">{d.account?.name ?? '—'}</div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="font-mono text-base font-semibold text-ink">{money(d.amount, d.currency)}</span>
                    <span className="flex items-center gap-1.5">
                      <CloseChip at={d.expectedCloseAt} closed={Boolean(d.wonAt || d.lostAt)} />
                      {d.owner && <Avatar name={fullName(d.owner)} size={20} />}
                    </span>
                  </div>
                  {d.tags.length > 0 && <div className="mt-2"><TagList tags={d.tags} /></div>}
                </div>
              ))}
              {col.deals.length === 0 && <div className="rounded-lg border border-dashed border-line px-2 py-6 text-center text-xs text-ink-3">{dragging ? 'Drop here' : 'No deals'}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-card border border-line bg-surface px-4 py-2.5 text-base">
        <span className="text-ink-2">Pipeline total <span className="font-mono font-semibold text-ink">{money(total)}</span></span>
        <span className="text-ink-2">Weighted forecast <span className="font-mono font-semibold text-pri-2">{money(board.weightedForecast)}</span></span>
      </div>
      <LostReasonModal open={Boolean(lostFor)} onClose={() => setLostFor(null)} busy={move.isPending} onConfirm={(r) => lostFor && move.mutate({ id: lostFor.dealId, stageId: lostFor.stageId, lostReasonId: r }, { onSuccess: () => setLostFor(null), onError: (e) => toast.push('error', (e as Error).message) })} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Record page
// ---------------------------------------------------------------------------

function DealRecord({ id, onBack, onEdit, editing, onCloseEdit, pipelines }: { id: string; onBack: () => void; onEdit: (d: Deal) => void; editing: Deal | null | 'new'; onCloseEdit: () => void; pipelines: Pipeline[] }) {
  const { can } = useAuth();
  const toast = useToast();
  const q = useDeal(id);
  const activities = useActivities('deal', id);
  const [tab, setTab] = useState<'overview' | 'activities' | 'emails' | 'notes'>('overview');
  const [lostStage, setLostStage] = useState<string | null>(null);
  const [owner, setOwner] = useState('');
  const inv = [['deals'], ['activities'], ['crm', 'dashboard'], ['accounts']];
  const move = useCrmMutation((a: { stageId: string; lostReasonId?: string }) => http.post(`/crm/deals/${id}/stage`, a), inv);
  const assign = useCrmMutation((ownerId: string) => http.post(`/crm/deals/${id}/assign`, { ownerId }), inv);
  const del = useCrmMutation(() => http.del(`/crm/deals/${id}`), [['deals']]);
  const d = q.data;
  const stages = d?.pipeline.stages ?? [];
  const closed = Boolean(d?.wonAt || d?.lostAt);
  const canEdit = can('crm.deals.edit');
  const canMove = canEdit && (!closed || can('crm.deals.reopen'));
  const pipelineForForm = pipelines.find((p) => p.id === d?.pipelineId) ?? pipelines[0];

  const toStage = (s: Stage) => {
    if (!d || s.id === d.stageId) return;
    if (s.type === 'lost') return setLostStage(s.id);
    move.mutate({ stageId: s.id }, { onError: (e) => toast.push('error', (e as Error).message) });
  };
  const wonStage = stages.find((s) => s.type === 'won');
  const weighted = d ? (Number(d.amount ?? 0) * d.probability) / 100 : 0;
  const daysToClose = d?.expectedCloseAt ? Math.ceil((new Date(d.expectedCloseAt).getTime() - Date.now()) / 86_400_000) : null;

  return (
    <RecordPage
      onBack={onBack}
      loading={q.isLoading}
      error={q.isError ? (q.error as Error).message : null}
      onRetry={() => q.refetch()}
      header={
        d && (
          <>
            <RecordHeader
              avatar={<Avatar name={d.name} size={44} />}
              title={d.name}
              subtitle={<span>{d.account ? <Link className="hover:underline" href={`/admin/crm/accounts?id=${d.account.id}`}>{d.account.name}</Link> : 'No account'} · {d.pipeline.name}</span>}
              badges={<><Badge tone={stageTone(d.stage.type)} dot>{d.stage.name}</Badge>{d.wonAt && <Badge tone="green">Won {dateOnly(d.wonAt)}</Badge>}{d.lostAt && <Badge tone="red">Lost{d.lostReason ? ` · ${d.lostReason.name}` : ''}</Badge>}{d.tags.length > 0 && <TagList tags={d.tags} />}</>}
              actions={
                <>
                  {can('crm.deals.assign') && (
                    <div className="flex gap-1">
                      <div className="w-44"><OwnerSelect value={owner || d.ownerId || ''} onChange={setOwner} allowEmpty={false} /></div>
                      <Button disabled={!owner || owner === d.ownerId} loading={assign.isPending} onClick={() => assign.mutate(owner, { onSuccess: () => toast.push('success', 'Reassigned') })}>Assign</Button>
                    </div>
                  )}
                  {canEdit && <Button icon={<Pencil size={13} />} onClick={() => onEdit(d)}>Edit</Button>}
                  {can('crm.deals.delete') && <Button variant="danger-outline" icon={<Trash2 size={13} />} loading={del.isPending} onClick={() => window.confirm('Delete this deal?') && del.mutate(undefined, { onSuccess: () => { toast.push('success', 'Deal deleted'); onBack(); } })}>Delete</Button>}
                </>
              }
              primary={canMove && !closed && wonStage ? <Button variant="primary" icon={<Check size={14} />} loading={move.isPending} onClick={() => toStage(wonStage)}>Mark won</Button> : undefined}
            />
            {/* Stage stepper */}
            <div className="mt-4 flex overflow-x-auto rounded-lg border border-line">
              {stages.map((s, i) => {
                const activeIdx = stages.findIndex((x) => x.id === d.stageId);
                const done = i < activeIdx && s.type === 'open';
                const active = s.id === d.stageId;
                return (
                  <button key={s.id} type="button" disabled={!canMove || move.isPending} onClick={() => toStage(s)} title={`${s.probability}%`}
                    className={clsx('flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-r border-line px-3 py-2 text-xs font-semibold transition last:border-0 disabled:cursor-default',
                      active ? (s.type === 'won' ? 'bg-green text-white' : s.type === 'lost' ? 'bg-red text-white' : 'bg-pri text-white') : done ? 'bg-pri-soft text-pri-2' : 'bg-surface text-ink-2 hover:bg-surface-2')}>
                    {done && <Check size={11} />}{s.name}
                  </button>
                );
              })}
            </div>
            {closed && !can('crm.deals.reopen') && <div className="mt-2 text-xs text-ink-3">Reopening a closed deal needs crm.deals.reopen.</div>}
          </>
        )
      }
      left={
        d && (
          <EditableProperties
            entityType="deal"
            patchPath={`/crm/deals/${d.id}`}
            canEdit={canEdit}
            invalidate={inv}
            custom={d.custom}
            properties={[
              { key: 'name', label: 'Deal name', value: d.name, raw: d.name, editable: true },
              { key: 'amount', label: 'Amount', value: money(d.amount, d.currency), raw: d.amount === null ? '' : String(d.amount), type: 'number', editable: true, mono: true },
              { key: 'probability', label: 'Probability', value: `${d.probability}%`, raw: String(d.probability), type: 'number', editable: true, mono: true },
              { key: 'expectedCloseAt', label: 'Expected close', value: d.expectedCloseAt ? dateOnly(d.expectedCloseAt) : null, raw: d.expectedCloseAt ? d.expectedCloseAt.slice(0, 10) : '', type: 'date', editable: true },
              { key: 'account', label: 'Account', value: d.account ? <Link className="text-pri hover:underline" href={`/admin/crm/accounts?id=${d.account.id}`}>{d.account.name}</Link> : null },
              { key: 'pipeline', label: 'Pipeline', value: d.pipeline.name },
              { key: 'owner', label: 'Owner', value: d.owner ? fullName(d.owner) : 'Unassigned' },
              { key: 'createdAt', label: 'Created', value: dateTime(d.createdAt) },
            ]}
            map={(key, value) => {
              switch (key) {
                case 'name': return value.trim() ? { name: value.trim() } : null;
                case 'amount': return { amount: value === '' ? undefined : Number(value) };
                case 'probability': return { probability: Math.max(0, Math.min(100, Number(value))) };
                case 'expectedCloseAt': return { expectedCloseAt: value ? new Date(value).toISOString() : undefined };
                default: return null;
              }
            }}
          />
        )
      }
      main={
        d && (
          <>
            <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'overview', label: 'Overview' }, { value: 'activities', label: 'Activities', count: activities.data?.items.length }, { value: 'emails', label: 'Emails' }, { value: 'notes', label: 'Notes' }]} />
            {tab === 'overview' && (
              <>
                <KpiStrip items={[
                  { label: 'Amount', value: money(d.amount, d.currency) },
                  { label: 'Weighted', value: money(weighted, d.currency), hint: `${d.probability}% probability`, tone: 'primary' },
                  { label: 'Close', value: <span className="text-base">{d.expectedCloseAt ? dateOnly(d.expectedCloseAt) : '—'}</span>, hint: daysToClose === null ? undefined : closed ? 'closed' : daysToClose < 0 ? `${Math.abs(daysToClose)} days overdue` : `in ${daysToClose} days`, tone: !closed && daysToClose !== null && daysToClose < 0 ? 'red' : !closed && daysToClose !== null && daysToClose <= 7 ? 'amber' : undefined },
                  { label: 'Activities', value: activities.data?.items.length ?? '—', hint: `${(activities.data?.items ?? []).filter((a) => a.status === 'planned').length} planned` },
                ]} />
                <ActivitiesTab entityType="deal" entityId={d.id} canEdit={canEdit} />
                <MetaFooter createdAt={d.createdAt} lastActivityAt={d.lastActivityAt} />
              </>
            )}
            {tab === 'activities' && <ActivitiesTab entityType="deal" entityId={d.id} canEdit={canEdit} />}
            {tab === 'emails' && <EmailsTab entityType="deal" entityId={d.id} />}
            {tab === 'notes' && <NotesTab entityType="deal" entityId={d.id} canEdit={canEdit} />}
            <LostReasonModal open={Boolean(lostStage)} onClose={() => setLostStage(null)} busy={move.isPending} onConfirm={(r) => lostStage && move.mutate({ stageId: lostStage, lostReasonId: r }, { onSuccess: () => setLostStage(null), onError: (e) => toast.push('error', (e as Error).message) })} />
            {editing && pipelineForForm && <DealFormModal deal={editing === 'new' ? null : editing} pipeline={pipelineForForm} pipelines={pipelines} onClose={onCloseEdit} />}
          </>
        )
      }
      right={
        d && (
          <>
            <AssociationCard title="Contacts" count={d.contacts?.length ?? 0} emptyText="No contacts linked — edit the deal to link some.">
              {(d.contacts ?? []).length > 0 && (
                <ul className="space-y-0.5">
                  {d.contacts!.map((l) => (
                    <li key={l.contactId}>
                      <Link href={`/admin/crm/contacts?id=${l.contact.id}`} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2">
                        <Avatar name={fullName(l.contact)} size={22} />
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{fullName(l.contact)}</span><span className="block truncate text-xs text-ink-3">{[l.contact.title, l.contact.emails[0]?.emailLower].filter(Boolean).join(' · ')}</span></span>
                        {l.isPrimary && <Badge tone="primary">Primary</Badge>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </AssociationCard>
            <AssociationCard title="Account" emptyText="No account linked">
              {d.account && (
                <Link href={`/admin/crm/accounts?id=${d.account.id}`} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2">
                  <Avatar name={d.account.name} size={24} />
                  <span className="min-w-0"><span className="block truncate font-medium text-ink">{d.account.name}</span><span className="block truncate text-xs text-ink-3">{d.account.domain ?? ''}</span></span>
                </Link>
              )}
            </AssociationCard>
          </>
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function DealFormModal({ deal, pipeline, pipelines, onClose }: { deal: Deal | null; pipeline: Pipeline; pipelines: Pipeline[]; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(deal?.name ?? '');
  const [pipelineId, setPipelineId] = useState(deal?.pipelineId ?? pipeline.id);
  const pl = pipelines.find((p) => p.id === pipelineId) ?? pipeline;
  const [stageId, setStageId] = useState(deal?.stageId ?? pl.stages[0]?.id ?? '');
  const [amount, setAmount] = useState(deal?.amount ? String(deal.amount) : '');
  const [currency, setCurrency] = useState(deal?.currency ?? 'USD');
  const [probability, setProbability] = useState(deal ? String(deal.probability) : '');
  const [closeAt, setCloseAt] = useState(toLocalInput(deal?.expectedCloseAt));
  const [ownerId, setOwnerId] = useState(deal?.ownerId ?? '');
  const [accountId, setAccountId] = useState(deal?.accountId ?? '');
  const [accountSearch, setAccountSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contactIds, setContactIds] = useState<string[]>(deal?.contacts?.map((c) => c.contactId) ?? []);
  const [tagIds, setTagIds] = useState<string[]>(deal?.tags.map((t) => t.id) ?? []);
  const [custom, setCustom] = useState<Record<string, unknown>>(deal?.custom ?? {});
  const accounts = useAccounts({ search: accountSearch || undefined, limit: 20 });
  const contacts = useContacts({ search: contactSearch || undefined, accountId: accountId || undefined, limit: 20 });
  const save = useCrmMutation((p: Record<string, unknown>) => (deal ? http.patch(`/crm/deals/${deal.id}`, p) : http.post('/crm/deals', p)), [['deals'], ['activities'], ['crm', 'dashboard'], ['accounts'], ['contacts']]);

  const submit = () => save.mutate(
    {
      name, amount: amount ? Number(amount) : undefined, currency, probability: probability ? Number(probability) : undefined, expectedCloseAt: fromLocalInput(closeAt),
      ownerId: ownerId || undefined, accountId: accountId || undefined, contacts: contactIds.map((cid, i) => ({ contactId: cid, isPrimary: i === 0 })), tagIds, customFields: custom,
      ...(deal ? {} : { pipelineId, stageId }),
    },
    { onSuccess: () => { toast.push('success', deal ? 'Deal updated' : 'Deal created'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) },
  );
  const knownContacts = [...(deal?.contacts?.map((c) => ({ id: c.contact.id, firstName: c.contact.firstName, lastName: c.contact.lastName })) ?? []), ...(contacts.data?.items ?? [])].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);

  return (
    <Modal open onClose={onClose} title={deal ? 'Edit deal' : 'New deal'} width={640} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim() || (!deal && !stageId)} loading={save.isPending} onClick={submit}>{deal ? 'Save' : 'Create deal'}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deal name" required className="col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          {!deal && <>
            <Field label="Pipeline" required><Select value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); const p = pipelines.find((x) => x.id === e.target.value); setStageId(p?.stages[0]?.id ?? ''); }}>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Stage" required><Select value={stageId} onChange={(e) => setStageId(e.target.value)}>{pl.stages.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.probability}%)</option>)}</Select></Field>
          </>}
          <Field label="Amount"><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Currency"><Select value={currency} onChange={(e) => setCurrency(e.target.value)}>{['USD', 'EUR', 'GBP', 'PKR', 'AED', 'INR'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Probability %" hint="Blank = stage default"><Input type="number" min={0} max={100} value={probability} onChange={(e) => setProbability(e.target.value)} /></Field>
          <Field label="Expected close"><Input type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} /></Field>
          <Field label="Owner"><OwnerSelect value={ownerId} onChange={setOwnerId} /></Field>
          <Field label="Account"><div className="space-y-1"><Input value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Search accounts…" /><Select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">No account</option>{deal?.account && !accounts.data?.items.some((a) => a.id === deal.account!.id) && <option value={deal.account.id}>{deal.account.name}</option>}{accounts.data?.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></div></Field>
        </div>
        <Field label="Contacts" hint="First selected is the primary contact">
          <Input className="mb-2" value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Search contacts…" />
          <div className="flex flex-wrap gap-2">
            {knownContacts.map((c) => { const on = contactIds.includes(c.id); return <button key={c.id} type="button" onClick={() => setContactIds(on ? contactIds.filter((x) => x !== c.id) : [...contactIds, c.id])} className={clsx('rounded-full border px-2.5 py-0.5 text-xs font-semibold', on ? 'border-pri bg-pri-soft text-pri-2' : 'border-line text-ink-2 hover:bg-surface-2')}>{on && <Check size={10} className="mr-1 inline" />}{fullName(c)}</button>; })}
            {knownContacts.length === 0 && <span className="text-xs text-ink-3">No contacts found.</span>}
          </div>
        </Field>
        <Field label="Tags"><TagPicker value={tagIds} onChange={setTagIds} /></Field>
        <CustomFieldInputs entityType="deal" value={custom} onChange={setCustom} />
      </div>
    </Modal>
  );
}
