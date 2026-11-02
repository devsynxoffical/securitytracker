/**
 * Unit tests for the pure lock-down decisions (src/main/lockdown.ts): FR-SEC-22 navigation and
 * DevTools shortcuts, FR-SEC-25 store wipe and revocation reasons, header allow-list for the bridge.
 * Run with `pnpm test:lockdown`: tsc compiles the module alone to out/lockdown-test, then node:test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { shouldAllowNavigation, wipeOnRevoke, isKeptOnRevoke, isDevToolsShortcut, filterRequestHeaders, revokeReasonFromError, revokeReasonFromSocket } = require(resolve('out/lockdown-test/lockdown.js'));

const APP_FILE = 'file:///opt/WorkPulse/resources/app.asar/out/renderer/index.html';
const APP_DEV = 'http://localhost:5173/';

// ---- shouldAllowNavigation (FR-SEC-22: no file:// navigation, no external pages) ----------------

test('navigation: the app document itself is allowed, hash and query included', () => {
  assert.equal(shouldAllowNavigation(APP_FILE, APP_FILE), true);
  assert.equal(shouldAllowNavigation(`${APP_FILE}#/chat`, APP_FILE), true);
  assert.equal(shouldAllowNavigation(`${APP_FILE}?x=1`, APP_FILE), true);
});

test('navigation: any other file:// path is denied', () => {
  assert.equal(shouldAllowNavigation('file:///etc/passwd', APP_FILE), false);
  assert.equal(shouldAllowNavigation('file:///opt/WorkPulse/resources/app.asar/out/renderer/other.html', APP_FILE), false);
  assert.equal(shouldAllowNavigation('file:///C:/Users/sam/Downloads/x.html', APP_FILE), false);
});

test('navigation: http(s), javascript:, data: and malformed targets are denied for the packaged app', () => {
  assert.equal(shouldAllowNavigation('https://example.com', APP_FILE), false);
  assert.equal(shouldAllowNavigation('http://localhost:4000/api/v1/health', APP_FILE), false);
  assert.equal(shouldAllowNavigation('javascript:alert(1)', APP_FILE), false);
  assert.equal(shouldAllowNavigation('data:text/html,<b>x</b>', APP_FILE), false);
  assert.equal(shouldAllowNavigation('not a url', APP_FILE), false);
  assert.equal(shouldAllowNavigation('', APP_FILE), false);
});

test('navigation: dev server origin only, never another origin or file', () => {
  assert.equal(shouldAllowNavigation('http://localhost:5173/#/mail', APP_DEV), true);
  assert.equal(shouldAllowNavigation('http://localhost:4000/', APP_DEV), false);
  assert.equal(shouldAllowNavigation('https://localhost:5173/', APP_DEV), false);
  assert.equal(shouldAllowNavigation('file:///tmp/x.html', APP_DEV), false);
});

// ---- wipeOnRevoke (FR-SEC-25: everything but device identity and server address) ---------------

const STORE_KEYS = [
  'api.url',
  'device.id',
  'device.name',
  'device.publicKey',
  'secret:device.privateKey',
  'secret:auth.accessToken',
  'secret:auth.refreshToken',
  'shift.state',
  'shift.id',
  'shift.events',
  'shift.profile',
  'shift.reminder',
  'shift.pendingClaims',
  'tracker.config',
  'chat.cache.11111111-1111-4111-8111-111111111111',
  'chat.cache.22222222-2222-4222-8222-222222222222',
  'tasks.cache',
  'profile',
];

test('wipe: tokens, shift queue, profile, tracker config and every cache are deleted', () => {
  const wiped = wipeOnRevoke(STORE_KEYS);
  for (const k of ['secret:auth.accessToken', 'secret:auth.refreshToken', 'shift.state', 'shift.events', 'shift.profile', 'tracker.config', 'tasks.cache', 'profile']) assert.ok(wiped.includes(k), `${k} must be wiped`);
  assert.equal(wiped.filter((k) => k.startsWith('chat.cache.')).length, 2);
});

test('wipe: the device identity and the server address survive', () => {
  const wiped = wipeOnRevoke(STORE_KEYS);
  for (const k of ['api.url', 'device.id', 'device.name', 'device.publicKey', 'secret:device.privateKey']) {
    assert.equal(wiped.includes(k), false, `${k} must be kept`);
    assert.equal(isKeptOnRevoke(k), true);
  }
  assert.equal(isKeptOnRevoke('secret:auth.refreshToken'), false);
});

test('wipe: unknown future keys are wiped by default (deny-list is the keep-list)', () => {
  assert.deepEqual(wipeOnRevoke(['leads.cache', 'mail.inbox.cache', 'api.url']), ['leads.cache', 'mail.inbox.cache']);
  assert.deepEqual(wipeOnRevoke([]), []);
});

// ---- isDevToolsShortcut ------------------------------------------------------------------------

test('devtools shortcuts: F12, Ctrl/Cmd+Shift+I/J/C and Ctrl+U are recognised on keyDown', () => {
  assert.equal(isDevToolsShortcut({ key: 'F12', type: 'keyDown' }), true);
  assert.equal(isDevToolsShortcut({ key: 'I', control: true, shift: true, type: 'keyDown' }), true);
  assert.equal(isDevToolsShortcut({ key: 'i', meta: true, shift: true, type: 'keyDown' }), true);
  assert.equal(isDevToolsShortcut({ key: 'J', control: true, shift: true, type: 'keyDown' }), true);
  assert.equal(isDevToolsShortcut({ key: 'u', control: true, type: 'keyDown' }), true);
});

test('devtools shortcuts: ordinary typing and copy/paste are not blocked', () => {
  assert.equal(isDevToolsShortcut({ key: 'i', type: 'keyDown' }), false);
  assert.equal(isDevToolsShortcut({ key: 'c', control: true, type: 'keyDown' }), false);
  assert.equal(isDevToolsShortcut({ key: 'v', control: true, type: 'keyDown' }), false);
  assert.equal(isDevToolsShortcut({ key: 'Enter', shift: true, type: 'keyDown' }), false);
  assert.equal(isDevToolsShortcut({ key: 'F12', type: 'keyUp' }), false);
});

// ---- filterRequestHeaders (bridge allow-list) --------------------------------------------------

test('request headers: only Idempotency-Key passes through the bridge', () => {
  assert.deepEqual(filterRequestHeaders({ 'Idempotency-Key': 'abc', Authorization: 'Bearer x', 'X-Device-Id': 'd1', Cookie: 'a=b' }), { 'Idempotency-Key': 'abc' });
  assert.deepEqual(filterRequestHeaders({ 'idempotency-key': 'abc' }), { 'idempotency-key': 'abc' });
  assert.deepEqual(filterRequestHeaders({ 'Idempotency-Key': 'x'.repeat(200) }), {});
  assert.deepEqual(filterRequestHeaders(undefined), {});
  assert.deepEqual(filterRequestHeaders('Idempotency-Key: abc'), {});
  assert.deepEqual(filterRequestHeaders({ 'Idempotency-Key': 42 }), {});
});

// ---- revocation reasons ------------------------------------------------------------------------

test('revoke reason from API error: ACCOUNT_SUSPENDED or "not active" means suspended, anything else revoked', () => {
  assert.equal(revokeReasonFromError({ code: 'ACCOUNT_SUSPENDED', message: 'x' }), 'suspended');
  assert.equal(revokeReasonFromError({ code: 'UNAUTHORIZED', message: 'Account is not active' }), 'suspended');
  assert.equal(revokeReasonFromError({ code: 'UNAUTHORIZED', message: 'Your access was suspended. Contact your administrator.' }), 'suspended');
  assert.equal(revokeReasonFromError({ code: 'SESSION_REVOKED', message: 'Session is revoked' }), 'revoked');
  assert.equal(revokeReasonFromError({ code: 'UNAUTHORIZED', message: 'Unauthorized' }), 'revoked');
  assert.equal(revokeReasonFromError(null), 'revoked');
  assert.equal(revokeReasonFromError(undefined), 'revoked');
});

test('revoke reason from socket payload: account_suspended vs anything else', () => {
  assert.equal(revokeReasonFromSocket({ reason: 'account_suspended' }), 'suspended');
  assert.equal(revokeReasonFromSocket({ reason: 'admin_revoked' }), 'revoked');
  assert.equal(revokeReasonFromSocket({}), 'revoked');
  assert.equal(revokeReasonFromSocket(null), 'revoked');
  assert.equal(revokeReasonFromSocket('suspended'), 'revoked');
});
