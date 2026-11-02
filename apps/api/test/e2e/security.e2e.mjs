// End-to-end checks for data containment and immediate revocation (08 section 9, FR-SEC-20 to FR-SEC-27).
import { createHmac } from 'node:crypto';
const BASE = process.env.API_BASE_URL || 'http://localhost:4000/api/v1';
let token = '';
const results = [];
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(str) { let bits = 0, value = 0; const out = []; for (const ch of str.toUpperCase().replace(/=+$/, '')) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; } } return Buffer.from(out); }
function totp(secret, step = Math.floor(Date.now() / 30000)) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(step)); const d = createHmac('sha1', b32decode(secret)).update(b).digest(); const o = d[d.length - 1] & 0xf; const bin = ((d[o] & 0x7f) << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]; return String(bin % 1e6).padStart(6, '0'); }

async function call(method, path, body, headers = {}, auth = token) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, text };
}
const short = (x) => JSON.stringify(x).slice(0, 220);
function check(name, cond, extra = '') { results.push({ name, ok: Boolean(cond), extra }); if (!cond) console.log('FAIL', name, extra); }
const suffix = Date.now();
const month = new Date().toISOString().slice(0, 7);
const today = new Date().toISOString().slice(0, 10);

// login as the seeded Super Admin (2FA already enrolled by the crm suite)
let r = await call('POST', '/admin/auth/login', { email: 'admin@devsynx.com', password: 'SuperAdmin123!' });
const secret = process.env.SMOKE_TOTP_SECRET;
if (r.body?.requires2fa) r = await call('POST', '/admin/auth/2fa/verify', { tempToken: r.body.tempToken, totpCode: totp(secret) });
token = r.body?.tokens?.accessToken; if (!token) { console.log('no token', r.body); process.exit(1); }
const me = (await call('GET', '/me')).body;
check('me carries dataExportPolicy', ['disabled', 'super_admin', 'permission'].includes(me.dataExportPolicy), short(me.dataExportPolicy));

const before = (await call('GET', '/settings')).body;
check('settings: dataExportPolicy present', ['disabled', 'super_admin', 'permission'].includes(before.dataExportPolicy), short(before));

// ---------------- FR-SEC-20: disabled -> 403 EXPORT_DISABLED on every export route ----------------
r = await call('PATCH', '/settings', { dataExportPolicy: 'disabled' });
check('settings: set disabled', r.status === 200 && r.body.dataExportPolicy === 'disabled', short(r.body));
const exportRoutes = [
  '/crm/deals/export', '/crm/contacts/export', '/crm/accounts/export', '/employees/export',
  `/attendance/sheet?month=${month}&format=csv`, `/reports/attendance?from=${today}&to=${today}&format=csv`,
  `/tracking/timesheet/team?from=${today}&to=${today}&format=csv`,
];
for (const route of exportRoutes) {
  r = await call('GET', route);
  check(`disabled: ${route.split('?')[0]} -> 403 EXPORT_DISABLED`, r.status === 403 && r.body?.error?.code === 'EXPORT_DISABLED', `${r.status} ${short(r.body)}`);
}
r = await call('GET', `/attendance/sheet?month=${month}`); check('disabled: attendance sheet JSON still served', r.status === 200, short(r.body));
r = await call('GET', `/tracking/timesheet/team?from=${today}&to=${today}`); check('disabled: team timesheet JSON still served', r.status === 200, short(r.body));
r = await call('GET', '/me'); check('me reflects disabled', r.body.dataExportPolicy === 'disabled', short(r.body.dataExportPolicy));

// ---------------- super_admin -> 200 for the Super Admin, audited ----------------
r = await call('PATCH', '/settings', { dataExportPolicy: 'super_admin' });
check('settings: set super_admin', r.status === 200 && r.body.dataExportPolicy === 'super_admin', short(r.body));
r = await call('GET', '/crm/deals/export');
check('super_admin: deals export 200 csv', r.status === 200 && r.text.startsWith('Name,'), `${r.status} ${r.text.slice(0, 60)}`);
r = await call('GET', '/audit-logs?limit=20');
const logs = Array.isArray(r.body) ? r.body : r.body?.items ?? [];
check('super_admin: export audit entry written', logs.some((l) => l.action === 'export' && String(l.after?.url ?? '').includes('/crm/deals/export')), short(logs.slice(0, 3).map((l) => l.action)));
r = await call('GET', `/attendance/sheet?month=${month}&format=csv`); check('super_admin: attendance csv 200', r.status === 200 && r.text.includes(','), r.text.slice(0, 60));

// ---------------- permission -> 200 (route permission decides) ----------------
r = await call('PATCH', '/settings', { dataExportPolicy: 'permission' });
check('settings: set permission', r.status === 200 && r.body.dataExportPolicy === 'permission', short(r.body));
r = await call('GET', '/employees/export'); check('permission: employees export 200', r.status === 200 && r.text.startsWith('Code,'), r.text.slice(0, 60));
r = await call('PATCH', '/settings', { dataExportPolicy: 'everyone' }); check('settings: unknown policy rejected', r.status === 400, short(r.body));

// ---------------- FR-SEC-24 / 26: suspend and restore ----------------
const roles = (await call('GET', '/roles')).body;
const adminRole = (Array.isArray(roles) ? roles : roles.items ?? []).find((x) => x.name === 'Admin');
const password = `Susp3nd!${suffix}`;
r = await call('POST', '/employees', { firstName: 'Suspend', lastName: `Test ${suffix}`, email: `suspend-${suffix}@example.com`, password, roleId: adminRole?.id });
check('suspend: create test employee', r.status === 201 && r.body.employee?.id, short(r.body));
const empId = r.body.employee?.id;
r = await call('POST', '/admin/auth/login', { email: `suspend-${suffix}@example.com`, password });
check('suspend: employee can start admin login before suspension', r.status === 200 || r.status === 201, `${r.status} ${short(r.body)}`);

r = await call('POST', `/employees/${empId}/suspend`, {}); check('suspend: reason required (400)', r.status === 400, short(r.body));
r = await call('POST', `/employees/${empId}/suspend`, { reason: 'e2e suspension' });
check('suspend: 201 status suspended', r.status === 201 && r.body.status === 'suspended', short(r.body));
r = await call('GET', '/employees'); check('suspend: GET /employees shows suspended', r.body.some((e) => e.id === empId && e.status === 'suspended'), '');
r = await call('GET', '/employees?status=suspended'); check('suspend: status filter', Array.isArray(r.body) && r.body.some((e) => e.id === empId), short(r.body));
r = await call('POST', '/admin/auth/login', { email: `suspend-${suffix}@example.com`, password });
check('suspend: admin login refused with ACCOUNT_SUSPENDED', r.status === 403 && r.body?.error?.code === 'ACCOUNT_SUSPENDED', `${r.status} ${short(r.body)}`);
r = await call('GET', `/sessions?employeeId=${empId}&active=true`); check('suspend: no active sessions', r.status === 200 && (r.body.items ?? r.body).length === 0, short(r.body));
r = await call('POST', `/employees/${empId}/suspend`, { reason: 'again' }); check('suspend: suspending twice is idempotent (201)', r.status === 201, short(r.body));
r = await call('GET', `/employees/${me.id}`);
r = await call('POST', `/employees/${me.id}/suspend`, { reason: 'self' }); check('suspend: cannot suspend yourself (403)', r.status === 403, short(r.body));

r = await call('POST', `/employees/${empId}/restore`); check('restore: 201 status active', r.status === 201 && r.body.status === 'active', short(r.body));
r = await call('POST', `/employees/${empId}/restore`); check('restore: active employee cannot be restored (409)', r.status === 409, short(r.body));
r = await call('POST', '/admin/auth/login', { email: `suspend-${suffix}@example.com`, password });
check('restore: login works again', r.status === 200 || r.status === 201, `${r.status} ${short(r.body)}`);
r = await call('GET', '/audit-logs?limit=50');
const logs2 = Array.isArray(r.body) ? r.body : r.body?.items ?? [];
check('audit: suspend and restore recorded', logs2.some((l) => l.action.includes(`/employees/${empId}/suspend`)) && logs2.some((l) => l.action.includes(`/employees/${empId}/restore`)), '');

// cleanup: disable the test employee, put the policy back where it was
await call('POST', `/employees/${empId}/disable`, {});
r = await call('PATCH', '/settings', { dataExportPolicy: before.dataExportPolicy });
check('settings: policy restored', r.status === 200 && r.body.dataExportPolicy === before.dataExportPolicy, short(r.body));

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(' -', f.name, f.extra);
process.exit(failed.length ? 1 : 0);
