// @ts-check
/**
 * Determinism: the same seed and the same commands give the same events and
 * the same final state, on every machine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, checkInvariants, createInitialState, digest, replay, runShift, step } from '../src/sim/index.js';
import { createPlayer } from './support/players.js';

/**
 * Fingerprints of one complete shift played by the prioritising player on the
 * default seed. They change whenever a rule, a config value or the player
 * changes; update them only on purpose. Matching values on another machine
 * show the simulation is deterministic across platforms.
 */
const PINNED = { events: '9cfb29e6c3762031', state: '36c2a46fb52cbe76' };

test('a full shift is reproducible and pinned', () => {
  const a = runShift({}, createPlayer('priority'));
  const b = runShift({}, createPlayer('priority'));
  assert.equal(digest(a.events), digest(b.events));
  assert.equal(digest(a.state), digest(b.state));
  assert.equal(a.state.phase, 'ended');
  assert.deepEqual({ events: digest(a.events), state: digest(a.state) }, PINNED);
});

test('replaying the recorded commands reproduces the run exactly', () => {
  for (const kind of /** @type {const} */ (['arrivalOrder', 'priority', 'fastPriority'])) {
    for (const seed of [CONFIG.defaultSeed, 3, 99]) {
      const original = runShift({ seed }, createPlayer(kind));
      const again = replay({ seed }, original.commandLog);
      assert.deepEqual(again.events, original.events, `${kind}, seed ${seed}`);
      assert.deepEqual(again.state, original.state, `${kind}, seed ${seed}`);
      assert.ok(original.commandLog.length > 0);
    }
  }
});

test('events are totally ordered by tick and sequence number', () => {
  const { events } = runShift({}, createPlayer('priority'));
  events.forEach((event, i) => {
    assert.equal(event.seq, i);
    if (i > 0) assert.ok(event.tick >= events[i - 1].tick);
  });
  assert.equal(events[0].type, 'shiftOpened');
  assert.equal(events[events.length - 1].type, 'shiftEnded');
});

test('different input gives a different run', () => {
  const base = runShift({}, createPlayer('priority'));
  assert.notEqual(digest(runShift({ seed: 5 }, createPlayer('priority')).events), digest(base.events));
  assert.notEqual(digest(runShift({}, createPlayer('arrivalOrder')).events), digest(base.events));
});

test('the result does not depend on how the caller batches ticks', () => {
  // One call per tick, with or without extra empty command lists, is the same run.
  const log = runShift({}, createPlayer('priority')).commandLog;
  const byTick = new Map(log.map((entry) => [entry.tick, entry.commands]));
  const state = createInitialState();
  while (state.phase !== 'ended') step(state, byTick.get(state.tick));
  assert.equal(digest(state), digest(runShift({}, createPlayer('priority')).state));
});

test('every tick of every scripted player keeps the invariants, and players never change the state', () => {
  for (const kind of /** @type {const} */ (['idle', 'arrivalOrder', 'priority', 'fastPriority'])) {
    for (const seed of [CONFIG.defaultSeed, 1, 2, 3]) {
      const player = createPlayer(kind);
      let ticks = 0;
      const run = runShift(
        { seed },
        (state) => {
          const before = ticks % 50 === 0 ? digest(state) : null;
          const commands = player(state);
          if (before !== null) assert.equal(digest(state), before, `${kind} changed the state`);
          return commands;
        },
        (state) => {
          ticks += 1;
          const problems = checkInvariants(state);
          assert.deepEqual(problems, [], `${kind}, seed ${seed}, tick ${state.tick - 1}`);
        },
      );
      const g = run.state.metrics.guests;
      // Every scheduled guest has exactly one outcome.
      assert.equal(g.leftHappy + g.leftUnhappy + g.walkedPast, run.state.schedule.length, `${kind}, seed ${seed}`);
      assert.equal(run.state.economy.wallet, run.state.economy.grossEarnings);
    }
  }
});
