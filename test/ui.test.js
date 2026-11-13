// @ts-check
/**
 * Words on screen and Byte's lines. Both are pure functions of the
 * simulation, so they are tested without a browser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_SECOND, digest, runShift, step } from '../src/sim/index.js';
import { createByte } from '../src/ui/byte.js';
import { actionName, clockText, describeTarget, rejectionText } from '../src/ui/labels.js';
import { HIT_AREAS } from '../src/view/scene.js';
import { createPlayer } from './support/players.js';
import { AT, drive, scene, spot, table } from './support/scene.js';

test('the clock shows minutes and seconds, rounded up', () => {
  assert.equal(clockText(75 * TICKS_PER_SECOND), '1:15');
  assert.equal(clockText(60 * TICKS_PER_SECOND), '1:00');
  assert.equal(clockText(59 * TICKS_PER_SECOND + 1), '1:00');
  assert.equal(clockText(9 * TICKS_PER_SECOND), '0:09');
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(-30), '0:00');
});

test('every action and every refusal the simulation can produce has words', () => {
  for (const kind of /** @type {const} */ (['brewStart', 'plate', 'handOver', 'answer', 'wipe', 'wash'])) {
    assert.ok(actionName(kind).length > 3);
  }
  assert.equal(actionName('wipe', 2), 'Wipe table 2');
  const reasons = ['machineBusy', 'noCleanDish', 'passFull', 'nothingToWash', 'emptySpot', 'alreadyAttended', 'guestNotReady', 'itemNotReady', 'noSuchTable', 'tableNotDirty', 'alreadyQueued', 'queueFull'];
  const fallback = rejectionText('somethingNew');
  for (const reason of reasons) assert.notEqual(rejectionText(reason), fallback, reason);
});

test('a target is described by what it is, its state and what pressing it does', () => {
  const d = drive(scene([{ at: 0, question: 'wifi' }]));
  assert.match(describeTarget(d.state, AT.machine), /^Coffee machine: empty\. Press to start latte\.$/);
  assert.match(describeTarget(d.state, spot(0)), /^Counter spot 1: empty\.$/);
  assert.match(describeTarget(d.state, table(1)), /^Table 1: clean\. That table does not need wiping\.$/);
  assert.match(describeTarget(d.state, AT.sink), /^Sink: 0 dirty, 5 clean\. Nothing to wash\.$/);

  d.tap(AT.machine);
  d.until('brewStarted');
  assert.match(describeTarget(d.state, AT.machine), /brewing, 3 seconds left/);
  d.until('guestWaiting');
  assert.match(describeTarget(d.state, spot(0)), /guest waiting for a latte, \d+ seconds of patience left\. Their order is not ready yet\./);
  d.until('brewReady');
  assert.match(describeTarget(d.state, AT.machine), /a latte is ready/);
  assert.match(describeTarget(d.state, spot(0)), /Press to hand over\./);
  d.tap(spot(0));
  d.until('guestAsked');
  assert.match(describeTarget(d.state, spot(0)), /guest asking about the Wi-Fi, \d+ seconds of patience left\. Press to answer\./);
});

test('describing targets never changes the state', () => {
  const run = runShift({}, createPlayer('priority'), (state) => {
    if (state.tick % 97 !== 0) return;
    const before = digest(state);
    for (const area of HIT_AREAS) describeTarget(state, area.target);
    assert.equal(digest(state), before);
  });
  assert.equal(run.state.phase, 'ended');
});

/**
 * Plays a shift and collects every line Byte says, with its tick.
 * @param {Parameters<typeof createPlayer>[0]} kind
 */
function byteDuring(kind) {
  const byte = createByte();
  /** @type {{ tick: number, line: string }[]} */
  const lines = [];
  const run = runShift({}, createPlayer(kind), (state, events) => {
    const before = digest(state);
    const line = byte.onTick(state, events);
    assert.equal(digest(state), before, 'Byte changed the state');
    if (line !== null) lines.push({ tick: state.tick, line });
  });
  return { lines, run };
}

test('Byte teaches each thing once and leaves each line up for at least three seconds', () => {
  const { lines } = byteDuring('priority');
  const texts = lines.map((l) => l.line);
  assert.equal(texts[0], 'Doors are open! Guests order at the counter.');
  assert.ok(texts.some((t) => t.includes('Tap the coffee machine')));
  assert.ok(texts.some((t) => t.includes('hand it over')));
  assert.ok(texts.some((t) => t.includes('Tap them to answer')));
  assert.equal(new Set(texts).size, texts.length, 'a taught line was repeated');
  for (let i = 1; i < lines.length; i++) {
    assert.ok(lines[i].tick - lines[i - 1].tick >= 3 * TICKS_PER_SECOND, `lines ${i - 1} and ${i} are too close`);
  }
  // A handful of lines in a 75-second shift, not a running commentary.
  assert.ok(lines.length >= 6 && lines.length <= 14, `${lines.length} lines`);
});

test('Byte never narrates routine actions', () => {
  const { lines, run } = byteDuring('priority');
  const routine = run.events.filter((e) => e.type === 'actionStarted' || e.type === 'actionCompleted').length;
  assert.ok(routine > 40);
  assert.ok(lines.length < routine / 3);
});

test('Byte gives each reminder at most twice, at least twelve seconds apart', () => {
  const byte = createByte();
  const state = scene([]);
  for (const dish of state.dishes) dish.holder = { kind: 'sink' };
  for (const t of state.tables) t.state = 'dirty';
  /** @type {{ tick: number, line: string }[]} */
  const lines = [];
  for (let i = 0; i < 2200; i++) {
    const events = step(state);
    const line = byte.onTick(state, events);
    if (line !== null) lines.push({ tick: state.tick, line });
  }
  const dishes = lines.filter((l) => l.line.startsWith('No clean dishes'));
  const tables = lines.filter((l) => l.line.startsWith('Every table is dirty'));
  assert.equal(dishes.length, 2);
  assert.equal(tables.length, 2);
  const reminders = [...dishes, ...tables].sort((a, b) => a.tick - b.tick);
  for (let i = 1; i < reminders.length; i++) {
    assert.ok(reminders[i].tick - reminders[i - 1].tick >= 12 * TICKS_PER_SECOND);
  }
  // The first reminder waits four seconds, to give the player a chance.
  assert.ok(dishes[0].tick >= 4 * TICKS_PER_SECOND);
});
