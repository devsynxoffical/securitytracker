import { useEffect, useState, type ReactNode } from 'react';
import { ShieldCheck, Lock, Settings2, Server, CheckCircle2, ChevronDown, Timer, EyeOff, WifiOff, ArrowLeft, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { bridge, http, type ApiResult } from '../lib/bridge';
import { Button, Field, Input, Banner, Checkbox } from '../components/ui';
import { BrandMark } from '../shell/Shell';

type LoginOutcome = { kind: 'ok' } | { kind: 'pending'; deviceId: string; message: string } | { kind: 'error'; message: string };

/**
 * Split authentication layout, same language as the admin login: brand panel on the left,
 * centred card on the right. Tokens only, so it follows the active theme.
 */
function AuthLayout({ children, footer, width = 420 }: { children: ReactNode; footer?: ReactNode; width?: number }) {
  return (
    <div className="flex h-full bg-bg">
      <BrandPanel />
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto px-8 py-10">
        <div className="w-full" style={{ maxWidth: width }}>
          <div className="fade-in rounded-modal border border-line bg-surface p-7 shadow-pop">{children}</div>
          {footer && <div className="mt-5 text-center text-xs leading-relaxed text-ink-3">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="brand-gradient relative w-[42%] shrink-0 flex-col justify-between overflow-hidden p-11 text-white flex" aria-hidden>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse at 30% 20%, black 0%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 30% 20%, black 0%, transparent 70%)',
        }}
      />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[520px] w-[520px] rounded-full opacity-25" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, transparent 65%)' }} />
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 font-mono text-sm font-semibold ring-1 ring-white/25 backdrop-blur">WP</span>
        <div className="leading-tight">
          <div className="text-md font-semibold">WorkPulse</div>
          <div className="text-xs text-white/70">Employee workstation</div>
        </div>
      </div>
      <div className="relative max-w-md">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight">Your day, in one place.</h2>
        <p className="mt-3 text-md text-white/80">Shifts, tasks, leads, shared inboxes and leave, synced with your company and working even when the network is not.</p>
        <ul className="mt-8 space-y-4">
          <Feature icon={<Timer size={16} />} title="Shift and break tracking" body="Start your shift, take breaks, and see your hours add up live." />
          <Feature icon={<EyeOff size={16} />} title="Counts only, never content" body="Which apps and sites you use, for how long. Never what you type or see." />
          <Feature icon={<WifiOff size={16} />} title="Works offline" body="Tracking continues without internet and uploads when the connection returns." />
        </ul>
      </div>
      <div className="relative text-xs text-white/60">© {new Date().getFullYear()} WorkPulse · Private deployment</div>
    </aside>
  );
}

function Feature({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">{icon}</span>
      <div>
        <div className="text-base font-semibold">{title}</div>
        <div className="mt-0.5 text-sm text-white/70">{body}</div>
      </div>
    </li>
  );
}

function AuthHeading({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-4 flex items-center gap-3">
        {icon ?? <BrandMark size={36} />}
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-base text-ink-2">{subtitle}</p>}
    </div>
  );
}

/** F2/F3: company credentials, device registration result and approval wait. */
export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<LoginOutcome | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [version, setVersion] = useState('');
  const [changingServer, setChangingServer] = useState(false);

  useEffect(() => {
    void bridge.app.info().then((i: { apiUrl: string; deviceName: string; version: string }) => {
      setApiUrl(i.apiUrl);
      setDeviceName(i.deviceName);
      setVersion(i.version);
    });
  }, []);

  const submit = async () => {
    if (!identifier || !password) return;
    setBusy(true);
    setOutcome(null);
    const res = (await bridge.auth.login(identifier.trim(), password)) as ApiResult<{ status?: string; deviceId?: string; message?: string; accessToken?: string }>;
    setBusy(false);
    if (res.ok && res.data?.accessToken) return onLoggedIn();
    if (res.ok && res.data?.status === 'DEVICE_PENDING') return setOutcome({ kind: 'pending', deviceId: res.data.deviceId ?? '', message: res.data.message ?? 'Waiting for an administrator to approve this device.' });
    const code = res.error?.code;
    const message =
      code === 'DEVICE_PENDING' ? 'This device is waiting for approval.'
      : code === 'DEVICE_REVOKED' ? 'This device was revoked. Contact your administrator.'
      : code === 'ACCOUNT_LOCKED' ? 'Too many attempts. Try again in 15 minutes.'
      : code === 'ACCOUNT_DISABLED' ? 'This account is disabled.'
      : code === 'INVALID_CREDENTIALS' ? 'Wrong employee code, email or password.'
      : res.status === 0 ? 'Cannot reach the server. First login needs an internet connection.'
      : res.error?.message ?? 'Login failed';
    if (code === 'DEVICE_PENDING') return setOutcome({ kind: 'pending', deviceId: '', message });
    setOutcome({ kind: 'error', message });
  };

  if (apiUrl === null)
    return (
      <div className="flex h-full items-center justify-center bg-bg text-base text-ink-3">
        <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Loading…
      </div>
    );
  if (!apiUrl || changingServer)
    return (
      <ServerScreen
        initial={apiUrl}
        version={version}
        onDone={(url) => {
          setApiUrl(url);
          setChangingServer(false);
        }}
        onCancel={apiUrl ? () => setChangingServer(false) : undefined}
      />
    );
  if (outcome?.kind === 'pending') return <DevicePending message={outcome.message} onRetry={submit} onBack={() => setOutcome(null)} deviceName={deviceName} />;

  return (
    <AuthLayout footer={<>Activity is tracked only while a shift is running. Counts only, never content.</>}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <AuthHeading title="Welcome back" subtitle="Sign in with your company account to start your day." />
        <Field label="Employee code or company email">
          <Input autoFocus value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="EMP-0021 or name@company.com" autoComplete="username" />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {outcome?.kind === 'error' && <Banner tone="red">{outcome.message}</Banner>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !identifier || !password} loading={busy} icon={<Lock size={14} />}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <button type="button" onClick={() => setShowSettings((s) => !s)} className="flex w-full items-center justify-center gap-1 rounded-md pt-1 text-xs text-ink-3 hover:text-ink" aria-expanded={showSettings}>
          <Settings2 size={11} /> Connection settings <ChevronDown size={11} className={clsx('transition-transform', showSettings && 'rotate-180')} />
        </button>
        {showSettings && (
          <div className="pop-in space-y-1.5 rounded-card border border-line bg-surface-2 p-3 text-xs text-ink-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">
                Server <span className="font-mono text-ink-2">{apiUrl}</span>
              </span>
              <button type="button" className="shrink-0 rounded font-semibold text-pri hover:underline" onClick={() => setChangingServer(true)}>
                Change
              </button>
            </div>
            <div>
              Device <span className="font-mono text-ink-2">{deviceName}</span>
            </div>
            <div>
              Version <span className="font-mono text-ink-2">{version}</span>
            </div>
          </div>
        )}
      </form>
    </AuthLayout>
  );
}

/** First run (F2): the server address comes from the administrator; we check /health before saving it. */
function ServerScreen({ initial, version, onDone, onCancel }: { initial: string; version: string; onDone: (url: string) => void; onCancel?: () => void }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<string | null>(null);

  const connect = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    const res = (await bridge.app.probeApiUrl(value)) as { ok: boolean; url: string; message?: string };
    setBusy(false);
    if (!res.ok) return setError(res.message ?? 'Cannot reach the server.');
    await bridge.app.setApiUrl(res.url);
    setChecked(res.url);
    onDone(res.url);
  };

  return (
    <AuthLayout footer={<>WorkPulse {version}. The address is saved on this computer only.</>}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void connect();
        }}
      >
        <AuthHeading
          icon={
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pri-soft text-pri-2 ring-1 ring-pri/20">
              <Server size={17} />
            </span>
          }
          title="Connect to your company"
          subtitle="Enter the server address from your administrator"
        />
        <Field label="Server address" hint="For example company.com or https://api.company.com. We add /api/v1 for you.">
          <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="api.yourcompany.com" spellCheck={false} className="font-mono" />
        </Field>
        {error && <Banner tone="red">{error}</Banner>}
        {checked && (
          <Banner tone="green" icon={<CheckCircle2 size={14} />}>
            Connected to {checked}
          </Banner>
        )}
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" size="lg" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
          )}
          <Button type="submit" variant="primary" size="lg" className="flex-1" disabled={busy || !value.trim()} loading={busy}>
            {busy ? 'Checking…' : 'Connect'}
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}

function DevicePending({ message, onRetry, onBack, deviceName }: { message: string; onRetry: () => void; onBack: () => void; deviceName: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (tick > 0) onRetry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  return (
    <AuthLayout footer={<>We check again every 30 seconds. Your administrator sees this device under Security → Devices.</>}>
      <AuthHeading
        icon={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-soft text-amber-text ring-1 ring-amber/25">
            <ShieldCheck size={18} />
          </span>
        }
        title="Device awaiting approval"
        subtitle={message}
      />
      <div className="rounded-card border border-line bg-surface-2 px-3.5 py-3">
        <div className="text-2xs font-semibold uppercase text-ink-3">This device</div>
        <div className="mt-1 truncate font-mono text-base text-ink">{deviceName}</div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        <Button onClick={onBack} icon={<ArrowLeft size={13} />}>
          Back
        </Button>
        <Button variant="primary" onClick={onRetry} icon={<RefreshCw size={13} />}>
          Check now
        </Button>
      </div>
    </AuthLayout>
  );
}

/** G8 / 08 §3: consent before the first shift on a device. */
export function ConsentScreen({ policyVersion, onAccepted }: { policyVersion: number; onAccepted: () => void }) {
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await http.post('/auth/consent', { policyVersion });
      onAccepted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout width={560} footer={<>Policy version {policyVersion}. Your acceptance is recorded with the date and this device.</>}>
      <AuthHeading
        icon={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pri-soft text-pri-2 ring-1 ring-pri/20">
            <EyeOff size={17} />
          </span>
        }
        title="Monitoring policy"
        subtitle="Read what is recorded while you are on shift before you continue."
      />
      <div className="max-h-[300px] space-y-2.5 overflow-y-auto rounded-card border border-line bg-surface-2 p-4 text-sm leading-relaxed text-ink-2">
        <p>While a shift is running, this application records which applications and websites (domain only) you use, how long you are active or idle, and the number of keyboard and mouse events.</p>
        <p>It never records what you type, your clipboard, your screen, audio or camera. Nothing is recorded outside a shift. You can see your own data under “My activity”.</p>
        <p>Your employer has provided the full monitoring policy (version {policyVersion}). By continuing you confirm that you have read it.</p>
      </div>
      <Checkbox className="mt-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} label="I have read and accept the monitoring policy" />
      {error && (
        <div className="mt-3">
          <Banner tone="red">{error}</Banner>
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <Button variant="primary" size="lg" disabled={!agree || busy} loading={busy} onClick={accept}>
          Continue
        </Button>
      </div>
    </AuthLayout>
  );
}
