// @ts-check
/**
 * Persists and retrieves audio preferences from localStorage.
 * All reads are safe; a corrupt or missing store returns defaults.
 */

const KEY = 'cafe-shift-audio';

/**
 * @typedef {object} AudioPrefs
 * @property {number} master   0–1
 * @property {number} sfx      0–1
 * @property {number} voice    0–1
 * @property {number} music    0–1
 * @property {number} ambient  0–1
 * @property {boolean} muted
 */

/** @returns {AudioPrefs} */
function defaults() {
  return { master: 0.8, sfx: 0.9, voice: 1.0, music: 0.5, ambient: 0.6, muted: false };
}

/** @returns {AudioPrefs} */
export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw);
    const d = defaults();
    return {
      master:  typeof p.master  === 'number' ? Math.max(0, Math.min(1, p.master))  : d.master,
      sfx:     typeof p.sfx     === 'number' ? Math.max(0, Math.min(1, p.sfx))     : d.sfx,
      voice:   typeof p.voice   === 'number' ? Math.max(0, Math.min(1, p.voice))   : d.voice,
      music:   typeof p.music   === 'number' ? Math.max(0, Math.min(1, p.music))   : d.music,
      ambient: typeof p.ambient === 'number' ? Math.max(0, Math.min(1, p.ambient)) : d.ambient,
      muted:   typeof p.muted   === 'boolean' ? p.muted : d.muted,
    };
  } catch {
    return defaults();
  }
}

/** @param {AudioPrefs} prefs */
export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch { /* unavailable */ }
}
