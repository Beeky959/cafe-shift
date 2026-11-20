// @ts-check
/**
 * Checkpoint D — TapIt Smart Stand close-up canvas scene.
 * Shows the branded NFC/QR kiosk with an animated phone interaction.
 * Uses real sim state to reflect whether a guest is at the stand.
 * Brand primary: #FF7600
 */
/** @import { SimState } from '../sim/types.js' */

/** @typedef {{ x: number, y: number, r: number, life: number }} Ring */
/** @type {Ring[]} */
let rings = [];

/** Seed a ring burst at the NFC point. @param {number} x @param {number} y */
function spawnRing(x, y) {
  rings.push({ x, y, r: 10, life: 1 });
}

/**
 * @param {CanvasRenderingContext2D} cx
 * @param {number} W
 * @param {number} H
 * @param {SimState} state
 * @param {number} elapsed ms since overlay opened
 * @param {number} _px
 * @param {number} _py
 * @param {boolean} _pressed
 */
export function drawTapItScene(cx, W, H, state, elapsed, _px, _py, _pressed) {
  const standUser = state.stand.userId;
  const guestSpec = standUser !== null ? state.schedule.find((s) => s.id === standUser) : null;
  const question = guestSpec?.question ?? null;

  const nfcX = W * 0.42;
  const nfcY = H * 0.52;

  // Pulse rings every ~1.4 seconds
  if (Math.floor(elapsed / 1400) !== Math.floor((elapsed - 16) / 1400)) {
    spawnRing(nfcX, nfcY);
  }

  // ---- Background: soft café wall
  const bg = cx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1e1a24');
  bg.addColorStop(0.4, '#2a2432');
  bg.addColorStop(1, '#1a1620');
  cx.fillStyle = bg;
  cx.fillRect(0, 0, W, H);

  // Subtle grid
  cx.strokeStyle = '#ffffff08';
  cx.lineWidth = 1;
  for (let x = 0; x < W; x += 32) {
    cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke();
  }
  for (let y = 0; y < H; y += 32) {
    cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke();
  }

  // ---- TapIt Stand
  const SX = W * 0.14, SY = H * 0.12, SW = W * 0.56, SH = H * 0.78;

  // Stand base / pole
  cx.fillStyle = '#2a2a38';
  cx.fillRect(SX + SW / 2 - 8, SY + SH - 20, 16, 30);
  // Foot plate
  cx.fillStyle = '#1e1e2c';
  cx.beginPath();
  roundRect(cx, SX + SW * 0.3, SY + SH + 10, SW * 0.4, 10, 5);
  cx.fill();

  // Stand screen housing
  const housing = cx.createLinearGradient(SX, SY, SX + SW, SY + SH);
  housing.addColorStop(0, '#2e2a3e');
  housing.addColorStop(1, '#1e1a2c');
  cx.fillStyle = housing;
  cx.beginPath();
  roundRect(cx, SX, SY, SW, SH - 20, 16);
  cx.fill();
  cx.strokeStyle = '#FF7600';
  cx.lineWidth = 2.5;
  cx.beginPath();
  roundRect(cx, SX, SY, SW, SH - 20, 16);
  cx.stroke();

  // Screen surface
  const screenX = SX + 16, screenY = SY + 16, screenW = SW - 32, screenH = SH - 60;
  cx.fillStyle = '#12101c';
  cx.beginPath();
  roundRect(cx, screenX, screenY, screenW, screenH, 10);
  cx.fill();

  // Screen glow
  const screenGlow = cx.createRadialGradient(screenX + screenW / 2, screenY + screenH / 2, 10, screenX + screenW / 2, screenY + screenH / 2, screenH * 0.7);
  screenGlow.addColorStop(0, '#FF760022');
  screenGlow.addColorStop(1, '#00000000');
  cx.fillStyle = screenGlow;
  cx.fillRect(screenX, screenY, screenW, screenH);

  // ---- TapIt logo on the kiosk
  drawTapItLogo(cx, screenX + screenW / 2, screenY + 28, 1.0);

  // ---- NFC symbol in the center
  const nfcSize = 36;
  drawNFCSymbol(cx, nfcX, nfcY, nfcSize, elapsed);

  // ---- Tap instruction
  cx.fillStyle = '#FF7600';
  cx.font = 'bold 13px ui-rounded, system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillText('TAP TO CONNECT', nfcX, nfcY + nfcSize + 18);

  // ---- QR Code (simple visual)
  drawQRCode(cx, screenX + screenW / 2 - 24, screenY + screenH - 68, 48, elapsed);

  // ---- NFC ring animations
  for (let i = rings.length - 1; i >= 0; i--) {
    const ring = rings[i];
    ring.r += 2.2;
    ring.life -= 0.028;
    if (ring.life <= 0) { rings.splice(i, 1); continue; }
    cx.save();
    cx.globalAlpha = ring.life * 0.55;
    cx.strokeStyle = '#FF7600';
    cx.lineWidth = 2;
    cx.beginPath();
    cx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
    cx.stroke();
    cx.restore();
  }

  // ---- Phone (floating on the right)
  const phoneX = W * 0.78;
  const phoneY = H * 0.35;
  const phoneAnim = Math.sin(elapsed * 0.002) * 6;
  drawPhone(cx, phoneX, phoneY + phoneAnim, elapsed, standUser !== null);

  // ---- Guest info chip (top right)
  if (guestSpec) {
    cx.fillStyle = '#ffffff15';
    cx.beginPath();
    roundRect(cx, W * 0.72, 10, W * 0.26, 36, 8);
    cx.fill();
    cx.strokeStyle = '#FF760066';
    cx.lineWidth = 1;
    cx.stroke();
    cx.fillStyle = '#FF7600';
    cx.font = 'bold 11px ui-rounded, system-ui, sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(`Guest ${guestSpec.id}`, W * 0.85, 20);
    if (question) {
      cx.fillStyle = '#ffffffaa';
      cx.font = '10px ui-rounded, system-ui, sans-serif';
      cx.fillText(question.topic, W * 0.85, 34);
    }
  }

  // ---- Bottom label
  cx.fillStyle = '#ffffff66';
  cx.font = '11px ui-rounded, system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'bottom';
  cx.fillText('TapIt Smart Stand — powered by TapIt Solutions', W / 2, H - 6);
}

/** @param {CanvasRenderingContext2D} cx @param {number} cx2 @param {number} y @param {number} scale */
function drawTapItLogo(cx, cx2, y, scale) {
  cx.save();
  cx.translate(cx2, y);
  cx.scale(scale, scale);

  // "TapIt" wordmark
  cx.fillStyle = '#FF7600';
  cx.font = 'bold 20px ui-rounded, system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillText('TapIt', 0, 0);

  // Registered tag
  cx.fillStyle = '#ffffff66';
  cx.font = '9px ui-rounded, system-ui, sans-serif';
  cx.textAlign = 'left';
  cx.textBaseline = 'top';
  cx.fillText('®', 32, -10);

  cx.restore();
}

/** @param {CanvasRenderingContext2D} cx @param {number} x @param {number} y @param {number} size @param {number} elapsed */
function drawNFCSymbol(cx, x, y, size, elapsed) {
  const pulse = 0.85 + Math.sin(elapsed * 0.004) * 0.15;
  cx.save();
  cx.translate(x, y);

  // Three arcs radiating outward
  for (let i = 0; i < 3; i++) {
    const r = (size * 0.3 + i * size * 0.3) * pulse;
    const alpha = 0.9 - i * 0.25;
    cx.save();
    cx.globalAlpha = alpha;
    cx.strokeStyle = '#FF7600';
    cx.lineWidth = 2.5 - i * 0.5;
    cx.beginPath();
    cx.arc(0, 0, r, -Math.PI * 0.75, Math.PI * 0.75);
    cx.stroke();
    cx.restore();
  }

  // Center dot
  cx.fillStyle = '#FF7600';
  cx.beginPath();
  cx.arc(0, 0, 5, 0, Math.PI * 2);
  cx.fill();

  cx.restore();
}

/**
 * Simple QR code visual (not a real QR — just decorative).
 * @param {CanvasRenderingContext2D} cx @param {number} x @param {number} y @param {number} size @param {number} elapsed
 */
function drawQRCode(cx, x, y, size, elapsed) {
  cx.save();
  const cell = size / 7;
  const pattern = [
    [1,1,1,0,1,0,1],
    [1,0,1,0,1,1,1],
    [1,1,1,0,0,0,1],
    [0,0,0,0,1,1,0],
    [1,0,0,1,1,0,1],
    [1,0,1,1,0,1,0],
    [1,1,0,0,1,0,1],
  ];

  // Scan line
  const scanY = y + ((elapsed * 0.03) % size);
  cx.fillStyle = '#FF760033';
  cx.fillRect(x, scanY, size, 2);

  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      if (pattern[row][col]) {
        cx.fillStyle = '#ffffffcc';
        cx.fillRect(x + col * cell + 1, y + row * cell + 1, cell - 2, cell - 2);
      }
    }
  }

  // Corner squares (QR finder patterns)
  for (const [fx, fy] of [[0,0],[4,0],[0,4]]) {
    cx.strokeStyle = '#FF7600';
    cx.lineWidth = 1;
    cx.strokeRect(x + fx * cell, y + fy * cell, 3 * cell, 3 * cell);
  }

  cx.restore();
}

/** @param {CanvasRenderingContext2D} cx @param {number} x @param {number} y @param {number} elapsed @param {boolean} active */
function drawPhone(cx, x, y, elapsed, active) {
  cx.save();
  cx.translate(x, y);
  // Slight tilt
  cx.rotate(-0.15 + Math.sin(elapsed * 0.0015) * 0.04);

  // Phone body
  cx.fillStyle = '#1a1828';
  cx.beginPath();
  roundRect(cx, -18, -38, 36, 72, 6);
  cx.fill();
  cx.strokeStyle = active ? '#FF7600' : '#3a3850';
  cx.lineWidth = 2;
  cx.stroke();

  // Screen
  cx.fillStyle = active ? '#1a0d00' : '#0d0d18';
  cx.beginPath();
  roundRect(cx, -14, -32, 28, 56, 4);
  cx.fill();

  if (active) {
    // TapIt app screen
    const appGlow = cx.createRadialGradient(0, 0, 2, 0, 0, 24);
    appGlow.addColorStop(0, '#FF760044');
    appGlow.addColorStop(1, '#00000000');
    cx.fillStyle = appGlow;
    cx.fillRect(-14, -32, 28, 56);

    cx.fillStyle = '#FF7600';
    cx.font = 'bold 7px ui-rounded, system-ui, sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('TapIt', 0, -8);

    // Check mark
    cx.strokeStyle = '#FF7600';
    cx.lineWidth = 2;
    cx.lineCap = 'round';
    cx.beginPath();
    cx.moveTo(-6, 4);
    cx.lineTo(-1, 10);
    cx.lineTo(8, -2);
    cx.stroke();
  } else {
    // Lock screen
    cx.fillStyle = '#3a3850';
    cx.font = '8px ui-rounded, system-ui, sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('12:00', 0, -4);
  }

  // Camera notch
  cx.fillStyle = '#0a0a14';
  cx.beginPath();
  cx.arc(0, -34, 3, 0, Math.PI * 2);
  cx.fill();

  cx.restore();
}

/** @param {CanvasRenderingContext2D} cx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
function roundRect(cx, x, y, w, h, r) {
  cx.moveTo(x + r, y);
  cx.lineTo(x + w - r, y);
  cx.arcTo(x + w, y, x + w, y + r, r);
  cx.lineTo(x + w, y + h - r);
  cx.arcTo(x + w, y + h, x + w - r, y + h, r);
  cx.lineTo(x + r, y + h);
  cx.arcTo(x, y + h, x, y + h - r, r);
  cx.lineTo(x, y + r);
  cx.arcTo(x, y, x + r, y, r);
}
