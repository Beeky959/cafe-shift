// @ts-check
/**
 * Words on screen. Pure functions of the simulation, so they are tested
 * without a browser. Byte's reactions are tested in byte.test.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_SECOND, digest, runShift } from '../src/sim/index.js';
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
