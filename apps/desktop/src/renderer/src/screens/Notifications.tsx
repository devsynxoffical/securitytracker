import { X, Bell } from 'lucide-react';
import { http, errorMessage } from '../lib/bridge';
import { relative } from '../lib/format';
import type { NotificationItem } from '../lib/types';
import type { QueryState } from '../lib/useQuery';
import { Button, Empty, ErrorBanner, SkeletonRows } from '../components/ui';

/** F15: in-app notification panel. Polled every 30 s by the App (no WebSocket dependency in the desktop). */
export function NotificationsPanel({ query, onClose }: { query: QueryState<NotificationItem[] | { items: NotificationItem[] }>; onClose: () => void }) {
  const list = Array.isArray(query.data) ? query.data : query.data?.items ?? [];
  const unread = list.filter((n) => !n.readAt);
  return (
    <div className="fixed inset-0 z-40" onMouseDown={onClose}>
      <aside className="absolute right-0 top-[34px] flex h-[calc(100%-34px)] w-[380px] flex-col border-l border-line bg-surface shadow-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink"><Bell size={15} /> Notifications</h2>
          <div className="flex items-center gap-1">
            {unread.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => void http.post('/notifications/read', { all: true }).then(() => query.refetch())}>Mark all read</Button>
            )}
            <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close"><X size={16} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {query.loading ? (
            <SkeletonRows />
          ) : query.error ? (
            <ErrorBanner message={errorMessage(query.error)} onRetry={query.refetch} />
          ) : list.length === 0 ? (
            <Empty title="You are all caught up" />
          ) : (
            <ul className="space-y-1.5">
              {list.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => !n.readAt && void http.post('/notifications/read', { ids: [n.id] }).then(() => query.refetch())} className={`w-full rounded-lg border p-2.5 text-left ${n.readAt ? 'border-line-2' : 'border-pri/30 bg-pri-soft/40'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-ink">{n.title}</span>
                      <span className="shrink-0 text-[11px] text-ink-3">{relative(n.createdAt)}</span>
                    </div>
                    <div className="text-[12px] text-ink-2">{n.body}</div>
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
