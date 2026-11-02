'use client';

import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Lock, Server, ShieldCheck, Copy, Check, ArrowLeft, ChevronDown, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth, type LoginStep } from '@/lib/auth';
import { getApiBaseUrl, setApiBaseUrl, ApiError } from '@/lib/api';
import { Button, Field, Input, Banner } from '@/components/ui';
import { AuthLayout, AuthHeading } from './auth/AuthLayout';
import { CodeInput } from './auth/CodeInput';
import { SetupWizard } from './auth/SetupWizard';
import { ForgotPasswordForm, ResetPasswordForm } from './auth/PasswordReset';

type View =
  | { step: 'credentials' }
  | { step: 'verify'; tempToken: string }
  | { step: 'enroll'; tempToken: string }
  | { step: 'forgot' }
  | { step: 'setup' };

function messageOf(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_TWO_FACTOR_CODE') return 'That code is not valid. Codes change every 30 seconds; try the current one.';
    if (err.code === 'INVALID_CREDENTIALS') return 'Email or password is incorrect.';
    if (err.code === 'ACCOUNT_LOCKED') return 'Too many attempts. The account is locked for 15 minutes.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Could not reach the server.';
}

/**
 * Admin authentication (A01/A02, F3, F29, F30): credentials -> TOTP verify, or TOTP enrolment on
 * the first sign-in; forgot password; first-run workspace setup when the deployment is empty.
 */
export function LoginScreen() {
  const pathname = usePathname() ?? '';
  if (pathname === '/admin/reset') {
    return (
      <Suspense fallback={null}>
        <ResetFromLink />
      </Suspense>
    );
  }
  return <SignIn />;
}

/** /admin/reset?token=... reached while signed out (F30). */
function ResetFromLink() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params?.get('token') ?? '';
  const goLogin = () => router.replace('/admin');
  return (
    <AuthLayout footer={<>Reset links work once and expire after 30 minutes.</>}>
      {token ? (
        <ResetPasswordForm token={token} onDone={goLogin} />
      ) : (
        <div className="space-y-4">
          <AuthHeading title="Reset link missing" subtitle="Open the link from your email, or request a new one from the sign-in page." />
          <Button variant="primary" className="w-full justify-center" onClick={goLogin}>
            Back to sign in
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}

function SignIn() {
  const { login, needsSetup } = useAuth();
  const [view, setView] = useState<View>({ step: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());

  // Empty deployment: go straight to the setup wizard (F29).
  useEffect(() => {
    if (needsSetup === true) setView((v) => (v.step === 'credentials' ? { step: 'setup' } : v));
  }, [needsSetup]);

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

  const footer =
    view.step === 'setup' ? (
      <>Only the first administrator is created here. Employees are added from the Admin Panel.</>
    ) : (
      <>Protected by mandatory two-factor authentication. Sessions expire after 12 hours.</>
    );

  return (
    <AuthLayout footer={footer} width={view.step === 'setup' ? 460 : 420}>
      {error && view.step !== 'forgot' && (
        <div className="mb-4">
          <Banner tone="red">{error}</Banner>
        </div>
      )}

      {view.step === 'credentials' && (
        <form onSubmit={submit} className="space-y-4">
          <AuthHeading title="Welcome back" subtitle="Sign in to the Admin Panel with your company account." />
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus placeholder="you@company.com" />
          </Field>
          <Field label="Password" required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => { setError(null); setView({ step: 'forgot' }); }} className="text-xs font-medium text-pri hover:underline">
              Forgot password?
            </button>
            {needsSetup && (
              <button type="button" onClick={() => setView({ step: 'setup' })} className="inline-flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink">
                <Sparkles size={11} /> Set up a new workspace
              </button>
            )}
          </div>
          <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={busy} icon={<Lock size={14} />}>
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
      {view.step === 'forgot' && <ForgotPasswordForm initialEmail={email} onBack={back} />}
      {view.step === 'setup' && (
        <SetupWizard
          onDone={() => {
            setView({ step: 'credentials' });
            setPassword('');
          }}
          onCancel={needsSetup ? undefined : back}
        />
      )}
    </AuthLayout>
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
      <AuthHeading title="Two-factor verification" subtitle="Enter the code from your authenticator app to finish signing in." />
      <CodeInput value={code} onChange={setCode} onComplete={(v) => !busy && void run(v)} disabled={busy} />
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
      <AuthHeading title="Set up two-factor authentication" subtitle="Your account must use an authenticator app before it can open the Admin Panel. Add it, then confirm with a code." />
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
        <CodeInput value={code} onChange={setCode} onComplete={(v) => !busy && setup && void run(v)} disabled={busy || !setup} />
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
