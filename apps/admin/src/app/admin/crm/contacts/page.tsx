'use client';

import { confirmDialog, ConfirmHost } from '@/components/platform/confirm';

import { Suspense, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Download, Phone, Mail, Pencil, Trash2, Eye, UserPlus, Tag as TagIcon } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useExportAllowed } from '@/lib/queries/platform';
import { useIdParam } from '@/lib/useIdParam';
import { useContacts, useContact, useAccounts, useActivities, useCrmMutation, type Contact } from '@/lib/queries/crm';
import { Button, Card, Badge, lifecycleTone, stageTone, Skeleton, EmptyState, Pagination, BulkBar, Modal, Field, Input, Select, Tabs, Avatar, Checkbox, useToast, PageHeader } from '@/components/ui';
import { DataTable, Menu, AssociationCard, type Column, type SortState, type MenuItem } from '@/components/ui/advanced';
import { OwnerSelect, TagFilter, TagList, TagPicker, CustomFieldInputs, ContactPointEditor, toPhones, toEmails, type ContactPoint } from '@/components/crm/shared';
import { ListShell, OwnerChip, SelectChip, TagFilterChip, SearchChipInput, useMergedRows, type Filters } from '@/components/crm/list-shell';
import { RecordPage, RecordHeader, KpiStrip, EditableProperties, ActivitiesTab, NotesTab, EmailsTab, MetaFooter } from '@/components/crm/record';
import { money, fullName, relative, dateTime, phoneDisplay, titleCase, downloadText } from '@/lib/format';

const LIFECYCLES = ['lead', 'prospect', 'customer', 'churned', 'partner'];
const LIFECYCLE_OPTIONS = LIFECYCLES.map((l) => ({ value: l, label: titleCase(l) }));

function ContactsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Contacts />
    </Suspense>
  );
}

function Contacts() {
  const { can, me } = useAuth();
  const exportAllowed = useExportAllowed();
  const toast = useToast();
  const [id, setId] = useIdParam();
  const [filters, setFiltersState] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>({ key: 'lastActivityAt', direction: 'desc' });
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Contact[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Contact | null | 'new'>(null);
  const [bulkOwner, setBulkOwner] = useState('');
  const [bulkTag, setBulkTag] = useState('');

  const reset = () => { setCursor(undefined); setPages([]); setSelected(new Set()); };
  const setFilters = useCallback((f: Filters) => { setFiltersState(f); setCursor(undefined); setPages([]); setSelected(new Set()); }, []);
  const setFilter = (k: string, v: string) => setFilters({ ...filters, [k]: v });
  const onSort = (s: SortState) => { setSort(s); reset(); };

  const params = useMemo(
    () => ({ search: filters.search || undefined, ownerId: filters.ownerId || undefined, tagId: filters.tagId || undefined, lifecycle: filters.lifecycle || undefined, accountId: filters.accountId || undefined, sort: `${sort.key}:${sort.direction}`, cursor, limit: 50 }),
    [filters, sort, cursor],
  );
  const q = useContacts(params);
  const rows = useMergedRows(pages, q.data?.items);
  const loadMore = () => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } };

  const bulk = useCrmMutation((b: Record<string, unknown>) => http.post('/crm/contacts/bulk', { ids: [...selected], ...b }), [['contacts']]);
  const runBulk = (b: Record<string, unknown>) => bulk.mutate(b, { onSuccess: () => { setSelected(new Set()); toast.push('success', 'Done'); }, onError: (e) => toast.push('error', (e as Error).message) });
  const assignOne = useCrmMutation((a: { id: string; ownerId: string }) => http.post(`/crm/contacts/${a.id}/assign`, { ownerId: a.ownerId }), [['contacts']]);
  const delOne = useCrmMutation((cid: string) => http.del(`/crm/contacts/${cid}`), [['contacts']]);
  const exportCsv = () => http.text('/crm/contacts/export', { search: filters.search || undefined, ownerId: filters.ownerId || undefined, tagId: filters.tagId || undefined, lifecycle: filters.lifecycle || undefined }).then((t) => downloadText('contacts-export.csv', t)).catch((e) => toast.push('error', (e as Error).message));

  if (id) return <ContactRecord id={id} onBack={() => setId(null)} onEdit={(c) => setEditing(c)} editing={editing} onCloseEdit={() => setEditing(null)} />;

  const columns: Column<Contact>[] = [
    { key: 'lastName', header: 'Name', sortable: true, locked: true, cell: (c) => <div className="flex items-center gap-2.5"><Avatar name={fullName(c)} size={26} /><div className="min-w-0"><div className="truncate font-semibold text-ink">{fullName(c)}</div><div className="truncate text-xs text-ink-3">{c.title ?? ''}</div></div></div> },
    { key: 'account', header: 'Account', cell: (c) => c.account?.name ?? <span className="text-ink-3">—</span> },
    { key: 'email', header: 'Email', cell: (c) => <span className="text-ink-2">{c.emails[0]?.emailLower ?? '—'}</span> },
    { key: 'phone', header: 'Phone', mono: true, cell: (c) => <span className="text-ink-2">{c.phones[0] ? phoneDisplay(c.phones[0].phoneE164) : '—'}</span> },
    { key: 'lifecycle', header: 'Lifecycle', sortable: true, cell: (c) => <Badge tone={lifecycleTone(c.lifecycle)}>{titleCase(c.lifecycle)}</Badge> },
    { key: 'owner', header: 'Owner', cell: (c) => (c.owner ? <span className="flex items-center gap-2"><Avatar name={fullName(c.owner)} size={22} />{fullName(c.owner)}</span> : <span className="text-ink-3">Unassigned</span>) },
    { key: 'tags', header: 'Tags', cell: (c) => <TagList tags={c.tags} /> },
    { key: 'createdAt', header: 'Created', sortable: true, cell: (c) => <span className="text-ink-3">{relative(c.createdAt)}</span> },
    { key: 'lastActivityAt', header: 'Last activity', sortable: true, right: true, cell: (c) => <span className="text-ink-3">{relative(c.lastActivityAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Contacts" subtitle={`${rows.length} shown`} actions={<>
        {exportAllowed && can('crm.contacts.export') && <Button icon={<Download size={14} />} onClick={exportCsv}>Export</Button>}
        {can('crm.contacts.create') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New contact</Button>}
      </>} />

      <ListShell
        entityType="contact"
        filters={filters}
        onFilters={setFilters}
        chips={
          <>
            <SearchChipInput value={filters.search ?? ''} onChange={(v) => setFilter('search', v)} placeholder="Name, email, phone, account…" />
            <OwnerChip value={filters.ownerId ?? ''} onChange={(v) => setFilter('ownerId', v)} />
            <SelectChip label="Lifecycle" value={filters.lifecycle ?? ''} onChange={(v) => setFilter('lifecycle', v)} options={LIFECYCLE_OPTIONS} />
            <TagFilterChip value={filters.tagId ?? ''} onChange={(v) => setFilter('tagId', v)} />
          </>
        }
      >
        <Card>
          <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
            {can('crm.contacts.assign') && <><div className="w-52"><OwnerSelect value={bulkOwner} onChange={setBulkOwner} emptyLabel="Assign to…" /></div><Button size="sm" disabled={!bulkOwner} loading={bulk.isPending} onClick={() => runBulk({ action: 'assign', ownerId: bulkOwner })}>Assign</Button></>}
            <div className="w-40"><TagFilter value={bulkTag} onChange={setBulkTag} /></div>
            <Button size="sm" disabled={!bulkTag} onClick={() => runBulk({ action: 'add_tag', tagId: bulkTag })}>Add tag</Button>
            <Button size="sm" disabled={!bulkTag} onClick={() => runBulk({ action: 'remove_tag', tagId: bulkTag })}>Remove tag</Button>
            {can('crm.contacts.delete') && <Button size="sm" variant="danger-outline" icon={<Trash2 size={12} />} onClick={() => void confirmDialog({ title: `Delete ${selected.size} contacts?`, danger: true }).then((ok) => ok && runBulk({ action: 'delete' }))}>Delete</Button>}
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
            onRowClick={(c) => setId(c.id)}
            storageKey="crm.contacts"
            empty={<EmptyState title="No contacts match" body="Change the filters, import a CSV or create a contact." action={can('crm.contacts.create') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New contact</Button> : undefined} />}
            rowActions={(c) => (
              <Menu
                items={([
                  { label: 'Open', icon: <Eye size={14} />, onSelect: () => setId(c.id) },
                  ...(can('crm.contacts.edit') ? [{ label: 'Edit', icon: <Pencil size={14} />, onSelect: () => setEditing(c) }] : []),
                  ...(can('crm.contacts.assign') && me ? [{ label: 'Assign to me', icon: <UserPlus size={14} />, onSelect: () => assignOne.mutate({ id: c.id, ownerId: me.id }, { onError: (e) => toast.push('error', (e as Error).message) }) }] : []),
                  { label: 'Add tag…', icon: <TagIcon size={14} />, onSelect: () => { setSelected(new Set([c.id])); } },
                  ...(can('crm.contacts.delete') ? [{ separator: true } as const, { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => void confirmDialog({ title: `Delete ${fullName(c)}?`, danger: true }).then((ok) => ok && delOne.mutate(c.id, { onSuccess: () => toast.push('success', 'Contact deleted'), onError: (e) => toast.push('error', (e as Error).message) }) )}] : []),
                ] as MenuItem[])}
              />
            )}
            footer={rows.length > 0 ? <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={loadMore} loading={q.isFetching} /> : undefined}
          />
        </Card>
      </ListShell>

      {editing && <ContactFormModal contact={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Record page
// ---------------------------------------------------------------------------

function ContactRecord({ id, onBack, onEdit, editing, onCloseEdit }: { id: string; onBack: () => void; onEdit: (c: Contact) => void; editing: Contact | null | 'new'; onCloseEdit: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const q = useContact(id);
  const activities = useActivities('contact', id);
  const [tab, setTab] = useState<'overview' | 'activities' | 'emails' | 'notes'>('overview');
  const [owner, setOwner] = useState('');
  const inv = [['contacts'], ['activities']];
  const assign = useCrmMutation((ownerId: string) => http.post(`/crm/contacts/${id}/assign`, { ownerId }), inv);
  const del = useCrmMutation(() => http.del(`/crm/contacts/${id}`), [['contacts']]);
  const c = q.data;
  const canEdit = can('crm.contacts.edit');
  const deals = c?.deals ?? [];
  const openDeals = deals.filter((d) => !d.wonAt && !d.lostAt);
  const pipeline = openDeals.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const won = deals.filter((d) => d.wonAt).reduce((s, d) => s + Number(d.amount ?? 0), 0);

  return (
    <RecordPage
      onBack={onBack}
      loading={q.isLoading}
      error={q.isError ? (q.error as Error).message : null}
      onRetry={() => q.refetch()}
      header={
        c && (
          <RecordHeader
            avatar={<Avatar name={fullName(c)} size={44} />}
            title={fullName(c)}
            subtitle={<span>{[c.title, c.account?.name].filter(Boolean).join(' · ') || 'No account'}</span>}
            badges={
              <>
                <Badge tone={lifecycleTone(c.lifecycle)} dot>{titleCase(c.lifecycle)}</Badge>
                {c.doNotCall && <Badge tone="red">Do not call</Badge>}
                {c.doNotEmail && <Badge tone="red">Do not email</Badge>}
                {c.tags.length > 0 && <TagList tags={c.tags} />}
              </>
            }
            actions={
              <>
                {can('crm.contacts.assign') && (
                  <div className="flex gap-1">
                    <div className="w-44"><OwnerSelect value={owner || c.ownerId || ''} onChange={setOwner} allowEmpty={false} /></div>
                    <Button disabled={!owner || owner === c.ownerId} loading={assign.isPending} onClick={() => assign.mutate(owner, { onSuccess: () => toast.push('success', 'Reassigned') })}>Assign</Button>
                  </div>
                )}
                {can('crm.contacts.delete') && <Button variant="danger-outline" icon={<Trash2 size={13} />} loading={del.isPending} onClick={() => void confirmDialog({ title: 'Delete this contact?', danger: true }).then((ok) => ok && del.mutate(undefined, { onSuccess: () => { toast.push('success', 'Contact deleted'); onBack(); } }))}>Delete</Button>}
              </>
            }
            primary={canEdit ? <Button variant="primary" icon={<Pencil size={13} />} onClick={() => onEdit(c)}>Edit</Button> : undefined}
          />
        )
      }
      left={
        c && (
          <EditableProperties
            entityType="contact"
            patchPath={`/crm/contacts/${c.id}`}
            canEdit={canEdit}
            invalidate={inv}
            custom={c.custom}
            properties={[
              { key: 'firstName', label: 'First name', value: c.firstName, raw: c.firstName, editable: true },
              { key: 'lastName', label: 'Last name', value: c.lastName, raw: c.lastName, editable: true },
              { key: 'title', label: 'Title', value: c.title, raw: c.title ?? '', editable: true },
              { key: 'lifecycle', label: 'Lifecycle', value: titleCase(c.lifecycle), raw: c.lifecycle, type: 'select', options: LIFECYCLE_OPTIONS, editable: true },
              { key: 'account', label: 'Account', value: c.account ? <Link className="text-pri hover:underline" href={`/admin/crm/accounts?id=${c.account.id}`}>{c.account.name}</Link> : null },
              { key: 'emails', label: 'Emails', value: c.emails.length ? <span className="space-y-0.5">{c.emails.map((e) => <span key={e.id} className="flex items-center gap-1"><Mail size={11} />{e.emailLower} <span className="text-ink-3">{e.label}</span></span>)}</span> : null },
              { key: 'phones', label: 'Phones', value: c.phones.length ? <span className="space-y-0.5">{c.phones.map((p) => <span key={p.id} className="flex items-center gap-1 font-mono"><Phone size={11} />{phoneDisplay(p.phoneE164)} <span className="text-ink-3">{p.label}</span></span>)}</span> : null },
              { key: 'address', label: 'Address', value: [c.address?.line1, c.address?.city, c.address?.state, c.address?.postalCode, c.address?.country].filter(Boolean).join(', ') || null },
              { key: 'owner', label: 'Owner', value: c.owner ? fullName(c.owner) : 'Unassigned' },
              { key: 'createdAt', label: 'Created', value: <span>{dateTime(c.createdAt)}{c.leadId && <span className="ml-1 text-ink-3">from lead</span>}</span> },
            ]}
            map={(key, value) => {
              switch (key) {
                case 'firstName': return value.trim() ? { firstName: value.trim() } : null;
                case 'lastName': return { lastName: value };
                case 'title': return { title: value || undefined };
                case 'lifecycle': return { lifecycle: value };
                default: return null;
              }
            }}
          />
        )
      }
      main={
        c && (
          <>
            <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'overview', label: 'Overview' }, { value: 'activities', label: 'Activities', count: activities.data?.items.length }, { value: 'emails', label: 'Emails' }, { value: 'notes', label: 'Notes' }]} />
            {tab === 'overview' && (
              <>
                <KpiStrip items={[
                  { label: 'Open deals', value: openDeals.length, hint: money(pipeline) + ' in pipeline' },
                  { label: 'Won revenue', value: money(won), tone: won > 0 ? 'green' : undefined },
                  { label: 'Activities', value: activities.data?.items.length ?? '—', hint: `${(activities.data?.items ?? []).filter((a) => a.status === 'planned').length} planned` },
                  { label: 'Last activity', value: <span className="text-base">{relative(c.lastActivityAt)}</span> },
                ]} />
                <ActivitiesTab entityType="contact" entityId={c.id} canEdit={canEdit} />
                <MetaFooter createdAt={c.createdAt} lastActivityAt={c.lastActivityAt} />
              </>
            )}
            {tab === 'activities' && <ActivitiesTab entityType="contact" entityId={c.id} canEdit={canEdit} />}
            {tab === 'emails' && <EmailsTab entityType="contact" entityId={c.id} />}
            {tab === 'notes' && <NotesTab entityType="contact" entityId={c.id} canEdit={canEdit} />}
            {editing && <ContactFormModal contact={editing === 'new' ? null : editing} onClose={onCloseEdit} />}
          </>
        )
      }
      right={
        c && (
          <>
            <AssociationCard title="Account" emptyText="No account linked">
              {c.account && (
                <Link href={`/admin/crm/accounts?id=${c.account.id}`} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2">
                  <Avatar name={c.account.name} size={24} />
                  <span className="min-w-0"><span className="block truncate font-medium text-ink">{c.account.name}</span><span className="block truncate text-xs text-ink-3">{c.account.domain ?? ''}</span></span>
                </Link>
              )}
            </AssociationCard>
            <AssociationCard title="Deals" count={deals.length} emptyText="No deals yet">
              {deals.length > 0 && (
                <ul className="space-y-0.5">
                  {deals.map((d) => (
                    <li key={d.id}>
                      <Link href={`/admin/crm/deals?id=${d.id}`} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-surface-2">
                        <span className="min-w-0"><span className="block truncate font-medium text-ink">{d.name}</span><Badge tone={stageTone(d.stage.type)}>{d.stage.name}</Badge></span>
                        <span className="font-mono text-xs text-ink-2">{money(d.amount, d.currency)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
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

function ContactFormModal({ contact, onClose }: { contact: Contact | null; onClose: () => void }) {
  const toast = useToast();
  const [firstName, setFirstName] = useState(contact?.firstName ?? '');
  const [lastName, setLastName] = useState(contact?.lastName ?? '');
  const [title, setTitle] = useState(contact?.title ?? '');
  const [lifecycle, setLifecycle] = useState(contact?.lifecycle ?? 'lead');
  const [ownerId, setOwnerId] = useState(contact?.ownerId ?? '');
  const [accountId, setAccountId] = useState(contact?.accountId ?? '');
  const [accountSearch, setAccountSearch] = useState('');
  const [phones, setPhones] = useState<ContactPoint[]>(contact?.phones.map((p) => ({ value: phoneDisplay(p.phoneE164), label: p.label })) ?? [{ value: '', label: 'Mobile' }]);
  const [emails, setEmails] = useState<ContactPoint[]>(contact?.emails.map((e) => ({ value: e.emailLower, label: e.label })) ?? [{ value: '', label: 'Work' }]);
  const [city, setCity] = useState(contact?.address?.city ?? '');
  const [country, setCountry] = useState(contact?.address?.country ?? '');
  const [doNotCall, setDnc] = useState(contact?.doNotCall ?? false);
  const [doNotEmail, setDne] = useState(contact?.doNotEmail ?? false);
  const [tagIds, setTagIds] = useState<string[]>(contact?.tags.map((t) => t.id) ?? []);
  const [custom, setCustom] = useState<Record<string, unknown>>(contact?.custom ?? {});
  const [allowDup, setAllowDup] = useState(false);
  const [dup, setDup] = useState<string | null>(null);
  const accounts = useAccounts({ search: accountSearch || undefined, limit: 20 });
  const save = useCrmMutation((p: Record<string, unknown>) => (contact ? http.patch(`/crm/contacts/${contact.id}`, p) : http.post('/crm/contacts', p)), [['contacts'], ['activities'], ['accounts']]);

  const submit = () => save.mutate(
    { firstName, lastName, title: title || undefined, lifecycle, ownerId: ownerId || undefined, accountId: accountId || undefined, phones: toPhones(phones) ?? [], emails: toEmails(emails) ?? [], address: { city: city || undefined, country: country || undefined }, doNotCall, doNotEmail, tagIds, customFields: custom, ...(contact ? {} : { allowDuplicate: allowDup }) },
    { onSuccess: () => { toast.push('success', contact ? 'Contact updated' : 'Contact created'); onClose(); }, onError: (e) => { const err = e as { code?: string; message: string }; if (err.code === 'CONTACT_DUPLICATE') setDup(err.message); else toast.push('error', err.message); } },
  );

  return (
    <Modal open onClose={onClose} title={contact ? 'Edit contact' : 'New contact'} width={640} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!firstName.trim()} loading={save.isPending} onClick={submit}>{contact ? 'Save' : 'Create contact'}</Button></>}>
      <div className="space-y-4">
        {dup && <div className="rounded-lg bg-amber-soft px-3 py-2 text-base text-amber-text">{dup}<label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} /> Create anyway</label></div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus /></Field>
          <Field label="Last name"><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
          <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Lifecycle"><Select value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>{LIFECYCLES.map((l) => <option key={l} value={l}>{titleCase(l)}</option>)}</Select></Field>
          <Field label="Owner"><OwnerSelect value={ownerId} onChange={setOwnerId} /></Field>
          <Field label="Account" hint="Type to search"><div className="space-y-1"><Input value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Search accounts…" /><Select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">No account</option>{contact?.account && !accounts.data?.items.some((a) => a.id === contact.account!.id) && <option value={contact.account.id}>{contact.account.name}</option>}{accounts.data?.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></div></Field>
          <Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
          <Field label="Country"><Input value={country} onChange={(e) => setCountry(e.target.value)} /></Field>
        </div>
        <Field label="Phones"><ContactPointEditor kind="phone" items={phones} onChange={setPhones} /></Field>
        <Field label="Emails"><ContactPointEditor kind="email" items={emails} onChange={setEmails} /></Field>
        <div className="flex gap-6"><Checkbox checked={doNotCall} onChange={(e) => setDnc(e.target.checked)} label="Do not call" /><Checkbox checked={doNotEmail} onChange={(e) => setDne(e.target.checked)} label="Do not email" /></div>
        <Field label="Tags"><TagPicker value={tagIds} onChange={setTagIds} /></Field>
        <CustomFieldInputs entityType="contact" value={custom} onChange={setCustom} />
      </div>
    </Modal>
  );
}

export default function ContactsPageWithConfirm() {
  return (
    <>
      <ContactsPage />
      <ConfirmHost />
    </>
  );
}
