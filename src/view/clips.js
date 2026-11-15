// @ts-check
/**
 * Clip selection: what each thing on screen is doing, as a pure function of
 * the simulation state. No timers live here. Progress values are the
 * simulation's own timers, so an animation can never run ahead of, or finish
 * apart from, the action it shows. See docs/TECH_BLUEPRINT.md §5.
 */
/** @import { SimState, LiveGuest, OwnerAction, OrderItem } from '../sim/types.js' */
import { HIT_AREAS } from './scene.js';

/** Where people stand. Feet positions in scene units. */
export const STAGE = Object.freeze({
  /** Feet of anyone behind the counter; the counter hides everything below the hips. */
  behindY: 392,
  owner: Object.freeze({
    machine: { x: 222, facing: -1 },
    case: { x: 448, facing: -1 },
    register: { x: 552, facing: 0 },
    sink: { x: 742, facing: 1 },
  }),
  /** The counter gate, at the right end: the way between the counter and the floor. */
  gate: Object.freeze([
    { x: 930, y: 392 },
    { x: 930, y: 520 },
  ]),
  spotY: 538,
  door: { x: -46, y: 548 },
  doorQueue: Object.freeze([
    { x: 176, y: 552 },
    { x: 104, y: 566 },
  ]),
  standing: Object.freeze([
    { x: 792, y: 548 },
    { x: 850, y: 560 },
    { x: 898, y: 546 },
  ]),
  byte: { x: 742, y: 150 },
});

/** @param {number} index */
export function spotX(index) {
  const area = HIT_AREAS.find((a) => a.target.kind === 'spot' && a.target.index === index);
  return area ? area.x + area.w / 2 : 0;
}

/** @param {number} tableId */
export function tableCentre(tableId) {
  const area = HIT_AREAS.find((a) => a.target.kind === 'table' && a.target.tableId === tableId);
  return area ? { x: area.x + area.w / 2, y: area.y + 64 } : { x: 0, y: 0 };
}

/** Where a seated guest's seat is. @param {number} tableId */
export function seatOf(tableId) {
  const t = tableCentre(tableId);
  return { x: t.x - 64, y: t.y + 20 };
}

/**
 * The owner's feet while wiping a table: they move along with the cloth.
 * @param {number} tableId
 * @param {number} progress 0-1.
 */
export function wipeStance(tableId, progress) {
  const cloth = clothAt(tableId, progress);
  return { x: cloth.x + 44, y: tableCentre(tableId).y + 52 };
}

/**
 * The cloth sweeps from the right of the table to the left, scrubbing as it goes.
 * @param {number} tableId
 * @param {number} progress 0-1.
 */
export function clothAt(tableId, progress) {
  const t = tableCentre(tableId);
  const p = Math.max(0, Math.min(1, progress));
  return { x: t.x + 50 - 84 * p, y: t.y - 2 + Math.sin(p * Math.PI * 10) * 8 };
}

/**
 * @typedef {object} OwnerClip
 * @property {'idle' | 'walk' | 'brew' | 'plate' | 'serve' | 'answer' | 'wash' | 'wipe'} kind
 * @property {OwnerAction['kind'] | null} action The action being travelled to or worked on.
 * @property {number} progress 0-1 of the current phase.
 * @property {import('../sim/types.js').OrderItem | 'cup' | 'cloth' | null} item What the owner holds.
 * @property {number | null} guestId
 * @property {number | null} tableId
 * @property {{ x: number, y: number, facing: number } | null} target Where the action happens.
 */

/** @type {Readonly<Record<OwnerActionKind, OwnerClip['kind']>>} */
const WORK = { brewStart: 'brew', plate: 'plate', handOver: 'serve', answer: 'answer', wash: 'wash', wipe: 'wipe', bakeLoad: 'brew', bakeUnload: 'plate', discard: 'brew' };
/** @typedef {OwnerAction['kind']} OwnerActionKind */

/**
 * @param {SimState} state
 * @param {OwnerAction} action
 * @returns {{ x: number, y: number, facing: number }}
 */
export function actionTarget(state, action) {
  switch (action.kind) {
    case 'brewStart':
      return { ...STAGE.owner.machine, y: STAGE.behindY };
    case 'plate':
      return { ...STAGE.owner.case, y: STAGE.behindY };
    case 'wash':
      return { ...STAGE.owner.sink, y: STAGE.behindY };
    case 'bakeLoad':
    case 'bakeUnload':
      // Oven is near the machine area for now
      return { ...STAGE.owner.machine, y: STAGE.behindY };
    case 'discard':
      return { ...STAGE.owner.machine, y: STAGE.behindY };
    case 'wipe': {
      const tableId = action.claims.tableId ?? 1;
      const progress = action.phase === 'working' ? 1 - action.ticksLeft / state.timing.wipe : 0;
      return { ...wipeStance(tableId, progress), facing: -1 };
    }
    default: {
      const guest = state.guests.find((g) => g.id === action.claims.guestId);
      const index = guest && guest.place.kind === 'spot' ? guest.place.index : 1;
      return { x: spotX(index), y: STAGE.behindY, facing: 0 };
    }
  }
}

/**
 * @param {SimState} state
 * @returns {OwnerClip}
 */
export function ownerClip(state) {
  const action = state.owner.action;
  if (!action) return { kind: 'idle', action: null, progress: 0, item: null, guestId: null, tableId: null, target: null };
  const t = state.timing;
  const total = action.phase === 'travelling' ? t.travel
    : action.kind === 'wash' ? t.washPerDish
    : t[action.kind] ?? t.travel;
  const progress = Math.max(0, Math.min(1, 1 - action.ticksLeft / total));
  /** @type {OwnerClip['item']} */
  let item = null;
  if (action.kind === 'handOver') item = /** @type {OrderItem} */ (state.schedule.find((g) => g.id === action.claims.guestId)?.order ?? 'latte');
  if (action.kind === 'brewStart') item = 'cup';
  if (action.kind === 'wipe') item = 'cloth';
  return {
    kind: action.phase === 'travelling' ? 'walk' : WORK[action.kind],
    action: action.kind,
    progress,
    item,
    guestId: action.claims.guestId,
    tableId: action.claims.tableId,
    target: actionTarget(state, action),
  };
}

/**
 * @typedef {object} MachineClip
 * @property {'empty' | 'loading' | 'brewing' | 'ready' | 'claimed'} state
 * @property {number} progress
 */

/**
 * @param {SimState} state
 * @returns {MachineClip}
 */
export function machineClip(state) {
  const slot = state.machine.slots[0];
  const action = state.owner.action;
  if (slot.state === 'brewing') return { state: 'brewing', progress: Math.max(0, Math.min(1, 1 - slot.ticksLeft / state.timing.brew)) };
  if (slot.state === 'ready') return { state: slot.claimedBy !== null ? 'claimed' : 'ready', progress: 1 };
  if (action && action.kind === 'brewStart') return { state: 'loading', progress: 0 };
  return { state: 'empty', progress: 0 };
}

/**
 * @param {SimState} state
 * @returns {{ plated: boolean, claimed: boolean }}
 */
export function passClip(state) {
  const action = state.owner.action;
  return {
    plated: state.pass.dishId !== null,
    claimed: state.pass.dishId !== null && state.pass.claimedBy !== null && action?.kind === 'handOver',
  };
}

/**
 * @param {SimState} state
 * @returns {{ dirty: number, washing: number | null }}
 */
export function sinkClip(state) {
  const action = state.owner.action;
  const inSink = state.dishes.filter((d) => d.holder.kind === 'sink').length;
  if (action && action.kind === 'wash' && action.phase === 'working') {
    return { dirty: Math.max(0, inSink - 1), washing: Math.max(0, Math.min(1, 1 - action.ticksLeft / state.timing.washPerDish)) };
  }
  return { dirty: inSink, washing: null };
}

/**
 * How dirty a table looks: 1 dirty, 0 clean, in between while being wiped.
 * @param {SimState} state
 * @param {number} tableId
 */
export function tableDirt(state, tableId) {
  const table = state.tables.find((t) => t.id === tableId);
  if (!table) return 0;
  if (table.state === 'dirty') return 1;
  if (table.state !== 'wiping') return 0;
  const action = state.owner.action;
  if (!action || action.kind !== 'wipe' || action.phase !== 'working') return 1;
  return Math.max(0, Math.min(1, action.ticksLeft / state.timing.wipe));
}

/**
 * @typedef {object} GuestClip
 * @property {'enter' | 'wait' | 'ask' | 'door' | 'toTable' | 'seated' | 'standing'} kind
 * @property {number} progress 0-1 for timed walks.
 * @property {'calm' | 'impatient' | 'anxious'} mood From the patience left.
 * @property {boolean} attended The owner is serving or answering them right now.
 */

/**
 * @param {SimState} state
 * @param {LiveGuest} guest
 * @returns {GuestClip}
 */
export function guestClip(state, guest) {
  const t = state.timing;
  const max = guest.state === 'asking' ? t.askingPatience : t.counterPatience;
  const fraction = guest.patienceLeft / max;
  const waiting = guest.state === 'waiting' || guest.state === 'walkingIn' || guest.state === 'asking';
  /** @type {GuestClip['mood']} */
  const mood = !waiting ? 'calm' : fraction < 0.25 ? 'anxious' : fraction < 0.5 ? 'impatient' : 'calm';
  const attended = guest.attendedBy !== null;
  switch (guest.state) {
    case 'walkingIn':
      return { kind: 'enter', progress: Math.max(0, Math.min(1, 1 - guest.timerLeft / t.walkIn)), mood, attended };
    case 'waiting':
      return { kind: guest.place.kind === 'door' ? 'door' : 'wait', progress: 0, mood, attended };
    case 'asking':
      return { kind: 'ask', progress: 0, mood, attended };
    case 'walkingToTable':
      return { kind: 'toTable', progress: Math.max(0, Math.min(1, 1 - guest.timerLeft / t.walkToTable)), mood, attended };
    case 'seated':
      return { kind: 'seated', progress: 0, mood, attended };
    default:
      return { kind: 'standing', progress: 0, mood, attended };
  }
}

/**
 * Where a guest belongs right now, by the simulation. Timed walks into the
 * café are placed along their path by the simulation's own timer.
 * @param {SimState} state
 * @param {LiveGuest} guest
 * @returns {{ x: number, y: number }}
 */
export function guestHome(state, guest) {
  const p = guest.place;
  if (p.kind === 'spot') {
    const home = { x: spotX(p.index), y: STAGE.spotY };
    if (guest.state === 'walkingIn') {
      const k = 1 - guest.timerLeft / state.timing.walkIn;
      return { x: STAGE.door.x + (home.x - STAGE.door.x) * k, y: STAGE.door.y + (home.y - STAGE.door.y) * k };
    }
    return home;
  }
  if (p.kind === 'door') return STAGE.doorQueue[Math.max(0, state.doorQueue.indexOf(guest.id))] ?? STAGE.doorQueue[0];
  if (p.kind === 'table') return seatOf(p.tableId);
  const standing = state.guests.filter((g) => g.place.kind === 'standing');
  return STAGE.standing[Math.max(0, standing.indexOf(guest)) % STAGE.standing.length];
}

/**
 * Points along a walk: through the counter gate when going between the
 * counter and the floor.
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 */
export function walkPath(from, to) {
  const behind = (/** @type {{ y: number }} */ p) => p.y < STAGE.behindY + 20;
  if (behind(from) === behind(to)) return [from, to];
  const gate = behind(from) ? STAGE.gate : [...STAGE.gate].reverse();
  return [from, ...gate, to];
}

/**
 * A point a fraction of the way along a path, by distance.
 * @param {{ x: number, y: number }[]} path
 * @param {number} fraction 0-1.
 */
export function along(path, fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  let left = total * f;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= d || i === path.length - 1) {
      const k = d === 0 ? 1 : Math.min(1, left / d);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= d;
  }
  return path[path.length - 1];
}
