'use client';

import { useState, type FormEvent } from 'react';
import { ArrowLeft, Mail, KeyRound, CheckCircle2, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Button, Field, Input, Banner } from '@/components/ui';
import { AuthHeading } from './AuthLayout';
import { PasswordStrength, passwordScore } from './PasswordStrength';

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not reach the server.';
}

/** F30 step 1: request a reset link. Always shows success so addresses cannot be enumerated. */
export function ForgotPasswordForm({ initialEmail, onBack }: { initialEmail?: string; onBack: () => void }) {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState(initialEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ devResetUrl?: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setSent(await forgotPassword(email.trim().toLowerCase()));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-soft text-green">
          <CheckCircle2 size={24} />
        </span>
        <AuthHeading title="Check your inbox" subtitle={<>If an account exists for <span className="font-semibold text-ink">{email.trim().toLowerCase()}</span>, a reset link is on its way. It works once and expires in 30 minutes.</>} />
        {sent.devResetUrl && (
          <Banner tone="amber">
            <span>
              Development mode: no mailer is configured.{' '}
              <a href={sent.devResetUrl} className="inline-flex items-center gap-1 font-semibold underline">
                Open the reset link <ExternalLink size={11} />
              </a>
            </span>
          </Banner>
        )}
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
          <ArrowLeft size={12} /> Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <AuthHeading title="Reset your password" subtitle="Enter the email you sign in with and we will send a single-use reset link." />
      {error && <Banner tone="red">{error}</Banner>}
      <Field label="Email" required>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" placeholder="you@company.com" />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={busy} icon={<Mail size={14} />}>
        Send reset link
      </Button>
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft size={12} /> Back to sign in
      </button>
    </form>
  );
}

/** F30 step 2: set a new password with the token from the link. */
export function ResetPasswordForm({ token, onDone }: { token: string; onDone: () => void }) {
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-soft text-green">
          <CheckCircle2 size={24} />
        </span>
        <AuthHeading title="Password updated" subtitle="Every previous session was signed out. Sign in with your new password and your authenticator code." />
        <Button variant="primary" size="lg" className="w-full justify-center" onClick={onDone}>
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <AuthHeading title="Choose a new password" subtitle="This link works once. Your two-factor settings stay as they are." />
      {error && <Banner tone="red">{error}</Banner>}
      <Field label="New password" required>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoFocus autoComplete="new-password" />
        <PasswordStrength password={password} />
      </Field>
      <Field label="Confirm new password" required error={confirm && confirm !== password ? 'Passwords do not match' : undefined}>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10} autoComplete="new-password" invalid={Boolean(confirm) && confirm !== password} />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={busy} icon={<KeyRound size={14} />} disabled={password.length < 10 || confirm !== password}>
        Update password
      </Button>
    </form>
  );
}
