// @ts-check
/**
 * Helpers for rule tests: a shift with a hand-written guest list, and a driver
 * that steps it while checking every invariant after every tick.
 */
/** @import { SimState, SimEvent, Command, Target, QuestionTopic, OrderItem } from '../../src/sim/types.js' */
import assert from 'node:assert/strict';
import { checkInvariants, createInitialState, step } from '../../src/sim/index.js';

/**
 * @typedef {object} GuestInput
 * @property {number} at Arrival tick.
 * @property {OrderItem} [order] Defaults to a latte.
 * @property {QuestionTopic} [question]
 * @property {number} [seat] Ticks spent seated. Defaults to 240.
 */

/**
 * @param {GuestInput[]} guests In arrival order.
 * @returns {SimState}
 */
export function scene(guests) {
  const state = createInitialState();
  state.schedule = guests.map((g, i) => ({
    id: i + 1,
    arrivalTick: g.at,
    order: g.order ?? 'latte',
    question: g.question ? { topic: g.question, supported: g.question !== 'washroom' } : null,
    usesStandIfPresent: false,
    personality: 'regular',
    seatTicks: g.seat ?? 240,
    look: 0,
  }));
  return state;
}

/** @type {Readonly<Record<'machine' | 'case' | 'sink', Target>>} */
export const AT = { machine: { kind: 'machine' }, case: { kind: 'case' }, sink: { kind: 'sink' } };
/** @param {number} index @returns {Target} */
export const spot = (index) => ({ kind: 'spot', index });
/** @param {number} tableId @returns {Target} */
export const table = (tableId) => ({ kind: 'table', tableId });

/**
 * @param {SimState} state
 */
export function drive(state) {
  /** @type {SimEvent[]} */
  const events = [];
  /**
   * @param {Command[]} [commands]
   * @returns {SimEvent[]} Events of this tick.
   */
  function tick(commands = []) {
    const produced = step(state, commands);
    assert.deepEqual(checkInvariants(state), [], `invariants broken after tick ${state.tick - 1}`);
    events.push(...produced);
    return produced;
  }
  const api = {
    state,
    events,
    /** One tick. Tests may wrap this to observe every tick; the helpers below go through it. */
    tick,
    /** @param {Target} target */
    tap: (/** @type {Target} */ target) => api.tick([{ type: 'tap', target }]),
    /** Steps until `state.tick` equals `target`. @param {number} target */
    to(target) {
      assert.ok(target >= state.tick, `cannot go back to tick ${target}`);
      while (state.tick < target && state.phase !== 'ended') api.tick();
    },
    /**
     * Steps until an event of this type happens, and returns it.
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
    /** @param {string} type */
    all: (type) => events.filter((e) => e.type === type),
  };
  return api;
}
