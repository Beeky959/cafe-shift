// @ts-check
/**
 * Drawing helpers. The shape helpers, Byte, the guest and the plant are
 * ported from the prototype in legacy/ (lines 105-112) with the canvas
 * context passed in. Icons are drawn shapes, not emoji, so they look the same
 * on every device.
 */

/** @typedef {CanvasRenderingContext2D} Ctx */

/**
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 * @param {string | CanvasGradient} fill
 * @param {string | null} [stroke]
 * @param {number} [sw]
 */
export function rounded(cx, x, y, w, h, r, fill, stroke = null, sw = 1) {
  cx.beginPath();
  cx.roundRect(x, y, w, h, r);
  cx.fillStyle = fill;
  cx.fill();
  if (stroke) {
    cx.strokeStyle = stroke;
    cx.lineWidth = sw;
    cx.stroke();
  }
}

/**
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} rx
 * @param {number} ry
 * @param {string} fill
 */
export function oval(cx, x, y, rx, ry, fill) {
  cx.fillStyle = fill;
  cx.beginPath();
  cx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  cx.fill();
}

/**
 * @param {Ctx} cx
 * @param {[number, number][]} points
 * @param {string} fill
 */
export function poly(cx, points, fill) {
  cx.fillStyle = fill;
  cx.beginPath();
  points.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y)));
  cx.closePath();
  cx.fill();
}

/**
 * @param {Ctx} cx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} [color]
 * @param {number} [weight]
 * @param {CanvasTextAlign} [align]
 */
export function textAt(cx, text, x, y, size, color = '#35292c', weight = 900, align = 'center') {
  cx.fillStyle = color;
  cx.font = `${weight} ${size}px ui-rounded, system-ui, sans-serif`;
  cx.textAlign = align;
  cx.textBaseline = 'alphabetic';
  cx.fillText(text, x, y);
}

/**
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} [scale]
 */
export function plant(cx, x, y, scale = 1) {
  cx.save();
  cx.translate(x, y);
  cx.scale(scale, scale);
  oval(cx, 0, 9, 29, 10, '#61473836');
  rounded(cx, -14, -15, 28, 29, 5, '#bd784f', '#714b35', 2);
  for (let i = 0; i < 9; i++) {
    const a = (i * Math.PI * 2) / 9;
    const xx = Math.cos(a) * 19;
    const yy = -31 + Math.sin(a) * 16;
    cx.strokeStyle = '#537c4a';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(0, -14);
    cx.lineTo(xx, yy);
    cx.stroke();
    oval(cx, xx, yy, 9, 16, i % 2 ? '#6a9960' : '#8ab57a');
  }
  cx.restore();
}

/**
 * Byte, as in the prototype, standing still. The mood changes only the eyes
 * and the antenna light.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} [scale]
 * @param {'neutral' | 'happy' | 'alert' | 'sad'} [mood]
 */
export function byte(cx, x, y, scale = 1, mood = 'neutral') {
  const glow = mood === 'alert' ? '#ffb03a' : mood === 'sad' ? '#8fb6d6' : '#bbfc58';
  cx.save();
  cx.translate(x, y);
  cx.scale(scale, scale);
  oval(cx, 0, 49, 38, 10, '#423a3850');
  rounded(cx, -29, 6, 59, 44, 17, '#383943', '#171a23', 4);
  rounded(cx, -18, 26, 36, 19, 7, '#222b33');
  textAt(cx, '</>', 0, 39, 12, '#b7fa46', 1000);
  cx.strokeStyle = '#43444b';
  cx.lineWidth = 5;
  cx.beginPath();
  cx.moveTo(-21, 1);
  cx.lineTo(-28, 20);
  cx.moveTo(21, 1);
  cx.lineTo(29, 19);
  cx.stroke();
  rounded(cx, -36, -59, 72, 65, 27, '#eef1ed', '#282c38', 5);
  rounded(cx, -28, -45, 57, 39, 17, '#232d36');
  if (mood === 'happy') {
    cx.strokeStyle = glow;
    cx.lineWidth = 4;
    cx.lineCap = 'round';
    for (const ex of [-12, 13]) {
      cx.beginPath();
      cx.arc(ex, -24, 6, Math.PI, 0);
      cx.stroke();
    }
    cx.lineCap = 'butt';
  } else if (mood === 'alert') {
    oval(cx, -12, -27, 7, 10, glow);
    oval(cx, 13, -27, 7, 10, glow);
  } else if (mood === 'sad') {
    oval(cx, -12, -24, 6, 5, glow);
    oval(cx, 13, -24, 6, 5, glow);
  } else {
    oval(cx, -12, -27, 6, 8, glow);
    oval(cx, 13, -27, 6, 8, glow);
  }
  cx.strokeStyle = '#77858b';
  cx.lineWidth = 4;
  cx.beginPath();
  cx.moveTo(0, -59);
  cx.lineTo(0, -74);
  cx.stroke();
  oval(cx, 0, -77, 7, 7, glow);
  cx.restore();
}

const SKINS = ['#e1a878', '#ac7758', '#f5cb9e', '#846148', '#d7a27c'];
const SHIRTS = ['#698c88', '#b06f76', '#7d79b5', '#d9a34e', '#7ea273', '#e38e6f'];

/**
 * A guest, as in the prototype. `look` picks skin, shirt and hair.
 * @param {Ctx} cx
 * @param {number} x Centre.
 * @param {number} y Feet are about 39 * scale below this.
 * @param {number} look
 * @param {number} [scale]
 * @param {'neutral' | 'worried' | 'happy'} [mood]
 */
export function guest(cx, x, y, look, scale = 1, mood = 'neutral') {
  const skin = SKINS[(look * 7) % SKINS.length];
  const shirt = SHIRTS[look % SHIRTS.length];
  cx.save();
  cx.translate(x, y);
  cx.scale(scale, scale);
  oval(cx, 0, 39, 22, 7, '#44362c35');
  rounded(cx, -18, 3, 36, 34, 12, shirt, '#543c39', 2.5);
  rounded(cx, -13, 18, 26, 21, 8, '#4e5964');
  oval(cx, 0, -19, 19, 21, skin);
  oval(cx, 0, -35, 20, 9, look % 3 === 0 ? '#49352f' : '#624637');
  if (look % 3 === 0) rounded(cx, -21, -34, 42, 8, 5, '#514044');
  oval(cx, -7, -17, 2, 2, '#2d282a');
  oval(cx, 8, -17, 2, 2, '#2d282a');
  cx.strokeStyle = '#75513d';
  cx.lineWidth = 2;
  cx.beginPath();
  if (mood === 'worried') cx.arc(0, -4, 5, Math.PI + 0.3, -0.3);
  else if (mood === 'happy') cx.arc(0, -11, 8, 0.1, Math.PI - 0.1);
  else cx.arc(0, -9, 5, 0.1, Math.PI - 0.1);
  cx.stroke();
  if (mood === 'happy') {
    oval(cx, -12, -11, 4, 2.5, '#e9806e88');
    oval(cx, 12, -11, 4, 2.5, '#e9806e88');
  }
  cx.restore();
}

/**
 * The café owner, from the prototype: seen from the waist up behind the counter.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y Waist line.
 * @param {number} [scale]
 */
export function owner(cx, x, y, scale = 1) {
  cx.save();
  cx.translate(x, y);
  cx.scale(scale, scale);
  rounded(cx, -22, -46, 45, 46, 13, '#e4a75f', '#795137', 3);
  rounded(cx, -15, -34, 32, 34, 8, '#433936');
  oval(cx, 0, -66, 25, 26, '#b7805f');
  poly(cx, [[-26, -85], [-21, -101], [22, -101], [29, -76], [17, -84], [11, -106], [-11, -100]], '#4c3734');
  oval(cx, -8, -68, 2, 3, '#2d2022');
  oval(cx, 8, -68, 2, 3, '#2d2022');
  cx.restore();
}

/**
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} s Size.
 * @param {boolean} [steam]
 */
export function cup(cx, x, y, s, steam = false) {
  rounded(cx, x - s * 0.5, y - s * 0.4, s, s * 0.8, s * 0.18, '#fffaf0', '#6d4b42', Math.max(2, s * 0.08));
  rounded(cx, x - s * 0.36, y - s * 0.26, s * 0.72, s * 0.2, s * 0.08, '#8a5a3c');
  cx.strokeStyle = '#6d4b42';
  cx.lineWidth = Math.max(2, s * 0.09);
  cx.beginPath();
  cx.arc(x + s * 0.55, y, s * 0.22, -Math.PI / 2, Math.PI / 2);
  cx.stroke();
  if (steam) {
    cx.strokeStyle = '#ffffffcc';
    cx.lineWidth = Math.max(2, s * 0.07);
    for (const dx of [-0.2, 0.15]) {
      cx.beginPath();
      cx.moveTo(x + s * dx, y - s * 0.55);
      cx.quadraticCurveTo(x + s * (dx + 0.15), y - s * 0.75, x + s * dx, y - s * 0.95);
      cx.stroke();
    }
  }
}

/**
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} s
 */
export function croissant(cx, x, y, s) {
  oval(cx, x, y, s * 0.55, s * 0.32, '#c98a3c');
  cx.strokeStyle = '#8a5a24';
  cx.lineWidth = Math.max(2, s * 0.07);
  for (const dx of [-0.25, 0, 0.25]) {
    cx.beginPath();
    cx.moveTo(x + s * dx, y - s * 0.28);
    cx.lineTo(x + s * (dx - 0.06), y + s * 0.28);
    cx.stroke();
  }
  oval(cx, x - s * 0.55, y + s * 0.08, s * 0.14, s * 0.12, '#c98a3c');
  oval(cx, x + s * 0.55, y + s * 0.08, s * 0.14, s * 0.12, '#c98a3c');
}

/**
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} s
 * @param {boolean} dirty
 */
export function plate(cx, x, y, s, dirty) {
  oval(cx, x, y, s * 0.5, s * 0.2, dirty ? '#cdbfae' : '#fffaf0');
  cx.strokeStyle = '#6d4b42';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.ellipse(x, y, s * 0.5, s * 0.2, 0, 0, Math.PI * 2);
  cx.stroke();
  if (dirty) {
    oval(cx, x - s * 0.15, y, s * 0.08, s * 0.04, '#8a5a3c');
    oval(cx, x + s * 0.12, y + s * 0.03, s * 0.06, s * 0.03, '#8a5a3c');
  }
}

/**
 * A small picture for what a guest is asking about.
 * @param {Ctx} cx
 * @param {string} topic
 * @param {number} x
 * @param {number} y
 * @param {number} s
 */
export function topicIcon(cx, topic, x, y, s) {
  const ink = '#5b3a1e';
  cx.strokeStyle = ink;
  cx.fillStyle = ink;
  cx.lineWidth = Math.max(1, s * 0.1);
  cx.lineCap = 'round';
  switch (topic) {
    case 'wifi':
      for (const r of [0.2, 0.4, 0.6]) {
        cx.beginPath();
        cx.arc(x, y + s * 0.3, s * r, -Math.PI * 0.8, -Math.PI * 0.2);
        cx.stroke();
      }
      oval(cx, x, y + s * 0.3, s * 0.07, s * 0.07, ink);
      break;
    case 'menu':
      rounded(cx, x - s * 0.35, y - s * 0.45, s * 0.7, s * 0.9, s * 0.08, '#fffaf0', ink, cx.lineWidth);
      for (const dy of [-0.2, 0, 0.2]) {
        cx.beginPath();
        cx.moveTo(x - s * 0.2, y + s * dy);
        cx.lineTo(x + s * 0.2, y + s * dy);
        cx.stroke();
      }
      break;
    case 'instagram':
      rounded(cx, x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.84, s * 0.2, '#fffaf0', ink, cx.lineWidth);
      cx.beginPath();
      cx.arc(x, y, s * 0.18, 0, Math.PI * 2);
      cx.stroke();
      oval(cx, x + s * 0.24, y - s * 0.24, s * 0.05, s * 0.05, ink);
      break;
    case 'review': {
      cx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.22 : s * 0.5;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        cx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      cx.closePath();
      cx.fillStyle = '#f2b532';
      cx.fill();
      cx.stroke();
      break;
    }
    case 'website':
      cx.beginPath();
      cx.arc(x, y, s * 0.45, 0, Math.PI * 2);
      cx.stroke();
      cx.beginPath();
      cx.ellipse(x, y, s * 0.2, s * 0.45, 0, 0, Math.PI * 2);
      cx.moveTo(x - s * 0.45, y);
      cx.lineTo(x + s * 0.45, y);
      cx.stroke();
      break;
    default:
      textAt(cx, 'WC', x, y + s * 0.25, s * 0.7, ink, 1000);
  }
  cx.lineCap = 'butt';
}

/**
 * A phone, held up: the sign of a question about the café online.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} s
 */
export function phone(cx, x, y, s) {
  rounded(cx, x - s * 0.28, y - s * 0.5, s * 0.56, s, s * 0.12, '#24303c', '#12181f', Math.max(2, s * 0.06));
  rounded(cx, x - s * 0.2, y - s * 0.38, s * 0.4, s * 0.66, s * 0.05, '#9fd6ff');
  oval(cx, x, y + s * 0.39, s * 0.05, s * 0.05, '#9fd6ff');
}

/**
 * A small numbered tag, matching a ticket.
 * @param {Ctx} cx
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {number | string} label
 * @param {string} [fill]
 */
export function tag(cx, x, y, r, label, fill = '#30303a') {
  oval(cx, x, y, r, r, fill);
  cx.strokeStyle = '#fff';
  cx.lineWidth = 3;
  cx.beginPath();
  cx.arc(x, y, r, 0, Math.PI * 2);
  cx.stroke();
  textAt(cx, String(label), x, y + r * 0.38, r * 1.15, '#fff', 1000);
}

/**
 * @param {Ctx} cx
 * @param {number} x Left.
 * @param {number} y Top.
 * @param {number} w
 * @param {number} h
 * @param {number} fraction 0-1.
 * @param {string} color
 */
export function bar(cx, x, y, w, h, fraction, color) {
  rounded(cx, x, y, w, h, h / 2, '#3a2c2ccc');
  const inner = Math.max(0, Math.min(1, fraction)) * (w - 4);
  if (inner > 0) {
    // Gradient fill for a richer look
    const grad = cx.createLinearGradient(x + 2, y + 2, x + 2, y + h - 2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, color + 'cc');
    rounded(cx, x + 2, y + 2, inner, h - 4, (h - 4) / 2, grad);
    // Subtle top highlight
    cx.save();
    cx.globalAlpha = 0.2;
    cx.fillStyle = '#fff';
    cx.beginPath();
    cx.roundRect(x + 3, y + 2, Math.max(0, inner - 2), (h - 4) * 0.4, [(h - 4) / 2, (h - 4) / 2, 0, 0]);
    cx.fill();
    cx.restore();
  }
}
