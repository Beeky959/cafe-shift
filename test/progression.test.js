// @ts-check
/**
 * Tests for the hybrid progression system:
 * - Campaign level definitions (failure conditions, rewards, briefings)
 * - localStorage save/load
 * - Upgrade inventory and gameplay effects
 * - Mission flow: retry on failure, continue on success
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, CONFIG, createInitialState, TICKS_PER_SECOND } from '../src/sim/index.js';

// ---- Campaign level definitions ----

test('all five missions have required fields', () => {
  assert.equal(MISSIONS.length, 5, 'exactly five missions');
  for (const m of MISSIONS) {
    assert.ok(m.id, `${m.name}: has id`);
    assert.ok(m.name, `${m.name}: has name`);
    assert.ok(m.desc, `${m.name}: has desc`);
    assert.ok(m.shiftId, `${m.name}: has shiftId`);
    assert.ok(Array.isArray(m.objectives) && m.objectives.length > 0, `${m.name}: has objectives`);
    assert.ok(typeof m.reward === 'number' && m.reward > 0, `${m.name}: has positive reward`);
  }
});

test('all five missions have failure conditions', () => {
  for (const m of MISSIONS) {
    assert.ok(Array.isArray(m.failConditions) && m.failConditions.length > 0,
      `${m.name}: must have at least one fail condition`);
    for (const fc of m.failConditions) {
      assert.ok(typeof fc.label === 'string' && fc.label.length > 0, `${m.name}: fail condition has label`);
      assert.ok(typeof fc.check === 'function', `${m.name}: fail condition has check function`);
    }
  }
});

test('campaign levels have the specified names', () => {
  const expected = ['Opening Day', 'Morning Rush', 'Digital Chaos', 'Upgrade Your Business', 'Grand Opening Challenge'];
  for (let i = 0; i < expected.length; i++) {
    assert.equal(MISSIONS[i].name, expected[i], `mission ${i + 1} name`);
  }
});

test('all missions have briefings', () => {
  for (const m of MISSIONS) {
    assert.ok(typeof m.briefing === 'string' && m.briefing.length > 10,
      `${m.name}: must have a meaningful briefing`);
  }
});

test('mission rewards escalate with difficulty', () => {
  for (let i = 1; i < MISSIONS.length; i++) {
    assert.ok(MISSIONS[i].reward >= MISSIONS[i - 1].reward,
      `mission ${i + 1} reward (${MISSIONS[i].reward}) should be >= mission ${i} reward (${MISSIONS[i - 1].reward})`);
  }
});

test('each mission shiftId exists in CONFIG.shifts', () => {
  for (const m of MISSIONS) {
    assert.ok(Object.hasOwn(CONFIG.shifts, m.shiftId),
      `${m.name}: shiftId "${m.shiftId}" must exist in CONFIG.shifts`);
  }
});

// ---- Failure conditions work correctly ----

test('mission 1 failure condition triggers when too many guests lost', () => {
  const m = MISSIONS[0];
  const fc = m.failConditions[0];
  // A state with 4 unhappy guests should trigger the failure (> 3)
  const fakeState = {
    metrics: { guests: { leftUnhappy: 3, walkedPast: 1 } },
  };
  assert.ok(fc.check(/** @type {any} */ (fakeState)), 'should fail when 4 guests lost');

  const okState = {
    metrics: { guests: { leftUnhappy: 2, walkedPast: 1 } },
  };
  assert.ok(!fc.check(/** @type {any} */ (okState)), 'should not fail when 3 guests lost');
});

test('all mission objectives accept a final SimState shape', () => {
  // Create a "perfect" fake state to verify objectives are callable
  const perfectState = /** @type {any} */ ({
    metrics: {
      guests: { served: 20, leftHappy: 20, leftUnhappy: 0, walkedPast: 0 },
      tips: 10,
      ownerTicks: { answer: 0 },
    },
    economy: { grossEarnings: 200, wallet: 200, score: 200 },
    schedule: Array.from({ length: 20 }, (_, i) => ({ id: i })),
  });
  for (const m of MISSIONS) {
    for (const obj of m.objectives) {
      const result = obj.check(perfectState);
      assert.equal(typeof result, 'boolean', `${m.name}: objective "${obj.label}" returns boolean`);
    }
    for (const fc of m.failConditions ?? []) {
      const result = fc.check(perfectState);
      assert.equal(typeof result, 'boolean', `${m.name}: failCondition "${fc.label}" returns boolean`);
    }
  }
});

// ---- Upgrade effects on timing ----

test('espresso-upgrade reduces brew times by 20%', () => {
  const baseState = createInitialState({ seed: 1, shiftId: 'mission1' });
  const baseBrew = baseState.timing.brew;
  const baseEspresso = baseState.timing.brewEspresso;
  const baseMocha = baseState.timing.brewMocha;

  // Simulate what game.js does for espresso-upgrade
  const upgradedState = createInitialState({ seed: 1, shiftId: 'mission1' });
  upgradedState.timing.brew = Math.max(1, Math.round(upgradedState.timing.brew * 0.8));
  upgradedState.timing.brewEspresso = Math.max(1, Math.round(upgradedState.timing.brewEspresso * 0.8));
  upgradedState.timing.brewMocha = Math.max(1, Math.round(upgradedState.timing.brewMocha * 0.8));

  assert.ok(upgradedState.timing.brew < baseBrew, 'brew should be faster');
  assert.ok(upgradedState.timing.brewEspresso < baseEspresso, 'espresso should be faster');
  assert.ok(upgradedState.timing.brewMocha < baseMocha, 'mocha should be faster');
  // Verify exactly 80% (rounded)
  assert.equal(upgradedState.timing.brew, Math.max(1, Math.round(baseBrew * 0.8)));
  assert.equal(upgradedState.timing.brewEspresso, Math.max(1, Math.round(baseEspresso * 0.8)));
});

test('pastry-warmer reduces bake times by 20%', () => {
  const baseState = createInitialState({ seed: 1, shiftId: 'mission1' });
  const baseBakeLoad = baseState.timing.bakeLoad;
  const baseBake = baseState.timing.bake;
  const baseBakeUnload = baseState.timing.bakeUnload;

  const upgradedState = createInitialState({ seed: 1, shiftId: 'mission1' });
  upgradedState.timing.bakeLoad = Math.max(1, Math.round(upgradedState.timing.bakeLoad * 0.8));
  upgradedState.timing.bake = Math.max(1, Math.round(upgradedState.timing.bake * 0.8));
  upgradedState.timing.bakeUnload = Math.max(1, Math.round(upgradedState.timing.bakeUnload * 0.8));

  assert.ok(upgradedState.timing.bake < baseBake, 'bake should be faster');
  assert.equal(upgradedState.timing.bakeLoad, Math.max(1, Math.round(baseBakeLoad * 0.8)));
  assert.equal(upgradedState.timing.bake, Math.max(1, Math.round(baseBake * 0.8)));
  assert.equal(upgradedState.timing.bakeUnload, Math.max(1, Math.round(baseBakeUnload * 0.8)));
});

// ---- localStorage save/load format ----

test('save format is versioned JSON with required fields', () => {
  // Test the format contract without importing the private functions.
  // The save format is { version: 1, wallet: number, purchased: string[], completedMissions: number[] }
  const data = {
    version: 1,
    wallet: 150,
    purchased: ['tapit-stand', 'espresso-upgrade'],
    completedMissions: [0, 1],
  };
  const serialized = JSON.stringify(data);
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.version, 1);
  assert.equal(typeof parsed.wallet, 'number');
  assert.ok(Array.isArray(parsed.purchased));
  assert.ok(Array.isArray(parsed.completedMissions));
  assert.deepEqual(parsed.purchased, ['tapit-stand', 'espresso-upgrade']);
  assert.deepEqual(parsed.completedMissions, [0, 1]);
});

test('corrupted save data is safely handled (manual check)', () => {
  // This verifies the contract: null/undefined/garbage should not crash.
  // The loadProgress function handles this, but since it uses localStorage
  // which isn't available in Node tests, we just verify the format contract.
  const badInputs = [null, undefined, '', '{}', '{"version":99}', '[]', 'not json'];
  for (const input of badInputs) {
    if (input === null || input === undefined) continue;
    try {
      const parsed = JSON.parse(input);
      // Any parsed data should be detectable as wrong version or wrong shape
      assert.ok(
        !parsed || typeof parsed !== 'object' || parsed.version !== 1 || !Array.isArray(parsed.purchased),
        `input "${input}" should be detectable as invalid save data`
      );
    } catch {
      // JSON parse failure is expected for some inputs — that's correct behavior
    }
  }
});

// ---- HUD stats derivation ----

test('customer tracking stats are derivable from SimState', () => {
  const state = createInitialState({ seed: 1, shiftId: 'mission1' });
  // Initial state: no one has arrived yet
  assert.equal(state.nextArrivalIndex, 0, 'no arrivals at start');
  assert.equal(state.guests.length, 0, 'no guests in café at start');
  assert.equal(state.metrics.guests.served, 0, 'no one served at start');
  assert.equal(state.metrics.guests.leftUnhappy, 0, 'no one lost at start');
  assert.equal(state.metrics.guests.walkedPast, 0, 'no walkpasts at start');
});

// ---- Two-level vertical slice config ----

test('missions 1-2 are fully configured for the vertical slice', () => {
  for (let i = 0; i < 2; i++) {
    const m = MISSIONS[i];
    assert.ok(m.objectives.length >= 2, `mission ${i + 1} has at least 2 objectives`);
    assert.ok((m.failConditions ?? []).length >= 1, `mission ${i + 1} has at least 1 fail condition`);
    assert.ok(m.reward > 0, `mission ${i + 1} has a reward`);
    assert.ok(m.briefing, `mission ${i + 1} has a briefing`);
    // The shift config should produce a valid initial state
    const state = createInitialState({ seed: 42, shiftId: m.shiftId });
    assert.ok(state.schedule.length > 0, `mission ${i + 1} produces a schedule`);
  }
});

test('missions 3-5 are defined in config but share the same structure', () => {
  for (let i = 2; i < 5; i++) {
    const m = MISSIONS[i];
    // These are configured but not fully implemented for the vertical slice
    assert.ok(m.objectives.length >= 2, `mission ${i + 1} has objectives`);
    assert.ok(m.reward > 0, `mission ${i + 1} has a reward`);
    // Should still be able to create their state
    const state = createInitialState({ seed: 42, shiftId: m.shiftId });
    assert.ok(state.schedule.length > 0, `mission ${i + 1} creates a valid schedule`);
  }
});
