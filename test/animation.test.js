// @ts-check
/**
 * The animation contract (docs/TECH_BLUEPRINT.md §5):
 * - what is shown is a pure function of the simulation state,
 * - progress on screen is the simulation's own timer,
 * - a completion effect only ever follows a completion event,
 * - cancelling shows no completion, and leaves things as the rules say,
 * - pausing freezes everything,
 * - the view never changes the simulation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, digest, runShift, step } from '../src/sim/index.js';
import { createAnimator } from '../src/view/animator.js';
import { STAGE, along, guestClip, machineClip, ownerClip, passClip, sinkClip, tableDirt, walkPath } from '../src/view/clips.js';
import { createPlayer } from './support/players.js';
import { AT, drive, scene, spot, table } from './support/scene.js';

/**
 * Steps a scene and feeds the animator exactly as the game loop does.
 * @param {import('../src/sim/types.js').SimState} state
 */
function animated(state) {
  const d = drive(state);
  const anim = createAnimator();
  const tick = d.tick;
  d.tick = (commands = []) => {
    const events = tick(commands);
    anim.advance(1000 / 30);
    anim.onEvents(events, state);
    anim.sync(state, 1000 / 30);
    return events;
  };
  return { d, anim };
}

test('the machine shows exactly what the simulation says, with the brew timer as progress', () => {
  const { d } = animated(scene([{ at: 0 }]));
  assert.equal(machineClip(d.state).state, 'empty');
  d.tap(AT.machine);
  assert.equal(machineClip(d.state).state, 'loading', 'the owner is carrying the cup to the machine');
  assert.equal(ownerClip(d.state).item, 'cup');
  d.until('brewStarted');
  let last = -1;
  while (d.state.machine.slots[0].state === 'brewing') {
    const clip = machineClip(d.state);
    const slot = d.state.machine.slots[0];
    assert.equal(clip.progress, 1 - slot.ticksLeft / d.state.timing.brew);
    assert.ok(clip.progress >= last, 'pouring never goes backwards');
    last = clip.progress;
    d.tick();
  }
  assert.equal(machineClip(d.state).state, 'ready');
  d.tap(spot(0));
  assert.equal(machineClip(d.state).state, 'claimed', 'the owner has taken the cup to hand over');
  assert.equal(ownerClip(d.state).item, 'latte');
  d.until('itemHandedOver');
  assert.equal(machineClip(d.state).state, 'empty');
});

test('every owner clip matches the action and phase, and progress is the action timer', () => {
  const state = scene([{ at: 0, question: 'menu' }, { at: 0, order: 'croissant' }]);
  state.tables[1].state = 'dirty';
  state.dishes[4].holder = { kind: 'sink' };
  const { d } = animated(state);
  /** @type {Set<string>} */
  const seen = new Set();
  const check = () => {
    const a = d.state.owner.action;
    const clip = ownerClip(d.state);
    if (!a) return assert.equal(clip.kind, 'idle');
    seen.add(clip.kind);
    if (a.phase === 'travelling') assert.equal(clip.kind, 'walk');
    else assert.equal(clip.kind, { brewStart: 'brew', plate: 'plate', handOver: 'serve', answer: 'answer', wash: 'wash', wipe: 'wipe', bakeLoad: 'brew', bakeUnload: 'plate', discard: 'brew' }[a.kind]);
    const total = a.phase === 'travelling' ? d.state.timing.travel : a.kind === 'wash' ? d.state.timing.washPerDish : (d.state.timing[a.kind] ?? d.state.timing.travel);
    assert.equal(clip.progress, Math.max(0, Math.min(1, 1 - a.ticksLeft / total)));
  };
  const run = (/** @type {number} */ n) => {
    for (let i = 0; i < n; i++) {
      d.tick();
      check();
    }
  };
  d.tap(AT.case);
  d.tap(AT.machine);
  run(140);
  d.tap(spot(1));
  run(30);
  d.tap(spot(0));
  run(30);
  d.tap(spot(0));
  run(90);
  d.tap(table(2));
  d.tap(AT.sink);
  run(150);
  for (const kind of ['walk', 'brew', 'plate', 'serve', 'answer', 'wash', 'wipe']) assert.ok(seen.has(kind), `never saw ${kind}`);
});

test('a completion effect only follows its completion event, one for one, over whole shifts', () => {
  for (const kind of /** @type {const} */ (['priority', 'arrivalOrder'])) {
    const anim = createAnimator();
    /** @type {Record<string, number>} */
    const started = {};
    /** @type {Record<string, number>} */
    const events = {};
    const before = new Set();
    runShift({}, createPlayer(kind), (state, produced) => {
      anim.advance(1000 / 30);
      for (const f of anim.fx()) before.add(f);
      anim.onEvents(produced, state);
      for (const f of anim.fx()) if (!before.has(f)) started[f.type] = (started[f.type] ?? 0) + 1;
      anim.sync(state, 1000 / 30);
      for (const e of produced) events[e.type] = (events[e.type] ?? 0) + 1;
    });
    for (const [fx, event] of [['brewReady', 'brewReady'], ['plated', 'croissantPlated'], ['handoff', 'itemHandedOver'], ['dishWashed', 'dishWashed'], ['tableWiped', 'tableWiped'], ['answered', 'questionAnswered'], ['askPop', 'guestAsked']]) {
      assert.equal(started[fx] ?? 0, events[event] ?? 0, `${kind}: ${fx} effects vs ${event} events`);
    }
  }
});

test('cancelling a brew shows no completion, and the cup is back where the rules put the dish', () => {
  const { d, anim } = animated(scene([]));
  d.tap(AT.machine);
  d.tick();
  d.tick();
  d.tick([{ type: 'cancel' }]);
  assert.equal(machineClip(d.state).state, 'empty');
  assert.equal(ownerClip(d.state).kind, 'idle');
  assert.equal(anim.progressOf('brewReady'), -1);
  assert.ok(anim.progressOf('cancelled') >= 0, 'a cancel shows a small settle');
  for (let i = 0; i < 200; i++) d.tick();
  assert.equal(anim.progressOf('brewReady'), -1, 'no brew finished, so no ready pulse ever plays');
});

test('cancelling a wipe puts the dirt back; finishing it clears the dirt and shines', () => {
  const state = scene([]);
  state.tables[0].state = 'dirty';
  const { d, anim } = animated(state);
  d.tap(table(1));
  while (ownerClip(d.state).kind !== 'wipe') d.tick();
  let last = 1;
  for (let i = 0; i < 20; i++) {
    d.tick();
    const dirt = tableDirt(d.state, 1);
    assert.ok(dirt <= last && dirt < 1, 'dirt fades while wiping');
    last = dirt;
  }
  d.tick([{ type: 'cancel' }]);
  assert.equal(tableDirt(d.state, 1), 1, 'progress is lost, as the rules say');
  assert.equal(anim.progressOf('tableWiped'), -1);
  d.tap(table(1));
  d.until('tableWiped');
  assert.equal(tableDirt(d.state, 1), 0);
  assert.ok(anim.progressOf('tableWiped', (f) => f.tableId === 1) >= 0);
});

test('the dish being washed is in the owner\'s hands, not counted in the sink', () => {
  const state = scene([]);
  for (const dish of state.dishes.slice(0, 3)) dish.holder = { kind: 'sink' };
  const { d } = animated(state);
  assert.deepEqual(sinkClip(d.state), { dirty: 3, washing: null });
  d.tap(AT.sink);
  while (d.state.owner.action?.phase !== 'working') d.tick();
  d.tick();
  const clip = sinkClip(d.state);
  assert.equal(clip.dirty, 2);
  assert.ok(clip.washing !== null && clip.washing > 0 && clip.washing < 1);
  d.tick([{ type: 'cancel' }]);
  assert.deepEqual(sinkClip(d.state), { dirty: 3, washing: null }, 'a cancelled wash leaves the dish dirty in the sink');
});

test('the croissant leaves the pass when the owner takes it to hand over', () => {
  const { d } = animated(scene([{ at: 0, order: 'croissant' }]));
  d.tap(AT.case);
  d.until('croissantPlated');
  assert.deepEqual(passClip(d.state), { plated: true, claimed: false });
  while (d.state.guests[0]?.state !== 'waiting') d.tick();
  d.tap(spot(0));
  d.tick();
  assert.deepEqual(passClip(d.state), { plated: true, claimed: true });
  d.until('itemHandedOver');
  assert.deepEqual(passClip(d.state), { plated: false, claimed: false });
});

test('pausing freezes the clock, positions, effects and departing guests', () => {
  const { d, anim } = animated(scene([{ at: 0 }]));
  d.tap(AT.machine);
  for (let i = 0; i < 40; i++) d.tick();
  const snapshot = () => JSON.stringify({ now: anim.now(), owner: anim.owner, guests: [...anim.guests], fx: anim.fx(), ghosts: anim.ghosts() });
  const before = snapshot();
  for (let i = 0; i < 100; i++) {
    anim.advance(0);
    anim.sync(d.state, 0);
  }
  assert.equal(snapshot(), before);
});

test('a guest who gives up walks out from where they stood, and is gone within 2.4 s', () => {
  const { d, anim } = animated(scene([{ at: 0 }]));
  d.until('guestWaiting');
  for (let i = 0; i < 10; i++) d.tick();
  const body = anim.guests.get(1);
  assert.ok(body);
  const at = { x: body.x, y: body.y };
  d.until('guestLeftUnhappy');
  const ghosts = anim.ghosts();
  assert.equal(ghosts.length, 1);
  assert.equal(ghosts[0].mood, 'unhappy');
  assert.ok(Math.hypot(ghosts[0].path[0].x - at.x, ghosts[0].path[0].y - at.y) < 1, 'starts where they were drawn');
  assert.deepEqual(ghosts[0].path[ghosts[0].path.length - 1], STAGE.door);
  assert.ok(ghosts[0].duration <= 2400);
  for (let i = 0; i < 80; i++) d.tick();
  assert.equal(anim.ghosts().length, 0);
});

test('the owner walks the simulation\'s path, through the gate to reach a table', () => {
  const state = scene([]);
  state.tables[0].state = 'dirty';
  const d = drive(state);
  const anim = createAnimator();
  d.tap(table(1));
  const from = { x: anim.owner.x, y: anim.owner.y };
  const target = ownerClip(state).target;
  assert.ok(target);
  const path = walkPath(from, target);
  assert.deepEqual(path.slice(1, -1), [...STAGE.gate], 'the walk goes through the counter gate');
  // With a large time step the eased position lands on the path point for this tick.
  while (state.owner.action?.phase === 'travelling') {
    anim.sync(state, 5000);
    const want = along(path, ownerClip(state).progress);
    assert.ok(Math.hypot(anim.owner.x - want.x, anim.owner.y - want.y) < 0.5);
    d.tick();
  }
});

test('guests show impatience as their patience runs out', () => {
  const { d } = animated(scene([{ at: 0 }]));
  d.until('guestWaiting');
  /** @type {string[]} */
  const moods = [];
  while (d.state.guests.length > 0) {
    const g = d.state.guests[0];
    const m = guestClip(d.state, g).mood;
    if (moods[moods.length - 1] !== m) moods.push(m);
    d.tick();
  }
  assert.deepEqual(moods, ['calm', 'impatient', 'anxious']);
});

test('the animator never changes the simulation, and the same run animates identically', () => {
  const play = () => {
    const anim = createAnimator();
    /** @type {string[]} */
    const trace = [];
    runShift({ seed: 5 }, createPlayer('priority'), (state, produced) => {
      const before = digest(state);
      anim.advance(1000 / 30);
      anim.onEvents(produced, state);
      anim.sync(state, 1000 / 30);
      assert.equal(digest(state), before);
      if (state.tick % 90 === 0) trace.push(JSON.stringify([anim.owner, [...anim.guests], anim.ghosts().length, anim.fx().length]));
    });
    return trace;
  };
  assert.deepEqual(play(), play());
});

test('Byte\'s face follows its lines, settles back, and stays worried while a guest is about to leave', () => {
  const anim = createAnimator();
  anim.react('celebrate');
  assert.equal(anim.byteExpression(false), 'celebrate');
  anim.advance(3000);
  assert.equal(anim.byteExpression(false), 'neutral');
  assert.equal(anim.byteExpression(true), 'worried');
  anim.react('alert');
  assert.equal(anim.byteExpression(true), 'alert');
  // Blinking is a fixed pattern of the visual clock, not random.
  const a = createAnimator();
  const b = createAnimator();
  for (let i = 0; i < 400; i++) {
    a.advance(16);
    b.advance(16);
    assert.equal(a.byteBlink(), b.byteBlink());
  }
});

test('nothing on screen depends on unseeded randomness: the stand preset is still refused', () => {
  assert.throws(() => step(createInitialState({ preset: 'test-stand' })), /M4/);
});
