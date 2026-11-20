// @ts-check
/**
 * Shows the TapIt visual components on their own, looping. Not part of the game.
 */
import { drawLandingPage, drawPhone, drawStand, drawTapSequence } from './view/tapit.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('preview'));
const cx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** @param {number} now */
function frame(now) {
  const W = 960;
  const H = 540;
  cx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  cx.fillStyle = '#f3dcb0';
  cx.fillRect(0, 0, W, H);
  // A counter to stand things on.
  cx.fillStyle = '#d7a46a';
  cx.fillRect(0, 380, W, 26);
  cx.fillStyle = '#a56f4a';
  cx.fillRect(0, 406, W, 134);

  drawStand(cx, 150, 384, 1.6);
  const t = reduced ? 0.95 : ((now / 1000) % 3.2) / 3.2;
  drawTapSequence(cx, { x: 470, y: 384, scale: 1.25 }, t, 'wifi');
  drawPhone(cx, 790, 250, 2.6, { screen: (c, w, h) => drawLandingPage(c, w, h, { highlight: 'wifi' }) });
  if (!reduced) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
