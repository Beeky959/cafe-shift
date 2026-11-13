// @ts-check
/**
 * Runs a shift in the browser: turns input into commands, advances the
 * simulation in fixed ticks, and shows the result. The simulation is the only
 * thing that changes the state; everything here reads it.
 */
/** @import { SimState, SimEvent, Command } from './sim/types.js' */
/** @import { HitArea } from './view/scene.js' */
/** @import { ViewState } from './view/renderer.js' */
import { TICKS_PER_SECOND, createInitialState, digest, resolveTap, step } from './sim/index.js';
import { createByte } from './ui/byte.js';
import { rejectionText } from './ui/labels.js';

const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Never try to catch up more than this much real time in one frame. */
const MAX_FRAME_MS = 250;
/** A second press on the same target within this time is ignored. */
const DEBOUNCE_MS = 80;
const NOTICE_MS = 1800;

/** @typedef {'intro' | 'playing' | 'paused' | 'ended'} GamePhase */

/**
 * @typedef {object} GameUi
 * @property {(state: SimState, force?: boolean) => void} update
 * @property {(text: string) => void} say
 * @property {(phase: GamePhase) => void} setPhase
 * @property {(content: { title: string, lines: string[], button: string } | null) => void} showOverlay
 * @property {(key: string, value: string) => void} setData
 */

/**
 * @param {object} deps
 * @param {number} deps.seed
 * @param {GameUi} deps.ui
 * @param {(state: SimState, view: ViewState) => void} deps.draw
 */
export function createGame({ seed, ui, draw }) {
  /** @type {SimState} */
  let state = createInitialState({ seed });
  /** @type {GamePhase} */
  let phase = 'intro';
  /** @type {Command[]} */
  let pending = [];
  /** @type {{ tick: number, commands: Command[] }[]} */
  let commandLog = [];
  let byte = createByte();
  let byteLine = '';
  let noticeUntil = 0;
  let accumulator = 0;
  let lastFrame = 0;
  let speed = 1;
  /** @type {((state: SimState) => Command[]) | null} */
  let autoplayer = null;
  /** @type {Map<string, number>} */
  const lastPress = new Map();
  /** @type {ViewState} */
  const view = { hoverId: null, flashes: new Map(), now: 0 };

  /** @param {string} text */
  function notice(text) {
    noticeUntil = view.now + NOTICE_MS;
    ui.say(text);
  }

  /** @param {GamePhase} next */
  function setPhase(next) {
    phase = next;
    ui.setPhase(next);
    ui.update(state, true);
  }

  function showIntro() {
    ui.showOverlay({
      title: 'Good Beans Café',
      lines: [
        'You run the counter. One pair of hands, one thing at a time.',
        'Tap the machine to brew, then tap a guest to serve. Wash dishes at the sink and wipe tables so guests can sit.',
        'Some guests have a question after they are served. Tap them to answer.',
      ],
      button: 'Open the café',
    });
  }

  function showResults() {
    const g = state.metrics.guests;
    ui.showOverlay({
      title: 'Shift over',
      lines: [
        `${g.leftHappy} of ${state.schedule.length} guests left happy.`,
        `${state.economy.grossEarnings} coins earned, including ${state.metrics.tips} tip${state.metrics.tips === 1 ? '' : 's'}.`,
        `Score: ${state.economy.score}.`,
        'Coins and scores are part of the game only.',
      ],
      button: 'Play again',
    });
  }

  /** @param {readonly SimEvent[]} events */
  function handleEvents(events) {
    for (const e of events) {
      if (e.type === 'tapRejected') notice(rejectionText(String(e.reason)));
    }
    const line = byte.onTick(state, events);
    if (line !== null) {
      byteLine = line;
      if (view.now >= noticeUntil) ui.say(line);
    }
  }

  function tick() {
    const commands = pending;
    pending = [];
    if (autoplayer) commands.push(...autoplayer(state));
    if (commands.length > 0) commandLog.push({ tick: state.tick, commands });
    const events = step(state, commands);
    handleEvents(events);
    if (state.phase === 'ended') {
      setPhase('ended');
      ui.update(state, true);
      ui.setData('finalDigest', digest(state));
      showResults();
    }
  }

  /** @param {number} now */
  function frame(now) {
    view.now = now;
    const elapsed = Math.min(now - lastFrame, MAX_FRAME_MS);
    lastFrame = now;
    if (phase === 'playing') {
      accumulator += elapsed * speed;
      let budget = 4000;
      while (accumulator >= TICK_MS && phase === 'playing' && budget-- > 0) {
        accumulator -= TICK_MS;
        tick();
      }
      if (noticeUntil !== 0 && now >= noticeUntil) {
        noticeUntil = 0;
        ui.say(byteLine);
      }
    }
    ui.update(state);
    draw(state, view);
    requestAnimationFrame(frame);
  }

  function start() {
    state = createInitialState({ seed });
    pending = [];
    commandLog = [];
    byte = createByte();
    byteLine = '';
    noticeUntil = 0;
    accumulator = 0;
    view.flashes.clear();
    ui.say('');
    ui.showOverlay(null);
    ui.setData('finalDigest', '');
    setPhase('playing');
    ui.update(state, true);
  }

  function togglePause() {
    if (phase === 'playing') {
      setPhase('paused');
      ui.showOverlay({ title: 'Paused', lines: ['Your guests will wait.'], button: 'Resume' });
    } else if (phase === 'paused') {
      ui.showOverlay(null);
      accumulator = 0;
      setPhase('playing');
    }
  }

  return {
    /** Starts the frame loop and shows the intro. */
    boot() {
      ui.setData('initialDigest', digest(state));
      setPhase('intro');
      ui.update(state, true);
      showIntro();
      lastFrame = performance.now();
      requestAnimationFrame(frame);
    },

    /**
     * A target was pressed, by pointer, key or button.
     * @param {HitArea} area
     */
    press(area) {
      if (phase !== 'playing') return;
      const last = lastPress.get(area.id) ?? -Infinity;
      if (view.now - last < DEBOUNCE_MS) return;
      lastPress.set(area.id, view.now);
      const resolved = resolveTap(state, area.target);
      if (!resolved.ok) {
        // No command is sent for a tap that can do nothing; say why instead.
        view.flashes.set(area.id, { kind: 'reject', until: view.now + 350 });
        notice(rejectionText(resolved.reason));
        return;
      }
      view.flashes.set(area.id, { kind: 'press', until: view.now + 160 });
      pending.push({ type: 'tap', target: area.target });
    },

    /** @param {number} slot 0 is the current action; 1 and 2 are waiting. */
    pressChip(slot) {
      if (phase !== 'playing') return;
      if (slot === 0) {
        if (state.owner.action) pending.push({ type: 'cancel' });
        return;
      }
      const queued = state.owner.queue[slot - 1];
      if (queued) pending.push({ type: 'unqueue', actionId: queued.id });
    },

    cancelCurrent() {
      if (phase === 'playing' && state.owner.action) pending.push({ type: 'cancel' });
    },

    togglePause,

    /** Pauses if a shift is running; used when the page is hidden. */
    pauseIfPlaying() {
      if (phase === 'playing') togglePause();
    },

    overlayButton() {
      if (phase === 'paused') togglePause();
      else start();
    },

    /** @param {string | null} id */
    setHover(id) {
      view.hoverId = id;
    },

    phase: () => phase,

    /** For development and automated checks only. */
    debug: {
      state: () => state,
      digest: () => digest(state),
      commandLog: () => commandLog,
      /** Commands accepted from input and waiting for the next tick. */
      pendingCount: () => pending.length,
      /** @param {number} factor */
      setSpeed(factor) {
        speed = Math.max(0, factor);
      },
      /** @param {((state: SimState) => Command[]) | null} player */
      setAutoplayer(player) {
        autoplayer = player;
      },
    },
  };
}
