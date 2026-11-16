// @ts-check
/**
 * Rules of the core loop, one behaviour per test, on hand-written shifts.
 * Every tick of every test is checked against the ownership invariants.
 * Tick arithmetic: travel 9, start-brew 18, brew 90, plate 24, hand-over 12,
 * answer 75, wipe 54, wash 30 per dish, walk-in 30, counter patience 660,
 * asking patience 420.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createInitialState, digest, resolveTap, step } from '../src/sim/index.js';
import { AT, drive, scene, spot, table } from './support/scene.js';

const TIP = CONFIG.prices.tip;

test('the first tick opens the shift', () => {
  const d = drive(scene([]));
  assert.equal(d.state.phase, 'ready');
  assert.equal(d.tick()[0].type, 'shiftOpened');
  assert.equal(d.state.phase, 'open');
  assert.equal(d.state.tick, 1);
});

test('a guest arrives on their tick, claims a spot, and waits after walking in', () => {
  const d = drive(scene([{ at: 5 }]));
  d.to(5);
  assert.equal(d.state.guests.length, 0);
  d.tick();
  assert.deepEqual(d.state.spots, [1, null, null]);
  assert.equal(d.state.guests[0].state, 'walkingIn');
  assert.equal(d.until('guestWaiting').tick, 35);
  // Patience has been running since arrival.
  assert.equal(d.state.guests[0].patienceLeft, 720 - 30);
});

test('start-brew reserves a dish, then the machine brews unattended', () => {
  const d = drive(scene([{ at: 0 }]));
  d.tap(AT.machine);
  assert.deepEqual(d.state.dishes[0].holder, { kind: 'reserved', actionId: 1 }); // D1
  assert.equal(d.state.machine.slots[0].claimedBy, 1);
  assert.equal(d.until('brewStarted').tick, 27); // 9 travel + 18 work
  assert.deepEqual(d.state.dishes[0].holder, { kind: 'machine', slot: 0 }); // D2
  assert.equal(d.state.owner.action, null);
  assert.equal(d.until('brewReady').tick, 117); // + 90
  assert.equal(d.state.machine.slots[0].state, 'ready');
  assert.equal(d.state.metrics.ownerTicks.brewStart, 18);
  assert.equal(d.state.metrics.ownerTicks.travel, 9);
});

test('handing over a latte takes payment and seats the guest, who tips and leaves a dirty table and dish', () => {
  const d = drive(scene([{ at: 0, seat: 200 }]));
  d.tap(AT.machine);
  d.until('brewReady');
  d.tap(spot(0)); // tick 118
  const handed = d.until('itemHandedOver');
  assert.equal(handed.tick, 118 + 9 + 12);
  assert.equal(handed.coins, CONFIG.prices.latte);
  assert.deepEqual(d.state.dishes[0].holder, { kind: 'guest', guestId: 1 }); // D5
  assert.equal(d.state.machine.slots[0].state, 'empty');
  assert.deepEqual(d.state.spots, [null, null, null]);
  assert.equal(d.state.tables[0].state, 'occupied');
  assert.equal(d.state.guests[0].state, 'walkingToTable');

  const seated = d.until('guestSeated');
  const left = d.until('guestLeftHappy');
  assert.equal(left.tick, seated.tick + 200);
  assert.equal(left.tip, TIP);
  assert.deepEqual(d.state.dishes[0].holder, { kind: 'sink' }); // D7
  assert.equal(d.state.tables[0].state, 'dirty');
  assert.equal(d.state.guests.length, 0);
  assert.deepEqual(d.state.economy, {
    startingWallet: 0,
    grossEarnings: CONFIG.prices.latte + TIP,
    spent: 0,
    wallet: CONFIG.prices.latte + TIP,
    score: 0,
  });
  assert.deepEqual(d.state.metrics.guests, { served: 1, leftHappy: 1, leftUnhappy: 0, walkedPast: 0 });
  assert.equal(d.state.metrics.tips, 1);
});

test('a croissant is plated on the pass and handed over', () => {
  const d = drive(scene([{ at: 0, order: 'croissant' }]));
  d.tap(AT.case);
  assert.equal(d.until('croissantPlated').tick, 33); // 9 travel + 24 work
  assert.deepEqual(d.state.dishes[0].holder, { kind: 'pass' }); // D3
  d.tap(spot(0));
  const handed = d.until('itemHandedOver');
  assert.equal(handed.coins, CONFIG.prices.croissant);
  assert.equal(handed.item, 'croissant');
  assert.equal(d.state.pass.dishId, null);
  assert.deepEqual(d.state.dishes[0].holder, { kind: 'guest', guestId: 1 }); // D6
});

test('a latte cannot be handed to a croissant guest', () => {
  const d = drive(scene([{ at: 0, order: 'croissant' }]));
  d.tap(AT.machine);
  d.until('brewReady');
  assert.equal(d.tap(spot(0)).find((e) => e.type === 'tapRejected')?.reason, 'itemNotReady');
});

test('a guest with a question keeps the counter spot until the owner answers', () => {
  const d = drive(scene([{ at: 0, question: 'wifi' }]));
  d.tap(AT.machine);
  d.until('brewReady');
  d.tap(spot(0));
  const asked = d.until('guestAsked');
  assert.equal(asked.topic, 'wifi');
  assert.equal(d.state.guests[0].state, 'asking');
  assert.deepEqual(d.state.spots, [1, null, null]);
  assert.equal(d.state.tables[0].state, 'clean');
  assert.equal(resolveTap(d.state, spot(0)).ok && 'answer', 'answer');

  const tapTick = d.state.tick;
  d.tap(spot(0));
  // The owner is already at the counter, so there is no travel.
  assert.equal(d.until('questionAnswered').tick, tapTick + 75);
  assert.equal(d.state.metrics.ownerTicks.answer, 75);
  assert.equal(d.state.metrics.spotTicks.asking, d.state.tick - 1 - asked.tick);
  assert.deepEqual(d.state.spots, [null, null, null]);
  assert.equal(d.state.guests[0].state, 'walkingToTable');
  assert.equal(d.state.economy.grossEarnings, CONFIG.prices.latte); // answering earns nothing
});

test('an asking guest who is ignored leaves unhappy, and their dish goes to the sink', () => {
  const d = drive(scene([{ at: 0, question: 'menu' }]));
  d.tap(AT.machine);
  d.until('brewReady');
  d.tap(spot(0));
  const asked = d.until('guestAsked');
  const left = d.until('guestLeftUnhappy');
  assert.equal(left.wasAsking, true);
  assert.equal(left.tick, asked.tick + 420 - 1);
  assert.deepEqual(d.state.dishes[0].holder, { kind: 'sink' });
  assert.deepEqual(d.state.spots, [null, null, null]);
  assert.deepEqual(d.state.metrics.guests, { served: 1, leftHappy: 0, leftUnhappy: 1, walkedPast: 0 });
  assert.equal(d.state.economy.grossEarnings, CONFIG.prices.latte);
});

test('a waiting guest who is ignored leaves when their patience runs out', () => {
  const d = drive(scene([{ at: 0 }]));
  const left = d.until('guestLeftUnhappy');
  assert.equal(left.tick, 720);
  assert.equal(left.wasAsking, false);
  assert.deepEqual(d.state.spots, [null, null, null]);
  assert.equal(d.state.dishes.every((dish) => dish.holder.kind === 'rack'), true);
});

test('a guest being attended cannot run out of patience, and a late hand-over earns no tip', () => {
  const d = drive(scene([{ at: 0 }]));
  d.tap(AT.machine);
  d.to(650);
  d.tap(spot(0)); // 21 ticks of travel and work: finishes after patience would have ended
  assert.equal(d.state.guests[0].attendedBy, 2);
  const frozen = d.state.guests[0].patienceLeft;
  d.to(665);
  assert.equal(d.state.guests[0].patienceLeft, frozen);
  assert.equal(d.until('itemHandedOver').tick, 671);
  assert.equal(d.all('guestLeftUnhappy').length, 0);
  assert.equal(d.until('guestLeftHappy').tip, 0);
});

test('with no clean table the guest stands, leaves sooner and does not tip', () => {
  const state = scene([{ at: 0 }]);
  for (const t of state.tables) t.state = 'dirty';
  const d = drive(state);
  d.tap(AT.machine);
  d.until('brewReady');
  d.tap(spot(0));
  const standing = d.until('guestStanding');
  assert.equal(d.state.guests[0].place.kind, 'standing');
  const left = d.until('guestLeftHappy');
  assert.equal(left.tick, standing.tick + 120 - 1);
  assert.equal(left.tip, 0);
  assert.deepEqual(d.state.dishes[0].holder, { kind: 'sink' });
});

test('wiping cleans a dirty table; cancelling loses the progress', () => {
  const state = scene([]);
  state.tables[0].state = 'dirty';
  const d = drive(state);
  d.tap(table(1));
  assert.equal(d.state.tables[0].state, 'wiping');
  assert.equal(d.state.tables[0].claimedBy, 1);
  d.to(30);
  const cancelled = d.tick([{ type: 'cancel' }]).find((e) => e.type === 'actionCancelled');
  assert.equal(cancelled?.reason, 'player');
  assert.equal(d.state.tables[0].state, 'dirty');
  assert.equal(d.state.tables[0].claimedBy, null);
  assert.equal(d.state.owner.action, null);

  d.tap(table(1)); // tick 31; the owner is already at the tables
  assert.equal(d.until('tableWiped').tick, 31 + 54);
  assert.equal(d.state.tables[0].state, 'clean');
});

test('washing takes one dish at a time until the sink is empty', () => {
  const state = scene([]);
  for (const dish of state.dishes.slice(0, 3)) dish.holder = { kind: 'sink' };
  const d = drive(state);
  d.tap(AT.sink);
  d.to(200);
  assert.deepEqual(d.all('dishWashed').map((e) => [e.dishId, e.tick]), [[1, 39], [2, 69], [3, 99]]);
  assert.equal(d.all('actionCompleted').length, 1);
  assert.equal(d.state.dishes.every((dish) => dish.holder.kind === 'rack'), true);
  assert.equal(d.state.metrics.ownerTicks.wash, 90);
});

test('washing stops after the current dish when something else is queued, or at once when cancelled', () => {
  const queued = scene([]);
  for (const dish of queued.dishes.slice(0, 3)) dish.holder = { kind: 'sink' };
  const q = drive(queued);
  q.tap(AT.sink);
  q.to(20);
  q.tap(AT.machine);
  q.until('brewStarted');
  assert.deepEqual(q.all('dishWashed').map((e) => e.dishId), [1]);
  assert.deepEqual(q.state.dishes.slice(1, 3).map((dish) => dish.holder.kind), ['sink', 'sink']);

  const cancelled = scene([]);
  for (const dish of cancelled.dishes.slice(0, 3)) dish.holder = { kind: 'sink' };
  const c = drive(cancelled);
  c.tap(AT.sink);
  c.to(50);
  c.tick([{ type: 'cancel' }]);
  assert.deepEqual(c.state.dishes.slice(0, 3).map((dish) => dish.holder.kind), ['rack', 'sink', 'sink']);
  assert.equal(c.state.owner.action, null);
});

test('cancelling a start-brew returns the reserved dish to the rack', () => {
  const d = drive(scene([]));
  d.tap(AT.machine);
  d.to(15);
  d.tick([{ type: 'cancel' }]);
  assert.deepEqual(d.state.dishes[0].holder, { kind: 'rack' }); // D4
  assert.deepEqual(d.state.machine.slots[0], { state: 'empty', dishId: null, drink: null, ticksLeft: 0, claimedBy: null });
  assert.equal(d.state.owner.action, null);
});

test('cancelling a hand-over moves nothing and the guest can still be served', () => {
  const d = drive(scene([{ at: 0 }]));
  d.tap(AT.machine);
  d.until('brewReady');
  d.tap(spot(0));
  d.tick();
  d.tick([{ type: 'cancel' }]);
  assert.equal(d.state.guests[0].attendedBy, null);
  assert.equal(d.state.machine.slots[0].state, 'ready');
  assert.equal(d.state.machine.slots[0].claimedBy, null);
  assert.equal(d.state.economy.grossEarnings, 0);
  d.tap(spot(0));
  assert.equal(d.until('itemHandedOver').guestId, 1);
});

test('taps with no valid action are rejected with a reason and change nothing', () => {
  /** @param {import('../src/sim/types.js').SimEvent[]} events */
  const reason = (events) => events.find((e) => e.type === 'tapRejected')?.reason;

  const empty = drive(scene([]));
  assert.equal(reason(empty.tap(spot(0))), 'emptySpot');
  assert.equal(reason(empty.tap(table(1))), 'tableNotDirty');
  assert.equal(reason(empty.tap(table(9))), 'noSuchTable');
  assert.equal(reason(empty.tap(AT.sink)), 'nothingToWash');
  assert.equal(empty.state.owner.nextActionId, 1);

  const guest = drive(scene([{ at: 0 }]));
  guest.tick();
  assert.equal(reason(guest.tap(spot(0))), 'guestNotReady'); // still walking in
  guest.until('guestWaiting');
  assert.equal(reason(guest.tap(spot(0))), 'itemNotReady');
  guest.tap(AT.machine);
  // With 1 machine slot, the slot is now brewing, so a second tap is rejected
  assert.equal(reason(guest.tap(AT.machine)), 'machineBusy');

  const noDishes = scene([]);
  for (const dish of noDishes.dishes) dish.holder = { kind: 'sink' };
  const n = drive(noDishes);
  assert.equal(reason(n.tap(AT.machine)), 'noCleanDish');
  assert.equal(reason(n.tap(AT.case)), 'noCleanDish');

  const bad = drive(scene([]));
  // @ts-expect-error deliberately malformed command
  assert.equal(bad.tick([{ type: 'dance' }]).find((e) => e.type === 'commandRejected')?.reason, 'unknownCommand');
});

test('at most two actions wait behind the current one, and duplicates are refused', () => {
  const state = scene([]);
  for (const t of state.tables) t.state = 'dirty';
  state.dishes[0].holder = { kind: 'sink' };
  const d = drive(state);
  d.tap(table(1)); // starts
  d.tap(table(2)); // queued
  assert.equal(d.tap(table(2)).find((e) => e.type === 'tapRejected')?.reason, 'alreadyQueued');
  d.tap(table(3)); // queued
  assert.equal(d.tap(AT.sink).find((e) => e.type === 'tapRejected')?.reason, 'queueFull');
  assert.equal(d.state.owner.queue.length, CONFIG.queueMax);
  assert.equal(d.state.owner.action?.kind, 'wipe');
});

test('a queued action can be removed before it starts', () => {
  const state = scene([]);
  for (const t of state.tables) t.state = 'dirty';
  const d = drive(state);
  d.tap(table(1));
  d.tap(table(2));
  const queuedId = d.state.owner.queue[0].id;
  assert.equal(d.tick([{ type: 'unqueue', actionId: queuedId }]).some((e) => e.type === 'actionUnqueued'), true);
  d.to(200);
  assert.deepEqual(d.state.tables.map((t) => t.state), ['clean', 'dirty', 'dirty']);
});

test('a queued action whose guest has gone is dropped, and the prepared item waits for the next guest', () => {
  const state = scene([{ at: 0 }, { at: 760 }]);
  state.tables[2].state = 'dirty';
  const d = drive(state);
  d.tap(AT.machine);
  d.to(680);
  d.tap(table(3)); // a long job
  d.tap(spot(0)); // queued behind it
  assert.equal(d.state.owner.queue[0].kind, 'handOver');
  assert.equal(d.until('guestLeftUnhappy').guestId, 1);
  const dropped = d.until('actionDropped');
  assert.equal(dropped.kind, 'handOver');
  assert.equal(dropped.reason, 'targetGone');
  assert.equal(d.state.machine.slots[0].state, 'ready'); // nothing spoils

  d.until('guestWaiting', (e) => e.guestId === 2);
  d.tap(spot(0));
  assert.equal(d.until('itemHandedOver').guestId, 2);
});

test('the counter holds three guests, the door two, and the rest walk past', () => {
  const state = scene([{ at: 0 }, { at: 0 }, { at: 0 }, { at: 0 }, { at: 0 }, { at: 0 }]);
  const d = drive(state);
  const first = d.tick();
  assert.deepEqual(d.state.spots, [1, 2, 3]);
  assert.deepEqual(d.state.doorQueue, [4, 5]);
  assert.equal(first.find((e) => e.type === 'guestWalkedPast')?.guestId, 6);
  assert.equal(d.state.metrics.guests.walkedPast, 1);
  assert.equal(d.state.guests.length, 5);

  // Guest 2 gives up early; the head of the door queue takes the spot on the same tick.
  d.state.guests[1].patienceLeft = 50;
  const left = d.until('guestLeftUnhappy');
  assert.equal(left.guestId, 2);
  const promoted = d.events.find((e) => e.type === 'guestPromoted');
  assert.equal(promoted?.tick, left.tick);
  assert.equal(promoted?.guestId, 4);
  assert.deepEqual(d.state.spots, [1, 4, 3]);
  assert.deepEqual(d.state.doorQueue, [5]);
  assert.equal(d.state.metrics.allSpotsFullTicks, d.state.tick);
});

test('doors close at the shift length, every guest gets an outcome, and the end leaves nothing held', () => {
  // Guest 1 is served and sits for a very long time. Guest 2 arrives just
  // before closing and is ignored: in the prototype such a guest could never be lost.
  const state = scene([{ at: 0, seat: 5000 }, { at: 2200 }]);
  state.tables[2].state = 'dirty';
  const d = drive(state);
  d.tap(AT.machine);
  d.until('brewReady');
  d.tap(spot(0));
  d.until('guestSeated');
  d.tap(AT.machine); // a latte nobody will collect
  assert.equal(d.until('doorsClosed').tick, state.timing.shiftLength - 1);
  assert.equal(d.state.phase, 'closing');

  d.to(2919);
  d.tap(table(3)); // an action still in progress when the shift ends
  const ended = d.until('shiftEnded');
  assert.equal(ended.tick, 2200 + 720);
  const sameTick = d.events.filter((e) => e.tick === ended.tick).map((e) => e.type);
  assert.deepEqual(sameTick, ['guestLeftUnhappy', 'actionCancelled', 'guestLeftHappy', 'shiftEnded']);
  assert.equal(d.events.find((e) => e.type === 'actionCancelled')?.reason, 'shiftEnded');

  assert.equal(d.state.phase, 'ended');
  assert.equal(d.state.guests.length, 0);
  assert.equal(d.state.owner.action, null);
  assert.deepEqual(d.state.dishes.map((dish) => dish.holder.kind).sort(), ['rack', 'rack', 'rack', 'rack', 'sink']);
  assert.deepEqual(d.state.tables.map((t) => t.state), ['dirty', 'clean', 'dirty']);
  assert.deepEqual(d.state.metrics.guests, { served: 1, leftHappy: 1, leftUnhappy: 1, walkedPast: 0 });

  // Score = gross earnings + mood bonus; here one of two guests left happy.
  const gross = CONFIG.prices.latte + TIP;
  assert.equal(d.state.economy.grossEarnings, gross);
  assert.equal(d.state.economy.score, gross + Math.round(CONFIG.moodBonusMax / 2));
  assert.equal(d.state.economy.wallet, gross);

  const before = digest(d.state);
  assert.deepEqual(step(d.state, [{ type: 'tap', target: AT.machine }]), []);
  assert.equal(digest(d.state), before);
});

test('owner time is fully accounted for', () => {
  const state = scene([{ at: 0, question: 'review' }]);
  const d = drive(state);
  d.tap(AT.machine);
  d.until('brewReady');
  d.tap(spot(0));
  d.until('guestAsked');
  d.tap(spot(0));
  d.until('questionAnswered');
  const ticks = d.state.metrics.ownerTicks;
  assert.equal(Object.values(ticks).reduce((a, b) => a + b, 0), d.state.tick);
  assert.deepEqual(
    { brewStart: ticks.brewStart, handOver: ticks.handOver, answer: ticks.answer, travel: ticks.travel },
    { brewStart: 18, handOver: 12, answer: 75, travel: 18 },
  );
});

test('working out what a tap means does not change the state', () => {
  const d = drive(scene([{ at: 0 }]));
  d.tap(AT.machine);
  d.until('brewReady');
  const before = digest(d.state);
  for (const target of [AT.machine, AT.case, AT.sink, spot(0), spot(1), table(1)]) resolveTap(d.state, target);
  assert.equal(digest(d.state), before);
});

test('the stand preset runs without throwing', () => {
  const state = createInitialState({ preset: 'test-stand' });
  assert.strictEqual(state.stand.installed, true);
  const events = step(state);
  assert.ok(Array.isArray(events));
});
