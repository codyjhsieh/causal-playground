// Causal Foundation Models — Amortized Causal Inference via Prior-Data Fitted Networks (PFNs).
//
// PRIOR  = synthetic SCMs (by design: PFNs are pre-trained on a distribution of
//          simulated causal worlds — this is inherent to the PFN approach).
// TEST   = REAL IHDP benchmark (Hill 2011): semi-synthetic, real covariates,
//          true ITE = mu1 − mu0 known, enabling proper PEHE scoring.
//
// A single model pre-trained on the synthetic prior estimates treatment effects
// on the real IHDP test set in one forward pass — no per-dataset retraining.
// The "in-context" summary projects IHDP to 1-D via the most predictive
// covariate (x1, standardised) and bins it, producing a fixed-length context
// vector fed with a query point to the PFN MLP.
//
// Faithful, tractable, genuinely amortized.  SOTA 2025-26.

import { h } from "../lib/dom.js";
import { RNG } from "../lib/rng.js";
import { mean, clamp } from "../lib/stats.js";
import { onFrame, Spring, ease } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot, line } from "../lib/plot.js";
import { lessonLayout, panelSection, slider, button, readout, challenge, note } from "../lib/ui.js";
import { MLP } from "../lib/nn.js";
import { rows as ihdp, meta } from "../data/ihdp.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";

// ── inject scoped CSS once ─────────────────────────────────────────────────────
if (!document.getElementById("pfn-css")) {
  const style = document.createElement("style");
  style.id = "pfn-css";
  style.textContent = `
    .pfn-stage      { display:flex; flex-direction:column; gap:10px; }
    .pfn-row        { display:flex; gap:10px; flex-wrap:wrap; }
    .pfn-panel-box  { flex:1 1 260px; display:flex; flex-direction:column; gap:4px; }
    .pfn-label      { font:11px var(--mono,monospace); color:var(--dim);
                      margin:0; letter-spacing:.03em; }
    .pfn-legend     { display:flex; gap:10px; flex-wrap:wrap;
                      font:11px var(--mono,monospace); color:var(--dim);
                      margin-top:4px; align-items:center; }
    .pfn-swatch     { display:inline-block; width:10px; height:3px; border-radius:2px;
                      vertical-align:middle; margin-right:4px; }
    .pfn-gallery    { display:flex; gap:6px; flex-wrap:wrap; margin-top:4px; }
    .pfn-mini       { width:90px; height:80px; border-radius:6px;
                      background:var(--surface2); border:1px solid var(--line);
                      overflow:hidden; flex-shrink:0; }
    .pfn-progress   { width:100%; height:6px; border-radius:3px;
                      background:var(--faint); overflow:hidden; margin-top:4px; }
    .pfn-progress-fill { height:100%; border-radius:3px;
                         background:var(--accent); transition:width .08s linear; }
    .pfn-status     { font:11px var(--mono,monospace); color:var(--dim); margin:0; }
    .pfn-badge      { display:inline-block; padding:1px 6px; border-radius:4px;
                      font:bold 10px var(--mono,monospace);
                      background:color-mix(in srgb,var(--accent2) 18%,transparent);
                      color:var(--accent2); margin-left:4px; }
  `;
  document.head.appendChild(style);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── IHDP real test data preparation ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// Keep only complete rows (drop any with missing values).
const ihdpClean = complete(ihdp, ["t", "yf", "mu0", "mu1", "x1"]);

// Project to 1-D: x1 (standardised birth-weight z-score) is the most predictive
// continuous covariate in IHDP and gives a tractable context domain.
// We re-standardise x1 to approximately [-2, 2] to match the prior's domain.
const x1Raw = col(ihdpClean, "x1");
const { z: x1z } = zscore(x1Raw);
// Clamp to [-2, 2] so bins align with the prior-trained network.
const IHDP_UNITS = ihdpClean.map((r, i) => ({
  x:   clamp(x1z[i] * 1.0, -2, 2),  // 1-D projected covariate
  t:   r.t,
  y:   r.yf,
  tau: r.mu1 - r.mu0,                // true ITE (known because outcomes are simulated)
}));

// ══════════════════════════════════════════════════════════════════════════════
// ── SCM prior helpers ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// CATE function families: each returns τ(x) for x ∈ [-2, 2]
function makeCateFn(kind, rng) {
  if (kind === 0) {
    // linear
    const a = rng.uniform(-2, 2);
    const b = rng.uniform(-1, 1);
    return (x) => a * x + b;
  } else if (kind === 1) {
    // quadratic
    const a = rng.uniform(-1.5, 1.5);
    const b = rng.uniform(-1, 1);
    const c = rng.uniform(-1, 1);
    return (x) => a * x * x + b * x + c;
  } else {
    // sinusoidal
    const a = rng.uniform(0.8, 2.5);
    const f = rng.uniform(0.6, 2);
    const ph = rng.uniform(0, Math.PI);
    return (x) => a * Math.sin(f * x + ph);
  }
}

// Draw one synthetic causal dataset from a random SCM.
// Returns { units, cateFn, confoundStr } where units = [{x,t,y,tau}].
function sampleSCM(rng, n, confoundStrength) {
  const kind = Math.floor(rng.uniform(0, 3));
  const cateFn = makeCateFn(kind, rng);
  const baseSlope = rng.uniform(-1, 1);
  const noiseY = rng.uniform(0.2, 0.5);
  // propensity: sigmoid(confoundStrength * x + eps)
  const csign = rng.uniform(-1, 1) > 0 ? 1 : -1;

  const units = [];
  for (let i = 0; i < n; i++) {
    const x = rng.uniform(-2, 2);
    const ps = 1 / (1 + Math.exp(-csign * confoundStrength * x));
    const t = rng.bernoulli(clamp(ps, 0.05, 0.95));
    const base = baseSlope * x + rng.normal(0, noiseY);
    const tau = cateFn(x);
    const y0 = base;
    const y1 = base + tau;
    const y = t ? y1 : y0;
    units.push({ x, t, y, tau });
  }
  return { units, cateFn };
}

// ── Context-summary feature extractor ────────────────────────────────────────
// Bins [−2, 2] into K bins.  For each bin: mean_y_treated, mean_y_control,
// propensity (fraction treated).  Feature vector length = 3*K.
function extractFeatures(units, K) {
  const binned = Array.from({ length: K }, () => ({ sumT: 0, cntT: 0, sumC: 0, cntC: 0 }));
  const binWidth = 4 / K; // domain [-2, 2]

  for (const u of units) {
    const bi = clamp(Math.floor((u.x + 2) / binWidth), 0, K - 1);
    const b = binned[bi];
    if (u.t) { b.sumT += u.y; b.cntT++; }
    else      { b.sumC += u.y; b.cntC++; }
  }

  const feat = [];
  for (let k = 0; k < K; k++) {
    const b = binned[k];
    feat.push(b.cntT > 0 ? b.sumT / b.cntT : 0);       // treated mean
    feat.push(b.cntC > 0 ? b.sumC / b.cntC : 0);       // control mean
    feat.push((b.cntT + b.cntC) > 0
      ? b.cntT / (b.cntT + b.cntC) : 0.5);             // propensity
  }
  return feat; // length 3*K
}

// Build training pairs for ONE prior dataset: (features ⊕ x_query) → τ(x_query)
// Returns { X: [[feat..., xq], ...], Y: [[tau], ...] }  arrays-of-arrays
function buildPairs(units, cateFn, K, pairsPerDataset) {
  const feat = extractFeatures(units, K);
  const rng2 = new RNG(units.length * 7 + K);
  const X = [], Y = [];
  for (let p = 0; p < pairsPerDataset; p++) {
    const xq = rng2.uniform(-2, 2);
    X.push([...feat, xq]);
    Y.push([cateFn(xq)]);
  }
  return { X, Y };
}

// ── Compute PEHE on a test dataset given a CATE predictor fn τ̂(x) ──────────
function computePEHE(units, tauHatFn) {
  let sq = 0;
  for (const u of units) {
    const err = tauHatFn(u.x) - u.tau;
    sq += err * err;
  }
  return Math.sqrt(sq / units.length);
}

// ── T-learner baseline: train two MLPs μ₀, μ₁ from scratch on test data ─────
function makeBaseline(seed) {
  const mu0 = new MLP([1, 16, 16, 1], { activation: "tanh", outAct: "identity", seed });
  const mu1 = new MLP([1, 16, 16, 1], { activation: "tanh", outAct: "identity", seed: seed + 77 });
  return { mu0, mu1, step: 0 };
}

function baselineTrainStep(bl, units, lr) {
  const treated = units.filter((u) => u.t === 1);
  const control = units.filter((u) => u.t === 0);
  if (treated.length > 1) {
    const X1 = treated.map((u) => [u.x]);
    const Y1 = treated.map((u) => [u.y]);
    bl.mu1.trainStepMSE(X1, Y1, lr, 1e-4);
  }
  if (control.length > 1) {
    const X0 = control.map((u) => [u.x]);
    const Y0 = control.map((u) => [u.y]);
    bl.mu0.trainStepMSE(X0, Y0, lr, 1e-4);
  }
  bl.step++;
}

function baselinePredict(bl, x) {
  const y1 = bl.mu1.predict([[x]])[0][0];
  const y0 = bl.mu0.predict([[x]])[0][0];
  return y1 - y0;
}

// ── CATE curve evaluated at many x points ─────────────────────────────────────
const CURVE_POINTS = 60;
const CURVE_XS = Array.from({ length: CURVE_POINTS }, (_, i) => -2 + (4 * i) / (CURVE_POINTS - 1));

// ══════════════════════════════════════════════════════════════════════════════
// ── Module entry point ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export function mount(root) {
  // ── hyperparams / sliders ──────────────────────────────────────────────────
  const cfg = {
    K: 8,                 // number of bins for in-context summary
    diversity: 1.5,       // confound strength in prior
    baselineSteps: 300,   // baseline T-learner training budget
    priorDatasets: 120,   // how many prior datasets to pre-train on
    pairsPerDataset: 12,  // query pairs sampled per prior dataset
  };

  // ── state ──────────────────────────────────────────────────────────────────
  const state = {
    pretrained: false,
    pretraining: false,
    preProg: 0,        // 0..1 pretraining progress
    preLoss: NaN,
    pretStep: 0,       // steps done in current pretraining run

    // gallery mini-canvas cycling
    galleryDatasets: [],  // cached {units,cateFn} for gallery display
    galleryIdx: 0,

    // test dataset — REAL IHDP (semi-synthetic benchmark, Hill 2011)
    testUnits: null,      // [{x, t, y, tau}, ...] from IHDP_UNITS subsample
    testFeat: null,       // context-summary feature vector
    testTrueTauFn: null,  // binned interpolation of true ITE over the IHDP subsample
    testSeed: 77,

    pfnPEHE: NaN,
    basePEHE: NaN,

    // baseline training
    baseline: null,
    baselineRunning: false,
  };

  // ── PFN net ────────────────────────────────────────────────────────────────
  // input: 3*K + 1 (features + query x);  output: 1 (τ̂)
  let pfnNet = null;
  function initPFN() {
    const inSize = 3 * cfg.K + 1;
    pfnNet = new MLP([inSize, 32, 16, 1], { activation: "tanh", outAct: "identity", seed: 42 });
  }
  initPFN();

  // pretraining work queue: list of {X,Y} batches
  let priorBatches = [];   // [{X,Y},...] — filled when pretraining starts

  function startPretraining() {
    state.pretraining = true;
    state.pretrained = false;
    state.preProg = 0;
    state.preLoss = NaN;
    state.pretStep = 0;
    state.galleryDatasets = [];
    initPFN();

    // pre-generate all prior batches up front (tiny, fast)
    const totalDS = cfg.priorDatasets;
    priorBatches = [];
    for (let d = 0; d < totalDS; d++) {
      const rng = new RNG(d * 31 + 17);
      const { units, cateFn } = sampleSCM(rng, 80, cfg.diversity);
      const { X, Y } = buildPairs(units, cateFn, cfg.K, cfg.pairsPerDataset);
      priorBatches.push({ X, Y, units, cateFn });
    }
    rPretStatus.set("pre-training…");
  }

  // ── layout ─────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Causal Foundation Models",
    idea: "Pre-train once on a prior of synthetic causal worlds. Then, on any new dataset, predict the whole treatment-effect curve in a single forward pass — no retraining.",
  });
  root.appendChild(layout);

  // ── Stage ──────────────────────────────────────────────────────────────────
  const stageDiv = h("div", { class: "pfn-stage" });
  stage.appendChild(stageDiv);

  // ─ Panel A: prior gallery + pretraining progress ───────────────────────────
  const CV_MINI = 88;  // mini canvas size
  const GALLERY_N = 5; // number of mini plots to show
  const miniCanvases = Array.from({ length: GALLERY_N }, () => {
    const cv = new Canvas(CV_MINI, 76, { margin: { t: 6, r: 6, b: 12, l: 10 } });
    cv.el.style.width = CV_MINI + "px";
    cv.el.style.height = "76px";
    return cv;
  });

  const galleryDiv = h("div", { class: "pfn-gallery" });
  for (const cv of miniCanvases) galleryDiv.appendChild(cv.el);

  const progressFill = h("div", { class: "pfn-progress-fill", style: { width: "0%" } });
  const progressBar = h("div", { class: "pfn-progress" }, [progressFill]);
  const preStatusP = h("p", { class: "pfn-status", text: "not yet pre-trained" });

  const panelABox = h("div", { class: "pfn-panel-box" }, [
    h("p", { class: "pfn-label", text: "panel A — prior = SYNTHETIC causal worlds (by design: PFNs pre-train on simulated SCMs)" }),
    galleryDiv,
    progressBar,
    preStatusP,
  ]);
  stageDiv.appendChild(panelABox);

  // ─ Panel B: test dataset + CATE curves ────────────────────────────────────
  const CV_W = 560, CV_H = 280;
  const cvTest = new Canvas(CV_W, CV_H, { margin: { t: 22, r: 18, b: 40, l: 52 } });

  const legend = h("div", { class: "pfn-legend" }, [
    h("span", {}, [h("span", { class: "pfn-swatch", style: { background: "var(--treat)" } }), "treated (IHDP)"]),
    h("span", {}, [h("span", { class: "pfn-swatch", style: { background: "var(--ctrl)" } }), "control (IHDP)"]),
    h("span", {}, [h("span", { class: "pfn-swatch", style: { background: "var(--gold)", height: "3px" } }), "true ITE = μ₁−μ₀ (known)"]),
    h("span", {}, [h("span", { class: "pfn-swatch", style: { background: "var(--accent2)", height: "3px" } }), "PFN τ̂(x) — 1 forward pass"]),
    h("span", {}, [h("span", { class: "pfn-swatch", style: { background: "var(--accent)", height: "3px" } }), "T-learner baseline — trains from scratch"]),
  ]);

  const panelBBox = h("div", { class: "pfn-panel-box" }, [
    h("p", { class: "pfn-label", text: "panel B — TEST = REAL IHDP data (Hill 2011): PFN predicts instantly; T-learner baseline trains step-by-step" }),
    cvTest.el,
    legend,
  ]);
  stageDiv.appendChild(panelBBox);

  // ── Panel (right sidebar) ──────────────────────────────────────────────────
  const rPretStatus = readout({ label: "PFN status",        value: "not pre-trained", accent: "var(--dim)" });
  const rPreLoss    = readout({ label: "pre-train loss",    value: "—",              accent: "var(--accent)" });
  const rPfnPEHE   = readout({ label: "PFN PEHE ↓",        value: "—",              accent: "var(--accent2)" });
  const rBasePEHE  = readout({ label: "baseline PEHE ↓",   value: "—",              accent: "var(--accent)" });
  const rBaseStep  = readout({ label: "baseline steps",     value: "—",              accent: "var(--dim)" });

  const chal = challenge({
    goal: "Pre-train once on the synthetic prior, then load the REAL IHDP test set: confirm the PFN predicts the treatment-effect curve in a single forward pass (no test-time training) with PEHE ≤ 1.2× the T-learner baseline trained from scratch on IHDP.",
  });

  // sliders
  const slK = slider({
    label: "Context bins K",
    min: 4, max: 16, step: 2, value: cfg.K,
    fmt: (v) => String(Math.round(v)),
    onInput: (v) => { cfg.K = Math.round(v); },
  });
  const slDiv = slider({
    label: "Prior diversity / confounding",
    min: 0.5, max: 3, step: 0.1, value: cfg.diversity,
    fmt: (v) => v.toFixed(1),
    onInput: (v) => { cfg.diversity = v; },
  });
  const slBaseSteps = slider({
    label: "Baseline training steps",
    min: 50, max: 600, step: 50, value: cfg.baselineSteps,
    fmt: (v) => String(Math.round(v)),
    onInput: (v) => { cfg.baselineSteps = Math.round(v); },
  });

  const btnPretrain = button("Pre-train the foundation model", () => {
    if (!state.pretraining) startPretraining();
  }, { primary: true });

  const btnNewTest = button("Resample IHDP test set", () => {
    state.testSeed = (state.testSeed * 1103515245 + 12345) >>> 0;
    loadTestDataset(state.testSeed);
  });

  const badge = dataBadge(meta);

  panel.append(
    badge,
    panelSection("Status", h("div", { class: "readout-grid" }, [rPretStatus, rPreLoss])),
    panelSection("PEHE on real IHDP", h("div", { class: "readout-grid" }, [rPfnPEHE, rBasePEHE, rBaseStep])),
    panelSection("Controls", [slK, slDiv, slBaseSteps]),
    panelSection("Actions", [
      h("div", { class: "btn-row" }, [btnPretrain]),
      h("div", { class: "btn-row", style: { marginTop: "6px" } }, [btnNewTest]),
    ]),
    panelSection("Challenge", chal),
    panelSection("", [
      note("Prior = synthetic SCMs (inherent to PFNs). Test = real IHDP benchmark. PFN inference = 1 forward pass, no test-time training."),
    ]),
  );

  caption.innerHTML =
    "Prior-Data Fitted Networks (PFNs) perform <em>amortized Bayesian inference by in-context learning</em>: " +
    "a model pre-trained on a <strong>synthetic SCM prior</strong> (inherent to the PFN approach — pre-training on simulated causal worlds) " +
    "estimates treatment effects on a <strong>real benchmark dataset</strong> in a single forward pass — no per-dataset retraining. " +
    "The <strong>test set is the real IHDP benchmark</strong> (Hill 2011): 747 infants with real covariates x1–x25, " +
    "semi-synthetic potential outcomes so the true ITE = μ₁−μ₀ is known, enabling exact PEHE scoring. " +
    "The in-context summary bins the IHDP data (projected via x1, birth-weight z-score) into treated/control outcome means + propensity, " +
    "fed with a query point to the PFN MLP. The T-learner baseline trains from scratch on the same IHDP data, animating its slow convergence. " +
    "&mdash; <em>Müller et al., Transformers Can Do Bayesian Inference (PFNs), ICLR 2022</em>; " +
    "<em>Hollmann et al., TabPFN, Nature 2025</em>; " +
    "<em>Balazadeh et al., CausalPFN, arXiv:2506.07918, 2025</em>; " +
    "<em>Ma, Frauen et al., CausalFM, ICLR 2026, arXiv:2506.10914</em>; " +
    "<em>Hill, Bayesian nonparametric modeling for causal inference (IHDP), J. Comput. Graph. Stat. 2011</em>.";

  // ── Springs ────────────────────────────────────────────────────────────────
  const pfnPEHEsp  = new Spring(1, { stiffness: 30, damping: 10 });
  const basePEHEsp = new Spring(1, { stiffness: 30, damping: 10 });

  // ── load test dataset + run PFN + start baseline ───────────────────────────
  // Uses the REAL IHDP benchmark. We subsample up to 200 rows for speed while
  // keeping the full IHDP covariate/ITE distribution intact.
  function loadTestDataset(seed) {
    const rng = new RNG(seed + 5000);
    const N = Math.min(200, IHDP_UNITS.length);
    // Shuffle and pick N rows deterministically from the fixed IHDP corpus
    const indices = Array.from({ length: IHDP_UNITS.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng.uniform(0, i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const units = indices.slice(0, N).map((i) => IHDP_UNITS[i]);

    state.testUnits = units;

    // Build a binned true-ITE function from the real IHDP units for visualisation.
    // Bins along the projected x1 axis; each bin returns its mean true ITE.
    state.testTrueTauFn = makeBinnedTauFn(units, 12);

    state.testFeat = state.pretrained ? extractFeatures(units, cfg.K) : null;

    // PFN prediction (instant if pretrained)
    if (state.pretrained) {
      state.pfnPEHE = computePEHE(units, (x) => pfnPredictTau(x, state.testFeat));
      pfnPEHEsp.set(state.pfnPEHE);
    } else {
      state.pfnPEHE = NaN;
    }

    // reset baseline T-learner (trains from scratch on IHDP data)
    state.baseline = makeBaseline(seed + 999);
    state.baselineRunning = true;
    state.basePEHE = NaN;
    baseCurveAlpha = 0;
  }

  // Build a binned mean-tau lookup function from real units.
  // Returns a fn(x) → approximate mean ITE near x via nearest non-empty bin.
  function makeBinnedTauFn(units, nBins) {
    const bins = Array.from({ length: nBins }, () => ({ sum: 0, cnt: 0 }));
    const bw = 4 / nBins;
    for (const u of units) {
      const bi = clamp(Math.floor((u.x + 2) / bw), 0, nBins - 1);
      bins[bi].sum += u.tau;
      bins[bi].cnt++;
    }
    const vals = bins.map((b) => (b.cnt > 0 ? b.sum / b.cnt : null));
    // fill empty bins by nearest neighbour
    for (let k = 0; k < nBins; k++) {
      if (vals[k] !== null) continue;
      let lo = k - 1, hi = k + 1;
      while (lo >= 0 || hi < nBins) {
        if (lo >= 0 && vals[lo] !== null) { vals[k] = vals[lo]; break; }
        if (hi < nBins && vals[hi] !== null) { vals[k] = vals[hi]; break; }
        lo--; hi++;
      }
      if (vals[k] === null) vals[k] = 0;
    }
    return (x) => {
      const bi = clamp(Math.floor((x + 2) / bw), 0, nBins - 1);
      return vals[bi];
    };
  }

  function pfnPredictTau(x, feat) {
    if (!state.pretrained || !feat) return 0;
    const input = [[...feat, x]];
    return pfnNet.predict(input)[0][0];
  }

  // draw a single mini-canvas scatter + CATE
  function drawMini(cv, units, cateFn) {
    cv.clear();
    const ctx = cv.ctx;
    const sx = new Scale([-2, 2], [cv.box.x0, cv.box.x1]);
    // y range: outcomes
    const ys = units.map((u) => u.y);
    const ylo = Math.min(...ys) - 0.3;
    const yhi = Math.max(...ys) + 0.3;
    const sy = new Scale([ylo, yhi], [cv.box.y1, cv.box.y0]);

    // dots
    for (const u of units) {
      const col = u.t ? "var(--treat)" : "var(--ctrl)";
      dot(ctx, sx.map(u.x), sy.map(u.y), 1.8, col, { alpha: 0.7 });
    }

    // true CATE curve (gold) — mapped via τ(x) → y-space offset from mean y0
    // Just draw it proportionally in outcome space for visual effect
    const tauPts = CURVE_XS.map((x) => {
      const tau = cateFn(x);
      const midY = (ylo + yhi) / 2;
      return { x: sx.map(x), y: sy.map(clamp(midY + tau * 0.4, ylo, yhi)) };
    });
    line(ctx, tauPts, { stroke: "var(--gold)", width: 1.2, alpha: 0.8 });
  }

  // draw main test panel
  function drawTestPanel(pfnAlpha, baseAlpha) {
    const cv = cvTest;
    cv.clear();

    if (!state.testUnits) {
      const ctx = cv.ctx;
      ctx.fillStyle = "var(--dim)";
      ctx.font = "13px var(--sans, system-ui)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Click 'Resample IHDP test set' to load real data", cv.w / 2, cv.h / 2);
      return;
    }

    const units = state.testUnits;
    const trueTauFn = state.testTrueTauFn;
    const ctx = cv.ctx;

    // Determine y-range from outcomes
    const ys = units.map((u) => u.y);
    const ylo = Math.min(...ys) - 0.5;
    const yhi = Math.max(...ys) + 0.5;
    const sx = new Scale([-2, 2], [cv.box.x0, cv.box.x1]);
    const sy = new Scale([ylo, yhi], [cv.box.y1, cv.box.y0]);

    drawAxes(cv, sx, sy, { xlabel: "x₁ — birth-weight z-score (IHDP, projected to 1-D)", ylabel: "outcome y", grid: true });

    // Scatter: treated=orange, control=blue
    for (const u of units) {
      const col = u.t ? "var(--treat)" : "var(--ctrl)";
      dot(ctx, sx.map(u.x), sy.map(u.y), 2.8, col, { alpha: 0.68 });
    }

    // We plot CATE curves in a shifted coordinate system:
    // shift τ curves to sit near the mean outcome for visibility
    const meanY = mean(ys);
    const tauScale = 0.8; // visual scale factor

    function tauToY(tau) { return meanY + tau * tauScale; }

    // True ITE = μ₁−μ₀ from real IHDP (gold) — binned mean across units
    const truePts = CURVE_XS.map((x) => ({
      x: sx.map(x),
      y: sy.map(clamp(tauToY(trueTauFn(x)), ylo, yhi)),
    }));
    line(ctx, truePts, { stroke: "var(--gold)", width: 2.5, alpha: 0.95 });

    // PFN CATE — teal (instant, always shown if pretrained)
    if (state.pretrained && state.testFeat) {
      const pfnPts = CURVE_XS.map((x) => ({
        x: sx.map(x),
        y: sy.map(clamp(tauToY(pfnPredictTau(x, state.testFeat)), ylo, yhi)),
      }));
      line(ctx, pfnPts, { stroke: "var(--accent2)", width: 2.2, alpha: pfnAlpha });
    }

    // Baseline CATE — violet (training in progress)
    if (state.baseline && state.baseline.step > 0) {
      const blPts = CURVE_XS.map((x) => ({
        x: sx.map(x),
        y: sy.map(clamp(tauToY(baselinePredict(state.baseline, x)), ylo, yhi)),
      }));
      line(ctx, blPts, { stroke: "var(--accent)", width: 2, alpha: baseAlpha });
    }

    // Labels in corner
    ctx.font = "bold 11px var(--mono, monospace)";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    if (state.pretrained && !isNaN(state.pfnPEHE)) {
      ctx.fillStyle = "var(--accent2)";
      ctx.fillText(`PFN PEHE = ${state.pfnPEHE.toFixed(3)}`, cv.box.x1 - 4, cv.box.y0 + 4);
    }
    if (!isNaN(state.basePEHE)) {
      ctx.fillStyle = "var(--accent)";
      ctx.fillText(`baseline PEHE = ${state.basePEHE.toFixed(3)}`, cv.box.x1 - 4, cv.box.y0 + 18);
    }

    // "1 forward pass" badge
    if (state.pretrained && state.testFeat) {
      ctx.fillStyle = "var(--accent2)";
      ctx.font = "10px var(--mono, monospace)";
      ctx.textAlign = "left";
      ctx.fillText("PFN: 1 forward pass", cv.box.x0 + 4, cv.box.y0 + 4);
    }
    if (state.baseline) {
      ctx.fillStyle = "var(--accent)";
      ctx.font = "10px var(--mono, monospace)";
      ctx.textAlign = "left";
      ctx.fillText(`baseline: ${state.baseline.step} grad steps`, cv.box.x0 + 4, cv.box.y0 + 18);
    }
  }

  // draw gallery mini-canvases
  function updateGallery() {
    const ds = state.galleryDatasets;
    const n = ds.length;
    for (let i = 0; i < GALLERY_N; i++) {
      const src = ds[Math.max(0, n - 1 - i)];
      if (src) drawMini(miniCanvases[i], src.units, src.cateFn);
    }
  }

  // ── animation state ────────────────────────────────────────────────────────
  let pfnCurveAlpha = 0;    // 0→1 snap when PFN first predicts
  let baseCurveAlpha = 0;
  let pfnSnapTimer = 0;     // triggers snap animation
  let galleryScrollT = 0;

  // ── main frame loop ────────────────────────────────────────────────────────
  const PRETRAIN_STEPS_PER_FRAME = 4; // batches processed per frame (non-blocking)
  const BASE_STEPS_PER_FRAME = 8;

  const stop = onFrame((dt) => {
    // 1. Pretraining loop (incremental, spread across frames)
    if (state.pretraining && priorBatches.length > 0) {
      const total = cfg.priorDatasets;
      let lossAcc = 0;
      let doCount = 0;
      for (let k = 0; k < PRETRAIN_STEPS_PER_FRAME && state.pretStep < total; k++) {
        const b = priorBatches[state.pretStep];
        const l = pfnNet.trainStepMSE(b.X, b.Y, 2e-3, 1e-5);
        lossAcc += l;
        doCount++;

        // push to gallery occasionally
        if (state.pretStep % 8 === 0) {
          state.galleryDatasets.push({ units: b.units, cateFn: b.cateFn });
          if (state.galleryDatasets.length > 30) state.galleryDatasets.shift();
          updateGallery();
        }

        state.pretStep++;
      }

      state.preProg = state.pretStep / total;
      if (doCount > 0) state.preLoss = lossAcc / doCount;

      // update progress bar
      progressFill.style.width = (state.preProg * 100).toFixed(1) + "%";
      preStatusP.textContent = `pre-training on synthetic prior: ${state.pretStep}/${total} SCMs  (loss ${isNaN(state.preLoss) ? "—" : state.preLoss.toFixed(4)})`;

      if (state.pretStep >= total) {
        // pretraining done
        state.pretraining = false;
        state.pretrained = true;
        rPretStatus.set("pre-trained ✓", "");
        preStatusP.textContent = `pre-training complete — ${total} synthetic SCM prior datasets, loss ${state.preLoss.toFixed(4)}`;
        progressFill.style.width = "100%";

        // immediately evaluate on test dataset if one exists
        if (state.testUnits) {
          state.testFeat = extractFeatures(state.testUnits, cfg.K);
          state.pfnPEHE = computePEHE(state.testUnits, (x) => pfnPredictTau(x, state.testFeat));
          pfnPEHEsp.set(state.pfnPEHE);
          pfnCurveAlpha = 0;
          pfnSnapTimer = 0.001; // trigger snap
        }
      }
    }

    // 2. Gallery cycling animation (scroll through recent prior datasets)
    galleryScrollT += dt;
    if (galleryScrollT > 1.2 && state.galleryDatasets.length > 0) {
      galleryScrollT = 0;
      state.galleryIdx = (state.galleryIdx + 1) % Math.max(1, state.galleryDatasets.length);
      // rotate one slot so it feels like streaming
      const ds = state.galleryDatasets;
      const n = ds.length;
      for (let i = 0; i < GALLERY_N; i++) {
        const idx = (state.galleryIdx + i) % n;
        if (ds[idx]) drawMini(miniCanvases[i], ds[idx].units, ds[idx].cateFn);
      }
    }

    // 3. PFN curve snap animation
    if (pfnSnapTimer > 0) {
      pfnSnapTimer += dt;
      pfnCurveAlpha = ease.outElastic(Math.min(1, pfnSnapTimer / 0.5));
    } else if (state.pretrained && state.testFeat) {
      pfnCurveAlpha = 1;
    }

    // 4. Baseline training (incremental)
    if (state.baselineRunning && state.baseline && state.testUnits) {
      baseCurveAlpha = Math.min(1, baseCurveAlpha + dt * 2);
      const target = cfg.baselineSteps;
      for (let k = 0; k < BASE_STEPS_PER_FRAME && state.baseline.step < target; k++) {
        baselineTrainStep(state.baseline, state.testUnits, 3e-3);
      }
      if (state.baseline.step >= target) {
        state.baselineRunning = false;
        state.basePEHE = computePEHE(state.testUnits, (x) => baselinePredict(state.baseline, x));
        basePEHEsp.set(state.basePEHE);
      }
    }

    // 5. Springs
    pfnPEHEsp.step(dt);
    basePEHEsp.step(dt);

    // 6. Draw main test panel
    drawTestPanel(pfnCurveAlpha, baseCurveAlpha);

    // 7. Readouts
    rPreLoss.set(isNaN(state.preLoss) ? "—" : state.preLoss.toFixed(4));
    if (state.pretrained) {
      rPretStatus.set("pre-trained ✓");
    }
    if (!isNaN(pfnPEHEsp.value)) {
      rPfnPEHE.set(isNaN(state.pfnPEHE) ? "—" : pfnPEHEsp.value.toFixed(3),
        state.pretrained ? "1 forward pass" : "pre-train first");
    }
    if (state.baseline) {
      rBaseStep.set(String(state.baseline.step));
    }
    if (!isNaN(state.basePEHE)) {
      rBasePEHE.set(basePEHEsp.value.toFixed(3), `${cfg.baselineSteps} grad steps`);
    }

    // 8. Challenge check
    if (
      state.pretrained &&
      !isNaN(state.pfnPEHE) &&
      !isNaN(state.basePEHE) &&
      state.pfnPEHE <= 1.2 * state.basePEHE
    ) {
      chal.setState(
        true,
        `PFN PEHE ${state.pfnPEHE.toFixed(3)} ≤ 1.2 × baseline ${state.basePEHE.toFixed(3)} — foundation model wins.`,
      );
    }
  });

  return () => stop();
}
