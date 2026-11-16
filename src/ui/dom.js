// @ts-check
/**
 * The DOM parts of the interface: HUD, order rail, target buttons, action
 * strip, Byte's caption and the overlay. Every node is created once and then
 * updated in place; nothing interactive is rebuilt during play.
 */
/** @import { SimState } from '../sim/types.js' */
/** @import { HitArea } from '../view/scene.js' */
/** @import { Service, Card } from './service.js' */
import { HIT_AREAS, SCENE_HEIGHT, SCENE_WIDTH } from '../view/scene.js';
import { TICKS_PER_SECOND } from '../sim/index.js';
import { actionName, clockText, describeTarget } from './labels.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Rail places: the three counter spots, then the two places at the door. */
const RAIL_SLOTS = 5;

/**
 * @template {Element} T
 * @param {string} id
 * @param {new () => T} type
 * @returns {T}
 */
export function element(id, type) {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`Missing #${id}`);
  return found;
}

/**
 * Writes text only when it has changed, so the page is not touched every frame.
 * @param {Element} node
 * @param {string} text
 */
function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * @param {HTMLElement} node
 * @param {string} key
 * @param {string} value
 */
function setData(node, key, value) {
  if (node.dataset[key] !== value) node.dataset[key] = value;
}

/**
 * @param {Element} node
 * @param {string} name
 * @param {string} value
 */
function setAttr(node, name, value) {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

/**
 * @typedef {object} UiHandlers
 * @property {(area: HitArea) => void} onTarget A target was activated by keyboard, assistive technology or its card.
 * @property {(slot: number) => void} onChip A chip in the action strip was pressed: 0 is the current action.
 * @property {() => void} onPause
 * @property {() => void} onOverlayButton
 */

/**
 * @param {UiHandlers} handlers
 */
export function createUi(handlers) {
  const app = element('app', HTMLElement);
  const time = element('hud-time', HTMLElement);
  const coins = element('hud-coins', HTMLElement);
  const happy = element('hud-happy', HTMLElement);
  const lost = element('hud-lost', HTMLElement);
  const questions = element('hud-questions', HTMLElement);
  const pause = element('pause-button', HTMLButtonElement);
  const targets = element('targets', HTMLElement);
  const rail = element('rail', HTMLElement);
  const strip = element('action-strip', HTMLElement);
  const caption = element('byte-caption', HTMLElement);
  const byteText = element('byte-text', HTMLElement);
  const overlay = element('overlay', HTMLElement);
  const overlayTitle = element('overlay-title', HTMLElement);
  const overlayBody = element('overlay-body', HTMLElement);
  const overlayButton = element('overlay-button', HTMLButtonElement);

  // One real button per hit area, laid exactly over it. They give keyboard
  // and assistive-technology access; pointer input goes to the canvas, which
  // applies the near-miss rule and dragging, so these ignore the pointer.
  /** @type {Map<string, HTMLButtonElement>} */
  const targetButtons = new Map();
  for (const area of HIT_AREAS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'target';
    button.id = `target-${area.id}`;
    button.dataset.key = area.key;
    button.style.left = `${(area.x / SCENE_WIDTH) * 100}%`;
    button.style.top = `${(area.y / SCENE_HEIGHT) * 100}%`;
    button.style.width = `${(area.w / SCENE_WIDTH) * 100}%`;
    button.style.height = `${(area.h / SCENE_HEIGHT) * 100}%`;
    button.addEventListener('click', () => handlers.onTarget(area));
    targets.append(button);
    targetButtons.set(area.id, button);
  }

  // The order rail: one card per counter spot and door place, in fixed
  // positions. A card for a counter spot does the same as pressing that guest.
  /** @type {{ card: HTMLButtonElement, num: HTMLElement, use: SVGUseElement, title: HTMLElement, status: HTMLElement, fill: HTMLElement, receipt: HTMLElement }[]} */
  const cards = [];
  for (let slot = 0; slot < RAIL_SLOTS; slot++) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.id = `card-${slot}`;
    card.dataset.kind = 'empty';
    const num = document.createElement('span');
    num.className = 'card-num';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'card-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    svg.append(use);
    const title = document.createElement('span');
    title.className = 'card-title';
    const status = document.createElement('span');
    status.className = 'card-status';
    const bar = document.createElement('span');
    bar.className = 'card-bar';
    const fill = document.createElement('i');
    bar.append(fill);
    const receipt = document.createElement('span');
    receipt.className = 'card-receipt';
    card.append(num, svg, title, status, bar, receipt);
    const area = HIT_AREAS.find((a) => a.target.kind === 'spot' && a.target.index === slot);
    if (area) card.addEventListener('click', () => handlers.onTarget(area));
    rail.append(card);
    cards.push({ card, num, use, title, status, fill, receipt });
  }

  /** @type {HTMLButtonElement[]} */
  const chips = [];
  for (let slot = 0; slot < 3; slot++) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.id = `chip-${slot}`;
    chip.disabled = true;
    chip.addEventListener('click', () => handlers.onChip(slot));
    strip.append(chip);
    chips.push(chip);
  }

  pause.addEventListener('click', () => handlers.onPause());
  overlayButton.addEventListener('click', () => handlers.onOverlayButton());

  let lastLabelTick = -1000;
  let lastWallet = 0;
  let lastHappy = 0;
  let lastLost = 0;
  let lastQuestions = 0;
  /** Which guest each rail card showed last frame, to animate a new arrival. */
  const shownOnCard = /** @type {(number | null)[]} */ (Array.from({ length: RAIL_SLOTS }, () => null));
  let playing = false;
  /** @type {{ text: string, until: number }[]} */
  const receipts = Array.from({ length: RAIL_SLOTS }, () => ({ text: '', until: 0 }));

  /**
   * @param {number} slot
   * @param {Card | null} model
   * @param {number} now
   */
  function updateCard(slot, model, now) {
    const c = cards[slot];
    const receipt = receipts[slot].until > now ? receipts[slot].text : '';
    setText(c.receipt, receipt);
    setData(c.card, 'receipt', receipt ? 'yes' : 'no');
    if (!model) {
      setData(c.card, 'kind', 'empty');
      setData(c.card, 'selected', 'no');
      setData(c.card, 'urgent', 'no');
      setText(c.num, '');
      setText(c.title, '');
      setText(c.status, '');
      const disabled = true;
      if (c.card.disabled !== disabled) c.card.disabled = disabled;
      setAttr(c.card, 'aria-label', slot < 3 ? `Counter spot ${slot + 1}: empty` : 'Door: nobody waiting');
      shownOnCard[slot] = null;
      return;
    }
    if (shownOnCard[slot] !== model.guestId) {
      // A new ticket slides in. Restarting the animation needs a reflow.
      c.card.classList.remove('enter');
      void c.card.offsetWidth;
      c.card.classList.add('enter');
    }
    setData(c.card, 'kind', model.kind);
    setData(c.card, 'status', model.status);
    setData(c.card, 'selected', model.selected ? 'yes' : 'no');
    setData(c.card, 'urgent', model.urgent ? 'yes' : 'no');
    setText(c.num, String(model.guestId));
    setAttr(c.use, 'href', `#i-${model.kind === 'question' && model.topic ? model.topic : model.order}`);
    setText(c.title, model.title);
    setText(c.status, model.statusText);
    const width = `${Math.round(Math.max(0, Math.min(1, model.patience)) * 100)}%`;
    if (c.fill.style.width !== width) c.fill.style.width = width;
    const disabled = !playing || slot >= 3;
    if (c.card.disabled !== disabled) c.card.disabled = disabled;
    setAttr(c.card, 'aria-label', model.label);
    shownOnCard[slot] = model.guestId;
  }

  /**
   * Restarts a short CSS animation on a HUD figure when it changes.
   * @param {HTMLElement} node
   * @param {string} name
   */
  function bump(node, name) {
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
  }

  return {
    /**
     * @param {SimState} state
     * @param {Service} service
     * @param {number} now Frame clock, milliseconds.
     * @param {boolean} [force] Refresh the slower-changing labels too.
     */
    update(state, service, now, force = false) {
      const left = state.timing.shiftLength - state.tick;
      setText(time, state.phase === 'ended' ? 'Closed' : left > 0 ? clockText(left) : 'Closing');
      setText(coins, String(state.economy.wallet));
      setText(happy, String(state.metrics.guests.leftHappy));
      const lostCount = state.metrics.guests.leftUnhappy + state.metrics.guests.walkedPast;
      setText(lost, String(lostCount));
      if (state.metrics.guests.leftHappy > lastHappy) bump(happy, 'bump');
      if (lostCount > lastLost) bump(lost, 'shake');
      if (state.metrics.ownerTicks.answer > lastQuestions && state.owner.action?.kind !== 'answer') bump(questions, 'bump');
      lastHappy = state.metrics.guests.leftHappy;
      lastLost = lostCount;
      if (state.owner.action?.kind !== 'answer') lastQuestions = state.metrics.ownerTicks.answer;
      // The last fifteen seconds of the shift.
      setData(time, 'warn', left > 0 && left <= 15 * TICKS_PER_SECOND && state.phase !== 'ended' ? 'yes' : 'no');
      // Owner time spent answering questions: what the interruptions cost.
      setText(questions, `${Math.round(state.metrics.ownerTicks.answer / TICKS_PER_SECOND)}s`);
      if (state.economy.wallet > lastWallet) {
        coins.classList.remove('bump');
        void coins.offsetWidth;
        coins.classList.add('bump');
      }
      lastWallet = state.economy.wallet;

      const models = service.cards(state);
      for (let slot = 0; slot < RAIL_SLOTS; slot++) updateCard(slot, models[slot] ?? null, now);
      setData(app, 'carrying', service.carrying() ?? 'no');

      // Action strip: the current action, then the two waiting.
      const action = state.owner.action;
      const entries = [
        action ? { label: actionName(action.kind, action.claims.tableId), hint: 'Now', cancel: 'Cancel' } : null,
        ...state.owner.queue.map((q) => ({ label: actionName(q.kind, q.tableId), hint: 'Next', cancel: 'Remove' })),
      ];
      // The current action's chip fills as the work is done.
      let progress = 0;
      if (action) {
        const t = state.timing;
        const total = action.phase === 'travelling' ? t.travel : action.kind === 'wash' ? t.washPerDish : t[action.kind];
        progress = action.phase === 'travelling' ? 0 : Math.max(0, Math.min(1, 1 - action.ticksLeft / total));
      }
      const p = `${Math.round(progress * 100)}%`;
      if (chips[0].style.getPropertyValue('--p') !== p) chips[0].style.setProperty('--p', p);
      chips.forEach((chip, slot) => {
        const entry = entries[slot] ?? null;
        if (chip.disabled !== (entry === null)) chip.disabled = entry === null;
        setText(chip, entry ? `${entry.hint}: ${entry.label}  ✕` : slot === 0 ? 'Nothing in hand' : '');
        setAttr(chip, 'aria-label', entry ? `${entry.hint}: ${entry.label}. Press to ${entry.cancel.toLowerCase()}.` : 'Empty');
      });

      // Accessible names of the targets change with the state; refresh them
      // five times a second at most.
      if (force || state.tick - lastLabelTick >= 6 || state.tick < lastLabelTick) {
        lastLabelTick = state.tick;
        for (const area of HIT_AREAS) {
          const button = targetButtons.get(area.id);
          if (!button) continue;
          const t = area.target;
          let text;
          if (t.kind === 'machine' || t.kind === 'case') text = service.describeStation(state, t.kind);
          else if (t.kind === 'spot') text = models[t.index]?.label ?? `Counter spot ${t.index + 1}: empty.`;
          else text = describeTarget(state, t);
          setAttr(button, 'aria-label', `${text} Key ${area.key}.`);
        }
      }
    },

    /**
     * @param {string} text
     * @param {import('./byte.js').Mood | 'notice'} mood
     */
    say(text, mood) {
      setText(byteText, text);
      setData(caption, 'mood', mood);
    },

    /**
     * Shows a completed transaction on a rail card for a moment.
     * @param {number} slot
     * @param {string} text
     * @param {number} until Frame clock, milliseconds.
     */
    receipt(slot, text, until) {
      if (slot >= 0 && slot < RAIL_SLOTS) receipts[slot] = { text, until };
    },

    /** @param {'intro' | 'playing' | 'paused' | 'ended' | 'shop'} phase */
    setPhase(phase) {
      app.dataset.phase = phase;
      setText(pause, phase === 'paused' ? 'Resume' : 'Pause');
      pause.disabled = phase === 'intro' || phase === 'ended' || phase === 'shop';
      playing = phase === 'playing';
      for (const button of targetButtons.values()) button.disabled = !playing;
      if (phase === 'intro' || phase === 'ended' || phase === 'shop') {
        lastWallet = 0;
        lastHappy = 0;
        lastLost = 0;
        lastQuestions = 0;
        for (const r of receipts) r.until = 0;
      }
    },

    /**
     * @param {{ title: string, lines: string[], button: string } | null} content Null hides the overlay.
     */
    showOverlay(content) {
      if (content === null) {
        overlay.hidden = true;
        return;
      }
      setText(overlayTitle, content.title);
      overlayBody.replaceChildren(
        ...content.lines.map((line) => {
          const p = document.createElement('p');
          p.textContent = line;
          return p;
        }),
      );
      setText(overlayButton, content.button);
      overlay.hidden = false;
      overlayButton.focus();
    },

    /** @param {string} key @param {string} value */
    setData(key, value) {
      app.dataset[key] = value;
    },
  };
}
