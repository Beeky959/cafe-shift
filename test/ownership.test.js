// @ts-check
/**
 * Ownership, reverse references and lifecycle rules, checked on hand-built
 * states. There is no step function yet; these tests pin down what M1's step
 * function must preserve. See docs/TECH_BLUEPRINT.md §4.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInvariants, createInitialState } from '../src/sim/index.js';

/** @import { SimState, OwnerAction, LiveGuest, GuestState, GuestPlace } from '../src/sim/types.js' */

/**
 * @param {number} id
 * @param {GuestState} state
 * @param {GuestPlace} place
 * @param {number | null} dishId
 * @returns {LiveGuest}
 */
const guest = (id, state, place, dishId) => ({
  id,
  state,
  place,
  dishId,
  attendedBy: null,
  patienceLeft: 100,
  timerLeft: 0,
  tipEligible: false,
});

/**
 * @param {number} id
 * @param {OwnerAction['kind']} kind
 * @param {Partial<OwnerAction['claims']>} claims
 * @param {number | null} [reservedDishId]
 * @returns {OwnerAction}
 */
const action = (id, kind, claims, reservedDishId = null) => ({
  id,
  kind,
  phase: 'working',
  ticksLeft: 5,
  zone: 'counter',
  reservedDishId,
  claims: { guestId: null, slot: null, pass: false, tableId: null, sinkDishId: null, ...claims },
});

/**
 * Mid-shift, a hand-over in progress.
 * Guest 1 seated at table 1 with dish 1. Guest 2 waiting at spot 0, being
 * handed the ready latte on dish 2. Guest 3 at the door. Guest 4 asking at
 * spot 1 with dish 3. Dish 4 dirty, dish 5 clean.
 * @returns {SimState}
 */
function handOverScene() {
  const s = createInitialState();
  s.phase = 'open';
  s.tick = 300;
  s.nextArrivalIndex = 4;
  s.guests = [
    guest(1, 'seated', { kind: 'table', tableId: 1 }, 1),
    { ...guest(2, 'waiting', { kind: 'spot', index: 0 }, null), attendedBy: 7 },
    guest(3, 'waiting', { kind: 'door' }, null),
    guest(4, 'asking', { kind: 'spot', index: 1 }, 3),
  ];
  s.spots = [2, 4, null];
  s.doorQueue = [3];
  s.tables[0] = { id: 1, state: 'occupied', guestId: 1, claimedBy: null };
  s.dishes[0].holder = { kind: 'guest', guestId: 1 };
  s.dishes[1].holder = { kind: 'machine', slot: 0 };
  s.dishes[2].holder = { kind: 'guest', guestId: 4 };
  s.dishes[3].holder = { kind: 'sink' };
  s.machine.slots[0] = { state: 'ready', dishId: 2, ticksLeft: 0, claimedBy: 7 };
  s.owner.action = action(7, 'handOver', { guestId: 2, slot: 0 });
  s.owner.queue = [{ id: 8, kind: 'wash', guestId: null, tableId: null }];
  s.owner.nextActionId = 9;
  return s;
}

/**
 * Mid-shift, a start-brew in progress: dish 5 is reserved by action 3, which
 * has claimed the empty machine slot.
 * @returns {SimState}
 */
function brewStartScene() {
  const s = createInitialState();
  s.phase = 'open';
  s.tick = 90;
  s.nextArrivalIndex = 1;
  s.guests = [guest(1, 'waiting', { kind: 'spot', index: 0 }, null)];
  s.spots = [1, null, null];
  s.dishes[4].holder = { kind: 'reserved', actionId: 3 };
  s.machine.slots[0].claimedBy = 3;
  s.owner.action = action(3, 'brewStart', { slot: 0 }, 5);
  s.owner.nextActionId = 4;
  return s;
}

/**
 * @param {SimState} state
 * @param {RegExp} pattern
 */
function assertProblem(state, pattern) {
  const problems = checkInvariants(state);
  assert.ok(problems.some((p) => pattern.test(p)), `expected a problem matching ${pattern}, got: ${problems.join(' | ') || 'none'}`);
}

test('consistent mid-shift states satisfy every rule', () => {
  assert.deepEqual(checkInvariants(handOverScene()), []);
  assert.deepEqual(checkInvariants(brewStartScene()), []);
});

test('a reserved dish must belong to the current start-brew or plate action', () => {
  const noAction = brewStartScene();
  noAction.owner.action = null;
  assertProblem(noAction, /dish 5 is reserved/);

  const wrongAction = brewStartScene();
  wrongAction.dishes[4].holder = { kind: 'reserved', actionId: 2 };
  assertProblem(wrongAction, /dish 5 is reserved/);

  const wrongKind = brewStartScene();
  /** @type {OwnerAction} */ (wrongKind.owner.action).kind = 'wipe';
  assertProblem(wrongKind, /dish 5 is reserved/);

  const notHeld = brewStartScene();
  notHeld.dishes[4].holder = { kind: 'rack' };
  assertProblem(notHeld, /names a reserved dish it does not hold/);

  const handOverWithDish = handOverScene();
  /** @type {OwnerAction} */ (handOverWithDish.owner.action).reservedDishId = 5;
  assertProblem(handOverWithDish, /only start-brew and plate actions hold a reserved dish/);
});

test('every dish holder is mirrored by a reverse reference', () => {
  const slot = handOverScene();
  slot.machine.slots[0].dishId = 5;
  assertProblem(slot, /dish 2 and its machine slot disagree/);
  assertProblem(slot, /machine slot 0 names a dish held elsewhere/);

  const pass = handOverScene();
  pass.pass.dishId = 5;
  assertProblem(pass, /the pass names a dish held elsewhere/);

  const guestSide = handOverScene();
  guestSide.guests[0].dishId = 5;
  assertProblem(guestSide, /dish 1 and guest 1 disagree/);
  assertProblem(guestSide, /guest 1 names a dish held elsewhere/);
});

test('a guest holds a dish exactly when they have been served', () => {
  const unservedWithDish = handOverScene();
  unservedWithDish.guests[2].dishId = 5;
  assertProblem(unservedWithDish, /guest 3: state waiting and dish disagree/);

  const servedWithout = handOverScene();
  servedWithout.guests[3].dishId = null;
  assertProblem(servedWithout, /guest 4: state asking and dish disagree/);
});

test('a guest has one place and its container agrees', () => {
  const wrongSpot = handOverScene();
  wrongSpot.guests[1].place = { kind: 'spot', index: 2 };
  assertProblem(wrongSpot, /guest 2: place and its container disagree/);

  const ghost = handOverScene();
  ghost.spots[2] = 99;
  assertProblem(ghost, /guest 99 is listed in a place but is not in the café/);

  const twice = handOverScene();
  twice.doorQueue.push(2);
  assertProblem(twice, /a guest is in more than one place/);

  const wrongKind = handOverScene();
  wrongKind.guests[0].state = 'asking';
  assertProblem(wrongKind, /guest 1: state asking cannot be at table/);

  const standingButListed = handOverScene();
  standingButListed.guests[0].state = 'standing';
  standingButListed.guests[0].place = { kind: 'standing' };
  assertProblem(standingButListed, /guest 1: place and its container disagree/);
});

test('claims exist only for the current action and are marked on both sides', () => {
  const stale = handOverScene();
  stale.guests[1].attendedBy = 6;
  assertProblem(stale, /guest 2 is attended by an action that is not the owner's current action/);
  assertProblem(stale, /claims a guest who is not marked attended/);

  const unmarkedSlot = handOverScene();
  unmarkedSlot.machine.slots[0].claimedBy = null;
  assertProblem(unmarkedSlot, /claims a machine slot that is not marked/);

  const wiping = handOverScene();
  wiping.tables[1].state = 'wiping';
  assertProblem(wiping, /table 2: wiping state and claim disagree/);

  const attendedSeated = handOverScene();
  attendedSeated.guests[0].attendedBy = 7;
  assertProblem(attendedSeated, /guest 1 is attended/);
});

test('cancellation: a correct cancel leaves no reservation or claim', () => {
  // Start-brew cancelled correctly: transition D4, claims released.
  const done = brewStartScene();
  done.dishes[4].holder = { kind: 'rack' };
  done.machine.slots[0].claimedBy = null;
  done.owner.action = null;
  assert.deepEqual(checkInvariants(done), []);

  // Cancelled, but the dish was left reserved and the slot left claimed.
  const leaky = brewStartScene();
  leaky.owner.action = null;
  assertProblem(leaky, /dish 5 is reserved/);
  assertProblem(leaky, /machine slot 0 is claimed by an action that is not current/);

  // Hand-over cancelled correctly: nothing moves, claims released.
  const handOver = handOverScene();
  handOver.owner.action = null;
  handOver.guests[1].attendedBy = null;
  handOver.machine.slots[0].claimedBy = null;
  assert.deepEqual(checkInvariants(handOver), []);
});

test('abandonment: a guest who leaves takes nothing with them', () => {
  // Asking guest 4 runs out of patience: removed, spot released, dish 3 to the sink (D7).
  const done = handOverScene();
  done.guests = done.guests.filter((g) => g.id !== 4);
  done.spots[1] = null;
  done.dishes[2].holder = { kind: 'sink' };
  assert.deepEqual(checkInvariants(done), []);

  const spotKept = handOverScene();
  spotKept.guests = spotKept.guests.filter((g) => g.id !== 4);
  spotKept.dishes[2].holder = { kind: 'sink' };
  assertProblem(spotKept, /guest 4 is listed in a place but is not in the café/);

  const dishKept = handOverScene();
  dishKept.guests = dishKept.guests.filter((g) => g.id !== 4);
  dishKept.spots[1] = null;
  assertProblem(dishKept, /dish 3 and guest 4 disagree/);
});

test('shift termination: nothing is left held, claimed or in progress', () => {
  const ended = createInitialState();
  ended.phase = 'ended';
  ended.tick = 2400;
  ended.nextArrivalIndex = ended.schedule.length;
  ended.dishes[0].holder = { kind: 'sink' };
  ended.tables[0].state = 'dirty';
  assert.deepEqual(checkInvariants(ended), []);

  const itemLeft = structuredClone(ended);
  itemLeft.dishes[1].holder = { kind: 'machine', slot: 0 };
  itemLeft.machine.slots[0] = { state: 'ready', dishId: 2, ticksLeft: 0, claimedBy: null };
  assertProblem(itemLeft, /every dish must be in the rack or the sink/);

  const guestLeft = structuredClone(ended);
  guestLeft.guests = [guest(1, 'standing', { kind: 'standing' }, 2)];
  guestLeft.dishes[1].holder = { kind: 'guest', guestId: 1 };
  assertProblem(guestLeft, /guests remain after the shift ended/);

  const actionLeft = structuredClone(ended);
  actionLeft.owner.action = action(1, 'wash', { sinkDishId: 1 });
  actionLeft.owner.nextActionId = 2;
  assertProblem(actionLeft, /owner actions remain after the shift ended/);

  const notArrived = structuredClone(ended);
  notArrived.nextArrivalIndex = 3;
  assertProblem(notArrived, /scheduled guests never arrived/);
});

test('the hand-built scenes are plain data like any other state', () => {
  for (const scene of [handOverScene(), brewStartScene()]) {
    assert.deepEqual(JSON.parse(JSON.stringify(scene)), scene);
  }
});
