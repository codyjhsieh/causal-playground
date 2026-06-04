// Counterfactual Credit Assignment in Policy-Gradient RL.
// A single-step contextual bandit lets us compute THREE gradient estimators:
//   (1) REINFORCE (no baseline) — high variance
//   (2) Value baseline b=V(s) — medium variance
//   (3) Counterfactual baseline — same exogenous noise reused across all actions
//       → the action-independent luck cancels out, variance collapses, bias stays 0.
// The three overlaid histograms have the SAME CENTER (unbiased) but wildly
// different widths. That visual IS the lesson.
//
// REAL DATA: Reward means R(s,a) = empirical P(got HIV result | incentive level a,
// distance state s), computed from Thornton (2008) HIV incentive RCT, Malawi.
// The action-independent noise (σ·U_luck) is a *simulation* of environment
// stochasticity — added to demonstrate policy-gradient variance. The reward means
// themselves are genuine empirical return rates from the real experiment.
//
// Refs: Thornton, R.L. (2008) "The Demand for, and Impact of, Learning HIV Status."
//       American Economic Review 98(5):1829–1863. (reward data)
//       Mesnard et al. 2021 (Counterfactual Credit Assignment in Model-Free RL);
//       Foerster et al. 2018 (COMA: Counterfactual Multi-Agent Policy Gradients).

import { h } from "../lib/dom.js";
import { RNG } from "../lib/rng.js";
import { mean, variance } from "../lib/stats.js";
import { onFrame, Spring, tween, ease } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, histogram, dot } from "../lib/plot.js";
import {
  lessonLayout, panelSection, slider, toggle,
  button, readout, challenge, note,
} from "../lib/ui.js";
import { rows, meta } from "../data/thornton.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";

// ── Build real reward table from Thornton (2008) HIV RCT ─────────────────────
// Decision problem: "which incentive to offer" to encourage HIV-status learning.
// Actions a = incentive level bins (tinc in hundreds of Kwacha):
//   a=0: no incentive  (tinc = 0)
//   a=1: low incentive (0 < tinc <= 0.5)
//   a=2: mid incentive (0.5 < tinc <= 1.5)
//   a=3: high incentive (tinc > 1.5)
// States s: distance to VCT center binned by median distvct:
//   s=0: near (distvct <= median)
//   s=1: far  (distvct >  median)
// R(s,a) = empirical P(got=1 | state s, incentive level a)
// Observed rollout return = R(s,a) + σ·U_luck, where U_luck ~ N(0,1) is
// action-INDEPENDENT exogenous noise simulating environment stochasticity.

const N_ACTIONS = 4;
const N_STATES  = 2;

// Action bin labels for display
const ACTION_LABELS = ["none", "low", "mid", "high"];
const ACTION_DESC   = ["tinc=0", "tinc (0,0.5]", "tinc (0.5,1.5]", "tinc >1.5"];

function buildRewardTable() {
  // Keep only complete cases on (got, tinc, distvct)
  const cRows = complete(rows, ["got", "tinc", "distvct"]);

  // Compute median distvct for state split
  const dists = col(cRows, "distvct").slice().sort((a, b) => a - b);
  const medDist = dists[Math.floor(dists.length / 2)];

  // Assign state and action bin to each row
  function stateOf(r)  { return r.distvct <= medDist ? 0 : 1; }
  function actionOf(r) {
    const t = r.tinc;
    if (t <= 0)   return 0;
    if (t <= 0.5) return 1;
    if (t <= 1.5) return 2;
    return 3;
  }

  // Accumulate got=1 sums and counts for each (s,a) cell
  const sums   = Array.from({ length: N_STATES }, () => new Array(N_ACTIONS).fill(0));
  const counts = Array.from({ length: N_STATES }, () => new Array(N_ACTIONS).fill(0));

  for (const r of cRows) {
    const s = stateOf(r);
    const a = actionOf(r);
    sums[s][a]   += r.got;
    counts[s][a] += 1;
  }

  // R(s,a) = P(got=1 | s,a); fall back to row-marginal if cell is empty
  const table = Array.from({ length: N_STATES }, (_, s) =>
    Array.from({ length: N_ACTIONS }, (__, a) => {
      const n = counts[s][a];
      if (n > 0) return sums[s][a] / n;
      // fallback: marginal across both states
      const ns = counts[0][a] + counts[1][a];
      return ns > 0 ? (sums[0][a] + sums[1][a]) / ns : 0.5;
    })
  );

  return { table, counts, medDist };
}

const { table: REWARD_TABLE, counts: CELL_COUNTS, medDist: MEDIAN_DIST } = buildRewardTable();

// ── Policy mechanics ──────────────────────────────────────────────────────────
function softmax(logits) {
  const max = Math.max(...logits);
  const ex  = logits.map(x => Math.exp(x - max));
  const sum = ex.reduce((a, b) => a + b, 0);
  return ex.map(x => x / sum);
}

function initTheta() {
  return [
    new Array(N_ACTIONS).fill(0),
    new Array(N_ACTIONS).fill(0),
  ];
}

function policyProbs(theta, s, temp) {
  const logits = theta[s].map(l => l / temp);
  return softmax(logits);
}

function trueValue(theta, s, temp) {
  const pi = policyProbs(theta, s, temp);
  return pi.reduce((acc, p, a) => acc + p * REWARD_TABLE[s][a], 0);
}

// True gradient ∂/∂theta[0][0] of E_{s~unif, a~pi}[R(s,a)]
// We track gradient wrt theta[0][0] (logit of action 0 in state 0).
function trueGradient(theta, temp) {
  let grad = 0;
  const pi0 = policyProbs(theta, 0, temp);
  const V0  = trueValue(theta, 0, temp);
  for (let a = 0; a < N_ACTIONS; a++) {
    const advantage = REWARD_TABLE[0][a] - V0;
    const dlogpi    = (1 / temp) * ((a === 0 ? 1 : 0) - pi0[0]);
    grad += pi0[a] * advantage * dlogpi;
  }
  return grad / N_STATES;
}

// ── Single rollout ────────────────────────────────────────────────────────────
// U_luck is action-INDEPENDENT (the same lucky draw for all actions in
// the counterfactual reveal). This is the simulated environment stochasticity
// that inflates REINFORCE variance; the reward MEANS are real Thornton data.
function rollout(theta, temp, noiseMag, rng) {
  const s  = rng.bernoulli(0.5);
  const pi = policyProbs(theta, s, temp);
  const V  = trueValue(theta, s, temp);

  // Exogenous noise — action-INDEPENDENT (the "lucky roll")
  const U_luck = rng.normal(0, 1);

  // Sample action from policy (categorical)
  const u_a = rng.uniform(0, 1);
  let cump = 0, a_taken = 0;
  for (let a = 0; a < N_ACTIONS; a++) {
    cump += pi[a];
    if (u_a < cump) { a_taken = a; break; }
    a_taken = a;
  }

  // Factual return
  const R_factual = REWARD_TABLE[s][a_taken] + noiseMag * U_luck;

  // Counterfactual returns: SAME U_luck across all actions
  const R_cf = REWARD_TABLE[s].map(r => r + noiseMag * U_luck);

  // Counterfactual baseline: b_CF = Σ_a' pi(a'|s)·R_cf(s,a')
  //   = V(s) + noiseMag·U_luck  [luck term independent of a_taken]
  // → R_factual - b_CF = R(s,a_taken) - V(s)  [luck cancels exactly]
  const b_CF = pi.reduce((acc, p, a) => acc + p * R_cf[a], 0);

  // ∂log pi(a_taken|s) / ∂theta[0][0] — nonzero only when s=0
  const dlogpi = s === 0
    ? (1 / temp) * ((a_taken === 0 ? 1 : 0) - pi[0])
    : 0;

  const g_reinforce = R_factual * dlogpi;
  const g_value     = (R_factual - V) * dlogpi;
  const g_cf        = (R_factual - b_CF) * dlogpi;

  return { g_reinforce, g_value, g_cf, s, a_taken, U_luck, R_factual, R_cf, pi };
}

// ── CSS ───────────────────────────────────────────────────────────────────────
function injectCSS() {
  if (document.getElementById("credit-css")) return;
  const style = document.createElement("style");
  style.id = "credit-css";
  style.textContent = `
    .credit-hist-wrap {
      display:flex; flex-direction:column; align-items:center; gap:0; width:100%;
    }
    .credit-stage-title {
      font:700 11px var(--mono,monospace); color:var(--dim); letter-spacing:.06em;
      text-transform:uppercase; margin:0 0 4px; align-self:flex-start;
    }
    .credit-legend {
      display:flex; gap:14px; flex-wrap:wrap; justify-content:center;
      margin:4px 0 8px; font:12px var(--mono,monospace);
    }
    .credit-legend-item { display:flex; align-items:center; gap:5px; }
    .credit-swatch {
      width:14px; height:10px; border-radius:3px; display:inline-block;
      opacity:0.85;
    }
    .credit-cf-wrap {
      display:flex; flex-direction:column; align-items:center; width:100%;
      margin-top:12px;
    }
    .credit-readout-row {
      display:flex; gap:10px; flex-wrap:wrap; justify-content:center;
      margin:8px 0 4px;
    }
    .credit-var-row {
      display:flex; gap:8px; flex-wrap:wrap; justify-content:center;
      margin:4px 0 8px;
    }
    .credit-var-chip {
      font:700 12px var(--mono,monospace); padding:4px 10px; border-radius:7px;
      border:1.5px solid var(--line); background:var(--surface2);
      white-space:nowrap;
    }
    .credit-var-chip.reinforce { border-color:#ff6b8a; color:#ff6b8a; }
    .credit-var-chip.value     { border-color:var(--accent2); color:var(--accent2); }
    .credit-var-chip.cfbaseline{ border-color:var(--pos); color:var(--pos); }
    .credit-reward-table {
      font:11px var(--mono,monospace); border-collapse:collapse;
      margin:4px auto; color:var(--dim);
    }
    .credit-reward-table th {
      font-weight:700; color:var(--ink); padding:2px 8px; text-align:center;
      border-bottom:1px solid var(--line);
    }
    .credit-reward-table td {
      padding:2px 8px; text-align:center; border-bottom:1px solid var(--faint);
    }
    .credit-reward-table td.highlight { color:var(--pos); font-weight:700; }
  `;
  document.head.appendChild(style);
}

// ── Colors ────────────────────────────────────────────────────────────────────
const COL_REINFORCE      = "rgba(255,107,138,0.6)";
const COL_VALUE          = "rgba(92,153,255,0.6)";
const COL_CF             = "rgba(54,214,130,0.65)";
const COL_REINFORCE_LINE = "#ff6b8a";
const COL_VALUE_LINE     = "#5c99ff";
const COL_CF_LINE        = "var(--pos)";

// ═════════════════════════════════════════════════════════════════════════════
export function mount(root) {
  injectCSS();

  const rng   = new RNG(42);
  const theta = initTheta();

  let noiseMag      = 3.0;
  let temp          = 1.0;
  let showReinforce = true;
  let showValue     = true;
  let showCF        = true;

  let ests_reinforce = [];
  let ests_value     = [];
  let ests_cf        = [];

  const varR_spring  = new Spring(0, { stiffness:40, damping:10 });
  const varV_spring  = new Spring(0, { stiffness:40, damping:10 });
  const varCF_spring = new Spring(0, { stiffness:40, damping:10 });

  let singleRollout = null;
  let cfRevealT     = 0;
  let cfTweenCancel = null;
  let chalDone      = false;

  // ── Layout ─────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Counterfactual Credit",
    idea:  "Subtract the return you'd have gotten anyway — with the same luck — and policy-gradient variance collapses without bias.",
  });
  root.appendChild(layout);

  stage.style.flexDirection = "column";
  stage.style.alignItems    = "center";
  stage.style.gap           = "10px";

  // ── Histogram canvas ───────────────────────────────────────────────────────
  const cvHist = new Canvas(560, 220, { margin: { t:22, r:20, b:38, l:46 } });
  const histWrap = h("div", { class: "credit-hist-wrap" }, [
    h("p", { class: "credit-stage-title", text: "sampling distribution of ĝ (gradient estimate, 500 rollouts)" }),
    cvHist.el,
  ]);

  const legend = h("div", { class: "credit-legend" }, [
    legendItem(COL_REINFORCE_LINE, "REINFORCE (no baseline)"),
    legendItem(COL_VALUE_LINE,     "value baseline"),
    legendItem(COL_CF_LINE,        "counterfactual baseline"),
    legendItem("var(--gold)",      "true gradient"),
  ]);

  const varRow = h("div", { class: "credit-var-row" });
  const chipR  = h("div", { class: "credit-var-chip reinforce", text: "Var REINFORCE: —" });
  const chipV  = h("div", { class: "credit-var-chip value",     text: "Var value: —" });
  const chipCF = h("div", { class: "credit-var-chip cfbaseline",text: "Var CF: —" });
  varRow.append(chipR, chipV, chipCF);

  // ── Single-rollout counterfactual reveal ───────────────────────────────────
  const cvCF = new Canvas(560, 190, { margin: { t:18, r:20, b:40, l:60 } });
  const cfWrap = h("div", { class: "credit-cf-wrap" }, [
    h("p", { class: "credit-stage-title", text: "single rollout · same exogenous noise U — what would other incentives have returned?" }),
    cvCF.el,
  ]);

  // Readout row
  const rGradTrue = readout({ label: "True gradient", value: "—", accent: "var(--gold)" });
  const rBiasR    = readout({ label: "Bias  REINFORCE", value: "—", accent: COL_REINFORCE_LINE });
  const rBiasV    = readout({ label: "Bias  value", value: "—", accent: COL_VALUE_LINE });
  const rBiasCF   = readout({ label: "Bias  CF", value: "—", accent: COL_CF_LINE });
  const readoutRow = h("div", { class: "credit-readout-row" }, [rGradTrue, rBiasR, rBiasV, rBiasCF]);

  // Real-data reward table display
  const tableEl = buildTableEl();

  // dataBadge
  const badge = dataBadge(meta);

  // Challenge
  const chal = challenge({
    goal: "Crank up the action-independent noise, then turn on the counterfactual baseline: drive the policy-gradient variance far below REINFORCE while staying unbiased (same center).",
  });

  // ── Stage assembly ─────────────────────────────────────────────────────────
  stage.append(histWrap, legend, varRow, cfWrap, readoutRow, tableEl);

  // ── Panel ──────────────────────────────────────────────────────────────────
  const noiseSl = slider({
    label: "Action-independent noise σ_luck", min: 0, max: 8, step: 0.1, value: noiseMag,
    fmt: v => v.toFixed(1),
    onInput: v => { noiseMag = v; resetEstimates(); },
  });
  const tempSl = slider({
    label: "Policy temperature τ", min: 0.3, max: 3.0, step: 0.1, value: temp,
    fmt: v => v.toFixed(1),
    onInput: v => { temp = v; resetEstimates(); },
  });

  const togR  = toggle({ label: "Show REINFORCE",          value: showReinforce, onToggle: v => { showReinforce = v; } });
  const togV  = toggle({ label: "Show value baseline",     value: showValue,     onToggle: v => { showValue     = v; } });
  const togCF = toggle({ label: "Show counterfactual",     value: showCF,        onToggle: v => { showCF        = v; } });

  const runBtn  = button("▶ Run 500 rollouts",    () => runMany(500), { primary: true });
  const run100  = button("Run 100",               () => runMany(100));
  const resetBtn= button("↺ Reset",               () => { resetEstimates(); drawSingleRollout(); });
  const newRoll = button("⟳ New single rollout",  () => {
    singleRollout = rollout(theta, temp, noiseMag, rng);
    cfRevealT = 0;
    if (cfTweenCancel) { cfTweenCancel(); cfTweenCancel = null; }
    cfTweenCancel = tween({ from:0, to:1, duration:1.0, easing: ease.out,
      onUpdate: v => { cfRevealT = v; } });
  });

  panel.append(
    panelSection("Data provenance", [badge]),
    panelSection("Run estimators", [
      h("div", { class: "btn-row", style: { display:"flex", gap:"8px", flexWrap:"wrap" } },
        [runBtn, run100, resetBtn]),
      note("Each rollout draws ONE state (near/far VCT), ONE incentive level, ONE shared luck draw U."),
    ]),
    panelSection("Counterfactual replay", [
      newRoll,
      note("Reveals what every incentive level would have returned under the SAME lucky U."),
    ]),
    panelSection("Parameters", [noiseSl, tempSl]),
    panelSection("Overlay", [togR, togV, togCF]),
    panelSection("Challenge", chal),
    panelSection("Unbiasedness check", [
      note("All three estimators have E[ĝ] = true gradient — center of each histogram stays at the gold line. Only their widths differ."),
    ]),
  );

  caption.innerHTML =
    "<strong>Real data:</strong> Reward means R(s,a) = empirical P(got HIV result | incentive level <em>a</em>, distance state <em>s</em>) from " +
    "<strong>Thornton, AER 2008</strong> Malawi HIV incentive RCT (n≈1,500 complete cases). " +
    "Actions: none / low / mid / high incentive (tinc bins); states: near / far from VCT center (median distvct split). " +
    "The action-independent noise σ·U<sub>luck</sub> is a <em>simulation</em> of environment stochasticity added to demonstrate " +
    "gradient-variance mechanics — the reward <em>means</em> are real. " +
    "A baseline <em>b(s)</em> that does <strong>not depend on the taken action</strong> leaves the policy-gradient estimator unbiased: " +
    "<span class='k'>E<sub>a~π</sub>[(R−b)∇log π(a|s)] = E[R∇log π]</span> " +
    "because <span class='k'>E[∇log π(a|s)]=0</span>. " +
    "The counterfactual baseline <em>b_CF = Σ<sub>a'</sub>π(a'|s)·R(s,a'|U<sub>luck</sub>)</em> " +
    "reuses the <strong>same exogenous noise draw</strong> (Pearl's abduction): luck cancels in the advantage, " +
    "collapsing variance without bias. " +
    "Challenge: Var(counterfactual) ≪ Var(REINFORCE), all unbiased. " +
    "Refs: <strong>Thornton, AER 2008</strong> (reward data) · " +
    "<strong>Mesnard et al. 2021</strong> (Counterfactual Credit Assignment) · " +
    "<strong>Foerster et al. 2018</strong> (COMA: Counterfactual Multi-Agent Policy Gradients).";

  // ── Helpers ────────────────────────────────────────────────────────────────
  function resetEstimates() {
    ests_reinforce = [];
    ests_value     = [];
    ests_cf        = [];
    varR_spring.snap(0);
    varV_spring.snap(0);
    varCF_spring.snap(0);
    chalDone = false;
    chal.setState(false);
    chipR.textContent  = "Var REINFORCE: —";
    chipV.textContent  = "Var value: —";
    chipCF.textContent = "Var CF: —";
  }

  function runMany(k) {
    for (let i = 0; i < k; i++) {
      const r = rollout(theta, temp, noiseMag, rng);
      ests_reinforce.push(r.g_reinforce);
      ests_value.push(r.g_value);
      ests_cf.push(r.g_cf);
    }
    updateVarianceReadouts();
    checkChallenge();
  }

  function updateVarianceReadouts() {
    const tg = trueGradient(theta, temp);
    rGradTrue.set(tg.toFixed(4), "∂E[R]/∂θ₀₀");

    if (ests_reinforce.length >= 2) {
      const vR  = variance(ests_reinforce);
      const vV  = variance(ests_value);
      const vCF = variance(ests_cf);
      varR_spring.set(vR);
      varV_spring.set(vV);
      varCF_spring.set(vCF);

      const mR  = mean(ests_reinforce);
      const mV  = mean(ests_value);
      const mCF = mean(ests_cf);
      rBiasR.set( (mR  - tg >= 0 ? "+" : "") + (mR  - tg).toFixed(4), `${ests_reinforce.length} runs`);
      rBiasV.set( (mV  - tg >= 0 ? "+" : "") + (mV  - tg).toFixed(4), `mean=${mV.toFixed(3)}`);
      rBiasCF.set((mCF - tg >= 0 ? "+" : "") + (mCF - tg).toFixed(4), `mean=${mCF.toFixed(3)}`);
    }
  }

  function checkChallenge() {
    if (chalDone) return;
    if (ests_reinforce.length < 100) return;
    const tg  = trueGradient(theta, temp);
    const vR  = variance(ests_reinforce);
    const vCF = variance(ests_cf);
    const mR  = mean(ests_reinforce);
    const mCF = mean(ests_cf);
    const biasOk     = Math.abs(mR - tg) < 0.15 && Math.abs(mCF - tg) < 0.15;
    const varReduced = vR > 0 && vCF < vR * 0.4;
    if (biasOk && varReduced) {
      chalDone = true;
      const ratio = vR / Math.max(vCF, 1e-9);
      chal.setState(true,
        `Var(REINFORCE)=${vR.toFixed(3)} vs Var(CF)=${vCF.toFixed(3)} — ${ratio.toFixed(1)}× reduction, both unbiased ✓`);
    }
  }

  // ── Draw histograms ────────────────────────────────────────────────────────
  function drawHistograms() {
    const cv  = cvHist;
    cv.clear();
    const ctx = cv.ctx;
    const tg  = trueGradient(theta, temp);

    if (ests_reinforce.length === 0) {
      ctx.fillStyle = "var(--dim)";
      ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("run rollouts to build the sampling distributions", cv.w / 2, cv.h / 2);
      return;
    }

    const allVals = [
      ...(showReinforce ? ests_reinforce : []),
      ...(showValue     ? ests_value     : []),
      ...(showCF        ? ests_cf        : []),
    ];
    if (allVals.length === 0) return;

    const lo   = Math.min(tg - 0.1, ...allVals) - 0.3;
    const hi   = Math.max(tg + 0.1, ...allVals) + 0.3;
    const BINS = 45;
    const sx   = new Scale([lo, hi], [cv.box.x0, cv.box.x1]);

    const binsR  = showReinforce ? histogram(ests_reinforce, BINS, lo, hi) : [];
    const binsV  = showValue     ? histogram(ests_value,     BINS, lo, hi) : [];
    const binsCF = showCF        ? histogram(ests_cf,        BINS, lo, hi) : [];
    const maxC   = Math.max(
      ...binsR.map(b => b.count),
      ...binsV.map(b => b.count),
      ...binsCF.map(b => b.count),
      1,
    );
    const sy = new Scale([0, maxC], [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel: "gradient estimate ĝ", grid: true });

    const drawBars = (bins, color) => {
      ctx.fillStyle = color;
      for (const b of bins) {
        const x0 = sx.map(b.x0) + 0.5, x1 = sx.map(b.x1) - 0.5;
        const yy = sy.map(b.count);
        ctx.fillRect(x0, yy, Math.max(1, x1 - x0), cv.box.y1 - yy);
      }
    };

    if (showReinforce) drawBars(binsR,  COL_REINFORCE);
    if (showValue)     drawBars(binsV,  COL_VALUE);
    if (showCF)        drawBars(binsCF, COL_CF);

    // True gradient — gold vertical line
    const gx = sx.map(tg);
    ctx.strokeStyle = "var(--gold)";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "var(--gold)";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(gx, cv.box.y0);
    ctx.lineTo(gx, cv.box.y1);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "var(--gold)";
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("true g", gx, cv.box.y0 + 2);

    // Mean lines (dashed)
    const drawMeanLine = (vals, color) => {
      if (vals.length === 0) return;
      const mx = sx.map(mean(vals));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(mx, cv.box.y0);
      ctx.lineTo(mx, cv.box.y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };
    if (showReinforce) drawMeanLine(ests_reinforce, COL_REINFORCE_LINE);
    if (showValue)     drawMeanLine(ests_value,     COL_VALUE_LINE);
    if (showCF)        drawMeanLine(ests_cf,        COL_CF_LINE);

    // Variance chips (spring-animated)
    if (ests_reinforce.length >= 2) {
      chipR.textContent  = `Var REINFORCE: ${varR_spring.value.toFixed(3)}`;
      chipV.textContent  = `Var value: ${varV_spring.value.toFixed(3)}`;
      chipCF.textContent = `Var CF: ${varCF_spring.value.toFixed(3)}`;
    }

    // n label
    ctx.fillStyle = "var(--dim)";
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`n=${ests_reinforce.length}`, cv.box.x1 - 2, cv.box.y0 + 2);
  }

  // ── Draw single-rollout counterfactual reveal ──────────────────────────────
  function drawSingleRollout() {
    const cv  = cvCF;
    cv.clear();
    const ctx = cv.ctx;

    if (!singleRollout) {
      ctx.fillStyle = "var(--dim)";
      ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("click  \"New single rollout\"  to reveal the shared-noise counterfactuals", cv.w / 2, cv.h / 2);
      return;
    }

    const { s, a_taken, U_luck, R_factual, R_cf, pi } = singleRollout;

    const allR = R_cf;
    const pad  = 0.15;
    const lo   = Math.min(...allR, 0) - pad;
    const hi   = Math.max(...allR, 1) + pad;
    const sx   = new Scale([lo, hi], [cv.box.x0, cv.box.x1]);
    const sy   = new Scale([-0.5, N_ACTIONS - 0.5], [cv.box.y1, cv.box.y0]);

    drawAxes(cv, sx, sy, {
      xlabel: "P(got result) + σ·U_luck  [same U for all incentive levels]",
      yticks: [0, 1, 2, 3],
      grid: false,
    });

    // Action labels on y-axis
    for (let a = 0; a < N_ACTIONS; a++) {
      const y = sy.map(a);
      ctx.fillStyle    = a === a_taken ? "var(--ink)" : "var(--dim)";
      ctx.font         = a === a_taken ? "700 11px ui-monospace,monospace" : "10px ui-monospace,monospace";
      ctx.textAlign    = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(ACTION_LABELS[a], cv.box.x0 - 4, y);
    }

    const BAR_H = 14;

    for (let a = 0; a < N_ACTIONS; a++) {
      const y       = sy.map(a);
      const isTaken = a === a_taken;
      const revealF = isTaken ? 1 : cfRevealT;

      // Deterministic mean bar (transparent background)
      const det_R = REWARD_TABLE[s][a];
      const x0d   = sx.map(Math.min(0, det_R));
      const x1d   = sx.map(Math.max(0, det_R));
      ctx.globalAlpha = 0.28 * revealF;
      ctx.fillStyle   = "var(--dim)";
      ctx.fillRect(x0d, y - BAR_H / 2, Math.max(2, x1d - x0d), BAR_H);
      ctx.globalAlpha = 1;

      // Full return (mean + luck)
      const ret  = R_cf[a];
      const x0   = sx.map(Math.min(0, ret));
      const x1   = sx.map(Math.max(0, ret));
      const color = isTaken
        ? (ret >= REWARD_TABLE[s][a] ? "var(--pos)" : "var(--neg)")
        : `rgba(92,153,255,${0.55 * revealF})`;
      ctx.globalAlpha = isTaken ? 1 : 0.75 * revealF;
      ctx.fillStyle   = color;
      ctx.fillRect(x0, y - BAR_H / 2, Math.max(2, x1 - x0), BAR_H);
      ctx.globalAlpha = 1;

      // Counterfactual label
      if (!isTaken && cfRevealT > 0.3) {
        const alpha = (cfRevealT - 0.3) / 0.7;
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = COL_VALUE_LINE;
        ctx.font        = "10px ui-monospace,monospace";
        ctx.textAlign   = "left";
        ctx.textBaseline = "middle";
        const lx = sx.map(ret) + 5;
        ctx.fillText(`R=${ret.toFixed(3)}  [same U=${U_luck.toFixed(2)}]`, lx, y);
        ctx.globalAlpha = 1;
      }

      // Factual label
      if (isTaken) {
        ctx.fillStyle    = "var(--ink)";
        ctx.font         = "700 11px ui-monospace,monospace";
        ctx.textAlign    = "left";
        ctx.textBaseline = "middle";
        const lx = sx.map(ret) + 5;
        ctx.fillText(`R=${ret.toFixed(3)}  ← taken  (π=${pi[a].toFixed(2)})`, lx, y);
      }

      // Policy probability circle
      const pr  = pi[a];
      const cxp = cv.box.x1 - 14;
      ctx.globalAlpha = isTaken ? 1 : 0.5 * revealF;
      dot(ctx, cxp, y, pr * 9 + 2, isTaken ? "var(--gold)" : "var(--dim)");
      ctx.globalAlpha = 1;
    }

    // Zero line
    const zx = sx.map(0);
    if (zx > cv.box.x0 && zx < cv.box.x1) {
      ctx.strokeStyle = "var(--line)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(zx, cv.box.y0);
      ctx.lineTo(zx, cv.box.y1);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Counterfactual baseline annotation
    if (cfRevealT > 0.7) {
      const alpha = (cfRevealT - 0.7) / 0.3;
      const b_cf  = pi.reduce((acc, p, a) => acc + p * R_cf[a], 0);
      const bx    = sx.map(b_cf);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "var(--gold)";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(bx, cv.box.y0);
      ctx.lineTo(bx, cv.box.y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "var(--gold)";
      ctx.font = "10px ui-monospace,monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`b_CF=${b_cf.toFixed(3)}`, bx, cv.box.y0 - 1);
      ctx.globalAlpha = 1;

      // Advantage annotation
      const adv   = R_factual - b_cf;
      const yt    = sy.map(a_taken);
      const x_fact = sx.map(R_factual);
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = "var(--accent2)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx, yt - BAR_H / 2 - 4);
      ctx.lineTo(x_fact, yt - BAR_H / 2 - 4);
      ctx.stroke();
      ctx.fillStyle = "var(--accent2)";
      ctx.font = "10px ui-monospace,monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`advantage=${adv.toFixed(3)}`, (bx + x_fact) / 2, yt - BAR_H / 2 - 6);
      ctx.globalAlpha = 1;
    }

    // State / noise info header
    const stateLabel = s === 0 ? "near VCT" : "far VCT";
    ctx.fillStyle    = "var(--dim)";
    ctx.font         = "11px ui-monospace,monospace";
    ctx.textAlign    = "left";
    ctx.textBaseline = "top";
    ctx.fillText(
      `state s=${s} (${stateLabel}) · U_luck=${U_luck.toFixed(3)} · σ=${noiseMag.toFixed(1)}  [noise simulated; means = real Thornton data]`,
      cv.box.x0, 4,
    );
  }

  // ── Animation loop ─────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    varR_spring.step(dt);
    varV_spring.step(dt);
    varCF_spring.step(dt);
    drawHistograms();
    drawSingleRollout();
    updateVarianceReadouts();
  });

  // Initial single rollout
  singleRollout = rollout(theta, temp, noiseMag, rng);
  cfRevealT = 1;

  return () => {
    stop();
    if (cfTweenCancel) cfTweenCancel();
  };
}

// ── Build real-data reward table DOM element ──────────────────────────────────
function buildTableEl() {
  const headerCells = [
    h("th", { text: "state \\ incentive" }),
    ...ACTION_LABELS.map((lbl, a) => h("th", { text: `${lbl}  (a=${a})` })),
  ];
  const headerRow = h("tr", {}, headerCells);

  const stateLabels = ["s=0 near", "s=1 far"];
  const bodyRows = stateLabels.map((slbl, s) => {
    const cells = [
      h("td", { text: slbl }),
      ...REWARD_TABLE[s].map((v, a) => {
        const maxV = Math.max(...REWARD_TABLE[s]);
        return h("td", {
          class: v === maxV ? "highlight" : "",
          text: `${(v * 100).toFixed(1)}%`,
        });
      }),
    ];
    return h("tr", {}, cells);
  });

  return h("table", { class: "credit-reward-table" }, [
    h("caption", {
      style: { font: "10px var(--mono,monospace)", color: "var(--dim)", captionSide: "bottom", paddingTop: "3px" },
      text: "R(s,a) = empirical P(got HIV result | state, incentive) · Thornton, AER 2008",
    }),
    h("thead", {}, [headerRow]),
    h("tbody", {}, bodyRows),
  ]);
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function legendItem(color, label) {
  return h("div", { class: "credit-legend-item" }, [
    h("span", { class: "credit-swatch", style: { background: color } }),
    label,
  ]);
}
