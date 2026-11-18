// @ts-check
/**
 * Scene layout as data: where everything is, and what can be tapped.
 * Logical units on a 960 x 720 scene; the renderer scales them uniformly.
 * No DOM here, so the layout rules can be tested in Node.
 * Rules: docs/TECH_BLUEPRINT.md §6.
 */
/** @import { Target } from '../sim/types.js' */

export const SCENE_WIDTH = 960;
export const SCENE_HEIGHT = 720;

/** Smallest allowed hit rectangle side: 128 logical = 48 px on a 360 px-wide screen. */
export const MIN_HIT_SIZE = 128;
/** Smallest allowed gap between hit rectangles: 22 logical = 8 px at 360. */
export const MIN_HIT_GAP = 22;
/** A tap this close to a rectangle's edge still selects it: 16 logical = 6 px at 360. */
export const NEAR_MISS = 16;

/**
 * @typedef {object} HitArea
 * @property {string} id Stable name, also used for DOM ids.
 * @property {Target} target
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {string} key Keyboard shortcut.
 * @property {number} rank Tie-break order for equally near taps; lower wins.
 * @property {boolean} [info] Info-only area: smaller sizes allowed, overlaps with stations tolerated.
 */

/** @type {readonly HitArea[]} */
export const HIT_AREAS = Object.freeze([
  { id: 'machine', target: { kind: 'machine' }, x: 40, y: 150, w: 180, h: 170, key: '1', rank: 1 },
  { id: 'case', target: { kind: 'case' }, x: 300, y: 150, w: 180, h: 170, key: '2', rank: 2 },
  { id: 'sink', target: { kind: 'sink' }, x: 740, y: 150, w: 180, h: 170, key: '3', rank: 3 },
  { id: 'spot-0', target: { kind: 'spot', index: 0 }, x: 240, y: 380, w: 150, h: 170, key: '4', rank: 0 },
  { id: 'spot-1', target: { kind: 'spot', index: 1 }, x: 412, y: 380, w: 150, h: 170, key: '5', rank: 0 },
  { id: 'spot-2', target: { kind: 'spot', index: 2 }, x: 584, y: 380, w: 150, h: 170, key: '6', rank: 0 },
  { id: 'table-1', target: { kind: 'table', tableId: 1 }, x: 60, y: 575, w: 180, h: 135, key: '7', rank: 4 },
  { id: 'table-2', target: { kind: 'table', tableId: 2 }, x: 390, y: 575, w: 180, h: 135, key: '8', rank: 4 },
  { id: 'table-3', target: { kind: 'table', tableId: 3 }, x: 720, y: 575, w: 180, h: 135, key: '9', rank: 4 },
  { id: 'oven', target: { kind: 'oven' }, x: 220, y: 190, w: 80, h: 80, key: '0', rank: 5, info: true },
  { id: 'stand', target: { kind: 'stand' }, x: 832, y: 380, w: 128, h: 170, key: 's', rank: 5, info: true },
]);

/**
 * Distance from a point to a rectangle's edge; 0 inside.
 * @param {HitArea} area
 * @param {number} x
 * @param {number} y
 */
function distanceTo(area, x, y) {
  const dx = Math.max(area.x - x, 0, x - (area.x + area.w));
  const dy = Math.max(area.y - y, 0, y - (area.y + area.h));
  return Math.hypot(dx, dy);
}

/**
 * Which hit area a tap at this logical point selects: the one containing it,
 * or the nearest within the near-miss tolerance. Equal distances go to the
 * lower rank.
 * @param {number} x
 * @param {number} y
 * @returns {HitArea | null}
 */
export function hitTest(x, y) {
  /** @type {HitArea | null} */
  let best = null;
  let bestDistance = Infinity;
  for (const area of HIT_AREAS) {
    const d = distanceTo(area, x, y);
    if (d > NEAR_MISS) continue;
    if (d < bestDistance || (d === bestDistance && best !== null && area.rank < best.rank)) {
      best = area;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * @param {string} key A KeyboardEvent.key value.
 * @returns {HitArea | null}
 */
export function areaForKey(key) {
  return HIT_AREAS.find((a) => a.key === key) ?? null;
}

/** @param {HitArea} area */
export const centreOf = (area) => ({ x: area.x + area.w / 2, y: area.y + area.h / 2 });

/** Where things are drawn. None of these are tappable by themselves. */
export const PLACES = Object.freeze({
  counterTop: { x: 20, y: 322, w: 920, h: 44 },
  /** Where the owner stands for each zone. */
  owner: /** @type {Readonly<Record<string, { x: number, y: number }>>} */ ({
    machine: { x: 150, y: 300 },
    case: { x: 400, y: 300 },
    counter: { x: 560, y: 300 },
    sink: { x: 800, y: 300 },
    floor: { x: 480, y: 610 },
  }),
  door: { x: -40, y: 470 },
  doorQueue: [
    { x: 150, y: 470 },
    { x: 70, y: 500 },
  ],
  standing: [
    { x: 810, y: 470 },
    { x: 880, y: 500 },
    { x: 840, y: 540 },
  ],
  byte: { x: 706, y: 236 },
});
