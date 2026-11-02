import { clsx } from 'clsx';
import { X, AlertCircle, RefreshCw } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { initials } from '../lib/format';

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

export function Button({ variant = 'default', size = 'md', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'default' | 'ghost' | 'danger' | 'danger-outline'; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-[12px]' : size === 'lg' ? 'px-[18px] py-[11px] text-[13px]' : 'px-3 py-[7px] text-[13px]',
        variant === 'primary' && 'bg-pri text-white hover:bg-pri-2',
        variant === 'default' && 'border border-line bg-surface text-ink hover:bg-surface-2',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        variant === 'danger' && 'bg-red text-white hover:brightness-95',
        variant === 'danger-outline' && 'border border-red/40 text-red hover:bg-red-soft',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="mb-1 block text-[12px] font-semibold text-ink-2">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-[11.5px] text-ink-3">{hint}</span>}
      {error && <span className="mt-1 block text-[11.5px] text-red">{error}</span>}
    </label>
  );
}

const inputClass = 'h-[38px] w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-3 focus:border-pri focus:outline-none focus:ring-[3px] focus:ring-pri-soft disabled:bg-surface-2';
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(inputClass, className)} {...rest} />;
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(inputClass, 'h-auto min-h-[84px] py-2', className)} {...rest} />;
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(inputClass, 'appearance-none pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Badge({ tone = 'gray', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold', toneClass[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-pri-soft font-semibold text-pri-2" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name) || '?'}
    </span>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-card border border-line bg-surface p-4 shadow-card', className)}>
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, context, tone }: { label: string; value: ReactNode; context?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">{label}</div>
      <div className={clsx('mt-1 font-mono text-[24px] font-semibold tabular-nums', tone ? toneClass[tone].split(' ')[1] : 'text-ink')}>{value}</div>
      {context && <div className="mt-0.5 text-[12px] text-ink-2">{context}</div>}
    </div>
  );
}

export function Progress({ value, tone = 'primary' }: { value: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, value));
  const bar = tone === 'amber' ? 'bg-amber-bar' : tone === 'gray' ? 'bg-gray-bar' : tone === 'green' ? 'bg-green' : tone === 'red' ? 'bg-red' : 'bg-pri';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-soft">
      <div className={clsx('h-full rounded-full transition-all', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-gray-soft', className)} />;
}
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="text-ink-3">{icon}</div>}
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      {body && <div className="max-w-sm text-[12.5px] text-ink-2">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-soft px-3 py-2 text-[12.5px] text-red">
      <AlertCircle size={15} />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" variant="danger-outline" onClick={onRetry}>
          <RefreshCw size={13} /> Retry
        </Button>
      )}
    </div>
  );
}

export function Banner({ tone = 'blue', children }: { tone?: 'blue' | 'amber' | 'red'; children: ReactNode }) {
  return <div className={clsx('rounded-lg px-3 py-2 text-[12.5px]', toneClass[tone])}>{children}</div>;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }> }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={clsx('rounded-md px-2.5 py-1 text-[12px] font-semibold transition', value === o.value ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: Array<{ value: T; label: ReactNode; count?: number }> }) {
  return (
    <div className="flex gap-4 border-b border-line">
      {tabs.map((t) => (
        <button key={t.value} type="button" onClick={() => onChange(t.value)} className={clsx('-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-[13px] font-semibold', value === t.value ? 'border-pri text-pri' : 'border-transparent text-ink-2 hover:text-ink')}>
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-gray-soft px-1.5 font-mono text-[11px] text-ink-2">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={onClose}>
      <div className="max-h-[90vh] w-full overflow-hidden rounded-modal bg-surface shadow-modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line-2 py-2 text-[12.5px] last:border-0">
      <span className="text-ink-3">{label}</span>
      <span className="text-right text-ink">{children}</span>
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-[17px] font-semibold text-ink">{title}</h1>
        {subtitle && <div className="text-[12.5px] text-ink-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
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
