// @ts-check
/**
 * Context-aware dialogue system.
 *
 * Rules:
 *   - Picks lines that match the current game state and event.
 *   - Respects per-entry cooldowns so lines don't repeat too fast.
 *   - Shows subtitles via the caption system even without audio assets.
 *   - Ducks background audio while voice is playing.
 *   - Never marks an order complete — the simulation is the source of truth.
 */
import { DIALOGUE } from './AudioManifest.js';
import { play, duckBackground, unduckBackground } from './AudioManager.js';

/** @typedef {import('./AudioManifest.js').DialogueEntry} DialogueEntry */

/** @type {Map<string, number>} id → last played timestamp */
const lastPlayed = new Map();
/** @type {Set<string>} Currently active gameplay flags */
const flags = new Set();
/** @type {((entry: DialogueEntry) => void) | null} */
let onSubtitle = null;
/** Currently playing dialogue id (for priority checks). @type {string | null} */
let activeLine = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let subtitleTimer = null;

/** @param {Set<string>} newFlags */
export function updateFlags(newFlags) {
  flags.clear();
  for (const f of newFlags) flags.add(f);
}

/** @param {(entry: DialogueEntry) => void} cb */
export function onSubtitleChange(cb) { onSubtitle = cb; }

/**
 * Attempt to play a dialogue line matching the given event and intent filter.
 * @param {string} triggerEvent  Sim event type, e.g. 'guestArrived'
 * @param {object} [ctx]
 * @param {string} [ctx.order]      e.g. 'espresso'
 * @param {string} [ctx.topic]      e.g. 'wifi'
 * @param {string} [ctx.speaker]    limit to 'customer' | 'byte' | 'owner'
 * @param {string[]} [ctx.intents]  if given, only match these intents
 * @returns {DialogueEntry | null}  The entry played, or null.
 */
export function trigger(triggerEvent, ctx = {}) {
  const now = Date.now();

  // Build candidate list
  const candidates = DIALOGUE.filter((d) => {
    if (d.triggerEvent !== triggerEvent) return false;
    if (ctx.speaker && d.speaker !== ctx.speaker) return false;
    if (ctx.intents && !ctx.intents.includes(d.intent)) return false;
    // Check required flags
    if (d.requires?.some((r) => !flags.has(r))) return false;
    // Check cooldown
    const last = lastPlayed.get(d.id) ?? 0;
    if (now - last < d.cooldownMs) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // Priority: lower number = higher priority. Among equal, pick randomly.
  const minPri = Math.min(...candidates.map((d) => d.priority));
  const pool = candidates.filter((d) => d.priority === minPri);

  // If something higher-priority is already playing, skip lower-priority line.
  if (activeLine) {
    const active = DIALOGUE.find((d) => d.id === activeLine);
    if (active && active.priority <= minPri) return null;
  }

  const entry = pool[Math.floor(Math.random() * pool.length)];
  _speak(entry, now);
  return entry;
}

/** @param {DialogueEntry} entry @param {number} now */
function _speak(entry, now) {
  lastPlayed.set(entry.id, now);
  activeLine = entry.id;

  // Show subtitle
  if (onSubtitle) onSubtitle(entry);

  // Duck background while voice plays
  const durationMs = 2500; // conservative estimate when no asset timing available
  duckBackground(0.3, 200);
  if (subtitleTimer) clearTimeout(subtitleTimer);
  subtitleTimer = setTimeout(() => {
    activeLine = null;
    unduckBackground(600);
    if (onSubtitle) onSubtitle(/** @type {any} */ (null));
  }, durationMs);

  // Play audio if asset is ready
  if (entry.status === 'ready' && entry.file) {
    play(entry.id, { volume: 1.0, cooldownMs: 0 });
  }
  // 'pending' or 'placeholder' → subtitle only (audio coming after ElevenLabs generation)
}

/**
 * Play a Byte line for a specific intent.
 * @param {string} intent  e.g. 'byte_warning'
 * @param {string} triggerEvent
 */
export function triggerByte(intent, triggerEvent) {
  return trigger(triggerEvent, { speaker: 'byte', intents: [intent] });
}

/** Clear all state (call on shift end / level change). */
export function reset() {
  lastPlayed.clear();
  activeLine = null;
  if (subtitleTimer) clearTimeout(subtitleTimer);
  subtitleTimer = null;
  if (onSubtitle) onSubtitle(/** @type {any} */ (null));
  unduckBackground(0);
}
