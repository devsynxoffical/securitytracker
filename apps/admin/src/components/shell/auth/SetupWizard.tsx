'use client';

import { useState, type FormEvent } from 'react';
import { Building2, UserRound, CheckCircle2, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Button, Field, Input, Select, Banner } from '@/components/ui';
import { AuthHeading } from './AuthLayout';
import { PasswordStrength, passwordScore } from './PasswordStrength';

const TIMEZONES = ['UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Madrid', 'Europe/Istanbul', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Singapore', 'Asia/Manila', 'Asia/Tokyo', 'Australia/Sydney', 'America/Sao_Paulo', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];

type Step = 0 | 1 | 2;

/** F29 - Create the first workspace: Company -> Your account -> Done. */
export function SetupWizard({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const { bootstrap } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [companyName, setCompanyName] = useState('');
  const [timezone, setTimezone] = useState(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return TIMEZONES.includes(tz) ? tz : 'UTC';
    } catch {
      return 'UTC';
    }
  });
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStep(1);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    if (passwordScore(password).score < 2) {
      setError('Choose a stronger password: at least 10 characters with letters and numbers.');
      return;
    }
    setBusy(true);
    try {
      await bootstrap({ companyName: companyName.trim(), timezone, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), password });
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Stepper step={step} />
      {error && (
        <div className="mb-4">
          <Banner tone="red">{error}</Banner>
        </div>
      )}

      {step === 0 && (
        <form onSubmit={next} className="space-y-4">
          <AuthHeading title="Create your workspace" subtitle="This deployment has no company yet. Set it up in two short steps." />
          <Field label="Company name" required>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Roofing Inc." required autoFocus minLength={2} />
          </Field>
          <Field label="Company time zone" hint="Attendance dates and target periods follow this zone.">
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center justify-between pt-2">
            {onCancel ? (
              <button type="button" onClick={onCancel} className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
                <ArrowLeft size={12} /> Back to sign in
              </button>
            ) : (
              <span />
            )}
            <Button type="submit" variant="primary" size="lg" icon={<ArrowRight size={14} />} disabled={companyName.trim().length < 2}>
              Continue
            </Button>
          </div>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={submit} className="space-y-4">
          <AuthHeading title="Your administrator account" subtitle="You become the Super Admin. Two-factor authentication is set up on your first sign-in." />
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" required>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus autoComplete="given-name" />
            </Field>
            <Field label="Last name" required>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required autoComplete="family-name" />
            </Field>
          </div>
          <Field label="Work email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@company.com" />
          </Field>
          <Field label="Password" required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" />
            <PasswordStrength password={password} />
          </Field>
          <Field label="Confirm password" required error={confirm && confirm !== password ? 'Passwords do not match' : undefined}>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10} autoComplete="new-password" invalid={Boolean(confirm) && confirm !== password} />
          </Field>
          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={() => setStep(0)} className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink" disabled={busy}>
              <ArrowLeft size={12} /> Company
            </button>
            <Button type="submit" variant="primary" size="lg" loading={busy} icon={<Sparkles size={14} />} disabled={!firstName || !lastName || !email || password.length < 10 || confirm !== password}>
              Create workspace
            </Button>
          </div>
        </form>
      )}

      {step === 2 && (
        <div className="space-y-5 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-soft text-green">
            <CheckCircle2 size={28} />
          </span>
          <AuthHeading title={`${companyName.trim()} is ready`} subtitle="Default roles, pipelines, leave types and templates were created. Sign in to enrol your authenticator and open the Admin Panel." />
          <Button variant="primary" size="lg" className="w-full justify-center" onClick={onDone} icon={<ArrowRight size={14} />}>
            Sign in as {email.trim().toLowerCase()}
          </Button>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps = [
    { label: 'Company', icon: <Building2 size={13} /> },
    { label: 'Your account', icon: <UserRound size={13} /> },
    { label: 'Done', icon: <CheckCircle2 size={13} /> },
  ];
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Setup progress">
      {steps.map((s, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'todo';
        return (
          <li key={s.label} className="flex flex-1 items-center gap-2">
            <span
              className={clsx(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold normal-case tracking-normal',
                state === 'done' ? 'bg-green text-white' : state === 'current' ? 'bg-pri text-white' : 'bg-gray-soft text-ink-3',
              )}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {state === 'done' ? <CheckCircle2 size={13} /> : i + 1}
            </span>
            <span className={clsx('truncate text-xs font-semibold', state === 'todo' ? 'text-ink-3' : 'text-ink')}>{s.label}</span>
            {i < steps.length - 1 && <span className={clsx('h-px flex-1', i < step ? 'bg-green' : 'bg-line')} />}
          </li>
        );
      })}
    </ol>
  );
}
