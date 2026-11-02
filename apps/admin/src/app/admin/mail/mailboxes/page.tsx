'use client';

import { useState } from 'react';
import { Mail, Plus, ExternalLink, Users } from 'lucide-react';
import { http, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMailboxes, useMailboxHealth, useMailMutation, type Mailbox } from '@/lib/queries/mail';
import { useEmployees } from '@/lib/queries/crm';
import { Button, Card, Table, Th, Td, Badge, TableSkeleton, EmptyState, ErrorBanner, Drawer, Field, Select, Checkbox, Banner, useToast, PageHeader } from '@/components/ui';
import { MAILBOX_PERMISSIONS, healthTone } from '@/components/mail/shared';
import { fullName, dateTime, relative } from '@/lib/format';

const SETUP_STEPS = [
  'Create a Google Cloud project inside the Workspace organisation and enable Gmail API and Pub/Sub.',
  'OAuth consent screen: Internal, scope gmail.modify. Create a Web OAuth client with redirect URI <api>/api/v1/mail/oauth/callback.',
  'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI on the API, then reload this page.',
];

export default function MailboxesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const isAccountsAdmin = can('mail.accounts.manage');
  const health = useMailboxHealth();
  const list = useMailboxes(true);
  const [selected, setSelected] = useState<Mailbox | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const connect = async () => {
    try {
      const r = await http.get<{ url: string }>('/mail/oauth/url');
      window.location.href = r.url;
    } catch (e) {
      setConnectError(e instanceof ApiError ? e.message : 'Could not start the Google connection');
    }
  };

  const googleConfigured = health.data?.googleConfigured ?? true;
  const q = isAccountsAdmin ? health : list;
  const rows: Array<Mailbox & Partial<{ health: string; threadsCount: number; assignmentsCount: number; staleSync: boolean; watchExpired: boolean }>> =
    isAccountsAdmin ? health.data?.items ?? [] : list.data ?? [];

  return (
    <div>
      <PageHeader title="Mailboxes" subtitle="Connected Google Workspace mailboxes and who may use them" actions={isAccountsAdmin && <Button variant="primary" icon={<Plus size={14} />} onClick={connect} disabled={!googleConfigured}>Connect mailbox</Button>} />
      {isAccountsAdmin && !googleConfigured && (
        <div className="mb-3">
          <Banner tone="amber">
            <div>
              <div className="font-semibold">Google credentials are not configured on the API.</div>
              <ol className="mt-1 list-decimal pl-4 text-xs">{SETUP_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
              <div className="mt-1 text-xs">Full steps: docs/10-google-workspace-email.md section 3.</div>
            </div>
          </Banner>
        </div>
      )}
      {connectError && <div className="mb-3"><ErrorBanner message={connectError} /></div>}
      <Card>
        {q.isLoading && <TableSkeleton cols={6} />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && rows.length === 0 && <EmptyState icon={<Mail size={28} />} title="No mailboxes connected" body={isAccountsAdmin ? 'Connect the first shared mailbox to start.' : 'Ask an administrator to assign a mailbox to you.'} />}
        {rows.length > 0 && (
          <Table>
            <thead><tr><Th>Mailbox</Th><Th>Health</Th><Th>Token</Th><Th>Last sync</Th><Th>Watch expires</Th><Th right>Users</Th><Th right>Threads</Th><Th /></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="hover:bg-surface-2">
                  <Td><div className="font-semibold">{m.displayName}</div><div className="text-xs text-ink-3">{m.address}</div></Td>
                  <Td>{m.health ? <Badge tone={healthTone(m.health)} dot>{m.health}</Badge> : <span className="text-ink-3">—</span>}</Td>
                  <Td><Badge tone={m.tokenStatus === 'ok' ? 'green' : 'red'}>{m.tokenStatus}</Badge></Td>
                  <Td className={m.staleSync ? 'text-amber' : 'text-ink-2'}>{m.lastSyncAt ? relative(m.lastSyncAt) : 'never'}</Td>
                  <Td className={m.watchExpired ? 'text-amber' : 'text-ink-2'}>{m.watchExpiresAt ? dateTime(m.watchExpiresAt) : '—'}</Td>
                  <Td right mono>{m.assignmentsCount ?? m.assignments?.length ?? '—'}</Td>
                  <Td right mono>{m.threadsCount ?? '—'}</Td>
                  <Td right>
                    <div className="flex justify-end gap-1">
                      {can('mail.assign') && <Button size="sm" icon={<Users size={12} />} onClick={() => setSelected(list.data?.find((x) => x.id === m.id) ?? m)}>Assignments</Button>}
                      {isAccountsAdmin && m.tokenStatus !== 'ok' && <Button size="sm" icon={<ExternalLink size={12} />} onClick={connect}>Reconnect</Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <AssignmentsDrawer mailbox={selected} onClose={() => setSelected(null)} onSaved={() => toast.push('success', 'Assignment saved')} />
    </div>
  );
}

function AssignmentsDrawer({ mailbox, onClose, onSaved }: { mailbox: Mailbox | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const employees = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [perms, setPerms] = useState<string[]>(['read', 'reply', 'comment']);
  const save = useMailMutation((b: { employeeId: string; permissions: string[] }) => http.post(`/mail/mailboxes/${mailbox?.id}/assign`, b));
  const toggle = (k: string) => setPerms((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const edit = (a: { employeeId: string; permissions: string[] }) => { setEmployeeId(a.employeeId); setPerms(a.permissions); };
  return (
    <Drawer open={Boolean(mailbox)} onClose={onClose} title={mailbox ? mailbox.displayName : ''} subtitle={mailbox?.address} width={620}>
      {mailbox && (
        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 text-[13px] font-semibold">Current assignments</div>
            {!mailbox.assignments?.length && <EmptyState title="Nobody assigned yet" body="Add an employee below." />}
            {mailbox.assignments?.map((a) => (
              <button key={a.id} type="button" onClick={() => edit(a)} className="mb-1 flex w-full items-center justify-between rounded-card border border-line px-3 py-2 text-left hover:bg-surface-2">
                <span className="text-[13px] font-semibold">{fullName(a.employee)} <span className="font-normal text-ink-3">({a.employee.code})</span></span>
                <span className="flex flex-wrap justify-end gap-1">{a.permissions.map((p) => <Badge key={p} tone={p === 'triage' || p === 'comment' ? 'violet' : 'gray'}>{p}</Badge>)}</span>
              </button>
            ))}
          </div>
          <div className="rounded-card border border-line p-4">
            <div className="mb-3 text-[13px] font-semibold">Add or update an assignment</div>
            <Field label="Employee"><Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Choose…</option>{employees.data?.map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}</Select></Field>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {MAILBOX_PERMISSIONS.map((p) => (
                <label key={p.key} className="flex items-start gap-2 rounded-md border border-line-2 p-2">
                  <Checkbox checked={perms.includes(p.key)} onChange={() => toggle(p.key)} />
                  <span><span className="block text-[13px] font-semibold">{p.label}</span><span className="block text-xs text-ink-3">{p.hint}</span></span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="primary" disabled={!employeeId || perms.length === 0} loading={save.isPending} onClick={() => save.mutate({ employeeId, permissions: perms }, { onSuccess: onSaved, onError: (e) => toast.push('error', (e as Error).message) })}>Save assignment</Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
