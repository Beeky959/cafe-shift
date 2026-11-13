// @ts-check
/**
 * Words for things on screen: button labels, screen-reader descriptions and
 * the reasons a tap was refused. Pure functions of the simulation state.
 */
/** @import { SimState, Target, OwnerActionKind, QuestionTopic } from '../sim/types.js' */
import { TICKS_PER_SECOND, resolveTap } from '../sim/index.js';

/** @type {Readonly<Record<QuestionTopic, string>>} */
export const TOPIC_NAMES = {
  wifi: 'the Wi-Fi',
  menu: 'the menu',
  instagram: 'your Instagram',
  review: 'leaving a review',
  website: 'your website',
  washroom: 'the washroom',
};

/** @type {Readonly<Record<string, string>>} */
const REJECTIONS = {
  machineBusy: 'The machine is busy.',
  noCleanDish: 'No clean dishes. Wash some at the sink.',
  passFull: 'A croissant is already plated.',
  nothingToWash: 'Nothing to wash.',
  emptySpot: 'Nobody is standing there.',
  alreadyAttended: 'You are already with this guest.',
  guestNotReady: 'They are still walking in.',
  itemNotReady: 'Their order is not ready yet.',
  noSuchTable: 'There is no such table.',
  tableNotDirty: 'That table does not need wiping.',
  alreadyQueued: 'That is already on your list.',
  queueFull: 'Your list is full. Finish or remove something first.',
};

/**
 * @param {string} reason A reason from a `tapRejected` event.
 * @returns {string}
 */
export function rejectionText(reason) {
  return REJECTIONS[reason] ?? 'That cannot be done right now.';
}

/**
 * Short name of an action, for the action strip.
 * @param {OwnerActionKind} kind
 * @param {number | null} tableId
 * @returns {string}
 */
export function actionName(kind, tableId = null) {
  switch (kind) {
    case 'brewStart':
      return 'Start latte';
    case 'plate':
      return 'Plate croissant';
    case 'handOver':
      return 'Hand over';
    case 'answer':
      return 'Answer';
    case 'wipe':
      return tableId === null ? 'Wipe table' : `Wipe table ${tableId}`;
    default:
      return 'Wash dishes';
  }
}

/** @param {number} ticks */
const seconds = (ticks) => Math.max(0, Math.ceil(ticks / TICKS_PER_SECOND));

/**
 * What a target is, what state it is in, and what pressing it would do.
 * Used as the accessible name of the target's button.
 * @param {SimState} state
 * @param {Target} target
 * @returns {string}
 */
export function describeTarget(state, target) {
  const tap = resolveTap(state, target);
  const outcome = tap.ok ? `Press to ${actionName(tap.kind, tap.tableId).toLowerCase()}.` : rejectionText(tap.reason);
  switch (target.kind) {
    case 'machine': {
      const slot = state.machine.slots[0];
      const status = slot.state === 'brewing' ? `brewing, ${seconds(slot.ticksLeft)} seconds left` : slot.state === 'ready' ? 'a latte is ready' : 'empty';
      return `Coffee machine: ${status}. ${outcome}`;
    }
    case 'case':
      return `Pastry case: ${state.pass.dishId === null ? 'nothing plated' : 'a croissant is plated'}. ${outcome}`;
    case 'sink': {
      const dirty = state.dishes.filter((d) => d.holder.kind === 'sink').length;
      const clean = state.dishes.filter((d) => d.holder.kind === 'rack').length;
      return `Sink: ${dirty} dirty, ${clean} clean. ${outcome}`;
    }
    case 'spot': {
      const name = `Counter spot ${target.index + 1}`;
      const guestId = state.spots[target.index];
      const guest = guestId === null ? undefined : state.guests.find((g) => g.id === guestId);
      const spec = guestId === null ? undefined : state.schedule.find((g) => g.id === guestId);
      if (!guest || !spec) return `${name}: empty.`;
      const patience = `${seconds(guest.patienceLeft)} seconds of patience left`;
      if (guest.state === 'asking' && spec.question) {
        return `${name}: guest asking about ${TOPIC_NAMES[spec.question.topic]}, ${patience}. ${outcome}`;
      }
      const doing = guest.state === 'walkingIn' ? 'walking in, wants' : 'waiting for';
      return `${name}: guest ${doing} a ${spec.order}, ${patience}. ${outcome}`;
    }
    default: {
      const table = state.tables.find((t) => t.id === target.tableId);
      const status = !table ? 'missing' : table.state === 'occupied' ? 'a guest is here' : table.state === 'wiping' ? 'being wiped' : table.state;
      return `Table ${target.tableId}: ${status}. ${outcome}`;
    }
  }
}

/**
 * @param {number} ticks
 * @returns {string} m:ss
 */
export function clockText(ticks) {
  const total = seconds(ticks);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
