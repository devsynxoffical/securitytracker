'use client';

import type { ReactNode } from 'react';
import { Layers, ShieldCheck, Users } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * Split authentication layout: brand panel (44%) on the left at >=1024px, centred card on the right.
 * Stacks on smaller screens. Uses tokens only so it follows the active theme.
 */
export function AuthLayout({ children, footer, width = 420 }: { children: ReactNode; footer?: ReactNode; width?: number }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <BrandPanel />
      <main className="flex min-h-screen flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full" style={{ maxWidth: width }}>
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Logo size={36} />
            <div className="leading-tight">
              <div className="text-md font-semibold text-ink">Company OS</div>
              <div className="text-xs text-ink-3">Admin Panel</div>
            </div>
          </div>
          <div className="fade-in rounded-modal border border-line bg-surface p-7 shadow-pop sm:p-8">{children}</div>
          {footer && <div className="mt-5 text-center text-xs text-ink-3">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center rounded-xl bg-pri font-mono font-semibold text-white shadow-card', className)} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      OS
    </span>
  );
}

function BrandPanel() {
  return (
    <aside
      className="relative hidden w-[44%] shrink-0 flex-col justify-between overflow-hidden p-12 text-white lg:flex"
      style={{ background: 'linear-gradient(160deg, #0E7C66 0%, #0A5B4B 100%)' }}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse at 30% 20%, black 0%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 30% 20%, black 0%, transparent 70%)',
        }}
      />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[520px] w-[520px] rounded-full opacity-25" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, transparent 65%)' }} />

      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 font-mono text-sm font-semibold ring-1 ring-white/25 backdrop-blur">OS</span>
        <div className="leading-tight">
          <div className="text-md font-semibold">Company OS</div>
          <div className="text-xs text-white/70">Admin Panel</div>
        </div>
      </div>

      <div className="relative max-w-md">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight">Run your whole company from one place.</h2>
        <p className="mt-3 text-md text-white/80">CRM, tasks, people, time tracking and shared inboxes, with one set of permissions and one audit log.</p>
        <ul className="mt-8 space-y-4">
          <Feature icon={<Layers size={16} />} title="One place for CRM, tasks, people and time" body="Leads become deals, deals become tasks, every hour is accounted for." />
          <Feature icon={<ShieldCheck size={16} />} title="Mandatory 2FA and device binding" body="Every admin signs in with an authenticator; every workstation is approved." />
          <Feature icon={<Users size={16} />} title="Built for teams of 5 to 500" body="Roles with scopes keep each manager inside their own department." />
        </ul>
      </div>

      <div className="relative text-xs text-white/60">© {new Date().getFullYear()} Company OS · Private deployment</div>
    </aside>
  );
}

function Feature({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">{icon}</span>
      <div>
        <div className="text-base font-semibold">{title}</div>
        <div className="mt-0.5 text-sm text-white/70">{body}</div>
      </div>
    </li>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-base text-ink-2">{subtitle}</p>}
    </div>
  );
}
