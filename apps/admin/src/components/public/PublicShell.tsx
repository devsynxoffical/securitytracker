'use client';

import type { ReactNode } from 'react';
import { Moon, Sun, LogIn } from 'lucide-react';
import { clsx } from 'clsx';
import { useTheme } from '@/lib/theme';
import { Logo } from '@/components/shell/auth/AuthLayout';
import { RELEASES_PAGE_URL } from '@/lib/downloads';

type NavItem = { href: string; label: string };

/** Header, footer and page gutters for the public pages. Tokens only, so both themes work. */
export function PublicShell({ children, nav, active }: { children: ReactNode; nav: NavItem[]; active?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5 rounded-lg">
            <Logo size={30} />
            <span className="leading-tight">
              <span className="block text-md font-semibold text-ink">WorkPulse</span>
              <span className="hidden text-2xs uppercase tracking-wide text-ink-3 sm:block">Company workstation</span>
            </span>
          </a>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Public">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className={clsx(
                  'hidden rounded-lg px-2.5 py-1.5 text-sm font-medium transition sm:inline-block',
                  active === n.href ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                {n.label}
              </a>
            ))}
            <ThemeToggle />
            <a href="/admin" className="btn-primary inline-flex items-center gap-1.5 rounded-lg border border-pri bg-pri px-3 py-[7px] text-[13px] font-semibold text-white hover:bg-pri-2">
              <LogIn size={14} />
              <span className="hidden sm:inline">Admin panel</span>
              <span className="sm:hidden">Admin</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>WorkPulse is the employee app of Company OS. Private deployment, operated by your company.</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <a href="/install" className="hover:text-ink">
              Install guide
            </a>
            <a href="/guide" className="hover:text-ink">
              User guide
            </a>
            <a href="/install#privacy" className="hover:text-ink">
              Privacy
            </a>
            <a href="/admin" className="hover:text-ink">
              Admin sign in
            </a>
            <a href={RELEASES_PAGE_URL} target="_blank" rel="noreferrer" className="hover:text-ink">
              Source releases
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-line bg-surface text-ink-2 transition hover:bg-surface-2 hover:text-ink"
    >
      {resolved === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>;
}

export function SectionHeading({ eyebrow, title, body, id }: { eyebrow?: string; title: string; body?: ReactNode; id?: string }) {
  return (
    <div id={id} className="max-w-2xl scroll-mt-20">
      {eyebrow && <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-pri">{eyebrow}</div>}
      <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
      {body && <p className="mt-2 text-md text-ink-2">{body}</p>}
    </div>
  );
}

export function FeatureItem({ icon, title, body }: { icon: ReactNode; title: string; body: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pri-soft text-pri-2">{icon}</span>
      <div>
        <div className="text-base font-semibold text-ink">{title}</div>
        <div className="mt-0.5 text-sm text-ink-2">{body}</div>
      </div>
    </li>
  );
}
