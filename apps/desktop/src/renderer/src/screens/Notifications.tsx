import { useEffect } from 'react';
import { X, Bell, Check, Inbox } from 'lucide-react';
import { clsx } from 'clsx';
import { http, errorMessage } from '../lib/bridge';
import { relative } from '../lib/format';
import type { NotificationItem } from '../lib/types';
import type { QueryState } from '../lib/useQuery';
import { Button, Empty, ErrorBanner, IconButton, SkeletonRows } from '../components/ui';

/** F15: in-app notification panel. Polled every 30 s by the App (no WebSocket dependency in the desktop). */
export function NotificationsPanel({ query, onClose }: { query: QueryState<NotificationItem[] | { items: NotificationItem[] }>; onClose: () => void }) {
  const list = Array.isArray(query.data) ? query.data : query.data?.items ?? [];
  const unread = list.filter((n) => !n.readAt);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fade-in fixed inset-x-0 bottom-0 top-[34px] z-40 bg-overlay/60" onMouseDown={onClose}>
      <aside className="slide-in-right absolute right-0 top-[34px] flex h-[calc(100%-34px)] w-[400px] flex-col border-l border-line bg-surface shadow-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Notifications">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-pri-soft text-pri-2">
              <Bell size={14} />
            </span>
            <div className="leading-tight">
              <h2 className="text-md font-semibold text-ink">Notifications</h2>
              <div className="text-xs text-ink-3">{unread.length ? `${unread.length} unread` : 'All read'}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {unread.length > 0 && (
              <Button size="sm" variant="ghost" icon={<Check size={13} />} onClick={() => void http.post('/notifications/read', { all: true }).then(() => query.refetch())}>
                Mark all read
              </Button>
            )}
            <IconButton label="Close" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {query.loading ? (
            <div className="p-4"><SkeletonRows /></div>
          ) : query.error ? (
            <div className="p-4"><ErrorBanner message={errorMessage(query.error)} onRetry={query.refetch} /></div>
          ) : list.length === 0 ? (
            <Empty icon={<Inbox size={22} />} title="You are all caught up" body="Mentions, approvals and reminders will appear here." />
          ) : (
            <ul className="divide-y divide-line-2">
              {list.map((n) => (
                <li key={n.id} className={clsx(!n.readAt && 'bg-pri-soft/40')}>
                  <button type="button" onClick={() => !n.readAt && void http.post('/notifications/read', { ids: [n.id] }).then(() => query.refetch())} className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-surface-2">
                    <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-gray-bar' : 'bg-pri')} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={clsx('text-base', n.readAt ? 'font-medium text-ink-2' : 'font-semibold text-ink')}>{n.title}</span>
                        <span className="shrink-0 text-2xs normal-case tracking-normal text-ink-3">{relative(n.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-sm text-ink-2">{n.body}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
