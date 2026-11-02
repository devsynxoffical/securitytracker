'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Lock, Server, ShieldCheck, Copy, Check, ArrowLeft, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
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

/** Admin login (A01/A02): credentials → TOTP verify, or TOTP enrolment on first login (FR-AUTH-07). */
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

  const subtitle = view.step === 'credentials' ? 'Sign in with your company account' : view.step === 'verify' ? 'Two-factor verification' : 'Set up two-factor authentication';

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-pri font-mono text-base font-semibold text-white shadow-card">OS</span>
          <h1 className="text-xl font-semibold text-ink">Company OS</h1>
          <p className="mt-0.5 text-sm text-ink-3">Admin Panel · {subtitle}</p>
        </div>

        <div className="fade-in rounded-modal border border-line bg-surface p-7 shadow-pop">
          {error && (
            <div className="mb-4">
              <Banner tone="red">{error}</Banner>
            </div>
          )}

          {view.step === 'credentials' && (
            <form onSubmit={submit} className="space-y-3.5">
              <Field label="Email" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus placeholder="you@company.com" />
              </Field>
              <Field label="Password" required>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </Field>
              <Button type="submit" variant="primary" size="lg" className="mt-1 w-full justify-center" loading={busy} icon={<Lock size={14} />}>
                Continue
              </Button>
              <button type="button" onClick={() => setShowApi((v) => !v)} className="flex w-full items-center justify-center gap-1 pt-1 text-xs text-ink-3 hover:text-ink" aria-expanded={showApi}>
                <Server size={11} /> Advanced <ChevronDown size={11} className={clsx('transition-transform', showApi && 'rotate-180')} />
              </button>
              {showApi && (
                <div className="pop-in rounded-card border border-line bg-surface-2 p-3">
                  <Field label="API server" hint="Only change this if your administrator told you to.">
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
                  </Field>
                </div>
              )}
            </form>
          )}

          {view.step === 'verify' && <VerifyStep tempToken={view.tempToken} onBack={back} onError={setError} />}
          {view.step === 'enroll' && <EnrollStep tempToken={view.tempToken} onBack={back} onError={setError} />}
        </div>
        <p className="mt-4 text-center text-xs text-ink-3">Protected by mandatory two-factor authentication. Sessions expire after 12 hours.</p>
      </div>
    </div>
  );
}

/** Six separate boxes that behave as one 6-digit field; the submitted value is the joined string. */
function CodeInput({ value, onChange, onComplete }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');
  const setAt = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    const joined = next.join('').replace(/\D/g, '').slice(0, 6);
    onChange(joined);
    if (d && i < 5) refs.current[i + 1]?.focus();
    if (joined.length === 6 && onComplete) onComplete(joined);
  };
  const paste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text) {
      e.preventDefault();
      onChange(text);
      refs.current[Math.min(5, text.length - 1)]?.focus();
      if (text.length === 6 && onComplete) onComplete(text);
    }
  };
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-ink-2">Authenticator code</div>
      <div className="flex justify-between gap-2" onPaste={paste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={d}
            autoFocus={i === 0}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => setAt(i, e.target.value.replace(/\D/g, '').slice(-1))}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus();
              if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
              if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
            }}
            className={clsx('h-12 w-11 rounded-lg border bg-surface text-center font-mono text-xl font-semibold text-ink focus:border-pri focus:outline-none', d ? 'border-pri' : 'border-line')}
          />
        ))}
      </div>
      <div className="mt-1 text-xs text-ink-3">6 digits from your authenticator app</div>
    </div>
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
  const run = async (value: string) => {
    onError(null);
    setBusy(true);
    try {
      await verifyTwoFactor(tempToken, value);
    } catch (err) {
      onError(messageOf(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await run(code);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-base text-ink-2">Admin Panel access requires two-factor authentication. Enter the code from your authenticator app.</p>
      <CodeInput value={code} onChange={setCode} onComplete={(v) => !busy && void run(v)} />
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

  const run = async (value: string) => {
    if (!setup) return;
    onError(null);
    setBusy(true);
    try {
      await confirmEnrollment(setup.tempToken, value);
    } catch (err) {
      onError(messageOf(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await run(code);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-base text-ink-2">Your account must use two-factor authentication before it can open the Admin Panel. Add it to your authenticator app, then confirm with a code.</p>
      {loading && <div className="h-24 animate-pulse rounded-card bg-gray-soft" />}
      {setup && (
        <div className="space-y-3 rounded-card border border-line bg-surface-2 p-3.5">
          <Labelled label="Step 1 · Secret key (manual entry)">
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-md bg-surface px-2 py-1.5 font-mono text-base tracking-wider text-ink">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
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
          <p className="text-xs text-ink-3">Time-based (TOTP), 6 digits, 30 seconds. Store the secret safely; it is shown only once.</p>
        </div>
      )}
      <Labelled label="Step 2 · Confirm">
        <CodeInput value={code} onChange={setCode} onComplete={(v) => !busy && setup && void run(v)} />
      </Labelled>
      <StepFooter busy={busy} label="Confirm and sign in" onBack={onBack} disabled={!setup || code.length !== 6} />
    </form>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-2xs font-semibold uppercase text-ink-3">{label}</div>
      {children}
    </div>
  );
}
