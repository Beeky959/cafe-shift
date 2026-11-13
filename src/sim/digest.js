// @ts-check
/**
 * A stable fingerprint of any JSON-like value. Used to prove that the same
 * inputs give the same state in Node and in every browser.
 */
import { hashString } from './rng.js';

/**
 * JSON with object keys in sorted order, so the result does not depend on
 * the order properties were created in.
 * @param {unknown} value
 * @returns {string}
 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    const text = JSON.stringify(value);
    if (text === undefined) {
      throw new TypeError(`Value of type ${typeof value} cannot be part of a state`);
    }
    return text;
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  const parts = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${parts.join(',')}}`;
}

/**
 * @param {unknown} value
 * @returns {string} 16 hexadecimal characters.
 */
export function digest(value) {
  const text = stableStringify(value);
  const a = hashString(text, 0x811c9dc5);
  const b = hashString(text, 0x9747b28c);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
