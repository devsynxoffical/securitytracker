'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Bell, Sun, Moon, Monitor, ChevronRight, Check, MessageSquare } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useUnread, useChatRealtime } from '@/lib/queries/chat';
import { useTheme, type Theme } from '@/lib/theme';
import { Kbd, Menu, Tooltip, DensityToggle } from '@/components/ui/advanced';
import { Button } from '@/components/ui';
import { NAV } from './nav';
import { CommandPalette } from './CommandPalette';
import { relative as relativeTime } from '@/lib/format';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function crumbsFor(pathname: string): Array<{ label: string; href?: string }> {
  for (const g of NAV) {
    for (const item of g.items) {
      const match = item.href === '/admin' ? pathname === '/admin' : pathname === item.href || pathname.startsWith(item.href + '/');
      if (match) {
        return g.key === 'home' ? [{ label: 'Overview' }] : [{ label: g.label, href: g.items[0]?.href }, { label: item.label }];
      }
    }
  }
  return [{ label: 'Admin' }];
}

/** 56px top bar: breadcrumbs from nav.ts, ⌘K search trigger, notifications, theme, density. */
export function Topbar() {
  const pathname = usePathname() ?? '';
  const crumbs = crumbsFor(pathname);
  const title = crumbs[crumbs.length - 1]?.label ?? 'Company OS';
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { theme, setTheme, density, setDensity } = useTheme();
  const qc = useQueryClient();
  const { can } = useAuth();
  const chatAllowed = can('chat.use');
  useChatRealtime(chatAllowed);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const notifications = useQuery({
    queryKey: ['notifications', 'topbar'],
    queryFn: () => http.get<Notification[] | { items: Notification[] }>('/notifications?limit=20'),
    refetchInterval: 30_000,
  });
  const list: Notification[] = Array.isArray(notifications.data) ? notifications.data : notifications.data?.items ?? [];
  const unread = list.filter((n) => !n.readAt).length;
  const markRead = useMutation({
    mutationFn: (ids: string[]) => http.post('/notifications/read', { ids, all: ids.length === 0 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const themeIcon = theme === 'dark' ? <Moon size={15} /> : theme === 'light' ? <Sun size={15} /> : <Monitor size={15} />;
  const themeItem = (t: Theme, label: string, icon: React.ReactNode) => ({ label, icon, onSelect: () => setTheme(t), shortcut: theme === t ? '✓' : undefined });

  return (
    <>
      <header className="topbar-surface sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-surface/95 px-[22px] backdrop-blur">
        <div className="min-w-0 leading-tight">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-ink-3">
            {crumbs.slice(0, -1).map((c) => (
              <span key={c.label} className="inline-flex items-center gap-1">
                {c.href ? <Link href={c.href} className="hover:text-ink">{c.label}</Link> : c.label}
                <ChevronRight size={11} />
              </span>
            ))}
          </nav>
          <h1 className="truncate text-lg font-semibold text-ink">{title}</h1>
        </div>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mx-auto flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-base text-ink-3 transition hover:border-ink-3"
          aria-label="Open search (Command K)"
        >
          <Search size={15} />
          <span className="flex-1 text-left">Search or jump to…</span>
          <span className="inline-flex items-center gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        </button>

        <div className="flex items-center gap-1.5">
          <DensityToggle value={density} onChange={setDensity} />
          <Menu
            trigger={
              <Tooltip label="Theme" side="bottom">
                <span className="inline-flex rounded-md border border-line bg-surface p-1.5 text-ink-3 hover:text-ink">{themeIcon}</span>
              </Tooltip>
            }
            items={[themeItem('light', 'Light', <Sun size={14} />), themeItem('dark', 'Dark', <Moon size={14} />), themeItem('system', 'System', <Monitor size={14} />)]}
          />
          {chatAllowed && <ChatBadge active={pathname.startsWith('/admin/chat')} />}
          <NotificationsBell items={list} unread={unread} onRead={(ids) => markRead.mutate(ids)} loading={notifications.isLoading} />
        </div>
      </header>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

/** FR-CHAT-06: unread chat total next to notifications; realtime via /ws, 10 s polling when the socket is down. */
function ChatBadge({ active }: { active: boolean }) {
  const unread = useUnread(true);
  const total = unread.data?.total ?? 0;
  return (
    <Tooltip label="Chat" side="bottom">
      <Link href="/admin/chat" aria-label={`Chat, ${total} unread`} className={clsx('relative inline-flex rounded-md border border-line bg-surface p-1.5 hover:text-ink', active ? 'text-pri' : 'text-ink-3')}>
        <MessageSquare size={15} />
        {total > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-pri px-1 font-mono text-[10px] font-semibold text-white">{total > 9 ? '9+' : total}</span>}
      </Link>
    </Tooltip>
  );
}

function NotificationsBell({ items, unread, onRead, loading }: { items: Notification[]; unread: number; onRead: (ids: string[]) => void; loading: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);
  return (
    <div className="relative">
      <Tooltip label="Notifications" side="bottom">
        <button type="button" onClick={() => setOpen((o) => !o)} className="relative rounded-md border border-line bg-surface p-1.5 text-ink-3 hover:text-ink" aria-label={`Notifications, ${unread} unread`}>
          <Bell size={15} />
          {unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red px-1 font-mono text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </Tooltip>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="pop-in absolute right-0 top-full z-40 mt-1.5 w-[360px] overflow-hidden rounded-card border border-line bg-surface shadow-pop">
            <header className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
              <span className="text-base font-semibold text-ink">Notifications</span>
              {unread > 0 && (
                <Button size="sm" variant="ghost" icon={<Check size={13} />} onClick={() => onRead([])}>
                  Mark all read
                </Button>
              )}
            </header>
            <ul className="max-h-[60vh] overflow-y-auto">
              {loading && <li className="px-4 py-6 text-center text-xs text-ink-3">Loading…</li>}
              {!loading && items.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">You're all caught up.</li>}
              {items.map((n) => (
                <li key={n.id} className={clsx('border-b border-line-2 px-3.5 py-2.5 last:border-0', !n.readAt && 'bg-pri-soft/40')}>
                  <button type="button" className="w-full text-left" onClick={() => !n.readAt && onRead([n.id])}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-base font-medium text-ink">{n.title}</span>
                      <span className="shrink-0 text-2xs normal-case tracking-normal text-ink-3">{relativeTime(n.createdAt)}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-sm text-ink-2">{n.body}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
