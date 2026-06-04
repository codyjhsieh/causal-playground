// Double Machine Learning (Chernozhukov et al. 2018) on REAL 401(k) data.
// The partially linear model Y = θ·D + g(X) + ε_Y, D = m(X) + ε_D where
// Y = nettfa (net financial assets $000), D = e401k (401k eligibility),
// X = [inc, age, fsize, marr, male, pira]. Income confounding is *nonlinear*,
// so a linear OLS control is misspecified and a flexible learner is needed.
// Three estimators race: naive OLS (linear misspecification bias), naive ML
// plug-in (regularization/overfitting bias), and DML with Neyman-orthogonal
// scores + cross-fitting (first-order insensitive to nuisance error).

import { h } from "../lib/dom.js";
import { rows, meta } from "../data/pension401k.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";
import { mean, olsMulti } from "../lib/stats.js";
import { onFrame, lerp, ease } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot, line, histogram } from "../lib/plot.js";
import { MLP } from "../lib/nn.js";
import { lessonLayout, panelSection, slider, toggle, button, readout, challenge } from "../lib/ui.js";

// Literature reference band: DML estimate of 401(k) eligibility on nettfa
// per Chernozhukov et al. 2018 is roughly +9 to +14 ($000).
const LIT_LO = 9.0;
const LIT_HI = 14.0;
const LIT_MID = (LIT_LO + LIT_HI) / 2;

// Feature columns used for confounders
const CONFOUNDER_KEYS = ["inc", "age", "fsize", "marr", "male", "pira"];
const ALL_KEYS = ["e401k", "nettfa", "inc", "age", "fsize", "marr", "male", "pira"];

// Prep complete cases once at module load
const cleanRows = complete(rows, ALL_KEYS);
const N_REAL = cleanRows.length; // ~9275

// ---------------------------------------------------------------------------
// Scaling helpers (fit on full data, apply consistently)
// ---------------------------------------------------------------------------
function fitScaler(vals) {
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, vals.length - 1)) || 1;
  return { mean: m, sd, scale: v => (v - m) / sd, unscale: z => z * sd + m };
}

// Build the scaled dataset for MLP training.
// Returns { data, yScaler, scalers } where data[i] = { X (scaled), D (0/1), Y (scaled), Xraw }
function buildDataset(subsampleRows) {
  const incVals  = subsampleRows.map(r => r.inc);
  const ageVals  = subsampleRows.map(r => r.age);
  const fsizeVals = subsampleRows.map(r => r.fsize);
  const nettfaVals = subsampleRows.map(r => r.nettfa);

  const incSc   = fitScaler(incVals);
  const ageSc   = fitScaler(ageVals);
  const fsizeSc = fitScaler(fsizeVals);
  // Binary vars (marr, male, pira) are already 0/1 — no scaling needed
  const yScaler = fitScaler(nettfaVals);

  const data = subsampleRows.map(r => ({
    X: [
      incSc.scale(r.inc),
      ageSc.scale(r.age),
      fsizeSc.scale(r.fsize),
      r.marr,
      r.male,
      r.pira,
    ],
    D: r.e401k,
    Y: yScaler.scale(r.nettfa),
    Yraw: r.nettfa,
    Xraw: [r.inc, r.age, r.fsize, r.marr, r.male, r.pira],
  }));

  return { data, yScaler, incSc };
}

// ---------------------------------------------------------------------------
// Estimator helpers (operate on scaled { X, D, Y } objects)
// ---------------------------------------------------------------------------

// 1. Naive OLS: nettfa ~ intercept + e401k + inc + age + fsize + marr + male + pira
//    Uses raw (unscaled) values and the full clean dataset so the coefficient is
//    directly in $000 units.
function estimateOLS_raw(subsampleRows) {
  const Xmat = subsampleRows.map(r => [1, r.e401k, r.inc, r.age, r.fsize, r.marr, r.male, r.pira]);
  const yvec = subsampleRows.map(r => r.nettfa);
  const fit = olsMulti(Xmat, yvec);
  return fit.beta[1]; // coefficient on e401k, in $000
}

// Train a tiny MLP for regression. Returns predicted values (flat array).
function trainMLP(Xinput, ytarget, steps, seed, hiddenWidth) {
  const net = new MLP([Xinput[0].length, hiddenWidth, hiddenWidth, 1], { activation: "relu", seed });
  const Y2d = ytarget.map(v => [v]);
  for (let s = 0; s < steps; s++) {
    net.trainStepMSE(Xinput, Y2d, 3e-3, 1e-4);
  }
  return net.predict(Xinput).map(r => r[0]);
}

// 2. Naive ML plug-in (no cross-fitting): fit l̂(X)=E[Y|X] on ALL data, residualize Y,
//    regress on D. Biased by regularization shrinkage toward 0.
function estimateNaiveML(data, steps, hiddenWidth, yScaler) {
  const Xinput = data.map(r => r.X);
  const Yarr   = data.map(r => r.Y);
  const lhat = trainMLP(Xinput, Yarr, steps, 42, hiddenWidth);
  // Ytilde = Y - l̂(X) in scaled space
  const Ytilde = Yarr.map((y, i) => y - lhat[i]);
  const Darr = data.map(r => r.D);
  const num = Darr.reduce((s, d, i) => s + d * Ytilde[i], 0);
  const den = Darr.reduce((s, d) => s + d * d, 0);
  const thetaScaled = den < 1e-10 ? 0 : num / den;
  // Unscale: theta is in units of (scaled Y / D). D is binary 0/1 so unscaling is just * sd_Y
  return thetaScaled * yScaler.sd;
}

// 3. DML: K-fold cross-fitting, Neyman-orthogonal Robinson estimator.
function estimateDML(data, K, steps, hiddenWidth, crossFit, yScaler) {
  const n = data.length;
  const foldSize = Math.floor(n / K);
  const Ytildes = new Array(n).fill(0); // scaled
  const Dtildes = new Array(n).fill(0);
  const P = data[0].X.length;

  if (!crossFit) {
    // naive ML but also partial out D — no cross-fitting
    const Xinput = data.map(r => r.X);
    const Yarr   = data.map(r => r.Y);
    const Darr   = data.map(r => r.D);
    const lhat = trainMLP(Xinput, Yarr, steps, 11, hiddenWidth);
    const mhat = trainMLP(Xinput, Darr, steps, 22, hiddenWidth);
    for (let i = 0; i < n; i++) {
      Ytildes[i] = Yarr[i] - lhat[i];
      Dtildes[i] = Darr[i] - mhat[i];
    }
  } else {
    const indices = Array.from({ length: n }, (_, i) => i);
    for (let k = 0; k < K; k++) {
      const lo = k * foldSize;
      const hi = k === K - 1 ? n : lo + foldSize;
      const trainIdx = indices.filter(i => i < lo || i >= hi);
      const testIdx  = indices.filter(i => i >= lo && i < hi);
      const trainData = trainIdx.map(i => data[i]);
      const Xtrain = trainData.map(r => r.X);
      const Ytrain = trainData.map(r => r.Y);
      const Dtrain = trainData.map(r => r.D);

      const lhat_net = new MLP([P, hiddenWidth, hiddenWidth, 1], { activation: "relu", seed: 100 + k });
      const mhat_net = new MLP([P, hiddenWidth, hiddenWidth, 1], { activation: "relu", seed: 200 + k });
      const Ytrain2d = Ytrain.map(v => [v]);
      const Dtrain2d = Dtrain.map(v => [v]);
      for (let s = 0; s < steps; s++) {
        lhat_net.trainStepMSE(Xtrain, Ytrain2d, 3e-3, 1e-4);
        mhat_net.trainStepMSE(Xtrain, Dtrain2d, 3e-3, 1e-4);
      }
      const Xtest = testIdx.map(i => data[i].X);
      const lhat_test = lhat_net.predict(Xtest).map(r => r[0]);
      const mhat_test = mhat_net.predict(Xtest).map(r => r[0]);
      testIdx.forEach((gi, li) => {
        Ytildes[gi] = data[gi].Y - lhat_test[li];
        Dtildes[gi] = data[gi].D - mhat_test[li];
      });
    }
  }

  const num = Dtildes.reduce((s, d, i) => s + d * Ytildes[i], 0);
  const den = Dtildes.reduce((s, d) => s + d * d, 0);
  const thetaScaled = den < 1e-10 ? 0 : num / den;
  const theta = thetaScaled * yScaler.sd;
  return { theta, Ytildes, Dtildes };
}

// ---------------------------------------------------------------------------
// Module mount
// ---------------------------------------------------------------------------
export function mount(root) {
  const title = "Double Machine Learning";
  const idea = "Y = θ·D + g(X) + ε, D = m(X) + ε. On real 401(k) data, income confounds both eligibility and assets via a NONLINEAR relationship. Plug in an ML estimate of g naively and regularization bias shifts θ̂. Neyman-orthogonal scores + cross-fitting remove the bias — DML converges on the literature estimate (+$9–14k) while naive plug-in diverges.";
  const { root: layout, stage, panel, caption } = lessonLayout({ title, idea });
  root.appendChild(layout);

  // inject css once
  if (!document.getElementById("dml-css")) {
    const sty = document.createElement("style");
    sty.id = "dml-css";
    sty.textContent = `
      .dml-stage { display:flex; flex-direction:column; gap:8px; align-items:center; }
      .dml-row   { display:flex; gap:8px; }
      .dml-label { font:11px ui-monospace,monospace; fill:var(--dim); text-anchor:middle; }
      .dml-phase-label { font:11px ui-sans-serif,system-ui; color:var(--dim); text-align:center; margin:0; }
      .dml-phase-wrap { display:flex; flex-direction:column; align-items:center; gap:2px; }
    `;
    document.head.appendChild(sty);
  }

  // ---- state ----
  const state = {
    crossFit: true,
    K: 2,
    hiddenWidth: 16,
    mlSteps: 180,
    morphT: 0,
    morphDir: 1,
    simRunning: false,
    subsampleN: 600, // subsample of real data for fast recompute
    subsampleSeed: 0,
  };

  let mainData = [];   // scaled { X, D, Y, Yraw, Xraw }
  let mainSubRows = []; // the raw rows used this pass
  let mainYScaler = { sd: 1, mean: 0, scale: v => v, unscale: v => v };
  let mainOLS = NaN, mainNaiveML = NaN, mainDML = NaN;
  let dmlResult = { theta: NaN, Ytildes: [], Dtildes: [] };

  // For visualization: nuisance fit on full subsample (for partial-out scatter)
  let vizLhat = [];   // E[Y|X] scaled predictions
  let vizMhat = [];   // E[D|X] predictions

  // sampling distribution accumulators (bootstrap resamples of real data)
  const simsOLS = [], simsNaiveML = [], simsDML = [];

  // ---- canvases ----
  const cvY     = new Canvas(178, 168, { margin: { t: 22, r: 10, b: 30, l: 36 } });
  const cvD     = new Canvas(178, 168, { margin: { t: 22, r: 10, b: 30, l: 36 } });
  const cvFinal = new Canvas(200, 168, { margin: { t: 22, r: 14, b: 30, l: 36 } });
  const cvHist  = new Canvas(570, 180, { margin: { t: 20, r: 18, b: 36, l: 44 } });

  const labelY     = h("p", { class: "dml-phase-label", text: "partial out Y (nettfa)" });
  const labelD     = h("p", { class: "dml-phase-label", text: "partial out D (e401k)" });
  const labelFinal = h("p", { class: "dml-phase-label", text: "Ỹ vs D̃  →  θ̂" });
  const labelHist  = h("p", { class: "dml-phase-label", text: "sampling distributions  (bootstrap resamples)" });

  stage.className = "dml-stage";
  stage.append(
    h("div", { class: "dml-row" }, [
      h("div", { class: "dml-phase-wrap" }, [labelY,     cvY.el]),
      h("div", { class: "dml-phase-wrap" }, [labelD,     cvD.el]),
      h("div", { class: "dml-phase-wrap" }, [labelFinal, cvFinal.el]),
    ]),
    h("div", { class: "dml-phase-wrap", style: { width: "100%" } }, [labelHist, cvHist.el]),
  );

  // ---- readouts ----
  const rLit      = readout({ label: "Literature",   value: "~+$13k",  accent: "var(--gold)" });
  const rOLS      = readout({ label: "Naive OLS",    value: "—",       accent: "var(--neg)" });
  const rNaiveML  = readout({ label: "Naive ML",     value: "—",       accent: "var(--accent2)" });
  const rDML      = readout({ label: "DML θ̂ ($k)",  value: "—",       accent: "var(--pos)" });
  const rN        = readout({ label: "N (real)",     value: String(N_REAL) });
  const rDiff     = readout({ label: "DML vs Naive", value: "—" });

  const chal = challenge({ goal: "Enable cross-fitting so the DML estimate is positive, stable, and separated from the (more biased) naive-ML plug-in — demonstrating Neyman orthogonality on real data." });

  // ---- controls ----
  const tglCrossFit = toggle({
    label: "Cross-fitting",
    value: state.crossFit,
    hint: "(toggle to see regularization bias appear/vanish)",
    onToggle: v => { state.crossFit = v; recompute(); },
  });
  const slK = slider({
    label: "Folds K",
    min: 2, max: 5, step: 1, value: state.K,
    fmt: v => String(Math.round(v)),
    onInput: v => { state.K = Math.round(v); recompute(); },
  });
  const slWidth = slider({
    label: "ML hidden width",
    min: 8, max: 32, step: 4, value: state.hiddenWidth,
    fmt: v => String(Math.round(v)),
    onInput: v => { state.hiddenWidth = Math.round(v); recompute(); },
  });

  const btnNewSample = button("new subsample", () => {
    state.subsampleSeed = (state.subsampleSeed + 1) % 9999 + 1;
    recompute();
  }, { primary: false });
  const btnAnimate = button("morph residuals", () => {
    state.morphDir = state.morphT > 0.5 ? -1 : 1;
  });
  const btnRunSims = button("run 80 bootstraps", () => runSims(80), { primary: true });
  const btnClearSims = button("clear", () => {
    simsOLS.length = 0; simsNaiveML.length = 0; simsDML.length = 0;
  });

  // Prepend data badge to panel
  const badge = dataBadge(meta);
  panel.prepend(badge);

  panel.append(
    panelSection("Estimates (one subsample, $000 units)", h("div", { class: "readout-grid" }, [rLit, rOLS, rNaiveML, rDML])),
    panelSection("Info", h("div", { class: "readout-grid" }, [rN, rDiff])),
    panelSection("Controls", [tglCrossFit, slK, slWidth]),
    panelSection("Run", [
      h("div", { class: "btn-row" }, [btnNewSample, btnAnimate]),
      h("div", { class: "btn-row" }, [btnRunSims, btnClearSims]),
    ]),
    panelSection("Challenge", chal),
  );

  caption.innerHTML =
    "<strong>Real data</strong>: 401(k) eligibility & net financial assets from " +
    "Poterba, Venti & Wise (1994). Income is the primary confounder — higher income predicts " +
    "both 401(k) offering jobs and more savings — and the relationship is strongly nonlinear, " +
    "so linear OLS control is misspecified. " +
    "<strong>Neyman orthogonality</strong>: the DML score ψ(Y,D,θ,η) has zero derivative " +
    "w.r.t. the nuisance η at the truth, so first-order nuisance errors cancel. " +
    "<strong>Cross-fitting</strong>: training on complement folds and predicting on held-out " +
    "folds eliminates the overfitting bias that plagues naive plug-in estimators. Together they " +
    "allow flexible ML learners in causal models without contaminating θ. " +
    "The literature DML estimate is ~+$9–14k (reference band in histogram). — " +
    "Chernozhukov, Chetverikov, Demirer, Duflo, Hansen, Newey, Robins, " +
    "<em>Double/Debiased Machine Learning</em>, Econometrics Journal 2018.";

  // ---- subsample helper ----
  // Deterministic subsample by striding (avoids needing RNG import)
  function getSubsample(n, seed) {
    const out = [];
    const step = Math.max(1, Math.floor(N_REAL / n));
    const offset = seed % step;
    for (let i = offset; i < N_REAL && out.length < n; i += step) {
      out.push(cleanRows[i]);
    }
    return out;
  }

  // ---- compute main dataset ----
  function recompute() {
    mainSubRows = getSubsample(state.subsampleN, state.subsampleSeed);
    const built = buildDataset(mainSubRows);
    mainData = built.data;
    mainYScaler = built.yScaler;

    // Naive OLS on raw values
    mainOLS = estimateOLS_raw(mainSubRows);

    // Visualization nuisances (no cross-fit, for scatter)
    const Xinput = mainData.map(r => r.X);
    const Yarr   = mainData.map(r => r.Y);
    const Darr   = mainData.map(r => r.D);
    vizLhat = trainMLP(Xinput, Yarr, state.mlSteps, 7, state.hiddenWidth);
    vizMhat = trainMLP(Xinput, Darr, state.mlSteps, 13, state.hiddenWidth);

    mainNaiveML = estimateNaiveML(mainData, state.mlSteps, state.hiddenWidth, mainYScaler);

    dmlResult = estimateDML(mainData, state.K, state.mlSteps, state.hiddenWidth, state.crossFit, mainYScaler);
    mainDML = dmlResult.theta;
  }

  recompute();

  // ---- simulation bootstraps (resample from real data) ----
  function runSims(count) {
    const simN = 400;
    const simSteps = 120;
    const simWidth = 12;
    for (let r = 0; r < count; r++) {
      const seed = 10000 + simsOLS.length + r;
      const subRows = getSubsample(simN, seed);
      const built = buildDataset(subRows);
      const dat = built.data;
      const ySc = built.yScaler;

      simsOLS.push(estimateOLS_raw(subRows));
      simsNaiveML.push(estimateNaiveML(dat, simSteps, simWidth, ySc));
      const dmlR = estimateDML(dat, state.K, simSteps, simWidth, state.crossFit, ySc);
      simsDML.push(dmlR.theta);
    }
  }

  // ---- drawing helpers ----

  // For the partial-out scatter: use scaled income (Xraw[0]) as x-axis, since it's the
  // key nonlinear confounder. Show Y (or residual) vs income.
  const SCATTER_N = 100;
  function getScatterIdx(n) {
    const step = Math.max(1, Math.floor(n / SCATTER_N));
    const out = [];
    for (let i = 0; i < n && out.length < SCATTER_N; i += step) out.push(i);
    return out;
  }

  function drawResidualPanel(cv, xVals, yRaw, yResid, morphT, fitX, fitYraw, xlabel, ylabel, yResidLabel) {
    cv.clear();
    const allX = [...xVals, ...fitX];
    const allY = [...yRaw, ...yResid];
    const xRange = [Math.min(...allX) - 0.5, Math.max(...allX) + 0.5];
    const yRange = [Math.min(...allY) - 0.3, Math.max(...allY) + 0.3];
    const sx = new Scale(xRange, [cv.box.x0, cv.box.x1]);
    const sy = new Scale(yRange, [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel, ylabel: morphT > 0.5 ? yResidLabel : ylabel, grid: false });

    const ctx = cv.ctx;
    // fitted curve: sort by x, trace polyline for raw only
    const sorted = fitX.map((x, i) => ({ x, y: fitYraw[i] })).sort((a, b) => a.x - b.x);
    if (sorted.length > 1 && morphT < 0.98) {
      ctx.save();
      ctx.globalAlpha = 1 - morphT * 0.9;
      ctx.strokeStyle = "var(--accent2)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(sx.map(sorted[0].x), sy.map(sorted[0].y));
      for (let i = 1; i < sorted.length; i++) ctx.lineTo(sx.map(sorted[i].x), sy.map(sorted[i].y));
      ctx.stroke();
      ctx.restore();
    }

    // dots: morph y from raw to residual
    for (let ii = 0; ii < xVals.length; ii++) {
      const px = sx.map(xVals[ii]);
      const pyRaw   = sy.map(yRaw[ii]);
      const pyResid = sy.map(yResid[ii]);
      const py = lerp(pyRaw, pyResid, ease.inOut(morphT));
      const alpha = 0.55 + 0.1 * morphT;
      const c = morphT > 0.5 ? "var(--accent)" : "var(--dim)";
      dot(ctx, px, py, 2.4, c, { alpha });
    }
  }

  function drawFinalPanel(cv, Dtildes, Ytildes, theta, yScaler) {
    cv.clear();
    const scatterIdx = getScatterIdx(Dtildes.length);
    const dx = scatterIdx.map(i => Dtildes[i]);
    // Convert scaled Ytildes back to $000 for the scatter
    const dy = scatterIdx.map(i => Ytildes[i] * yScaler.sd);
    if (dx.length < 4) return;
    const xr = [Math.min(...dx) - 0.1, Math.max(...dx) + 0.1];
    const yr = [Math.min(...dy) - 1, Math.max(...dy) + 1];
    const sx = new Scale(xr, [cv.box.x0, cv.box.x1]);
    const sy = new Scale(yr, [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel: "D̃ (eligibility residual)", ylabel: "Ỹ ($k)", grid: false });
    const ctx = cv.ctx;
    for (let ii = 0; ii < dx.length; ii++) {
      dot(ctx, sx.map(dx[ii]), sy.map(dy[ii]), 2.4, "var(--accent)", { alpha: 0.55 });
    }
    if (isFinite(theta)) {
      const intcpt = mean(dy) - theta * mean(dx);
      const pts = xr.map(x => ({ x: sx.map(x), y: sy.map(theta * x + intcpt) }));
      line(ctx, pts, { stroke: "var(--gold)", width: 2.2 });
      ctx.save();
      ctx.fillStyle = "var(--gold)";
      ctx.font = "bold 11px ui-monospace,monospace";
      ctx.textAlign = "right";
      ctx.fillText(`θ̂ = ${theta.toFixed(1)}k`, cv.box.x1 - 2, cv.box.y0 + 14);
      ctx.restore();
    }
  }

  function drawHist(cv) {
    cv.clear();
    const ctx = cv.ctx;
    if (!simsOLS.length && !simsDML.length) {
      ctx.fillStyle = "var(--dim)";
      ctx.font = "12px ui-sans-serif,system-ui";
      ctx.textAlign = "center";
      ctx.fillText("click 'run 80 bootstraps' to build sampling distributions", cv.w / 2, cv.h / 2);
      return;
    }
    const allVals = [...simsOLS, ...simsNaiveML, ...simsDML];
    const lo = Math.min(LIT_LO - 15, Math.min(...allVals) - 1);
    const hi = Math.max(LIT_HI + 15, Math.max(...allVals) + 1);
    const sx = new Scale([lo, hi], [cv.box.x0, cv.box.x1]);
    const BINS = 35;

    function histBins(vals) {
      return histogram(vals, BINS, lo, hi);
    }

    function drawHistBars(vals, color) {
      if (!vals.length) return;
      const bins = histBins(vals);
      const maxC = Math.max(...bins.map(b => b.count), 1);
      const sy = new Scale([0, maxC], [cv.box.y1, cv.box.y0]);
      for (const b of bins) {
        const x0 = sx.map(b.x0), x1 = sx.map(b.x1);
        const yy = sy.map(b.count);
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = color;
        ctx.fillRect(x0 + 0.5, yy, Math.max(1, x1 - x0 - 1), cv.box.y1 - yy);
      }
      ctx.globalAlpha = 1;
    }

    if (simsOLS.length)     drawHistBars(simsOLS,     "#ff6b8a");
    if (simsNaiveML.length) drawHistBars(simsNaiveML, "#7c6cff");
    if (simsDML.length)     drawHistBars(simsDML,     "#36d6c3");

    const maxAny = Math.max(
      ...(simsOLS.length     ? histBins(simsOLS)     : [{ count: 1 }]).map(b => b.count),
      ...(simsNaiveML.length ? histBins(simsNaiveML) : [{ count: 1 }]).map(b => b.count),
      ...(simsDML.length     ? histBins(simsDML)     : [{ count: 1 }]).map(b => b.count),
    );
    const sy = new Scale([0, maxAny], [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel: "θ̂  ($000 effect of 401k eligibility on net assets)", grid: false });

    // Literature reference band [9, 14]
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = "var(--gold)";
    ctx.fillRect(sx.map(LIT_LO), cv.box.y0, sx.map(LIT_HI) - sx.map(LIT_LO), cv.box.y1 - cv.box.y0);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "var(--gold)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    const lmx = sx.map(LIT_MID);
    ctx.beginPath(); ctx.moveTo(lmx, cv.box.y0); ctx.lineTo(lmx, cv.box.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "var(--gold)";
    ctx.font = "10px ui-monospace,monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("literature ~+$13k", lmx, cv.box.y0 + 2);
    ctx.restore();

    // mean lines + legend
    const entries = [
      { vals: simsOLS,     color: "#ff6b8a", label: "OLS" },
      { vals: simsNaiveML, color: "#7c6cff", label: "Naive ML" },
      { vals: simsDML,     color: "#36d6c3", label: "DML" },
    ];
    let legendX = cv.box.x0 + 6;
    const legendY = cv.box.y0 + 4;
    for (const e of entries) {
      if (!e.vals.length) continue;
      const m = mean(e.vals);
      const mx = sx.map(m);
      ctx.save();
      ctx.strokeStyle = e.color; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(mx, cv.box.y0); ctx.lineTo(mx, cv.box.y1); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = e.color; ctx.font = "bold 10px ui-monospace,monospace";
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(`${e.label}: +${m.toFixed(1)}k`, legendX, legendY);
      legendX += ctx.measureText(`${e.label}: +${m.toFixed(1)}k`).width + 14;
      ctx.restore();
    }
  }

  // ---- animation loop ----
  const stop = onFrame((dt) => {
    state.morphT = Math.max(0, Math.min(1, state.morphT + state.morphDir * dt * 0.9));

    if (!mainData.length) return;

    const scatterIdx = getScatterIdx(mainData.length);
    // X axis for partial-out: scaled income (index 0 in X)
    const xVals   = scatterIdx.map(i => mainData[i].X[0]); // scaled income
    const yRaw    = scatterIdx.map(i => mainData[i].Y);     // scaled nettfa
    const yRes    = scatterIdx.map(i => mainData[i].Y - (vizLhat[i] ?? 0));
    const dRaw    = scatterIdx.map(i => mainData[i].D);
    const dRes    = scatterIdx.map(i => mainData[i].D - (vizMhat[i] ?? 0));
    const fitYraw = scatterIdx.map(i => vizLhat[i] ?? mainData[i].Y);
    const fitMraw = scatterIdx.map(i => vizMhat[i] ?? mainData[i].D);

    drawResidualPanel(cvY, xVals, yRaw, yRes, state.morphT, xVals, fitYraw,
      "income (z)", "nettfa (z)", "Ỹ = Y−l̂(X)");
    drawResidualPanel(cvD, xVals, dRaw, dRes, state.morphT, xVals, fitMraw,
      "income (z)", "e401k", "D̃ = D−m̂(X)");

    drawFinalPanel(cvFinal, dmlResult.Dtildes, dmlResult.Ytildes, mainDML, mainYScaler);
    drawHist(cvHist);

    // readout updates (all in $000)
    if (isFinite(mainOLS)) {
      rOLS.set(`+${mainOLS.toFixed(1)}k`);
    }
    if (isFinite(mainNaiveML)) {
      rNaiveML.set(`+${mainNaiveML.toFixed(1)}k`);
    }
    if (isFinite(mainDML)) {
      rDML.set(`+${mainDML.toFixed(1)}k`);
      if (isFinite(mainNaiveML)) {
        const diff = mainDML - mainNaiveML;
        rDiff.set((diff >= 0 ? "+" : "") + diff.toFixed(1) + "k");
        rDiff.querySelector(".readout-value").style.color =
          state.crossFit ? "var(--pos)" : "var(--neg)";
      }
    }

    // challenge: cross-fitting ON, DML near literature range, DML ≠ naive ML
    if (simsDML.length >= 30 && simsNaiveML.length >= 30) {
      const dmlMean = mean(simsDML);
      const nmlMean = mean(simsNaiveML);
      const dmlNearLit = dmlMean >= LIT_LO - 4 && dmlMean <= LIT_HI + 4;
      const dmlDistinctFromNaive = Math.abs(dmlMean - nmlMean) > 2.0;
      if (state.crossFit && dmlNearLit && dmlDistinctFromNaive) {
        chal.setState(true,
          `DML ${dmlMean.toFixed(1)}k ≈ literature band (${LIT_LO}–${LIT_HI}k); Naive ML ${nmlMean.toFixed(1)}k`);
      } else {
        chal.setState(false);
      }
    }
  });

  return () => stop();
}
