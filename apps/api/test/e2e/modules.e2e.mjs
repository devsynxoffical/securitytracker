// End-to-end smoke test for Tasks (14), HR (15), Tracking admin (16), Mail collaboration (17), Security/settings.
import { createHmac } from 'node:crypto';
const BASE = process.env.API_BASE_URL || 'http://localhost:4000/api/v1';
let token = '';
const results = [];
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(str) { let bits = 0, value = 0; const out = []; for (const ch of str.toUpperCase().replace(/=+$/, '')) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; } } return Buffer.from(out); }
function totp(secret, step = Math.floor(Date.now() / 30000)) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(step)); const d = createHmac('sha1', b32decode(secret)).update(b).digest(); const o = d[d.length - 1] & 0xf; const bin = ((d[o] & 0x7f) << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]; return String(bin % 1e6).padStart(6, '0'); }

async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, text };
}
const short = (x) => JSON.stringify(x).slice(0, 220);
const arr = (x) => (Array.isArray(x) ? x : Array.isArray(x?.items) ? x.items : Array.isArray(x?.balances) ? x.balances : Array.isArray(x?.rows) ? x.rows : Array.isArray(x?.data) ? x.data : []);
function check(name, cond, extra = '') { results.push({ name, ok: Boolean(cond), extra }); if (!cond) console.log('FAIL', name, extra); }
const suffix = Date.now();
const today = new Date().toISOString().slice(0, 10);

// login (2FA already enrolled on first smoke run)
let r = await call('POST', '/admin/auth/login', { email: 'admin@devsynx.com', password: 'SuperAdmin123!' });
const secret = process.env.SMOKE_TOTP_SECRET;
if (r.body?.requires2fa) r = await call('POST', '/admin/auth/2fa/verify', { tempToken: r.body.tempToken, totpCode: totp(secret) });
token = r.body?.tokens?.accessToken; if (!token) { console.log('no token', r.body); process.exit(1); }
const me = (await call('GET', '/me')).body;
const employees = (await call('GET', '/employees')).body;
const other = employees.find((e) => e.id !== me.id);
check('employees list', Array.isArray(employees) && other, short(employees).slice(0, 100));

// ---------------- TASKS ----------------
r = await call('GET', '/tasks/spaces'); check('tasks: list spaces', r.status === 200, short(r.body));
const spaces = arr(r.body);
r = await call('POST', '/tasks/spaces', { name: `Space ${suffix}`, colour: '#2459C4', visibility: 'private', memberIds: [me.id] });
check('tasks: create private space', r.status === 201, short(r.body)); const space = r.body;
r = await call('POST', '/tasks/lists', { spaceId: space.id, name: 'Sprint 1' });
check('tasks: create list copies default statuses', r.status === 201 && (r.body.statuses?.length ?? 0) >= 2, short(r.body)); const list = r.body;
const statuses = list.statuses ?? (await call('GET', `/tasks/lists?spaceId=${space.id}`)).body?.[0]?.statuses ?? [];
const doneStatus = statuses.find((s) => s.group === 'done'); const activeStatus = statuses.find((s) => s.group === 'active');
r = await call('POST', '/tasks', { listId: list.id, title: `Task ${suffix}`, priority: 'high', assigneeIds: [me.id, other.id], dueAt: new Date(Date.now() + 3600e3).toISOString(), timeEstimateSeconds: 7200 });
check('tasks: create task with two assignees', r.status === 201 && r.body.status === 'todo', short(r.body)); const task = r.body;
r = await call('POST', '/tasks', { listId: list.id, parentId: task.id, title: 'Subtask' });
check('tasks: create subtask', r.status === 201, short(r.body)); const sub = r.body;
r = await call('POST', '/tasks', { listId: list.id, parentId: sub.id, title: 'Sub-subtask' });
check('tasks: sub-subtask rejected (TASK_SUBTASK_DEPTH)', r.status >= 400 && r.body?.error?.code === 'TASK_SUBTASK_DEPTH', short(r.body));
r = await call('POST', `/tasks/${task.id}/status`, { statusId: activeStatus.id });
check('tasks: status active -> in_progress', r.status === 201 && r.body.status === 'in_progress', short(r.body));
r = await call('POST', `/tasks/${task.id}/comments`, { body: `Hello @${other.firstName}`, mentions: [other.id] });
check('tasks: comment with mention', r.status === 201, short(r.body));
r = await call('POST', `/tasks/${task.id}/checklists`, { title: 'QA' }); check('tasks: checklist', r.status === 201, short(r.body)); const cl = r.body;
r = await call('POST', `/tasks/${task.id}/checklists/${cl.id}/items`, { title: 'Write tests' }); check('tasks: checklist item', r.status === 201, short(r.body));
r = await call('POST', `/tasks/${task.id}/time-entries`, { durationSeconds: 1800, note: 'pairing' });
check('tasks: time entry', r.status === 201, short(r.body));
r = await call('GET', `/tasks/${task.id}`); check('tasks: detail shows time spent 1800 and 2 assignees', r.status === 200 && r.body.timeSpentS === 1800 && (r.body.assignees?.length ?? 0) === 2, short(r.body));
r = await call('POST', `/tasks/${task.id}/status`, { statusId: doneStatus.id });
check('tasks: done sets completedAt', r.status === 201 && r.body.status === 'done' && r.body.completedAt, short(r.body));
r = await call('GET', '/tasks/my?range=done'); check('tasks: my done', r.status === 200 && arr(r.body).some((t) => t.id === task.id), short(r.body));
r = await call('GET', `/tasks/board?listId=${list.id}`); check('tasks: board', r.status === 200 && Array.isArray(r.body.columns), short(r.body));
r = await call('GET', `/tasks/workload?spaceId=${space.id}`); check('tasks: workload', r.status === 200, short(r.body));
r = await call('GET', `/tasks/${task.id}/activities`); check('tasks: activities', r.status === 200 && arr(r.body).length >= 3, short(r.body));
r = await call('POST', '/tasks/bulk', { ids: [sub.id], action: 'archive' }); check('tasks: bulk archive', r.status === 201, short(r.body));
r = await call('GET', '/tasks?status=todo'); check('tasks: legacy list route still works', r.status === 200, short(r.body));

// ---------------- HR ----------------
r = await call('GET', '/hr/leave-types'); check('hr: leave types seeded', r.status === 200 && arr(r.body).length >= 4, short(r.body)); const annual = arr(r.body).find((t) => t.code === 'ANNUAL');
r = await call('GET', `/hr/leave-balances?employeeId=${other.id}`); check('hr: balances', r.status === 200, short(r.body));
r = await call('POST', '/hr/leave-balances/adjust', { employeeId: other.id, leaveTypeId: annual.id, year: new Date().getFullYear(), days: 2, reason: 'smoke' });
check('hr: adjust balance', r.status === 201, short(r.body));
const nextMon = new Date(); nextMon.setDate(nextMon.getDate() + ((8 - nextMon.getDay()) % 7 || 7) + 7 * (Math.floor(suffix / 1000) % 40)); const d1 = nextMon.toISOString().slice(0, 10); const d2 = new Date(nextMon.getTime() + 86400e3).toISOString().slice(0, 10);
r = await call('POST', '/leave-requests', { employeeId: other.id, leaveTypeId: annual.id, dateFrom: d1, dateTo: d2, reason: 'smoke leave' });
check('hr: leave request pending with days counted', r.status === 201 && Number(r.body.days) > 0, short(r.body)); const leave = r.body;
r = await call('POST', '/leave-requests', { employeeId: other.id, leaveTypeId: annual.id, dateFrom: d1, dateTo: d1, reason: 'dup' });
check('hr: overlapping request rejected', r.status >= 400 && r.body?.error?.code === 'LEAVE_OVERLAP', short(r.body));
r = await call('POST', `/leave-requests/${leave.id}/decide`, { status: 'approved', comment: 'ok' }); check('hr: approve leave', r.status === 201, short(r.body));
r = await call('GET', `/hr/leave-balances?employeeId=${other.id}&year=${d1.slice(0, 4)}`); check('hr: used days increased', r.status === 200 && arr(r.body).some((b) => Number(b.usedDays) > 0), short(r.body));
r = await call('GET', `/hr/leave-calendar?month=${d1.slice(0, 7)}`); check('hr: leave calendar', r.status === 200, short(r.body));
r = await call('GET', '/hr/out-today'); check('hr: out today', r.status === 200, short(r.body));
r = await call('POST', '/holidays/import', { holidays: [{ date: `${new Date().getFullYear()}-12-25`, name: 'Christmas' }] }); check('hr: holidays import', r.status === 201 || r.status === 200, short(r.body));
r = await call('GET', `/attendance/sheet?month=${today.slice(0, 7)}`); check('hr: attendance sheet', r.status === 200, short(r.body));
r = await call('GET', `/attendance/sheet?month=${today.slice(0, 7)}&format=csv`); check('hr: attendance sheet csv', r.status === 200 && r.text.includes(','), r.text.slice(0, 80));
r = await call('GET', '/attendance/corrections?status=pending'); check('hr: corrections list', r.status === 200, short(r.body));
r = await call('PATCH', `/hr/profiles/${other.id}`, { designation: 'Senior BDR', employmentType: 'full_time', emergencyContact: { name: 'Pat', phone: '555' } });
check('hr: profile update', r.status === 200 && r.body.designation === 'Senior BDR', short(r.body));
r = await call('POST', `/hr/profiles/${other.id}/documents`, { name: 'Passport', type: 'id', expiresAt: `${new Date().getFullYear() + 1}-01-01` }); check('hr: document', r.status === 201, short(r.body));
r = await call('GET', '/hr/checklist-templates'); check('hr: templates seeded', r.status === 200 && arr(r.body).length >= 2, short(r.body));
r = await call('POST', '/hr/checklists', { employeeId: other.id, kind: 'onboarding', anchorDate: today });
if (r.status === 409) { const ex = await call('GET', `/hr/checklists?employeeId=${other.id}&kind=onboarding`); r = { status: 201, body: arr(ex.body).find((c) => c.status === 'open') ?? arr(ex.body)[0] }; }
check('hr: start checklist (or reuse open one)', r.status === 201 && arr(r.body?.items).length > 0, short(r.body)); const chk = r.body; const firstItem = arr(chk?.items)[0];
r = await call('PATCH', `/hr/checklists/${chk?.id}/items/${firstItem?.id}`, { done: true }); check('hr: checklist item done', r.status === 200 && arr(r.body.items).some((i) => i.done === true), short(r.body));
r = await call('POST', '/hr/announcements', { title: `Hello ${suffix}`, body: 'Welcome all', audienceType: 'company', pinned: true }); check('hr: announcement', r.status === 201, short(r.body)); const ann = r.body;
r = await call('POST', `/hr/announcements/${ann.id}/read`); check('hr: announcement read', r.status === 201 || r.status === 200, short(r.body));
r = await call('GET', '/hr/org-chart'); check('hr: org chart', r.status === 200, short(r.body));
r = await call('GET', '/employees/export'); check('hr: employees export csv', r.status === 200 && r.text.includes(','), r.text.slice(0, 60));
r = await call('GET', `/employees/${other.id}/schedules`); check('hr: employee schedules', r.status === 200, short(r.body));

// ---------------- TRACKING ----------------
r = await call('GET', `/tracking/timesheet?employeeId=${other.id}&from=${today}&to=${today}`); check('trk: timesheet', r.status === 200, short(r.body));
r = await call('GET', `/tracking/timesheet/team?from=${today}&to=${today}`); check('trk: team timesheet', r.status === 200, short(r.body));
r = await call('GET', `/tracking/team-activity?date=${today}`); check('trk: team activity', r.status === 200, short(r.body));
r = await call('GET', `/tracking/reports/apps?from=${today}&to=${today}`); check('trk: apps report', r.status === 200, short(r.body));
r = await call('GET', `/tracking/reports/domains?from=${today}&to=${today}`); check('trk: domains report', r.status === 200, short(r.body));
r = await call('GET', `/tracking/uncategorised?from=${today}&to=${today}&type=app`); check('trk: uncategorised', r.status === 200, short(r.body));
r = await call('POST', '/tracking/uncategorised/categorise', { items: [{ type: 'app', pattern: `smoke-${suffix}.exe`, category: 'productive' }] }); check('trk: categorise creates rule', r.status === 201, short(r.body));
r = await call('GET', '/tracking/productivity-rules'); const rule = arr(r.body).find((x) => x.pattern === `smoke-${suffix}.exe`); check('trk: rule listed', Boolean(rule), short(r.body));
if (rule) { r = await call('PATCH', `/tracking/productivity-rules/${rule.id}`, { category: 'neutral' }); check('trk: rule patch', r.status === 200 && r.body.category === 'neutral', short(r.body)); }
const s1 = new Date(); s1.setUTCHours(1 + (Math.floor(suffix / 1000) % 4), Math.floor(suffix / 1000) % 60, 0, 0); const s2 = new Date(s1.getTime() + 20 * 60e3);
r = await call('POST', '/tracking/manual-time', { employeeId: other.id, date: today, startedAt: s1.toISOString(), endedAt: s2.toISOString(), reason: 'client visit' });
check('trk: manual time pending', r.status === 201 && r.body.status === 'pending' && r.body.durationS === 1200, short(r.body)); const mt = r.body;
r = await call('POST', '/tracking/manual-time', { employeeId: other.id, date: today, startedAt: s1.toISOString(), endedAt: s2.toISOString(), reason: 'again' });
check('trk: manual time overlap rejected', r.status >= 400 && r.body?.error?.code === 'MANUAL_TIME_OVERLAP', short(r.body));
r = await call('POST', `/tracking/manual-time/${mt.id}/decide`, { status: 'approved' }); check('trk: manual time approved', r.status === 201 && r.body.status === 'approved', short(r.body));
r = await call('GET', `/tracking/idle-report?from=${today}&to=${today}`); check('trk: idle report', r.status === 200, short(r.body));
r = await call('GET', '/tracking/tamper-events'); check('trk: tamper events', r.status === 200, short(r.body));
r = await call('GET', '/tracking/settings'); check('trk: settings', r.status === 200 && r.body.idleThresholdSeconds, short(r.body));
r = await call('PATCH', '/tracking/settings', { activityWarnPercent: 55 }); check('trk: settings patch', r.status === 200 && r.body.activityWarnPercent === 55, short(r.body));

// ---------------- MAIL ----------------
r = await call('GET', '/mail/labels'); check('mail: labels seeded', r.status === 200 && arr(r.body).length >= 4, short(r.body));
r = await call('POST', '/mail/labels', { name: `Smoke ${suffix}`, colour: '#1E8E5A' }); check('mail: create label', r.status === 201, short(r.body));
r = await call('POST', '/mail/templates', { name: `Tpl ${suffix}`, subject: 'Hi {{contact.firstName}}', bodyHtml: '<p>Hello {{contact.firstName}}, {{me.firstName}} here.</p>', shared: true });
check('mail: shared template', r.status === 201, short(r.body)); const tpl = r.body;
r = await call('POST', `/mail/templates/${tpl.id}/render`, {}); check('mail: render template without contact keeps me placeholder', r.status === 201 || r.status === 200, short(r.body));
r = await call('GET', '/mail/mailboxes/health'); check('mail: mailbox health', r.status === 200, short(r.body));
r = await call('GET', '/mail/mailboxes'); check('mail: mailboxes list', r.status === 200, short(r.body));
r = await call('GET', '/mail/audit'); check('mail: audit', r.status === 200, short(r.body));

// ---------------- SECURITY / SETTINGS ----------------
r = await call('GET', '/sessions'); check('sec: sessions list', r.status === 200, short(r.body));
r = await call('GET', '/settings'); check('settings: get', r.status === 200, short(r.body));
r = await call('PATCH', '/settings', { weekStart: 1 }); check('settings: patch', r.status === 200, short(r.body));
r = await call('GET', '/roles'); check('sec: roles', r.status === 200, short(r.body));
r = await call('GET', '/permissions'); check('sec: permissions', r.status === 200, short(r.body));
r = await call('GET', '/devices'); check('sec: devices', r.status === 200, short(r.body));
r = await call('GET', '/login-events'); check('sec: login events', r.status === 200, short(r.body));
r = await call('GET', '/reports/attendance?from=' + today + '&to=' + today); check('reports: attendance', r.status === 200, short(r.body));
r = await call('GET', '/targets'); check('targets: list', r.status === 200, short(r.body));

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(' -', f.name, f.extra);
process.exit(failed.length ? 1 : 0);
