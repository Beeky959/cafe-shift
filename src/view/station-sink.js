// @ts-check
/**
 * Checkpoint A — Dishwashing close-up canvas scene.
 * Shows a sink with a dirty dish; the sponge follows the pointer and scrubs
 * when pressed. The sim remains authoritative: progress is read from
 * state.owner.action.ticksLeft / state.timing.washPerDish.
 */
/** @import { SimState } from '../sim/types.js' */

/** @typedef {{ x: number, y: number, life: number, r: number, vx: number, vy: number }} Bubble */

/** @type {Bubble[]} */
let bubbles = [];
let lastElapsed = -1;

/** Seed tiny bubbles so they don't all start at once. */
function initBubbles() {
  bubbles = [];
  for (let i = 0; i < 12; i++) {
    spawnBubble(Math.random() * 480, 260 + Math.random() * 60);
  }
}

/** @param {number} x @param {number} y */
function spawnBubble(x, y) {
  bubbles.push({
    x, y,
    life: 0.6 + Math.random() * 0.8,
    r: 3 + Math.random() * 7,
    vx: (Math.random() - 0.5) * 1.4,
    vy: -(0.6 + Math.random() * 1.2),
  });
}

/**
 * @param {CanvasRenderingContext2D} cx
 * @param {number} W
 * @param {number} H
 * @param {SimState} state
 * @param {number} elapsed ms since overlay opened
 * @param {number} px pointer x in logical units
 * @param {number} py pointer y in logical units
 * @param {boolean} pressed
 */
export function drawSinkScene(cx, W, H, state, elapsed, px, py, pressed) {
  if (elapsed < 1) initBubbles();

  const dt = elapsed - lastElapsed;
  lastElapsed = elapsed;

  // ---- background: tiled kitchen wall
  const bg = cx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#d4e8f0');
  bg.addColorStop(1, '#b8d4e0');
  cx.fillStyle = bg;
  cx.fillRect(0, 0, W, H);

  // Tile grid
  cx.strokeStyle = '#c0d8e888';
  cx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) {
    cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke();
  }

  // ---- sink basin
  const SX = 100, SY = 160, SW = 280, SH = 160;
  cx.save();
  // Sink surround / countertop
  cx.fillStyle = '#c8b89a';
  cx.beginPath();
  roundRect(cx, SX - 30, SY - 20, SW + 60, SH + 50, 12);
  cx.fill();
  cx.strokeStyle = '#a89070';
  cx.lineWidth = 2;
  cx.stroke();

  // Basin inside
  cx.fillStyle = '#e8f4f8';
  cx.beginPath();
  roundRect(cx, SX, SY, SW, SH, 8);
  cx.fill();

  // Water fill
  const waterLevel = 0.65;
  const wy = SY + SH * (1 - waterLevel);
  const waterGrad = cx.createLinearGradient(0, wy, 0, SY + SH);
  waterGrad.addColorStop(0, '#a8d8ea99');
  waterGrad.addColorStop(1, '#7ec8e3cc');
  cx.fillStyle = waterGrad;
  cx.beginPath();
  cx.rect(SX, wy, SW, SY + SH - wy);
  cx.fill();

  // Water ripple lines
  cx.strokeStyle = '#ffffff55';
  cx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const ry = wy + 15 + i * 22 + Math.sin(elapsed * 0.002 + i * 1.4) * 4;
    cx.beginPath();
    cx.moveTo(SX + 10, ry);
    cx.quadraticCurveTo(SX + SW * 0.5, ry + 6, SX + SW - 10, ry);
    cx.stroke();
  }

  // Drain
  cx.fillStyle = '#888';
  cx.beginPath();
  cx.arc(SX + SW / 2, SY + SH - 12, 8, 0, Math.PI * 2);
  cx.fill();
  cx.fillStyle = '#aaa';
  for (let i = 0; i < 3; i++) {
    cx.fillRect(SX + SW / 2 - 6 + i * 5, SY + SH - 16, 2, 8);
  }

  // ---- Faucet
  const FX = SX + SW * 0.5;
  cx.fillStyle = '#c8c8d4';
  cx.fillRect(FX - 4, SY - 40, 8, 40);
  cx.fillStyle = '#b0b0c0';
  cx.beginPath();
  cx.arc(FX, SY - 40, 10, 0, Math.PI * 2);
  cx.fill();
  // Faucet spout
  cx.fillStyle = '#c8c8d4';
  cx.beginPath();
  cx.moveTo(FX - 4, SY - 48);
  cx.lineTo(FX + 20, SY - 48);
  cx.lineTo(FX + 20, SY - 44);
  cx.lineTo(FX - 4, SY - 44);
  cx.fill();
  // Water stream
  cx.strokeStyle = '#7ec8e388';
  cx.lineWidth = 3;
  cx.setLineDash([6, 4]);
  cx.lineDashOffset = -(elapsed * 0.08) % 10;
  cx.beginPath();
  cx.moveTo(FX + 20, SY - 44);
  cx.lineTo(FX + 20, wy + 4);
  cx.stroke();
  cx.setLineDash([]);
  cx.lineDashOffset = 0;

  cx.restore();

  // ---- Dirty dish in the sink
  const action = state.owner.action;
  const totalTicks = state.timing.washPerDish;
  const progress = action && action.kind === 'wash'
    ? Math.max(0, 1 - action.ticksLeft / totalTicks)
    : (action ? 1 : 0);

  const dishX = SX + SW * 0.5;
  const dishY = SY + SH * 0.6;

  // Plate
  cx.save();
  cx.translate(dishX, dishY);
  const plateGrad = cx.createRadialGradient(0, -4, 2, 0, 0, 44);
  plateGrad.addColorStop(0, '#fffcf5');
  plateGrad.addColorStop(1, '#e8dcc8');
  cx.fillStyle = plateGrad;
  cx.beginPath();
  cx.ellipse(0, 0, 44, 20, 0, 0, Math.PI * 2);
  cx.fill();
  cx.strokeStyle = '#c8b48a';
  cx.lineWidth = 1.5;
  cx.stroke();

  // Dirt stain — fades as progress increases
  if (progress < 1) {
    const dirtyAlpha = (1 - progress) * 0.75;
    cx.globalAlpha = dirtyAlpha;
    cx.fillStyle = '#8b6a3a';
    cx.beginPath();
    cx.ellipse(-6, -2, 14, 7, 0.4, 0, Math.PI * 2);
    cx.fill();
    cx.beginPath();
    cx.ellipse(10, 3, 8, 4, -0.3, 0, Math.PI * 2);
    cx.fill();
    cx.globalAlpha = 1;
  }
  cx.restore();

  // ---- Bubbles / foam
  if (pressed && dt > 0) {
    const spawnRate = 2;
    if (Math.random() < spawnRate * dt / 50) {
      const nx = px + (Math.random() - 0.5) * 30;
      const ny = py + (Math.random() - 0.5) * 20;
      if (nx > SX && nx < SX + SW && ny > wy && ny < SY + SH) {
        spawnBubble(nx, ny);
      }
    }
  }

  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (dt > 0) {
      b.x += b.vx;
      b.y += b.vy;
      b.life -= dt / 1800;
    }
    if (b.life <= 0 || b.y < wy) {
      bubbles.splice(i, 1);
      continue;
    }
    cx.save();
    cx.globalAlpha = Math.min(b.life, 0.6);
    cx.fillStyle = '#ffffffcc';
    cx.strokeStyle = '#7ec8e388';
    cx.lineWidth = 1;
    cx.beginPath();
    cx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    cx.fill();
    cx.stroke();
    cx.restore();
  }

  // Refill background idle bubbles
  if (bubbles.length < 8) spawnBubble(SX + 20 + Math.random() * (SW - 40), wy + 10 + Math.random() * 50);

  // ---- Sponge (follows pointer, yellow-orange)
  const spongeInSink = px > SX && px < SX + SW && py > wy - 20 && py < SY + SH - 10;
  if (spongeInSink || (elapsed > 0 && !pressed)) {
    const sx = pressed ? px : SX + SW * 0.72;
    const sy = pressed ? Math.max(wy, py) : dishY - 10;
    cx.save();
    cx.translate(sx, sy);
    if (pressed) {
      cx.rotate(Math.sin(elapsed * 0.012) * 0.3);
    }
    // Sponge body
    cx.fillStyle = pressed ? '#f0a020' : '#f5b830';
    cx.beginPath();
    roundRect(cx, -18, -10, 36, 20, 6);
    cx.fill();
    // Sponge texture lines
    cx.strokeStyle = '#c87800';
    cx.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      cx.beginPath();
      cx.moveTo(-12 + i * 10, -6);
      cx.lineTo(-12 + i * 10, 6);
      cx.stroke();
    }
    cx.restore();
  }

  // ---- Progress bar
  const barX = SX, barY = SY + SH + 28, barW = SW, barH = 14;
  cx.fillStyle = '#00000022';
  cx.beginPath();
  roundRect(cx, barX, barY, barW, barH, 7);
  cx.fill();

  const fillW = barW * progress;
  if (fillW > 0) {
    const fillGrad = cx.createLinearGradient(barX, 0, barX + barW, 0);
    fillGrad.addColorStop(0, '#5ac85a');
    fillGrad.addColorStop(1, '#38b838');
    cx.fillStyle = fillGrad;
    cx.beginPath();
    roundRect(cx, barX, barY, fillW, barH, 7);
    cx.fill();
  }

  // ---- Label
  cx.fillStyle = '#2a3a4a';
  cx.font = 'bold 15px ui-rounded, system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'bottom';
  cx.fillText('Scrub that dish!', W / 2, SY - 32);

  if (progress >= 1) {
    cx.fillStyle = '#3a9a3a';
    cx.font = 'bold 20px ui-rounded, system-ui, sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('Done!', W / 2, barY + barH + 20);
  } else {
    const pct = Math.round(progress * 100);
    cx.fillStyle = '#446688';
    cx.font = '12px ui-rounded, system-ui, sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(`${pct}%`, W / 2, barY + barH + 16);
  }

  // ---- Close hint
  cx.fillStyle = '#00000044';
  cx.font = '11px ui-rounded, system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'bottom';
  cx.fillText('Tap anywhere to dismiss', W / 2, H - 6);
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
