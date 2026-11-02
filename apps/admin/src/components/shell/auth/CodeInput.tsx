'use client';

import { useRef } from 'react';
import { clsx } from 'clsx';

/** Six separate boxes that behave as one 6-digit field; the submitted value is the joined string. */
export function CodeInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; disabled?: boolean }) {
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
      <div className="mb-1.5 text-xs font-semibold text-ink-2">Authenticator code</div>
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
            disabled={disabled}
            autoFocus={i === 0}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => setAt(i, e.target.value.replace(/\D/g, '').slice(-1))}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus();
              if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
              if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
            }}
            className={clsx('h-12 w-full max-w-[52px] rounded-lg border bg-surface text-center font-mono text-xl font-semibold text-ink transition focus:border-pri focus:outline-none disabled:opacity-50', d ? 'border-pri' : 'border-line')}
          />
        ))}
      </div>
      <div className="mt-1.5 text-xs text-ink-3">6 digits from your authenticator app. Codes change every 30 seconds.</div>
    </div>
  );
}
