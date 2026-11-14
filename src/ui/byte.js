// @ts-check
/**
 * Byte's reactions (M2.5 experiment). Byte no longer recites a tutorial.
 * Each line is a reaction to what is true in the simulation right now:
 * a guest about to leave, a shortage, a job well done, or a question that
 * pulls the owner away from the counter. Every line names the real ticket,
 * item or figure it is about.
 *
 * Pure: fed the state, the tick's events and the order cards, it returns a
 * line and a mood, or null to leave the current line up.
 */
/** @import { SimState, SimEvent, QuestionTopic } from '../sim/types.js' */
/** @import { Card } from './service.js' */
import { TICKS_PER_SECOND } from '../sim/index.js';
import { QUESTIONS, STATION_NAME } from './service.js';

/** @typedef {'neutral' | 'happy' | 'alert' | 'sad' | 'thinking' | 'celebrate'} Mood */
/**
 * @typedef {object} Reaction
 * @property {string} text
 * @property {Mood} mood
 * @property {boolean} urgent True for a guest lost, a guest about to leave, or a question: shown at once.
 */

/** A line stays up at least this long, unless something urgent replaces it. */
const MIN_SHOW_TICKS = Math.round(2.5 * TICKS_PER_SECOND);
/** Only reactions this important may interrupt a line that has just appeared. */
const INTERRUPT_PRIORITY = 2;
const NEVER_AGAIN = Number.POSITIVE_INFINITY;
const s = (/** @type {number} */ seconds) => seconds * TICKS_PER_SECOND;

/**
 * @typedef {object} ByteVoice
 * @property {(state: SimState, events: readonly SimEvent[], cards: readonly (Card | null)[]) => Reaction | null} onTick
 */

/** @returns {ByteVoice} */
export function createByte() {
  /** Tick before which a reaction with this key stays quiet. */
  const quietUntil = /** @type {Map<string, number>} */ (new Map());
  let lastShownTick = Number.NEGATIVE_INFINITY;
  let lastPriority = 99;
  let questions = 0;
  let streak = 0;
  let idleTicks = 0;
  let latteReadySince = -1;
  /** Ticks at which recent orders were handed over, for spotting a rush handled well. */
  /** @type {number[]} */
  let served = [];
  let lastLossTick = Number.NEGATIVE_INFINITY;

  return {
    onTick(state, events, cards) {
      const tick = state.tick;
      /** @type {{ priority: number, key: string, mood: Mood, text: string, cooldown: number }[]} */
      const found = [];
      /**
       * @param {number} priority 1 is most important.
       * @param {string} key
       * @param {Mood} mood
       * @param {string} text
       * @param {number} [cooldown] Ticks before the same reaction may show again.
       */
      const react = (priority, key, mood, text, cooldown = NEVER_AGAIN) => {
        if ((quietUntil.get(key) ?? 0) <= tick) found.push({ priority, key, mood, text, cooldown });
      };

      // ---- Things that just happened.
      for (const e of events) {
        const id = Number(e.guestId);
        switch (e.type) {
          case 'shiftOpened':
            react(5, 'open', 'neutral', 'Doors are open. Each guest who orders gets a ticket.');
            break;
          case 'guestLeftUnhappy':
            streak = 0;
            lastLossTick = tick;
            react(1, `lost-${id}`, 'sad', e.wasAsking ? `Ticket ${id} left without an answer. A question holds a spot, then costs a guest.` : `Ticket ${id} walked out unserved. A red bar means seconds left.`);
            break;
          case 'guestWalkedPast':
            react(1, 'walkedPast', 'sad', 'The counter and the door were both full, so someone walked past.', s(15));
            break;
          case 'guestAsked': {
            questions += 1;
            const topic = /** @type {QuestionTopic} */ (e.topic);
            const spent = Math.round((state.metrics.ownerTicks.answer / TICKS_PER_SECOND) * 10) / 10;
            const answer = state.timing.answer / TICKS_PER_SECOND;
            const door = state.doorQueue.length > 0 ? ' Someone at the door is waiting for that spot.' : '';
            const text =
              questions === 1
                ? `Not an order, a question: "${QUESTIONS[topic].ask}" Answering takes ${answer} s away from the counter.`
                : `Question ${questions}: "${QUESTIONS[topic].ask}" You have spent ${spent} s on questions so far.`;
            react(2, `asked-${id}`, 'alert', text + door);
            break;
          }
          case 'itemHandedOver': {
            const guest = state.guests.find((g) => g.id === id);
            streak = guest?.tipEligible ? streak + 1 : 0;
            if (streak === 3) react(4, 'streak', 'celebrate', 'Three quick ones in a row. That is the rhythm.', s(20));
            // A rush handled: four served within twenty seconds, nobody lost meanwhile.
            served = [...served.filter((t) => tick - t < s(20)), tick];
            if (served.length >= 4 && tick - lastLossTick > s(20)) react(3, 'rush', 'celebrate', `${served.length} served in twenty seconds and nobody left. Rush handled!`, s(30));
            break;
          }
          case 'guestLeftHappy':
            if (Number(e.tip) > 0) react(4, 'tip', 'happy', `Tip from ticket ${id}: quick service and a clean table.`, s(12));
            break;
          case 'guestStanding':
            react(3, 'standing', 'alert', `No clean table for ticket ${id}, so they stood. Standing guests do not tip.`, s(15));
            break;
          case 'doorsClosed':
            react(3, 'closing', 'neutral', 'Doors are closed. Look after whoever is still here.');
            break;
          default:
            break;
        }
      }

      // ---- Urgency: someone at the counter is about to leave.
      const counter = cards.slice(0, 3).filter((c) => c !== null);
      for (const c of counter) {
        if (!c.urgent || c.status === 'delivering' || c.status === 'answering') continue;
        if (c.kind === 'question') {
          react(1, `urgent-question-${c.guestId}`, 'alert', `Ticket ${c.guestId} is still waiting for an answer, and about to leave.`);
        } else if (c.status === 'ready') {
          react(1, `urgent-ready-${c.guestId}`, 'alert', `Ticket ${c.guestId}'s ${c.order} is ready and they are about to leave. Carry it over!`);
        } else if (c.status === 'new') {
          react(1, `urgent-new-${c.guestId}`, 'alert', `Ticket ${c.guestId} is nearly out of patience and nothing is being made for them.`);
        } else {
          react(1, `urgent-making-${c.guestId}`, 'alert', `Ticket ${c.guestId} is running out of patience. Be ready the moment their ${c.order} is.`);
        }
      }

      // ---- Shortages: something is blocking service.
      const clean = state.dishes.filter((d) => d.holder.kind === 'rack').length;
      const dirty = state.dishes.filter((d) => d.holder.kind === 'sink').length;
      const someoneNew = counter.some((c) => c.kind === 'order' && c.status === 'new');
      if (clean === 0 && dirty > 0 && state.owner.action?.kind !== 'wash') {
        react(3, 'noDishes', 'alert', `No clean dishes, and ${dirty} in the sink. Nothing can be served until you wash.`, s(12));
      } else if (clean === 0 && dirty === 0 && someoneNew) {
        react(3, 'dishesOut', 'alert', 'Every dish is out with a guest. Service waits until one comes back.', s(15));
      }
      const latteReady = state.machine.slots.some((slot) => slot.state === 'ready');
      latteReadySince = latteReady ? (latteReadySince < 0 ? tick : latteReadySince) : -1;
      const anotherLatte = counter.some((c) => c.kind === 'order' && c.order === 'latte' && c.status === 'new');
      if (latteReadySince >= 0 && tick - latteReadySince >= s(4) && anotherLatte) {
        react(3, 'machineBlocked', 'alert', 'A finished latte is sitting on the machine. Deliver it so the next one can brew.', s(12));
      }
      if (clean === 1 && dirty >= 2 && state.owner.action?.kind !== 'wash') {
        react(4, 'lowDishes', 'thinking', `One clean dish left and ${dirty} in the sink. A wash soon would help.`, s(20));
      }
      const readyCount = counter.filter((c) => c.kind === 'order' && c.status === 'ready').length;
      if (readyCount >= 2) {
        react(3, 'manyReady', 'alert', `${readyCount} orders are ready at once. Carry them before they wait too long.`, s(15));
      }
      if (state.tables.every((t) => t.state === 'dirty') && counter.some((c) => c.kind === 'order' && c.status !== 'new')) {
        react(3, 'tables', 'alert', 'Every table is dirty. The next guest will stand, and standing guests do not tip.', s(15));
      }

      // ---- A nudge, only when the owner has stood idle for three seconds
      // while there was something to do. It points at the most useful thing.
      const ready = counter.find((c) => c.kind === 'order' && c.status === 'ready');
      const fresh = clean > 0 ? counter.find((c) => c.kind === 'order' && c.status === 'new') : undefined;
      const asking = counter.find((c) => c.kind === 'question' && c.status === 'asking');
      const chores = dirty > 0 || state.tables.some((t) => t.state === 'dirty');
      const ownerIdle = state.owner.action === null && state.owner.queue.length === 0;
      idleTicks = ownerIdle && (ready || fresh || asking || chores) ? idleTicks + 1 : 0;
      if (idleTicks >= s(3)) {
        if (ready) react(5, 'idle', 'thinking', `Ticket ${ready.guestId}'s ${ready.order} is ready. Carry it to them.`, s(8));
        else if (asking) react(5, 'idle', 'thinking', `Ticket ${asking.guestId} has a question waiting.`, s(8));
        else if (fresh) react(5, 'idle', 'thinking', `Ticket ${fresh.guestId} wants a ${fresh.order}. Pick the ticket, then the ${STATION_NAME[fresh.order]}.`, s(8));
        else if (dirty > 0) react(5, 'idle', 'thinking', `A quiet moment, and ${dirty} dirty ${dirty === 1 ? 'dish' : 'dishes'} in the sink.`, s(8));
        else react(5, 'idle', 'thinking', 'A quiet moment. A table needs wiping.', s(8));
      }

      if (found.length === 0) return null;
      found.sort((a, b) => a.priority - b.priority);
      const best = found[0];
      const settled = tick - lastShownTick >= MIN_SHOW_TICKS;
      const interrupts = best.priority <= INTERRUPT_PRIORITY && best.priority < lastPriority;
      if (!settled && !interrupts) return null;
      quietUntil.set(best.key, best.cooldown === NEVER_AGAIN ? NEVER_AGAIN : tick + best.cooldown);
      lastShownTick = tick;
      lastPriority = best.priority;
      return { text: best.text, mood: best.mood, urgent: best.priority <= INTERRUPT_PRIORITY };
    },
  };
}
