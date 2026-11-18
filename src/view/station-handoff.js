// @ts-check
/**
 * Checkpoint C — Customer handoff close-up canvas scene.
 * Shows the item sliding across the counter to the guest.
 * Progress is read from state.owner.action.ticksLeft / state.timing.handOver.
 */
/** @import { SimState } from '../sim/types.js' */

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
export function drawHandoffScene(cx, W, H, state, elapsed, _px, _py, _pressed) {
  const action = state.owner.action;
  const totalTicks = state.timing.handOver;
  const progress = action && action.kind === 'handOver'
    ? Math.max(0, 1 - action.ticksLeft / totalTicks)
    : 0;

  // ---- Background
  const bg = cx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fdf6ea');
  bg.addColorStop(1, '#f5e8cc');
  cx.fillStyle = bg;
  cx.fillRect(0, 0, W, H);

  // Warm lighting spot
  const glow = cx.createRadialGradient(W / 2, H * 0.4, 20, W / 2, H * 0.4, 180);
  glow.addColorStop(0, '#ffcc4422');
  glow.addColorStop(1, '#00000000');
  cx.fillStyle = glow;
  cx.fillRect(0, 0, W, H);

  // ---- Counter surface
  const counterY = H * 0.55;
  const counterGrad = cx.createLinearGradient(0, counterY, 0, H);
  counterGrad.addColorStop(0, '#c8b48a');
  counterGrad.addColorStop(0.3, '#b89a6a');
  counterGrad.addColorStop(1, '#a08050');
  cx.fillStyle = counterGrad;
  cx.fillRect(0, counterY, W, H - counterY);
  cx.strokeStyle = '#8a6840';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.moveTo(0, counterY);
  cx.lineTo(W, counterY);
  cx.stroke();

  // Counter wood grain lines
  cx.strokeStyle = '#00000012';
  cx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const lineY = counterY + 15 + i * 22;
    cx.beginPath();
    cx.moveTo(0, lineY);
    cx.lineTo(W, lineY + (Math.random() - 0.5) * 4);
    cx.stroke();
  }

  // ---- Determine what is being handed over
  const guestId = action?.claims?.guestId ?? null;
  const guest = guestId !== null ? state.guests.find((g) => g.id === guestId) : null;
  const spec = guest ? state.schedule.find((s) => s.id === guest.id) : null;
  const orderItem = spec?.order ?? 'latte';
  const isDrink = orderItem !== 'croissant';

  // ---- Slide item from left (owner side) to right (guest side) with progress
  const itemStartX = W * 0.15;
  const itemEndX = W * 0.72;
  const itemX = itemStartX + (itemEndX - itemStartX) * Math.min(1, progress * 1.3);
  const itemY = counterY - 32;
  const bob = Math.sin(elapsed * 0.005) * 3;

  cx.save();
  cx.translate(itemX, itemY + bob);
  if (isDrink) {
    drawCup(cx, orderItem);
  } else {
    drawPlate(cx);
  }
  cx.restore();

  // Shadow under item
  cx.save();
  cx.globalAlpha = 0.18;
  cx.fillStyle = '#000';
  cx.beginPath();
  cx.ellipse(itemX, counterY - 4, 24, 6, 0, 0, Math.PI * 2);
  cx.fill();
  cx.restore();

  // ---- Guest silhouette (right side, behind counter)
  const guestX = W * 0.78;
  const guestY = counterY - 20;
  drawGuest(cx, guestX, guestY, progress, elapsed);

  // ---- Owner hands (left side) — fades out as item moves away
  if (progress < 0.6) {
    cx.save();
    cx.globalAlpha = 1 - progress / 0.6;
    drawHands(cx, W * 0.1, counterY + 10, elapsed);
    cx.restore();
  }

  // ---- Completion sparkle
  if (progress >= 0.95) {
    const sparkAlpha = Math.min(1, (progress - 0.95) / 0.05);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + elapsed * 0.003;
      const r = 24 + Math.sin(elapsed * 0.008 + i) * 6;
      const sx = guestX + Math.cos(angle) * r;
      const sy = guestY - 40 + Math.sin(angle) * r;
      cx.save();
      cx.globalAlpha = sparkAlpha * 0.9;
      cx.fillStyle = i % 2 === 0 ? '#ffd020' : '#ff7020';
      cx.beginPath();
      cx.arc(sx, sy, 3, 0, Math.PI * 2);
      cx.fill();
      cx.restore();
    }
  }

  // ---- Progress bar
  const barX = 60, barY = H - 44, barW = W - 120, barH = 12;
  cx.fillStyle = '#00000022';
  cx.beginPath();
  roundRect(cx, barX, barY, barW, barH, 6);
  cx.fill();
  if (progress > 0) {
    const fillGrad = cx.createLinearGradient(barX, 0, barX + barW, 0);
    fillGrad.addColorStop(0, '#ff9930');
    fillGrad.addColorStop(1, '#ff6818');
    cx.fillStyle = fillGrad;
    cx.beginPath();
    roundRect(cx, barX, barY, barW * progress, barH, 6);
    cx.fill();
  }

  // ---- Title
  cx.fillStyle = '#3a2a18';
  cx.font = 'bold 15px ui-rounded, system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'top';
  cx.fillText('Handing over…', W / 2, 10);

  if (progress >= 1) {
    cx.fillStyle = '#c07020';
    cx.font = 'bold 18px ui-rounded, system-ui, sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('Enjoy!', W / 2, barY - 14);
  }

  cx.fillStyle = '#00000044';
  cx.font = '11px ui-rounded, system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'bottom';
  cx.fillText('Tap anywhere to dismiss', W / 2, H - 6);
}

/** @param {CanvasRenderingContext2D} cx @param {string} kind */
function drawCup(cx, kind) {
  // Cup body
  cx.fillStyle = '#fffcf5';
  cx.beginPath();
  cx.moveTo(-14, -28);
  cx.lineTo(-16, 0);
  cx.lineTo(16, 0);
  cx.lineTo(14, -28);
  cx.closePath();
  cx.fill();
  cx.strokeStyle = '#c8a870';
  cx.lineWidth = 1.5;
  cx.stroke();
  // Handle
  cx.beginPath();
  cx.arc(20, -14, 8, -Math.PI * 0.4, Math.PI * 0.4);
  cx.stroke();
  // Liquid fill
  const fillColor = kind === 'espresso' ? '#5a3010' : kind === 'mocha' ? '#7a4820' : '#c8905a';
  cx.fillStyle = fillColor;
  cx.beginPath();
  cx.moveTo(-12, -12);
  cx.lineTo(-14, 0);
  cx.lineTo(14, 0);
  cx.lineTo(12, -12);
  cx.closePath();
  cx.fill();
  // Foam for latte/mocha
  if (kind !== 'espresso') {
    cx.fillStyle = '#f5f0ea';
    cx.beginPath();
    cx.ellipse(0, -11, 11, 4, 0, 0, Math.PI * 2);
    cx.fill();
  }
  // Cup sleeve
  cx.fillStyle = '#ff7600';
  cx.fillRect(-15, -20, 30, 6);
}

/** @param {CanvasRenderingContext2D} cx */
function drawPlate(cx) {
  // Plate
  cx.fillStyle = '#fffcf0';
  cx.beginPath();
  cx.ellipse(0, 0, 32, 14, 0, 0, Math.PI * 2);
  cx.fill();
  cx.strokeStyle = '#c8b48a';
  cx.lineWidth = 1.5;
  cx.stroke();
  // Croissant
  cx.fillStyle = '#c8782a';
  cx.beginPath();
  cx.arc(-8, -6, 16, Math.PI * 0.7, Math.PI * 2.3);
  cx.arc(8, -6, 16, Math.PI * -0.3, Math.PI * 0.7);
  cx.closePath();
  cx.fill();
  cx.strokeStyle = '#a05818';
  cx.lineWidth = 1;
  cx.stroke();
}

/** @param {CanvasRenderingContext2D} cx @param {number} x @param {number} y @param {number} progress @param {number} elapsed */
function drawGuest(cx, x, y, progress, elapsed) {
  cx.save();
  cx.translate(x, y);

  // Body
  cx.fillStyle = '#5a4878';
  cx.beginPath();
  cx.ellipse(0, 30, 20, 30, 0, 0, Math.PI * 2);
  cx.fill();

  // Head
  cx.fillStyle = '#e8c8a0';
  cx.beginPath();
  cx.arc(0, -20, 22, 0, Math.PI * 2);
  cx.fill();

  // Face — neutral until item arrives
  const smile = Math.min(1, (progress - 0.6) / 0.4);
  if (smile > 0) {
    // Smile
    cx.strokeStyle = '#5a3010';
    cx.lineWidth = 2;
    cx.beginPath();
    cx.arc(0, -16, 10, 0, Math.PI * smile);
    cx.stroke();
    // Eyes happy (squint)
    cx.fillStyle = '#5a3010';
    cx.beginPath();
    cx.ellipse(-7, -24, 3, 2 * (1 - smile * 0.4), 0, 0, Math.PI * 2);
    cx.fill();
    cx.beginPath();
    cx.ellipse(7, -24, 3, 2 * (1 - smile * 0.4), 0, 0, Math.PI * 2);
    cx.fill();
  } else {
    // Neutral eyes
    cx.fillStyle = '#5a3010';
    cx.beginPath();
    cx.arc(-7, -24, 2.5, 0, Math.PI * 2);
    cx.fill();
    cx.beginPath();
    cx.arc(7, -24, 2.5, 0, Math.PI * 2);
    cx.fill();
  }

  // Reaching hand
  if (progress > 0.5) {
    const reach = Math.min(1, (progress - 0.5) / 0.5);
    cx.fillStyle = '#e8c8a0';
    cx.beginPath();
    cx.arc(-24 * reach, 10, 10, 0, Math.PI * 2);
    cx.fill();
  }

  cx.restore();
}

/** @param {CanvasRenderingContext2D} cx @param {number} x @param {number} y @param {number} elapsed */
function drawHands(cx, x, y, elapsed) {
  const bob = Math.sin(elapsed * 0.004) * 3;
  cx.fillStyle = '#e8c8a0';
  cx.beginPath();
  cx.arc(x, y + bob, 14, 0, Math.PI * 2);
  cx.fill();
  cx.beginPath();
  cx.arc(x + 20, y + bob + 4, 14, 0, Math.PI * 2);
  cx.fill();
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
