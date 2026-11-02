'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown, Check, X } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePipelines, useSources, useLostReasons, useTags, useCustomFields, useCrmMutation, type Pipeline, type Stage, type Lookup, type Tag, type CustomFieldDef, type EntityType } from '@/lib/queries/crm';
import { Button, Card, Tabs, Table, Th, Td, Badge, stageTone, Skeleton, EmptyState, ErrorBanner, Modal, Field, Input, Select, Checkbox, Segmented, TagChip, useToast, PageHeader, Banner } from '@/components/ui';
import { titleCase } from '@/lib/format';

type Tab = 'pipelines' | 'fields' | 'tags' | 'sources' | 'lost';
const ENTITIES: EntityType[] = ['lead', 'contact', 'account', 'deal'];
const FIELD_TYPES = ['text', 'number', 'date', 'select', 'multi_select', 'checkbox', 'url', 'phone', 'email'];

export default function CrmSettingsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('pipelines');
  const canPipelines = can('crm.pipelines.manage');
  const canConfig = can('crm.config.manage');
  return (
    <div>
      <PageHeader title="CRM settings" subtitle="Pipelines and stages, custom fields, tags, lead sources and lost reasons." />
      {!canPipelines && !canConfig && <div className="mb-3"><Banner tone="amber">You can view the configuration. Changes need crm.pipelines.manage or crm.config.manage.</Banner></div>}
      <Card>
        <Tabs value={tab} onChange={setTab} className="px-3" tabs={[{ value: 'pipelines', label: 'Pipelines & stages' }, { value: 'fields', label: 'Custom fields' }, { value: 'tags', label: 'Tags' }, { value: 'sources', label: 'Lead sources' }, { value: 'lost', label: 'Lost reasons' }]} />
        {tab === 'pipelines' && <PipelinesTab canEdit={canPipelines} />}
        {tab === 'fields' && <CustomFieldsTab canEdit={canConfig} />}
        {tab === 'tags' && <TagsTab canEdit={canConfig} />}
        {tab === 'sources' && <LookupTab kind="sources" canEdit={canConfig} />}
        {tab === 'lost' && <LookupTab kind="lost-reasons" canEdit={canConfig} />}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

function PipelinesTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [entity, setEntity] = useState<'lead' | 'deal'>('deal');
  const q = usePipelines(entity);
  const [newName, setNewName] = useState('');
  const [editStage, setEditStage] = useState<{ pipeline: Pipeline; stage: Stage | null } | null>(null);
  const inv = [['pipelines']];
  const createPipeline = useCrmMutation((name: string) => http.post('/pipelines', { name, entity, isDefault: (q.data?.length ?? 0) === 0 }), inv);
  const patchPipeline = useCrmMutation((a: { id: string; body: Record<string, unknown> }) => http.patch(`/pipelines/${a.id}`, a.body), inv);
  const deletePipeline = useCrmMutation((id: string) => http.del(`/pipelines/${id}`), inv);
  const deleteStage = useCrmMutation((a: { pipelineId: string; stageId: string }) => http.del(`/pipelines/${a.pipelineId}/stages/${a.stageId}`), inv);
  const reorder = useCrmMutation((a: { pipelineId: string; stageIds: string[] }) => http.post(`/pipelines/${a.pipelineId}/stages/reorder`, { stageIds: a.stageIds }), inv);
  const err = (e: unknown) => toast.push('error', (e as Error).message);

  const moveStage = (p: Pipeline, i: number, dir: -1 | 1) => {
    const ids = p.stages.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate({ pipelineId: p.id, stageIds: ids }, { onError: err });
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Segmented value={entity} onChange={setEntity} options={[{ value: 'deal', label: 'Deal pipelines' }, { value: 'lead', label: 'Lead pipelines' }]} />
        {canEdit && (
          <div className="flex gap-2">
            <Input className="w-56" placeholder="New pipeline name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button variant="primary" icon={<Plus size={14} />} disabled={!newName.trim()} loading={createPipeline.isPending} onClick={() => createPipeline.mutate(newName.trim(), { onSuccess: () => setNewName(''), onError: err })}>Add</Button>
          </div>
        )}
      </div>
      {q.isLoading && <Skeleton className="h-40" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title={`No ${entity} pipelines`} body="Add one above to start tracking stages." />}
      <div className="space-y-4">
        {q.data?.map((p) => (
          <div key={p.id} className="rounded-card border border-line">
            <div className="flex items-center justify-between gap-3 border-b border-line-2 bg-surface-2 px-4 py-2.5">
              <div className="flex items-center gap-2 text-[13px]"><span className="font-semibold text-ink">{p.name}</span>{p.isDefault && <Badge tone="primary">Default</Badge>}<span className="font-mono text-xs text-ink-3">{entity === 'deal' ? p._count?.deals ?? 0 : p._count?.leads ?? 0} records</span></div>
              {canEdit && (
                <div className="flex gap-1">
                  {!p.isDefault && <Button size="sm" variant="ghost" onClick={() => patchPipeline.mutate({ id: p.id, body: { isDefault: true } }, { onError: err })}>Make default</Button>}
                  <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => setEditStage({ pipeline: p, stage: null })}>Stage</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => window.confirm(`Delete pipeline “${p.name}”?`) && deletePipeline.mutate(p.id, { onError: err })} />
                </div>
              )}
            </div>
            <Table>
              <thead><tr><Th className="w-12">#</Th><Th>Stage</Th><Th>Type</Th><Th right>Probability</Th><Th>Metric flags</Th>{canEdit && <Th right>Actions</Th>}</tr></thead>
              <tbody>
                {p.stages.map((s, i) => (
                  <tr key={s.id} className="hover:bg-surface-2">
                    <Td mono className="text-ink-3">{s.position}</Td>
                    <Td className="font-semibold">{s.name}</Td>
                    <Td><Badge tone={stageTone(s.type)}>{s.type}</Badge></Td>
                    <Td right mono>{s.probability}%</Td>
                    <Td className="text-xs text-ink-2">{[s.countsAsQualified && 'qualified', s.countsAsMeeting && 'meeting'].filter(Boolean).join(', ') || '—'}</Td>
                    {canEdit && (
                      <Td right>
                        <span className="inline-flex gap-0.5">
                          <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => moveStage(p, i, -1)} aria-label="Move up"><ArrowUp size={12} /></Button>
                          <Button size="sm" variant="ghost" disabled={i === p.stages.length - 1} onClick={() => moveStage(p, i, 1)} aria-label="Move down"><ArrowDown size={12} /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditStage({ pipeline: p, stage: s })} aria-label="Edit"><Pencil size={12} /></Button>
                          <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete stage “${s.name}”?`) && deleteStage.mutate({ pipelineId: p.id, stageId: s.id }, { onError: err })} aria-label="Delete"><Trash2 size={12} /></Button>
                        </span>
                      </Td>
                    )}
                  </tr>
                ))}
                {p.stages.length === 0 && <tr><Td className="text-ink-3" colSpan={6}>No stages yet.</Td></tr>}
              </tbody>
            </Table>
          </div>
        ))}
      </div>
      {editStage && <StageModal pipeline={editStage.pipeline} stage={editStage.stage} onClose={() => setEditStage(null)} />}
    </div>
  );
}

function StageModal({ pipeline, stage, onClose }: { pipeline: Pipeline; stage: Stage | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(stage?.name ?? '');
  const [type, setType] = useState<'open' | 'won' | 'lost'>(stage?.type ?? 'open');
  const [probability, setProbability] = useState(String(stage?.probability ?? (type === 'won' ? 100 : 0)));
  const [qualified, setQualified] = useState(stage?.countsAsQualified ?? false);
  const [meeting, setMeeting] = useState(stage?.countsAsMeeting ?? false);
  const save = useCrmMutation((body: Record<string, unknown>) => (stage ? http.patch(`/pipelines/${pipeline.id}/stages/${stage.id}`, body) : http.post(`/pipelines/${pipeline.id}/stages`, body)), [['pipelines']]);
  const submit = () => save.mutate(
    { name, type, probability: Number(probability), countsAsQualified: qualified, countsAsMeeting: meeting, ...(stage ? {} : { position: pipeline.stages.length + 1 }) },
    { onSuccess: () => { toast.push('success', stage ? 'Stage updated' : 'Stage added'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) },
  );
  return (
    <Modal open onClose={onClose} title={stage ? `Edit stage · ${pipeline.name}` : `New stage · ${pipeline.name}`} width={460} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim()} loading={save.isPending} onClick={submit}>{stage ? 'Save' : 'Add stage'}</Button></>}>
      <div className="space-y-3">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Select value={type} onChange={(e) => { const t = e.target.value as typeof type; setType(t); if (t === 'won') setProbability('100'); if (t === 'lost') setProbability('0'); }}><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></Select></Field>
          <Field label="Probability %" hint="Default for deals entering this stage"><Input type="number" min={0} max={100} value={probability} onChange={(e) => setProbability(e.target.value)} /></Field>
        </div>
        <div className="flex gap-6 pt-1">
          <Checkbox label="Counts as qualified" checked={qualified} onChange={(e) => setQualified(e.target.checked)} />
          <Checkbox label="Counts as meeting" checked={meeting} onChange={(e) => setMeeting(e.target.checked)} />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

function CustomFieldsTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [entity, setEntity] = useState<EntityType>('lead');
  const q = useCustomFields(entity, true);
  const [editing, setEditing] = useState<CustomFieldDef | null | 'new'>(null);
  const remove = useCrmMutation((id: string) => http.del(`/crm/config/custom-fields/${id}`), [['crm', 'custom-fields']]);
  const toggle = useCrmMutation((a: { id: string; isActive: boolean }) => http.patch(`/crm/config/custom-fields/${a.id}`, { isActive: a.isActive }), [['crm', 'custom-fields']]);
  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <Segmented value={entity} onChange={setEntity} options={ENTITIES.map((e) => ({ value: e, label: `${titleCase(e)}s` }))} />
        {canEdit && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New field</Button>}
      </div>
      {q.isLoading && <Skeleton className="h-32" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title={`No custom fields for ${entity}s`} body="Custom fields appear on forms, detail views and in CSV import mapping." action={canEdit ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New field</Button> : undefined} />}
      {q.data && q.data.length > 0 && (
        <Table>
          <thead><tr><Th>Label</Th><Th>Key</Th><Th>Type</Th><Th>Options</Th><Th>Required</Th><Th>Status</Th>{canEdit && <Th right>Actions</Th>}</tr></thead>
          <tbody>
            {q.data.map((f) => (
              <tr key={f.id} className="hover:bg-surface-2">
                <Td className="font-semibold">{f.label}</Td>
                <Td mono className="text-xs text-ink-2">{f.key}</Td>
                <Td>{titleCase(f.type)}</Td>
                <Td className="max-w-xs truncate text-xs text-ink-2">{f.options?.join(', ') || '—'}</Td>
                <Td>{f.required ? <Check size={14} className="text-green" /> : <X size={14} className="text-ink-3" />}</Td>
                <Td><Badge tone={f.isActive ? 'green' : 'gray'}>{f.isActive ? 'Active' : 'Inactive'}</Badge></Td>
                {canEdit && <Td right><span className="inline-flex gap-0.5">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(f)} aria-label="Edit"><Pencil size={12} /></Button>
                  {f.isActive ? <Button size="sm" variant="ghost" onClick={() => remove.mutate(f.id, { onError: (e) => toast.push('error', (e as Error).message) })} aria-label="Deactivate"><Trash2 size={12} /></Button> : <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: f.id, isActive: true })}>Reactivate</Button>}
                </span></Td>}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <FieldModal entity={entity} field={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function FieldModal({ entity, field, onClose }: { entity: EntityType; field: CustomFieldDef | null; onClose: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState(field?.label ?? '');
  const [key, setKey] = useState(field?.key ?? '');
  const [type, setType] = useState(field?.type ?? 'text');
  const [options, setOptions] = useState(field?.options?.join('\n') ?? '');
  const [required, setRequired] = useState(field?.required ?? false);
  const save = useCrmMutation((body: Record<string, unknown>) => (field ? http.patch(`/crm/config/custom-fields/${field.id}`, body) : http.post('/crm/config/custom-fields', body)), [['crm', 'custom-fields']]);
  const needsOptions = type === 'select' || type === 'multi_select';
  const autoKey = (l: string) => l.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9]/, 'f$&');
  const submit = () => save.mutate(
    { ...(field ? {} : { entityType: entity, key: key || autoKey(label) }), label, type, options: needsOptions ? options.split('\n').map((s) => s.trim()).filter(Boolean) : undefined, required },
    { onSuccess: () => { toast.push('success', field ? 'Field updated' : 'Field created'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) },
  );
  return (
    <Modal open onClose={onClose} title={field ? 'Edit custom field' : `New custom field · ${titleCase(entity)}s`} width={480} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!label.trim() || (needsOptions && !options.trim())} loading={save.isPending} onClick={submit}>{field ? 'Save' : 'Create'}</Button></>}>
      <div className="space-y-3">
        <Field label="Label" required><Input value={label} onChange={(e) => { setLabel(e.target.value); if (!field) setKey(autoKey(e.target.value)); }} autoFocus /></Field>
        <Field label="Key" hint="snake_case; stored in the record. Cannot change later."><Input value={key} disabled={Boolean(field)} onChange={(e) => setKey(e.target.value)} className="font-mono" /></Field>
        <Field label="Type"><Select value={type} onChange={(e) => setType(e.target.value)}>{FIELD_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
        {needsOptions && <Field label="Options" hint="One per line" required><textarea className="h-28 w-full rounded-lg border border-line px-3 py-2 text-[13px] focus:border-pri focus:outline-none focus:ring-[3px] focus:ring-pri-soft" value={options} onChange={(e) => setOptions(e.target.value)} /></Field>}
        <Checkbox label="Required on create" checked={required} onChange={(e) => setRequired(e.target.checked)} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

const PALETTE = ['#0F6B5C', '#1E8E5A', '#B26A00', '#C2362B', '#2459C4', '#6B46C1', '#5C666E', '#E0921A'];

function TagsTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const q = useTags();
  const [name, setName] = useState('');
  const [colour, setColour] = useState(PALETTE[0]!);
  const [editing, setEditing] = useState<Tag | null>(null);
  const inv = [['crm', 'tags']];
  const create = useCrmMutation((b: { name: string; colour: string }) => http.post('/crm/config/tags', b), inv);
  const update = useCrmMutation((a: { id: string; body: { name: string; colour: string } }) => http.patch(`/crm/config/tags/${a.id}`, a.body), inv);
  const remove = useCrmMutation((id: string) => http.del(`/crm/config/tags/${id}`), [...inv, ['leads'], ['contacts'], ['accounts'], ['deals']]);
  const err = (e: unknown) => toast.push('error', (e as Error).message);
  return (
    <div className="p-4">
      {canEdit && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface-2 p-3">
          <Field label={editing ? 'Rename tag' : 'New tag'}><Input className="w-56" value={editing ? editing.name : name} onChange={(e) => (editing ? setEditing({ ...editing, name: e.target.value }) : setName(e.target.value))} placeholder="e.g. Hot" /></Field>
          <Field label="Colour"><div className="flex gap-1.5">{PALETTE.map((c) => <button key={c} type="button" onClick={() => (editing ? setEditing({ ...editing, colour: c }) : setColour(c))} className="h-7 w-7 rounded-full border-2" style={{ backgroundColor: c, borderColor: (editing ? editing.colour : colour) === c ? '#151A1E' : 'transparent' }} aria-label={c} /> )}</div></Field>
          {editing ? <>
            <Button variant="primary" loading={update.isPending} onClick={() => update.mutate({ id: editing.id, body: { name: editing.name, colour: editing.colour } }, { onSuccess: () => setEditing(null), onError: err })}>Save</Button>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
          </> : <Button variant="primary" icon={<Plus size={14} />} disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate({ name: name.trim(), colour }, { onSuccess: () => setName(''), onError: err })}>Add tag</Button>}
        </div>
      )}
      {q.isLoading && <Skeleton className="h-24" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title="No tags yet" body="Tags can be applied to leads, contacts, accounts and deals." />}
      {q.data && q.data.length > 0 && (
        <Table>
          <thead><tr><Th>Tag</Th><Th>Colour</Th><Th right>Used on</Th>{canEdit && <Th right>Actions</Th>}</tr></thead>
          <tbody>{q.data.map((t) => (
            <tr key={t.id} className="hover:bg-surface-2">
              <Td><TagChip name={t.name} colour={t.colour} /></Td>
              <Td mono className="text-xs text-ink-2">{t.colour}</Td>
              <Td right mono>{t.usageCount ?? 0}</Td>
              {canEdit && <Td right><span className="inline-flex gap-0.5"><Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label="Edit"><Pencil size={12} /></Button><Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete tag “${t.name}”? It is removed from ${t.usageCount ?? 0} records.`) && remove.mutate(t.id, { onError: err })} aria-label="Delete"><Trash2 size={12} /></Button></span></Td>}
            </tr>
          ))}</tbody>
        </Table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lead sources / lost reasons
// ---------------------------------------------------------------------------

function LookupTab({ kind, canEdit }: { kind: 'sources' | 'lost-reasons'; canEdit: boolean }) {
  const toast = useToast();
  const q = kind === 'sources' ? useSources(true) : useLostReasons(true); // eslint-disable-line react-hooks/rules-of-hooks
  const label = kind === 'sources' ? 'Lead source' : 'Lost reason';
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Lookup | null>(null);
  const inv = [['crm', kind === 'sources' ? 'sources' : 'lost-reasons']];
  const create = useCrmMutation((n: string) => http.post(`/crm/config/${kind}`, { name: n }), inv);
  const update = useCrmMutation((a: { id: string; body: Record<string, unknown> }) => http.patch(`/crm/config/${kind}/${a.id}`, a.body), inv);
  const remove = useCrmMutation((id: string) => http.del(`/crm/config/${kind}/${id}`), inv);
  const err = (e: unknown) => toast.push('error', (e as Error).message);
  return (
    <div className="p-4">
      {canEdit && (
        <div className="mb-4 flex items-end gap-2">
          <Field label={editing ? `Rename ${label.toLowerCase()}` : `New ${label.toLowerCase()}`}><Input className="w-64" value={editing ? editing.name : name} onChange={(e) => (editing ? setEditing({ ...editing, name: e.target.value }) : setName(e.target.value))} /></Field>
          {editing ? <><Button variant="primary" loading={update.isPending} onClick={() => update.mutate({ id: editing.id, body: { name: editing.name } }, { onSuccess: () => setEditing(null), onError: err })}>Save</Button><Button onClick={() => setEditing(null)}>Cancel</Button></>
            : <Button variant="primary" icon={<Plus size={14} />} disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate(name.trim(), { onSuccess: () => setName(''), onError: err })}>Add</Button>}
        </div>
      )}
      {q.isLoading && <Skeleton className="h-24" />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title={`No ${label.toLowerCase()}s`} />}
      {q.data && q.data.length > 0 && (
        <Table>
          <thead><tr><Th className="w-12">#</Th><Th>Name</Th><Th>Status</Th>{canEdit && <Th right>Actions</Th>}</tr></thead>
          <tbody>{q.data.map((r) => (
            <tr key={r.id} className="hover:bg-surface-2">
              <Td mono className="text-ink-3">{r.position}</Td>
              <Td className="font-semibold">{r.name}</Td>
              <Td><Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge></Td>
              {canEdit && <Td right><span className="inline-flex gap-0.5">
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label="Edit"><Pencil size={12} /></Button>
                <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: r.id, body: { isActive: !r.isActive } }, { onError: err })}>{r.isActive ? 'Deactivate' : 'Activate'}</Button>
                <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete “${r.name}”?`) && remove.mutate(r.id, { onError: err })} aria-label="Delete"><Trash2 size={12} /></Button>
              </span></Td>}
            </tr>
          ))}</tbody>
        </Table>
      )}
    </div>
  );
}
