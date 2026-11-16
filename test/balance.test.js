// @ts-check
/**
 * Balance gates B1-B6 (docs/BUILD_PLAN.md §3) on the shift the game ships:
 * the slice shift with the default seed. B5 and B6 compare stand-off vs
 * stand-on metrics. These gates are met by tuning src/sim/config.js only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, runShift } from '../src/sim/index.js';
import { evaluateGates, evaluateStandGates, playShift } from './support/players.js';

// --- B1-B4: core balance (no stand) ---

const results = playShift(CONFIG.defaultSeed, runShift);
const gates = evaluateGates(results);

for (const gate of gates) {
  test(`${gate.id}: ${gate.label}`, () => {
    assert.ok(gate.pass, gate.detail);
  });
}

test('the prioritising player is kept busy and leaves little idle time to the naive one', () => {
  // Guards the reason B3 holds: prioritising means using time the naive player spends waiting.
  assert.ok(results.priority.busy > results.arrivalOrder.busy + 0.15, `${results.priority.busy} vs ${results.arrivalOrder.busy}`);
  assert.ok(results.priority.tips > results.arrivalOrder.tips);
});

test('the B1-B4 gates are not balanced on a knife edge: they hold on most other seeds too', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
  /** @type {Record<string, number>} */
  const held = { B1: 0, B2: 0, B3: 0, B4: 0 };
  for (const seed of seeds) {
    for (const gate of evaluateGates(playShift(seed, runShift))) held[gate.id] += gate.pass ? 1 : 0;
  }
  assert.equal(held.B1, 20);
  assert.equal(held.B2, 20);
  assert.ok(held.B3 >= 15, `B3 held on ${held.B3} of 20 seeds`);
  assert.ok(held.B4 >= 15, `B4 held on ${held.B4} of 20 seeds`);
});

// --- B5-B6: TapIt Stand comparison ---

const standOff = playShift(CONFIG.defaultSeed, runShift, { preset: 'none' });
const standOn = playShift(CONFIG.defaultSeed, runShift, { preset: 'test-stand' });
const standGates = evaluateStandGates(standOff, standOn);

for (const gate of standGates) {
  test(`${gate.id}: ${gate.label}`, () => {
    assert.ok(gate.pass, gate.detail);
  });
}

test('all six balance gates are evaluated', () => {
  const allGates = [...gates, ...standGates];
  assert.deepEqual(allGates.map((g) => g.id), ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
});

test('the B5-B6 gates hold on most other seeds too', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
  /** @type {Record<string, number>} */
  const held = { B5: 0, B6: 0 };
  for (const seed of seeds) {
    const off = playShift(seed, runShift, { preset: 'none' });
    const on = playShift(seed, runShift, { preset: 'test-stand' });
    for (const gate of evaluateStandGates(off, on)) held[gate.id] += gate.pass ? 1 : 0;
  }
  assert.ok(held.B5 >= 15, `B5 held on ${held.B5} of 20 seeds`);
  assert.ok(held.B6 >= 15, `B6 held on ${held.B6} of 20 seeds`);
});
