// @ts-check
/**
 * Entry point: wires the page, the renderer, input and the game together.
 */
import { CONFIG } from './sim/index.js';
import { createGame } from './game.js';
import { createUi, element } from './ui/dom.js';
import { createRenderer } from './view/renderer.js';
import { areaForKey, hitTest } from './view/scene.js';
import { createStationOverlay } from './view/station-overlay.js';
import { toggleMute, isMuted, handleVisibilityChange } from './audio/index.js';

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

  const stationPanel = document.getElementById('station-panel');
  const stationCanvas = document.getElementById('station-canvas');
  const stationClose = document.getElementById('station-close');
  const overlay = (stationPanel instanceof HTMLElement && stationCanvas instanceof HTMLCanvasElement)
    ? createStationOverlay(stationPanel, stationCanvas)
    : null;

  /** @type {ReturnType<typeof createGame>} */
  // eslint-disable-next-line prefer-const
  let game;
  const ui = createUi({
    onTarget: (area) => game.press(area),
    onChip: (slot) => game.pressChip(slot),
    onPause: () => game.togglePause(),
    onOverlayButton: () => game.overlayButton(),
    onOverlayItem: (index) => game.overlayItem(index),
  });
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  game = createGame({ seed: options.seed, ui, draw: renderer.draw, reducedMotion, overlay });

  renderer.resize();
  new ResizeObserver(() => renderer.resize()).observe(canvas);

  // Pointer: decided on pointerdown, from the primary pointer only. A press
  // on a station holding a finished item picks it up; it then follows the
  // pointer until it is released over a guest.
  /** @type {number | null} */
  let dragPointer = null;
  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    const point = renderer.toScene(event.clientX, event.clientY);
    const area = hitTest(point.x, point.y);
    if (!area) return;
    if (game.dragStart(area, point)) {
      dragPointer = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    game.press(area);
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = renderer.toScene(event.clientX, event.clientY);
    if (event.pointerId === dragPointer) game.dragMove(point);
    if (event.pointerType === 'mouse') game.setHover(hitTest(point.x, point.y)?.id ?? null);
  });
  /** @param {PointerEvent} event @param {boolean} cancelled */
  const endDrag = (event, cancelled) => {
    if (event.pointerId !== dragPointer) return;
    dragPointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    const point = renderer.toScene(event.clientX, event.clientY);
    game.dragEnd(hitTest(point.x, point.y), cancelled);
  };
  canvas.addEventListener('pointerup', (event) => endDrag(event, false));
  canvas.addEventListener('pointercancel', (event) => endDrag(event, true));
  canvas.addEventListener('pointerleave', () => game.setHover(null));

  // Keyboard: number keys for targets, C to cancel, P or Escape to pause.
  // The same keys carry out an order: 4-6 picks a guest's ticket, 1 or 2
  // makes it, 1 or 2 again picks it up when ready, 4-6 delivers it.
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const key = event.key;
    if (key === 'Escape' && game.putBack()) {
      // Escape first puts back whatever is being carried.
      event.preventDefault();
      return;
    }
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

  // Station overlay pointer events — routed to the overlay when open.
  if (stationCanvas instanceof HTMLCanvasElement && overlay) {
    stationCanvas.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary) return;
      event.preventDefault();
      overlay.onPointerDown(event.clientX, event.clientY);
    });
    stationCanvas.addEventListener('pointermove', (event) => {
      if (!event.isPrimary) return;
      overlay.onPointerMove(event.clientX, event.clientY);
    });
    stationCanvas.addEventListener('pointerup', (event) => {
      if (!event.isPrimary) return;
      overlay.onPointerUp();
    });
    stationCanvas.addEventListener('pointercancel', () => overlay.onPointerUp());
  }
  if (stationClose instanceof HTMLElement) {
    stationClose.addEventListener('click', () => game.dismissOverlay());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pauseIfPlaying();
    handleVisibilityChange();
  });

  // Mute button
  const muteBtn = document.getElementById('mute-button');
  if (muteBtn) {
    const updateMuteLabel = () => { muteBtn.textContent = isMuted() ? '♪̶' : '♪'; };
    muteBtn.addEventListener('click', () => { toggleMute(); updateMuteLabel(); });
  }

  if (options.debug) {
    /** @type {any} */ (window).cafeShift = game.debug;
  }
  game.boot();
}

start();
