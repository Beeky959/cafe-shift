// @ts-check
/**
 * Draws the café from the simulation state. The view only reads the state;
 * it never changes it. Poses are static in this milestone: positions and
 * progress bars are the simulation's own timers, displayed.
 */
/** @import { SimState, LiveGuest, GuestSpec, OrderItem } from '../sim/types.js' */
/** @import { Service } from '../ui/service.js' */
import { resolveTap } from '../sim/index.js';
import { HIT_AREAS, PLACES, SCENE_HEIGHT, SCENE_WIDTH, centreOf } from './scene.js';
import * as art from './art.js';

export { SCENE_HEIGHT, SCENE_WIDTH };

/** Backing-store scale is capped so large phones do not pay for 3x pixels. */
const MAX_PIXEL_RATIO = 2;

/**
 * Things only the view knows about.
 * @typedef {object} ViewState
 * @property {string | null} hoverId Hit area under a mouse pointer.
 * @property {Map<string, { kind: 'press' | 'reject', until: number }>} flashes Short highlights, by hit area id.
 * @property {number} now Milliseconds, from the frame clock.
 * @property {Service} service Order selection and carrying (interface state only).
 * @property {{ item: OrderItem, x: number, y: number } | null} drag An item being dragged, in scene units.
 * @property {{ x: number, y: number, text: string, color: string, start: number, until: number }[]} effects Short rising labels.
 * @property {Map<number, number>} happyUntil Guests showing a pleased face, by id, until this time.
 * @property {'neutral' | 'happy' | 'alert' | 'sad'} byteMood
 */

/**
 * @typedef {object} Renderer
 * @property {() => void} resize Match the backing store to the displayed size.
 * @property {(state: SimState, view: ViewState) => void} draw
 * @property {(clientX: number, clientY: number) => { x: number, y: number }} toScene Screen point to logical point.
 * @property {() => { cssWidth: number, cssHeight: number, pixelRatio: number, scale: number }} metrics
 */

const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => a + (b - a) * Math.max(0, Math.min(1, t));

/**
 * @param {art.Ctx} cx
 */
function drawBackground(cx) {
  // Wall.
  const wall = cx.createLinearGradient(0, 0, 0, 330);
  wall.addColorStop(0, '#f8e4b9');
  wall.addColorStop(1, '#ecd09a');
  cx.fillStyle = wall;
  cx.fillRect(0, 0, SCENE_WIDTH, 330);
  art.rounded(cx, 0, 0, SCENE_WIDTH, 34, 0, '#c9885a');
  art.rounded(cx, 0, 34, SCENE_WIDTH, 8, 0, '#85533e');
  for (let i = 1; i < 15; i++) {
    cx.strokeStyle = '#c79f7555';
    cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(i * 64, 44);
    cx.lineTo(i * 64, 250);
    cx.stroke();
  }
  // Window.
  art.rounded(cx, 462, 56, 256, 120, 12, '#623f35');
  art.rounded(cx, 471, 65, 238, 102, 7, '#b5dcd6');
  art.poly(cx, [[473, 140], [516, 104], [555, 132], [602, 98], [663, 141], [709, 118], [709, 166], [473, 166]], '#9eafa0');
  art.rounded(cx, 585, 66, 10, 100, 0, '#6f5142');
  // Floor.
  cx.fillStyle = '#d5a178';
  cx.fillRect(0, 330, SCENE_WIDTH, SCENE_HEIGHT - 330);
  for (let j = 0; j < 8; j++) {
    cx.strokeStyle = '#c18c654b';
    cx.lineWidth = 2;
    cx.beginPath();
    cx.moveTo(0, 440 + j * 40);
    cx.lineTo(SCENE_WIDTH, 440 + j * 40);
    cx.stroke();
  }
  // Door, at the left.
  art.rounded(cx, -6, 372, 30, 190, 6, '#7a4d3a', '#4a3231', 4);
  art.oval(cx, 14, 470, 4, 4, '#f2c36b');
  art.plant(cx, 925, 392, 0.9);

  // Back bar that the stations sit on.
  art.rounded(cx, 20, 262, 920, 62, 8, '#76483b', '#472f30', 3);
  // Coffee machine.
  art.rounded(cx, 62, 176, 136, 96, 10, '#525b5c', '#342c32', 4);
  art.rounded(cx, 78, 188, 104, 26, 4, '#a7afa7');
  art.rounded(cx, 96, 250, 68, 14, 3, '#2f2a2e');
  art.rounded(cx, 118, 222, 24, 18, 3, '#3a3336');
  // Pastry case.
  art.rounded(cx, 266, 190, 150, 86, 12, '#c1e5debb', '#7e9790', 4);
  art.rounded(cx, 280, 236, 122, 26, 5, '#d5ae7d');
  for (const xx of [300, 341, 382]) art.croissant(cx, xx, 232, 34);
  // Sink and the rack shelf above it.
  art.rounded(cx, 758, 232, 144, 62, 10, '#9fb0b3', '#56666a', 4);
  art.rounded(cx, 772, 244, 116, 40, 8, '#6f8387');
  art.rounded(cx, 824, 214, 10, 26, 3, '#56666a');
  art.rounded(cx, 808, 208, 30, 10, 4, '#56666a');
  art.rounded(cx, 754, 196, 152, 8, 3, '#8b5c42');
  // Register, where the owner stands for guests.
  art.rounded(cx, 596, 282, 64, 36, 5, '#37383d', '#20242a', 3);
  art.rounded(cx, 606, 288, 44, 18, 2, '#a4be86');

  // Front counter.
  const c = PLACES.counterTop;
  art.rounded(cx, c.x, c.y, c.w, c.h, 6, '#e2ac70', '#51392f', 5);
  art.rounded(cx, c.x, c.y + c.h - 4, c.w, 50, 3, '#b57b52', '#5c3e35', 4);
  for (let x = 80; x < 930; x += 86) {
    cx.strokeStyle = '#a66d49';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(x, c.y + c.h);
    cx.lineTo(x, c.y + c.h + 44);
    cx.stroke();
  }
  // Floor markers for the three counter spots.
  for (const area of HIT_AREAS.filter((a) => a.target.kind === 'spot')) {
    art.oval(cx, area.x + area.w / 2, area.y + area.h - 16, 56, 14, '#b98a6150');
  }
  // Table bases.
  for (const area of HIT_AREAS.filter((a) => a.target.kind === 'table')) {
    const m = centreOf(area);
    art.oval(cx, m.x, area.y + area.h - 12, 70, 12, '#44362c30');
    art.rounded(cx, m.x - 7, m.y + 6, 14, 48, 3, '#6a4636');
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
    // The static scene is drawn once per size and reused every frame.
    background.width = width;
    background.height = height;
    const bg = background.getContext('2d');
    if (bg) {
      const scale = width / SCENE_WIDTH;
      bg.setTransform(scale, 0, 0, scale, 0, 0);
      drawBackground(bg);
    }
  }

  /**
   * @param {SimState} state
   * @param {LiveGuest} g
   * @param {number} standingIndex
   * @returns {{ x: number, y: number, scale: number }}
   */
  function guestPosition(state, g, standingIndex) {
    const p = g.place;
    if (p.kind === 'spot') {
      const area = HIT_AREAS.find((a) => a.target.kind === 'spot' && a.target.index === p.index);
      const x = area ? area.x + area.w / 2 : 0;
      const y = area ? area.y + 96 : 0;
      if (g.state === 'walkingIn') {
        const t = 1 - g.timerLeft / state.timing.walkIn;
        return { x: lerp(PLACES.door.x, x, t), y: lerp(PLACES.door.y, y, t), scale: 1.7 };
      }
      return { x, y, scale: 1.7 };
    }
    if (p.kind === 'door') {
      const slot = PLACES.doorQueue[state.doorQueue.indexOf(g.id)] ?? PLACES.doorQueue[0];
      return { x: slot.x, y: slot.y, scale: 1.3 };
    }
    if (p.kind === 'table') {
      const area = HIT_AREAS.find((a) => a.target.kind === 'table' && a.target.tableId === p.tableId);
      const x = area ? area.x + 46 : 0;
      const y = area ? area.y + 62 : 0;
      if (g.state === 'walkingToTable') {
        const t = 1 - g.timerLeft / state.timing.walkToTable;
        return { x: lerp(SCENE_WIDTH / 2, x, t), y: lerp(480, y, t), scale: 1.3 };
      }
      return { x, y, scale: 1.3 };
    }
    const slot = PLACES.standing[standingIndex % PLACES.standing.length];
    return { x: slot.x, y: slot.y, scale: 1.3 };
  }

  /**
   * @param {GuestSpec} spec
   * @param {number} x
   * @param {number} y
   * @param {number} s
   */
  function orderIcon(spec, x, y, s) {
    if (spec.order === 'latte') art.cup(cx, x - s * 0.06, y, s);
    else art.croissant(cx, x, y, s);
  }

  /**
   * @param {SimState} state
   * @param {ViewState} view
   */
  function draw(state, view) {
    const scale = (cssWidth / SCENE_WIDTH) * pixelRatio;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.drawImage(background, 0, 0);
    cx.setTransform(scale, 0, 0, scale, 0, 0);
    const action = state.owner.action;
    const timing = state.timing;

    const service = view.service;
    const carrying = service.carrying();
    const hints = service.hints(state);

    // ---- Machine.
    const slot = state.machine.slots[0];
    if (slot.state === 'brewing') {
      art.bar(cx, 70, 150, 120, 18, 1 - slot.ticksLeft / timing.brew, '#bee86f');
      art.cup(cx, 130, 238, 26);
      const forWhom = service.madeFor('latte');
      if (forWhom !== null) art.tag(cx, 176, 238, 15, forWhom);
    } else if (slot.state === 'ready') {
      const lifted = carrying === 'latte';
      art.rounded(cx, 60, 146, 140, 26, 13, lifted ? '#ffb03a' : '#bee86f', '#3a2c2c', 3);
      art.textAt(cx, lifted ? 'IN HAND' : 'READY', 130, 166, 18, '#2c3a12', 1000);
      if (!(view.drag && view.drag.item === 'latte')) {
        art.cup(cx, 130, lifted ? 222 : 236, 34, true);
        const forWhom = service.madeFor('latte');
        if (forWhom !== null) art.tag(cx, 178, lifted ? 222 : 236, 15, forWhom);
      }
    }

    // ---- Pastry pass: a plated croissant waits in front of the case.
    if (state.pass.dishId !== null && !(view.drag && view.drag.item === 'croissant')) {
      const lifted = carrying === 'croissant';
      art.plate(cx, 340, lifted ? 290 : 302, 64, false);
      art.croissant(cx, 340, lifted ? 282 : 294, 40);
      const forWhom = service.madeFor('croissant');
      if (forWhom !== null) art.tag(cx, 392, lifted ? 286 : 298, 15, forWhom);
      if (lifted) {
        art.rounded(cx, 280, 150, 120, 26, 13, '#ffb03a', '#3a2c2c', 3);
        art.textAt(cx, 'IN HAND', 340, 170, 18, '#2c3a12', 1000);
      }
    }

    // ---- Dishes: clean ones on the shelf, dirty ones in the sink.
    const clean = state.dishes.filter((d) => d.holder.kind === 'rack').length;
    const dirty = state.dishes.filter((d) => d.holder.kind === 'sink').length;
    for (let i = 0; i < clean; i++) art.plate(cx, 772 + i * 29, 188, 30, false);
    for (let i = 0; i < dirty; i++) art.plate(cx, 800 + (i % 3) * 30, 258 + Math.floor(i / 3) * 12, 34, true);
    if (dirty > 0) {
      art.oval(cx, 900, 232, 19, 19, '#d9534f');
      art.textAt(cx, String(dirty), 900, 242, 28, '#fff', 1000);
    }
    if (clean === 0) {
      art.rounded(cx, 762, 160, 136, 30, 8, '#d9534f');
      art.textAt(cx, 'NO CLEAN DISHES', 830, 181, 15, '#fff', 1000);
    }

    // ---- Tables.
    for (const area of HIT_AREAS) {
      if (area.target.kind !== 'table') continue;
      const tableId = area.target.tableId;
      const table = state.tables.find((t) => t.id === tableId);
      if (!table) continue;
      const m = centreOf(area);
      art.oval(cx, m.x, m.y - 4, 82, 30, table.state === 'dirty' || table.state === 'wiping' ? '#b98a61' : '#e2ac70');
      cx.strokeStyle = '#51392f';
      cx.lineWidth = 4;
      cx.beginPath();
      cx.ellipse(m.x, m.y - 4, 82, 30, 0, 0, Math.PI * 2);
      cx.stroke();
      if (table.state === 'dirty' || table.state === 'wiping') {
        const fade = table.state === 'wiping' && action ? (action.phase === 'working' ? action.ticksLeft / timing.wipe : 1) : 1;
        cx.globalAlpha = Math.max(0.15, fade);
        for (const [dx, dy] of [[-40, -8], [-8, 6], [26, -10], [48, 2]]) art.oval(cx, m.x + dx, m.y + dy - 4, 9, 5, '#6b4630');
        cx.globalAlpha = 1;
      }
      if (table.state === 'wiping' && action && action.phase === 'working') {
        art.bar(cx, m.x - 60, area.y + 4, 120, 16, 1 - action.ticksLeft / timing.wipe, '#8fd3ff');
      }
    }

    // ---- Guests, back to front.
    let standingIndex = 0;
    const order = [...state.guests].sort((a, b) => guestPosition(state, a, 0).y - guestPosition(state, b, 0).y);
    for (const g of order) {
      const spec = state.schedule.find((s) => s.id === g.id);
      if (!spec) continue;
      const pos = guestPosition(state, g, g.place.kind === 'standing' ? standingIndex++ : 0);
      const patienceMax = g.state === 'asking' ? timing.askingPatience : timing.counterPatience;
      const fraction = g.patienceLeft / patienceMax;
      const waiting = g.state === 'waiting' || g.state === 'walkingIn' || g.state === 'asking';
      const pleased = (view.happyUntil.get(g.id) ?? 0) > view.now;
      art.guest(cx, pos.x, pos.y, spec.look, pos.scale, pleased ? 'happy' : waiting && fraction < 0.25 ? 'worried' : 'neutral');
      const isSelected = service.selected() === g.id;
      if (isSelected) {
        cx.strokeStyle = '#ff8d20';
        cx.lineWidth = 6;
        cx.beginPath();
        cx.ellipse(pos.x, pos.y + 39 * pos.scale, 34 * pos.scale, 11 * pos.scale, 0, 0, Math.PI * 2);
        cx.stroke();
      }

      if (g.dishId !== null && !waiting) {
        // Served: their order sits in front of them.
        const ix = g.place.kind === 'table' ? pos.x + 46 : pos.x + 30;
        const iy = g.place.kind === 'table' ? pos.y + 6 : pos.y + 22;
        orderIcon(spec, ix, iy, 26);
      }
      if (!waiting) continue;

      // What they want, and a patience bar under it. An order is a cream
      // ticket with the item on it; a question is a blue speech bubble with
      // a phone, so the two can never be mistaken for each other.
      const big = g.place.kind === 'spot';
      const asking = g.state === 'asking';
      const bw = big ? (asking ? 104 : 84) : 56;
      const bh = big ? 58 : 40;
      const bx = pos.x - bw / 2;
      const by = pos.y - 60 * pos.scale - bh + (big ? 46 : 30);
      const attended = g.attendedBy !== null;
      if (asking && spec.question) {
        // The spot they are holding is marked on the floor.
        cx.setLineDash([10, 8]);
        cx.strokeStyle = '#2f6fb0';
        cx.lineWidth = 5;
        cx.beginPath();
        cx.ellipse(pos.x, pos.y + 39 * pos.scale, 40 * pos.scale, 13 * pos.scale, 0, 0, Math.PI * 2);
        cx.stroke();
        cx.setLineDash([]);
        art.rounded(cx, bx, by, bw, bh, 22, '#dff0ff', attended ? '#ff8d20' : '#2f6fb0', attended ? 6 : 4);
        art.poly(cx, [[pos.x - 10, by + bh - 2], [pos.x + 10, by + bh - 2], [pos.x, by + bh + 12]], '#dff0ff');
        art.phone(cx, bx + bw * 0.2, by + bh * 0.5, bh * 0.72);
        art.textAt(cx, '?', bx + bw * 0.47, by + bh * 0.74, bh * 0.72, '#2f6fb0', 1000);
        art.topicIcon(cx, spec.question.topic, bx + bw * 0.76, by + bh * 0.5, bh * 0.56);
      } else {
        art.rounded(cx, bx, by, bw, bh, 8, '#fff9e9', attended || isSelected ? '#ff8d20' : '#6d4b42', attended || isSelected ? 6 : 3);
        orderIcon(spec, bx + bw / 2 + (big ? 8 : 0), by + bh / 2 + 2, bh * 0.56);
      }
      art.tag(cx, bx + (big ? 4 : 2), by + 4, big ? 17 : 13, g.id, asking ? '#2f6fb0' : '#30303a');
      const color = fraction < 0.25 ? '#df6254' : fraction < 0.5 ? '#e7b84a' : asking ? '#6fb3ee' : '#a8d46f';
      art.bar(cx, bx, by + bh + (asking ? 14 : 3), bw, big ? 14 : 10, fraction, color);
    }

    // ---- Owner.
    const from = PLACES.owner[state.owner.zone] ?? PLACES.owner.counter;
    let ox = from.x;
    let oy = from.y;
    if (action) {
      let to = PLACES.owner[action.zone] ?? from;
      if (action.kind === 'wipe' && action.claims.tableId !== null) {
        const tableId = action.claims.tableId;
        const area = HIT_AREAS.find((a) => a.target.kind === 'table' && a.target.tableId === tableId);
        if (area) to = { x: area.x + area.w - 34, y: area.y + 58 };
      }
      if (action.phase === 'travelling') {
        const t = 1 - action.ticksLeft / timing.travel;
        ox = lerp(from.x, to.x, t);
        oy = lerp(from.y, to.y, t);
      } else {
        ox = to.x;
        oy = to.y;
      }
    }
    art.owner(cx, ox, oy, 1.25);
    if (action && action.phase === 'working') {
      const total = action.kind === 'wash' ? timing.washPerDish : timing[action.kind];
      // Answering a question is drawn in the questions' blue, not the orange of café work.
      art.bar(cx, ox - 46, oy - 158, 92, 16, 1 - action.ticksLeft / total, action.kind === 'answer' ? '#6fb3ee' : '#ffb03a');
      if (action.kind === 'answer') art.phone(cx, ox + 62, oy - 150, 30);
    }

    // ---- Byte.
    art.byte(cx, PLACES.byte.x, PLACES.byte.y, 0.7, view.byteMood);

    // ---- Target outlines: what can be done now, what is queued, and feedback.
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

    const playing = state.phase !== 'ended';
    for (const area of HIT_AREAS) {
      const t = area.target;
      // What pressing here would do next, if anything.
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
        art.rounded(cx, area.x, area.y, area.w, area.h, 18, '#d9534f22', '#d9534f', 6);
      } else if (flashing === 'press') {
        art.rounded(cx, area.x, area.y, area.w, area.h, 18, '#ffffff40', '#ff8d20', 6);
      } else if (cue === 'drop' || cue === 'pick') {
        art.rounded(cx, area.x + 3, area.y + 3, area.w - 6, area.h - 6, 18, hover ? '#7fd36a40' : '#7fd36a22', '#3f9b3a', 6);
      } else if (cue === 'do') {
        cx.setLineDash(hover ? [] : [14, 10]);
        art.rounded(cx, area.x + 3, area.y + 3, area.w - 6, area.h - 6, 18, hover ? '#ffffff26' : '#ffffff00', '#ff8d20', hover ? 5 : 4);
        cx.setLineDash([]);
      } else if (hover) {
        art.rounded(cx, area.x + 3, area.y + 3, area.w - 6, area.h - 6, 18, '#ffffff00', '#6d4b4288', 3);
      }
      const badge = badges.get(area.id);
      if (badge) {
        art.oval(cx, area.x + area.w - 18, area.y + area.h - 18, 17, 17, badge === '•' ? '#ff8d20' : '#30303a');
        art.textAt(cx, badge, area.x + area.w - 18, area.y + area.h - 9, 24, '#fff', 1000);
      }
    }

    // ---- An item being dragged follows the pointer.
    if (view.drag) {
      art.oval(cx, view.drag.x, view.drag.y + 26, 30, 9, '#00000030');
      if (view.drag.item === 'latte') art.cup(cx, view.drag.x - 4, view.drag.y, 52, true);
      else {
        art.plate(cx, view.drag.x, view.drag.y + 8, 76, false);
        art.croissant(cx, view.drag.x, view.drag.y, 50);
      }
    }

    // ---- Short rising labels: a payment, a tip, a guest lost.
    for (const fx of view.effects) {
      if (fx.until <= view.now) continue;
      const t = (view.now - fx.start) / (fx.until - fx.start);
      cx.globalAlpha = 1 - Math.max(0, t - 0.6) / 0.4;
      const y = fx.y - 40 * t;
      const w = 28 + fx.text.length * 17;
      art.rounded(cx, fx.x - w / 2, y - 26, w, 36, 12, '#29282cee');
      art.textAt(cx, fx.text, fx.x, y, 26, fx.color, 1000);
      cx.globalAlpha = 1;
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
