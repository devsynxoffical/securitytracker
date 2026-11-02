'use client';

import { useState } from 'react';
import { Plus, Trash2, Sliders } from 'lucide-react';
import { http } from '@/lib/api';
import { useRules, useExclusions, useExceptionApps, useTrackingMutation, type Rule } from '@/lib/queries/tracking';
import { useEmployees } from '@/lib/queries/crm';
import { Card, Table, Th, Td, TableSkeleton, EmptyState, ErrorBanner, PageHeader, Tabs, Select, Button, Modal, Field, Input, Badge, useToast } from '@/components/ui';
import { CategoryBadge } from '@/components/tracking/shared';

type Tab = 'rules' | 'exclusions' | 'exceptions';

export default function RulesPage() {
  const [tab, setTab] = useState<Tab>('rules');
  return (
    <div>
      <PageHeader title="Productivity rules" subtitle="Rules label apps and websites as productive, neutral or unproductive. Exclusions hide domains from tracking. Exception apps count as active during calls and meetings." />
      <Card>
        <Tabs value={tab} onChange={setTab} className="px-3" tabs={[{ value: 'rules', label: 'Rules' }, { value: 'exclusions', label: 'Exclusions' }, { value: 'exceptions', label: 'Exception apps' }]} />
        {tab === 'rules' && <RulesTab />}
        {tab === 'exclusions' && <ExclusionsTab />}
        {tab === 'exceptions' && <ExceptionsTab />}
      </Card>
    </div>
  );
}

function RulesTab() {
  const toast = useToast();
  const q = useRules();
  const employees = useEmployees();
  const departments = Array.from(new Map((employees.data ?? []).map((e) => e.department).filter(Boolean).map((d) => [d!.id, d!])).values());
  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name ?? 'Department' : 'Company');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ targetType: 'app', pattern: '', category: 'productive', departmentId: '' });
  const create = useTrackingMutation((b: Record<string, unknown>) => http.post('/tracking/productivity-rules', b));
  const update = useTrackingMutation((a: { id: string; body: Record<string, unknown> }) => http.patch(`/tracking/productivity-rules/${a.id}`, a.body));
  const remove = useTrackingMutation((id: string) => http.del(`/tracking/productivity-rules/${id}`));
  const err = (e: unknown) => toast.push('error', (e as Error).message);
  const rules = q.data ?? [];
  return (
    <>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xs text-ink-2">Patterns match case-insensitively. Use <code className="font-mono">*</code> as a wildcard (for example <code className="font-mono">*.slack.com</code>). Department rules beat company rules.</p>
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(true)}>New rule</Button>
      </div>
      {q.isLoading && <TableSkeleton rows={6} cols={5} />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && rules.length === 0 && <EmptyState icon={<Sliders size={28} strokeWidth={1.75} />} title="No rules yet" body="Everything is neutral until you add rules or categorise from the Uncategorised queue." action={<Button variant="primary" onClick={() => setOpen(true)}>New rule</Button>} />}
      {rules.length > 0 && (
        <Table>
          <thead><tr><Th>Type</Th><Th>Pattern</Th><Th>Category</Th><Th>Applies to</Th><Th /></tr></thead>
          <tbody>
            {rules.map((r: Rule) => (
              <tr key={r.id} className="hover:bg-surface-2">
                <Td><Badge tone="gray">{r.targetType}</Badge></Td>
                <Td mono>{r.pattern}</Td>
                <Td><div className="w-36"><Select value={r.category} onChange={(e) => update.mutate({ id: r.id, body: { category: e.target.value } }, { onError: err })}><option value="productive">Productive</option><option value="neutral">Neutral</option><option value="unproductive">Unproductive</option></Select></div></Td>
                <Td>{deptName(r.departmentId)}</Td>
                <Td right><Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove.mutate(r.id, { onError: err })}><Trash2 size={14} /></Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New productivity rule" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={create.isPending} disabled={!form.pattern.trim()} onClick={() => create.mutate({ ...form, departmentId: form.departmentId || null }, { onSuccess: () => { setOpen(false); setForm({ ...form, pattern: '' }); }, onError: err })}>Create</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}><option value="app">Application (process name)</option><option value="domain">Website (domain)</option></Select></Field>
          <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="productive">Productive</option><option value="neutral">Neutral</option><option value="unproductive">Unproductive</option></Select></Field>
          <Field label="Pattern" required className="col-span-2"><Input value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder={form.targetType === 'app' ? 'code.exe or *.exe' : 'github.com or *.atlassian.net'} /></Field>
          <Field label="Applies to" className="col-span-2"><Select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}><option value="">Whole company</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        </div>
      </Modal>
    </>
  );
}

function ExclusionsTab() {
  const toast = useToast();
  const q = useExclusions();
  const [form, setForm] = useState({ targetType: 'domain', pattern: '' });
  const create = useTrackingMutation((b: Record<string, unknown>) => http.post('/tracking/exclusions', b));
  const remove = useTrackingMutation((id: string) => http.del(`/tracking/exclusions/${id}`));
  const err = (e: unknown) => toast.push('error', (e as Error).message);
  return (
    <>
      <div className="flex flex-wrap items-end gap-2 px-4 py-3">
        <Field label="Type"><Select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}><option value="domain">Domain</option><option value="app">Application</option></Select></Field>
        <Field label="Pattern" className="flex-1"><Input value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="bank.example.com" /></Field>
        <Button variant="primary" icon={<Plus size={14} />} loading={create.isPending} disabled={!form.pattern.trim()} onClick={() => create.mutate(form, { onSuccess: () => setForm({ ...form, pattern: '' }), onError: err })}>Add</Button>
      </div>
      <p className="px-4 pb-2 text-xs text-ink-2">Excluded domains are recorded as “excluded” — the time still counts, the site does not.</p>
      {q.isLoading && <TableSkeleton rows={4} cols={3} />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="No exclusions" body="Add private or sensitive domains that should never appear in reports." />}
      {q.data && q.data.length > 0 && (
        <Table><thead><tr><Th>Type</Th><Th>Pattern</Th><Th /></tr></thead><tbody>{q.data.map((e) => <tr key={e.id} className="hover:bg-surface-2"><Td><Badge tone="gray">{e.targetType}</Badge></Td><Td mono>{e.pattern}</Td><Td right><Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove.mutate(e.id, { onError: err })}><Trash2 size={14} /></Button></Td></tr>)}</tbody></Table>
      )}
    </>
  );
}

function ExceptionsTab() {
  const toast = useToast();
  const q = useExceptionApps();
  const [form, setForm] = useState({ processName: '', type: 'call' });
  const create = useTrackingMutation((b: Record<string, unknown>) => http.post('/tracking/exception-apps', b));
  const remove = useTrackingMutation((id: string) => http.del(`/tracking/exception-apps/${id}`));
  const err = (e: unknown) => toast.push('error', (e as Error).message);
  return (
    <>
      <div className="flex flex-wrap items-end gap-2 px-4 py-3">
        <Field label="Process name" className="flex-1"><Input value={form.processName} onChange={(e) => setForm({ ...form, processName: e.target.value })} placeholder="zoom.exe, teams.exe, 3cx.exe" /></Field>
        <Field label="Type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="call">Call app</option><option value="meeting">Meeting app</option></Select></Field>
        <Button variant="primary" icon={<Plus size={14} />} loading={create.isPending} disabled={!form.processName.trim()} onClick={() => create.mutate(form, { onSuccess: () => setForm({ ...form, processName: '' }), onError: err })}>Add</Button>
      </div>
      <p className="px-4 pb-2 text-xs text-ink-2">While one of these is in the foreground, time without keyboard or mouse input still counts as active (calls and meetings, 09 section 3).</p>
      {q.isLoading && <TableSkeleton rows={4} cols={3} />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="No exception apps" body="Add your phone and meeting software so calls are not counted as idle." />}
      {q.data && q.data.length > 0 && (
        <Table><thead><tr><Th>Process</Th><Th>Type</Th><Th /></tr></thead><tbody>{q.data.map((e) => <tr key={e.id} className="hover:bg-surface-2"><Td mono>{e.processName}</Td><Td><CategoryBadge category={e.type === 'call' ? 'productive' : 'neutral'} /> <span className="ml-1 text-xs">{e.type}</span></Td><Td right><Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove.mutate(e.id, { onError: err })}><Trash2 size={14} /></Button></Td></tr>)}</tbody></Table>
      )}
    </>
  );
}
