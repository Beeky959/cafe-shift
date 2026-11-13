// @ts-check
/**
 * Builds the guest schedule for a shift. Pure: the same shift config and seed
 * always give the same schedule. See docs/TECH_BLUEPRINT.md §3.
 */
/** @import { GuestSpec, GuestQuestion, OrderItem } from './types.js' */
/** @import { ShiftConfig } from './config.js' */
import { CONFIG, toTicks } from './config.js';
import { createRng, shuffled, streamSeed } from './rng.js';

/**
 * @param {ShiftConfig} shift
 * @returns {void}
 */
function validateShift(shift) {
  const whole = [
    shift.guests,
    shift.croissantGuests,
    shift.supportedQuestionGuests,
    shift.unsupportedQuestionGuests,
  ];
  if (whole.some((n) => !Number.isInteger(n) || n < 0) || shift.guests < 1) {
    throw new RangeError(`Shift "${shift.id}": guest counts must be whole numbers`);
  }
  if (shift.croissantGuests > shift.guests) {
    throw new RangeError(`Shift "${shift.id}": more croissant guests than guests`);
  }
  if (shift.supportedQuestionGuests + shift.unsupportedQuestionGuests > shift.guests) {
    throw new RangeError(`Shift "${shift.id}": more question guests than guests`);
  }
  if (shift.standUseFraction < 0 || shift.standUseFraction > 1) {
    throw new RangeError(`Shift "${shift.id}": standUseFraction must be within 0–1`);
  }
  if (
    shift.firstArrivalSeconds < 0 ||
    shift.lastArrivalSeconds < shift.firstArrivalSeconds ||
    shift.lastArrivalSeconds > shift.lengthSeconds
  ) {
    throw new RangeError(`Shift "${shift.id}": arrival times must lie inside the shift`);
  }
}

/**
 * @param {ShiftConfig} shift
 * @param {number} seed Any integer; used as an unsigned 32-bit value.
 * @returns {GuestSpec[]} Sorted by arrival tick, ids ascending from 1.
 */
export function buildSchedule(shift, seed) {
  if (!Number.isInteger(seed)) {
    throw new TypeError(`Seed must be an integer, got ${seed}`);
  }
  validateShift(shift);
  const n = shift.guests;
  /** @param {string} stream */
  const rngFor = (stream) => createRng(streamSeed(seed, shift.id, stream));

  // Arrivals: evenly spaced, each moved by a bounded jitter, clamped to the
  // arrival window, in whole ticks.
  const first = toTicks(shift.firstArrivalSeconds);
  const last = toTicks(shift.lastArrivalSeconds);
  const jitter = toTicks(shift.arrivalJitterSeconds);
  const arrivalRng = rngFor('arrivals');
  /** @type {number[]} */
  const arrivals = [];
  for (let i = 0; i < n; i++) {
    const base = n === 1 ? first : first + Math.round(((last - first) * i) / (n - 1));
    const moved = base + arrivalRng.range(-jitter, jitter);
    arrivals.push(Math.min(last, Math.max(first, moved)));
  }
  arrivals.sort((a, b) => a - b);

  // Orders: an exact number of croissants, dealt to shuffled positions.
  const positions = Array.from({ length: n }, (_, i) => i);
  const croissantAt = new Set(shuffled(positions, rngFor('orders')).slice(0, shift.croissantGuests));

  // Questions: exact counts. Supported topics are dealt round-robin from a
  // shuffled list so every topic appears before any repeats.
  const questionOrder = shuffled(positions, rngFor('questions'));
  const supportedAt = questionOrder.slice(0, shift.supportedQuestionGuests);
  const unsupportedAt = questionOrder.slice(
    shift.supportedQuestionGuests,
    shift.supportedQuestionGuests + shift.unsupportedQuestionGuests,
  );
  const topicRng = rngFor('topics');
  const supportedTopics = shuffled(CONFIG.supportedTopics, topicRng);
  const unsupportedTopics = shuffled(CONFIG.unsupportedTopics, topicRng);
  /** @type {Map<number, GuestQuestion>} */
  const questionAt = new Map();
  supportedAt.forEach((position, i) => {
    questionAt.set(position, { topic: supportedTopics[i % supportedTopics.length], supported: true });
  });
  unsupportedAt.forEach((position, i) => {
    questionAt.set(position, {
      topic: unsupportedTopics[i % unsupportedTopics.length],
      supported: false,
    });
  });

  // Stand use: an exact number of the supported-question guests. Decided here,
  // whether or not a stand exists, so both arms of a comparison see the same guests.
  const standUsers = Math.round(shift.supportedQuestionGuests * shift.standUseFraction);
  const standAt = new Set(shuffled(supportedAt, rngFor('stand')).slice(0, standUsers));

  const seatRng = rngFor('seats');
  const lookRng = rngFor('looks');
  const seatMin = toTicks(CONFIG.seatSeconds.min);
  const seatMax = toTicks(CONFIG.seatSeconds.max);

  return arrivals.map((arrivalTick, position) => {
    /** @type {OrderItem} */
    const order = croissantAt.has(position) ? 'croissant' : 'latte';
    return {
      id: position + 1,
      arrivalTick,
      order,
      question: questionAt.get(position) ?? null,
      usesStandIfPresent: standAt.has(position),
      seatTicks: seatRng.range(seatMin, seatMax),
      look: lookRng.int(CONFIG.guestLooks),
    };
  });
}
