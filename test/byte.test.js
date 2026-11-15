// @ts-check
/**
 * Byte's reactions (M2.5): each line reacts to something true in the
 * simulation and names the ticket, item or figure it is about.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_SECOND, createInitialState, digest, isDrink } from '../src/sim/index.js';
import { createByte } from '../src/ui/byte.js';
import { counter } from './support/counter.js';
import { scene } from './support/scene.js';

/**
 * Attaches Byte to a counter and collects what it says.
 * @param {ReturnType<typeof counter>} c
 */
function listen(c) {
  const byte = createByte();
  /** @type {{ tick: number, text: string, mood: string, urgent: boolean }[]} */
  const lines = [];
  const tick = c.tick;
  c.tick = () => {
    const events = tick();
    const before = digest(c.state);
    const reaction = byte.onTick(c.state, events, c.service.cards(c.state));
    assert.equal(digest(c.state), before, 'Byte changed the state');
    if (reaction) lines.push({ tick: c.state.tick, ...reaction });
    return events;
  };
  return lines;
}

/** Serves the guest in spot `index` with the new presses. @param {ReturnType<typeof counter>} c @param {number} index */
function serve(c, index) {
  c.spot(index);
  c.station('machine');
  c.until('brewReady');
  c.station('machine');
  c.spot(index);
  return c.until('itemHandedOver');
}

test('digital interruption: Byte quotes the question and counts what questions have cost', () => {
  const c = counter(scene([{ at: 0, question: 'wifi' }, { at: 200, question: 'review' }]));
  const lines = listen(c);
  c.until('guestWaiting');
  serve(c, 0);
  c.wait(2);
  const first = lines.find((l) => l.text.includes('question'));
  assert.equal(first?.text, 'Not an order, a question: "What is the Wi-Fi password?" Answering takes 2.5 s away from the counter.');
  assert.equal(first?.mood, 'alert');
  assert.equal(first?.urgent, true);

  c.spot(0);
  c.until('questionAnswered');
  while (!c.state.guests.some((g) => g.id === 2 && g.state === 'waiting')) c.tick();
  serve(c, c.state.spots.indexOf(2));
  c.wait(2);
  const second = lines.find((l) => l.text.startsWith('Question 2'));
  assert.equal(second?.text, 'Question 2: "Where can I leave a review?" You have spent 2.5 s on questions so far.');
});

test('digital interruption: Byte says when a question is holding a spot someone is waiting for', () => {
  const c = counter(scene([{ at: 0, question: 'menu' }, { at: 0 }, { at: 0 }, { at: 0 }]));
  const lines = listen(c);
  c.until('guestWaiting');
  serve(c, 0);
  c.wait(2);
  assert.ok(lines.some((l) => l.text.endsWith('Someone at the door is waiting for that spot.')), lines.map((l) => l.text).join(' | '));
});

test('urgency: Byte names the ticket and what is wrong with it', () => {
  // Nothing made: the line says so.
  const idle = counter(scene([{ at: 0 }]));
  const idleLines = listen(idle);
  idle.wait(720 - 4 * TICKS_PER_SECOND);
  assert.ok(idleLines.some((l) => l.text === 'Ticket 1 is nearly out of patience and nothing is being made for them.' && l.urgent));

  // Made but not delivered: a different line.
  const ready = counter(scene([{ at: 0 }]));
  const readyLines = listen(ready);
  ready.until('guestWaiting');
  ready.spot(0);
  ready.station('machine');
  ready.wait(720 - 4 * TICKS_PER_SECOND);
  assert.ok(readyLines.some((l) => l.text === "Ticket 1's latte is ready and they are about to leave. Carry it over!"));
  assert.equal(readyLines.filter((l) => l.text.includes('about to leave')).length, 1, 'said once, not repeated');

  // A lost guest is reported with their ticket.
  ready.until('guestLeftUnhappy');
  ready.wait(2);
  assert.ok(readyLines.some((l) => l.text.startsWith('Ticket 1 walked out unserved.') && l.mood === 'sad'));
});

test('shortage: Byte reports the real count of dirty dishes, and a blocked machine', () => {
  const state = scene([{ at: 0 }]);
  for (const dish of state.dishes) dish.holder = { kind: 'sink' };
  const c = counter(state);
  const lines = listen(c);
  c.wait(120);
  assert.ok(lines.some((l) => l.text === 'No clean dishes, and 5 in the sink. Nothing can be served until you wash.' && l.mood === 'alert'));

  const blocked = counter(scene([{ at: 0 }, { at: 0 }]));
  const blockedLines = listen(blocked);
  blocked.until('guestWaiting', (e) => e.guestId === 2);
  blocked.spot(0);
  blocked.station('machine');
  blocked.until('brewReady');
  blocked.wait(5 * TICKS_PER_SECOND);
  assert.ok(blockedLines.some((l) => l.text.startsWith('A finished latte is sitting on the machine.')), blockedLines.map((l) => l.text).join(' | '));
});

test('success: Byte credits a tip to its ticket', () => {
  const c = counter(scene([{ at: 0, seat: 60 }]));
  const lines = listen(c);
  c.until('guestWaiting');
  serve(c, 0);
  c.until('guestLeftHappy');
  c.wait(90);
  assert.ok(lines.some((l) => l.text === 'Tip from ticket 1: quick service and a clean table.' && l.mood === 'happy'), lines.map((l) => l.text).join(' | '));
});

test('a nudge comes only after three idle seconds and points at real work', () => {
  const c = counter(scene([{ at: 0, order: 'croissant' }]));
  const lines = listen(c);
  // The guest arrives on the first tick; the count starts when there is work to do.
  c.wait(2 * TICKS_PER_SECOND);
  assert.equal(lines.some((l) => l.text.includes('Pick the ticket')), false, 'too early');
  c.wait(1.5 * TICKS_PER_SECOND);
  assert.ok(lines.some((l) => l.text === 'Ticket 1 wants a croissant. Pick the ticket, then the pastry case.'));
});

test('over a whole shift Byte speaks sparingly, never twice within 2.5 s unless urgent, and never narrates routine work', () => {
  const c = counter(createInitialState());
  const lines = listen(c);
  // A plain, competent player: serves by hand, answers, and keeps up with dishes and tables.
  while (c.state.phase !== 'ended') {
    if (c.state.tick % 15 === 0 && c.state.owner.queue.length === 0) {
      const cards = c.service.cards(c.state);
      const carrying = c.service.carrying();
      const at = (/** @type {(card: NonNullable<typeof cards[number]>) => boolean} */ f) => cards.findIndex((card, i) => i < 3 && card !== null && f(card));
      const asking = at((card) => card.kind === 'question' && card.status === 'asking');
      const ready = at((card) => card.kind === 'order' && card.status === 'ready');
      const fresh = at((card) => card.kind === 'order' && card.status === 'new');
      const clean = c.state.dishes.filter((d) => d.holder.kind === 'rack').length;
      const dirty = c.state.dishes.filter((d) => d.holder.kind === 'sink').length;
      const dirtyTable = c.state.tables.find((t) => t.state === 'dirty');
      const washing = c.state.owner.action?.kind === 'wash';
      if (carrying) {
        const to = at((card) => card.kind === 'order' && card.order === carrying && card.status === 'ready');
        if (to >= 0) c.spot(to);
        else c.service.putBack();
      } else if (ready >= 0) c.station(isDrink(cards[ready]?.order ?? '') ? 'machine' : 'case');
      else if (clean <= 1 && dirty > 0 && !washing) c.tap({ kind: 'sink' });
      else if (asking >= 0) c.spot(asking);
      else if (fresh >= 0 && clean > 0) {
        const isFreshDrink = isDrink(cards[fresh]?.order ?? '');
        const hasEmpty = c.state.machine.slots.some((s) => s.state === 'empty' && s.claimedBy === null);
        if (!isFreshDrink || hasEmpty) {
          c.spot(fresh);
          c.station(isFreshDrink ? 'machine' : 'case');
        } else if (isFreshDrink && c.state.machine.slots.some((s) => s.state === 'ready' && s.claimedBy === null)) {
          // Machine has a ready drink nobody wants — discard it by tapping machine
          c.tap({ kind: 'machine' });
        }
        // else machine is brewing — wait
      } else if (dirtyTable && c.state.owner.action === null) c.tap({ kind: 'table', tableId: dirtyTable.id });
      else if (dirty > 0 && c.state.owner.action === null) c.tap({ kind: 'sink' });
    }
    c.tick();
  }
  assert.ok(c.state.metrics.guests.served >= 10, `the test player served only ${c.state.metrics.guests.served}`);
  const actions = c.events.filter((e) => e.type === 'actionCompleted').length;
  assert.ok(lines.length >= 5 && lines.length <= 30, `${lines.length} lines`);
  assert.ok(lines.length < actions, `${lines.length} lines for ${actions} actions`);
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i].tick - lines[i - 1].tick;
    assert.ok(gap >= 2.5 * TICKS_PER_SECOND || lines[i].urgent, `"${lines[i].text}" came ${gap} ticks after the previous line`);
  }
  // Every line about a ticket names a ticket that exists.
  for (const line of lines) {
    const m = /[Tt]icket (\d+)/.exec(line.text);
    if (m) assert.ok(Number(m[1]) >= 1 && Number(m[1]) <= c.state.schedule.length, line.text);
  }
});
