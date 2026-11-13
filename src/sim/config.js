// @ts-check
/**
 * Every tunable number in the game. Values are starting points from
 * docs/GAME_DESIGN.md §4 and are tuned in M1 against the balance gates.
 * Nothing here may read the DOM, the clock or a random source.
 */

/**
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze(/** @type {Record<string, unknown>} */ (value)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** Rules advance in whole ticks of 1/30 s. */
export const TICKS_PER_SECOND = 30;

/** State layout version. Increase when the shape of SimState changes. */
export const STATE_VERSION = 1;

/**
 * @typedef {object} ShiftConfig
 * @property {string} id
 * @property {number} lengthSeconds Doors close at this time.
 * @property {number} guests Exact number of scheduled guests.
 * @property {number} croissantGuests Exact number ordering a croissant; the rest order a latte.
 * @property {number} supportedQuestionGuests Exact number asking something a stand could answer.
 * @property {number} unsupportedQuestionGuests Exact number asking something no stand answers.
 * @property {number} standUseFraction Share of supported-question guests who would use a stand.
 * @property {number} firstArrivalSeconds
 * @property {number} lastArrivalSeconds
 * @property {number} arrivalJitterSeconds Each arrival moves by at most this much either way.
 */

export const CONFIG = deepFreeze({
  defaultSeed: 20261113,
  defaultShiftId: 'slice',

  counterSpots: 3,
  doorQueueMax: 2,
  tables: 3,
  dishes: 5,
  machineSlots: 1,
  /** Taps that may wait behind the owner's current action. */
  queueMax: 2,
  startingWallet: 0,
  guestLooks: 6,
  ownerStartZone: 'counter',

  /** Durations in seconds. Converted to whole ticks once, in createInitialState. */
  seconds: {
    travel: 0.3,
    brewStart: 0.6,
    brew: 3.0,
    plate: 0.8,
    handOver: 0.4,
    answer: 2.5,
    wipe: 1.8,
    washPerDish: 1.0,
    walkIn: 1.0,
    walkToTable: 0.8,
    walkToStand: 0.6,
    standUse: 1.5,
    counterPatience: 22,
    askingPatience: 14,
    standingConsume: 4,
  },

  seatSeconds: { min: 8, max: 12 },

  prices: { latte: 8, croissant: 6, tip: 4 },
  /** A seated guest tips if served with more than this share of their counter patience left. */
  tipPatienceFraction: 0.35,
  moodBonusMax: 30,

  /** Topics a stand could answer, and topics it never answers. */
  supportedTopics: /** @type {import('./types.js').SupportedTopic[]} */ ([
    'wifi',
    'menu',
    'instagram',
    'review',
    'website',
  ]),
  unsupportedTopics: /** @type {import('./types.js').QuestionTopic[]} */ (['washroom']),

  /**
   * M0 defines one shift: the vertical slice ("Word gets out", Shift 2 in the
   * campaign). Further shifts are added in M6.
   * @type {Record<string, ShiftConfig>}
   */
  shifts: {
    slice: {
      id: 'slice',
      lengthSeconds: 75,
      guests: 14,
      croissantGuests: 4,
      supportedQuestionGuests: 6,
      unsupportedQuestionGuests: 1,
      standUseFraction: 0.75,
      firstArrivalSeconds: 1,
      lastArrivalSeconds: 66,
      arrivalJitterSeconds: 1,
    },
  },

  /**
   * Starting conditions. `test-stand` exists for automated tests and the M5
   * slice comparison only; the campaign never passes it.
   * @type {Record<import('./types.js').PresetId, { standInstalled: boolean }>}
   */
  presets: {
    none: { standInstalled: false },
    'test-stand': { standInstalled: true },
  },
});

/**
 * @param {number} seconds
 * @returns {number} Whole ticks, at least 1 for any positive duration.
 */
export function toTicks(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError(`Invalid duration: ${seconds}`);
  }
  const ticks = Math.round(seconds * TICKS_PER_SECOND);
  return seconds > 0 ? Math.max(1, ticks) : 0;
}
