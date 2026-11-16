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
export const STATE_VERSION = 3;

/**
 * @typedef {object} ShiftConfig
 * @property {string} id
 * @property {number} lengthSeconds Doors close at this time.
 * @property {number} guests Exact number of scheduled guests.
 * @property {number} espressoGuests Exact number ordering an espresso.
 * @property {number} mochaGuests Exact number ordering a mocha.
 * @property {number} croissantGuests Exact number ordering a croissant; the rest order a latte.
 * @property {number} supportedQuestionGuests Exact number asking something a stand could answer.
 * @property {number} unsupportedQuestionGuests Exact number asking something no stand answers.
 * @property {number} standUseFraction Share of supported-question guests who would use a stand.
 * @property {number} firstArrivalSeconds
 * @property {number} lastArrivalSeconds
 * @property {number} arrivalJitterSeconds Each arrival moves by at most this much either way.
 * @property {number} impatientGuests Exact number of impatient guests.
 * @property {number} patientGuests Exact number of patient guests; the rest are regular.
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
  /** Pastries start with this many in the display. */
  pastryDisplayStart: 3,
  pastryDisplayMax: 6,
  /** How many pastries a bake run produces. */
  pastryBatchSize: 3,

  /** Drinks made at the coffee machine. */
  drinks: /** @type {import('./types.js').DrinkItem[]} */ (['espresso', 'latte', 'mocha']),
  /** Which drink types are available (for type checking). */
  isDrink: /** @type {(item: string) => item is import('./types.js').DrinkItem} */ (
    (item) => item === 'espresso' || item === 'latte' || item === 'mocha'
  ),

  /** Durations in seconds. Converted to whole ticks once, in createInitialState. */
  seconds: {
    travel: 0.3,
    brewStart: 0.6,
    brew: 3.0,
    brewEspresso: 2.0,
    brewMocha: 4.0,
    plate: 0.8,
    handOver: 0.4,
    answer: 2.5,
    wipe: 1.8,
    washPerDish: 1.0,
    bakeLoad: 0.8,
    bake: 8.0,
    bakeUnload: 0.6,
    discard: 0.4,
    walkIn: 1.0,
    walkToTable: 0.8,
    walkToStand: 0.6,
    standUse: 1.5,
    counterPatience: 24,
    askingPatience: 14,
    standingConsume: 4,
  },

  seatSeconds: { min: 8, max: 12 },

  /** Patience multiplier per personality type. */
  personalityPatience: /** @type {Record<import('./types.js').GuestPersonality, number>} */ ({
    regular: 1.0,
    impatient: 0.8,
    patient: 1.5,
  }),

  prices: { espresso: 5, latte: 8, mocha: 10, croissant: 6, tip: 5 },
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
      espressoGuests: 3,
      mochaGuests: 2,
      croissantGuests: 4,
      supportedQuestionGuests: 5,
      unsupportedQuestionGuests: 1,
      standUseFraction: 0.75,
      firstArrivalSeconds: 1,
      lastArrivalSeconds: 66,
      arrivalJitterSeconds: 1,
      impatientGuests: 0,
      patientGuests: 0,
    },
    mission1: {
      id: 'mission1',
      lengthSeconds: 60,
      guests: 8,
      espressoGuests: 0,
      mochaGuests: 0,
      croissantGuests: 2,
      supportedQuestionGuests: 0,
      unsupportedQuestionGuests: 0,
      standUseFraction: 0,
      firstArrivalSeconds: 2,
      lastArrivalSeconds: 50,
      arrivalJitterSeconds: 2,
      impatientGuests: 0,
      patientGuests: 0,
    },
    mission2: {
      id: 'mission2',
      lengthSeconds: 70,
      guests: 12,
      espressoGuests: 2,
      mochaGuests: 1,
      croissantGuests: 3,
      supportedQuestionGuests: 2,
      unsupportedQuestionGuests: 0,
      standUseFraction: 0.75,
      firstArrivalSeconds: 1,
      lastArrivalSeconds: 60,
      arrivalJitterSeconds: 1,
      impatientGuests: 0,
      patientGuests: 0,
    },
    mission3: {
      id: 'mission3',
      lengthSeconds: 75,
      guests: 14,
      espressoGuests: 3,
      mochaGuests: 2,
      croissantGuests: 4,
      supportedQuestionGuests: 5,
      unsupportedQuestionGuests: 1,
      standUseFraction: 0.75,
      firstArrivalSeconds: 1,
      lastArrivalSeconds: 66,
      arrivalJitterSeconds: 1,
      impatientGuests: 0,
      patientGuests: 0,
    },
    mission4: {
      id: 'mission4',
      lengthSeconds: 80,
      guests: 14,
      espressoGuests: 3,
      mochaGuests: 2,
      croissantGuests: 3,
      supportedQuestionGuests: 4,
      unsupportedQuestionGuests: 1,
      standUseFraction: 0.75,
      firstArrivalSeconds: 1,
      lastArrivalSeconds: 70,
      arrivalJitterSeconds: 1,
      impatientGuests: 3,
      patientGuests: 2,
    },
    mission5: {
      id: 'mission5',
      lengthSeconds: 90,
      guests: 18,
      espressoGuests: 4,
      mochaGuests: 3,
      croissantGuests: 4,
      supportedQuestionGuests: 6,
      unsupportedQuestionGuests: 1,
      standUseFraction: 0.75,
      firstArrivalSeconds: 1,
      lastArrivalSeconds: 80,
      arrivalJitterSeconds: 1,
      impatientGuests: 4,
      patientGuests: 3,
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
 * @typedef {object} MissionObjective
 * @property {string} label Human-readable description.
 * @property {(state: import('./types.js').SimState) => boolean} check Passed against the final state.
 */

/**
 * @typedef {object} MissionDef
 * @property {string} id
 * @property {string} name
 * @property {string} desc Short flavour text.
 * @property {string} shiftId Key into CONFIG.shifts.
 * @property {MissionObjective[]} objectives
 */

/** @type {readonly MissionDef[]} */
export const MISSIONS = Object.freeze([
  {
    id: 'm1', name: 'Opening Day', desc: 'Your first shift — learn the ropes.',
    shiftId: 'mission1',
    objectives: [
      { label: 'Serve at least 6 guests', check: (s) => s.metrics.guests.served >= 6 },
      { label: 'Earn at least 30 coins', check: (s) => s.economy.grossEarnings >= 30 },
    ],
  },
  {
    id: 'm2', name: 'Morning Rush', desc: 'The menu is expanding. Keep up!',
    shiftId: 'mission2',
    objectives: [
      { label: 'Serve at least 10 guests', check: (s) => s.metrics.guests.served >= 10 },
      { label: 'Earn at least 3 tips', check: (s) => s.metrics.tips >= 3 },
      { label: 'No more than 1 unhappy guest', check: (s) => s.metrics.guests.leftUnhappy <= 1 },
    ],
  },
  {
    id: 'm3', name: 'Word Gets Out', desc: 'The café is getting popular. Questions start flying.',
    shiftId: 'mission3',
    objectives: [
      { label: 'Serve at least 12 guests', check: (s) => s.metrics.guests.served >= 12 },
      { label: 'Earn at least 80 coins', check: (s) => s.economy.grossEarnings >= 80 },
      { label: 'Earn at least 5 tips', check: (s) => s.metrics.tips >= 5 },
    ],
  },
  {
    id: 'm4', name: 'The Regulars', desc: 'Some customers are patient. Others… not so much.',
    shiftId: 'mission4',
    objectives: [
      { label: 'Serve all guests', check: (s) => s.metrics.guests.served === s.schedule.length },
      { label: 'No more than 2 unhappy guests', check: (s) => s.metrics.guests.leftUnhappy <= 2 },
      { label: 'Earn at least 100 coins', check: (s) => s.economy.grossEarnings >= 100 },
    ],
  },
  {
    id: 'm5', name: 'Grand Opening', desc: 'The big day. Everyone is watching.',
    shiftId: 'mission5',
    objectives: [
      { label: 'Serve at least 16 guests', check: (s) => s.metrics.guests.served >= 16 },
      { label: 'Earn at least 120 coins', check: (s) => s.economy.grossEarnings >= 120 },
      { label: 'Earn at least 8 tips', check: (s) => s.metrics.tips >= 8 },
      { label: 'No more than 2 unhappy guests', check: (s) => s.metrics.guests.leftUnhappy <= 2 },
    ],
  },
]);

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

/**
 * Convenience re-export of CONFIG.isDrink for modules that import from config.
 * @param {string} item
 * @returns {item is import('./types.js').DrinkItem}
 */
export function isDrink(item) {
  return CONFIG.isDrink(item);
}
