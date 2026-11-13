// @ts-check
/**
 * Rules that must hold for every state at every tick. Used by tests now and
 * by the fuzz test in M1. See docs/GAME_DESIGN.md §3a.
 */
/** @import { SimState } from './types.js' */
import { CONFIG } from './config.js';

/**
 * @param {SimState} state
 * @returns {string[]} One message per broken rule. Empty when the state is sound.
 */
export function checkInvariants(state) {
  /** @type {string[]} */
  const problems = [];
  /**
   * @param {boolean} ok
   * @param {string} message
   */
  const must = (ok, message) => {
    if (!ok) problems.push(message);
  };

  must(Number.isInteger(state.tick) && state.tick >= 0, 'tick must be a non-negative integer');

  // Dishes: fixed total, unique ids, exactly one valid holder each.
  must(state.dishes.length === CONFIG.dishes, `expected ${CONFIG.dishes} dishes`);
  must(new Set(state.dishes.map((d) => d.id)).size === state.dishes.length, 'dish ids must be unique');
  /** @type {Record<string, number>} */
  const held = { rack: 0, machine: 0, pass: 0, guest: 0, sink: 0 };
  for (const dish of state.dishes) {
    held[dish.holder.kind] = (held[dish.holder.kind] ?? 0) + 1;
    if (dish.holder.kind === 'machine') {
      const slot = state.machine.slots[dish.holder.slot];
      must(slot !== undefined && slot.dishId === dish.id, `dish ${dish.id} and its machine slot disagree`);
    }
    if (dish.holder.kind === 'pass') {
      must(state.pass.dishId === dish.id, `dish ${dish.id} and the pass disagree`);
    }
  }
  must(held.pass <= 1, 'the pass holds at most one dish');
  for (const [i, slot] of state.machine.slots.entries()) {
    must((slot.state === 'empty') === (slot.dishId === null), `machine slot ${i}: state and dish disagree`);
    must(Number.isInteger(slot.ticksLeft) && slot.ticksLeft >= 0, `machine slot ${i}: bad timer`);
  }

  // Counter spots and the door.
  must(state.spots.length === CONFIG.counterSpots, `expected ${CONFIG.counterSpots} counter spots`);
  must(state.doorQueue.length <= CONFIG.doorQueueMax, 'door queue over its limit');
  const placed = [
    ...state.spots.filter((id) => id !== null),
    ...state.doorQueue,
    ...state.stand.queue,
    ...(state.stand.userId === null ? [] : [state.stand.userId]),
    ...state.tables.flatMap((t) => (t.guestId === null ? [] : [t.guestId])),
  ];
  must(new Set(placed).size === placed.length, 'a guest is in more than one place');

  // Tables.
  must(state.tables.length === CONFIG.tables, `expected ${CONFIG.tables} tables`);
  for (const table of state.tables) {
    must((table.state === 'occupied') === (table.guestId !== null), `table ${table.id}: state and guest disagree`);
  }

  // Stand.
  must(state.stand.installed || (state.stand.userId === null && state.stand.queue.length === 0), 'guests at a stand that is not installed');

  // Schedule.
  must(state.nextArrivalIndex >= 0 && state.nextArrivalIndex <= state.schedule.length, 'arrival index out of range');
  for (let i = 1; i < state.schedule.length; i++) {
    const a = state.schedule[i - 1];
    const b = state.schedule[i];
    must(a.arrivalTick <= b.arrivalTick && a.id < b.id, `schedule out of order at guest ${b.id}`);
  }

  // Money: three separate figures.
  const e = state.economy;
  must(e.grossEarnings >= 0 && e.spent >= 0, 'earnings and spending cannot be negative');
  must(e.wallet === e.startingWallet + e.grossEarnings - e.spent, 'wallet does not equal start + gross - spent');
  must(e.wallet >= 0, 'wallet cannot be negative');

  // Counters never go negative.
  const counters = [
    ...Object.values(state.metrics.ownerTicks),
    ...Object.values(state.metrics.spotTicks),
    ...Object.values(state.metrics.guests),
    state.metrics.allSpotsFullTicks,
  ];
  must(counters.every((n) => Number.isInteger(n) && n >= 0), 'a metric is negative or not a whole number');

  return problems;
}
