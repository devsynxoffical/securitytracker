'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { http } from '@/lib/api';
import { useTrackingSettings, useTrackingMutation, type TrackingSettings } from '@/lib/queries/tracking';
import { Card, PageHeader, Field, Input, Button, Skeleton, ErrorBanner, Banner, useToast } from '@/components/ui';
import { Section, Toggle, Progress } from '@/components/ui/advanced';
import { duration } from '@/components/tracking/shared';

export default function TrackingSettingsPage() {
  const toast = useToast();
  const q = useTrackingSettings();
  const [form, setForm] = useState<TrackingSettings | null>(null);
  useEffect(() => { if (q.data && !form) setForm(q.data); }, [q.data, form]);
  const save = useTrackingMutation((body: Partial<TrackingSettings>) => http.patch<TrackingSettings>('/tracking/settings', body));
  const set = <K extends keyof TrackingSettings>(k: K, v: TrackingSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const num = (k: keyof TrackingSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);
  const dirty = Boolean(form && q.data && JSON.stringify(form) !== JSON.stringify(q.data));

  return (
    <div>
      <PageHeader
        title="Tracking settings"
        subtitle="Thresholds the agent and the reports use. Changes reach desktop apps on their next config refresh."
        actions={form ? <><Button onClick={() => setForm(q.data ?? null)} disabled={!dirty || save.isPending}>Reset</Button><Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(form, { onSuccess: (d) => { setForm(d); toast.push('success', 'Settings saved'); }, onError: (err) => toast.push('error', (err as Error).message) })}>Save changes</Button></> : undefined}
      />
      <Banner tone="blue"><span className="inline-flex items-center gap-2"><ShieldCheck size={14} /> The tracker records application names, website domains and input counts only. Key values, clipboard and screen content are never captured and there is no setting to enable them (AGENTS.md rule 8).</span></Banner>
      {q.isLoading && <div className="mt-4 space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
      {q.isError && <div className="mt-4"><ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} /></div>}
      {form && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div>
            <Card className="mb-4 p-5">
              <Section title="Idle detection">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Idle threshold" hint="No keyboard or mouse input for this long starts idle time (60 – 3600 s).">
                    <UnitInput value={form.idleThresholdSeconds} min={60} max={3600} unit="seconds" onChange={num('idleThresholdSeconds')} preview={duration(form.idleThresholdSeconds)} />
                  </Field>
                  <Field label="Long idle prompt" hint="Idle longer than this asks the employee what happened (300 – 14400 s).">
                    <UnitInput value={form.longIdleThresholdSeconds} min={300} max={14400} unit="seconds" onChange={num('longIdleThresholdSeconds')} preview={duration(form.longIdleThresholdSeconds)} />
                  </Field>
                </div>
              </Section>
              <Section title="Shifts">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Maximum shift length" hint="Shifts are auto-closed after this (F5), 4 – 24 h.">
                    <UnitInput value={form.maxShiftHours} min={4} max={24} unit="hours" onChange={num('maxShiftHours')} />
                  </Field>
                </div>
              </Section>
              <Section title="Capture">
                <div className="rounded-lg border border-line bg-surface-2 p-3">
                  <Toggle checked={form.captureWindowTitles} onChange={(v) => set('captureWindowTitles', v)} label={<span><span className="font-medium text-ink">Capture window titles</span><span className="block text-xs text-ink-3">Off by default. Titles are kept 30 days and never include typed text.</span></span>} />
                </div>
              </Section>
            </Card>
            <Card className="p-5">
              <Section title="Activity thresholds">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Warning below" hint="Shown amber on Team activity and timesheets."><UnitInput value={form.activityWarnPercent} min={0} max={100} unit="%" onChange={num('activityWarnPercent')} /></Field>
                  <Field label="Alert below" hint="Shown red. Must be lower than the warning."><UnitInput value={form.activityAlertPercent} min={0} max={100} unit="%" onChange={num('activityAlertPercent')} /></Field>
                </div>
                {form.activityAlertPercent >= form.activityWarnPercent && <div className="mt-3 rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber-text">The alert threshold should be lower than the warning threshold.</div>}
              </Section>
            </Card>
          </div>
          <Card className="p-5" title="Preview">
            <div className="space-y-4 pt-3 text-xs text-ink-2">
              <p>How activity percentages will look with the current thresholds:</p>
              {[Math.min(100, form.activityWarnPercent + 25), form.activityWarnPercent - 1, Math.max(0, form.activityAlertPercent - 5)].map((v, i) => (
                <div key={i}>
                  <div className="mb-1 flex justify-between"><span>{i === 0 ? 'Healthy' : i === 1 ? 'Warning' : 'Alert'}</span><span className="font-mono text-ink">{v}%</span></div>
                  <Progress value={v} tone={v < form.activityAlertPercent ? 'red' : v < form.activityWarnPercent ? 'amber' : 'green'} size={8} />
                </div>
              ))}
              <div className="border-t border-line-2 pt-3">
                <div className="mb-1 font-semibold text-ink">Idle timeline</div>
                <p>Input stops → after <span className="font-mono text-ink">{duration(form.idleThresholdSeconds)}</span> time counts as idle → after <span className="font-mono text-ink">{duration(form.longIdleThresholdSeconds)}</span> the employee is prompted when they return.</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function UnitInput({ value, min, max, unit, onChange, preview }: { value: number; min: number; max: number; unit: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; preview?: string }) {
  const invalid = value < min || value > max;
  return (
    <div>
      <div className="relative">
        <Input type="number" min={min} max={max} value={value} onChange={onChange} invalid={invalid} className="pr-20 font-mono" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{unit}</span>
      </div>
      {preview && <div className="mt-1 font-mono text-xs text-ink-3">= {preview}</div>}
    </div>
  );
}
