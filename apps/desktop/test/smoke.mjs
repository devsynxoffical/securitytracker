/**
 * Desktop smoke test: launches the built app (unpacked `out/` in development, or the packaged
 * executable via WORKPULSE_EXECUTABLE in CI on Windows, macOS and Linux) and checks that the
 * window opens, the renderer boots without errors, the first-run server screen rejects a bad
 * address and accepts a reachable API when WORKPULSE_API_URL is set, and the login form answers.
 *
 *   node test/smoke.mjs                                   # dev build in out/
 *   WORKPULSE_EXECUTABLE=dist/win-unpacked/WorkPulse.exe node test/smoke.mjs
 *   WORKPULSE_API_URL=http://localhost:4000/api/v1 node test/smoke.mjs   # also exercises login
 */
import { _electron as electron } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` ${extra}` : ''}`);
};

const userData = mkdtempSync(join(tmpdir(), 'workpulse-smoke-'));
const executablePath = process.env.WORKPULSE_EXECUTABLE ? resolve(process.env.WORKPULSE_EXECUTABLE) : undefined;
const apiUrl = process.env.WORKPULSE_API_URL ?? '';
const launchArgs = [`--user-data-dir=${userData}`, '--no-sandbox', '--disable-gpu'];
if (!executablePath) launchArgs.unshift(resolve('out/main/index.js'));

const app = await electron.launch({
  executablePath,
  args: launchArgs,
  env: { ...process.env, COMPANYOS_API_URL: '', COMPANYOS_DEV_TRACKER: '1', ELECTRON_ENABLE_LOGGING: '1' },
  timeout: 60_000,
});
const errors = [];
app.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

try {
  const win = await app.firstWindow({ timeout: 60_000 });
  win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await win.waitForLoadState('domcontentloaded');
  check('window opened', true);
  check('title', (await win.title()) === 'WorkPulse Workstation', await win.title());

  const info = await app.evaluate(({ app }) => ({ version: app.getVersion(), name: app.getName(), packaged: app.isPackaged }));
  check('app version present', /^\d+\.\d+\.\d+/.test(info.version), JSON.stringify(info));

  // First run: no server configured -> server screen.
  await win.getByText('Connect to your company').waitFor({ timeout: 20_000 });
  check('first-run server screen shown', true);
  const input = win.getByPlaceholder('api.yourcompany.com');
  await input.fill('http://127.0.0.1:9/api/v1'); // closed port: must fail fast with a readable message
  await win.getByRole('button', { name: 'Connect' }).click();
  await win.getByText(/Cannot reach|Server answered/).waitFor({ timeout: 20_000 });
  check('unreachable server rejected with a message', true);

  if (apiUrl) {
    await input.fill(apiUrl);
    await win.getByRole('button', { name: 'Connect' }).click();
    await win.getByText('Employee code or company email').waitFor({ timeout: 20_000 });
    check('reachable server accepted, login shown', true);
    await win.getByPlaceholder('EMP-0021 or name@company.com').fill('nobody@example.com');
    await win.locator('input[type="password"]').fill('wrong-password');
    await win.getByRole('button', { name: 'Sign in' }).click();
    await win.getByText(/Wrong employee code|Login failed|Too many attempts/).waitFor({ timeout: 20_000 });
    check('login round trip: server answered the signed login', true);
    const saved = await app.evaluate(({ app }) => {
      const fs = process.getBuiltinModule('node:fs');
      const path = process.getBuiltinModule('node:path');
      try { return fs.readFileSync(path.join(app.getPath('userData'), 'state.json'), 'utf8'); } catch { return ''; }
    });
    check('tokens never written in plain text', !/eyJ[A-Za-z0-9_-]{20,}/.test(saved));
  } else {
    console.log('skip login round trip (WORKPULSE_API_URL not set)');
  }

  const fatal = errors.filter((e) => !/net::ERR|Failed to load resource|fonts\.g/.test(e));
  check('no renderer errors', fatal.length === 0, fatal.join(' | ').slice(0, 300));
} catch (e) {
  check('smoke run completed', false, e.message);
} finally {
  await app.close().catch(() => {});
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
