'use client';

import { useEffect, useState } from 'react';
import { Save, Building2, Clock, MonitorSmartphone, ShieldCheck, RotateCcw } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCrmMutation } from '@/lib/queries/crm';
import { useSettings, type CompanySettings } from '@/lib/queries/platform';
import { Button, Card, Field, Input, Select, Textarea, Skeleton, ErrorBanner, PageHeader, useToast, Banner } from '@/components/ui';
import { Toggle, Section } from '@/components/ui/advanced';
import { dateTime } from '@/lib/format';

const TIMEZONES = ['UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Manila', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney'];
const WEEKDAYS = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [7, 'Sunday']] as const;

type Form = Omit<CompanySettings, 'id' | 'updatedAt' | 'adminIpAllowlist'> & { adminIpAllowlist: string };
const toForm = (s: CompanySettings): Form => ({ ...s, adminIpAllowlist: s.adminIpAllowlist.join('\n') });

export default function SettingsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const q = useSettings(can('settings.manage'));
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && !form) setForm(toForm(q.data));
  }, [q.data, form]);

  const save = useCrmMutation((body: Record<string, unknown>) => http.patch('/settings', body), [['settings']]);

  if (!can('settings.manage')) return <Banner tone="amber">You do not have permission to manage company settings.</Banner>;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const dirty = Boolean(q.data && form && JSON.stringify(toForm(q.data)) !== JSON.stringify(form));

  const submit = () => {
    if (!form) return;
    setError(null);
    const body = {
      name: form.name,
      timezone: form.timezone,
      weekStart: form.weekStart,
      idleThresholdSeconds: form.idleThresholdSeconds,
      longIdleThresholdSeconds: form.longIdleThresholdSeconds,
      breakAllowanceMinutes: form.breakAllowanceMinutes,
      deviceApprovalMode: form.deviceApprovalMode,
      deviceLimitPerEmployee: form.deviceLimitPerEmployee,
      maxShiftHours: form.maxShiftHours,
      heartbeatTimeoutMinutes: form.heartbeatTimeoutMinutes,
      captureWindowTitles: form.captureWindowTitles,
      adminIpAllowlist: form.adminIpAllowlist.split(/\s+/).map((s) => s.trim()).filter(Boolean),
    };
    save.mutate(body, { onSuccess: () => toast.push('success', 'Settings saved'), onError: (e) => setError((e as Error).message) });
  };

  return (
    <div>
      <PageHeader title="Company settings" subtitle={q.data ? `Last updated ${dateTime(q.data.updatedAt)}` : undefined} />
      {q.isLoading && <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {error && <div className="mb-3"><ErrorBanner message={error} /></div>}
      {form && (
        <div className="grid grid-cols-[220px_1fr] gap-6">
          <nav className="sticky top-20 self-start space-y-0.5 text-sm">
            {[['company', 'Company', Building2], ['shifts', 'Shifts & tracking', Clock], ['devices', 'Devices', MonitorSmartphone], ['access', 'Admin access', ShieldCheck]].map(([id, label, Icon]) => (
              <a key={id as string} href={`#${id}`} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
                {(() => { const I = Icon as typeof Building2; return <I size={14} className="text-ink-3" />; })()}
                {label as string}
              </a>
            ))}
          </nav>
          <div className="max-w-3xl space-y-4">
            <div id="company" className="scroll-mt-20"><Card title="Company">
              <div className="space-y-4 p-5">
                <Field label="Company name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Timezone" hint="All times are stored in UTC and displayed in this timezone (NFR-07).">
                    <Select value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                      {!TIMEZONES.includes(form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
                      {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                    </Select>
                  </Field>
                  <Field label="Week starts on"><Select value={form.weekStart} onChange={(e) => set('weekStart', Number(e.target.value))}>{WEEKDAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                </div>
              </div>
            </Card></div>
            <div id="shifts" className="scroll-mt-20"><Card title="Shifts and tracking">
              <div className="p-5">
                <Section title="Idle detection">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Idle threshold (seconds)" hint="No input for this long counts as idle (09)."><Input type="number" min={60} max={3600} value={form.idleThresholdSeconds} onChange={(e) => set('idleThresholdSeconds', num(e.target.value))} className="font-mono" /></Field>
                    <Field label="Long idle prompt (seconds)"><Input type="number" min={300} max={14400} value={form.longIdleThresholdSeconds} onChange={(e) => set('longIdleThresholdSeconds', num(e.target.value))} className="font-mono" /></Field>
                  </div>
                </Section>
                <Section title="Shift rules">
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Break allowance (min)" hint="Excess is flagged on the day (Q8)."><Input type="number" min={0} max={480} value={form.breakAllowanceMinutes} onChange={(e) => set('breakAllowanceMinutes', num(e.target.value))} className="font-mono" /></Field>
                    <Field label="Max shift length (hours)"><Input type="number" min={4} max={24} value={form.maxShiftHours} onChange={(e) => set('maxShiftHours', num(e.target.value))} className="font-mono" /></Field>
                    <Field label="Heartbeat timeout (min)" hint="Offline gap after this long (F5)."><Input type="number" min={1} max={120} value={form.heartbeatTimeoutMinutes} onChange={(e) => set('heartbeatTimeoutMinutes', num(e.target.value))} className="font-mono" /></Field>
                  </div>
                </Section>
                <Section title="Privacy">
                  <div className="flex items-center justify-between rounded-card border border-line bg-surface-2/60 px-3 py-2.5">
                    <span>
                      <span className="block text-base font-semibold text-ink">Capture window titles</span>
                      <span className="block text-xs text-ink-3">Off by default. Titles are kept 30 days (08). Key values and screen content are never captured.</span>
                    </span>
                    <Toggle checked={form.captureWindowTitles} onChange={(v) => set('captureWindowTitles', v)} />
                  </div>
                </Section>
              </div>
            </Card></div>
            <div id="devices" className="scroll-mt-20"><Card title="Devices">
              <div className="grid grid-cols-2 gap-4 p-5">
                <Field label="Approval mode" hint="FR-DEV-02">
                  <Select value={form.deviceApprovalMode} onChange={(e) => set('deviceApprovalMode', e.target.value as Form['deviceApprovalMode'])}>
                    <option value="manual">Manual approval</option>
                    <option value="auto_first">Auto-approve the first device</option>
                    <option value="off">No approval required</option>
                  </Select>
                </Field>
                <Field label="Approved devices per employee" hint="FR-DEV-04"><Input type="number" min={1} max={10} value={form.deviceLimitPerEmployee} onChange={(e) => set('deviceLimitPerEmployee', num(e.target.value))} className="font-mono" /></Field>
              </div>
            </Card></div>
            <div id="access" className="scroll-mt-20"><Card title="Admin Panel access">
              <div className="p-5">
                <Field label="IP allowlist" hint="One IP or CIDR per line. Empty allows every address (FR-AUTH-11)."><Textarea rows={5} value={form.adminIpAllowlist} onChange={(e) => set('adminIpAllowlist', e.target.value)} placeholder="203.0.113.10&#10;198.51.100.0/24" className="font-mono text-xs" /></Field>
              </div>
            </Card></div>
          </div>
        </div>
      )}
      {form && (
        <div className="sticky bottom-0 z-20 -mx-[22px] -mb-5 mt-6 flex items-center justify-end gap-2 border-t border-line bg-surface/95 px-6 py-3 backdrop-blur">
          <span className="mr-auto text-sm text-ink-3">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
          <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={!dirty} onClick={() => q.data && setForm(toForm(q.data))}>Reset</Button>
          <Button variant="primary" icon={<Save size={14} />} loading={save.isPending} disabled={!dirty} onClick={submit}>Save changes</Button>
        </div>
      )}
    </div>
  );
}
