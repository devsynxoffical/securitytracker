'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Columns3, MoreHorizontal, Pencil, Check, X, TrendingUp, TrendingDown, Minus, Rows3 } from 'lucide-react';
import { clsx } from 'clsx';
import { Button, Skeleton, EmptyState, ErrorBanner, type Tone } from './index';
import { Sparkline } from './charts';

/* ---------------------------------------------------------------------------
   Tooltip and keyboard hint
--------------------------------------------------------------------------- */

export function Tooltip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={clsx(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-2xs normal-case tracking-normal text-surface opacity-0 shadow-pop transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}
      >
        {label}
      </span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-line bg-surface-2 px-1.5 font-mono text-[10.5px] font-semibold text-ink-2">{children}</kbd>;
}

/* ---------------------------------------------------------------------------
   Dropdown menu (hand-rolled, keyboard accessible)
--------------------------------------------------------------------------- */

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  shortcut?: string;
}

export function Menu({ trigger, items, align = 'right', width = 200 }: { trigger?: ReactNode; items: MenuItem[]; align?: 'left' | 'right'; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-flex">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex items-center rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
        {trigger ?? <MoreHorizontal size={16} />}
      </button>
      {open && (
        <div role="menu" className={clsx('pop-in absolute top-full z-40 mt-1 rounded-lg border border-line bg-surface py-1 shadow-pop', align === 'right' ? 'right-0' : 'left-0')} style={{ minWidth: width }}>
          {items.map((it, i) =>
            it.separator ? (
              <div key={i} className="my-1 border-t border-line-2" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect?.();
                }}
                className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-base disabled:opacity-50', it.danger ? 'text-red hover:bg-red-soft' : 'text-ink hover:bg-surface-2')}
              >
                {it.icon && <span className="text-ink-3">{it.icon}</span>}
                <span className="flex-1">{it.label}</span>
                {it.shortcut && <Kbd>{it.shortcut}</Kbd>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   KPI tile with trend and sparkline (DESIGN-SYSTEM v2 section 9)
--------------------------------------------------------------------------- */

export function KpiTile({ label, value, delta, deltaLabel = 'vs previous period', trend, tone, series = 0, icon, onClick, loading, hint }: { label: string; value: ReactNode; hint?: ReactNode; delta?: number | null; deltaLabel?: string; trend?: number[]; tone?: Tone; series?: number; icon?: ReactNode; onClick?: () => void; loading?: boolean }) {
  const up = (delta ?? 0) > 0;
  const flat = !delta;
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper type={onClick ? 'button' : undefined} onClick={onClick} className={clsx('flex w-full flex-col rounded-card border border-line bg-surface p-4 text-left shadow-card transition', onClick && 'hover:border-pri hover:shadow-pop')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-3">{label}</span>
        {icon && <span className="text-ink-3">{icon}</span>}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        {loading ? <Skeleton className="h-7 w-24" /> : <div className={clsx('num text-2xl font-semibold', tone ? toneText(tone) : 'text-ink')}>{value}</div>}
        {trend && trend.length > 1 && <Sparkline values={trend} series={series} />}
      </div>
      {hint !== undefined && <div className="mt-1.5 text-xs text-ink-3">{hint}</div>}
      {delta !== undefined && delta !== null && (
        <div className={clsx('mt-1.5 inline-flex items-center gap-1 text-xs', flat ? 'text-ink-3' : up ? 'text-green-text' : 'text-red-text')}>
          {flat ? <Minus size={12} /> : up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span className="num font-semibold">{up ? '+' : ''}{Math.round(delta * 10) / 10}%</span>
          <span className="text-ink-3">{deltaLabel}</span>
        </div>
      )}
    </Wrapper>
  );
}

function toneText(t: Tone) {
  return { green: 'text-green-text', amber: 'text-amber-text', red: 'text-red-text', blue: 'text-blue-text', violet: 'text-violet-text', gray: 'text-gray', primary: 'text-pri-2' }[t];
}

export function Progress({ value, max = 100, tone = 'primary', size = 8, label }: { value: number; max?: number; tone?: Tone | 'auto'; size?: number; label?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const t: Tone = tone === 'auto' ? (pct >= 100 ? 'green' : pct >= 60 ? 'primary' : pct >= 30 ? 'amber' : 'red') : tone;
  const bar = { green: 'bg-green', amber: 'bg-amber-bar', red: 'bg-red', blue: 'bg-blue', violet: 'bg-violet', gray: 'bg-gray-bar', primary: 'bg-pri' }[t];
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 overflow-hidden rounded-full bg-gray-soft" style={{ height: size }}>
        <div className={clsx('h-full rounded-full transition-[width] duration-300', bar)} style={{ width: `${pct}%` }} />
      </div>
      {label !== undefined && <span className="shrink-0 font-mono text-xs text-ink-2">{label}</span>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx('inline-flex items-center gap-2 text-base text-ink', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={clsx('relative h-[18px] w-8 rounded-full transition', checked ? 'bg-pri' : 'bg-gray-bar')}>
        <span className={clsx('absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-[left]', checked ? 'left-[16px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  );
}

/* ---------------------------------------------------------------------------
   Filter chips and saved-view tabs (HubSpot style list header)
--------------------------------------------------------------------------- */

export function FilterChip({ label, value, onClear, children, active }: { label: string; value?: ReactNode; onClear?: () => void; children?: ReactNode; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const isActive = active ?? Boolean(value);
  return (
    <div ref={ref} className="relative inline-flex">
      <button type="button" onClick={() => setOpen((o) => !o)} className={clsx('inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition', isActive ? 'border-pri bg-pri-soft text-pri-2' : 'border-line bg-surface text-ink-2 hover:text-ink')}>
        <span>{label}</span>
        {value && <span className="max-w-[160px] truncate font-semibold">: {value}</span>}
        {isActive && onClear ? (
          <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onClear(); }} onKeyDown={(e) => e.key === 'Enter' && onClear()} className="ml-0.5 rounded hover:bg-surface" aria-label={`Clear ${label}`}>
            <X size={12} />
          </span>
        ) : (
          <ChevronDown size={13} className="text-ink-3" />
        )}
      </button>
      {open && children && (
        <div className="pop-in absolute left-0 top-full z-40 mt-1 min-w-[220px] rounded-lg border border-line bg-surface p-2 shadow-pop" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}

export function ViewTabs<T extends string>({ value, onChange, views, onAdd }: { value: T; onChange: (v: T) => void; views: Array<{ value: T; label: ReactNode; count?: number }>; onAdd?: () => void }) {
  return (
    <div className="flex items-end gap-1 overflow-x-auto border-b border-line">
      {views.map((v) => (
        <button key={v.value} type="button" onClick={() => onChange(v.value)} className={clsx('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-base font-semibold transition', value === v.value ? 'border-pri text-pri' : 'border-transparent text-ink-2 hover:text-ink')}>
          {v.label}
          {v.count !== undefined && <span className="rounded-full bg-gray-soft px-1.5 font-mono text-xs text-ink-2">{v.count}</span>}
        </button>
      ))}
      {onAdd && (
        <button type="button" onClick={onAdd} className="-mb-px shrink-0 border-b-2 border-transparent px-2 py-2 text-sm font-medium text-ink-3 hover:text-ink">
          + Add view
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   DataTable: sticky header, sortable columns, column chooser, density, row selection,
   hover-revealed row actions. Generic over the row type.
--------------------------------------------------------------------------- */

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  width?: number | string;
  right?: boolean;
  mono?: boolean;
  sortable?: boolean;
  hidden?: boolean;
  /** Keep visible even when the column chooser is used. */
  locked?: boolean;
}

export interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  loading,
  error,
  onRetry,
  empty,
  sort,
  onSort,
  selected,
  onSelect,
  onRowClick,
  rowActions,
  storageKey,
  footer,
  stickyHeader = true,
  maxHeight,
}: {
  rows: T[];
  columns: Column<T>[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: ReactNode;
  sort?: SortState;
  onSort?: (s: SortState) => void;
  selected?: Set<string>;
  onSelect?: (ids: Set<string>) => void;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  /** Persists hidden columns per viewer when set. */
  storageKey?: string;
  footer?: ReactNode;
  stickyHeader?: boolean;
  maxHeight?: number | string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [chooser, setChooser] = useState(false);
  const chooserRef = useRef<HTMLDivElement>(null);
  const headId = useId();

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(`cos.cols.${storageKey}`);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, [storageKey]);
  const toggleCol = (key: string) => {
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      if (storageKey) {
        try {
          localStorage.setItem(`cos.cols.${storageKey}`, JSON.stringify([...n]));
        } catch {
          /* ignore */
        }
      }
      return n;
    });
  };
  useEffect(() => {
    if (!chooser) return;
    const h = (e: MouseEvent) => chooserRef.current && !chooserRef.current.contains(e.target as Node) && setChooser(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [chooser]);

  const visible = useMemo(() => columns.filter((c) => !c.hidden && (c.locked || !hidden.has(c.key))), [columns, hidden]);
  const allSelected = selected && rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected && rows.some((r) => selected.has(r.id));

  const toggleAll = () => {
    if (!onSelect) return;
    onSelect(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    if (!onSelect || !selected) return;
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onSelect(n);
  };

  return (
    <div className="flex flex-col">
      {error && <ErrorBanner message={error} onRetry={onRetry} />}
      <div className="relative overflow-auto" style={{ maxHeight }}>
        <table className="w-full border-collapse text-base" aria-describedby={headId}>
          <thead className={clsx(stickyHeader && 'sticky top-0 z-10')}>
            <tr>
              {onSelect && (
                <th className="w-9 bg-surface-2 px-3 py-2.5">
                  <input type="checkbox" aria-label="Select all" checked={Boolean(allSelected)} ref={(el) => {
                    if (el) el.indeterminate = Boolean(someSelected && !allSelected);
                  }} onChange={toggleAll} className="h-4 w-4 accent-pri" />
                </th>
              )}
              {visible.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} style={{ width: c.width }} className={clsx('bg-surface-2 px-3.5 py-2.5 text-left text-2xs font-semibold uppercase text-ink-3', c.right && 'text-right')}>
                    {c.sortable && onSort ? (
                      <button type="button" onClick={() => onSort({ key: c.key, direction: active && sort?.direction === 'asc' ? 'desc' : 'asc' })} className={clsx('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')}>
                        {c.header}
                        {active ? sort?.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : <ChevronsUpDown size={12} className="opacity-50" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              <th className="w-10 bg-surface-2 px-2 py-2.5 text-right">
                <div ref={chooserRef} className="relative inline-flex">
                  <Tooltip label="Columns">
                    <button type="button" onClick={() => setChooser((o) => !o)} className="rounded p-0.5 text-ink-3 hover:text-ink" aria-label="Choose columns">
                      <Columns3 size={14} />
                    </button>
                  </Tooltip>
                  {chooser && (
                    <div className="pop-in absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-line bg-surface p-2 text-left shadow-pop">
                      <div className="px-1 pb-1 text-2xs font-semibold uppercase text-ink-3">Columns</div>
                      {columns.filter((c) => !c.hidden).map((c) => (
                        <label key={c.key} className={clsx('flex items-center gap-2 rounded px-1.5 py-1 text-sm normal-case tracking-normal text-ink hover:bg-surface-2', c.locked && 'opacity-60')}>
                          <input type="checkbox" className="h-3.5 w-3.5 accent-pri" disabled={c.locked} checked={c.locked || !hidden.has(c.key)} onChange={() => toggleCol(c.key)} />
                          {c.header}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {onSelect && <td className="border-t border-line-2 px-3 py-3" />}
                  {visible.map((c) => (
                    <td key={c.key} className="border-t border-line-2 px-3.5 py-3">
                      <Skeleton className="h-3.5 w-3/4" />
                    </td>
                  ))}
                  <td className="border-t border-line-2" />
                </tr>
              ))}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={visible.length + (onSelect ? 2 : 1)} className="border-t border-line-2">
                  {empty ?? <EmptyState title="Nothing here yet" />}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isSel = selected?.has(r.id);
              return (
                <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={clsx('group transition-colors', onRowClick && 'cursor-pointer', isSel ? 'bg-pri-soft/60' : 'hover:bg-surface-2')}>
                  {onSelect && (
                    <td className="border-t border-line-2 px-3 py-[var(--row-py)]" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label="Select row" checked={Boolean(isSel)} onChange={() => toggleOne(r.id)} className="h-4 w-4 accent-pri" />
                    </td>
                  )}
                  {visible.map((c) => (
                    <td key={c.key} className={clsx('border-t border-line-2 px-3.5 py-[var(--row-py)] align-middle text-ink', c.right && 'text-right', c.mono && 'font-mono')}>
                      {c.cell(r)}
                    </td>
                  ))}
                  <td className="border-t border-line-2 px-2 py-[var(--row-py)] text-right" onClick={(e) => e.stopPropagation()}>
                    {rowActions && <div className="row-actions inline-flex items-center justify-end gap-1">{rowActions(r)}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Record layout: HubSpot-style three columns (properties | timeline | associations)
--------------------------------------------------------------------------- */

export function RecordLayout({ header, left, main, right }: { header: ReactNode; left: ReactNode; main: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line bg-surface px-5 py-4">{header}</div>
      <div className={clsx('grid min-h-0 flex-1 gap-0', right ? 'grid-cols-[300px_1fr_300px]' : 'grid-cols-[300px_1fr]')}>
        <aside className="min-h-0 overflow-y-auto border-r border-line bg-surface-2/60 p-4">{left}</aside>
        <section className="min-h-0 overflow-y-auto p-5">{main}</section>
        {right && <aside className="min-h-0 overflow-y-auto border-l border-line bg-surface-2/60 p-4">{right}</aside>}
      </div>
    </div>
  );
}

export function RecordHeader({ avatar, title, subtitle, badges, actions, primary }: { avatar?: ReactNode; title: ReactNode; subtitle?: ReactNode; badges?: ReactNode; actions?: ReactNode; primary?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {avatar}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-ink">{title}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            {subtitle}
            {badges}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {primary}
      </div>
    </div>
  );
}

export function Section({ title, actions, children, collapsible, defaultOpen = true }: { title: ReactNode; actions?: ReactNode; children: ReactNode; collapsible?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-4">
      <header className="mb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={collapsible ? () => setOpen((o) => !o) : undefined} className={clsx('inline-flex items-center gap-1 text-2xs font-semibold uppercase text-ink-3', collapsible && 'hover:text-ink')}>
          {collapsible && <ChevronDown size={12} className={clsx('transition-transform', !open && '-rotate-90')} />}
          {title}
        </button>
        {actions}
      </header>
      {open && children}
    </section>
  );
}

/* Property list with inline editing (click a value, edit, Enter to save). */
export interface PropertyDef {
  key: string;
  label: string;
  value: ReactNode;
  raw?: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea';
  options?: Array<{ value: string; label: string }>;
  editable?: boolean;
  mono?: boolean;
}

export function PropertyList({ properties, onSave, columns = 1 }: { properties: PropertyDef[]; onSave?: (key: string, value: string) => Promise<void> | void; columns?: 1 | 2 }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const start = (p: PropertyDef) => {
    if (!p.editable || !onSave) return;
    setEditing(p.key);
    setDraft(p.raw ?? '');
  };
  const commit = async (p: PropertyDef) => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(p.key, draft);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };
  return (
    <dl className={clsx('grid gap-x-4', columns === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
      {properties.map((p) => (
        <div key={p.key} className="hover-reveal group/prop border-b border-line-2 py-2 last:border-0">
          <dt className="text-2xs font-semibold uppercase text-ink-3">{p.label}</dt>
          {editing === p.key ? (
            <dd className="mt-1 flex items-center gap-1">
              {p.type === 'select' ? (
                <select autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8 flex-1 rounded-md border border-pri bg-surface px-2 text-base text-ink">
                  <option value="">—</option>
                  {p.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : p.type === 'textarea' ? (
                <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[60px] flex-1 rounded-md border border-pri bg-surface px-2 py-1 text-base text-ink" />
              ) : (
                <input
                  autoFocus
                  type={p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : 'text'}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commit(p);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  className="h-8 flex-1 rounded-md border border-pri bg-surface px-2 text-base text-ink"
                />
              )}
              <button type="button" onClick={() => void commit(p)} disabled={saving} className="rounded p-1 text-green hover:bg-green-soft" aria-label="Save"><Check size={14} /></button>
              <button type="button" onClick={() => setEditing(null)} className="rounded p-1 text-ink-3 hover:bg-surface-2" aria-label="Cancel"><X size={14} /></button>
            </dd>
          ) : (
            <dd className={clsx('mt-0.5 flex items-start justify-between gap-2 text-base text-ink', p.mono && 'font-mono')}>
              <span className="min-w-0 break-words">{p.value ?? <span className="text-ink-3">—</span>}</span>
              {p.editable && onSave && (
                <button type="button" onClick={() => start(p)} className="row-actions rounded p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Edit ${p.label}`}>
                  <Pencil size={12} />
                </button>
              )}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/* Association card for the right rail */
export function AssociationCard({ title, count, children, onAdd, emptyText = 'None yet' }: { title: string; count?: number; children?: ReactNode; onAdd?: () => void; emptyText?: string }) {
  return (
    <div className="mb-3 rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center justify-between border-b border-line-2 px-3 py-2">
        <span className="text-xs font-semibold text-ink">
          {title} {count !== undefined && <span className="ml-1 rounded-full bg-gray-soft px-1.5 font-mono text-2xs normal-case tracking-normal text-ink-2">{count}</span>}
        </span>
        {onAdd && (
          <Button size="sm" variant="ghost" onClick={onAdd}>
            + Add
          </Button>
        )}
      </header>
      <div className="p-2 text-sm">{children ?? <div className="px-1 py-2 text-xs text-ink-3">{emptyText}</div>}</div>
    </div>
  );
}

/* Timeline item for activity feeds */
export function TimelineItem({ icon, title, meta, children, tone = 'gray' }: { icon: ReactNode; title: ReactNode; meta?: ReactNode; children?: ReactNode; tone?: Tone }) {
  const bg = { green: 'bg-green-soft text-green-text', amber: 'bg-amber-soft text-amber-text', red: 'bg-red-soft text-red-text', blue: 'bg-blue-soft text-blue-text', violet: 'bg-violet-soft text-violet-text', gray: 'bg-gray-soft text-gray', primary: 'bg-pri-soft text-pri-2' }[tone];
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span className="absolute left-[13px] top-7 bottom-0 w-px bg-line-2 last:hidden" aria-hidden />
      <span className={clsx('relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', bg)}>{icon}</span>
      <div className="min-w-0 flex-1 rounded-card border border-line bg-surface p-3 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-base font-medium text-ink">{title}</div>
          {meta && <div className="text-xs text-ink-3">{meta}</div>}
        </div>
        {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
      </div>
    </li>
  );
}

export function DensityToggle({ value, onChange }: { value: 'comfortable' | 'compact'; onChange: (v: 'comfortable' | 'compact') => void }) {
  return (
    <Tooltip label={value === 'compact' ? 'Comfortable rows' : 'Compact rows'}>
      <button type="button" onClick={() => onChange(value === 'compact' ? 'comfortable' : 'compact')} className="rounded-md border border-line bg-surface p-1.5 text-ink-3 hover:text-ink" aria-label="Toggle density">
        <Rows3 size={14} />
      </button>
    </Tooltip>
  );
}
