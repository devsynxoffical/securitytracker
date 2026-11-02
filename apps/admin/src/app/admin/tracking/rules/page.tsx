'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Sliders, Pencil } from 'lucide-react';
import { http } from '@/lib/api';
import { useRules, useExclusions, useExceptionApps, useTrackingMutation, type Rule, type Exclusion, type ExceptionApp } from '@/lib/queries/tracking';
import { useEmployees } from '@/lib/queries/crm';
import { Card, PageHeader, Select, Button, Modal, Field, Input, Badge, useToast, Banner } from '@/components/ui';
import { DataTable, ViewTabs, Menu, Kbd, type Column } from '@/components/ui/advanced';
import { CategoryBadge } from '@/components/tracking/shared';

type Tab = 'rules' | 'exclusions' | 'exceptions';
const CAT_OPTIONS = [['productive', 'Productive'], ['neutral', 'Neutral'], ['unproductive', 'Unproductive']] as const;

export default function RulesPage() {
  const [tab, setTab] = useState<Tab>('rules');
  const rules = useRules();
  const exclusions = useExclusions();
  const exceptions = useExceptionApps();
  return (
    <div>
      <PageHeader title="Productivity rules" subtitle="Rules label apps and websites as productive, neutral or unproductive. Exclusions hide domains from tracking. Exception apps count as active during calls and meetings." />
      <ViewTabs<Tab> value={tab} onChange={setTab} views={[{ value: 'rules', label: 'Rules', count: rules.data?.length }, { value: 'exclusions', label: 'Exclusions', count: exclusions.data?.length }, { value: 'exceptions', label: 'Exception apps', count: exceptions.data?.length }]} />
      <div className="mt-4">
        {tab === 'rules' && <RulesTab />}
        {tab === 'exclusions' && <ExclusionsTab />}
        {tab === 'exceptions' && <ExceptionsTab />}
      </div>
    </div>
  );
}

function PatternHelp() {
  return (
    <div className="rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
      <div className="mb-1 font-semibold text-ink">Pattern matching</div>
      <ul className="space-y-1">
        <li><Kbd>code.exe</Kbd> exact process or domain, case-insensitive</li>
        <li><Kbd>*.atlassian.net</Kbd> wildcard: any subdomain</li>
        <li><Kbd>slack*</Kbd> prefix: slack.exe, slack-beta.exe</li>
      </ul>
      <div className="mt-1.5">Department rules beat company rules; the longest matching pattern wins.</div>
    </div>
  );
}

function RulesTab() {
  const toast = useToast();
  const q = useRules();
  const employees = useEmployees();
  const departments = useMemo(() => Array.from(new Map((employees.data ?? []).map((e) => e.department).filter(Boolean).map((d) => [d!.id, d!])).values()), [employees.data]);
  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name ?? 'Department' : 'Company');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [form, setForm] = useState({ targetType: 'app', pattern: '', category: 'productive', departmentId: '' });
  const [typeFilter, setTypeFilter] = useState<'all' | 'app' | 'domain'>('all');
  const create = useTrackingMutation((b: Record<string, unknown>) => http.post('/tracking/productivity-rules', b));
  const update = useTrackingMutation((a: { id: string; body: Record<string, unknown> }) => http.patch(`/tracking/productivity-rules/${a.id}`, a.body));
  const remove = useTrackingMutation((id: string) => http.del(`/tracking/productivity-rules/${id}`));
  const err = (e: unknown) => toast.push('error', (e as Error).message);
  const rows = (q.data ?? []).filter((r) => typeFilter === 'all' || r.targetType === typeFilter);

  const columns: Column<Rule>[] = [
    { key: 'type', header: 'Type', cell: (r) => <Badge tone="gray">{r.targetType}</Badge> },
    { key: 'pattern', header: 'Pattern', mono: true, locked: true, cell: (r) => r.pattern },
    { key: 'category', header: 'Category', cell: (r) => <CategoryBadge category={r.category} /> },
    { key: 'scope', header: 'Applies to', cell: (r) => (r.departmentId ? <Badge tone="blue">{deptName(r.departmentId)}</Badge> : <span className="text-ink-2">Whole company</span>) },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-ink-2">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="h-8 w-40"><option value="all">All types</option><option value="app">Applications</option><option value="domain">Websites</option></Select>
          <span>Patterns are case-insensitive; <Kbd>*</Kbd> is a wildcard.</span>
        </div>
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => { setEditing(null); setForm({ targetType: 'app', pattern: '', category: 'productive', departmentId: '' }); setOpen(true); }}>New rule</Button>
      </div>
      <DataTable<Rule>
        rows={rows}
        columns={columns}
        loading={q.isLoading}
        error={q.isError ? (q.error as Error).message : null}
        onRetry={() => q.refetch()}
        storageKey="tracking.rules"
        empty={<div className="px-6 py-14 text-center"><Sliders size={28} strokeWidth={1.75} className="mx-auto mb-3 text-ink-3" /><div className="text-base font-semibold text-ink">No rules yet</div><div className="mt-1 text-sm text-ink-2">Everything is neutral until you add rules or categorise from the Uncategorised queue.</div><div className="mt-4"><Button variant="primary" onClick={() => setOpen(true)}>New rule</Button></div></div>}
        rowActions={(r) => (
          <Menu
            items={[
              { label: 'Edit', icon: <Pencil size={14} />, onSelect: () => { setEditing(r); setForm({ targetType: r.targetType, pattern: r.pattern, category: r.category, departmentId: r.departmentId ?? '' }); setOpen(true); } },
              ...CAT_OPTIONS.filter(([v]) => v !== r.category).map(([v, l]) => ({ label: `Mark ${l.toLowerCase()}`, onSelect: () => update.mutate({ id: r.id, body: { category: v } }, { onError: err }) })),
              { separator: true, label: '' },
              { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => remove.mutate(r.id, { onError: err, onSuccess: () => toast.push('success', 'Rule deleted') }) },
            ]}
          />
        )}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit rule' : 'New productivity rule'}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={create.isPending || update.isPending}
              disabled={!form.pattern.trim()}
              onClick={() => {
                const body = { pattern: form.pattern.trim(), category: form.category, departmentId: form.departmentId || null };
                const done = () => { setOpen(false); toast.push('success', editing ? 'Rule updated' : 'Rule created'); };
                if (editing) update.mutate({ id: editing.id, body }, { onSuccess: done, onError: err });
                else create.mutate({ ...body, targetType: form.targetType }, { onSuccess: done, onError: err });
              }}
            >
              {editing ? 'Save' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Select value={form.targetType} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, targetType: e.target.value })}><option value="app">Application (process name)</option><option value="domain">Website (domain)</option></Select></Field>
          <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CAT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Pattern" required className="col-span-2"><Input value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder={form.targetType === 'app' ? 'code.exe or *.exe' : 'github.com or *.atlassian.net'} className="font-mono" /></Field>
          <Field label="Applies to" className="col-span-2"><Select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}><option value="">Whole company</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <div className="col-span-2"><PatternHelp /></div>
        </div>
      </Modal>
    </Card>
  );
}

function ExclusionsTab() {
  const toast = useToast();
  const q = useExclusions();
  const [form, setForm] = useState({ targetType: 'domain', pattern: '' });
  const create = useTrackingMutation((b: Record<string, unknown>) => http.post('/tracking/exclusions', b));
  const remove = useTrackingMutation((id: string) => http.del(`/tracking/exclusions/${id}`));
  const err = (e: unknown) => toast.push('error', (e as Error).message);
  const columns: Column<Exclusion>[] = [
    { key: 'type', header: 'Type', cell: (e) => <Badge tone="gray">{e.targetType}</Badge> },
    { key: 'pattern', header: 'Pattern', mono: true, locked: true, cell: (e) => e.pattern },
  ];
  return (
    <Card>
      <div className="border-b border-line-2 px-4 py-3">
        <Banner tone="blue">Excluded domains are recorded as “excluded” — the time still counts, the site does not appear in any report.</Banner>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Type"><Select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}><option value="domain">Domain</option><option value="app">Application</option></Select></Field>
          <Field label="Pattern" className="flex-1"><Input className="font-mono" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="bank.example.com or *.health.gov" /></Field>
          <Button variant="primary" icon={<Plus size={14} />} loading={create.isPending} disabled={!form.pattern.trim()} onClick={() => create.mutate(form, { onSuccess: () => setForm({ ...form, pattern: '' }), onError: err })}>Add exclusion</Button>
        </div>
      </div>
      <DataTable<Exclusion>
        rows={q.data ?? []}
        columns={columns}
        loading={q.isLoading}
        error={q.isError ? (q.error as Error).message : null}
        onRetry={() => q.refetch()}
        empty={<div className="px-6 py-12 text-center text-sm text-ink-2"><div className="text-base font-semibold text-ink">No exclusions</div>Add private or sensitive domains that should never appear in reports.</div>}
        rowActions={(e) => <Menu items={[{ label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => remove.mutate(e.id, { onError: err }) }]} />}
      />
    </Card>
  );
}

function ExceptionsTab() {
  const toast = useToast();
  const q = useExceptionApps();
  const [form, setForm] = useState({ processName: '', type: 'call' });
  const create = useTrackingMutation((b: Record<string, unknown>) => http.post('/tracking/exception-apps', b));
  const remove = useTrackingMutation((id: string) => http.del(`/tracking/exception-apps/${id}`));
  const err = (e: unknown) => toast.push('error', (e as Error).message);
  const columns: Column<ExceptionApp>[] = [
    { key: 'process', header: 'Process', mono: true, locked: true, cell: (e) => e.processName },
    { key: 'type', header: 'Type', cell: (e) => <Badge tone={e.type === 'call' ? 'green' : 'blue'}>{e.type === 'call' ? 'Call app' : 'Meeting app'}</Badge> },
  ];
  return (
    <Card>
      <div className="border-b border-line-2 px-4 py-3">
        <Banner tone="blue">While one of these is in the foreground, time without keyboard or mouse input still counts as active (calls and meetings, 09 section 3).</Banner>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Process name" className="flex-1"><Input className="font-mono" value={form.processName} onChange={(e) => setForm({ ...form, processName: e.target.value })} placeholder="zoom.exe, teams.exe, 3cx.exe" /></Field>
          <Field label="Type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="call">Call app</option><option value="meeting">Meeting app</option></Select></Field>
          <Button variant="primary" icon={<Plus size={14} />} loading={create.isPending} disabled={!form.processName.trim()} onClick={() => create.mutate(form, { onSuccess: () => setForm({ ...form, processName: '' }), onError: err })}>Add exception</Button>
        </div>
      </div>
      <DataTable<ExceptionApp>
        rows={q.data ?? []}
        columns={columns}
        loading={q.isLoading}
        error={q.isError ? (q.error as Error).message : null}
        onRetry={() => q.refetch()}
        empty={<div className="px-6 py-12 text-center text-sm text-ink-2"><div className="text-base font-semibold text-ink">No exception apps</div>Add your phone and meeting software so calls are not counted as idle.</div>}
        rowActions={(e) => <Menu items={[{ label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => remove.mutate(e.id, { onError: err }) }]} />}
      />
    </Card>
  );
}
