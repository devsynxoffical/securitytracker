/**
 * Unit tests for the pure shift-policy decisions (src/main/shift-policy.ts).
 * Run with `pnpm test:policy`: tsc compiles the module alone to out/policy-test (CommonJS), then
 * node:test runs this file. No Electron, no server, no extra dependencies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const policy = require(resolve('out/policy-test/shift-policy.js'));
const { startContext, shouldAutoStart, reminderDue, breakReminderDue, recordFired, snoozeEnd, reminderView, EMPTY_REMINDER, DEFAULT_POLICY, mergePolicy } = policy;

const DAY = '2026-11-02';
const at = (hhmm) => new Date(`${DAY}T${hhmm}:00.000Z`);
const schedule = (today = {}, extra = {}) => ({
  scheduleId: 's1',
  name: 'Office',
  timezone: 'UTC',
  workdays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '18:00',
  graceMinutes: 10,
  today: { date: DAY, isWorkday: true, isHoliday: false, onLeave: false, scheduledStartAt: `${DAY}T09:00:00.000Z`, scheduledEndAt: `${DAY}T18:00:00.000Z`, ...today },
  next: null,
  ...extra,
});
const pol = (p = {}) => mergePolicy({ startReminderEnabled: true, endReminderMinutes: 15, breakReminderAtAllowance: true, breakAllowanceMinutes: 60, autoStartShiftOnLogin: true, autoStartWindowMinutesBefore: 30, ...p });
const off = { state: 'OFF_SHIFT', shiftId: null, breakStartedAt: null, breakSeconds: 0 };
const working = { state: 'WORKING', shiftId: 'shift-1', breakStartedAt: null, breakSeconds: 0 };

// ---- startContext (behaviour 3) --------------------------------------------------------------

test('startContext: no schedule from the server means inside schedule, no confirm', () => {
  assert.deepEqual(startContext(at('10:00'), undefined, undefined), { outsideSchedule: false, reason: null, scheduledStartAt: null, scheduledEndAt: null });
  assert.equal(startContext(at('10:00'), null, DEFAULT_POLICY).outsideSchedule, false);
});

test('startContext: inside the window and up to 120 min early is fine', () => {
  assert.equal(startContext(at('10:00'), schedule()).outsideSchedule, false);
  assert.equal(startContext(at('07:00'), schedule()).outsideSchedule, false); // exactly 120 min early
  assert.equal(startContext(at('18:00'), schedule()).outsideSchedule, false); // exactly at end
});

test('startContext: too early, after end, day off, holiday, leave', () => {
  assert.equal(startContext(at('06:59'), schedule()).reason, 'too_early');
  assert.equal(startContext(at('18:01'), schedule()).reason, 'after_end');
  assert.equal(startContext(at('10:00'), schedule({ isWorkday: false })).reason, 'not_workday');
  assert.equal(startContext(at('10:00'), schedule({ isHoliday: true })).reason, 'holiday');
  assert.equal(startContext(at('10:00'), schedule({ onLeave: true })).reason, 'on_leave');
  const ctx = startContext(at('06:00'), schedule());
  assert.equal(ctx.outsideSchedule, true);
  assert.equal(ctx.scheduledStartAt, `${DAY}T09:00:00.000Z`);
});

// ---- shouldAutoStart (behaviour 4) -----------------------------------------------------------

test('shouldAutoStart: only with the policy on, OFF_SHIFT, in the window', () => {
  assert.equal(shouldAutoStart(at('08:45'), schedule(), pol(), 'OFF_SHIFT', null), true);
  assert.equal(shouldAutoStart(at('08:30'), schedule(), pol(), 'OFF_SHIFT', null), true); // window edge
  assert.equal(shouldAutoStart(at('08:29'), schedule(), pol(), 'OFF_SHIFT', null), false);
  assert.equal(shouldAutoStart(at('18:01'), schedule(), pol(), 'OFF_SHIFT', null), false);
  assert.equal(shouldAutoStart(at('09:00'), schedule(), pol({ autoStartShiftOnLogin: false }), 'OFF_SHIFT', null), false);
  assert.equal(shouldAutoStart(at('09:00'), schedule(), pol(), 'WORKING', null), false);
  assert.equal(shouldAutoStart(at('09:00'), schedule(), undefined, 'OFF_SHIFT', null), false);
  assert.equal(shouldAutoStart(at('09:00'), undefined, pol(), 'OFF_SHIFT', null), false);
});

test('shouldAutoStart: never on holidays, leave, weekly off', () => {
  assert.equal(shouldAutoStart(at('09:00'), schedule({ isHoliday: true }), pol(), 'OFF_SHIFT', null), false);
  assert.equal(shouldAutoStart(at('09:00'), schedule({ onLeave: true }), pol(), 'OFF_SHIFT', null), false);
  assert.equal(shouldAutoStart(at('09:00'), schedule({ isWorkday: false }), pol(), 'OFF_SHIFT', null), false);
});

test('shouldAutoStart: a shift that already ended today blocks it; yesterday does not', () => {
  const today = { startedAt: null, endedAt: `${DAY}T12:00:00.000Z`, reason: 'ended', date: DAY };
  assert.equal(shouldAutoStart(at('13:00'), schedule(), pol(), 'OFF_SHIFT', today), false);
  const yesterday = { startedAt: null, endedAt: '2026-11-01T23:41:00.000Z', reason: 'auto_closed_no_heartbeat', date: '2026-11-01' };
  assert.equal(shouldAutoStart(at('09:00'), schedule(), pol(), 'OFF_SHIFT', yesterday), true);
  const undated = { startedAt: null, endedAt: `${DAY}T01:00:00.000Z`, reason: 'auto_closed_no_heartbeat', date: null };
  assert.equal(shouldAutoStart(at('09:00'), schedule(), pol(), 'OFF_SHIFT', undated), false);
});

// ---- reminderDue (behaviour 2) ----------------------------------------------------------------

test('start reminder: fires after start + grace, repeats once after 30 min, then stops', () => {
  assert.deepEqual(reminderDue(at('09:09'), schedule(), pol(), off, EMPTY_REMINDER), []);
  assert.deepEqual(reminderDue(at('09:10'), schedule(), pol(), off, EMPTY_REMINDER), ['start']);
  const once = recordFired('start', at('09:10'), schedule().today, off, EMPTY_REMINDER);
  assert.deepEqual(reminderDue(at('09:39'), schedule(), pol(), off, once), []);
  assert.deepEqual(reminderDue(at('09:40'), schedule(), pol(), off, once), ['start']);
  const twice = recordFired('start', at('09:40'), schedule().today, off, once);
  assert.deepEqual(reminderDue(at('12:00'), schedule(), pol(), off, twice), []);
  assert.equal(reminderView(schedule(), pol(), off, twice).startBanner, true);
});

test('start reminder: off when disabled, on shift, not a workday, or no schedule', () => {
  assert.deepEqual(reminderDue(at('10:00'), schedule(), pol({ startReminderEnabled: false }), off, EMPTY_REMINDER), []);
  assert.deepEqual(reminderDue(at('10:00'), schedule(), pol(), working, EMPTY_REMINDER), []);
  assert.deepEqual(reminderDue(at('10:00'), schedule({ isWorkday: false }), pol(), off, EMPTY_REMINDER), []);
  assert.deepEqual(reminderDue(at('10:00'), schedule({ onLeave: true }), pol(), off, EMPTY_REMINDER), []);
  assert.deepEqual(reminderDue(at('10:00'), undefined, pol(), off, EMPTY_REMINDER), []);
  assert.deepEqual(reminderDue(at('10:00'), schedule(), undefined, off, EMPTY_REMINDER), []);
});

test('start reminder: a new day resets yesterday’s bookkeeping', () => {
  const yesterday = { ...EMPTY_REMINDER, date: '2026-11-01', startFiredAt: ['2026-11-01T09:10:00.000Z', '2026-11-01T09:40:00.000Z'] };
  assert.deepEqual(reminderDue(at('09:10'), schedule(), pol(), off, yesterday), ['start']);
  assert.equal(reminderView(schedule(), pol(), off, yesterday).startBanner, false);
});

test('end reminder: fires once at end + endReminderMinutes, then per snooze, max 3 snoozes', () => {
  assert.deepEqual(reminderDue(at('18:14'), schedule(), pol(), working, EMPTY_REMINDER), []);
  assert.deepEqual(reminderDue(at('18:15'), schedule(), pol(), working, EMPTY_REMINDER), ['end']);
  let r = recordFired('end', at('18:15'), schedule().today, working, EMPTY_REMINDER);
  assert.equal(reminderView(schedule(), pol(), working, r).endModal, true);
  assert.deepEqual(reminderDue(at('18:20'), schedule(), pol(), working, r), [], 'modal open: nothing new');
  for (let i = 1; i <= 3; i++) {
    r = snoozeEnd(at('18:15'), r);
    assert.equal(reminderView(schedule(), pol(), working, r).endModal, false);
    assert.equal(reminderView(schedule(), pol(), working, r).endBanner, true);
    assert.deepEqual(reminderDue(at('18:44'), schedule(), pol(), working, r), []);
    assert.deepEqual(reminderDue(at('18:45'), schedule(), pol(), working, r), ['end'], `snooze ${i} expired`);
    r = recordFired('end', at('18:45'), schedule().today, working, r);
  }
  r = snoozeEnd(at('18:45'), r); // 4th "keep working": no more modal, banner remains
  assert.equal(r.endSnoozedUntil, null);
  assert.deepEqual(reminderDue(at('23:00'), schedule(), pol(), working, r), []);
  const view = reminderView(schedule(), pol(), working, r);
  assert.equal(view.endModal, false);
  assert.equal(view.endBanner, true);
});

test('end reminder: a new shift id re-arms it; OFF_SHIFT shows nothing', () => {
  const fired = recordFired('end', at('18:15'), schedule().today, working, EMPTY_REMINDER);
  assert.deepEqual(reminderDue(at('19:00'), schedule(), pol(), { ...working, shiftId: 'shift-2' }, fired), ['end']);
  assert.equal(reminderView(schedule(), pol(), off, fired).endBanner, false);
  assert.equal(reminderView(schedule(), pol(), off, fired).endModal, false);
});

// ---- breakReminderDue --------------------------------------------------------------------------

test('break reminder: at the allowance, once per break, only with the policy on', () => {
  const onBreak = { state: 'ON_BREAK', shiftId: 'shift-1', breakStartedAt: `${DAY}T12:00:00.000Z`, breakSeconds: 59 * 60 };
  assert.equal(breakReminderDue(at('12:59'), pol(), onBreak, EMPTY_REMINDER), false);
  const reached = { ...onBreak, breakSeconds: 60 * 60 };
  assert.equal(breakReminderDue(at('13:00'), pol(), reached, EMPTY_REMINDER), true);
  assert.deepEqual(reminderDue(at('13:00'), schedule(), pol(), reached, EMPTY_REMINDER), ['break']);
  const fired = recordFired('break', at('13:00'), schedule().today, reached, EMPTY_REMINDER);
  assert.equal(breakReminderDue(at('13:30'), pol(), { ...reached, breakSeconds: 90 * 60 }, fired), false);
  assert.equal(reminderView(schedule(), pol(), reached, fired).breakBanner, true);
  // next break of the same shift (closed + current still above allowance) fires again
  assert.equal(breakReminderDue(at('15:00'), pol(), { ...reached, breakStartedAt: `${DAY}T15:00:00.000Z` }, fired), true);
  assert.equal(breakReminderDue(at('13:00'), pol({ breakReminderAtAllowance: false }), reached, EMPTY_REMINDER), false);
  assert.equal(breakReminderDue(at('13:00'), pol(), { ...reached, state: 'WORKING' }, EMPTY_REMINDER), false);
  assert.equal(breakReminderDue(at('13:00'), undefined, reached, EMPTY_REMINDER), false);
});

test('mergePolicy: missing policy is all-off defaults', () => {
  const p = mergePolicy(undefined);
  assert.equal(p.autoStartShiftOnLogin, false);
  assert.equal(p.startReminderEnabled, false);
  assert.equal(p.autoEndShiftOnShutdown, false);
  assert.equal(mergePolicy({ breakAllowanceMinutes: 45 }).breakAllowanceMinutes, 45);
});
