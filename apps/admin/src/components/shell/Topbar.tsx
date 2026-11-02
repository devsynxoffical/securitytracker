'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Target, Contact, Building2, Briefcase } from 'lucide-react';
import { useSearch } from '@/lib/queries/crm';
import { Badge, stageTone, lifecycleTone } from '@/components/ui';
import { money, fullName } from '@/lib/format';

const titles: Record<string, [string, string]> = {
  '/admin': ['Home', 'Dashboard'],
  '/admin/crm/dashboard': ['CRM', 'Dashboard'],
  '/admin/crm/leads': ['CRM', 'Leads'],
  '/admin/crm/contacts': ['CRM', 'Contacts'],
  '/admin/crm/accounts': ['CRM', 'Accounts'],
  '/admin/crm/deals': ['CRM', 'Deals'],
  '/admin/crm/activities': ['CRM', 'Activities'],
  '/admin/crm/import': ['CRM', 'Import'],
  '/admin/crm/settings': ['CRM', 'Settings'],
};

export function Topbar() {
  const pathname = usePathname();
  const [crumb, title] = titles[pathname] ?? ['Admin', 'Company OS'];
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useSearch(debounced);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const total = data ? data.leads.length + data.contacts.length + data.accounts.length + data.deals.length : 0;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-line bg-surface px-[22px]">
      <div className="leading-tight">
        <div className="text-[11px] font-medium text-ink-3">{crumb}</div>
        <div className="text-base font-semibold text-ink">{title}</div>
      </div>

      <div ref={ref} className="relative w-full max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder="Search leads, contacts, accounts, deals…"
          className="h-9 w-full rounded-lg border border-line bg-surface-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-3 focus:border-pri focus:outline-none focus:ring-[3px] focus:ring-pri-soft"
        />
        {open && debounced.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-11 max-h-[70vh] overflow-y-auto rounded-card border border-line bg-surface shadow-modal">
            {isFetching && !data && <div className="px-4 py-3 text-xs text-ink-3">Searching…</div>}
            {data && total === 0 && <div className="px-4 py-3 text-[13px] text-ink-2">No results for “{debounced}”</div>}
            {data && data.leads.length > 0 && (
              <Group label="Leads" icon={<Target size={13} />}>
                {data.leads.map((l) => (
                  <Result key={l.id} href={`/admin/crm/leads?id=${l.id}`} onPick={() => setOpen(false)} title={l.name} sub={l.companyName ?? ''} right={<Badge tone={stageTone(l.stage.type)}>{l.stage.name}</Badge>} />
                ))}
              </Group>
            )}
            {data && data.contacts.length > 0 && (
              <Group label="Contacts" icon={<Contact size={13} />}>
                {data.contacts.map((c) => (
                  <Result key={c.id} href={`/admin/crm/contacts?id=${c.id}`} onPick={() => setOpen(false)} title={fullName(c)} sub={[c.title, c.account?.name].filter(Boolean).join(' · ')} />
                ))}
              </Group>
            )}
            {data && data.accounts.length > 0 && (
              <Group label="Accounts" icon={<Building2 size={13} />}>
                {data.accounts.map((a) => (
                  <Result key={a.id} href={`/admin/crm/accounts?id=${a.id}`} onPick={() => setOpen(false)} title={a.name} sub={a.domain ?? ''} right={<Badge tone={lifecycleTone(a.lifecycle)}>{a.lifecycle}</Badge>} />
                ))}
              </Group>
            )}
            {data && data.deals.length > 0 && (
              <Group label="Deals" icon={<Briefcase size={13} />}>
                {data.deals.map((d) => (
                  <Result key={d.id} href={`/admin/crm/deals?id=${d.id}`} onPick={() => setOpen(false)} title={d.name} sub={d.account?.name ?? ''} right={<span className="font-mono text-xs">{money(d.amount, d.currency)}</span>} />
                ))}
              </Group>
            )}
          </div>
        )}
      </div>
      <div className="w-24" />
    </header>
  );
}

function Group({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-b border-line-2 last:border-0">
      <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

function Result({ href, title, sub, right, onPick }: { href: string; title: string; sub?: string; right?: React.ReactNode; onPick: () => void }) {
  return (
    <Link href={href} onClick={onPick} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-surface-2">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-ink">{title}</div>
        {sub && <div className="truncate text-xs text-ink-3">{sub}</div>}
      </div>
      {right}
    </Link>
  );
}
