// @ts-check
/**
 * Station Overlay — a close-up canvas panel that slides over the main scene
 * when the owner starts a station action. The main simulation keeps running.
 *
 * Usage: createStationOverlay(panelEl, canvasEl) → overlay
 *   overlay.open('sink'|'oven'|'handoff'|'tapit', state)
 *   overlay.onFrame(elapsedMs, simState, events)   ← called every game frame
 *   overlay.close()
 *   overlay.isOpen()
 *   overlay.onPointerDown/Move/Up(x, y)   ← canvas-relative coords
 */
/** @import { SimState, SimEvent } from '../sim/types.js' */

import { drawSinkScene } from './station-sink.js';
import { drawOvenScene } from './station-oven.js';
import { drawHandoffScene } from './station-handoff.js';
import { drawTapItScene } from './station-tapit.js';

/** @typedef {'sink' | 'oven' | 'handoff' | 'tapit'} OverlayType */

/**
 * @param {HTMLElement} panel
 * @param {HTMLCanvasElement} canvas
 * @returns {ReturnType<typeof _create>}
 */
export function createStationOverlay(panel, canvas) {
  return _create(panel, canvas);
}

/**
 * @param {HTMLElement} panel
 * @param {HTMLCanvasElement} canvas
 */
function _create(panel, canvas) {
  const cx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  /** @type {OverlayType | null} */
  let type = null;
  /** Time (ms) since the overlay opened — used to drive scene animations. */
  let elapsed = 0;
  /** Slide-in progress 0→1. */
  let slideT = 0;
  /** Pointer position in overlay canvas logical units (480×400). */
  let pointerX = 240;
  let pointerY = 200;
  /** Whether the pointer is currently pressed (held). */
  let pressed = false;

  const W = 480, H = 400;

  function resize() {
    // Keep the canvas's backing store matched to the displayed CSS size.
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  /** @param {number} clientX @param {number} clientY */
  function toLocal(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width * W,
      y: (clientY - rect.top) / rect.height * H,
    };
  }

  function draw(/** @type {SimState} */ state) {
    if (!type) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayW = rect.width, displayH = rect.height;
    const scaleX = canvas.width / W;
    const scaleY = canvas.height / H;

    cx.save();
    cx.scale(scaleX, scaleY);
    cx.clearRect(0, 0, W, H);

    // Slide-in: translate from bottom
    const slide = ease(slideT);
    cx.save();
    cx.translate(0, H * (1 - slide));

    switch (type) {
      case 'sink':    drawSinkScene(cx, W, H, state, elapsed, pointerX, pointerY, pressed); break;
      case 'oven':    drawOvenScene(cx, W, H, state, elapsed, pointerX, pointerY, pressed); break;
      case 'handoff': drawHandoffScene(cx, W, H, state, elapsed, pointerX, pointerY, pressed); break;
      case 'tapit':   drawTapItScene(cx, W, H, state, elapsed, pointerX, pointerY, pressed); break;
    }

    cx.restore();
    cx.restore();
  }

  function ease(t) { return t < 0.5 ? 2*t*t : 1-((-2*t+2)**2)/2; }

  return {
    isOpen() { return type !== null; },

    /** @param {OverlayType} t @param {SimState} state */
    open(t, state) {
      type = t;
      elapsed = 0;
      slideT = 0;
      pressed = false;
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      resize();
      draw(state);
    },

    close() {
      type = null;
      slideT = 0;
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
    },

    /** @param {number} dt Elapsed ms @param {SimState} state @param {readonly SimEvent[]} events */
    onFrame(dt, state, events) {
      if (!type) return;
      elapsed += dt;
      slideT = Math.min(1, slideT + dt / 220);
      resize();
      draw(state);
      void events;
    },

    /** @param {number} clientX @param {number} clientY */
    onPointerDown(clientX, clientY) {
      pressed = true;
      const p = toLocal(clientX, clientY);
      pointerX = p.x; pointerY = p.y;
    },
    /** @param {number} clientX @param {number} clientY */
    onPointerMove(clientX, clientY) {
      const p = toLocal(clientX, clientY);
      pointerX = p.x; pointerY = p.y;
    },
    onPointerUp() {
      pressed = false;
    },
  };
}
