'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Download, Pencil, Trash2, Globe, Phone, Eye, UserPlus } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useAccounts, useAccount, useActivities, useCrmMutation, type Account } from '@/lib/queries/crm';
import { Button, Card, Badge, lifecycleTone, stageTone, Skeleton, EmptyState, Pagination, BulkBar, Modal, Field, Input, Select, Tabs, Avatar, useToast, PageHeader } from '@/components/ui';
import { DataTable, Menu, AssociationCard, type Column, type SortState, type MenuItem } from '@/components/ui/advanced';
import { OwnerSelect, TagFilter, TagList, TagPicker, CustomFieldInputs } from '@/components/crm/shared';
import { ListShell, OwnerChip, SelectChip, TagFilterChip, SearchChipInput, useMergedRows, type Filters } from '@/components/crm/list-shell';
import { RecordPage, RecordHeader, KpiStrip, EditableProperties, ActivitiesTab, NotesTab, MetaFooter } from '@/components/crm/record';
import { money, fullName, relative, dateTime, phoneDisplay, titleCase, downloadText } from '@/lib/format';

const LIFECYCLES = ['lead', 'prospect', 'customer', 'churned', 'partner'];
const LIFECYCLE_OPTIONS = LIFECYCLES.map((l) => ({ value: l, label: titleCase(l) }));
const SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

export default function AccountsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Accounts />
    </Suspense>
  );
}

function Accounts() {
  const { can, me } = useAuth();
  const toast = useToast();
  const [id, setId] = useIdParam();
  const [filters, setFiltersState] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>({ key: 'lastActivityAt', direction: 'desc' });
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Account[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Account | null | 'new'>(null);
  const [bulkOwner, setBulkOwner] = useState('');
  const [bulkTag, setBulkTag] = useState('');

  const reset = () => { setCursor(undefined); setPages([]); setSelected(new Set()); };
  const setFilters = useCallback((f: Filters) => { setFiltersState(f); setCursor(undefined); setPages([]); setSelected(new Set()); }, []);
  const setFilter = (k: string, v: string) => setFilters({ ...filters, [k]: v });
  const onSort = (s: SortState) => { setSort(s); reset(); };

  const params = useMemo(() => ({ search: filters.search || undefined, ownerId: filters.ownerId || undefined, tagId: filters.tagId || undefined, lifecycle: filters.lifecycle || undefined, industry: filters.industry || undefined, sort: `${sort.key}:${sort.direction}`, cursor, limit: 50 }), [filters, sort, cursor]);
  const q = useAccounts(params);
  const rows = useMergedRows(pages, q.data?.items);
  const loadMore = () => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } };
  const bulk = useCrmMutation((b: Record<string, unknown>) => http.post('/crm/accounts/bulk', { ids: [...selected], ...b }), [['accounts']]);
  const runBulk = (b: Record<string, unknown>) => bulk.mutate(b, { onSuccess: () => { setSelected(new Set()); toast.push('success', 'Done'); }, onError: (e) => toast.push('error', (e as Error).message) });
  const assignOne = useCrmMutation((a: { id: string; ownerId: string }) => http.post(`/crm/accounts/${a.id}/assign`, { ownerId: a.ownerId }), [['accounts']]);
  const delOne = useCrmMutation((aid: string) => http.del(`/crm/accounts/${aid}`), [['accounts']]);
  const exportCsv = () => http.text('/crm/accounts/export', { search: filters.search || undefined, ownerId: filters.ownerId || undefined, tagId: filters.tagId || undefined, lifecycle: filters.lifecycle || undefined }).then((t) => downloadText('accounts-export.csv', t)).catch((e) => toast.push('error', (e as Error).message));

  if (id) return <AccountRecord id={id} onBack={() => setId(null)} onEdit={(a) => setEditing(a)} editing={editing} onCloseEdit={() => setEditing(null)} />;

  const columns: Column<Account>[] = [
    { key: 'name', header: 'Account', sortable: true, locked: true, cell: (a) => <div className="flex items-center gap-2.5"><Avatar name={a.name} size={26} /><div className="min-w-0"><div className="truncate font-semibold text-ink">{a.name}</div><div className="truncate text-xs text-ink-3">{a.domain ?? ''}</div></div></div> },
    { key: 'industry', header: 'Industry', cell: (a) => <span className="text-ink-2">{a.industry ?? '—'}</span> },
    { key: 'lifecycle', header: 'Lifecycle', sortable: true, cell: (a) => <Badge tone={lifecycleTone(a.lifecycle)}>{titleCase(a.lifecycle)}</Badge> },
    { key: 'owner', header: 'Owner', cell: (a) => (a.owner ? <span className="flex items-center gap-2"><Avatar name={fullName(a.owner)} size={22} />{fullName(a.owner)}</span> : <span className="text-ink-3">Unassigned</span>) },
    { key: 'contacts', header: 'Contacts', right: true, mono: true, cell: (a) => a._count?.contacts ?? 0 },
    { key: 'deals', header: 'Deals', right: true, mono: true, cell: (a) => a._count?.deals ?? 0 },
    { key: 'tags', header: 'Tags', cell: (a) => <TagList tags={a.tags} /> },
    { key: 'createdAt', header: 'Created', sortable: true, cell: (a) => <span className="text-ink-3">{relative(a.createdAt)}</span> },
    { key: 'lastActivityAt', header: 'Last activity', sortable: true, right: true, cell: (a) => <span className="text-ink-3">{relative(a.lastActivityAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Accounts" subtitle={`${rows.length} shown`} actions={<>
        {can('crm.accounts.export') && <Button icon={<Download size={14} />} onClick={exportCsv}>Export</Button>}
        {can('crm.accounts.create') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New account</Button>}
      </>} />
      <ListShell
        entityType="account"
        filters={filters}
        onFilters={setFilters}
        chips={
          <>
            <SearchChipInput value={filters.search ?? ''} onChange={(v) => setFilter('search', v)} placeholder="Name, domain, phone…" />
            <OwnerChip value={filters.ownerId ?? ''} onChange={(v) => setFilter('ownerId', v)} />
            <SelectChip label="Lifecycle" value={filters.lifecycle ?? ''} onChange={(v) => setFilter('lifecycle', v)} options={LIFECYCLE_OPTIONS} />
            <TagFilterChip value={filters.tagId ?? ''} onChange={(v) => setFilter('tagId', v)} />
          </>
        }
      >
        <Card>
          <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
            {can('crm.accounts.assign') && <><div className="w-52"><OwnerSelect value={bulkOwner} onChange={setBulkOwner} emptyLabel="Assign to…" /></div><Button size="sm" disabled={!bulkOwner} loading={bulk.isPending} onClick={() => runBulk({ action: 'assign', ownerId: bulkOwner })}>Assign</Button></>}
            <div className="w-40"><TagFilter value={bulkTag} onChange={setBulkTag} /></div>
            <Button size="sm" disabled={!bulkTag} onClick={() => runBulk({ action: 'add_tag', tagId: bulkTag })}>Add tag</Button>
            <Button size="sm" disabled={!bulkTag} onClick={() => runBulk({ action: 'remove_tag', tagId: bulkTag })}>Remove tag</Button>
            {can('crm.accounts.delete') && <Button size="sm" variant="danger-outline" icon={<Trash2 size={12} />} onClick={() => window.confirm(`Delete ${selected.size} accounts?`) && runBulk({ action: 'delete' })}>Delete</Button>}
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
            onRowClick={(a) => setId(a.id)}
            storageKey="crm.accounts"
            empty={<EmptyState title="No accounts match" body="Change the filters, import a CSV or create an account." action={can('crm.accounts.create') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New account</Button> : undefined} />}
            rowActions={(a) => (
              <Menu
                items={([
                  { label: 'Open', icon: <Eye size={14} />, onSelect: () => setId(a.id) },
                  ...(can('crm.accounts.edit') ? [{ label: 'Edit', icon: <Pencil size={14} />, onSelect: () => setEditing(a) }] : []),
                  ...(can('crm.accounts.assign') && me ? [{ label: 'Assign to me', icon: <UserPlus size={14} />, onSelect: () => assignOne.mutate({ id: a.id, ownerId: me.id }, { onError: (e) => toast.push('error', (e as Error).message) }) }] : []),
                  ...(can('crm.accounts.delete') ? [{ separator: true } as const, { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => window.confirm(`Delete ${a.name}?`) && delOne.mutate(a.id, { onSuccess: () => toast.push('success', 'Account deleted'), onError: (e) => toast.push('error', (e as Error).message) }) }] : []),
                ] as MenuItem[])}
              />
            )}
            footer={rows.length > 0 ? <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={loadMore} loading={q.isFetching} /> : undefined}
          />
        </Card>
      </ListShell>
      {editing && <AccountFormModal account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Record page
// ---------------------------------------------------------------------------

function AccountRecord({ id, onBack, onEdit, editing, onCloseEdit }: { id: string; onBack: () => void; onEdit: (a: Account) => void; editing: Account | null | 'new'; onCloseEdit: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const q = useAccount(id);
  const activities = useActivities('account', id);
  const [tab, setTab] = useState<'overview' | 'activities' | 'contacts' | 'deals' | 'notes'>('overview');
  const [owner, setOwner] = useState('');
  const inv = [['accounts'], ['activities']];
  const assign = useCrmMutation((ownerId: string) => http.post(`/crm/accounts/${id}/assign`, { ownerId }), inv);
  const del = useCrmMutation(() => http.del(`/crm/accounts/${id}`), [['accounts']]);
  const a = q.data;
  const canEdit = can('crm.accounts.edit');
  const deals = a?.deals ?? [];
  const openDeals = deals.filter((d) => !d.wonAt && !d.lostAt);
  const pipelineValue = openDeals.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const won = deals.filter((d) => d.wonAt).reduce((s, d) => s + Number(d.amount ?? 0), 0);

  return (
    <RecordPage
      onBack={onBack}
      loading={q.isLoading}
      error={q.isError ? (q.error as Error).message : null}
      onRetry={() => q.refetch()}
      header={
        a && (
          <RecordHeader
            avatar={<Avatar name={a.name} size={44} />}
            title={a.name}
            subtitle={<span>{[a.domain, a.industry].filter(Boolean).join(' · ') || 'No details'}</span>}
            badges={<><Badge tone={lifecycleTone(a.lifecycle)} dot>{titleCase(a.lifecycle)}</Badge>{a.tags.length > 0 && <TagList tags={a.tags} />}</>}
            actions={
              <>
                {can('crm.accounts.assign') && (
                  <div className="flex gap-1">
                    <div className="w-44"><OwnerSelect value={owner || a.ownerId || ''} onChange={setOwner} allowEmpty={false} /></div>
                    <Button disabled={!owner || owner === a.ownerId} loading={assign.isPending} onClick={() => assign.mutate(owner, { onSuccess: () => toast.push('success', 'Reassigned') })}>Assign</Button>
                  </div>
                )}
                {can('crm.accounts.delete') && <Button variant="danger-outline" icon={<Trash2 size={13} />} loading={del.isPending} onClick={() => window.confirm('Delete this account?') && del.mutate(undefined, { onSuccess: () => { toast.push('success', 'Account deleted'); onBack(); } })}>Delete</Button>}
              </>
            }
            primary={canEdit ? <Button variant="primary" icon={<Pencil size={13} />} onClick={() => onEdit(a)}>Edit</Button> : undefined}
          />
        )
      }
      left={
        a && (
          <EditableProperties
            entityType="account"
            patchPath={`/crm/accounts/${a.id}`}
            canEdit={canEdit}
            invalidate={inv}
            custom={a.custom}
            properties={[
              { key: 'name', label: 'Name', value: a.name, raw: a.name, editable: true },
              { key: 'domain', label: 'Domain', value: a.domain, raw: a.domain ?? '', editable: true, mono: true },
              { key: 'website', label: 'Website', value: a.website ? <a className="inline-flex items-center gap-1 text-pri hover:underline" href={a.website} target="_blank" rel="noreferrer"><Globe size={11} />{a.website}</a> : null, raw: a.website ?? '', editable: true },
              { key: 'phone', label: 'Phone', value: a.phone ? <span className="inline-flex items-center gap-1"><Phone size={11} />{a.phone}</span> : null, raw: a.phone ?? '', editable: true, mono: true },
              { key: 'industry', label: 'Industry', value: a.industry, raw: a.industry ?? '', editable: true },
              { key: 'size', label: 'Size', value: a.size, raw: a.size ?? '', type: 'select', options: SIZES.map((s) => ({ value: s, label: s })), editable: true },
              { key: 'lifecycle', label: 'Lifecycle', value: titleCase(a.lifecycle), raw: a.lifecycle, type: 'select', options: LIFECYCLE_OPTIONS, editable: true },
              { key: 'address', label: 'Address', value: [a.address?.line1, a.address?.city, a.address?.state, a.address?.postalCode, a.address?.country].filter(Boolean).join(', ') || null },
              { key: 'parent', label: 'Parent account', value: a.parentAccount ? <Link className="text-pri hover:underline" href={`/admin/crm/accounts?id=${a.parentAccount.id}`}>{a.parentAccount.name}</Link> : null },
              { key: 'owner', label: 'Owner', value: a.owner ? fullName(a.owner) : 'Unassigned' },
              { key: 'createdAt', label: 'Created', value: dateTime(a.createdAt) },
            ]}
            map={(key, value) => {
              switch (key) {
                case 'name': return value.trim() ? { name: value.trim() } : null;
                case 'domain': return { domain: value || undefined };
                case 'website': return { website: value ? (value.startsWith('http') ? value : `https://${value}`) : undefined };
                case 'phone': return { phone: value || undefined };
                case 'industry': return { industry: value || undefined };
                case 'size': return { size: value || undefined };
                case 'lifecycle': return { lifecycle: value };
                default: return null;
              }
            }}
          />
        )
      }
      main={
        a && (
          <>
            <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'overview', label: 'Overview' }, { value: 'activities', label: 'Activities', count: activities.data?.items.length }, { value: 'contacts', label: 'Contacts', count: a.contacts?.length ?? 0 }, { value: 'deals', label: 'Deals', count: deals.length }, { value: 'notes', label: 'Notes' }]} />
            {tab === 'overview' && (
              <>
                <KpiStrip items={[
                  { label: 'Open pipeline', value: money(pipelineValue), hint: `${openDeals.length} open deals` },
                  { label: 'Won revenue', value: money(won), tone: won > 0 ? 'green' : undefined },
                  { label: 'Contacts', value: a.contacts?.length ?? 0 },
                  { label: 'Last activity', value: <span className="text-base">{relative(a.lastActivityAt)}</span> },
                ]} />
                <ActivitiesTab entityType="account" entityId={a.id} canEdit={canEdit} />
                <MetaFooter createdAt={a.createdAt} lastActivityAt={a.lastActivityAt} />
              </>
            )}
            {tab === 'activities' && <ActivitiesTab entityType="account" entityId={a.id} canEdit={canEdit} />}
            {tab === 'contacts' && ((a.contacts ?? []).length === 0 ? <EmptyState title="No contacts" body="Contacts linked to this account appear here." /> : (
              <ul className="divide-y divide-line-2 overflow-hidden rounded-card border border-line bg-surface">
                {a.contacts!.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <Avatar name={fullName(c)} size={26} />
                    <div className="min-w-0 flex-1"><Link className="font-semibold text-ink hover:text-pri" href={`/admin/crm/contacts?id=${c.id}`}>{fullName(c)}</Link><div className="truncate text-xs text-ink-3">{[c.title, c.emails[0]?.emailLower, c.phones[0] ? phoneDisplay(c.phones[0].phoneE164) : null].filter(Boolean).join(' · ')}</div></div>
                    <Badge tone={lifecycleTone(c.lifecycle)}>{titleCase(c.lifecycle)}</Badge>
                  </li>
                ))}
              </ul>
            ))}
            {tab === 'deals' && (deals.length === 0 ? <EmptyState title="No deals" /> : (
              <ul className="divide-y divide-line-2 overflow-hidden rounded-card border border-line bg-surface">
                {deals.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <div className="min-w-0 flex-1"><Link className="font-semibold text-ink hover:text-pri" href={`/admin/crm/deals?id=${d.id}`}>{d.name}</Link><div className="text-xs text-ink-3">{fullName(d.owner)}</div></div>
                    <Badge tone={stageTone(d.stage.type)}>{d.stage.name}</Badge>
                    <span className="w-16 text-right font-mono text-xs text-ink-2">{d.probability}%</span>
                    <span className="w-28 text-right font-mono text-ink">{money(d.amount, d.currency)}</span>
                  </li>
                ))}
              </ul>
            ))}
            {tab === 'notes' && <NotesTab entityType="account" entityId={a.id} canEdit={canEdit} />}
            {editing && <AccountFormModal account={editing === 'new' ? null : editing} onClose={onCloseEdit} />}
          </>
        )
      }
      right={
        a && (
          <>
            <AssociationCard title="Contacts" count={a.contacts?.length ?? 0} emptyText="No contacts yet">
              {(a.contacts ?? []).length > 0 && (
                <ul className="space-y-0.5">
                  {a.contacts!.slice(0, 8).map((c) => (
                    <li key={c.id}><Link href={`/admin/crm/contacts?id=${c.id}`} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2"><Avatar name={fullName(c)} size={22} /><span className="min-w-0"><span className="block truncate font-medium text-ink">{fullName(c)}</span><span className="block truncate text-xs text-ink-3">{c.title ?? ''}</span></span></Link></li>
                  ))}
                </ul>
              )}
            </AssociationCard>
            <AssociationCard title="Deals" count={deals.length} emptyText="No deals yet">
              {deals.length > 0 && (
                <ul className="space-y-0.5">
                  {deals.slice(0, 8).map((d) => (
                    <li key={d.id}><Link href={`/admin/crm/deals?id=${d.id}`} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-surface-2"><span className="min-w-0"><span className="block truncate font-medium text-ink">{d.name}</span><Badge tone={stageTone(d.stage.type)}>{d.stage.name}</Badge></span><span className="font-mono text-xs text-ink-2">{money(d.amount, d.currency)}</span></Link></li>
                  ))}
                </ul>
              )}
            </AssociationCard>
            {(a.childAccounts?.length ?? 0) > 0 && (
              <AssociationCard title="Child accounts" count={a.childAccounts!.length}>
                <ul className="space-y-0.5">{a.childAccounts!.map((c) => <li key={c.id}><Link href={`/admin/crm/accounts?id=${c.id}`} className="block rounded px-2 py-1.5 font-medium text-ink hover:bg-surface-2">{c.name}</Link></li>)}</ul>
              </AssociationCard>
            )}
          </>
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

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
        {dup && <div className="rounded-lg bg-amber-soft px-3 py-2 text-base text-amber-text">{dup}{!account && <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} /> Create anyway</label>}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label="Domain"><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" /></Field>
          <Field label="Industry"><Input value={industry} onChange={(e) => setIndustry(e.target.value)} /></Field>
          <Field label="Size"><Select value={size} onChange={(e) => setSize(e.target.value)}><option value="">—</option>{SIZES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
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
