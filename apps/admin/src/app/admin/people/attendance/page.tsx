'use client';

import { Suspense, useState } from 'react';
import { Download, CalendarDays } from 'lucide-react';
import { http } from '@/lib/api';
import { useIdParam } from '@/lib/useIdParam';
import { useSheet } from '@/lib/queries/people';
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, Skeleton, useToast } from '@/components/ui';
import { DepartmentSelect, TeamSelect, MonthPicker, EmployeeDrawer, attendanceTone, hours, thisMonth } from '@/components/people/shared';
import { downloadText, fullName } from '@/lib/format';

const LEGEND: Array<[string, string]> = [['present', 'Present'], ['late', 'Late'], ['half_day', 'Half day'], ['absent', 'Absent'], ['on_leave', 'On leave'], ['holiday', 'Holiday'], ['weekly_off', 'Weekly off']];
const SHORT: Record<string, string> = { present: 'P', late: 'L', half_day: 'H', absent: 'A', on_leave: 'LV', holiday: 'HO', weekly_off: 'O' };

export default function AttendanceSheetPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><AttendanceSheet /></Suspense>;
}

function AttendanceSheet() {
  const toast = useToast();
  const [id, setId] = useIdParam();
  const [month, setMonth] = useState(thisMonth());
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const params = { month, departmentId: departmentId || undefined, teamId: teamId || undefined };
  const q = useSheet(params);
  const exportCsv = () => http.text('/attendance/sheet', { ...params, format: 'csv' }).then((t) => downloadText(`attendance-${month}.csv`, t)).catch((e) => toast.push('error', (e as Error).message));

  return (
    <div>
      <PageHeader title="Attendance sheet" subtitle="One row per employee, one column per day (F8)" actions={<Button icon={<Download size={14} />} onClick={exportCsv}>Export CSV</Button>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MonthPicker value={month} onChange={setMonth} />
        <div className="w-44"><DepartmentSelect value={departmentId} onChange={(v) => { setDepartmentId(v); setTeamId(''); }} /></div>
        <div className="w-40"><TeamSelect value={teamId} onChange={setTeamId} departmentId={departmentId || undefined} /></div>
        <div className="ml-auto flex flex-wrap gap-2 text-xs">{LEGEND.map(([k, l]) => <Badge key={k} tone={attendanceTone(k)}>{SHORT[k]} {l}</Badge>)}</div>
      </div>
      <Card>
        {q.isLoading && <Skeleton className="h-64" />}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && q.data.rows.length === 0 && <EmptyState icon={<CalendarDays size={20} />} title="No employees in this view" body="Change the department or team filter." />}
        {q.data && q.data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                <tr className="bg-surface-2 text-[10px] uppercase tracking-wide text-ink-3">
                  <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2 text-left">Employee</th>
                  {q.data.dates.map((d) => { const hol = q.data!.holidays.find((h) => h.date === d); return <th key={d} title={hol?.name} className={`px-1 py-2 text-center font-semibold ${hol ? 'text-blue' : ''}`}>{d.slice(8)}</th>; })}
                  <th className="px-2 py-2 text-right">P</th><th className="px-2 py-2 text-right">L</th><th className="px-2 py-2 text-right">A</th><th className="px-2 py-2 text-right">LV</th><th className="px-2 py-2 text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((r) => (
                  <tr key={r.employee.id} className="border-t border-line-2 hover:bg-surface-2">
                    <td className="sticky left-0 z-10 cursor-pointer bg-surface px-3 py-1.5 font-semibold" onClick={() => setId(r.employee.id)}>{fullName(r.employee)}<div className="font-mono text-[10px] font-normal text-ink-3">{r.employee.code}</div></td>
                    {q.data!.dates.map((d) => { const day = r.days[d]; const s = day?.status; return (
                      <td key={d} className="px-0.5 py-1 text-center" title={`${d}: ${s || 'no data'}${day?.workingSeconds ? ` · ${hours(day.workingSeconds)}` : ''}${day?.flags?.length ? ` · ${day.flags.join(', ')}` : ''}`}>
                        {s ? <span className={`inline-block w-6 rounded py-0.5 font-mono text-[10px] font-semibold ${cell(s)}`}>{SHORT[s] ?? '?'}</span> : <span className="text-ink-3">·</span>}
                      </td>
                    ); })}
                    <td className="px-2 text-right font-mono">{r.totals.present}</td><td className="px-2 text-right font-mono text-amber">{r.totals.late}</td><td className="px-2 text-right font-mono text-red">{r.totals.absent}</td><td className="px-2 text-right font-mono text-violet">{r.totals.onLeave}</td><td className="px-2 text-right font-mono">{(r.totals.workingSeconds / 3600).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <EmployeeDrawer id={id} onClose={() => setId(null)} />
    </div>
  );
}

function cell(status: string): string {
  switch (status) {
    case 'present': return 'bg-green-soft text-green';
    case 'late': case 'half_day': return 'bg-amber-soft text-amber';
    case 'absent': return 'bg-red-soft text-red';
    case 'on_leave': return 'bg-violet-soft text-violet';
    case 'holiday': return 'bg-blue-soft text-blue';
    default: return 'bg-gray-soft text-gray';
  }
}
