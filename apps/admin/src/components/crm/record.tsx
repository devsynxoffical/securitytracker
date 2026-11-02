'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';
import { http } from '@/lib/api';
import { useToast, Badge, Button, Skeleton, EmptyState, ErrorBanner } from '@/components/ui';
import { RecordLayout, RecordHeader, Section, PropertyList, type PropertyDef } from '@/components/ui/advanced';
import { useCustomFields, useRecordThreads, useCrmMutation, type EntityType, type CustomFieldDef } from '@/lib/queries/crm';
import { ActivityTimeline } from './shared';
import { relative, dateTime } from '@/lib/format';

/**
 * Full-width record page (HubSpot-style three columns). Rendered in place of the list when `?id=` is set,
 * so deep links from the command palette keep working. Esc returns to the list unless a dialog is open.
 */
export function RecordPage({ onBack, header, left, main, right, loading, error, onRetry }: { onBack: () => void; header: ReactNode; left: ReactNode; main: ReactNode; right?: ReactNode; loading?: boolean; error?: string | null; onRetry?: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]')) return;
      onBack();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onBack]);

  return (
    <div className="fade-in -mx-[22px] -my-5 flex h-[calc(100vh-56px)] flex-col">
      {error && <div className="p-4"><ErrorBanner message={error} onRetry={onRetry} /></div>}
      {loading && !error && (
        <div className="space-y-3 p-6">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <div className="grid grid-cols-[300px_1fr_300px] gap-4 pt-4">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      )}
      {!loading && !error && (
        <RecordLayout
          header={
            <div>
              <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink">
                <ArrowLeft size={12} /> Back to list <span className="ml-1 rounded border border-line bg-surface-2 px-1 font-mono text-[10px]">Esc</span>
              </button>
              {header}
            </div>
          }
          left={left}
          main={main}
          right={right}
        />
      )}
    </div>
  );
}

export { RecordHeader, Section };

/** Stat strip for the top of the Overview tab. */
export function KpiStrip({ items }: { items: Array<{ label: string; value: ReactNode; hint?: ReactNode; tone?: 'green' | 'amber' | 'red' | 'primary' }> }) {
  const tone = { green: 'text-green-text', amber: 'text-amber-text', red: 'text-red-text', primary: 'text-pri-2' };
  return (
    <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(4, items.length)}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <div key={it.label} className="rounded-card border border-line bg-surface p-3 shadow-card">
          <div className="text-2xs font-semibold uppercase text-ink-3">{it.label}</div>
          <div className={clsx('mt-1 font-mono text-xl font-semibold text-ink', it.tone && tone[it.tone])}>{it.value}</div>
          {it.hint && <div className="mt-0.5 text-xs text-ink-3">{it.hint}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * Builds PropertyDefs for a record's custom fields and handles inline saves through PATCH {customFields}.
 * Checkbox and multi-select stay read-only inline (edited through the form modal).
 */
export function customProperties(defs: CustomFieldDef[] | undefined, values: Record<string, unknown>, editable: boolean): PropertyDef[] {
  return (defs ?? []).map((d) => {
    const raw = values?.[d.key];
    const display = raw === undefined || raw === null || raw === '' ? null : Array.isArray(raw) ? (raw as string[]).join(', ') : typeof raw === 'boolean' ? (raw ? 'Yes' : 'No') : String(raw);
    const type: PropertyDef['type'] = d.type === 'number' ? 'number' : d.type === 'date' ? 'date' : d.type === 'select' ? 'select' : 'text';
    const inlineOk = editable && d.type !== 'checkbox' && d.type !== 'multi_select';
    return {
      key: `custom.${d.key}`,
      label: d.label,
      value: display,
      raw: display ?? '',
      type,
      options: d.type === 'select' ? d.options.map((o) => ({ value: o, label: o })) : undefined,
      editable: inlineOk,
      mono: d.type === 'number' || d.type === 'phone',
    };
  });
}

/** Coerces an inline-edited custom field string back to the field's type. */
export function coerceCustom(defs: CustomFieldDef[] | undefined, key: string, value: string): unknown {
  const d = defs?.find((x) => x.key === key);
  if (!d) return value;
  if (value === '') return null;
  if (d.type === 'number') return Number(value);
  return value;
}

/** Property list wired to a PATCH endpoint; `map` turns (key, string) into the request body. */
export function EditableProperties({ entityType, patchPath, properties, custom, canEdit, invalidate, map }: {
  entityType: EntityType;
  patchPath: string;
  properties: PropertyDef[];
  custom: Record<string, unknown>;
  canEdit: boolean;
  invalidate: ReadonlyArray<readonly unknown[]>;
  map: (key: string, value: string) => Record<string, unknown> | null;
}) {
  const toast = useToast();
  const defs = useCustomFields(entityType);
  const save = useCrmMutation((body: Record<string, unknown>) => http.patch(patchPath, body), invalidate);
  const all = [...properties, ...customProperties(defs.data, custom, canEdit)];
  const onSave = async (key: string, value: string) => {
    let body: Record<string, unknown> | null;
    if (key.startsWith('custom.')) body = { customFields: { [key.slice(7)]: coerceCustom(defs.data, key.slice(7), value) } };
    else body = map(key, value);
    if (!body) return;
    try {
      await save.mutateAsync(body);
      toast.push('success', 'Saved');
    } catch (e) {
      toast.push('error', (e as Error).message);
      throw e;
    }
  };
  return (
    <>
      <Section title="About">
        <PropertyList properties={all.filter((p) => !p.key.startsWith('custom.'))} onSave={canEdit ? onSave : undefined} />
      </Section>
      {all.some((p) => p.key.startsWith('custom.')) && (
        <Section title="Custom fields" collapsible>
          <PropertyList properties={all.filter((p) => p.key.startsWith('custom.'))} onSave={canEdit ? onSave : undefined} />
        </Section>
      )}
    </>
  );
}

export function ActivitiesTab({ entityType, entityId, canEdit }: { entityType: EntityType; entityId: string; canEdit: boolean }) {
  return <ActivityTimeline entityType={entityType} entityId={entityId} canEdit={canEdit} />;
}

export function NotesTab({ entityType, entityId, canEdit }: { entityType: EntityType; entityId: string; canEdit: boolean }) {
  return <ActivityTimeline entityType={entityType} entityId={entityId} canEdit={canEdit} onlyType="note" />;
}

/** Threads linked to a contact or deal (17 FR-MAIL-17). */
export function EmailsTab({ entityType, entityId }: { entityType: 'contact' | 'deal'; entityId: string }) {
  const q = useRecordThreads(entityType, entityId);
  if (q.isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>;
  if (q.isError) return <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const threads = q.data ?? [];
  if (threads.length === 0) return <EmptyState icon={<Mail size={26} strokeWidth={1.75} />} title="No linked emails" body="Conversations from a connected mailbox that match this record's email address appear here." />;
  return (
    <ul className="divide-y divide-line-2 overflow-hidden rounded-card border border-line bg-surface">
      {threads.map((t) => (
        <li key={t.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
          <span className="mt-0.5 text-ink-3"><Mail size={14} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-medium text-ink">{t.subject || '(no subject)'}</span>
              <Badge tone={t.status === 'closed' ? 'gray' : t.status === 'snoozed' ? 'amber' : 'green'}>{t.status}</Badge>
            </div>
            <div className="truncate text-sm text-ink-2">{t.canRead ? t.snippet ?? '' : 'You do not have read access to this mailbox.'}</div>
            <div className="mt-0.5 text-xs text-ink-3">{t.mailbox.displayName || t.mailbox.address} · {relative(t.lastMessageAt)}</div>
          </div>
          {t.canRead && (
            <Link href={`/admin/mail/inbox?mailboxId=${t.mailbox.id}&threadId=${t.id}`} className="shrink-0">
              <Button size="sm" variant="ghost" icon={<ExternalLink size={12} />}>Open</Button>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function MetaFooter({ createdAt, lastActivityAt }: { createdAt: string; lastActivityAt: string }) {
  return (
    <div className="mt-4 border-t border-line-2 pt-3 text-xs text-ink-3">
      Created {dateTime(createdAt)} · Last activity {relative(lastActivityAt)}
    </div>
  );
}
