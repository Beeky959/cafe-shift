// @ts-check
/**
 * M2.5 experiment: serving an order by hand. The player picks a ticket,
 * starts it at the right station, and carries the finished item to the guest.
 * All of it is interface state on top of the unchanged simulation commands.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createInitialState, digest, replay, step } from '../src/sim/index.js';
import { createService, itemReady } from '../src/ui/service.js';
import { counter } from './support/counter.js';
import { scene } from './support/scene.js';

test('a station does nothing until an order has been picked', () => {
  const c = counter(scene([{ at: 0 }]));
  c.until('guestWaiting');
  const refused = c.station('machine');
  assert.equal(refused.accepted, false);
  assert.equal(refused.command, undefined);
  assert.match(refused.notice ?? '', /Pick an order first/);
  assert.equal(c.card(0)?.status, 'new');
});

test('the whole service: pick the ticket, make it, carry it, deliver it', () => {
  const c = counter(scene([{ at: 0 }]));
  c.until('guestWaiting');
  assert.deepEqual({ kind: c.card(0)?.kind, title: c.card(0)?.title, status: c.card(0)?.status, n: c.card(0)?.guestId }, { kind: 'order', title: 'Latte', status: 'new', n: 1 });

  // 1. Pick the order.
  const picked = c.spot(0);
  assert.equal(picked.command, undefined);
  assert.equal(c.service.selected(), 1);
  assert.equal(c.card(0)?.selected, true);
  assert.deepEqual(c.service.hints(c.state).stations, ['machine']);

  // 2. Start it at the right station. This is the ordinary machine command.
  const started = c.station('machine');
  assert.deepEqual(started.command, { type: 'tap', target: { kind: 'machine' } });
  assert.equal(started.ticket, 1);
  assert.equal(c.service.selected(), null);
  c.tick();
  assert.equal(c.card(0)?.status, 'starting');

  // 3. It brews by itself, marked as ticket 1's.
  c.until('brewStarted');
  assert.equal(c.service.madeFor('latte'), 1);
  assert.equal(c.card(0)?.status, 'preparing');
  c.until('brewReady');
  assert.equal(c.card(0)?.status, 'ready');
  assert.deepEqual(c.service.hints(c.state).pickUp, ['machine']);

  // 4. Pick it up and carry it to the guest.
  const lifted = c.station('machine');
  assert.equal(lifted.command, undefined);
  assert.equal(c.service.carrying(), 'latte');
  assert.deepEqual(c.service.hints(c.state).spots, [0]);
  assert.match(c.card(0)?.label ?? '', /Press to deliver the latte\./);
  const delivered = c.spot(0);
  assert.deepEqual(delivered.command, { type: 'tap', target: { kind: 'spot', index: 0 } });
  assert.equal(c.service.carrying(), null);
  c.tick();
  assert.equal(c.card(0)?.status, 'delivering');

  // 5. The transaction completes through the simulation's own hand-over.
  const paid = c.until('itemHandedOver');
  assert.equal(paid.coins, CONFIG.prices.latte);
  assert.equal(c.state.economy.wallet, CONFIG.prices.latte);
  assert.equal(c.service.madeFor('latte'), null);
  // The owner's time is accounted exactly as before: 18 start + 12 hand-over + 2 trips.
  const t = c.state.metrics.ownerTicks;
  assert.deepEqual({ brewStart: t.brewStart, handOver: t.handOver, travel: t.travel }, { brewStart: 18, handOver: 12, travel: 18 });
});

test('an order is made at its own station and goes to a guest who ordered that item', () => {
  const c = counter(scene([{ at: 0, order: 'croissant' }, { at: 0 }]));
  c.until('guestWaiting', (e) => e.guestId === 2);
  c.spot(0); // the croissant ticket
  const wrongStation = c.station('machine');
  assert.equal(wrongStation.accepted, false);
  assert.match(wrongStation.notice ?? '', /Ticket 1 is a croissant\. That is made at the pastry case\./);
  assert.ok(c.station('case').command);
  c.until('croissantPlated');
  assert.equal(c.service.madeFor('croissant'), 1);

  c.station('case'); // pick it up
  assert.equal(c.service.carrying(), 'croissant');
  const wrongGuest = c.spot(1);
  assert.equal(wrongGuest.accepted, false);
  assert.equal(wrongGuest.command, undefined);
  assert.match(wrongGuest.notice ?? '', /Ticket 2 ordered a latte, not a croissant\./);
  assert.equal(c.service.carrying(), 'croissant', 'a refused press keeps the item in hand');
  assert.ok(c.spot(0).command);
  assert.equal(c.until('itemHandedOver').item, 'croissant');
});

test('dragging: release over the right guest delivers; anywhere else puts the item back', () => {
  const c = counter(scene([{ at: 0 }, { at: 0, order: 'croissant' }]));
  c.until('guestWaiting');
  assert.equal(c.service.pickUp(c.state, 'machine'), null, 'nothing to pick up yet');
  c.spot(0);
  c.station('machine');
  c.until('brewReady');

  assert.equal(c.service.pickUp(c.state, 'machine'), 'latte');
  assert.equal(c.drop(null).command, undefined);
  assert.equal(c.service.carrying(), null);
  assert.equal(itemReady(c.state, 'latte'), true, 'the latte is still on the machine');

  c.service.pickUp(c.state, 'machine');
  const wrong = c.drop(1);
  assert.equal(wrong.accepted, false);
  assert.equal(c.service.carrying(), null, 'a refused drop puts the item back');

  c.service.pickUp(c.state, 'machine');
  const empty = c.drop(2);
  assert.equal(empty.accepted, false);
  assert.match(empty.notice ?? '', /Nobody is standing there/);

  c.service.pickUp(c.state, 'machine');
  assert.deepEqual(c.drop(0).command, { type: 'tap', target: { kind: 'spot', index: 0 } });
  assert.equal(c.until('itemHandedOver').guestId, 1);
});

test('an item whose guest has gone becomes spare and can go to anyone who ordered the same', () => {
  const c = counter(scene([{ at: 0 }, { at: 400 }]));
  c.until('guestWaiting');
  c.spot(0);
  c.station('machine');
  c.until('brewReady');
  assert.equal(c.service.madeFor('latte'), 1);
  c.until('guestLeftUnhappy');
  assert.equal(c.service.madeFor('latte'), null);
  assert.equal(c.service.selected(), null);

  // Ticket 2 arrived meanwhile and is at the second spot.
  assert.equal(c.card(1)?.guestId, 2);
  assert.equal(c.card(1)?.status, 'ready', 'the spare latte is offered to the next latte ticket');
  c.station('machine');
  assert.ok(c.spot(1).command);
  assert.equal(c.until('itemHandedOver').guestId, 2);
});

test('the simulation still allows a latte made for one ticket to go to another', () => {
  const c = counter(scene([{ at: 0 }, { at: 0 }]));
  c.until('guestWaiting', (e) => e.guestId === 2);
  c.spot(0);
  c.station('machine');
  c.until('brewReady');
  assert.equal(c.service.madeFor('latte'), 1);
  c.station('machine');
  assert.ok(c.spot(1).command, 'ticket 2 also ordered a latte');
  assert.equal(c.until('itemHandedOver').guestId, 2);
  assert.equal(c.service.madeFor('latte'), null);
  assert.equal(c.card(0)?.status, 'new', 'ticket 1 is waiting again');
});

test('a question is a different card from an order and says why it interrupts', () => {
  const c = counter(scene([{ at: 0, question: 'wifi' }, { at: 0 }, { at: 0 }, { at: 0 }]));
  c.until('guestWaiting');
  c.spot(0);
  c.station('machine');
  c.until('brewReady');
  c.station('machine');
  c.spot(0);
  c.until('guestAsked');

  const card = c.card(0);
  assert.equal(card?.kind, 'question');
  assert.equal(card?.topic, 'wifi');
  assert.equal(card?.title, 'Wi-Fi?');
  assert.equal(card?.statusText, 'Needs 2.5 s');
  assert.match(card?.label ?? '', /a question, not an order\. "What is the Wi-Fi password\?"/);
  assert.match(card?.label ?? '', /Answering takes 2\.5 seconds of your time and they hold the spot until then\./);
  assert.match(card?.label ?? '', /Someone at the door is waiting for this spot\./);
  assert.equal(c.card(3)?.status, 'door');

  // Nothing can be delivered to someone who is asking.
  c.spot(1);
  assert.equal(c.service.selected(), 2);
  // Answering is one press on the guest: the simulation's own answer action.
  const answer = c.spot(0);
  assert.deepEqual(answer.command, { type: 'tap', target: { kind: 'spot', index: 0 } });
  c.tick();
  assert.equal(c.card(0)?.status, 'answering');
  c.until('questionAnswered');
  assert.equal(c.state.metrics.ownerTicks.answer, 75);
  assert.equal(c.card(0)?.guestId, 4, 'the freed spot went to the guest at the door');
});

test('the interface state never changes the simulation, and its commands replay exactly', () => {
  const state = createInitialState();
  const c = counter(state);
  const service = c.service;
  // A simple player who uses only the new presses, checked for side effects as it goes.
  while (state.phase !== 'ended') {
    if (state.tick % 15 === 0) {
      const before = digest(state);
      const cards = service.cards(state);
      service.hints(state);
      service.describeStation(state, 'machine');
      assert.equal(digest(state), before, 'reading the interface changed the state');

      const carrying = service.carrying();
      const asking = cards.findIndex((card, i) => i < 3 && card?.kind === 'question' && card.status === 'asking');
      const ready = cards.findIndex((card, i) => i < 3 && card?.kind === 'order' && card.status === 'ready');
      const fresh = cards.findIndex((card, i) => i < 3 && card?.kind === 'order' && card.status === 'new');
      if (carrying) {
        const to = cards.findIndex((card, i) => i < 3 && card?.kind === 'order' && card.order === carrying && card.status === 'ready');
        if (to >= 0) c.spot(to);
        else service.putBack();
      } else if (ready >= 0) c.station(cards[ready]?.order === 'latte' ? 'machine' : 'case');
      else if (asking >= 0) c.spot(asking);
      else if (fresh >= 0 && state.owner.queue.length === 0) {
        c.spot(fresh);
        c.station(cards[fresh]?.order === 'latte' ? 'machine' : 'case');
      }
    }
    c.tick();
  }
  assert.ok(state.metrics.guests.served >= 5, `served ${state.metrics.guests.served}`);
  // Only the three existing command types were ever sent.
  for (const entry of c.commandLog) for (const command of entry.commands) assert.ok(['tap', 'cancel', 'unqueue'].includes(command.type));
  const again = replay({}, c.commandLog);
  assert.deepEqual(again.state, state);
  assert.equal(digest(again.events), digest(c.events));
});

test('a fresh service starts with nothing selected, carried or tagged', () => {
  const service = createService();
  const state = createInitialState();
  step(state);
  assert.equal(service.selected(), null);
  assert.equal(service.carrying(), null);
  assert.deepEqual(service.cards(state), [null, null, null, null, null]);
  assert.deepEqual(service.hints(state), { stations: [], spots: [], pickUp: [] });
  assert.match(service.describeStation(state, 'machine'), /^Coffee machine: empty\. Select an order first\.$/);
});
