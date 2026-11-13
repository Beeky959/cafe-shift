// @ts-check
/**
 * Creates the state a shift starts from. Pure data in, pure data out:
 * no DOM, canvas, audio, clock or unseeded randomness.
 */
/** @import { SimState, PresetId, Timing } from './types.js' */
import { CONFIG, STATE_VERSION, toTicks } from './config.js';
import { buildSchedule } from './schedule.js';

/**
 * @typedef {object} InitOptions
 * @property {number} [seed] Defaults to CONFIG.defaultSeed.
 * @property {string} [shiftId] Defaults to CONFIG.defaultShiftId.
 * @property {PresetId} [preset] Defaults to 'none'. 'test-stand' is for tests and the M5 slice only.
 */

/**
 * @param {string} value
 * @returns {value is PresetId}
 */
export function isPresetId(value) {
  return Object.hasOwn(CONFIG.presets, value);
}

/**
 * @param {number} shiftLengthSeconds
 * @returns {Timing}
 */
function buildTiming(shiftLengthSeconds) {
  const s = CONFIG.seconds;
  return {
    travel: toTicks(s.travel),
    brewStart: toTicks(s.brewStart),
    brew: toTicks(s.brew),
    plate: toTicks(s.plate),
    handOver: toTicks(s.handOver),
    answer: toTicks(s.answer),
    wipe: toTicks(s.wipe),
    washPerDish: toTicks(s.washPerDish),
    walkIn: toTicks(s.walkIn),
    walkToTable: toTicks(s.walkToTable),
    walkToStand: toTicks(s.walkToStand),
    standUse: toTicks(s.standUse),
    counterPatience: toTicks(s.counterPatience),
    askingPatience: toTicks(s.askingPatience),
    standingConsume: toTicks(s.standingConsume),
    shiftLength: toTicks(shiftLengthSeconds),
  };
}

/**
 * @param {InitOptions} [options]
 * @returns {SimState}
 */
export function createInitialState(options = {}) {
  const seed = options.seed ?? CONFIG.defaultSeed;
  const shiftId = options.shiftId ?? CONFIG.defaultShiftId;
  const preset = options.preset ?? 'none';

  if (!Number.isInteger(seed)) {
    throw new TypeError(`Seed must be an integer, got ${seed}`);
  }
  if (!Object.hasOwn(CONFIG.shifts, shiftId)) {
    throw new RangeError(`Unknown shift "${shiftId}"`);
  }
  if (!isPresetId(preset)) {
    throw new RangeError(`Unknown preset "${preset}"`);
  }
  const shift = CONFIG.shifts[shiftId];

  return {
    version: STATE_VERSION,
    seed: seed >>> 0,
    shiftId,
    preset,
    tick: 0,
    phase: 'ready',
    nextEventSeq: 0,
    timing: buildTiming(shift.lengthSeconds),
    schedule: buildSchedule(shift, seed),
    nextArrivalIndex: 0,
    guests: [],
    doorQueue: [],
    spots: Array.from({ length: CONFIG.counterSpots }, () => null),
    tables: Array.from({ length: CONFIG.tables }, (_, i) => ({
      id: i + 1,
      state: /** @type {'clean'} */ ('clean'),
      guestId: null,
      claimedBy: null,
    })),
    dishes: Array.from({ length: CONFIG.dishes }, (_, i) => ({
      id: i + 1,
      holder: { kind: /** @type {'rack'} */ ('rack') },
    })),
    machine: {
      slots: Array.from({ length: CONFIG.machineSlots }, () => ({
        state: /** @type {'empty'} */ ('empty'),
        dishId: null,
        ticksLeft: 0,
        claimedBy: null,
      })),
    },
    pass: { dishId: null, claimedBy: null },
    stand: { installed: CONFIG.presets[preset].standInstalled, userId: null, queue: [] },
    owner: { zone: CONFIG.ownerStartZone, action: null, queue: [], nextActionId: 1 },
    economy: {
      startingWallet: CONFIG.startingWallet,
      grossEarnings: 0,
      spent: 0,
      wallet: CONFIG.startingWallet,
      score: 0,
    },
    metrics: {
      ownerTicks: {
        brewStart: 0,
        plate: 0,
        handOver: 0,
        answer: 0,
        wipe: 0,
        wash: 0,
        travel: 0,
        idle: 0,
      },
      spotTicks: { waiting: 0, asking: 0 },
      allSpotsFullTicks: 0,
      guests: { served: 0, leftHappy: 0, leftUnhappy: 0, walkedPast: 0 },
    },
  };
}
