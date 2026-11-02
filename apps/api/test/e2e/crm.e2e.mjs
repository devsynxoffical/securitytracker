// End-to-end smoke test of the CRM API against the local dev database.
const BASE = process.env.API_BASE_URL || 'http://localhost:4000/api/v1';
let token = '';
const results = [];

async function call(method, path, body, raw = false) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, text };
}
function check(name, cond, extra = '') {
  results.push({ name, ok: Boolean(cond), extra });
  if (!cond) console.log('FAIL', name, extra);
}

import { createHmac } from 'node:crypto';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(str) { let bits = 0, value = 0; const out = []; for (const ch of str.toUpperCase().replace(/=+$/, '')) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; } } return Buffer.from(out); }
function totp(secret, step = Math.floor(Date.now() / 30000)) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(step)); const d = createHmac('sha1', b32decode(secret)).update(b).digest(); const o = d[d.length - 1] & 0xf; const bin = ((d[o] & 0x7f) << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]; return String(bin % 1e6).padStart(6, '0'); }

// 1. login as Super Admin (seeded) with mandatory TOTP enrolment (FR-AUTH-07)
let r = await call('POST', '/admin/auth/login', { email: 'admin@devsynx.com', password: 'SuperAdmin123!' });
check('login step 1', r.status === 200, JSON.stringify(r.body).slice(0, 200));
let secret = process.env.SMOKE_TOTP_SECRET;
if (r.body?.enrollmentRequired) {
  const e = await call('POST', '/admin/auth/2fa/enroll', { tempToken: r.body.tempToken });
  check('2fa enroll returns otpauth url', e.status === 200 && e.body.otpauthUrl?.startsWith('otpauth://totp/'), JSON.stringify(e.body).slice(0, 200));
  secret = e.body.secret;
  const bad = await call('POST', '/admin/auth/2fa/confirm', { tempToken: r.body.tempToken, totpCode: '000000' });
  check('2fa confirm rejects wrong code', bad.status === 401 && bad.body?.error?.code === 'INVALID_TWO_FACTOR_CODE', JSON.stringify(bad.body).slice(0, 200));
  r = await call('POST', '/admin/auth/2fa/confirm', { tempToken: r.body.tempToken, totpCode: totp(secret) });
  check('2fa confirm opens session', r.status === 200 && r.body.tokens?.accessToken, JSON.stringify(r.body).slice(0, 200));
  console.log('ENROLLED, secret for re-runs: SMOKE_TOTP_SECRET=' + secret);
} else if (r.body?.requires2fa) {
  if (!secret) { console.log('2FA already enrolled; set SMOKE_TOTP_SECRET to the secret printed on first run'); process.exit(1); }
  r = await call('POST', '/admin/auth/2fa/verify', { tempToken: r.body.tempToken, totpCode: totp(secret) });
  check('2fa verify opens session', r.status === 200 && r.body.tokens?.accessToken, JSON.stringify(r.body).slice(0, 200));
  const again = await call('POST', '/admin/auth/login', { email: 'admin@devsynx.com', password: 'SuperAdmin123!', totpCode: totp(secret) });
  check('single-call login with code', again.status === 200 && again.body.tokens?.accessToken);
}
token = r.body?.tokens?.accessToken;
if (!token) { console.log('no token, aborting', r.body); process.exit(1); }

r = await call('GET', '/me');
check('me', r.status === 200, JSON.stringify(r.body).slice(0, 300));
console.log('ME:', JSON.stringify(r.body).slice(0, 400));

// 2. config lookups
r = await call('GET', '/crm/config/sources'); check('sources', r.status === 200 && r.body.length >= 6);
r = await call('GET', '/crm/config/lost-reasons'); const lostReason = r.body[0]; check('lost reasons', r.status === 200 && lostReason);
r = await call('GET', '/crm/config/tags'); const tag = r.body[0]; check('tags', r.status === 200 && tag);
r = await call('GET', '/pipelines?entity=deal'); const dealPipeline = r.body[0]; check('deal pipeline', r.status === 200 && dealPipeline?.entity === 'deal', JSON.stringify(r.body).slice(0, 200));
const openStage = dealPipeline.stages.find((s) => s.type === 'open');
const wonStage = dealPipeline.stages.find((s) => s.type === 'won');
const lostStage = dealPipeline.stages.find((s) => s.type === 'lost');
r = await call('GET', '/pipelines?entity=lead'); const leadPipeline = r.body[0]; check('lead pipeline', r.status === 200 && leadPipeline?.entity === 'lead');

// 3. custom field
r = await call('POST', '/crm/config/custom-fields', { entityType: 'deal', key: 'region', label: 'Region', type: 'select', options: ['EU', 'US'], required: false });
check('create custom field', r.status === 201 || r.status === 409, JSON.stringify(r.body).slice(0, 200));

// 4. account
const suffix = Date.now();
r = await call('POST', '/crm/accounts', { name: `Smoke Corp ${suffix}`, domain: `smoke${suffix}.example.com`, industry: 'Roofing', lifecycle: 'prospect', tagIds: [tag.id] });
check('create account', r.status === 201, JSON.stringify(r.body).slice(0, 300));
const account = r.body;
r = await call('POST', '/crm/accounts', { name: `smoke corp ${suffix}, Inc.`, lifecycle: 'prospect' });
check('account duplicate detected', r.status === 409 && r.body?.error?.code === 'ACCOUNT_DUPLICATE', JSON.stringify(r.body).slice(0, 200));

// 5. contact
r = await call('POST', '/crm/contacts', { firstName: 'Smoke', lastName: `Tester ${suffix}`, title: 'CFO', accountId: account.id, lifecycle: 'prospect', phones: [{ phone: `+1 555 ${String(suffix).slice(-7)}`, label: 'Mobile', isPrimary: true }], emails: [{ email: `smoke${suffix}@example.com`, label: 'Work', isPrimary: true }] });
check('create contact', r.status === 201, JSON.stringify(r.body).slice(0, 300));
const contact = r.body;
r = await call('POST', '/crm/contacts/check-duplicate', { emails: [`SMOKE${suffix}@example.com`] });
check('contact duplicate check', r.status === 201 && r.body.hasDuplicates === true, JSON.stringify(r.body).slice(0, 200));

// 6. deal with custom field + stage flow
r = await call('POST', '/crm/deals', { name: `Smoke Deal ${suffix}`, accountId: account.id, contacts: [{ contactId: contact.id, isPrimary: true }], pipelineId: dealPipeline.id, stageId: openStage.id, amount: 12000, currency: 'USD', customFields: { region: 'EU' } });
check('create deal', r.status === 201 && r.body.probability === openStage.probability, JSON.stringify(r.body).slice(0, 300));
const deal = r.body;
r = await call('POST', '/crm/deals', { name: 'bad', pipelineId: dealPipeline.id, stageId: openStage.id, customFields: { region: 'ASIA' } });
check('deal invalid custom field rejected', r.status === 422 && r.body?.error?.code === 'CUSTOM_FIELD_INVALID', JSON.stringify(r.body).slice(0, 200));
r = await call('POST', '/crm/deals', { name: 'bad', pipelineId: leadPipeline.id, stageId: leadPipeline.stages[0].id });
check('lead stage rejected for deal', r.status === 422 && r.body?.error?.code === 'PIPELINE_ENTITY_MISMATCH' || r.status === 404, JSON.stringify(r.body).slice(0, 200));
r = await call('POST', `/crm/deals/${deal.id}/stage`, { stageId: lostStage.id });
check('lost without reason rejected', r.status === 422 && r.body?.error?.code === 'LOST_REASON_REQUIRED', JSON.stringify(r.body).slice(0, 200));
r = await call('POST', `/crm/deals/${deal.id}/stage`, { stageId: wonStage.id });
check('deal won', r.status === 201 && r.body.wonAt, JSON.stringify(r.body).slice(0, 200));
r = await call('GET', `/crm/accounts/${account.id}`);
check('account became customer', r.status === 200 && r.body.lifecycle === 'customer' && r.body.deals.length === 1, JSON.stringify(r.body).slice(0, 200));
r = await call('GET', `/crm/deals/board?pipelineId=${dealPipeline.id}`);
check('deal board', r.status === 200 && r.body.columns.length === dealPipeline.stages.length, JSON.stringify(r.body).slice(0, 200));

// 7. activities
r = await call('POST', '/crm/activities', { entityType: 'contact', entityId: contact.id, type: 'task', subject: 'Send proposal', dueAt: new Date().toISOString() });
check('create planned task activity', r.status === 201 && r.body.status === 'planned', JSON.stringify(r.body).slice(0, 200));
const activity = r.body;
r = await call('GET', '/crm/activities/agenda?range=today');
check('agenda today includes task', r.status === 200 && r.body.items.some((a) => a.id === activity.id), JSON.stringify(r.body).slice(0, 200));
r = await call('PATCH', `/crm/activities/${activity.id}`, { status: 'done' });
check('mark activity done', r.status === 200 && r.body.status === 'done');
r = await call('GET', `/crm/activities?entityType=contact&entityId=${contact.id}`);
check('contact timeline', r.status === 200 && r.body.items.length >= 2, JSON.stringify(r.body.items.map((i) => i.type)));

// 8. lead -> convert
r = await call('POST', '/leads', { name: `Lead Person ${suffix}`, companyName: `Lead Co ${suffix}`, pipelineId: leadPipeline.id, stageId: leadPipeline.stages[0].id, value: 5000, currency: 'USD', phones: [{ phone: `+1 444 ${String(suffix).slice(-7)}`, label: 'Mobile', isPrimary: true }] });
check('create lead', r.status === 201, JSON.stringify(r.body).slice(0, 200));
const lead = r.body;
r = await call('POST', `/leads/${lead.id}/convert`, { contact: { firstName: 'Lead', lastName: `Person ${suffix}` }, account: { mode: 'new', name: `Lead Co ${suffix}` }, deal: { name: `Lead Co deal ${suffix}`, pipelineId: dealPipeline.id, stageId: openStage.id, currency: 'USD' } });
check('convert lead', r.status === 201 && r.body.contactId && r.body.accountId && r.body.dealId, JSON.stringify(r.body).slice(0, 300));
const conv = r.body;
r = await call('POST', `/leads/${lead.id}/convert`, { contact: { firstName: 'x', lastName: 'y' }, account: { mode: 'none' } });
check('second conversion rejected', r.status === 409 && r.body?.error?.code === 'LEAD_ALREADY_CONVERTED');
r = await call('GET', `/crm/deals/${conv.dealId}`);
check('converted deal amount from lead value', r.status === 200 && Number(r.body.amount) === 5000 && r.body.contacts.length === 1, JSON.stringify(r.body).slice(0, 200));
r = await call('GET', `/leads/${lead.id}`);
check('lead frozen', r.status === 200 && r.body.convertedAt && r.body.contactId === conv.contactId);

// 9. bulk + tags
r = await call('POST', '/crm/contacts/bulk', { ids: [contact.id, conv.contactId], action: 'add_tag', tagId: tag.id });
check('bulk add tag', r.status === 201 && r.body.count === 2, JSON.stringify(r.body));
r = await call('GET', `/crm/contacts?tagId=${tag.id}&limit=5`);
check('list filtered by tag', r.status === 200 && r.body.items.length >= 2 && r.body.items[0].tags.length >= 1, JSON.stringify(r.body).slice(0, 200));

// 10. import (contacts)
const csv = `First Name,Last Name,Email,Phone,Company\nImp,One ${suffix},imp1-${suffix}@example.com,555${String(suffix).slice(-7)},Import Co ${suffix}\nImp,Two ${suffix},imp2-${suffix}@example.com,556${String(suffix).slice(-7)},Import Co ${suffix}\nBad,,not-an-email,,\n`;
r = await call('POST', '/crm/contacts/import', { fileName: 'contacts.csv', csv });
check('import upload', r.status === 201 && r.body.status === 'mapping' && r.body.rowCount === 3, JSON.stringify(r.body).slice(0, 300));
const job = r.body;
check('import suggested mapping', job.suggestedMapping?.['First Name'] === 'firstName' && job.suggestedMapping?.['Email'] === 'email', JSON.stringify(job.suggestedMapping));
r = await call('POST', `/crm/import/${job.id}/start`, { mapping: { 'First Name': 'firstName', 'Last Name': 'lastName', Email: 'email', Phone: 'phone', Company: 'accountName' }, duplicateMode: 'skip', tagIds: [tag.id] });
check('import start', r.status === 201 && r.body.status === 'queued', JSON.stringify(r.body).slice(0, 200));
let done;
for (let i = 0; i < 30; i++) { await new Promise((res) => setTimeout(res, 300)); r = await call('GET', `/crm/import/${job.id}`); if (r.body.status === 'done' || r.body.status === 'failed') { done = r.body; break; } }
check('import finished', done?.status === 'done' && done.totals.created === 2 && done.totals.failed === 1, JSON.stringify(done?.totals) + ' ' + JSON.stringify(done?.errors));
r = await call('POST', `/crm/import/${job.id}/start`, { mapping: {}, duplicateMode: 'skip' });
check('import start idempotent (409)', r.status === 409);

// 11. search, dashboard, export, views
r = await call('GET', `/crm/search?q=Smoke`);
check('search', r.status === 200 && r.body.accounts.length >= 1 && r.body.contacts.length >= 1 && r.body.deals.length >= 1, JSON.stringify(r.body).slice(0, 200));
r = await call('GET', '/crm/dashboard');
check('dashboard', r.status === 200 && r.body.kpis.wonThisMonth >= 1 && Array.isArray(r.body.byStage), JSON.stringify(r.body.kpis));
// FR-SEC-20: exports are off by default; the suite runs as Super Admin, so enable the Super Admin policy first.
r = await call('PATCH', '/settings', { dataExportPolicy: 'super_admin' }); check('settings: export policy super_admin', r.status === 200 && r.body.dataExportPolicy === 'super_admin', JSON.stringify(r.body).slice(0, 200));
r = await call('GET', '/crm/deals/export?status=won');
check('export csv', r.status === 200 && r.text.startsWith('Name,Account,Pipeline') && r.text.includes(`Smoke Deal ${suffix}`), r.text.slice(0, 120));
r = await call('POST', '/crm/views', { entityType: 'deal', name: `My won deals ${suffix}`, visibility: 'private', filters: { status: 'won' } });
check('saved view', r.status === 201, JSON.stringify(r.body).slice(0, 200));
r = await call('GET', '/crm/views?entityType=deal');
check('list views', r.status === 200 && r.body.length >= 1);

// 12. pipeline stage mgmt
r = await call('POST', `/pipelines/${dealPipeline.id}/stages/reorder`, { stageIds: [...dealPipeline.stages.map((s) => s.id)].reverse() });
check('reorder stages', r.status === 201 && r.body[0].id === dealPipeline.stages.at(-1).id);
r = await call('POST', `/pipelines/${dealPipeline.id}/stages/reorder`, { stageIds: dealPipeline.stages.map((s) => s.id) });
check('reorder back', r.status === 201);

// 13. audit entries written for writes
r = await call('GET', '/audit-logs');
check('audit log has crm writes', r.status === 200 && JSON.stringify(r.body).includes('/crm/'), JSON.stringify(r.body).slice(0, 150));

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(' -', f.name, f.extra);
process.exit(failed.length ? 1 : 0);
