import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { CalendarX, Clock, Info } from 'lucide-react';
import { bridge, http, errorStatus } from './lib/bridge';
import { useQuery } from './lib/useQuery';
import { useRealtime } from './lib/realtime';
import { useTheme } from './lib/theme';
import type { ChatUnread, Me, NotificationItem, ShiftNotice, ShiftSnapshot, StartContext } from './lib/types';
import { TitleBar, Sidebar, type Screen } from './shell/Shell';
import { LoginScreen, ConsentScreen, type SignInNotice } from './screens/Auth';
import { ChatScreen } from './screens/Chat';
import { Dashboard } from './screens/Dashboard';
import { TasksScreen } from './screens/Tasks';
import { CrmScreen } from './screens/Crm';
import { MailScreen } from './screens/Mail';
import { LeaveScreen } from './screens/Leave';
import { ActivityScreen } from './screens/Activity';
import { NotificationsPanel } from './screens/Notifications';
import { Button, Modal, Skeleton } from './components/ui';
import { hm, time } from './lib/format';

type Phase = 'boot' | 'login' | 'consent' | 'app';

export default function App() {
  const { theme, toggle } = useTheme();
  const [phase, setPhase] = useState<Phase>('boot');
  const [me, setMe] = useState<Me | null>(null);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [shift, setShift] = useState<ShiftSnapshot | null>(null);
  const [bell, setBell] = useState(false);
  const [longIdle, setLongIdle] = useState<{ seconds: number } | null>(null);
  const [online, setOnline] = useState(true);
  const [startConfirm, setStartConfirm] = useState<StartContext | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [signInNotice, setSignInNotice] = useState<SignInNotice>(null);

  /** Behaviour 3: the main process decides whether now is outside the schedule; we only ask. */
  const requestStartShift = useCallback(async () => {
    let ctx: StartContext | null = null;
    try {
      ctx = (await bridge.shift.startContext()) as StartContext | null;
    } catch {
      ctx = null; // older main process without the schedule feature: start directly
    }
    if (ctx?.outsideSchedule) {
      setStartConfirm(ctx);
      return;
    }
    await bridge.shift.start();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8_000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadMe = useCallback(async () => {
    try {
      const m = await http.get<Me>('/me');
      setMe(m);
      setPhase(m.consentRequired ? 'consent' : 'app');
    } catch (e) {
      if ((e as { status?: number }).status === 0) {
        // offline with a stored session (F7): keep working with what we have
        setPhase(me ? 'app' : 'login');
      } else setPhase('login');
    }
  }, [me]);

  useEffect(() => {
    void bridge.auth.session().then((s: { hasSession: boolean; online: boolean }) => {
      setOnline(s.online);
      if (s.hasSession) void loadMe();
      else setPhase('login');
    });
    const offs = [
      bridge.shift.onUpdate((s) => setShift(s as ShiftSnapshot)),
      bridge.shift.onLongIdle((p) => setLongIdle(p as { seconds: number })),
      bridge.net.onStatus((s) => setOnline((s as { online: boolean }).online)),
      bridge.shift.onNotice((n) => {
        const notice = n as ShiftNotice;
        if (notice.kind === 'autoStarted') setToast(`Shift started automatically at ${time(notice.at)} (company policy)`);
        if (notice.kind === 'closedByServer') setScreen('dashboard');
      }),
      bridge.auth.onExpired((p) => {
        // FR-SEC-25: the main process already stopped tracking and wiped the store; we only show why.
        const reason = (p as { reason?: string } | undefined)?.reason;
        setSignInNotice({ reason: reason === 'suspended' ? 'suspended' : 'revoked' });
        setMe(null);
        setScreen('dashboard');
        setPhase('login');
      }),
    ];
    void bridge.shift.state().then((s) => setShift(s as ShiftSnapshot));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notifications = useQuery(() => http.get<NotificationItem[] | { items: NotificationItem[] }>('/notifications?limit=50'), [], { intervalMs: 30_000, enabled: phase === 'app' });
  const notifList = Array.isArray(notifications.data) ? notifications.data : notifications.data?.items ?? [];
  const unread = notifList.filter((n) => !n.readAt).length;
  const myTasks = useQuery(() => http.get<{ items: unknown[] } | unknown[]>('/tasks/my?range=today'), [], { intervalMs: 120_000, enabled: phase === 'app' });
  const todayCount = Array.isArray(myTasks.data) ? myTasks.data.length : myTasks.data?.items.length ?? 0;
  // Chat badge (FR-CHAT-06): 15 s poll, refreshed early on socket events; a server without chat (404) simply shows no badge.
  const chatUnread = useQuery(() => http.get<ChatUnread>('/chat/unread').catch((e) => (errorStatus(e) === 404 ? { total: 0, channels: [] } : Promise.reject(e))), [], { intervalMs: 15_000, enabled: phase === 'app' });
  useRealtime((e) => {
    if (e.event.startsWith('chat.message.') || e.event === 'chat.read' || e.event === 'chat.channel.changed') void chatUnread.refetch();
    if (e.event === 'notification.new') void notifications.refetch();
  }, phase === 'app');
  const chatCount = chatUnread.data?.total ?? 0;

  const logout = async () => {
    await bridge.auth.logout();
    setMe(null);
    setPhase('login');
  };

  if (phase === 'boot') {
    return (
      <div className="flex h-full flex-col bg-bg">
        <TitleBar theme={theme} onToggleTheme={toggle} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
    );
  }
  if (phase === 'login') {
    return (
      <div className="flex h-full flex-col bg-bg">
        <TitleBar theme={theme} onToggleTheme={toggle} />
        <div className="min-h-0 flex-1">
          <LoginScreen notice={signInNotice} onLoggedIn={() => { setSignInNotice(null); void loadMe(); }} />
        </div>
      </div>
    );
  }
  if (phase === 'consent' && me) {
    return (
      <div className="flex h-full flex-col bg-bg">
        <TitleBar theme={theme} onToggleTheme={toggle} />
        <div className="min-h-0 flex-1">
          <ConsentScreen policyVersion={me.policyVersion ?? 1} onAccepted={() => setPhase('app')} />
        </div>
      </div>
    );
  }
  if (!me) return null;

  const shiftWithNet = shift ? { ...shift, online } : null;

  return (
    <div className="flex h-full flex-col bg-bg">
      <TitleBar theme={theme} onToggleTheme={toggle} online={online} unread={unread} onBell={() => setBell(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar screen={screen} onNavigate={setScreen} shift={shiftWithNet} me={me} counts={{ tasks: todayCount, chat: chatCount }} onLogout={() => void logout()} onStartShift={requestStartShift} />
        <main key={screen} className={clsx('fade-in min-h-0 min-w-0 flex-1', screen === 'chat' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto p-6')}>
          {screen === 'dashboard' && <Dashboard me={me} shift={shiftWithNet} unread={unread} notifications={notifList} longIdle={longIdle} onClaimIdle={(claim) => void bridge.shift.claimIdle(claim).then(() => setLongIdle(null))} onOpen={setScreen} onBell={() => setBell(true)} onStartShift={requestStartShift} />}
          {screen === 'tasks' && <TasksScreen online={online} />}
          {screen === 'crm' && <CrmScreen online={online} />}
          {screen === 'mail' && <MailScreen online={online} meId={me.id} />}
          {screen === 'chat' && <ChatScreen online={online} me={me} onUnreadChanged={() => void chatUnread.refetch()} />}
          {screen === 'leave' && <LeaveScreen online={online} meId={me.id} />}
          {screen === 'activity' && <ActivityScreen meId={me.id} shift={shiftWithNet} />}
        </main>
      </div>
      {bell && <NotificationsPanel query={notifications} onClose={() => setBell(false)} />}
      {toast && (
        <div role="status" className="pop-in fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-2.5 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink shadow-modal">
          <Info size={15} className="shrink-0 text-pri" />
          <span className="min-w-0 flex-1">{toast}</span>
          <button type="button" className="text-xs font-semibold text-ink-3 hover:text-ink" onClick={() => setToast(null)}>Close</button>
        </div>
      )}
      <Modal
        open={Boolean(startConfirm)}
        onClose={() => setStartConfirm(null)}
        title="Start a shift outside your schedule?"
        width={440}
        footer={
          <>
            <Button onClick={() => setStartConfirm(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => void bridge.shift.start().then(() => setStartConfirm(null))}>Start anyway</Button>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-lg border border-amber/30 bg-amber-soft/50 px-3 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-soft text-amber-text">
            <CalendarX size={16} />
          </span>
          <div>
            <div className="text-base font-semibold text-ink">{startReason(startConfirm)}</div>
            <div className="mt-0.5 text-sm text-ink-2">Start a shift anyway? It will be flagged outside schedule for your manager.</div>
          </div>
        </div>
      </Modal>
      <Modal
        open={Boolean(shift?.reminder?.endModal)}
        onClose={() => void bridge.shift.snoozeEndReminder()}
        title="Your scheduled shift has ended"
        subtitle={shift?.reminder?.scheduledEndAt ? `Your shift was scheduled to end at ${time(shift.reminder.scheduledEndAt)}.` : undefined}
        width={440}
        footer={
          <>
            <Button onClick={() => void bridge.shift.snoozeEndReminder()}>Keep working{shift?.reminder?.endSnoozes ? ` (${3 - Math.min(3, shift.reminder.endSnoozes)} left)` : ''}</Button>
            <Button variant="danger" onClick={() => void bridge.shift.end()}>End shift now</Button>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pri-soft text-pri-2">
            <Clock size={16} />
          </span>
          <div>
            <div className="text-base font-semibold text-ink">Worked {hm(shift?.durationSeconds ?? 0)} so far</div>
            <div className="mt-0.5 text-sm text-ink-2">Keep working snoozes this reminder for 30 minutes. Your shift stays open until you end it.</div>
          </div>
        </div>
      </Modal>
      <Modal
        open={Boolean(longIdle)}
        onClose={() => setLongIdle(null)}
        title="You were away"
        subtitle="Choose how this time is recorded on your shift."
        width={440}
        footer={
          <>
            <Button onClick={() => void bridge.shift.claimIdle('break').then(() => setLongIdle(null))}>Record as break</Button>
            <Button variant="primary" onClick={() => void bridge.shift.claimIdle('away_work').then(() => setLongIdle(null))}>Working away from PC</Button>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-lg border border-amber/30 bg-amber-soft/50 px-3 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-soft text-amber-text">
            <Clock size={16} />
          </span>
          <div>
            <div className="text-base font-semibold text-ink">No input for {hm(longIdle?.seconds ?? 0)}</div>
            <div className="mt-0.5 text-sm text-ink-2">Pick a break if you stepped away, or keep it as work if you were in a meeting or on a call.</div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function startReason(ctx: StartContext | null): string {
  if (!ctx) return '';
  const range = ctx.scheduledStartAt && ctx.scheduledEndAt ? `${time(ctx.scheduledStartAt)}–${time(ctx.scheduledEndAt)}` : null;
  switch (ctx.reason) {
    case 'not_workday':
      return 'Today is your weekly day off.';
    case 'holiday':
      return 'Today is a public holiday.';
    case 'on_leave':
      return 'You are on leave today.';
    case 'too_early':
      return range ? `Your schedule today is ${range}. It is more than 2 hours before your start.` : 'It is more than 2 hours before your scheduled start.';
    case 'after_end':
      return range ? `Your schedule today is ${range}. Your scheduled shift has already ended.` : 'Your scheduled shift has already ended.';
    default:
      return range ? `Your schedule today is ${range}.` : 'This shift is outside your schedule.';
  }
}
