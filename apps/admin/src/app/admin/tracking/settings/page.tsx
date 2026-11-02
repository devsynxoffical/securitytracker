'use client';

import { useEffect, useState } from 'react';
import { http } from '@/lib/api';
import { useTrackingSettings, useTrackingMutation, type TrackingSettings } from '@/lib/queries/tracking';
import { Card, PageHeader, Field, Input, Checkbox, Button, Skeleton, ErrorBanner, Banner, useToast } from '@/components/ui';

export default function TrackingSettingsPage() {
  const toast = useToast();
  const q = useTrackingSettings();
  const [form, setForm] = useState<TrackingSettings | null>(null);
  useEffect(() => { if (q.data && !form) setForm(q.data); }, [q.data, form]);
  const save = useTrackingMutation((body: Partial<TrackingSettings>) => http.patch<TrackingSettings>('/tracking/settings', body));
  const set = <K extends keyof TrackingSettings>(k: K, v: TrackingSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const num = (k: keyof TrackingSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);

  return (
    <div>
      <PageHeader title="Tracking settings" subtitle="Thresholds the agent and the reports use. Changes reach desktop apps on their next config refresh." />
      <Banner tone="blue">The tracker records application names, website domains and input counts only. Key values, clipboard and screen content are never captured and there is no setting to enable them (AGENTS.md rule 8).</Banner>
      <Card className="mt-4">
        {q.isLoading && <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {form && (
          <form className="grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(form, { onSuccess: (d) => { setForm(d); toast.push('success', 'Settings saved'); }, onError: (err) => toast.push('error', (err as Error).message) }); }}>
            <Field label="Idle threshold (seconds)" hint="No keyboard or mouse input for this long starts idle time. 60 – 3600."><Input type="number" min={60} max={3600} value={form.idleThresholdSeconds} onChange={num('idleThresholdSeconds')} /></Field>
            <Field label="Long idle prompt (seconds)" hint="Idle longer than this asks the employee what happened. 300 – 14400."><Input type="number" min={300} max={14400} value={form.longIdleThresholdSeconds} onChange={num('longIdleThresholdSeconds')} /></Field>
            <Field label="Maximum shift length (hours)" hint="Shifts are auto-closed after this (F5). 4 – 24."><Input type="number" min={4} max={24} value={form.maxShiftHours} onChange={num('maxShiftHours')} /></Field>
            <div className="flex items-end pb-2"><Checkbox label="Capture window titles (off by default, 30 day retention)" checked={form.captureWindowTitles} onChange={(e) => set('captureWindowTitles', e.target.checked)} /></div>
            <Field label="Activity warning below (%)" hint="Shown amber on Team activity."><Input type="number" min={0} max={100} value={form.activityWarnPercent} onChange={num('activityWarnPercent')} /></Field>
            <Field label="Activity alert below (%)" hint="Shown red on Team activity."><Input type="number" min={0} max={100} value={form.activityAlertPercent} onChange={num('activityAlertPercent')} /></Field>
            <div className="md:col-span-2 flex justify-end gap-2 border-t border-line pt-3"><Button type="button" onClick={() => setForm(q.data ?? null)} disabled={save.isPending}>Reset</Button><Button type="submit" variant="primary" loading={save.isPending}>Save settings</Button></div>
          </form>
        )}
      </Card>
    </div>
  );
}
