// @ts-check
/**
 * The rules every state must satisfy at the end of every tick. M0 defines and
 * tests the checker; M1's step function must keep it silent, including through
 * abandonment, cancellation and the end of a shift.
 * Definitions: docs/GAME_DESIGN.md §3a and docs/TECH_BLUEPRINT.md §4.
 */
/** @import { SimState, LiveGuest, GuestState } from './types.js' */
import { CONFIG } from './config.js';

/** Guest states in which the guest has been served and holds a dish. */
const HOLDS_DISH = /** @type {ReadonlySet<GuestState>} */ (
  new Set(['asking', 'walkingToStand', 'atStand', 'walkingToTable', 'seated', 'standing'])
);

/** Which kind of place each guest state allows. */
const PLACE_FOR_STATE = /** @type {Readonly<Record<GuestState, readonly string[]>>} */ ({
  walkingIn: ['spot'],
  waiting: ['spot', 'door'],
  asking: ['spot'],
  walkingToStand: ['stand'],
  atStand: ['stand'],
  walkingToTable: ['table'],
  seated: ['table'],
  standing: ['standing'],
});

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
  /** @param {number} n */
  const wholeNonNegative = (n) => Number.isInteger(n) && n >= 0;

  const action = state.owner.action;
  const actionId = action ? action.id : null;
  /** @type {Map<number, LiveGuest>} */
  const guestById = new Map(state.guests.map((g) => [g.id, g]));
  const dishById = new Map(state.dishes.map((d) => [d.id, d]));

  must(wholeNonNegative(state.tick), 'tick must be a non-negative whole number');

  // ---- Dishes: fixed total, and exactly one holder each, mirrored by that holder.
  must(state.dishes.length === CONFIG.dishes, `expected ${CONFIG.dishes} dishes`);
  must(dishById.size === state.dishes.length, 'dish ids must be unique');
  for (const dish of state.dishes) {
    const h = dish.holder;
    switch (h.kind) {
      case 'rack':
      case 'sink':
        break;
      case 'reserved':
        must(
          action !== null &&
            action.id === h.actionId &&
            action.reservedDishId === dish.id &&
            (action.kind === 'brewStart' || action.kind === 'plate'),
          `dish ${dish.id} is reserved, but not by the owner's current start-brew or plate action`,
        );
        break;
      case 'machine': {
        const slot = state.machine.slots[h.slot];
        must(slot !== undefined && slot.dishId === dish.id, `dish ${dish.id} and its machine slot disagree`);
        break;
      }
      case 'pass':
        must(state.pass.dishId === dish.id, `dish ${dish.id} and the pass disagree`);
        break;
      case 'guest':
        must(guestById.get(h.guestId)?.dishId === dish.id, `dish ${dish.id} and guest ${h.guestId} disagree`);
        break;
      default:
        must(false, `dish ${dish.id} has an unknown holder`);
    }
  }

  // ---- Reverse references back to dishes.
  if (action !== null && action.reservedDishId !== null) {
    const h = dishById.get(action.reservedDishId)?.holder;
    must(h?.kind === 'reserved' && h.actionId === action.id, 'the current action names a reserved dish it does not hold');
  }
  for (const [i, slot] of state.machine.slots.entries()) {
    must((slot.state === 'empty') === (slot.dishId === null), `machine slot ${i}: state and dish disagree`);
    must(wholeNonNegative(slot.ticksLeft), `machine slot ${i}: bad timer`);
    if (slot.dishId !== null) {
      const h = dishById.get(slot.dishId)?.holder;
      must(h?.kind === 'machine' && h.slot === i, `machine slot ${i} names a dish held elsewhere`);
    }
  }
  if (state.pass.dishId !== null) {
    must(dishById.get(state.pass.dishId)?.holder.kind === 'pass', 'the pass names a dish held elsewhere');
  }

  // ---- Guests: one place each, mirrored by the container; dish and state agree.
  must(guestById.size === state.guests.length, 'guest ids must be unique');
  must(state.spots.length === CONFIG.counterSpots, `expected ${CONFIG.counterSpots} counter spots`);
  must(state.doorQueue.length <= CONFIG.doorQueueMax, 'door queue over its limit');
  must(state.tables.length === CONFIG.tables, `expected ${CONFIG.tables} tables`);
  const standIds = [...(state.stand.userId === null ? [] : [state.stand.userId]), ...state.stand.queue];
  const listed = [
    ...state.spots.filter((id) => id !== null),
    ...state.doorQueue,
    ...standIds,
    ...state.tables.flatMap((t) => (t.guestId === null ? [] : [t.guestId])),
  ];
  must(new Set(listed).size === listed.length, 'a guest is in more than one place');
  for (const id of listed) {
    must(guestById.has(id), `guest ${id} is listed in a place but is not in the café`);
  }
  for (const guest of state.guests) {
    const p = guest.place;
    const where =
      p.kind === 'spot'
        ? state.spots[p.index] === guest.id
        : p.kind === 'door'
          ? state.doorQueue.includes(guest.id)
          : p.kind === 'stand'
            ? standIds.includes(guest.id)
            : p.kind === 'table'
              ? state.tables.find((t) => t.id === p.tableId)?.guestId === guest.id
              : !listed.includes(guest.id);
    must(where, `guest ${guest.id}: place and its container disagree`);
    must(PLACE_FOR_STATE[guest.state]?.includes(p.kind) === true, `guest ${guest.id}: state ${guest.state} cannot be at ${p.kind}`);
    must(HOLDS_DISH.has(guest.state) === (guest.dishId !== null), `guest ${guest.id}: state ${guest.state} and dish disagree`);
    if (guest.dishId !== null) {
      const h = dishById.get(guest.dishId)?.holder;
      must(h?.kind === 'guest' && h.guestId === guest.id, `guest ${guest.id} names a dish held elsewhere`);
    }
    must(wholeNonNegative(guest.patienceLeft) && wholeNonNegative(guest.timerLeft), `guest ${guest.id}: bad timer`);
    if (guest.attendedBy !== null) {
      must(
        guest.attendedBy === actionId && action?.claims.guestId === guest.id,
        `guest ${guest.id} is attended by an action that is not the owner's current action`,
      );
      must(guest.state === 'waiting' || guest.state === 'asking', `guest ${guest.id} is attended while ${guest.state}`);
    }
  }

  // ---- Tables.
  for (const table of state.tables) {
    must((table.state === 'occupied') === (table.guestId !== null), `table ${table.id}: state and guest disagree`);
    must((table.state === 'wiping') === (table.claimedBy !== null), `table ${table.id}: wiping state and claim disagree`);
    if (table.claimedBy !== null) {
      must(table.claimedBy === actionId && action?.claims.tableId === table.id, `table ${table.id} is claimed by an action that is not current`);
    }
  }

  // ---- Claims on prepared items, and the current action's claims mirrored on their targets.
  for (const [i, slot] of state.machine.slots.entries()) {
    if (slot.claimedBy !== null) {
      must(slot.claimedBy === actionId && action?.claims.slot === i, `machine slot ${i} is claimed by an action that is not current`);
    }
  }
  if (state.pass.claimedBy !== null) {
    must(state.pass.claimedBy === actionId && action?.claims.pass === true, 'the pass is claimed by an action that is not current');
  }
  if (action !== null) {
    const c = action.claims;
    must(wholeNonNegative(action.ticksLeft), 'the current action has a bad timer');
    must(action.id < state.owner.nextActionId, 'the current action id is not below nextActionId');
    must(c.guestId === null || guestById.get(c.guestId)?.attendedBy === action.id, 'the current action claims a guest who is not marked attended');
    must(c.slot === null || state.machine.slots[c.slot]?.claimedBy === action.id, 'the current action claims a machine slot that is not marked');
    must(!c.pass || state.pass.claimedBy === action.id, 'the current action claims the pass, which is not marked');
    must(c.tableId === null || state.tables.find((t) => t.id === c.tableId)?.claimedBy === action.id, 'the current action claims a table that is not marked');
    must(c.sinkDishId === null || dishById.get(c.sinkDishId)?.holder.kind === 'sink', 'the current action is washing a dish that is not in the sink');
    must((action.kind === 'brewStart' || action.kind === 'plate') === (action.reservedDishId !== null), 'only start-brew and plate actions hold a reserved dish, and they always do');
  }
  const queueIds = state.owner.queue.map((q) => q.id);
  must(new Set(queueIds).size === queueIds.length && queueIds.every((id) => id < state.owner.nextActionId && id !== actionId), 'queued action ids must be unique, issued, and not the current action');

  // ---- Stand.
  must(state.stand.installed || standIds.length === 0, 'guests at a stand that is not installed');

  // ---- Schedule.
  must(state.nextArrivalIndex >= 0 && state.nextArrivalIndex <= state.schedule.length, 'arrival index out of range');
  for (let i = 1; i < state.schedule.length; i++) {
    const a = state.schedule[i - 1];
    const b = state.schedule[i];
    must(a.arrivalTick <= b.arrivalTick && a.id < b.id, `schedule out of order at guest ${b.id}`);
  }

  // ---- Shift phase.
  if (state.phase === 'ready') {
    must(state.tick === 0 && state.guests.length === 0 && state.nextArrivalIndex === 0, 'a shift that has not opened must be untouched');
  }
  if (state.phase === 'ended') {
    must(state.guests.length === 0 && listed.length === 0, 'guests remain after the shift ended');
    must(action === null && state.owner.queue.length === 0, 'owner actions remain after the shift ended');
    must(state.dishes.every((d) => d.holder.kind === 'rack' || d.holder.kind === 'sink'), 'after the shift ended every dish must be in the rack or the sink');
    must(state.tables.every((t) => t.state === 'clean' || t.state === 'dirty'), 'tables are occupied or being wiped after the shift ended');
    must(state.nextArrivalIndex === state.schedule.length, 'scheduled guests never arrived');
  }

  // ---- Money: three separate figures.
  const e = state.economy;
  must(e.grossEarnings >= 0 && e.spent >= 0, 'earnings and spending cannot be negative');
  must(e.wallet === e.startingWallet + e.grossEarnings - e.spent, 'wallet does not equal start + gross - spent');
  must(e.wallet >= 0, 'wallet cannot be negative');

  // ---- Counters never go negative.
  const counters = [
    ...Object.values(state.metrics.ownerTicks),
    ...Object.values(state.metrics.spotTicks),
    ...Object.values(state.metrics.guests),
    state.metrics.allSpotsFullTicks,
  ];
  must(counters.every(wholeNonNegative), 'a metric is negative or not a whole number');

  return problems;
}
