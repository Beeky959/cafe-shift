// @ts-check
/**
 * Characters as layered vector rigs: the café owner, a small cast of guests,
 * and Byte. Each is drawn from a pose (limb angles, hand targets, expression)
 * so animation comes from changing the pose, never from swapping a picture.
 *
 * Origin is the point between the feet (or the seat, when sitting); up is
 * negative y. One unit is one scene unit at scale 1. Standing height is about
 * 150 units.
 */
import { oval, rounded, textAt } from './art.js';

/** @typedef {CanvasRenderingContext2D} Ctx */

/**
 * @typedef {object} Look
 * @property {string} skin
 * @property {string} hair
 * @property {'bun' | 'curly' | 'short' | 'beanie' | 'long' | 'side' | 'quiff'} hairStyle
 * @property {string} top
 * @property {string} topShade
 * @property {string} pants
 * @property {string} shoes
 * @property {boolean} [glasses]
 * @property {string} [beanie]
 * @property {string} [scarf]
 * @property {string} [apron]
 * @property {number} [height] Multiplier, about 0.94 to 1.06.
 */

/** The guest cast: six people who look clearly different at a glance. */
export const CAST = /** @type {readonly Look[]} */ ([
  { skin: '#f1c7a1', hair: '#3b2a24', hairStyle: 'bun', top: '#5f8f8a', topShade: '#4b7471', pants: '#3d4756', shoes: '#2b2626', height: 0.97 },
  { skin: '#8d5a3b', hair: '#1f1a18', hairStyle: 'curly', top: '#d9a34e', topShade: '#b98538', pants: '#5a4a42', shoes: '#2b2626', height: 1.03 },
  { skin: '#e8b48a', hair: '#c47a3a', hairStyle: 'short', top: '#7d79b5', topShade: '#65619a', pants: '#36404f', shoes: '#4a3a33', glasses: true, height: 1.0 },
  { skin: '#5e3b28', hair: '#1c1714', hairStyle: 'beanie', beanie: '#c0504d', top: '#7ea273', topShade: '#64875b', pants: '#2f3542', shoes: '#2b2626', scarf: '#e8c15a', height: 1.05 },
  { skin: '#f5d3b5', hair: '#e3c27a', hairStyle: 'long', top: '#e38e6f', topShade: '#c97458', pants: '#40506a', shoes: '#6b4a3a', height: 0.95 },
  { skin: '#b9825c', hair: '#4a3229', hairStyle: 'side', top: '#b06f76', topShade: '#935a61', pants: '#3a3a44', shoes: '#2b2626', glasses: true, height: 1.01 },
]);

/** The café owner. */
export const OWNER = /** @type {Look} */ ({
  skin: '#c98d64',
  hair: '#3a2620',
  hairStyle: 'quiff',
  top: '#f4ead7',
  topShade: '#ddd0b8',
  pants: '#3b3534',
  shoes: '#2b2626',
  apron: '#2f5d50',
  height: 1.04,
});

/**
 * @typedef {object} Face
 * @property {'open' | 'closed' | 'happy' | 'worried' | 'wide' | 'down'} [eyes]
 * @property {'smile' | 'grin' | 'neutral' | 'frown' | 'open' | 'o' | 'talk'} [mouth]
 * @property {'none' | 'worried' | 'cross' | 'raised'} [brows]
 * @property {number} [lookX] Pupil offset, -1 to 1.
 * @property {number} [lookY]
 * @property {boolean} [blush]
 * @property {boolean} [sweat]
 */

/**
 * @typedef {object} Pose
 * @property {number} [stride] Walk cycle phase in radians; legs swing with sin(stride).
 * @property {number} [walk] 0 standing, 1 full walking swing.
 * @property {number} [bob] Vertical offset of the whole body.
 * @property {number} [lean] Body lean in radians, positive leans right.
 * @property {number} [facing] 1 faces right, -1 faces left. Only the head turn and arms use it.
 * @property {{ x: number, y: number } | null} [leftHand] Target for the left hand, relative to the origin. Null for the rest pose.
 * @property {{ x: number, y: number } | null} [rightHand]
 * @property {number} [armSwing] Rest-pose arm swing, radians.
 * @property {boolean} [crossedArms]
 * @property {boolean} [seated]
 * @property {number} [footTap] 0-1 lift of the right foot.
 * @property {Face} [face]
 * @property {((cx: Ctx, x: number, y: number) => void) | null} [holdLeft] Draws what the left hand holds.
 * @property {((cx: Ctx, x: number, y: number) => void) | null} [holdRight]
 * @property {boolean} [hideLegs] For figures standing behind the counter.
 */

const HIP_Y = -64;
const SHOULDER_Y = -116;
const HEAD_Y = -140;
const LEG = 64;
const UPPER_ARM = 29;
const FOREARM = 29;

/**
 * Places an elbow between a shoulder and a hand so the two arm segments keep
 * their length where they can, bending outward.
 * @param {number} sx
 * @param {number} sy
 * @param {number} hx
 * @param {number} hy
 * @param {number} side -1 for the figure's right side (screen left), 1 for the left.
 */
function elbow(sx, sy, hx, hy, side) {
  const dx = hx - sx;
  const dy = hy - sy;
  const d = Math.max(1, Math.hypot(dx, dy));
  const reach = UPPER_ARM + FOREARM;
  const along = Math.min(d, reach) / 2;
  const out = Math.sqrt(Math.max(0, UPPER_ARM * UPPER_ARM - along * along));
  const mx = sx + (dx / d) * along;
  const my = sy + (dy / d) * along;
  // Perpendicular, pointing outward and slightly down.
  let px = -dy / d;
  let py = dx / d;
  if (px * side < 0 || (px === 0 && py < 0)) {
    px = -px;
    py = -py;
  }
  return { x: mx + px * out, y: my + py * out };
}

/**
 * @param {Ctx} cx
 * @param {number} sx
 * @param {number} sy
 * @param {number} hx
 * @param {number} hy
 * @param {number} side
 * @param {Look} look
 */
function arm(cx, sx, sy, hx, hy, side, look) {
  // Clamp the hand to what the arm can reach.
  const d = Math.hypot(hx - sx, hy - sy);
  const reach = UPPER_ARM + FOREARM - 1;
  if (d > reach) {
    hx = sx + ((hx - sx) / d) * reach;
    hy = sy + ((hy - sy) / d) * reach;
  }
  const e = elbow(sx, sy, hx, hy, side);
  cx.lineCap = 'round';
  cx.lineJoin = 'round';
  cx.strokeStyle = '#3a2a2a';
  cx.lineWidth = 13;
  cx.beginPath();
  cx.moveTo(sx, sy);
  cx.lineTo(e.x, e.y);
  cx.lineTo(hx, hy);
  cx.stroke();
  cx.strokeStyle = look.top;
  cx.lineWidth = 10;
  cx.beginPath();
  cx.moveTo(sx, sy);
  cx.lineTo(e.x, e.y);
  cx.stroke();
  cx.strokeStyle = look.topShade;
  cx.beginPath();
  cx.moveTo(e.x, e.y);
  cx.lineTo(hx, hy);
  cx.stroke();
  oval(cx, hx, hy, 6, 6, look.skin);
  cx.strokeStyle = '#3a2a2a';
  cx.lineWidth = 1.5;
  cx.beginPath();
  cx.arc(hx, hy, 6, 0, Math.PI * 2);
  cx.stroke();
  cx.lineCap = 'butt';
  return { x: hx, y: hy };
}

/**
 * @param {Ctx} cx
 * @param {number} hx Hip x.
 * @param {number} angle
 * @param {number} lift
 * @param {Look} look
 * @param {boolean} back Drawn behind the other leg, a little darker.
 */
function leg(cx, hx, angle, lift, look, back) {
  const fx = hx + Math.sin(angle) * LEG;
  const fy = HIP_Y + Math.cos(angle) * LEG - lift;
  cx.lineCap = 'round';
  cx.strokeStyle = '#2a2224';
  cx.lineWidth = 15;
  cx.beginPath();
  cx.moveTo(hx, HIP_Y);
  cx.lineTo(fx, fy);
  cx.stroke();
  cx.strokeStyle = back ? shade(look.pants, -0.12) : look.pants;
  cx.lineWidth = 12;
  cx.beginPath();
  cx.moveTo(hx, HIP_Y);
  cx.lineTo(fx, fy);
  cx.stroke();
  cx.lineCap = 'butt';
  oval(cx, fx + 3, fy + 1, 10, 5, look.shoes);
}

/**
 * Lightens (positive) or darkens (negative) a #rrggbb colour.
 * @param {string} hex
 * @param {number} amount -1 to 1.
 */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (/** @type {number} */ v) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * @param {Ctx} cx
 * @param {Look} look
 * @param {'back' | 'front'} layer
 */
function hair(cx, look, layer) {
  const c = look.hair;
  const y = HEAD_Y;
  switch (look.hairStyle) {
    case 'bun':
      if (layer === 'back') {
        oval(cx, 0, y - 24, 11, 10, c);
        oval(cx, 0, y - 4, 23, 22, c);
      } else {
        cx.fillStyle = c;
        cx.beginPath();
        cx.ellipse(0, y - 9, 22, 15, 0, Math.PI, Math.PI * 2);
        cx.fill();
        oval(cx, -14, y - 6, 8, 9, c);
      }
      break;
    case 'curly':
      if (layer === 'back') {
        for (const [dx, dy, r] of [[-17, -2, 10], [17, -2, 10], [-13, -16, 11], [13, -16, 11], [0, -22, 12], [-20, 10, 8], [20, 10, 8]]) oval(cx, dx, y + dy, r, r, c);
      } else {
        for (const [dx, dy, r] of [[-12, -15, 8], [0, -18, 9], [12, -15, 8]]) oval(cx, dx, y + dy, r, r, c);
      }
      break;
    case 'short':
      if (layer === 'front') {
        cx.fillStyle = c;
        cx.beginPath();
        cx.ellipse(0, y - 8, 22, 16, 0, Math.PI * 1.02, Math.PI * 1.98);
        cx.fill();
        cx.beginPath();
        cx.moveTo(-20, y - 8);
        cx.quadraticCurveTo(-6, y - 2, 6, y - 14);
        cx.quadraticCurveTo(14, y - 6, 21, y - 8);
        cx.lineTo(21, y - 14);
        cx.lineTo(-20, y - 14);
        cx.fill();
      }
      break;
    case 'beanie':
      if (layer === 'front') {
        const b = look.beanie ?? '#c0504d';
        cx.fillStyle = b;
        cx.beginPath();
        cx.ellipse(0, y - 9, 23, 19, 0, Math.PI, Math.PI * 2);
        cx.fill();
        rounded(cx, -24, y - 12, 48, 9, 4, shade(b, -0.18));
        oval(cx, 0, y - 30, 6, 6, shade(b, 0.35));
      }
      break;
    case 'long':
      if (layer === 'back') {
        rounded(cx, -24, y - 18, 48, 54, 18, c);
      } else {
        cx.fillStyle = c;
        cx.beginPath();
        cx.ellipse(0, y - 8, 23, 16, 0, Math.PI, Math.PI * 2);
        cx.fill();
        cx.beginPath();
        cx.moveTo(-22, y - 8);
        cx.quadraticCurveTo(-4, y - 4, 4, y - 18);
        cx.lineTo(-22, y - 18);
        cx.fill();
      }
      break;
    case 'side':
      if (layer === 'front') {
        cx.fillStyle = c;
        cx.beginPath();
        cx.ellipse(0, y - 9, 22, 15, 0, Math.PI, Math.PI * 2);
        cx.fill();
        cx.beginPath();
        cx.moveTo(-22, y - 9);
        cx.quadraticCurveTo(-10, y - 18, 22, y - 6);
        cx.lineTo(22, y - 14);
        cx.quadraticCurveTo(0, y - 28, -22, y - 14);
        cx.fill();
      }
      break;
    default: // quiff, the owner
      if (layer === 'front') {
        cx.fillStyle = c;
        cx.beginPath();
        cx.ellipse(0, y - 9, 22, 15, 0, Math.PI, Math.PI * 2);
        cx.fill();
        cx.beginPath();
        cx.moveTo(-18, y - 14);
        cx.quadraticCurveTo(-6, y - 34, 16, y - 26);
        cx.quadraticCurveTo(10, y - 18, 20, y - 12);
        cx.lineTo(-18, y - 12);
        cx.fill();
      }
  }
}

/**
 * @param {Ctx} cx
 * @param {Look} look
 * @param {Face} face
 * @param {number} turn -1 to 1: how far the head is turned to the side.
 */
function head(cx, look, face, turn) {
  const y = HEAD_Y;
  hair(cx, look, 'back');
  // Neck and ears.
  rounded(cx, -6, y + 14, 12, 12, 4, shade(look.skin, -0.12));
  oval(cx, -21 + turn * 3, y + 2, 4, 6, shade(look.skin, -0.06));
  oval(cx, 21 + turn * 3, y + 2, 4, 6, shade(look.skin, -0.06));
  // Face.
  oval(cx, 0, y, 21, 22, look.skin);
  cx.strokeStyle = '#3a2a2a';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.ellipse(0, y, 21, 22, 0, 0, Math.PI * 2);
  cx.stroke();

  const ex = 8;
  const ey = y - 1;
  const fx = turn * 5;
  const lookX = (face.lookX ?? 0) * 1.8 + turn * 1.2;
  const lookY = (face.lookY ?? 0) * 1.5;
  const ink = '#2b2223';
  cx.fillStyle = ink;
  cx.strokeStyle = ink;
  cx.lineWidth = 2.4;
  cx.lineCap = 'round';
  switch (face.eyes ?? 'open') {
    case 'closed':
      for (const s of [-1, 1]) {
        cx.beginPath();
        cx.moveTo(fx + s * ex - 3.5, ey + 1);
        cx.lineTo(fx + s * ex + 3.5, ey + 1);
        cx.stroke();
      }
      break;
    case 'happy':
      for (const s of [-1, 1]) {
        cx.beginPath();
        cx.arc(fx + s * ex, ey + 2, 4, Math.PI * 1.15, Math.PI * 1.85);
        cx.stroke();
      }
      break;
    case 'down':
      for (const s of [-1, 1]) {
        cx.beginPath();
        cx.arc(fx + s * ex, ey - 1, 3.6, Math.PI * 0.15, Math.PI * 0.85);
        cx.stroke();
      }
      break;
    case 'wide':
      for (const s of [-1, 1]) {
        oval(cx, fx + s * ex, ey, 3.8, 4.4, '#fff');
        cx.lineWidth = 1.5;
        cx.beginPath();
        cx.ellipse(fx + s * ex, ey, 3.8, 4.4, 0, 0, Math.PI * 2);
        cx.stroke();
        oval(cx, fx + s * ex + lookX, ey + lookY, 2, 2.3, ink);
      }
      break;
    default:
      for (const s of [-1, 1]) oval(cx, fx + s * ex + lookX, ey + lookY, 2.5, 3, ink);
  }
  // Brows.
  cx.lineWidth = 2.2;
  const brows = face.brows ?? (face.eyes === 'worried' ? 'worried' : 'none');
  if (brows !== 'none') {
    for (const s of [-1, 1]) {
      const inner = brows === 'worried' ? -3 : brows === 'cross' ? 2.5 : -1.5;
      const outer = brows === 'worried' ? 1 : brows === 'cross' ? -2 : -1.5;
      cx.beginPath();
      cx.moveTo(fx + s * (ex - 4), ey - 8 + inner);
      cx.lineTo(fx + s * (ex + 4), ey - 8 + outer);
      cx.stroke();
    }
  }
  if (face.eyes === 'worried') {
    for (const s of [-1, 1]) oval(cx, fx + s * ex + lookX, ey + 1 + lookY, 2.4, 2.8, ink);
  }
  if (look.glasses) {
    cx.strokeStyle = '#2b2223';
    cx.lineWidth = 1.8;
    for (const s of [-1, 1]) {
      cx.beginPath();
      cx.ellipse(fx + s * ex, ey, 6.5, 5.5, 0, 0, Math.PI * 2);
      cx.stroke();
    }
    cx.beginPath();
    cx.moveTo(fx - ex + 6.5, ey);
    cx.lineTo(fx + ex - 6.5, ey);
    cx.stroke();
  }
  // Cheeks.
  if (face.blush) {
    oval(cx, fx - 12, y + 6, 4.5, 2.6, '#e9806e88');
    oval(cx, fx + 12, y + 6, 4.5, 2.6, '#e9806e88');
  }
  // Mouth.
  const my = y + 10;
  cx.lineWidth = 2.2;
  cx.strokeStyle = '#6b3b2e';
  switch (face.mouth ?? 'smile') {
    case 'grin':
      cx.fillStyle = '#6b2a24';
      cx.beginPath();
      cx.arc(fx, my - 1, 6, 0.05, Math.PI - 0.05);
      cx.closePath();
      cx.fill();
      oval(cx, fx, my + 3, 3, 1.6, '#e9806e');
      break;
    case 'neutral':
      cx.beginPath();
      cx.moveTo(fx - 4, my + 1);
      cx.lineTo(fx + 4, my + 1);
      cx.stroke();
      break;
    case 'frown':
      cx.beginPath();
      cx.arc(fx, my + 6, 5, Math.PI * 1.2, Math.PI * 1.8);
      cx.stroke();
      break;
    case 'open':
    case 'talk':
      oval(cx, fx, my + 1, 3.6, face.mouth === 'talk' ? 2.6 : 3.6, '#6b2a24');
      break;
    case 'o':
      oval(cx, fx, my + 1, 2.4, 2.8, '#6b2a24');
      break;
    default:
      cx.beginPath();
      cx.arc(fx, my - 2, 5, 0.25, Math.PI - 0.25);
      cx.stroke();
  }
  cx.lineCap = 'butt';
  if (face.sweat) {
    cx.fillStyle = '#9fd6ff';
    cx.beginPath();
    cx.moveTo(fx + 20, y - 14);
    cx.quadraticCurveTo(fx + 25, y - 6, fx + 20, y - 4);
    cx.quadraticCurveTo(fx + 15, y - 6, fx + 20, y - 14);
    cx.fill();
  }
  hair(cx, look, 'front');
}

/**
 * Draws a person. Arms behind the body are drawn first, so a hand reaching
 * across the body passes in front of it.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y Feet, or seat when seated.
 * @param {number} scale
 * @param {Look} look
 * @param {Pose} pose
 */
export function person(cx, x, y, scale, look, pose) {
  const s = scale * (look.height ?? 1);
  const facing = pose.facing ?? 0;
  cx.save();
  cx.translate(x, y + (pose.bob ?? 0));
  cx.scale(s, s);

  if (!pose.hideLegs && !pose.seated) {
    oval(cx, 0, 3, 34, 9, '#3b2a2014');
    oval(cx, 0, 2, 28, 7, '#3b2a2028');
  }

  // Seated figures are drawn from the hips up, raised onto the seat.
  if (pose.seated) cx.translate(0, -HIP_Y - 6);
  cx.rotate(pose.lean ?? 0);

  // Legs.
  if (!pose.hideLegs && !pose.seated) {
    const swing = Math.sin(pose.stride ?? 0) * 0.42 * (pose.walk ?? 0);
    const liftA = Math.max(0, Math.sin(pose.stride ?? 0)) * 6 * (pose.walk ?? 0);
    const liftB = Math.max(0, -Math.sin(pose.stride ?? 0)) * 6 * (pose.walk ?? 0);
    leg(cx, -9, swing, liftA, look, true);
    leg(cx, 9, -swing, Math.max(liftB, (pose.footTap ?? 0) * 7), look, false);
  }

  const sL = { x: 19, y: SHOULDER_Y + 4 };
  const sR = { x: -19, y: SHOULDER_Y + 4 };
  const swingA = pose.armSwing ?? Math.sin(pose.stride ?? 0) * 0.35 * (pose.walk ?? 0);
  const rest = (/** @type {number} */ side, /** @type {number} */ a) => ({ x: side * 24 + Math.sin(a) * 18, y: SHOULDER_Y + 44 + Math.cos(a) * 2 });
  const handR = pose.rightHand ?? (pose.crossedArms ? { x: 10, y: -92 } : rest(-1, swingA));
  const handL = pose.leftHand ?? (pose.crossedArms ? { x: -10, y: -88 } : rest(1, -swingA));
  // A hand whose target is on the far side of the body is drawn in front.
  const leftFront = handL.x < 6 || facing < 0;
  const rightFront = handR.x > -6 || facing > 0 || pose.crossedArms;

  /** @type {{ x: number, y: number } | null} */
  let drawnL = null;
  /** @type {{ x: number, y: number } | null} */
  let drawnR = null;
  if (!leftFront) drawnL = arm(cx, sL.x, sL.y, handL.x, handL.y, 1, look);
  if (!rightFront) drawnR = arm(cx, sR.x, sR.y, handR.x, handR.y, -1, look);

  // Torso.
  cx.fillStyle = '#3a2a2a';
  cx.beginPath();
  cx.roundRect(-23, SHOULDER_Y - 4, 46, HIP_Y - SHOULDER_Y + 10, [14, 14, 9, 9]);
  cx.fill();
  cx.fillStyle = look.top;
  cx.beginPath();
  cx.roundRect(-21, SHOULDER_Y - 2, 42, HIP_Y - SHOULDER_Y + 6, [12, 12, 7, 7]);
  cx.fill();
  cx.fillStyle = look.topShade;
  cx.fillRect(-21, HIP_Y - 10, 42, 6);
  if (look.apron) {
    cx.fillStyle = look.apron;
    cx.beginPath();
    cx.roundRect(-16, SHOULDER_Y + 10, 32, HIP_Y - SHOULDER_Y + 4, [6, 6, 4, 4]);
    cx.fill();
    rounded(cx, -8, HIP_Y - 26, 16, 10, 3, shade(look.apron, -0.2));
    cx.strokeStyle = look.apron;
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(-14, SHOULDER_Y + 12);
    cx.lineTo(-8, SHOULDER_Y - 2);
    cx.moveTo(14, SHOULDER_Y + 12);
    cx.lineTo(8, SHOULDER_Y - 2);
    cx.stroke();
  }
  if (look.scarf) {
    rounded(cx, -16, SHOULDER_Y - 6, 32, 10, 5, look.scarf);
    rounded(cx, 4, SHOULDER_Y + 2, 9, 20, 4, shade(look.scarf, -0.12));
  }
  if (pose.seated) {
    // Lap, seen from the front.
    rounded(cx, -21, HIP_Y - 6, 42, 14, 6, look.pants);
  }

  head(cx, look, pose.face ?? {}, facing);

  if (leftFront) drawnL = arm(cx, sL.x, sL.y, handL.x, handL.y, 1, look);
  if (rightFront) drawnR = arm(cx, sR.x, sR.y, handR.x, handR.y, -1, look);
  if (pose.holdLeft && drawnL) pose.holdLeft(cx, drawnL.x, drawnL.y);
  if (pose.holdRight && drawnR) pose.holdRight(cx, drawnR.x, drawnR.y);
  cx.restore();
}

/**
 * @typedef {'neutral' | 'happy' | 'thinking' | 'worried' | 'alert' | 'celebrate' | 'sad'} ByteExpression
 */

/**
 * @typedef {object} BytePose
 * @property {ByteExpression} expression
 * @property {number} hover Vertical hover offset.
 * @property {number} blink 0 open, 1 closed.
 * @property {number} talk 0 silent, 1 speaking: the visor shows a voice bar.
 * @property {number} time Visual clock, seconds, for small cycles.
 * @property {number} [lookX] -1 to 1.
 */

/**
 * Byte: rounded white helmet, black visor, neon-lime eyes, glowing antenna,
 * side modules, dark hoodie with a code symbol. Origin at the base of the
 * hover shadow. About 125 units tall at scale 1.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} scale
 * @param {BytePose} pose
 */
export function byte(cx, x, y, scale, pose) {
  const e = pose.expression;
  const lime = '#b8ff3c';
  const glow = e === 'alert' ? '#ffb03a' : e === 'sad' || e === 'worried' ? '#9fd0ff' : lime;
  const celebrate = e === 'celebrate';
  const jump = celebrate ? -Math.abs(Math.sin(pose.time * 7)) * 8 : 0;
  cx.save();
  cx.translate(x, y);
  cx.scale(scale, scale);
  // Hover shadow shrinks as Byte rises.
  const rise = pose.hover + jump;
  oval(cx, 0, 0, 30 + rise * 0.6, 7 + rise * 0.15, '#2a1d1838');
  cx.translate(0, -14 + rise);
  if (e === 'worried' || e === 'sad') cx.rotate(Math.sin(pose.time * 2.2) * 0.03);

  // Arms, behind the hoodie.
  cx.lineCap = 'round';
  cx.strokeStyle = '#1b1e26';
  cx.lineWidth = 10;
  const armUp = celebrate ? 1 : e === 'alert' ? 0.4 : 0;
  for (const side of [-1, 1]) {
    const wave = celebrate ? Math.sin(pose.time * 9 + side) * 0.2 : 0;
    const ax = side * (30 + armUp * 4);
    const ay = -28 - armUp * 34 + wave * 10;
    cx.beginPath();
    cx.moveTo(side * 20, -38);
    cx.quadraticCurveTo(side * 34, -32 - armUp * 10, ax, ay);
    cx.stroke();
    oval(cx, ax, ay, 6, 6, '#e9edf0');
  }
  cx.lineCap = 'butt';

  // Hoodie.
  cx.fillStyle = '#20232d';
  cx.beginPath();
  cx.roundRect(-27, -52, 54, 50, [18, 18, 14, 14]);
  cx.fill();
  cx.strokeStyle = '#0f1117';
  cx.lineWidth = 3;
  cx.stroke();
  rounded(cx, -20, -24, 40, 14, 6, '#2b2f3b');
  // Drawstrings.
  cx.strokeStyle = '#d9dee3';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.moveTo(-7, -50);
  cx.lineTo(-8, -36);
  cx.moveTo(7, -50);
  cx.lineTo(8, -36);
  cx.stroke();
  textAt(cx, '</>', 0, -14, 13, lime, 1000);

  // Hood rim behind the helmet.
  oval(cx, 0, -54, 34, 12, '#2b2f3b');

  // Antenna.
  cx.strokeStyle = '#7b868c';
  cx.lineWidth = 3.5;
  cx.beginPath();
  cx.moveTo(0, -112);
  cx.quadraticCurveTo(Math.sin(pose.time * 1.7) * 3, -122, Math.sin(pose.time * 1.7) * 2, -130);
  cx.stroke();
  const pulse = e === 'alert' ? 0.5 + 0.5 * Math.sin(pose.time * 14) : 0.75 + 0.25 * Math.sin(pose.time * 3);
  oval(cx, Math.sin(pose.time * 1.7) * 2, -132, 11 * pulse, 11 * pulse, glow + '44');
  oval(cx, Math.sin(pose.time * 1.7) * 2, -132, 6, 6, glow);

  // Side modules.
  for (const side of [-1, 1]) {
    oval(cx, side * 37, -84, 8, 13, '#9aa5ab');
    oval(cx, side * 38, -84, 4.5, 8, '#3a434a');
    oval(cx, side * 38, -84, 2.2, 4, glow);
  }

  // Helmet.
  cx.fillStyle = '#f2f4f2';
  cx.beginPath();
  cx.roundRect(-36, -114, 72, 64, 28);
  cx.fill();
  cx.strokeStyle = '#262a35';
  cx.lineWidth = 4;
  cx.stroke();
  cx.fillStyle = '#ffffff';
  cx.beginPath();
  cx.ellipse(-16, -103, 12, 5, -0.35, 0, Math.PI * 2);
  cx.fill();

  // Visor.
  rounded(cx, -28, -101, 56, 38, 16, '#151a20');
  cx.fillStyle = '#ffffff12';
  cx.beginPath();
  cx.roundRect(-24, -98, 40, 8, 6);
  cx.fill();

  // Eyes.
  const lx = (pose.lookX ?? 0) * 3;
  const eyeY = -83;
  const blinkScale = 1 - pose.blink;
  cx.shadowColor = glow;
  cx.shadowBlur = 8;
  cx.fillStyle = glow;
  cx.strokeStyle = glow;
  cx.lineWidth = 3.5;
  cx.lineCap = 'round';
  if (pose.blink > 0.6) {
    for (const s of [-1, 1]) {
      cx.beginPath();
      cx.moveTo(s * 11 - 5 + lx, eyeY + 1);
      cx.lineTo(s * 11 + 5 + lx, eyeY + 1);
      cx.stroke();
    }
  } else if (e === 'happy' || e === 'celebrate') {
    for (const s of [-1, 1]) {
      cx.beginPath();
      cx.arc(s * 11 + lx, eyeY + 4, 6, Math.PI * 1.15, Math.PI * 1.85);
      cx.stroke();
    }
  } else if (e === 'thinking') {
    oval(cx, -11 + 2, eyeY - 1, 5, 6.5 * blinkScale, glow);
    cx.beginPath();
    cx.moveTo(11 - 5 + 2, eyeY - 1);
    cx.lineTo(11 + 5 + 2, eyeY - 3);
    cx.stroke();
  } else if (e === 'worried' || e === 'sad') {
    for (const s of [-1, 1]) {
      cx.beginPath();
      cx.ellipse(s * 11 + lx, eyeY + 1, 5, (e === 'sad' ? 4 : 6) * blinkScale, 0, 0, Math.PI * 2);
      cx.fill();
    }
    cx.fillStyle = '#151a20';
    for (const s of [-1, 1]) {
      cx.beginPath();
      cx.moveTo(s * 4 + lx, eyeY - 8);
      cx.lineTo(s * 18 + lx, eyeY - 8);
      cx.lineTo(s * 4 + lx, eyeY - 2 + (e === 'sad' ? 2 : 0));
      cx.fill();
    }
  } else if (e === 'alert') {
    for (const s of [-1, 1]) oval(cx, s * 11 + lx, eyeY, 6.5, 8.5 * blinkScale, glow);
  } else {
    for (const s of [-1, 1]) oval(cx, s * 11 + lx, eyeY, 5, 7 * blinkScale, glow);
  }
  // A voice bar under the eyes while Byte is speaking.
  if (pose.talk > 0.05) {
    cx.lineWidth = 2.5;
    cx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const bx = -11 + i * 2.75;
      const by = -70 - Math.abs(Math.sin(pose.time * 18 + i * 1.3)) * 4 * pose.talk;
      if (i === 0) cx.moveTo(bx, by);
      else cx.lineTo(bx, by);
    }
    cx.stroke();
  }
  cx.shadowBlur = 0;
  cx.lineCap = 'butt';

  // Small signs above Byte.
  if (e === 'alert') {
    rounded(cx, 30, -140, 22, 28, 8, '#ffb03a', '#3a2c2c', 2.5);
    textAt(cx, '!', 41, -118, 24, '#3a2c2c', 1000);
  } else if (e === 'thinking') {
    for (const [i, r] of [[0, 3], [1, 4], [2, 5]]) oval(cx, 32 + i * 9, -118 - i * 8, r, r, '#f2f4f2');
  } else if (e === 'worried' || e === 'sad') {
    cx.fillStyle = '#9fd6ff';
    cx.beginPath();
    cx.moveTo(34, -108);
    cx.quadraticCurveTo(40, -98, 34, -95);
    cx.quadraticCurveTo(28, -98, 34, -108);
    cx.fill();
  } else if (celebrate) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + pose.time * 2;
      const r = 54 + Math.sin(pose.time * 6 + i) * 4;
      sparkle(cx, Math.cos(a) * r, -80 + Math.sin(a) * r * 0.6, 5, i % 2 ? '#ffd45a' : lime);
    }
  }
  cx.restore();
}

/**
 * A four-pointed sparkle.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {string} color
 */
export function sparkle(cx, x, y, r, color) {
  cx.fillStyle = color;
  cx.beginPath();
  cx.moveTo(x, y - r * 2);
  cx.quadraticCurveTo(x, y, x + r * 2, y);
  cx.quadraticCurveTo(x, y, x, y + r * 2);
  cx.quadraticCurveTo(x, y, x - r * 2, y);
  cx.quadraticCurveTo(x, y, x, y - r * 2);
  cx.fill();
}
