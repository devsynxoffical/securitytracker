'use client';

import { confirmDialog, ConfirmHost } from '@/components/platform/confirm';

import { Suspense, useState } from 'react';
import { Plus, Pencil, Trash2, Upload, CalendarCheck, Clock } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchedules, useHolidays, usePeopleMutation, PEOPLE_ALL, type Schedule, type Holiday } from '@/lib/queries/people';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Skeleton, Textarea, useToast } from '@/components/ui';
import { DataTable, FilterChip, Menu, Toggle, ViewTabs, type Column } from '@/components/ui/advanced';
import { WEEKDAYS, OptionList } from '@/components/people/shared';
import { dateOnly } from '@/lib/format';

function SchedulesPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Schedules /></Suspense>;
}

function Schedules() {
  const [tab, setTab] = useState<'schedules' | 'holidays'>('schedules');
  const schedules = useSchedules();
  const holidays = useHolidays(new Date().getFullYear());
  return (
    <div>
      <PageHeader title="Schedules & holidays" subtitle="Shift schedules drive late, absent and working-day rules (F8)" />
      <Card>
        <ViewTabs value={tab} onChange={setTab} views={[{ value: 'schedules', label: 'Shift schedules', count: schedules.data?.length }, { value: 'holidays', label: 'Holidays', count: holidays.data?.length }]} />
        {tab === 'schedules' ? <ScheduleList /> : <HolidayList />}
      </Card>
    </div>
  );
}

function Workdays({ days }: { days: number[] }) {
  return <div className="flex gap-0.5">{WEEKDAYS.map((d) => <span key={d.n} title={d.label} className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold ${days.includes(d.n) ? 'bg-pri-soft text-pri-2' : 'bg-surface-2 text-ink-3'}`}>{d.label[0]}</span>)}</div>;
}

function ScheduleList() {
  const { can } = useAuth();
  const toast = useToast();
  const q = useSchedules();
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null);
  const del = usePeopleMutation((id: string) => http.del(`/schedules/${id}`), PEOPLE_ALL);
  const cols: Column<Schedule>[] = [
    { key: 'name', header: 'Name', locked: true, cell: (s) => <span className="inline-flex items-center gap-2 font-semibold text-ink"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-pri-soft text-pri"><Clock size={13} /></span>{s.name}</span> },
    { key: 'hours', header: 'Hours', mono: true, cell: (s) => <>{s.startTime}–{s.endTime}{s.crossesMidnight && <Badge tone="blue" className="ml-2">night</Badge>}</> },
    { key: 'workdays', header: 'Workdays', cell: (s) => <Workdays days={s.workdays} /> },
    { key: 'grace', header: 'Grace', right: true, mono: true, cell: (s) => `${s.graceMinutes} min` },
    { key: 'half', header: 'Half day below', right: true, mono: true, cell: (s) => `${s.halfDayPercent}%` },
  ];
  return (
    <>
      <div className="flex items-center justify-between border-b border-line-2 px-3 py-2.5">
        <span className="text-sm text-ink-2">Assign schedules per employee from the profile. Monday to Friday is assumed when none is set.</span>
        {can('attendance.manage') && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing('new')}>New schedule</Button>}
      </div>
      <DataTable rows={q.data ?? []} columns={cols} loading={q.isLoading} error={q.isError ? (q.error as Error).message : null} onRetry={() => q.refetch()} empty={<EmptyState icon={<CalendarCheck size={20} />} title="No schedules" body="Create a schedule such as Day shift 09:00–18:00 Mon–Fri." />}
        rowActions={can('attendance.manage') ? (s) => <Menu items={[{ label: 'Edit', icon: <Pencil size={13} />, onSelect: () => setEditing(s) }, { separator: true, label: '' }, { label: 'Delete', icon: <Trash2 size={13} />, danger: true, onSelect: () => void confirmDialog({ title: `Delete ${s.name}?`, danger: true }).then((ok) => ok && del.mutate(s.id, { onError: (e) => toast.push('error', (e as Error).message) }) )}]} /> : undefined} />
      {editing && <ScheduleModal schedule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ScheduleModal({ schedule, onClose }: { schedule: Schedule | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(schedule?.name ?? '');
  const [workdays, setWorkdays] = useState<number[]>(schedule?.workdays ?? [1, 2, 3, 4, 5]);
  const [startTime, setStart] = useState(schedule?.startTime ?? '09:00');
  const [endTime, setEnd] = useState(schedule?.endTime ?? '18:00');
  const [crossesMidnight, setCross] = useState(schedule?.crossesMidnight ?? false);
  const [grace, setGrace] = useState(String(schedule?.graceMinutes ?? 10));
  const [half, setHalf] = useState(String(schedule?.halfDayPercent ?? 50));
  const save = usePeopleMutation((b: Record<string, unknown>) => (schedule ? http.patch(`/schedules/${schedule.id}`, b) : http.post('/schedules', b)), PEOPLE_ALL);
  return (
    <Modal open onClose={onClose} title={schedule ? 'Edit schedule' : 'New schedule'} width={520} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim() || workdays.length === 0} loading={save.isPending} onClick={() => save.mutate({ name, workdays, startTime, endTime, crossesMidnight, graceMinutes: Number(grace), halfDayPercent: Number(half) }, { onSuccess: () => { toast.push('success', 'Saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Workdays"><div className="flex gap-1">{WEEKDAYS.map((d) => <button key={d.n} type="button" onClick={() => setWorkdays((w) => (w.includes(d.n) ? w.filter((x) => x !== d.n) : [...w, d.n].sort()))} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${workdays.includes(d.n) ? 'border-pri bg-pri-soft text-pri-2' : 'border-line text-ink-3 hover:text-ink'}`}>{d.label}</button>)}</div></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start"><Input type="time" value={startTime} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End"><Input type="time" value={endTime} onChange={(e) => setEnd(e.target.value)} /></Field>
          <Field label="Grace minutes"><Input type="number" value={grace} onChange={(e) => setGrace(e.target.value)} /></Field>
          <Field label="Half day below (%)"><Input type="number" value={half} onChange={(e) => setHalf(e.target.value)} /></Field>
        </div>
        <Toggle checked={crossesMidnight} onChange={setCross} label="Shift crosses midnight (attendance date = start date)" />
      </div>
    </Modal>
  );
}

function HolidayList() {
  const { can } = useAuth();
  const toast = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const q = useHolidays(year);
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const del = usePeopleMutation((id: string) => http.del(`/holidays/${id}`), PEOPLE_ALL);
  const toggleOptional = usePeopleMutation(({ id, isOptional }: { id: string; isOptional: boolean }) => http.patch(`/holidays/${id}`, { isOptional }), PEOPLE_ALL);
  const cols: Column<Holiday>[] = [
    { key: 'date', header: 'Date', mono: true, locked: true, cell: (h) => <span className="font-semibold text-ink">{dateOnly(h.date)}</span> },
    { key: 'weekday', header: 'Weekday', cell: (h) => new Date(h.date.slice(0, 10) + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' }) },
    { key: 'name', header: 'Name', cell: (h) => h.name },
    { key: 'kind', header: 'Kind', cell: (h) => <Badge tone={h.isOptional ? 'gray' : 'blue'}>{h.isOptional ? 'Optional' : 'Company holiday'}</Badge> },
    ...(can('attendance.manage') ? [{ key: 'optional', header: 'Optional', cell: (h: Holiday) => <Toggle checked={h.isOptional} onChange={(v) => toggleOptional.mutate({ id: h.id, isOptional: v }, { onError: (e) => toast.push('error', (e as Error).message) })} /> }] : []),
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-2 px-3 py-2.5">
        <FilterChip label="Year" value={String(year)} active>
          <OptionList value={String(year)} onChange={(v) => v && setYear(Number(v))} options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))} emptyLabel="Current" />
        </FilterChip>
        <span className="text-sm text-ink-2">Optional holidays do not reduce working days.</span>
        {can('attendance.manage') && <div className="ml-auto flex gap-2"><Button size="sm" icon={<Upload size={13} />} onClick={() => setImporting(true)}>Import</Button><Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing('new')}>Add holiday</Button></div>}
      </div>
      <DataTable rows={q.data ?? []} columns={cols} loading={q.isLoading} error={q.isError ? (q.error as Error).message : null} onRetry={() => q.refetch()} empty={<EmptyState title={`No holidays in ${year}`} body="Add them one by one or import a list." />}
        rowActions={can('attendance.manage') ? (h) => <Menu items={[{ label: 'Edit', icon: <Pencil size={13} />, onSelect: () => setEditing(h) }, { separator: true, label: '' }, { label: 'Delete', icon: <Trash2 size={13} />, danger: true, onSelect: () => del.mutate(h.id, { onError: (e) => toast.push('error', (e as Error).message) }) }]} /> : undefined} />
      {editing && <HolidayModal holiday={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </>
  );
}

function HolidayModal({ holiday, onClose }: { holiday: Holiday | null; onClose: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(holiday?.date.slice(0, 10) ?? '');
  const [name, setName] = useState(holiday?.name ?? '');
  const [isOptional, setOptional] = useState(holiday?.isOptional ?? false);
  const save = usePeopleMutation((b: Record<string, unknown>) => (holiday ? http.patch(`/holidays/${holiday.id}`, b) : http.post('/holidays', b)), PEOPLE_ALL);
  return (
    <Modal open onClose={onClose} title={holiday ? 'Edit holiday' : 'Add holiday'} width={420} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!date || !name.trim()} loading={save.isPending} onClick={() => save.mutate(holiday ? { date, name, isOptional } : { date, name }, { onSuccess: () => { toast.push('success', 'Saved'); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {holiday && <Toggle checked={isOptional} onChange={setOptional} label="Optional holiday (does not reduce working days)" />}
      </div>
    </Modal>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const run = usePeopleMutation((b: Record<string, unknown>) => http.post<{ created: number; updated: number }>('/holidays/import', b), PEOPLE_ALL);
  const parsed = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [date, ...rest] = l.split(/[,;\t]/); const name = rest.join(',').trim(); return { date: (date ?? '').trim(), name, isOptional: /optional/i.test(name) }; }).filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.name);
  return (
    <Modal open onClose={onClose} title="Import holidays" width={520} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={parsed.length === 0} loading={run.isPending} onClick={() => run.mutate({ holidays: parsed.map((h) => ({ date: h.date, name: h.name.replace(/\(?optional\)?/i, '').trim() || h.name, isOptional: h.isOptional })) }, { onSuccess: (r) => { toast.push('success', `${r.created} created, ${r.updated} updated`); onClose(); }, onError: (e) => toast.push('error', (e as Error).message) })}>Import {parsed.length}</Button></>}>
      <Field label="One per line: YYYY-MM-DD, Name" hint="Add the word optional to mark optional holidays"><Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'2026-12-25, Christmas Day\n2026-01-01, New Year'} /></Field>
      {parsed.length > 0 && <div className="mt-2 text-xs text-ink-3">{parsed.length} valid line{parsed.length === 1 ? '' : 's'} detected.</div>}
    </Modal>
  );
}

export default function SchedulesPageWithConfirm() {
  return (
    <>
      <SchedulesPage />
      <ConfirmHost />
    </>
  );
}
