import { clsx } from 'clsx';
import { Minus, Square, X, Bell, WifiOff, LayoutDashboard, CheckSquare, Target, Mail, Plane, Activity, Coffee, Play, Square as Stop, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { bridge } from '../lib/bridge';
import { hms, fullName } from '../lib/format';
import type { Me, ShiftSnapshot } from '../lib/types';
import { Avatar, Badge, Button, Modal, Select } from '../components/ui';

export type Screen = 'dashboard' | 'tasks' | 'crm' | 'mail' | 'leave' | 'activity';

const NAV: Array<{ key: Screen; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'tasks', label: 'My Tasks', icon: CheckSquare },
  { key: 'crm', label: 'CRM', icon: Target },
  { key: 'mail', label: 'Mail', icon: Mail },
  { key: 'leave', label: 'Leave', icon: Plane },
  { key: 'activity', label: 'My activity', icon: Activity },
];

const TITLES: Record<Screen, string> = {
  dashboard: 'Dashboard',
  tasks: 'My Tasks',
  crm: 'CRM',
  mail: 'Mail',
  leave: 'Leave',
  activity: 'My activity',
};

/** 34px title bar: logo, app name, window controls (DESIGN-SYSTEM §4). */
export function TitleBar({ children }: { children?: ReactNode }) {
  return (
    <div className="drag-region flex h-[34px] shrink-0 items-center justify-between border-b border-line bg-surface pl-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-pri font-mono text-[9px] font-semibold text-white">OS</span>
        <span className="text-[12px] font-semibold text-ink-2">Company OS</span>
        {children}
      </div>
      <div className="no-drag flex h-full">
        <button type="button" className="flex h-full w-11 items-center justify-center text-ink-2 hover:bg-surface-2" onClick={() => bridge.window.minimize()} aria-label="Minimise">
          <Minus size={14} />
        </button>
        <button type="button" className="flex h-full w-11 items-center justify-center text-ink-2 hover:bg-surface-2" onClick={() => bridge.window.maximize()} aria-label="Maximise">
          <Square size={12} />
        </button>
        <button type="button" className="flex h-full w-11 items-center justify-center text-ink-2 hover:bg-red hover:text-white" onClick={() => bridge.window.close()} aria-label="Close">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ screen, onNavigate, shift, me, counts, onLogout }: { screen: Screen; onNavigate: (s: Screen) => void; shift: ShiftSnapshot | null; me: Me; counts: Partial<Record<Screen, number>>; onLogout: () => void }) {
  return (
    <aside className="flex w-[216px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Avatar name={fullName(me)} size={32} />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-semibold text-ink">{fullName(me)}</div>
          <div className="truncate font-mono text-[11px] text-ink-3">{me.code}</div>
        </div>
        <button type="button" onClick={onLogout} className="ml-auto rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" title="Sign out" aria-label="Sign out">
          <LogOut size={14} />
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = screen === item.key;
          const count = counts[item.key];
          return (
            <button key={item.key} type="button" onClick={() => onNavigate(item.key)} className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition', active ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
              <Icon size={16} strokeWidth={1.85} className={active ? 'text-pri' : 'text-ink-3'} />
              <span className="flex-1 text-left">{item.label}</span>
              {count ? <span className="rounded-full bg-gray-soft px-1.5 font-mono text-[11px] text-ink-2">{count}</span> : null}
            </button>
          );
        })}
      </nav>
      <ShiftBox shift={shift} />
    </aside>
  );
}

const BREAK_TYPES = ['Lunch', 'Short break', 'Prayer', 'Personal', 'Other'];

/** Shift box pinned at the bottom of the sidebar: status dot, timer, Break and End Shift (F5). */
export function ShiftBox({ shift }: { shift: ShiftSnapshot | null }) {
  const [breakOpen, setBreakOpen] = useState(false);
  const [breakType, setBreakType] = useState(BREAK_TYPES[0]!);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const state = shift?.state ?? 'OFF_SHIFT';
  const tone = state === 'WORKING' ? 'bg-green' : state === 'ON_BREAK' ? 'bg-amber' : 'bg-gray-bar';
  const label = state === 'WORKING' ? 'Working' : state === 'ON_BREAK' ? `On break · ${shift?.currentBreakType ?? ''}` : 'Off shift';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-line p-3">
      <div className="rounded-card border border-line bg-surface-2 p-3">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-2">
          <span className={clsx('h-2 w-2 rounded-full', tone, state !== 'OFF_SHIFT' && 'animate-pulse')} />
          {label}
        </div>
        <div className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-ink">{hms(shift?.durationSeconds ?? 0)}</div>
        {state !== 'OFF_SHIFT' && (
          <div className="mt-0.5 flex gap-3 font-mono text-[11px] text-ink-3">
            <span>break {hms(shift?.breakSeconds ?? 0)}</span>
            {shift && !shift.online && <span className="text-amber">offline</span>}
          </div>
        )}
        <div className="mt-2.5 flex gap-1.5">
          {state === 'OFF_SHIFT' && (
            <Button variant="primary" size="sm" className="flex-1" disabled={busy} onClick={() => run(() => bridge.shift.start())}>
              <Play size={13} /> Start shift
            </Button>
          )}
          {state === 'WORKING' && (
            <>
              <Button size="sm" className="flex-1" disabled={busy} onClick={() => setBreakOpen(true)}>
                <Coffee size={13} /> Break
              </Button>
              <Button variant="danger-outline" size="sm" disabled={busy} onClick={() => setConfirmEnd(true)}>
                <Stop size={12} /> End
              </Button>
            </>
          )}
          {state === 'ON_BREAK' && (
            <>
              <Button variant="primary" size="sm" className="flex-1" disabled={busy} onClick={() => run(() => bridge.shift.resume())}>
                <Play size={13} /> Resume
              </Button>
              <Button variant="danger-outline" size="sm" disabled={busy} onClick={() => setConfirmEnd(true)}>
                End
              </Button>
            </>
          )}
        </div>
      </div>

      <Modal
        open={breakOpen}
        onClose={() => setBreakOpen(false)}
        title="Start a break"
        width={380}
        footer={
          <>
            <Button onClick={() => setBreakOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await bridge.shift.startBreak(breakType);
                  setBreakOpen(false);
                })
              }
            >
              Start break
            </Button>
          </>
        }
      >
        <Select value={breakType} onChange={(e) => setBreakType(e.target.value)}>
          {BREAK_TYPES.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </Select>
        <p className="mt-2 text-[12px] text-ink-3">Tracking pauses during a break. Break time above 60 minutes per shift is flagged.</p>
      </Modal>

      <Modal
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="End shift?"
        width={380}
        footer={
          <>
            <Button onClick={() => setConfirmEnd(false)}>Keep working</Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await bridge.shift.end();
                  setConfirmEnd(false);
                })
              }
            >
              End shift
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-2">Your tracked time is uploaded and the shift is closed. You can start a new shift later today.</p>
      </Modal>
    </div>
  );
}

export function TopBar({ screen, shift, unread, onBell }: { screen: Screen; shift: ShiftSnapshot | null; unread: number; onBell: () => void }) {
  const tracking = shift?.state === 'WORKING' && (shift.tracker?.tracking ?? true);
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-5">
      <h1 className="text-[16px] font-semibold text-ink">{TITLES[screen]}</h1>
      <div className="flex items-center gap-2">
        {shift && !shift.online && (
          <Badge tone="amber" dot>
            <WifiOff size={12} /> Offline · tracking continues, will sync
          </Badge>
        )}
        {shift && shift.pendingEvents + shift.queuedSegments > 0 && shift.online && (
          <Badge tone="blue">syncing {shift.pendingEvents + shift.queuedSegments}</Badge>
        )}
        {shift?.state === 'WORKING' && (
          <Badge tone={tracking ? 'green' : 'amber'} dot>
            {tracking ? 'Tracking on' : 'Tracker not connected'}
          </Badge>
        )}
        {shift?.state === 'ON_BREAK' && <Badge tone="amber" dot>On break</Badge>}
        {shift?.state === 'OFF_SHIFT' && <Badge tone="gray">Off shift</Badge>}
        <button type="button" onClick={onBell} className="relative rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Notifications">
          <Bell size={17} />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 font-mono text-[9.5px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
        </button>
      </div>
    </header>
  );
}
