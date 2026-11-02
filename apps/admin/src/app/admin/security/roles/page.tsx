'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Save, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCrmMutation } from '@/lib/queries/crm';
import { useRoles, useRole, usePermissionCatalog, type Role } from '@/lib/queries/platform';
import { Button, Card, Table, Th, Td, Badge, Skeleton, TableSkeleton, EmptyState, ErrorBanner, PageHeader, Banner, useToast } from '@/components/ui';
import { useIdParam } from '@/lib/useIdParam';

export default function RolesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Roles />
    </Suspense>
  );
}

const SCOPE_LABEL: Record<string, string> = { own: 'Own', team: 'Team', department: 'Dept', all: 'All' };

function groupOf(key: string): string {
  const [a, b] = key.split('.');
  if (a === 'crm') return `CRM ${b}`;
  return a ?? key;
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
  // R4: a user can only grant permissions and scopes they hold; R3: not their own role; FR-RBAC-04: system Super Admin fixed.
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

  return (
    <div>
      <PageHeader title="Roles & permissions" subtitle="Each permission is granted with a scope: own, team, department or all (05)." actions={editable ? <Button variant="primary" icon={<Save size={14} />} disabled={!dirty} loading={save.isPending} onClick={submit}>Save changes</Button> : undefined} />
      <div className="grid grid-cols-[260px_1fr] gap-3.5">
        <Card title="Roles">
          {roles.isLoading && <TableSkeleton cols={2} rows={5} />}
          {roles.isError && <ErrorBanner message={(roles.error as Error).message} onRetry={() => roles.refetch()} />}
          {roles.data && (
            <ul className="divide-y divide-line-2">
              {roles.data.map((r: Role) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelectedId(r.id)} className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[13px] hover:bg-surface-2 ${selectedId === r.id ? 'bg-pri-soft' : ''}`}>
                    <span>
                      <span className="font-semibold">{r.name}</span>
                      <span className="ml-1 text-xs text-ink-3">rank {r.rank}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {r.isSystem && <Lock size={12} className="text-ink-3" />}
                      <Badge tone="gray">{r._count?.employees ?? 0}</Badge>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={role.data ? `${role.data.name} — permission matrix` : 'Permission matrix'}>
          {(role.isLoading || catalog.isLoading) && <TableSkeleton cols={5} rows={10} />}
          {role.isError && <ErrorBanner message={(role.error as Error).message} onRetry={() => role.refetch()} />}
          {catalog.isError && <ErrorBanner message={(catalog.error as Error).message} onRetry={() => catalog.refetch()} />}
          {!selectedId && !role.isLoading && <EmptyState title="Select a role" />}
          {role.data && catalog.data && (
            <>
              {isSuperAdmin && <div className="p-3"><Banner tone="blue">Super Admin holds every permission with scope all and cannot be edited (R1).</Banner></div>}
              {isOwnRole && !isSuperAdmin && <div className="p-3"><Banner tone="amber">You cannot edit your own role (R3).</Banner></div>}
              {!can('roles.manage') && <div className="p-3"><Banner tone="blue">Read only. Editing needs roles.manage.</Banner></div>}
              <Table>
                <thead><tr><Th>Permission</Th><Th>None</Th>{catalog.data.scopes.map((s) => <Th key={s}>{SCOPE_LABEL[s] ?? s}</Th>)}</tr></thead>
                <tbody>
                  {groups.map(([group, keys]) => (
                    <GroupRows key={group} group={group} keys={keys} scopes={catalog.data!.scopes} draft={draft} editable={Boolean(editable)} canGrant={canGrant} onChange={(key, scope) => { setDraft((d) => { const n = { ...d }; if (scope) n[key] = scope; else delete n[key]; return n; }); setDirty(true); }} />
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function GroupRows({ group, keys, scopes, draft, editable, canGrant, onChange }: { group: string; keys: string[]; scopes: readonly string[]; draft: Record<string, string>; editable: boolean; canGrant: (k: string, s: string) => boolean; onChange: (key: string, scope: string | null) => void }) {
  return (
    <>
      <tr><Td colSpan={scopes.length + 2} className="bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{group}</Td></tr>
      {keys.map((key) => {
        const current = draft[key] ?? '';
        return (
          <tr key={key} className="hover:bg-surface-2">
            <Td mono>{key}</Td>
            <Td><input type="radio" name={key} className="accent-pri" checked={current === ''} disabled={!editable} onChange={() => onChange(key, null)} /></Td>
            {scopes.map((s) => {
              const allowed = canGrant(key, s);
              return (
                <Td key={s}>
                  <input type="radio" name={key} className="accent-pri" checked={current === s} disabled={!editable || !allowed} title={!allowed ? 'You cannot grant a scope you do not hold (R4)' : undefined} onChange={() => onChange(key, s)} />
                </Td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
