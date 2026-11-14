// @ts-check
/**
 * TapIt visual components, ready for the TapIt gameplay milestone (M4).
 *
 * These are drawings only. Nothing in the game imports this module yet, and
 * no guest uses a stand: that needs the stand's rules in the simulation,
 * which are deliberately not built. A test checks the game does not import it.
 * See tapit-preview.html to see the components.
 *
 * The real product: a business puts a TapIt NFC/QR stand on its counter;
 * a customer taps it with a phone, or scans the code, and opens the
 * business's own branded page with the links it has set up.
 */
import { cup, oval, poly, rounded, textAt, topicIcon } from './art.js';

/** @typedef {CanvasRenderingContext2D} Ctx */

/** TapIt brand orange. */
export const TAPIT_ORANGE = '#FF7600';
const ORANGE_DARK = '#c75a00';
const INK = '#2b2525';

/**
 * A decorative QR-style pattern: finder squares and a fixed scatter of
 * modules. It is not a scannable code.
 * @param {Ctx} cx
 * @param {number} x Left.
 * @param {number} y Top.
 * @param {number} size
 */
function qrPattern(cx, x, y, size) {
  const n = 17;
  const m = size / n;
  rounded(cx, x - m, y - m, size + 2 * m, size + 2 * m, m, '#ffffff');
  cx.fillStyle = INK;
  let h = 0x2f6b9d1;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const finder = (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
      if (finder) continue;
      h = (Math.imul(h ^ (h >>> 13), 0x5bd1e995) + r * 31 + c) >>> 0;
      if (h % 100 < 46) cx.fillRect(x + c * m, y + r * m, m + 0.3, m + 0.3);
    }
  }
  for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    cx.fillRect(x + fc * m, y + fr * m, 7 * m, 7 * m);
    cx.fillStyle = '#ffffff';
    cx.fillRect(x + (fc + 1) * m, y + (fr + 1) * m, 5 * m, 5 * m);
    cx.fillStyle = INK;
    cx.fillRect(x + (fc + 2) * m, y + (fr + 2) * m, 3 * m, 3 * m);
  }
}

/**
 * The contactless symbol: three arcs.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} s
 * @param {string} color
 */
export function contactless(cx, x, y, s, color) {
  cx.strokeStyle = color;
  cx.lineWidth = s * 0.12;
  cx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const r = s * (0.18 + i * 0.16);
    cx.beginPath();
    cx.arc(x - s * 0.3, y, r, -Math.PI / 3.2, Math.PI / 3.2);
    cx.stroke();
  }
  cx.lineCap = 'butt';
}

/**
 * The TapIt counter stand: an upright orange sign on a weighted base, with
 * the tap area and a code to scan. Origin is the middle of the base, on the
 * counter. About 120 units tall at scale 1.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} scale
 * @param {{ glow?: number, business?: string }} [options] glow 0-1 lights the tap area.
 */
export function drawStand(cx, x, y, scale, options = {}) {
  const glow = options.glow ?? 0;
  cx.save();
  cx.translate(x, y);
  cx.scale(scale, scale);
  oval(cx, 0, 2, 46, 8, '#2a1d1838');
  // Base.
  rounded(cx, -42, -14, 84, 16, 6, '#3a3031', '#1d1718', 3);
  // Upright panel, leaning back slightly.
  poly(cx, [[-34, -12], [34, -12], [30, -118], [-30, -118]], ORANGE_DARK);
  cx.fillStyle = TAPIT_ORANGE;
  cx.beginPath();
  cx.roundRect(-32, -120, 64, 108, 12);
  cx.fill();
  cx.strokeStyle = INK;
  cx.lineWidth = 3;
  cx.stroke();
  // Wordmark.
  textAt(cx, 'tapit', 0, -100, 17, '#ffffff', 1000);
  // Tap area.
  if (glow > 0) {
    oval(cx, 0, -72, 20 + glow * 10, 20 + glow * 10, `rgba(255, 255, 255, ${(0.35 * glow).toFixed(3)})`);
  }
  oval(cx, 0, -72, 18, 18, '#ffffff');
  contactless(cx, 2, -72, 28, TAPIT_ORANGE);
  // Code to scan.
  qrPattern(cx, -14, -48, 28);
  textAt(cx, 'TAP OR SCAN', 0, -9, 7, '#ffffff', 900);
  cx.restore();
}

/**
 * A phone, front view. Origin is its centre.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} scale
 * @param {{ tilt?: number, screen?: (cx: Ctx, w: number, h: number) => void }} [options]
 */
export function drawPhone(cx, x, y, scale, options = {}) {
  const w = 62;
  const h = 124;
  cx.save();
  cx.translate(x, y);
  cx.rotate(options.tilt ?? 0);
  cx.scale(scale, scale);
  rounded(cx, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 14, '#1c2026');
  rounded(cx, -w / 2, -h / 2, w, h, 11, '#eef3f7');
  if (options.screen) {
    cx.save();
    cx.beginPath();
    cx.roundRect(-w / 2, -h / 2, w, h, 11);
    cx.clip();
    cx.translate(-w / 2, -h / 2);
    options.screen(cx, w, h);
    cx.restore();
  }
  rounded(cx, -10, -h / 2 + 4, 20, 5, 3, '#1c2026');
  cx.restore();
}

/**
 * Rings spreading from a tap.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} t 0-1 through the pulse.
 * @param {number} [scale]
 */
export function drawTapPulse(cx, x, y, t, scale = 1) {
  for (let i = 0; i < 3; i++) {
    const k = t - i * 0.18;
    if (k <= 0 || k >= 1) continue;
    cx.strokeStyle = `rgba(255, 118, 0, ${(1 - k).toFixed(3)})`;
    cx.lineWidth = 4 * scale * (1 - k) + 1;
    cx.beginPath();
    cx.arc(x, y, (14 + k * 46) * scale, 0, Math.PI * 2);
    cx.stroke();
  }
}

/** @typedef {'menu' | 'wifi' | 'instagram' | 'website' | 'review'} PageLink */

/** Link labels as a business's page might show them. */
export const PAGE_LINKS = /** @type {readonly { id: PageLink, label: string }[]} */ ([
  { id: 'menu', label: 'Menu' },
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'website', label: 'Website' },
  { id: 'review', label: 'Leave a Google review' },
]);

/**
 * A business's branded mobile page, as a customer would see it after tapping.
 * The business is fictional.
 * @param {Ctx} cx
 * @param {number} w
 * @param {number} h
 * @param {{ business?: string, highlight?: PageLink | null, reveal?: number }} [options]
 *   reveal 0-1 slides the page in; highlight marks the link being opened.
 */
export function drawLandingPage(cx, w, h, options = {}) {
  const reveal = options.reveal ?? 1;
  const name = options.business ?? 'Good Beans Café';
  const off = (1 - reveal) * h * 0.4;
  cx.save();
  cx.globalAlpha = Math.min(1, reveal * 1.5);
  cx.translate(0, off);
  // Header in the business's colours, with a small TapIt mark.
  rounded(cx, 0, 0, w, h * 0.3, 0, '#2c3b33');
  oval(cx, w / 2, h * 0.13, w * 0.13, w * 0.13, '#f6dea2');
  cup(cx, w / 2 - w * 0.01, h * 0.135, w * 0.14, true);
  textAt(cx, name, w / 2, h * 0.255, w * 0.085, '#f6dea2', 1000);
  rounded(cx, 0, h * 0.3, w, h * 0.7, 0, '#fffaf2');
  const rowH = h * 0.1;
  PAGE_LINKS.forEach((link, i) => {
    const y = h * 0.34 + i * (rowH + h * 0.022);
    const on = options.highlight === link.id;
    rounded(cx, w * 0.08, y, w * 0.84, rowH, rowH * 0.4, on ? '#ffe2c4' : '#ffffff', on ? TAPIT_ORANGE : '#e1d6c6', on ? 2 : 1);
    const icon = link.id === 'review' ? 'review' : link.id;
    topicIcon(cx, icon, w * 0.2, y + rowH / 2, rowH * 0.62);
    textAt(cx, link.label.length > 10 ? 'Review us' : link.label, w * 0.32, y + rowH * 0.66, w * 0.08, '#2b2525', 900, 'left');
  });
  textAt(cx, 'powered by tapit', w / 2, h * 0.975, w * 0.06, TAPIT_ORANGE, 900);
  cx.restore();
}

/**
 * One customer tap, as a sequence the M4 milestone can play from the
 * simulation's stand-use timer: the phone comes to the stand, the tap
 * pulses, and the business's page opens.
 * @param {Ctx} cx
 * @param {{ x: number, y: number, scale: number }} stand Where the stand is.
 * @param {number} t 0-1 through the tap.
 * @param {PageLink | null} [link] The link the customer opens.
 */
export function drawTapSequence(cx, stand, t, link = null) {
  const s = stand.scale;
  const tapAt = { x: stand.x, y: stand.y - 72 * s };
  const approach = Math.min(1, t / 0.35);
  const ease = approach * approach * (3 - 2 * approach);
  const pulse = t >= 0.3 && t <= 0.65 ? (t - 0.3) / 0.35 : -1;
  drawStand(cx, stand.x, stand.y, s, { glow: pulse >= 0 ? 1 - pulse : 0 });
  if (pulse >= 0) drawTapPulse(cx, tapAt.x, tapAt.y, pulse, s);
  const from = { x: stand.x + 120 * s, y: stand.y - 10 * s };
  const to = { x: tapAt.x + 30 * s, y: tapAt.y - 6 * s };
  const px = from.x + (to.x - from.x) * ease;
  const py = from.y + (to.y - from.y) * ease;
  const away = t > 0.6 ? Math.min(1, (t - 0.6) / 0.15) : 0;
  const reveal = t > 0.62 ? Math.min(1, (t - 0.62) / 0.3) : 0;
  drawPhone(cx, px + away * 50 * s, py - away * 30 * s, s * (1 + away * 0.25), {
    tilt: -0.25 * (1 - away),
    screen: (c, w, h) => {
      if (reveal > 0) drawLandingPage(c, w, h, { reveal, highlight: t > 0.85 ? link : null });
    },
  });
}
