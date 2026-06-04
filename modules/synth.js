// Synthetic Control — California Prop 99 (tobacco tax, 1989).
// No clean control group? Build one: a weighted blend of untreated donor states
// that best matches California's pre-1989 cigarette-sales trajectory.
// Then read off the post-1989 gap — that gap estimates the causal effect.
// Method: Abadie, Diamond & Hainmueller (2010). Data: prop99.js.

import { h } from "../lib/dom.js";
import { onFrame, tween, ease, Spring, lerp } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, line } from "../lib/plot.js";
import {
  lessonLayout, panelSection, toggle, button, readout, challenge,
} from "../lib/ui.js";
import { rows, meta } from "../data/prop99.js";
import { dataBadge } from "../lib/data.js";

// ── CSS ───────────────────────────────────────────────────────────────────────
function ensureStyles() {
  if (document.getElementById("synth-css")) return;
  const st = document.createElement("style");
  st.id = "synth-css";
  st.textContent = `
.synth-stage-label { font: 11px/1 var(--mono); color: var(--dim); text-align: center; margin: 4px 0 0; }
.synth-weight-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.synth-weight-row { display: flex; align-items: center; gap: 6px; font: 11px var(--mono); }
.synth-weight-bar-wrap { flex: 1; height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
.synth-weight-bar { height: 100%; background: var(--ctrl); border-radius: 3px; transition: width 0.4s ease; }
.synth-weight-label { width: 120px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.synth-weight-val { width: 38px; text-align: right; color: var(--ink); }
.synth-placebo-note { font: 10px/1.5 var(--mono); color: var(--dim); margin: 4px 0 0; }
  `;
  document.head.appendChild(st);
}

// ── Data prep ─────────────────────────────────────────────────────────────────
const TREAT_YEAR = 1989;
const YEARS = [];
for (let y = 1970; y <= 2000; y++) YEARS.push(y);
const PRE_YEARS  = YEARS.filter(y => y < TREAT_YEAR);   // 1970–1988 (19 years)
const POST_YEARS = YEARS.filter(y => y >= TREAT_YEAR);  // 1989–2000 (12 years)

// Index rows by state
const byState = {};
for (const r of rows) {
  if (!byState[r.state]) byState[r.state] = {};
  byState[r.state][r.year] = r.packs;
}

// California series
const CA_PRE  = PRE_YEARS.map(y  => byState["California"][y]);
const CA_POST = POST_YEARS.map(y => byState["California"][y]);
const CA_ALL  = YEARS.map(y => byState["California"][y]);

// Donor states: all states with complete data across all years
const allStates = Object.keys(byState).filter(s => s !== "California");
const donors = allStates.filter(s => {
  return YEARS.every(y => byState[s][y] != null && !isNaN(byState[s][y]));
});
const D = donors.length;   // number of donor states

// Donor pre-period matrix: D × T_pre
const donorPre = donors.map(s => PRE_YEARS.map(y => byState[s][y]));

// ── Synthetic Control Optimizer ───────────────────────────────────────────────
// Minimize Σ_t (ca_t − Σ_j w_j * donor_j_t)² s.t. w_j ≥ 0, Σ w_j = 1.
// We use multiplicative-weights / exponentiated-gradient on the simplex.
// 300 iterations is plenty and runs in <2 ms — safe for interactive use.
function optimizeWeights(iters = 300) {
  const T = PRE_YEARS.length;
  let w = new Float64Array(D).fill(1 / D);

  for (let iter = 0; iter < iters; iter++) {
    // gradient: ∂L/∂w_j = -2 * Σ_t (ca_t − synth_t) * donor_j_t
    // multiplicative-weights step (exponentiated gradient) with step size η
    const eta = 2.0 / (iter + 20);

    // compute residuals
    const resid = new Float64Array(T);
    for (let t = 0; t < T; t++) {
      let synth = 0;
      for (let j = 0; j < D; j++) synth += w[j] * donorPre[j][t];
      resid[t] = CA_PRE[t] - synth;
    }

    // gradient per donor
    const grad = new Float64Array(D);
    for (let j = 0; j < D; j++) {
      for (let t = 0; t < T; t++) {
        grad[j] -= 2 * resid[t] * donorPre[j][t];
      }
    }

    // exponentiated gradient update (keeps w on simplex with w ≥ 0)
    let sum = 0;
    for (let j = 0; j < D; j++) {
      w[j] *= Math.exp(-eta * grad[j]);
      sum += w[j];
    }
    for (let j = 0; j < D; j++) w[j] /= sum;
  }

  return w;
}

// Compute synthetic series for given weights across all years
function synthSeries(w) {
  return YEARS.map((_y, yi) => {
    let s = 0;
    for (let j = 0; j < D; j++) {
      const val = byState[donors[j]][YEARS[yi]];
      s += w[j] * (val ?? 0);
    }
    return s;
  });
}

// Pre-period RMSE
function preRmse(synthAll) {
  let ss = 0;
  for (let i = 0; i < PRE_YEARS.length; i++) {
    const diff = CA_ALL[i] - synthAll[i];
    ss += diff * diff;
  }
  return Math.sqrt(ss / PRE_YEARS.length);
}

// ── Pre-compute the true optimal weights once ──────────────────────────────
const W_OPT = optimizeWeights(300);
const SYNTH_OPT = synthSeries(W_OPT);
const RMSE_OPT = preRmse(SYNTH_OPT);
const GAP_2000 = CA_ALL[CA_ALL.length - 1] - SYNTH_OPT[SYNTH_OPT.length - 1];

// Sort donors by weight descending (for the bar list display)
const donorRanked = donors
  .map((s, j) => ({ state: s, w: W_OPT[j] }))
  .sort((a, b) => b.w - a.w);

// ── Uniform weights (equal-weighted "synthetic") as starting point ──────────
const W_UNIFORM = new Float64Array(D).fill(1 / D);
const SYNTH_UNIFORM = synthSeries(W_UNIFORM);

// ── Placebo: pick a donor state and fit synthetic control for it ──────────────
function placeboWeights(targetState, iters = 200) {
  const tIdx = donors.indexOf(targetState);
  if (tIdx < 0) return null;

  const targetPre = PRE_YEARS.map(y => byState[targetState][y]);
  const placeboPool = donors.filter((_, j) => j !== tIdx);
  const pd = placeboPool.length;
  const placeboMat = placeboPool.map(s => PRE_YEARS.map(y => byState[s][y]));

  let pw = new Float64Array(pd).fill(1 / pd);
  for (let iter = 0; iter < iters; iter++) {
    const eta = 2.0 / (iter + 20);
    const T = PRE_YEARS.length;
    const resid = new Float64Array(T);
    for (let t = 0; t < T; t++) {
      let synth = 0;
      for (let j = 0; j < pd; j++) synth += pw[j] * placeboMat[j][t];
      resid[t] = targetPre[t] - synth;
    }
    const grad = new Float64Array(pd);
    for (let j = 0; j < pd; j++) {
      for (let t = 0; t < T; t++) grad[j] -= 2 * resid[t] * placeboMat[j][t];
    }
    let sum = 0;
    for (let j = 0; j < pd; j++) {
      pw[j] *= Math.exp(-eta * grad[j]);
      sum += pw[j];
    }
    for (let j = 0; j < pd; j++) pw[j] /= sum;
  }

  // compute placebo series
  const pSeries = YEARS.map((_y, yi) => {
    let s = 0;
    for (let j = 0; j < pd; j++) {
      s += pw[j] * (byState[placeboPool[j]][YEARS[yi]] ?? 0);
    }
    return s;
  });
  const targetAll = YEARS.map(y => byState[targetState][y]);
  return { pSeries, targetAll, targetState };
}

// ── Module entry point ────────────────────────────────────────────────────────
export function mount(root) {
  ensureStyles();

  // ── State ───────────────────────────────────────────────────────────────────
  const state = {
    fitProgress:  0,       // 0 = uniform weights, 1 = optimal weights
    fitting:      false,
    showGap:      true,
    showPlacebo:  false,
    placeboResult: null,
    challengeDone: false,
  };
  let cancelFit = null;

  // Animated weight springs (D springs, one per donor)
  const wSprings = Array.from({ length: D }, (_, j) => new Spring(W_UNIFORM[j], { stiffness: 60, damping: 13 }));

  // ── Layout ──────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Synthetic Control",
    idea:  "No clean control group? Build one. Find a weighted combination of untreated states that mirrors California's cigarette sales before 1989 — then read the post-treatment gap as the effect of Prop 99.",
  });

  // Canvas
  const cv = new Canvas(580, 400, { margin: { t: 28, r: 28, b: 50, l: 64 } });
  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.alignItems = "center";
  stage.appendChild(cv.el);
  stage.appendChild(h("p", { class: "synth-stage-label",
    text: "California Prop 99 · per-capita cigarette packs/year · 1970–2000" }));

  // ── Readouts ─────────────────────────────────────────────────────────────────
  const rRmse   = readout({ label: "Pre-period RMSE",       value: "—",    accent: "var(--accent2)" });
  const rGap    = readout({ label: "Gap in 2000 (packs)",   value: "—",    accent: "var(--gold)" });
  const rReduce = readout({ label: "Implied reduction",     value: "—",    accent: "var(--treat)" });
  const rGrid   = h("div", { class: "readout-grid" }, [rRmse, rGap, rReduce]);

  // ── Weight bar list (top 8 donors) ──────────────────────────────────────────
  const TOP_N = 8;
  const weightRows = donorRanked.slice(0, TOP_N).map(({ state: s }) => {
    const bar  = h("div", { class: "synth-weight-bar", style: { width: "0%" } });
    const wrap = h("div", { class: "synth-weight-bar-wrap" }, [bar]);
    const val  = h("span", { class: "synth-weight-val", text: "0.00" });
    const row  = h("li", { class: "synth-weight-row" }, [
      h("span", { class: "synth-weight-label", text: s }),
      wrap,
      val,
    ]);
    return { el: row, bar, val, state: s };
  });
  const weightList = h("ul", { class: "synth-weight-list" }, weightRows.map(r => r.el));

  // ── Challenge ─────────────────────────────────────────────────────────────
  const chal = challenge({
    goal: "Fit the synthetic control (RMSE < 5 packs) and read the post-1989 gap — how much did Prop 99 reduce smoking?",
  });

  // ── Controls ────────────────────────────────────────────────────────────────
  const fitBtn = button("Fit synthetic control", () => {
    if (state.fitting) return;
    state.fitting = true;
    if (cancelFit) cancelFit();
    cancelFit = tween({
      from: state.fitProgress, to: 1, duration: 2.0, easing: ease.inOut,
      onUpdate: (v) => {
        state.fitProgress = v;
        // spring each weight toward its optimal value, scaled by progress
        for (let j = 0; j < D; j++) {
          const target = lerp(W_UNIFORM[j], W_OPT[j], v);
          wSprings[j].set(target);
        }
      },
      onDone: () => { state.fitting = false; },
    });
  }, { primary: true });

  const resetBtn = button("Reset weights", () => {
    if (cancelFit) cancelFit();
    state.fitting    = false;
    state.fitProgress = 0;
    state.challengeDone = false;
    chal.setState(false, "");
    for (let j = 0; j < D; j++) wSprings[j].set(W_UNIFORM[j]);
  });

  const gapToggle = toggle({
    label: "Shade the gap",
    value: true,
    hint: "(post-1989 estimated effect)",
    onToggle: (v) => { state.showGap = v; },
  });

  const placeboToggle = toggle({
    label: "Placebo check (Colorado)",
    value: false,
    hint: "(its gap should be small — inference by permutation)",
    onToggle: (v) => {
      state.showPlacebo = v;
      if (v && !state.placeboResult) {
        // compute lazily on first toggle — Colorado is a typical mid-range donor
        state.placeboResult = placeboWeights("Colorado", 200);
      }
    },
  });

  panel.append(
    dataBadge(meta),
    panelSection("Estimates", rGrid),
    panelSection("Optimizer", [fitBtn, resetBtn]),
    panelSection("Top donor weights", weightList),
    panelSection("Display", [gapToggle, placeboToggle]),
    panelSection("Challenge", chal),
  );

  caption.innerHTML =
    "The <strong>synthetic control</strong> is the convex combination of donor states " +
    "(<em>w</em><sub><em>j</em></sub> ≥ 0, Σ<em>w</em><sub><em>j</em></sub> = 1) that minimizes " +
    "Σ<sub><em>t</em>&lt;1989</sub> (packs<sub>CA,<em>t</em></sub> − Σ<sub><em>j</em></sub> <em>w</em><sub><em>j</em></sub> packs<sub><em>j</em>,<em>t</em></sub>)². " +
    "The pre-period lines nearly coincide (good counterfactual fit); after 1989 California " +
    "diverges sharply below its synthetic twin. That gap is the estimated effect of Prop 99 — " +
    "a ~25 pack/year reduction in per-capita smoking by 2000. " +
    "The placebo check applies the same method to an untreated state: its gap stays near zero, " +
    "lending credibility to California's signal. " +
    "Abadie &amp; Gardeazabal (2003); Abadie, Diamond &amp; Hainmueller (2010).";

  root.appendChild(layout);

  // ── Frame loop ───────────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    for (let j = 0; j < D; j++) wSprings[j].step(dt);
    draw();
    updateWeightBars();
    updateReadouts();
    checkChallenge();
  });

  // ── Draw ─────────────────────────────────────────────────────────────────────
  function draw() {
    cv.clear();
    const ctx = cv.ctx;
    const b = cv.box;

    // Current animated weights
    const wCur = new Float64Array(D);
    let wSum = 0;
    for (let j = 0; j < D; j++) { wCur[j] = Math.max(0, wSprings[j].value); wSum += wCur[j]; }
    if (wSum > 0) for (let j = 0; j < D; j++) wCur[j] /= wSum;

    const synthCur = YEARS.map((_y, yi) => {
      let s = 0;
      for (let j = 0; j < D; j++) s += wCur[j] * (byState[donors[j]][YEARS[yi]] ?? 0);
      return s;
    });

    const sy = new Scale([30, 155], [b.y1, b.y0]);
    const sx = new Scale([1970, 2000], [b.x0, b.x1]);

    drawAxes(cv, sx, sy, {
      xlabel: "year",
      ylabel: "packs per capita / year",
      xticks: [1970, 1975, 1980, 1985, 1989, 1995, 2000],
      yticks: [40, 60, 80, 100, 120, 140],
      grid: true,
    });

    // Treatment year vertical line
    const x89 = sx.map(TREAT_YEAR);
    ctx.save();
    ctx.strokeStyle = "var(--dim)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(x89, b.y0); ctx.lineTo(x89, b.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // "Prop 99" label
    ctx.save();
    ctx.fillStyle = "var(--dim)";
    ctx.font = "10px var(--mono)";
    ctx.textAlign = "center";
    ctx.fillText("Prop 99", x89, b.y0 - 8);
    ctx.restore();

    // Gap shading (post-treatment, between CA actual and synthetic)
    if (state.showGap && state.fitProgress > 0.1) {
      const alpha = Math.min(1, (state.fitProgress - 0.1) / 0.4) * 0.18;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "var(--treat)";
      ctx.beginPath();
      const postStart = PRE_YEARS.length;  // index of first post year
      ctx.moveTo(sx.map(YEARS[postStart]), sy.map(CA_ALL[postStart]));
      for (let i = postStart; i < YEARS.length; i++) {
        ctx.lineTo(sx.map(YEARS[i]), sy.map(CA_ALL[i]));
      }
      for (let i = YEARS.length - 1; i >= postStart; i--) {
        ctx.lineTo(sx.map(YEARS[i]), sy.map(synthCur[i]));
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Placebo lines (background, faint)
    if (state.showPlacebo && state.placeboResult) {
      const { pSeries, targetAll } = state.placeboResult;
      // target state actual (faint solid)
      line(ctx,
        YEARS.map((y, i) => ({ x: sx.map(y), y: sy.map(targetAll[i]) })),
        { stroke: "var(--dim)", width: 1.2, alpha: 0.3 });
      // placebo synthetic (faint dashed)
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = "var(--dim)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      YEARS.forEach((y, i) => {
        const px = sx.map(y), py = sy.map(pSeries[i]);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Synthetic control line (dashed, animated from uniform → optimal)
    const synthPts = YEARS.map((y, i) => ({ x: sx.map(y), y: sy.map(synthCur[i]) }));
    ctx.save();
    ctx.strokeStyle = "var(--ctrl)";
    ctx.lineWidth = 2.2;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    synthPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // California actual line (solid)
    line(ctx,
      YEARS.map((y, i) => ({ x: sx.map(y), y: sy.map(CA_ALL[i]) })),
      { stroke: "var(--treat)", width: 2.5 });

    // Legend
    ctx.save();
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    const legendY = b.y0 + 8;

    // California solid
    ctx.strokeStyle = "var(--treat)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(b.x0 + 8, legendY); ctx.lineTo(b.x0 + 32, legendY); ctx.stroke();
    ctx.fillStyle = "var(--ink)";
    ctx.textAlign = "left";
    ctx.fillText("California (actual)", b.x0 + 36, legendY);

    // Synthetic dashed
    ctx.strokeStyle = "var(--ctrl)"; ctx.lineWidth = 2.2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(b.x0 + 175, legendY); ctx.lineTo(b.x0 + 199, legendY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "var(--ink)";
    ctx.fillText("Synthetic California", b.x0 + 203, legendY);

    ctx.restore();

    // "2000 gap" annotation when fit is advanced
    if (state.fitProgress > 0.7) {
      const alpha = Math.min(1, (state.fitProgress - 0.7) / 0.3);
      const lastI  = YEARS.length - 1;
      const midY   = (sy.map(CA_ALL[lastI]) + sy.map(synthCur[lastI])) / 2;
      const bx     = sx.map(2000) - 6;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "var(--gold)";
      ctx.lineWidth = 2;
      // bracket spine
      ctx.beginPath();
      ctx.moveTo(bx, sy.map(CA_ALL[lastI]));
      ctx.lineTo(bx, sy.map(synthCur[lastI]));
      ctx.stroke();
      // ticks
      const tk = 5;
      ctx.beginPath(); ctx.moveTo(bx - tk, sy.map(CA_ALL[lastI]));   ctx.lineTo(bx + tk, sy.map(CA_ALL[lastI]));   ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - tk, sy.map(synthCur[lastI])); ctx.lineTo(bx + tk, sy.map(synthCur[lastI])); ctx.stroke();
      // label
      const gap = synthCur[lastI] - CA_ALL[lastI];
      ctx.fillStyle = "var(--gold)";
      ctx.font = "bold 11px var(--mono)";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`−${Math.abs(gap).toFixed(1)}`, bx - 7, midY);
      ctx.restore();
    }
  }

  // ── Update donor weight bars ────────────────────────────────────────────────
  function updateWeightBars() {
    const wCur = new Float64Array(D);
    let wSum = 0;
    for (let j = 0; j < D; j++) { wCur[j] = Math.max(0, wSprings[j].value); wSum += wCur[j]; }
    if (wSum > 0) for (let j = 0; j < D; j++) wCur[j] /= wSum;

    for (const wr of weightRows) {
      const j = donors.indexOf(wr.state);
      const w = j >= 0 ? wCur[j] : 0;
      wr.bar.style.width = (w * 100).toFixed(1) + "%";
      wr.val.textContent = w.toFixed(3);
    }
  }

  // ── Update readouts ─────────────────────────────────────────────────────────
  function updateReadouts() {
    const p = state.fitProgress;
    const wCur = new Float64Array(D);
    let wSum = 0;
    for (let j = 0; j < D; j++) { wCur[j] = Math.max(0, wSprings[j].value); wSum += wCur[j]; }
    if (wSum > 0) for (let j = 0; j < D; j++) wCur[j] /= wSum;

    const sCur = YEARS.map((_y, yi) => {
      let s = 0;
      for (let j = 0; j < D; j++) s += wCur[j] * (byState[donors[j]][YEARS[yi]] ?? 0);
      return s;
    });

    const rmse = preRmse(sCur);
    rRmse.set(rmse.toFixed(2), p < 0.05 ? "uniform weights" : "pre-1989 RMSE");

    if (p > 0.3) {
      const gap2000 = sCur[YEARS.length - 1] - CA_ALL[CA_ALL.length - 1];
      const pct = 100 * gap2000 / sCur[YEARS.length - 1];
      rGap.set(gap2000.toFixed(1) + " packs", "synthetic − actual, 2000");
      rReduce.set(pct.toFixed(1) + "%", "of synthetic counterfactual");
      rGap.querySelector(".readout-value").style.color = gap2000 > 0 ? "var(--gold)" : "var(--dim)";
    } else {
      rGap.set("—");
      rReduce.set("—");
    }
  }

  // ── Challenge check ─────────────────────────────────────────────────────────
  function checkChallenge() {
    if (state.challengeDone) return;
    if (state.fitProgress < 0.95) return;

    const wCur = new Float64Array(D);
    let wSum = 0;
    for (let j = 0; j < D; j++) { wCur[j] = Math.max(0, wSprings[j].value); wSum += wCur[j]; }
    if (wSum > 0) for (let j = 0; j < D; j++) wCur[j] /= wSum;

    const sCur = YEARS.map((_y, yi) => {
      let s = 0;
      for (let j = 0; j < D; j++) s += wCur[j] * (byState[donors[j]][YEARS[yi]] ?? 0);
      return s;
    });

    const rmse = preRmse(sCur);
    const gap  = sCur[YEARS.length - 1] - CA_ALL[CA_ALL.length - 1];

    if (rmse < 5 && gap > 10) {
      state.challengeDone = true;
      chal.setState(true,
        `Pre-RMSE = ${rmse.toFixed(2)} packs · 2000 gap = ${gap.toFixed(1)} packs → Prop 99 cut smoking by ~${(100 * gap / sCur[YEARS.length - 1]).toFixed(0)}%.`
      );
    }
  }

  return () => stop();
}
