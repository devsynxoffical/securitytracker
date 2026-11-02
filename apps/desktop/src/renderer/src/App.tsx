import { useCallback, useEffect, useState } from 'react';
import { bridge, http } from './lib/bridge';
import { useQuery } from './lib/useQuery';
import type { Me, NotificationItem, ShiftSnapshot } from './lib/types';
import { TitleBar, Sidebar, TopBar, type Screen } from './shell/Shell';
import { LoginScreen, ConsentScreen } from './screens/Auth';
import { Dashboard } from './screens/Dashboard';
import { TasksScreen } from './screens/Tasks';
import { CrmScreen } from './screens/Crm';
import { MailScreen } from './screens/Mail';
import { LeaveScreen } from './screens/Leave';
import { ActivityScreen } from './screens/Activity';
import { NotificationsPanel } from './screens/Notifications';
import { Button, Modal, Skeleton } from './components/ui';
import { hm } from './lib/format';

type Phase = 'boot' | 'login' | 'consent' | 'app';

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [me, setMe] = useState<Me | null>(null);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [shift, setShift] = useState<ShiftSnapshot | null>(null);
  const [bell, setBell] = useState(false);
  const [longIdle, setLongIdle] = useState<{ seconds: number } | null>(null);
  const [online, setOnline] = useState(true);

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
      bridge.auth.onExpired(() => {
        setMe(null);
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

  const logout = async () => {
    await bridge.auth.logout();
    setMe(null);
    setPhase('login');
  };

  if (phase === 'boot') {
    return (
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="flex flex-1 items-center justify-center"><Skeleton className="h-10 w-64" /></div>
      </div>
    );
  }
  if (phase === 'login') {
    return (
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="flex-1"><LoginScreen onLoggedIn={() => void loadMe()} /></div>
      </div>
    );
  }
  if (phase === 'consent' && me) {
    return (
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="flex-1"><ConsentScreen policyVersion={me.policyVersion ?? 1} onAccepted={() => setPhase('app')} /></div>
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar screen={screen} onNavigate={setScreen} shift={shift} me={me} counts={{ tasks: todayCount }} onLogout={() => void logout()} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar screen={screen} shift={shift ? { ...shift, online } : null} unread={unread} onBell={() => setBell(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto px-[22px] py-5">
            {screen === 'dashboard' && <Dashboard me={me} shift={shift} onOpen={setScreen} />}
            {screen === 'tasks' && <TasksScreen online={online} />}
            {screen === 'crm' && <CrmScreen online={online} />}
            {screen === 'mail' && <MailScreen online={online} meId={me.id} />}
            {screen === 'leave' && <LeaveScreen online={online} meId={me.id} />}
            {screen === 'activity' && <ActivityScreen meId={me.id} shift={shift} />}
          </main>
        </div>
      </div>
      {bell && <NotificationsPanel query={notifications} onClose={() => setBell(false)} />}
      <Modal
        open={Boolean(longIdle)}
        onClose={() => setLongIdle(null)}
        title="You were away"
        width={420}
        footer={
          <>
            <Button onClick={() => void bridge.shift.claimIdle('break').then(() => setLongIdle(null))}>Break</Button>
            <Button variant="primary" onClick={() => void bridge.shift.claimIdle('away_work').then(() => setLongIdle(null))}>Working away from PC</Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-2">You were away for {hm(longIdle?.seconds ?? 0)}. How should this time be recorded?</p>
      </Modal>
    </div>
  );
}
