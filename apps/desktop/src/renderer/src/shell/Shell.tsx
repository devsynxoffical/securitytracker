import { clsx } from 'clsx';
import { Minus, Square, X, Bell, Wifi, WifiOff, LayoutDashboard, CheckSquare, Target, Mail, Plane, Activity, Coffee, Play, Square as Stop, LogOut, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { bridge } from '../lib/bridge';
import { hms, fullName } from '../lib/format';
import type { Theme } from '../lib/theme';
import type { Me, ShiftSnapshot } from '../lib/types';
import { Avatar, Button, IconButton, Modal, Select, StatusDot, ThemeToggle } from '../components/ui';

export type Screen = 'dashboard' | 'tasks' | 'crm' | 'mail' | 'leave' | 'activity';

const NAV: Array<{ key: Screen; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'tasks', label: 'My tasks', icon: CheckSquare },
  { key: 'crm', label: 'CRM', icon: Target },
  { key: 'mail', label: 'Mail', icon: Mail },
  { key: 'leave', label: 'Leave', icon: Plane },
  { key: 'activity', label: 'My activity', icon: Activity },
];

export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center rounded-md bg-pri font-mono font-semibold text-on-pri', className)} style={{ width: size, height: size, fontSize: Math.round(size * 0.42), borderRadius: Math.max(4, size * 0.28) }}>
      WP
    </span>
  );
}

/**
 * 34px frameless title bar (DESIGN-SYSTEM section 4): brand, optional context, connection pill,
 * notifications, theme toggle and window controls. Everything but the controls is a drag region.
 */
export function TitleBar({ theme, onToggleTheme, online, unread, onBell }: { theme: Theme; onToggleTheme: () => void; online?: boolean; unread?: number; onBell?: () => void }) {
  return (
    <div className="drag-region flex h-[34px] shrink-0 items-center justify-between border-b border-line bg-surface pl-3">
      <div className="flex items-center gap-2">
        <BrandMark size={18} />
        <span className="text-xs font-semibold text-ink">WorkPulse</span>
        <span className="text-xs text-ink-3">Workstation</span>
      </div>
      <div className="no-drag flex h-full items-center">
        {online !== undefined && (
          <span className={clsx('mr-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-semibold uppercase', online ? 'bg-green-soft text-green-text' : 'bg-amber-soft text-amber-text')} title={online ? 'Connected to the server' : 'Offline: tracking continues and syncs later'}>
            {online ? <Wifi size={11} /> : <WifiOff size={11} />}
            {online ? 'Online' : 'Offline'}
          </span>
        )}
        {onBell && (
          <IconButton label="Notifications" onClick={onBell} className="relative mr-0.5">
            <Bell size={14} />
            {unread ? <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red px-1 font-mono text-[9px] font-semibold text-on-pri">{unread > 99 ? '99+' : unread}</span> : null}
          </IconButton>
        )}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} className="mr-1.5" />
        <span className="mx-1 h-4 w-px bg-line" />
        <button type="button" className="flex h-full w-11 items-center justify-center text-ink-2 transition hover:bg-surface-2 hover:text-ink" onClick={() => bridge.window.minimize()} aria-label="Minimise">
          <Minus size={14} />
        </button>
        <button type="button" className="flex h-full w-11 items-center justify-center text-ink-2 transition hover:bg-surface-2 hover:text-ink" onClick={() => bridge.window.maximize()} aria-label="Maximise">
          <Square size={11} />
        </button>
        <button type="button" className="flex h-full w-11 items-center justify-center text-ink-2 transition hover:bg-red hover:text-on-pri" onClick={() => bridge.window.close()} aria-label="Close">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

/** 232px sidebar: identity block, navigation with counts, persistent shift control card. */
export function Sidebar({ screen, onNavigate, shift, me, counts, onLogout }: { screen: Screen; onNavigate: (s: Screen) => void; shift: ShiftSnapshot | null; me: Me; counts: Partial<Record<Screen, number>>; onLogout: () => void }) {
  const name = fullName(me);
  return (
    <aside className="sidebar-surface flex w-[232px] shrink-0 flex-col border-r border-line">
      <div className="flex items-center gap-2.5 border-b border-line-2 px-4 py-3.5">
        <Avatar name={name} size={34} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-base font-semibold text-ink">{name}</div>
          <div className="truncate font-mono text-2xs tracking-normal text-ink-3">{me.code}</div>
          {me.role?.name && <div className="truncate text-xs text-ink-3">{me.role.name}{me.department?.name ? ` · ${me.department.name}` : ''}</div>}
        </div>
        <IconButton label="Sign out" onClick={onLogout}>
          <LogOut size={14} />
        </IconButton>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3" aria-label="Main">
        <div className="mb-1.5 px-2.5 text-2xs font-semibold uppercase text-ink-3">Workspace</div>
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = screen === item.key;
          const count = counts[item.key];
          return (
            <button key={item.key} type="button" onClick={() => onNavigate(item.key)} aria-current={active ? 'page' : undefined} className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-base font-medium transition-colors', active ? 'bg-pri-soft text-pri-2' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
              <Icon size={16} strokeWidth={1.85} className={clsx('shrink-0', active ? 'text-pri' : 'text-ink-3')} />
              <span className="flex-1 truncate text-left">{item.label}</span>
              {count ? <span className={clsx('rounded-full px-1.5 font-mono text-2xs tracking-normal', active ? 'bg-pri/20 text-pri-2' : 'bg-gray-soft text-ink-2')}>{count > 99 ? '99+' : count}</span> : null}
            </button>
          );
        })}
      </nav>
      <ShiftBox shift={shift} />
    </aside>
  );
}

const BREAK_TYPES = ['Lunch', 'Short break', 'Prayer', 'Personal', 'Other'];

/** Shift control card pinned at the bottom of the sidebar: state, live timer, Start / Break / Resume / End (F5). */
export function ShiftBox({ shift }: { shift: ShiftSnapshot | null }) {
  const [breakOpen, setBreakOpen] = useState(false);
  const [breakType, setBreakType] = useState(BREAK_TYPES[0]!);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const state = shift?.state ?? 'OFF_SHIFT';
  const tone = state === 'WORKING' ? 'green' : state === 'ON_BREAK' ? 'amber' : 'gray';
  const label = state === 'WORKING' ? 'Working' : state === 'ON_BREAK' ? `On break · ${shift?.currentBreakType ?? ''}` : 'Off shift';
  const tracking = state === 'WORKING' && (shift?.tracker?.tracking ?? true);
  const pending = (shift?.pendingEvents ?? 0) + (shift?.queuedSegments ?? 0);

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
      <div className={clsx('rounded-card border p-3.5 transition-colors', state === 'WORKING' ? 'border-green/30 bg-green-soft/40' : state === 'ON_BREAK' ? 'border-amber/30 bg-amber-soft/40' : 'border-line bg-surface')}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-ink-2">
            <StatusDot tone={tone} live={state !== 'OFF_SHIFT'} />
            <span className="truncate">{label}</span>
          </div>
          {state === 'WORKING' && <span className={clsx('text-2xs font-semibold uppercase', tracking ? 'text-green-text' : 'text-amber-text')}>{tracking ? 'Tracking' : 'No tracker'}</span>}
        </div>
        <div className="mt-1.5 font-mono text-[26px] font-semibold leading-none tracking-tight text-ink">{hms(shift?.durationSeconds ?? 0)}</div>
        <div className="mt-2 flex items-center gap-3 font-mono text-2xs tracking-normal text-ink-3">
          {state !== 'OFF_SHIFT' ? (
            <>
              <span>break {hms(shift?.breakSeconds ?? 0)}</span>
              {pending > 0 && (
                <span className={clsx('inline-flex items-center gap-1', shift?.online ? 'text-blue-text' : 'text-amber-text')}>
                  <RefreshCw size={10} className={shift?.online ? 'animate-spin' : ''} /> {pending} queued
                </span>
              )}
            </>
          ) : (
            <span>Start a shift to begin tracking</span>
          )}
        </div>
        <div className="mt-3 flex gap-1.5">
          {state === 'OFF_SHIFT' && (
            <Button variant="primary" size="sm" className="h-8 flex-1" disabled={busy} loading={busy} icon={<Play size={13} />} onClick={() => run(() => bridge.shift.start())}>
              Start shift
            </Button>
          )}
          {state === 'WORKING' && (
            <>
              <Button size="sm" className="h-8 flex-1" disabled={busy} icon={<Coffee size={13} />} onClick={() => setBreakOpen(true)}>
                Break
              </Button>
              <Button variant="danger-outline" size="sm" className="h-8" disabled={busy} icon={<Stop size={11} />} onClick={() => setConfirmEnd(true)}>
                End
              </Button>
            </>
          )}
          {state === 'ON_BREAK' && (
            <>
              <Button variant="primary" size="sm" className="h-8 flex-1" disabled={busy} loading={busy} icon={<Play size={13} />} onClick={() => run(() => bridge.shift.resume())}>
                Resume
              </Button>
              <Button variant="danger-outline" size="sm" className="h-8" disabled={busy} onClick={() => setConfirmEnd(true)}>
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
        subtitle="Tracking pauses while you are on a break."
        width={380}
        footer={
          <>
            <Button onClick={() => setBreakOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={busy}
              loading={busy}
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
        <Select value={breakType} onChange={(e) => setBreakType(e.target.value)} aria-label="Break type">
          {BREAK_TYPES.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </Select>
        <p className="mt-2.5 text-xs text-ink-3">Break time above 60 minutes per shift is flagged to your manager.</p>
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
              loading={busy}
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
        <p className="text-base text-ink-2">Your tracked time is uploaded and the shift is closed. You can start a new shift later today.</p>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">
          <span>Worked this shift</span>
          <span className="font-mono font-semibold text-ink">{hms(shift?.durationSeconds ?? 0)}</span>
        </div>
      </Modal>
    </div>
  );
}
