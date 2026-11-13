// @ts-check
/**
 * Guards the rule in docs/TECH_BLUEPRINT.md §2: nothing under src/sim touches
 * the DOM, canvas, audio, the clock or unseeded randomness, and it imports
 * only from src/sim.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const SIM = new URL('../src/sim/', import.meta.url);

const FORBIDDEN = [
  /\bdocument\b/,
  /\bwindow\b/,
  /\bnavigator\b/,
  /\bglobalThis\b/,
  /\bHTML[A-Z]\w+/,
  /\bcanvas\b/i,
  /\bAudio\w*/,
  /\bperformance\b/,
  /\bDate\b/,
  /\bMath\.random\b/,
  /\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b/,
  /\blocalStorage\b|\bsessionStorage\b|\bfetch\b/,
  /\bprocess\b|\brequire\s*\(/,
];

/** Removes comments so prose about the DOM does not trip the scan. */
function stripComments(/** @type {string} */ source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('simulation modules use no DOM, canvas, audio, clock or unseeded randomness', async () => {
  const files = (await readdir(SIM)).filter((name) => name.endsWith('.js'));
  assert.ok(files.length >= 7, 'expected the simulation modules to be present');
  for (const name of files) {
    const code = stripComments(await readFile(new URL(name, SIM), 'utf8'));
    for (const pattern of FORBIDDEN) {
      assert.equal(pattern.test(code), false, `${name} uses ${pattern}`);
    }
  }
});

test('simulation modules import only from src/sim', async () => {
  const files = (await readdir(SIM)).filter((name) => name.endsWith('.js'));
  for (const name of files) {
    const code = stripComments(await readFile(new URL(name, SIM), 'utf8'));
    const specifiers = [...code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const specifier of specifiers) {
      assert.match(specifier, /^\.\/[\w-]+\.js$/, `${name} imports ${specifier}`);
    }
  }
});

test('the simulation loads and runs where no browser globals exist', async () => {
  assert.equal(typeof (/** @type {any} */ (globalThis).document), 'undefined');
  const sim = await import('../src/sim/index.js');
  assert.equal(sim.checkInvariants(sim.createInitialState()).length, 0);
});
