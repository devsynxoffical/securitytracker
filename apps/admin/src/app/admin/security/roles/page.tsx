'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Save, Lock, Users, KeyRound, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCrmMutation } from '@/lib/queries/crm';
import { useRoles, useRole, usePermissionCatalog, type Role } from '@/lib/queries/platform';
import { Button, Card, Badge, Skeleton, TableSkeleton, EmptyState, ErrorBanner, PageHeader, Banner, useToast } from '@/components/ui';
import { Section, Tooltip } from '@/components/ui/advanced';
import { useIdParam } from '@/lib/useIdParam';

export default function RolesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Roles />
    </Suspense>
  );
}

const SCOPE_LABEL: Record<string, string> = { own: 'Own', team: 'Team', department: 'Department', all: 'All' };
const SCOPE_HINT: Record<string, string> = { own: 'Records owned by the user', team: 'Teams the user leads, plus own', department: 'Departments the user manages, plus own', all: 'Everything in the company' };

function groupOf(key: string): string {
  const [a, b] = key.split('.');
  if (a === 'crm') return `CRM · ${b}`;
  if (a === 'hr') return 'HR';
  return (a ?? key).replace(/_/g, ' ');
}

function Roles() {
  const { me, can } = useAuth();
  const toast = useToast();
  const roles = useRoles();
  const catalog = usePermissionCatalog();
  const [selectedId, setSelectedId] = useIdParam();
  const role = useRole(selectedId);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const resetDraft = () => {
    if (role.data) {
      setDraft(Object.fromEntries(role.data.permissions.map((p) => [p.permissionKey, p.scope])));
      setDirty(false);
    }
  };
  useEffect(() => {
    if (role.data) {
      setDraft(Object.fromEntries(role.data.permissions.map((p) => [p.permissionKey, p.scope])));
      setDirty(false);
    }
  }, [role.data]);
  useEffect(() => {
    if (!selectedId && roles.data?.length) setSelectedId(roles.data[0]!.id);
  }, [roles.data, selectedId, setSelectedId]);

  const myGrants = useMemo(() => new Map((me?.role.permissions ?? []).map((p) => [p.key, p.scope])), [me]);
  const scopeRank = (s: string | undefined) => ['own', 'team', 'department', 'all'].indexOf(s ?? '');
  // R4: a user can only grant permissions and scopes they hold; R3: not their own role; FR-RBAC-04: Super Admin fixed.
  const isSuperAdmin = role.data?.name === 'Super Admin';
  const isOwnRole = role.data?.id === me?.role.id;
  const editable = can('roles.manage') && role.data && !isSuperAdmin && !isOwnRole;
  const canGrant = (key: string, scope: string) => scopeRank(myGrants.get(key)) >= scopeRank(scope);

  const save = useCrmMutation(
    (permissions: Array<{ key: string; scope: string }>) => api(`/roles/${selectedId}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),
    [['roles']],
  );
  const submit = () =>
    save.mutate(Object.entries(draft).map(([key, scope]) => ({ key, scope })), {
      onSuccess: () => { toast.push('success', 'Permissions saved'); setDirty(false); },
      onError: (e) => toast.push('error', (e as Error).message),
    });

  const groups = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const k of catalog.data?.permissions ?? []) {
      const g = groupOf(k);
      out.set(g, [...(out.get(g) ?? []), k]);
    }
    return Array.from(out.entries());
  }, [catalog.data]);
  const granted = Object.keys(draft).length;
  const total = catalog.data?.permissions.length ?? 0;

  return (
    <div>
      <PageHeader title="Roles & permissions" subtitle="Each permission is granted with a scope: own, team, department or all (05)." />
      <div className="grid grid-cols-[260px_1fr] gap-3.5">
        <Card title="Roles">
          {roles.isLoading && <TableSkeleton cols={2} rows={5} />}
          {roles.isError && <ErrorBanner message={(roles.error as Error).message} onRetry={() => roles.refetch()} />}
          {roles.data && (
            <ul className="p-2">
              {roles.data.map((r: Role) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelectedId(r.id)} className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition', selectedId === r.id ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
                    <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', selectedId === r.id ? 'bg-surface text-pri' : 'bg-surface-2 text-ink-3')}>{r.isSystem ? <Lock size={13} /> : <KeyRound size={13} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold">{r.name}</span>
                      <span className="block text-xs text-ink-3">rank {r.rank}{r.isSystem ? ' · system' : ''}</span>
                    </span>
                    <Tooltip label="Employees with this role"><Badge tone="gray"><Users size={10} className="mr-1 inline" />{r._count?.employees ?? 0}</Badge></Tooltip>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={role.data ? role.data.name : 'Permission matrix'}
          actions={
            role.data && catalog.data ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-ink-3">{granted}/{total} granted</span>
                {editable && <Button size="sm" variant="ghost" icon={<RotateCcw size={12} />} disabled={!dirty} onClick={resetDraft}>Reset</Button>}
                {editable && <Button size="sm" variant="primary" icon={<Save size={12} />} disabled={!dirty} loading={save.isPending} onClick={submit}>Save changes</Button>}
              </div>
            ) : undefined
          }
        >
          {(role.isLoading || catalog.isLoading) && <TableSkeleton cols={5} rows={10} />}
          {role.isError && <ErrorBanner message={(role.error as Error).message} onRetry={() => role.refetch()} />}
          {catalog.isError && <ErrorBanner message={(catalog.error as Error).message} onRetry={() => catalog.refetch()} />}
          {!selectedId && !role.isLoading && <EmptyState title="Select a role" />}
          {role.data && catalog.data && (
            <>
              <div className="space-y-2 p-3 pb-0">
                {isSuperAdmin && <Banner tone="blue">Super Admin holds every permission with scope all and cannot be edited (R1).</Banner>}
                {isOwnRole && !isSuperAdmin && <Banner tone="amber">You cannot edit your own role (R3).</Banner>}
                {!can('roles.manage') && <Banner tone="blue">Read only. Editing needs roles.manage.</Banner>}
                {editable && <Banner tone="blue">Greyed scopes are ones you do not hold yourself, so you cannot grant them (R4).</Banner>}
              </div>
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-base">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="sticky left-0 z-20 bg-surface-2 px-4 py-2.5 text-left text-2xs font-semibold uppercase text-ink-3">Permission</th>
                      <th className="bg-surface-2 px-3 py-2.5 text-center text-2xs font-semibold uppercase text-ink-3">None</th>
                      {catalog.data.scopes.map((s) => (
                        <th key={s} className="bg-surface-2 px-3 py-2.5 text-center text-2xs font-semibold uppercase text-ink-3">
                          <Tooltip label={SCOPE_HINT[s] ?? s}><span>{SCOPE_LABEL[s] ?? s}</span></Tooltip>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(([group, keys]) => (
                      <GroupRows key={group} group={group} keys={keys} scopes={catalog.data!.scopes} draft={draft} editable={Boolean(editable)} canGrant={canGrant} onChange={(key, scope) => { setDraft((d) => { const n = { ...d }; if (scope) n[key] = scope; else delete n[key]; return n; }); setDirty(true); }} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function GroupRows({ group, keys, scopes, draft, editable, canGrant, onChange }: { group: string; keys: string[]; scopes: readonly string[]; draft: Record<string, string>; editable: boolean; canGrant: (k: string, s: string) => boolean; onChange: (key: string, scope: string | null) => void }) {
  const [open, setOpen] = useState(true);
  const grantedInGroup = keys.filter((k) => draft[k]).length;
  return (
    <>
      <tr>
        <td colSpan={scopes.length + 2} className="border-t border-line-2 bg-surface px-4 py-1.5">
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-2 text-2xs font-semibold uppercase text-ink-3 hover:text-ink">
            <span className={clsx('inline-block transition-transform', !open && '-rotate-90')}>▾</span>
            {group}
            <span className="rounded-full bg-gray-soft px-1.5 font-mono normal-case tracking-normal text-ink-2">{grantedInGroup}/{keys.length}</span>
          </button>
        </td>
      </tr>
      {open &&
        keys.map((key) => {
          const current = draft[key] ?? '';
          const cell = (value: string, allowed: boolean, title?: string) => (
            <td key={value || 'none'} className="border-t border-line-2 px-3 py-2 text-center">
              <label className={clsx('inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border transition', current === value ? 'border-pri bg-pri text-white' : allowed && editable ? 'border-line hover:border-pri' : 'border-line-2 bg-surface-2 opacity-50', (!editable || !allowed) && 'cursor-not-allowed')} title={title}>
                <input type="radio" name={key} className="sr-only" checked={current === value} disabled={!editable || !allowed} onChange={() => onChange(key, value || null)} />
                {current === value && <span className="h-2 w-2 rounded-full bg-white" />}
              </label>
            </td>
          );
          return (
            <tr key={key} className="hover:bg-surface-2">
              <td className="sticky left-0 z-10 border-t border-line-2 bg-surface px-4 py-2 font-mono text-sm text-ink">{key}</td>
              {cell('', true)}
              {scopes.map((s) => cell(s, canGrant(key, s), !canGrant(key, s) ? 'You cannot grant a scope you do not hold (R4)' : undefined))}
            </tr>
          );
        })}
    </>
  );
}
