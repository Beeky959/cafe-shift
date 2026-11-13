// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG,
  STATE_VERSION,
  TICKS_PER_SECOND,
  checkInvariants,
  createInitialState,
  digest,
  stableStringify,
  toTicks,
} from '../src/sim/index.js';

/**
 * Pinned fingerprints of the default starting state. If one of these changes,
 * either the config, the schedule generator or the state shape changed, and
 * the new value must be reviewed and recorded here on purpose.
 */
const PINNED = {
  none: 'f95c5e831d48c5a4',
  'test-stand': 'fb9cdb894ece56f0',
};

test('smoke: the default starting state is deterministic and pinned', () => {
  const a = createInitialState();
  const b = createInitialState();
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
  assert.equal(digest(a), digest(b));
  assert.equal(digest(a), PINNED.none);
  assert.equal(digest(createInitialState({ preset: 'test-stand' })), PINNED['test-stand']);
});

test('defaults are applied and explicit options give the same result', () => {
  const explicit = createInitialState({
    seed: CONFIG.defaultSeed,
    shiftId: CONFIG.defaultShiftId,
    preset: 'none',
  });
  assert.deepEqual(createInitialState(), explicit);
  assert.equal(explicit.version, STATE_VERSION);
  assert.equal(explicit.tick, 0);
  assert.equal(explicit.phase, 'ready');
});

test('a different seed gives a different state', () => {
  assert.notEqual(digest(createInitialState({ seed: 1 })), digest(createInitialState({ seed: 2 })));
});

test('the starting state is plain data that survives a JSON round trip', () => {
  const state = createInitialState();
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.equal(digest(JSON.parse(JSON.stringify(state))), digest(state));
});

test('two states do not share mutable parts', () => {
  const a = createInitialState();
  const b = createInitialState();
  a.dishes[0].holder = { kind: 'sink' };
  a.spots[0] = 7;
  a.tables[0].state = 'dirty';
  a.schedule[0].arrivalTick = 9999;
  a.metrics.ownerTicks.answer = 5;
  assert.equal(digest(b), PINNED.none);
});

test('the starting state satisfies every ownership and accounting rule', () => {
  for (const preset of /** @type {const} */ (['none', 'test-stand'])) {
    assert.deepEqual(checkInvariants(createInitialState({ preset })), []);
  }
});

test('the rule checker reports broken states', () => {
  const lostDish = createInitialState();
  lostDish.dishes.pop();
  assert.ok(checkInvariants(lostDish).length > 0);

  const badWallet = createInitialState();
  badWallet.economy.wallet = 10;
  assert.ok(checkInvariants(badWallet).some((p) => p.includes('wallet')));

  const twoPlaces = createInitialState();
  twoPlaces.spots[0] = 3;
  twoPlaces.doorQueue.push(3);
  assert.ok(checkInvariants(twoPlaces).some((p) => p.includes('more than one place')));

  const ghostStand = createInitialState();
  ghostStand.stand.queue.push(4);
  assert.ok(checkInvariants(ghostStand).some((p) => p.includes('stand')));
});

test('the stand preset changes only the stand, never the guests', () => {
  const off = createInitialState({ preset: 'none' });
  const on = createInitialState({ preset: 'test-stand' });
  assert.equal(off.stand.installed, false);
  assert.equal(on.stand.installed, true);
  assert.deepEqual(on.schedule, off.schedule);
  assert.deepEqual({ ...on, preset: 'none', stand: off.stand }, off);
});

test('money starts as three consistent figures', () => {
  const { economy } = createInitialState();
  assert.deepEqual(economy, {
    startingWallet: CONFIG.startingWallet,
    grossEarnings: 0,
    spent: 0,
    wallet: CONFIG.startingWallet,
    score: 0,
  });
});

test('every duration is a whole number of ticks', () => {
  const { timing } = createInitialState();
  for (const [name, ticks] of Object.entries(timing)) {
    assert.ok(Number.isInteger(ticks) && ticks > 0, `${name} = ${ticks}`);
  }
  assert.equal(timing.shiftLength, CONFIG.shifts.slice.lengthSeconds * TICKS_PER_SECOND);
  assert.equal(toTicks(0), 0);
  assert.equal(toTicks(0.001), 1);
  assert.throws(() => toTicks(-1), RangeError);
});

test('unknown options are rejected', () => {
  assert.throws(() => createInitialState({ shiftId: 'nope' }), RangeError);
  // @ts-expect-error deliberately invalid preset
  assert.throws(() => createInitialState({ preset: 'free-stand' }), RangeError);
  assert.throws(() => createInitialState({ seed: 0.5 }), TypeError);
});

test('the fingerprint ignores key order and rejects non-data values', () => {
  assert.equal(stableStringify({ b: 1, a: [2, { d: 3, c: null }] }), '{"a":[2,{"c":null,"d":3}],"b":1}');
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
  assert.throws(() => digest({ f: () => 1 }), TypeError);
});
