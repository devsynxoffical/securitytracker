// End-to-end smoke test for internal chat (22-internal-chat-spec.md). Runs as the seeded Super Admin plus a
// freshly created Employee (second login) for the non-member and moderation cases.
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
const arr = (x) => (Array.isArray(x) ? x : Array.isArray(x?.items) ? x.items : []);
function check(name, cond, extra = '') { results.push({ name, ok: Boolean(cond), extra }); if (!cond) console.log('FAIL', name, extra); }
const suffix = Date.now();

// ---------------- login as Super Admin (2FA already enrolled) ----------------
let r = await call('POST', '/admin/auth/login', { email: 'admin@devsynx.com', password: 'SuperAdmin123!' });
const secret = process.env.SMOKE_TOTP_SECRET;
if (r.body?.requires2fa) r = await call('POST', '/admin/auth/2fa/verify', { tempToken: r.body.tempToken, totpCode: totp(secret) });
token = r.body?.tokens?.accessToken; if (!token) { console.log('no token', r.body); process.exit(1); }
const me = (await call('GET', '/me')).body;
const employees = arr((await call('GET', '/employees')).body);
const other = employees.find((e) => e.id !== me.id && e.status === 'active');
check('setup: another active employee exists', Boolean(other), short(employees).slice(0, 100));

// ---------------- channels ----------------
r = await call('GET', '/chat/channels'); check('chat: list channels', r.status === 200 && Array.isArray(r.body), short(r.body));
const company = arr(r.body).find((c) => c.kind === 'company');
check('chat: company channel exists and I am a member', company && company.isMember === true && typeof company.unreadCount === 'number', short(company));

r = await call('POST', '/chat/channels', { kind: 'group', name: `Smoke ${suffix}`, memberIds: [other.id] });
check('chat: create group with another member', r.status === 201 && r.body.kind === 'group' && r.body.members.length === 2, short(r.body)); const group = r.body;

r = await call('POST', '/chat/channels/direct', { employeeId: other.id });
check('chat: direct channel created', r.status === 201 && r.body.kind === 'direct' && r.body.counterpart?.id === other.id, short(r.body)); const direct = r.body;
r = await call('POST', '/chat/channels/direct', { employeeId: other.id });
check('chat: direct channel is reused (same id)', r.status === 201 && r.body.id === direct.id, short(r.body));
r = await call('POST', '/chat/channels/direct', { employeeId: me.id });
check('chat: direct to self rejected (CHAT_DIRECT_SELF)', r.status === 422 && r.body?.error?.code === 'CHAT_DIRECT_SELF', short(r.body));

// ---------------- messages ----------------
const key = `smoke-${suffix}`;
r = await call('POST', `/chat/channels/${group.id}/messages`, { body: `Hello @${other.firstName} ${other.lastName}, first message ${suffix}` }, { 'Idempotency-Key': key });
check('chat: send message resolves mention', r.status === 201 && r.body.mentions?.includes(other.id) && r.body.id, short(r.body)); const msg = r.body;
r = await call('POST', `/chat/channels/${group.id}/messages`, { body: `Hello @${other.firstName} ${other.lastName}, first message ${suffix}` }, { 'Idempotency-Key': key });
check('chat: same Idempotency-Key returns the same message', r.status === 201 && r.body.id === msg.id, short(r.body));
r = await call('GET', `/chat/channels/${group.id}/messages?limit=50`);
check('chat: list messages has exactly one message', r.status === 200 && arr(r.body).length === 1 && arr(r.body)[0].id === msg.id && r.body.nextCursor === null, short(r.body));
r = await call('GET', `/chat/channels/${group.id}/messages?limit=50&cursor=${msg.id}`);
check('chat: cursor before the first message is empty', r.status === 200 && arr(r.body).length === 0, short(r.body));

r = await call('PATCH', `/chat/messages/${msg.id}`, { body: `Edited ${suffix} searchable-token-${suffix}` });
check('chat: edit own message within window marks edited', r.status === 200 && r.body.editedAt && r.body.body.startsWith('Edited'), short(r.body));

r = await call('POST', `/chat/channels/${group.id}/messages`, { body: `Second ${suffix}` });
check('chat: second message', r.status === 201, short(r.body)); const msg2 = r.body;
r = await call('POST', `/chat/channels/${group.id}/read`, { lastReadMessageId: msg2.id });
check('chat: read cursor set', r.status === 200 && r.body.lastReadMessageId === msg2.id && r.body.unreadCount === 0, short(r.body));
r = await call('POST', `/chat/channels/${group.id}/read`, { lastReadMessageId: msg.id });
check('chat: read cursor never moves backwards', r.status === 200 && r.body.lastReadMessageId === msg2.id, short(r.body));
r = await call('GET', '/chat/unread'); check('chat: unread totals', r.status === 200 && typeof r.body.total === 'number' && Array.isArray(r.body.channels), short(r.body));
r = await call('POST', `/chat/channels/${group.id}/typing`); check('chat: typing broadcast', r.status === 200 && r.body.broadcast === true, short(r.body));
r = await call('POST', `/chat/channels/${group.id}/typing`); check('chat: typing rate limited (429)', r.status === 429, short(r.body));

r = await call('GET', `/chat/search?q=searchable-token-${suffix}`);
check('chat: full-text search finds the edited message', r.status === 200 && arr(r.body).some((m) => m.id === msg.id), short(r.body));
r = await call('GET', `/chat/search?q=searchable-token-${suffix}&channelId=${direct.id}`);
check('chat: search scoped to another channel finds nothing', r.status === 200 && arr(r.body).length === 0, short(r.body));

r = await call('POST', `/chat/channels/${group.id}/messages`, { body: 'with a bad link', recordRef: { type: 'task', id: '00000000-0000-0000-0000-000000000000' } });
check('chat: record ref to a missing record yields no card', r.status === 201 && r.body.recordRef?.type === 'task' && r.body.recordCard === null, short(r.body));

// ---------------- second user: non-member denied, moderation ----------------
const roles = arr((await call('GET', '/roles')).body);
const employeeRole = roles.find((x) => x.name === 'Employee');
const pw = `Smoke!${suffix}a`;
r = await call('POST', '/employees', { firstName: 'Chat', lastName: `Smoke${suffix}`, email: `chat.smoke.${suffix}@devsynx.com`, password: pw, roleId: employeeRole?.id });
check('setup: create plain employee', r.status === 201, short(r.body));
const plainId = r.body?.employee?.id ?? r.body?.id;
let plainToken = '';
{
  let l = await call('POST', '/admin/auth/login', { email: `chat.smoke.${suffix}@devsynx.com`, password: pw }, {}, '');
  if (l.body?.enrollmentRequired) {
    const en = await call('POST', '/admin/auth/2fa/enroll', { tempToken: l.body.tempToken }, {}, '');
    l = await call('POST', '/admin/auth/2fa/confirm', { tempToken: en.body.tempToken, totpCode: totp(en.body.secret) }, {}, '');
  }
  plainToken = l.body?.tokens?.accessToken;
  check('setup: plain employee logged in', Boolean(plainToken), short(l.body));
}
r = await call('GET', `/chat/channels/${group.id}/messages`, undefined, {}, plainToken);
check('chat: non-member read is 403 CHAT_NOT_MEMBER', r.status === 403 && r.body?.error?.code === 'CHAT_NOT_MEMBER', short(r.body));
r = await call('POST', `/chat/channels/${group.id}/messages`, { body: 'intruder' }, {}, plainToken);
check('chat: non-member send is 403 CHAT_NOT_MEMBER', r.status === 403 && r.body?.error?.code === 'CHAT_NOT_MEMBER', short(r.body));
r = await call('GET', '/chat/channels', undefined, {}, plainToken);
check('chat: new employee is in the company channel automatically', r.status === 200 && arr(r.body).some((c) => c.kind === 'company' && c.isMember), short(r.body));
r = await call('GET', '/chat/channels?scope=all', undefined, {}, plainToken);
check('chat: moderation listing without chat.manage is 403', r.status === 403, short(r.body));
r = await call('GET', '/employees', undefined, {}, plainToken);
check('chat: plain employee has no employees.view', r.status === 403, short(r.body));
r = await call('GET', '/chat/directory?limit=100', undefined, {}, plainToken);
check('chat: directory lists colleagues for a plain employee, without the caller', r.status === 200 && arr(r.body).some((e) => e.id === other.id) && !arr(r.body).some((e) => e.id === plainId) && arr(r.body).every((e) => typeof e.code === 'string'), short(r.body));
r = await call('GET', `/chat/directory?q=${encodeURIComponent(other.lastName)}`, undefined, {}, plainToken);
check('chat: directory search by name', r.status === 200 && arr(r.body).some((e) => e.id === other.id), short(r.body));
r = await call('GET', '/chat/directory?limit=1');
check('chat: directory is cursor paginated', r.status === 200 && arr(r.body).length === 1 && typeof r.body.nextCursor === 'string', short(r.body));
r = await call('PATCH', `/chat/messages/${msg.id}`, { body: 'hijack' }, {}, plainToken);
check('chat: editing someone else\'s message is denied', r.status === 403 || r.status === 404, short(r.body));

r = await call('POST', `/chat/channels/${group.id}/members/${plainId}`);
check('chat: creator adds member', r.status === 201 && r.body.members.some((m) => m.employeeId === plainId), short(r.body));
r = await call('GET', `/chat/channels/${group.id}/messages`, undefined, {}, plainToken);
check('chat: new member can read; unread excludes nothing yet read', r.status === 200 && arr(r.body).length >= 3, short(r.body));
r = await call('GET', '/chat/unread', undefined, {}, plainToken);
check('chat: new member sees unread in the group', r.status === 200 && r.body.channels.some((c) => c.channelId === group.id && c.unreadCount >= 3), short(r.body));
r = await call('POST', `/chat/channels/${group.id}/leave`, undefined, {}, plainToken);
check('chat: member leaves group', r.status === 200 && r.body.left === true, short(r.body));
r = await call('GET', `/chat/channels/${group.id}/messages`, undefined, {}, plainToken);
check('chat: after leaving, read is 403 again', r.status === 403, short(r.body));

// Super Admin (chat.manage all) can read a direct channel between two others only via moderation (audited)
r = await call('POST', '/chat/channels/direct', { employeeId: plainId }, {}, plainToken);
check('chat: plain employee cannot open a direct channel with themselves', r.status === 422, short(r.body));
r = await call('POST', '/chat/channels/direct', { employeeId: other.id }, {}, plainToken);
check('chat: plain employee opens direct channel with other', r.status === 201, short(r.body)); const theirDirect = r.body;
r = await call('GET', `/chat/channels/${theirDirect.id}/messages`);
check('chat: chat.manage reads a channel it is not in (moderation)', r.status === 200, short(r.body));
r = await call('GET', '/chat/channels?scope=all');
check('chat: moderation listing includes non-member channel flagged isMember=false', r.status === 200 && arr(r.body).some((c) => c.id === theirDirect.id && c.isMember === false), short(r.body));
r = await call('GET', '/audit-logs?limit=50');
check('chat: moderation read is audited', r.status === 200 && JSON.stringify(r.body).includes('chat.moderation.read'), short(r.body).slice(0, 120));

// ---------------- moderation delete, archive ----------------
r = await call('DELETE', `/chat/messages/${msg2.id}`); check('chat: delete own message', r.status === 200 && r.body.deletedAt, short(r.body));
r = await call('GET', `/chat/channels/${group.id}/messages`);
check('chat: deleted message shows empty body with deletedAt', r.status === 200 && arr(r.body).some((m) => m.id === msg2.id && m.deletedAt && m.body === ''), short(r.body));
r = await call('PATCH', `/chat/channels/${group.id}`, { name: `Smoke ${suffix} renamed` }); check('chat: rename group', r.status === 200 && r.body.name.endsWith('renamed'), short(r.body));
r = await call('PATCH', `/chat/channels/${company.id}`, { name: 'nope' }); check('chat: company channel cannot be renamed or archived', r.status === 422, short(r.body));
r = await call('PATCH', `/chat/channels/${group.id}`, { archived: true }); check('chat: archive group', r.status === 200 && r.body.archivedAt, short(r.body));
r = await call('POST', `/chat/channels/${group.id}/messages`, { body: 'too late' });
check('chat: archived channel rejects send (CHAT_CHANNEL_ARCHIVED)', r.status === 422 && r.body?.error?.code === 'CHAT_CHANNEL_ARCHIVED', short(r.body));

// ---------------- retention job and membership removal on disable ----------------
r = await call('POST', '/jobs/chat-retention/run', {}); check('chat: retention job runs', r.status < 300 && r.body?.lastOutcome === 'ok' && r.body?.lastResult?.deleted === 0, short(r.body));
r = await call('POST', `/employees/${plainId}/suspend`, { reason: 'chat smoke' }); check('setup: suspend plain employee', r.status === 201 || r.status === 200, short(r.body));
r = await call('GET', '/chat/directory?limit=100'); check('chat: suspended employee absent from directory', r.status === 200 && !arr(r.body).some((e) => e.id === plainId), short(r.body));
r = await call('POST', `/employees/${plainId}/restore`, {}); check('setup: restore plain employee', r.status === 201 || r.status === 200, short(r.body));
r = await call('POST', `/employees/${plainId}/disable`, {}); check('setup: disable plain employee', r.status === 201 || r.status === 200, short(r.body));
const plainMemberships = await call('GET', '/chat/channels?scope=all');
check('chat: disabled employee removed from every channel', plainMemberships.status === 200 && !arr(plainMemberships.body).some((c) => c.members.some((m) => m.employeeId === plainId)), short(plainMemberships.body).slice(0, 100));

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(' -', f.name, f.extra);
process.exit(failed.length ? 1 : 0);
