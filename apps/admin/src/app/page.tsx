'use client';

import { ArrowRight, BookOpen, Briefcase, CalendarCheck, CheckSquare, Clock, Coffee, EyeOff, Inbox, KeyRound, Mail, Monitor, ShieldCheck, Timer, Users, WifiOff, Bell, ClipboardList } from 'lucide-react';
import { PublicProviders } from '@/components/public/PublicProviders';
import { Container, FeatureItem, PublicShell, SectionHeading } from '@/components/public/PublicShell';
import { HeroDownloadButtons } from '@/components/public/DownloadCards';

const NAV = [
  { href: '/#employees', label: 'For employees' },
  { href: '/#admins', label: 'For admins' },
  { href: '/#privacy', label: 'Privacy' },
  { href: '/install', label: 'Install guide' },
  { href: '/guide', label: 'User guide' },
];

export default function PublicLandingPage() {
  return (
    <PublicProviders>
      <PublicShell nav={NAV}>
        <Hero />
        <Employees />
        <Admins />
        <Privacy />
        <GetStarted />
      </PublicShell>
    </PublicProviders>
  );
}

function Hero() {
  return (
    <section className="border-b border-line bg-surface">
      <Container className="grid gap-10 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-20">
        <div className="max-w-xl">
          <div className="mb-3 text-2xs font-semibold uppercase tracking-wide text-pri">WorkPulse desktop app</div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-[38px] sm:leading-[44px]">Your company workstation.</h1>
          <p className="mt-4 text-md text-ink-2">
            One small app for your working day: start and end your shift, take breaks, see your tasks and leave, read your inbox and get notifications. It keeps working
            when the internet does not, and it only counts activity while you are on shift.
          </p>
          <div className="mt-7">
            <HeroDownloadButtons />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <a href="/install" className="inline-flex items-center gap-1.5 font-semibold text-ink hover:text-pri">
              <BookOpen size={15} /> Full install guide <ArrowRight size={14} />
            </a>
            <a href="/admin" className="inline-flex items-center gap-1.5 font-semibold text-ink-2 hover:text-ink">
              <KeyRound size={15} /> Sign in to the admin panel
            </a>
          </div>
        </div>
        <HeroPanel />
      </Container>
    </section>
  );
}

/** Static illustration of the app's shift card, built from tokens so it follows the theme. */
function HeroPanel() {
  return (
    <div className="mx-auto w-full max-w-md rounded-modal border border-line bg-bg p-3 shadow-pop" aria-hidden>
      <div className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-ink-3">Today</div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-soft px-2 py-0.5 text-[11.5px] font-semibold text-green">
            <span className="h-1.5 w-1.5 rounded-full bg-current" /> On shift
          </span>
        </div>
        <div className="num mt-2 text-3xl font-semibold text-ink">04:12:38</div>
        <div className="mt-1 text-xs text-ink-2">Started 09:02 · 1 break (18 min)</div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-line bg-surface px-3 py-2 text-center text-[13px] font-semibold text-ink">Take a break</div>
          <div className="rounded-lg border border-red bg-red px-3 py-2 text-center text-[13px] font-semibold text-white">End shift</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Mini icon={<CheckSquare size={14} />} label="Tasks" value="3 due" />
        <Mini icon={<Inbox size={14} />} label="Inbox" value="2 new" />
        <Mini icon={<CalendarCheck size={14} />} label="Leave" value="12 days" />
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-2">
        <WifiOff size={13} className="text-amber" /> Offline: 4 entries queued, will sync when back online.
      </div>
    </div>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3 shadow-card">
      <div className="flex items-center gap-1.5 text-xs text-ink-3">
        {icon} {label}
      </div>
      <div className="num mt-1 text-md font-semibold text-ink">{value}</div>
    </div>
  );
}

function Employees() {
  return (
    <section className="py-14">
      <Container>
        <SectionHeading id="employees" eyebrow="For employees" title="Everything for the working day, nothing else" body="WorkPulse sits in the tray or menu bar. Open it when you need it, close it and it keeps your shift running." />
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureItem icon={<Timer size={16} />} title="Shift start and stop" body="One button starts your shift, one ends it. Your hours are recorded for attendance and payroll." />
          <FeatureItem icon={<Coffee size={16} />} title="Breaks" body="Take a break and come back. Break time is kept separate from working time." />
          <FeatureItem icon={<CheckSquare size={16} />} title="Tasks" body="See what is assigned to you, what is due today and mark work done." />
          <FeatureItem icon={<CalendarCheck size={16} />} title="Leave" body="Check your balance, request time off and see when it is approved." />
          <FeatureItem icon={<Inbox size={16} />} title="Inbox and notifications" body="Shared mailboxes you have access to and notifications from your team, in the app." />
          <FeatureItem icon={<WifiOff size={16} />} title="Offline-safe tracking" body="No internet? The shift keeps running and entries are queued and synced later. Counts only, never content." />
        </ul>
      </Container>
    </section>
  );
}

function Admins() {
  return (
    <section id="admins" className="scroll-mt-20 border-y border-line bg-surface py-14">
      <Container className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <SectionHeading eyebrow="For admins" title="One admin panel for the whole company" body="Administrators and managers sign in to the admin panel in the browser. Every change is permission-checked, scoped to the right department and written to the audit log." />
          <a href="/admin" className="btn-primary mt-6 inline-flex items-center gap-1.5 rounded-lg border border-pri bg-pri px-[18px] py-[11px] text-sm font-semibold text-white hover:bg-pri-2">
            <KeyRound size={15} /> Sign in to the admin panel
          </a>
          <p className="mt-2 text-xs text-ink-3">Two-factor authentication is mandatory for every admin account.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          <AdminCard icon={<Briefcase size={16} />} title="CRM" body="Leads, deals, companies and contacts with a pipeline view, call logs and notes." />
          <AdminCard icon={<ClipboardList size={16} />} title="Tasks" body="Boards and lists per team, assignments, due dates and comments." />
          <AdminCard icon={<Users size={16} />} title="People and attendance" body="Employees, roles, shifts, breaks, leave requests and attendance reports." />
          <AdminCard icon={<Monitor size={16} />} title="Tracking" body="Active, idle and locked time per shift, application and website categories, device approvals and alerts." />
          <AdminCard icon={<Mail size={16} />} title="Mail" body="Shared Gmail and IMAP inboxes (Hostinger, GoDaddy, Zoho) handled by the backend. Assign, reply and track conversations." />
          <AdminCard icon={<Bell size={16} />} title="Security" body="Devices, sessions, login history, roles and the audit log in one place." />
        </ul>
      </Container>
    </section>
  );
}

function AdminCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="rounded-card border border-line bg-bg p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pri-soft text-pri-2">{icon}</span>
        <div className="text-base font-semibold text-ink">{title}</div>
      </div>
      <p className="mt-2 text-sm text-ink-2">{body}</p>
    </li>
  );
}

function Privacy() {
  return (
    <section className="py-14">
      <Container>
        <SectionHeading id="privacy" eyebrow="Privacy" title="Tracking only during a shift, and only counts" body="You see the same monitoring policy your employer sees, and you confirm it before your first shift on a device." />
        <ul className="mt-8 grid gap-6 sm:grid-cols-3">
          <FeatureItem icon={<Clock size={16} />} title="Only while on shift" body="Nothing is recorded before you start a shift or after you end it. Breaks are marked as breaks." />
          <FeatureItem icon={<EyeOff size={16} />} title="No keystroke content" body="The app counts how many keys and clicks happened, never which keys. There is no keyboard hook and no clipboard access." />
          <FeatureItem icon={<ShieldCheck size={16} />} title="No screenshots" body="No screen capture, no camera, no microphone recording. Only the active application name, the website domain and idle time." />
        </ul>
        <p className="mt-6 max-w-2xl text-sm text-ink-3">
          Details are in the install guide under{' '}
          <a href="/install#privacy" className="font-semibold text-ink-2 hover:text-ink">
            What the app records
          </a>
          .
        </p>
      </Container>
    </section>
  );
}

function GetStarted() {
  return (
    <section className="border-t border-line bg-surface py-12">
      <Container className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ink">Ready to install?</h2>
          <p className="mt-1 text-sm text-ink-2">Step-by-step for Windows and macOS, first sign-in, device approval and troubleshooting.</p>
        </div>
        <a href="/install" className="btn-primary inline-flex items-center justify-center gap-1.5 rounded-lg border border-pri bg-pri px-[18px] py-[11px] text-sm font-semibold text-white hover:bg-pri-2">
          Open the install guide <ArrowRight size={15} />
        </a>
      </Container>
    </section>
  );
}
