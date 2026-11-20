// @ts-check
/**
 * Checkpoint B — Pastry preparation close-up canvas scene.
 * Shows the oven loading dough or unloading a baked pastry.
 * Progress is read from state.owner.action.ticksLeft / state.timing.bakeLoad|bakeUnload.
 */
/** @import { SimState } from '../sim/types.js' */

/** @typedef {{ x: number, y: number, life: number, r: number }} Steam */
/** @type {Steam[]} */
let steams = [];

function initSteams() { steams = []; }

/** @param {number} x @param {number} y */
function spawnSteam(x, y) {
  steams.push({ x: x + (Math.random() - 0.5) * 10, y, life: 1, r: 4 + Math.random() * 6 });
}

/**
 * @param {CanvasRenderingContext2D} cx
 * @param {number} W
 * @param {number} H
 * @param {SimState} state
 * @param {number} elapsed ms since overlay opened
 * @param {number} _px pointer x
 * @param {number} _py pointer y
 * @param {boolean} _pressed
 */
export function drawOvenScene(cx, W, H, state, elapsed, _px, _py, _pressed) {
  if (elapsed < 1) initSteams();

  const action = state.owner.action;
  const isUnload = action?.kind === 'bakeUnload';
  const totalTicks = isUnload ? state.timing.bakeUnload : state.timing.bakeLoad;
  const progress = action && (action.kind === 'bakeLoad' || action.kind === 'bakeUnload')
    ? Math.max(0, 1 - action.ticksLeft / totalTicks)
    : 0;

  // ---- Background: warm kitchen
  const bg = cx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f5e8cc');
  bg.addColorStop(1, '#e8d0a8');
  cx.fillStyle = bg;
  cx.fillRect(0, 0, W, H);

  // Tile backsplash
  cx.strokeStyle = '#d8c09888';
  cx.lineWidth = 1;
  for (let x = 0; x <= W; x += 50) {
    cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H * 0.55); cx.stroke();
  }
  for (let y = 0; y <= H * 0.55; y += 50) {
    cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke();
  }

  // ---- Oven body
  const OX = 80, OY = 60, OW = 320, OH = 220;

  // Oven cabinet
  cx.fillStyle = '#5a5260';
  cx.beginPath();
  roundRect(cx, OX, OY, OW, OH, 10);
  cx.fill();

  // Oven inner glow (warm when baking)
  const ovenState = state.oven.state;
  const innerGlow = ovenState === 'baking' ? '#ff9a2088' : (ovenState === 'ready' ? '#ff700044' : '#00000033');
  cx.fillStyle = innerGlow;
  cx.beginPath();
  roundRect(cx, OX + 20, OY + 20, OW - 40, OH - 60, 8);
  cx.fill();

  // Oven window
  const WX = OX + 20, WY = OY + 20, WW = OW - 40, WH = OH - 60;
  const windowGrad = cx.createLinearGradient(WX, WY, WX, WY + WH);
  if (ovenState === 'baking') {
    windowGrad.addColorStop(0, '#1a0d0022');
    windowGrad.addColorStop(0.5, '#ff7a0066');
    windowGrad.addColorStop(1, '#ff5a0044');
  } else {
    windowGrad.addColorStop(0, '#1a1a2244');
    windowGrad.addColorStop(1, '#2a2a3844');
  }
  cx.fillStyle = windowGrad;
  cx.beginPath();
  roundRect(cx, WX, WY, WW, WH, 6);
  cx.fill();

  // Window frame
  cx.strokeStyle = '#8a8098';
  cx.lineWidth = 3;
  cx.beginPath();
  roundRect(cx, WX, WY, WW, WH, 6);
  cx.stroke();

  // Window reflection
  cx.fillStyle = '#ffffff18';
  cx.beginPath();
  cx.moveTo(WX + 8, WY + 6);
  cx.lineTo(WX + 28, WY + 6);
  cx.lineTo(WX + 18, WY + 20);
  cx.lineTo(WX + 6, WY + 20);
  cx.closePath();
  cx.fill();

  // ---- Pastry / dough inside the oven
  const pastryX = OX + OW / 2;
  const pastryY = OY + OH / 2 - 10;

  if (isUnload && progress > 0.1 || ovenState === 'ready') {
    // Baked golden croissant
    drawCroissant(cx, pastryX, pastryY, true, elapsed);
  } else if (!isUnload) {
    // Raw dough being loaded — fades in with progress
    cx.save();
    cx.globalAlpha = 0.3 + progress * 0.7;
    drawDough(cx, pastryX, pastryY, elapsed);
    cx.restore();
  }

  // ---- Oven rack
  cx.strokeStyle = '#7a7090';
  cx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const rx = WX + 10 + i * (WW - 20) / 4;
    cx.beginPath(); cx.moveTo(rx, WY + WH * 0.7); cx.lineTo(rx, WY + WH); cx.stroke();
  }
  cx.beginPath();
  cx.moveTo(WX + 10, WY + WH * 0.75);
  cx.lineTo(WX + WW - 10, WY + WH * 0.75);
  cx.stroke();

  // ---- Oven door handle
  cx.fillStyle = '#c8c0d8';
  cx.beginPath();
  roundRect(cx, OX + OW * 0.2, OY + OH - 32, OW * 0.6, 14, 7);
  cx.fill();
  cx.strokeStyle = '#a898b8';
  cx.lineWidth = 1;
  cx.stroke();

  // ---- Steam (when baking or unloading)
  if (ovenState === 'baking' || (isUnload && progress < 0.7)) {
    if (elapsed % 120 < 60) {
      spawnSteam(pastryX + (Math.random() - 0.5) * 40, WY + 20);
    }
  }
  for (let i = steams.length - 1; i >= 0; i--) {
    const s = steams[i];
    s.y -= 1.2;
    s.life -= 0.012;
    s.x += (Math.random() - 0.5) * 0.5;
    if (s.life <= 0) { steams.splice(i, 1); continue; }
    cx.globalAlpha = s.life * 0.4;
    cx.fillStyle = '#ffffff';
    cx.beginPath();
    cx.arc(s.x, s.y, s.r * (1 + (1 - s.life) * 0.8), 0, Math.PI * 2);
    cx.fill();
    cx.globalAlpha = 1;
  }

  // ---- Progress bar
  const barX = OX, barY = OY + OH + 20, barW = OW, barH = 14;
  cx.fillStyle = '#00000022';
  cx.beginPath();
  roundRect(cx, barX, barY, barW, barH, 7);
  cx.fill();
  if (progress > 0) {
    const fillGrad = cx.createLinearGradient(barX, 0, barX + barW, 0);
    fillGrad.addColorStop(0, isUnload ? '#f0a030' : '#7cbb5a');
    fillGrad.addColorStop(1, isUnload ? '#c87020' : '#5a9a3a');
    cx.fillStyle = fillGrad;
    cx.beginPath();
    roundRect(cx, barX, barY, barW * progress, barH, 7);
    cx.fill();
  }

  // ---- Labels
  cx.fillStyle = '#3a2a1a';
  cx.font = 'bold 15px ui-rounded, system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'bottom';
  const label = isUnload ? 'Collecting pastries…' : 'Loading the oven…';
  cx.fillText(label, OX + OW / 2, OY - 8);

  if (progress >= 1) {
    cx.fillStyle = isUnload ? '#c07020' : '#3a8a3a';
    cx.font = 'bold 18px ui-rounded, system-ui, sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(isUnload ? 'Pastries collected!' : 'Loaded!', OX + OW / 2, barY + barH + 20);
  }

  // Oven state chip (top-right)
  const ovenLabel = ovenState === 'baking' ? `Baking… ${state.oven.ticksLeft}t` : ovenState === 'ready' ? 'Ready to collect!' : 'Empty';
  cx.fillStyle = ovenState === 'ready' ? '#3a8a3a' : ovenState === 'baking' ? '#c06010' : '#888';
  cx.font = '11px ui-rounded, system-ui, sans-serif';
  cx.textAlign = 'right';
  cx.textBaseline = 'top';
  cx.fillText(ovenLabel, OX + OW - 2, OY + 4);

  cx.fillStyle = '#00000044';
  cx.font = '11px ui-rounded, system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'bottom';
  cx.fillText('Tap anywhere to dismiss', W / 2, H - 6);
}

/** @param {CanvasRenderingContext2D} cx @param {number} x @param {number} y @param {number} elapsed */
function drawDough(cx, x, y, elapsed) {
  // Simple round blob of dough
  const wobble = Math.sin(elapsed * 0.004) * 2;
  cx.fillStyle = '#f0dca8';
  cx.beginPath();
  cx.ellipse(x, y, 36 + wobble, 20, 0, 0, Math.PI * 2);
  cx.fill();
  cx.strokeStyle = '#c8a870';
  cx.lineWidth = 1.5;
  cx.stroke();
  // Surface lines
  cx.strokeStyle = '#d8b880';
  cx.lineWidth = 1;
  cx.beginPath();
  cx.moveTo(x - 18, y - 4);
  cx.quadraticCurveTo(x, y - 8, x + 18, y - 4);
  cx.stroke();
}

/**
 * Draw a croissant shape.
 * @param {CanvasRenderingContext2D} cx @param {number} x @param {number} y
 * @param {boolean} baked @param {number} elapsed
 */
function drawCroissant(cx, x, y, baked, elapsed) {
  cx.save();
  cx.translate(x, y);
  const bob = Math.sin(elapsed * 0.003) * 2;
  cx.translate(0, bob);

  const fill = baked ? '#c8782a' : '#f0c880';
  const stroke = baked ? '#a05818' : '#c8a060';

  // Croissant arc shape
  cx.fillStyle = fill;
  cx.beginPath();
  cx.arc(-16, 0, 24, Math.PI * 0.75, Math.PI * 2.25);
  cx.arc(16, 0, 24, Math.PI * -0.25, Math.PI * 0.75);
  cx.closePath();
  cx.fill();
  cx.strokeStyle = stroke;
  cx.lineWidth = 1.5;
  cx.stroke();

  // Highlight
  if (baked) {
    cx.fillStyle = '#e09040';
    cx.beginPath();
    cx.ellipse(-6, -4, 10, 4, -0.4, 0, Math.PI * 2);
    cx.fill();
  }
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
