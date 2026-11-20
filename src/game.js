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
import { TICKS_PER_SECOND, MISSIONS, createInitialState, digest, resolveTap, step, makeNpcSlot } from './sim/index.js';
import { createByte } from './ui/byte.js';
import { rejectionText } from './ui/labels.js';
import { createService } from './ui/service.js';
import { createAnimator } from './view/animator.js';
import * as Audio from './audio/index.js';

const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Never try to catch up more than this much real time in one frame. */
const MAX_FRAME_MS = 250;
/** A second press on the same target within this time is ignored. */
const DEBOUNCE_MS = 80;
const NOTICE_MS = 2200;
/** A press that moves less than this, in scene units, is a tap, not a drag. */
const DRAG_THRESHOLD = 24;

/** @typedef {'intro' | 'missionSelect' | 'playing' | 'paused' | 'ended' | 'shop' | 'cutscene'} GamePhase */
/** @typedef {import('./ui/byte.js').Mood} Mood */

/**
 * @typedef {object} GameUi
 * @property {(state: SimState, service: ReturnType<typeof createService>, now: number, force?: boolean) => void} update
 * @property {(text: string, mood: Mood | 'notice') => void} say
 * @property {(slot: number, text: string, until: number) => void} receipt
 * @property {(phase: GamePhase) => void} setPhase
 * @property {(content: { title: string, lines: string[], button: string, items?: { label: string, sublabel: string, status: 'locked' | 'available' | 'completed' }[] } | null) => void} showOverlay
 * @property {(key: string, value: string) => void} setData
 */

/**
 * @typedef {object} Upgrade
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {number} cost
 */

/** @type {readonly Upgrade[]} */
const UPGRADES = Object.freeze([
  { id: 'tapit-stand', name: 'TapIt Stand', desc: 'Guests answer their own digital questions at a kiosk — no more counter delays.', cost: 80 },
  { id: 'espresso-upgrade', name: 'Espresso Express', desc: 'A faster machine — brewing takes 20% less time.', cost: 60 },
  { id: 'pastry-warmer', name: 'Pastry Warmer', desc: 'Pre-warmed pastries — pastry prep takes 20% less time.', cost: 50 },
]);

/**
 * Which NPC unlocks after first-clearing each mission index.
 * @type {Readonly<Record<number, string>>}
 */
const NPC_STAFF = Object.freeze({ 0: 'barista', 1: 'baker', 2: 'dishwasher', 3: 'server' });

/** Display names and intro lines for each NPC. */
const NPC_INFO = Object.freeze(/** @type {Record<string, { name: string, role: string, lines: string[] }>} */ ({
  barista: { name: 'Maya', role: 'Barista', lines: ['She joined your team after seeing how hard you worked on Opening Day.', 'Maya knows espresso inside out — your brew times are much faster now.'] },
  baker:   { name: 'Carlos', role: 'Baker',   lines: ['Carlos heard about the morning rush and wanted in.', 'With him at the oven, pastry prep time is cut way down.'] },
  dishwasher: { name: 'Sam', role: 'Dishwasher', lines: ['Sam was impressed by how you handled the digital chaos.', 'Dishes get cleaned twice as fast with their help.'] },
  server:  { name: 'Zoe',   role: 'Server',  lines: ['Zoe is a people person — perfect for the floor.', 'Hand-offs to guests are noticeably quicker with her around.'] },
}));

// ---- localStorage save/load ----
const SAVE_KEY = 'cafe-shift-progress';
const SAVE_VERSION = 2;

/**
 * @typedef {object} SaveData
 * @property {number} version
 * @property {number} wallet
 * @property {string[]} purchased
 * @property {number[]} completedMissions
 * @property {string[]} staff
 */

/** @returns {SaveData | null} */
function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    // Migrate from version 1 (no staff field)
    if (data.version === 1) {
      data.staff = [];
      data.version = 2;
    }
    if (data.version !== SAVE_VERSION) return null;
    if (typeof data.wallet !== 'number' || !Array.isArray(data.purchased) || !Array.isArray(data.completedMissions) || !Array.isArray(data.staff)) return null;
    if (!data.purchased.every(/** @param {unknown} x */ (x) => typeof x === 'string')) return null;
    if (!data.completedMissions.every(/** @param {unknown} x */ (x) => typeof x === 'number')) return null;
    if (!data.staff.every(/** @param {unknown} x */ (x) => typeof x === 'string')) return null;
    return /** @type {SaveData} */ (data);
  } catch {
    return null;
  }
}

/** @param {number} wallet @param {Set<string>} purchased @param {Set<number>} completedMissions @param {Set<string>} staffUnlocked */
function saveProgress(wallet, purchased, completedMissions, staffUnlocked) {
  try {
    /** @type {SaveData} */
    const data = {
      version: SAVE_VERSION,
      wallet,
      purchased: [...purchased],
      completedMissions: [...completedMissions],
      staff: [...staffUnlocked],
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — game still works, just no persistence.
  }
}

/**
 * @param {object} deps
 * @param {number} deps.seed
 * @param {GameUi} deps.ui
 * @param {(state: SimState, view: ViewState) => void} deps.draw
 * @param {boolean} [deps.reducedMotion] The player asked their device for less motion.
 * @param {{ isOpen(): boolean, open(t: string, s: SimState): void, close(): void, onFrame(dt: number, s: SimState, ev: readonly import('./sim/types.js').SimEvent[]): void } | null} [deps.overlay]
 */
export function createGame({ seed, ui, draw, reducedMotion = false, overlay = null }) {
  // Load saved progress or start fresh
  const saved = loadProgress();
  /** Coins that carry over between shifts. */
  let wallet = saved ? saved.wallet : 0;
  /** Upgrades purchased across shifts. */
  /** @type {Set<string>} */
  const purchased = new Set(saved ? saved.purchased : []);
  /** Which mission indices the player has completed. */
  /** @type {Set<number>} */
  const completedMissions = new Set(saved ? saved.completedMissions : []);
  /** Staff NPCs the player has unlocked. */
  /** @type {Set<string>} */
  const staffUnlocked = new Set(saved ? saved.staff : []);
  /** Index into MISSIONS for the current or last-played mission (null = free play / intro). */
  /** @type {number | null} */
  let currentMission = null;
  /** Whether the last-completed mission was passed. Used by the overlay button to decide retry vs continue. */
  let lastMissionPassed = false;
  /** NPC id waiting to be introduced in a cutscene, or null. */
  /** @type {string | null} */
  let pendingCutsceneStaff = null;

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
  const view = { hoverId: null, flashes: new Map(), now: 0, service, drag: null, anim: createAnimator(), reducedMotion, staff: staffUnlocked };
  /** Manual stepping, for recordings: the frame loop draws but does not advance. */
  let manual = false;
  /** Whether the AudioContext has been started (requires a user gesture). */
  let audioStarted = false;
  /** Time spent drawing, for performance checks: a ring of the last 240 frames, ms. */
  const drawTimes = /** @type {number[]} */ ([]);

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

  function showMissionSelect() {
    setPhase('missionSelect');
    const items = MISSIONS.map((m, i) => {
      const done = completedMissions.has(i);
      // Mission 0 is always available; others unlock when the previous one is completed.
      const unlocked = i === 0 || completedMissions.has(i - 1);
      const rewardText = done ? '' : ` · Reward: ${m.reward} coins`;
      return {
        label: `${i + 1}. ${m.name}`,
        sublabel: `${m.desc}${rewardText}`,
        status: /** @type {'locked' | 'available' | 'completed'} */ (done ? 'completed' : unlocked ? 'available' : 'locked'),
      };
    });
    const clearedCount = completedMissions.size;
    const totalCount = MISSIONS.length;
    ui.showOverlay({
      title: 'Choose a Mission',
      lines: [`Progress: ${clearedCount}/${totalCount} cleared  ·  Wallet: ${wallet} coins`],
      button: 'Free Play',
      items,
    });
  }

  function showResults() {
    const g = state.metrics.guests;
    const earned = state.economy.grossEarnings;
    wallet += earned;
    const totalArrived = state.nextArrivalIndex;
    const lostCount = g.leftUnhappy + g.walkedPast;
    const answerSeconds = Math.round((state.metrics.ownerTicks.answer / TICKS_PER_SECOND) * 10) / 10;
    /** @type {string[]} */
    const lines = [];

    // --- Shift stats breakdown ---
    lines.push(`Arrived: ${totalArrived}  ·  Served: ${g.served}  ·  Lost: ${lostCount}`);
    lines.push(`Revenue: ${earned} coins (${state.metrics.tips} tip${state.metrics.tips === 1 ? '' : 's'})`);
    lines.push(`Questions answered: ${questionsAnswered} (${answerSeconds}s away)`);

    let title = 'Shift over';
    /** @type {boolean} */
    let missionPassed = false;
    /** @type {boolean} */
    let missionFailed = false;

    if (currentMission !== null) {
      const mission = MISSIONS[currentMission];

      // Check failure conditions first
      const failResults = (mission.failConditions ?? []).map((fc) => ({ label: fc.label, failed: fc.check(state) }));
      missionFailed = failResults.some((r) => r.failed);

      // Check success objectives
      const objResults = mission.objectives.map((obj) => ({ label: obj.label, pass: obj.check(state) }));
      const allObjectivesPassed = objResults.every((r) => r.pass);

      missionPassed = allObjectivesPassed && !missionFailed;

      if (missionPassed) {
        const firstClear = !completedMissions.has(currentMission);
        completedMissions.add(currentMission);
        if (firstClear) {
          wallet += mission.reward;
          lines.push('');
          lines.push(`🎉 First clear bonus: +${mission.reward} coins!`);
          const newNpc = NPC_STAFF[currentMission];
          if (newNpc && !staffUnlocked.has(newNpc)) {
            pendingCutsceneStaff = newNpc;
          }
        }
        title = `✓ ${mission.name} — Complete!`;
      } else if (missionFailed) {
        title = `✗ ${mission.name} — Failed`;
      } else {
        title = `${mission.name} — Not quite`;
      }

      lines.push('');
      lines.push('— Objectives —');
      for (const r of objResults) {
        lines.push(`${r.pass ? '✓' : '✗'} ${r.label}`);
      }
      if (failResults.length > 0) {
        lines.push('');
        lines.push('— Fail Conditions —');
        for (const r of failResults) {
          lines.push(`${r.failed ? '✗ FAILED:' : '✓'} ${r.label}`);
        }
      }
    }

    lines.push('');
    lines.push(`Wallet: ${wallet} coins.`);

    lastMissionPassed = missionPassed;

    // Save after wallet/completion updates
    saveProgress(wallet, purchased, completedMissions, staffUnlocked);

    // Button: retry if failed, continue if passed
    const isMission = currentMission !== null;
    const button = isMission && !missionPassed ? 'Retry' : 'Continue';
    ui.showOverlay({ title, lines, button });
  }

  function showCutscene() {
    const npcId = pendingCutsceneStaff;
    if (!npcId) { showShop(); return; }
    const info = NPC_INFO[npcId];
    setPhase('cutscene');
    ui.showOverlay({
      title: `New Hire: ${info.name} (${info.role})`,
      lines: ['', ...info.lines, '', 'Your team is growing. The next shift will be smoother.'],
      button: 'Start Next Shift',
    });
  }

  function showShop() {
    setPhase('shop');
    const available = UPGRADES.filter((u) => !purchased.has(u.id));
    const lines = [`Wallet: ${wallet} coins.`];
    if (available.length === 0) {
      lines.unshift('All upgrades purchased!');
    }
    /** @type {{ label: string, sublabel: string, status: 'locked' | 'available' | 'completed' }[] | undefined} */
    const items = available.length > 0
      ? available.map((u) => ({
          label: `${u.name} — ${u.cost} coins`,
          sublabel: u.desc,
          status: /** @type {'locked' | 'available' | 'completed'} */ (wallet >= u.cost ? 'available' : 'locked'),
        }))
      : undefined;
    ui.showOverlay({
      title: 'Upgrade Shop',
      lines,
      button: 'Next Mission',
      items,
    });
  }

  /**
   * Buy a specific upgrade by its index in the available (unpurchased) list.
   * @param {number} index Index into the filtered available upgrades.
   * @returns {boolean} Whether something was bought.
   */
  function buyUpgrade(index) {
    const available = UPGRADES.filter((u) => !purchased.has(u.id));
    if (index < 0 || index >= available.length) return false;
    const u = available[index];
    if (wallet < u.cost) return false;
    wallet -= u.cost;
    purchased.add(u.id);
    saveProgress(wallet, purchased, completedMissions, staffUnlocked);
    return true;
  }

  /** Byte's caption mood, as a face. @type {Readonly<Record<Mood, import('./view/animator.js').ByteExpression>>} */
  const BYTE_FACE = { neutral: 'neutral', happy: 'happy', alert: 'alert', sad: 'sad', thinking: 'thinking', celebrate: 'celebrate' };

  /**
   * Interface reactions to a tick's events: refusals, ticket stamps and
   * Byte's lines. Animation is started separately, by the animator.
   * @param {readonly SimEvent[]} events
   * @param {Map<number, { spot: number | null }>} before Where each guest was before this tick.
   */
  function handleEvents(events, before) {
    for (const e of events) {
      const was = before.get(Number(e.guestId));
      switch (e.type) {
        case 'tapRejected':
          notice(rejectionText(String(e.reason)));
          Audio.play('sfx_reject');
          break;
        case 'actionStarted': {
          const kind = String(e.kind);
          if (overlay) {
            if (kind === 'wash') overlay.open('sink', state);
            else if (kind === 'bakeLoad' || kind === 'bakeUnload') overlay.open('oven', state);
            else if (kind === 'handOver') overlay.open('handoff', state);
          }
          if (kind === 'wash') Audio.startLoop('wash', 'sfx_wash_loop');
          else if (kind === 'bakeLoad') Audio.startLoop('oven', 'sfx_oven_loop');
          break;
        }
        case 'brewStarted':
          if (overlay) overlay.open('espresso', state);
          Audio.startLoop('espresso', 'sfx_espresso_loop');
          Audio.trigger(e.type, { order: String(e.order ?? ''), speaker: 'customer' });
          break;
        case 'brewReady':
          if (overlay?.isOpen()) overlay.close();
          Audio.stopLoop('espresso');
          Audio.play('sfx_brew_ready');
          break;
        case 'actionCompleted': {
          const kind = String(e.kind ?? '');
          if (overlay?.isOpen() && kind !== 'brewStart') overlay.close();
          if (kind === 'wash') Audio.stopLoop('wash');
          else if (kind === 'bakeUnload') {
            Audio.stopLoop('oven');
            Audio.play('sfx_bake_ready');
          }
          break;
        }
        case 'dishWashed':
          if (overlay?.isOpen()) overlay.close();
          Audio.play('sfx_dish_clink');
          break;
        case 'guestArrived':
          Audio.play('sfx_door_chime');
          Audio.trigger(e.type, { speaker: 'customer' });
          Audio.updateFromGuestCount(state.guests.filter((g) => g.place.kind === 'spot').length);
          break;
        case 'guestAsked':
          Audio.trigger(e.type, { topic: String(e.topic ?? ''), speaker: 'customer' });
          break;
        case 'guestUsingStand':
          if (overlay && state.stand.installed) overlay.open('tapit', state);
          Audio.play('sfx_tapit_tap');
          break;
        case 'standAnswered':
          if (overlay?.isOpen()) overlay.close();
          Audio.play('sfx_tapit_success');
          break;
        case 'itemHandedOver':
          if (overlay?.isOpen()) overlay.close();
          if (was && was.spot !== null) ui.receipt(was.spot, `Paid +${e.coins}`, view.now + 1500);
          Audio.play('sfx_handoff');
          Audio.trigger(e.type, { speaker: 'customer' });
          Audio.updateFromGuestCount(state.guests.filter((g) => g.place.kind === 'spot').length);
          break;
        case 'questionAnswered':
          questionsAnswered += 1;
          Audio.play('sfx_button');
          break;
        case 'guestLeftHappy':
          Audio.play('sfx_door_chime');
          Audio.updateFromGuestCount(state.guests.filter((g) => g.place.kind === 'spot').length);
          break;
        case 'guestLeftUnhappy':
          if (was && was.spot !== null) ui.receipt(was.spot, 'Walked out', view.now + 1500);
          Audio.play('sfx_guest_unhappy');
          Audio.triggerByte('byte_warning', e.type);
          Audio.updateFromGuestCount(state.guests.filter((g) => g.place.kind === 'spot').length);
          break;
        default:
          break;
      }
    }
    const reaction = byte.onTick(state, events, service.cards(state));
    if (reaction !== null) {
      byteLine = reaction;
      view.anim.react(BYTE_FACE[reaction.mood] ?? 'neutral');
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
    /** @type {Map<number, { spot: number | null }>} */
    const before = new Map(state.guests.map((g) => [g.id, { spot: g.place.kind === 'spot' ? g.place.index : null }]));
    const events = step(state, commands);
    service.onTick(state, events, tickets);
    view.anim.onEvents(events, state);
    handleEvents(events, before);
    if (state.phase === 'ended') {
      view.drag = null;
      dragOrigin = null;
      setPhase('ended');
      ui.setData('finalDigest', digest(state));
      showResults();
    }
  }

  /**
   * Advances the game by `elapsed` milliseconds of real time, then draws.
   * @param {number} now
   * @param {number} elapsed
   */
  function advanceAndDraw(now, elapsed) {
    view.now = now;
    // The visual clock runs with the game and stops when it is paused, so
    // nothing on screen moves on while the rules are frozen.
    const visual = phase === 'playing' ? elapsed * speed : phase === 'paused' ? 0 : elapsed;
    view.anim.advance(visual);
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
    view.anim.sync(state, visual);
    overlay?.onFrame(visual, state, []);
    ui.update(state, service, now);
    const t0 = performance.now();
    draw(state, view);
    drawTimes.push(performance.now() - t0);
    if (drawTimes.length > 240) drawTimes.shift();
  }

  /** @param {number} now */
  function frame(now) {
    const elapsed = Math.min(now - lastFrame, MAX_FRAME_MS);
    lastFrame = now;
    if (!manual) advanceAndDraw(now, elapsed);
    requestAnimationFrame(frame);
  }

  /**
   * Start a shift. If missionIndex is given, uses that mission's shift config.
   * @param {number | null} [missionIndex]
   */
  function start(missionIndex = null) {
    currentMission = missionIndex;
    lastMissionPassed = false;
    const preset = purchased.has('tapit-stand') ? 'test-stand' : 'none';
    const shiftId = missionIndex !== null ? MISSIONS[missionIndex].shiftId : 'slice';
    state = createInitialState({ seed, shiftId, preset });

    // Apply upgrade effects to timing
    if (purchased.has('espresso-upgrade')) {
      // 20% faster brew times (fewer ticks, rounded down but at least 1)
      state.timing.brew = Math.max(1, Math.round(state.timing.brew * 0.8));
      state.timing.brewEspresso = Math.max(1, Math.round(state.timing.brewEspresso * 0.8));
      state.timing.brewMocha = Math.max(1, Math.round(state.timing.brewMocha * 0.8));
    }
    if (purchased.has('pastry-warmer')) {
      // 20% faster pastry operations
      state.timing.bakeLoad = Math.max(1, Math.round(state.timing.bakeLoad * 0.8));
      state.timing.bake = Math.max(1, Math.round(state.timing.bake * 0.8));
      state.timing.bakeUnload = Math.max(1, Math.round(state.timing.bakeUnload * 0.8));
    }
    // Apply NPC assist bonuses
    if (staffUnlocked.has('barista')) {
      state.timing.brew = Math.max(1, Math.round(state.timing.brew * 0.55));
      state.timing.brewEspresso = Math.max(1, Math.round(state.timing.brewEspresso * 0.55));
      state.timing.brewMocha = Math.max(1, Math.round(state.timing.brewMocha * 0.55));
    }
    if (staffUnlocked.has('baker')) {
      state.timing.bakeLoad = Math.max(1, Math.round(state.timing.bakeLoad * 0.6));
      state.timing.bake = Math.max(1, Math.round(state.timing.bake * 0.6));
      state.timing.bakeUnload = Math.max(1, Math.round(state.timing.bakeUnload * 0.6));
    }
    if (staffUnlocked.has('dishwasher')) {
      state.timing.washPerDish = Math.max(1, Math.round(state.timing.washPerDish * 0.5));
    }
    if (staffUnlocked.has('server')) {
      state.timing.handOver = Math.max(1, Math.round(state.timing.handOver * 0.5));
    }
    // Activate NPC autonomous action slots for each unlocked staff member
    for (const role of staffUnlocked) {
      state.npcs[role] = makeNpcSlot();
    }
    pending = [];
    commandLog = [];
    service = createService();
    view.service = service;
    byte = createByte();
    byteLine = { text: '', mood: 'neutral' };
    view.anim = createAnimator();
    noticeUntil = 0;
    accumulator = 0;
    questionsAnswered = 0;
    view.flashes.clear();
    view.drag = null;
    dragOrigin = null;
    ui.say('', 'neutral');
    ui.showOverlay(null);
    ui.setData('finalDigest', '');
    // Reset dialogue cooldowns and start ambient sound
    Audio.dialogueReset();
    Audio.schedulerStart();
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
      // Wire subtitle display through Byte's say UI.
      Audio.onSubtitleChange((entry) => {
        if (entry) ui.say(`"${entry.text}"`, 'neutral');
        else ui.say(byteLine.text, byteLine.mood);
      });
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
      if (!audioStarted) { audioStarted = true; Audio.init(); Audio.registerReadyAssets(); }
      const last = lastPress.get(area.id) ?? -Infinity;
      if (view.now - last < DEBOUNCE_MS) return;
      lastPress.set(area.id, view.now);
      Audio.play('sfx_button', { cooldownMs: 120 });
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
      if (!audioStarted) { audioStarted = true; Audio.init(); Audio.registerReadyAssets(); }
      Audio.play('sfx_button', { cooldownMs: 120 });
      if (phase === 'paused') togglePause();
      else if (phase === 'ended') {
        // After a mission: retry goes back to the same mission; on pass show cutscene (if new hire) then shop.
        if (currentMission !== null && !lastMissionPassed) {
          start(currentMission); // Retry the failed mission
        } else if (pendingCutsceneStaff) {
          showCutscene();
        } else {
          showShop();
        }
      } else if (phase === 'cutscene') {
        staffUnlocked.add(/** @type {string} */ (pendingCutsceneStaff));
        pendingCutsceneStaff = null;
        saveProgress(wallet, purchased, completedMissions, staffUnlocked);
        showShop();
      } else if (phase === 'shop') {
        showMissionSelect(); // "Next Mission" button always goes to mission select.
      } else if (phase === 'missionSelect') {
        start(null); // "Free Play" button — use default slice shift.
      } else if (phase === 'intro') {
        showMissionSelect(); // intro → mission select
      } else start(null);
    },

    /**
     * An item was pressed in an overlay (mission select or shop).
     * Routes to the right handler based on current phase.
     * @param {number} index
     */
    overlayItem(index) {
      if (phase === 'missionSelect') {
        if (index < 0 || index >= MISSIONS.length) return;
        const unlocked = index === 0 || completedMissions.has(index - 1);
        if (!unlocked) return;
        start(index);
      } else if (phase === 'shop') {
        if (buyUpgrade(index)) showShop(); // Refresh shop after purchase
      }
    },

    /**
     * A mission item was pressed in the mission-select overlay.
     * @param {number} index
     */
    selectMission(index) {
      if (phase !== 'missionSelect') return;
      if (index < 0 || index >= MISSIONS.length) return;
      // Only unlocked missions can be started.
      const unlocked = index === 0 || completedMissions.has(index - 1);
      if (!unlocked) return;
      start(index);
    },

    /** Dismiss the station close-up panel (overlay close button). */
    dismissOverlay() {
      if (overlay?.isOpen()) overlay.close();
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
      /**
       * Recording mode: frames are produced only by advance(), so a capture
       * gets every frame at an exact time step, however slowly it is taken.
       * @param {boolean} on
       */
      setManual(on) {
        manual = on;
        accumulator = 0;
      },
      /** @param {number} ms Real time to advance, then draw one frame. */
      advance(ms) {
        advanceAndDraw(view.now + ms, Math.min(ms, MAX_FRAME_MS));
      },
      /** Average and worst draw time over the last frames, ms. */
      drawStats() {
        const sorted = [...drawTimes].sort((a, b) => a - b);
        const mean = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
        return { frames: sorted.length, mean, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, max: sorted[sorted.length - 1] ?? 0 };
      },
      /** The animator, read-only, for checks. */
      anim: () => view.anim,
    },
  };
}
