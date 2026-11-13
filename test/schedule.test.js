// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, buildSchedule, toTicks } from '../src/sim/index.js';

const shift = CONFIG.shifts.slice;
const SEEDS = [0, 1, 2, 7, 42, 1234, 20261113, 0xffffffff];

test('the same shift and seed always give the same schedule', () => {
  for (const seed of SEEDS) {
    assert.deepEqual(buildSchedule(shift, seed), buildSchedule(shift, seed));
  }
});

test('different seeds give different schedules', () => {
  const seen = new Set(SEEDS.map((seed) => JSON.stringify(buildSchedule(shift, seed))));
  assert.equal(seen.size, SEEDS.length);
});

test('every schedule meets the exact counts in the shift config', () => {
  for (const seed of SEEDS) {
    const schedule = buildSchedule(shift, seed);
    const supported = schedule.filter((g) => g.question?.supported === true);
    const unsupported = schedule.filter((g) => g.question?.supported === false);

    assert.equal(schedule.length, shift.guests);
    assert.equal(schedule.filter((g) => g.order === 'croissant').length, shift.croissantGuests);
    assert.equal(supported.length, shift.supportedQuestionGuests);
    assert.equal(unsupported.length, shift.unsupportedQuestionGuests);
    assert.equal(
      schedule.filter((g) => g.usesStandIfPresent).length,
      Math.round(shift.supportedQuestionGuests * shift.standUseFraction),
    );
    // Only guests with a supported question may use a stand.
    assert.ok(schedule.every((g) => !g.usesStandIfPresent || g.question?.supported === true));
    // Every supported topic appears, because there are at least as many askers as topics.
    assert.deepEqual(
      [...new Set(supported.map((g) => g.question?.topic))].sort(),
      [...CONFIG.supportedTopics].sort(),
    );
    assert.ok(unsupported.every((g) => g.question?.topic === 'washroom'));
  }
});

test('arrivals are whole ticks, in order, inside the arrival window, with ids from 1', () => {
  const first = toTicks(shift.firstArrivalSeconds);
  const last = toTicks(shift.lastArrivalSeconds);
  for (const seed of SEEDS) {
    const schedule = buildSchedule(shift, seed);
    schedule.forEach((guest, i) => {
      assert.equal(guest.id, i + 1);
      assert.ok(Number.isInteger(guest.arrivalTick));
      assert.ok(guest.arrivalTick >= first && guest.arrivalTick <= last);
      if (i > 0) assert.ok(guest.arrivalTick >= schedule[i - 1].arrivalTick);
      assert.ok(guest.seatTicks >= toTicks(CONFIG.seatSeconds.min));
      assert.ok(guest.seatTicks <= toTicks(CONFIG.seatSeconds.max));
      assert.ok(guest.look >= 0 && guest.look < CONFIG.guestLooks);
    });
  }
});

test('invalid input is rejected', () => {
  assert.throws(() => buildSchedule(shift, 1.5), TypeError);
  assert.throws(() => buildSchedule(shift, Number.NaN), TypeError);
  assert.throws(() => buildSchedule({ ...shift, croissantGuests: 99 }, 1), RangeError);
  assert.throws(() => buildSchedule({ ...shift, supportedQuestionGuests: 14 }, 1), RangeError);
  assert.throws(() => buildSchedule({ ...shift, lastArrivalSeconds: 999 }, 1), RangeError);
  assert.throws(() => buildSchedule({ ...shift, lastArrivalSeconds: shift.lengthSeconds }, 1), RangeError);
  assert.throws(() => buildSchedule({ ...shift, standUseFraction: 2 }, 1), RangeError);
});

test('building a schedule does not change the config', () => {
  const before = JSON.stringify(CONFIG);
  buildSchedule(shift, 5);
  assert.equal(JSON.stringify(CONFIG), before);
  assert.ok(Object.isFrozen(CONFIG) && Object.isFrozen(CONFIG.shifts.slice) && Object.isFrozen(CONFIG.seconds));
});
