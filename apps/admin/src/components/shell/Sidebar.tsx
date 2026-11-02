'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  Contact,
  Target,
  CalendarCheck,
  Upload,
  Settings,
  Clock,
  Activity,
  Mail,
  BarChart3,
  Shield,
  Sliders,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/ui';
import { fullName } from '@/lib/format';

interface Item {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  legacy?: boolean;
  permission?: string;
}

const crm: Item[] = [
  { label: 'Dashboard', href: '/admin/crm/dashboard', icon: BarChart3, permission: 'crm.deals.view' },
  { label: 'Leads', href: '/admin/crm/leads', icon: Target, permission: 'crm.leads.view' },
  { label: 'Contacts', href: '/admin/crm/contacts', icon: Contact, permission: 'crm.contacts.view' },
  { label: 'Accounts', href: '/admin/crm/accounts', icon: Building2, permission: 'crm.accounts.view' },
  { label: 'Deals', href: '/admin/crm/deals', icon: Briefcase, permission: 'crm.deals.view' },
  { label: 'Activities', href: '/admin/crm/activities', icon: CalendarCheck, permission: 'crm.leads.view' },
  { label: 'Import', href: '/admin/crm/import', icon: Upload, permission: 'crm.leads.view' },
  { label: 'Settings', href: '/admin/crm/settings', icon: Sliders, permission: 'crm.leads.view' },
];

const others: Item[] = [
  { label: 'Employees', href: '/admin/legacy', icon: Users, legacy: true },
  { label: 'Attendance', href: '/admin/legacy', icon: Clock, legacy: true },
  { label: 'Tracking', href: '/admin/legacy', icon: Activity, legacy: true },
  { label: 'Mail', href: '/admin/legacy', icon: Mail, legacy: true },
  { label: 'Reports', href: '/admin/legacy', icon: BarChart3, legacy: true },
  { label: 'Security', href: '/admin/legacy', icon: Shield, legacy: true },
  { label: 'Settings', href: '/admin/legacy', icon: Settings, legacy: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { me, logout, can } = useAuth();

  const link = (item: Item, key: string) => {
    if (item.permission && !can(item.permission)) return null;
    const active = !item.legacy && pathname === item.href;
    const Icon = item.icon;
    return (
      <Link
        key={key}
        href={item.href}
        className={clsx(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition',
          active ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        )}
      >
        <Icon size={16} strokeWidth={1.85} className={active ? 'text-pri' : 'text-ink-3'} />
        <span className="flex-1 truncate">{item.label}</span>
        {item.legacy && <span className="rounded-full bg-amber-soft px-1.5 text-[10px] font-semibold text-amber">rebuilding</span>}
      </Link>
    );
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[232px] flex-col border-r border-line bg-surface">
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-pri font-mono text-xs font-semibold text-white">OS</span>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-ink">Company OS</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Admin</div>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <div>
          <Link
            href="/admin"
            className={clsx(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition',
              pathname === '/admin' ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )}
          >
            <LayoutDashboard size={16} strokeWidth={1.85} className={pathname === '/admin' ? 'text-pri' : 'text-ink-3'} />
            Dashboard
          </Link>
        </div>
        <div>
          <div className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">CRM</div>
          <div className="space-y-0.5">{crm.map((i) => link(i, i.href))}</div>
        </div>
        <div>
          <div className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Operations</div>
          <div className="space-y-0.5">{others.map((i) => link(i, i.label))}</div>
        </div>
      </nav>

      {me && (
        <div className="flex items-center gap-2.5 border-t border-line px-3 py-3">
          <Avatar name={fullName(me)} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-semibold text-ink">{fullName(me)}</div>
            <div className="truncate text-[11px] text-ink-3">{me.role.name}</div>
          </div>
          <button type="button" onClick={logout} className="rounded p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" title="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      )}
    </aside>
  );
}
