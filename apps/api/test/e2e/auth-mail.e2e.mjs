// Smoke: setup/sign-up status, password reset, mail collaboration on the demo mailbox, templates, CRM threads.
import { createHmac } from 'node:crypto';
const BASE = process.env.API_BASE_URL || 'http://localhost:4000/api/v1'; let token = ''; const results = [];
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(str) { let bits = 0, value = 0; const out = []; for (const ch of str.toUpperCase().replace(/=+$/, '')) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; } } return Buffer.from(out); }
function totp(secret, step = Math.floor(Date.now() / 30000)) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(step)); const d = createHmac('sha1', b32decode(secret)).update(b).digest(); const o = d[d.length - 1] & 0xf; const bin = ((d[o] & 0x7f) << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]; return String(bin % 1e6).padStart(6, '0'); }
async function call(method, path, body, auth = true) { const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; } return { status: res.status, body: json, text }; }
const short = (x) => JSON.stringify(x).slice(0, 200); const arr = (x) => (Array.isArray(x) ? x : Array.isArray(x?.items) ? x.items : []);
function check(name, cond, extra = '') { results.push({ name, ok: Boolean(cond), extra }); if (!cond) console.log('FAIL', name, extra); }
const suffix = Date.now();

// setup + reset (public)
let r = await call('GET', '/setup/status', undefined, false); check('setup: status false on seeded db', r.status === 200 && r.body.needsSetup === false, short(r.body));
r = await call('POST', '/setup/bootstrap', { companyName: 'Smoke Co', timezone: 'UTC', firstName: 'Ann', lastName: 'Bee', email: 'ann@smoke.example.com', password: 'LongPassword123!' }, false); check('setup: bootstrap refused (409)', r.status === 409, short(r.body));
r = await call('POST', '/auth/forgot-password', { email: 'nobody@example.com' }, false); check('reset: forgot always 200', r.status === 200 || r.status === 201, short(r.body));
r = await call('POST', '/auth/forgot-password', { email: 'sam.parker@company.com' }, false); check('reset: dev link returned outside production', r.body?.devResetUrl?.includes('token='), short(r.body));
const resetToken = r.body?.devResetUrl ? new URL(r.body.devResetUrl).searchParams.get('token') : null;
r = await call('POST', '/auth/reset-password', { token: resetToken, newPassword: 'NewPassword123!' }, false); check('reset: password reset ok', r.status === 200 || r.status === 201, short(r.body));
r = await call('POST', '/auth/reset-password', { token: resetToken, newPassword: 'NewPassword123!' }, false); check('reset: token single use', r.status >= 400, short(r.body));

// login
r = await call('POST', '/admin/auth/login', { email: 'admin@devsynx.com', password: 'SuperAdmin123!' }, false);
if (r.body?.requires2fa) r = await call('POST', '/admin/auth/2fa/verify', { tempToken: r.body.tempToken, totpCode: totp(process.env.SMOKE_TOTP_SECRET) }, false);
token = r.body?.tokens?.accessToken; if (!token) { console.log('no token', r.body); process.exit(1); }
const employees = arr((await call('GET', '/employees')).body); const dan = employees.find((e) => e.code === 'EMP-0021');

// mail collaboration on demo mailbox
r = await call('GET', '/mail/mailboxes'); const mb = arr(r.body).find((m) => m.address === 'demo-sales@example.com'); check('mail: demo mailbox listed', Boolean(mb), short(r.body));
r = await call('GET', `/mail/mailboxes/${mb.id}/conversations/counts`); check('mail: counts', r.status === 200 && r.body.unassigned >= 1, short(r.body));
r = await call('GET', `/mail/mailboxes/${mb.id}/conversations?view=unassigned`); const conv = arr(r.body)[0]; check('mail: unassigned list', r.status === 200 && conv, short(r.body));
r = await call('POST', `/mail/mailboxes/${mb.id}/threads/${conv.id}/assign`, { assigneeId: dan.id }); check('mail: assign to Daniyal', r.status === 201 && r.body.assigneeId === dan.id, short(r.body));
r = await call('GET', `/mail/mailboxes/${mb.id}/conversations?view=open&assigneeId=${dan.id}`); check('mail: assignee filter', r.status === 200 && arr(r.body).some((c) => c.id === conv.id), short(r.body));
r = await call('POST', `/mail/mailboxes/${mb.id}/threads/${conv.id}/comments`, { body: `Internal note ${suffix} @Daniyal`, mentions: [dan.id] }); check('mail: internal comment with mention', r.status === 201, short(r.body));
r = await call('GET', '/mail/labels'); const label = arr(r.body)[0];
r = await call('POST', `/mail/mailboxes/${mb.id}/threads/${conv.id}/labels/${label.id}`); check('mail: add label', r.status === 201 || r.status === 200, short(r.body));
r = await call('POST', `/mail/mailboxes/${mb.id}/threads/${conv.id}/status`, { status: 'snoozed', snoozedUntil: new Date(Date.now() - 1000).toISOString() }); check('mail: snooze in past rejected', r.status >= 400 && r.body?.error?.code === 'MAIL_SNOOZE_IN_PAST', short(r.body));
r = await call('POST', `/mail/mailboxes/${mb.id}/threads/${conv.id}/status`, { status: 'closed' }); check('mail: close', r.status === 201 && r.body.status === 'closed', short(r.body));
r = await call('POST', `/mail/mailboxes/${mb.id}/threads/${conv.id}/status`, { status: 'open' }); check('mail: reopen', r.status === 201 && r.body.status === 'open', short(r.body));
r = await call('GET', `/mail/mailboxes/${mb.id}/threads/${conv.id}/events`); check('mail: events recorded', r.status === 200 && arr(r.body).length >= 4, short(r.body));
r = await call('GET', `/mail/mailboxes/${mb.id}/threads/${conv.id}`); check('mail: thread detail', r.status === 200, short(r.body));
r = await call('POST', `/mail/mailboxes/${mb.id}/send`, { to: ['x@example.com'], subject: 'hi', html: '<p>hi</p>' }); check('mail: demo mailbox refuses send (422)', r.status === 422, short(r.body));
r = await call('GET', `/mail/mailboxes/${mb.id}/sync`); check('mail: demo mailbox refuses sync', r.status >= 400, short(r.body));
r = await call('POST', '/mail/templates', { name: `T ${suffix}`, subject: 'Hello {{contact.firstName}}', bodyHtml: '<p>Hi {{contact.firstName}} from {{me.firstName}}</p>', shared: true }); const tpl = r.body;
r = await call('GET', `/mail/mailboxes/${mb.id}/conversations?view=all`); const linked = arr(r.body).find((c) => c.contactId); check('mail: a conversation auto-linked to a contact', Boolean(linked), short(r.body).slice(0, 120));
if (linked) { r = await call('POST', `/mail/templates/${tpl.id}/render`, { threadId: linked.id }); check('mail: template render fills contact + me', r.status === 201 || r.status === 200, short(r.body)); check('mail: no unresolved contact placeholder', !String(r.body?.bodyHtml ?? r.body?.html ?? '').includes('{{contact'), short(r.body)); r = await call('GET', `/crm/contacts/${linked.contactId}/threads`); check('crm: contact shows its threads', r.status === 200 && arr(r.body).length >= 1, short(r.body)); }
r = await call('GET', '/mail/mailboxes/health'); check('mail: health shows demo', r.status === 200 && JSON.stringify(r.body).includes('demo'), short(r.body));
r = await call('GET', '/mail/audit'); check('mail: audit list', r.status === 200, short(r.body));
r = await call('GET', '/jobs/status'); check('jobs: status', r.status === 200, short(r.body));
r = await call('POST', '/jobs/mail-unsnooze/run'); check('jobs: manual run', r.status === 201 || r.status === 200, short(r.body));
r = await call('GET', '/files/status'); check('files: status', r.status === 200, short(r.body));

const failed = results.filter((x) => !x.ok); console.log(`\n${results.length - failed.length}/${results.length} checks passed`); for (const f of failed) console.log(' -', f.name, f.extra); process.exit(failed.length ? 1 : 0);
