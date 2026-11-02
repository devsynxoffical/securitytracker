'use client';

import { clsx } from 'clsx';

export function passwordScore(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; hints: string[] } {
  const hints: string[] = [];
  let score = 0;
  if (pw.length >= 10) score += 1;
  else hints.push('at least 10 characters');
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  else hints.push('upper and lower case');
  if (/\d/.test(pw)) score += 1;
  else hints.push('a number');
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  else hints.push('a symbol');
  if (pw.length >= 14 && score === 4) score = 4;
  const label = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score] ?? 'Weak';
  return { score: score as 0 | 1 | 2 | 3 | 4, label, hints };
}

/** Four-segment strength meter with the missing requirements listed (never blocks on its own; the API enforces min 10). */
export function PasswordStrength({ password }: { password: string }) {
  const { score, label, hints } = passwordScore(password);
  const colour = ['bg-gray-bar', 'bg-red', 'bg-amber-bar', 'bg-pri', 'bg-green'][score];
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={clsx('h-1 flex-1 rounded-full transition-colors', i < score ? colour : 'bg-gray-soft')} />
        ))}
      </div>
      <div className="mt-1 flex items-baseline justify-between text-xs">
        <span className={clsx('font-semibold', score >= 3 ? 'text-green-text' : score === 2 ? 'text-amber-text' : 'text-ink-3')}>{password ? label : 'Choose a strong password'}</span>
        {password && hints.length > 0 && <span className="text-ink-3">Add {hints.join(', ')}</span>}
      </div>
    </div>
  );
}
