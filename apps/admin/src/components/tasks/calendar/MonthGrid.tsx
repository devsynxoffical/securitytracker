'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import type { Task } from '@/lib/queries/tasks';
import { Avatar } from '@/components/ui';
import { Tooltip } from '@/components/ui/advanced';
import { PriorityFlag } from '@/components/tasks/shared';
import { fullName } from '@/lib/format';

/** UTC day key yyyy-mm-dd for grouping; the calendar is day-granular. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthRange(year: number, month: number): { from: Date; to: Date; cells: Date[] } {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  // Monday-first grid (company week start defaults to Monday, NFR-07)
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - lead * 86_400_000);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(start.getTime() + i * 86_400_000));
  const to = new Date(last.getTime() + 86_400_000 - 1);
  return { from: start, to: new Date(Math.max(to.getTime(), cells[41]!.getTime())), cells };
}

const MAX_VISIBLE = 3;

export function MonthGrid({ year, month, tasks, onOpen, onMove, today }: { year: number; month: number; tasks: Task[]; onOpen: (id: string) => void; onMove: (taskId: string, day: string) => void; today: string }) {
  const { cells } = monthRange(year, month);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.dueAt) continue;
    const k = dayKey(new Date(t.dueAt));
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-line bg-surface-2">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
          <div key={d} className={clsx('px-2 py-1.5 text-2xs font-semibold uppercase text-ink-3', i >= 5 && 'text-ink-3/70')}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const key = dayKey(cell);
          const inMonth = cell.getUTCMonth() === month;
          const items = byDay.get(key) ?? [];
          const isToday = key === today;
          const isPast = key < today;
          const weekend = i % 7 >= 5;
          const showAll = expanded === key;
          const visible = showAll ? items : items.slice(0, MAX_VISIBLE);
          return (
            <div
              key={key}
              onDragOver={(e) => { e.preventDefault(); if (dragOver !== key) setDragOver(key); }}
              onDragLeave={() => setDragOver((d) => (d === key ? null : d))}
              onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('text/task-id'); if (id) onMove(id, key); }}
              className={clsx(
                'min-h-[118px] border-b border-r border-line-2 p-1.5 align-top transition-colors',
                i % 7 === 6 && 'border-r-0',
                !inMonth && 'bg-surface-2/60',
                inMonth && weekend && 'bg-surface-2/30',
                dragOver === key && 'bg-pri-soft ring-1 ring-inset ring-pri',
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={clsx('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-xs', isToday ? 'bg-pri font-semibold text-white' : inMonth ? 'text-ink-2' : 'text-ink-3')}>{cell.getUTCDate()}</span>
                {items.length > 0 && <span className="font-mono text-2xs normal-case tracking-normal text-ink-3">{items.length}</span>}
              </div>
              <div className="space-y-1">
                {visible.map((t) => {
                  const done = t.status === 'done' || t.status === 'cancelled';
                  const overdue = !done && isPast;
                  const colour = t.statusRef?.colour ?? (t.list?.space.colour ?? 'var(--gray-bar)');
                  return (
                    <Tooltip key={t.id} label={<span>{t.title}{t.list ? ` · ${t.list.name}` : ''}</span>}>
                      <button
                        type="button"
                        draggable={!done}
                        onDragStart={(e) => { e.dataTransfer.setData('text/task-id', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                        onClick={() => onOpen(t.id)}
                        className={clsx(
                          'flex w-full items-center gap-1.5 overflow-hidden rounded-md border-l-[3px] bg-surface px-1.5 py-[3px] text-left text-xs shadow-card transition hover:shadow-pop',
                          done ? 'text-ink-3 line-through' : overdue ? 'bg-red-soft/60 text-red-text' : 'text-ink',
                          !done && 'cursor-grab active:cursor-grabbing',
                        )}
                        style={{ borderLeftColor: colour }}
                      >
                        <PriorityFlag priority={t.priority} size={11} />
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        {t.assignees[0] && <Avatar name={fullName(t.assignees[0].employee)} size={14} />}
                      </button>
                    </Tooltip>
                  );
                })}
                {items.length > MAX_VISIBLE && (
                  <button type="button" onClick={() => setExpanded(showAll ? null : key)} className="w-full text-left text-xs font-medium text-pri hover:underline">
                    {showAll ? 'Show less' : `+${items.length - MAX_VISIBLE} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
