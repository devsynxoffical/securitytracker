'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Lock, Server, ShieldCheck, Copy, Check, ArrowLeft } from 'lucide-react';
import { useAuth, type LoginStep } from '@/lib/auth';
import { getApiBaseUrl, setApiBaseUrl, ApiError } from '@/lib/api';
import { Button, Field, Input, Banner } from '@/components/ui';

type View = { step: 'credentials' } | { step: 'verify'; tempToken: string } | { step: 'enroll'; tempToken: string };

function messageOf(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_TWO_FACTOR_CODE') return 'That code is not valid. Codes change every 30 seconds; try the current one.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Could not reach the server.';
}

export function LoginScreen() {
  const { login } = useAuth();
  const [view, setView] = useState<View>({ step: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const step: LoginStep = await login(email.trim().toLowerCase(), password);
      if (step.kind === 'requires2fa') setView({ step: 'verify', tempToken: step.tempToken });
      else if (step.kind === 'enroll') setView({ step: 'enroll', tempToken: step.tempToken });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setView({ step: 'credentials' });
    setPassword('');
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-modal border border-line bg-surface p-7 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pri font-mono text-sm font-semibold text-white">OS</span>
          <div>
            <h1 className="text-[17px] font-semibold text-ink">Company OS Admin</h1>
            <p className="text-xs text-ink-3">{view.step === 'credentials' ? 'Sign in with your company account' : view.step === 'verify' ? 'Two-factor verification' : 'Set up two-factor authentication'}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4">
            <Banner tone="red">{error}</Banner>
          </div>
        )}

        {view.step === 'credentials' && (
          <form onSubmit={submit} className="space-y-3">
            <Field label="Email" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
            </Field>
            <Field label="Password" required>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
            <Button type="submit" variant="primary" size="lg" className="mt-2 w-full justify-center" loading={busy} icon={<Lock size={14} />}>
              Continue
            </Button>
            <button type="button" onClick={() => setShowApi((v) => !v)} className="mt-2 flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink">
              <Server size={12} /> API server
            </button>
            {showApi && (
              <div className="flex gap-2">
                <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.example.com/api/v1" className="font-mono text-xs" />
                <Button
                  size="sm"
                  onClick={() => {
                    setApiBaseUrl(apiUrl.trim() || null);
                    setApiUrl(getApiBaseUrl());
                  }}
                >
                  Save
                </Button>
              </div>
            )}
          </form>
        )}

        {view.step === 'verify' && <VerifyStep tempToken={view.tempToken} onBack={back} onError={setError} />}
        {view.step === 'enroll' && <EnrollStep tempToken={view.tempToken} onBack={back} onError={setError} />}
      </div>
    </div>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Authenticator code" hint="6-digit code from your authenticator app" required>
      <Input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} required autoFocus className="text-center font-mono text-lg tracking-[0.4em]" />
    </Field>
  );
}

function StepFooter({ busy, label, onBack, disabled }: { busy: boolean; label: string; onBack: () => void; disabled: boolean }) {
  return (
    <>
      <Button type="submit" variant="primary" size="lg" className="mt-2 w-full justify-center" loading={busy} disabled={disabled} icon={<ShieldCheck size={14} />}>
        {label}
      </Button>
      <button type="button" onClick={onBack} className="mt-3 flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft size={12} /> Use a different account
      </button>
    </>
  );
}

function VerifyStep({ tempToken, onBack, onError }: { tempToken: string; onBack: () => void; onError: (m: string | null) => void }) {
  const { verifyTwoFactor } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    onError(null);
    setBusy(true);
    try {
      await verifyTwoFactor(tempToken, code);
    } catch (err) {
      onError(messageOf(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-[13px] text-ink-2">Admin Panel access requires two-factor authentication. Enter the code from your authenticator app.</p>
      <CodeInput value={code} onChange={setCode} />
      <StepFooter busy={busy} label="Verify and sign in" onBack={onBack} disabled={code.length !== 6} />
    </form>
  );
}

function EnrollStep({ tempToken, onBack, onError }: { tempToken: string; onBack: () => void; onError: (m: string | null) => void }) {
  const { startEnrollment, confirmEnrollment } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; tempToken: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    startEnrollment(tempToken)
      .then((s) => !cancelled && setSetup(s))
      .catch((err) => !cancelled && onError(messageOf(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tempToken, startEnrollment, onError]);

  const copy = async () => {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!setup) return;
    onError(null);
    setBusy(true);
    try {
      await confirmEnrollment(setup.tempToken, code);
    } catch (err) {
      onError(messageOf(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-[13px] text-ink-2">Your account must use two-factor authentication before it can open the Admin Panel. Add it to your authenticator app, then confirm with a code.</p>
      {loading && <div className="h-20 animate-pulse rounded-lg bg-gray-soft" />}
      {setup && (
        <div className="space-y-2 rounded-card border border-line bg-surface-2 p-3">
          <Labelled label="Secret key (manual entry)">
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all font-mono text-[13px] text-ink">{setup.secret}</code>
              <Button size="sm" onClick={copy} icon={copied ? <Check size={12} /> : <Copy size={12} />}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </Labelled>
          <Labelled label="Or open in your authenticator">
            <a href={setup.otpauthUrl} className="break-all font-mono text-xs text-pri hover:underline">
              {setup.otpauthUrl}
            </a>
          </Labelled>
          <p className="text-[11px] text-ink-3">Time-based (TOTP), 6 digits, 30 seconds. Store the secret safely; it is shown only once.</p>
        </div>
      )}
      <CodeInput value={code} onChange={setCode} />
      <StepFooter busy={busy} label="Confirm and sign in" onBack={onBack} disabled={!setup || code.length !== 6} />
    </form>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</div>
      {children}
    </div>
  );
}
