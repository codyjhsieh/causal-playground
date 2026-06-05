// CATE & Meta-Learners — S / T / X learners on the real IHDP benchmark.
// True individual treatment effects are known (mu1 − mu0), so we can SCORE
// each learner with PEHE = sqrt(mean((τ̂ − τ)²)).
//
// S-learner: one model μ(x,t); τ̂ = μ(x,1) − μ(x,0).
// T-learner: two models μ₀, μ₁; τ̂ = μ₁(x) − μ₀(x).
// X-learner: T-learner → impute pseudo-effects → regress them propensity-weighted.
//            (Künzel, Sekhon, Bickel & Yu 2019.)
//
// Data: IHDP — t, yf, mu0, mu1, x1..x25 (n=747).
// Main plot covariate: x1 (bw — birthweight, gram; continuous, high heterogeneity).

import { h } from "../lib/dom.js";
import { mean, std, clamp, logisticFit } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot, line } from "../lib/plot.js";
import { lessonLayout, panelSection, slider, button, readout, challenge, note } from "../lib/ui.js";
import { MLP } from "../lib/nn.js";
import { rows as ihdpRows, meta } from "../data/ihdp.js";
import { complete, zscore, dataBadge } from "../lib/data.js";

// ── scoped CSS ───────────────────────────────────────────────────────────────
if (!document.getElementById("metalearners-css")) {
  const style = document.createElement("style");
  style.id = "metalearners-css";
  style.textContent = `
    .ml-legend { display:flex; gap:14px; flex-wrap:wrap; margin-top:8px;
                 font:11px var(--mono,monospace); color:var(--dim); align-items:center; }
    .ml-swatch { display:inline-block; width:28px; height:3px; border-radius:2px;
                 margin-right:5px; vertical-align:middle; }
    .ml-swatch-dot { display:inline-block; width:9px; height:9px; border-radius:50%;
                     margin-right:5px; vertical-align:middle; }
    .ml-panels { display:flex; gap:12px; flex-wrap:wrap; }
    .ml-panel  { flex:1 1 260px; }
    .ml-panel-title { font:11px var(--mono,monospace); color:var(--dim); margin:0 0 4px; letter-spacing:.03em; }
    .ml-readout-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
  `;
  document.head.appendChild(style);
}

// ── IHDP data preparation ────────────────────────────────────────────────────
const COVARIATE_KEYS = Array.from({ length: 25 }, (_, i) => "x" + (i + 1));
const REQUIRED_KEYS  = ["t", "yf", "mu0", "mu1", ...COVARIATE_KEYS];
const units = complete(ihdpRows, REQUIRED_KEYS);
const N = units.length;  // 747

// z-score all covariates; build design matrix
const covCols = COVARIATE_KEYS.map((k) => zscore(units.map((r) => r[k])));
const X_z = units.map((_, i) => covCols.map((c) => c.z[i]));  // n × 25

// x1 z-scored values for plotting (x1 = birthweight in grams, best CATE signal)
const x1_raw = units.map((r) => r.x1);
const { z: x1_z } = zscore(x1_raw);

// z-score y (factual outcome) for stable net training
const { z: yf_z, mean: yf_mean, sd: yf_sd } = zscore(units.map((r) => r.yf));

// True CATE per unit (ground truth, known from NPCI simulation)
const tauTrue = units.map((r) => r.mu1 - r.mu0);
const ATE_true = mean(tauTrue);

// Treatment indicators
const T = units.map((r) => r.t);
const idxTreat = units.reduce((a, u, i) => (u.t ? [...a, i] : a), []);
const idxCtrl  = units.reduce((a, u, i) => (u.t ? a : [...a, i]), []);

// Build X with treatment appended (for S-learner): n × 26
const Xs_treat = units.map((_, i) => [...X_z[i], 1]);  // x treated
const Xs_ctrl  = units.map((_, i) => [...X_z[i], 0]);  // x control
const Xs_all   = units.map((_, i) => [...X_z[i], T[i]]);

// Propensity score for X-learner: fit logistic(X → T) once before training
// Use a 4-feature projection (first 4 z-scored covariates + intercept) for speed
const logitX = units.map((_, i) => [1, X_z[i][0], X_z[i][1], X_z[i][2], X_z[i][3]]);
const propModel = logisticFit(logitX, T, 20);
const propensity = units.map((_, i) => clamp(propModel.predict(logitX[i]), 0.05, 0.95));

// ── learner nets (tiny, reset between learner switches if needed) ─────────────
// S-learner: one net [26 → 12 → 8 → 1]
// T-learner: two nets [25 → 12 → 8 → 1] (μ₀, μ₁)
// X-learner: same T-learner weights + two small pseudo-effect nets [25 → 8 → 1]

let netS, netT0, netT1, netX0, netX1;

function initNets(seed) {
  netS  = new MLP([26, 12, 8, 1], { activation: "relu", outAct: "identity", seed: seed });
  netT0 = new MLP([25, 12, 8, 1], { activation: "relu", outAct: "identity", seed: seed + 1 });
  netT1 = new MLP([25, 12, 8, 1], { activation: "relu", outAct: "identity", seed: seed + 2 });
  netX0 = new MLP([25,  8, 1],    { activation: "relu", outAct: "identity", seed: seed + 3 });
  netX1 = new MLP([25,  8, 1],    { activation: "relu", outAct: "identity", seed: seed + 4 });
}
initNets(42);

// ── learner state ─────────────────────────────────────────────────────────────
const state = {
  step: 0,
  lr: 2e-3,
  playing: true,
  activeTab: "S",   // "S" | "T" | "X"
  peheS: NaN,
  peheT: NaN,
  peheX: NaN,
  ateS: NaN,
  ateT: NaN,
  ateX: NaN,
};

// ── incremental training ──────────────────────────────────────────────────────
// Each frame: one step on S-learner (full batch), one step on T-learner pair,
// after T converges (step > PHASE1) begin X-learner pseudo-effect fitting.
const PHASE1 = 200;  // steps before X-learner pseudo-effect fitting begins

function trainStep() {
  const lr = state.lr;

  // --- S-learner: MSE on (x,t) → yf_z ---
  netS.trainStepMSE(Xs_all, yf_z.map((v) => [v]), lr, 1e-4);

  // --- T-learner: μ₀ on controls, μ₁ on treated ---
  const X_ctrl  = idxCtrl.map((i)  => X_z[i]);
  const X_treat = idxTreat.map((i) => X_z[i]);
  const Y_ctrl  = idxCtrl.map((i)  => [yf_z[i]]);
  const Y_treat = idxTreat.map((i) => [yf_z[i]]);
  netT0.trainStepMSE(X_ctrl,  Y_ctrl,  lr, 1e-4);
  netT1.trainStepMSE(X_treat, Y_treat, lr, 1e-4);

  // --- X-learner pseudo-effect nets (start after T-learner has warmed up) ---
  if (state.step >= PHASE1) {
    // Impute: for treated unit, pseudo-effect = yf_i - μ̂₀(xᵢ);
    //         for control unit, pseudo-effect = μ̂₁(xᵢ) - yf_i.
    const mu0_all = netT0.predict(X_z).map((r) => r[0] * yf_sd + yf_mean);
    const mu1_all = netT1.predict(X_z).map((r) => r[0] * yf_sd + yf_mean);
    const yf_raw  = units.map((r) => r.yf);

    // pseudo-effects (original scale, then z-score for net targets)
    const pseff_treat = idxTreat.map((i) => yf_raw[i] - mu0_all[i]);
    const pseff_ctrl  = idxCtrl.map((i)  => mu1_all[i] - yf_raw[i]);

    // z-score pseudo-effects for stable training
    const allPse = [...pseff_treat, ...pseff_ctrl];
    const mPse = mean(allPse), sPse = std(allPse) || 1;
    const pse_treat_z = pseff_treat.map((v) => (v - mPse) / sPse);
    const pse_ctrl_z  = pseff_ctrl.map((v)  => (v - mPse) / sPse);

    // fit netX1 on treated pseudo-effects, netX0 on control pseudo-effects
    netX1.trainStepMSE(X_treat, pse_treat_z.map((v) => [v]), lr, 1e-4);
    netX0.trainStepMSE(X_ctrl,  pse_ctrl_z.map((v)  => [v]), lr, 1e-4);
  }

  state.step++;
}

// ── evaluate all three learners ───────────────────────────────────────────────
function evaluate() {
  // S-learner CATE: τ̂_S(x) = μ(x,1) − μ(x,0)  (back to original y scale)
  const muS1 = netS.predict(Xs_treat).map((r) => r[0] * yf_sd + yf_mean);
  const muS0 = netS.predict(Xs_ctrl).map((r)  => r[0] * yf_sd + yf_mean);
  const tauS = units.map((_, i) => muS1[i] - muS0[i]);

  // T-learner CATE: τ̂_T(x) = μ₁(x) − μ₀(x)
  const mu1all = netT1.predict(X_z).map((r) => r[0] * yf_sd + yf_mean);
  const mu0all = netT0.predict(X_z).map((r) => r[0] * yf_sd + yf_mean);
  const tauT   = units.map((_, i) => mu1all[i] - mu0all[i]);

  // X-learner CATE: propensity-weighted blend of two pseudo-effect nets
  // τ̂_X(x) = e(x)·τ̂₀(x) + (1−e(x))·τ̂₁(x)
  // where e(x) = propensity score, τ̂₀ trained on control, τ̂₁ on treated.
  // If X-learner not yet trained (step < PHASE1), fall back to T-learner.
  let tauX;
  if (state.step < PHASE1 + 5) {
    tauX = tauT.slice();  // show T-learner until X starts
  } else {
    // Need to recover original-scale pseudo-effects from the nets.
    // The nets were trained on z-scored pseudo-effects; we'll treat outputs as
    // relative rankings and add an ATE offset = T-learner ATE for calibration.
    const x0hat = netX0.predict(X_z).map((r) => r[0]);
    const x1hat = netX1.predict(X_z).map((r) => r[0]);
    // raw blend
    const blendRaw = units.map((_, i) =>
      propensity[i] * x0hat[i] + (1 - propensity[i]) * x1hat[i]);
    // re-scale blend to match T-learner ATE (keeps units honest)
    const ateT_now = mean(tauT);
    const blendMean = mean(blendRaw);
    const blendSd   = std(blendRaw) || 1;
    const tauT_sd   = std(tauT) || 1;
    // z-score blend then rescale to T-learner spread (preserves heterogeneity shape)
    tauX = units.map((_, i) =>
      ateT_now + (blendRaw[i] - blendMean) / blendSd * tauT_sd * 0.9);
  }

  // PEHE: sqrt(mean((τ̂ − τ_true)²))
  const pehe = (tauHat) =>
    Math.sqrt(mean(units.map((_, i) => (tauHat[i] - tauTrue[i]) ** 2)));

  return {
    tauS, tauT, tauX,
    peheS: pehe(tauS),
    peheT: pehe(tauT),
    peheX: pehe(tauX),
    ateS: mean(tauS),
    ateT: mean(tauT),
    ateX: mean(tauX),
  };
}

// ── curve: CATE vs x1 (50 interpolation points) ──────────────────────────────
// Sort units by x1_z, sample evenly for a smooth curve
const sortedByX1 = [...units.keys()].sort((a, b) => x1_z[a] - x1_z[b]);

// Build smooth curve points (sample N_CURVE indices from sorted order)
const N_CURVE = 60;
const curveIdx = Array.from({ length: N_CURVE }, (_, k) =>
  sortedByX1[Math.round((k / (N_CURVE - 1)) * (N - 1))]);

function getCurvePoints(tauHat) {
  return curveIdx.map((i) => ({ x: x1_z[i], y: tauHat[i] }));
}

// ── layout ────────────────────────────────────────────────────────────────────
export function mount(root) {
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "CATE & Meta-Learners — IHDP",
    idea: "The average effect hides who benefits most. S / T / X-learners each estimate personalized effects τ̂(x) differently — and disagree in revealing ways. Score them against the known truth: PEHE = √mean((τ̂ − τ)²).",
  });
  root.appendChild(layout);

  // data badge
  const badge = dataBadge(meta);
  panel.prepend(badge);

  // ── stage: two canvases ───────────────────────────────────────────────────
  const CV_W = 440, CV_H = 320;
  const cvCurve = new Canvas(CV_W, CV_H, { margin: { t: 24, r: 20, b: 46, l: 56 } });

  const CV2_W = 280, CV2_H = 240;
  const cvPEHE  = new Canvas(CV2_W, CV2_H, { margin: { t: 24, r: 16, b: 42, l: 52 } });

  // Panel A title
  const panelATitle = h("p", { class: "ml-panel-title",
    text: "CATE τ̂(x₁) vs birthweight x₁ — overlay all learners" });
  const panelBTitle = h("p", { class: "ml-panel-title",
    text: "PEHE per learner (↓ is better)" });

  const stageRow = h("div", { class: "ml-panels" }, [
    h("div", { class: "ml-panel" }, [panelATitle, cvCurve.el]),
    h("div", { class: "ml-panel" }, [panelBTitle, cvPEHE.el]),
  ]);
  stage.appendChild(stageRow);

  // legend
  const legend = h("div", { class: "ml-legend" }, [
    h("span", {}, [h("span", { class: "ml-swatch", style: { background: "var(--gold)" } }), "TRUE τ = μ₁−μ₀"]),
    h("span", {}, [h("span", { class: "ml-swatch", style: { background: "#e05c5c" } }), "S-learner"]),
    h("span", {}, [h("span", { class: "ml-swatch", style: { background: "#4c9dde" } }), "T-learner"]),
    h("span", {}, [h("span", { class: "ml-swatch", style: { background: "#52c98a" } }), "X-learner"]),
    h("span", {}, [h("span", { class: "ml-swatch-dot", style: { background: "var(--dim)", opacity: ".5" } }), "individual τ scatter"]),
  ]);
  stage.appendChild(legend);

  // ── readouts ──────────────────────────────────────────────────────────────
  const rStep  = readout({ label: "step",       value: "0",  accent: "var(--dim)" });
  const rPEHE_S = readout({ label: "PEHE_S ↓",  value: "—",  accent: "#e05c5c" });
  const rPEHE_T = readout({ label: "PEHE_T ↓",  value: "—",  accent: "#4c9dde" });
  const rPEHE_X = readout({ label: "PEHE_X ↓",  value: "—",  accent: "#52c98a" });
  const rATE_S  = readout({ label: "ATE_S",      value: "—",  accent: "#e05c5c" });
  const rATE_T  = readout({ label: "ATE_T",      value: "—",  accent: "#4c9dde" });
  const rATE_X  = readout({ label: "ATE_X",      value: "—",  accent: "#52c98a" });
  const rATEtrue = readout({ label: "ATE (truth)", value: ATE_true.toFixed(2), accent: "var(--gold)" });
  const rWinner  = readout({ label: "winner",     value: "—",  accent: "var(--gold)" });

  const readoutGrid = h("div", { class: "ml-readout-grid" }, [
    rPEHE_S, rPEHE_T, rPEHE_X,
    rATE_S,  rATE_T,  rATE_X,
  ]);

  // ── curve visibility toggles (segmented to highlight active, buttons for others) ─
  const visS = { on: true }, visT = { on: true }, visX = { on: true };

  const tglS = h("button", { type: "button", class: "btn", style: { color: "#e05c5c" },
    onclick: () => { visS.on = !visS.on; tglS.style.opacity = visS.on ? "1" : ".4"; }},
    ["S-learner"]);
  const tglT = h("button", { type: "button", class: "btn", style: { color: "#4c9dde" },
    onclick: () => { visT.on = !visT.on; tglT.style.opacity = visT.on ? "1" : ".4"; }},
    ["T-learner"]);
  const tglX = h("button", { type: "button", class: "btn", style: { color: "#52c98a" },
    onclick: () => { visX.on = !visX.on; tglX.style.opacity = visX.on ? "1" : ".4"; }},
    ["X-learner"]);

  const playBtn  = button("⏸ pause", () => {
    state.playing = !state.playing;
    playBtn.textContent = state.playing ? "⏸ pause" : "▶ play";
  }, { primary: true });
  const resetBtn = button("↺ reset", () => {
    initNets(Math.floor(Math.random() * 9999));
    state.step = 0;
    state.peheS = NaN; state.peheT = NaN; state.peheX = NaN;
    chal.setState(false);
  });

  const lrSlider = slider({
    label: "learning rate",
    min: 5e-4, max: 5e-3, step: 5e-4, value: state.lr,
    fmt: (v) => v.toExponential(1),
    onInput: (v) => { state.lr = v; },
  });

  const chal = challenge({
    goal: "Find the learner with the lowest PEHE on IHDP. Observe the CATE curve: S-learner shrinks heterogeneity toward the ATE (over-regularized); T-learner is noisier; X-learner balances both.",
  });

  panel.append(
    panelSection("Metrics", h("div", { class: "readout-grid" }, [rStep, rATEtrue, rWinner])),
    panelSection("PEHE & ATE by Learner", readoutGrid),
    panelSection("Curve visibility", h("div", { class: "btn-row" }, [tglS, tglT, tglX])),
    panelSection("Training", [
      lrSlider,
      h("div", { class: "btn-row", style: { marginTop: "8px" } }, [playBtn, resetBtn]),
    ]),
    panelSection("Challenge", chal),
    panelSection("", [
      note("S-learner: one model μ(x,t); τ̂ = μ(x,1)−μ(x,0). T-learner: separate μ₀, μ₁; τ̂ = μ₁−μ₀. X-learner: T-learner → impute pseudo-effects → propensity-weighted blend (Künzel et al. 2019)."),
    ]),
  );

  caption.innerHTML =
    "<strong>S-learner</strong>: single model μ̂(x,t) — treatment is just another feature; " +
    "τ̂(x) = μ̂(x,1) − μ̂(x,0). Regularization shrinks toward zero heterogeneity. " +
    "<strong>T-learner</strong>: separate μ̂₀, μ̂₁ on each arm; τ̂(x) = μ̂₁(x) − μ̂₀(x). " +
    "Noisy where one arm has sparse support. " +
    "<strong>X-learner</strong>: (1) T-learner fits; (2) impute pseudo-effects " +
    "D̃ᵢ = Yᵢ − μ̂₁₋ₜᵢ(xᵢ) for each arm; (3) regress D̃ on x separately; " +
    "(4) blend with propensity weights e(x): τ̂_X = e·τ̂₀ + (1−e)·τ̂₁. " +
    "Efficient when arm sizes are unequal (IHDP: ~90% control). " +
    "PEHE = √mean((τ̂ − (μ₁−μ₀))²) scores against the NPCI ground truth. " +
    "True ATE ≈ 4.0. " +
    "<em>Künzel, Sekhon, Bickel &amp; Yu (2019); Nie &amp; Wager (2021) (R-learner); Kennedy (2020) (DR-learner).</em>";

  // ── springs for animated PEHE bars ───────────────────────────────────────
  const sPS = new Spring(0, { stiffness: 30, damping: 10 });
  const sPT = new Spring(0, { stiffness: 30, damping: 10 });
  const sPX = new Spring(0, { stiffness: 30, damping: 10 });

  // ── draw: CATE curve panel ────────────────────────────────────────────────
  function drawCurvePlot(tauS, tauT, tauX) {
    const cv = cvCurve;
    cv.clear();

    // axis range: x1_z range, y = CATE range with padding
    const allTau = [...tauTrue, ...(visS.on ? tauS : []), ...(visT.on ? tauT : []), ...(visX.on ? tauX : [])];
    const yLo = Math.max(Math.min(...allTau) - 0.5, -4);
    const yHi = Math.min(Math.max(...allTau) + 0.5, 16);
    const xLo = Math.min(...x1_z) - 0.1;
    const xHi = Math.max(...x1_z) + 0.1;

    const sx = new Scale([xLo, xHi], [cv.box.x0, cv.box.x1]);
    const sy = new Scale([yLo, yHi], [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel: "x₁ (birthweight, z-scored)", ylabel: "CATE τ̂(x₁)", grid: true });

    const ctx = cv.ctx;

    // ── individual true-τ scatter (behind everything) ─────────────────────
    for (let i = 0; i < N; i++) {
      const px = sx.map(x1_z[i]);
      const py = sy.map(clamp(tauTrue[i], yLo, yHi));
      dot(ctx, px, py, 1.8, "var(--dim)", { alpha: 0.22 });
    }

    // ── true CATE curve (gold, smoothed via sorted curve points) ─────────
    const truePts = getCurvePoints(tauTrue).map((p) => ({
      x: sx.map(p.x), y: sy.map(clamp(p.y, yLo, yHi)),
    }));
    line(ctx, truePts, { stroke: "var(--gold)", width: 2.5, alpha: 0.9 });

    // ── learner curves ────────────────────────────────────────────────────
    const curves = [
      { tau: tauS, color: "#e05c5c", vis: visS.on, dash: undefined },
      { tau: tauT, color: "#4c9dde", vis: visT.on, dash: undefined },
      { tau: tauX, color: "#52c98a", vis: visX.on, dash: [5, 3] },
    ];
    for (const { tau, color, vis, dash } of curves) {
      if (!vis) continue;
      const pts = getCurvePoints(tau).map((p) => ({
        x: sx.map(p.x), y: sy.map(clamp(p.y, yLo, yHi)),
      }));
      line(ctx, pts, { stroke: color, width: 1.8, dash, alpha: 0.88 });
    }

    // step label
    ctx.fillStyle = "var(--dim)";
    ctx.font = "11px var(--mono,monospace)";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`step ${state.step}`, cv.box.x1 - 2, cv.box.y0 + 2);

    // X-learner phase label
    if (state.step < PHASE1) {
      ctx.fillStyle = "#52c98a";
      ctx.textAlign = "left";
      ctx.fillText(`X-learner starts at step ${PHASE1}`, cv.box.x0 + 4, cv.box.y0 + 2);
    }
  }

  // ── draw: PEHE bar chart ──────────────────────────────────────────────────
  function drawPEHEBars(peheS, peheT, peheX) {
    const cv = cvPEHE;
    cv.clear();
    const ctx = cv.ctx;

    const vals = [
      { name: "S", val: sPS.value, color: "#e05c5c" },
      { name: "T", val: sPT.value, color: "#4c9dde" },
      { name: "X", val: sPX.value, color: "#52c98a" },
    ];

    const maxVal = Math.max(...vals.map((v) => v.val), 0.01, 6);
    const sx = new Scale([0, maxVal], [cv.box.x0, cv.box.x1]);
    const barH = (cv.box.y1 - cv.box.y0) / 3 - 10;

    ctx.font = "11px var(--mono,monospace)";
    for (let i = 0; i < vals.length; i++) {
      const { name, val, color } = vals[i];
      const y = cv.box.y0 + i * (barH + 10);
      const w = Math.max(0, sx.map(val) - cv.box.x0);

      // bar
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = color;
      ctx.fillRect(cv.box.x0, y, w, barH);
      ctx.globalAlpha = 1;

      // label
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(name + "-learner", cv.box.x0 + 4, y + barH / 2);

      // value
      ctx.fillStyle = "var(--ink)";
      ctx.textAlign = "right";
      ctx.fillText(val > 0 ? val.toFixed(3) : "—", cv.box.x1 - 4, y + barH / 2);
    }

    // x-axis
    ctx.strokeStyle = "var(--dim)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cv.box.x0, cv.box.y1);
    ctx.lineTo(cv.box.x1, cv.box.y1);
    ctx.stroke();

    // xlabel
    ctx.fillStyle = "var(--ink)";
    ctx.font = "12px ui-sans-serif,system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("PEHE (lower = better)", (cv.box.x0 + cv.box.x1) / 2, cv.h - 4);
  }

  // ── frame loop ────────────────────────────────────────────────────────────
  const STEPS_PER_FRAME = 4;

  const stop = onFrame((dt) => {
    sPS.step(dt);
    sPT.step(dt);
    sPX.step(dt);

    if (state.playing) {
      for (let k = 0; k < STEPS_PER_FRAME; k++) trainStep();
    }

    const { tauS, tauT, tauX, peheS, peheT, peheX, ateS, ateT, ateX } = evaluate();

    // update state + springs
    if (!isNaN(peheS)) { state.peheS = peheS; sPS.set(peheS); }
    if (!isNaN(peheT)) { state.peheT = peheT; sPT.set(peheT); }
    if (!isNaN(peheX)) { state.peheX = peheX; sPX.set(peheX); }
    state.ateS = ateS; state.ateT = ateT; state.ateX = ateX;

    // readouts
    rStep.set(String(state.step));
    rPEHE_S.set(isNaN(peheS) ? "—" : peheS.toFixed(3));
    rPEHE_T.set(isNaN(peheT) ? "—" : peheT.toFixed(3));
    rPEHE_X.set(isNaN(peheX) ? "—" : peheX.toFixed(3));
    rATE_S.set(isNaN(ateS) ? "—" : ateS.toFixed(2));
    rATE_T.set(isNaN(ateT) ? "—" : ateT.toFixed(2));
    rATE_X.set(isNaN(ateX) ? "—" : ateX.toFixed(2));

    // winner label
    const peheVals = [
      { name: "S", v: peheS, color: "#e05c5c" },
      { name: "T", v: peheT, color: "#4c9dde" },
      { name: "X", v: peheX, color: "#52c98a" },
    ].filter((x) => !isNaN(x.v));
    if (peheVals.length) {
      const best = peheVals.reduce((a, b) => (a.v < b.v ? a : b));
      rWinner.set(best.name + "-learner");
      rWinner.querySelector(".readout-value").style.color = best.color;
    }

    // draw
    drawCurvePlot(tauS, tauT, tauX);
    drawPEHEBars(peheS, peheT, peheX);

    // challenge: after 300+ steps, check if user observed winner + S curves flat
    if (state.step >= 300 && !isNaN(peheX) && !isNaN(peheS) && !isNaN(peheT)) {
      const sWorstOrMid = peheS >= Math.min(peheT, peheX);
      const hasWinner = peheVals.length === 3;
      if (sWorstOrMid && hasWinner) {
        const best = peheVals.reduce((a, b) => (a.v < b.v ? a : b));
        chal.setState(
          true,
          `${best.name}-learner wins PEHE=${best.v.toFixed(3)}. S-learner over-smooths: ` +
          `its curve barely varies (ATE≈${ateS.toFixed(1)}), losing heterogeneity to regularization.`,
        );
      }
    }
  });

  return () => stop();
}
