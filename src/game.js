// @ts-check
/**
 * Runs a shift in the browser: turns input into commands, advances the
 * simulation in fixed ticks, and shows the result. The simulation is the only
 * thing that changes the state; everything here reads it.
 */
/** @import { SimState, SimEvent, Command, OrderItem } from './sim/types.js' */
/** @import { HitArea } from './view/scene.js' */
/** @import { ViewState } from './view/renderer.js' */
/** @import { Outcome } from './ui/service.js' */
import { TICKS_PER_SECOND, createInitialState, digest, resolveTap, step } from './sim/index.js';
import { createByte } from './ui/byte.js';
import { rejectionText } from './ui/labels.js';
import { createService } from './ui/service.js';
import { HIT_AREAS, centreOf } from './view/scene.js';

const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Never try to catch up more than this much real time in one frame. */
const MAX_FRAME_MS = 250;
/** A second press on the same target within this time is ignored. */
const DEBOUNCE_MS = 80;
const NOTICE_MS = 2200;
/** A press that moves less than this, in scene units, is a tap, not a drag. */
const DRAG_THRESHOLD = 24;

/** @typedef {'intro' | 'playing' | 'paused' | 'ended'} GamePhase */
/** @typedef {'neutral' | 'happy' | 'alert' | 'sad'} Mood */

/**
 * @typedef {object} GameUi
 * @property {(state: SimState, service: ReturnType<typeof createService>, now: number, force?: boolean) => void} update
 * @property {(text: string, mood: Mood | 'notice') => void} say
 * @property {(slot: number, text: string, until: number) => void} receipt
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
  /** Commands waiting for the next tick, each with the ticket its item is for. */
  /** @type {{ command: Command, ticket: number | null }[]} */
  let pending = [];
  /** @type {{ tick: number, commands: Command[] }[]} */
  let commandLog = [];
  let service = createService();
  let byte = createByte();
  /** @type {{ text: string, mood: Mood }} */
  let byteLine = { text: '', mood: 'neutral' };

  /** Drops any notice and shows Byte's current line again. */
  function clearNotice() {
    noticeUntil = 0;
    ui.say(byteLine.text, byteLine.mood);
  }
  let noticeUntil = 0;
  let accumulator = 0;
  let lastFrame = 0;
  let speed = 1;
  let inputCount = 0;
  let questionsAnswered = 0;
  /** @type {((state: SimState) => Command[]) | null} */
  let autoplayer = null;
  /** @type {Map<string, number>} */
  const lastPress = new Map();
  /** Where a drag began, in scene units. */
  /** @type {{ x: number, y: number, moved: boolean } | null} */
  let dragOrigin = null;
  /** @type {ViewState} */
  const view = { hoverId: null, flashes: new Map(), now: 0, service, drag: null, effects: [], happyUntil: new Map(), byteMood: 'neutral' };

  /** @param {string} text */
  function notice(text) {
    noticeUntil = view.now + NOTICE_MS;
    ui.say(text, 'notice');
  }

  /** @param {GamePhase} next */
  function setPhase(next) {
    phase = next;
    ui.setPhase(next);
    ui.update(state, service, view.now, true);
  }

  function showIntro() {
    ui.showOverlay({
      title: 'Good Beans Café',
      lines: [
        'Every guest who orders gets a numbered ticket.',
        '1. Press a guest, or their ticket, to pick the order.  2. Press the coffee machine or the pastry case to make it.  3. When it is ready, drag it to the guest, or press it and then press the guest.',
        'Some guests then hold up a phone with a question. That is not an order: answering takes you away from the counter, and they keep their spot until you do.',
        'Wash dishes at the sink and wipe tables as before.',
      ],
      button: 'Open the café',
    });
  }

  function showResults() {
    const g = state.metrics.guests;
    const answerSeconds = Math.round((state.metrics.ownerTicks.answer / TICKS_PER_SECOND) * 10) / 10;
    ui.showOverlay({
      title: 'Shift over',
      lines: [
        `${g.leftHappy} of ${state.schedule.length} guests left happy.`,
        `${state.economy.grossEarnings} coins earned, including ${state.metrics.tips} tip${state.metrics.tips === 1 ? '' : 's'}.`,
        `You answered ${questionsAnswered} question${questionsAnswered === 1 ? '' : 's'} yourself: ${answerSeconds} s away from the counter.`,
        `Score: ${state.economy.score}.`,
        'Coins and scores are part of the game only.',
      ],
      button: 'Play again',
    });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} text
   * @param {string} color
   */
  function effect(x, y, text, color) {
    view.effects = view.effects.filter((fx) => fx.until > view.now);
    view.effects.push({ x, y, text, color, start: view.now, until: view.now + 1100 });
  }

  /**
   * @param {readonly SimEvent[]} events
   * @param {Map<number, { spot: number | null, tableId: number | null }>} before Where each guest was before this tick.
   */
  function handleEvents(events, before) {
    for (const e of events) {
      const id = Number(e.guestId);
      const was = before.get(id);
      const spotArea = was && was.spot !== null ? HIT_AREAS.find((a) => a.target.kind === 'spot' && a.target.index === was.spot) : undefined;
      const tableArea = was && was.tableId !== null ? HIT_AREAS.find((a) => a.target.kind === 'table' && a.target.tableId === was.tableId) : undefined;
      switch (e.type) {
        case 'tapRejected':
          notice(rejectionText(String(e.reason)));
          break;
        case 'itemHandedOver':
          // The completed transaction: the guest is pleased, the coins show
          // at the counter, and the ticket is stamped.
          view.happyUntil.set(id, view.now + 1400);
          if (spotArea) {
            const c = centreOf(spotArea);
            // Above the guest's bubble, so it never covers a question that follows.
            effect(c.x, spotArea.y - 38, `+${e.coins}`, '#ffe08a');
            ui.receipt(was?.spot ?? -1, `Paid +${e.coins}`, view.now + 1500);
          }
          break;
        case 'questionAnswered':
          questionsAnswered += 1;
          view.happyUntil.set(id, view.now + 1000);
          break;
        case 'guestLeftHappy':
          if (Number(e.tip) > 0 && tableArea) effect(centreOf(tableArea).x, tableArea.y + 30, `+${e.tip} tip`, '#bee86f');
          break;
        case 'guestLeftUnhappy':
          if (spotArea) {
            effect(centreOf(spotArea).x, spotArea.y + 40, 'left', '#ff9d8f');
            ui.receipt(was?.spot ?? -1, 'Walked out', view.now + 1500);
          }
          break;
        default:
          break;
      }
    }
    const reaction = byte.onTick(state, events, service.cards(state));
    if (reaction !== null) {
      byteLine = reaction;
      view.byteMood = reaction.mood;
      // Urgent reactions are never hidden behind a notice.
      if (view.now >= noticeUntil || reaction.urgent) clearNotice();
    }
  }

  function tick() {
    const batch = pending;
    pending = [];
    const commands = batch.map((p) => p.command);
    const tickets = batch.filter((p) => p.command.type === 'tap').map((p) => p.ticket);
    if (autoplayer) {
      for (const command of autoplayer(state)) {
        commands.push(command);
        if (command.type === 'tap') tickets.push(null);
      }
    }
    if (commands.length > 0) commandLog.push({ tick: state.tick, commands });
    /** @type {Map<number, { spot: number | null, tableId: number | null }>} */
    const before = new Map(
      state.guests.map((g) => [g.id, { spot: g.place.kind === 'spot' ? g.place.index : null, tableId: g.place.kind === 'table' ? g.place.tableId : null }]),
    );
    const events = step(state, commands);
    service.onTick(state, events, tickets);
    handleEvents(events, before);
    if (state.phase === 'ended') {
      view.drag = null;
      dragOrigin = null;
      setPhase('ended');
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
        ui.say(byteLine.text, byteLine.mood);
      }
    }
    ui.update(state, service, now);
    draw(state, view);
    requestAnimationFrame(frame);
  }

  function start() {
    state = createInitialState({ seed });
    pending = [];
    commandLog = [];
    service = createService();
    view.service = service;
    byte = createByte();
    byteLine = { text: '', mood: 'neutral' };
    view.byteMood = 'neutral';
    noticeUntil = 0;
    accumulator = 0;
    questionsAnswered = 0;
    view.flashes.clear();
    view.effects = [];
    view.happyUntil.clear();
    view.drag = null;
    dragOrigin = null;
    ui.say('', 'neutral');
    ui.showOverlay(null);
    ui.setData('finalDigest', '');
    setPhase('playing');
  }

  function togglePause() {
    if (phase === 'playing') {
      view.drag = null;
      dragOrigin = null;
      setPhase('paused');
      ui.showOverlay({ title: 'Paused', lines: ['Your guests will wait.'], button: 'Resume' });
    } else if (phase === 'paused') {
      ui.showOverlay(null);
      accumulator = 0;
      setPhase('playing');
    }
  }

  /**
   * @param {HitArea} area
   * @param {Outcome} outcome
   */
  function apply(area, outcome) {
    if (outcome.command) pending.push({ command: outcome.command, ticket: outcome.ticket ?? null });
    view.flashes.set(area.id, outcome.accepted ? { kind: 'press', until: view.now + 160 } : { kind: 'reject', until: view.now + 350 });
    if (outcome.notice) notice(outcome.notice);
    else if (outcome.accepted && noticeUntil !== 0) clearNotice();
  }

  return {
    /** Starts the frame loop and shows the intro. */
    boot() {
      ui.setData('initialDigest', digest(state));
      setPhase('intro');
      showIntro();
      lastFrame = performance.now();
      requestAnimationFrame(frame);
    },

    /**
     * A target was pressed, by pointer, key, card or button.
     * @param {HitArea} area
     */
    press(area) {
      if (phase !== 'playing') return;
      const last = lastPress.get(area.id) ?? -Infinity;
      if (view.now - last < DEBOUNCE_MS) return;
      lastPress.set(area.id, view.now);
      inputCount += 1;
      const t = area.target;
      if (t.kind === 'machine' || t.kind === 'case') {
        apply(area, service.pressStation(state, t.kind));
        return;
      }
      if (t.kind === 'spot') {
        apply(area, service.pressSpot(state, t.index));
        return;
      }
      // Sink and tables work as before.
      if (service.carrying()) {
        apply(area, { accepted: false, notice: `You are carrying a ${service.carrying()}. Take it to the guest, or put it back.` });
        return;
      }
      const resolved = resolveTap(state, t);
      if (!resolved.ok) {
        // No command is sent for a press that can do nothing; say why instead.
        apply(area, { accepted: false, notice: rejectionText(resolved.reason) });
        return;
      }
      apply(area, { accepted: true, command: { type: 'tap', target: t } });
    },

    /**
     * The pointer went down on a station. If a finished item is there it is
     * picked up and follows the pointer.
     * @param {HitArea} area
     * @param {{ x: number, y: number }} point Scene units.
     * @returns {boolean} True if a drag began; the caller then reports moves and the release.
     */
    dragStart(area, point) {
      const t = area.target;
      if (phase !== 'playing' || (t.kind !== 'machine' && t.kind !== 'case')) return false;
      const item = /** @type {OrderItem} */ (t.kind === 'machine' ? 'latte' : 'croissant');
      // Pressing the station again while carrying its item puts it back: an ordinary press.
      if (service.carrying() === item) return false;
      if (service.pickUp(state, t.kind) === null) return false;
      inputCount += 1;
      lastPress.set(area.id, view.now);
      dragOrigin = { x: point.x, y: point.y, moved: false };
      view.drag = { item, x: point.x, y: point.y };
      view.flashes.set(area.id, { kind: 'press', until: view.now + 160 });
      return true;
    },

    /** @param {{ x: number, y: number }} point */
    dragMove(point) {
      if (!view.drag || !dragOrigin) return;
      if (Math.hypot(point.x - dragOrigin.x, point.y - dragOrigin.y) >= DRAG_THRESHOLD) dragOrigin.moved = true;
      view.drag.x = point.x;
      view.drag.y = point.y;
    },

    /**
     * The pointer was released. A drag that barely moved is a tap: the item
     * stays in hand and the next press on a guest delivers it.
     * @param {HitArea | null} area What is under the pointer now.
     * @param {boolean} [cancelled] The system cancelled the pointer.
     */
    dragEnd(area, cancelled = false) {
      if (!view.drag || !dragOrigin) return;
      const item = view.drag.item;
      const moved = dragOrigin.moved;
      view.drag = null;
      dragOrigin = null;
      if (phase !== 'playing') return;
      if (cancelled) {
        service.putBack();
        return;
      }
      if (!moved) {
        notice(`Carrying the ${item}. Now the guest who ordered it.`);
        return;
      }
      const spot = area && area.target.kind === 'spot' ? area.target.index : null;
      const outcome = service.drop(state, spot);
      if (area && spot !== null) apply(area, outcome);
      else if (outcome.notice) notice(outcome.notice);
    },

    /** @returns {boolean} True if something was being carried and has been put back. */
    putBack() {
      if (!service.carrying()) return false;
      service.putBack();
      view.drag = null;
      dragOrigin = null;
      return true;
    },

    /** @param {number} slot 0 is the current action; 1 and 2 are waiting. */
    pressChip(slot) {
      if (phase !== 'playing') return;
      inputCount += 1;
      if (slot === 0) {
        if (state.owner.action) pending.push({ command: { type: 'cancel' }, ticket: null });
        return;
      }
      const queued = state.owner.queue[slot - 1];
      if (queued) pending.push({ command: { type: 'unqueue', actionId: queued.id }, ticket: null });
    },

    cancelCurrent() {
      if (phase === 'playing' && state.owner.action) pending.push({ command: { type: 'cancel' }, ticket: null });
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
      /** Presses handled since the page loaded, whether or not they sent a command. */
      inputCount: () => inputCount,
      selected: () => service.selected(),
      carrying: () => service.carrying(),
      byte: () => byteLine,
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
