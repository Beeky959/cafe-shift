// @ts-check
/**
 * Robustness: more than 10,000 random commands, valid and invalid, across
 * many shifts. After every tick the ownership invariants must hold and every
 * dish may only have moved along a permitted transition (GAME_DESIGN.md §3a).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInvariants, createInitialState, createRng, step } from '../src/sim/index.js';

/** @import { Command, Target, SimState } from '../src/sim/types.js' */

/**
 * Holder changes allowed within one tick. Two legal moves can chain in a tick:
 * a washed dish is reserved at once (D8 then D1), and a cancelled reservation
 * is replaced by the next queued action's (D4 then D1).
 */
const ALLOWED = new Set([
  'rack>reserved', // D1
  'reserved>machine', // D2
  'reserved>pass', // D3
  'reserved>rack', // D4
  'machine>guest', // D5
  'pass>guest', // D6
  'guest>sink', // D7
  'sink>rack', // D8
  'sink>reserved', // D8 + D1
  'reserved>reserved', // D4 + D1
  'machine>sink', // D10: discard a ready drink
]);
/**
 * Only on the tick the shift ends: unserved items are discarded (D9), and a
 * guest served on that very tick is settled at once (D5 or D6, then D7).
 */
const ALLOWED_AT_END = new Set([...ALLOWED, 'machine>rack', 'pass>rack', 'machine>sink', 'pass>sink']);

/**
 * @param {import('../src/sim/rng.js').Rng} rng
 * @returns {Command}
 */
function randomCommand(rng) {
  const roll = rng.int(100);
  if (roll < 6) return { type: 'cancel' };
  if (roll < 10) return { type: 'unqueue', actionId: rng.int(400) };
  /** @type {Target[]} */
  const targets = [
    { kind: 'machine' },
    { kind: 'case' },
    { kind: 'sink' },
    { kind: 'spot', index: rng.int(4) }, // index 3 does not exist
    { kind: 'table', tableId: rng.int(5) }, // ids 0 and 4 do not exist
  ];
  return { type: 'tap', target: targets[rng.int(targets.length)] };
}

/** @param {SimState} state */
const holders = (state) => state.dishes.map((d) => (d.holder.kind === 'reserved' ? `reserved#${d.holder.actionId}` : d.holder.kind));

test('10,000+ random commands never break an invariant or an ownership transition', () => {
  let commands = 0;
  let ticks = 0;
  let shifts = 0;
  const seen = new Set();
  for (let seed = 1; commands < 10500; seed++) {
    const rng = createRng(seed * 7919);
    const state = createInitialState({ seed });
    let previous = holders(state);
    while (state.phase !== 'ended') {
      /** @type {Command[]} */
      const batch = [];
      // Bursts and quiet spells, so queues fill, drain and get cancelled.
      const n = rng.int(100) < 45 ? 1 + rng.int(3) : 0;
      for (let i = 0; i < n; i++) batch.push(randomCommand(rng));
      commands += batch.length;
      const events = step(state, batch);
      ticks += 1;

      const problems = checkInvariants(state);
      assert.deepEqual(problems, [], `seed ${seed}, tick ${state.tick - 1}`);

      const now = holders(state);
      const ended = /** @type {string} */ (state.phase) === 'ended';
      const allowed = ended ? ALLOWED_AT_END : ALLOWED;
      now.forEach((to, i) => {
        const from = previous[i];
        if (from === to) return;
        const move = `${from.split('#')[0]}>${to.split('#')[0]}`;
        seen.add(move);
        assert.ok(allowed.has(move), `seed ${seed}, tick ${state.tick - 1}: dish ${i + 1} moved ${move}`);
      });
      previous = now;

      for (const event of events) assert.equal(event.tick, state.tick - 1);
      assert.ok(state.tick < 20000, 'shift did not end');
    }
    shifts += 1;
    const g = state.metrics.guests;
    assert.equal(g.leftHappy + g.leftUnhappy + g.walkedPast, state.schedule.length, `seed ${seed}: a guest has no outcome`);
    assert.equal(Object.values(state.metrics.ownerTicks).reduce((a, b) => a + b, 0), state.tick, `seed ${seed}: owner time`);
  }
  assert.ok(commands >= 10000 && shifts >= 5, `${commands} commands over ${shifts} shifts`);
  // The random play really did exercise the whole dish lifecycle.
  for (const move of ['rack>reserved', 'reserved>machine', 'reserved>pass', 'reserved>rack', 'machine>guest', 'pass>guest', 'guest>sink', 'sink>rack']) {
    assert.ok(seen.has(move), `transition ${move} was never exercised`);
  }
  assert.ok(ticks > 10000);
});

test('the same random commands give the same result twice', () => {
  /** @param {number} seed */
  const play = (seed) => {
    const rng = createRng(seed);
    const state = createInitialState({ seed });
    const types = [];
    while (state.phase !== 'ended') {
      const batch = rng.int(2) === 0 ? [randomCommand(rng)] : [];
      for (const e of step(state, batch)) types.push(`${e.tick}:${e.type}`);
    }
    return { types, state };
  };
  const a = play(4242);
  const b = play(4242);
  assert.deepEqual(a.types, b.types);
  assert.deepEqual(a.state, b.state);
});
