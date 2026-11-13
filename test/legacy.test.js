// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { verifyLegacy } from '../tools/verify-legacy.mjs';

/**
 * SHA-256 of the prototype as received on 2026-11-12. Pinned here as well as
 * in legacy/SHA256SUMS, so changing the file and the sums together still fails.
 */
const PROTOTYPE = 'byte-cafe-shift-v2.html';
const PROTOTYPE_SHA256 = '67658822942475d56de8a22aa315ca702f80e14260b7d3ab776fef38100989cd';
const PROTOTYPE_BYTES = 44915;

test('the original prototype is unchanged, with its filename kept', async () => {
  const bytes = await readFile(new URL(`../legacy/${PROTOTYPE}`, import.meta.url));
  assert.equal(bytes.length, PROTOTYPE_BYTES);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), PROTOTYPE_SHA256);
});

test('every file listed in legacy/SHA256SUMS matches its recorded hash', async () => {
  const results = await verifyLegacy();
  assert.equal(results.length, 3);
  assert.ok(results.some((r) => r.file === PROTOTYPE && r.expected === PROTOTYPE_SHA256));
  for (const r of results) {
    assert.equal(r.actual, r.expected, `${r.file} has changed`);
  }
});

test('the game does not load anything from legacy/', async () => {
  for (const file of ['index.html', 'src/main.js', 'src/view/renderer.js']) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.equal(text.includes('legacy/'), false, `${file} refers to legacy/`);
  }
});
