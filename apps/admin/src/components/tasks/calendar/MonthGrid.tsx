'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import type { Task } from '@/lib/queries/tasks';
import { priorityTone } from '@/components/tasks/shared';

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

const PRIORITY_DOT: Record<string, string> = {
  red: 'bg-red',
  amber: 'bg-amber',
  blue: 'bg-blue',
  gray: 'bg-gray-bar',
  green: 'bg-green',
  violet: 'bg-violet',
  primary: 'bg-pri',
};

export function MonthGrid({
  year,
  month,
  tasks,
  onOpen,
  onMove,
  today,
}: {
  year: number;
  month: number;
  tasks: Task[];
  onOpen: (id: string) => void;
  onMove: (taskId: string, day: string) => void;
  today: string;
}) {
  const { cells } = monthRange(year, month);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.dueAt) continue;
    const k = dayKey(new Date(t.dueAt));
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-line bg-surface-2">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const key = dayKey(cell);
          const inMonth = cell.getUTCMonth() === month;
          const items = byDay.get(key) ?? [];
          const isToday = key === today;
          return (
            <div
              key={key}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOver !== key) setDragOver(key);
              }}
              onDragLeave={() => setDragOver((d) => (d === key ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData('text/task-id');
                if (id) onMove(id, key);
              }}
              className={clsx(
                'min-h-[112px] border-b border-r border-line-2 p-1.5 align-top transition-colors',
                i % 7 === 6 && 'border-r-0',
                !inMonth && 'bg-surface-2/60',
                dragOver === key && 'bg-pri-soft',
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={clsx(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[11px]',
                    isToday ? 'bg-pri font-semibold text-white' : inMonth ? 'text-ink-2' : 'text-ink-3',
                  )}
                >
                  {cell.getUTCDate()}
                </span>
                {items.length > 3 && <span className="text-[10px] text-ink-3">{items.length}</span>}
              </div>
              <div className="space-y-1">
                {items.slice(0, 3).map((t) => {
                  const done = t.status === 'done' || t.status === 'cancelled';
                  return (
                    <button
                      key={t.id}
                      type="button"
                      draggable={!done}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/task-id', t.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => onOpen(t.id)}
                      title={t.title}
                      className={clsx(
                        'flex w-full items-center gap-1.5 truncate rounded-md border border-line px-1.5 py-[3px] text-left text-[11.5px] hover:bg-surface-2',
                        done ? 'text-ink-3 line-through' : 'text-ink',
                      )}
                    >
                      <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_DOT[priorityTone(t.priority)] ?? 'bg-gray-bar')} />
                      <span className="truncate">{t.title}</span>
                    </button>
                  );
                })}
                {items.length > 3 && (
                  <button type="button" onClick={() => onOpen(items[3]!.id)} className="w-full text-left text-[11px] text-pri hover:underline">
                    +{items.length - 3} more
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
