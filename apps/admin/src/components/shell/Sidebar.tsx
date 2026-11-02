'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/ui';
import { fullName } from '@/lib/format';
import { NAV, type NavGroup, type NavItem } from './nav';

/**
 * Admin sidebar (DESIGN-SYSTEM.md section 4: 232px, grouped, expandable). Items come from nav.ts.
 * Groups open automatically for the current route; the user's manual toggles win afterwards.
 */
export function Sidebar() {
  const pathname = usePathname() ?? '';
  const { me, logout, can } = useAuth();
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const visible = (item: NavItem) => {
    if (item.permission && !can(item.permission)) return false;
    if (item.anyPermission && !item.anyPermission.some((p) => can(p))) return false;
    return true;
  };
  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(href + '/'));
  const groupHasActive = (g: NavGroup) => g.items.some((i) => isActive(i.href));
  const isOpen = (g: NavGroup) => (g.key in toggled ? toggled[g.key] : groupHasActive(g) || g.key === 'home');

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={clsx(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13px] font-medium transition',
          active ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        )}
      >
        <Icon size={16} strokeWidth={1.85} className={active ? 'text-pri' : 'text-ink-3'} />
        <span className="flex-1 truncate">{item.label}</span>
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

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {NAV.map((group) => {
          const items = group.items.filter(visible);
          if (items.length === 0) return null;
          if (group.key === 'home') return <div key={group.key} className="space-y-0.5 pb-2">{items.map(renderItem)}</div>;
          const open = isOpen(group);
          return (
            <div key={group.key}>
              <button
                type="button"
                onClick={() => setToggled((t) => ({ ...t, [group.key]: !open }))}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3 hover:text-ink-2"
                aria-expanded={open}
              >
                <span>{group.label}</span>
                <ChevronDown size={13} className={clsx('transition-transform', open ? 'rotate-0' : '-rotate-90')} />
              </button>
              {open && <div className="space-y-0.5 pb-1">{items.map(renderItem)}</div>}
            </div>
          );
        })}
      </nav>

      {me && (
        <div className="flex items-center gap-2.5 border-t border-line px-3 py-3">
          <Avatar name={fullName(me)} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-semibold text-ink">{fullName(me)}</div>
            <div className="truncate text-[11px] text-ink-3">{me.role.name}</div>
          </div>
          <button type="button" onClick={logout} className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" title="Sign out" aria-label="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      )}
    </aside>
  );
}
