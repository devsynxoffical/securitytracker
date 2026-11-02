'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui';
import { Tooltip } from '@/components/ui/advanced';
import { fullName } from '@/lib/format';
import { NAV, type NavGroup, type NavItem } from './nav';

export const SIDEBAR_WIDTH = 232;
export const SIDEBAR_COLLAPSED = 60;

/**
 * Admin sidebar (DESIGN-SYSTEM v2 section 10): 232px expanded with grouped, collapsible
 * sections; 60px icon rail when collapsed (per-viewer preference). Items come from nav.ts.
 */
export function Sidebar() {
  const pathname = usePathname() ?? '';
  const { me, logout, can } = useAuth();
  const { sidebarCollapsed, setSidebarCollapsed } = useTheme();
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const visible = (item: NavItem) => (!item.permission || can(item.permission)) && (!item.anyPermission || item.anyPermission.some((p) => can(p)));
  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(href + '/'));
  const groupHasActive = (g: NavGroup) => g.items.some((i) => isActive(i.href));
  const isOpen = (g: NavGroup) => (g.key in toggled ? toggled[g.key] : groupHasActive(g) || g.key === 'home' || g.key === 'crm');

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    const link = (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={clsx(
          'flex items-center gap-2.5 rounded-lg text-base font-medium transition-colors',
          sidebarCollapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-[6px]',
          active ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        )}
      >
        <Icon size={16} strokeWidth={1.85} className={clsx('shrink-0', active ? 'text-pri' : 'text-ink-3')} />
        {!sidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
      </Link>
    );
    return sidebarCollapsed ? (
      <div key={item.href} className="flex w-full justify-center [&>span]:w-full [&>span>a]:w-full">
        <Tooltip label={item.label} side="bottom">
          {link}
        </Tooltip>
      </div>
    ) : (
      link
    );
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex flex-col border-r border-line bg-surface transition-[width] duration-150" style={{ width: sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH }}>
      <div className={clsx('flex h-14 items-center border-b border-line', sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-4')}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pri font-mono text-xs font-semibold text-white">OS</span>
        {!sidebarCollapsed && (
          <div className="leading-tight">
            <div className="text-base font-semibold text-ink">Company OS</div>
            <div className="text-2xs font-semibold uppercase text-ink-3">Admin</div>
          </div>
        )}
      </div>

      <nav className={clsx('flex-1 space-y-1 overflow-y-auto py-3', sidebarCollapsed ? 'px-2' : 'px-3')} aria-label="Main">
        {NAV.map((group) => {
          const items = group.items.filter(visible);
          if (items.length === 0) return null;
          if (sidebarCollapsed) {
            return (
              <div key={group.key} className="space-y-0.5 border-b border-line-2 pb-2 last:border-0">
                {items.map(renderItem)}
              </div>
            );
          }
          if (group.key === 'home') return <div key={group.key} className="space-y-0.5 pb-2">{items.map(renderItem)}</div>;
          const open = isOpen(group);
          return (
            <div key={group.key}>
              <button
                type="button"
                onClick={() => setToggled((t) => ({ ...t, [group.key]: !open }))}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-2xs font-semibold uppercase text-ink-3 hover:text-ink-2"
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

      <div className={clsx('border-t border-line', sidebarCollapsed ? 'flex flex-col items-center gap-2 px-0 py-3' : 'flex items-center gap-2.5 px-3 py-3')}>
        {me && (
          <>
            <Avatar name={fullName(me)} />
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-base font-semibold text-ink">{fullName(me)}</div>
                <div className="truncate text-xs text-ink-3">{me.role.name}</div>
              </div>
            )}
          </>
        )}
        <Tooltip label="Sign out" side="top">
          <button type="button" onClick={logout} className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Sign out">
            <LogOut size={15} />
          </button>
        </Tooltip>
      </div>
      <button
        type="button"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-ink-3 shadow-card hover:text-ink"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
      </button>
    </aside>
  );
}
