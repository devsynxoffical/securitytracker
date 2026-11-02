import { useMemo, useState } from 'react';
import { Phone, Plus, Search, StickyNote, CalendarPlus, Target, Building2 } from 'lucide-react';
import { http, errorMessage } from '../lib/bridge';
import { useQuery } from '../lib/useQuery';
import { money, dateTime, date, fullName } from '../lib/format';
import type { Lead, Page, Pipeline } from '../lib/types';
import { Badge, Button, Card, Empty, ErrorBanner, SkeletonRows, Input, Select, Textarea, Field, Modal, Row, Tabs, statusTone, PageHeader, Table, Th, Td, Avatar } from '../components/ui';

const OUTCOMES = ['Connected', 'No answer', 'Busy', 'Voicemail', 'Wrong number', 'Do not call'];

/** F10/F12: the employee's own leads, lead detail with notes, calls, appointments, stage, follow-up. */
export function CrmScreen({ online }: { online: boolean }) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const pipelines = useQuery(() => http.get<Pipeline[]>('/pipelines?entity=lead'), []);
  const leads = useQuery(() => http.get<Page<Lead>>(`/leads?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`), [search], { intervalMs: 120_000 });
  const pipeline = pipelines.data?.find((p) => p.isDefault) ?? pipelines.data?.[0];

  const leadCount = leads.data?.items.length ?? 0;
  return (
    <div className="space-y-4">
      <PageHeader
        title="CRM"
        subtitle="Leads assigned to you. Log calls, notes and appointments, and move them through the pipeline."
        actions={
          <>
            <div className="relative w-72">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input className="h-[34px] pl-8 text-xs" placeholder="Search my leads…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="primary" disabled={!online || !pipeline} icon={<Plus size={14} />} onClick={() => setCreating(true)}>
              New lead
            </Button>
          </>
        }
      />
      <Card title="My leads" subtitle={leads.loading ? undefined : `${leadCount} lead${leadCount === 1 ? '' : 's'}${pipeline ? ` · ${pipeline.name}` : ''}`} padded={false}>
        {leads.loading ? (
          <div className="p-4"><SkeletonRows rows={8} /></div>
        ) : leads.error ? (
          <div className="p-4"><ErrorBanner message={errorMessage(leads.error)} onRetry={leads.refetch} /></div>
        ) : !leads.data?.items.length ? (
          <Empty icon={<Target size={22} />} title={search ? 'No leads match your search' : 'No leads assigned to you'} body={search ? 'Try a different name, company or phone number.' : 'Leads your manager assigns, or that you create, appear here.'} action={!search && online && pipeline ? <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreating(true)}>New lead</Button> : undefined} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Lead</Th>
                <Th>Stage</Th>
                <Th>Phone</Th>
                <Th right>Value</Th>
                <Th>Follow-up</Th>
              </tr>
            </thead>
            <tbody>
              {leads.data.items.map((l) => {
                const late = Boolean(l.followUpAt && new Date(l.followUpAt) < new Date());
                return (
                  <tr key={l.id} onClick={() => setSelectedId(l.id)} className="group cursor-pointer transition hover:bg-surface-2">
                    <Td>
                      <span className="flex items-center gap-3">
                        <Avatar name={l.name} size={30} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{l.name}</span>
                          <span className="flex items-center gap-1 truncate text-xs text-ink-3">{l.companyName ? <><Building2 size={11} /> {l.companyName}</> : '—'}</span>
                        </span>
                        {l.doNotCall && <Badge tone="red">DNC</Badge>}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={l.stage.type === 'won' ? 'green' : l.stage.type === 'lost' ? 'red' : 'blue'} dot>{l.stage.name}</Badge>
                    </Td>
                    <Td mono>{l.phones[0]?.phoneE164 ?? '—'}</Td>
                    <Td right mono className="text-ink">{money(l.value, l.currency)}</Td>
                    <Td mono className={late ? 'text-red-text' : 'text-ink-2'}>{l.followUpAt ? dateTime(l.followUpAt) : '—'}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {selectedId && <LeadDrawer id={selectedId} online={online} onClose={() => setSelectedId(null)} onChanged={() => void leads.refetch()} />}
      {creating && pipeline && <NewLeadModal pipeline={pipeline} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void leads.refetch(); }} />}
    </div>
  );
}

function LeadDrawer({ id, online, onClose, onChanged }: { id: string; online: boolean; onClose: () => void; onChanged: () => void }) {
  const lead = useQuery(() => http.get<Lead>(`/leads/${id}`), [id]);
  const [tab, setTab] = useState<'overview' | 'timeline'>('overview');
  const [action, setAction] = useState<'note' | 'call' | 'appointment' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const l = lead.data;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await lead.refetch();
      onChanged();
      setAction(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const stages = l?.pipeline?.stages ?? [];
  const timeline = useMemo(() => {
    if (!l) return [];
    return [
      ...(l.notes ?? []).map((n) => ({ id: n.id, at: n.createdAt, label: 'Note', text: n.body })),
      ...(l.callLogs ?? []).map((c) => ({ id: c.id, at: c.occurredAt, label: `Call · ${c.outcome}`, text: `${c.direction}, ${Math.round(c.durationSeconds / 60)} min${c.notes ? ` — ${c.notes}` : ''}` })),
      ...(l.appointments ?? []).map((a) => ({ id: a.id, at: a.startsAt, label: `Appointment · ${a.status}`, text: a.title })),
      ...(l.timeline ?? []).filter((t) => t.type === 'stage_changed' || t.type === 'assigned' || t.type === 'created').map((t) => ({ id: t.id, at: t.occurredAt, label: t.type.replace('_', ' '), text: String((t.data as { stageName?: string }).stageName ?? '') })),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [l]);

  return (
    <Modal open onClose={onClose} title={l?.name ?? 'Lead'} subtitle={l?.companyName ?? undefined} width={700}>
      {lead.loading ? (
        <SkeletonRows rows={6} />
      ) : lead.error || !l ? (
        <ErrorBanner message={errorMessage(lead.error)} onRetry={lead.refetch} />
      ) : (
        <>
          {error && <ErrorBanner message={error} className="mb-3" />}
          {l.doNotCall && <div className="mb-3 rounded-lg border border-red/30 bg-red-soft px-3 py-2 text-sm text-red-text">Do not call: this lead asked not to be contacted by phone.</div>}
          {l.convertedAt && <div className="mb-3 rounded-lg border border-green/30 bg-green-soft px-3 py-2 text-sm text-green-text">Converted to a contact on {date(l.convertedAt)}. This lead is read-only.</div>}
          <div className="mb-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={!online || busy || l.doNotCall || Boolean(l.convertedAt)} icon={<Phone size={13} />} onClick={() => setAction('call')}>
              Log call
            </Button>
            <Button size="sm" disabled={!online || busy || Boolean(l.convertedAt)} icon={<StickyNote size={13} />} onClick={() => setAction('note')}>
              Note
            </Button>
            <Button size="sm" disabled={!online || busy || Boolean(l.convertedAt)} icon={<CalendarPlus size={13} />} onClick={() => setAction('appointment')}>
              Appointment
            </Button>
            <div className="ml-auto flex items-center gap-2 text-xs text-ink-2">
              Stage
              <Select
                className="h-8 w-44 text-xs"
                aria-label="Stage"
                value={l.stage.id}
                disabled={!online || busy || Boolean(l.convertedAt)}
                onChange={(e) => {
                  const stage = stages.find((s) => s.id === e.target.value);
                  if (stage?.type === 'lost') {
                    const reason = window.prompt('Lost reason id (ask your manager for the list) — leave empty to cancel');
                    if (!reason) return;
                    return void run(() => http.post(`/leads/${id}/stage`, { stageId: stage.id, lostReasonId: reason }));
                  }
                  void run(() => http.post(`/leads/${id}/stage`, { stageId: e.target.value }));
                }}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'timeline', label: 'Timeline', count: timeline.length }]} />
          {tab === 'overview' ? (
            <div className="grid grid-cols-2 gap-x-6 pt-2">
              <div>
                <Row label="Company">{l.companyName ?? '—'}</Row>
                <Row label="Value">{money(l.value, l.currency)}</Row>
                <Row label="Owner">{l.owner ? fullName(l.owner) : '—'}</Row>
                <Row label="Status"><Badge tone={statusTone(l.stage.type)}>{l.stage.name}</Badge></Row>
              </div>
              <div>
                {l.phones.map((p) => (
                  <Row key={p.phoneE164} label={p.label}>
                    <a href={`tel:${p.phoneE164}`} className="font-mono text-xs text-pri hover:underline">{p.phoneE164}</a>
                  </Row>
                ))}
                {l.emails.map((e) => (
                  <Row key={e.emailLower} label={e.label}><span className="font-mono text-xs">{e.emailLower}</span></Row>
                ))}
                <Row label="Follow-up">
                  <Input
                    type="datetime-local"
                    className="h-8 w-48 text-xs"
                    disabled={!online || busy || Boolean(l.convertedAt)}
                    defaultValue={l.followUpAt ? new Date(l.followUpAt).toISOString().slice(0, 16) : ''}
                    onBlur={(e) => e.target.value && void run(() => http.patch(`/leads/${id}`, { followUpAt: new Date(e.target.value).toISOString() }))}
                  />
                </Row>
              </div>
            </div>
          ) : timeline.length === 0 ? (
            <Empty compact title="No activity yet" body="Calls, notes and appointments you log appear here." />
          ) : (
            <ul className="divide-y divide-line-2 pt-1">
              {timeline.map((t) => (
                <li key={t.id} className="flex gap-3 py-2.5 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-pri/60" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-2xs text-ink-3">
                      <span className="font-semibold uppercase">{t.label}</span>
                      <span className="font-mono normal-case tracking-normal">{dateTime(t.at)}</span>
                    </div>
                    <div className="text-ink">{t.text}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {action === 'note' && <NoteForm busy={busy} onCancel={() => setAction(null)} onSubmit={(body) => run(() => http.post(`/leads/${id}/notes`, { body }))} />}
          {action === 'call' && <CallForm busy={busy} stages={stages} onCancel={() => setAction(null)} onSubmit={(body) => run(() => http.post('/calls', { leadId: id, ...body }))} />}
          {action === 'appointment' && <AppointmentForm busy={busy} onCancel={() => setAction(null)} onSubmit={(body) => run(() => http.post(`/leads/${id}/appointments`, body))} />}
        </>
      )}
    </Modal>
  );
}

function NoteForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (body: string) => void }) {
  const [body, setBody] = useState('');
  return (
    <div className="pop-in mt-3 rounded-card border border-line bg-surface-2 p-3.5">
      <Textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a note…" />
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={busy || !body.trim()} onClick={() => onSubmit(body.trim())}>Save note</Button>
      </div>
    </div>
  );
}

function CallForm({ busy, stages, onCancel, onSubmit }: { busy: boolean; stages: Pipeline['stages']; onCancel: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound');
  const [outcome, setOutcome] = useState(OUTCOMES[0]!);
  const [minutes, setMinutes] = useState('5');
  const [notes, setNotes] = useState('');
  const [next, setNext] = useState('');
  const [stageId, setStageId] = useState('');
  return (
    <div className="pop-in mt-3 space-y-3 rounded-card border border-line bg-surface-2 p-3.5">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Direction">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as 'outbound' | 'inbound')}>
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </Select>
        </Field>
        <Field label="Outcome">
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {OUTCOMES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </Field>
        <Field label="Duration (min)">
          <Input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Next follow-up (optional)">
          <Input type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Move to stage (optional)">
          <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">Keep current</option>
            {stages.filter((s) => s.type === 'open').map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => onSubmit({ direction, outcome, durationSeconds: Math.max(0, Math.round(Number(minutes) * 60)), notes: notes || undefined, nextFollowUpAt: next ? new Date(next).toISOString() : undefined, newStageId: stageId || undefined })}>
          Log call
        </Button>
      </div>
    </div>
  );
}

function AppointmentForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <div className="pop-in mt-3 space-y-3 rounded-card border border-line bg-surface-2 p-3.5">
      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Ends"><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={busy || !title || !start || !end} onClick={() => onSubmit({ title, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), notes: notes || undefined })}>
          Schedule
        </Button>
      </div>
    </div>
  );
}

function NewLeadModal({ pipeline, onClose, onCreated }: { pipeline: Pipeline; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Array<{ id: string; name: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const firstStage = [...pipeline.stages].sort((a, b) => a.position - b.position)[0];

  const submit = async (allowDuplicate = false) => {
    if (!firstStage) return;
    setBusy(true);
    setError(null);
    try {
      await http.post('/leads', {
        name,
        companyName: company || undefined,
        pipelineId: pipeline.id,
        stageId: firstStage.id,
        value: value ? Number(value) : undefined,
        currency: 'USD',
        phones: phone ? [{ phone, label: 'Mobile', isPrimary: true }] : undefined,
        emails: email ? [{ email, label: 'Work', isPrimary: true }] : undefined,
        allowDuplicate,
      });
      onCreated();
    } catch (e) {
      const err = e as { api?: { code?: string; details?: { matches?: Array<{ id: string; name: string }> } } };
      if (err.api?.code === 'LEAD_DUPLICATE') setDuplicates(err.api.details?.matches ?? []);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New lead" subtitle="Created in the default pipeline and assigned to you." width={480} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !name} loading={busy} onClick={() => void submit(false)}>Create lead</Button></>}>
      <div className="space-y-3">
        {error && <ErrorBanner message={error} />}
        {duplicates && (
          <div className="rounded-card border border-amber/30 bg-amber-soft p-3 text-sm text-amber-text">
            A lead with this phone or email exists: {duplicates.map((d) => d.name).join(', ') || 'see CRM'}.
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => setDuplicates(null)}>Edit</Button>
              <Button size="sm" variant="primary" onClick={() => void submit(true)}>Create anyway</Button>
            </div>
          </div>
        )}
        <Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Company"><Input value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        </div>
        <Field label="Value (USD)"><Input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-3">Pipeline <span className="text-ink-2">{pipeline.name}</span> · Stage <span className="text-ink-2">{firstStage?.name}</span></div>
      </div>
    </Modal>
  );
}
