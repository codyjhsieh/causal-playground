// Headless smoke test: shim just enough DOM + canvas to import every module,
// call mount() with a fake root, run a handful of animation frames (so draw code
// executes), then run the returned cleanup. Catches runtime errors that
// `node --check` (syntax only) cannot. Not a visual test — a "does it crash" test.

// ---- minimal DOM ----
const noop = () => {};
const rafQueue = [];
let nodeId = 0;

function makeEl(tag, ns) {
  const el = {
    tag, ns, nodeId: ++nodeId,
    children: [], attributes: {}, style: {}, dataset: {},
    _class: "",
    textContent: "", innerHTML: "",
    parentNode: null,
    classList: {
      _set: new Set(),
      add(...c) { c.forEach((x) => this._set.add(x)); },
      remove(...c) { c.forEach((x) => this._set.delete(x)); },
      toggle(c, force) { const has = this._set.has(c); const on = force == null ? !has : force; on ? this._set.add(c) : this._set.delete(c); return on; },
      contains(c) { return this._set.has(c); },
    },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    removeAttribute(k) { delete this.attributes[k]; },
    setAttributeNS(_n, k, v) { this.attributes[k] = v; },
    appendChild(c) { if (c) { c.parentNode = this; this.children.push(c); } return c; },
    append(...cs) { cs.forEach((c) => { if (c == null) return; if (typeof c === "string" || typeof c === "number") return; this.appendChild(c); }); },
    prepend(...cs) { cs.reverse().forEach((c) => { if (c == null || typeof c === "string" || typeof c === "number") return; c.parentNode = this; this.children.unshift(c); }); },
    replaceChildren(...cs) { this.children = []; this.append(...cs); },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    insertBefore(c) { return this.appendChild(c); },
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    setPointerCapture: noop, releasePointerCapture: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 }),
    querySelector: () => makeEl("div"),
    querySelectorAll: () => [],
    closest: () => null,
    focus: noop, blur: noop, scrollIntoView: noop, remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    cloneNode: () => makeEl(tag, ns),
    get firstChild() { return this.children[0] || null; },
    get offsetWidth() { return 600; },
    get clientWidth() { return 600; },
  };
  Object.defineProperty(el, "className", { get() { return this._class; }, set(v) { this._class = v; } });
  if (tag === "canvas") {
    el.width = 600; el.height = 400;
    el.getContext = () => new CanvasRenderingContext2D();
  }
  if (ns === "http://www.w3.org/2000/svg") {
    el.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) });
    el.getScreenCTM = () => ({ inverse: () => ({}) });
  }
  return el;
}

// ---- fake canvas 2D context with prototype color accessors (so canvaspatch can wrap them) ----
class CanvasRenderingContext2D {
  constructor() {
    this._fillStyle = "#000"; this._strokeStyle = "#000"; this._font = "10px sans-serif";
    this.lineWidth = 1; this.globalAlpha = 1; this.textAlign = "left"; this.textBaseline = "alphabetic";
    this.lineCap = "butt"; this.lineJoin = "miter"; this.shadowBlur = 0; this.shadowColor = "#000";
    this.globalCompositeOperation = "source-over"; this.miterLimit = 10; this.lineDashOffset = 0;
  }
  // methods
  clearRect() {} setTransform() {} resetTransform() {} save() {} restore() {}
  beginPath() {} closePath() {} moveTo() {} lineTo() {} arc() {} arcTo() {} ellipse() {}
  rect() {} roundRect() {} fill() {} stroke() {} clip() {} fillRect() {} strokeRect() {}
  bezierCurveTo() {} quadraticCurveTo() {} setLineDash() {} getLineDash() { return []; }
  translate() {} rotate() {} scale() {} transform() {} fillText() {} strokeText() {}
  measureText(t) { return { width: (t ? t.length : 0) * 6 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  drawImage() {} putImageData() {} getImageData() { return { data: [] }; }
  isPointInPath() { return false; }
}
Object.defineProperties(CanvasRenderingContext2D.prototype, {
  fillStyle: { configurable: true, get() { return this._fillStyle; }, set(v) { this._fillStyle = v; } },
  strokeStyle: { configurable: true, get() { return this._strokeStyle; }, set(v) { this._strokeStyle = v; } },
  font: { configurable: true, get() { return this._font; }, set(v) { this._font = v; } },
});

const PALETTE = {
  "--bg": "#0f1014", "--surface": "#1d1f27", "--surface2": "#23262f", "--ink": "#f2f3f7",
  "--dim": "#9aa0b0", "--line": "#2f323d", "--faint": "#2a2d37", "--accent": "#7c6cff",
  "--accent2": "#36d6c3", "--treat": "#ff8a4c", "--ctrl": "#4cc2ff", "--pos": "#4cd0a0",
  "--neg": "#ff6b8a", "--gold": "#ffce5c",
};

const documentEl = makeEl("html");
global.CanvasRenderingContext2D = CanvasRenderingContext2D;
global.document = {
  documentElement: documentEl,
  createElement: (t) => makeEl(t),
  createElementNS: (ns, t) => makeEl(t, ns),
  createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  getElementById: () => makeEl("div"),
  body: makeEl("body"),
  addEventListener: noop, removeEventListener: noop,
};
global.window = global;
global.devicePixelRatio = 2;
global.getComputedStyle = () => ({ getPropertyValue: (n) => PALETTE[n] || "#888888" });
global.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
global.cancelAnimationFrame = noop;
global.performance = { now: () => Date.now() };
global.location = { hash: "", replaceState: noop };

function drainFrames(n) {
  let t = 1000;
  for (let i = 0; i < n; i++) {
    const batch = rafQueue.splice(0, rafQueue.length);
    t += 16;
    for (const cb of batch) cb(t);
  }
}

const MODULES = [
  "ladder", "simpson", "two-worlds", "confounding", "dsep", "backdoor",
  "randomization", "adjustment", "propensity", "iv", "rdd", "did", "scm",
  // Causal ML & Neural Nets
  "notears", "cfr", "dml",
  // Causal Reinforcement Learning
  "bandits", "ope", "credit",
  // Frontier 2021-2026
  "crl", "corr2cause", "pfn",
  // Mastery layer (advanced)
  "frontdoor", "docalc", "bounds", "aipw", "sensitivity", "metalearners", "policy",
  "gmethods", "mediation", "interference", "synth", "staggered", "pcalg",
  "badcontrols", "ghostgames", "capstone",
];

let failures = 0;
for (const id of MODULES) {
  try {
    const mod = await import(`../modules/${id}.js`);
    if (typeof mod.mount !== "function") throw new Error("no mount() export");
    const root = makeEl("div");
    const cleanup = mod.mount(root);
    drainFrames(6); // execute draw loops a few times
    if (typeof cleanup === "function") cleanup();
    drainFrames(1);
    console.log(`  ok   ${id}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${id}: ${e && e.message}`);
    if (process.env.VERBOSE) console.log((e && e.stack) || e);
  }
}
console.log(failures ? `\n${failures} module(s) failed` : `\nAll ${MODULES.length} modules mounted & ran cleanly`);
process.exit(failures ? 1 : 0);
