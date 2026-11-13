// @ts-check
/**
 * Scripted players for the balance gates (docs/BUILD_PLAN.md §3). They read
 * the state and issue taps, exactly as a person would; they never change it.
 */
/** @import { SimState, Command, Target, LiveGuest } from '../../src/sim/types.js' */
import { CONFIG, TICKS_PER_SECOND, resolveTap } from '../../src/sim/index.js';

/** @typedef {'idle' | 'arrivalOrder' | 'priority' | 'fastPriority'} PlayerKind */

/** Seconds between actions for each player. */
export const PLAYER_INTERVAL_SECONDS = /** @type {Readonly<Record<PlayerKind, number>>} */ ({
  idle: Infinity,
  arrivalOrder: 1,
  priority: 1,
  fastPriority: 0.7,
});

/**
 * @param {SimState} state
 * @returns {{ guest: LiveGuest, index: number, order: 'latte' | 'croissant' }[]} Guests at the counter, oldest first.
 */
function atCounter(state) {
  const out = [];
  for (const [index, id] of state.spots.entries()) {
    if (id === null) continue;
    const guest = state.guests.find((g) => g.id === id);
    const spec = state.schedule.find((g) => g.id === id);
    if (guest && spec) out.push({ guest, index, order: spec.order });
  }
  return out.sort((a, b) => a.guest.id - b.guest.id);
}

/** @param {SimState} state */
const cleanDishes = (state) => state.dishes.filter((d) => d.holder.kind === 'rack').length;
/** @param {SimState} state */
const dirtyDishes = (state) => state.dishes.filter((d) => d.holder.kind === 'sink').length;

/**
 * Handles the oldest request first, one thing at a time, and waits while a
 * drink brews.
 * @param {SimState} state
 * @returns {Target | null}
 */
function arrivalOrder(state) {
  if (state.owner.action !== null || state.owner.queue.length > 0) return null;
  const oldest = atCounter(state).find((c) => c.guest.state === 'waiting' || c.guest.state === 'asking');
  if (!oldest) {
    const dirty = state.tables.find((t) => t.state === 'dirty');
    if (dirty) return { kind: 'table', tableId: dirty.id };
    return dirtyDishes(state) > 0 ? { kind: 'sink' } : null;
  }
  const spot = /** @type {Target} */ ({ kind: 'spot', index: oldest.index });
  if (oldest.guest.state === 'asking') return spot;
  if (oldest.order === 'latte') {
    if (state.machine.slots.some((s) => s.state === 'ready')) return spot;
    if (state.machine.slots.some((s) => s.state === 'brewing')) return null;
    return cleanDishes(state) > 0 ? { kind: 'machine' } : dirtyDishes(state) > 0 ? { kind: 'sink' } : null;
  }
  if (state.pass.dishId !== null) return spot;
  return cleanDishes(state) > 0 ? { kind: 'case' } : dirtyDishes(state) > 0 ? { kind: 'sink' } : null;
}

/**
 * Serves the least patient guest first, starts drinks ahead of need, works
 * while the machine brews, washes before the rack runs out, and wipes a table
 * in time for a guest who would otherwise have to stand. It uses only what a
 * person can see: it does not know who will ask a question or who arrives next.
 * @param {SimState} state
 * @returns {Target | null}
 */
function priority(state) {
  if (state.owner.queue.length > 0) return null;
  const t = state.timing;
  /** @type {{ target: Target, urgency: number }[]} */
  const options = [];
  const counter = atCounter(state);
  const wanting = counter.filter((c) => c.guest.state === 'waiting' || c.guest.state === 'walkingIn');
  /** @param {'latte' | 'croissant'} order */
  const leastPatient = (order) =>
    wanting.filter((c) => c.order === order).sort((a, b) => a.guest.patienceLeft - b.guest.patienceLeft)[0];
  const dirtyTable = state.tables.find((tb) => tb.state === 'dirty');
  const noneClean = !state.tables.some((tb) => tb.state === 'clean');
  const wipeCost = t.wipe + 2 * t.travel;

  for (const c of counter) {
    const spot = /** @type {Target} */ ({ kind: 'spot', index: c.index });
    if (c.guest.state === 'waiting') {
      // Hand over anything that is ready: quick, earns now, frees the machine.
      const urgency = -100000 + c.guest.patienceLeft;
      options.push({ target: spot, urgency });
      // A guest who would have to stand leaves no tip. Wipe first when that
      // still leaves them served with more than half their patience.
      const ready = resolveTap(state, spot).ok;
      if (ready && noneClean && dirtyTable && c.guest.patienceLeft - wipeCost - t.handOver > t.counterPatience * CONFIG.tipPatienceFraction + 15) {
        options.push({ target: { kind: 'table', tableId: dirtyTable.id }, urgency: urgency - 1 });
      }
    } else if (c.guest.state === 'asking') {
      options.push({ target: spot, urgency: c.guest.patienceLeft });
      if (noneClean && dirtyTable && c.guest.patienceLeft > wipeCost + t.answer + 60) {
        options.push({ target: { kind: 'table', tableId: dirtyTable.id }, urgency: c.guest.patienceLeft - 1 });
      }
    }
  }
  // Start a drink when more are wanted than are on the way.
  const lattesWanted = wanting.filter((c) => c.order === 'latte').length;
  const lattesComing =
    state.machine.slots.filter((s) => s.state !== 'empty').length + (state.owner.action?.kind === 'brewStart' ? 1 : 0);
  const latteGuest = leastPatient('latte');
  if (latteGuest && lattesWanted > lattesComing) {
    options.push({ target: { kind: 'machine' }, urgency: latteGuest.guest.patienceLeft - t.brew - 400 });
  }
  const croissantGuest = leastPatient('croissant');
  if (croissantGuest && state.pass.dishId === null && state.owner.action?.kind !== 'plate') {
    options.push({ target: { kind: 'case' }, urgency: croissantGuest.guest.patienceLeft - 200 });
  }
  // Upkeep: urgent when it is about to block service, background otherwise.
  // Background jobs are not started while a guest is close to leaving, or when
  // a drink someone is waiting for is about to be ready.
  const someoneUrgent = counter.some((c) => c.guest.attendedBy === null && c.guest.patienceLeft < 8 * TICKS_PER_SECOND);
  const drinkAlmostReady =
    wanting.some((c) => c.order === 'latte') && state.machine.slots.some((s) => s.state === 'brewing' && s.ticksLeft <= 36);
  const background = !someoneUrgent && !drinkAlmostReady;
  if (dirtyDishes(state) > 0) {
    const clean = cleanDishes(state);
    if (clean === 0) options.push({ target: { kind: 'sink' }, urgency: -50000 });
    else if (clean === 1) options.push({ target: { kind: 'sink' }, urgency: 120 });
    else if (background) options.push({ target: { kind: 'sink' }, urgency: 900 });
  }
  if (dirtyTable && background) {
    options.push({ target: { kind: 'table', tableId: dirtyTable.id }, urgency: noneClean ? 300 : 1200 });
  }

  const current = state.owner.action;
  const usable = options.filter(({ target }) => {
    const r = resolveTap(state, target);
    if (!r.ok) return false;
    return !(current && current.kind === r.kind && current.claims.guestId === r.guestId && current.claims.tableId === r.tableId);
  });
  usable.sort((a, b) => a.urgency - b.urgency);
  return usable[0]?.target ?? null;
}

/**
 * @param {PlayerKind} kind
 * @returns {(state: SimState) => Command[]} A decision function for runShift.
 */
export function createPlayer(kind) {
  const interval = Math.round(PLAYER_INTERVAL_SECONDS[kind] * TICKS_PER_SECOND);
  const choose = kind === 'arrivalOrder' ? arrivalOrder : priority;
  let nextAllowed = 0;
  return (state) => {
    if (kind === 'idle' || state.tick < nextAllowed) return [];
    const target = choose(state);
    if (!target) return [];
    nextAllowed = state.tick + interval;
    return [{ type: 'tap', target }];
  };
}

/**
 * @param {SimState} state A finished shift.
 */
export function summarise(state) {
  const g = state.metrics.guests;
  const ticks = state.metrics.ownerTicks;
  const total = Object.values(ticks).reduce((a, b) => a + b, 0);
  return {
    guests: state.schedule.length,
    served: g.served,
    leftHappy: g.leftHappy,
    leftUnhappy: g.leftUnhappy,
    walkedPast: g.walkedPast,
    tips: state.metrics.tips,
    gross: state.economy.grossEarnings,
    score: state.economy.score,
    busy: total === 0 ? 0 : 1 - ticks.idle / total,
    answerSeconds: ticks.answer / TICKS_PER_SECOND,
    endTick: state.tick,
  };
}

/** @typedef {ReturnType<typeof summarise>} Summary */

/**
 * Plays the slice shift once with each scripted player.
 * @param {number} seed
 * @param {typeof import('../../src/sim/index.js').runShift} runShift
 * @returns {Record<PlayerKind, Summary>}
 */
export function playShift(seed, runShift) {
  /** @param {PlayerKind} kind */
  const play = (kind) => summarise(runShift({ seed }, createPlayer(kind)).state);
  return {
    idle: play('idle'),
    arrivalOrder: play('arrivalOrder'),
    priority: play('priority'),
    fastPriority: play('fastPriority'),
  };
}

/**
 * Balance gates B1-B4 (docs/BUILD_PLAN.md §3).
 * @param {Record<PlayerKind, Summary>} r
 * @returns {{ id: string, label: string, pass: boolean, detail: string }[]}
 */
export function evaluateGates(r) {
  const pct = (/** @type {number} */ n) => `${Math.round(n * 100)}%`;
  const idleLost = (r.idle.leftUnhappy + r.idle.walkedPast) / r.idle.guests;
  const naiveServed = r.arrivalOrder.served / r.arrivalOrder.guests;
  const margin = r.arrivalOrder.gross === 0 ? Infinity : r.priority.gross / r.arrivalOrder.gross - 1;
  const fast = r.fastPriority;
  return [
    { id: 'B1', label: 'an idle player loses at least 60% of guests', pass: idleLost >= 0.6, detail: `lost ${pct(idleLost)}` },
    { id: 'B2', label: 'arrival-order play serves at least 50%', pass: naiveServed >= 0.5, detail: `served ${pct(naiveServed)}` },
    {
      id: 'B3',
      label: 'prioritising earns at least 20% more than arrival-order',
      pass: margin >= 0.2,
      detail: `${r.priority.gross} against ${r.arrivalOrder.gross} coins, ${pct(margin)} more`,
    },
    {
      id: 'B4',
      label: 'a fast prioritising player serves everyone while busy at least 70% of the shift',
      pass: fast.served === fast.guests && fast.leftUnhappy === 0 && fast.walkedPast === 0 && fast.busy >= 0.7,
      detail: `served ${fast.served}/${fast.guests}, ${fast.leftUnhappy} unhappy, ${fast.walkedPast} walked past, busy ${pct(fast.busy)}`,
    },
  ];
}
