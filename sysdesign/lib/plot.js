// Plotting helpers built on canvas with a retina-aware surface. These are kept
// deliberately low-level so modules can animate points moving, splitting,
// recoloring — not just redraw static charts.

export class Scale {
  constructor(domain, range) {
    this.d0 = domain[0]; this.d1 = domain[1];
    this.r0 = range[0]; this.r1 = range[1];
  }
  map(v) {
    const t = (v - this.d0) / (this.d1 - this.d0 || 1);
    return this.r0 + t * (this.r1 - this.r0);
  }
  invert(px) {
    const t = (px - this.r0) / (this.r1 - this.r0 || 1);
    return this.d0 + t * (this.d1 - this.d0);
  }
}

// A retina canvas wrapped with a coordinate frame (margins) and scales.
export class Canvas {
  constructor(width, height, { margin = { t: 24, r: 24, b: 40, l: 48 } } = {}) {
    this.el = document.createElement("canvas");
    this.el.className = "plot-canvas";
    this.dpr = window.devicePixelRatio || 1;
    this.margin = margin;
    this.resize(width, height);
    this.ctx = this.el.getContext("2d");
  }
  resize(width, height) {
    this.w = width; this.h = height;
    this.el.width = width * this.dpr;
    this.el.height = height * this.dpr;
    this.el.style.width = width + "px";
    this.el.style.height = height + "px";
    this.iw = width - this.margin.l - this.margin.r;
    this.ih = height - this.margin.t - this.margin.b;
  }
  clear() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
  }
  // pointer event -> canvas pixel coords
  evToPx(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  // Inner plotting box corners in pixels.
  get box() {
    return {
      x0: this.margin.l, y0: this.margin.t,
      x1: this.margin.l + this.iw, y1: this.margin.t + this.ih,
    };
  }
}

export function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  let step;
  if (norm < 1.5) step = 1; else if (norm < 3) step = 2; else if (norm < 7) step = 5; else step = 10;
  step *= mag;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

// Draw clean axes with grid into a Canvas given x/y Scales. theme colors via CSS vars.
export function drawAxes(cv, sx, sy, { xlabel, ylabel, xticks, yticks, grid = true } = {}) {
  const ctx = cv.ctx;
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue("--ink").trim() || "#1c1c22";
  const faint = css.getPropertyValue("--faint").trim() || "#e6e6ee";
  const dim = css.getPropertyValue("--dim").trim() || "#8a8a99";
  const b = cv.box;
  ctx.save();
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.lineWidth = 1;
  const xt = xticks || niceTicks(sx.d0, sx.d1, 5);
  const yt = yticks || niceTicks(sy.d0, sy.d1, 5);
  if (grid) {
    ctx.strokeStyle = faint;
    for (const t of xt) {
      const x = sx.map(t);
      ctx.beginPath(); ctx.moveTo(x, b.y0); ctx.lineTo(x, b.y1); ctx.stroke();
    }
    for (const t of yt) {
      const y = sy.map(t);
      ctx.beginPath(); ctx.moveTo(b.x0, y); ctx.lineTo(b.x1, y); ctx.stroke();
    }
  }
  // axis lines
  ctx.strokeStyle = dim;
  ctx.beginPath(); ctx.moveTo(b.x0, b.y1); ctx.lineTo(b.x1, b.y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x0, b.y1); ctx.stroke();
  // tick labels
  ctx.fillStyle = dim;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const t of xt) ctx.fillText(fmt(t), sx.map(t), b.y1 + 6);
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (const t of yt) ctx.fillText(fmt(t), b.x0 - 6, sy.map(t));
  // axis labels
  ctx.fillStyle = ink;
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  if (xlabel) { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(xlabel, (b.x0 + b.x1) / 2, cv.h - 4); }
  if (ylabel) {
    ctx.save();
    ctx.translate(12, (b.y0 + b.y1) / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(ylabel, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function fmt(v) {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1000 || a < 0.01) return v.toExponential(1);
  return (+v.toFixed(2)).toString();
}

export function dot(ctx, x, y, r, fill, { stroke, alpha = 1 } = {}) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  ctx.globalAlpha = 1;
}

export function line(ctx, pts, { stroke = "#000", width = 2, dash, alpha = 1 } = {}) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = stroke; ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

// Histogram bins from raw values.
export function histogram(values, bins, lo, hi) {
  const counts = new Array(bins).fill(0);
  const w = (hi - lo) / bins;
  for (const v of values) {
    let i = Math.floor((v - lo) / w);
    if (i < 0) i = 0; if (i >= bins) i = bins - 1;
    counts[i]++;
  }
  return counts.map((c, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: c }));
}
