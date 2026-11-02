'use client';

import { useMemo, useState } from 'react';
import { Mail, Plus, ExternalLink, Users, ShieldCheck, Settings2 } from 'lucide-react';
import { http, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMailboxes, useMailboxHealth, useMailMutation, type Mailbox } from '@/lib/queries/mail';
import { useEmployees } from '@/lib/queries/crm';
import { Button, Card, Badge, EmptyState, ErrorBanner, Drawer, Field, Select, Banner, useToast, PageHeader, Avatar } from '@/components/ui';
import { DataTable, Toggle, Menu, type Column } from '@/components/ui/advanced';
import { MAILBOX_PERMISSIONS, healthTone } from '@/components/mail/shared';
import { fullName, dateTime, relative } from '@/lib/format';

const SETUP_STEPS = [
  'Create a Google Cloud project inside the Workspace organisation and enable the Gmail and Pub/Sub APIs.',
  'OAuth consent screen: Internal, scope gmail.modify. Create a Web OAuth client with redirect URI <api>/api/v1/mail/oauth/callback.',
  'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI on the API, then reload this page.',
];

type Row = Mailbox & Partial<{ health: string; threadsCount: number; assignmentsCount: number; staleSync: boolean; watchExpired: boolean }>;

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
  const rows: Row[] = isAccountsAdmin ? health.data?.items ?? [] : list.data ?? [];

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        key: 'mailbox',
        header: 'Mailbox',
        locked: true,
        cell: (m) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={m.displayName} size={28} />
            <div>
              <div className="font-semibold text-ink">{m.displayName}</div>
              <div className="font-mono text-xs text-ink-3">{m.address}</div>
            </div>
          </div>
        ),
      },
      { key: 'health', header: 'Health', cell: (m) => (m.health ? <Badge tone={healthTone(m.health)} dot>{m.health}</Badge> : <span className="text-ink-3">—</span>) },
      { key: 'token', header: 'Token', cell: (m) => <Badge tone={m.tokenStatus === 'ok' ? 'green' : 'red'} dot>{m.tokenStatus === 'ok' ? 'valid' : m.tokenStatus}</Badge> },
      { key: 'sync', header: 'Last sync', cell: (m) => <span className={m.staleSync ? 'text-amber-text' : 'text-ink-2'}>{m.lastSyncAt ? relative(m.lastSyncAt) : 'never'}</span> },
      { key: 'watch', header: 'Watch expires', cell: (m) => <span className={m.watchExpired ? 'text-amber-text' : 'text-ink-2'}>{m.watchExpiresAt ? dateTime(m.watchExpiresAt) : '—'}</span> },
      { key: 'users', header: 'Users', right: true, mono: true, cell: (m) => m.assignmentsCount ?? m.assignments?.length ?? '—' },
      { key: 'threads', header: 'Threads', right: true, mono: true, cell: (m) => m.threadsCount ?? '—' },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Mailboxes"
        subtitle="Connected Google Workspace mailboxes and who may use them."
        actions={isAccountsAdmin && (
          <Button variant="primary" icon={<Plus size={14} />} onClick={connect} disabled={!googleConfigured}>
            Connect mailbox
          </Button>
        )}
      />
      {isAccountsAdmin && !googleConfigured && (
        <div className="mb-3">
          <Banner tone="amber">
            <div>
              <div className="font-semibold">Google credentials are not configured on the API yet.</div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs">{SETUP_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
              <div className="mt-1 text-xs">Full steps: docs/10-google-workspace-email.md section 3.</div>
            </div>
          </Banner>
        </div>
      )}
      {connectError && <div className="mb-3"><ErrorBanner message={connectError} /></div>}
      <Card>
        <DataTable<Row>
          rows={rows}
          columns={columns}
          loading={q.isLoading}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => q.refetch()}
          storageKey="mailboxes"
          empty={<EmptyState icon={<Mail size={28} />} title="No mailboxes connected" body={isAccountsAdmin ? 'Connect the first shared mailbox to start.' : 'Ask an administrator to assign a mailbox to you.'} action={isAccountsAdmin && googleConfigured ? <Button variant="primary" icon={<Plus size={14} />} onClick={connect}>Connect mailbox</Button> : undefined} />}
          onRowClick={can('mail.assign') ? (m) => setSelected(list.data?.find((x) => x.id === m.id) ?? m) : undefined}
          rowActions={(m) => (
            <Menu
              items={[
                ...(can('mail.assign') ? [{ label: 'Assignments', icon: <Users size={14} />, onSelect: () => setSelected(list.data?.find((x) => x.id === m.id) ?? m) }] : []),
                ...(isAccountsAdmin ? [{ label: m.tokenStatus === 'ok' ? 'Reconnect' : 'Reconnect (token revoked)', icon: <ExternalLink size={14} />, onSelect: connect }] : []),
              ]}
            />
          )}
        />
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
  const toggle = (k: string, on: boolean) => setPerms((p) => (on ? Array.from(new Set([...p, k])) : p.filter((x) => x !== k)));
  const edit = (a: { employeeId: string; permissions: string[] }) => { setEmployeeId(a.employeeId); setPerms(a.permissions); };
  const presets: Array<[string, string[]]> = [
    ['Agent', ['read', 'reply', 'draft', 'attach', 'download', 'mark_read', 'comment']],
    ['Triage lead', ['read', 'reply', 'send', 'draft', 'attach', 'download', 'archive', 'mark_read', 'triage', 'comment']],
    ['Read only', ['read']],
  ];
  return (
    <Drawer open={Boolean(mailbox)} onClose={onClose} title={mailbox ? mailbox.displayName : ''} subtitle={mailbox?.address} width={640}>
      {mailbox && (
        <div className="space-y-5 p-5">
          <section>
            <div className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase text-ink-3"><Users size={12} /> Current assignments</div>
            {!mailbox.assignments?.length && <EmptyState title="Nobody assigned yet" body="Add an employee below." />}
            <div className="space-y-1.5">
              {mailbox.assignments?.map((a) => (
                <button key={a.id} type="button" onClick={() => edit(a)} className="flex w-full items-center gap-3 rounded-card border border-line px-3 py-2 text-left transition hover:border-pri hover:bg-surface-2">
                  <Avatar name={fullName(a.employee)} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-ink">{fullName(a.employee)}</span>
                    <span className="block font-mono text-xs text-ink-3">{a.employee.code}</span>
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">{a.permissions.map((p) => <Badge key={p} tone={p === 'triage' || p === 'comment' ? 'violet' : 'gray'}>{p.replace('_', ' ')}</Badge>)}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-card border border-line bg-surface-2/60 p-4">
            <div className="mb-3 flex items-center gap-2 text-2xs font-semibold uppercase text-ink-3"><Settings2 size={12} /> Add or update an assignment</div>
            <Field label="Employee" required>
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Choose…</option>
                {employees.data?.map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}
              </Select>
            </Field>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
              Presets:
              {presets.map(([label, p]) => (
                <button key={label} type="button" onClick={() => setPerms(p)} className="rounded-full border border-line bg-surface px-2 py-0.5 font-medium text-ink-2 hover:border-pri hover:text-pri">
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {MAILBOX_PERMISSIONS.map((p) => (
                <div key={p.key} className="flex items-start justify-between gap-2 rounded-md border border-line-2 bg-surface p-2.5">
                  <span>
                    <span className="block text-base font-semibold text-ink">{p.label}</span>
                    <span className="block text-xs text-ink-3">{p.hint}</span>
                  </span>
                  <Toggle checked={perms.includes(p.key)} onChange={(v) => toggle(p.key, v)} />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-xs text-ink-3"><ShieldCheck size={12} /> The server enforces these per request (10 §5).</span>
              <Button variant="primary" disabled={!employeeId || perms.length === 0} loading={save.isPending} onClick={() => save.mutate({ employeeId, permissions: perms }, { onSuccess: onSaved, onError: (e) => toast.push('error', (e as Error).message) })}>
                Save assignment
              </Button>
            </div>
          </section>
        </div>
      )}
    </Drawer>
  );
}
