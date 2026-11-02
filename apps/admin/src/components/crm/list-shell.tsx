'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Check, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEmployees, useTags, useViews, useCrmMutation, viewKeys, type EntityType, type SavedView } from '@/lib/queries/crm';
import { Button, Modal, Field, Input, Select, useToast } from '@/components/ui';
import { ViewTabs, FilterChip } from '@/components/ui/advanced';
import { fullName } from '@/lib/format';

/** Filters are a flat record of strings; '' means unset. Pages map them to API params. */
export type Filters = Record<string, string>;

export const BUILT_IN_VIEWS = { all: 'all', mine: 'mine' } as const;

/**
 * List header shared by every CRM list: saved-view tabs (All, My records, saved views, + Add view)
 * and a row of filter chips. Filters are owned by the page so Board/List modes share them.
 */
export function ListShell({
  entityType,
  filters,
  onFilters,
  chips,
  toolbar,
  children,
}: {
  entityType: EntityType;
  filters: Filters;
  onFilters: (f: Filters) => void;
  chips: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const { me } = useAuth();
  const views = useViews(entityType);
  const [saving, setSaving] = useState(false);

  const active = useMemo(() => {
    const entries = Object.entries(filters).filter(([, v]) => v);
    if (entries.length === 0) return BUILT_IN_VIEWS.all;
    if (entries.length === 1 && filters.ownerId === me?.id) return BUILT_IN_VIEWS.mine;
    const match = (views.data ?? []).find((v) => sameFilters(stringify(v.filters), filters));
    return match?.id ?? 'custom';
  }, [filters, views.data, me?.id]);

  const tabs = [
    { value: BUILT_IN_VIEWS.all as string, label: 'All' },
    { value: BUILT_IN_VIEWS.mine as string, label: 'My records' },
    ...(views.data ?? []).map((v) => ({ value: v.id, label: v.name })),
    ...(active === 'custom' ? [{ value: 'custom', label: 'Unsaved filters' }] : []),
  ];

  const pick = (value: string) => {
    if (value === BUILT_IN_VIEWS.all) return onFilters({});
    if (value === BUILT_IN_VIEWS.mine) return onFilters(me ? { ownerId: me.id } : {});
    const v = views.data?.find((x) => x.id === value);
    if (v) onFilters(stringify(v.filters));
  };

  return (
    <div className="space-y-3">
      <ViewTabs value={active} onChange={pick} views={tabs} onAdd={() => setSaving(true)} />
      <div className="flex flex-wrap items-center gap-2">
        {chips}
        {Object.values(filters).some(Boolean) && (
          <Button size="sm" variant="ghost" onClick={() => onFilters({})}>
            Clear all
          </Button>
        )}
        {toolbar && <div className="ml-auto flex items-center gap-2">{toolbar}</div>}
      </div>
      {children}
      {saving && <SaveViewModal entityType={entityType} filters={filters} onClose={() => setSaving(false)} />}
    </div>
  );
}

function stringify(f: Record<string, unknown>): Filters {
  return Object.fromEntries(Object.entries(f ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]));
}
function sameFilters(a: Filters, b: Filters) {
  const ka = Object.keys(a).filter((k) => a[k]);
  const kb = Object.keys(b).filter((k) => b[k]);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

function SaveViewModal({ entityType, filters, onClose }: { entityType: EntityType; filters: Filters; onClose: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<SavedView['visibility']>('private');
  const save = useCrmMutation((body: Record<string, unknown>) => http.post<SavedView>('/crm/views', body), [viewKeys.views(entityType)]);
  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  return (
    <Modal
      open
      onClose={onClose}
      title="Save view"
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                { entityType, name: name.trim(), visibility, filters: activeFilters },
                { onSuccess: () => { toast.push('success', 'View saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) },
              )
            }
          >
            Save view
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hot leads this week" />
        </Field>
        <Field label="Visible to">
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as SavedView['visibility'])}>
            <option value="private">Only me</option>
            <option value="team">My team</option>
            {can('crm.config.manage') && <option value="company">Everyone</option>}
          </Select>
        </Field>
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
          {Object.keys(activeFilters).length === 0 ? 'No filters set — this view shows everything.' : `Saves ${Object.keys(activeFilters).length} filter${Object.keys(activeFilters).length === 1 ? '' : 's'}: ${Object.keys(activeFilters).join(', ')}.`}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

export function OptionList({ options, value, onChange, searchable }: { options: Array<{ value: string; label: string; hint?: string }>; value: string; onChange: (v: string) => void; searchable?: boolean }) {
  const [q, setQ] = useState('');
  const list = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <div>
      {searchable && (
        <div className="relative mb-1.5">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-3" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 w-full rounded-md border border-line bg-surface pl-7 pr-2 text-sm text-ink focus:border-pri focus:outline-none" />
        </div>
      )}
      <ul className="max-h-64 overflow-y-auto">
        {list.length === 0 && <li className="px-2 py-2 text-xs text-ink-3">No matches</li>}
        {list.map((o) => (
          <li key={o.value}>
            <button type="button" onClick={() => onChange(o.value === value ? '' : o.value)} className={clsx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2', o.value === value ? 'text-pri-2' : 'text-ink')}>
              <span className="flex h-4 w-4 items-center justify-center">{o.value === value && <Check size={13} />}</span>
              <span className="flex-1 truncate">{o.label}</span>
              {o.hint && <span className="text-xs text-ink-3">{o.hint}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SelectChip({ label, value, onChange, options, searchable }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; hint?: string }>; searchable?: boolean }) {
  const current = options.find((o) => o.value === value);
  return (
    <FilterChip label={label} value={current?.label} onClear={() => onChange('')}>
      <OptionList options={options} value={value} onChange={onChange} searchable={searchable} />
    </FilterChip>
  );
}

export function OwnerChip({ value, onChange, label = 'Owner' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { data } = useEmployees();
  const options = (data ?? []).map((e) => ({ value: e.id, label: fullName(e), hint: e.code }));
  return <SelectChip label={label} value={value} onChange={onChange} options={options} searchable />;
}

export function TagFilterChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useTags();
  return <SelectChip label="Tag" value={value} onChange={onChange} options={(data ?? []).map((t) => ({ value: t.id, label: t.name }))} />;
}

export function DateRangeChip({ label, from, to, onChange }: { label: string; from: string; to: string; onChange: (from: string, to: string) => void }) {
  const summary = from || to ? `${from || '…'} → ${to || '…'}` : undefined;
  return (
    <FilterChip label={label} value={summary} onClear={() => onChange('', '')}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="From"><Input type="date" value={from} onChange={(e) => onChange(e.target.value, to)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => onChange(from, e.target.value)} /></Field>
      </div>
    </FilterChip>
  );
}

export function SearchChipInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? 'Search…'} className="h-8 w-60 rounded-lg border border-line bg-surface pl-8 pr-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-pri focus:outline-none" />
    </div>
  );
}

/** Merges cursor pages and de-duplicates rows by id (TanStack keeps each page as its own query). */
export function useMergedRows<T extends { id: string }>(pages: T[][], current: T[] | undefined): T[] {
  return useMemo(() => {
    const seen = new Set<string>();
    return [...pages.flat(), ...(current ?? [])].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  }, [pages, current]);
}
