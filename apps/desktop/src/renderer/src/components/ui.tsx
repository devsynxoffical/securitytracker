import { clsx } from 'clsx';
import { X, AlertCircle, RefreshCw, Inbox, Sun, Moon } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { initials } from '../lib/format';
import type { Theme } from '../lib/theme';

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'gray' | 'primary';

const toneClass: Record<Tone, string> = {
  green: 'bg-green-soft text-green-text',
  amber: 'bg-amber-soft text-amber-text',
  red: 'bg-red-soft text-red-text',
  blue: 'bg-blue-soft text-blue-text',
  violet: 'bg-violet-soft text-violet-text',
  gray: 'bg-gray-soft text-gray',
  primary: 'bg-pri-soft text-pri-2',
};
export const toneText: Record<Tone, string> = {
  green: 'text-green-text',
  amber: 'text-amber-text',
  red: 'text-red-text',
  blue: 'text-blue-text',
  violet: 'text-violet-text',
  gray: 'text-ink-2',
  primary: 'text-pri-2',
};
const toneDot: Record<Tone, string> = {
  green: 'bg-green',
  amber: 'bg-amber',
  red: 'bg-red',
  blue: 'bg-blue',
  violet: 'bg-violet',
  gray: 'bg-gray-bar',
  primary: 'bg-pri',
};

function useEscape(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, active]);
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'default' | 'ghost' | 'danger' | 'danger-outline';
type Size = 'sm' | 'md' | 'lg';

export function Button({ variant = 'default', size = 'md', loading = false, icon, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  const v: Record<Variant, string> = {
    primary: 'btn-primary bg-pri text-on-pri border-pri hover:bg-pri-2',
    default: 'bg-surface text-ink border-line hover:bg-surface-2 hover:border-ink-3/40',
    ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink',
    danger: 'bg-red text-on-pri border-red hover:opacity-90',
    'danger-outline': 'bg-surface text-red-text border-line hover:bg-red-soft hover:border-red/40',
  };
  const s: Record<Size, string> = { sm: 'h-7 px-[9px] text-xs', md: 'h-[34px] px-3 text-base', lg: 'h-10 px-[18px] text-md' };
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={clsx('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-semibold transition disabled:cursor-not-allowed disabled:opacity-50', v[variant], s[size], className)}
      {...rest}
    >
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={clsx('inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition hover:bg-surface-2 hover:text-ink', className)} {...rest}>
      {children}
    </button>
  );
}

export function ThemeToggle({ theme, onToggle, className }: { theme: Theme; onToggle: () => void; className?: string }) {
  const next = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <IconButton label={next} onClick={onToggle} className={className}>
      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
    </IconButton>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="mb-1.5 block text-xs font-semibold text-ink-2">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-ink-3">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs text-red-text">{error}</span>}
    </label>
  );
}

const control = 'h-[38px] w-full rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-3 transition focus:border-pri focus:outline-none focus:ring-[3px] focus:ring-pri-soft disabled:bg-surface-2 disabled:text-ink-3';
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(control, className)} {...rest} />;
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(control, 'h-auto min-h-[84px] py-2 leading-relaxed', className)} {...rest} />;
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={clsx(control, 'appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
      <svg aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6l4 4 4-4" />
      </svg>
    </span>
  );
}
export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={clsx('inline-flex items-center gap-2 text-base text-ink', className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-line" {...rest} />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function Badge({ tone = 'gray', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', toneClass[tone], className)}>
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', toneDot[tone])} />}
      {children}
    </span>
  );
}

export function StatusDot({ tone, live, className }: { tone: Tone; live?: boolean; className?: string }) {
  return <span className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', toneDot[tone], toneText[tone], live && 'pulse-dot', className)} />;
}

export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center rounded-full bg-pri-soft font-semibold text-pri-2 ring-1 ring-pri/20', className)} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {initials(name) || '?'}
    </span>
  );
}

export function Card({ title, subtitle, actions, children, className, bodyClassName, padded = true }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; padded?: boolean }) {
  return (
    <section className={clsx('rounded-card border border-line bg-surface shadow-card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line-2 px-4 py-3">
          <div className="min-w-0 leading-tight">
            <h3 className="truncate text-base font-semibold text-ink">{title}</h3>
            {subtitle && <div className="mt-0.5 text-xs text-ink-3">{subtitle}</div>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(padded && 'p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** KPI tile (DESIGN-SYSTEM section 9): label, numeral, context line; optional click-through. */
export function KpiTile({ label, value, context, tone, icon, onClick, loading, mono = true }: { label: string; value: ReactNode; context?: ReactNode; tone?: Tone; icon?: ReactNode; onClick?: () => void; loading?: boolean; mono?: boolean }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper type={onClick ? 'button' : undefined} onClick={onClick} className={clsx('flex w-full min-w-0 flex-col rounded-card border border-line bg-surface p-4 text-left shadow-card transition', onClick && 'hover:border-pri/60 hover:shadow-pop')}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-ink-3">{label}</span>
        {icon && <span className="shrink-0 text-ink-3">{icon}</span>}
      </div>
      {loading ? <Skeleton className="mt-2 h-7 w-20" /> : <div className={clsx('mt-1.5 text-2xl font-semibold', mono ? 'font-mono' : 'num', tone ? toneText[tone] : 'text-ink')}>{value}</div>}
      {context && <div className="mt-1 truncate text-xs text-ink-2">{context}</div>}
    </Wrapper>
  );
}

export function Progress({ value, tone = 'primary', size = 6 }: { value: number; tone?: Tone; size?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const bar = tone === 'amber' ? 'bg-amber-bar' : tone === 'gray' ? 'bg-gray-bar' : toneDot[tone];
  return (
    <div className="w-full overflow-hidden rounded-full bg-gray-soft" style={{ height: size }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={clsx('h-full rounded-full transition-all', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-gray-soft', className)} aria-hidden />;
}
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx('space-y-2.5', className)} aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, title, body, action, compact }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 text-center', compact ? 'py-7' : 'py-12')}>
      <div className={clsx('mb-3 flex items-center justify-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-line', compact ? 'h-10 w-10' : 'h-12 w-12')}>{icon ?? <Inbox size={compact ? 18 : 22} strokeWidth={1.75} />}</div>
      <div className="text-base font-semibold text-ink">{title}</div>
      {body && <div className="mt-1 max-w-sm text-sm text-ink-2">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={clsx('flex items-center gap-2.5 rounded-lg border border-red/30 bg-red-soft px-3 py-2.5 text-sm text-red-text', className)}>
      <AlertCircle size={15} className="shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" variant="danger-outline" onClick={onRetry} icon={<RefreshCw size={12} />}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Banner({ tone = 'blue', icon, children, className }: { tone?: 'blue' | 'amber' | 'red' | 'green' | 'primary'; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2 rounded-lg px-3 py-2 text-sm', toneClass[tone], className)}>
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }> }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value} className={clsx('rounded-md px-2.5 py-1 text-xs font-semibold transition', value === o.value ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: Array<{ value: T; label: ReactNode; count?: number }>; className?: string }) {
  return (
    <div className={clsx('flex gap-5 border-b border-line', className)} role="tablist">
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button key={t.value} type="button" role="tab" aria-selected={active} onClick={() => onChange(t.value)} className={clsx('-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-base font-semibold transition', active ? 'border-pri text-ink' : 'border-transparent text-ink-3 hover:text-ink-2')}>
            {t.label}
            {t.count !== undefined && <span className={clsx('rounded-full px-1.5 font-mono text-2xs tracking-normal', active ? 'bg-pri-soft text-pri-2' : 'bg-gray-soft text-ink-2')}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-start justify-center bg-overlay p-6 pt-[9vh]" onMouseDown={onClose}>
      <div className="pop-in flex max-h-[84vh] w-full flex-col overflow-hidden rounded-modal border border-line bg-surface shadow-modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-md font-semibold text-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-ink-3">{subtitle}</div>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

/** Label / value pair (PropertyList row). */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line-2 py-2 text-sm last:border-0">
      <span className="shrink-0 text-ink-3">{label}</span>
      <span className="min-w-0 text-right text-ink">{children}</span>
    </div>
  );
}

/** Page header inside the content area: title, context line, actions (DESIGN-SYSTEM section 4). */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-2xs font-semibold uppercase text-ink-3">{eyebrow}</div>}
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {subtitle && <div className="mt-0.5 text-base text-ink-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) {
  return <th className={clsx('sticky top-0 z-[1] whitespace-nowrap border-b border-line bg-surface-2 px-4 py-2.5 text-left text-2xs font-semibold uppercase text-ink-3', right && 'text-right', className)}>{children}</th>;
}
export function Td({ children, className, right, mono, colSpan }: { children?: ReactNode; className?: string; right?: boolean; mono?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={clsx('border-b border-line-2 px-4 py-2.5 align-middle text-ink group-last:border-0', right && 'text-right', mono && 'font-mono text-xs', className)}>
      {children}
    </td>
  );
}

export function statusTone(status: string): Tone {
  switch (status) {
    case 'done':
    case 'approved':
    case 'won':
    case 'present':
    case 'active':
      return 'green';
    case 'in_progress':
    case 'pending':
    case 'late':
    case 'snoozed':
      return 'amber';
    case 'cancelled':
    case 'rejected':
    case 'lost':
    case 'absent':
      return 'red';
    case 'open':
      return 'blue';
    default:
      return 'gray';
  }
}

export function priorityTone(p: string): Tone {
  return p === 'urgent' ? 'red' : p === 'high' ? 'amber' : p === 'low' || p === 'none' ? 'gray' : 'blue';
}
