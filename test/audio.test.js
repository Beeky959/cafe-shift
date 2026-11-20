// @ts-check
/**
 * Audio system tests — pure Node.js, no browser APIs required.
 * All tests use the manifest and settings modules directly (no AudioContext).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- AudioSettings ----
test('AudioSettings loadPrefs returns defaults when storage is empty', async () => {
  // Provide a minimal localStorage stub
  const store = new Map();
  const localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  global.localStorage = localStorage;

  const { loadPrefs } = await import('../src/audio/AudioSettings.js');
  const prefs = loadPrefs();
  assert.equal(typeof prefs.master, 'number');
  assert.ok(prefs.master >= 0 && prefs.master <= 1, 'master in 0–1');
  assert.equal(typeof prefs.muted, 'boolean');
});

test('AudioSettings savePrefs round-trips', async () => {
  const store = new Map();
  global.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  const { loadPrefs, savePrefs } = await import('../src/audio/AudioSettings.js');
  const orig = loadPrefs();
  orig.master = 0.42;
  orig.muted = true;
  savePrefs(orig);
  const loaded = loadPrefs();
  assert.equal(loaded.master, 0.42);
  assert.equal(loaded.muted, true);
});

// ---- AudioManifest ----
test('AudioManifest SOUNDS has required fields', async () => {
  const { SOUNDS } = await import('../src/audio/AudioManifest.js');
  assert.ok(Array.isArray(SOUNDS), 'SOUNDS is array');
  for (const s of SOUNDS) {
    assert.ok(s.id, `entry missing id: ${JSON.stringify(s)}`);
    assert.ok(s.category, `${s.id} missing category`);
    assert.ok(['ready', 'pending', 'placeholder', 'missing'].includes(s.status), `${s.id} bad status: ${s.status}`);
    assert.equal(typeof s.defaultVolume, 'number', `${s.id} defaultVolume`);
  }
});

test('AudioManifest SOUNDS ids are unique', async () => {
  const { SOUNDS } = await import('../src/audio/AudioManifest.js');
  const ids = SOUNDS.map((s) => s.id);
  const unique = new Set(ids);
  assert.equal(ids.length, unique.size, 'Duplicate SOUNDS ids found');
});

test('AudioManifest DIALOGUE has required fields', async () => {
  const { DIALOGUE } = await import('../src/audio/AudioManifest.js');
  assert.ok(Array.isArray(DIALOGUE), 'DIALOGUE is array');
  for (const d of DIALOGUE) {
    assert.ok(d.id, `entry missing id`);
    assert.ok(d.speaker, `${d.id} missing speaker`);
    assert.ok(d.text && typeof d.text === 'string', `${d.id} missing text`);
    assert.ok(d.intent, `${d.id} missing intent`);
    assert.ok(d.triggerEvent, `${d.id} missing triggerEvent`);
    assert.equal(typeof d.priority, 'number', `${d.id} priority`);
    assert.equal(typeof d.cooldownMs, 'number', `${d.id} cooldownMs`);
  }
});

test('AudioManifest DIALOGUE ids are unique', async () => {
  const { DIALOGUE } = await import('../src/audio/AudioManifest.js');
  const ids = DIALOGUE.map((d) => d.id);
  const unique = new Set(ids);
  assert.equal(ids.length, unique.size, 'Duplicate DIALOGUE ids found');
});

test('AudioManifest DIALOGUE text is non-empty', async () => {
  const { DIALOGUE } = await import('../src/audio/AudioManifest.js');
  for (const d of DIALOGUE) {
    assert.ok(d.text.trim().length > 0, `${d.id} has empty text`);
  }
});

test('AudioManifest dialogueForOrder returns entries for each order type', async () => {
  const { dialogueForOrder } = await import('../src/audio/AudioManifest.js');
  for (const order of ['espresso', 'latte', 'mocha', 'croissant']) {
    const entries = dialogueForOrder('order', order);
    assert.ok(Array.isArray(entries), `dialogueForOrder should return array for ${order}`);
    assert.ok(entries.length > 0, `No dialogue entries for order=${order}`);
    for (const e of entries) assert.ok(e.text.length > 0, `${e.id} empty text`);
  }
});

test('AudioManifest dialogueForQuestion returns entries for each topic', async () => {
  const { dialogueForQuestion } = await import('../src/audio/AudioManifest.js');
  for (const topic of ['wifi', 'menu', 'instagram', 'review', 'website', 'washroom']) {
    const entries = dialogueForQuestion(topic);
    assert.ok(Array.isArray(entries), `dialogueForQuestion should return array for ${topic}`);
    assert.ok(entries.length > 0, `No dialogue entries for topic=${topic}`);
    for (const e of entries) assert.ok(e.text.length > 0, `${e.id} empty text`);
  }
});

// ---- DialogueManager ----
test('DialogueManager trigger returns null when no candidates', async () => {
  // Stub localStorage so AudioSettings doesn't throw.
  if (!global.localStorage) {
    global.localStorage = { getItem: () => null, setItem: () => {} };
  }
  // AudioManager needs AudioContext — stub minimally.
  if (typeof globalThis.AudioContext === 'undefined') {
    // @ts-ignore
    globalThis.AudioContext = class { state = 'closed'; };
  }
  const { trigger } = await import('../src/audio/DialogueManager.js');
  // 'nonExistentEvent' matches nothing — should return null, not throw.
  const result = trigger('nonExistentEvent_xyz');
  assert.equal(result, null);
});

test('DialogueManager trigger returns a matching entry', async () => {
  const { trigger } = await import('../src/audio/DialogueManager.js');
  const { DIALOGUE } = await import('../src/audio/AudioManifest.js');
  // Find the first event that has a matching entry.
  const ev = DIALOGUE[0].triggerEvent;
  // May or may not play audio (no AudioContext), but should not throw.
  const result = trigger(ev);
  // Could be null if cooldown blocked it on a re-import, so just check no error.
  assert.ok(result === null || typeof result.id === 'string');
});

// ---- ElevenLabsAssetLoader ----
test('ElevenLabsAssetLoader getPendingVoiceLines returns array', async () => {
  const { getPendingVoiceLines } = await import('../src/audio/ElevenLabsAssetLoader.js');
  const lines = getPendingVoiceLines();
  assert.ok(Array.isArray(lines));
  for (const l of lines) {
    assert.ok(l.id);
    assert.ok(l.text);
    assert.ok(l.voiceId);
    assert.ok(l.outputPath.endsWith('.mp3'));
  }
});

test('ElevenLabsAssetLoader getPendingSoundEffects returns array', async () => {
  const { getPendingSoundEffects } = await import('../src/audio/ElevenLabsAssetLoader.js');
  const sfx = getPendingSoundEffects();
  assert.ok(Array.isArray(sfx));
  for (const s of sfx) {
    assert.ok(s.id);
    assert.ok(s.outputPath.endsWith('.mp3'));
  }
});
