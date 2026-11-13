// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashString, shuffled, streamSeed } from '../src/sim/index.js';

test('the generator gives a pinned sequence for a known seed', () => {
  const rng = createRng(1);
  const first = [rng.next(), rng.next(), rng.next()].map((n) => Math.floor(n * 1e9));
  // Reference values for mulberry32(1). A change here means every schedule changes.
  assert.deepEqual(first, [627073940, 2735721, 527447039]);
});

test('the same seed repeats and different seeds differ', () => {
  const draw = (/** @type {number} */ seed) => {
    const rng = createRng(seed);
    return Array.from({ length: 20 }, () => rng.int(1000));
  };
  assert.deepEqual(draw(42), draw(42));
  assert.notDeepEqual(draw(42), draw(43));
});

test('int and range stay inside their bounds and reject bad input', () => {
  const rng = createRng(7);
  for (let i = 0; i < 2000; i++) {
    const a = rng.int(6);
    assert.ok(Number.isInteger(a) && a >= 0 && a < 6);
    const b = rng.range(-3, 3);
    assert.ok(Number.isInteger(b) && b >= -3 && b <= 3);
  }
  assert.throws(() => rng.int(0), RangeError);
  assert.throws(() => rng.int(1.5), RangeError);
  assert.throws(() => rng.range(2, 1), RangeError);
});

test('shuffled keeps every item and leaves its input alone', () => {
  const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
  const out = shuffled(input, createRng(99));
  assert.deepEqual([...out].sort((a, b) => a - b), [...input]);
  assert.deepEqual(shuffled(input, createRng(99)), out);
});

test('stream seeds are independent per shift and per stream', () => {
  const seeds = new Set([
    streamSeed(5, 'slice', 'arrivals'),
    streamSeed(5, 'slice', 'orders'),
    streamSeed(5, 'other', 'arrivals'),
    streamSeed(6, 'slice', 'arrivals'),
  ]);
  assert.equal(seeds.size, 4);
  assert.equal(hashString('abc'), 0x1a47e90b);
});
