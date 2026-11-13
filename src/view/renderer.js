// @ts-check
/**
 * Canvas setup. M0 draws an empty placeholder scene; art and actors arrive in M2.
 * The view reads simulation state and never changes it.
 */

/** Logical scene size. All positions and hit areas use these units. */
export const SCENE_WIDTH = 960;
export const SCENE_HEIGHT = 720;

/** Backing-store scale is capped so large phones do not pay for 3x pixels. */
const MAX_PIXEL_RATIO = 2;

/**
 * @typedef {object} Renderer
 * @property {() => void} resize Match the backing store to the displayed size, then redraw.
 * @property {() => void} draw
 * @property {() => { cssWidth: number, cssHeight: number, pixelRatio: number, scale: number }} metrics
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Renderer}
 */
export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D is not available in this browser');
  }
  const ctx = context;
  let pixelRatio = 1;
  let cssWidth = 0;
  let cssHeight = 0;

  function draw() {
    const scale = (cssWidth / SCENE_WIDTH) * pixelRatio;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // Placeholder only: wall and floor in the prototype's palette.
    ctx.fillStyle = '#f3dcac';
    ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    ctx.fillStyle = '#d5a178';
    ctx.fillRect(0, SCENE_HEIGHT * 0.48, SCENE_WIDTH, SCENE_HEIGHT * 0.52);
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    cssWidth = box.width;
    cssHeight = box.height;
    pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.max(1, Math.round(cssWidth * pixelRatio));
    const height = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    draw();
  }

  return {
    resize,
    draw,
    metrics: () => ({ cssWidth, cssHeight, pixelRatio, scale: cssWidth / SCENE_WIDTH }),
  };
}
