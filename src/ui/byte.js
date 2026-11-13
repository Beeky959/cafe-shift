// @ts-check
/**
 * Byte's lines. Pure: fed the state and each tick's events, it returns what
 * Byte should say, if anything. Rules from docs/GAME_DESIGN.md §7:
 * teach each thing once, never narrate routine actions, limit reminders.
 */
/** @import { SimState, SimEvent } from '../sim/types.js' */
import { TICKS_PER_SECOND } from '../sim/index.js';
import { TOPIC_NAMES } from './labels.js';

/** A taught line stays up at least this long before the next replaces it. */
const MIN_SHOW_TICKS = 3 * TICKS_PER_SECOND;
/** Reminders are at least this far apart, and each is given at most twice. */
const REMINDER_GAP_TICKS = 12 * TICKS_PER_SECOND;
const REMINDER_LIMIT = 2;

/**
 * @typedef {object} ByteVoice
 * @property {(state: SimState, events: readonly SimEvent[]) => string | null} onTick
 *   Returns a new line to show, or null to leave the current one.
 */

/**
 * @returns {ByteVoice}
 */
export function createByte() {
  /** @type {Set<string>} */
  const taught = new Set();
  /** @type {string[]} */
  const waiting = [];
  /** @type {Map<string, number>} */
  const reminded = new Map();
  let lastLineTick = -Infinity;
  let lastReminderTick = -Infinity;
  let noDishesSince = -1;

  /**
   * @param {string} key
   * @param {string} line
   */
  const teach = (key, line) => {
    if (taught.has(key)) return;
    taught.add(key);
    waiting.push(line);
  };

  return {
    onTick(state, events) {
      for (const e of events) {
        switch (e.type) {
          case 'shiftOpened':
            teach('open', 'Doors are open! Guests order at the counter.');
            break;
          case 'guestWaiting': {
            const spec = state.schedule.find((g) => g.id === e.guestId);
            if (spec?.order === 'croissant') teach('croissant', 'A croissant order. Tap the pastry case to plate one.');
            else teach('latte', 'A latte order. Tap the coffee machine to start one.');
            break;
          }
          case 'brewReady':
            teach('brewReady', 'The latte is ready. Tap the guest to hand it over.');
            break;
          case 'brewStarted':
            teach('brewing', 'It brews by itself. Use the time for something else.');
            break;
          case 'croissantPlated':
            teach('plated', 'Plated. Tap the guest who ordered it.');
            break;
          case 'guestAsked':
            teach('asked', `They want to know about ${TOPIC_NAMES[/** @type {keyof typeof TOPIC_NAMES} */ (e.topic)] ?? 'something'}. Tap them to answer. It takes a moment.`);
            break;
          case 'guestStanding':
            teach('standing', 'No clean table, so they stood. Standing guests do not tip.');
            break;
          case 'guestLeftHappy':
            if (Number(e.tip) > 0) teach('tip', 'A tip! Quick service and a clean table earn tips.');
            teach('dirty', 'They left a dirty table and a dirty dish. Tap a table to wipe it, the sink to wash.');
            break;
          case 'guestLeftUnhappy':
            teach('unhappy', 'A guest gave up waiting. Watch the bars above their heads.');
            break;
          case 'guestWalkedPast':
            teach('walkedPast', 'The counter was full, so someone walked past.');
            break;
          case 'doorsClosed':
            teach('closing', 'Doors are closed. Look after whoever is still here.');
            break;
          default:
            break;
        }
      }

      const tick = state.tick;
      if (waiting.length > 0 && tick - lastLineTick >= MIN_SHOW_TICKS) {
        lastLineTick = tick;
        return /** @type {string} */ (waiting.shift());
      }
      if (waiting.length > 0) return null;

      // Reminders, only when nothing is being taught.
      const clean = state.dishes.filter((d) => d.holder.kind === 'rack').length;
      const dirty = state.dishes.filter((d) => d.holder.kind === 'sink').length;
      if (clean === 0 && dirty > 0 && state.owner.action?.kind !== 'wash') {
        if (noDishesSince < 0) noDishesSince = tick;
      } else {
        noDishesSince = -1;
      }
      /** @type {[string, boolean, string][]} */
      const reminders = [
        ['dishes', noDishesSince >= 0 && tick - noDishesSince >= 4 * TICKS_PER_SECOND, 'No clean dishes left. Wash some at the sink.'],
        [
          'patience',
          state.guests.some((g) => g.place.kind === 'spot' && g.attendedBy === null && g.patienceLeft < 5 * TICKS_PER_SECOND && (g.state === 'waiting' || g.state === 'asking')),
          'Someone at the counter is about to leave.',
        ],
        ['tables', state.tables.every((t) => t.state === 'dirty'), 'Every table is dirty. The next guest will have to stand.'],
      ];
      if (tick - lastReminderTick < REMINDER_GAP_TICKS || tick - lastLineTick < MIN_SHOW_TICKS) return null;
      for (const [key, due, line] of reminders) {
        const count = reminded.get(key) ?? 0;
        if (!due || count >= REMINDER_LIMIT) continue;
        reminded.set(key, count + 1);
        lastReminderTick = tick;
        lastLineTick = tick;
        return line;
      }
      return null;
    },
  };
}
