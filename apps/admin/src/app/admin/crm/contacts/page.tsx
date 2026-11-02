'use client';

import { Suspense, useMemo, useState } from 'react';
import { Plus, Download, Phone, Mail, Pencil, Trash2 } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIdParam } from '@/lib/useIdParam';
import { useContacts, useContact, useAccounts, useCrmMutation, type Contact } from '@/lib/queries/crm';
import {
  Button, Card, Table, Th, Td, Badge, lifecycleTone, stageTone, Skeleton, TableSkeleton, EmptyState, ErrorBanner, Pagination, BulkBar, Drawer, Modal, Field, Input, Select, Tabs, Row, Avatar, Checkbox, SearchInput, useToast, PageHeader,
} from '@/components/ui';
import { OwnerSelect, OwnerFilter, TagFilter, TagList, TagPicker, ActivityTimeline, CustomFieldInputs, CustomFieldValues, ContactPointEditor, toPhones, toEmails, type ContactPoint } from '@/components/crm/shared';
import { money, fullName, relative, dateTime, phoneDisplay, titleCase, downloadText } from '@/lib/format';

const LIFECYCLES = ['lead', 'prospect', 'customer', 'churned', 'partner'];

export default function ContactsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Contacts />
    </Suspense>
  );
}

function Contacts() {
  const { can } = useAuth();
  const toast = useToast();
  const [id, setId] = useIdParam();
  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [tagId, setTagId] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<Contact[][]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Contact | null | 'new'>(null);
  const [bulkOwner, setBulkOwner] = useState('');
  const [bulkTag, setBulkTag] = useState('');

  const params = useMemo(() => ({ search: search || undefined, ownerId: ownerId || undefined, tagId: tagId || undefined, lifecycle: lifecycle || undefined, cursor, limit: 50 }), [search, ownerId, tagId, lifecycle, cursor]);
  const q = useContacts(params);
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return [...pages.flat(), ...(q.data?.items ?? [])].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  }, [pages, q.data]);
  const reset = () => { setCursor(undefined); setPages([]); setSelected([]); };
  const loadMore = () => { if (q.data?.nextCursor) { setPages((p) => [...p, q.data!.items]); setCursor(q.data.nextCursor); } };

  const bulk = useCrmMutation((b: Record<string, unknown>) => http.post('/crm/contacts/bulk', { ids: selected, ...b }), [['contacts']]);
  const runBulk = (b: Record<string, unknown>) => bulk.mutate(b, { onSuccess: () => { setSelected([]); toast.push('success', 'Done'); }, onError: (e) => toast.push('error', (e as Error).message) });
  const exportCsv = () => http.text('/crm/contacts/export', { search: search || undefined, ownerId: ownerId || undefined, tagId: tagId || undefined, lifecycle: lifecycle || undefined }).then((t) => downloadText('contacts-export.csv', t)).catch((e) => toast.push('error', (e as Error).message));

  return (
    <div>
      <PageHeader title="Contacts" subtitle={`${rows.length} shown`} actions={<>
        {can('crm.contacts.export') && <Button icon={<Download size={14} />} onClick={exportCsv}>Export</Button>}
        {can('crm.contacts.create') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New contact</Button>}
      </>} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput className="w-64" value={search} onChange={(v) => { setSearch(v); reset(); }} placeholder="Name, email, phone, account…" />
        <div className="w-48"><OwnerFilter value={ownerId} onChange={(v) => { setOwnerId(v); reset(); }} /></div>
        <div className="w-40"><TagFilter value={tagId} onChange={(v) => { setTagId(v); reset(); }} /></div>
        <div className="w-40"><Select value={lifecycle} onChange={(e) => { setLifecycle(e.target.value); reset(); }}><option value="">All lifecycles</option>{LIFECYCLES.map((l) => <option key={l} value={l}>{titleCase(l)}</option>)}</Select></div>
      </div>

      <Card>
        <BulkBar count={selected.length} onClear={() => setSelected([])}>
          {can('crm.contacts.assign') && <><div className="w-52"><OwnerSelect value={bulkOwner} onChange={setBulkOwner} emptyLabel="Assign to…" /></div><Button size="sm" disabled={!bulkOwner} loading={bulk.isPending} onClick={() => runBulk({ action: 'assign', ownerId: bulkOwner })}>Assign</Button></>}
          <div className="w-40"><TagFilter value={bulkTag} onChange={setBulkTag} /></div>
          <Button size="sm" disabled={!bulkTag} onClick={() => runBulk({ action: 'add_tag', tagId: bulkTag })}>Add tag</Button>
          <Button size="sm" disabled={!bulkTag} onClick={() => runBulk({ action: 'remove_tag', tagId: bulkTag })}>Remove tag</Button>
          {can('crm.contacts.delete') && <Button size="sm" variant="danger-outline" icon={<Trash2 size={12} />} onClick={() => window.confirm(`Delete ${selected.length} contacts?`) && runBulk({ action: 'delete' })}>Delete</Button>}
        </BulkBar>
        {q.isLoading && pages.length === 0 && <TableSkeleton cols={7} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && rows.length === 0 && <EmptyState title="No contacts match" body="Change the filters, import a CSV or create a contact." action={can('crm.contacts.create') ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New contact</Button> : undefined} />}
        {rows.length > 0 && (
          <>
            <Table>
              <thead><tr>
                <Th className="w-8"><Checkbox checked={selected.length === rows.length} onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])} /></Th>
                <Th>Name</Th><Th>Account</Th><Th>Email</Th><Th>Phone</Th><Th>Lifecycle</Th><Th>Owner</Th><Th>Tags</Th><Th right>Last activity</Th>
              </tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setId(c.id)}>
                    <Td><span onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.includes(c.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} /></span></Td>
                    <Td><div className="flex items-center gap-2"><Avatar name={fullName(c)} size={24} /><div><div className="font-semibold">{fullName(c)}</div><div className="text-xs text-ink-3">{c.title ?? ''}</div></div></div></Td>
                    <Td>{c.account?.name ?? <span className="text-ink-3">—</span>}</Td>
                    <Td className="text-ink-2">{c.emails[0]?.emailLower ?? '—'}</Td>
                    <Td mono className="text-ink-2">{c.phones[0] ? phoneDisplay(c.phones[0].phoneE164) : '—'}</Td>
                    <Td><Badge tone={lifecycleTone(c.lifecycle)}>{titleCase(c.lifecycle)}</Badge></Td>
                    <Td>{fullName(c.owner)}</Td>
                    <Td><TagList tags={c.tags} /></Td>
                    <Td right className="text-ink-3">{relative(c.lastActivityAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination count={rows.length} hasMore={Boolean(q.data?.nextCursor)} onMore={loadMore} loading={q.isFetching} />
          </>
        )}
      </Card>

      <ContactDrawer id={id} onClose={() => setId(null)} onEdit={(c) => setEditing(c)} />
      {editing && <ContactFormModal contact={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ContactDrawer({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (c: Contact) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const q = useContact(id);
  const [tab, setTab] = useState<'overview' | 'activities' | 'deals'>('overview');
  const [owner, setOwner] = useState('');
  const assign = useCrmMutation((ownerId: string) => http.post(`/crm/contacts/${id}/assign`, { ownerId }), [['contacts'], ['activities']]);
  const del = useCrmMutation(() => http.del(`/crm/contacts/${id}`), [['contacts']]);
  const c = q.data;
  return (
    <Drawer open={Boolean(id)} onClose={onClose} title={c ? fullName(c) : 'Contact'} subtitle={c ? [c.title, c.account?.name].filter(Boolean).join(' · ') || 'No account' : undefined}
      actions={c && <>
        {can('crm.contacts.edit') && <Button size="sm" icon={<Pencil size={13} />} onClick={() => onEdit(c)}>Edit</Button>}
        {can('crm.contacts.delete') && <Button size="sm" variant="danger-outline" icon={<Trash2 size={13} />} loading={del.isPending} onClick={() => window.confirm('Delete this contact?') && del.mutate(undefined, { onSuccess: () => { toast.push('success', 'Contact deleted'); onClose(); } })}>Delete</Button>}
      </>}>
      {q.isLoading && <div className="space-y-3 p-5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {c && (
        <div className="p-5">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Lifecycle</div><div className="mt-1"><Badge tone={lifecycleTone(c.lifecycle)}>{titleCase(c.lifecycle)}</Badge></div></div>
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Open deals</div><div className="mt-1 font-mono text-lg font-semibold">{(c.deals ?? []).filter((d) => !d.wonAt && !d.lostAt).length}</div></div>
            <div className="rounded-card border border-line p-3"><div className="text-xs text-ink-3">Owner</div>
              {can('crm.contacts.assign') ? <div className="mt-1 flex gap-1"><OwnerSelect value={owner || c.ownerId || ''} onChange={setOwner} allowEmpty={false} /><Button size="sm" disabled={!owner || owner === c.ownerId} loading={assign.isPending} onClick={() => assign.mutate(owner, { onSuccess: () => toast.push('success', 'Reassigned') })}>Set</Button></div> : <div className="mt-1 text-[13px] font-semibold">{fullName(c.owner)}</div>}
            </div>
          </div>
          <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'overview', label: 'Overview' }, { value: 'activities', label: 'Activities' }, { value: 'deals', label: 'Deals', count: c.deals?.length ?? 0 }]} />
          {tab === 'overview' && (
            <div className="space-y-4">
              <div>
                <Row label="Account">{c.account ? <a className="text-pri hover:underline" href={`/admin/crm/accounts?id=${c.account.id}`}>{c.account.name}</a> : '—'}</Row>
                <Row label="Phones">{c.phones.length ? c.phones.map((p) => <span key={p.id} className="mr-3 inline-flex items-center gap-1 font-mono"><Phone size={11} />{phoneDisplay(p.phoneE164)} <span className="text-ink-3">{p.label}</span></span>) : '—'}</Row>
                <Row label="Emails">{c.emails.length ? c.emails.map((e) => <span key={e.id} className="mr-3 inline-flex items-center gap-1"><Mail size={11} />{e.emailLower} <span className="text-ink-3">{e.label}</span></span>) : '—'}</Row>
                <Row label="Address">{[c.address?.line1, c.address?.city, c.address?.state, c.address?.postalCode, c.address?.country].filter(Boolean).join(', ') || '—'}</Row>
                <Row label="Preferences">{c.doNotCall && <Badge tone="red" className="mr-1">Do not call</Badge>}{c.doNotEmail && <Badge tone="red">Do not email</Badge>}{!c.doNotCall && !c.doNotEmail && 'None'}</Row>
                <Row label="Tags"><TagList tags={c.tags} /></Row>
                <Row label="Created">{dateTime(c.createdAt)}{c.leadId && <span className="ml-2 text-ink-3">from lead</span>}</Row>
              </div>
              <CustomFieldValues entityType="contact" values={c.custom} />
            </div>
          )}
          {tab === 'activities' && <ActivityTimeline entityType="contact" entityId={c.id} canEdit={can('crm.contacts.edit')} />}
          {tab === 'deals' && (
            (c.deals ?? []).length === 0 ? <EmptyState title="No deals" body="Deals linked to this contact appear here." /> : (
              <Table><thead><tr><Th>Deal</Th><Th>Stage</Th><Th right>Amount</Th><Th>Role</Th></tr></thead><tbody>
                {c.deals!.map((d) => <tr key={d.id} className="hover:bg-surface-2"><Td><a className="font-semibold text-pri hover:underline" href={`/admin/crm/deals?id=${d.id}`}>{d.name}</a></Td><Td><Badge tone={stageTone(d.stage.type)}>{d.stage.name}</Badge></Td><Td right mono>{money(d.amount, d.currency)}</Td><Td className="text-ink-2">{d.role ?? (d.isPrimary ? 'Primary' : '—')}</Td></tr>)}
              </tbody></Table>
            )
          )}
        </div>
      )}
    </Drawer>
  );
}

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
        {dup && <div className="rounded-lg bg-amber-soft px-3 py-2 text-[13px] text-amber">{dup}<label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} /> Create anyway</label></div>}
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
