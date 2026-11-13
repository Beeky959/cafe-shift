// @ts-check
/**
 * Confirms that every file listed in legacy/SHA256SUMS still has the recorded
 * SHA-256. Exits with code 1 on any difference.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const LEGACY = new URL('../legacy/', import.meta.url);

/**
 * @returns {Promise<{ file: string, expected: string, actual: string, ok: boolean }[]>}
 */
export async function verifyLegacy() {
  const sums = await readFile(new URL('SHA256SUMS', LEGACY), 'utf8');
  const results = [];
  for (const line of sums.split('\n')) {
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim());
    if (!match) continue;
    const [, expected, file] = match;
    const actual = createHash('sha256')
      .update(await readFile(new URL(file, LEGACY)))
      .digest('hex');
    results.push({ file, expected, actual, ok: actual === expected });
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const results = await verifyLegacy();
  for (const r of results) {
    console.log(`${r.ok ? 'OK      ' : 'CHANGED '} ${r.file}  ${r.actual}`);
  }
  if (results.length === 0 || results.some((r) => !r.ok)) {
    console.error('legacy/ does not match its recorded hashes.');
    process.exit(1);
  }
}
