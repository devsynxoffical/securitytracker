'use client';

import { Suspense, useState } from 'react';
import { Plus, Pencil, Trash2, Upload, CalendarCheck } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchedules, useHolidays, usePeopleMutation, PEOPLE_ALL, type Schedule, type Holiday } from '@/lib/queries/people';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Select, Skeleton, Table, TableSkeleton, Tabs, Td, Textarea, Th, useToast } from '@/components/ui';
import { WEEKDAYS } from '@/components/people/shared';
import { dateOnly } from '@/lib/format';

export default function SchedulesPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Schedules /></Suspense>;
}

function Schedules() {
  const [tab, setTab] = useState<'schedules' | 'holidays'>('schedules');
  return (
    <div>
      <PageHeader title="Schedules & holidays" subtitle="Shift schedules drive late, absent and working-day rules (F8)" />
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'schedules', label: 'Shift schedules' }, { value: 'holidays', label: 'Holidays' }]} />
      {tab === 'schedules' ? <ScheduleList /> : <HolidayList />}
    </div>
  );
}

function ScheduleList() {
  const { can } = useAuth();
  const toast = useToast();
  const q = useSchedules();
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null);
  const del = usePeopleMutation((id: string) => http.del(`/schedules/${id}`), PEOPLE_ALL);
  return (
    <Card title="Shift schedules" actions={can('attendance.manage') && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing('new')}>New schedule</Button>}>
      {q.isLoading && <TableSkeleton cols={5} />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState icon={<CalendarCheck size={20} />} title="No schedules" body="Create a schedule such as Day shift 09:00–18:00 Mon–Fri." />}
      {q.data && q.data.length > 0 && (
        <Table>
          <thead><tr><Th>Name</Th><Th>Hours</Th><Th>Workdays</Th><Th right>Grace</Th><Th right>Half day below</Th><Th /></tr></thead>
          <tbody>
            {q.data.map((s) => (
              <tr key={s.id} className="hover:bg-surface-2">
                <Td className="font-semibold">{s.name}</Td>
                <Td mono>{s.startTime}–{s.endTime}{s.crossesMidnight && <Badge tone="blue" className="ml-2">night</Badge>}</Td>
                <Td><div className="flex gap-1">{WEEKDAYS.map((d) => <span key={d.n} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.workdays.includes(d.n) ? 'bg-pri-soft text-pri-2' : 'bg-gray-soft text-ink-3'}`}>{d.label}</span>)}</div></Td>
                <Td right mono>{s.graceMinutes} min</Td>
                <Td right mono>{s.halfDayPercent}%</Td>
                <Td right>{can('attendance.manage') && <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(s)} /><Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => window.confirm(`Delete ${s.name}?`) && del.mutate(s.id, { onError: (e) => toast.push('error', (e as Error).message) })} /></div>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <ScheduleModal schedule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
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
        <Field label="Workdays"><div className="flex gap-1">{WEEKDAYS.map((d) => <button key={d.n} type="button" onClick={() => setWorkdays((w) => (w.includes(d.n) ? w.filter((x) => x !== d.n) : [...w, d.n].sort()))} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${workdays.includes(d.n) ? 'border-pri bg-pri-soft text-pri-2' : 'border-line text-ink-3'}`}>{d.label}</button>)}</div></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start"><Input type="time" value={startTime} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End"><Input type="time" value={endTime} onChange={(e) => setEnd(e.target.value)} /></Field>
          <Field label="Grace minutes"><Input type="number" value={grace} onChange={(e) => setGrace(e.target.value)} /></Field>
          <Field label="Half day below (%)"><Input type="number" value={half} onChange={(e) => setHalf(e.target.value)} /></Field>
        </div>
        <Checkbox checked={crossesMidnight} onChange={(e) => setCross(e.target.checked)} label="Shift crosses midnight (attendance date = start date)" />
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
  return (
    <Card title="Holidays" actions={<div className="flex items-center gap-2"><Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">{[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}</Select>{can('attendance.manage') && <><Button size="sm" icon={<Upload size={13} />} onClick={() => setImporting(true)}>Import</Button><Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing('new')}>Add</Button></>}</div>}>
      {q.isLoading && <TableSkeleton cols={3} />}
      {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title={`No holidays in ${year}`} body="Add them one by one or import a list." />}
      {q.data && q.data.length > 0 && (
        <Table>
          <thead><tr><Th>Date</Th><Th>Name</Th><Th>Kind</Th><Th /></tr></thead>
          <tbody>{q.data.map((h) => <tr key={h.id} className="hover:bg-surface-2"><Td mono>{dateOnly(h.date)}</Td><Td className="font-semibold">{h.name}</Td><Td><Badge tone={h.isOptional ? 'gray' : 'blue'}>{h.isOptional ? 'Optional' : 'Company holiday'}</Badge></Td><Td right>{can('attendance.manage') && <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(h)} /><Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => del.mutate(h.id, { onError: (e) => toast.push('error', (e as Error).message) })} /></div>}</Td></tr>)}</tbody>
        </Table>
      )}
      {editing && <HolidayModal holiday={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </Card>
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
      <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      {holiday && <Checkbox checked={isOptional} onChange={(e) => setOptional(e.target.checked)} label="Optional holiday (does not reduce working days)" />}
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
    </Modal>
  );
}
