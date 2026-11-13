// @ts-check
/**
 * The DOM parts of the interface: HUD, target buttons, action strip, Byte's
 * caption and the overlay. Every node is created once and then updated in
 * place; nothing interactive is rebuilt during play.
 */
/** @import { SimState } from '../sim/types.js' */
/** @import { HitArea } from '../view/scene.js' */
import { HIT_AREAS, SCENE_HEIGHT, SCENE_WIDTH } from '../view/scene.js';
import { actionName, clockText, describeTarget } from './labels.js';

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
 * @typedef {object} UiHandlers
 * @property {(area: HitArea) => void} onTarget A target button was activated (keyboard or assistive technology).
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
  const pause = element('pause-button', HTMLButtonElement);
  const targets = element('targets', HTMLElement);
  const strip = element('action-strip', HTMLElement);
  const byteText = element('byte-text', HTMLElement);
  const overlay = element('overlay', HTMLElement);
  const overlayTitle = element('overlay-title', HTMLElement);
  const overlayBody = element('overlay-body', HTMLElement);
  const overlayButton = element('overlay-button', HTMLButtonElement);

  // One real button per hit area, laid exactly over it. They give keyboard
  // and assistive-technology access; pointer input goes to the canvas, which
  // applies the near-miss rule, so these ignore the pointer.
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

  return {
    /**
     * @param {SimState} state
     * @param {boolean} force Refresh the slower-changing labels too.
     */
    update(state, force = false) {
      const left = state.timing.shiftLength - state.tick;
      setText(time, state.phase === 'ended' ? 'Closed' : left > 0 ? clockText(left) : 'Closing');
      setText(coins, String(state.economy.wallet));
      setText(happy, String(state.metrics.guests.leftHappy));
      setText(lost, String(state.metrics.guests.leftUnhappy + state.metrics.guests.walkedPast));

      // Action strip: the current action, then the two waiting.
      const action = state.owner.action;
      const entries = [
        action ? { label: actionName(action.kind, action.claims.tableId), hint: 'Now', cancel: 'Cancel' } : null,
        ...state.owner.queue.map((q) => ({ label: actionName(q.kind, q.tableId), hint: 'Next', cancel: 'Remove' })),
      ];
      chips.forEach((chip, slot) => {
        const entry = entries[slot] ?? null;
        if (chip.disabled !== (entry === null)) chip.disabled = entry === null;
        setText(chip, entry ? `${entry.hint}: ${entry.label}  ✕` : slot === 0 ? 'Nothing in hand' : '');
        const label = entry ? `${entry.hint}: ${entry.label}. Press to ${entry.cancel.toLowerCase()}.` : 'Empty';
        if (chip.getAttribute('aria-label') !== label) chip.setAttribute('aria-label', label);
      });

      // Accessible names of the targets change with the state; refresh them
      // five times a second at most.
      if (force || state.tick - lastLabelTick >= 6 || state.tick < lastLabelTick) {
        lastLabelTick = state.tick;
        for (const area of HIT_AREAS) {
          const button = targetButtons.get(area.id);
          if (!button) continue;
          const label = `${describeTarget(state, area.target)} Key ${area.key}.`;
          if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
        }
      }
    },

    /** @param {string} text */
    say(text) {
      setText(byteText, text);
    },

    /** @param {'intro' | 'playing' | 'paused' | 'ended'} phase */
    setPhase(phase) {
      app.dataset.phase = phase;
      setText(pause, phase === 'paused' ? 'Resume' : 'Pause');
      pause.disabled = phase === 'intro' || phase === 'ended';
      const playing = phase === 'playing';
      for (const button of targetButtons.values()) button.disabled = !playing;
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
