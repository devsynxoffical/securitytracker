'use client';

import { Suspense, useMemo, useState } from 'react';
import { Plus, Download, Kanban, List, Pencil, Trash2, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useDeals, useDeal, useBoard, usePipelines, useAccounts, useContacts, useCrmMutation, type Deal, type Pipeline, type Stage } from '@/lib/queries/crm';
import {
  Button, Card, Table, Th, Td, Badge, stageTone, Skeleton, TableSkeleton, EmptyState, ErrorBanner, Pagination, BulkBar, Drawer, Modal, Field, Input, Select, Tabs, Row, Avatar, Checkbox, SearchInput, Segmented, useToast, PageHeader,
} from '@/components/ui';
import { OwnerSelect, OwnerFilter, TagFilter, TagList, TagPicker, ActivityTimeline, LostReasonModal, CustomFieldInputs, CustomFieldValues } from '@/components/crm/shared';
import { money, compactMoney, fullName, relative, dateOnly, dateTime, downloadText, toLocalInput, fromLocalInput } from '@/lib/format';

export default function DealsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Deals />
    </Suspense>
  );
}

function Deals() {
  const { can } = useAuth();
  const toast = useToast();
  const [id, setId] = useIdParam();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [pipelineId, setPipelineId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [search, setSearch] = useState('');
  const [tagId, setTagId] = useState('');
  const [status, setStatus] = useState<'open' | 'won' | 'lost' | ''>('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Deal[][]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Deal | null | 'new'>(null);
  const [bulkOwner, setBulkOwner] = useState('');
  const [bulkTag, setBulkTag] = useState('');

  const pipelines = usePipelines('deal');
  const pipeline = pipelines.data?.find((p) => p.id === pipelineId) ?? pipelines.data?.find((p) => p.isDefault) ?? pipelines.data?.[0];
  const params = useMemo(() => ({ pipelineId: pipeline?.id, ownerId: ownerId || undefined, search: search || undefined, tagId: tagId || undefined, status: status || undefined, cursor, limit: 50 }), [pipeline?.id, ownerId, search, tagId, status, cursor]);
  const q = useDeals(params, { enabled: view === 'list' && Boolean(pipeline) });
  const rows = useMemo(() => { const seen = new Set<string>(); return [...pages.flat(), ...(q.data?.items ?? [])].filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true))); }, [pages, q.data]);
  const reset = () => { setCursor(undefined); setPages([]); setSelected([]); };
  const loadMore = () => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } };
  const bulk = useCrmMutation((b: Record<string, unknown>) => http.post('/crm/deals/bulk', { ids: selected, ...b }), [['deals']]);
  const runBulk = (b: Record<string, unknown>) => bulk.mutate(b, { onSuccess: () => { setSelected([]); toast.push('success', 'Done'); }, onError: (e) => toast.push('error', (e as Error).message) });
  const exportCsv = () => http.text('/crm/deals/export', { pipelineId: pipeline?.id, ownerId: ownerId || undefined, search: search || undefined, tagId: tagId || undefined, status: status || undefined }).then((t) => downloadText('deals-export.csv', t)).catch((e) => toast.push('error', (e as Error).message));

  return (
    <div>
      <PageHeader title="Deals" subtitle={pipeline?.name} actions={<>
        <Segmented value={view} onChange={setView} options={[{ value: 'board', label: <span className="flex items-center gap-1"><Kanban size={13} /> Board</span> }, { value: 'list', label: <span className="flex items-center gap-1"><List size={13} /> List</span> }]} />
        {can('crm.deals.export') && <Button icon={<Download size={14} />} onClick={exportCsv}>Export</Button>}
        {can('crm.deals.create') && pipeline && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New deal</Button>}
      </>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(pipelines.data?.length ?? 0) > 1 && <div className="w-52"><Select value={pipeline?.id ?? ''} onChange={(e) => { setPipelineId(e.target.value); reset(); }}>{pipelines.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>}
        <div className="w-48"><OwnerFilter value={ownerId} onChange={(v) => { setOwnerId(v); reset(); }} /></div>
        {view === 'list' && <>
          <SearchInput className="w-56" value={search} onChange={(v) => { setSearch(v); reset(); }} placeholder="Deal or account…" />
          <div className="w-40"><TagFilter value={tagId} onChange={(v) => { setTagId(v); reset(); }} /></div>
          <Segmented value={status} onChange={(v) => { setStatus(v); reset(); }} options={[{ value: '', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }]} />
        </>}
      </div>

      {pipelines.isLoading && <Skeleton className="h-72" />}
      {pipelines.isError && <ErrorBanner message={(pipelines.error as Error).message} onRetry={() => pipelines.refetch()} />}
      {pipelines.data && !pipeline && <Card><EmptyState title="No deal pipeline" body="Create a deal pipeline under CRM → Settings → Pipelines." /></Card>}

      {pipeline && view === 'board' && <DealBoard pipelineId={pipeline.id} ownerId={ownerId || undefined} onOpen={setId} canEdit={can('crm.deals.edit')} />}

      {pipeline && view === 'list' && (
        <Card>
          <BulkBar count={selected.length} onClear={() => setSelected([])}>
            {can('crm.deals.assign') && <><div className="w-52"><OwnerSelect value={bulkOwner} onChange={setBulkOwner} emptyLabel="Assign to…" /></div><Button size="sm" disabled={!bulkOwner} loading={bulk.isPending} onClick={() => runBulk({ action: 'assign', ownerId: bulkOwner })}>Assign</Button></>}
            <div className="w-40"><TagFilter value={bulkTag} onChange={setBulkTag} /></div>
            <Button size="sm" disabled={!bulkTag} onClick={() => runBulk({ action: 'add_tag', tagId: bulkTag })}>Add tag</Button>
            {can('crm.deals.delete') && <Button size="sm" variant="danger-outline" icon={<Trash2 size={12} />} onClick={() => window.confirm(`Delete ${selected.length} deals?`) && runBulk({ action: 'delete' })}>Delete</Button>}
          </BulkBar>
          {q.isLoading && pages.length === 0 && <TableSkeleton cols={7} />}
          {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
          {q.data && rows.length === 0 && <EmptyState title="No deals match" action={can('crm.deals.create') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New deal</Button> : undefined} />}
          {rows.length > 0 && (<>
            <Table>
              <thead><tr>
                <Th className="w-8"><Checkbox checked={selected.length === rows.length} onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])} /></Th>
                <Th>Deal</Th><Th>Stage</Th><Th right>Amount</Th><Th right>Prob.</Th><Th>Close</Th><Th>Owner</Th><Th>Tags</Th><Th right>Last activity</Th>
              </tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setId(d.id)}>
                    <Td><span onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.includes(d.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, d.id] : s.filter((x) => x !== d.id)))} /></span></Td>
                    <Td><div className="font-semibold">{d.name}</div><div className="text-xs text-ink-3">{d.account?.name ?? '—'}</div></Td>
                    <Td><Badge tone={stageTone(d.stage.type)}>{d.stage.name}</Badge></Td>
                    <Td right mono>{money(d.amount, d.currency)}</Td>
                    <Td right mono>{d.probability}%</Td>
                    <Td className="text-ink-2">{dateOnly(d.expectedCloseAt)}</Td>
                    <Td>{fullName(d.owner)}</Td>
                    <Td><TagList tags={d.tags} /></Td>
                    <Td right className="text-ink-3">{relative(d.lastActivityAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={loadMore} loading={q.isFetching} />
          </>)}
        </Card>
      )}

      <DealDrawer id={id} onClose={() => setId(null)} onEdit={(d) => setEditing(d)} />
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
          <div key={col.stage.id} className={clsx('flex w-[272px] shrink-0 flex-col rounded-card border bg-surface-2 transition', over === col.stage.id ? 'border-pri bg-pri-soft/40' : 'border-line')}
            onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOver(col.stage.id); } }} onDragLeave={() => setOver(null)} onDrop={() => canEdit && drop(col.stage)}>
            <div className="px-3 py-2.5">
              <div className="flex items-center justify-between"><Badge tone={stageTone(col.stage.type)} dot>{col.stage.name}</Badge><span className="font-mono text-xs text-ink-3">{col.count}</span></div>
              <div className="mt-1 flex items-center justify-between text-xs"><span className="font-mono text-ink">{money(col.total)}</span>{col.stage.type === 'open' && <span className="font-mono text-ink-3">{col.stage.probability}% · {compactMoney(col.weighted)}</span>}</div>
            </div>
            <div className="min-h-[120px] flex-1 space-y-2 px-2 pb-2">
              {col.deals.map((d) => (
                <div key={d.id} draggable={canEdit} onDragStart={() => setDragging(d.id)} onDragEnd={() => { setDragging(null); setOver(null); }} onClick={() => onOpen(d.id)}
                  className={clsx('cursor-pointer rounded-lg border border-line bg-surface p-3 shadow-card transition hover:border-pri', dragging === d.id && 'opacity-50')}>
                  <div className="text-[13px] font-semibold text-ink">{d.name}</div>
                  <div className="text-xs text-ink-3">{d.account?.name ?? '—'}</div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-mono text-ink-2">{money(d.amount, d.currency)}</span>
                    <span className="flex items-center gap-1.5">{d.expectedCloseAt && <span className="text-ink-3">{dateOnly(d.expectedCloseAt)}</span>}{d.owner && <Avatar name={fullName(d.owner)} size={20} />}</span>
                  </div>
                  {d.tags.length > 0 && <div className="mt-2"><TagList tags={d.tags} /></div>}
                </div>
              ))}
              {col.deals.length === 0 && <div className="px-2 py-6 text-center text-xs text-ink-3">Drop deals here</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-card border border-line bg-surface px-4 py-2.5 text-[13px]">
        <span className="text-ink-2">Pipeline total <span className="font-mono font-semibold text-ink">{money(total)}</span></span>
        <span className="text-ink-2">Weighted forecast <span className="font-mono font-semibold text-pri">{money(board.weightedForecast)}</span></span>
      </div>
      <LostReasonModal open={Boolean(lostFor)} onClose={() => setLostFor(null)} busy={move.isPending} onConfirm={(r) => lostFor && move.mutate({ id: lostFor.dealId, stageId: lostFor.stageId, lostReasonId: r }, { onSuccess: () => setLostFor(null), onError: (e) => toast.push('error', (e as Error).message) })} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

function DealDrawer({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (d: Deal) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const q = useDeal(id);
  const [tab, setTab] = useState<'overview' | 'activities' | 'contacts'>('overview');
  const [lostStage, setLostStage] = useState<string | null>(null);
  const [owner, setOwner] = useState('');
  const inv = [['deals'], ['activities'], ['crm', 'dashboard'], ['accounts']];
  const move = useCrmMutation((a: { stageId: string; lostReasonId?: string }) => http.post(`/crm/deals/${id}/stage`, a), inv);
  const assign = useCrmMutation((ownerId: string) => http.post(`/crm/deals/${id}/assign`, { ownerId }), inv);
  const del = useCrmMutation(() => http.del(`/crm/deals/${id}`), [['deals']]);
  const d = q.data;
  const stages = d?.pipeline.stages ?? [];
  const closed = Boolean(d?.wonAt || d?.lostAt);
  const canMove = can('crm.deals.edit') && (!closed || can('crm.deals.reopen'));

  const toStage = (s: Stage) => {
    if (!d || s.id === d.stageId) return;
    if (s.type === 'lost') return setLostStage(s.id);
    move.mutate({ stageId: s.id }, { onError: (e) => toast.push('error', (e as Error).message) });
  };

  return (
    <Drawer open={Boolean(id)} onClose={onClose} title={d?.name ?? 'Deal'} subtitle={d ? `${d.account?.name ?? 'No account'} · ${d.pipeline.name}` : undefined}
      actions={d && <>
        {can('crm.deals.edit') && <Button size="sm" icon={<Pencil size={13} />} onClick={() => onEdit(d)}>Edit</Button>}
        {can('crm.deals.delete') && <Button size="sm" variant="danger-outline" icon={<Trash2 size={13} />} loading={del.isPending} onClick={() => window.confirm('Delete this deal?') && del.mutate(undefined, { onSuccess: () => { toast.push('success', 'Deal deleted'); onClose(); } })}>Delete</Button>}
      </>}>
      {q.isLoading && <div className="space-y-3 p-5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {d && (
        <div className="p-5">
          {/* Stage stepper */}
          <div className="mb-4 flex overflow-x-auto rounded-lg border border-line">
            {stages.map((s, i) => {
              const activeIdx = stages.findIndex((x) => x.id === d.stageId);
              const done = i < activeIdx && s.type === 'open';
              const active = s.id === d.stageId;
              return (
                <button key={s.id} type="button" disabled={!canMove || move.isPending} onClick={() => toStage(s)} title={`${s.probability}%`}
                  className={clsx('flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-r border-line px-3 py-2 text-xs font-semibold last:border-0 disabled:cursor-default',
                    active ? (s.type === 'won' ? 'bg-green text-white' : s.type === 'lost' ? 'bg-red text-white' : 'bg-pri text-white') : done ? 'bg-pri-soft text-pri-2' : 'bg-surface text-ink-2 hover:bg-surface-2')}>
                  {done && <Check size={11} />}{s.name}
                </button>
              );
            })}
          </div>
          {closed && <div className={clsx('mb-4 rounded-lg px-3 py-2 text-[13px]', d.wonAt ? 'bg-green-soft text-green' : 'bg-red-soft text-red')}>{d.wonAt ? `Won ${dateTime(d.wonAt)}` : `Lost ${dateTime(d.lostAt)}${d.lostReason ? ` · ${d.lostReason.name}` : ''}`}{!can('crm.deals.reopen') && ' · reopening needs crm.deals.reopen'}</div>}
          <div className="mb-4 grid grid-cols-4 gap-3">
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Amount</div><div className="mt-1 font-mono text-lg font-semibold">{money(d.amount, d.currency)}</div></div>
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Probability</div><div className="mt-1 font-mono text-lg font-semibold">{d.probability}%</div><div className="text-xs text-ink-3">weighted {money(Number(d.amount ?? 0) * d.probability / 100, d.currency)}</div></div>
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Expected close</div><div className="mt-1 text-[13px] font-semibold">{dateOnly(d.expectedCloseAt)}</div></div>
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Owner</div>
              {can('crm.deals.assign') ? <div className="mt-1 flex gap-1"><OwnerSelect value={owner || d.ownerId || ''} onChange={setOwner} allowEmpty={false} /><Button size="sm" disabled={!owner || owner === d.ownerId} loading={assign.isPending} onClick={() => assign.mutate(owner, { onSuccess: () => toast.push('success', 'Reassigned') })}>Set</Button></div> : <div className="mt-1 text-[13px] font-semibold">{fullName(d.owner)}</div>}
            </div>
          </div>
          <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'overview', label: 'Overview' }, { value: 'activities', label: 'Activities' }, { value: 'contacts', label: 'Contacts', count: d.contacts?.length ?? 0 }]} />
          {tab === 'overview' && (
            <div className="space-y-4">
              <div>
                <Row label="Account">{d.account ? <a className="text-pri hover:underline" href={`/admin/crm/accounts?id=${d.account.id}`}>{d.account.name}</a> : '—'}</Row>
                <Row label="Stage"><Badge tone={stageTone(d.stage.type)}>{d.stage.name}</Badge></Row>
                <Row label="Tags"><TagList tags={d.tags} /></Row>
                <Row label="Created">{dateTime(d.createdAt)}</Row>
                <Row label="Last activity">{relative(d.lastActivityAt)}</Row>
              </div>
              <CustomFieldValues entityType="deal" values={d.custom} />
            </div>
          )}
          {tab === 'activities' && <ActivityTimeline entityType="deal" entityId={d.id} canEdit={can('crm.deals.edit')} />}
          {tab === 'contacts' && ((d.contacts ?? []).length === 0 ? <EmptyState title="No contacts linked" body="Edit the deal to link contacts." /> : (
            <Table><thead><tr><Th>Name</Th><Th>Title</Th><Th>Email</Th><Th>Role</Th></tr></thead><tbody>
              {d.contacts!.map((l) => <tr key={l.contactId} className="hover:bg-surface-2"><Td><a className="font-semibold text-pri hover:underline" href={`/admin/crm/contacts?id=${l.contact.id}`}>{fullName(l.contact)}</a></Td><Td className="text-ink-2">{l.contact.title ?? '—'}</Td><Td className="text-ink-2">{l.contact.emails[0]?.emailLower ?? '—'}</Td><Td>{l.isPrimary && <Badge tone="primary" className="mr-1">Primary</Badge>}{l.role ?? ''}</Td></tr>)}
            </tbody></Table>
          ))}
        </div>
      )}
      <LostReasonModal open={Boolean(lostStage)} onClose={() => setLostStage(null)} busy={move.isPending} onConfirm={(r) => lostStage && move.mutate({ stageId: lostStage, lostReasonId: r }, { onSuccess: () => setLostStage(null), onError: (e) => toast.push('error', (e as Error).message) })} />
    </Drawer>
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
      ownerId: ownerId || undefined, accountId: accountId || undefined, contacts: contactIds.map((id, i) => ({ contactId: id, isPrimary: i === 0 })), tagIds, customFields: custom,
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
