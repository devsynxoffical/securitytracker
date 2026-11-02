'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Plug, Server, Send, KeyRound, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { Button, Field, Input, Select, Modal, Drawer, Banner, Checkbox, useToast } from '@/components/ui';
import { testImapMailbox, useCreateImapMailbox, useUpdateImapMailbox, type ImapMailboxSettings, type ImapTestResult, type Mailbox } from '@/lib/queries/mail';

/* ---------------------------------------------------------------------------
   Provider presets (docs/10 §2 option D). Ports follow each provider's
   published settings; Microsoft 365 uses STARTTLS on 587 for SMTP.
--------------------------------------------------------------------------- */

export interface ImapPreset {
  key: string;
  label: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  hint?: string;
}

export const IMAP_PRESETS: ImapPreset[] = [
  { key: 'hostinger', label: 'Hostinger', imapHost: 'imap.hostinger.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.hostinger.com', smtpPort: 465, smtpSecure: true, hint: 'Username is the full email address.' },
  { key: 'm365', label: 'GoDaddy / Microsoft 365', imapHost: 'outlook.office365.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecure: false, hint: 'SMTP uses STARTTLS on 587. Enable "Authenticated SMTP" for the mailbox in Microsoft 365 admin.' },
  { key: 'zoho', label: 'Zoho Mail', imapHost: 'imap.zoho.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.zoho.com', smtpPort: 465, smtpSecure: true, hint: 'Enable IMAP access in Zoho Mail settings. Use an app-specific password when two-factor is on.' },
  { key: 'gmail', label: 'Gmail (app password)', imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecure: true, hint: 'Requires a Google app password. Prefer the Google Workspace connection when available.' },
  { key: 'custom', label: 'Custom', imapHost: '', imapPort: 993, imapSecure: true, smtpHost: '', smtpPort: 465, smtpSecure: true },
];

function detectPreset(s: Pick<ImapMailboxSettings, 'imapHost' | 'smtpHost'>): string {
  return IMAP_PRESETS.find((p) => p.key !== 'custom' && p.imapHost === s.imapHost && p.smtpHost === s.smtpHost)?.key ?? 'custom';
}

const EMPTY: ImapMailboxSettings = {
  address: '',
  displayName: '',
  imapHost: IMAP_PRESETS[0]!.imapHost,
  imapPort: IMAP_PRESETS[0]!.imapPort,
  imapSecure: true,
  smtpHost: IMAP_PRESETS[0]!.smtpHost,
  smtpPort: IMAP_PRESETS[0]!.smtpPort,
  smtpSecure: true,
  username: '',
  password: '',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(f: ImapMailboxSettings, requirePassword: boolean): Partial<Record<keyof ImapMailboxSettings, string>> {
  const e: Partial<Record<keyof ImapMailboxSettings, string>> = {};
  if (!EMAIL_RE.test(f.address)) e.address = 'Enter a valid email address';
  if (!f.displayName.trim()) e.displayName = 'Required';
  if (!f.imapHost.trim()) e.imapHost = 'Required';
  if (!(f.imapPort >= 1 && f.imapPort <= 65535)) e.imapPort = '1–65535';
  if (!f.smtpHost.trim()) e.smtpHost = 'Required';
  if (!(f.smtpPort >= 1 && f.smtpPort <= 65535)) e.smtpPort = '1–65535';
  if (!f.username.trim()) e.username = 'Required';
  if (requirePassword && !f.password) e.password = 'Required';
  return e;
}

/* ---------------------------------------------------------------------------
   Shared form body (create + edit)
--------------------------------------------------------------------------- */

function ServerForm({
  form,
  onChange,
  errors,
  lockAddress,
  passwordHint,
}: {
  form: ImapMailboxSettings;
  onChange: (patch: Partial<ImapMailboxSettings>) => void;
  errors: Partial<Record<keyof ImapMailboxSettings, string>>;
  lockAddress?: boolean;
  passwordHint?: string;
}) {
  const [preset, setPreset] = useState(detectPreset(form));
  useEffect(() => setPreset(detectPreset({ imapHost: form.imapHost, smtpHost: form.smtpHost })), [form.imapHost, form.smtpHost]);
  const applyPreset = (key: string) => {
    setPreset(key);
    const p = IMAP_PRESETS.find((x) => x.key === key);
    if (!p || key === 'custom') return;
    onChange({ imapHost: p.imapHost, imapPort: p.imapPort, imapSecure: p.imapSecure, smtpHost: p.smtpHost, smtpPort: p.smtpPort, smtpSecure: p.smtpSecure });
  };
  const current = IMAP_PRESETS.find((x) => x.key === preset);
  const portInput = (key: 'imapPort' | 'smtpPort') => (
    <Input type="number" min={1} max={65535} inputMode="numeric" className="font-mono" value={form[key]} invalid={Boolean(errors[key])} onChange={(e) => onChange({ [key]: Number(e.target.value) || 0 })} />
  );
  return (
    <div className="space-y-4">
      <Field label="Provider">
        <Select value={preset} onChange={(e) => applyPreset(e.target.value)}>
          {IMAP_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </Select>
      </Field>
      {current?.hint && <div className="-mt-2 text-xs text-ink-3">{current.hint}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email address" required error={errors.address}>
          <Input type="email" autoComplete="off" value={form.address} disabled={lockAddress} invalid={Boolean(errors.address)} placeholder="sales@yourcompany.com" onChange={(e) => onChange({ address: e.target.value, username: form.username || e.target.value })} />
        </Field>
        <Field label="Display name" required error={errors.displayName}>
          <Input value={form.displayName} invalid={Boolean(errors.displayName)} placeholder="Sales" onChange={(e) => onChange({ displayName: e.target.value })} />
        </Field>
      </div>

      <section className="rounded-card border border-line bg-surface-2/60 p-3.5">
        <div className="mb-2.5 flex items-center gap-2 text-2xs font-semibold uppercase text-ink-3"><Server size={12} /> Incoming (IMAP)</div>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Host" required error={errors.imapHost}><Input className="font-mono" value={form.imapHost} invalid={Boolean(errors.imapHost)} placeholder="imap.example.com" onChange={(e) => onChange({ imapHost: e.target.value.trim() })} /></Field>
          <Field label="Port" required error={errors.imapPort}>{portInput('imapPort')}</Field>
        </div>
        <Checkbox className="mt-1" checked={form.imapSecure} onChange={(e) => onChange({ imapSecure: e.target.checked })} label="Use TLS (recommended, port 993)" />
      </section>

      <section className="rounded-card border border-line bg-surface-2/60 p-3.5">
        <div className="mb-2.5 flex items-center gap-2 text-2xs font-semibold uppercase text-ink-3"><Send size={12} /> Outgoing (SMTP)</div>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Host" required error={errors.smtpHost}><Input className="font-mono" value={form.smtpHost} invalid={Boolean(errors.smtpHost)} placeholder="smtp.example.com" onChange={(e) => onChange({ smtpHost: e.target.value.trim() })} /></Field>
          <Field label="Port" required error={errors.smtpPort}>{portInput('smtpPort')}</Field>
        </div>
        <Checkbox className="mt-1" checked={form.smtpSecure} onChange={(e) => onChange({ smtpSecure: e.target.checked })} label="Implicit TLS (port 465). Untick for STARTTLS on 587." />
      </section>

      <section className="rounded-card border border-line bg-surface-2/60 p-3.5">
        <div className="mb-2.5 flex items-center gap-2 text-2xs font-semibold uppercase text-ink-3"><KeyRound size={12} /> Credentials</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username" required error={errors.username}><Input autoComplete="off" className="font-mono" value={form.username} invalid={Boolean(errors.username)} onChange={(e) => onChange({ username: e.target.value })} /></Field>
          <Field label="Password" required={!passwordHint} error={errors.password} hint={passwordHint}>
            <Input type="password" autoComplete="new-password" value={form.password} invalid={Boolean(errors.password)} placeholder={passwordHint ? '••••••••' : ''} onChange={(e) => onChange({ password: e.target.value })} />
          </Field>
        </div>
        <div className="mt-2 inline-flex items-center gap-1 text-xs text-ink-3"><ShieldCheck size={12} /> Stored encrypted on the server and never shown again. Prefer an app-specific password.</div>
      </section>
    </div>
  );
}

function TestResult({ result }: { result: ImapTestResult | null }) {
  if (!result) return null;
  const Row = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold', ok ? 'bg-green-soft text-green-text' : 'bg-red-soft text-red-text')}>
      {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {label} {ok ? 'ok' : 'failed'}
    </span>
  );
  return (
    <div className="rounded-card border border-line bg-surface-2/60 p-3">
      <div className="flex flex-wrap items-center gap-2"><Row ok={result.imap} label="IMAP" /><Row ok={result.smtp} label="SMTP" /></div>
      {result.error && <div className="mt-2 break-words font-mono text-xs text-red-text">{result.error}</div>}
      {result.imap && result.smtp && <div className="mt-2 text-xs text-ink-2">Both servers accepted the credentials. You can save the mailbox now.</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Connect modal (create)
--------------------------------------------------------------------------- */

export function ImapConnectModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (m: Mailbox) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<ImapMailboxSettings>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof ImapMailboxSettings, string>>>({});
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ImapTestResult | null>(null);
  const [testedFor, setTestedFor] = useState<string | null>(null);
  const create = useCreateImapMailbox();

  useEffect(() => {
    if (open) { setForm(EMPTY); setErrors({}); setResult(null); setTestedFor(null); }
  }, [open]);

  const fingerprint = JSON.stringify(form);
  const passed = Boolean(result?.imap && result?.smtp) && testedFor === fingerprint;
  const onChange = (patch: Partial<ImapMailboxSettings>) => { setForm((f) => ({ ...f, ...patch })); setErrors({}); };

  const test = async () => {
    const e = validate(form, true);
    setErrors(e);
    if (Object.keys(e).length) return;
    setTesting(true);
    setResult(null);
    try {
      const r = await testImapMailbox(form);
      setResult(r);
      setTestedFor(fingerprint);
    } catch (err) {
      setResult({ imap: false, smtp: false, error: (err as Error).message });
      setTestedFor(fingerprint);
    } finally {
      setTesting(false);
    }
  };

  const save = () =>
    create.mutate(form, {
      onSuccess: (m) => { toast.push('success', `${form.address} connected`); onCreated(m); onClose(); },
      onError: (err) => toast.push('error', (err as Error).message),
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Plug size={16} /> Connect IMAP / SMTP mailbox</span>}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={test} loading={testing} disabled={create.isPending}>Test connection</Button>
          <Button variant="primary" onClick={save} disabled={!passed || testing} loading={create.isPending}>Save mailbox</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Banner tone="blue">Works with Hostinger, GoDaddy, Microsoft 365, Zoho Mail and any other IMAP provider. Messages sync every few minutes; sending goes through the provider&apos;s SMTP server.</Banner>
        <ServerForm form={form} onChange={onChange} errors={errors} />
        <TestResult result={result} />
        {!passed && result && (result.imap && result.smtp) && <div className="text-xs text-amber-text">Settings changed since the last test. Test again before saving.</div>}
        {!result && <div className="text-xs text-ink-3">Save is enabled after a successful connection test.</div>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------------
   Settings drawer (edit existing IMAP mailbox)
--------------------------------------------------------------------------- */

export function ImapSettingsDrawer({ mailbox, onClose, onSaved }: { mailbox: Mailbox | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<ImapMailboxSettings>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof ImapMailboxSettings, string>>>({});
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ImapTestResult | null>(null);
  const update = useUpdateImapMailbox(mailbox?.id ?? null);

  useEffect(() => {
    if (!mailbox) return;
    setForm({
      address: mailbox.address,
      displayName: mailbox.displayName,
      imapHost: mailbox.imapHost ?? '',
      imapPort: mailbox.imapPort ?? 993,
      imapSecure: mailbox.imapSecure ?? true,
      smtpHost: mailbox.smtpHost ?? '',
      smtpPort: mailbox.smtpPort ?? 465,
      smtpSecure: mailbox.smtpSecure ?? true,
      username: mailbox.username ?? mailbox.address,
      password: '',
    });
    setErrors({});
    setResult(null);
  }, [mailbox]);

  const onChange = (patch: Partial<ImapMailboxSettings>) => { setForm((f) => ({ ...f, ...patch })); setErrors({}); setResult(null); };

  // The stored password is never returned, so a test without a new password is impossible client-side;
  // the server test endpoint needs the password. We only offer the test when a new password is typed.
  const test = async () => {
    const e = validate(form, true);
    setErrors(e);
    if (Object.keys(e).length) return;
    setTesting(true);
    try {
      setResult(await testImapMailbox(form));
    } catch (err) {
      setResult({ imap: false, smtp: false, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    const e = validate(form, false);
    setErrors(e);
    if (Object.keys(e).length) return;
    const { address, password, ...rest } = form;
    void address; // immutable after creation (UpdateImapMailboxSchema omits it)
    update.mutate(password ? { ...rest, password } : rest, {
      onSuccess: () => { toast.push('success', 'Mailbox settings saved'); onSaved(); onClose(); },
      onError: (err) => toast.push('error', (err as Error).message),
    });
  };

  return (
    <Drawer
      open={Boolean(mailbox)}
      onClose={onClose}
      title={mailbox ? `${mailbox.displayName} · server settings` : ''}
      subtitle={mailbox?.address}
      width={640}
      actions={
        <>
          <Button onClick={test} loading={testing} disabled={!form.password} title={form.password ? undefined : 'Enter the password to run a test'}>Test connection</Button>
          <Button variant="primary" onClick={save} loading={update.isPending} disabled={testing}>Save</Button>
        </>
      }
    >
      {mailbox && (
        <div className="space-y-4 p-5">
          <ServerForm form={form} onChange={onChange} errors={errors} lockAddress passwordHint="Leave empty to keep the stored password" />
          <TestResult result={result} />
        </div>
      )}
    </Drawer>
  );
}
