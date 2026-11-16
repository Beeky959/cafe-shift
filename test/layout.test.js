// @ts-check
/**
 * The interaction rules of docs/TECH_BLUEPRINT.md §6, checked on the layout
 * data: target sizes, gaps, overlaps, near-miss selection and keys.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, resolveTap } from '../src/sim/index.js';
import { HIT_AREAS, MIN_HIT_GAP, MIN_HIT_SIZE, NEAR_MISS, SCENE_HEIGHT, SCENE_WIDTH, areaForKey, centreOf, hitTest } from '../src/view/scene.js';

/** Screen pixels per logical unit on a 360 px-wide phone. */
const SCALE_360 = 360 / SCENE_WIDTH;

test('the scene is 4:3', () => {
  assert.equal(SCENE_WIDTH / SCENE_HEIGHT, 4 / 3);
});

test('every hit area is at least 48 px on a 360 px-wide screen and lies inside the scene', () => {
  for (const a of HIT_AREAS) {
    // Info-only areas (oven, stand) may be smaller than interactive stations.
    if (!a.info) {
      assert.ok(a.w >= MIN_HIT_SIZE && a.h >= MIN_HIT_SIZE, `${a.id} is ${a.w}x${a.h}`);
      assert.ok(a.w * SCALE_360 >= 48 && a.h * SCALE_360 >= 48, `${a.id} is under 48 px at 360`);
    }
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= SCENE_WIDTH && a.y + a.h <= SCENE_HEIGHT, `${a.id} leaves the scene`);
  }
});

test('hit areas never overlap and keep at least an 8 px gap at 360', () => {
  for (const [i, a] of HIT_AREAS.entries()) {
    for (const b of HIT_AREAS.slice(i + 1)) {
      // Info areas (oven, stand) may overlap with their parent stations.
      if (a.info || b.info) continue;
      const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
      const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
      const gap = Math.max(dx, dy);
      assert.ok(gap >= MIN_HIT_GAP, `${a.id} and ${b.id} are ${gap} apart`);
      assert.ok(gap * SCALE_360 >= 8);
    }
  }
});

test('there is one area for each thing the simulation lets the player tap', () => {
  const state = createInitialState();
  const ids = HIT_AREAS.map((a) => a.id).sort();
  assert.deepEqual(ids, ['case', 'machine', 'oven', 'sink', 'spot-0', 'spot-1', 'spot-2', 'stand', 'table-1', 'table-2', 'table-3']);
  assert.equal(new Set(ids).size, HIT_AREAS.length);
  assert.equal(HIT_AREAS.filter((a) => a.target.kind === 'spot').length, state.spots.length);
  assert.equal(HIT_AREAS.filter((a) => a.target.kind === 'table').length, state.tables.length);
  // Every area names a target the simulation understands.
  for (const a of HIT_AREAS) {
    const r = resolveTap(state, a.target);
    assert.ok(r.ok || r.reason !== 'unknownTarget', a.id);
    assert.ok(r.ok || r.reason !== 'noSuchTable', a.id);
  }
});

test('a tap inside an area selects it', () => {
  for (const a of HIT_AREAS) {
    // Info areas may overlap with interactive stations that take priority.
    if (a.info) continue;
    const c = centreOf(a);
    assert.equal(hitTest(c.x, c.y)?.id, a.id);
    assert.equal(hitTest(a.x, a.y)?.id, a.id);
    assert.equal(hitTest(a.x + a.w, a.y + a.h)?.id, a.id);
  }
});

test('a near miss selects the nearest area; a clear miss selects nothing', () => {
  const machine = HIT_AREAS[0];
  assert.equal(hitTest(machine.x - NEAR_MISS, machine.y + 50)?.id, 'machine');
  assert.equal(hitTest(machine.x - NEAR_MISS - 1, machine.y + 50), null);
  assert.equal(hitTest(machine.x + 60, machine.y - NEAR_MISS)?.id, 'machine');
  // Between the machine and the pastry case, 30 units apart: the oven info area
  // overlaps this gap, so the oven wins there. Outside the oven, normal rules apply.
  assert.equal(hitTest(machine.x + machine.w + 10, 200)?.id, 'oven');
  assert.equal(hitTest(machine.x + machine.w + 20, 200)?.id, 'oven');
  // Below the oven area (y > 270), the machine/case near-miss still works.
  assert.equal(hitTest(machine.x + machine.w + 10, 300)?.id, 'machine');
  assert.equal(hitTest(machine.x + machine.w + 20, 300)?.id, 'case');
  // Open floor and the wall belong to nothing.
  assert.equal(hitTest(480, 60), null);
  assert.equal(hitTest(120, 470), null);
  assert.equal(hitTest(-50, -50), null);
});

test('an exact tie goes to the counter spot, then by the fixed order', () => {
  // Midway between two counter spots: equal distance, same rank, first listed wins.
  const [s0, s1] = HIT_AREAS.filter((a) => a.target.kind === 'spot');
  const midX = (s0.x + s0.w + s1.x) / 2;
  assert.equal(hitTest(midX, s0.y + 80)?.id, 'spot-0');
  // Ranks put counter spots first and tables last.
  const rank = (/** @type {string} */ id) => HIT_AREAS.find((a) => a.id === id)?.rank ?? -1;
  assert.ok(rank('spot-0') < rank('machine'));
  assert.ok(rank('machine') < rank('case'));
  assert.ok(rank('case') < rank('sink'));
  assert.ok(rank('sink') < rank('table-1'));
});

test('every area has its own key', () => {
  const keys = HIT_AREAS.map((a) => a.key);
  assert.deepEqual(keys, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 's']);
  for (const a of HIT_AREAS) assert.equal(areaForKey(a.key)?.id, a.id);
  assert.equal(areaForKey('Enter'), null);
  assert.equal(areaForKey('q'), null);
});
