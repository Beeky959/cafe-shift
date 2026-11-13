// @ts-check
/**
 * Advances the simulation by one tick. Pure rules: no DOM, canvas, audio,
 * clock or randomness. Phase order follows docs/TECH_BLUEPRINT.md §3 exactly:
 * commands, owner, machine, guests, promotions, arrivals, shift phase.
 * Ownership rules: docs/GAME_DESIGN.md §3a.
 */
/** @import { SimState, SimEvent, Command, Target, LiveGuest, OwnerAction, OwnerActionKind, QueuedAction, GuestSpec, Dish } from './types.js' */
import { CONFIG } from './config.js';

/** Where each kind of action takes place. */
const ZONE = /** @type {Readonly<Record<OwnerActionKind, string>>} */ ({
  brewStart: 'machine',
  plate: 'case',
  handOver: 'counter',
  answer: 'counter',
  wipe: 'floor',
  wash: 'sink',
});

/** @typedef {(type: string, detail?: Record<string, string | number | boolean | null>) => void} Emit */

/**
 * @param {SimState} state
 * @param {number} guestId
 * @returns {GuestSpec}
 */
function specOf(state, guestId) {
  const spec = state.schedule.find((g) => g.id === guestId);
  if (!spec) throw new Error(`Guest ${guestId} is not in the schedule`);
  return spec;
}

/**
 * @param {SimState} state
 * @param {number} dishId
 * @returns {Dish}
 */
function dishOf(state, dishId) {
  const dish = state.dishes.find((d) => d.id === dishId);
  if (!dish) throw new Error(`Dish ${dishId} does not exist`);
  return dish;
}

/**
 * @param {SimState} state
 * @param {'rack' | 'sink'} kind
 * @returns {Dish | undefined} The lowest-numbered dish there.
 */
function firstDishIn(state, kind) {
  return state.dishes.find((d) => d.holder.kind === kind);
}

/**
 * @param {SimState} state
 * @param {GuestSpec['order']} order
 * @returns {{ slot: number | null, pass: boolean } | null} A ready, unclaimed item of that kind.
 */
function findReadyItem(state, order) {
  if (order === 'latte') {
    const slot = state.machine.slots.findIndex((s) => s.state === 'ready' && s.claimedBy === null);
    return slot === -1 ? null : { slot, pass: false };
  }
  return state.pass.dishId !== null && state.pass.claimedBy === null ? { slot: null, pass: true } : null;
}

/**
 * Decides what a tap on a target means right now. Used when the tap arrives
 * and again when the queued action is about to start.
 * @param {SimState} state
 * @param {Target} target
 * @returns {{ ok: true, kind: OwnerActionKind, guestId: number | null, tableId: number | null }
 *   | { ok: false, reason: string }}
 */
export function resolveTap(state, target) {
  /** @param {string} reason */
  const no = (reason) => ({ ok: /** @type {const} */ (false), reason });
  /**
   * @param {OwnerActionKind} kind
   * @param {number | null} [guestId]
   * @param {number | null} [tableId]
   */
  const yes = (kind, guestId = null, tableId = null) => ({ ok: /** @type {const} */ (true), kind, guestId, tableId });

  switch (target.kind) {
    case 'machine':
      if (!state.machine.slots.some((s) => s.state === 'empty' && s.claimedBy === null)) return no('machineBusy');
      if (!firstDishIn(state, 'rack')) return no('noCleanDish');
      return yes('brewStart');
    case 'case':
      if (state.pass.dishId !== null || state.pass.claimedBy !== null) return no('passFull');
      if (!firstDishIn(state, 'rack')) return no('noCleanDish');
      return yes('plate');
    case 'sink':
      return firstDishIn(state, 'sink') ? yes('wash') : no('nothingToWash');
    case 'spot': {
      const guestId = state.spots[target.index];
      if (guestId === null || guestId === undefined) return no('emptySpot');
      const guest = state.guests.find((g) => g.id === guestId);
      if (!guest) return no('emptySpot');
      if (guest.attendedBy !== null) return no('alreadyAttended');
      if (guest.state === 'asking') return yes('answer', guestId);
      if (guest.state !== 'waiting') return no('guestNotReady');
      return findReadyItem(state, specOf(state, guestId).order) ? yes('handOver', guestId) : no('itemNotReady');
    }
    case 'table': {
      const table = state.tables.find((t) => t.id === target.tableId);
      if (!table) return no('noSuchTable');
      return table.state === 'dirty' ? yes('wipe', null, table.id) : no('tableNotDirty');
    }
    default:
      return no('unknownTarget');
  }
}

/**
 * The target a queued action was made from, for re-checking when it starts.
 * @param {SimState} state
 * @param {QueuedAction} queued
 * @returns {Target | null}
 */
function targetOf(state, queued) {
  switch (queued.kind) {
    case 'brewStart':
      return { kind: 'machine' };
    case 'plate':
      return { kind: 'case' };
    case 'wash':
      return { kind: 'sink' };
    case 'wipe':
      return queued.tableId === null ? null : { kind: 'table', tableId: queued.tableId };
    default: {
      const index = state.spots.indexOf(queued.guestId);
      return queued.guestId === null || index === -1 ? null : { kind: 'spot', index };
    }
  }
}

/**
 * @param {SimState} state
 * @param {OwnerActionKind} kind
 * @returns {number}
 */
function workTicks(state, kind) {
  const t = state.timing;
  return kind === 'wash' ? t.washPerDish : t[kind];
}

/**
 * @param {SimState} state
 * @param {number} coins
 */
function earn(state, coins) {
  state.economy.grossEarnings += coins;
  state.economy.wallet += coins;
}

/**
 * Releases everything the current action reserved or claimed, without
 * completing it. Transition D4 for a reserved dish.
 * @param {SimState} state
 * @param {OwnerAction} action
 */
function releaseAction(state, action) {
  if (action.reservedDishId !== null) dishOf(state, action.reservedDishId).holder = { kind: 'rack' };
  const c = action.claims;
  if (c.guestId !== null) {
    const guest = state.guests.find((g) => g.id === c.guestId);
    if (guest) guest.attendedBy = null;
  }
  if (c.slot !== null) state.machine.slots[c.slot].claimedBy = null;
  if (c.pass) state.pass.claimedBy = null;
  if (c.tableId !== null) {
    const table = state.tables.find((t) => t.id === c.tableId);
    if (table) {
      table.claimedBy = null;
      table.state = 'dirty';
    }
  }
  state.owner.action = null;
}

/**
 * Removes a guest from the café: their place, any listing of them, and their
 * dish (transition D7) all go on this tick.
 * @param {SimState} state
 * @param {LiveGuest} guest
 */
function removeGuest(state, guest) {
  const p = guest.place;
  if (p.kind === 'spot') state.spots[p.index] = null;
  if (p.kind === 'door') state.doorQueue = state.doorQueue.filter((id) => id !== guest.id);
  if (p.kind === 'table') {
    const table = state.tables.find((t) => t.id === p.tableId);
    if (table) {
      table.guestId = null;
      table.state = 'dirty';
    }
  }
  if (guest.dishId !== null) dishOf(state, guest.dishId).holder = { kind: 'sink' };
  state.guests = state.guests.filter((g) => g.id !== guest.id);
}

/**
 * A served guest leaves the counter: to the lowest-numbered clean table, or
 * to stand if there is none.
 * @param {SimState} state
 * @param {LiveGuest} guest
 * @param {Emit} emit
 */
function leaveCounter(state, guest, emit) {
  if (guest.place.kind === 'spot') state.spots[guest.place.index] = null;
  const table = state.tables.find((t) => t.state === 'clean');
  if (table) {
    table.state = 'occupied';
    table.guestId = guest.id;
    guest.place = { kind: 'table', tableId: table.id };
    guest.state = 'walkingToTable';
    guest.timerLeft = state.timing.walkToTable;
    emit('guestToTable', { guestId: guest.id, tableId: table.id });
  } else {
    guest.place = { kind: 'standing' };
    guest.state = 'standing';
    guest.timerLeft = state.timing.standingConsume;
    emit('guestStanding', { guestId: guest.id });
  }
}

/**
 * @param {SimState} state
 * @param {LiveGuest} guest
 * @param {Emit} emit
 */
function leaveHappy(state, guest, emit) {
  const tipped = guest.place.kind === 'table' && guest.tipEligible;
  if (tipped) {
    earn(state, CONFIG.prices.tip);
    state.metrics.tips += 1;
  }
  removeGuest(state, guest);
  state.metrics.guests.leftHappy += 1;
  emit('guestLeftHappy', { guestId: guest.id, tip: tipped ? CONFIG.prices.tip : 0 });
}

/**
 * @param {SimState} state
 * @param {Command} command
 * @param {Emit} emit
 */
function applyCommand(state, command, emit) {
  const owner = state.owner;
  if (command.type === 'cancel') {
    if (owner.action) {
      const { id, kind } = owner.action;
      releaseAction(state, owner.action);
      emit('actionCancelled', { actionId: id, kind, reason: 'player' });
    }
    return;
  }
  if (command.type === 'unqueue') {
    const before = owner.queue.length;
    owner.queue = owner.queue.filter((q) => q.id !== command.actionId);
    if (owner.queue.length < before) emit('actionUnqueued', { actionId: command.actionId });
    return;
  }
  if (command.type !== 'tap' || typeof command.target !== 'object' || command.target === null) {
    emit('commandRejected', { reason: 'unknownCommand' });
    return;
  }
  const resolved = resolveTap(state, command.target);
  /** @param {string} reason */
  const reject = (reason) => emit('tapRejected', { target: command.target.kind, reason });
  if (!resolved.ok) return reject(resolved.reason);
  const same = (/** @type {{ kind: OwnerActionKind, guestId: number | null, tableId: number | null }} */ a) =>
    a.kind === resolved.kind && a.guestId === resolved.guestId && a.tableId === resolved.tableId;
  const current = owner.action;
  if (
    owner.queue.some(same) ||
    (current !== null && same({ kind: current.kind, guestId: current.claims.guestId, tableId: current.claims.tableId }))
  ) {
    return reject('alreadyQueued');
  }
  if (owner.queue.length >= CONFIG.queueMax) return reject('queueFull');
  const id = owner.nextActionId++;
  owner.queue.push({ id, kind: resolved.kind, guestId: resolved.guestId, tableId: resolved.tableId });
  emit('actionQueued', { actionId: id, kind: resolved.kind, guestId: resolved.guestId, tableId: resolved.tableId });
}

/**
 * Takes queued actions until one is still valid, then reserves, claims and
 * begins it. Invalid ones are dropped and reported.
 * @param {SimState} state
 * @param {Emit} emit
 */
function startNextAction(state, emit) {
  const owner = state.owner;
  while (owner.action === null && owner.queue.length > 0) {
    const queued = /** @type {QueuedAction} */ (owner.queue.shift());
    const target = targetOf(state, queued);
    const resolved = target ? resolveTap(state, target) : { ok: /** @type {const} */ (false), reason: 'targetGone' };
    if (!resolved.ok || resolved.kind !== queued.kind || resolved.guestId !== queued.guestId) {
      emit('actionDropped', { actionId: queued.id, kind: queued.kind, reason: resolved.ok ? 'targetChanged' : resolved.reason });
      continue;
    }
    /** @type {OwnerAction} */
    const action = {
      id: queued.id,
      kind: queued.kind,
      phase: 'working',
      ticksLeft: 0,
      zone: ZONE[queued.kind],
      reservedDishId: null,
      claims: { guestId: null, slot: null, pass: false, tableId: null, sinkDishId: null },
    };
    if (queued.kind === 'brewStart' || queued.kind === 'plate') {
      const dish = /** @type {Dish} */ (firstDishIn(state, 'rack'));
      dish.holder = { kind: 'reserved', actionId: action.id }; // D1
      action.reservedDishId = dish.id;
      if (queued.kind === 'brewStart') {
        const slot = state.machine.slots.findIndex((s) => s.state === 'empty' && s.claimedBy === null);
        state.machine.slots[slot].claimedBy = action.id;
        action.claims.slot = slot;
      } else {
        state.pass.claimedBy = action.id;
        action.claims.pass = true;
      }
    } else if (queued.kind === 'handOver' || queued.kind === 'answer') {
      const guest = /** @type {LiveGuest} */ (state.guests.find((g) => g.id === queued.guestId));
      guest.attendedBy = action.id;
      action.claims.guestId = guest.id;
      if (queued.kind === 'handOver') {
        const item = /** @type {{ slot: number | null, pass: boolean }} */ (findReadyItem(state, specOf(state, guest.id).order));
        if (item.slot !== null) state.machine.slots[item.slot].claimedBy = action.id;
        if (item.pass) state.pass.claimedBy = action.id;
        action.claims.slot = item.slot;
        action.claims.pass = item.pass;
      }
    } else if (queued.kind === 'wipe') {
      const table = /** @type {import('./types.js').Table} */ (state.tables.find((t) => t.id === queued.tableId));
      table.state = 'wiping';
      table.claimedBy = action.id;
      action.claims.tableId = table.id;
    } else {
      action.claims.sinkDishId = /** @type {Dish} */ (firstDishIn(state, 'sink')).id;
    }
    if (owner.zone === action.zone) {
      action.ticksLeft = workTicks(state, action.kind);
    } else {
      action.phase = 'travelling';
      action.ticksLeft = state.timing.travel;
    }
    owner.action = action;
    emit('actionStarted', { actionId: action.id, kind: action.kind, guestId: action.claims.guestId, tableId: action.claims.tableId });
  }
}

/**
 * Applies the effects of the current action finishing its work.
 * @param {SimState} state
 * @param {OwnerAction} action
 * @param {Emit} emit
 * @param {Set<number>} freshBrews Slots that begin brewing on this tick.
 */
function completeAction(state, action, emit, freshBrews) {
  const c = action.claims;
  switch (action.kind) {
    case 'brewStart': {
      const slotIndex = /** @type {number} */ (c.slot);
      const slot = state.machine.slots[slotIndex];
      const dishId = /** @type {number} */ (action.reservedDishId);
      dishOf(state, dishId).holder = { kind: 'machine', slot: slotIndex }; // D2
      slot.state = 'brewing';
      slot.dishId = dishId;
      slot.ticksLeft = state.timing.brew;
      slot.claimedBy = null;
      freshBrews.add(slotIndex);
      emit('brewStarted', { slot: slotIndex });
      break;
    }
    case 'plate': {
      const dishId = /** @type {number} */ (action.reservedDishId);
      dishOf(state, dishId).holder = { kind: 'pass' }; // D3
      state.pass.dishId = dishId;
      state.pass.claimedBy = null;
      emit('croissantPlated');
      break;
    }
    case 'handOver': {
      const guest = /** @type {LiveGuest} */ (state.guests.find((g) => g.id === c.guestId));
      const spec = specOf(state, guest.id);
      /** @type {number} */
      let dishId;
      if (c.slot !== null) {
        const slot = state.machine.slots[c.slot];
        dishId = /** @type {number} */ (slot.dishId); // D5
        slot.state = 'empty';
        slot.dishId = null;
        slot.claimedBy = null;
      } else {
        dishId = /** @type {number} */ (state.pass.dishId); // D6
        state.pass.dishId = null;
        state.pass.claimedBy = null;
      }
      dishOf(state, dishId).holder = { kind: 'guest', guestId: guest.id };
      guest.dishId = dishId;
      guest.attendedBy = null;
      guest.tipEligible = guest.patienceLeft > state.timing.counterPatience * CONFIG.tipPatienceFraction;
      const price = CONFIG.prices[spec.order];
      earn(state, price);
      state.metrics.guests.served += 1;
      emit('itemHandedOver', { guestId: guest.id, item: spec.order, coins: price });
      if (spec.question) {
        guest.state = 'asking';
        guest.patienceLeft = state.timing.askingPatience;
        emit('guestAsked', { guestId: guest.id, topic: spec.question.topic });
      } else {
        leaveCounter(state, guest, emit);
      }
      break;
    }
    case 'answer': {
      const guest = /** @type {LiveGuest} */ (state.guests.find((g) => g.id === c.guestId));
      guest.attendedBy = null;
      emit('questionAnswered', { guestId: guest.id });
      leaveCounter(state, guest, emit);
      break;
    }
    case 'wipe': {
      const table = /** @type {import('./types.js').Table} */ (state.tables.find((t) => t.id === c.tableId));
      table.state = 'clean';
      table.claimedBy = null;
      emit('tableWiped', { tableId: table.id });
      break;
    }
    case 'wash': {
      const dishId = /** @type {number} */ (c.sinkDishId);
      dishOf(state, dishId).holder = { kind: 'rack' }; // D8
      emit('dishWashed', { dishId });
      const next = firstDishIn(state, 'sink');
      if (next && state.owner.queue.length === 0) {
        // Washing continues, one dish at a time, until the sink is empty or
        // the player has queued something else.
        c.sinkDishId = next.id;
        action.ticksLeft = state.timing.washPerDish;
        return;
      }
      break;
    }
  }
  state.owner.action = null;
  emit('actionCompleted', { actionId: action.id, kind: action.kind });
}

/**
 * @param {SimState} state
 * @param {Emit} emit
 * @param {Set<number>} freshBrews
 */
function stepOwner(state, emit, freshBrews) {
  const owner = state.owner;
  const ticks = state.metrics.ownerTicks;
  const action = owner.action;
  if (action === null) {
    ticks.idle += 1;
  } else {
    ticks[action.phase === 'travelling' ? 'travel' : action.kind] += 1;
    action.ticksLeft -= 1;
    if (action.ticksLeft <= 0) {
      if (action.phase === 'travelling') {
        owner.zone = action.zone;
        action.phase = 'working';
        action.ticksLeft = workTicks(state, action.kind);
      } else {
        owner.zone = action.zone;
        completeAction(state, action, emit, freshBrews);
      }
    }
  }
  if (owner.action === null) startNextAction(state, emit);
}

/**
 * @param {SimState} state
 * @param {Emit} emit
 * @param {Set<number>} freshBrews A brew that starts on this tick first makes progress on the next.
 */
function stepMachine(state, emit, freshBrews) {
  for (const [index, slot] of state.machine.slots.entries()) {
    if (slot.state !== 'brewing' || freshBrews.has(index)) continue;
    slot.ticksLeft -= 1;
    if (slot.ticksLeft <= 0) {
      slot.ticksLeft = 0;
      slot.state = 'ready';
      emit('brewReady', { slot: index });
    }
  }
}

/**
 * @param {SimState} state
 * @param {Emit} emit
 */
function stepGuests(state, emit) {
  for (const guest of [...state.guests]) {
    switch (guest.state) {
      case 'walkingIn':
      case 'waiting':
      case 'asking': {
        if (guest.state === 'walkingIn') {
          guest.timerLeft -= 1;
          if (guest.timerLeft <= 0) {
            guest.timerLeft = 0;
            guest.state = 'waiting';
            emit('guestWaiting', { guestId: guest.id });
          }
        }
        if (guest.attendedBy !== null) break; // patience is frozen while attended
        guest.patienceLeft -= 1;
        if (guest.patienceLeft <= 0) {
          guest.patienceLeft = 0;
          const wasAsking = guest.state === 'asking';
          removeGuest(state, guest);
          state.metrics.guests.leftUnhappy += 1;
          emit('guestLeftUnhappy', { guestId: guest.id, wasAsking });
        }
        break;
      }
      case 'walkingToTable':
        guest.timerLeft -= 1;
        if (guest.timerLeft <= 0) {
          guest.state = 'seated';
          guest.timerLeft = specOf(state, guest.id).seatTicks;
          emit('guestSeated', { guestId: guest.id });
        }
        break;
      case 'seated':
      case 'standing':
        guest.timerLeft -= 1;
        if (guest.timerLeft <= 0) {
          guest.timerLeft = 0;
          leaveHappy(state, guest, emit);
        }
        break;
      default:
        throw new Error(`Guest ${guest.id} is in state ${guest.state}, which needs the stand (M4)`);
    }
  }
}

/**
 * Freed counter spots go to the head of the door queue, on the same tick.
 * @param {SimState} state
 * @param {Emit} emit
 */
function promoteFromDoor(state, emit) {
  for (let index = 0; index < state.spots.length && state.doorQueue.length > 0; index++) {
    if (state.spots[index] !== null) continue;
    const guestId = /** @type {number} */ (state.doorQueue.shift());
    const guest = /** @type {LiveGuest} */ (state.guests.find((g) => g.id === guestId));
    state.spots[index] = guestId;
    guest.place = { kind: 'spot', index };
    emit('guestPromoted', { guestId, spot: index });
  }
}

/**
 * @param {SimState} state
 * @param {Emit} emit
 */
function admitArrivals(state, emit) {
  while (
    state.nextArrivalIndex < state.schedule.length &&
    state.schedule[state.nextArrivalIndex].arrivalTick <= state.tick
  ) {
    const spec = state.schedule[state.nextArrivalIndex];
    state.nextArrivalIndex += 1;
    const spot = state.spots.indexOf(null);
    if (spot === -1 && state.doorQueue.length >= CONFIG.doorQueueMax) {
      state.metrics.guests.walkedPast += 1;
      emit('guestWalkedPast', { guestId: spec.id });
      continue;
    }
    /** @type {LiveGuest} */
    const guest = {
      id: spec.id,
      state: spot === -1 ? 'waiting' : 'walkingIn',
      place: spot === -1 ? { kind: 'door' } : { kind: 'spot', index: spot },
      dishId: null,
      attendedBy: null,
      patienceLeft: state.timing.counterPatience,
      timerLeft: spot === -1 ? 0 : state.timing.walkIn,
      tipEligible: false,
    };
    state.guests.push(guest);
    if (spot === -1) state.doorQueue.push(spec.id);
    else state.spots[spot] = spec.id;
    emit('guestArrived', { guestId: spec.id, order: spec.order, spot: spot === -1 ? null : spot });
  }
}

/**
 * Ends the shift on one tick, in the order fixed by GAME_DESIGN.md §3a.
 * @param {SimState} state
 * @param {Emit} emit
 */
function endShift(state, emit) {
  const owner = state.owner;
  // 1. Cancel the current action and clear the queue.
  if (owner.action) {
    const { id, kind } = owner.action;
    releaseAction(state, owner.action);
    emit('actionCancelled', { actionId: id, kind, reason: 'shiftEnded' });
  }
  owner.queue = [];
  // 2. Discard unserved items; their dishes return to the rack (D9).
  for (const slot of state.machine.slots) {
    if (slot.dishId !== null) dishOf(state, slot.dishId).holder = { kind: 'rack' };
    slot.state = 'empty';
    slot.dishId = null;
    slot.ticksLeft = 0;
    slot.claimedBy = null;
  }
  if (state.pass.dishId !== null) dishOf(state, state.pass.dishId).holder = { kind: 'rack' };
  state.pass.dishId = null;
  state.pass.claimedBy = null;
  // 3. Settle the guests who are still enjoying their order.
  for (const guest of [...state.guests]) leaveHappy(state, guest, emit);

  const m = state.metrics.guests;
  const mood = state.schedule.length === 0 ? 0 : m.leftHappy / state.schedule.length;
  state.economy.score = state.economy.grossEarnings + Math.round(CONFIG.moodBonusMax * mood);
  state.phase = 'ended';
  emit('shiftEnded', {
    grossEarnings: state.economy.grossEarnings,
    score: state.economy.score,
    served: m.served,
    leftHappy: m.leftHappy,
    leftUnhappy: m.leftUnhappy,
    walkedPast: m.walkedPast,
  });
}

/**
 * Advances `state` by one tick, in place.
 * @param {SimState} state
 * @param {readonly Command[]} [commands] Player input for this tick, in the order received.
 * @returns {SimEvent[]} What happened, in order.
 */
export function step(state, commands = []) {
  if (state.stand.installed) {
    throw new Error('The stand has no rules yet: they arrive in M4. Use the "none" preset.');
  }
  /** @type {SimEvent[]} */
  const events = [];
  if (state.phase === 'ended') return events;
  /** @type {Emit} */
  const emit = (type, detail = {}) => {
    events.push({ tick: state.tick, seq: state.nextEventSeq++, type, ...detail });
  };
  if (state.phase === 'ready') {
    state.phase = 'open';
    emit('shiftOpened');
  }

  for (const command of commands) applyCommand(state, command, emit); // 1
  /** @type {Set<number>} */
  const freshBrews = new Set();
  stepOwner(state, emit, freshBrews); // 2
  stepMachine(state, emit, freshBrews); // 3
  stepGuests(state, emit); // 4
  promoteFromDoor(state, emit); // 5
  if (state.phase === 'open') admitArrivals(state, emit); // 6

  // Occupancy metrics for this tick.
  let occupied = 0;
  for (const guestId of state.spots) {
    if (guestId === null) continue;
    occupied += 1;
    const guest = state.guests.find((g) => g.id === guestId);
    state.metrics.spotTicks[guest?.state === 'asking' ? 'asking' : 'waiting'] += 1;
  }
  if (occupied === state.spots.length) state.metrics.allSpotsFullTicks += 1;

  // 7. Shift phase.
  if (state.phase === 'open' && state.tick + 1 >= state.timing.shiftLength) {
    state.phase = 'closing';
    emit('doorsClosed');
  }
  if (
    state.phase === 'closing' &&
    !state.guests.some((g) => g.state === 'walkingIn' || g.state === 'waiting' || g.state === 'asking')
  ) {
    endShift(state, emit);
  }

  state.tick += 1; // 8
  return events;
}
