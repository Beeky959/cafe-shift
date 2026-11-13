// @ts-check
/**
 * Balance gates B1-B4 (docs/BUILD_PLAN.md §3) on the shift the game ships:
 * the slice shift with the default seed. B5 and B6 need the stand and belong
 * to M4. These gates are met by tuning src/sim/config.js only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, runShift } from '../src/sim/index.js';
import { evaluateGates, playShift } from './support/players.js';

const results = playShift(CONFIG.defaultSeed, runShift);
const gates = evaluateGates(results);

for (const gate of gates) {
  test(`${gate.id}: ${gate.label}`, () => {
    assert.ok(gate.pass, gate.detail);
  });
}

test('only B1-B4 are evaluated in this milestone', () => {
  assert.deepEqual(gates.map((g) => g.id), ['B1', 'B2', 'B3', 'B4']);
});

test('the prioritising player is kept busy and leaves little idle time to the naive one', () => {
  // Guards the reason B3 holds: prioritising means using time the naive player spends waiting.
  assert.ok(results.priority.busy > results.arrivalOrder.busy + 0.15, `${results.priority.busy} vs ${results.arrivalOrder.busy}`);
  assert.ok(results.priority.tips > results.arrivalOrder.tips);
});

test('the gates are not balanced on a knife edge: they hold on most other seeds too', () => {
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
