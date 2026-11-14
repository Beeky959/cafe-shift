// @ts-check
/**
 * Draws the café. Every frame is built from three things only:
 *   1. the simulation state (what is true),
 *   2. clips chosen from that state (src/view/clips.js),
 *   3. the animator's memory (src/view/animator.js): eased positions, walk
 *      cycles, departing guests and one-off effects started by events.
 * The view only reads; it never changes the simulation.
 *
 * Layers, back to front: cached background; stations and Byte; the owner
 * behind the counter; the cached counter; the floor (tables, guests, the
 * owner when out front) sorted by depth; bubbles, effects and hit outlines.
 */
/** @import { SimState, LiveGuest, GuestSpec, OrderItem } from '../sim/types.js' */
/** @import { Service } from '../ui/service.js' */
/** @import { Animator } from './animator.js' */
/** @import { Pose, Face } from './characters.js' */
import { resolveTap } from '../sim/index.js';
import { HIT_AREAS, SCENE_HEIGHT, SCENE_WIDTH } from './scene.js';
import * as art from './art.js';
import { CAST, OWNER, byte, person, sparkle } from './characters.js';
import { STAGE, clothAt, guestClip, machineClip, ownerClip, passClip, seatOf, sinkClip, tableCentre, tableDirt } from './clips.js';
import { PROPS, chair, cloth, cupWithFill, dishInHand, drawBackground, drawForeground, drawLightGlow, drawMachine, drawPass, drawRack, drawSink, drawTableTop, steam } from './props.js';

export { SCENE_HEIGHT, SCENE_WIDTH };

/** Backing-store scale is capped so large phones do not pay for 3x pixels. */
const MAX_PIXEL_RATIO = 2;
const GUEST_SCALE = 0.95;
const QUEUE_SCALE = 0.88;

/**
 * Things only the view knows about.
 * @typedef {object} ViewState
 * @property {string | null} hoverId Hit area under a mouse pointer.
 * @property {Map<string, { kind: 'press' | 'reject', until: number }>} flashes Short highlights, by hit area id.
 * @property {number} now Milliseconds, from the frame clock (real time; for press feedback).
 * @property {Service} service Order selection and carrying (interface state only).
 * @property {{ item: OrderItem, x: number, y: number } | null} drag An item being dragged, in scene units.
 * @property {Animator} anim
 * @property {boolean} reducedMotion
 */

/**
 * @typedef {object} Renderer
 * @property {() => void} resize Match the backing store to the displayed size.
 * @property {(state: SimState, view: ViewState) => void} draw
 * @property {(clientX: number, clientY: number) => { x: number, y: number }} toScene Screen point to logical point.
 * @property {() => { cssWidth: number, cssHeight: number, pixelRatio: number, scale: number }} metrics
 */

const clamp01 = (/** @type {number} */ v) => Math.max(0, Math.min(1, v));
const smooth = (/** @type {number} */ t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/**
 * @param {art.Ctx} cx
 * @param {OrderItem | 'cup'} item
 * @param {number} x
 * @param {number} y
 * @param {number} [size]
 */
function heldItem(cx, item, x, y, size = 26) {
  if (item === 'croissant') {
    art.plate(cx, x, y + 4, size * 1.5, false);
    art.croissant(cx, x, y - 2, size);
  } else {
    cupWithFill(cx, x, y - size * 0.3, size, item === 'cup' ? 0 : 1, item !== 'cup');
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Renderer}
 */
export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available in this browser');
  const cx = context;
  const background = document.createElement('canvas');
  const foreground = document.createElement('canvas');
  let pixelRatio = 1;
  let cssWidth = 0;
  let cssHeight = 0;

  function resize() {
    const box = canvas.getBoundingClientRect();
    cssWidth = box.width;
    cssHeight = box.height;
    pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.max(1, Math.round(cssWidth * pixelRatio));
    const height = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    // Static layers are drawn once per size and reused every frame.
    for (const [layer, paint] of /** @type {const} */ ([
      [background, (/** @type {art.Ctx} */ c) => { drawBackground(c); drawLightGlow(c); }],
      [foreground, drawForeground],
    ])) {
      layer.width = width;
      layer.height = height;
      const c = layer.getContext('2d');
      if (!c) continue;
      const scale = width / SCENE_WIDTH;
      c.setTransform(scale, 0, 0, scale, 0, 0);
      c.clearRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
      paint(c);
    }
  }

  /**
   * @param {SimState} state
   * @param {ViewState} view
   */
  function draw(state, view) {
    const anim = view.anim;
    const motion = view.reducedMotion ? 0 : 1;
    const time = anim.now() / 1000;
    const service = view.service;
    const carrying = service.carrying();
    const hints = service.hints(state);
    const timing = state.timing;
    const scale = (cssWidth / SCENE_WIDTH) * pixelRatio;
    const playing = state.phase !== 'ended';
    /** @param {number} id */
    const specOf = (id) => /** @type {GuestSpec} */ (state.schedule.find((s) => s.id === id));
    /** @param {art.Ctx} c @param {number} x @param {number} y @param {number} r @param {number | string} label */
    const tag = (c, x, y, r, label) => art.tag(c, x, y, r, label);

    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.drawImage(background, 0, 0);
    cx.setTransform(scale, 0, 0, scale, 0, 0);

    // ---- Stations on the back bar.
    const mClip = machineClip(state);
    const brewPulse = anim.progressOf('brewReady');
    drawMachine(
      cx,
      {
        state: mClip.state,
        progress: mClip.progress,
        time: time * motion + (motion ? 0 : 0.3),
        pulse: brewPulse < 0 ? 0 : 1 - brewPulse,
        ticket: service.madeFor('latte'),
        lifted: carrying === 'latte',
        hidden: view.drag?.item === 'latte',
      },
      tag,
    );
    const pClip = passClip(state);
    const platePop = anim.progressOf('plated');
    drawPass(
      cx,
      {
        plated: pClip.plated,
        claimed: pClip.claimed,
        lifted: carrying === 'croissant',
        hidden: view.drag?.item === 'croissant',
        ticket: service.madeFor('croissant'),
        pop: platePop < 0 ? 0 : platePop,
      },
      tag,
    );
    const clean = state.dishes.filter((d) => d.holder.kind === 'rack').length;
    const washedFly = anim.progressOf('dishWashed');
    drawRack(cx, washedFly >= 0 ? Math.max(0, clean - 1) : clean, 0);
    const sClip = sinkClip(state);
    drawSink(cx, { dirty: sClip.dirty, washing: sClip.washing, time: time * motion });
    if (washedFly >= 0) {
      // A washed dish lifts out of the sink and settles into the rack.
      const to = { x: PROPS.rack.x + 14 + Math.max(0, clean - 1) * 24, y: PROPS.rack.y - 10 };
      const t = smooth(washedFly);
      const x = PROPS.sink.basin.x + (to.x - PROPS.sink.basin.x) * t;
      const y = PROPS.sink.basin.y + (to.y - PROPS.sink.basin.y) * t - Math.sin(t * Math.PI) * 30;
      art.oval(cx, x, y, 6 + 10 * (1 - t), 14 - 5 * (1 - t), '#fffaf0');
      sparkle(cx, x + 12, y - 12, 3 * (1 - t) + 1, '#ffffff');
    }

    // ---- Byte, hovering by the window.
    const anxious = state.guests.some((g) => g.place.kind === 'spot' && guestClip(state, g).mood === 'anxious' && g.attendedBy === null);
    const expression = anim.byteExpression(anxious);
    const talk = clamp01((anim.byte.talkUntil - anim.now()) / 400);
    byte(cx, STAGE.byte.x, STAGE.byte.y, 0.74, {
      expression,
      hover: Math.sin(time * 2.1) * 3 * motion,
      blink: anim.byteBlink(),
      talk,
      time: time * motion,
      lookX: anxious ? -0.8 : Math.sin(time * 0.4) * 0.5 * motion,
    });

    // ---- The owner.
    const oClip = ownerClip(state);
    const O = anim.owner;
    const ownerBehind = O.y < STAGE.behindY + 30;
    const ownerPose = () => buildOwnerPose(state, oClip, anim, time, motion);
    if (ownerBehind) person(cx, O.x, O.y, 1, OWNER, ownerPose());

    // ---- The counter, in front of the owner.
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.drawImage(foreground, 0, 0);
    cx.setTransform(scale, 0, 0, scale, 0, 0);

    // ---- The floor, back to front.
    /** @type {{ y: number, draw: () => void }[]} */
    const floor = [];
    for (const area of HIT_AREAS) {
      if (area.target.kind !== 'table') continue;
      const tableId = area.target.tableId;
      const c = tableCentre(tableId);
      floor.push({ y: c.y + 10, draw: () => drawTableGroup(state, view, tableId, time, motion) });
    }
    for (const g of state.guests) {
      if (g.state === 'seated') continue;
      const body = anim.guests.get(g.id);
      if (!body) continue;
      floor.push({ y: body.y, draw: () => drawGuest(state, view, g, body, time, motion) });
    }
    for (const ghost of anim.ghosts()) {
      const at = anim.ghostAt(ghost);
      floor.push({ y: at.y, draw: () => drawGhost(ghost, at, time, motion, anim) });
    }
    if (!ownerBehind) floor.push({ y: O.y, draw: () => person(cx, O.x, O.y, 1, OWNER, ownerPose()) });
    floor.sort((a, b) => a.y - b.y);
    for (const item of floor) item.draw();

    // ---- The owner's progress and speech.
    const action = state.owner.action;
    if (action && action.phase === 'working') {
      const bx = O.x - 44;
      const by = O.y - 190;
      art.bar(cx, bx, by, 88, 14, oClip.progress, action.kind === 'answer' ? '#6fb3ee' : '#ffb03a');
      if (action.kind === 'answer' && oClip.guestId !== null) {
        const spec = specOf(oClip.guestId);
        const sx = O.x + 40;
        const sy = O.y - 232;
        art.rounded(cx, sx, sy, 74, 40, 16, '#dff0ff', '#2f6fb0', 3);
        art.poly(cx, [[sx + 10, sy + 36], [sx + 22, sy + 38], [sx + 2, sy + 52]], '#2f6fb0');
        if (spec.question) art.topicIcon(cx, spec.question.topic, sx + 22, sy + 20, 22);
        for (let i = 0; i < 3; i++) {
          const on = Math.floor(time * 5 * motion) % 3 >= i || !motion;
          art.oval(cx, sx + 44 + i * 9, sy + 22, 3, 3, on ? '#2f6fb0' : '#9fc4e6');
        }
      }
    }

    // ---- Bubbles over guests: orders and questions.
    for (const g of state.guests) {
      const body = anim.guests.get(g.id);
      if (!body) continue;
      if (g.place.kind !== 'spot' && g.place.kind !== 'door') continue;
      if (g.state !== 'waiting' && g.state !== 'asking' && g.state !== 'walkingIn') continue;
      drawBubble(state, view, g, body, time, motion);
    }

    // ---- One-off effects.
    for (const f of anim.fx()) {
      const t = clamp01((anim.now() - f.start) / f.duration);
      if (f.type === 'handoff' && f.x !== undefined && f.y !== undefined && f.x2 !== undefined && f.y2 !== undefined) {
        const k = smooth(t);
        const x = f.x + (f.x2 - f.x) * k;
        const y = f.y + (f.y2 - f.y) * k - Math.sin(k * Math.PI) * 50;
        heldItem(cx, /** @type {OrderItem} */ (f.item), x, y, 30);
      } else if (f.type === 'coins' && f.x !== undefined && f.y !== undefined) {
        cx.globalAlpha = 1 - Math.max(0, t - 0.6) / 0.4;
        const y = f.y - 46 * smooth(t);
        const text = f.text ?? '';
        const w = 30 + text.length * 15;
        art.rounded(cx, f.x - w / 2, y - 24, w, 34, 12, '#29282cee');
        art.oval(cx, f.x - w / 2 + 16, y - 7, 9, 9, '#f2b532');
        art.textAt(cx, text, f.x + 8, y + 2, 22, f.color ?? '#ffe08a', 1000);
        cx.globalAlpha = 1;
      } else if (f.type === 'answered' && f.x !== undefined && f.y !== undefined) {
        cx.globalAlpha = 1 - Math.max(0, t - 0.55) / 0.45;
        const y = f.y - 40 * smooth(t);
        art.oval(cx, f.x, y, 20, 20, '#3f9b3a');
        cx.strokeStyle = '#fff';
        cx.lineWidth = 5;
        cx.lineCap = 'round';
        cx.beginPath();
        cx.moveTo(f.x - 9, y);
        cx.lineTo(f.x - 2, y + 7);
        cx.lineTo(f.x + 10, y - 7);
        cx.stroke();
        cx.lineCap = 'butt';
        art.rounded(cx, f.x + 24, y - 14, 74, 28, 10, '#dff0ff', '#2f6fb0', 2);
        art.textAt(cx, `${(timing.answer / 30).toFixed(1)} s`, f.x + 61, y + 6, 17, '#1f4f85', 1000);
        cx.globalAlpha = 1;
      } else if (f.type === 'cancelled' && f.x !== undefined && f.y !== undefined) {
        cx.globalAlpha = 1 - t;
        art.oval(cx, f.x, f.y - t * 20, 16 + t * 10, 16 + t * 10, '#5a5062');
        art.textAt(cx, '×', f.x, f.y + 8 - t * 20, 26, '#fff', 1000);
        cx.globalAlpha = 1;
      }
    }

    // ---- What can be pressed now, what is queued, and press feedback.
    /** @type {Map<string, string>} */
    const badges = new Map();
    /** @param {{ kind: string, guestId: number | null, tableId: number | null }} a @param {string} label */
    const badgeFor = (a, label) => {
      const area = HIT_AREAS.find((h) => {
        const t = h.target;
        if (a.kind === 'brewStart') return t.kind === 'machine';
        if (a.kind === 'plate') return t.kind === 'case';
        if (a.kind === 'wash') return t.kind === 'sink';
        if (a.kind === 'wipe') return t.kind === 'table' && t.tableId === a.tableId;
        return t.kind === 'spot' && state.spots[t.index] === a.guestId;
      });
      if (area && !badges.has(area.id)) badges.set(area.id, label);
    };
    if (action) badgeFor({ kind: action.kind, guestId: action.claims.guestId, tableId: action.claims.tableId }, '•');
    state.owner.queue.forEach((q, i) => badgeFor(q, String(i + 1)));

    for (const area of HIT_AREAS) {
      const t = area.target;
      /** @type {'none' | 'do' | 'pick' | 'drop'} */
      let cue = 'none';
      if (playing && (t.kind === 'machine' || t.kind === 'case')) {
        if (hints.pickUp.includes(t.kind)) cue = 'pick';
        else if (hints.stations.includes(t.kind)) cue = 'do';
      } else if (playing && t.kind === 'spot') {
        if (hints.spots.includes(t.index)) cue = carrying || view.drag ? 'drop' : 'do';
      } else if (playing && !carrying && resolveTap(state, t).ok) {
        cue = 'do';
      }
      const flash = view.flashes.get(area.id);
      const flashing = flash && flash.until > view.now ? flash.kind : null;
      const hover = view.hoverId === area.id;
      if (flashing === 'reject') {
        // A refused press shakes the outline, briefly.
        const shake = flash ? Math.sin((flash.until - view.now) / 18) * 4 * motion : 0;
        art.rounded(cx, area.x + shake, area.y, area.w, area.h, 18, '#d9534f22', '#d9534f', 6);
      } else if (flashing === 'press') {
        art.rounded(cx, area.x, area.y, area.w, area.h, 18, '#ffffff40', '#ff8d20', 6);
      } else if (cue === 'drop' || cue === 'pick') {
        const breathe = 0.5 + 0.5 * Math.sin(time * 5) * motion;
        art.rounded(cx, area.x + 3, area.y + 3, area.w - 6, area.h - 6, 18, hover ? '#7fd36a40' : `rgba(127, 211, 106, ${(0.1 + breathe * 0.12).toFixed(3)})`, '#3f9b3a', 6);
      } else if (cue === 'do') {
        cx.setLineDash(hover ? [] : [14, 10]);
        cx.lineDashOffset = -time * 20 * motion;
        art.rounded(cx, area.x + 3, area.y + 3, area.w - 6, area.h - 6, 18, hover ? '#ffffff26' : '#ffffff00', '#ff8d20', hover ? 5 : 4);
        cx.setLineDash([]);
        cx.lineDashOffset = 0;
      } else if (hover) {
        art.rounded(cx, area.x + 3, area.y + 3, area.w - 6, area.h - 6, 18, '#ffffff00', '#6d4b4288', 3);
      }
      const badge = badges.get(area.id);
      if (badge) {
        if (badge === '•') {
          // The owner's current job: a small labelled tag, not a bare dot.
          art.rounded(cx, area.x + area.w - 58, area.y + area.h - 30, 54, 24, 12, '#ff8d20', '#fff', 2);
          art.textAt(cx, 'NOW', area.x + area.w - 31, area.y + area.h - 12, 15, '#fff', 1000);
        } else {
          art.oval(cx, area.x + area.w - 18, area.y + area.h - 18, 17, 17, '#30303a');
          art.textAt(cx, badge, area.x + area.w - 18, area.y + area.h - 9, 24, '#fff', 1000);
        }
      }
    }

    // ---- An item being dragged follows the pointer, held up slightly.
    if (view.drag) {
      const d = view.drag;
      art.oval(cx, d.x, d.y + 34, 30, 8, '#00000038');
      if (d.item === 'latte') {
        cupWithFill(cx, d.x - 4, d.y, 52, 1, true);
        steam(cx, d.x - 4, d.y - 24, time * motion, 1);
      } else {
        art.plate(cx, d.x, d.y + 8, 76, false);
        art.croissant(cx, d.x, d.y, 50);
      }
    }
  }

  /**
   * @param {SimState} state
   * @param {import('./clips.js').OwnerClip} clip
   * @param {Animator} anim
   * @param {number} time Seconds.
   * @param {number} motion 0 under reduced motion.
   * @returns {Pose}
   */
  function buildOwnerPose(state, clip, anim, time, motion) {
    const O = anim.owner;
    const s = OWNER.height ?? 1;
    /** World point to the owner's local, unscaled frame. */
    const local = (/** @type {number} */ wx, /** @type {number} */ wy) => ({ x: (wx - O.x) / s, y: (wy - O.y) / s });
    const blink = (time * 1000) % 4100 < 120 ? 'closed' : 'open';
    /** @type {Face} */
    const face = { eyes: blink, mouth: 'smile', lookX: O.facing * 0.6 };
    /** @type {Pose} */
    const pose = {
      stride: O.stride,
      walk: O.walk,
      facing: O.facing,
      bob: Math.sin(time * 2) * 0.8 * motion,
      hideLegs: O.y < STAGE.behindY + 30,
      face,
    };
    const p = clip.progress;
    const item = clip.item;
    switch (clip.kind) {
      case 'walk': {
        if (item === 'cloth') {
          pose.rightHand = { x: -20, y: -78 };
          pose.holdRight = (c, x, y) => cloth(c, x, y);
        } else if (item) {
          const carried = /** @type {OrderItem | 'cup'} */ (item);
          pose.rightHand = { x: 6 + O.facing * 10, y: -90 };
          pose.holdRight = (c, x, y) => heldItem(c, carried, x, y - 4, 26);
          face.mouth = 'smile';
        }
        break;
      }
      case 'brew': {
        const cupAt = PROPS.machine.cup;
        if (p < 0.6) {
          // Carry a clean cup to the spout.
          const k = smooth(p / 0.6);
          const from = { x: O.x - 10, y: O.y - 92 };
          const to = { x: cupAt.x + 6, y: cupAt.y - 2 };
          const hand = local(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
          pose.rightHand = hand;
          pose.holdRight = (c, x, y) => cupWithFill(c, x - 6, y - 8, 40, 0, false);
        } else {
          // The cup sits under the spout; press the brew button.
          cupWithFill(cx, cupAt.x, cupAt.y, 40, 0, false);
          const press = Math.sin(((p - 0.6) / 0.4) * Math.PI);
          pose.rightHand = local(PROPS.machine.x + PROPS.machine.w - 10 + press * 4, PROPS.machine.y + 40);
          pose.leftHand = { x: 22, y: -80 };
        }
        face.lookX = -1;
        face.lookY = -0.4;
        break;
      }
      case 'plate': {
        const into = { x: PROPS.caseBox.x + 110, y: PROPS.caseBox.y + 44 };
        const pass = { x: PROPS.pass.x + 4, y: PROPS.pass.y - 6 };
        const k = p < 0.45 ? smooth(p / 0.45) : smooth((p - 0.45) / 0.55);
        const from = p < 0.45 ? { x: O.x - 14, y: O.y - 92 } : into;
        const to = p < 0.45 ? into : pass;
        pose.rightHand = local(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
        if (p >= 0.45) pose.holdRight = (c, x, y) => heldItem(c, 'croissant', x, y, 24);
        face.lookX = -1;
        break;
      }
      case 'serve': {
        // Lean over the counter and hold the item out to the guest.
        const k = smooth(p);
        pose.rightHand = { x: 4, y: -96 + k * 16 };
        pose.leftHand = { x: 14, y: -90 + k * 10 };
        pose.lean = 0;
        if (item === 'latte' || item === 'croissant') pose.holdRight = (c, x, y) => heldItem(c, item, x, y - 6, 28);
        face.mouth = 'grin';
        face.lookY = 0.6;
        break;
      }
      case 'answer': {
        // Talking it through: an open hand, and a moving mouth.
        const wave = Math.sin(time * 7) * motion;
        pose.rightHand = { x: -26 + wave * 5, y: -124 + wave * 3 };
        face.mouth = Math.floor(time * 8 * motion) % 2 === 0 ? 'talk' : 'neutral';
        face.lookY = 0.5;
        break;
      }
      case 'wash': {
        const basin = PROPS.sink.basin;
        const a = p * Math.PI * 2 * 4;
        const hx = basin.x - 26 + Math.sin(a) * 9 * (motion || 0.4);
        const hy = basin.y + 2 + Math.cos(a) * 3;
        pose.leftHand = local(hx + 10, hy);
        pose.rightHand = local(hx - 8, hy + 2);
        pose.holdLeft = (c, x, y) => dishInHand(c, x - 6, y, p);
        face.lookX = 1;
        face.lookY = 0.6;
        break;
      }
      case 'wipe': {
        const at = clothAt(clip.tableId ?? 1, p);
        pose.rightHand = local(at.x, at.y);
        pose.holdRight = (c, x, y) => cloth(c, x, y);
        pose.leftHand = { x: 16, y: -86 };
        face.lookX = -1;
        face.lookY = 0.7;
        break;
      }
      default: {
        // Idle: glance towards whoever is waiting longest.
        const waiting = state.guests.filter((g) => g.place.kind === 'spot' && g.state === 'waiting');
        if (waiting.length > 0) {
          const g = waiting.reduce((a, b) => (a.patienceLeft < b.patienceLeft ? a : b));
          const body = anim.guests.get(g.id);
          if (body) face.lookX = Math.max(-1, Math.min(1, (body.x - O.x) / 200));
          face.lookY = 0.6;
        }
      }
    }
    return pose;
  }

  /**
   * @param {SimState} state
   * @param {ViewState} view
   * @param {number} tableId
   * @param {number} time
   * @param {number} motion
   */
  function drawTableGroup(state, view, tableId, time, motion) {
    const anim = view.anim;
    const c = tableCentre(tableId);
    const seat = seatOf(tableId);
    chair(cx, c.x + 58, c.y - 2, 'back');
    chair(cx, seat.x, seat.y - 16, 'back');
    chair(cx, seat.x, seat.y - 16, 'seat');
    const seated = state.guests.find((g) => g.state === 'seated' && g.place.kind === 'table' && g.place.tableId === tableId);
    const body = seated ? anim.guests.get(seated.id) : undefined;
    if (seated && body) {
      const spec = state.schedule.find((s) => s.id === seated.id);
      const phase = seated.id * 1.7;
      const sip = spec?.order === 'latte' && Math.sin(time * 0.9 + phase) > 0.9 && motion > 0;
      person(cx, body.x, body.y - 16, GUEST_SCALE, CAST[body.look % CAST.length], {
        seated: true,
        facing: 1,
        bob: Math.sin(time * 1.6 + phase) * 0.6 * motion,
        face: { eyes: (time * 1000 + phase * 900) % 3900 < 120 ? 'closed' : sip ? 'happy' : 'open', mouth: 'smile', blush: anim.joy(seated.id) > 0, lookX: 0.6 },
        rightHand: sip ? { x: -6, y: -128 } : { x: 30, y: -76 },
        leftHand: { x: 40, y: -80 },
        holdRight: sip ? (cc, x, y) => cupWithFill(cc, x, y - 4, 22, 0.8, false) : null,
      });
    }
    const wiped = anim.progressOf('tableWiped', (f) => f.tableId === tableId);
    drawTableTop(cx, { x: c.x, y: c.y - 4, dirt: tableDirt(state, tableId), shine: wiped < 0 ? 0 : wiped });
    if (seated && seated.dishId !== null) {
      const spec = state.schedule.find((s) => s.id === seated.id);
      const sipping = spec?.order === 'latte' && Math.sin(time * 0.9 + seated.id * 1.7) > 0.9 && motion > 0;
      if (spec?.order === 'croissant') {
        art.plate(cx, c.x - 14, c.y - 6, 48, false);
        art.croissant(cx, c.x - 14, c.y - 12, 28);
      } else if (!sipping) {
        cupWithFill(cx, c.x - 14, c.y - 10, 26, 0.8, true);
      }
    }
  }

  /**
   * @param {SimState} state
   * @param {ViewState} view
   * @param {LiveGuest} g
   * @param {import('./animator.js').GuestBody} body
   * @param {number} time
   * @param {number} motion
   */
  function drawGuest(state, view, g, body, time, motion) {
    const anim = view.anim;
    const clip = guestClip(state, g);
    const look = CAST[body.look % CAST.length];
    const phase = g.id * 1.7;
    const joy = anim.joy(g.id);
    const blink = (time * 1000 + phase * 1000) % 3700 < 120;
    const scale = g.place.kind === 'door' ? QUEUE_SCALE : GUEST_SCALE;
    /** @type {Face} */
    const face = { eyes: blink ? 'closed' : 'open', mouth: 'smile', lookX: 0, lookY: 0 };
    /** @type {Pose} */
    const pose = { stride: body.stride, walk: body.walk, facing: body.facing, face, bob: 0 };
    const idle = motion * (body.walk < 0.2 ? 1 : 0);
    pose.bob = Math.sin(time * 2.2 + phase) * 0.8 * idle;
    const item = /** @type {OrderItem} */ (body.order);

    if (clip.mood === 'impatient') {
      pose.crossedArms = true;
      pose.footTap = Math.max(0, Math.sin(time * 9 + phase)) * idle;
      face.brows = 'cross';
      face.mouth = 'neutral';
    } else if (clip.mood === 'anxious') {
      face.eyes = blink ? 'closed' : 'worried';
      face.mouth = 'frown';
      face.sweat = true;
      pose.lean = Math.sin(time * 16 + phase) * 0.025 * idle;
      pose.rightHand = { x: -26, y: -70 };
    } else if (clip.kind === 'wait' || clip.kind === 'door') {
      // Glance up at the menu board now and then.
      if (Math.sin(time * 0.45 + phase) > 0.75) {
        face.lookY = -1;
        face.lookX = -0.6;
      } else {
        face.lookY = 0.2;
      }
    }

    if (clip.kind === 'ask') {
      // Holding up a phone with a question on it.
      const buzz = (time * 1.1 + phase) % 2.2 < 0.25 ? Math.sin(time * 70) * 1.5 * motion : 0;
      pose.crossedArms = false;
      pose.rightHand = { x: -24 + buzz, y: -126 };
      // Only a question about the café online comes with a phone in hand.
      const asked = state.schedule.find((s) => s.id === g.id)?.question;
      if (asked?.supported) pose.holdRight = (c, x, y) => art.phone(c, x, y - 8, 26);
      else pose.rightHand = { x: -18, y: -118 };
      face.lookX = 0.4;
      face.lookY = -0.4;
    }
    if (clip.attended && clip.kind === 'wait') {
      // Being served: hands ready to take it.
      pose.crossedArms = false;
      pose.footTap = 0;
      pose.rightHand = { x: -10, y: -88 };
      pose.leftHand = { x: 10, y: -88 };
      face.mouth = 'o';
      face.eyes = 'open';
      face.lookY = -0.6;
      face.sweat = false;
    }
    if (joy > 0 || ((clip.kind === 'toTable' || clip.kind === 'standing' || clip.kind === 'ask') && body.item)) {
      if (clip.kind !== 'ask') {
        pose.crossedArms = false;
        pose.rightHand = { x: -6, y: -86 };
        pose.leftHand = { x: 12, y: -84 };
        pose.holdRight = (c, x, y) => heldItem(c, item, x + 4, y - 4, 22);
      }
    }
    if (joy > 0) {
      face.eyes = 'happy';
      face.mouth = 'grin';
      face.blush = true;
      face.sweat = false;
      pose.bob = -Math.abs(Math.sin((1 - joy) * Math.PI * 2)) * 7 * motion;
    } else if (clip.kind === 'standing') {
      face.mouth = 'neutral';
      face.eyes = blink ? 'closed' : 'down';
    }
    person(cx, body.x, body.y, scale, look, pose);
  }

  /**
   * @param {import('./animator.js').Ghost} ghost
   * @param {{ x: number, y: number }} at
   * @param {number} time
   * @param {number} motion
   * @param {Animator} anim
   */
  function drawGhost(ghost, at, time, motion, anim) {
    const look = CAST[ghost.look % CAST.length];
    const t = Math.min(1, (anim.now() - ghost.start) / ghost.duration);
    const fade = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
    const unhappy = ghost.mood !== 'happy';
    const facing = ghost.path[ghost.path.length - 1].x < ghost.path[0].x ? -1 : 1;
    cx.globalAlpha = fade;
    person(cx, at.x, at.y, GUEST_SCALE, look, {
      stride: ghost.stride + t * ghost.duration * 0.02,
      walk: 1,
      facing,
      face: unhappy ? { eyes: 'down', mouth: 'frown', brows: 'worried' } : { eyes: 'happy', mouth: 'smile', blush: true },
      lean: unhappy ? -0.06 : 0,
      rightHand: unhappy ? null : { x: -30, y: -138 + Math.sin(time * 12) * 4 * motion },
    });
    if (unhappy) {
      // A small storm cloud follows a guest who gave up.
      const y = at.y - 190;
      for (const [dx, r] of [[-16, 12], [0, 16], [16, 12]]) art.oval(cx, at.x + dx, y, r, r * 0.8, '#6c6f7a');
      cx.strokeStyle = '#9fc4e6';
      cx.lineWidth = 2;
      for (const dx of [-10, 2, 14]) {
        const k = (time * 3 + dx) % 1;
        cx.beginPath();
        cx.moveTo(at.x + dx, y + 12 + k * 10);
        cx.lineTo(at.x + dx - 3, y + 18 + k * 10);
        cx.stroke();
      }
    }
    cx.globalAlpha = 1;
  }

  /**
   * The order ticket or question bubble over a guest.
   * @param {SimState} state
   * @param {ViewState} view
   * @param {LiveGuest} g
   * @param {import('./animator.js').GuestBody} body
   * @param {number} time
   * @param {number} motion
   */
  function drawBubble(state, view, g, body, time, motion) {
    const anim = view.anim;
    const spec = state.schedule.find((s) => s.id === g.id);
    if (!spec) return;
    const clip = guestClip(state, g);
    const service = view.service;
    const big = g.place.kind === 'spot';
    const asking = g.state === 'asking';
    const timing = state.timing;
    const fraction = g.patienceLeft / (asking ? timing.askingPatience : timing.counterPatience);
    const scale = big ? GUEST_SCALE : QUEUE_SCALE;
    const headTop = body.y - 168 * scale;
    const bw = big ? (asking ? 108 : 86) : 58;
    const bh = big ? 56 : 40;
    // Pop in when a question is asked; shake when patience is nearly gone.
    const pop = asking ? anim.progressOf('askPop', (f) => f.guestId === g.id) : -1;
    const grow = pop < 0 ? 1 : 0.6 + 0.4 * smooth(pop) + Math.sin(pop * Math.PI) * 0.12;
    const shake = clip.mood === 'anxious' && g.attendedBy === null ? Math.sin(time * 40) * 2 * motion : 0;
    const bx = body.x - bw / 2 + shake;
    const by = headTop - bh - 18;
    cx.save();
    cx.translate(body.x, by + bh);
    cx.scale(grow, grow);
    cx.translate(-body.x, -(by + bh));
    const attended = g.attendedBy !== null;
    const selected = service.selected() === g.id;
    if (asking && spec.question) {
      art.rounded(cx, bx, by, bw, bh, 22, '#dff0ff', attended ? '#ff8d20' : '#2f6fb0', attended ? 6 : 4);
      art.poly(cx, [[body.x - 8, by + bh - 2], [body.x + 8, by + bh - 2], [body.x + 2, by + bh + 12]], '#dff0ff');
      // A digital-presence question shows a phone; the washroom does not.
      if (spec.question.supported) art.phone(cx, bx + bw * 0.2, by + bh * 0.5, bh * 0.72);
      art.textAt(cx, '?', bx + bw * (spec.question.supported ? 0.47 : 0.3), by + bh * 0.74, bh * 0.72, '#2f6fb0', 1000);
      art.topicIcon(cx, spec.question.topic, bx + bw * 0.77, by + bh * 0.5, bh * 0.56);
      // The counter spot they are holding.
      cx.setLineDash([10, 8]);
      cx.strokeStyle = '#2f6fb0';
      cx.lineWidth = 4;
      cx.beginPath();
      cx.ellipse(body.x, body.y + 2, 40, 12, 0, 0, Math.PI * 2);
      cx.stroke();
      cx.setLineDash([]);
    } else {
      art.rounded(cx, bx, by, bw, bh, 8, '#fff9e9', attended || selected ? '#ff8d20' : '#6d4b42', attended || selected ? 6 : 3);
      art.poly(cx, [[body.x - 8, by + bh - 2], [body.x + 8, by + bh - 2], [body.x, by + bh + 10]], '#fff9e9');
      if (spec.order === 'latte') cupWithFill(cx, bx + bw / 2 + (big ? 8 : 0), by + bh / 2 + 4, bh * 0.56, 1, true);
      else art.croissant(cx, bx + bw / 2 + (big ? 8 : 0), by + bh / 2 + 2, bh * 0.56);
    }
    art.tag(cx, bx + (big ? 4 : 2), by + 4, big ? 17 : 13, g.id, asking ? '#2f6fb0' : '#30303a');
    const color = fraction < 0.25 ? '#df6254' : fraction < 0.5 ? '#e7b84a' : asking ? '#6fb3ee' : '#7fbf5a';
    art.bar(cx, bx, by + bh + (asking ? 14 : 12), bw, big ? 12 : 9, fraction, color);
    cx.restore();
    if (selected) {
      // The picked order: a ring on the floor under the guest.
      cx.strokeStyle = '#ff8d20';
      cx.lineWidth = 5;
      cx.beginPath();
      cx.ellipse(body.x, body.y + 2, 36, 11, 0, 0, Math.PI * 2);
      cx.stroke();
    }
  }

  return {
    resize,
    draw,
    toScene: (clientX, clientY) => {
      const box = canvas.getBoundingClientRect();
      return {
        x: ((clientX - box.left) / box.width) * SCENE_WIDTH,
        y: ((clientY - box.top) / box.height) * SCENE_HEIGHT,
      };
    },
    metrics: () => ({ cssWidth, cssHeight, pixelRatio, scale: cssWidth / SCENE_WIDTH }),
  };
}
