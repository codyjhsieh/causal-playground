// Animation engine: a shared requestAnimationFrame ticker, easing, springs, a
// lightweight particle system, and a drag helper. This is what makes the
// diagrams feel alive and game-like rather than static.

const tickers = new Set();
let running = false;
let last = 0;

function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0); // clamp to avoid jumps on tab return
  last = t;
  for (const fn of tickers) {
    try {
      fn(dt, t / 1000);
    } catch (e) {
      console.error(e);
      tickers.delete(fn);
    }
  }
  if (tickers.size > 0) {
    requestAnimationFrame(loop);
  } else {
    running = false;
  }
}

// Register a per-frame callback (dt seconds, t seconds). Returns an unsubscribe.
export function onFrame(fn) {
  tickers.add(fn);
  if (!running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }
  return () => tickers.delete(fn);
}

// Easing functions.
export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t * t,
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

// Tween a scalar from->to over duration seconds, calling onUpdate each frame.
// Returns a cancel function. onDone fires at the end.
export function tween({ from = 0, to = 1, duration = 0.6, easing = ease.inOut, onUpdate, onDone }) {
  let elapsed = 0;
  const stop = onFrame((dt) => {
    elapsed += dt;
    const t = Math.min(1, elapsed / duration);
    onUpdate(from + (to - from) * easing(t), t);
    if (t >= 1) {
      stop();
      onDone && onDone();
    }
  });
  return stop;
}

// A critically-ish damped spring scalar — great for draggable, lively values.
export class Spring {
  constructor(value = 0, { stiffness = 120, damping = 18 } = {}) {
    this.value = value;
    this.target = value;
    this.vel = 0;
    this.k = stiffness;
    this.d = damping;
  }
  set(target) { this.target = target; return this; }
  snap(value) { this.value = value; this.target = value; this.vel = 0; return this; }
  step(dt) {
    const f = -this.k * (this.value - this.target) - this.d * this.vel;
    this.vel += f * dt;
    this.value += this.vel * dt;
    return this.value;
  }
  get settled() {
    return Math.abs(this.value - this.target) < 0.001 && Math.abs(this.vel) < 0.001;
  }
}

// Make an SVG/HTML element draggable in user coordinates. `toCoords` maps a
// pointer event to {x,y} in your space; onDrag receives that. Returns cleanup.
export function draggable(el, { onStart, onDrag, onEnd, toCoords } = {}) {
  let dragging = false;
  const map = (e) => (toCoords ? toCoords(e) : { x: e.clientX, y: e.clientY });
  const down = (e) => {
    dragging = true;
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    onStart && onStart(map(e), e);
    e.preventDefault();
  };
  const move = (e) => {
    if (!dragging) return;
    onDrag && onDrag(map(e), e);
  };
  const up = (e) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove("dragging");
    onEnd && onEnd(map(e), e);
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
  };
}

// A generic particle pool for canvas. Particles carry arbitrary fields; the
// caller supplies update+draw. Keeps allocation low.
export class Particles {
  constructor() { this.list = []; }
  spawn(p) { this.list.push(p); return p; }
  update(dt, fn) {
    const keep = [];
    for (const p of this.list) {
      if (fn(p, dt) !== false) keep.push(p);
    }
    this.list = keep;
  }
  draw(ctx, fn) { for (const p of this.list) fn(ctx, p); }
  get count() { return this.list.length; }
  clear() { this.list.length = 0; }
}

// Catmull-Rom-ish point along a quadratic-bezier, used for flowing edge dots.
export function bezierPoint(t, p0, p1, p2) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
