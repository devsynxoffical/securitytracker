'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowRight, Target, Contact, Building2, Briefcase, Plus, CornerDownLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { useSearch } from '@/lib/queries/crm';
import { useAuth } from '@/lib/auth';
import { NAV } from './nav';
import { Kbd } from '@/components/ui/advanced';
import { Badge, stageTone, lifecycleTone } from '@/components/ui';
import { money, fullName } from '@/lib/format';

interface Item {
  id: string;
  group: string;
  title: string;
  sub?: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
  href: string;
}

/**
 * ⌘K / Ctrl+K command palette: jump to any screen, open CRM records, quick create.
 * Records come from GET /crm/search (scope-filtered by the server).
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isFetching } = useSearch(debounced);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const needle = q.trim().toLowerCase();
    const quick: Item[] = [
      { id: 'new-lead', group: 'Create', title: 'New lead', icon: <Plus size={14} />, href: '/admin/crm/leads?new=1' },
      { id: 'new-contact', group: 'Create', title: 'New contact', icon: <Plus size={14} />, href: '/admin/crm/contacts?new=1' },
      { id: 'new-deal', group: 'Create', title: 'New deal', icon: <Plus size={14} />, href: '/admin/crm/deals?new=1' },
      { id: 'new-task', group: 'Create', title: 'New task', icon: <Plus size={14} />, href: '/admin/tasks/my?new=1' },
    ].filter((i) => (needle ? i.title.toLowerCase().includes(needle) : true));
    const pages: Item[] = NAV.flatMap((g) =>
      g.items
        .filter((i) => (!i.permission || can(i.permission)) && (!i.anyPermission || i.anyPermission.some((p) => can(p))))
        .filter((i) => (needle ? `${g.label} ${i.label}`.toLowerCase().includes(needle) : true))
        .map((i) => ({ id: i.href, group: 'Go to', title: i.label, sub: g.label, icon: <i.icon size={14} />, href: i.href })),
    );
    if (needle.length < 2) return [...pages.slice(0, 8), ...quick];
    if (data) {
      data.leads.forEach((l) => out.push({ id: `lead-${l.id}`, group: 'Leads', title: l.name, sub: l.companyName ?? undefined, icon: <Target size={14} />, right: <Badge tone={stageTone(l.stage.type)}>{l.stage.name}</Badge>, href: `/admin/crm/leads?id=${l.id}` }));
      data.contacts.forEach((c) => out.push({ id: `contact-${c.id}`, group: 'Contacts', title: fullName(c), sub: [c.title, c.account?.name].filter(Boolean).join(' · '), icon: <Contact size={14} />, href: `/admin/crm/contacts?id=${c.id}` }));
      data.accounts.forEach((a) => out.push({ id: `account-${a.id}`, group: 'Accounts', title: a.name, sub: a.domain ?? undefined, icon: <Building2 size={14} />, right: <Badge tone={lifecycleTone(a.lifecycle)}>{a.lifecycle}</Badge>, href: `/admin/crm/accounts?id=${a.id}` }));
      data.deals.forEach((d) => out.push({ id: `deal-${d.id}`, group: 'Deals', title: d.name, sub: d.account?.name ?? undefined, icon: <Briefcase size={14} />, right: <span className="font-mono text-xs">{money(d.amount, d.currency)}</span>, href: `/admin/crm/deals?id=${d.id}` }));
    }
    return [...out, ...pages.slice(0, 5), ...quick];
  }, [q, data, can]);

  useEffect(() => setActive(0), [items.length, debounced]);

  const go = (item: Item) => {
    onClose();
    router.push(item.href);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(items.length - 1, a + 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      }
      if (e.key === 'Enter' && items[active]) go(items[active]!);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items, active]);

  if (!open) return null;
  const groups = items.reduce<Record<string, Item[]>>((acc, it) => ((acc[it.group] ??= []).push(it), acc), {});
  let idx = -1;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[var(--overlay)] p-4 pt-[12vh]" onMouseDown={onClose}>
      <div role="dialog" aria-modal aria-label="Command palette" className="pop-in w-full max-w-xl overflow-hidden rounded-modal border border-line bg-surface shadow-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-ink-3" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search records, jump to a screen, or create…" className="h-12 flex-1 bg-transparent text-md text-ink placeholder:text-ink-3 focus:outline-none" />
          {isFetching && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-3 border-t-transparent" />}
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {items.length === 0 && <div className="px-4 py-8 text-center text-base text-ink-2">No results for “{q}”</div>}
          {Object.entries(groups).map(([group, list]) => (
            <div key={group} className="mb-1">
              <div className="px-4 pb-1 pt-2 text-2xs font-semibold uppercase text-ink-3">{group}</div>
              {list.map((it) => {
                idx += 1;
                const i = idx;
                return (
                  <button key={it.id} type="button" onMouseEnter={() => setActive(i)} onClick={() => go(it)} className={clsx('flex w-full items-center gap-3 px-4 py-2 text-left', active === i ? 'bg-pri-soft text-pri-2' : 'text-ink hover:bg-surface-2')}>
                    <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', active === i ? 'bg-surface text-pri' : 'bg-surface-2 text-ink-3')}>{it.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium">{it.title}</span>
                      {it.sub && <span className="block truncate text-xs text-ink-3">{it.sub}</span>}
                    </span>
                    {it.right}
                    {active === i ? <CornerDownLeft size={14} className="text-ink-3" /> : <ArrowRight size={14} className="text-ink-3 opacity-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-line bg-surface-2 px-4 py-2 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="inline-flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          <span className="ml-auto inline-flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
