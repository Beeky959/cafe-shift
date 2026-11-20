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
import { resolveTap, isDrink } from '../sim/index.js';
import { HIT_AREAS, SCENE_HEIGHT, SCENE_WIDTH } from './scene.js';
import * as art from './art.js';
import { CAST, OWNER, byte, person, sparkle } from './characters.js';

/** The NPC barista helper who works the espresso machine. */
const BARISTA = /** @type {import('./characters.js').Look} */ ({
  skin: '#d4a070', hair: '#1a1410', hairStyle: 'bun',
  top: '#3a5a50', topShade: '#2c4640', pants: '#2c2c38',
  shoes: '#2b2626', apron: '#c06020', height: 0.98,
});
/** The NPC baker who helps at the oven. */
const BAKER = /** @type {import('./characters.js').Look} */ ({
  skin: '#c08860', hair: '#3c2010', hairStyle: 'short',
  top: '#e8e0d0', topShade: '#c8c0a8', pants: '#4a4030',
  shoes: '#302820', apron: '#d8d0c0', height: 1.02,
});
/** The NPC dishwasher who helps at the sink. */
const DISHWASHER = /** @type {import('./characters.js').Look} */ ({
  skin: '#8c6040', hair: '#181818', hairStyle: 'short',
  top: '#304858', topShade: '#243848', pants: '#283040',
  shoes: '#202828', apron: '#c8d8e0', height: 1.05,
});
/** The NPC server who helps at the handoff counter. */
const SERVER = /** @type {import('./characters.js').Look} */ ({
  skin: '#e8c090', hair: '#5c3820', hairStyle: 'bun',
  top: '#1c2840', topShade: '#141e30', pants: '#1c1c28',
  shoes: '#181818', apron: null, height: 0.96,
});
import { STAGE, clothAt, guestClip, machineClip, ovenClip, ownerClip, passClip, seatOf, sinkClip, standClip, tableCentre, tableDirt } from './clips.js';
import { PROPS, chair, cloth, cupWithFill, dishInHand, drawBackground, drawForeground, drawLightGlow, drawMachine, drawOven, drawPass, drawRack, drawSink, drawStand, drawTableTop, steam } from './props.js';
import { phases, smooth as smoothU, easeOut, easeOutBack, anticipateSettle, bounce, arc, secondaryBob, secondarySwing, hipShift, shoulderCounter } from './anim-utils.js';

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
 * @property {Set<string>} [staff] Unlocked NPC staff members.
 */

/**
 * @typedef {object} Renderer
 * @property {() => void} resize Match the backing store to the displayed size.
 * @property {(state: SimState, view: ViewState) => void} draw
 * @property {(clientX: number, clientY: number) => { x: number, y: number }} toScene Screen point to logical point.
 * @property {() => { cssWidth: number, cssHeight: number, pixelRatio: number, scale: number }} metrics
 */

// Local clamp01 for rendering code; `clamp` is the anim-utils import for pose building.
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
    const drink = isDrink(item) ? item : null;
    cupWithFill(cx, x, y - size * 0.3, size, item === 'cup' ? 0 : 1, item !== 'cup', drink);
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
    const machineDrink = mClip.drink;
    drawMachine(
      cx,
      {
        state: mClip.state,
        progress: mClip.progress,
        time: time * motion + (motion ? 0 : 0.3),
        pulse: brewPulse < 0 ? 0 : 1 - brewPulse,
        ticket: machineDrink ? service.madeFor(machineDrink) : null,
        lifted: !!machineDrink && carrying === machineDrink,
        hidden: !!machineDrink && view.drag?.item === machineDrink,
        drink: machineDrink,
      },
      tag,
    );
    // ---- Oven on the back bar.
    const ovClip = ovenClip(state);
    drawOven(cx, { state: ovClip.state, progress: ovClip.progress, stock: ovClip.stock, maxStock: ovClip.maxStock, time: time * motion });

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
    // Byte's subtle ground shadow
    cx.save();
    cx.globalAlpha = 0.18;
    cx.fillStyle = '#3b2a20';
    cx.beginPath();
    cx.ellipse(STAGE.byte.x, STAGE.byte.y + 68, 28, 8, 0, 0, Math.PI * 2);
    cx.fill();
    cx.restore();
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

    // ---- NPC staff: each visible only when that role has been unlocked.
    const staff = view.staff;
    if (staff?.has('barista')) {
      // Busy = NPC slot active OR a brew is running (NPC started it)
      const busy = state.npcs?.barista?.busy || state.machine.slots.some((s) => s.state === 'brewing');
      const NPC_X = PROPS.machine.x + PROPS.machine.w + 18;
      const NPC_Y = PROPS.machine.y + PROPS.machine.h + 10;
      cx.save(); cx.globalAlpha = 0.12; cx.fillStyle = '#3b2a20';
      cx.beginPath(); cx.ellipse(NPC_X, NPC_Y + 4, 22, 7, 0, 0, Math.PI * 2); cx.fill(); cx.restore();
      const breathe = Math.sin(time * 1.3) * 0.5 * motion;
      person(cx, NPC_X, NPC_Y, 0.82, BARISTA, {
        hideLegs: true, facing: -1, breathe,
        lean: busy ? -0.08 * motion : 0,
        leftHand: busy ? { x: NPC_X - 42, y: NPC_Y - 108 } : null,
        rightHand: busy ? { x: NPC_X - 28, y: NPC_Y - 90 } : null,
        face: { eyes: busy ? 'closed' : 'open', mouth: busy ? 'neutral' : 'smile', lookX: -0.6 },
      });
    }
    if (staff?.has('baker')) {
      const busy = state.npcs?.baker?.busy || state.oven.state === 'baking';
      const NPC_X = PROPS.oven.x - 20;
      const NPC_Y = PROPS.oven.y + PROPS.oven.h + 8;
      cx.save(); cx.globalAlpha = 0.12; cx.fillStyle = '#3b2a20';
      cx.beginPath(); cx.ellipse(NPC_X, NPC_Y + 4, 22, 7, 0, 0, Math.PI * 2); cx.fill(); cx.restore();
      const breathe = Math.sin(time * 0.9 + 1) * 0.5 * motion;
      person(cx, NPC_X, NPC_Y, 0.82, BAKER, {
        hideLegs: true, facing: 1, breathe,
        lean: busy ? 0.06 * motion : 0,
        leftHand: busy ? { x: NPC_X + 32, y: NPC_Y - 100 } : null,
        face: { eyes: 'open', mouth: busy ? 'neutral' : 'smile', lookX: 0.5 },
      });
    }
    if (staff?.has('dishwasher')) {
      const busy = state.npcs?.dishwasher?.busy;
      const NPC_X = PROPS.sink.basin.x - 36;
      const NPC_Y = PROPS.sink.y + PROPS.sink.h + 6;
      cx.save(); cx.globalAlpha = 0.12; cx.fillStyle = '#3b2a20';
      cx.beginPath(); cx.ellipse(NPC_X, NPC_Y + 4, 22, 7, 0, 0, Math.PI * 2); cx.fill(); cx.restore();
      const breathe = Math.sin(time * 1.1 + 2) * 0.5 * motion;
      person(cx, NPC_X, NPC_Y, 0.82, DISHWASHER, {
        hideLegs: true, facing: 1, breathe,
        lean: busy ? -0.05 * motion : 0,
        leftHand: busy ? { x: NPC_X + 20, y: NPC_Y - 95 } : null,
        rightHand: busy ? { x: NPC_X + 36, y: NPC_Y - 85 } : null,
        face: { eyes: 'open', mouth: 'neutral', lookX: 0.4 },
      });
    }
    if (staff?.has('server')) {
      const busy = state.npcs?.server?.busy;
      const NPC_X = PROPS.pass.x + 32;
      const NPC_Y = PROPS.pass.y - 10;
      cx.save(); cx.globalAlpha = 0.12; cx.fillStyle = '#3b2a20';
      cx.beginPath(); cx.ellipse(NPC_X, NPC_Y + 4, 22, 7, 0, 0, Math.PI * 2); cx.fill(); cx.restore();
      const breathe = Math.sin(time * 1.2 + 3) * 0.5 * motion;
      person(cx, NPC_X, NPC_Y, 0.82, SERVER, {
        hideLegs: true, facing: -1, breathe,
        lean: busy ? -0.04 * motion : 0,
        face: { eyes: 'open', mouth: busy ? 'smile' : 'neutral', lookX: -0.5 },
      });
    }

    // ---- The owner.
    const oClip = ownerClip(state);
    const O = anim.owner;
    const ownerBehind = O.y < STAGE.behindY + 30;
    const ownerPose = () => buildOwnerPose(state, oClip, anim, time, motion);
    if (ownerBehind) {
      // Owner ground shadow
      cx.save();
      cx.globalAlpha = 0.15;
      cx.fillStyle = '#3b2a20';
      cx.beginPath();
      cx.ellipse(O.x, O.y + 6, 30, 9, 0, 0, Math.PI * 2);
      cx.fill();
      cx.restore();
      person(cx, O.x, O.y, 1, OWNER, ownerPose());
    }

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
    // ---- TapIt Stand kiosk on the customer floor.
    const stClip = standClip(state);
    if (stClip.installed) {
      floor.push({ y: PROPS.stand.y + PROPS.stand.h, draw: () => drawStand(cx, stClip) });
    }
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
        // Warm glow behind coin popup
        cx.save();
        cx.globalAlpha *= 0.25;
        const coinGlow = cx.createRadialGradient(f.x, y, 0, f.x, y, w);
        coinGlow.addColorStop(0, '#ffe08a');
        coinGlow.addColorStop(1, 'transparent');
        cx.fillStyle = coinGlow;
        cx.fillRect(f.x - w, y - w * 0.6, w * 2, w * 1.2);
        cx.restore();
        art.rounded(cx, f.x - w / 2, y - 24, w, 34, 12, '#29282cee');
        // Coin with inner highlight
        art.oval(cx, f.x - w / 2 + 16, y - 7, 9, 9, '#f2b532');
        art.oval(cx, f.x - w / 2 + 15, y - 9, 5, 5, '#ffe87040');
        art.textAt(cx, text, f.x + 8, y + 2, 22, f.color ?? '#ffe08a', 1000);
        cx.globalAlpha = 1;
      } else if (f.type === 'answered' && f.x !== undefined && f.y !== undefined) {
        cx.globalAlpha = 1 - Math.max(0, t - 0.55) / 0.45;
        const y = f.y - 40 * smooth(t);
        // Success glow ring
        cx.save();
        cx.globalAlpha *= 0.3 * (1 - t);
        cx.strokeStyle = '#7fbf5a';
        cx.lineWidth = 3;
        cx.beginPath();
        cx.arc(f.x, y, 20 + t * 14, 0, Math.PI * 2);
        cx.stroke();
        cx.restore();
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
      } else if (f.type === 'discarded' && f.x !== undefined && f.y !== undefined) {
        // Pour-out splash: liquid drops fall and fade.
        cx.globalAlpha = 1 - Math.max(0, t - 0.4) / 0.6;
        const drops = 5;
        for (let i = 0; i < drops; i++) {
          const angle = -0.8 + (i / (drops - 1)) * 1.6;
          const dist = 14 + t * 36;
          const dx = f.x + Math.sin(angle) * dist;
          const dy = f.y + t * 40 + Math.abs(Math.sin(angle)) * 10;
          const r = 3 * (1 - t * 0.6);
          art.oval(cx, dx, dy, r, r * 1.4, '#8a5a3a');
        }
        // Splash ring at base.
        cx.strokeStyle = '#8a5a3a60';
        cx.lineWidth = 2;
        cx.beginPath();
        cx.ellipse(f.x, f.y + 30, 16 + t * 20, 4 + t * 6, 0, 0, Math.PI * 2);
        cx.stroke();
        // "DISCARD" text rising up.
        const textY = f.y - 20 - t * 30;
        art.rounded(cx, f.x - 36, textY - 12, 72, 22, 8, '#5a2a18cc');
        art.textAt(cx, 'DISCARD', f.x, textY + 6, 13, '#ffb870', 800);
        cx.globalAlpha = 1;
      } else if (f.type === 'cancelled' && f.x !== undefined && f.y !== undefined) {
        cx.globalAlpha = 1 - t;
        // Fading red ring
        cx.save();
        cx.globalAlpha *= 0.35 * (1 - t);
        cx.strokeStyle = '#df6254';
        cx.lineWidth = 2;
        cx.beginPath();
        cx.arc(f.x, f.y - t * 20, 16 + t * 18, 0, Math.PI * 2);
        cx.stroke();
        cx.restore();
        art.oval(cx, f.x, f.y - t * 20, 16 + t * 10, 16 + t * 10, '#6b3a36');
        art.textAt(cx, '×', f.x, f.y + 8 - t * 20, 26, '#ffccc6', 1000);
        cx.globalAlpha = 1;
      } else if (f.type === 'standUse' && f.x !== undefined && f.y !== undefined) {
        // NFC tap ripple effect at the stand
        cx.globalAlpha = 1 - t;
        for (let i = 0; i < 3; i++) {
          const delay = i * 0.2;
          const rt = Math.max(0, Math.min(1, (t - delay) / (1 - delay)));
          if (rt <= 0) continue;
          cx.strokeStyle = `rgba(26,106,255,${(1 - rt) * 0.5})`;
          cx.lineWidth = 2;
          cx.beginPath();
          cx.arc(f.x, f.y, 8 + rt * 20, 0, Math.PI * 2);
          cx.stroke();
        }
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
          // The owner's current job: a warm glowing NOW tag.
          cx.save();
          cx.globalAlpha = 0.25;
          art.oval(cx, area.x + area.w - 31, area.y + area.h - 18, 34, 18, '#ff8d20');
          cx.restore();
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
      // Softer, larger drop shadow for lifted item
      art.oval(cx, d.x, d.y + 36, 34, 10, '#00000020');
      art.oval(cx, d.x, d.y + 34, 28, 7, '#00000030');
      if (isDrink(d.item)) {
        cupWithFill(cx, d.x - 4, d.y, 52, 1, true, d.item);
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

    // ── Weight transfer during walk ──
    const hip = hipShift(O.stride, O.walk * motion);
    const shoulderT = shoulderCounter(O.stride, O.walk * motion);

    // ── Breathing: subtle chest expansion when idle or working ──
    const breatheCycle = Math.sin(time * 1.8) * 0.5 + 0.5;

    /** @type {Pose} */
    const pose = {
      stride: O.stride,
      walk: O.walk,
      facing: O.facing,
      bob: Math.sin(time * 2) * 0.8 * motion + hip.y,
      hideLegs: O.y < STAGE.behindY + 30,
      face,
      hipX: hip.x,
      hipTilt: hip.tilt,
      shoulderTilt: shoulderT,
      headSettle: -shoulderT * 0.4 + Math.sin(O.stride + 0.8) * 0.015 * O.walk * motion,
      breathe: breatheCycle * (1 - O.walk), // breathe only when not walking
    };
    const p = clip.progress;
    const item = clip.item;
    switch (clip.kind) {
      // ═══════════════════════════════════════════════════════════════
      //  WALK — weight transfer, arm momentum, carried items sway
      // ═══════════════════════════════════════════════════════════════
      case 'walk': {
        if (item === 'cloth') {
          // Cloth swings with walk momentum
          const swingX = secondarySwing(O.stride, O.walk, -0.6, 4) * motion;
          pose.rightHand = { x: -20 + swingX, y: -78 + secondaryBob(O.stride, O.walk, -0.5, 2) * motion };
          pose.holdRight = (c, x, y) => cloth(c, x, y);
        } else if (item) {
          const carried = /** @type {OrderItem | 'cup'} */ (item);
          // Carried item has overlapping motion: lags behind body movement
          const lagX = secondarySwing(O.stride, O.walk, -0.7, 3) * motion;
          const lagY = secondaryBob(O.stride, O.walk, -0.5, 2.5) * motion;
          pose.rightHand = { x: 6 + O.facing * 10 + lagX, y: -90 + lagY };
          // Both hands stabilize the item when walking fast
          if (O.walk > 0.5) pose.leftHand = { x: 16 + lagX * 0.5, y: -86 + lagY * 0.6 };
          pose.holdRight = (c, x, y) => heldItem(c, carried, x, y - 4, 26);
          face.mouth = 'smile';
        }
        // Head bobs with walk, lagging slightly
        pose.headSettle = (pose.headSettle ?? 0) + secondaryBob(O.stride, O.walk, -0.3, 0.012) * motion;
        break;
      }
      // ═══════════════════════════════════════════════════════════════
      //  BREW — the hero sequence: reach → pick up cup → carry to
      //  spout → place carefully → press button with snap
      // ═══════════════════════════════════════════════════════════════
      case 'brew': {
        const cupAt = PROPS.machine.cup;
        const { phase: brewPhase, t: bt } = phases(p, [
          ['anticipate', 0.08],  // body gathers before reaching
          ['reach', 0.18],       // reach for clean cup from rack area
          ['lift', 0.12],        // lift cup with slight weight
          ['carry', 0.22],       // carry cup to machine spout in an arc
          ['place', 0.10],       // set cup down with care
          ['press', 0.18],       // press brew button with snap
          ['settle', 0.12],      // settle back, satisfied
        ]);

        const cupFrom = { x: O.x - 10, y: O.y - 92 };
        const cupTo = { x: cupAt.x + 6, y: cupAt.y - 2 };

        switch (brewPhase) {
          case 'anticipate': {
            // Slight lean toward machine — gathering energy before reaching
            pose.lean = -0.02 * easeOut(bt) * motion;
            face.lookX = -0.8;
            face.lookY = -0.2;
            // Hands come together in front briefly
            pose.rightHand = { x: -8, y: -86 + bt * -6 };
            pose.leftHand = { x: 12, y: -84 + bt * -4 };
            break;
          }
          case 'reach': {
            // Reach out toward where the cups are — eased with follow-through
            const k = easeOutBack(bt, 1.1);
            const reachTarget = { x: (cupFrom.x - O.x) / s - 8, y: (cupFrom.y - O.y) / s - 12 };
            pose.rightHand = { x: reachTarget.x * k, y: -86 + reachTarget.y * k };
            pose.lean = -0.02 * motion;
            // Left hand goes to hip (weight shift)
            pose.leftHand = { x: 22, y: -78 };
            face.lookX = -1;
            face.lookY = -0.4;
            face.mouth = 'neutral';
            break;
          }
          case 'lift': {
            // Cup picked up — slight bob from the weight
            const k = easeOut(bt);
            const liftBob = Math.sin(bt * Math.PI) * 3 * motion;
            pose.bob = (pose.bob ?? 0) + liftBob;
            const liftHand = local(cupFrom.x, cupFrom.y - 10 * k);
            pose.rightHand = liftHand;
            pose.holdRight = (c, x, y) => cupWithFill(c, x - 6, y - 8, 40, 0, false);
            pose.leftHand = { x: 22, y: -78 };
            face.lookX = -0.8;
            break;
          }
          case 'carry': {
            // Carry cup to spout in a gentle arc — the cup leads, body follows
            const k = smoothU(bt);
            // Arc trajectory: cup rises then settles
            const handWorld = arc(cupFrom, cupTo, k, -18);
            pose.rightHand = local(handWorld.x, handWorld.y);
            pose.holdRight = (c, x, y) => cupWithFill(c, x - 6, y - 8, 40, 0, false);
            // Body shifts weight to follow the cup
            pose.lean = (-0.02 + bt * 0.02) * motion;
            // Left hand steadies — secondary motion
            pose.leftHand = { x: 22 - bt * 4, y: -78 - bt * 6 };
            face.lookX = -1 + bt * 0.4;
            face.lookY = -0.3;
            break;
          }
          case 'place': {
            // Set cup down carefully — controlled deceleration
            const k = easeOut(bt);
            const settleY = cupTo.y - 2 + k * 2;
            pose.rightHand = local(cupTo.x, settleY);
            pose.holdRight = (c, x, y) => cupWithFill(c, x - 6, y - 8, 40, 0, false);
            // Slight forward lean while placing
            pose.lean = 0;
            pose.leftHand = { x: 18, y: -84 };
            face.lookX = -0.6;
            face.lookY = -0.5;
            face.mouth = 'neutral';
            break;
          }
          case 'press': {
            // Cup sits under spout; press brew button with snap
            cupWithFill(cx, cupAt.x, cupAt.y, 40, 0, false);
            // Anticipation → snap → follow-through on button press
            const pressK = anticipateSettle(bt, 0.08, 0.06);
            const buttonX = PROPS.machine.x + PROPS.machine.w - 10;
            const buttonY = PROPS.machine.y + 40;
            pose.rightHand = local(buttonX + pressK * 6, buttonY);
            pose.leftHand = { x: 22, y: -80 };
            // Body reacts to press: micro-lean forward then settle
            pose.lean = pressK * -0.015 * motion;
            face.lookX = -0.8;
            face.lookY = -0.3;
            // Mouth tightens with effort then relaxes
            face.mouth = bt < 0.5 ? 'neutral' : 'smile';
            break;
          }
          case 'settle': {
            // Step back, satisfied — follow-through
            cupWithFill(cx, cupAt.x, cupAt.y, 40, 0, false);
            const k = easeOut(bt);
            pose.rightHand = local(PROPS.machine.x + PROPS.machine.w - 10, PROPS.machine.y + 40);
            pose.rightHand = { x: -6 * k, y: -86 };
            pose.leftHand = { x: 22, y: -80 };
            face.lookX = -0.6;
            face.lookY = -0.2;
            face.mouth = 'smile';
            // Slight bounce-back as body settles
            pose.bob = (pose.bob ?? 0) + Math.sin(bt * Math.PI) * 1.5 * motion;
            break;
          }
        }
        break;
      }
      // ═══════════════════════════════════════════════════════════════
      //  PLATE — reach into case → lift croissant → carry to pass
      // ═══════════════════════════════════════════════════════════════
      case 'plate': {
        const into = { x: PROPS.caseBox.x + 110, y: PROPS.caseBox.y + 44 };
        const pass = { x: PROPS.pass.x + 4, y: PROPS.pass.y - 6 };
        const { phase: platePhase, t: pt } = phases(p, [
          ['reach', 0.30],
          ['lift', 0.15],
          ['carry', 0.35],
          ['place', 0.20],
        ]);

        switch (platePhase) {
          case 'reach': {
            const k = easeOutBack(pt, 1.0);
            pose.rightHand = local(O.x - 14 + (into.x - O.x + 14) * k, O.y - 92 + (into.y - O.y + 92) * k);
            face.lookX = -1;
            pose.lean = -0.015 * k * motion;
            break;
          }
          case 'lift': {
            const k = easeOut(pt);
            pose.rightHand = local(into.x, into.y - 12 * k);
            pose.holdRight = (c, x, y) => heldItem(c, 'croissant', x, y, 24);
            pose.bob = (pose.bob ?? 0) + Math.sin(pt * Math.PI) * 2 * motion;
            face.lookX = -1;
            break;
          }
          case 'carry': {
            const k = smoothU(pt);
            const handWorld = arc(into, pass, k, -14);
            pose.rightHand = local(handWorld.x, handWorld.y);
            pose.holdRight = (c, x, y) => heldItem(c, 'croissant', x, y, 24);
            face.lookX = -1 + pt * 0.6;
            break;
          }
          case 'place': {
            const k = easeOut(pt);
            pose.rightHand = local(pass.x, pass.y - 4 + k * 4);
            pose.holdRight = (c, x, y) => heldItem(c, 'croissant', x, y, 24);
            face.lookX = -0.4;
            face.mouth = 'smile';
            break;
          }
        }
        break;
      }
      // ═══════════════════════════════════════════════════════════════
      //  SERVE — lean back (anticipation) → extend with arc →
      //  hold → release with follow-through
      // ═══════════════════════════════════════════════════════════════
      case 'serve': {
        const { phase: servePhase, t: st } = phases(p, [
          ['anticipate', 0.15],  // gather, lean back slightly
          ['extend', 0.35],      // lean forward, extend item
          ['hold', 0.30],        // hold steady while guest takes it
          ['settle', 0.20],      // release, settle back
        ]);

        switch (servePhase) {
          case 'anticipate': {
            // Lean back slightly, gathering — the wind-up before the serve
            const k = easeOut(st);
            pose.lean = 0.02 * k * motion;
            pose.rightHand = { x: 4, y: -96 + k * -4 };
            pose.leftHand = { x: 14, y: -90 };
            if (item && item !== 'cup' && item !== 'cloth') pose.holdRight = (c, x, y) => heldItem(c, /** @type {OrderItem} */ (item), x, y - 6, 28);
            face.mouth = 'smile';
            face.lookY = 0.3;
            break;
          }
          case 'extend': {
            // Lean forward to offer the item — the main serve action
            const k = easeOutBack(st, 0.8);
            pose.lean = (0.02 - 0.04 * k) * motion;
            pose.rightHand = { x: 4, y: -100 + k * 20 };
            pose.leftHand = { x: 14, y: -90 + k * 10 };
            if (item && item !== 'cup' && item !== 'cloth') pose.holdRight = (c, x, y) => heldItem(c, /** @type {OrderItem} */ (item), x, y - 6, 28);
            face.mouth = 'grin';
            face.lookY = 0.4 + st * 0.3;
            // Eyes widen at the moment of offering
            if (st > 0.5) face.eyes = 'open';
            break;
          }
          case 'hold': {
            // Holding steady — slight bobble shows anticipation
            const sway = Math.sin(st * Math.PI * 3) * 0.5 * motion;
            pose.rightHand = { x: 4, y: -80 + sway };
            pose.leftHand = { x: 14, y: -80 + sway * 0.6 };
            pose.lean = -0.02 * motion;
            if (item && item !== 'cup' && item !== 'cloth') pose.holdRight = (c, x, y) => heldItem(c, /** @type {OrderItem} */ (item), x, y - 6, 28);
            face.mouth = 'grin';
            face.lookY = 0.6;
            break;
          }
          case 'settle': {
            // Hands come back — follow-through with slight bounce
            const k = bounce(st, 0.15);
            pose.rightHand = { x: 4 - k * 8, y: -80 - k * 10 };
            pose.leftHand = { x: 14 - k * 4, y: -80 - k * 8 };
            pose.lean = (-0.02 + k * 0.02) * motion;
            face.mouth = 'smile';
            face.lookY = 0.6 - st * 0.3;
            // Bob from settling weight back
            pose.bob = (pose.bob ?? 0) + Math.sin(st * Math.PI) * 2 * motion;
            break;
          }
        }
        break;
      }
      // ═══════════════════════════════════════════════════════════════
      //  ANSWER — expressive gesturing with overlapping action
      // ═══════════════════════════════════════════════════════════════
      case 'answer': {
        // Expressive gesture with overlapping action
        const wave = Math.sin(time * 7) * motion;
        const gestureY = Math.sin(time * 3.5) * 6 * motion;
        // Primary gesture hand: arc motion, not just side-to-side
        pose.rightHand = { x: -26 + wave * 6, y: -124 + gestureY };
        // Left hand provides counterbalance
        pose.leftHand = { x: 16 + Math.sin(time * 3.5 + 1.5) * 2 * motion, y: -82 };
        // Mouth alternates more naturally: talk → pause → emphasize
        const mouthCycle = time * 6 * motion;
        face.mouth = Math.sin(mouthCycle) > 0.2 ? 'talk' : Math.sin(mouthCycle) > -0.3 ? 'neutral' : 'smile';
        face.lookY = 0.5;
        // Subtle body sway while explaining
        pose.lean = Math.sin(time * 2.8) * 0.012 * motion;
        // Head nods gently
        pose.headSettle = Math.sin(time * 3) * 0.02 * motion;
        break;
      }
      // ═══════════════════════════════════════════════════════════════
      //  WASH — circular scrubbing with weight and effort
      // ═══════════════════════════════════════════════════════════════
      case 'wash': {
        const basin = PROPS.sink.basin;
        const scrubCycles = 4;
        const a = p * Math.PI * 2 * scrubCycles;
        // Scrubbing motion: elliptical, not perfectly circular
        const scrubX = Math.sin(a) * 10 * (motion || 0.4);
        const scrubY = Math.cos(a) * 4;
        const hx = basin.x - 26 + scrubX;
        const hy = basin.y + 2 + scrubY;
        pose.leftHand = local(hx + 10, hy);
        pose.rightHand = local(hx - 8, hy + 2);
        pose.holdLeft = (c, x, y) => dishInHand(c, x - 6, y, p);
        // Body sways with scrubbing effort — overlapping action
        pose.lean = Math.sin(a) * 0.015 * motion;
        pose.bob = (pose.bob ?? 0) + Math.abs(Math.sin(a)) * 1.5 * motion;
        face.lookX = 1;
        face.lookY = 0.6;
        // Concentrated expression
        face.mouth = Math.abs(Math.sin(a * 0.5)) > 0.8 ? 'neutral' : 'smile';
        break;
      }
      // ═══════════════════════════════════════════════════════════════
      //  WIPE — whole-body effort with follow-through
      // ═══════════════════════════════════════════════════════════════
      case 'wipe': {
        const at = clothAt(clip.tableId ?? 1, p);
        pose.rightHand = local(at.x, at.y);
        pose.holdRight = (c, x, y) => cloth(c, x, y);
        pose.leftHand = { x: 16, y: -86 };
        face.lookX = -1;
        face.lookY = 0.7;
        // Body follows the wiping motion — overlapping action
        const wipeProgress = p * Math.PI * 10;
        pose.lean = Math.sin(wipeProgress) * 0.02 * motion;
        pose.bob = (pose.bob ?? 0) + Math.abs(Math.sin(wipeProgress)) * 1 * motion;
        // Effort expression
        face.mouth = p < 0.7 ? 'neutral' : 'smile';
        break;
      }
      default: {
        // ═══════════════════════════════════════════════════════════
        //  IDLE — alive: weight shifts, glances, breathing
        // ═══════════════════════════════════════════════════════════
        const waiting = state.guests.filter((g) => g.place.kind === 'spot' && g.state === 'waiting');
        if (waiting.length > 0) {
          const g = waiting.reduce((a, b) => (a.patienceLeft < b.patienceLeft ? a : b));
          const body = anim.guests.get(g.id);
          if (body) face.lookX = Math.max(-1, Math.min(1, (body.x - O.x) / 200));
          face.lookY = 0.6;
        }
        // Idle weight shift: subtle hip sway even when standing still
        const idleSway = Math.sin(time * 0.9) * 0.4 * motion;
        pose.hipX = idleSway;
        pose.hipTilt = Math.sin(time * 0.9) * 0.008 * motion;
        // Occasional subtle lean
        pose.lean = Math.sin(time * 0.6) * 0.008 * motion;
        // Arms hang naturally with slight movement
        pose.armSwing = Math.sin(time * 1.2) * 0.04 * motion;
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
      // Sip cycle: anticipation (reach) → sip → lower → rest
      const sipCycle = (time * 0.9 + phase) % (Math.PI * 2);
      const seatedDrink = isDrink(spec?.order ?? '') ? /** @type {import('../sim/types.js').DrinkItem} */ (spec?.order) : null;
      const sipActive = !!seatedDrink && sipCycle > 5.2 && motion > 0;
      const sipT = sipActive ? clamp01((sipCycle - 5.2) / 1.0) : 0;
      // Smooth sip arc: cup rises, pauses, lowers
      const sipLift = sipActive ? (sipT < 0.4 ? easeOut(sipT / 0.4) : sipT < 0.7 ? 1 : easeOut((1 - sipT) / 0.3)) : 0;
      const isBlinking = (time * 1000 + phase * 900) % 3900 < 120;
      const seatedBob = Math.sin(time * 1.6 + phase) * 0.6 * motion;
      const seatedBreath = Math.sin(time * 1.4 + phase) * 0.5 + 0.5;
      person(cx, body.x, body.y - 16, GUEST_SCALE, CAST[body.look % CAST.length], {
        seated: true,
        facing: 1,
        bob: seatedBob + (sipActive ? -sipLift * 3 : 0) * motion,
        breathe: seatedBreath,
        face: {
          eyes: isBlinking ? 'closed' : sipActive && sipLift > 0.8 ? 'closed' : sipActive ? 'happy' : 'open',
          mouth: sipActive && sipLift > 0.8 ? 'o' : 'smile',
          blush: anim.joy(seated.id) > 0,
          lookX: sipActive ? 0 : 0.6,
          lookY: sipActive ? -0.3 : 0,
        },
        rightHand: sipActive
          ? { x: -6 - sipLift * 4, y: -76 - sipLift * 52 }
          : { x: 30, y: -76 },
        leftHand: { x: 40, y: -80 + (sipActive ? sipLift * -4 : 0) },
        holdRight: sipActive
          ? (cc, x, y) => cupWithFill(cc, x, y - 4, 22, 0.8, false, seatedDrink)
          : null,
        // Subtle head tilt while sipping
        headSettle: sipActive ? sipLift * -0.06 : Math.sin(time * 0.8 + phase) * 0.01 * motion,
      });
    }
    const wiped = anim.progressOf('tableWiped', (f) => f.tableId === tableId);
    drawTableTop(cx, { x: c.x, y: c.y - 4, dirt: tableDirt(state, tableId), shine: wiped < 0 ? 0 : wiped });
    if (seated && seated.dishId !== null) {
      const spec = state.schedule.find((s) => s.id === seated.id);
      const tableDrink = isDrink(spec?.order ?? '') ? /** @type {import('../sim/types.js').DrinkItem} */ (spec?.order) : null;
      const sipping = !!tableDrink && Math.sin(time * 0.9 + seated.id * 1.7) > 0.9 && motion > 0;
      if (spec?.order === 'croissant') {
        art.plate(cx, c.x - 14, c.y - 6, 48, false);
        art.croissant(cx, c.x - 14, c.y - 12, 28);
      } else if (!sipping) {
        cupWithFill(cx, c.x - 14, c.y - 10, 26, 0.8, true, tableDrink);
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
    // Weight transfer for walking guests
    const gHip = hipShift(body.stride, body.walk * motion);
    const gShoulder = shoulderCounter(body.stride, body.walk * motion);
    /** @type {Pose} */
    const pose = {
      stride: body.stride, walk: body.walk, facing: body.facing, face, bob: 0,
      hipX: gHip.x, hipTilt: gHip.tilt, shoulderTilt: gShoulder,
      headSettle: -gShoulder * 0.3,
    };
    const idle = motion * (body.walk < 0.2 ? 1 : 0);
    pose.bob = Math.sin(time * 2.2 + phase) * 0.8 * idle + gHip.y;
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
    if (clip.kind === 'toStand') {
      // Walking to the stand — phone in hand, looking toward it
      pose.crossedArms = false;
      pose.rightHand = { x: -12, y: -100 };
      pose.holdRight = (c, x, y) => art.phone(c, x, y - 4, 22);
      face.lookX = 0.5;
      face.lookY = 0;
      face.mouth = 'smile';
    }
    if (clip.kind === 'atStand') {
      // At the stand — tapping phone against kiosk NFC
      const tap = Math.sin(time * 6 + phase) * 0.5;
      pose.crossedArms = false;
      pose.rightHand = { x: -20 + tap * motion, y: -110 };
      pose.holdRight = (c, x, y) => art.phone(c, x, y - 4, 22);
      pose.facing = -1; // Face the stand
      face.lookX = -0.3;
      face.lookY = -0.3;
      face.mouth = 'smile';
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
      // Bouncy delight: a quick hop that settles with follow-through
      const joyPhase = 1 - joy;
      const hopHeight = joyPhase < 0.3
        ? -Math.sin((joyPhase / 0.3) * Math.PI) * 10
        : -Math.sin(((joyPhase - 0.3) / 0.7) * Math.PI * 2) * 3 * Math.max(0, 1 - joyPhase * 1.2);
      pose.bob = hopHeight * motion;
      // Shoulders rise with delight
      pose.shoulderTilt = Math.sin(joyPhase * Math.PI * 4) * 0.03 * motion;
      // Head tilts with happiness
      pose.headSettle = Math.sin(joyPhase * Math.PI * 3) * 0.04 * motion;
      pose.crossedArms = false;
      pose.footTap = 0;
    } else if (clip.kind === 'standing') {
      face.mouth = 'neutral';
      face.eyes = blink ? 'closed' : 'down';
    }
    // Guest ground shadow
    cx.save();
    cx.globalAlpha = 0.14;
    cx.fillStyle = '#3b2a20';
    cx.beginPath();
    cx.ellipse(body.x, body.y + 4, 26 * scale, 7 * scale, 0, 0, Math.PI * 2);
    cx.fill();
    cx.restore();
    person(cx, body.x, body.y, scale, look, pose);

    // Personality badge: small icon above the guest's head for non-regular types.
    const spec = state.schedule.find((s) => s.id === g.id);
    if (spec && spec.personality !== 'regular') {
      const badgeY = body.y - 170 * scale;
      const badgeX = body.x + 18 * scale;
      const r = 8;
      cx.save();
      cx.globalAlpha = 0.85;
      if (spec.personality === 'impatient') {
        // Orange-red circle with lightning bolt
        cx.fillStyle = '#e05030';
        cx.beginPath();
        cx.arc(badgeX, badgeY, r, 0, Math.PI * 2);
        cx.fill();
        cx.strokeStyle = '#fff';
        cx.lineWidth = 1.5;
        cx.beginPath();
        cx.moveTo(badgeX - 1, badgeY - 5);
        cx.lineTo(badgeX + 2, badgeY - 1);
        cx.lineTo(badgeX - 1, badgeY);
        cx.lineTo(badgeX + 1, badgeY + 5);
        cx.stroke();
      } else {
        // Blue-green circle with hourglass
        cx.fillStyle = '#3090b0';
        cx.beginPath();
        cx.arc(badgeX, badgeY, r, 0, Math.PI * 2);
        cx.fill();
        cx.strokeStyle = '#fff';
        cx.lineWidth = 1.5;
        cx.beginPath();
        cx.moveTo(badgeX - 3, badgeY - 4);
        cx.lineTo(badgeX + 3, badgeY - 4);
        cx.lineTo(badgeX, badgeY);
        cx.lineTo(badgeX + 3, badgeY + 4);
        cx.lineTo(badgeX - 3, badgeY + 4);
        cx.lineTo(badgeX, badgeY);
        cx.closePath();
        cx.stroke();
      }
      cx.restore();
    }
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
    const ghostStride = ghost.stride + t * ghost.duration * 0.02;
    const ghostWalk = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1;
    const ghostHip = hipShift(ghostStride, ghostWalk * motion);
    person(cx, at.x, at.y, GUEST_SCALE, look, {
      stride: ghostStride,
      walk: ghostWalk,
      facing,
      face: unhappy
        ? { eyes: 'down', mouth: 'frown', brows: 'worried' }
        : { eyes: 'happy', mouth: 'smile', blush: true },
      lean: unhappy ? -0.06 : 0,
      hipX: ghostHip.x,
      hipTilt: ghostHip.tilt,
      shoulderTilt: shoulderCounter(ghostStride, ghostWalk * motion),
      headSettle: unhappy ? Math.sin(time * 2) * 0.03 * motion : 0,
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
      if (isDrink(spec.order)) cupWithFill(cx, bx + bw / 2 + (big ? 8 : 0), by + bh / 2 + 4, bh * 0.56, 1, true, spec.order);
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
