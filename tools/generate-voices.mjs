#!/usr/bin/env node
/**
 * ElevenLabs voice generation script.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk-... node tools/generate-voices.mjs [--dry-run] [--id <dialogue-id>]
 *
 * What it does:
 *   1. Reads DIALOGUE entries from AudioManifest.js that have:
 *      - status: 'pending'
 *      - voiceId that is not PENDING_ELEVENLABS_ID
 *   2. Calls the ElevenLabs TTS API for each one.
 *   3. Saves the MP3 to public/audio/<speaker>/<id>.mp3
 *   4. Prints a patch you can apply to AudioManifest.js to mark them 'ready'.
 *
 * After running:
 *   1. Apply the printed patch (change status: 'pending' → 'ready', add file: '...').
 *   2. Run node tools/generate-voices.mjs again — it will skip already-generated files.
 *
 * Rate limits: ElevenLabs free tier allows ~10k chars/month. This script
 * batches with a 500ms delay between calls to avoid 429 errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const API_BASE = 'https://api.elevenlabs.io/v1';
const KEY = process.env.ELEVENLABS_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_ID = (() => {
  const idx = process.argv.indexOf('--id');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

if (!KEY && !DRY_RUN) {
  console.error('Set ELEVENLABS_API_KEY or pass --dry-run to preview what would be generated.');
  process.exit(1);
}

// ---- Load manifest ----
// We import it as plain text so this script works without a bundler.
// The manifest uses ESM exports; we parse the DIALOGUE array with a regex
// rather than actually importing it, to avoid needing --experimental-vm-modules.
const manifestPath = new URL('../src/audio/AudioManifest.js', import.meta.url).pathname;
const manifestSrc = fs.readFileSync(manifestPath, 'utf8');

// Extract DIALOGUE entries via regex — good enough for well-structured source.
const dialogueBlock = manifestSrc.match(/export const DIALOGUE\s*=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
const entryTexts = dialogueBlock.match(/\{[^{}]*\}/g) ?? [];

/** @type {{ id: string, speaker: string, voiceId: string, text: string, status: string }[]} */
const entries = entryTexts.flatMap((s) => {
  try {
    // Convert JS object literal to JSON by quoting unquoted keys.
    const json = s
      .replace(/\/\/[^\n]*/g, '')     // strip line comments
      .replace(/,\s*([}\]])/g, '$1')  // trailing commas
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":') // quote keys
      .replace(/:\s*'([^']*)'/g, ': "$1"'); // single → double quotes
    return [JSON.parse(json)];
  } catch {
    return [];
  }
});

const pending = entries.filter((e) => {
  if (e.status !== 'pending') return false;
  if (!e.voiceId || e.voiceId.startsWith('PENDING')) return false;
  if (ONLY_ID && e.id !== ONLY_ID) return false;
  return true;
});

console.log(`Found ${pending.length} pending voice lines to generate.`);

/** @param {string} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @param {string} text @param {string} voiceId @returns {Promise<ArrayBuffer>} */
async function generate(text, voiceId) {
  const res = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': KEY ?? '',
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2',
      voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.1 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${body}`);
  }
  return res.arrayBuffer();
}

/** @param {string} speaker @returns {string} */
function outputDir(speaker) {
  const dirs = { customer: 'customers', byte: 'byte', owner: 'customers' };
  return `public/audio/${dirs[speaker] ?? 'customers'}`;
}

/** @type {{ id: string, file: string }[]} */
const generated = [];

for (const entry of pending) {
  const dir = outputDir(entry.speaker);
  const file = `${dir}/${entry.id}.mp3`;
  const absFile = path.resolve(file);

  if (fs.existsSync(absFile)) {
    console.log(`  skip  ${entry.id}  (file exists)`);
    generated.push({ id: entry.id, file });
    continue;
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] would generate: ${entry.id} → ${file}`);
    console.log(`            text: "${entry.text}"`);
    console.log(`            voice: ${entry.voiceId}`);
    continue;
  }

  console.log(`  gen   ${entry.id} ...`);
  try {
    fs.mkdirSync(path.dirname(absFile), { recursive: true });
    const ab = await generate(entry.text, entry.voiceId);
    const buf = Buffer.from(ab);
    await pipeline(Readable.from(buf), createWriteStream(absFile));
    console.log(`        → ${file} (${buf.length} bytes)`);
    generated.push({ id: entry.id, file });
  } catch (err) {
    console.error(`  ERROR ${entry.id}: ${err.message}`);
  }
  await sleep(500);
}

if (generated.length > 0) {
  console.log('\n---- Patch for AudioManifest.js ----');
  console.log('Apply these changes to mark generated lines as ready:\n');
  for (const { id, file } of generated) {
    console.log(`  id: '${id}'`);
    console.log(`    status: 'pending'  →  status: 'ready'`);
    console.log(`    (add)              →  file: '${file}'\n`);
  }
}

console.log('Done.');
