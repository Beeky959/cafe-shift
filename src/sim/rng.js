// @ts-check
/**
 * Seeded random numbers. The only source of randomness in the simulation,
 * and it is consumed only while a schedule is being built.
 */

/**
 * FNV-1a, 32 bit, over UTF-16 code units.
 * @param {string} text
 * @param {number} [basis]
 * @returns {number} Unsigned 32-bit integer.
 */
export function hashString(text, basis = 0x811c9dc5) {
  let h = basis >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Derives an independent stream seed, so that drawing more numbers for one
 * attribute never changes the numbers another attribute receives.
 * @param {number} seed
 * @param {string} shiftId
 * @param {string} stream
 * @returns {number}
 */
export function streamSeed(seed, shiftId, stream) {
  return hashString(`${seed >>> 0}:${shiftId}:${stream}`);
}

/**
 * @typedef {object} Rng
 * @property {() => number} next Float in [0, 1).
 * @property {(maxExclusive: number) => number} int Integer in [0, maxExclusive).
 * @property {(min: number, max: number) => number} range Integer in [min, max], both included.
 */

/**
 * mulberry32. Uses only 32-bit integer operations, so results are identical
 * in every JavaScript engine.
 * @param {number} seed
 * @returns {Rng}
 */
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** @param {number} maxExclusive */
  const int = (maxExclusive) => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`int() needs a positive integer, got ${maxExclusive}`);
    }
    return Math.floor(next() * maxExclusive);
  };
  /**
   * @param {number} min
   * @param {number} max
   */
  const range = (min, max) => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`range() needs integers with min <= max, got ${min}, ${max}`);
    }
    return min + int(max - min + 1);
  };
  return { next, int, range };
}

/**
 * Fisher–Yates shuffle. Returns a new array.
 * @template T
 * @param {readonly T[]} items
 * @param {Rng} rng
 * @returns {T[]}
 */
export function shuffled(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
