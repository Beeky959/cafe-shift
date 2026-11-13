// @ts-check
/**
 * Runs a whole shift, either from a decision function or from a recorded
 * command log. The same options and commands always give the same result.
 */
/** @import { SimState, SimEvent, Command } from './types.js' */
/** @import { InitOptions } from './state.js' */
import { createInitialState } from './state.js';
import { step } from './step.js';

/** @typedef {{ tick: number, commands: Command[] }} LoggedCommands */

/**
 * @typedef {object} ShiftRun
 * @property {SimState} state The final state.
 * @property {SimEvent[]} events Every event, in order.
 * @property {LoggedCommands[]} commandLog Every tick that had input.
 */

/**
 * @param {InitOptions} options
 * @param {(state: SimState) => Command[]} decide Called before every tick. Must not change the state.
 * @param {(state: SimState, events: SimEvent[]) => void} [afterTick] Called after every tick, for checks.
 * @returns {ShiftRun}
 */
export function runShift(options, decide, afterTick) {
  const state = createInitialState(options);
  // Every guest is resolved within one patience span of the doors closing.
  const limit = state.timing.shiftLength + state.timing.counterPatience + state.timing.askingPatience + 600;
  /** @type {SimEvent[]} */
  const events = [];
  /** @type {LoggedCommands[]} */
  const commandLog = [];
  while (state.phase !== 'ended') {
    if (state.tick > limit) throw new Error(`Shift did not end by tick ${limit}`);
    const commands = decide(state);
    if (commands.length > 0) commandLog.push({ tick: state.tick, commands });
    const produced = step(state, commands);
    events.push(...produced);
    if (afterTick) afterTick(state, produced);
  }
  return { state, events, commandLog };
}

/**
 * @param {InitOptions} options
 * @param {readonly LoggedCommands[]} commandLog
 * @returns {ShiftRun}
 */
export function replay(options, commandLog) {
  const byTick = new Map(commandLog.map((entry) => [entry.tick, entry.commands]));
  return runShift(options, (state) => byTick.get(state.tick) ?? []);
}
