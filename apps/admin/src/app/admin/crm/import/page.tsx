'use client';

import { useEffect, useMemo, useState } from 'react';
import { Upload, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { clsx } from 'clsx';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCustomFields, useEmployees, usePipelines, useSources, useTags, useImportJob, useCrmMutation, type ImportJob } from '@/lib/queries/crm';
import { Button, Card, Field, Select, Segmented, Table, Th, Td, Badge, Skeleton, ErrorBanner, EmptyState, Checkbox, useToast, PageHeader, KpiCard } from '@/components/ui';
import { OwnerSelect } from '@/components/crm/shared';
import { fullName, titleCase } from '@/lib/format';

type Entity = 'lead' | 'contact' | 'account';
type Step = 'upload' | 'map' | 'options' | 'review' | 'result';
const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'upload', label: 'Upload' },
  { key: 'map', label: 'Map columns' },
  { key: 'options', label: 'Options' },
  { key: 'review', label: 'Review' },
  { key: 'result', label: 'Result' },
];

export default function ImportPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [entity, setEntity] = useState<Entity>('lead');
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dupMode, setDupMode] = useState<'skip' | 'update' | 'create'>('skip');
  const [ownerMode, setOwnerMode] = useState<'me' | 'fixed' | 'round_robin'>('me');
  const [fixedOwner, setFixedOwner] = useState('');
  const [rrOwners, setRrOwners] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');

  const customFields = useCustomFields(entity);
  const employees = useEmployees();
  const tags = useTags();
  const sources = useSources();
  const pipelines = usePipelines('lead');
  const pipeline = pipelines.data?.find((p) => p.id === pipelineId) ?? pipelines.data?.find((p) => p.isDefault) ?? pipelines.data?.[0];
  const effectiveStage = stageId || pipeline?.stages[0]?.id || '';

  const upload = useCrmMutation((f: { name: string; csv: string }) => http.post<ImportJob>(`/crm/${entity}s/import`, { fileName: f.name, csv: f.csv }), []);
  const start = useCrmMutation((payload: Record<string, unknown>) => http.post<ImportJob>(`/crm/import/${job?.id}/start`, payload), [['leads'], ['contacts'], ['accounts'], ['crm', 'dashboard']]);
  const polling = step === 'result' && job !== null && job.status !== 'done' && job.status !== 'failed';
  const live = useImportJob(step === 'result' ? job?.id ?? null : null, polling);
  useEffect(() => {
    if (live.data) setJob(live.data);
  }, [live.data]);

  const canImport = can(`crm.${entity}s.import`);
  const fields = job?.fields ?? [];
  const mappedCount = Object.values(mapping).filter((v) => v && v !== 'ignore').length;
  const requiredOk = useMemo(() => {
    const vals = new Set(Object.values(mapping));
    if (entity === 'lead' || entity === 'account') return vals.has('name');
    return vals.has('firstName');
  }, [mapping, entity]);

  const onFile = async (f: File) => {
    const csv = await f.text();
    setFile({ name: f.name, csv });
    upload.mutate({ name: f.name, csv }, {
      onSuccess: (j) => { setJob(j); setMapping(j.suggestedMapping ?? {}); setStep('map'); },
      onError: (e) => toast.push('error', (e as Error).message),
    });
  };

  const launch = () =>
    start.mutate(
      {
        mapping,
        duplicateMode: dupMode,
        owner: ownerMode === 'fixed' ? { mode: 'fixed', employeeId: fixedOwner } : ownerMode === 'round_robin' ? { mode: 'round_robin', employeeIds: rrOwners } : undefined,
        tagIds: tagIds.length ? tagIds : undefined,
        sourceId: entity === 'lead' && sourceId ? sourceId : undefined,
        pipelineId: entity === 'lead' ? pipeline?.id : undefined,
        stageId: entity === 'lead' ? effectiveStage : undefined,
      },
      { onSuccess: (j) => { setJob(j); setStep('result'); }, onError: (e) => toast.push('error', (e as Error).message) },
    );

  const restart = () => { setStep('upload'); setFile(null); setJob(null); setMapping({}); };
  const idx = STEPS.findIndex((s) => s.key === step);

  return (
    <div>
      <PageHeader title="Import" subtitle="CSV import for leads, contacts and accounts with column mapping, duplicate handling and owner assignment (F23)." />
      <ol className="mb-4 flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className={clsx('flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-semibold', i < idx ? 'bg-green text-white' : i === idx ? 'bg-pri text-white' : 'bg-gray-soft text-ink-3')}>{i < idx ? '✓' : i + 1}</span>
            <span className={clsx('font-semibold', i === idx ? 'text-ink' : 'text-ink-3')}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-line" />}
          </li>
        ))}
      </ol>

      <Card>
        {step === 'upload' && (
          <div className="p-5">
            <Field label="What are you importing?" className="mb-4">
              <Segmented value={entity} onChange={setEntity} options={[{ value: 'lead', label: 'Leads' }, { value: 'contact', label: 'Contacts' }, { value: 'account', label: 'Accounts' }]} />
            </Field>
            {!canImport ? (
              <EmptyState icon={<AlertTriangle size={28} strokeWidth={1.75} />} title="No import permission" body={`You need crm.${entity}s.import to import ${entity}s.`} />
            ) : (
              <label className={clsx('flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed border-line px-6 py-12 text-center hover:border-pri hover:bg-pri-soft/30', upload.isPending && 'opacity-60')}>
                <input type="file" accept=".csv,text/csv" className="hidden" disabled={upload.isPending} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                <Upload size={28} className="mb-3 text-ink-3" />
                <div className="text-[13px] font-semibold text-ink">{upload.isPending ? 'Uploading…' : 'Choose a CSV file'}</div>
                <div className="mt-1 text-xs text-ink-3">Up to 20 MB and 50,000 rows. First row must be the header.</div>
                {file && <div className="mt-3 flex items-center gap-1 text-xs text-ink-2"><FileSpreadsheet size={13} /> {file.name}</div>}
              </label>
            )}
            {upload.isError && <ErrorBanner message={(upload.error as Error).message} />}
          </div>
        )}

        {step === 'map' && job && (
          <div>
            <div className="flex items-center justify-between border-b border-line px-5 py-3 text-[13px]">
              <span className="text-ink-2"><span className="font-semibold text-ink">{job.fileName}</span> · {job.rowCount.toLocaleString()} rows · {mappedCount}/{job.headers.length} columns mapped</span>
              {!requiredOk && <Badge tone="amber">{entity === 'contact' ? 'Map “firstName”' : 'Map “name”'} to continue</Badge>}
            </div>
            <Table>
              <thead><tr><Th>CSV column</Th><Th>Sample values</Th><Th>Import as</Th></tr></thead>
              <tbody>
                {job.headers.map((h, i) => (
                  <tr key={h}>
                    <Td className="font-mono text-xs">{h}</Td>
                    <Td className="max-w-md truncate text-xs text-ink-3">{job.preview.slice(0, 3).map((r) => r[i]).filter(Boolean).join(' · ') || '—'}</Td>
                    <Td>
                      <Select value={mapping[h] ?? 'ignore'} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })} className="h-8 max-w-xs text-xs">
                        <option value="ignore">— Ignore —</option>
                        <optgroup label="Fields">{fields.map((f) => <option key={f} value={f}>{titleCase(f)}</option>)}</optgroup>
                        {(customFields.data?.length ?? 0) > 0 && <optgroup label="Custom fields">{customFields.data!.map((c) => <option key={c.id} value={`custom.${c.key}`}>{c.label}</option>)}</optgroup>}
                      </Select>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Footer onBack={restart} backLabel="Start over" next={<Button variant="primary" disabled={!requiredOk} onClick={() => setStep('options')} icon={<ArrowRight size={14} />}>Options</Button>} />
          </div>
        )}

        {step === 'options' && (
          <div>
            <div className="grid grid-cols-2 gap-5 p-5">
              <Field label="Duplicates" hint="Matched on phone/email (leads, contacts) or name/domain (accounts).">
                <Select value={dupMode} onChange={(e) => setDupMode(e.target.value as typeof dupMode)}>
                  <option value="skip">Skip duplicate rows</option>
                  <option value="update">Update existing records</option>
                  <option value="create">Create anyway</option>
                </Select>
              </Field>
              <Field label="Owner">
                <Select value={ownerMode} onChange={(e) => setOwnerMode(e.target.value as typeof ownerMode)}>
                  <option value="me">Me</option>
                  <option value="fixed">One employee</option>
                  <option value="round_robin">Round robin</option>
                </Select>
              </Field>
              {ownerMode === 'fixed' && <Field label="Assign everything to"><OwnerSelect value={fixedOwner} onChange={setFixedOwner} allowEmpty={false} /></Field>}
              {ownerMode === 'round_robin' && (
                <Field label="Rotate between" className="col-span-2">
                  <div className="flex flex-wrap gap-2">
                    {employees.data?.map((e) => <Checkbox key={e.id} label={fullName(e)} checked={rrOwners.includes(e.id)} onChange={(ev) => setRrOwners(ev.target.checked ? [...rrOwners, e.id] : rrOwners.filter((x) => x !== e.id))} />)}
                  </div>
                </Field>
              )}
              <Field label="Add tags to every record" className="col-span-2">
                <div className="flex flex-wrap gap-2">
                  {tags.data?.map((t) => <Checkbox key={t.id} label={t.name} checked={tagIds.includes(t.id)} onChange={(ev) => setTagIds(ev.target.checked ? [...tagIds, t.id] : tagIds.filter((x) => x !== t.id))} />)}
                  {tags.data?.length === 0 && <span className="text-xs text-ink-3">No tags defined.</span>}
                </div>
              </Field>
              {entity === 'lead' && <>
                <Field label="Lead source"><Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}><option value="">—</option>{sources.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                <Field label="Pipeline" required><Select value={pipeline?.id ?? ''} onChange={(e) => { setPipelineId(e.target.value); setStageId(''); }}>{pipelines.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                <Field label="Stage" required><Select value={effectiveStage} onChange={(e) => setStageId(e.target.value)}>{pipeline?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              </>}
            </div>
            <Footer onBack={() => setStep('map')} next={<Button variant="primary" onClick={() => setStep('review')} icon={<ArrowRight size={14} />} disabled={(ownerMode === 'fixed' && !fixedOwner) || (ownerMode === 'round_robin' && rrOwners.length === 0) || (entity === 'lead' && !effectiveStage)}>Review</Button>} />
          </div>
        )}

        {step === 'review' && job && (
          <div>
            <div className="grid grid-cols-4 gap-3 p-5">
              <KpiCard label="File" value={<span className="text-sm">{job.fileName}</span>} context={`${job.rowCount.toLocaleString()} rows`} />
              <KpiCard label="Target" value={<span className="text-sm">{titleCase(entity)}s</span>} context={`${mappedCount} columns mapped`} />
              <KpiCard label="Duplicates" value={<span className="text-sm">{titleCase(dupMode)}</span>} />
              <KpiCard label="Owner" value={<span className="text-sm">{ownerMode === 'me' ? 'Me' : ownerMode === 'fixed' ? fullName(employees.data?.find((e) => e.id === fixedOwner)) : `Round robin (${rrOwners.length})`}</span>} />
            </div>
            <div className="px-5 pb-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">Preview of mapped rows</div>
              <Table>
                <thead><tr>{job.headers.filter((h) => mapping[h] && mapping[h] !== 'ignore').map((h) => <Th key={h}>{titleCase(mapping[h]!.replace('custom.', ''))}</Th>)}</tr></thead>
                <tbody>{job.preview.slice(0, 8).map((r, ri) => <tr key={ri}>{job.headers.map((h, ci) => (mapping[h] && mapping[h] !== 'ignore' ? <Td key={h} className="text-xs">{r[ci]}</Td> : null))}</tr>)}</tbody>
              </Table>
            </div>
            <Footer onBack={() => setStep('options')} next={<Button variant="primary" loading={start.isPending} onClick={launch} icon={<Upload size={14} />}>Start import</Button>} />
          </div>
        )}

        {step === 'result' && job && (
          <div className="p-5">
            {job.status !== 'done' && job.status !== 'failed' && (
              <div className="mb-4 flex items-center gap-3 rounded-lg bg-blue-soft px-3 py-2.5 text-[13px] text-blue">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Import {job.status}… {(job.totals.created ?? 0) + (job.totals.updated ?? 0) + (job.totals.skipped ?? 0) + (job.totals.failed ?? 0)} / {job.rowCount} rows processed
              </div>
            )}
            {job.status === 'done' && <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-soft px-3 py-2.5 text-[13px] text-green"><CheckCircle2 size={15} /> Import finished.</div>}
            {job.status === 'failed' && <ErrorBanner message="The import failed. See the error list below." />}
            {live.isError && <ErrorBanner message={(live.error as Error).message} onRetry={() => live.refetch()} />}
            <div className="grid grid-cols-5 gap-3">
              <KpiCard label="Rows" value={job.rowCount} />
              <KpiCard label="Created" value={job.totals.created ?? 0} tone="green" />
              <KpiCard label="Updated" value={job.totals.updated ?? 0} tone="blue" />
              <KpiCard label="Skipped" value={job.totals.skipped ?? 0} tone="gray" />
              <KpiCard label="Failed" value={job.totals.failed ?? 0} tone={(job.totals.failed ?? 0) > 0 ? 'red' : 'gray'} />
            </div>
            {job.errors.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">Errors ({job.errors.length})</div>
                <div className="max-h-72 overflow-y-auto rounded-card border border-line">
                  <Table><thead><tr><Th className="w-20">Row</Th><Th>Reason</Th></tr></thead><tbody>{job.errors.map((e, i) => <tr key={i}><Td mono>{e.row}</Td><Td className="text-ink-2">{e.reason}</Td></tr>)}</tbody></Table>
                </div>
              </div>
            )}
            {(job.status === 'done' || job.status === 'failed') && <div className="mt-5 flex justify-end"><Button variant="primary" onClick={restart}>Import another file</Button></div>}
          </div>
        )}
        {step !== 'upload' && !job && <Skeleton className="m-5 h-40" />}
      </Card>
    </div>
  );
}

function Footer({ onBack, backLabel = 'Back', next }: { onBack: () => void; backLabel?: string; next: React.ReactNode }) {
  return (
    <footer className="flex items-center justify-between border-t border-line bg-surface-2 px-5 py-3">
      <Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={onBack}>{backLabel}</Button>
      {next}
    </footer>
  );
}
