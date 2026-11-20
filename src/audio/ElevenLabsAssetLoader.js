// @ts-check
/**
 * ElevenLabs asset loader and generation pipeline helper.
 *
 * Responsibilities:
 *   1. At runtime: scan AudioManifest for 'ready' entries and register their
 *      file paths with AudioManager so they play automatically.
 *   2. At authoring time (via tools/generate-voices.mjs): provide the manifest
 *      data needed to call the ElevenLabs API in bulk.
 *
 * This module is intentionally thin — all audio playback lives in AudioManager.
 * When an asset moves from 'pending' → 'ready' in AudioManifest.js, it starts
 * working here with no other changes required.
 */

import { SOUNDS, DIALOGUE } from './AudioManifest.js';
import { registerFile } from './AudioManager.js';

/**
 * Walk the manifest and register all 'ready' file paths with AudioManager.
 * Call once during audio init, after AudioManager.init().
 */
export function registerReadyAssets() {
  for (const s of SOUNDS) {
    if (s.status === 'ready' && s.file) {
      registerFile(s.id, s.file);
    }
  }
  for (const d of DIALOGUE) {
    if (d.status === 'ready' && d.file) {
      registerFile(d.id, d.file);
    }
  }
}

/**
 * Returns all dialogue entries that need ElevenLabs generation.
 * Used by tools/generate-voices.mjs to build the generation queue.
 * @returns {{ id: string, text: string, voiceId: string, outputPath: string }[]}
 */
export function getPendingVoiceLines() {
  return DIALOGUE
    .filter((d) => d.status === 'pending' && d.voiceId && !d.voiceId.startsWith('PENDING'))
    .map((d) => ({
      id: d.id,
      text: d.text,
      voiceId: /** @type {string} */ (d.voiceId),
      outputPath: `public/audio/customers/${d.id}.mp3`,
    }));
}

/**
 * Returns all sound entries that need ElevenLabs sound-effects generation.
 * @returns {{ id: string, description: string, outputPath: string }[]}
 */
export function getPendingSoundEffects() {
  return SOUNDS
    .filter((s) => s.status === 'pending' && s.description)
    .map((s) => ({
      id: s.id,
      description: s.description ?? s.id,
      outputPath: `public/audio/${s.category ?? 'sfx'}/${s.id}.mp3`,
    }));
}
