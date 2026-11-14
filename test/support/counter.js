// @ts-check
/**
 * Test helper for the M2.5 order-service flow: drives the simulation through
 * the same presses a player makes (guest, station, carry, deliver), exactly
 * as the game loop does, and checks the invariants after every tick.
 */
/** @import { SimState, SimEvent, Command } from '../../src/sim/types.js' */
/** @import { Outcome, Station } from '../../src/ui/service.js' */
import assert from 'node:assert/strict';
import { checkInvariants, step } from '../../src/sim/index.js';
import { createService } from '../../src/ui/service.js';

/**
 * @param {SimState} state
 */
export function counter(state) {
  const service = createService();
  /** @type {{ command: Command, ticket: number | null }[]} */
  let pending = [];
  /** @type {SimEvent[]} */
  const events = [];
  /** @type {{ tick: number, commands: Command[] }[]} */
  const commandLog = [];

  /** @param {Outcome} outcome */
  function take(outcome) {
    if (outcome.command) pending.push({ command: outcome.command, ticket: outcome.ticket ?? null });
    return outcome;
  }

  function tick() {
    const batch = pending;
    pending = [];
    const commands = batch.map((p) => p.command);
    if (commands.length > 0) commandLog.push({ tick: state.tick, commands });
    const produced = step(state, commands);
    service.onTick(state, produced, batch.filter((p) => p.command.type === 'tap').map((p) => p.ticket));
    assert.deepEqual(checkInvariants(state), [], `invariants broken after tick ${state.tick - 1}`);
    events.push(...produced);
    return produced;
  }

  const api = {
    state,
    service,
    events,
    commandLog,
    /** One tick, as the game loop does it. Tests may wrap this to observe each tick. */
    tick,
    /** @param {number} index */
    spot: (/** @type {number} */ index) => take(service.pressSpot(state, index)),
    /** @param {Station} station */
    station: (/** @type {Station} */ station) => take(service.pressStation(state, station)),
    /** A plain tap, for the sink and the tables, which work as before. @param {import('../../src/sim/types.js').Target} target */
    tap: (/** @type {import('../../src/sim/types.js').Target} */ target) => take({ accepted: true, command: { type: 'tap', target } }),
    /** @param {number | null} index */
    drop: (/** @type {number | null} */ index) => take(service.drop(state, index)),
    /** @param {number} slot */
    card: (/** @type {number} */ slot) => service.cards(state)[slot],
    /**
     * @param {string} type
     * @param {(event: SimEvent) => boolean} [match]
     * @returns {SimEvent}
     */
    until(type, match = () => true) {
      for (let i = 0; i < 6000; i++) {
        const hit = api.tick().find((e) => e.type === type && match(e));
        if (hit) return hit;
        if (state.phase === 'ended') break;
      }
      throw new Error(`No "${type}" event happened`);
    },
    /** @param {number} n */
    wait(n) {
      for (let i = 0; i < n && state.phase !== 'ended'; i++) api.tick();
    },
  };
  return api;
}
