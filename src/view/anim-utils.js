// @ts-check
/**
 * Animation utility functions: easing curves, multi-phase timelines,
 * and secondary-motion helpers. These provide the building blocks for
 * animation that feels alive — anticipation, follow-through, overshoot,
 * arcs and overlapping action.
 *
 * All functions are pure and stateless; animation state lives in
 * animator.js alone.
 */

// ── Easing curves ──────────────────────────────────────────────────

/** Smooth step (Hermite). Good default ease-in-out. @param {number} t 0–1 */
export const smooth = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };

/** Stronger ease-in-out with a slower start and end. @param {number} t */
export const smootherStep = (t) => { const x = clamp01(t); return x * x * x * (x * (x * 6 - 15) + 10); };

/** Ease out: decelerating. @param {number} t */
export const easeOut = (t) => { const x = clamp01(t); return 1 - (1 - x) * (1 - x); };

/** Ease in: accelerating. @param {number} t */
export const easeIn = (t) => { const x = clamp01(t); return x * x; };

/** Ease out with a slight overshoot — good for snappy arrivals. @param {number} t @param {number} [amount] */
export const easeOutBack = (t, amount = 1.4) => {
  const x = clamp01(t);
  const c = amount + 1;
  return 1 + c * Math.pow(x - 1, 3) + amount * Math.pow(x - 1, 2);
};

/** Ease in with a wind-up (anticipation). @param {number} t @param {number} [amount] */
export const easeInBack = (t, amount = 1.4) => {
  const x = clamp01(t);
  const c = amount + 1;
  return c * x * x * x - amount * x * x;
};

/**
 * Anticipation → action → settle. Goes slightly negative (wind-up),
 * overshoots 1, then settles at 1.
 * @param {number} t 0–1
 * @param {number} [anticipation] How far to wind up (0.05–0.2 typical)
 * @param {number} [overshoot] How far to overshoot (0.05–0.15 typical)
 */
export function anticipateSettle(t, anticipation = 0.12, overshoot = 0.08) {
  const x = clamp01(t);
  if (x < 0.2) {
    // Wind-up: go slightly negative
    return -anticipation * Math.sin((x / 0.2) * Math.PI);
  }
  if (x < 0.75) {
    // Main action: 0 → 1+overshoot
    const k = (x - 0.2) / 0.55;
    return smooth(k) * (1 + overshoot);
  }
  // Settle: overshoot → 1
  const k = (x - 0.75) / 0.25;
  return 1 + overshoot * (1 - smooth(k));
}

/** Elastic ease-out — a spring that bounces. @param {number} t */
export const elastic = (t) => {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (Math.PI * 2) / 3) + 1;
};

/**
 * A single bounce: rises to 1, then settles with one bounce.
 * @param {number} t 0–1
 * @param {number} [bounceHeight] 0–1
 */
export function bounce(t, bounceHeight = 0.3) {
  const x = clamp01(t);
  if (x < 0.6) return smooth(x / 0.6);
  const bt = (x - 0.6) / 0.4;
  return 1 - Math.sin(bt * Math.PI) * bounceHeight * (1 - bt);
}

/** @param {number} v */
export const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ── Phase sequencing ───────────────────────────────────────────────

/**
 * Splits a 0–1 progress into named phases, returning which phase is
 * active and how far through it (0–1).
 *
 * Usage:
 *   const { phase, t } = phases(progress, [
 *     ['reach', 0.25],
 *     ['place', 0.35],
 *     ['press', 0.25],
 *     ['settle', 0.15],
 *   ]);
 *
 * @param {number} progress 0–1
 * @param {[string, number][]} spec [name, fraction] pairs; fractions should sum to 1.
 * @returns {{ phase: string, t: number, index: number }}
 */
export function phases(progress, spec) {
  const p = clamp01(progress);
  let start = 0;
  for (let i = 0; i < spec.length; i++) {
    const end = start + spec[i][1];
    if (p <= end || i === spec.length - 1) {
      const local = spec[i][1] > 0 ? clamp01((p - start) / spec[i][1]) : 1;
      return { phase: spec[i][0], t: local, index: i };
    }
    start = end;
  }
  return { phase: spec[0][0], t: 0, index: 0 };
}

// ── Interpolation helpers ──────────────────────────────────────────

/**
 * Lerp between two points.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} t 0–1
 */
export function lerp2(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Quadratic bezier through three points.
 * @param {{ x: number, y: number }} p0
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {number} t 0–1
 */
export function bezier2(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/**
 * Arc interpolation: lerp with a sine-based vertical offset.
 * Great for carried objects that rise and fall naturally.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} t
 * @param {number} height Peak height (negative = upward in screen coords)
 */
export function arc(a, b, t, height) {
  const pos = lerp2(a, b, t);
  pos.y += Math.sin(t * Math.PI) * height;
  return pos;
}

// ── Secondary motion ───────────────────────────────────────────────

/**
 * A lagging spring follower: returns a value that trails `target` with
 * springy overshoot. Call each frame with the current target and dt.
 *
 * Note: this is stateful; for the stateless pose system, use the
 * formula-based secondaryBob / secondarySwing helpers below.
 */
export class SpringFollower {
  /** @param {number} initial @param {number} [stiffness] @param {number} [damping] */
  constructor(initial, stiffness = 120, damping = 12) {
    this.value = initial;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }
  /** @param {number} target @param {number} dt seconds */
  update(target, dt) {
    const force = (target - this.value) * this.stiffness - this.velocity * this.damping;
    this.velocity += force * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}

/**
 * Overlapping bob: a secondary vertical oscillation that lags behind
 * the primary walk cycle, creating the feeling of loose parts following.
 * Pure function — no state needed.
 * @param {number} stride Walk cycle phase.
 * @param {number} walk Walk intensity 0–1.
 * @param {number} delay Phase delay in radians.
 * @param {number} amplitude Pixels.
 */
export function secondaryBob(stride, walk, delay, amplitude) {
  return Math.sin(stride * 2 + delay) * amplitude * walk;
}

/**
 * Overlapping horizontal sway for items following body movement.
 * @param {number} stride
 * @param {number} walk
 * @param {number} delay
 * @param {number} amplitude
 */
export function secondarySwing(stride, walk, delay, amplitude) {
  return Math.sin(stride + delay) * amplitude * walk;
}

/**
 * Weight-shift helper: returns the hip offset for a walk cycle.
 * Hips shift side-to-side and tilt, creating weight transfer.
 * @param {number} stride Walk cycle phase.
 * @param {number} walk Walk intensity 0–1.
 */
export function hipShift(stride, walk) {
  return {
    x: Math.sin(stride) * 3.5 * walk,
    y: -Math.abs(Math.sin(stride)) * 2 * walk, // slight vertical bounce
    tilt: Math.sin(stride) * 0.035 * walk, // hip tilt in radians
  };
}

/**
 * Shoulder counter-rotation: shoulders rotate opposite to hips during walk.
 * @param {number} stride
 * @param {number} walk
 */
export function shoulderCounter(stride, walk) {
  return -Math.sin(stride) * 0.06 * walk;
}
