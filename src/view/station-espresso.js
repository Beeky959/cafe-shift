// @ts-check
/**
 * Espresso extraction close-up — the hero mini-game ported as a station overlay.
 * Hold the pull button to advance the needle; release in the perfect zone for
 * a perfect shot. The result is cosmetic only (doesn't change the sim outcome).
 *
 * Designed for W=480, H=400 overlay canvas.
 */

/** @typedef {CanvasRenderingContext2D} Ctx */

// ── Extraction zones (0–1 fraction of gauge track)
const EX = { wkEnd: 0.26, okLoEnd: 0.38, pfEnd: 0.62, okHiEnd: 0.74 };

/** @param {number} n @returns {'weak'|'ok'|'perfect'|'bitter'} */
function gradeEx(n) {
  if (n < EX.wkEnd) return 'weak';
  if (n < EX.okLoEnd) return 'ok';
  if (n <= EX.pfEnd) return 'perfect';
  if (n <= EX.okHiEnd) return 'ok';
  return 'bitter';
}

// ── Color palette
const P = {
  bg0: '#1a0f05', bg1: '#2d1a0a',
  mBody: '#7a6858', mBodyHi: '#9a8878', mPanel: '#524040', mDark: '#2a1818',
  mSilv: '#b0a898', mSilvHi: '#d0c8b8', mSilvSh: '#706858',
  cup: '#fffaf0', cupEdge: '#d0c0a0', cupHi: '#ffffff',
  espD: '#1a0800', espM: '#3c1a08', espPour: '#885030',
  crema: '#d49020', cremaHi: '#f0c060',
  saucer: '#e8dcc8',
  gaugeWk: '#e06040', gaugeOk: '#d4c040', gaugePf: '#40c060', gaugeBt: '#a02020',
  needleTk: '#ffffff',
  steam0: 'rgba(220,200,180,',
  pullOn: '#c05020', pullHold: '#ff8040', pullOff: '#6a5040', pullDone: '#3a7050',
  pullTxt: '#fff5e0',
  ledG: '#40e060', ledA: '#f0a020', ledR: '#e04040',
  txtF: 'rgba(255,235,200,0.9)',
};

// ── Layout constants (all in overlay logical units 480×400)
const MX = 86, MY = 14, MW = 308, MH = 160; // machine body
const GHX = 240, GHY = 170;                  // group head center
const SY = 196, SL = 220, SR = 260;          // spout y, left x, right x
const CUP_BASE_Y = 262;                       // cup bottom y
const GX = 24, GY = 296, GW = 432, GH = 18;  // gauge track
const BTN = { x: 240, y: 353, r: 40 };       // pull button

// ── Module-level mini-game state (singleton, reset on each open)
/** @type {'ready'|'pulling'|'done'|'result'} */
let phase = 'ready';
let needle = 0;         // 0..1 extraction position
let phaseT = 0;         // seconds since phase start
let cupFill = 0;        // animated fill fraction 0..1
let cupFillTarget = 0;
let cupCrema = 0;       // animated crema fraction 0..1
let cupCremaTarget = 0;
let flashAlpha = 0;
let flashColor = '#ffffff';
let flashTxt = '';
/** @type {'weak'|'ok'|'perfect'|'bitter'|''} */
let grade = '';
let lastElapsedMs = 0;
/** @type {{ x: number, y: number, vx: number, vy: number, r: number, alpha: number, life: number, maxLife: number }[]} */
let steam = [];
let steamTimer = 0;
let streamAlpha = 0;
let resultDone = false;

/** Reset all state for a fresh extraction. Call when the overlay opens. */
export function resetEspresso() {
  phase = 'ready';
  needle = 0;
  phaseT = 0;
  cupFill = 0; cupFillTarget = 0;
  cupCrema = 0; cupCremaTarget = 0;
  flashAlpha = 0;
  grade = '';
  lastElapsedMs = 0;
  steam = [];
  steamTimer = 0;
  streamAlpha = 0;
  resultDone = false;
}

/** True after the player has released the lever and the result has been shown. */
export function espressoDone() { return resultDone; }

// ── Helpers

/** @param {Ctx} cx @param {number} x @param {number} y @param {number} r @param {string|CanvasGradient} fill @param {string|null} stroke @param {number} [lw] */
function circle(cx, x, y, r, fill, stroke, lw = 1) {
  cx.beginPath();
  cx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { cx.fillStyle = fill; cx.fill(); }
  if (stroke) { cx.strokeStyle = stroke; cx.lineWidth = lw; cx.stroke(); }
}

/** @param {Ctx} cx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r @param {string|CanvasGradient|null} fill @param {string|null} stroke @param {number} [lw] */
function roundRect(cx, x, y, w, h, r, fill, stroke, lw = 1) {
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.lineTo(x + w - r, y); cx.arcTo(x + w, y, x + w, y + r, r);
  cx.lineTo(x + w, y + h - r); cx.arcTo(x + w, y + h, x + w - r, y + h, r);
  cx.lineTo(x + r, y + h); cx.arcTo(x, y + h, x, y + h - r, r);
  cx.lineTo(x, y + r); cx.arcTo(x, y, x + r, y, r);
  cx.closePath();
  if (fill) { cx.fillStyle = fill; cx.fill(); }
  if (stroke) { cx.strokeStyle = stroke; cx.lineWidth = lw; cx.stroke(); }
}

/** Linear gradient helper */
function grd(cx, x0, y0, x1, y1, stops) {
  const g = cx.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

/** Radial gradient helper */
function rgrd(cx, x, y, r0, r1, stops) {
  const g = cx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

/** @returns {{ x:number,y:number,vx:number,vy:number,r:number,alpha:number,life:number,maxLife:number }} */
function mkSteam() {
  const life = 1.0 + Math.random() * 0.8;
  return {
    x: 0, y: 0,
    vx: -4 + Math.random() * 8,
    vy: -18 - Math.random() * 14,
    r: 3 + Math.random() * 4,
    alpha: 0,
    life, maxLife: life,
  };
}

// ── Draw: background
function drawBg(cx, W, H) {
  cx.fillStyle = grd(cx, 0, 0, 0, H, [[0, P.bg0], [1, P.bg1]]);
  cx.fillRect(0, 0, W, H);
  // Subtle vignette
  const vig = cx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  cx.fillStyle = vig;
  cx.fillRect(0, 0, W, H);
}

// ── Draw: espresso machine (compact version for 480×400)
function drawMachine(cx, elapsed) {
  // Main body
  roundRect(cx, MX, MY, MW, MH, 12,
    grd(cx, MX, MY, MX + MW, MY + MH, [[0, P.mBodyHi], [0.4, P.mBody], [1, P.mDark]]),
    P.mDark, 2);

  // Top chrome strip
  roundRect(cx, MX + 8, MY + 6, MW - 16, 18, 4,
    grd(cx, MX, MY + 6, MX, MY + 24, [[0, P.mSilvHi], [1, P.mSilv]]),
    P.mSilvSh, 1);

  // Brand text
  cx.fillStyle = 'rgba(255,245,220,0.5)';
  cx.font = 'bold 11px system-ui';
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText('PAVONA', MX + MW / 2, MY + 14);

  // Control panel (right side)
  const PX = MX + MW - 72, PY = MY + 32, PW = 60, PH = 110;
  roundRect(cx, PX, PY, PW, PH, 6, P.mPanel, P.mDark, 1.5);

  // Shot buttons
  const btn1y = PY + 24;
  circle(cx, PX + PW / 2, btn1y, 14,
    grd(cx, PX + PW / 2 - 14, btn1y - 14, PX + PW / 2 + 14, btn1y + 14,
      [[0, '#7a6050'], [1, P.mPanel]]),
    P.mDark, 1.5);
  cx.fillStyle = P.pullTxt; cx.font = 'bold 8px system-ui';
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText('1×', PX + PW / 2, btn1y);

  const btn2y = PY + 56;
  circle(cx, PX + PW / 2, btn2y, 14,
    grd(cx, PX + PW / 2 - 14, btn2y - 14, PX + PW / 2 + 14, btn2y + 14,
      [[0, '#7a6050'], [1, P.mPanel]]),
    P.mDark, 1.5);
  cx.fillStyle = P.pullTxt; cx.font = 'bold 8px system-ui';
  cx.fillText('2×', PX + PW / 2, btn2y);

  // Status LED
  const ledColor = phase === 'pulling' ? P.ledA : phase === 'done' || phase === 'result' ? P.ledG : P.ledG;
  const pulse = 0.7 + Math.sin(elapsed * 4) * 0.3;
  circle(cx, PX + PW / 2, PY + 86, 5, ledColor, 'rgba(0,0,0,0.3)', 1);
  cx.save(); cx.globalAlpha = pulse * 0.4;
  circle(cx, PX + PW / 2, PY + 86, 9, ledColor, null, 0);
  cx.restore();

  // Decorative pressure gauge
  const GCX = MX + 50, GCY = MY + 72, GR = 30;
  const silverGrd = rgrd(cx, GCX, GCY, 0, GR + 3, [[0, P.mSilvHi], [0.6, P.mSilv], [1, P.mSilvSh]]);
  circle(cx, GCX, GCY, GR + 3, silverGrd, null, 0);
  circle(cx, GCX, GCY, GR,
    grd(cx, GCX - GR, GCY - GR, GCX + GR, GCY + GR, [[0, '#fff8f0'], [1, '#f0e8d8']]),
    P.mSilv, 1);
  // Tick marks
  cx.strokeStyle = P.mDark; cx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI * 0.75 + i * (Math.PI * 1.5 / 8);
    const r0 = i % 4 === 0 ? GR - 8 : GR - 6;
    cx.beginPath();
    cx.moveTo(GCX + Math.cos(a) * r0, GCY + Math.sin(a) * r0);
    cx.lineTo(GCX + Math.cos(a) * (GR - 2), GCY + Math.sin(a) * (GR - 2));
    cx.stroke();
  }
  // Green zone
  cx.strokeStyle = 'rgba(60,160,80,0.5)'; cx.lineWidth = 4; cx.lineCap = 'round';
  cx.beginPath();
  cx.arc(GCX, GCY, GR - 7, -Math.PI * 0.75 + 5 * (Math.PI * 1.5 / 8), -Math.PI * 0.75 + 8 * (Math.PI * 1.5 / 8));
  cx.stroke();
  // Gauge needle (tracks extraction needle)
  const na = -Math.PI * 0.75 + needle * (Math.PI * 1.5);
  cx.save();
  cx.strokeStyle = '#c03020'; cx.lineWidth = 1.5; cx.lineCap = 'round';
  cx.beginPath();
  cx.moveTo(GCX - Math.cos(na) * 5, GCY - Math.sin(na) * 5);
  cx.lineTo(GCX + Math.cos(na) * (GR - 10), GCY + Math.sin(na) * (GR - 10));
  cx.stroke();
  cx.restore();
  circle(cx, GCX, GCY, 3, P.mSilv, P.mSilvSh, 1);
  cx.fillStyle = P.mDark; cx.font = '7px system-ui'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText('BAR', GCX, GCY + 12);

  // Group head
  const chrGrd = rgrd(cx, GHX, GHY, 0, 36, [[0, P.mSilvHi], [0.5, P.mSilv], [1, P.mSilvSh]]);
  circle(cx, GHX, GHY, 34, chrGrd, P.mSilvSh, 2);
  circle(cx, GHX, GHY, 26, 'rgba(50,30,10,0.15)', null, 0);

  // Portafilter
  roundRect(cx, GHX - 30, GHY + 6, 60, 18, 6,
    grd(cx, GHX - 30, GHY + 6, GHX + 30, GHY + 24, [[0, '#5a4030'], [1, P.mDark]]),
    P.mDark, 1.5);
  // Handle
  cx.save(); cx.translate(GHX + 28, GHY + 14); cx.rotate(0.25);
  roundRect(cx, -4, -4, 42, 8, 4,
    grd(cx, -4, 0, 38, 0, [[0, '#5a4030'], [1, P.mDark]]),
    P.mDark, 1.5);
  cx.restore();

  // Spout holes
  circle(cx, SL, SY + 14, 3.5, 'rgba(20,8,0,0.9)', P.mDark, 1);
  circle(cx, SR, SY + 14, 3.5, 'rgba(20,8,0,0.9)', P.mDark, 1);

  // Steam wand (right side of machine)
  cx.save();
  cx.strokeStyle = P.mSilv; cx.lineWidth = 6; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(MX + MW - 10, MY + 30); cx.bezierCurveTo(MX + MW + 8, MY + 40, MX + MW + 12, MY + 90, MX + MW + 6, MY + 130); cx.stroke();
  cx.strokeStyle = P.mSilvHi; cx.lineWidth = 3;
  cx.beginPath(); cx.moveTo(MX + MW - 10, MY + 30); cx.bezierCurveTo(MX + MW + 8, MY + 40, MX + MW + 12, MY + 90, MX + MW + 6, MY + 130); cx.stroke();
  circle(cx, MX + MW + 6, MY + 132, 5, P.mSilv, P.mSilvSh, 1.5);
  cx.restore();
}

// ── Draw: coffee stream (from spouts to cup)
function drawStream(cx, elapsed) {
  if (streamAlpha <= 0) return;
  const ch = 42;
  const cupTop = CUP_BASE_Y - ch + 6;
  const alpha = streamAlpha;
  const r = needle < 0.3 ? lerp(180, 80, needle / 0.3) : needle < 0.7 ? lerp(80, 30, (needle - 0.3) / 0.4) : 30;
  const g = needle < 0.3 ? lerp(100, 40, needle / 0.3) : needle < 0.7 ? lerp(40, 15, (needle - 0.3) / 0.4) : 15;
  const streamColor = `rgba(${Math.round(r)},${Math.round(g)},0,${alpha})`;

  cx.save();
  cx.strokeStyle = streamColor;
  cx.lineWidth = 2 + needle * 2;
  cx.lineCap = 'round';
  cx.beginPath();
  cx.moveTo(SL, SY + 14);
  cx.bezierCurveTo(SL - 2, SY + 20, 240 - 8 + Math.sin(elapsed * 12) * 2, cupTop - 8, 240 - 9, cupTop);
  cx.stroke();
  cx.beginPath();
  cx.moveTo(SR, SY + 14);
  cx.bezierCurveTo(SR + 2, SY + 20, 240 + 8 + Math.sin(elapsed * 12 + 1) * 2, cupTop - 8, 240 + 9, cupTop);
  cx.stroke();
  cx.restore();
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ── Draw: cup with fill + crema
function drawCup(cx) {
  const cw = 52, ch = 42;
  const cx_ = 240;
  const cy_ = CUP_BASE_Y - ch;

  // Saucer
  cx.fillStyle = grd(cx, cx_ - 42, cy_ + ch, cx_ + 42, cy_ + ch + 8,
    [[0, P.saucer], [1, '#e0d0bc']]);
  cx.beginPath();
  cx.ellipse(cx_, cy_ + ch + 4, 40, 8, 0, 0, Math.PI * 2);
  cx.fill();
  cx.strokeStyle = 'rgba(180,150,110,0.6)'; cx.lineWidth = 1; cx.stroke();

  // Coffee fill
  if (cupFill > 0) {
    const fillH = Math.min(cupFill * (ch - 7), ch - 7);
    const coffeeY = cy_ + ch - 3 - fillH;
    cx.save();
    cx.beginPath(); cx.rect(cx_ - cw / 2 + 3, cy_ + 3, cw - 6, ch - 6); cx.clip();
    cx.fillStyle = grd(cx, cx_ - cw / 2 + 3, coffeeY, cx_ + cw / 2 - 3, cy_ + ch - 3,
      [[0, P.espD], [0.6, P.espM], [1, P.espPour]]);
    cx.beginPath();
    cx.rect(cx_ - cw / 2 + 3, coffeeY, cw - 6, fillH + 1);
    cx.fill();
    cx.restore();
  }

  // Crema layer
  if (cupCrema > 0 && cupFill > 0.1) {
    const cremaH = Math.min(cupCrema * 9, 9);
    const fillH = cupFill * (ch - 7);
    const coffeeY = cy_ + ch - 3 - fillH;
    cx.save();
    cx.beginPath(); cx.rect(cx_ - cw / 2 + 3, cy_ + 3, cw - 6, ch - 6); cx.clip();
    cx.fillStyle = P.crema;
    cx.beginPath(); cx.rect(cx_ - cw / 2 + 3, coffeeY - cremaH, cw - 6, cremaH + 2); cx.fill();
    cx.fillStyle = P.cremaHi;
    for (let i = 0; i < 6; i++) {
      const bx = cx_ - cw / 2 + 7 + Math.sin(i * 2.1) * 14 + Math.cos(i * 2.9) * 8;
      const by = coffeeY - cremaH / 2 + Math.sin(i * 3.2) * 2;
      circle(cx, bx, by, 1.2 + Math.sin(i) * 0.6, P.cremaHi, null, 0);
    }
    cx.restore();
  }

  // Cup body
  roundRect(cx, cx_ - cw / 2, cy_, cw, ch, 8, null,
    grd(cx, cx_ - cw / 2, cy_, cx_ + cw / 2, cy_ + ch,
      [[0, P.cupHi], [0.4, P.cup], [1, P.cupEdge]]), 2.5);

  // Rim highlight
  cx.strokeStyle = 'rgba(255,250,245,0.8)'; cx.lineWidth = 1.5;
  cx.beginPath(); cx.moveTo(cx_ - cw / 2 + 8, cy_); cx.lineTo(cx_ + cw / 2 - 8, cy_); cx.stroke();

  // Handle
  cx.strokeStyle = P.cupEdge; cx.lineWidth = 2.5; cx.lineCap = 'round';
  cx.beginPath();
  cx.moveTo(cx_ + cw / 2 - 2, cy_ + ch * 0.3);
  cx.bezierCurveTo(cx_ + cw / 2 + 13, cy_ + ch * 0.3, cx_ + cw / 2 + 13, cy_ + ch * 0.7, cx_ + cw / 2 - 2, cy_ + ch * 0.7);
  cx.stroke();
}

// ── Draw: steam particles
function drawSteam(cx) {
  for (const p of steam) {
    if (p.alpha <= 0) continue;
    cx.save();
    cx.globalAlpha = p.alpha * 0.65;
    cx.fillStyle = P.steam0 + (p.alpha * 0.65).toFixed(2) + ')';
    cx.shadowColor = P.steam0 + '0.2)'; cx.shadowBlur = 6;
    cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI * 2); cx.fill();
    cx.restore();
  }
}

// ── Draw: extraction gauge
function drawGauge(cx, elapsed) {
  // Track
  roundRect(cx, GX, GY, GW, GH, GH / 2, 'rgba(30,15,5,0.4)', null, 0);

  // Zone fills
  const zones = [
    [EX.wkEnd, P.gaugeWk], [EX.okLoEnd, P.gaugeOk], [EX.pfEnd, P.gaugePf],
    [EX.okHiEnd, P.gaugeOk], [1, P.gaugeBt],
  ];
  let prev = 0;
  for (const [end, color] of zones) {
    cx.fillStyle = color + 'aa';
    cx.beginPath();
    cx.rect(GX + prev * GW, GY, (end - prev) * GW, GH);
    cx.fill();
    prev = end;
  }

  // Perfect zone pulse glow
  cx.save();
  cx.globalAlpha = 0.35 + Math.sin(elapsed * 5) * 0.15;
  cx.fillStyle = P.gaugePf + '55';
  cx.fillRect(GX + EX.okLoEnd * GW, GY, (EX.pfEnd - EX.okLoEnd) * GW, GH);
  cx.restore();

  // Track border
  roundRect(cx, GX, GY, GW, GH, GH / 2, null, 'rgba(255,230,180,0.3)', 1.5);

  // Zone labels
  cx.fillStyle = P.txtF; cx.font = 'bold 8px system-ui'; cx.textBaseline = 'middle';
  cx.textAlign = 'left';  cx.fillText('WEAK',    GX + 4, GY + GH / 2);
  cx.textAlign = 'center'; cx.fillText('PERFECT', GX + EX.okLoEnd * GW + (EX.pfEnd - EX.okLoEnd) * GW / 2, GY - 9);
  cx.textAlign = 'right';  cx.fillText('BITTER',  GX + GW - 4, GY + GH / 2);

  // Needle
  if (needle > 0.005) {
    const nx = GX + needle * GW;
    cx.save();
    cx.shadowColor = 'rgba(255,255,255,0.8)'; cx.shadowBlur = 8;
    cx.fillStyle = P.needleTk;
    cx.fillRect(nx - 2, GY - 4, 4, GH + 8);
    cx.restore();
    circle(cx, nx, GY - 4, 4, '#ffffff', 'rgba(0,0,0,0.3)', 1);
  }
}

// ── Draw: pull button
function drawPullBtn(cx, elapsed, px, py, pressed) {
  const inBtn = Math.hypot(px - BTN.x, py - BTN.y) < BTN.r + 8;
  const isHolding = pressed && inBtn && (phase === 'ready' || phase === 'pulling');
  const disabled = phase === 'done' || phase === 'result';
  const r = BTN.r * (isHolding ? 0.92 : 1);
  const baseColor = disabled ? P.pullDone : P.pullOn;
  const hiColor = disabled ? '#507060' : isHolding ? P.pullHold : P.pullOn;

  // Outer glow while holding
  if (isHolding) {
    cx.save();
    cx.shadowColor = 'rgba(220,120,50,0.6)'; cx.shadowBlur = 32;
    circle(cx, BTN.x, BTN.y, r + 6, null, 'transparent', 0);
    cx.restore();
  }

  // Shadow
  cx.save();
  cx.shadowColor = 'rgba(20,8,0,0.5)'; cx.shadowBlur = 20; cx.shadowOffsetY = 8;
  circle(cx, BTN.x, BTN.y, r, baseColor, null, 0);
  cx.restore();

  // Main circle
  const btnGrd = rgrd(cx, BTN.x - r * 0.3, BTN.y - r * 0.3, 0, r,
    [[0, hiColor], [0.5, baseColor], [1, isHolding ? P.mDark : 'rgba(30,15,0,0.6)']]);
  circle(cx, BTN.x, BTN.y, r, btnGrd, null, 0);

  // Top highlight
  cx.save();
  cx.strokeStyle = 'rgba(255,245,220,0.3)'; cx.lineWidth = 3; cx.lineCap = 'round';
  cx.beginPath(); cx.arc(BTN.x, BTN.y, r - 7, -Math.PI * 0.75, -Math.PI * 0.25); cx.stroke();
  cx.restore();

  // Text
  cx.fillStyle = disabled ? 'rgba(200,220,200,0.6)' : P.pullTxt;
  cx.font = 'bold 15px system-ui'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  if (disabled) {
    const icon = grade === 'perfect' ? '✦' : grade === 'ok' ? '✓' : grade === 'weak' ? '↓' : '!';
    cx.fillText(icon, BTN.x, BTN.y - 7);
    cx.font = '10px system-ui'; cx.fillStyle = 'rgba(200,230,200,0.5)';
    cx.fillText(grade.toUpperCase(), BTN.x, BTN.y + 10);
  } else {
    cx.fillText('PULL', BTN.x, BTN.y - 7);
    cx.font = '10px system-ui'; cx.fillStyle = 'rgba(255,240,210,0.6)';
    cx.fillText(isHolding ? 'release at the zone' : 'hold to pull', BTN.x, BTN.y + 10);
  }
  if (!disabled) {
    cx.font = '20px system-ui';
    cx.fillStyle = isHolding ? 'rgba(255,255,255,0.9)' : 'rgba(255,240,210,0.65)';
    cx.fillText('☕', BTN.x, BTN.y - 30);
  }
}

// ── Draw: phase hint
function drawHint(cx, elapsed, px, py, pressed) {
  let txt = '';
  switch (phase) {
    case 'ready': txt = 'Hold PULL to start extracting'; break;
    case 'pulling':
      if (needle < EX.wkEnd) txt = 'Building pressure…';
      else if (needle < EX.okLoEnd) txt = 'Almost there…';
      else if (needle <= EX.pfEnd) txt = '✦ Perfect zone — release now!';
      else if (needle <= EX.okHiEnd) txt = 'Still ok — release soon';
      else txt = '⚠ Getting bitter — release!';
      break;
    case 'result':
      txt = flashTxt || '';
      break;
    default: break;
  }
  if (!txt) return;
  cx.font = '12px system-ui'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  const tw = cx.measureText(txt).width;
  roundRect(cx, 240 - tw / 2 - 10, GY - 28, tw + 20, 20, 6, 'rgba(20,10,3,0.55)', null, 0);
  cx.fillStyle = P.txtF;
  cx.fillText(txt, 240, GY - 18);
}

// ── Draw: feedback flash
function drawFlash(cx, W, H) {
  if (flashAlpha <= 0) return;
  cx.save();
  cx.globalAlpha = flashAlpha * 0.35;
  cx.fillStyle = flashColor;
  cx.fillRect(0, 0, W, H);
  cx.restore();
  if (flashTxt && flashAlpha > 0.3) {
    cx.save();
    cx.globalAlpha = Math.min(1, (flashAlpha - 0.3) / 0.4);
    cx.fillStyle = flashColor;
    cx.font = 'bold 32px system-ui';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.shadowColor = 'rgba(0,0,0,0.5)'; cx.shadowBlur = 10;
    cx.fillText(flashTxt, W / 2, H / 2 - 60);
    cx.restore();
  }
}

// ── Update: steam particles
function updateSteam(dt) {
  steamTimer -= dt;
  if (steamTimer <= 0) {
    steamTimer = 0.1 + Math.random() * 0.1;
    const active = phase === 'pulling' || phase === 'done' || phase === 'result';
    const count = active ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const p = mkSteam();
      p.x = GHX - 10 + Math.random() * 20;
      p.y = GHY + 20 + Math.random() * 8;
      steam.push(p);
    }
  }
  for (const p of steam) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 1 - dt * 0.5;
    const frac = 1 - p.life / p.maxLife;
    p.alpha = frac < 0.2 ? frac / 0.2 : frac > 0.7 ? (1 - frac) / 0.3 : 1;
    p.r += dt * 2.5;
    p.life -= dt;
  }
  steam = steam.filter(p => p.life > 0 && p.y > -20);
}

// ── Trigger flash feedback
function doFlash(color, txt) {
  flashColor = color; flashTxt = txt; flashAlpha = 1.0;
}

// ── Update: phase logic
function update(dt, pressed, px, py) {
  phaseT += dt;

  const inBtn = Math.hypot(px - BTN.x, py - BTN.y) < BTN.r + 8;
  const pulling = pressed && inBtn && (phase === 'ready' || phase === 'pulling');

  // Needle advances while pulling
  if (pulling) {
    if (phase === 'ready') phase = 'pulling';
    needle = Math.min(1, needle + 0.195 * dt);
    streamAlpha = Math.min(1, streamAlpha + dt * 4);
  } else if (phase === 'pulling') {
    // Released — finalise extraction
    grade = gradeEx(needle);
    streamAlpha = 0;
    phase = 'result';
    phaseT = 0;

    // Set cup fill targets
    cupFillTarget = grade === 'perfect' ? 0.78 : grade === 'ok' ? 0.65 : grade === 'weak' ? 0.52 : 0.48;
    cupCremaTarget = grade === 'perfect' ? 1.0 : grade === 'ok' ? 0.6 : 0.3;

    if (grade === 'perfect') doFlash('#f0a030', '✦ Perfect!');
    else if (grade === 'ok') doFlash('#e0d060', 'Good Shot');
    else if (grade === 'weak') doFlash('#80a0d0', 'Too Weak');
    else doFlash('#e04040', 'Too Bitter');
  }

  // Stream fades when not pulling
  if (!pulling && phase !== 'pulling') {
    streamAlpha = Math.max(0, streamAlpha - dt * 3);
  }

  // Animate cup fill toward target
  if (cupFill < cupFillTarget) {
    cupFill = Math.min(cupFillTarget, cupFill + dt * 0.6);
  }
  if (cupCrema < cupCremaTarget) {
    cupCrema = Math.min(cupCremaTarget, cupCrema + dt * 0.5);
  }

  // Flash fades
  if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt * 1.4);

  // Result phase: mark done after a moment so game can note it
  if (phase === 'result' && phaseT > 1.2) {
    phase = 'done';
    resultDone = true;
  }
}

// ── Main draw entry point
/**
 * @param {Ctx} cx
 * @param {number} W
 * @param {number} H
 * @param {import('../sim/types.js').SimState} state
 * @param {number} elapsedMs Milliseconds since overlay opened
 * @param {number} px Pointer X in overlay logical coords
 * @param {number} py Pointer Y in overlay logical coords
 * @param {boolean} pressed Whether pointer is held
 */
export function drawEspressoScene(cx, W, H, state, elapsedMs, px, py, pressed) {
  const elapsed = elapsedMs / 1000;
  const dt = Math.min((elapsedMs - lastElapsedMs) / 1000, 0.1);
  lastElapsedMs = elapsedMs;

  // Update physics
  update(dt, pressed, px, py);
  updateSteam(dt);

  // Draw layers
  drawBg(cx, W, H);
  drawSteam(cx);
  drawStream(cx, elapsed);
  drawMachine(cx, elapsed);
  drawCup(cx);
  drawGauge(cx, elapsed);
  drawHint(cx, elapsed, px, py, pressed);
  drawPullBtn(cx, elapsed, px, py, pressed);
  drawFlash(cx, W, H);
}
