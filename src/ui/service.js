// @ts-check
/**
 * M2.5 experiment: order service by hand.
 *
 * The player picks an order, starts it at the right station, and carries the
 * finished item to the guest. This module turns those gestures into the same
 * simulation commands as before (a tap on a station or a counter spot), so the
 * rules, the owner's time and replay are untouched. What it adds is interface
 * state only: which order is selected, which item is being carried, and which
 * guest each item was started for.
 *
 * No DOM here, so the whole flow is tested in Node.
 */
/** @import { SimState, SimEvent, Command, Target, OrderItem, LiveGuest, GuestSpec, QuestionTopic } from '../sim/types.js' */
import { TICKS_PER_SECOND, resolveTap } from '../sim/index.js';
import { rejectionText } from './labels.js';

/** @typedef {'machine' | 'case'} Station */

/**
 * What a press led to. At most one command; a notice explains a refusal.
 * @typedef {object} Outcome
 * @property {Command} [command]
 * @property {number | null} [ticket] Guest the command's item is being made for.
 * @property {string} [notice]
 * @property {boolean} accepted False when the press was refused.
 */

/** @type {Readonly<Record<Station, OrderItem>>} */
const ITEM_AT = { machine: 'latte', case: 'croissant' };
/** @type {Readonly<Record<OrderItem, Station>>} */
const STATION_FOR = { latte: 'machine', croissant: 'case' };
/** @type {Readonly<Record<OrderItem, string>>} */
export const STATION_NAME = { latte: 'coffee machine', croissant: 'pastry case' };

/** What each question sounds like, and the short form for a card. */
export const QUESTIONS = /** @type {Readonly<Record<QuestionTopic, { ask: string, short: string }>>} */ ({
  wifi: { ask: 'What is the Wi-Fi password?', short: 'Wi-Fi?' },
  menu: { ask: 'Can I see the menu online?', short: 'Menu?' },
  instagram: { ask: 'What is your Instagram?', short: 'Instagram?' },
  review: { ask: 'Where can I leave a review?', short: 'Review?' },
  website: { ask: 'Do you have a website?', short: 'Website?' },
  washroom: { ask: 'Where is the washroom?', short: 'Washroom?' },
});

/**
 * @param {SimState} state
 * @param {number} guestId
 * @returns {{ guest: LiveGuest, spec: GuestSpec } | null}
 */
function find(state, guestId) {
  const guest = state.guests.find((g) => g.id === guestId);
  const spec = state.schedule.find((g) => g.id === guestId);
  return guest && spec ? { guest, spec } : null;
}

/**
 * @param {SimState} state
 * @param {OrderItem} item
 * @returns {boolean} A finished item of this kind is waiting and nobody is already handing it over.
 */
export function itemReady(state, item) {
  return item === 'latte'
    ? state.machine.slots.some((s) => s.state === 'ready' && s.claimedBy === null)
    : state.pass.dishId !== null && state.pass.claimedBy === null;
}

/**
 * @typedef {object} Card
 * @property {'order' | 'question'} kind
 * @property {number} guestId Also the ticket number.
 * @property {OrderItem} order
 * @property {QuestionTopic | null} topic
 * @property {'door' | 'new' | 'starting' | 'preparing' | 'ready' | 'delivering' | 'asking' | 'answering'} status
 * @property {string} title
 * @property {string} statusText
 * @property {number} patience 0-1.
 * @property {boolean} urgent
 * @property {boolean} selected
 * @property {string} label Spoken description, including what pressing does.
 */

export function createService() {
  /** @type {number | null} */
  let selected = null;
  /** @type {OrderItem | null} */
  let carrying = null;
  /** Guest each kind of item in progress was started for. Null means it is spare. */
  const madeFor = /** @type {Record<OrderItem, number | null>} */ ({ latte: null, croissant: null });
  /** Start-brew and plate actions that are queued or under way, by action id. */
  const intents = /** @type {Map<number, { item: OrderItem, ticket: number | null }>} */ (new Map());

  /**
   * @param {SimState} state
   * @param {number} guestId
   * @returns {Card['status']}
   */
  function orderStatus(state, guestId) {
    const found = find(state, guestId);
    if (!found) return 'new';
    const { guest, spec } = found;
    if (guest.place.kind === 'door') return 'door';
    if (guest.attendedBy !== null) return 'delivering';
    const item = spec.order;
    const mine = madeFor[item] === guestId;
    const spare = madeFor[item] === null;
    if (itemReady(state, item) && (mine || spare)) return 'ready';
    if (mine && item === 'latte' && state.machine.slots.some((s) => s.state === 'brewing')) return 'preparing';
    if ([...intents.values()].some((i) => i.ticket === guestId)) return 'starting';
    return 'new';
  }

  /**
   * @param {SimState} state
   * @param {number} index
   * @returns {Outcome}
   */
  function pressSpot(state, index) {
    const guestId = state.spots[index];
    const found = guestId === null || guestId === undefined ? null : find(state, guestId);
    if (!found) return { accepted: false, notice: carrying ? 'Nobody is standing there. Take it to the guest who ordered it.' : 'Nobody is standing there.' };
    const { guest, spec } = found;
    const tap = /** @type {Target} */ ({ kind: 'spot', index });

    if (carrying) {
      if (guest.state === 'asking') return { accepted: false, notice: 'They have a question, not an order.' };
      if (guest.state !== 'waiting') return { accepted: false, notice: 'They are still walking in.' };
      if (spec.order !== carrying) return { accepted: false, notice: `Ticket ${guest.id} ordered a ${spec.order}, not a ${carrying}.` };
      const r = resolveTap(state, tap);
      if (!r.ok) return { accepted: false, notice: rejectionText(r.reason) };
      carrying = null;
      if (selected === guest.id) selected = null;
      return { accepted: true, command: { type: 'tap', target: tap } };
    }

    if (guest.state === 'asking') {
      const r = resolveTap(state, tap);
      if (!r.ok) return { accepted: false, notice: rejectionText(r.reason) };
      return { accepted: true, command: { type: 'tap', target: tap } };
    }

    // An order: pressing the guest selects their ticket.
    selected = guest.id;
    const status = orderStatus(state, guest.id);
    if (status === 'ready') return { accepted: true, notice: `Ticket ${guest.id}'s ${spec.order} is ready. Carry it over from the ${STATION_NAME[spec.order]}.` };
    if (status === 'preparing' || status === 'starting') return { accepted: true, notice: `Ticket ${guest.id}'s ${spec.order} is on its way.` };
    if (status === 'delivering') return { accepted: true };
    return { accepted: true, notice: `Ticket ${guest.id}: ${spec.order}. Now the ${STATION_NAME[spec.order]}.` };
  }

  /**
   * @param {SimState} state
   * @param {Station} station
   * @returns {Outcome}
   */
  function pressStation(state, station) {
    const item = ITEM_AT[station];
    if (carrying === item) {
      carrying = null;
      return { accepted: true, notice: 'Put back.' };
    }
    if (itemReady(state, item)) {
      carrying = item;
      return { accepted: true, notice: `Carrying the ${item}. Now the guest who ordered it.` };
    }
    if (selected === null) return { accepted: false, notice: 'Pick an order first: press a guest or their ticket.' };
    const found = find(state, selected);
    if (!found) {
      selected = null;
      return { accepted: false, notice: 'That guest has gone. Pick another order.' };
    }
    if (found.spec.order !== item) {
      return { accepted: false, notice: `Ticket ${selected} is a ${found.spec.order}. That is made at the ${STATION_NAME[found.spec.order]}.` };
    }
    const status = orderStatus(state, selected);
    if (status === 'preparing' || status === 'starting') return { accepted: false, notice: `Ticket ${selected}'s ${item} is already being made.` };
    const target = /** @type {Target} */ ({ kind: station });
    const r = resolveTap(state, target);
    if (!r.ok) return { accepted: false, notice: rejectionText(r.reason) };
    const ticket = selected;
    selected = null;
    return { accepted: true, command: { type: 'tap', target }, ticket };
  }

  return {
    selected: () => selected,
    carrying: () => carrying,
    /** @param {OrderItem} item */
    madeFor: (item) => madeFor[item],

    pressSpot,
    pressStation,

    /**
     * Begins a drag from a station. Returns the item picked up, or null.
     * @param {SimState} state
     * @param {Station} station
     * @returns {OrderItem | null}
     */
    pickUp(state, station) {
      const item = ITEM_AT[station];
      if (!itemReady(state, item)) return null;
      carrying = item;
      return item;
    },

    /**
     * Ends a drag. Dropping anywhere but on a counter spot puts the item back.
     * A refused drop puts it back too.
     * @param {SimState} state
     * @param {number | null} spotIndex
     * @returns {Outcome}
     */
    drop(state, spotIndex) {
      if (!carrying) return { accepted: false };
      if (spotIndex === null) {
        carrying = null;
        return { accepted: true };
      }
      const outcome = pressSpot(state, spotIndex);
      carrying = null;
      return outcome;
    },

    putBack() {
      carrying = null;
    },

    /** @param {number | null} guestId */
    select(guestId) {
      selected = guestId;
    },

    /**
     * Keeps the interface state in step with what actually happened.
     * @param {SimState} state After the tick.
     * @param {readonly SimEvent[]} events Of that tick.
     * @param {readonly (number | null)[]} tickets For each tap command sent this tick, in order: the guest its item is for.
     */
    onTick(state, events, tickets) {
      let next = 0;
      for (const e of events) {
        switch (e.type) {
          // Each tap command answers with exactly one of these, in order.
          case 'actionQueued': {
            const ticket = tickets[next++] ?? null;
            if (e.kind === 'brewStart') intents.set(Number(e.actionId), { item: 'latte', ticket });
            if (e.kind === 'plate') intents.set(Number(e.actionId), { item: 'croissant', ticket });
            break;
          }
          case 'tapRejected':
          case 'commandRejected':
            next++;
            break;
          case 'actionCompleted': {
            const intent = intents.get(Number(e.actionId));
            if (intent) {
              madeFor[intent.item] = intent.ticket;
              intents.delete(Number(e.actionId));
            }
            break;
          }
          case 'actionCancelled':
          case 'actionDropped':
          case 'actionUnqueued':
            intents.delete(Number(e.actionId));
            break;
          case 'itemHandedOver':
            madeFor[/** @type {OrderItem} */ (e.item)] = null;
            break;
          default:
            break;
        }
      }
      // A guest who has gone, or been served, no longer owns anything here.
      for (const item of /** @type {OrderItem[]} */ (['latte', 'croissant'])) {
        const owner = madeFor[item];
        const found = owner === null ? null : find(state, owner);
        if (owner !== null && (!found || (found.guest.state !== 'waiting' && found.guest.state !== 'walkingIn'))) madeFor[item] = null;
      }
      if (selected !== null) {
        const found = find(state, selected);
        if (!found || (found.guest.state !== 'waiting' && found.guest.state !== 'walkingIn')) selected = null;
      }
      if (carrying !== null && !itemReady(state, carrying)) carrying = null;
      if (state.phase === 'ended') {
        selected = null;
        carrying = null;
      }
    },

    /**
     * The five cards of the rail: counter spots 1-3, then the two door places.
     * Positions are fixed, so a card never moves under a finger.
     * @param {SimState} state
     * @returns {(Card | null)[]}
     */
    cards(state) {
      const ids = [state.spots[0] ?? null, state.spots[1] ?? null, state.spots[2] ?? null, state.doorQueue[0] ?? null, state.doorQueue[1] ?? null];
      return ids.map((guestId, slot) => {
        const found = guestId === null ? null : find(state, guestId);
        if (!found) return null;
        const { guest, spec } = found;
        const where = slot < 3 ? `Counter spot ${slot + 1}` : 'At the door';
        const secondsLeft = Math.max(0, Math.ceil(guest.patienceLeft / TICKS_PER_SECOND));
        if (guest.state === 'asking' && spec.question) {
          const q = QUESTIONS[spec.question.topic];
          const answering = guest.attendedBy !== null;
          const patience = guest.patienceLeft / state.timing.askingPatience;
          const waiting = state.doorQueue.length > 0 ? ' Someone at the door is waiting for this spot.' : '';
          return {
            kind: 'question',
            guestId: guest.id,
            order: spec.order,
            topic: spec.question.topic,
            status: answering ? 'answering' : 'asking',
            title: q.short,
            statusText: answering ? 'Answering' : `Needs ${state.timing.answer / TICKS_PER_SECOND} s`,
            patience,
            urgent: patience < 0.25,
            selected: false,
            label: `${where}, ticket ${guest.id}: a question, not an order. "${q.ask}" ${secondsLeft} seconds of patience left. Answering takes ${state.timing.answer / TICKS_PER_SECOND} seconds of your time and they hold the spot until then.${waiting} ${answering ? 'You are answering.' : 'Press to answer.'}`,
          };
        }
        const status = orderStatus(state, guest.id);
        const patience = guest.patienceLeft / state.timing.counterPatience;
        const texts = { door: 'At the door', new: 'New order', starting: 'Starting', preparing: 'Brewing', ready: 'Ready to deliver', delivering: 'On its way' };
        const short = { door: 'At door', new: 'New', starting: 'Starting', preparing: 'Brewing', ready: 'Ready!', delivering: 'On its way' };
        const deliverNow = carrying === spec.order && guest.state === 'waiting';
        const action =
          status === 'door'
            ? 'They cannot be served until a counter spot is free.'
            : deliverNow
              ? `Press to deliver the ${spec.order}.`
              : status === 'ready'
                ? `Pick it up at the ${STATION_NAME[spec.order]}, then press here to deliver.`
                : status === 'new'
                  ? `Press to select, then press the ${STATION_NAME[spec.order]}.`
                  : '';
        return {
          kind: 'order',
          guestId: guest.id,
          order: spec.order,
          topic: null,
          status,
          title: spec.order === 'latte' ? 'Latte' : 'Croissant',
          statusText: short[/** @type {keyof typeof short} */ (status)] ?? '',
          patience,
          urgent: patience < 0.25,
          selected: selected === guest.id,
          label: `${where}, ticket ${guest.id}: ${spec.order}, ${(texts[/** @type {keyof typeof texts} */ (status)] ?? '').toLowerCase()}, ${secondsLeft} seconds of patience left. ${action}`.trim(),
        };
      });
    },

    /**
     * Which targets are the sensible next press, for outlines in the scene.
     * @param {SimState} state
     * @returns {{ stations: Station[], spots: number[], pickUp: Station[] }}
     */
    hints(state) {
      /** @type {Station[]} */
      const stations = [];
      /** @type {number[]} */
      const spots = [];
      /** @type {Station[]} */
      const pickUp = [];
      for (const station of /** @type {Station[]} */ (['machine', 'case'])) {
        if (!carrying && itemReady(state, ITEM_AT[station])) pickUp.push(station);
      }
      if (carrying) {
        state.spots.forEach((id, index) => {
          const found = id === null ? null : find(state, id);
          if (found && found.guest.state === 'waiting' && found.spec.order === carrying && found.guest.attendedBy === null) spots.push(index);
        });
        return { stations, spots, pickUp };
      }
      if (selected !== null) {
        const found = find(state, selected);
        const status = orderStatus(state, selected);
        if (found && status === 'new' && resolveTap(state, { kind: STATION_FOR[found.spec.order] }).ok) stations.push(STATION_FOR[found.spec.order]);
      }
      state.spots.forEach((id, index) => {
        const found = id === null ? null : find(state, id);
        if (!found) return;
        if (found.guest.state === 'asking' && found.guest.attendedBy === null) spots.push(index);
        else if (found.guest.state === 'waiting' && orderStatus(state, found.guest.id) === 'new' && selected !== found.guest.id) spots.push(index);
      });
      return { stations, spots, pickUp };
    },

    /**
     * Spoken description of a station, including what pressing it does now.
     * @param {SimState} state
     * @param {Station} station
     * @returns {string}
     */
    describeStation(state, station) {
      const item = ITEM_AT[station];
      const name = station === 'machine' ? 'Coffee machine' : 'Pastry case';
      const slot = state.machine.slots[0];
      const status =
        station === 'machine'
          ? slot.state === 'brewing'
            ? `brewing, ${Math.ceil(slot.ticksLeft / TICKS_PER_SECOND)} seconds left`
            : slot.state === 'ready'
              ? 'a latte is ready'
              : 'empty'
          : state.pass.dishId === null
            ? 'nothing plated'
            : 'a croissant is plated';
      let action = 'Select an order first.';
      if (carrying === item) action = 'Press to put it back.';
      else if (itemReady(state, item)) action = `Press to pick up the ${item}.`;
      else if (selected !== null) {
        const found = find(state, selected);
        action = found && found.spec.order === item ? `Press to make a ${item} for ticket ${selected}.` : `Ticket ${selected} is not made here.`;
      }
      return `${name}: ${status}. ${action}`;
    },
  };
}

/** @typedef {ReturnType<typeof createService>} Service */
