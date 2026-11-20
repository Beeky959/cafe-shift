// @ts-check
/**
 * Core audio manager — single AudioContext, volume routing, loop management,
 * sound variation, and synthesized placeholders for sounds without real assets.
 *
 * Rules:
 *   - One AudioContext shared across the entire game.
 *   - Initialized on first user gesture; audio never blocks gameplay.
 *   - Placeholder sounds use Web Audio API synthesis.
 *   - Real audio files played via AudioBufferSourceNode once assets exist.
 */
import { loadPrefs, savePrefs } from './AudioSettings.js';
import { SOUNDS, getSound } from './AudioManifest.js';

/** @typedef {import('./AudioSettings.js').AudioPrefs} AudioPrefs */

/** @type {AudioContext | null} */
let ctx = null;
/** @type {AudioPrefs} */
let prefs = loadPrefs();
/** Master gain node. @type {GainNode | null} */
let masterGain = null;
/** @type {GainNode | null} */ let sfxGain   = null;
/** @type {GainNode | null} */ let voiceGain  = null;
/** @type {GainNode | null} */ let musicGain  = null;
/** @type {GainNode | null} */ let ambientGain = null;
/** @type {GainNode | null} */ let duckGain   = null; // applied to music+ambient when voice plays

/** Loaded audio buffers keyed by sound id. @type {Map<string, AudioBuffer>} */
const buffers = new Map();
/** Active looping source nodes keyed by loop-slot id. @type {Map<string, AudioBufferSourceNode | OscillatorNode>} */
const loops = new Map();
/** Cooldown timestamps keyed by sound id — last time it played. @type {Map<string, number>} */
const lastPlayed = new Map();

const MIN_COOLDOWN_MS = 80;

/** @returns {boolean} */
export function isReady() { return ctx !== null && ctx.state !== 'closed'; }

/**
 * Must be called from a user gesture (click, touch, key).
 * Safe to call more than once.
 */
export function init() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  try {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    sfxGain    = ctx.createGain();
    voiceGain  = ctx.createGain();
    musicGain  = ctx.createGain();
    ambientGain = ctx.createGain();
    duckGain   = ctx.createGain();

    // Routing: sfx/voice → master; music/ambient → duck → master
    sfxGain.connect(masterGain);
    voiceGain.connect(masterGain);
    musicGain.connect(duckGain);
    ambientGain.connect(duckGain);
    duckGain.connect(masterGain);
    masterGain.connect(ctx.destination);

    _applyPrefs();
  } catch {
    ctx = null;
  }
}

/** Re-applies all prefs to the gain nodes. */
function _applyPrefs() {
  if (!ctx || !masterGain) return;
  const m = prefs.muted ? 0 : prefs.master;
  masterGain.gain.setTargetAtTime(m, ctx.currentTime, 0.05);
  if (sfxGain)    sfxGain.gain.setTargetAtTime(prefs.sfx,     ctx.currentTime, 0.05);
  if (voiceGain)  voiceGain.gain.setTargetAtTime(prefs.voice,  ctx.currentTime, 0.05);
  if (musicGain)  musicGain.gain.setTargetAtTime(prefs.music,  ctx.currentTime, 0.05);
  if (ambientGain) ambientGain.gain.setTargetAtTime(prefs.ambient, ctx.currentTime, 0.05);
}

/** Returns the destination GainNode for a category. @param {string} cat @returns {GainNode | null} */
function _busFor(cat) {
  if (!ctx) return null;
  if (cat === 'music') return musicGain;
  if (cat === 'ambience') return ambientGain;
  if (cat === 'voice' || cat === 'byte' || cat === 'customers') return voiceGain;
  return sfxGain;
}

/** @param {number} [v] 0–1 */ export function setMaster(v = 1)  { prefs.master  = Math.max(0, Math.min(1, v ?? 1)); _applyPrefs(); savePrefs(prefs); }
/** @param {number} [v] 0–1 */ export function setSfx(v = 1)     { prefs.sfx     = Math.max(0, Math.min(1, v ?? 1)); _applyPrefs(); savePrefs(prefs); }
/** @param {number} [v] 0–1 */ export function setVoice(v = 1)   { prefs.voice   = Math.max(0, Math.min(1, v ?? 1)); _applyPrefs(); savePrefs(prefs); }
/** @param {number} [v] 0–1 */ export function setMusic(v = 0.5) { prefs.music   = Math.max(0, Math.min(1, v ?? 0.5)); _applyPrefs(); savePrefs(prefs); }
/** @param {number} [v] 0–1 */ export function setAmbient(v = 0.6){ prefs.ambient = Math.max(0, Math.min(1, v ?? 0.6)); _applyPrefs(); savePrefs(prefs); }
export function mute()   { prefs.muted = true;  _applyPrefs(); savePrefs(prefs); }
export function unmute() { prefs.muted = false; _applyPrefs(); savePrefs(prefs); }
export function toggleMute() { prefs.muted ? unmute() : mute(); }
export function isMuted() { return prefs.muted; }
export function getPrefs() { return { ...prefs }; }

/** Temporarily duck music+ambient while voice plays. */
export function duckBackground(duckTo = 0.25, fadeMs = 200) {
  if (!ctx || !duckGain) return;
  duckGain.gain.cancelScheduledValues(ctx.currentTime);
  duckGain.gain.setTargetAtTime(duckTo, ctx.currentTime, fadeMs / 1000 / 3);
}
export function unduckBackground(fadeMs = 500) {
  if (!ctx || !duckGain) return;
  duckGain.gain.cancelScheduledValues(ctx.currentTime);
  duckGain.gain.setTargetAtTime(1.0, ctx.currentTime, fadeMs / 1000 / 3);
}

/** Load an audio file into a buffer. No-op if already loaded or no file given. */
async function _load(id, url) {
  if (buffers.has(id) || !ctx) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const ab = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    buffers.set(id, buf);
  } catch { /* missing file — fall through to placeholder */ }
}

/** Preload all 'ready' assets in the manifest. */
export async function preload() {
  for (const s of SOUNDS) {
    if (s.status === 'ready' && s.file) {
      await _load(s.id, s.file);
    }
  }
}

// ---- Synthesized placeholders ----
// Each placeholder produces a brief recognizable sound via Web Audio API
// so development and testing work without real assets.

/** @param {string} id @param {AudioNode} dest @param {number} vol */
function _synth(id, dest, vol) {
  if (!ctx) return;
  const now = ctx.currentTime;
  switch (id) {
    case 'coffee_grind': { _noise(dest, 0.6, vol, now, 0.08, 0.5); break; }
    case 'espresso_start': { _tone(dest, 220, 'sawtooth', vol * 0.5, now, 0.05, 0.4); break; }
    case 'espresso_loop': { _noise(dest, 0.4, vol * 0.6, now, 0.1, 0.5); break; }
    case 'espresso_stop': { _tone(dest, 180, 'sawtooth', vol * 0.3, now, 0.0, 0.3, true); break; }
    case 'espresso_pour': { _noise(dest, 0.5, vol * 0.4, now, 0.1, 0.4); break; }
    case 'steam_wand': { _noise(dest, 0.7, vol * 0.5, now, 0.05, 0.5); break; }
    case 'cup_pickup':
    case 'cup_place':
    case 'cup_clink': { _clink(dest, vol, now); break; }
    case 'coffee_perfect': { _chime(dest, [880, 1100, 1320], vol, now); break; }
    case 'coffee_weak': { _chime(dest, [660, 550], vol * 0.7, now); break; }
    case 'coffee_bitter': { _tone(dest, 220, 'square', vol * 0.4, now, 0.0, 0.3, true); break; }
    case 'oven_open':
    case 'oven_close': { _tone(dest, 300, 'sawtooth', vol * 0.3, now, 0.01, 0.35); break; }
    case 'oven_hum': { _tone(dest, 60, 'sine', vol * 0.4, now, 0.1, 0.4); break; }
    case 'oven_timer': { _chime(dest, [1047, 1319], vol, now); break; }
    case 'pastry_tray':
    case 'pastry_rustle': { _noise(dest, 0.3, vol * 0.3, now, 0.05, 0.3); break; }
    case 'faucet_on':
    case 'faucet_off': { _noise(dest, 0.6, vol * 0.4, now, 0.1, 0.3); break; }
    case 'water_loop':
    case 'scrub_loop': { _noise(dest, 0.5, vol * 0.35, now, 0.05, 0.4); break; }
    case 'dish_rack': { _clink(dest, vol * 0.7, now); break; }
    case 'door_bell': { _chime(dest, [1046, 784], vol, now); break; }
    case 'footsteps': { _tone(dest, 80, 'sine', vol * 0.5, now, 0.01, 0.15); break; }
    case 'payment_beep': { _tone(dest, 1047, 'sine', vol, now, 0.0, 0.25); break; }
    case 'customer_leave': { _tone(dest, 350, 'sine', vol * 0.3, now, 0.0, 0.3, true); break; }
    case 'tapit_nfc':
    case 'tapit_qr': { _tone(dest, 1200, 'sine', vol * 0.6, now, 0.0, 0.2); break; }
    case 'tapit_page': { _chime(dest, [1047, 1319, 1568], vol * 0.7, now); break; }
    case 'ui_upgrade': { _chime(dest, [523, 659, 784, 1047], vol, now); break; }
    case 'ui_mission_pass': { _chime(dest, [523, 659, 784, 1047, 1319], vol, now); break; }
    case 'ui_mission_fail': { _chime(dest, [523, 440, 392], vol * 0.7, now); break; }
    case 'ui_reject': { _tone(dest, 220, 'square', vol * 0.4, now, 0.0, 0.2, true); break; }
    case 'amb_room_quiet': { _noise(dest, 0.1, vol * 0.3, now, 0.3, 0.5); break; }
    case 'amb_room_busy': { _noise(dest, 0.2, vol * 0.4, now, 0.3, 0.5); break; }
    case 'amb_chatter_a':
    case 'amb_chatter_b': { _noise(dest, 0.15, vol * 0.2, now, 0.3, 0.5); break; }
    case 'amb_clink_a':
    case 'amb_clink_b': { _clink(dest, vol * 0.4, now); break; }
    case 'amb_footstep': { _tone(dest, 70, 'sine', vol * 0.3, now, 0.01, 0.12); break; }
    default: { _tone(dest, 440, 'sine', vol * 0.3, now, 0.0, 0.3); break; }
  }
}

function _tone(dest, freq, type, vol, now, attack, decay, fade = false) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = /** @type {OscillatorType} */ (type);
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(vol, now + attack + 0.001);
  if (fade) g.gain.linearRampToValueAtTime(0, now + attack + decay);
  else      g.gain.setValueAtTime(vol, now + attack); // short pop + stop
  osc.connect(g); g.connect(dest);
  osc.start(now);
  osc.stop(now + attack + decay + 0.05);
}

function _noise(dest, cutoff, vol, now, attack, decay) {
  if (!ctx) return;
  const bufSize = ctx.sampleRate * (attack + decay + 0.1) | 0;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff * ctx.sampleRate * 0.5;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(vol, now + attack + 0.001);
  g.gain.linearRampToValueAtTime(0, now + attack + decay);
  src.buffer = buf;
  src.connect(filter); filter.connect(g); g.connect(dest);
  src.start(now);
}

function _clink(dest, vol, now) {
  if (!ctx) return;
  const freqs = [2200 + Math.random() * 400, 3100 + Math.random() * 300];
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = f;
    osc.type = 'sine';
    g.gain.setValueAtTime(vol * 0.5, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(g); g.connect(dest);
    osc.start(now); osc.stop(now + 0.4);
  }
}

function _chime(dest, freqs, vol, now) {
  if (!ctx) return;
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = f;
    osc.type = 'sine';
    const t = now + i * 0.12;
    g.gain.setValueAtTime(vol * 0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + 0.6);
  });
}

// ---- Public playback API ----

/**
 * Play a one-shot sound. Safe to call before init; silently skipped if audio unavailable.
 * @param {string} id  Sound id from AudioManifest
 * @param {object} [opts]
 * @param {number} [opts.volume]    Override default volume (0–1).
 * @param {number} [opts.pitch]     Playback rate (1 = normal).
 * @param {number} [opts.cooldownMs] Minimum ms since last play (overrides entry default).
 */
export function play(id, opts = {}) {
  if (!ctx || ctx.state === 'closed') return;
  const entry = getSound(id);
  if (!entry || entry.status === 'missing') return;
  const cooldown = opts.cooldownMs ?? MIN_COOLDOWN_MS;
  const last = lastPlayed.get(id) ?? 0;
  if (Date.now() - last < cooldown) return;
  lastPlayed.set(id, Date.now());

  const vol = (opts.volume ?? entry.defaultVolume) * (prefs.muted ? 0 : 1);
  const bus = _busFor(entry.category);
  if (!bus) return;

  if (entry.status === 'ready' && buffers.has(id)) {
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = /** @type {AudioBuffer} */ (buffers.get(id));
    src.playbackRate.value = opts.pitch ?? 1;
    g.gain.value = vol;
    src.connect(g); g.connect(bus);
    src.start();
  } else {
    // placeholder
    const g = ctx.createGain();
    g.connect(bus);
    _synth(id, g, vol);
  }
}

/**
 * Start or restart a looping sound under a slot key.
 * Stopping the same slot key cleanly fades the previous loop out.
 * @param {string} slotKey  Unique key for this loop slot (e.g. 'espresso', 'oven')
 * @param {string} id       Sound id
 * @param {object} [opts]
 * @param {number} [opts.volume]
 * @param {number} [opts.fadeMsIn]
 */
export function startLoop(slotKey, id, opts = {}) {
  stopLoop(slotKey); // clean up previous
  if (!ctx || ctx.state === 'closed') return;
  const entry = getSound(id);
  if (!entry) return;
  const vol = (opts.volume ?? entry.defaultVolume) * (prefs.muted ? 0 : 1);
  const bus = _busFor(entry.category);
  if (!bus) return;

  if (entry.status === 'ready' && buffers.has(id)) {
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = /** @type {AudioBuffer} */ (buffers.get(id));
    src.loop = true;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + (opts.fadeMsIn ?? 100) / 1000);
    src.connect(g); g.connect(bus);
    src.start();
    loops.set(slotKey, src);
  } else {
    // For placeholder loops we just play the synth once and schedule repeats
    // via AudioScheduler; here we store a sentinel so stopLoop knows it's active.
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = 60;
    osc.type = 'sine';
    g.gain.value = vol * 0.3;
    osc.connect(g); g.connect(bus);
    osc.start();
    loops.set(slotKey, osc);
  }
}

/**
 * Stop a loop slot with an optional fade-out.
 * @param {string} slotKey
 * @param {number} [fadeMsOut]
 */
export function stopLoop(slotKey, fadeMsOut = 150) {
  const node = loops.get(slotKey);
  if (!node || !ctx) return;
  loops.delete(slotKey);
  try {
    if (node instanceof AudioBufferSourceNode) {
      const g = ctx.createGain();
      node.disconnect();
      node.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeMsOut / 1000);
      node.stop(ctx.currentTime + fadeMsOut / 1000 + 0.05);
    } else {
      node.stop(ctx.currentTime + 0.05);
    }
  } catch { /* already stopped */ }
}

/** Stop all active loops. */
export function stopAllLoops() {
  for (const key of [...loops.keys()]) stopLoop(key, 50);
}

/** Call when page visibility changes to avoid stuck loops. */
export function handleVisibilityChange() {
  if (!ctx) return;
  if (document.hidden) {
    ctx.suspend().catch(() => {});
  } else {
    ctx.resume().catch(() => {});
  }
}

/**
 * Register a file path for a sound id so it plays as real audio instead of
 * a synthesized placeholder. Kicks off an async fetch+decode immediately if
 * the AudioContext is already running; otherwise the buffer is loaded on the
 * next preload() call.
 * @param {string} id Sound id
 * @param {string} filePath e.g. 'public/audio/coffee/espresso_start.mp3'
 */
export function registerFile(id, filePath) {
  if (buffers.has(id)) return; // already loaded
  if (ctx && ctx.state !== 'closed') {
    _fetchBuffer(id, filePath);
  }
  // If ctx not ready yet, preload() will call this after init
}

/** @param {string} id @param {string} filePath */
async function _fetchBuffer(id, filePath) {
  try {
    const res = await fetch(filePath);
    if (!res.ok) return;
    const ab = await res.arrayBuffer();
    if (!ctx) return;
    const buf = await ctx.decodeAudioData(ab);
    buffers.set(id, buf);
  } catch { /* asset not ready — placeholder will be used */ }
}

/** Clean up all audio resources. */
export function dispose() {
  stopAllLoops();
  if (ctx) ctx.close().catch(() => {});
  ctx = null;
  masterGain = null; sfxGain = null; voiceGain = null;
  musicGain = null; ambientGain = null; duckGain = null;
  buffers.clear();
  loops.clear();
}
