import { useEffect, useState } from 'react';
import { ShieldCheck, Lock, Settings2, Server, CheckCircle2 } from 'lucide-react';
import { bridge, http, type ApiResult } from '../lib/bridge';
import { Button, Field, Input, Banner, Card } from '../components/ui';

type LoginOutcome = { kind: 'ok' } | { kind: 'pending'; deviceId: string; message: string } | { kind: 'error'; message: string };

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

  if (apiUrl === null) return <div className="flex h-full items-center justify-center bg-bg text-[13px] text-ink-3">Loading…</div>;
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
    <div className="flex h-full items-center justify-center bg-bg">
      <div className="w-[400px]">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pri font-mono text-sm font-semibold text-white">WP</span>
          <div>
            <div className="text-[17px] font-semibold text-ink">WorkPulse</div>
            <div className="text-[12px] text-ink-3">Employee workstation</div>
          </div>
        </div>
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label="Employee code or company email">
              <Input autoFocus value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="EMP-0021 or name@company.com" autoComplete="username" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            {outcome?.kind === 'error' && <Banner tone="red">{outcome.message}</Banner>}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !identifier || !password}>
              <Lock size={14} /> {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <button type="button" onClick={() => setShowSettings((s) => !s)} className="mt-3 flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink">
            <Settings2 size={12} /> Connection settings
          </button>
          {showSettings && (
            <div className="mt-2 space-y-2 rounded-lg bg-surface-2 p-3 text-[11.5px] text-ink-3">
              <div className="flex items-center justify-between gap-2">
                <span>
                  Server: <span className="font-mono text-ink-2">{apiUrl}</span>
                </span>
                <button type="button" className="text-pri hover:underline" onClick={() => setChangingServer(true)}>
                  Change
                </button>
              </div>
              <div>
                Device: <span className="font-mono text-ink-2">{deviceName}</span>
              </div>
              <div>
                Version: <span className="font-mono text-ink-2">{version}</span>
              </div>
            </div>
          )}
        </Card>
        <p className="mt-4 text-center text-[11.5px] text-ink-3">Activity is tracked only while a shift is running. Counts only, never content.</p>
      </div>
    </div>
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
    <div className="flex h-full items-center justify-center bg-bg">
      <div className="w-[420px]">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pri text-white">
            <Server size={18} />
          </span>
          <div>
            <div className="text-[17px] font-semibold text-ink">Connect to your company</div>
            <div className="text-[12px] text-ink-3">Enter the server address from your administrator</div>
          </div>
        </div>
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
          >
            <Field label="Server address" hint="For example company.com or https://api.company.com. We add /api/v1 for you.">
              <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="api.yourcompany.com" spellCheck={false} />
            </Field>
            {error && <Banner tone="red">{error}</Banner>}
            {checked && (
              <Banner tone="green">
                <CheckCircle2 size={14} /> Connected to {checked}
              </Banner>
            )}
            <div className="flex gap-2">
              {onCancel && (
                <Button type="button" onClick={onCancel} className="flex-1">
                  Cancel
                </Button>
              )}
              <Button type="submit" variant="primary" size="lg" className="flex-1" disabled={busy || !value.trim()}>
                {busy ? 'Checking…' : 'Connect'}
              </Button>
            </div>
          </form>
        </Card>
        <p className="mt-4 text-center text-[11.5px] text-ink-3">WorkPulse {version}. The address is saved on this computer only.</p>
      </div>
    </div>
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
    <div className="flex h-full items-center justify-center bg-bg">
      <Card className="w-[420px] text-center">
        <ShieldCheck size={36} className="mx-auto text-amber" />
        <h2 className="mt-3 text-[15px] font-semibold text-ink">Device awaiting approval</h2>
        <p className="mt-1 text-[13px] text-ink-2">{message}</p>
        <p className="mt-3 rounded-lg bg-surface-2 p-2 font-mono text-[12px] text-ink-2">{deviceName}</p>
        <p className="mt-3 text-[12px] text-ink-3">We check again every 30 seconds. Your administrator sees this device under Security → Devices.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={onBack}>Back</Button>
          <Button variant="primary" onClick={onRetry}>
            Check now
          </Button>
        </div>
      </Card>
    </div>
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
    <div className="flex h-full items-center justify-center bg-bg">
      <Card className="w-[560px]">
        <h2 className="text-[16px] font-semibold text-ink">Monitoring policy</h2>
        <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto rounded-lg bg-surface-2 p-3 text-[12.5px] text-ink-2">
          <p>While a shift is running, this application records which applications and websites (domain only) you use, how long you are active or idle, and the number of keyboard and mouse events.</p>
          <p>It never records what you type, your clipboard, your screen, audio or camera. Nothing is recorded outside a shift. You can see your own data under “My activity”.</p>
          <p>Your employer has provided the full monitoring policy (version {policyVersion}). By continuing you confirm that you have read it.</p>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-4 w-4 accent-[#0F6B5C]" />I have read and accept the monitoring policy
        </label>
        {error && <div className="mt-2"><Banner tone="red">{error}</Banner></div>}
        <div className="mt-4 flex justify-end">
          <Button variant="primary" disabled={!agree || busy} onClick={accept}>
            Continue
          </Button>
        </div>
      </Card>
    </div>
  );
}
