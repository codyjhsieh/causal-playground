// Semantic Caching — the similarity-threshold trade-off, drawn as the precision/
// recall picture it really is. Two distributions of nearest-neighbor similarity:
// paraphrases of cached questions (should hit) vs different-but-similar questions
// (must NOT hit). The threshold line sweeps between them. Loosen it → more hits &
// savings but you start serving confident answers to the wrong question.

import { h, clear } from "../lib/dom.js";
import { lessonLayout, panelSection, slider, readout, challenge } from "../lib/ui.js";
import { Canvas } from "../lib/plot.js";

const erf = (x) => {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
};
const cdf = (x, mu, sig) => 0.5 * (1 + erf((x - mu) / (sig * Math.SQRT2)));
const pdf = (x, mu, sig) => Math.exp(-0.5 * ((x - mu) / sig) ** 2) / (sig * Math.sqrt(2 * Math.PI));
const pct = (v) => (v * 100).toFixed(1) + "%";

// per-query economics (order-of-magnitude representative)
const LLM_COST = 0.006;    // $ per full LLM answer
const EMB_COST = 0.00002;  // $ per embed + vector lookup
const HIT_MS = 35, MISS_MS = 1500;

export function mount(container) {
  const { root, stage, panel, caption } = lessonLayout({ title: "Semantic Caching", idea: "" });
  container.appendChild(root);

  const state = { thr: 0.85, dup: 0.45, quality: 0.6 };

  // distribution params from embedding quality: higher quality → better separation
  function params() {
    const q = state.quality;
    return {
      muTrue: 0.80 + 0.15 * q,
      muFalse: 0.80 - 0.18 * q,
      sig: 0.10 - 0.045 * q,
      trueShare: state.dup,
      falseShare: (1 - state.dup) * 0.4,
      novelShare: (1 - state.dup) * 0.6,
    };
  }

  function metrics() {
    const p = params();
    const pHitTrue = 1 - cdf(state.thr, p.muTrue, p.sig);
    const pHitFalse = 1 - cdf(state.thr, p.muFalse, p.sig);
    const correctHit = p.trueShare * pHitTrue;
    const wrongHit = p.falseShare * pHitFalse;      // served wrong cached answer
    const hitRate = correctHit + wrongHit;
    const missRate = 1 - hitRate;
    const costPerQ = EMB_COST + missRate * LLM_COST;
    const saved = (LLM_COST - costPerQ) / LLM_COST;
    const avgMs = hitRate * HIT_MS + missRate * MISS_MS;
    return { ...p, correctHit, wrongHit, hitRate, missRate, costPerQ, saved, avgMs };
  }

  // ---------- stage: distributions + threshold ----------
  let cv, W = 640, H = 260;
  const canvasHost = h("div", { style: { width: "100%" } });
  stage.appendChild(canvasHost);
  const legend = h("div", { style: { display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "10px", fontSize: "12px" } }, [
    swatch("var(--pos)", "paraphrase — should hit"),
    swatch("var(--neg)", "different question — must NOT hit"),
    swatch("var(--ink)", "threshold (drag me)"),
  ]);
  stage.appendChild(legend);

  function buildCanvas() {
    W = Math.max(320, Math.min(680, (stage.clientWidth || 640) - 34));
    clear(canvasHost);
    cv = new Canvas(W, H, { margin: { t: 16, r: 14, b: 34, l: 14 } });
    canvasHost.appendChild(cv.el);
    const setFromEvent = (e) => {
      const { x } = cv.evToPx(e);
      const t = 0.5 + ((x - cv.box.x0) / (cv.box.x1 - cv.box.x0)) * 0.5;
      state.thr = Math.max(0.5, Math.min(0.995, t));
      thrSlider.setValue(+state.thr.toFixed(3));
      render();
    };
    let dragging = false;
    cv.el.addEventListener("pointerdown", (e) => { dragging = true; cv.el.setPointerCapture(e.pointerId); setFromEvent(e); });
    cv.el.addEventListener("pointermove", (e) => { if (dragging) setFromEvent(e); });
    cv.el.addEventListener("pointerup", () => { dragging = false; });
    cv.el.style.cursor = "ew-resize";
  }

  function xToPx(x) { return cv.box.x0 + ((x - 0.5) / 0.5) * (cv.box.x1 - cv.box.x0); }

  function drawDist(m) {
    const ctx = cv.ctx; cv.clear();
    const b = cv.box;
    const N = 220;
    const xs = [], yTrue = [], yFalse = [];
    let ymax = 1e-6;
    for (let i = 0; i <= N; i++) {
      const x = 0.5 + (i / N) * 0.5;
      const yt = pdf(x, m.muTrue, m.sig) * m.trueShare;
      const yf = pdf(x, m.muFalse, m.sig) * m.falseShare;
      xs.push(x); yTrue.push(yt); yFalse.push(yf);
      ymax = Math.max(ymax, yt, yf);
    }
    const yToPx = (y) => b.y1 - (y / ymax) * (b.y1 - b.y0);

    // axis
    ctx.strokeStyle = "var(--dim)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(b.x0, b.y1); ctx.lineTo(b.x1, b.y1); ctx.stroke();
    ctx.fillStyle = "var(--dim)"; ctx.font = "11px " + "ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const t of [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) ctx.fillText(t.toFixed(1), xToPx(t), b.y1 + 6);
    ctx.fillText("nearest-neighbor cosine similarity →", (b.x0 + b.x1) / 2, b.y1 + 20);

    const thrX = xToPx(state.thr);

    // filled curves; the part right of threshold is "served from cache"
    const fillCurve = (ys, colorHit, colorMiss) => {
      // miss side (left of threshold) — faint
      ctx.beginPath(); ctx.moveTo(b.x0, b.y1);
      for (let i = 0; i <= N; i++) ctx.lineTo(xToPx(xs[i]), yToPx(ys[i]));
      ctx.lineTo(b.x1, b.y1); ctx.closePath();
      ctx.save(); ctx.beginPath(); ctx.rect(b.x0, b.y0, thrX - b.x0, b.y1 - b.y0); ctx.clip();
      ctx.globalAlpha = 0.14; ctx.fillStyle = colorMiss; ctx.fill(); ctx.restore();
      // hit side (right of threshold) — solid
      ctx.beginPath(); ctx.moveTo(b.x0, b.y1);
      for (let i = 0; i <= N; i++) ctx.lineTo(xToPx(xs[i]), yToPx(ys[i]));
      ctx.lineTo(b.x1, b.y1); ctx.closePath();
      ctx.save(); ctx.beginPath(); ctx.rect(thrX, b.y0, b.x1 - thrX, b.y1 - b.y0); ctx.clip();
      ctx.globalAlpha = 0.42; ctx.fillStyle = colorHit; ctx.fill(); ctx.restore();
    };
    fillCurve(yFalse, "var(--neg)", "var(--neg)");
    fillCurve(yTrue, "var(--pos)", "var(--pos)");

    // outlines
    const stroke = (ys, color) => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const px = xToPx(xs[i]), py = yToPx(ys[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    };
    stroke(yFalse, "var(--neg)"); stroke(yTrue, "var(--pos)");

    // threshold line
    ctx.strokeStyle = "var(--ink)"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(thrX, b.y0 - 4); ctx.lineTo(thrX, b.y1); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "var(--ink)"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.font = "600 11px ui-monospace, monospace";
    ctx.fillText("τ = " + state.thr.toFixed(2), thrX, b.y0 + 2);

    // region labels (only if there's room right of the threshold)
    if (b.x1 - thrX > 84) {
      ctx.font = "10px ui-monospace, monospace"; ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillStyle = "var(--pos)"; ctx.fillText("✓ hits", thrX + 6, b.y0 + 26);
      ctx.fillStyle = "var(--neg)"; ctx.fillText("✗ wrong", thrX + 6, b.y0 + 40);
    }
  }

  function swatch(color, label) {
    return h("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--dim)" } }, [
      h("span", { style: { width: "12px", height: "12px", borderRadius: "3px", background: color, display: "inline-block" } }),
      label,
    ]);
  }

  // ---------- panel ----------
  const rHit = readout({ label: "Cache hit rate", value: "—", accent: "var(--accent)" });
  const rWrong = readout({ label: "Wrong answers", value: "—", accent: "var(--neg)" });
  const rSaved = readout({ label: "LLM cost saved", value: "—", accent: "var(--pos)" });
  const rLat = readout({ label: "Avg latency", value: "—" });
  const statGrid = h("div", { class: "stat-row" }, [
    h("div", { class: "stat" }, [rHit]),
    h("div", { class: "stat" }, [rWrong]),
    h("div", { class: "stat" }, [rSaved]),
    h("div", { class: "stat" }, [rLat]),
  ]);

  const thrSlider = slider({
    label: "Similarity threshold τ", min: 0.5, max: 0.995, step: 0.005, value: state.thr,
    fmt: (v) => v.toFixed(2), hint: "“close enough”",
    onInput: (v) => { state.thr = v; render(); },
  });
  const dupSlider = slider({
    label: "Duplication in traffic", min: 0.05, max: 0.9, step: 0.01, value: state.dup,
    fmt: pct, hint: "how many repeats",
    onInput: (v) => { state.dup = v; render(); },
  });
  const qualSlider = slider({
    label: "Embedding quality", min: 0, max: 1, step: 0.01, value: state.quality,
    fmt: (v) => (v < 0.34 ? "poor" : v < 0.67 ? "ok" : "good"), hint: "class separation",
    onInput: (v) => { state.quality = v; render(); },
  });

  const chal = challenge({ goal: "Hit rate ≥ 55% while wrong answers stay < 2%." });

  panel.append(
    panelSection("Scoreboard", [statGrid, chal]),
    panelSection("The dial", [thrSlider]),
    panelSection("The world you're in", [dupSlider, qualSlider]),
  );

  // ---------- render ----------
  function render() {
    const m = metrics();
    drawDist(m);
    rHit.set(pct(m.hitRate), pct(m.correctHit) + " correct");
    rWrong.set(pct(m.wrongHit), m.wrongHit > 0.02 ? "too risky" : "acceptable");
    rSaved.set(pct(m.saved), "$" + m.costPerQ.toFixed(4) + "/q");
    rLat.set(Math.round(m.avgMs) + " ms", "hit " + HIT_MS + " · miss " + MISS_MS);
    [rHit, rWrong, rSaved].forEach((r) => r.flash && r.flash());

    const solved = m.hitRate >= 0.55 && m.wrongHit < 0.02;
    chal.setState(solved, solved
      ? `Nice — ${pct(m.hitRate)} served from cache, only ${pct(m.wrongHit)} wrong. Good embeddings let you set τ in the gap between the two humps.`
      : m.wrongHit >= 0.02
        ? `Wrong answers at ${pct(m.wrongHit)} — τ is low enough to catch different questions. Raise τ, or improve embedding quality to separate the humps.`
        : `Only ${pct(m.hitRate)} hits — τ is strict. Lower it, add duplication, or improve embeddings so more paraphrases clear the bar safely.`);

    let cap;
    if (m.quality < 0.34)
      cap = `With <strong>poor embeddings</strong> the two humps overlap, so <em>no</em> threshold cleanly separates “same question” from “different question.” This is the real lesson: a semantic cache is only as good as its embedding model — tuning τ can't fix bad geometry.`;
    else if (state.thr < m.muFalse + m.sig)
      cap = `τ sits inside the <span style="color:var(--neg)">red</span> hump: you're serving cached answers to <strong>different questions</strong> (${pct(m.wrongHit)} wrong). Cheap, fast, and confidently wrong — the failure mode interviewers probe for.`;
    else if (state.thr > m.muTrue + m.sig)
      cap = `τ is past the <span style="color:var(--pos)">green</span> hump: almost nothing hits, so you've paid for embeddings and a vector store to save <strong>${pct(m.saved)}</strong>. A too-strict cache is just overhead.`;
    else
      cap = `τ is in the gap between the humps — the sweet spot. You catch <strong>${pct(m.hitRate)}</strong> of traffic, cut cost by <strong>${pct(m.saved)}</strong>, and keep wrong answers at ${pct(m.wrongHit)}. Note the ceiling: you can never cache more than the <strong>${pct(state.dup)}</strong> of traffic that's actually repeated.`;
    caption.innerHTML = cap;
  }

  buildCanvas();
  render();
  const onResize = () => { buildCanvas(); render(); };
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}
