// The canvas 2D context cannot resolve CSS custom properties: assigning
// ctx.fillStyle = "var(--treat)" is silently ignored and you get black. Our
// whole palette lives in CSS variables, so we patch the context once, globally,
// to resolve var(...) for fillStyle/strokeStyle and to strip var(...) out of the
// font shorthand (falling back to its declared fallback). Import this first.

const rootEl = document.documentElement;
const cache = new Map();

function cssValue(name) {
  if (cache.has(name)) return cache.get(name);
  const v = getComputedStyle(rootEl).getPropertyValue(name).trim();
  cache.set(name, v);
  return v;
}

// Replace every var(--name, fallback) occurrence in a string.
function resolveVars(str) {
  if (str.indexOf("var(") === -1) return str;
  return str.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name, fallback) => {
    const v = cssValue(name);
    return v || (fallback != null ? fallback.trim() : "");
  });
}

function resolveColor(v) {
  return typeof v === "string" ? resolveVars(v) : v; // gradients/patterns pass through
}

export function patchCanvas() {
  if (typeof CanvasRenderingContext2D === "undefined") return;
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.__cssVarPatched) return;
  proto.__cssVarPatched = true;

  for (const prop of ["fillStyle", "strokeStyle"]) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || !desc.set) continue;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(v) { desc.set.call(this, resolveColor(v)); },
    });
  }

  const fontDesc = Object.getOwnPropertyDescriptor(proto, "font");
  if (fontDesc && fontDesc.set) {
    Object.defineProperty(proto, "font", {
      configurable: true,
      enumerable: fontDesc.enumerable,
      get: fontDesc.get,
      set(v) {
        // var() in a font shorthand invalidates the whole assignment; strip it.
        const cleaned = typeof v === "string" ? resolveVars(v) : v;
        fontDesc.set.call(this, cleaned);
      },
    });
  }
}

// Also expose a resolver for non-canvas needs.
export const cssColor = (v) => resolveColor(v);
