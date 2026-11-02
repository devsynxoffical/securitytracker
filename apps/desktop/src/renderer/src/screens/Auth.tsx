import { useEffect, useState } from 'react';
import { ShieldCheck, Lock, Settings2 } from 'lucide-react';
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
  const [apiUrl, setApiUrl] = useState('');
  const [deviceName, setDeviceName] = useState('');

  useEffect(() => {
    void bridge.app.info().then((i: { apiUrl: string; deviceName: string }) => {
      setApiUrl(i.apiUrl);
      setDeviceName(i.deviceName);
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

  if (outcome?.kind === 'pending') return <DevicePending message={outcome.message} onRetry={submit} onBack={() => setOutcome(null)} deviceName={deviceName} />;

  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <div className="w-[400px]">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pri font-mono text-sm font-semibold text-white">OS</span>
          <div>
            <div className="text-[17px] font-semibold text-ink">Company OS</div>
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
            <div className="mt-2 space-y-2 rounded-lg bg-surface-2 p-3">
              <Field label="API URL" hint="Set by IT. Only change if instructed.">
                <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} onBlur={() => void bridge.app.setApiUrl(apiUrl)} />
              </Field>
              <div className="text-[11.5px] text-ink-3">
                Device: <span className="font-mono">{deviceName}</span>
              </div>
            </div>
          )}
        </Card>
        <p className="mt-4 text-center text-[11.5px] text-ink-3">Activity is tracked only while a shift is running. Counts only, never content.</p>
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
