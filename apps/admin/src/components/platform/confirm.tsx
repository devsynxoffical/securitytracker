'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Modal } from '@/components/ui';

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Pending = { opts: ConfirmOptions; resolve: (ok: boolean) => void };
let listener: ((p: Pending) => void) | null = null;

/**
 * Promise-based confirmation replacing window.confirm (DESIGN-SYSTEM section 5: modals, never
 * browser dialogs). Render `<ConfirmHost />` once per page, then anywhere in that page:
 *   if (await confirmDialog({ title: 'Delete deal?', danger: true })) mutate();
 * Resolves false when no host is mounted so a missing host can never silently approve.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(false);
      return;
    }
    listener({ opts, resolve });
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    listener = (p) => setPending(p);
    return () => {
      listener = null;
    };
  }, []);
  if (!pending) return null;
  const { opts } = pending;
  const settle = (ok: boolean) => {
    pending.resolve(ok);
    setPending(null);
  };
  return (
    <Modal
      open
      onClose={() => settle(false)}
      title={opts.title}
      width={440}
      footer={
        <>
          <Button onClick={() => settle(false)}>{opts.cancelLabel ?? 'Cancel'}</Button>
          <Button variant={opts.danger ? 'danger' : 'primary'} onClick={() => settle(true)} autoFocus>
            {opts.confirmLabel ?? (opts.danger ? 'Delete' : 'Confirm')}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3 text-base text-ink-2">
        {opts.danger && (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-soft text-red">
            <AlertTriangle size={14} />
          </span>
        )}
        <div>{opts.body ?? 'This action cannot be undone.'}</div>
      </div>
    </Modal>
  );
}
