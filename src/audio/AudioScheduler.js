// @ts-check
/**
 * Randomized ambient sound scheduler.
 *
 * Keeps random café ambience going without implying gameplay events that
 * never happened. Only "harmless background detail" sounds are scheduled here.
 *
 * The scheduler is completely separate from the deterministic simulation —
 * it uses wall-clock time, never tick counts.
 */
import { play } from './AudioManager.js';

/** @typedef {{ soundIds: string[], minDelayMs: number, maxDelayMs: number, maxSimultaneous: number }} AmbGroup */

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const timers = new Map();
/** @type {Map<string, number>} Running counts per group. */
const counts = new Map();
/** Current density level. @type {'quiet' | 'moderate' | 'busy'} */
let density = 'quiet';
let running = false;

/** Safe sound groups: randomized ambience only — never imply gameplay facts. */
const AMBIENT_GROUPS = /** @type {Record<'quiet'|'moderate'|'busy', AmbGroup[]>} */ ({
  quiet: [
    { soundIds: ['amb_clink_a', 'amb_clink_b'], minDelayMs: 8000,  maxDelayMs: 20000, maxSimultaneous: 1 },
    { soundIds: ['amb_footstep'],                minDelayMs: 15000, maxDelayMs: 35000, maxSimultaneous: 1 },
    { soundIds: ['amb_room_quiet'],              minDelayMs: 0,     maxDelayMs: 500,   maxSimultaneous: 1 },
  ],
  moderate: [
    { soundIds: ['amb_clink_a', 'amb_clink_b'], minDelayMs: 5000,  maxDelayMs: 12000, maxSimultaneous: 2 },
    { soundIds: ['amb_footstep'],                minDelayMs: 8000,  maxDelayMs: 18000, maxSimultaneous: 2 },
    { soundIds: ['amb_chatter_a', 'amb_chatter_b'], minDelayMs: 6000, maxDelayMs: 14000, maxSimultaneous: 1 },
    { soundIds: ['amb_room_quiet'],              minDelayMs: 0,     maxDelayMs: 500,   maxSimultaneous: 1 },
  ],
  busy: [
    { soundIds: ['amb_clink_a', 'amb_clink_b'], minDelayMs: 2000,  maxDelayMs: 7000,  maxSimultaneous: 2 },
    { soundIds: ['amb_footstep'],                minDelayMs: 3000,  maxDelayMs: 9000,  maxSimultaneous: 2 },
    { soundIds: ['amb_chatter_a', 'amb_chatter_b'], minDelayMs: 2000, maxDelayMs: 6000, maxSimultaneous: 2 },
    { soundIds: ['amb_room_busy'],               minDelayMs: 0,     maxDelayMs: 500,   maxSimultaneous: 1 },
  ],
});

/** @param {string[]} arr @returns {string} */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
/** @param {number} min @param {number} max @returns {number} */
function randMs(min, max) { return min + Math.random() * (max - min); }

/** @param {AmbGroup} group @param {string} key */
function schedule(group, key) {
  if (!running) return;
  const delay = randMs(group.minDelayMs, group.maxDelayMs);
  const t = setTimeout(() => {
    if (!running) return;
    const current = counts.get(key) ?? 0;
    if (current < group.maxSimultaneous) {
      const id = pick(group.soundIds);
      const vol = 0.7 + Math.random() * 0.3; // slight randomization
      play(id, { volume: group.soundIds[0].startsWith('amb_room') ? 1 : vol, cooldownMs: 0 });
    }
    schedule(group, key); // reschedule
  }, delay);
  timers.set(key, t);
}

/** @param {'quiet' | 'moderate' | 'busy'} level */
export function setDensity(level) {
  density = level;
  if (running) {
    stop();
    start();
  }
}

export function start() {
  if (running) return;
  running = true;
  const groups = AMBIENT_GROUPS[density];
  groups.forEach((g, i) => {
    const key = `amb_${density}_${i}`;
    counts.set(key, 0);
    schedule(g, key);
  });
}

export function stop() {
  running = false;
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  counts.clear();
}

/** Automatically set density based on waiting guest count. @param {number} waitingGuests */
export function updateFromGuestCount(waitingGuests) {
  const next = waitingGuests >= 3 ? 'busy' : waitingGuests >= 1 ? 'moderate' : 'quiet';
  if (next !== density) setDensity(next);
}
