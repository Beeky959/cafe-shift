// @ts-check
/**
 * Balance report for the slice shift (docs/BUILD_PLAN.md §3, gates B1-B4).
 *   node tools/balance.mjs            full table for the default seed, then a summary over 20 further seeds
 *   node tools/balance.mjs 7 8 9      full tables for the seeds given
 * The gates are defined on the default seed, which is the shift the game ships.
 * The other seeds show how much room there is around it.
 */
import { CONFIG, runShift } from '../src/sim/index.js';
import { evaluateGates, playShift } from '../test/support/players.js';

const pct = (/** @type {number} */ n) => `${Math.round(n * 100)}%`;

/** @param {number} seed */
function report(seed) {
  const results = playShift(seed, runShift);
  console.log(`\nseed ${seed}`);
  console.table(
    Object.fromEntries(
      Object.entries(results).map(([kind, s]) => [
        kind,
        {
          served: `${s.served}/${s.guests}`,
          happy: s.leftHappy,
          unhappy: s.leftUnhappy,
          walkedPast: s.walkedPast,
          tips: s.tips,
          gross: s.gross,
          score: s.score,
          busy: pct(s.busy),
        },
      ]),
    ),
  );
  const gates = evaluateGates(results);
  for (const gate of gates) console.log(`  ${gate.pass ? 'PASS' : 'FAIL'}  ${gate.id} ${gate.label}: ${gate.detail}`);
  return gates;
}

const given = process.argv.slice(2).map(Number);
if (given.length > 0) {
  let failed = false;
  for (const seed of given) failed = report(seed).some((g) => !g.pass) || failed;
  process.exit(failed ? 1 : 0);
}

const defaultGates = report(CONFIG.defaultSeed);
const others = Array.from({ length: 20 }, (_, i) => i + 1);
/** @type {Record<string, number>} */
const passes = {};
let b3Min = Infinity;
for (const seed of others) {
  const results = playShift(seed, runShift);
  for (const gate of evaluateGates(results)) passes[gate.id] = (passes[gate.id] ?? 0) + (gate.pass ? 1 : 0);
  b3Min = Math.min(b3Min, results.priority.gross / results.arrivalOrder.gross - 1);
}
console.log(`\nOther seeds (1-${others.length}), for context only:`);
for (const [id, n] of Object.entries(passes)) console.log(`  ${id} holds on ${n} of ${others.length}`);
console.log(`  smallest priority-over-arrival-order margin: ${pct(b3Min)}`);
process.exit(defaultGates.some((g) => !g.pass) ? 1 : 0);
