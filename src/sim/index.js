// @ts-check
/**
 * Public surface of the simulation. Code outside src/sim imports from here.
 * The step function arrives in M1.
 */
export { CONFIG, STATE_VERSION, TICKS_PER_SECOND, toTicks } from './config.js';
export { createRng, hashString, shuffled, streamSeed } from './rng.js';
export { buildSchedule } from './schedule.js';
export { createInitialState, isPresetId } from './state.js';
export { checkInvariants } from './invariants.js';
export { digest, stableStringify } from './digest.js';
