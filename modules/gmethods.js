// Time-Varying Treatment & the g-Methods (g-formula, MSM/IPTW)
// Robins 1986 (g-formula); Robins, Hernán & Brumback 2000 (MSM/IPTW);
// Hernán & Robins, "Causal Inference: What If".
//
// DGP (2 periods):
//   L0 = real baseline covariates from JOBS II (age, sex, econ_hard, depress1)
//   A0 ~ Bernoulli(σ(α0·L0)) — treatment at time 0
//   L1 = γL·L0 + γA·A0 + noise — time-varying confounder (feedback!)
//   A1 ~ Bernoulli(σ(α1·L1 + α0_past·A0))
//   Y  = β0·A0 + β1·A1 + βL·L0 + βL1·L1 + noise
//
// True effect of (A0=1,A1=1) vs (A0=0,A1=0): E[Y(1,1)] - E[Y(0,0)]
//
// Data note: real baseline covariates from JOBS II; 2-period longitudinal
// dynamics SIMULATED with known structural parameters so the causal target
// is exact ("real baseline covariates; longitudinal dynamics simulated so
// the causal target is known" — same spirit as the IHDP benchmark).

import { h } from "../lib/dom.js";
import { rows as jobsRows, meta as jobsMeta } from "../data/jobs.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";
import { mean, olsMulti, logisticFit, clamp } from "../lib/stats.js";
import { RNG } from "../lib/rng.js";
import { onFrame, Spring, lerp, ease } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, histogram } from "../lib/plot.js";
import {
  lessonLayout, panelSection, slider, toggle, button, readout, challenge, note,
} from "../lib/ui.js";

// ---- Real baseline covariates from JOBS II ----------------------------------
const KEYS = ["age", "sex", "econ_hard", "depress1"];
const cleanJobs = complete(jobsRows, KEYS);
const N_REAL = cleanJobs.length; // ~899

// z-score baselines once
const zAge  = zscore(col(cleanJobs, "age"));
const zSex  = zscore(col(cleanJobs, "sex"));
const zEcon = zscore(col(cleanJobs, "econ_hard"));
const zDep1 = zscore(col(cleanJobs, "depress1"));

// Stacked real baselines (already z-scored): [age_z, sex_z, econ_z, dep1_z]
const BASELINES = cleanJobs.map((_, i) => [
  zAge.z[i], zSex.z[i], zEcon.z[i], zDep1.z[i],
]);

// ---- Structural parameters (fixed, known) -----------------------------------
// These give a known true ATE so we can score each estimator exactly.
const STRUCT = {
  // A0 propensity: P(A0=1|L0)
  alpha0: [0.0, 0.25, -0.30, 0.20, 0.35],   // [intercept, age_z, sex_z, econ_z, dep1_z]
  // L1 structural equation (continuous): L1 = gamL·L0_summary + gamA·A0 + noise
  // L0_summary = mean of L0 components (scalar)
  gamL: 0.55,    // L0 -> L1 (confounding persistence)
  gamA: 0.0,     // A0 -> L1 strength — slider modulates this (feedback strength)
  gamNoise: 0.6, // L1 noise sd
  // A1 propensity: P(A1=1|L1, A0)
  alpha1: [0.0, 0.50, 0.20],  // [intercept, L1, A0]
  // Outcome (Y): Y = b0·A0 + b1·A1 + bL·L0_summary + bL1·L1 + noise
  b0: 0.4,   // causal effect of A0
  b1: 0.6,   // causal effect of A1
  bL: 0.5,   // L0 -> Y confounding
  bL1: 0.4,  // L1 -> Y (mediator/confounder path)
  yNoise: 0.7,
};

// True ATE = E[Y(1,1)] - E[Y(0,0)] computed analytically via the DGP
// = b0 + b1 (direct effects of A0,A1 on Y; L1 distribution shifts but E[L1|do(A0)] changes)
// We compute it via a Monte Carlo oracle at simulation time.

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// ---- Simulate one dataset ---------------------------------------------------
// feedbackStrength modulates gamA (A0->L1 feedback)
function simulate(seed, n, feedbackStrength) {
  const rng = new RNG(seed);
  const gamA = feedbackStrength; // how strongly A0 shifts L1

  // subsample from real baselines deterministically
  const step = Math.max(1, Math.floor(N_REAL / n));
  const data = [];

  for (let i = 0; i < n; i++) {
    const bi = (i * step) % N_REAL;
    const L0 = BASELINES[bi]; // [age_z, sex_z, econ_z, dep1_z]
    const L0sum = (L0[0] + L0[1] + L0[2] + L0[3]) / 4; // scalar summary

    // A0
    const etaA0 = STRUCT.alpha0[0]
      + STRUCT.alpha0[1] * L0[0]
      + STRUCT.alpha0[2] * L0[1]
      + STRUCT.alpha0[3] * L0[2]
      + STRUCT.alpha0[4] * L0[3];
    const pA0 = clamp(sigmoid(etaA0), 0.02, 0.98);
    const A0 = rng.bernoulli(pA0);

    // L1 (time-varying confounder; depends on A0 = feedback)
    const L1 = STRUCT.gamL * L0sum + gamA * A0 + rng.normal(0, STRUCT.gamNoise);

    // A1 (depends on L1 — the key time-varying confounder)
    const etaA1 = STRUCT.alpha1[0] + STRUCT.alpha1[1] * L1 + STRUCT.alpha1[2] * A0;
    const pA1 = clamp(sigmoid(etaA1), 0.02, 0.98);
    const A1 = rng.bernoulli(pA1);

    // Y
    const Y = STRUCT.b0 * A0
            + STRUCT.b1 * A1
            + STRUCT.bL * L0sum
            + STRUCT.bL1 * L1
            + rng.normal(0, STRUCT.yNoise);

    data.push({ L0, L0sum, A0, pA0, L1, A1, pA1, Y });
  }
  return data;
}

// ---- True ATE oracle (Monte Carlo, large n, both regimes) -------------------
// E[Y(1,1)] - E[Y(0,0)]: set A0 and A1 to the regime value, draw L1 from
// its interventional distribution (since L1 is affected by A0 under do(A0=a0)).
function trueATE(feedbackStrength, seed = 77777, n = 4000) {
  const rng = new RNG(seed);
  const gamA = feedbackStrength;
  let sumY11 = 0, sumY00 = 0;
  for (let i = 0; i < n; i++) {
    const bi = i % N_REAL;
    const L0 = BASELINES[bi];
    const L0sum = (L0[0] + L0[1] + L0[2] + L0[3]) / 4;

    // Under do(A0=1, A1=1): L1 drawn from its structural eq with A0=1
    const L1_11 = STRUCT.gamL * L0sum + gamA * 1 + rng.normal(0, STRUCT.gamNoise);
    sumY11 += STRUCT.b0 * 1 + STRUCT.b1 * 1 + STRUCT.bL * L0sum + STRUCT.bL1 * L1_11;

    // Under do(A0=0, A1=0): L1 from structural eq with A0=0
    const L1_00 = STRUCT.gamL * L0sum + gamA * 0 + rng.normal(0, STRUCT.gamNoise);
    sumY00 += STRUCT.b0 * 0 + STRUCT.b1 * 0 + STRUCT.bL * L0sum + STRUCT.bL1 * L1_00;
  }
  // Note: gamA * 1 vs gamA * 0 = gamA, so E[Y(1,1)]-E[Y(0,0)] = b0+b1+bL1*gamA
  return sumY11 / n - sumY00 / n;
}

// ---- Estimators -------------------------------------------------------------

// 1. Naive: simple OLS of Y ~ A0 + A1 (no covariate adjustment)
function estimateNaive(data) {
  const X = data.map(r => [1, r.A0, r.A1]);
  const Y = data.map(r => r.Y);
  const fit = olsMulti(X, Y);
  // "average treatment effect" of (1,1) vs (0,0): sum coefficients on A0 and A1
  return fit.beta[1] + fit.beta[2];
}

// 2. Adjust for L1: OLS of Y ~ A0 + A1 + L1 + L0sum (conditions on L1)
//    This is biased because L1 is a mediator of A0->Y (blocking part of the causal
//    path) AND a collider/descendant of A0 (inducing bias on A0 path)
function estimateAdjustL1(data) {
  const X = data.map(r => [1, r.A0, r.A1, r.L1, r.L0sum]);
  const Y = data.map(r => r.Y);
  const fit = olsMulti(X, Y);
  return fit.beta[1] + fit.beta[2];
}

// 3a. g-formula (standardization / iterated expectations):
//   E[Y(a0,a1)] = (1/n) Σ_i E[Y | A0=a0, A1=a1, L0=L0_i, L1=E[L1|A0=a0, L0=L0_i]]
//   We fit E[Y|A0,A1,L1,L0sum] from the data, then for each unit plug in:
//     L1_a0 = fitted E[L1 | A0=a0, L0=L0_i]  (from linear regression L1~A0+L0sum)
//     and marginalize: Ê[Y(a0,a1)] = (1/n)Σ_i E[Y | A0=a0, A1=a1, L1=L1_a0_i, L0sum_i]
function estimateGformula(data) {
  // Step 1: model L1 | A0, L0sum
  const XL1 = data.map(r => [1, r.A0, r.L0sum]);
  const L1vec = data.map(r => r.L1);
  const fitL1 = olsMulti(XL1, L1vec);

  // Step 2: model Y | A0, A1, L1, L0sum
  const XY = data.map(r => [1, r.A0, r.A1, r.L1, r.L0sum]);
  const Yvec = data.map(r => r.Y);
  const fitY = olsMulti(XY, Yvec);

  function predictL1(a0, L0sum) {
    return fitL1.beta[0] + fitL1.beta[1] * a0 + fitL1.beta[2] * L0sum;
  }
  function predictY(a0, a1, L1, L0sum) {
    return fitY.beta[0] + fitY.beta[1] * a0 + fitY.beta[2] * a1
         + fitY.beta[3] * L1 + fitY.beta[4] * L0sum;
  }

  let sum11 = 0, sum00 = 0;
  for (const r of data) {
    const L1_11 = predictL1(1, r.L0sum);
    const L1_00 = predictL1(0, r.L0sum);
    sum11 += predictY(1, 1, L1_11, r.L0sum);
    sum00 += predictY(0, 0, L1_00, r.L0sum);
  }
  return sum11 / data.length - sum00 / data.length;
}

// 3b. MSM via IPTW:
//   Weight each unit by SW = 1/[P(A0|L0) * P(A1|L0,A0,L1)]
//   Fit weighted regression Y ~ A0 + A1 with these stabilized weights.
//   Stabilized: SW = P(A0) * P(A1|A0) / [P(A0|L0) * P(A1|L0,A0,L1)]
function estimateIPTW(data) {
  // --- Denominator models (confounded) ---
  // P(A0=1|L0): logistic on [1, L0_0, L0_1, L0_2, L0_3]
  const XA0den = data.map(r => [1, r.L0[0], r.L0[1], r.L0[2], r.L0[3]]);
  const A0vec  = data.map(r => r.A0);
  const fitA0den = logisticFit(XA0den, A0vec);

  // P(A1=1|L1, A0, L0sum): logistic
  const XA1den = data.map(r => [1, r.L1, r.A0, r.L0sum]);
  const A1vec  = data.map(r => r.A1);
  const fitA1den = logisticFit(XA1den, A1vec);

  // --- Numerator models (marginal) ---
  // P(A0=1): marginal (intercept only)
  const margA0 = mean(A0vec);
  // P(A1=1|A0): logistic on [1, A0]
  const XA1num = data.map(r => [1, r.A0]);
  const fitA1num = logisticFit(XA1num, A1vec);

  // --- Compute weights ---
  const weights = data.map((r) => {
    const pA0den = clamp(fitA0den.predict([1, r.L0[0], r.L0[1], r.L0[2], r.L0[3]]), 0.02, 0.98);
    const pA1den = clamp(fitA1den.predict([1, r.L1, r.A0, r.L0sum]), 0.02, 0.98);

    const pA0num = r.A0 === 1 ? margA0 : (1 - margA0);
    const pA1num_p = clamp(fitA1num.predict([1, r.A0]), 0.02, 0.98);
    const pA1num = r.A1 === 1 ? pA1num_p : (1 - pA1num_p);

    const denA0 = r.A0 === 1 ? pA0den : (1 - pA0den);
    const denA1 = r.A1 === 1 ? pA1den : (1 - pA1den);

    const w = (pA0num * pA1num) / (denA0 * denA1);
    // Hard-clip extreme weights (99th percentile trimming applied post-hoc)
    return clamp(w, 0.01, 20);
  });

  // Weighted OLS via sqrt-weight trick: multiply each row by sqrt(w),
  // then OLS on the transformed system equals WOLS X'WX \ X'WY.
  const sqrtW = weights.map(w => Math.sqrt(w));
  const Xw = data.map((r, i) => [sqrtW[i], sqrtW[i] * r.A0, sqrtW[i] * r.A1]);
  const Yw = data.map((r, i) => sqrtW[i] * r.Y);
  const fitMSM = olsMulti(Xw, Yw);

  return { ate: fitMSM.beta[1] + fitMSM.beta[2], weights };
}

// ---- Run all estimators on one dataset --------------------------------------
function runAll(seed, n, feedbackStrength) {
  const data = simulate(seed, n, feedbackStrength);
  const truth = trueATE(feedbackStrength);
  const naive = estimateNaive(data);
  const adjL1 = estimateAdjustL1(data);
  const gform = estimateGformula(data);
  const { ate: iptw, weights } = estimateIPTW(data);
  return { naive, adjL1, gform, iptw, truth, data, weights };
}

// ---- Module mount -----------------------------------------------------------
export function mount(root) {
  const title = "Time-Varying Treatment & the g-Methods";
  const idea =
    "When a confounder is affected by past treatment AND drives future treatment AND outcome " +
    "(treatment-confounder feedback), ordinary regression adjustment fails in BOTH directions: " +
    "leave L1 out → confounded; adjust for L1 → you block the A0→L1→Y causal path " +
    "and open collider bias (L1 is a descendant of A0 and a collider between L0 and Y). " +
    "Only the g-formula and MSM/IPTW get it right.";

  const { root: layout, stage, panel, caption } = lessonLayout({ title, idea });
  root.appendChild(layout);

  // inject css once
  if (!document.getElementById("gm-css")) {
    const sty = document.createElement("style");
    sty.id = "gm-css";
    sty.textContent = `
      .gm-stage { display:flex; flex-direction:column; gap:10px; align-items:center; }
      .gm-row   { display:flex; gap:10px; align-items:flex-start; }
      .gm-label { font:11px ui-monospace,monospace; color:var(--dim); text-align:center; margin:2px 0 0; }
      .gm-dag-wrap { display:flex; flex-direction:column; align-items:center; gap:4px; }
      .gm-dag svg  { display:block; }
      .gm-bars-wrap { display:flex; flex-direction:column; align-items:center; gap:4px; }
    `;
    document.head.appendChild(sty);
  }

  // ---- State ----------------------------------------------------------------
  const state = {
    feedback: 0.8,   // gamA: strength of A0->L1 feedback
    n: 500,
    seed: 42,
    doIntervene: false, // animate cutting arrows to A0, A1
    doAnimT: 0,         // tween for do-intervention animation
  };

  // Results (updated on recompute)
  let res = { naive: NaN, adjL1: NaN, gform: NaN, iptw: NaN, truth: NaN, weights: [], data: [] };

  // Springs for animated bar targets
  const spNaive  = new Spring(0, { stiffness: 55, damping: 14 });
  const spAdjL1  = new Spring(0, { stiffness: 55, damping: 14 });
  const spGform  = new Spring(0, { stiffness: 55, damping: 14 });
  const spIPTW   = new Spring(0, { stiffness: 55, damping: 14 });
  const spTruth  = new Spring(0, { stiffness: 55, damping: 14 });

  // ---- DAG canvas (time-ordered: L0 -> A0 -> L1 -> A1 -> Y) ----------------
  const cvDAG  = new Canvas(340, 220, { margin: { t: 10, r: 10, b: 10, l: 10 } });
  const cvBars = new Canvas(340, 220, { margin: { t: 28, r: 16, b: 40, l: 56 } });
  const cvWts  = new Canvas(360, 120, { margin: { t: 18, r: 14, b: 32, l: 44 } });

  stage.className = "gm-stage";
  stage.append(
    h("div", { class: "gm-row" }, [
      h("div", { class: "gm-dag-wrap" }, [
        h("p", { class: "gm-label", text: "time-ordered DAG  (feedback: A0 → L1 → A1)" }),
        cvDAG.el,
      ]),
      h("div", { class: "gm-bars-wrap" }, [
        h("p", { class: "gm-label", text: "estimator comparison  (ATE of always-treat vs never-treat)" }),
        cvBars.el,
      ]),
    ]),
    h("div", { class: "gm-bars-wrap" }, [
      h("p", { class: "gm-label", text: "IPTW stabilized-weight distribution" }),
      cvWts.el,
    ]),
  );

  // ---- Readouts -------------------------------------------------------------
  const rTruth = readout({ label: "Truth (oracle)",    value: "—", accent: "var(--gold)" });
  const rNaive = readout({ label: "Naive (no adjust)", value: "—", accent: "var(--neg)" });
  const rAdjL1 = readout({ label: "Adjust for L1",    value: "—", accent: "var(--accent2)" });
  const rGform = readout({ label: "g-formula",         value: "—", accent: "var(--pos)" });
  const rIPTW  = readout({ label: "MSM/IPTW",          value: "—", accent: "var(--pos)" });

  const rBiasNaive = readout({ label: "Bias (naive)",    value: "—" });
  const rBiasAdj   = readout({ label: "Bias (adj-L1)",  value: "—" });
  const rBiasGform = readout({ label: "Bias (g-form)",  value: "—" });

  const chal = challenge({
    goal: "Crank feedback to max. Confirm that only the g-formula and MSM/IPTW track the truth — " +
          "while naive and 'adjust for L1' both fail (in opposite directions).",
  });

  // ---- Controls -------------------------------------------------------------
  const slFeedback = slider({
    label: "Feedback strength (A0 → L1)",
    min: 0, max: 2, step: 0.05, value: state.feedback,
    fmt: v => v.toFixed(2),
    hint: "(0 = no feedback, all methods agree; crank → only g-methods stay correct)",
    onInput: v => { state.feedback = v; recompute(); },
  });
  const slN = slider({
    label: "Sample size n",
    min: 200, max: 1200, step: 50, value: state.n,
    fmt: v => String(Math.round(v)),
    onInput: v => { state.n = Math.round(v); recompute(); },
  });
  const tglDo = toggle({
    label: "Show do-intervention (cut arrows into A0, A1)",
    value: false,
    hint: "(animate causal surgery)",
    onToggle: v => { state.doIntervene = v; },
  });
  const btnReseed = button("new seed", () => {
    state.seed = (state.seed + 1337) % 99999 + 1;
    recompute();
  });

  // Custom meta badge for this module
  const badge = dataBadge({
    ...jobsMeta,
    name: "JOBS II (baseline) + simulated longitudinal",
    source: "Vinokur, Price & Schul 1995 / simulated DGP",
    note: "real baseline covariates; longitudinal dynamics simulated so the causal target is known",
  });
  panel.prepend(badge);

  panel.append(
    panelSection("Estimates (ATE: always-treat vs never-treat)", [
      h("div", { class: "readout-grid" }, [rTruth, rNaive, rAdjL1, rGform, rIPTW]),
    ]),
    panelSection("Bias vs truth", [
      h("div", { class: "readout-grid" }, [rBiasNaive, rBiasAdj, rBiasGform]),
    ]),
    panelSection("Controls", [slFeedback, slN, tglDo]),
    panelSection("Explore", [h("div", { class: "btn-row" }, [btnReseed])]),
    panelSection("Challenge", chal),
    panelSection("Data note", [
      note("Real baseline covariates (age, sex, econ_hard, depress1) from JOBS II. " +
           "The 2-period A0→L1→A1→Y dynamics are SIMULATED with known structural parameters " +
           "so the true ATE is exact — same spirit as the IHDP benchmark."),
    ]),
  );

  caption.innerHTML =
    "<strong>g-formula (Robins 1986)</strong>: " +
    "E[Y(a)] = Σ<sub>l</sub> E[Y|A=a, L=l] P(L=l | do(past treatment)) — " +
    "standardize over the <em>interventional</em> distribution of L. " +
    "<strong>Key lesson</strong>: L1 is a descendant of past treatment A0 and a collider " +
    "(common cause of A1 and Y), so adjusting for it is <em>still biased</em> — " +
    "it blocks the A0→L1→Y causal path while opening a spurious backdoor through L0. " +
    "Only the g-formula and MSM/IPTW correctly propagate the do-operator through the time-varying process. " +
    "Uses real JOBS II baseline covariates with simulated longitudinal dynamics (semi-synthetic), " +
    "so the true ATE is known exactly. " +
    "— Robins (1986) (g-formula); Robins, Hernán &amp; Brumback (2000) (MSM/IPTW); " +
    "Hernán &amp; Robins, <em>Causal Inference: What If</em>.";

  // ---- DAG drawing ----------------------------------------------------------
  // Node positions (time-ordered left to right)
  const NODES = {
    L0: { x: 60,  y: 110, label: "L₀",  sub: "baseline",  col: "var(--accent2)" },
    A0: { x: 140, y: 60,  label: "A₀",  sub: "treatment₀", col: "var(--treat)" },
    L1: { x: 220, y: 160, label: "L₁",  sub: "confounder₁", col: "var(--accent2)" },
    A1: { x: 280, y: 60,  label: "A₁",  sub: "treatment₁", col: "var(--treat)" },
    Y:  { x: 340, y: 110, label: "Y",   sub: "outcome",    col: "var(--ctrl)" },
  };

  // Edges: { from, to, feedback (bool), causal (bool) }
  const EDGES = [
    { from: "L0", to: "A0" },
    { from: "L0", to: "L1" },
    { from: "L0", to: "Y" },
    { from: "A0", to: "L1", feedback: true },  // THE feedback arc
    { from: "A0", to: "Y",  causal: true },
    { from: "L1", to: "A1" },
    { from: "L1", to: "Y" },
    { from: "A1", to: "Y",  causal: true },
  ];

  function dagNodePx(id) {
    const n = NODES[id];
    return { x: cvDAG.box.x0 + n.x * (cvDAG.iw / 380), y: cvDAG.box.y0 + n.y * (cvDAG.ih / 200) };
  }

  function drawDAG(doT) {
    cvDAG.clear();
    const ctx = cvDAG.ctx;

    // draw edges
    for (const e of EDGES) {
      const a = dagNodePx(e.from), b = dagNodePx(e.to);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const r = 18;
      const x0 = a.x + ux * r, y0 = a.y + uy * r;
      const x1 = b.x - ux * (r + 5), y1 = b.y - uy * (r + 5);
      const mx = (x0 + x1) / 2 - uy * (e.feedback ? 18 : 0);
      const my = (y0 + y1) / 2 + ux * (e.feedback ? 18 : 0);

      ctx.save();
      // Feedback edge highlighted in orange; causal edges in green
      const isFeedback = e.feedback;
      const isCausal   = e.causal;
      const isIntoTreatment = (e.to === "A0" || e.to === "A1");

      // do-intervention: fade arrows into treatment nodes
      let alpha = 1;
      if (state.doIntervene && isIntoTreatment) {
        alpha = lerp(1, 0.08, ease.inOut(doT));
      }
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = isFeedback ? "var(--accent2)"
                      : isCausal   ? "var(--pos)"
                      : "var(--ink)";
      ctx.lineWidth = isFeedback ? 2.5 : 1.8;
      if (isFeedback) ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(mx, my, x1, y1);
      ctx.stroke();

      // arrowhead
      const t2 = 0.92;
      const qx = (1 - t2) * (1 - t2) * x0 + 2 * (1 - t2) * t2 * mx + t2 * t2 * x1;
      const qy = (1 - t2) * (1 - t2) * y0 + 2 * (1 - t2) * t2 * my + t2 * t2 * y1;
      const ax = x1 - qx, ay = y1 - qy;
      const al = Math.hypot(ax, ay) || 1;
      const angle = Math.atan2(ay / al, ax / al);
      ctx.save();
      ctx.translate(x1, y1);
      ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, 4); ctx.lineTo(-8, -4); ctx.closePath();
      ctx.fillStyle = isFeedback ? "var(--accent2)" : isCausal ? "var(--pos)" : "var(--ink)";
      ctx.fill();
      ctx.restore();

      // do-cut indicator (red X through cut arrows)
      if (state.doIntervene && isIntoTreatment && doT > 0.5) {
        const mx2 = (x0 + x1) / 2, my2 = (y0 + y1) / 2;
        const fade = ease.inOut((doT - 0.5) * 2);
        ctx.globalAlpha = fade * 0.85;
        ctx.strokeStyle = "var(--neg)";
        ctx.lineWidth = 2.2;
        ctx.setLineDash([]);
        const sz = 7;
        ctx.beginPath(); ctx.moveTo(mx2 - sz, my2 - sz); ctx.lineTo(mx2 + sz, my2 + sz); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx2 + sz, my2 - sz); ctx.lineTo(mx2 - sz, my2 + sz); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // draw nodes
    for (const [id, n] of Object.entries(NODES)) {
      const px = dagNodePx(id);
      ctx.save();
      ctx.beginPath(); ctx.arc(px.x, px.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = "var(--surface)";
      ctx.fill();
      ctx.strokeStyle = n.col;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.fillStyle = "var(--ink)";
      ctx.font = "bold 12px ui-monospace,monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(n.label, px.x, px.y);

      ctx.fillStyle = "var(--dim)";
      ctx.font = "10px ui-sans-serif,system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(n.sub, px.x, px.y + 20);
      ctx.restore();
    }

    // Legend
    ctx.save();
    ctx.font = "10px ui-monospace,monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    const ly = cvDAG.box.y0 + cvDAG.ih - 20;
    ctx.fillStyle = "var(--accent2)";
    ctx.fillText("── feedback (A0→L1)", cvDAG.box.x0, ly);
    ctx.fillStyle = "var(--pos)";
    ctx.fillText("── causal", cvDAG.box.x0 + 130, ly);
    ctx.restore();
  }

  // ---- Bar chart: compare estimators ----------------------------------------
  // 5 bars: naive, adjL1, gform, iptw, truth (gold)
  const BAR_COLORS = {
    naive:  "var(--neg)",
    adjL1:  "var(--accent2)",
    gform:  "var(--pos)",
    iptw:   "#36d6c3",
    truth:  "var(--gold)",
  };
  const BAR_LABELS = {
    naive:  "Naive",
    adjL1:  "Adj-L1",
    gform:  "g-form",
    iptw:   "IPTW",
    truth:  "Truth",
  };

  function drawBars(springs) {
    cvBars.clear();
    const ctx = cvBars.ctx;
    const entries = [
      { key: "naive", v: springs.naive },
      { key: "adjL1", v: springs.adjL1 },
      { key: "gform", v: springs.gform },
      { key: "iptw",  v: springs.iptw  },
      { key: "truth", v: springs.truth },
    ];
    const vals = entries.map(e => e.v);
    const allVals = [...vals, 0];
    const lo = Math.min(...allVals) - 0.1;
    const hi = Math.max(...allVals) + 0.1;
    const sy = new Scale([Math.min(lo, -0.05), Math.max(hi, 0.05)], [cvBars.box.y1, cvBars.box.y0]);
    const nBars = entries.length;
    const barW = cvBars.iw / nBars - 8;
    const x0 = cvBars.box.x0;

    drawAxes(cvBars, new Scale([0, 1], [cvBars.box.x0, cvBars.box.x1]), sy, {
      ylabel: "ATE estimate", grid: true, xlabel: "",
      xticks: [],
    });

    // zero line
    const zy = sy.map(0);
    ctx.save();
    ctx.strokeStyle = "var(--line)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cvBars.box.x0, zy); ctx.lineTo(cvBars.box.x1, zy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    for (let i = 0; i < nBars; i++) {
      const e = entries[i];
      const bx = x0 + i * (cvBars.iw / nBars) + 4;
      const by = sy.map(e.v);
      const yBase = zy;
      const h_px = Math.abs(by - yBase);

      ctx.save();
      ctx.fillStyle = BAR_COLORS[e.key];
      ctx.globalAlpha = e.key === "truth" ? 0.9 : 0.72;
      ctx.fillRect(bx, Math.min(by, yBase), barW, h_px + 1);
      ctx.globalAlpha = 1;

      // bar label below
      ctx.fillStyle = BAR_COLORS[e.key];
      ctx.font = "bold 10px ui-monospace,monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(BAR_LABELS[e.key], bx + barW / 2, cvBars.box.y1 + 5);

      // value label on bar
      ctx.fillStyle = "var(--ink)";
      ctx.font = "10px ui-monospace,monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = e.v >= 0 ? "bottom" : "top";
      const labelY = e.v >= 0 ? Math.min(by, yBase) - 2 : Math.max(by, yBase) + 2;
      if (isFinite(e.v)) ctx.fillText(e.v.toFixed(2), bx + barW / 2, labelY);
      ctx.restore();
    }
  }

  // ---- IPTW weight histogram -------------------------------------------------
  function drawWeights(weights) {
    cvWts.clear();
    const ctx = cvWts.ctx;
    if (!weights || weights.length < 2) {
      ctx.fillStyle = "var(--dim)"; ctx.font = "11px ui-sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("computing…", cvWts.w / 2, cvWts.h / 2);
      return;
    }
    const sorted = weights.slice().sort((a, b) => a - b);
    const lo = 0, hi = Math.min(sorted[Math.floor(sorted.length * 0.99)] + 0.5, 15);
    const bins = histogram(weights, 30, lo, hi);
    const maxC = Math.max(...bins.map(b => b.count), 1);
    const sx = new Scale([lo, hi], [cvWts.box.x0, cvWts.box.x1]);
    const sy = new Scale([0, maxC], [cvWts.box.y1, cvWts.box.y0]);

    drawAxes(cvWts, sx, sy, { xlabel: "stabilized weight SW", ylabel: "count", grid: false });
    for (const b of bins) {
      const bx0 = sx.map(b.x0), bx1 = sx.map(b.x1);
      const by  = sy.map(b.count);
      ctx.fillStyle = "#36d6c3";
      ctx.globalAlpha = 0.6;
      ctx.fillRect(bx0 + 0.5, by, Math.max(1, bx1 - bx0 - 1), cvWts.box.y1 - by);
      ctx.globalAlpha = 1;
    }
    // Mean weight line (should be ~1 for stabilized weights)
    const mw = mean(weights);
    const mx = sx.map(mw);
    ctx.save();
    ctx.strokeStyle = "var(--gold)"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(mx, cvWts.box.y0); ctx.lineTo(mx, cvWts.box.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "var(--gold)"; ctx.font = "10px ui-monospace,monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(`mean=${mw.toFixed(2)}`, mx + 3, cvWts.box.y0 + 1);
    ctx.restore();
  }

  // ---- Recompute everything -------------------------------------------------
  function recompute() {
    res = runAll(state.seed, state.n, state.feedback);

    spNaive.set(res.naive);
    spAdjL1.set(res.adjL1);
    spGform.set(res.gform);
    spIPTW.set(res.iptw);
    spTruth.set(res.truth);

    // update readouts
    const fmt = v => isFinite(v) ? v.toFixed(3) : "—";
    const biasFmt = v => isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(3) : "—";

    rTruth.set(fmt(res.truth));
    rNaive.set(fmt(res.naive));
    rAdjL1.set(fmt(res.adjL1));
    rGform.set(fmt(res.gform));
    rIPTW.set(fmt(res.iptw));

    const bNaive = res.naive - res.truth;
    const bAdj   = res.adjL1 - res.truth;
    const bGform = res.gform - res.truth;

    rBiasNaive.set(biasFmt(bNaive));
    rBiasAdj.set(biasFmt(bAdj));
    rBiasGform.set(biasFmt(bGform));

    // color bias readouts
    const colorBias = (el, bias) => {
      const v = el.querySelector(".readout-value");
      if (!v) return;
      v.style.color = Math.abs(bias) < 0.1 ? "var(--pos)"
                    : Math.abs(bias) < 0.3 ? "var(--accent2)"
                    : "var(--neg)";
    };
    colorBias(rBiasNaive, bNaive);
    colorBias(rBiasAdj, bAdj);
    colorBias(rBiasGform, bGform);

    // challenge: feedback cranked, g-methods track truth, others don't
    if (state.feedback >= 1.2) {
      const gformNear = Math.abs(bGform) < 0.15;
      const naiveBad  = Math.abs(bNaive) > 0.2;
      const adjBad    = Math.abs(bAdj)   > 0.15;
      if (gformNear && naiveBad && adjBad) {
        chal.setState(true,
          `feedback=${state.feedback.toFixed(2)}: g-formula bias=${bGform.toFixed(3)}, ` +
          `naive bias=${bNaive.toFixed(3)}, adj-L1 bias=${bAdj.toFixed(3)}`);
      } else {
        chal.setState(false);
      }
    } else {
      chal.setState(false);
    }
  }

  recompute();

  // ---- Animation loop -------------------------------------------------------
  let doT = 0;
  const stop = onFrame((dt) => {
    // animate do-intervention fade
    const targetDoT = state.doIntervene ? 1 : 0;
    doT = lerp(doT, targetDoT, Math.min(1, dt * 4));

    // step springs
    spNaive.step(dt);
    spAdjL1.step(dt);
    spGform.step(dt);
    spIPTW.step(dt);
    spTruth.step(dt);

    drawDAG(doT);
    drawBars({
      naive:  spNaive.value,
      adjL1:  spAdjL1.value,
      gform:  spGform.value,
      iptw:   spIPTW.value,
      truth:  spTruth.value,
    });
    drawWeights(res.weights);
  });

  return () => stop();
}
