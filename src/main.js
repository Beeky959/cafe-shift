// @ts-check
/**
 * Entry point: wires the page, the renderer, input and the game together.
 */
import { CONFIG } from './sim/index.js';
import { createGame } from './game.js';
import { createUi, element } from './ui/dom.js';
import { createRenderer } from './view/renderer.js';
import { areaForKey, hitTest } from './view/scene.js';

/**
 * Optional development settings from the address bar:
 * ?seed=<integer> picks another guest schedule; ?debug exposes a test hook.
 * @returns {{ seed: number, debug: boolean }}
 */
function readOptions() {
  const params = new URLSearchParams(window.location.search);
  let seed = CONFIG.defaultSeed;
  const seedText = params.get('seed');
  if (seedText !== null && /^\d{1,10}$/.test(seedText) && Number(seedText) <= 0xffffffff) {
    seed = Number(seedText);
  }
  return { seed, debug: params.has('debug') };
}

function start() {
  const options = readOptions();
  const canvas = element('scene', HTMLCanvasElement);
  const renderer = createRenderer(canvas);

  /** @type {ReturnType<typeof createGame>} */
  // eslint-disable-next-line prefer-const
  let game;
  const ui = createUi({
    onTarget: (area) => game.press(area),
    onChip: (slot) => game.pressChip(slot),
    onPause: () => game.togglePause(),
    onOverlayButton: () => game.overlayButton(),
  });
  game = createGame({ seed: options.seed, ui, draw: renderer.draw });

  renderer.resize();
  new ResizeObserver(() => renderer.resize()).observe(canvas);

  // Pointer: decided on pointerdown, from the primary pointer only.
  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    const point = renderer.toScene(event.clientX, event.clientY);
    const area = hitTest(point.x, point.y);
    if (area) game.press(area);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const point = renderer.toScene(event.clientX, event.clientY);
    game.setHover(hitTest(point.x, point.y)?.id ?? null);
  });
  canvas.addEventListener('pointerleave', () => game.setHover(null));

  // Keyboard: number keys for targets, C to cancel, P or Escape to pause.
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const key = event.key;
    if (key === 'Escape' || key === 'p' || key === 'P') {
      if (game.phase() === 'playing' || game.phase() === 'paused') {
        event.preventDefault();
        game.togglePause();
      }
      return;
    }
    if (game.phase() !== 'playing') return;
    if (key === 'c' || key === 'C' || key === 'Backspace') {
      event.preventDefault();
      game.cancelCurrent();
      return;
    }
    const area = areaForKey(key);
    if (area) {
      event.preventDefault();
      game.press(area);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pauseIfPlaying();
  });

  if (options.debug) {
    /** @type {any} */ (window).cafeShift = game.debug;
  }
  game.boot();
}

start();
