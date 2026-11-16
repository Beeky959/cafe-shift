// @ts-check
/**
 * The view's memory. The simulation decides what is true; this module only
 * remembers what the screen needs to make it look continuous:
 *
 * - a visual clock that stops when the game is paused,
 * - where each person is drawn, eased towards where the simulation puts them,
 *   and how far their legs have walked,
 * - guests who have left, walking out of the door,
 * - short one-off effects, each started by a simulation event.
 *
 * It never changes the simulation state. No DOM, so it is tested in Node.
 */
/** @import { SimState, SimEvent, OrderItem } from '../sim/types.js' */
import { STAGE, along, guestHome, ownerClip, seatOf, spotX, tableCentre, walkPath } from './clips.js';
import { PROPS } from './props.js';

/** Easing time constant for positions, in milliseconds. */
const EASE_MS = 45;
/** Walk-cycle radians per scene unit travelled. */
const STRIDE_PER_UNIT = 0.085;
/** How fast departing guests walk, in scene units per second. */
const EXIT_SPEED = 300;

/**
 * @typedef {object} Body
 * @property {number} x
 * @property {number} y
 * @property {number} stride Walk-cycle phase.
 * @property {number} walk 0-1, how much the legs are swinging.
 * @property {number} facing -1 left, 0 front, 1 right.
 */

/**
 * @typedef {Body & { look: number, order: OrderItem, from: { x: number, y: number } | null, seen: string, joyUntil: number, item: boolean }} GuestBody
 */

/**
 * @typedef {object} Ghost
 * @property {number} id
 * @property {number} look
 * @property {'happy' | 'unhappy' | 'passing'} mood
 * @property {{ x: number, y: number }[]} path
 * @property {number} start
 * @property {number} duration
 * @property {number} stride
 */

/**
 * @typedef {object} Fx
 * @property {string} type
 * @property {number} start Visual clock, ms.
 * @property {number} duration
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [x2]
 * @property {number} [y2]
 * @property {string} [text]
 * @property {string} [color]
 * @property {number} [guestId]
 * @property {number} [tableId]
 * @property {string} [item]
 */

/** @typedef {'neutral' | 'happy' | 'thinking' | 'worried' | 'alert' | 'celebrate' | 'sad'} ByteExpression */

export function createAnimator() {
  let clock = 0;
  /** @type {Body} */
  const owner = { x: STAGE.owner.register.x, y: STAGE.behindY, stride: 0, walk: 0, facing: 0 };
  /** The action whose walk is being shown, and where that walk began. */
  let travel = /** @type {{ actionId: number, from: { x: number, y: number } } | null} */ (null);
  /** @type {Map<number, GuestBody>} */
  const guests = new Map();
  /** @type {Ghost[]} */
  let ghosts = [];
  /** @type {Fx[]} */
  let fx = [];
  const byte = {
    /** @type {ByteExpression} */
    expression: 'neutral',
    since: 0,
    talkUntil: 0,
  };

  /**
   * Moves a body towards a point and advances its walk cycle by the distance covered.
   * @param {Body} body
   * @param {{ x: number, y: number }} target
   * @param {number} dt ms
   * @param {number | null} facing Fixed facing, or null to face the way of travel.
   */
  function ease(body, target, dt, facing) {
    const k = dt <= 0 ? 0 : 1 - Math.exp(-dt / EASE_MS);
    const nx = body.x + (target.x - body.x) * k;
    const ny = body.y + (target.y - body.y) * k;
    const moved = Math.hypot(nx - body.x, ny - body.y);
    body.stride += moved * STRIDE_PER_UNIT;
    const speed = dt > 0 ? (moved / dt) * 1000 : 0;
    const walking = Math.min(1, speed / 90);
    body.walk += (walking - body.walk) * (dt <= 0 ? 0 : 1 - Math.exp(-dt / 90));
    if (facing !== null) body.facing = facing;
    else if (Math.abs(nx - body.x) > 0.05) body.facing = nx > body.x ? 1 : -1;
    body.x = nx;
    body.y = ny;
  }

  /**
   * @param {string} type
   * @param {number} duration
   * @param {Omit<Fx, 'type' | 'start' | 'duration'>} [data]
   */
  function add(type, duration, data = {}) {
    fx.push({ type, start: clock, duration, ...data });
  }

  /**
   * @param {GuestBody} body
   * @param {number} id
   * @param {Ghost['mood']} mood
   */
  function depart(body, id, mood) {
    const path = [{ x: body.x, y: body.y }];
    if (body.y < 600 && body.y > 500) path.push({ x: Math.min(body.x, 220), y: STAGE.door.y });
    else path.push({ x: body.x - 40, y: STAGE.door.y + 30 }, { x: 120, y: STAGE.door.y + 10 });
    path.push({ ...STAGE.door });
    let length = 0;
    for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    const speed = mood === 'unhappy' ? EXIT_SPEED * 1.25 : EXIT_SPEED;
    ghosts.push({ id, look: body.look, mood, path, start: clock, duration: Math.max(500, Math.min(2400, (length / speed) * 1000)), stride: body.stride });
  }

  return {
    /** Visual clock, ms. Stops while paused. */
    now: () => clock,
    owner,
    guests,
    ghosts: () => ghosts,
    fx: () => fx,
    byte,

    /**
     * Advances the visual clock.
     * @param {number} dt ms; zero while paused.
     */
    advance(dt) {
      clock += Math.max(0, dt);
      fx = fx.filter((f) => clock - f.start < f.duration);
      ghosts = ghosts.filter((g) => clock - g.start < g.duration);
    },

    /**
     * Follows the simulation: moves the owner and each guest towards where
     * the simulation puts them.
     * @param {SimState} state
     * @param {number} dt ms since the last frame, zero while paused.
     */
    sync(state, dt) {
      const clip = ownerClip(state);
      const action = state.owner.action;
      if (action && clip.target) {
        if (action.phase === 'travelling') {
          if (!travel || travel.actionId !== action.id) travel = { actionId: action.id, from: { x: owner.x, y: owner.y } };
          const point = along(walkPath(travel.from, clip.target), clip.progress);
          ease(owner, point, dt, null);
        } else {
          travel = null;
          // Small moves within the same zone are eased, never jumped.
          ease(owner, clip.target, dt, clip.kind === 'wipe' ? -1 : clip.target.facing);
        }
      } else {
        travel = null;
        ease(owner, owner, dt, owner.facing === 0 ? 0 : owner.facing);
      }

      const present = new Set();
      for (const g of state.guests) {
        present.add(g.id);
        const spec = state.schedule.find((s) => s.id === g.id);
        let body = guests.get(g.id);
        const home = guestHome(state, g);
        if (!body) {
          const start = g.place.kind === 'door' || g.state === 'walkingIn' ? { ...STAGE.door } : home;
          body = { ...start, stride: 0, walk: 0, facing: 1, look: spec?.look ?? 0, order: spec?.order ?? 'latte', from: null, seen: g.state, joyUntil: 0, item: false };
          guests.set(g.id, body);
        }
        if (g.state === 'walkingToTable') {
          if (body.seen !== 'walkingToTable') body.from = { x: body.x, y: body.y };
          const k = 1 - g.timerLeft / state.timing.walkToTable;
          const from = body.from ?? home;
          ease(body, { x: from.x + (home.x - from.x) * k, y: from.y + (home.y - from.y) * k }, dt, null);
        } else {
          body.from = null;
          ease(body, home, dt, g.state === 'seated' ? 1 : null);
          if (body.walk < 0.05 && g.state !== 'walkingIn') body.facing = g.state === 'seated' ? 1 : 0;
        }
        body.seen = g.state;
        body.item = g.dishId !== null;
      }
      for (const id of [...guests.keys()]) if (!present.has(id)) guests.delete(id);
    },

    /**
     * Starts the effects that belong to this tick's events. Called once per
     * simulation tick, after the step, before `sync`.
     * @param {readonly SimEvent[]} events
     * @param {SimState} state After the tick.
     */
    onEvents(events, state) {
      for (const e of events) {
        const id = Number(e.guestId);
        const body = guests.get(id);
        switch (e.type) {
          case 'brewReady':
            add('brewReady', 700);
            break;
          case 'croissantPlated':
            add('plated', 400);
            break;
          case 'itemHandedOver': {
            const guest = state.guests.find((g) => g.id === id);
            const x = guest && guest.place.kind === 'spot' ? spotX(guest.place.index) : body?.x ?? 480;
            // The item crosses the counter from the owner's hand to the guest.
            add('handoff', 380, { x: owner.x + 6, y: STAGE.behindY - 86, x2: x + 4, y2: STAGE.spotY - 90, item: String(e.item), guestId: id });
            // Coins rise beside the guest's bubble, so a question that follows stays readable.
            add('coins', 1100, { x: x + 74, y: STAGE.spotY - 196, text: `+${e.coins}`, color: '#ffe08a' });
            if (body) body.joyUntil = clock + 1300;
            break;
          }
          case 'guestAsked':
            add('askPop', 350, { guestId: id });
            break;
          case 'questionAnswered': {
            const guest = state.guests.find((g) => g.id === id);
            const x = body?.x ?? (guest && guest.place.kind === 'spot' ? spotX(guest.place.index) : 480);
            add('answered', 900, { x, y: STAGE.spotY - 190, guestId: id });
            if (body) body.joyUntil = clock + 800;
            break;
          }
          case 'guestLeftHappy': {
            if (body) depart(body, id, 'happy');
            const tip = Number(e.tip);
            if (tip > 0 && body) add('coins', 1100, { x: body.x + 60, y: body.y - 110, text: `+${tip} tip`, color: '#bee86f' });
            guests.delete(id);
            break;
          }
          case 'guestLeftUnhappy':
            if (body) depart(body, id, 'unhappy');
            guests.delete(id);
            break;
          case 'guestWalkedPast':
            ghosts.push({ id, look: Number(state.schedule.find((s) => s.id === id)?.look ?? 0), mood: 'passing', path: [{ x: 30, y: STAGE.door.y }, { ...STAGE.door }], start: clock, duration: 700, stride: 0 });
            break;
          case 'dishWashed':
            add('dishWashed', 360);
            break;
          case 'tableWiped':
            add('tableWiped', 650, { tableId: Number(e.tableId), ...tableCentre(Number(e.tableId)) });
            break;
          case 'drinkDiscarded':
            add('discarded', 600, { x: PROPS.machine.cup.x, y: PROPS.machine.cup.y });
            break;
          case 'guestToStand':
            // Guest heading to the TapIt stand — small pop effect
            add('standPop', 350, { guestId: id });
            break;
          case 'guestUsingStand':
            // Guest started using the stand
            add('standUse', 500, { x: PROPS.stand.x + PROPS.stand.w / 2, y: PROPS.stand.y - 10 });
            break;
          case 'standAnswered': {
            // Guest got their answer from the stand
            const gx = body?.x ?? PROPS.stand.x + PROPS.stand.w / 2;
            const gy = body?.y ?? PROPS.stand.y + PROPS.stand.h;
            add('answered', 900, { x: gx, y: gy - 130, guestId: id });
            if (body) body.joyUntil = clock + 800;
            break;
          }
          case 'actionCancelled':
            if (e.reason === 'player') add('cancelled', 320, { x: owner.x, y: owner.y - 170 });
            break;
          default:
            break;
        }
      }
    },

    /**
     * Byte reacts to one of its own lines.
     * @param {ByteExpression} expression
     */
    react(expression) {
      byte.expression = expression;
      byte.since = clock;
      byte.talkUntil = clock + 1200;
    },

    /**
     * Byte's face right now. Strong expressions fade back after a few
     * seconds; while a guest at the counter is close to leaving, Byte stays
     * worried.
     * @param {boolean} someoneAnxious
     * @returns {ByteExpression}
     */
    byteExpression(someoneAnxious) {
      const age = clock - byte.since;
      const hold = byte.expression === 'celebrate' ? 2600 : byte.expression === 'alert' ? 3200 : 3800;
      if (age < hold) return byte.expression;
      return someoneAnxious ? 'worried' : 'neutral';
    },

    /** 0 open, 1 closed. Byte blinks about every 3.6 s; the pattern is fixed, not random. */
    byteBlink() {
      const t = clock % 3600;
      const t2 = (clock + 1700) % 7300;
      const b = (/** @type {number} */ x) => (x < 130 ? Math.sin((x / 130) * Math.PI) : 0);
      return Math.max(b(t), b(t2));
    },

    /** @param {number} guestId */
    joy(guestId) {
      const body = guests.get(guestId);
      return body ? Math.max(0, body.joyUntil - clock) / 1300 : 0;
    },

    /**
     * Progress 0-1 of the most recent effect of a type, or -1 if none is running.
     * @param {string} type
     * @param {(f: Fx) => boolean} [match]
     */
    progressOf(type, match = () => true) {
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        if (f.type === type && match(f)) return Math.min(1, (clock - f.start) / f.duration);
      }
      return -1;
    },

    /** Where a ghost is now. @param {Ghost} g */
    ghostAt(g) {
      const t = Math.min(1, (clock - g.start) / g.duration);
      return along(g.path, t);
    },

    /** The seat position for a table, for drawing. */
    seatOf,
  };
}

/** @typedef {ReturnType<typeof createAnimator>} Animator */
