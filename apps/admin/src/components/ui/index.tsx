'use client';

import { createContext, useContext, useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X, AlertTriangle, Inbox, Check, Info, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { initials } from '@/lib/format';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'default' | 'ghost' | 'danger' | 'danger-outline';
type Size = 'sm' | 'md' | 'lg';

export function Button({
  variant = 'default',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  const v: Record<Variant, string> = {
    primary: 'btn-primary bg-pri text-white hover:bg-pri-2 border-pri',
    default: 'btn-default bg-surface text-ink border-line hover:bg-surface-2',
    ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink',
    danger: 'bg-red text-white border-red hover:opacity-90',
    'danger-outline': 'bg-surface text-red border-line hover:bg-red-soft',
  };
  const s: Record<Size, string> = { sm: 'px-[9px] py-1 text-xs', md: 'px-3 py-[7px] text-[13px]', lg: 'px-[18px] py-[11px] text-sm' };
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={clsx('inline-flex items-center gap-1.5 rounded-lg border font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap', v[variant], s[size], className)}
      {...rest}
    >
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export function Field({ label, hint, error, required, children, className }: { label?: string; hint?: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      {label && (
        <span className="mb-1 block text-xs font-semibold text-ink-2">
          {label}
          {required && <span className="text-red"> *</span>}
        </span>
      )}
      {children}
      {error ? <span className="mt-1 block text-xs text-red">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

const control = 'w-full h-[38px] rounded-lg border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-pri focus:ring-[3px] focus:ring-pri-soft disabled:bg-surface-2 disabled:text-ink-3';

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={clsx(control, invalid && 'border-red', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(control, 'h-auto min-h-[84px] py-2', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(control, 'appearance-none bg-[url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%238A939B%27 stroke-width=%272%27><path d=%27m6 9 6 6 6-6%27/></svg>")] bg-no-repeat bg-[right_10px_center] pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={clsx('inline-flex items-center gap-2 text-[13px] text-ink cursor-pointer', className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-line text-pri accent-pri" {...rest} />
      {label}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={clsx(control, 'pl-9')} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge, TagChip, Avatar
// ---------------------------------------------------------------------------

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'gray' | 'primary';

const toneClass: Record<Tone, string> = {
  green: 'bg-green-soft text-green',
  amber: 'bg-amber-soft text-amber',
  red: 'bg-red-soft text-red',
  blue: 'bg-blue-soft text-blue',
  violet: 'bg-violet-soft text-violet',
  gray: 'bg-gray-soft text-gray',
  primary: 'bg-pri-soft text-pri-2',
};

export function Badge({ tone = 'gray', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap', toneClass[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function stageTone(type: string | undefined): Tone {
  if (type === 'won') return 'green';
  if (type === 'lost') return 'red';
  return 'primary';
}

export function lifecycleTone(l: string | undefined): Tone {
  switch (l) {
    case 'customer':
      return 'green';
    case 'prospect':
      return 'blue';
    case 'churned':
      return 'red';
    case 'partner':
      return 'violet';
    default:
      return 'gray';
  }
}

export function TagChip({ name, colour, onRemove }: { name: string; colour: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ backgroundColor: `${colour}22`, color: colour }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colour }} />
      {name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="ml-0.5 opacity-70 hover:opacity-100" aria-label={`Remove ${name}`}>
          <X size={11} />
        </button>
      )}
    </span>
  );
}

export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  const palette = ['bg-pri-soft text-pri-2', 'bg-blue-soft text-blue', 'bg-violet-soft text-violet', 'bg-amber-soft text-amber', 'bg-green-soft text-green'];
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', palette[idx], className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name) || '?'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout cards and states
// ---------------------------------------------------------------------------

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={clsx('rounded-card border border-line bg-surface shadow-card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line-2 px-4 py-3">
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      {children}
    </section>
  );
}

export function KpiCard({ label, value, context, tone }: { label: string; value: ReactNode; context?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="text-xs font-semibold text-ink-3">{label}</div>
      <div className={clsx('num mt-1 text-2xl font-semibold', tone ? toneClass[tone].split(' ')[1] : 'text-ink')}>{value}</div>
      {context && <div className="mt-1 text-xs text-ink-2">{context}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded bg-gray-soft', className)} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-line-2 px-3 py-3 last:border-0">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={clsx('h-3.5', c === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 text-ink-3">{icon ?? <Inbox size={28} strokeWidth={1.75} />}</div>
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      {body && <div className="mt-1 max-w-sm text-[13px] text-ink-2">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-3 flex items-center gap-3 rounded-lg bg-red-soft px-3 py-2.5 text-[13px] text-red">
      <AlertTriangle size={15} className="shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" variant="danger-outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Banner({ tone = 'blue', children }: { tone?: 'blue' | 'amber' | 'red'; children: ReactNode }) {
  const cls = { blue: 'bg-blue-soft text-blue', amber: 'bg-amber-soft text-amber', red: 'bg-red-soft text-red' }[tone];
  const Icon = tone === 'blue' ? Info : AlertTriangle;
  return (
    <div className={clsx('flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]', cls)}>
      <Icon size={15} /> <span>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented, Tabs
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }> }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx('rounded-md px-3 py-1.5 text-xs font-semibold transition', value === o.value ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: Array<{ value: T; label: ReactNode; count?: number }>; className?: string }) {
  return (
    <div className={clsx('flex gap-1 border-b border-line', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={clsx('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold transition', value === t.value ? 'border-pri text-pri' : 'border-transparent text-ink-2 hover:text-ink')}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-gray-soft px-1.5 font-mono text-[11px] text-ink-2">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal, Drawer
// ---------------------------------------------------------------------------

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

export function Modal({ open, onClose, title, children, footer, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(21,26,30,0.38)] p-6 pt-[8vh]" onMouseDown={onClose}>
      <div className="w-full rounded-modal bg-surface shadow-modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, width = 720, actions }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; width?: number; actions?: ReactNode }) {
  useEscape(onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-[rgba(21,26,30,0.25)]" onMouseDown={onClose}>
      <aside className="absolute right-0 top-0 flex h-full w-full flex-col bg-surface shadow-drawer" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold text-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-ink-2">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button type="button" onClick={onClose} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastItem {
  id: number;
  tone: 'success' | 'error' | 'info';
  message: string;
}
const ToastCtx = createContext<{ push: (tone: ToastItem['tone'], message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = (tone: ToastItem['tone'], message: string) => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, tone, message }]);
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 4000);
  };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={clsx('pointer-events-auto flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[13px] font-medium shadow-modal', {
              'bg-green text-white': t.tone === 'success',
              'bg-red text-white': t.tone === 'error',
              'bg-ink text-white': t.tone === 'info',
            })}
          >
            {t.tone === 'success' ? <Check size={14} /> : t.tone === 'error' ? <AlertTriangle size={14} /> : <Info size={14} />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}
export function Th({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) {
  return <th className={clsx('bg-surface-2 px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3', right && 'text-right', className)}>{children}</th>;
}
export function Td({ children, className, right, mono, colSpan }: { children?: ReactNode; className?: string; right?: boolean; mono?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} className={clsx('border-t border-line-2 px-3.5 py-2.5 align-middle text-ink', right && 'text-right', mono && 'font-mono', className)}>{children}</td>;
}

export function Pagination({ hasMore, onMore, count, loading }: { hasMore: boolean; onMore: () => void; count: number; loading?: boolean }) {
  return (
    <footer className="flex items-center justify-between border-t border-line-2 bg-surface-2 px-4 py-2 text-xs text-ink-2">
      <span className="font-mono">{count} rows</span>
      {hasMore ? (
        <Button size="sm" onClick={onMore} loading={loading}>
          Load more
        </Button>
      ) : (
        <span>End of list</span>
      )}
    </footer>
  );
}

export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 border-b border-line bg-pri-soft px-4 py-2 text-[13px] text-pri-2">
      <span className="font-semibold">{count} selected</span>
      <div className="flex flex-1 items-center gap-2">{children}</div>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 text-[13px]">
      <span className="text-ink-3">{label}</span>
      <span className="min-w-0 break-words text-ink">{children}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[17px] font-semibold text-ink">{title}</h1>
        {subtitle && <div className="mt-0.5 text-[13px] text-ink-2">{subtitle}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
