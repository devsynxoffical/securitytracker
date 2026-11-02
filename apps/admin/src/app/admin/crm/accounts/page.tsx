'use client';

import { Suspense, useMemo, useState } from 'react';
import { Plus, Download, Pencil, Trash2, Globe, Phone } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useAccounts, useAccount, useCrmMutation, type Account } from '@/lib/queries/crm';
import {
  Button, Card, Table, Th, Td, Badge, lifecycleTone, stageTone, Skeleton, TableSkeleton, EmptyState, ErrorBanner, Pagination, BulkBar, Drawer, Modal, Field, Input, Select, Tabs, Row, Avatar, Checkbox, SearchInput, useToast, PageHeader,
} from '@/components/ui';
import { OwnerSelect, OwnerFilter, TagFilter, TagList, TagPicker, ActivityTimeline, CustomFieldInputs, CustomFieldValues } from '@/components/crm/shared';
import { money, fullName, relative, dateTime, phoneDisplay, titleCase, downloadText } from '@/lib/format';

const LIFECYCLES = ['lead', 'prospect', 'customer', 'churned', 'partner'];

export default function AccountsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Accounts />
    </Suspense>
  );
}

function Accounts() {
  const { can } = useAuth();
  const toast = useToast();
  const [id, setId] = useIdParam();
  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [tagId, setTagId] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Account[][]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Account | null | 'new'>(null);
  const [bulkOwner, setBulkOwner] = useState('');
  const [bulkTag, setBulkTag] = useState('');

  const params = useMemo(() => ({ search: search || undefined, ownerId: ownerId || undefined, tagId: tagId || undefined, lifecycle: lifecycle || undefined, cursor, limit: 50 }), [search, ownerId, tagId, lifecycle, cursor]);
  const q = useAccounts(params);
  const rows = useMemo(() => { const seen = new Set<string>(); return [...pages.flat(), ...(q.data?.items ?? [])].filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true))); }, [pages, q.data]);
  const reset = () => { setCursor(undefined); setPages([]); setSelected([]); };
  const loadMore = () => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } };
  const bulk = useCrmMutation((b: Record<string, unknown>) => http.post('/crm/accounts/bulk', { ids: selected, ...b }), [['accounts']]);
  const runBulk = (b: Record<string, unknown>) => bulk.mutate(b, { onSuccess: () => { setSelected([]); toast.push('success', 'Done'); }, onError: (e) => toast.push('error', (e as Error).message) });
  const exportCsv = () => http.text('/crm/accounts/export', { search: search || undefined, ownerId: ownerId || undefined, tagId: tagId || undefined, lifecycle: lifecycle || undefined }).then((t) => downloadText('accounts-export.csv', t)).catch((e) => toast.push('error', (e as Error).message));

  return (
    <div>
      <PageHeader title="Accounts" subtitle={`${rows.length} shown`} actions={<>
        {can('crm.accounts.export') && <Button icon={<Download size={14} />} onClick={exportCsv}>Export</Button>}
        {can('crm.accounts.create') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New account</Button>}
      </>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput className="w-64" value={search} onChange={(v) => { setSearch(v); reset(); }} placeholder="Name, domain, phone…" />
        <div className="w-48"><OwnerFilter value={ownerId} onChange={(v) => { setOwnerId(v); reset(); }} /></div>
        <div className="w-40"><TagFilter value={tagId} onChange={(v) => { setTagId(v); reset(); }} /></div>
        <div className="w-40"><Select value={lifecycle} onChange={(e) => { setLifecycle(e.target.value); reset(); }}><option value="">All lifecycles</option>{LIFECYCLES.map((l) => <option key={l} value={l}>{titleCase(l)}</option>)}</Select></div>
      </div>
      <Card>
        <BulkBar count={selected.length} onClear={() => setSelected([])}>
          {can('crm.accounts.assign') && <><div className="w-52"><OwnerSelect value={bulkOwner} onChange={setBulkOwner} emptyLabel="Assign to…" /></div><Button size="sm" disabled={!bulkOwner} loading={bulk.isPending} onClick={() => runBulk({ action: 'assign', ownerId: bulkOwner })}>Assign</Button></>}
          <div className="w-40"><TagFilter value={bulkTag} onChange={setBulkTag} /></div>
          <Button size="sm" disabled={!bulkTag} onClick={() => runBulk({ action: 'add_tag', tagId: bulkTag })}>Add tag</Button>
          <Button size="sm" disabled={!bulkTag} onClick={() => runBulk({ action: 'remove_tag', tagId: bulkTag })}>Remove tag</Button>
          {can('crm.accounts.delete') && <Button size="sm" variant="danger-outline" icon={<Trash2 size={12} />} onClick={() => window.confirm(`Delete ${selected.length} accounts?`) && runBulk({ action: 'delete' })}>Delete</Button>}
        </BulkBar>
        {q.isLoading && pages.length === 0 && <TableSkeleton cols={7} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && rows.length === 0 && <EmptyState title="No accounts match" body="Change the filters, import a CSV or create an account." action={can('crm.accounts.create') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New account</Button> : undefined} />}
        {rows.length > 0 && (<>
          <Table>
            <thead><tr>
              <Th className="w-8"><Checkbox checked={selected.length === rows.length} onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])} /></Th>
              <Th>Account</Th><Th>Industry</Th><Th>Lifecycle</Th><Th>Owner</Th><Th right>Contacts</Th><Th right>Deals</Th><Th>Tags</Th><Th right>Last activity</Th>
            </tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setId(a.id)}>
                  <Td><span onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.includes(a.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))} /></span></Td>
                  <Td><div className="flex items-center gap-2"><Avatar name={a.name} size={24} /><div><div className="font-semibold">{a.name}</div><div className="text-xs text-ink-3">{a.domain ?? ''}</div></div></div></Td>
                  <Td className="text-ink-2">{a.industry ?? '—'}</Td>
                  <Td><Badge tone={lifecycleTone(a.lifecycle)}>{titleCase(a.lifecycle)}</Badge></Td>
                  <Td>{fullName(a.owner)}</Td>
                  <Td right mono>{a._count?.contacts ?? 0}</Td>
                  <Td right mono>{a._count?.deals ?? 0}</Td>
                  <Td><TagList tags={a.tags} /></Td>
                  <Td right className="text-ink-3">{relative(a.lastActivityAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={loadMore} loading={q.isFetching} />
        </>)}
      </Card>
      <AccountDrawer id={id} onClose={() => setId(null)} onEdit={(a) => setEditing(a)} />
      {editing && <AccountFormModal account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AccountDrawer({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (a: Account) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const q = useAccount(id);
  const [tab, setTab] = useState<'overview' | 'contacts' | 'deals' | 'activities'>('overview');
  const [owner, setOwner] = useState('');
  const assign = useCrmMutation((ownerId: string) => http.post(`/crm/accounts/${id}/assign`, { ownerId }), [['accounts'], ['activities']]);
  const del = useCrmMutation(() => http.del(`/crm/accounts/${id}`), [['accounts']]);
  const a = q.data;
  const openDeals = (a?.deals ?? []).filter((d) => !d.wonAt && !d.lostAt);
  const pipelineValue = openDeals.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  return (
    <Drawer open={Boolean(id)} onClose={onClose} title={a?.name ?? 'Account'} subtitle={a ? [a.domain, a.industry].filter(Boolean).join(' · ') || 'No details' : undefined}
      actions={a && <>
        {can('crm.accounts.edit') && <Button size="sm" icon={<Pencil size={13} />} onClick={() => onEdit(a)}>Edit</Button>}
        {can('crm.accounts.delete') && <Button size="sm" variant="danger-outline" icon={<Trash2 size={13} />} loading={del.isPending} onClick={() => window.confirm('Delete this account?') && del.mutate(undefined, { onSuccess: () => { toast.push('success', 'Account deleted'); onClose(); } })}>Delete</Button>}
      </>}>
      {q.isLoading && <div className="space-y-3 p-5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {a && (
        <div className="p-5">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Lifecycle</div><div className="mt-1"><Badge tone={lifecycleTone(a.lifecycle)}>{titleCase(a.lifecycle)}</Badge></div></div>
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Open pipeline</div><div className="mt-1 font-mono text-lg font-semibold">{money(pipelineValue)}</div><div className="text-xs text-ink-3">{openDeals.length} open deals</div></div>
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Owner</div>
              {can('crm.accounts.assign') ? <div className="mt-1 flex gap-1"><OwnerSelect value={owner || a.ownerId || ''} onChange={setOwner} allowEmpty={false} /><Button size="sm" disabled={!owner || owner === a.ownerId} loading={assign.isPending} onClick={() => assign.mutate(owner, { onSuccess: () => toast.push('success', 'Reassigned') })}>Set</Button></div> : <div className="mt-1 text-[13px] font-semibold">{fullName(a.owner)}</div>}
            </div>
          </div>
          <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'overview', label: 'Overview' }, { value: 'contacts', label: 'Contacts', count: a.contacts?.length ?? 0 }, { value: 'deals', label: 'Deals', count: a.deals?.length ?? 0 }, { value: 'activities', label: 'Activities' }]} />
          {tab === 'overview' && (
            <div className="space-y-4">
              <div>
                <Row label="Website">{a.website ? <a className="inline-flex items-center gap-1 text-pri hover:underline" href={a.website} target="_blank" rel="noreferrer"><Globe size={11} />{a.website}</a> : '—'}</Row>
                <Row label="Phone">{a.phone ? <span className="inline-flex items-center gap-1 font-mono"><Phone size={11} />{a.phone}</span> : '—'}</Row>
                <Row label="Industry">{a.industry ?? '—'}</Row>
                <Row label="Size">{a.size ?? '—'}</Row>
                <Row label="Address">{[a.address?.line1, a.address?.city, a.address?.state, a.address?.postalCode, a.address?.country].filter(Boolean).join(', ') || '—'}</Row>
                <Row label="Parent account">{a.parentAccount ? <a className="text-pri hover:underline" href={`/admin/crm/accounts?id=${a.parentAccount.id}`}>{a.parentAccount.name}</a> : '—'}</Row>
                {a.childAccounts && a.childAccounts.length > 0 && <Row label="Child accounts">{a.childAccounts.map((c) => <a key={c.id} className="mr-2 text-pri hover:underline" href={`/admin/crm/accounts?id=${c.id}`}>{c.name}</a>)}</Row>}
                <Row label="Tags"><TagList tags={a.tags} /></Row>
                <Row label="Created">{dateTime(a.createdAt)}</Row>
              </div>
              <CustomFieldValues entityType="account" values={a.custom} />
            </div>
          )}
          {tab === 'contacts' && ((a.contacts ?? []).length === 0 ? <EmptyState title="No contacts" body="Contacts linked to this account appear here." /> : (
            <Table><thead><tr><Th>Name</Th><Th>Title</Th><Th>Email</Th><Th>Phone</Th><Th>Lifecycle</Th></tr></thead><tbody>
              {a.contacts!.map((c) => <tr key={c.id} className="hover:bg-surface-2"><Td><a className="font-semibold text-pri hover:underline" href={`/admin/crm/contacts?id=${c.id}`}>{fullName(c)}</a></Td><Td className="text-ink-2">{c.title ?? '—'}</Td><Td className="text-ink-2">{c.emails[0]?.emailLower ?? '—'}</Td><Td mono className="text-ink-2">{c.phones[0] ? phoneDisplay(c.phones[0].phoneE164) : '—'}</Td><Td><Badge tone={lifecycleTone(c.lifecycle)}>{titleCase(c.lifecycle)}</Badge></Td></tr>)}
            </tbody></Table>
          ))}
          {tab === 'deals' && ((a.deals ?? []).length === 0 ? <EmptyState title="No deals" /> : (
            <Table><thead><tr><Th>Deal</Th><Th>Stage</Th><Th right>Amount</Th><Th right>Prob.</Th><Th>Owner</Th></tr></thead><tbody>
              {a.deals!.map((d) => <tr key={d.id} className="hover:bg-surface-2"><Td><a className="font-semibold text-pri hover:underline" href={`/admin/crm/deals?id=${d.id}`}>{d.name}</a></Td><Td><Badge tone={stageTone(d.stage.type)}>{d.stage.name}</Badge></Td><Td right mono>{money(d.amount, d.currency)}</Td><Td right mono>{d.probability}%</Td><Td>{fullName(d.owner)}</Td></tr>)}
            </tbody></Table>
          ))}
          {tab === 'activities' && <ActivityTimeline entityType="account" entityId={a.id} canEdit={can('crm.accounts.edit')} />}
        </div>
      )}
    </Drawer>
  );
}

function AccountFormModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(account?.name ?? '');
  const [domain, setDomain] = useState(account?.domain ?? '');
  const [industry, setIndustry] = useState(account?.industry ?? '');
  const [size, setSize] = useState(account?.size ?? '');
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [website, setWebsite] = useState(account?.website ?? '');
  const [lifecycle, setLifecycle] = useState(account?.lifecycle ?? 'prospect');
  const [ownerId, setOwnerId] = useState(account?.ownerId ?? '');
  const [city, setCity] = useState(account?.address?.city ?? '');
  const [country, setCountry] = useState(account?.address?.country ?? '');
  const [tagIds, setTagIds] = useState<string[]>(account?.tags.map((t) => t.id) ?? []);
  const [custom, setCustom] = useState<Record<string, unknown>>(account?.custom ?? {});
  const [allowDup, setAllowDup] = useState(false);
  const [dup, setDup] = useState<string | null>(null);
  const save = useCrmMutation((p: Record<string, unknown>) => (account ? http.patch(`/crm/accounts/${account.id}`, p) : http.post('/crm/accounts', p)), [['accounts'], ['activities']]);
  const submit = () => save.mutate(
    { name, domain: domain || undefined, industry: industry || undefined, size: size || undefined, phone: phone || undefined, website: website ? (website.startsWith('http') ? website : `https://${website}`) : undefined, lifecycle, ownerId: ownerId || undefined, address: { city: city || undefined, country: country || undefined }, tagIds, customFields: custom, ...(account ? {} : { allowDuplicate: allowDup }) },
    { onSuccess: () => { toast.push('success', account ? 'Account updated' : 'Account created'); onClose(); }, onError: (e) => { const err = e as { code?: string; message: string }; if (err.code === 'ACCOUNT_DUPLICATE') setDup(err.message); else toast.push('error', err.message); } },
  );
  return (
    <Modal open onClose={onClose} title={account ? 'Edit account' : 'New account'} width={620} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim()} loading={save.isPending} onClick={submit}>{account ? 'Save' : 'Create account'}</Button></>}>
      <div className="space-y-4">
        {dup && <div className="rounded-lg bg-amber-soft px-3 py-2 text-[13px] text-amber">{dup}{!account && <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} /> Create anyway</label>}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label="Domain"><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" /></Field>
          <Field label="Industry"><Input value={industry} onChange={(e) => setIndustry(e.target.value)} /></Field>
          <Field label="Size"><Select value={size} onChange={(e) => setSize(e.target.value)}><option value="">—</option>{['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Website"><Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></Field>
          <Field label="Lifecycle"><Select value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>{LIFECYCLES.map((l) => <option key={l} value={l}>{titleCase(l)}</option>)}</Select></Field>
          <Field label="Owner"><OwnerSelect value={ownerId} onChange={setOwnerId} /></Field>
          <Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
          <Field label="Country"><Input value={country} onChange={(e) => setCountry(e.target.value)} /></Field>
        </div>
        <Field label="Tags"><TagPicker value={tagIds} onChange={setTagIds} /></Field>
        <CustomFieldInputs entityType="account" value={custom} onChange={setCustom} />
      </div>
    </Modal>
  );
}
