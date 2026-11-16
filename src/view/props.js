// @ts-check
/**
 * The café's environment and stations.
 *
 * Static parts are drawn once into cached layers: the background (wall,
 * window, menu board, lights, back bar) and the foreground (the front
 * counter, which hides the owner's legs). Stations that change with the
 * game are drawn every frame from their state: the espresso machine, the
 * pastry pass, the sink, the dish rack and the tables.
 */
import { SCENE_HEIGHT, SCENE_WIDTH } from './scene.js';
import { cup, croissant, oval, plate, poly, rounded, textAt } from './art.js';
import { shade, sparkle } from './characters.js';

/** @typedef {CanvasRenderingContext2D} Ctx */
/** @typedef {import('../sim/types.js').DrinkItem} DrinkItem */

/**
 * Visual colours for each drink type.
 * @type {Record<string, { fill: string, rich: string, stream: string, streamHighlight: string, foam: string, label: string }>}
 */
export const DRINK_LOOK = {
  espresso: { fill: '#3a1a08', rich: '#5a2a10', stream: '#2a1208', streamHighlight: '#6a3a18', foam: '#c8a070', label: 'ESP' },
  latte:    { fill: '#b8835a', rich: '#c99a6a', stream: '#4a2412', streamHighlight: '#a8673a', foam: '#f6e9d2', label: 'LAT' },
  mocha:    { fill: '#4a2218', rich: '#6a3828', stream: '#321410', streamHighlight: '#7a4830', foam: '#d4b090', label: 'MOC' },
};

/** Where the fixed props are. Scene units. */
export const PROPS = Object.freeze({
  backBarTop: 258,
  counter: { x: 0, y: 322, w: 900, top: 44, front: 52 },
  gate: { x: 900, w: 60 },
  machine: { x: 66, y: 168, w: 128, h: 94, spout: { x: 124, y: 220 }, cup: { x: 124, y: 250 }, light: { x: 84, y: 184 }, gauge: { x: 166, y: 194 } },
  caseBox: { x: 266, y: 186, w: 152, h: 76 },
  pass: { x: 342, y: 270 },
  oven: { x: 194, y: 204, w: 54, h: 52 },
  sink: { x: 762, y: 230, w: 140, h: 40, basin: { x: 832, y: 252 }, tap: { x: 822, y: 214 } },
  rack: { x: 770, y: 182, w: 132 },
  window: { x: 462, y: 56, w: 256, h: 122 },
  stand: { x: 908, y: 400, w: 44, h: 80 },
});

/**
 * @param {Ctx} cx
 */
export function drawBackground(cx) {
  // Ceiling beam and wall — warm cream gradient.
  const wall = cx.createLinearGradient(0, 40, 0, 270);
  wall.addColorStop(0, '#f8e7c8');
  wall.addColorStop(1, '#f0d4a8');
  cx.fillStyle = wall;
  cx.fillRect(0, 0, SCENE_WIDTH, 270);
  // Wainscot below the picture rail, down to the floor, at both ends of the bar.
  rounded(cx, 0, 202, SCENE_WIDTH, 160, 0, '#c09060');
  for (let x = 6; x < SCENE_WIDTH; x += 34) rounded(cx, x, 214, 26, 140, 3, '#b4845a');
  // Wallpaper stripes — subtle warm pattern.
  for (let x = 0; x < SCENE_WIDTH; x += 40) {
    cx.fillStyle = x % 80 === 0 ? '#ffffff18' : '#c9a06a12';
    cx.fillRect(x, 42, 20, 160);
  }
  // Ceiling beam with trim.
  rounded(cx, 0, 0, SCENE_WIDTH, 34, 0, '#a87050');
  for (let x = 0; x < SCENE_WIDTH; x += 120) rounded(cx, x, 0, 6, 34, 0, '#8e5c3e');
  rounded(cx, 0, 34, SCENE_WIDTH, 8, 0, '#7a4e36');
  // Picture rail.
  rounded(cx, 0, 196, SCENE_WIDTH, 6, 0, '#b88a5c');

  // Window with outdoor view and light shafts.
  const w = PROPS.window;
  rounded(cx, w.x - 10, w.y - 10, w.w + 20, w.h + 22, 12, '#6b4335');
  const sky = cx.createLinearGradient(0, w.y, 0, w.y + w.h);
  sky.addColorStop(0, '#a8d4e8');
  sky.addColorStop(1, '#f0e0c0');
  rounded(cx, w.x, w.y, w.w, w.h, 6, sky);
  cx.save();
  cx.beginPath();
  cx.roundRect(w.x, w.y, w.w, w.h, 6);
  cx.clip();
  // Sun.
  const sunG = cx.createRadialGradient(w.x + 196, w.y + 30, 4, w.x + 196, w.y + 30, 28);
  sunG.addColorStop(0, '#fff8d8');
  sunG.addColorStop(0.5, '#fff4c480');
  sunG.addColorStop(1, '#fff4c400');
  cx.fillStyle = sunG;
  cx.fillRect(w.x + 168, w.y + 2, 56, 56);
  oval(cx, w.x + 196, w.y + 30, 14, 14, '#fff6d0');
  // Hills.
  poly(cx, [[w.x, w.y + 92], [w.x + 46, w.y + 58], [w.x + 92, w.y + 80], [w.x + 150, w.y + 46], [w.x + 210, w.y + 84], [w.x + w.w, w.y + 66], [w.x + w.w, w.y + w.h], [w.x, w.y + w.h]], '#9fb7a0');
  poly(cx, [[w.x, w.y + 106], [w.x + 70, w.y + 86], [w.x + 140, w.y + 100], [w.x + 200, w.y + 82], [w.x + w.w, w.y + 98], [w.x + w.w, w.y + w.h], [w.x, w.y + w.h]], '#7d9a8a');
  // Trees across the street — fuller canopies.
  for (const [tx, r] of [[w.x + 30, 16], [w.x + 118, 20], [w.x + 226, 15]]) {
    rounded(cx, tx - 3, w.y + w.h - 30, 6, 30, 2, '#6b5040');
    oval(cx, tx - 4, w.y + w.h - 36, r * 0.7, r * 0.9, '#4f7a52');
    oval(cx, tx + 4, w.y + w.h - 40, r * 0.8, r * 1.0, '#5f8b62');
    oval(cx, tx, w.y + w.h - 42, r, r * 1.1, '#6a9a6a');
  }
  cx.restore();
  rounded(cx, w.x + w.w / 2 - 5, w.y, 10, w.h, 0, '#6b4335');
  rounded(cx, w.x, w.y + 52, w.w, 8, 0, '#6b4335');
  rounded(cx, w.x - 16, w.y + w.h + 8, w.w + 32, 10, 4, '#8a5a40');
  // Shelf plants on the sill — richer greens with pot detail.
  for (const px of [w.x + 20, w.x + w.w - 28]) {
    rounded(cx, px - 9, w.y + w.h - 10, 18, 16, 4, '#c97a52', '#6b4335', 2);
    rounded(cx, px - 7, w.y + w.h - 8, 14, 4, 2, '#b06a45');
    for (const [dx, dy] of [[-8, -14], [0, -20], [8, -14], [-4, -8], [5, -9]]) oval(cx, px + dx, w.y + w.h - 8 + dy, 6, 9, dy < -15 ? '#7fae6f' : '#6a9960');
  }
  // Sunlight falling from the window — warmer and stronger.
  const beam = cx.createLinearGradient(w.x, w.y, w.x - 80, 330);
  beam.addColorStop(0, '#fff6d640');
  beam.addColorStop(1, '#fff6d600');
  cx.fillStyle = beam;
  cx.beginPath();
  cx.moveTo(w.x, w.y + w.h);
  cx.lineTo(w.x + w.w, w.y + w.h);
  cx.lineTo(w.x + w.w - 110, 330);
  cx.lineTo(w.x - 120, 330);
  cx.closePath();
  cx.fill();
  // Second, narrower beam from the right pane.
  const beam2 = cx.createLinearGradient(w.x + w.w / 2, w.y, w.x + w.w / 2 + 40, 330);
  beam2.addColorStop(0, '#fff6d625');
  beam2.addColorStop(1, '#fff6d600');
  cx.fillStyle = beam2;
  cx.beginPath();
  cx.moveTo(w.x + w.w / 2 + 10, w.y + w.h);
  cx.lineTo(w.x + w.w, w.y + w.h);
  cx.lineTo(w.x + w.w - 40, 330);
  cx.lineTo(w.x + w.w / 2 - 50, 330);
  cx.closePath();
  cx.fill();

  // Menu board — richer green with better chalk rendering.
  rounded(cx, 58, 48, 262, 102, 10, '#6e4632');
  rounded(cx, 60, 50, 258, 98, 8, '#5a3d2c');
  rounded(cx, 66, 56, 246, 86, 6, '#1e2e26');
  textAt(cx, 'GOOD BEANS', 189, 82, 20, '#f6dea2', 1000);
  cx.strokeStyle = '#f6dea266';
  cx.lineWidth = 1.5;
  cx.beginPath();
  cx.moveTo(110, 90);
  cx.lineTo(268, 90);
  cx.stroke();
  // Chalk dust effect.
  cx.fillStyle = '#f3ead40a';
  cx.fillRect(66, 56, 246, 86);
  const items = [['Latte', '8'], ['Croissant', '6'], ['Espresso', '5'], ['Mocha', '10']];
  items.forEach(([name, price], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    textAt(cx, name, 82 + col * 122, 112 + row * 22, 13, '#f3ead4', 800, 'left');
    textAt(cx, price, 176 + col * 122, 112 + row * 22, 13, '#bfe79a', 900, 'right');
  });
  // Chalk doodle cup and steam.
  cx.strokeStyle = '#f3ead466';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.arc(296, 74, 7, 0, Math.PI);
  cx.stroke();
  cx.beginPath();
  cx.moveTo(293, 68);
  cx.quadraticCurveTo(295, 60, 292, 55);
  cx.moveTo(299, 68);
  cx.quadraticCurveTo(301, 62, 298, 56);
  cx.stroke();

  // Framed print — warmer tones with mat border.
  rounded(cx, 852, 48, 82, 92, 6, '#6b4335');
  rounded(cx, 856, 52, 74, 84, 4, '#e8dac4');
  rounded(cx, 860, 56, 66, 76, 3, '#f1e3c7');
  oval(cx, 893, 86, 18, 18, '#d98a5a');
  // Warmer coffee-art tones.
  oval(cx, 893, 86, 12, 12, '#e8a66a');
  cup(cx, 893, 108, 28);
  textAt(cx, 'EST. 2024', 893, 128, 9, '#6b4335', 900);

  // Hanging lights: cords, shades and warm bulb glow.
  for (const lx of LIGHTS) {
    rounded(cx, lx - 1.5, 0, 3, 64, 0, '#4a3530');
    // Shade — deeper green with rim highlight.
    poly(cx, [[lx - 22, 64], [lx + 22, 64], [lx + 32, 86], [lx - 32, 86]], '#2a5448');
    rounded(cx, lx - 32, 84, 64, 5, 2, '#204038');
    // Inner shade glow.
    const shadeGlow = cx.createLinearGradient(lx - 28, 70, lx + 28, 70);
    shadeGlow.addColorStop(0, '#ffe8c030');
    shadeGlow.addColorStop(0.5, '#ffe8c050');
    shadeGlow.addColorStop(1, '#ffe8c020');
    cx.fillStyle = shadeGlow;
    cx.beginPath();
    cx.moveTo(lx - 20, 66);
    cx.lineTo(lx + 20, 66);
    cx.lineTo(lx + 30, 84);
    cx.lineTo(lx - 30, 84);
    cx.closePath();
    cx.fill();
    // Bulb with warm halo.
    const bulbGlow = cx.createRadialGradient(lx, 88, 3, lx, 88, 20);
    bulbGlow.addColorStop(0, '#ffe8c0cc');
    bulbGlow.addColorStop(1, '#ffe8c000');
    cx.fillStyle = bulbGlow;
    cx.fillRect(lx - 20, 72, 40, 32);
    oval(cx, lx, 90, 11, 5, '#ffe8c0');
  }

  // Back bar: tiled splashback with warmer subway tiles, then the bar top and its panelled front.
  rounded(cx, 20, 200, 900, 60, 0, '#f0e4d4');
  cx.strokeStyle = '#ddd0bc';
  cx.lineWidth = 1;
  for (let y = 200; y < 260; y += 15) {
    cx.beginPath();
    cx.moveTo(20, y);
    cx.lineTo(920, y);
    cx.stroke();
    for (let x = 20 + ((y / 15) % 2) * 15; x < 920; x += 30) {
      cx.beginPath();
      cx.moveTo(x, y);
      cx.lineTo(x, y + 15);
      cx.stroke();
    }
  }
  // Subtle tile sheen.
  const tileSheen = cx.createLinearGradient(200, 200, 700, 260);
  tileSheen.addColorStop(0, '#ffffff00');
  tileSheen.addColorStop(0.4, '#ffffff0c');
  tileSheen.addColorStop(0.6, '#ffffff0c');
  tileSheen.addColorStop(1, '#ffffff00');
  cx.fillStyle = tileSheen;
  cx.fillRect(20, 200, 900, 60);
  // Bar top with wood grain.
  rounded(cx, 14, PROPS.backBarTop, 912, 14, 4, '#a8704e', '#5c3c2e', 3);
  // Highlight along the bar top edge.
  cx.strokeStyle = '#c8946a40';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.moveTo(18, PROPS.backBarTop + 3);
  cx.lineTo(920, PROPS.backBarTop + 3);
  cx.stroke();
  rounded(cx, 18, PROPS.backBarTop + 12, 904, 60, 2, '#7a4a37');
  for (let x = 40; x < 900; x += 96) rounded(cx, x, PROPS.backBarTop + 22, 80, 40, 4, '#6a3f2f');
  // The pick-up sign hangs on the front counter (drawForeground), where the owner never hides it.

  drawCaseStatic(cx);
  drawSinkStatic(cx);

  // Rack shelf above the sink.
  const r = PROPS.rack;
  rounded(cx, r.x - 8, r.y, r.w + 16, 8, 3, '#8b5c42');
  rounded(cx, r.x, r.y + 8, 4, 12, 1, '#6b4335');
  rounded(cx, r.x + r.w - 4, r.y + 8, 4, 12, 1, '#6b4335');

  // Floor: warm planks with a little perspective and richer wood tones.
  const floor = cx.createLinearGradient(0, 360, 0, SCENE_HEIGHT);
  floor.addColorStop(0, '#c99060');
  floor.addColorStop(1, '#dca878');
  cx.fillStyle = floor;
  cx.fillRect(0, 360, SCENE_WIDTH, SCENE_HEIGHT - 360);
  for (let j = 0; j < 9; j++) {
    const y = 420 + j * j * 4.2 + j * 22;
    cx.strokeStyle = '#a0704855';
    cx.lineWidth = 2;
    cx.beginPath();
    cx.moveTo(0, y);
    cx.lineTo(SCENE_WIDTH, y);
    cx.stroke();
    for (let x = (j % 2) * 70; x < SCENE_WIDTH; x += 140) {
      cx.beginPath();
      cx.moveTo(x, y);
      cx.lineTo(x, y + 18 + j * 6);
      cx.stroke();
    }
    // Subtle wood grain variation per row.
    if (j % 3 === 0) {
      cx.fillStyle = '#b8804e0a';
      cx.fillRect(0, y, SCENE_WIDTH, 18 + j * 6);
    }
  }
  // Sunlight on the floor — warmer and larger.
  const pool = cx.createRadialGradient(470, 520, 10, 470, 530, 340);
  pool.addColorStop(0, '#fff3d030');
  pool.addColorStop(0.6, '#fff3d018');
  pool.addColorStop(1, '#fff3d000');
  cx.fillStyle = pool;
  cx.fillRect(0, 360, SCENE_WIDTH, SCENE_HEIGHT - 360);

  // Door, at the left, with an OPEN sign.
  rounded(cx, -10, 380, 40, 196, 6, '#6b4335', '#4a2e25', 4);
  rounded(cx, -4, 396, 26, 82, 4, '#bfe0dc');
  // Door glass reflection.
  cx.fillStyle = '#ffffff18';
  cx.beginPath();
  cx.moveTo(-2, 398);
  cx.lineTo(10, 398);
  cx.lineTo(4, 470);
  cx.lineTo(-2, 470);
  cx.closePath();
  cx.fill();
  oval(cx, 22, 500, 3.5, 3.5, '#d4a64c');
  rounded(cx, -2, 488, 28, 16, 3, '#c0504d');
  textAt(cx, 'OPEN', 12, 500, 9, '#fff', 1000);
  // A warm-toned rug where guests queue.
  oval(cx, 470, 540, 260, 30, '#b07048');
  oval(cx, 470, 540, 250, 26, '#c08058');
  oval(cx, 470, 540, 230, 20, '#b07048');
  cx.globalAlpha = 0.15;
  oval(cx, 470, 540, 260, 30, '#b07048');
  cx.globalAlpha = 1;
  // Corner plants.
  bigPlant(cx, 30, 714, 1.1);
  bigPlant(cx, 942, 600, 0.9);
  // Decorative shelf on the far right wall.
  rounded(cx, 934, 120, 26, 6, 2, '#8a5a40');
  rounded(cx, 938, 100, 18, 22, 4, '#c97a52', '#6b4335', 2);
  for (const [dx, dy] of [[-6, -10], [0, -16], [6, -10]]) oval(cx, 947 + dx, 100 + dy, 5, 8, '#6a9960');
}

/** x positions of the hanging lights. */
export const LIGHTS = [392, 790];

/**
 * Warm pools of light under the lamps. Drawn over the background, under the
 * characters.
 * @param {Ctx} cx
 */
export function drawLightGlow(cx) {
  for (const lx of LIGHTS) {
    // Primary warm cone of light.
    const g = cx.createRadialGradient(lx, 96, 4, lx, 160, 200);
    g.addColorStop(0, '#ffe0a060');
    g.addColorStop(0.4, '#ffe7a630');
    g.addColorStop(1, '#ffe7a600');
    cx.fillStyle = g;
    cx.fillRect(lx - 210, 80, 420, 280);
    // Tighter bright spot directly under the shade.
    const bright = cx.createRadialGradient(lx, 92, 2, lx, 110, 60);
    bright.addColorStop(0, '#fffae840');
    bright.addColorStop(1, '#fffae800');
    cx.fillStyle = bright;
    cx.fillRect(lx - 70, 80, 140, 80);
  }
  // Ambient window light wash across the back wall.
  const ambient = cx.createLinearGradient(360, 60, 720, 200);
  ambient.addColorStop(0, '#fff6d010');
  ambient.addColorStop(0.5, '#fff6d01a');
  ambient.addColorStop(1, '#fff6d000');
  cx.fillStyle = ambient;
  cx.fillRect(360, 50, 360, 200);
}

/**
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y Base of the pot.
 * @param {number} s
 */
function bigPlant(cx, x, y, s) {
  cx.save();
  cx.translate(x, y);
  cx.scale(s, s);
  oval(cx, 0, 0, 30, 8, '#3b2a2030');
  poly(cx, [[-22, -44], [22, -44], [17, 0], [-17, 0]], '#c97a52');
  rounded(cx, -25, -50, 50, 9, 4, '#b06a45');
  const leaves = [[-34, -96, -0.6], [-16, -118, -0.25], [6, -126, 0.1], [26, -104, 0.5], [36, -80, 0.9], [-36, -70, -1.0], [0, -92, 0]];
  for (const [lx, ly, a] of leaves) {
    cx.save();
    cx.translate(lx * 0.5, -48);
    cx.rotate(a);
    cx.strokeStyle = '#4f7a46';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(0, 0);
    cx.lineTo(0, ly + 48);
    cx.stroke();
    oval(cx, 0, ly + 48, 12, 22, a < 0 ? '#6a9960' : '#7fae6f');
    cx.restore();
  }
  cx.restore();
}

/**
 * @param {Ctx} cx
 */
function drawCaseStatic(cx) {
  const c = PROPS.caseBox;
  rounded(cx, c.x - 4, c.y + c.h - 6, c.w + 8, 16, 4, '#8a5a40');
  const glass = cx.createLinearGradient(c.x, c.y, c.x + c.w, c.y + c.h);
  glass.addColorStop(0, '#d8f0ecdd');
  glass.addColorStop(1, '#b5d9d2cc');
  rounded(cx, c.x, c.y, c.w, c.h, 12, glass, '#6f8c86', 4);
  rounded(cx, c.x + 10, c.y + 30, c.w - 20, 6, 2, '#ffffffaa');
  rounded(cx, c.x + 12, c.y + c.h - 30, c.w - 24, 18, 4, '#d5ae7d');
  for (const xx of [c.x + 36, c.x + 76, c.x + 116]) croissant(cx, xx, c.y + c.h - 30, 30);
  for (const xx of [c.x + 30, c.x + 66]) {
    oval(cx, xx, c.y + 22, 13, 9, '#8a4b2f');
    oval(cx, xx, c.y + 20, 10, 6, '#b7744d');
  }
  oval(cx, c.x + 112, c.y + 21, 16, 10, '#e6b85c');
  // Glare.
  cx.strokeStyle = '#ffffff99';
  cx.lineWidth = 3;
  cx.beginPath();
  cx.moveTo(c.x + 16, c.y + 10);
  cx.lineTo(c.x + 36, c.y + 10);
  cx.stroke();
}

/**
 * @param {Ctx} cx
 */
function drawSinkStatic(cx) {
  const s = PROPS.sink;
  rounded(cx, s.x - 8, s.y - 4, s.w + 16, s.h + 30, 10, '#a9b6b8', '#56666a', 4);
  rounded(cx, s.x + 8, s.y + 6, s.w - 16, s.h + 8, 10, '#6f8387');
  rounded(cx, s.x + 12, s.y + 9, s.w - 24, 6, 3, '#86999d');
  // Faucet: a gooseneck rising from the back of the sink.
  cx.strokeStyle = '#7d8b8f';
  cx.lineWidth = 7;
  cx.lineCap = 'round';
  cx.beginPath();
  cx.moveTo(s.tap.x + 24, s.y - 2);
  cx.lineTo(s.tap.x + 24, s.tap.y - 8);
  cx.quadraticCurveTo(s.tap.x + 24, s.tap.y - 22, s.tap.x + 10, s.tap.y - 22);
  cx.quadraticCurveTo(s.tap.x, s.tap.y - 22, s.tap.x, s.tap.y - 10);
  cx.stroke();
  cx.lineCap = 'butt';
  oval(cx, s.tap.x + 40, s.y - 5, 6, 4, '#56666a');
  // Soap bottle.
  rounded(cx, s.x + s.w - 6, s.y - 30, 14, 26, 4, '#8fd3ff', '#3f6f8a', 2);
  rounded(cx, s.x + s.w - 2, s.y - 38, 6, 9, 2, '#3f6f8a');
}

/**
 * @typedef {object} OvenLook
 * @property {'empty' | 'baking' | 'ready'} state
 * @property {number} progress 0-1 for baking.
 * @property {number} stock Current display stock.
 * @property {number} maxStock Max display stock.
 * @property {number} time Animation time in seconds.
 */

/**
 * Draw the oven on the back bar with baking progress and pastry stock.
 * @param {Ctx} cx
 * @param {OvenLook} look
 */
export function drawOven(cx, look) {
  const o = PROPS.oven;
  const midX = o.x + o.w / 2;

  // Oven body — rounded dark metal box.
  rounded(cx, o.x, o.y, o.w, o.h, 6, '#3a3a3e', '#2a2a2e', 3);

  // Door with glass window.
  const doorY = o.y + 10;
  const doorH = o.h - 14;
  rounded(cx, o.x + 6, doorY, o.w - 12, doorH, 4, '#4a4a50', '#333338', 2);

  // Glass window — glows orange when baking.
  const glassX = o.x + 10;
  const glassY = doorY + 4;
  const glassW = o.w - 20;
  const glassH = doorH - 12;
  if (look.state === 'baking') {
    // Warm orange glow inside.
    const glow = cx.createRadialGradient(midX, glassY + glassH / 2, 2, midX, glassY + glassH / 2, glassW);
    glow.addColorStop(0, '#ff8c30');
    glow.addColorStop(0.6, '#e06820');
    glow.addColorStop(1, '#a04010');
    rounded(cx, glassX, glassY, glassW, glassH, 3, glow);
    // Pulsing light effect.
    const pulse = 0.5 + 0.5 * Math.sin(look.time * 3);
    cx.globalAlpha = 0.15 + 0.1 * pulse;
    rounded(cx, glassX, glassY, glassW, glassH, 3, '#ffcc66');
    cx.globalAlpha = 1;
  } else if (look.state === 'ready') {
    // Bright warm glow — pastries are done!
    rounded(cx, glassX, glassY, glassW, glassH, 3, '#ffb040');
    cx.globalAlpha = 0.3;
    rounded(cx, glassX, glassY, glassW, glassH, 3, '#ffe880');
    cx.globalAlpha = 1;
  } else {
    // Empty — dark glass.
    rounded(cx, glassX, glassY, glassW, glassH, 3, '#1a1a20');
    // Subtle reflection.
    cx.strokeStyle = '#ffffff18';
    cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(glassX + 3, glassY + 3);
    cx.lineTo(glassX + glassW * 0.4, glassY + 3);
    cx.stroke();
  }

  // Door handle — small knob.
  rounded(cx, o.x + o.w - 10, doorY + doorH / 2 - 3, 5, 6, 2, '#606068');

  // Top vent lines.
  cx.strokeStyle = '#2a2a2e';
  cx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    cx.beginPath();
    cx.moveTo(o.x + 14 + i * 10, o.y + 3);
    cx.lineTo(o.x + 14 + i * 10, o.y + 7);
    cx.stroke();
  }

  // Progress bar below oven when baking.
  if (look.state === 'baking') {
    const barX = o.x + 4;
    const barY = o.y + o.h + 2;
    const barW = o.w - 8;
    const barH = 4;
    rounded(cx, barX, barY, barW, barH, 2, '#2a2a2e');
    if (look.progress > 0) {
      const fillW = Math.max(3, barW * look.progress);
      rounded(cx, barX, barY, fillW, barH, 2, '#ff9030');
    }
  }

  // Pastry stock display — small croissant icons below the oven.
  const stockY = o.y + o.h + 9;
  const stockStartX = midX - (look.maxStock * 7) / 2;
  for (let i = 0; i < look.maxStock; i++) {
    const sx = stockStartX + i * 7 + 3;
    if (i < look.stock) {
      // Filled pastry dot.
      oval(cx, sx, stockY, 3, 2.5, '#d4a06a');
      oval(cx, sx, stockY - 0.5, 2.5, 2, '#e8b87a');
    } else {
      // Empty slot.
      oval(cx, sx, stockY, 3, 2.5, '#5a5a5e');
    }
  }

  // "OVEN" label.
  textAt(cx, 'OVEN', midX, o.y - 3, 8, '#9a9a9e', 800);

  // Baking glow effect on surrounding area.
  if (look.state === 'baking' || look.state === 'ready') {
    const halo = cx.createRadialGradient(midX, o.y + o.h / 2, 4, midX, o.y + o.h / 2, 50);
    const col = look.state === 'ready' ? '#ffb04020' : '#ff6a2018';
    halo.addColorStop(0, col);
    halo.addColorStop(1, '#ff6a2000');
    cx.fillStyle = halo;
    cx.fillRect(o.x - 30, o.y - 20, o.w + 60, o.h + 40);
  }
}

/**
 * Draw the TapIt Smart Café kiosk stand on the customer floor.
 *
 * @typedef {object} StandLook
 * @property {boolean} installed
 * @property {boolean} inUse
 * @property {number} queueLength
 * @property {number} progress
 *
 * @param {Ctx} cx
 * @param {StandLook} look
 */
export function drawStand(cx, look) {
  if (!look.installed) return;
  const s = PROPS.stand;

  // Pole / pedestal
  cx.fillStyle = '#8a8a8a';
  rounded(cx, s.x + s.w / 2 - 4, s.y + 26, 8, s.h - 26, 2, '#8a8a8a');
  // Base plate
  cx.fillStyle = '#707070';
  rounded(cx, s.x + 2, s.y + s.h - 6, s.w - 4, 6, 2, '#707070');

  // Tablet screen — angled slightly
  const screenW = s.w - 4;
  const screenH = 30;
  const screenX = s.x + 2;
  const screenY = s.y;
  // Screen bezel
  rounded(cx, screenX - 1, screenY - 1, screenW + 2, screenH + 2, 4, '#2a2a2a');
  // Screen face — glowing when in use
  const screenFill = look.inUse ? '#1a6aff' : '#222838';
  rounded(cx, screenX, screenY, screenW, screenH, 3, screenFill);

  if (look.inUse) {
    // NFC/tap ripple animation based on progress
    cx.save();
    const centerX = screenX + screenW / 2;
    const centerY = screenY + screenH / 2;
    // Pulsing NFC icon — three arcs
    const phase = (look.progress * 4) % 1;
    cx.strokeStyle = `rgba(255,255,255,${0.5 + 0.3 * Math.sin(phase * Math.PI * 2)})`;
    cx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const r = 4 + i * 4;
      const alpha = Math.max(0, 1 - Math.abs(phase - i * 0.3) * 2);
      cx.strokeStyle = `rgba(255,255,255,${alpha * 0.8})`;
      cx.beginPath();
      cx.arc(centerX, centerY, r, -Math.PI * 0.4, Math.PI * 0.4);
      cx.stroke();
    }
    // Progress bar at bottom of screen
    cx.fillStyle = 'rgba(255,255,255,0.3)';
    cx.fillRect(screenX + 2, screenY + screenH - 4, screenW - 4, 2);
    cx.fillStyle = '#4aff8a';
    cx.fillRect(screenX + 2, screenY + screenH - 4, (screenW - 4) * look.progress, 2);
    cx.restore();
  } else {
    // Idle screen — TapIt logo text
    cx.fillStyle = '#6a8aaa';
    cx.font = 'bold 8px monospace';
    cx.textAlign = 'center';
    cx.fillText('TapIt', screenX + screenW / 2, screenY + screenH / 2 + 3);
    cx.textAlign = 'left';
  }

  // Small NFC symbol below the screen
  cx.fillStyle = '#50c878';
  cx.font = '7px monospace';
  cx.textAlign = 'center';
  cx.fillText('NFC', s.x + s.w / 2, s.y + screenH + 10);
  cx.textAlign = 'left';
}

/**
 * The front counter and the counter gate. Drawn over the owner, so it hides
 * their legs, and under the guests.
 * @param {Ctx} cx
 */
export function drawForeground(cx) {
  const c = PROPS.counter;
  // Gate flap at the right end, slightly lower.
  rounded(cx, PROPS.gate.x + 4, c.y + 18, PROPS.gate.w - 4, 18, 4, '#c58e5a', '#51392f', 3);
  rounded(cx, PROPS.gate.x + 8, c.y + 34, PROPS.gate.w - 12, c.front + 10, 3, '#9c6a46', '#51392f', 3);
  // Counter top with lit front edge and warm gradient.
  const top = cx.createLinearGradient(0, c.y, 0, c.y + c.top);
  top.addColorStop(0, '#f0c888');
  top.addColorStop(1, '#d4a06a');
  rounded(cx, c.x - 6, c.y, c.w + 6, c.top, 6, top, '#51392f', 4);
  // Front-edge highlight — a warm lit strip.
  const edgeHighlight = cx.createLinearGradient(0, c.y + 2, 0, c.y + 10);
  edgeHighlight.addColorStop(0, '#ffffff50');
  edgeHighlight.addColorStop(1, '#ffffff00');
  cx.fillStyle = edgeHighlight;
  cx.fillRect(c.x, c.y + 2, c.w, 8);
  // Front panel with inset boards.
  const front = cx.createLinearGradient(0, c.y + c.top, 0, c.y + c.top + c.front);
  front.addColorStop(0, '#b88058');
  front.addColorStop(1, '#986848');
  rounded(cx, c.x - 4, c.y + c.top - 4, c.w + 2, c.front + 4, 3, front, '#5c3e35', 4);
  for (let x = 24; x < c.w - 20; x += 88) {
    rounded(cx, x, c.y + c.top + 6, 76, c.front - 14, 3, '#a87050', '#7a4c33', 1.5);
    // Panel border highlight.
    cx.strokeStyle = '#c8946a30';
    cx.lineWidth = 1;
    cx.beginPath();
    cx.roundRect(x + 1, c.y + c.top + 7, 74, 2, 1);
    cx.stroke();
  }
  // Pick-up sign on the counter front, below the machine and the pastry case.
  rounded(cx, 60, c.y + c.top + 8, 170, 24, 6, '#1e2e26', '#f6dea2', 2);
  textAt(cx, '▲ PICK-UP ▲', 145, c.y + c.top + 26, 15, '#f6dea2', 1000);
  // Register, on the counter top.
  rounded(cx, 820, c.y - 30, 64, 34, 6, '#37383d', '#20242a', 3);
  rounded(cx, 828, c.y - 24, 48, 14, 2, '#a4be86');
  // Register screen glow.
  const screenGlow = cx.createRadialGradient(852, c.y - 18, 4, 852, c.y - 18, 30);
  screenGlow.addColorStop(0, '#a4be8620');
  screenGlow.addColorStop(1, '#a4be8600');
  cx.fillStyle = screenGlow;
  cx.fillRect(820, c.y - 38, 64, 30);
  rounded(cx, 830, c.y - 2, 44, 6, 2, '#46474f');
  // A small plant and a sugar jar at the left end.
  rounded(cx, 24, c.y - 18, 22, 20, 5, '#c97a52', '#6b4335', 2);
  rounded(cx, 26, c.y - 16, 18, 5, 2, '#b06a45');
  for (const [dx, dy] of [[-8, -12], [0, -20], [8, -12]]) oval(cx, 35 + dx, c.y - 18 + dy, 7, 11, dy < -15 ? '#7fae6f' : '#6a9960');
  rounded(cx, 54, c.y - 20, 18, 22, 5, '#fff7e8cc', '#8a6a52', 2);
  // Sugar jar lid.
  rounded(cx, 56, c.y - 22, 14, 5, 3, '#c9a478');
  // A small napkin holder beside the register.
  rounded(cx, 790, c.y - 14, 22, 16, 3, '#37383d', '#20242a', 2);
  rounded(cx, 794, c.y - 18, 14, 6, 2, '#f0e4d4');
}

/**
 * @typedef {object} MachineLook
 * @property {'empty' | 'loading' | 'brewing' | 'ready' | 'claimed'} state
 * @property {number} progress 0-1 for brewing.
 * @property {number} time Visual clock, seconds.
 * @property {number} pulse 0-1, the moment a brew finishes.
 * @property {number | null} ticket
 * @property {boolean} lifted The ready cup has been picked up by the player.
 * @property {boolean} hidden The ready cup is being dragged.
 * @property {DrinkItem | null} drink Which drink type is brewing/ready.
 */

/**
 * The espresso machine, drawn from its state. While brewing, coffee pours
 * into the cup at the rate of the simulation's own brew timer.
 * @param {Ctx} cx
 * @param {MachineLook} m
 * @param {(cx: Ctx, x: number, y: number, r: number, label: number | string) => void} tag
 */
export function drawMachine(cx, m, tag) {
  const M = PROPS.machine;
  const shake = m.state === 'brewing' ? Math.sin(m.time * 60) * 0.6 : 0;
  cx.save();
  cx.translate(shake, 0);
  // Body — richer metallic gradient.
  const body = cx.createLinearGradient(M.x, 0, M.x + M.w, 0);
  body.addColorStop(0, '#5a6466');
  body.addColorStop(0.3, '#7b8789');
  body.addColorStop(0.5, '#8a9496');
  body.addColorStop(0.7, '#7b8789');
  body.addColorStop(1, '#4e5759');
  rounded(cx, M.x, M.y, M.w, M.h, 12, body, '#2f2a2e', 4);
  // Top panel with brushed-metal look.
  const topPanel = cx.createLinearGradient(M.x + 6, 0, M.x + M.w - 6, 0);
  topPanel.addColorStop(0, '#3f4547');
  topPanel.addColorStop(0.5, '#4a5052');
  topPanel.addColorStop(1, '#3f4547');
  rounded(cx, M.x + 6, M.y - 10, M.w - 12, 14, 5, topPanel);
  // Cups warming on top.
  for (const dx of [26, 52, 78, 104]) rounded(cx, M.x + dx - 9, M.y - 26, 18, 16, 4, '#fffaf0', '#6d4b42', 2);
  // Pressure gauge: the needle rises while brewing.
  oval(cx, M.gauge.x, M.gauge.y, 14, 14, '#f4efe4');
  cx.strokeStyle = '#2f2a2e';
  cx.lineWidth = 2.5;
  cx.beginPath();
  cx.arc(M.gauge.x, M.gauge.y, 14, 0, Math.PI * 2);
  cx.stroke();
  const needle = -2.4 + (m.state === 'brewing' ? 0.6 + m.progress * 1.6 + Math.sin(m.time * 20) * 0.05 : m.state === 'ready' ? 2.2 : 0);
  cx.strokeStyle = '#c0504d';
  cx.beginPath();
  cx.moveTo(M.gauge.x, M.gauge.y);
  cx.lineTo(M.gauge.x + Math.cos(needle) * 11, M.gauge.y + Math.sin(needle) * 11);
  cx.stroke();
  // Status light.
  const lightColour = m.state === 'brewing' ? (Math.sin(m.time * 8) > 0 ? '#ffb03a' : '#c98a2a') : m.state === 'ready' ? '#7fe36b' : '#5b5f61';
  if (m.state === 'ready' || m.state === 'brewing') {
    const glow = cx.createRadialGradient(M.light.x, M.light.y, 1, M.light.x, M.light.y, 18 + m.pulse * 30);
    glow.addColorStop(0, lightColour + 'aa');
    glow.addColorStop(1, lightColour + '00');
    cx.fillStyle = glow;
    cx.fillRect(M.light.x - 50, M.light.y - 50, 100, 100);
  }
  oval(cx, M.light.x, M.light.y, 6, 6, lightColour);
  // Group head and spout.
  rounded(cx, M.spout.x - 26, M.spout.y - 22, 52, 14, 5, '#2f2a2e');
  rounded(cx, M.spout.x - 10, M.spout.y - 10, 20, 10, 3, '#3a3336');
  rounded(cx, M.spout.x - 4, M.spout.y - 2, 8, 6, 2, '#2f2a2e');
  // Steam wand.
  cx.strokeStyle = '#c4ccce';
  cx.lineWidth = 4;
  cx.beginPath();
  cx.moveTo(M.x + M.w - 14, M.y + 34);
  cx.lineTo(M.x + M.w - 6, M.y + 74);
  cx.stroke();
  // Drip tray.
  rounded(cx, M.x + 14, M.y + M.h - 14, M.w - 28, 12, 3, '#2f2a2e');
  for (let x = M.x + 20; x < M.x + M.w - 20; x += 8) rounded(cx, x, M.y + M.h - 11, 4, 6, 1, '#4a4448');
  cx.restore();

  // The cup.
  const showCup = m.state === 'brewing' || (m.state === 'ready' && !m.hidden);
  if (!showCup) return;
  const drinkLook = DRINK_LOOK[m.drink ?? 'latte'] ?? DRINK_LOOK.latte;
  const lift = m.state === 'ready' && m.lifted ? -12 : 0;
  const cxp = M.cup.x;
  const cyp = M.cup.y + lift;
  if (m.state === 'brewing') {
    // Two streams from the spout into the cup; they thin out as it fills.
    const fill = m.progress;
    const flow = fill < 0.9 ? 1 : (1 - fill) / 0.1;
    cx.lineCap = 'round';
    for (const dx of [-4, 4]) {
      cx.strokeStyle = drinkLook.stream;
      cx.lineWidth = 5 * flow;
      cx.beginPath();
      cx.moveTo(cxp + dx, M.spout.y + 6);
      cx.lineTo(cxp + dx * 0.6 + Math.sin(m.time * 30 + dx) * 0.8, cyp - 10 - fill * 4);
      cx.stroke();
      cx.strokeStyle = drinkLook.streamHighlight;
      cx.lineWidth = 2 * flow;
      cx.stroke();
    }
    cx.lineCap = 'butt';
    cupWithFill(cx, cxp, cyp, 40, fill, false, m.drink);
    // Splash ring where the stream meets the coffee.
    if (flow > 0.2) {
      const r = 5 + Math.sin(m.time * 24) * 1.5;
      cx.strokeStyle = drinkLook.rich;
      cx.lineWidth = 1.5;
      cx.beginPath();
      cx.ellipse(cxp, cyp - 8 - fill * 6, r * 1.6, r * 0.5, 0, 0, Math.PI * 2);
      cx.stroke();
    }
    if (fill > 0.3) steam(cx, cxp, cyp - 20, m.time, (fill - 0.3) / 0.7);
  } else {
    if (m.pulse > 0) {
      cx.strokeStyle = `rgba(127, 227, 107, ${0.8 * m.pulse})`;
      cx.lineWidth = 4;
      cx.beginPath();
      cx.arc(cxp, cyp - 6, 22 + (1 - m.pulse) * 30, 0, Math.PI * 2);
      cx.stroke();
    }
    if (m.lifted) oval(cx, cxp, M.cup.y + 14, 18, 4, '#00000030');
    cupWithFill(cx, cxp, cyp, 40, 1, true, m.drink);
    steam(cx, cxp, cyp - 20, m.time, 1);
    // READY pill above the machine — shows drink type.
    const pillY = M.y - 52;
    rounded(cx, M.x + 4, pillY, M.w - 8, 26, 13, m.lifted ? '#ffb03a' : '#7fe36b', '#2c3a12', 3);
    const pillText = m.lifted ? 'IN HAND' : (drinkLook.label + ' READY');
    textAt(cx, pillText, M.x + M.w / 2, pillY + 19, 16, '#20300c', 1000);
  }
  if (m.ticket !== null) tag(cx, cxp + 30, cyp - 6, 14, m.ticket);
}

/**
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} s
 * @param {number} fill 0-1.
 * @param {boolean} art Draw latte art on a full cup.
 * @param {DrinkItem | null} [drink] Which drink for colour; defaults to latte.
 */
export function cupWithFill(cx, x, y, s, fill, art, drink) {
  const look = DRINK_LOOK[drink ?? 'latte'] ?? DRINK_LOOK.latte;
  cup(cx, x, y, s, false);
  // Repaint the inside with the current level.
  const innerW = s * 0.72;
  const innerTop = y - s * 0.26;
  rounded(cx, x - innerW / 2, innerTop, innerW, s * 0.2, s * 0.08, '#f4ead7');
  if (fill > 0) {
    const h = s * 0.2 * Math.min(1, fill);
    rounded(cx, x - innerW / 2, innerTop + s * 0.2 - h, innerW, h, s * 0.06, fill > 0.85 ? look.fill : look.stream);
  }
  if (art && fill >= 1) {
    cx.fillStyle = look.foam;
    cx.beginPath();
    cx.ellipse(x, innerTop + s * 0.1, s * 0.12, s * 0.06, 0, 0, Math.PI * 2);
    cx.fill();
  }
}

/**
 * Three wisps of steam whose strength follows `amount`.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} time Seconds.
 * @param {number} amount 0-1.
 */
export function steam(cx, x, y, time, amount) {
  if (amount <= 0) return;
  cx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const phase = (time * 0.8 + i / 3) % 1;
    const alpha = Math.sin(phase * Math.PI) * 0.75 * amount;
    cx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
    cx.lineWidth = 3;
    const bx = x + (i - 1) * 7;
    const by = y - phase * 26;
    cx.beginPath();
    cx.moveTo(bx, by);
    cx.bezierCurveTo(bx + 5, by - 6, bx - 5, by - 10, bx + Math.sin(time * 3 + i) * 3, by - 16);
    cx.stroke();
  }
  cx.lineCap = 'butt';
}

/**
 * @typedef {object} PassLook
 * @property {boolean} plated A croissant is on the pass.
 * @property {boolean} claimed The owner has taken it to hand over.
 * @property {boolean} lifted The player has picked it up.
 * @property {boolean} hidden It is being dragged.
 * @property {number | null} ticket
 * @property {number} pop 0-1, the moment it was plated.
 */

/**
 * @param {Ctx} cx
 * @param {PassLook} p
 * @param {(cx: Ctx, x: number, y: number, r: number, label: number | string) => void} tag
 */
export function drawPass(cx, p, tag) {
  if (!p.plated || p.claimed || p.hidden) return;
  const P = PROPS.pass;
  const lift = p.lifted ? -12 : -Math.sin(p.pop * Math.PI) * 6;
  if (p.lifted) oval(cx, P.x, P.y + 4, 30, 5, '#00000030');
  plate(cx, P.x, P.y + lift, 64, false);
  croissant(cx, P.x, P.y - 8 + lift, 40);
  if (p.ticket !== null) tag(cx, P.x + 44, P.y - 6 + lift, 14, p.ticket);
  if (p.lifted) {
    rounded(cx, P.x - 50, P.y - 60, 100, 24, 12, '#ffb03a', '#2c3a12', 3);
    textAt(cx, 'IN HAND', P.x, P.y - 42, 15, '#20300c', 1000);
  }
}

/**
 * @typedef {object} SinkLook
 * @property {number} dirty Dirty dishes waiting in the sink, not counting one being washed.
 * @property {number | null} washing Progress 0-1 of the dish being washed, or null.
 * @property {number} time Seconds.
 */

/**
 * The sink's contents and, while washing, running water and suds. The dish
 * being scrubbed is drawn in the owner's hands.
 * @param {Ctx} cx
 * @param {SinkLook} s
 */
export function drawSink(cx, s) {
  const S = PROPS.sink;
  const shown = Math.min(s.dirty, 5);
  for (let i = 0; i < shown; i++) {
    const x = S.basin.x - 34 + (i % 3) * 30;
    const y = S.basin.y + 6 - Math.floor(i / 3) * 8;
    plate(cx, x, y, 36, true);
  }
  if (s.dirty > 0) {
    oval(cx, S.x + S.w + 2, S.y - 10, 15, 15, '#d9534f');
    textAt(cx, String(s.dirty), S.x + S.w + 2, S.y - 3, 20, '#fff', 1000);
  }
  if (s.washing !== null) {
    // Running water.
    cx.strokeStyle = '#9fd6ffcc';
    cx.lineWidth = 4;
    cx.beginPath();
    cx.moveTo(S.tap.x, S.tap.y - 8);
    for (let i = 1; i <= 6; i++) cx.lineTo(S.tap.x + Math.sin(s.time * 25 + i) * 1.2, S.tap.y - 8 + i * 7);
    cx.stroke();
    // Suds: a fixed set of bubbles that rise and pop in turn.
    for (let i = 0; i < 9; i++) {
      const phase = (s.time * 0.7 + i * 0.137) % 1;
      const bx = S.basin.x - 44 + ((i * 37) % 88) + Math.sin(s.time * 2 + i) * 3;
      const by = S.basin.y + 4 - phase * 30;
      const r = 3 + ((i * 5) % 4) + phase * 2;
      cx.globalAlpha = Math.sin(phase * Math.PI) * 0.9;
      oval(cx, bx, by, r, r, '#ffffffcc');
      cx.strokeStyle = '#9fd6ff';
      cx.lineWidth = 1;
      cx.beginPath();
      cx.arc(bx, by, r, 0, Math.PI * 2);
      cx.stroke();
      cx.globalAlpha = 1;
    }
    for (let i = 0; i < 6; i++) oval(cx, S.basin.x - 40 + i * 16, S.basin.y + 12, 11, 6, '#ffffffbb');
  }
}

/**
 * Clean dishes standing in the rack above the sink.
 * @param {Ctx} cx
 * @param {number} clean
 * @param {number} arriving 0-1: a just-washed dish settling into the rack.
 */
export function drawRack(cx, clean, arriving) {
  const R = PROPS.rack;
  for (let i = 0; i < clean; i++) {
    const x = R.x + 14 + i * 24;
    const settle = i === clean - 1 && arriving > 0 ? -arriving * 10 : 0;
    oval(cx, x, R.y - 10 + settle, 6, 14, '#fffaf0');
    cx.strokeStyle = '#6d4b42';
    cx.lineWidth = 2;
    cx.beginPath();
    cx.ellipse(x, R.y - 10 + settle, 6, 14, 0, 0, Math.PI * 2);
    cx.stroke();
  }
  if (clean === 0) {
    rounded(cx, R.x - 4, R.y - 34, R.w + 8, 26, 8, '#d9534f');
    textAt(cx, 'NO CLEAN DISHES', R.x + R.w / 2, R.y - 16, 13, '#fff', 1000);
  }
}

/**
 * A chair seen from the front-left.
 * @param {Ctx} cx
 * @param {number} x Centre of the seat.
 * @param {number} y Seat height.
 * @param {'back' | 'seat'} part
 */
export function chair(cx, x, y, part) {
  if (part === 'back') {
    rounded(cx, x - 20, y - 54, 40, 50, 8, '#8a5a40', '#4a3231', 3);
    rounded(cx, x - 14, y - 46, 28, 8, 3, '#a8704e');
    rounded(cx, x - 14, y - 30, 28, 8, 3, '#a8704e');
  } else {
    rounded(cx, x - 24, y - 4, 48, 12, 5, '#a8704e', '#4a3231', 3);
    rounded(cx, x - 20, y + 8, 6, 34, 2, '#6a4636');
    rounded(cx, x + 14, y + 8, 6, 34, 2, '#6a4636');
  }
}

/**
 * @typedef {object} TableLook
 * @property {number} x Centre.
 * @property {number} y Centre of the top.
 * @property {number} dirt 0 clean, 1 fully dirty.
 * @property {number} shine 0-1, just wiped.
 */

/**
 * Table legs and top, with crumbs and rings that fade as it is wiped.
 * @param {Ctx} cx
 * @param {TableLook} t
 */
export function drawTableTop(cx, t) {
  oval(cx, t.x, t.y + 64, 74, 12, '#3b2a2030');
  // Pedestal and base.
  rounded(cx, t.x - 7, t.y + 6, 14, 56, 3, '#5f3c2e');
  rounded(cx, t.x - 30, t.y + 56, 60, 8, 4, '#5f3c2e');
  // Table underside (shadow ring).
  oval(cx, t.x, t.y + 6, 80, 26, '#7a4c33');
  // Table top with warm wood gradient.
  const tableGrad = cx.createRadialGradient(t.x - 10, t.y - 4, 10, t.x, t.y, 80);
  tableGrad.addColorStop(0, '#e0b47a');
  tableGrad.addColorStop(1, '#d0a060');
  cx.fillStyle = tableGrad;
  cx.beginPath();
  cx.ellipse(t.x, t.y, 80, 26, 0, 0, Math.PI * 2);
  cx.fill();
  cx.strokeStyle = '#51392f';
  cx.lineWidth = 4;
  cx.beginPath();
  cx.ellipse(t.x, t.y, 80, 26, 0, 0, Math.PI * 2);
  cx.stroke();
  // Warm highlight on the table top.
  oval(cx, t.x - 20, t.y - 8, 40, 8, '#ffffff28');
  oval(cx, t.x - 30, t.y - 4, 20, 5, '#ffffff12');
  if (t.dirt > 0.01) {
    cx.globalAlpha = Math.min(1, t.dirt);
    cx.strokeStyle = '#8a5a3c';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.ellipse(t.x + 30, t.y - 2, 13, 5, 0, 0, Math.PI * 2);
    cx.stroke();
    for (const [dx, dy, r] of [[-40, -6, 4], [-24, 6, 3], [-8, -4, 3.5], [8, 8, 2.5], [-52, 4, 3], [50, 8, 3]]) oval(cx, t.x + dx, t.y + dy, r, r * 0.7, '#7a4a2a');
    oval(cx, t.x - 10, t.y + 2, 16, 6, '#b9814a66');
    cx.globalAlpha = 1;
  }
  if (t.shine > 0) {
    const a = Math.sin(t.shine * Math.PI);
    sparkle(cx, t.x - 30 + (1 - t.shine) * 60, t.y - 6, 4 + a * 4, `rgba(255, 255, 255, ${a.toFixed(3)})`);
    sparkle(cx, t.x + 34, t.y - 10, 2 + a * 3, `rgba(255, 255, 255, ${(a * 0.8).toFixed(3)})`);
  }
}

/**
 * A wiping cloth.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 */
export function cloth(cx, x, y) {
  cx.save();
  cx.translate(x, y);
  cx.rotate(-0.25);
  rounded(cx, -14, -8, 28, 16, 5, '#6fb3ee', '#2f6fb0', 2);
  cx.strokeStyle = '#ffffff88';
  cx.lineWidth = 1.5;
  cx.beginPath();
  cx.moveTo(-10, -2);
  cx.lineTo(10, -2);
  cx.moveTo(-10, 3);
  cx.lineTo(10, 3);
  cx.stroke();
  cx.restore();
}

/**
 * A dish in someone's hands, from dirty to clean.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} clean 0-1.
 */
export function dishInHand(cx, x, y, clean) {
  const c = Math.max(0, Math.min(1, clean));
  oval(cx, x, y, 22, 9, c > 0.95 ? '#fffaf0' : shade('#fffaf0', -0.2 * (1 - c)));
  cx.strokeStyle = '#6d4b42';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.ellipse(x, y, 22, 9, 0, 0, Math.PI * 2);
  cx.stroke();
  if (c < 0.98) {
    cx.globalAlpha = 1 - c;
    oval(cx, x - 6, y, 6, 3, '#8a5a3c');
    oval(cx, x + 7, y + 2, 4, 2, '#8a5a3c');
    cx.globalAlpha = 1;
  }
}
