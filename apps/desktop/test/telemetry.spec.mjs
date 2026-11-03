import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseTotals, countDelta } = require('../out/telemetry-test/mac-input-counter.js');
const { macForeground } = require('../out/telemetry-test/mac-foreground.js');

test('parseTotals reads "keys|mouse" totals and ignores noise', () => {
  assert.deepEqual(parseTotals('120|4500'), { keys: 120, mouse: 4500 });
  assert.equal(parseTotals('execution error: x'), null);
  assert.equal(parseTotals(''), null);
});

test('countDelta: first reading is the baseline, then increases, reset counts as zero', () => {
  assert.deepEqual(countDelta(null, { keys: 500, mouse: 900 }), { keys: 0, mouse: 0 });
  assert.deepEqual(countDelta({ keys: 500, mouse: 900 }, { keys: 512, mouse: 960 }), { keys: 12, mouse: 60 });
  assert.deepEqual(countDelta({ keys: 500, mouse: 900 }, { keys: 3, mouse: 10 }), { keys: 0, mouse: 0 });
});

test('macForeground: own window is WorkPulse', () => {
  assert.deepEqual(macForeground('Electron|42|com.github.Electron\n', 42), { processName: 'WorkPulse.app', appName: 'WorkPulse' });
  assert.deepEqual(macForeground('WorkPulse|7|com.devsynx.workpulse', 42).appName, 'WorkPulse');
});

test('macForeground: generic Electron name falls back to the bundle id', () => {
  assert.equal(macForeground('Electron|5|com.tinyspeck.slackmacgap', 42).appName, 'slackmacgap');
  assert.equal(macForeground('Google Chrome|5|com.google.Chrome', 42).appName, 'Google Chrome');
  assert.equal(macForeground('Electron|5|missing value', 42).appName, 'Electron');
  assert.equal(macForeground('', 42).appName, 'Unknown');
});
