// Shared QA harness: static server for apps/admin/out, real 2FA login, error capture, flow runner.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
const req = createRequire(import.meta.url);
function requireEnv(name) { const v = process.env[name]; if (!v) { console.error(`Missing ${name}`); process.exit(2); } return v; }
const { chromium } = req(process.env.PLAYWRIGHT_MODULE || 'playwright');

export const OUT = '/home/user/securitytracker/apps/admin/out';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
export const QA = process.env.QA_OUT_DIR || dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.QA_PORT || 3999);
export const BASE = `http://localhost:${PORT}`;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(str) { let bits = 0, value = 0; const out = []; for (const ch of str.toUpperCase().replace(/=+$/, '')) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; } } return Buffer.from(out); }
export function totp(secret, step = Math.floor(Date.now() / 30000)) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(step)); const d = createHmac('sha1', b32decode(secret)).update(b).digest(); const o = d[d.length - 1] & 0xf; const bin = ((d[o] & 0x7f) << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]; return String(bin % 1e6).padStart(6, '0'); }
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };

export function serve() {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    let f = path.join(OUT, p);
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) f = path.join(OUT, p + '.html');
    if (!fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}

export async function openSession({ headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push({ kind: 'pageerror', msg: e.message }));
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ kind: 'console', msg: m.text().slice(0, 300) }); });
  page.on('response', (r) => { const u = r.url(); if (r.status() >= 400 && u.includes('/api/v1/')) errors.push({ kind: 'http', msg: `${r.status()} ${r.request().method()} ${u.replace('http://localhost:4000/api/v1', '')}` }); });
  await page.goto(`${BASE}/admin`);
  await page.waitForTimeout(500);
  await page.evaluate(() => sessionStorage.setItem('companyos.admin.apiUrl', 'http://localhost:4000/api/v1'));
  await page.reload();
  await page.locator('input[type="email"]').first().fill(process.env.QA_EMAIL || 'admin@devsynx.com');
  await page.locator('input[type="password"]').first().fill(process.env.QA_PASSWORD || 'SuperAdmin123!');
  await page.locator('button[type="submit"]').first().click();
  await page.locator('input[aria-label="Digit 1"]').waitFor({ timeout: 8000 });
  await page.locator('input[aria-label="Digit 1"]').click();
  await page.keyboard.type(totp(requireEnv('QA_TOTP_SECRET')), { delay: 40 });
  await page.waitForURL(/\/admin(?:\/)?(?:\?.*)?$/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  errors.length = 0; // ignore pre-login noise
  return { browser, page, errors };
}

export const current = { step: '' };
export const step = (name) => { current.step = name; };
export function makeRunner(page, errors) {
  const results = [];
  return {
    results,
    async flow(name, fn) {
      const before = errors.length;
      const t0 = Date.now();
      current.step = '';
      try {
        await fn();
        const errs = errors.slice(before);
        results.push({ name, ok: errs.length === 0, errs, ms: Date.now() - t0 });
      } catch (e) {
        const errs = errors.slice(before);
        results.push({ name, ok: false, errs: [...errs, { kind: 'assert', msg: `[step: ${current.step}] ` + String(e.message).split('\n').filter((l) => l.trim()).slice(0, 4).join(' | ') }], ms: Date.now() - t0 });
        try { await page.screenshot({ path: `${QA}/fail-${name.replace(/[^a-z0-9]+/gi, '_')}.png` }); } catch { /* ignore */ }
      }
    },
    report() {
      for (const r of results) {
        console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} (${r.ms}ms)`);
        for (const e of r.errs) console.log(`      - [${e.kind}] ${e.msg}`);
      }
      const failed = results.filter((r) => !r.ok).length;
      console.log(`\n${results.length - failed}/${results.length} flows passed`);
      return failed;
    },
  };
}

export const uid = () => String(Date.now()).slice(-6);
export async function go(page, route) { await page.goto(route ? `${BASE}/admin/${route}` : `${BASE}/admin`); await page.waitForTimeout(900); }
export async function noRawError(page) {
  const txt = await page.locator('main').innerText().catch(() => '');
  if (/"error":\s*\{|Internal Server Error|\[object Object\]/i.test(txt)) throw new Error('raw error text on page');
}
