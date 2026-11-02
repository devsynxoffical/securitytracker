'use client';

import { Suspense, useMemo, useState } from 'react';
import { Download, CalendarDays } from 'lucide-react';
import { http } from '@/lib/api';
import { useIdParam } from '@/lib/useIdParam';
import { useSheet, useDepartments, useTeams } from '@/lib/queries/people';
import { Avatar, Card, Button, EmptyState, ErrorBanner, PageHeader, Skeleton, useToast } from '@/components/ui';
import { FilterChip, KpiTile, Tooltip } from '@/components/ui/advanced';
import { MonthPicker, EmployeeDrawer, attendanceDot, hours, thisMonth, isWeekend, monthLabel, ATTENDANCE_LEGEND, OptionList } from '@/components/people/shared';
import { downloadText, fullName, titleCase } from '@/lib/format';

export default function AttendanceSheetPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><AttendanceSheet /></Suspense>;
}

function AttendanceSheet() {
  const toast = useToast();
  const [id, setId] = useIdParam();
  const [month, setMonth] = useState(thisMonth());
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const departments = useDepartments();
  const teams = useTeams();
  const params = { month, departmentId: departmentId || undefined, teamId: teamId || undefined };
  const q = useSheet(params);
  const exportCsv = () => http.text('/attendance/sheet', { ...params, format: 'csv' }).then((t) => downloadText(`attendance-${month}.csv`, t)).catch((e) => toast.push('error', (e as Error).message));

  const totals = useMemo(() => {
    const rows = q.data?.rows ?? [];
    const sum = (k: keyof NonNullable<typeof q.data>['rows'][number]['totals']) => rows.reduce((s, r) => s + (r.totals[k] as number), 0);
    const present = sum('present') + sum('late') + sum('halfDay');
    const scheduled = present + sum('absent');
    return { rows: rows.length, rate: scheduled ? Math.round((present / scheduled) * 100) : null, late: sum('late'), absent: sum('absent'), leave: sum('onLeave'), hours: sum('workingSeconds') };
  }, [q.data]);

  const deptName = departments.data?.find((d) => d.id === departmentId)?.name;
  const teamName = teams.data?.find((t) => t.id === teamId)?.name;

  return (
    <div>
      <PageHeader title="Attendance sheet" subtitle={`${monthLabel(month)} · one row per employee, one column per day (F8)`} actions={<Button icon={<Download size={14} />} onClick={exportCsv}>Export CSV</Button>} />
      <div className="mb-4 grid grid-cols-5 gap-3">
        <KpiTile label="Employees" value={totals.rows} loading={q.isLoading} />
        <KpiTile label="Attendance rate" value={totals.rate === null ? '—' : `${totals.rate}%`} tone={totals.rate === null ? undefined : totals.rate >= 90 ? 'green' : totals.rate >= 75 ? 'amber' : 'red'} loading={q.isLoading} />
        <KpiTile label="Late days" value={totals.late} tone="amber" loading={q.isLoading} />
        <KpiTile label="Absent days" value={totals.absent} tone="red" loading={q.isLoading} />
        <KpiTile label="Working hours" value={(totals.hours / 3600).toFixed(0)} loading={q.isLoading} />
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-2 px-3 py-2.5">
          <MonthPicker value={month} onChange={setMonth} />
          <FilterChip label="Department" value={deptName} onClear={() => { setDepartmentId(''); setTeamId(''); }}>
            <OptionList value={departmentId} onChange={(v) => { setDepartmentId(v); setTeamId(''); }} options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))} />
          </FilterChip>
          <FilterChip label="Team" value={teamName} onClear={() => setTeamId('')}>
            <OptionList value={teamId} onChange={setTeamId} options={(teams.data ?? []).filter((t) => !departmentId || t.departmentId === departmentId).map((t) => ({ value: t.id, label: t.name }))} />
          </FilterChip>
          <div className="ml-auto flex flex-wrap gap-3">{ATTENDANCE_LEGEND.map(([k, l]) => <span key={k} className="inline-flex items-center gap-1 text-xs text-ink-2"><span className={`h-2 w-2 rounded-full ${attendanceDot(k)}`} />{l}</span>)}</div>
        </div>
        {q.isLoading && <div className="p-4"><Skeleton className="h-64" /></div>}
        {q.isError && <ErrorBanner message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && q.data.rows.length === 0 && <EmptyState icon={<CalendarDays size={20} />} title="No employees in this view" body="Change the department or team filter." />}
        {q.data && q.data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-2 text-2xs font-semibold uppercase text-ink-3">
                  <th className="sticky left-0 z-20 min-w-[200px] bg-surface-2 px-3 py-2 text-left">Employee</th>
                  {q.data.dates.map((d) => {
                    const hol = q.data!.holidays.find((h) => h.date.slice(0, 10) === d);
                    const we = isWeekend(d);
                    return (
                      <th key={d} className={`w-7 px-0 py-2 text-center font-semibold ${hol ? 'text-blue-text' : we ? 'text-ink-3/60' : ''}`}>
                        {hol ? <Tooltip label={hol.name}><span>{Number(d.slice(8))}</span></Tooltip> : Number(d.slice(8))}
                      </th>
                    );
                  })}
                  <th className="px-2 py-2 text-right">P</th><th className="px-2 py-2 text-right">L</th><th className="px-2 py-2 text-right">A</th><th className="px-2 py-2 text-right">LV</th><th className="px-2 py-2 text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((r) => (
                  <tr key={r.employee.id} className="group border-t border-line-2 hover:bg-surface-2">
                    <td className="sticky left-0 z-10 cursor-pointer bg-surface px-3 py-[var(--row-py)] group-hover:bg-surface-2" onClick={() => setId(r.employee.id)}>
                      <div className="flex items-center gap-2"><Avatar name={fullName(r.employee)} size={24} /><div className="min-w-0"><div className="truncate font-semibold text-ink">{fullName(r.employee)}</div><div className="font-mono text-2xs normal-case tracking-normal text-ink-3">{r.employee.code}</div></div></div>
                    </td>
                    {q.data!.dates.map((d) => {
                      const day = r.days[d];
                      const s = day?.status;
                      const we = isWeekend(d);
                      const tip = `${d} · ${s ? titleCase(s) : 'No data'}${day?.workingSeconds ? ` · ${hours(day.workingSeconds)}` : ''}${day?.flags?.length ? ` · ${day.flags.join(', ')}` : ''}`;
                      return (
                        <td key={d} className={`px-0 py-[var(--row-py)] text-center ${we ? 'bg-surface-2/50' : ''}`}>
                          <Tooltip label={tip}>
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${s ? attendanceDot(s) : 'bg-line-2'} ${s === 'half_day' ? 'ring-2 ring-amber-soft' : ''}`} />
                          </Tooltip>
                        </td>
                      );
                    })}
                    <td className="px-2 text-right font-mono text-green-text">{r.totals.present}</td>
                    <td className="px-2 text-right font-mono text-amber-text">{r.totals.late}</td>
                    <td className="px-2 text-right font-mono text-red-text">{r.totals.absent}</td>
                    <td className="px-2 text-right font-mono text-violet-text">{r.totals.onLeave}</td>
                    <td className="px-2 text-right font-mono text-ink">{(r.totals.workingSeconds / 3600).toFixed(1)}</td>
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
