'use client';

import { Suspense, useMemo, useState } from 'react';
import { Plus, Kanban, List, Sparkles, Phone, Mail, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useLeads, useLead, usePipelines, useSources, useCrmMutation, useAccounts, type Lead, type Stage, type Pipeline } from '@/lib/queries/crm';
import {
  Button, Card, Table, Th, Td, Badge, stageTone, Skeleton, TableSkeleton, EmptyState, ErrorBanner, Pagination, BulkBar, Drawer, Modal, Field, Input, Select, Textarea, Tabs, Row, Segmented, Avatar, Checkbox, SearchInput, useToast, PageHeader,
} from '@/components/ui';
import { OwnerSelect, OwnerFilter, ActivityTimeline, LostReasonModal, CustomFieldInputs, CustomFieldValues, ContactPointEditor, toPhones, toEmails, type ContactPoint } from '@/components/crm/shared';
import { money, fullName, relative, dateTime, phoneDisplay, titleCase } from '@/lib/format';

export default function LeadsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Leads />
    </Suspense>
  );
}

function Leads() {
  const { can } = useAuth();
  const toast = useToast();
  const [id, setId] = useIdParam();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [stageId, setStageId] = useState('');
  const [status, setStatus] = useState<'open' | 'clients' | 'all'>('open');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Lead[][]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [bulkOwner, setBulkOwner] = useState('');

  const pipelines = usePipelines('lead');
  const pipeline = pipelines.data?.find((p) => p.isDefault) ?? pipelines.data?.[0];
  const params = useMemo(
    () => ({ search: search || undefined, ownerId: ownerId || undefined, stageId: stageId || undefined, isClient: status === 'clients' ? true : undefined, cursor, limit: 50 }),
    [search, ownerId, stageId, status, cursor],
  );
  const q = useLeads(params);
  const rows = useMemo(() => {
    const all = [...pages.flat(), ...(q.data?.items ?? [])];
    const seen = new Set<string>();
    return all.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true))).filter((l) => (status === 'open' ? !l.convertedAt && !l.wonAt && !l.lostAt : true));
  }, [pages, q.data, status]);

  const reset = () => {
    setCursor(undefined);
    setPages([]);
    setSelected([]);
  };
  const loadMore = () => {
    if (q.data?.nextCursor) {
      setPages((p) => [...p, q.data!.items]);
      setCursor(q.data.nextCursor);
    }
  };

  const bulkAssign = useCrmMutation((o: string) => http.post('/leads/bulk-assign', { leadIds: selected, ownerId: o }), [['leads']]);

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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={status} onChange={(v) => { setStatus(v); reset(); }} options={[{ value: 'open', label: 'Open' }, { value: 'clients', label: 'Clients' }, { value: 'all', label: 'All' }]} />
        <SearchInput className="w-64" value={search} onChange={(v) => { setSearch(v); reset(); }} placeholder="Search name or company…" />
        <div className="w-48"><OwnerFilter value={ownerId} onChange={(v) => { setOwnerId(v); reset(); }} /></div>
        <div className="w-48">
          <Select value={stageId} onChange={(e) => { setStageId(e.target.value); reset(); }}>
            <option value="">All stages</option>
            {pipeline?.stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {view === 'board' ? (
        <LeadBoard pipeline={pipeline} leads={rows} loading={q.isLoading || pipelines.isLoading} error={q.error as Error | null} onRetry={() => q.refetch()} onOpen={setId} canEdit={can('crm.leads.edit')} />
      ) : (
        <Card>
          <BulkBar count={selected.length} onClear={() => setSelected([])}>
            {can('crm.leads.assign') && (
              <>
                <div className="w-56"><OwnerSelect value={bulkOwner} onChange={setBulkOwner} emptyLabel="Assign to…" /></div>
                <Button size="sm" variant="primary" disabled={!bulkOwner} loading={bulkAssign.isPending} onClick={() => bulkAssign.mutate(bulkOwner, { onSuccess: () => { setSelected([]); toast.push('success', 'Leads reassigned'); } })}>
                  Assign
                </Button>
              </>
            )}
          </BulkBar>
          {q.isLoading && pages.length === 0 && <TableSkeleton cols={7} />}
          {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
          {q.data && rows.length === 0 && (
            <EmptyState title="No leads match" body="Change the filters or create a lead." action={can('crm.leads.create') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New lead</Button> : undefined} />
          )}
          {rows.length > 0 && (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th className="w-8"><Checkbox checked={selected.length === rows.length} onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])} /></Th>
                    <Th>Lead</Th>
                    <Th>Stage</Th>
                    <Th>Owner</Th>
                    <Th>Contact</Th>
                    <Th right>Value</Th>
                    <Th>Priority</Th>
                    <Th right>Last activity</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setId(l.id)}>
                      <Td className="w-8" ><span onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.includes(l.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, l.id] : s.filter((x) => x !== l.id)))} /></span></Td>
                      <Td>
                        <div className="font-semibold">{l.name}</div>
                        <div className="text-xs text-ink-3">{l.companyName ?? '—'}</div>
                      </Td>
                      <Td>
                        <Badge tone={stageTone(l.stage.type)}>{l.stage.name}</Badge>
                        {l.convertedAt && <Badge tone="violet" className="ml-1">Converted</Badge>}
                      </Td>
                      <Td>{l.owner ? <span className="flex items-center gap-2"><Avatar name={fullName(l.owner)} size={22} />{fullName(l.owner)}</span> : <span className="text-ink-3">Unassigned</span>}</Td>
                      <Td className="text-ink-2">
                        <div className="font-mono text-xs">{l.phones[0] ? phoneDisplay(l.phones[0].phoneE164) : ''}</div>
                        <div className="text-xs">{l.emails[0]?.emailLower ?? ''}</div>
                      </Td>
                      <Td right mono>{money(l.value, l.currency)}</Td>
                      <Td><Badge tone={l.priority === 'high' ? 'red' : l.priority === 'low' ? 'gray' : 'amber'}>{titleCase(l.priority)}</Badge></Td>
                      <Td right className="text-ink-3">{relative(l.lastActivityAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={loadMore} loading={q.isFetching} />
            </>
          )}
        </Card>
      )}

      <LeadDrawer id={id} onClose={() => setId(null)} pipeline={pipeline} />
      {creating && pipeline && <LeadFormModal pipeline={pipeline} onClose={() => setCreating(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

function LeadBoard({ pipeline, leads, loading, error, onRetry, onOpen, canEdit }: { pipeline?: Pipeline; leads: Lead[]; loading: boolean; error: Error | null; onRetry: () => void; onOpen: (id: string) => void; canEdit: boolean }) {
  const toast = useToast();
  const [lostFor, setLostFor] = useState<{ leadId: string; stageId: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const move = useCrmMutation((a: { id: string; stageId: string; lostReasonId?: string }) => http.post(`/leads/${a.id}/stage`, { stageId: a.stageId, lostReasonId: a.lostReasonId }), [['leads']]);

  if (loading) return <div className="grid grid-cols-5 gap-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-72" />)}</div>;
  if (error) return <ErrorBanner message={error.message} onRetry={onRetry} />;
  if (!pipeline) return <EmptyState title="No lead pipeline" body="Create one under CRM → Settings → Pipelines." />;

  const drop = (stage: Stage) => {
    if (!dragging) return;
    const lead = leads.find((l) => l.id === dragging);
    setDragging(null);
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
            <div key={s.id} className={clsx('flex w-[260px] shrink-0 flex-col rounded-card border bg-surface-2', dragging ? 'border-dashed border-pri' : 'border-line')} onDragOver={(e) => canEdit && e.preventDefault()} onDrop={() => canEdit && drop(s)}>
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-ink"><Badge tone={stageTone(s.type)} dot>{s.name}</Badge><span className="font-mono text-xs text-ink-3">{items.length}</span></div>
                <span className="font-mono text-xs text-ink-2">{money(total)}</span>
              </div>
              <div className="flex-1 space-y-2 px-2 pb-2">
                {items.map((l) => (
                  <div key={l.id} draggable={canEdit} onDragStart={() => setDragging(l.id)} onDragEnd={() => setDragging(null)} onClick={() => onOpen(l.id)} className="cursor-pointer rounded-lg border border-line bg-surface p-3 shadow-card hover:border-pri">
                    <div className="text-[13px] font-semibold text-ink">{l.name}</div>
                    <div className="text-xs text-ink-3">{l.companyName ?? '—'}</div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-mono text-ink-2">{money(l.value, l.currency)}</span>
                      {l.owner && <Avatar name={fullName(l.owner)} size={20} />}
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="px-2 py-6 text-center text-xs text-ink-3">Empty</div>}
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
// Drawer
// ---------------------------------------------------------------------------

function LeadDrawer({ id, onClose, pipeline }: { id: string | null; onClose: () => void; pipeline?: Pipeline }) {
  const { can } = useAuth();
  const toast = useToast();
  const q = useLead(id);
  const [tab, setTab] = useState<'overview' | 'activities'>('overview');
  const [converting, setConverting] = useState(false);
  const [lostStage, setLostStage] = useState<string | null>(null);
  const [owner, setOwner] = useState('');
  const inv = [['leads'], ['activities']];
  const move = useCrmMutation((a: { stageId: string; lostReasonId?: string }) => http.post(`/leads/${id}/stage`, a), inv);
  const assign = useCrmMutation((ownerId: string) => http.post(`/leads/${id}/assign`, { ownerId }), inv);
  const lead = q.data;
  const stages = lead?.pipeline?.stages ?? pipeline?.stages ?? [];
  const frozen = Boolean(lead?.convertedAt);

  const changeStage = (stageId: string) => {
    const s = stages.find((x) => x.id === stageId);
    if (!s) return;
    if (s.type === 'lost') return setLostStage(stageId);
    move.mutate({ stageId }, { onError: (e) => toast.push('error', (e as Error).message) });
  };

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      title={lead?.name ?? 'Lead'}
      subtitle={lead ? `${lead.companyName ?? 'No company'} · owner ${fullName(lead.owner)}` : undefined}
      actions={
        lead && !frozen && can('crm.leads.convert') ? (
          <Button variant="primary" size="sm" icon={<Sparkles size={13} />} onClick={() => setConverting(true)}>
            Convert
          </Button>
        ) : undefined
      }
    >
      {q.isLoading && <div className="space-y-3 p-5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {lead && (
        <div className="p-5">
          {frozen && (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-violet-soft px-3 py-2 text-[13px] text-violet">
              <span>Converted {dateTime(lead.convertedAt)}. This lead is read-only.</span>
              <span className="flex gap-3 text-xs font-semibold">
                {lead.contactId && <a href={`/admin/crm/contacts?id=${lead.contactId}`} className="hover:underline">Contact <ArrowRight size={11} className="inline" /></a>}
                {lead.accountId && <a href={`/admin/crm/accounts?id=${lead.accountId}`} className="hover:underline">Account <ArrowRight size={11} className="inline" /></a>}
                {lead.dealId && <a href={`/admin/crm/deals?id=${lead.dealId}`} className="hover:underline">Deal <ArrowRight size={11} className="inline" /></a>}
              </span>
            </div>
          )}
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Stage</div>
              {can('crm.leads.edit') && !frozen ? (
                <Select className="mt-1 h-8 text-xs" value={lead.stageId} onChange={(e) => changeStage(e.target.value)}>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              ) : <div className="mt-1"><Badge tone={stageTone(lead.stage.type)}>{lead.stage.name}</Badge></div>}
            </div>
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Value</div><div className="mt-1 font-mono text-lg font-semibold">{money(lead.value, lead.currency)}</div></div>
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Owner</div>
              {can('crm.leads.assign') && !frozen ? (
                <div className="mt-1 flex gap-1"><OwnerSelect value={owner || lead.ownerId || ''} onChange={setOwner} allowEmpty={false} /><Button size="sm" disabled={!owner || owner === lead.ownerId} loading={assign.isPending} onClick={() => assign.mutate(owner, { onSuccess: () => toast.push('success', 'Lead reassigned') })}>Set</Button></div>
              ) : <div className="mt-1 text-[13px] font-semibold">{fullName(lead.owner)}</div>}
            </div>
          </div>

          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'activities', label: 'Activities' }]} className="mb-4" />

          {tab === 'overview' && (
            <div className="space-y-4">
              <div>
                <Row label="Company">{lead.companyName ?? '—'}</Row>
                <Row label="Phones">{lead.phones.length ? lead.phones.map((p) => <span key={p.id} className="mr-3 inline-flex items-center gap-1 font-mono"><Phone size={11} />{phoneDisplay(p.phoneE164)} <span className="text-ink-3">{p.label}</span></span>) : '—'}</Row>
                <Row label="Emails">{lead.emails.length ? lead.emails.map((e) => <span key={e.id} className="mr-3 inline-flex items-center gap-1"><Mail size={11} />{e.emailLower} <span className="text-ink-3">{e.label}</span></span>) : '—'}</Row>
                <Row label="Priority">{titleCase(lead.priority)}</Row>
                <Row label="Follow-up">{dateTime(lead.followUpAt)}</Row>
                <Row label="Do not call">{lead.doNotCall ? <Badge tone="red">Yes</Badge> : 'No'}</Row>
                <Row label="Created">{dateTime(lead.createdAt)}</Row>
              </div>
              <CustomFieldValues entityType="lead" values={lead.custom} />
              {(lead.notes?.length || lead.callLogs?.length) ? (
                <div>
                  <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Legacy notes and calls</div>
                  <ul className="space-y-1 text-[13px]">
                    {lead.notes?.map((n) => <li key={n.id} className="rounded bg-surface-2 px-3 py-2"><span className="text-ink-3">{relative(n.createdAt)}</span> — {n.body}</li>)}
                    {lead.callLogs?.map((c) => <li key={c.id} className="rounded bg-surface-2 px-3 py-2"><span className="text-ink-3">{relative(c.occurredAt)}</span> — {c.direction} call, {c.outcome}, {Math.round(c.durationSeconds / 60)} min{c.notes ? ` — ${c.notes}` : ''}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
          {tab === 'activities' && <ActivityTimeline entityType="lead" entityId={lead.id} canEdit={can('crm.leads.edit') && !frozen} />}
        </div>
      )}
      <LostReasonModal open={Boolean(lostStage)} onClose={() => setLostStage(null)} busy={move.isPending} onConfirm={(r) => lostStage && move.mutate({ stageId: lostStage, lostReasonId: r }, { onSuccess: () => setLostStage(null), onError: (e) => toast.push('error', (e as Error).message) })} />
      {converting && lead && <ConvertModal lead={lead} onClose={() => setConverting(false)} />}
    </Drawer>
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
        <Section title="Contact" hint="Phones and emails are copied from the lead.">
          <div className="grid grid-cols-3 gap-3">
            <Field label="First name" required><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></Field>
            <Field label="Last name"><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
            <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Operations Manager" /></Field>
          </div>
        </Section>
        <Section title="Account">
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
        </Section>
        <Section title="Deal">
          <Checkbox checked={withDeal} onChange={(e) => setWithDeal(e.target.checked)} label="Create a deal" />
          {withDeal && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Deal name" required><Input value={dealName} onChange={(e) => setDealName(e.target.value)} /></Field>
              <Field label={`Amount (${lead.currency})`}><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="Pipeline" required><Select value={effectivePipelineId} onChange={(e) => { setPipelineId(e.target.value); setStageId(''); }}>{pipelines.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field label="Stage" required><Select value={effectiveStageId} onChange={(e) => setStageId(e.target.value)}>{pipeline?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            </div>
          )}
        </Section>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner of new records"><OwnerSelect value={ownerId} onChange={setOwnerId} emptyLabel="Same as lead owner" /></Field>
          <div className="flex items-end pb-2"><Checkbox checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} label="Create even if a duplicate contact exists" /></div>
        </div>
      </div>
    </Modal>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2"><span className="text-[13px] font-semibold text-ink">{title}</span>{hint && <span className="text-xs text-ink-3">{hint}</span>}</div>
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
          const err = e as { code?: string; details?: { matches?: Array<{ id: string; name: string }> } ; message: string };
          if (err.code === 'LEAD_DUPLICATE') setDupMatches(err.details?.matches ?? []);
          else toast.push('error', err.message);
        },
      },
    );

  return (
    <Modal open onClose={onClose} title="New lead" width={620} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim() || !stageId} loading={create.isPending} onClick={submit}>Create lead</Button></>}>
      <div className="space-y-4">
        {dupMatches && (
          <div className="rounded-lg bg-amber-soft px-3 py-2 text-[13px] text-amber">
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

