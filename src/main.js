// @ts-check
/**
 * Entry point. M0 wires the simulation foundation to the page and shows its
 * starting state. There is no game loop yet.
 */
import {
  CONFIG,
  TICKS_PER_SECOND,
  checkInvariants,
  createInitialState,
  digest,
  isPresetId,
} from './sim/index.js';
import { createRenderer } from './view/renderer.js';

/**
 * @template {Element} T
 * @param {string} id
 * @param {new () => T} type
 * @returns {T}
 */
function element(id, type) {
  const found = document.getElementById(id);
  if (!(found instanceof type)) {
    throw new Error(`Missing #${id}`);
  }
  return found;
}

/**
 * Reads optional development settings from the address bar:
 * ?seed=<integer> and ?preset=test-stand. Invalid values fall back to defaults.
 * @returns {{ seed: number, preset: import('./sim/types.js').PresetId, notes: string[] }}
 */
function readOptions() {
  const params = new URLSearchParams(window.location.search);
  /** @type {string[]} */
  const notes = [];
  let seed = CONFIG.defaultSeed;
  const seedText = params.get('seed');
  if (seedText !== null) {
    if (/^\d{1,10}$/.test(seedText) && Number(seedText) <= 0xffffffff) {
      seed = Number(seedText);
    } else {
      notes.push(`Ignored seed "${seedText}"; using the default.`);
    }
  }
  /** @type {import('./sim/types.js').PresetId} */
  let preset = 'none';
  const presetText = params.get('preset');
  if (presetText !== null) {
    if (isPresetId(presetText)) {
      preset = presetText;
    } else {
      notes.push(`Ignored preset "${presetText}"; using "none".`);
    }
  }
  return { seed, preset, notes };
}

/**
 * @param {HTMLElement} list
 * @param {[string, string, boolean?][]} rows
 */
function renderStatus(list, rows) {
  list.replaceChildren();
  for (const [label, value, bad] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (bad) dd.className = 'bad';
    list.append(dt, dd);
  }
}

function start() {
  const canvas = element('scene', HTMLCanvasElement);
  const status = element('status', HTMLElement);
  const list = element('status-list', HTMLElement);

  const renderer = createRenderer(canvas);
  renderer.resize();
  new ResizeObserver(() => renderer.resize()).observe(canvas);

  const options = readOptions();
  const state = createInitialState({ seed: options.seed, preset: options.preset });
  const problems = checkInvariants(state);
  const fingerprint = digest(state);
  const questions = state.schedule.filter((g) => g.question !== null);
  const seconds = (/** @type {number} */ ticks) => (ticks / TICKS_PER_SECOND).toFixed(1);

  renderStatus(list, [
    ['Seed', String(state.seed)],
    ['Shift', `${state.shiftId}, ${seconds(state.timing.shiftLength)} s`],
    ['Preset', state.preset],
    ['Stand installed', state.stand.installed ? 'yes (test preset)' : 'no'],
    ['Guests scheduled', String(state.schedule.length)],
    ['With a question', `${questions.length} (${questions.filter((g) => g.usesStandIfPresent).length} would use a stand)`],
    ['First arrivals', state.schedule.slice(0, 5).map((g) => `${seconds(g.arrivalTick)} s`).join(', ')],
    ['Clean dishes', String(state.dishes.filter((d) => d.holder.kind === 'rack').length)],
    ['Rule check', problems.length === 0 ? 'passed' : problems.join('; '), problems.length > 0],
    ['State fingerprint', fingerprint],
    ...options.notes.map((note) => /** @type {[string, string, boolean]} */ (['Note', note, true])),
  ]);

  status.dataset.digest = fingerprint;
  status.dataset.problems = String(problems.length);
  status.dataset.ready = 'true';
}

start();
