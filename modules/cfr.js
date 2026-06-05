// Neural Treatment Effects — TARNet / Counterfactual Regression (CFR).
// Shalit, Johansson & Sontag, ICML 2017.
//
// Architecture: shared representation Φ(x) → φ ∈ R² (visible in 2-D scatter,
// projected from a small hidden rep), then two outcome heads H₀, H₁: φ → ŷ.
// Balancing penalty = α·MMD(φ_T, φ_C) forces the representation distributions
// to overlap — bounding the counterfactual generalisation error at the cost of
// some factual fit.
//
// Data: REAL IHDP covariates (x1..x25 from the Infant Health & Development
// Program, n=747), with outcomes simulated under the standard NPCI setup
// (Hill 2011) precisely so that the counterfactual — and therefore the true
// individual treatment effect mu1-mu0 — is known. This is why IHDP is the
// canonical CFR benchmark.

import { h } from "../lib/dom.js";
import { mean, clamp } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot, line } from "../lib/plot.js";
import { lessonLayout, panelSection, slider, button, readout, challenge, note } from "../lib/ui.js";
import { MLP, mmdLinear, zeros } from "../lib/nn.js";
import { rows as ihdpRows, meta } from "../data/ihdp.js";
import { complete, zscore, dataBadge } from "../lib/data.js";

// ── inject scoped CSS once ──────────────────────────────────────────────────
if (!document.getElementById("cfr-css")) {
  const style = document.createElement("style");
  style.id = "cfr-css";
  style.textContent = `
    .cfr-title { font: 11px var(--mono, monospace); color: var(--dim);
                 margin: 0 0 4px; letter-spacing: .03em; }
    .cfr-legend { display: flex; gap: 12px; flex-wrap: wrap;
                  font: 11px var(--mono, monospace); color: var(--dim);
                  margin-top: 6px; align-items: center; }
    .cfr-swatch { display: inline-block; width: 10px; height: 10px;
                  border-radius: 50%; margin-right: 4px; vertical-align: middle; }
    .cfr-panels { display: flex; gap: 12px; flex-wrap: wrap; }
    .cfr-panel  { flex: 1 1 260px; }
  `;
  document.head.appendChild(style);
}

// ── prepare IHDP data ────────────────────────────────────────────────────────
// All 747 rows; require t, yf, mu0, mu1, x1..x25
const COVARIATE_KEYS = Array.from({ length: 25 }, (_, i) => "x" + (i + 1));
const REQUIRED_KEYS  = ["t", "yf", "mu0", "mu1", ...COVARIATE_KEYS];
const units = complete(ihdpRows, REQUIRED_KEYS);
const N = units.length;  // 747

// z-score each covariate column; collect z-scored design matrix X [n × 25]
const covCols = COVARIATE_KEYS.map((k) => zscore(units.map((r) => r[k])));
const X_raw   = units.map((_, i) => covCols.map((c) => c.z[i]));  // n × 25

// Standardise yf for stable training (unscale predictions later)
const { z: yf_z, mean: yf_mean, sd: yf_sd } = zscore(units.map((r) => r.yf));
// True ITE (noise-free potential-outcome means from the NPCI simulation)
const iteTrue = units.map((r) => r.mu1 - r.mu0);  // ground truth

const N_TREAT = units.filter((u) => u.t === 1).length;
const N_CTRL  = N - N_TREAT;

// ── rep projection matrix (random, fixed) for 2-D display ───────────────────
// The shared Rep has repDim=4 hidden; project to 2-D for visualisation.
// We use a fixed random PCA-like projection from the REP layer output.
const REP_DIM  = 4;   // internal representation dimension
const PROJ_DIM = 2;   // 2-D for scatter

// ── module entry point ───────────────────────────────────────────────────────
export function mount(root) {
  // ── state ──────────────────────────────────────────────────────────────────
  const state = {
    alpha: 0.0,           // balancing penalty strength
    lr: 2e-3,
    playing: true,
    step: 0,
    facMSE: NaN,
    mmd: NaN,
    pehe: NaN,
    baselinePEHE: null,   // recorded at alpha=0 for challenge comparison
  };

  // ── networks ───────────────────────────────────────────────────────────────
  // Rep: [25, 16, REP_DIM] with tanh  →  REP_DIM-D representation
  //   (projected to 2-D for scatter display)
  // H0 / H1: [REP_DIM, 8, 1] with tanh (hidden) + identity (out)
  // Keep networks tiny so ~3 steps/frame is safe in the browser.
  let Rep, H0, H1;
  // Fixed random projection: REP_DIM → 2 for display only
  let projW;

  function makeProj(seed) {
    // Gaussian random projection normalised to unit columns
    const rng2 = new (class {
      constructor(s) { this.s = s >>> 0; }
      next() { this.s = (this.s * 1664525 + 1013904223) >>> 0; return this.s / 0x100000000; }
      normal() { const u = this.next(), v = this.next(); return Math.sqrt(-2 * Math.log(u + 1e-9)) * Math.cos(2 * Math.PI * v); }
    })(seed);
    const W = [];
    for (let i = 0; i < REP_DIM; i++) W.push([rng2.normal(), rng2.normal()]);
    // normalise each output column
    for (let j = 0; j < 2; j++) {
      let norm = 0; for (let i = 0; i < REP_DIM; i++) norm += W[i][j] ** 2;
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < REP_DIM; i++) W[i][j] /= norm;
    }
    return W;
  }

  function initNets(seed) {
    Rep = new MLP([25, 16, REP_DIM], { activation: "tanh", outAct: "tanh", seed });
    H0  = new MLP([REP_DIM, 8, 1],   { activation: "tanh", outAct: "identity", seed: seed + 1 });
    H1  = new MLP([REP_DIM, 8, 1],   { activation: "tanh", outAct: "identity", seed: seed + 2 });
    projW = makeProj(seed + 99);
  }
  initNets(1);

  // Project phi [n × REP_DIM] → 2-D [n × 2] via projW
  function project(phi) {
    return phi.map((row) => [
      row.reduce((s, v, i) => s + v * projW[i][0], 0),
      row.reduce((s, v, i) => s + v * projW[i][1], 0),
    ]);
  }

  // Full-dataset forward pass → returns { phi2d, iteHat, facMSE, mmd, pehe }
  function evaluate() {
    const X = X_raw;
    const phi = Rep.forward(X);              // n × REP_DIM

    const idxT = [], idxC = [];
    units.forEach((u, i) => (u.t ? idxT : idxC).push(i));

    const phiT = idxT.map((i) => phi[i]);
    const phiC = idxC.map((i) => phi[i]);

    // PEHE needs both heads on full phi
    const allH0 = H0.predict(phi);   // n × 1
    const allH1 = H1.predict(phi);   // n × 1

    // iteHat in original scale (unscale from yf normalisation)
    const iteHat = units.map((_, i) => (allH1[i][0] - allH0[i][0]) * yf_sd);

    // factual MSE (in z-score space)
    let mseSum = 0;
    for (let k = 0; k < idxT.length; k++) mseSum += (allH1[idxT[k]][0] - yf_z[idxT[k]]) ** 2;
    for (let k = 0; k < idxC.length; k++) mseSum += (allH0[idxC[k]][0] - yf_z[idxC[k]]) ** 2;
    const facMSE = mseSum / N;

    // MMD between treated and control in rep space
    const mmd = mmdLinear(phiT, phiC);

    // PEHE = sqrt( mean( (iteHat - iteTrue)^2 ) )  in original y scale
    const pehe = Math.sqrt(mean(units.map((u, i) => (iteHat[i] - iteTrue[i]) ** 2)));

    // 2-D projection for scatter
    const phi2d = project(phi);

    return { phi2d, phiT: project(phiT), phiC: project(phiC), iteHat, facMSE, mmd, pehe };
  }

  // ── training step (called inside onFrame) ──────────────────────────────────
  function trainStep() {
    const X = X_raw;
    const n = N;

    // 1. Representation forward
    const phi = Rep.forward(X);   // n × REP_DIM

    const idxT = [], idxC = [];
    units.forEach((u, i) => (u.t ? idxT : idxC).push(i));
    const nT = idxT.length, nC = idxC.length;
    if (nT === 0 || nC === 0) return;

    const phiT = idxT.map((i) => phi[i]);
    const phiC = idxC.map((i) => phi[i]);

    // 2. Head forwards
    const outT = H1.forward(phiT);   // nT × 1
    const outC = H0.forward(phiC);   // nC × 1

    // 3. Factual MSE gradient wrt head outputs (z-scored targets)
    const dOutT = outT.map((row, k) => [2 * (row[0] - yf_z[idxT[k]]) / n]);
    const dOutC = outC.map((row, k) => [2 * (row[0] - yf_z[idxC[k]]) / n]);

    // 4. Head backwards → dPhi per sub-group  [nT×REP_DIM, nC×REP_DIM]
    const dPhiT_head = H1.backward(dOutT);
    const dPhiC_head = H0.backward(dOutC);

    // 5. Assemble full dphi array [n × REP_DIM]
    const dphi = zeros(n, REP_DIM);
    for (let k = 0; k < nT; k++) {
      const i = idxT[k];
      for (let d = 0; d < REP_DIM; d++) dphi[i][d] += dPhiT_head[k][d];
    }
    for (let k = 0; k < nC; k++) {
      const i = idxC[k];
      for (let d = 0; d < REP_DIM; d++) dphi[i][d] += dPhiC_head[k][d];
    }

    // 6. CFR balancing penalty gradient (linear-kernel MMD mean-difference)
    //    pen = alpha * ||mean(phiT) - mean(phiC)||
    if (state.alpha > 0 && nT > 0 && nC > 0) {
      const mT = new Array(REP_DIM).fill(0);
      const mC = new Array(REP_DIM).fill(0);
      for (const r of phiT) for (let d = 0; d < REP_DIM; d++) mT[d] += r[d] / nT;
      for (const r of phiC) for (let d = 0; d < REP_DIM; d++) mC[d] += r[d] / nC;

      let norm2 = 0;
      const diff = mT.map((v, d) => v - mC[d]);
      for (const v of diff) norm2 += v * v;
      const norm = Math.sqrt(norm2);

      if (norm > 1e-8) {
        const unitDiff = diff.map((v) => v / norm);
        for (let k = 0; k < nT; k++) {
          const i = idxT[k];
          for (let d = 0; d < REP_DIM; d++)
            dphi[i][d] += state.alpha * unitDiff[d] / nT;
        }
        for (let k = 0; k < nC; k++) {
          const i = idxC[k];
          for (let d = 0; d < REP_DIM; d++)
            dphi[i][d] -= state.alpha * unitDiff[d] / nC;
        }
      }
    }

    // 7. Rep backward + Adam updates
    Rep.backward(dphi);
    Rep.step(state.lr, 1e-4);
    H0.step(state.lr, 1e-4);
    H1.step(state.lr, 1e-4);

    state.step++;
  }

  // ── layout ─────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Neural Treatment Effects — IHDP",
    idea: "A shared representation Φ(x) feeds two outcome heads. With no balancing (α=0, TARNet), treated and control live in different corners of Φ-space. Crank up α: the clouds merge, counterfactual error drops.",
  });
  root.appendChild(layout);

  // ── data badge at top of panel ──────────────────────────────────────────────
  const badge = dataBadge(meta);
  panel.prepend(badge);

  // ── two canvas panels ───────────────────────────────────────────────────────
  const CV_W = 330, CV_H = 300;
  const cvRep = new Canvas(CV_W, CV_H, { margin: { t: 22, r: 16, b: 40, l: 44 } });
  const cvITE = new Canvas(CV_W, CV_H, { margin: { t: 22, r: 16, b: 40, l: 52 } });

  const panelsDiv = h("div", { class: "cfr-panels" }, [
    h("div", { class: "cfr-panel" }, [
      h("p", { class: "cfr-title", text: "panel A — learned representation space Φ (projected to 2-D)" }),
      cvRep.el,
    ]),
    h("div", { class: "cfr-panel" }, [
      h("p", { class: "cfr-title", text: "panel B — predicted ITE vs true ITE = μ₁−μ₀ (all units)" }),
      cvITE.el,
    ]),
  ]);

  const legend = h("div", { class: "cfr-legend" }, [
    h("span", {}, [h("span", { class: "cfr-swatch", style: { background: "var(--treat)" } }), `treated (T=1, n=${N_TREAT})`]),
    h("span", {}, [h("span", { class: "cfr-swatch", style: { background: "var(--ctrl)" } }), `control (T=0, n=${N_CTRL})`]),
    h("span", {}, [h("span", { class: "cfr-swatch", style: { background: "var(--gold)", borderRadius: "2px", width: "14px", height: "3px", display: "inline-block", verticalAlign: "middle" } }), "perfect ITE"]),
  ]);

  stage.appendChild(panelsDiv);
  stage.appendChild(legend);

  // ── readouts ────────────────────────────────────────────────────────────────
  const rStep  = readout({ label: "step",               value: "0",   accent: "var(--dim)" });
  const rMSE   = readout({ label: "factual MSE (z)",    value: "—",   accent: "var(--accent2)" });
  const rMMD   = readout({ label: "MMD(Φ_T, Φ_C)",     value: "—",   accent: "var(--accent)" });
  const rPEHE  = readout({ label: "PEHE ↓",             value: "—",   accent: "var(--gold)" });
  const rBase  = readout({ label: "baseline PEHE (α=0)", value: "—",  accent: "var(--dim)" });
  const readoutGrid = h("div", { class: "readout-grid" }, [rStep, rMSE, rMMD, rPEHE, rBase]);

  // ── controls ────────────────────────────────────────────────────────────────
  const alphaSlider = slider({
    label: "Balancing strength α",
    min: 0, max: 2, step: 0.05, value: state.alpha,
    fmt: (v) => v.toFixed(2),
    hint: "(0 = TARNet; >0 = CFR)",
    onInput: (v) => {
      if (state.alpha === 0 && v > 0 && !isNaN(state.pehe)) {
        if (state.baselinePEHE === null) state.baselinePEHE = state.pehe;
      }
      state.alpha = v;
    },
  });

  const lrSlider = slider({
    label: "Learning rate",
    min: 0.0005, max: 0.01, step: 0.0005, value: state.lr,
    fmt: (v) => v.toExponential(1),
    onInput: (v) => { state.lr = v; },
  });

  const playBtn  = button("⏸ pause",  () => { state.playing = !state.playing; playBtn.textContent = state.playing ? "⏸ pause" : "▶ play"; }, { primary: true });
  const stepBtn  = button("+1 step",  () => { if (!state.playing) { trainStep(); redraw(); } });
  const resetBtn = button("↺ reset net", () => {
    initNets(Math.floor(Math.random() * 9999));
    state.step = 0;
    state.baselinePEHE = null;
    chal.setState(false);
  });

  const chal = challenge({
    goal: "Turn on representation balancing (α > 0) and train until treated/control representations overlap (low MMD) and PEHE beats the unbalanced α=0 baseline.",
  });

  panel.append(
    panelSection("Metrics", readoutGrid),
    panelSection("Balancing", [alphaSlider]),
    panelSection("Training", [
      lrSlider,
      h("div", { class: "btn-row", style: { marginTop: "8px" } }, [playBtn, stepBtn]),
      h("div", { class: "btn-row", style: { marginTop: "6px" } }, [resetBtn]),
    ]),
    panelSection("Challenge", chal),
    panelSection("", [
      note("Balancing bounds the counterfactual error: at α=0 (TARNet) the two outcome heads can't see each other's support; α > 0 (CFR) aligns Φ so H₀ and H₁ interpolate rather than extrapolate over the REAL IHDP covariate shift (selection of lower-birthweight infants into treatment)."),
    ]),
  );

  caption.innerHTML =
    "<strong>IHDP semi-synthetic benchmark (Hill 2011).</strong> " +
    "Covariates x₁–x₂₅ are <em>real</em> measurements from the Infant Health &amp; Development Program (n=747); " +
    "potential outcomes (yf/ycf, μ₀/μ₁) are simulated under the standard NPCI setup so that the counterfactual is " +
    "known, making the ground-truth individual treatment effect ITE = μ₁−μ₀ computable and PEHE well-defined. " +
    "There is genuine covariate shift: treated units (lower-birthweight infants) are systematically different from controls. " +
    "Architecture: shared encoder Φ: x∈ℝ²⁵→φ∈ℝ⁴ (MLP [25,16,4], tanh; projected to 2-D for display) + two heads H₀, H₁: φ→ŷ. " +
    "Factual loss is MSE on observed yf (z-scored); the CFR balancing penalty α·MMD(Φ_T, Φ_C) minimises the " +
    "linear-kernel maximum mean discrepancy between treated and control representation distributions, " +
    "<em>bounding the counterfactual generalisation error</em> (Shalit, Johansson &amp; Sontag, ICML 2017 Thm. 1). " +
    "True ATE ≈ 4.0. " +
    "<em>Hill (2011) IHDP; Shalit, Johansson &amp; Sontag (2017) — CFR/TARNet, ICML 2017.</em>";

  // ── springs for smooth animated readouts ────────────────────────────────────
  const mmdSpring  = new Spring(0, { stiffness: 40, damping: 12 });
  const peheSpring = new Spring(5, { stiffness: 40, damping: 12 });

  // ── draw functions ──────────────────────────────────────────────────────────
  function drawRepSpace(phi2d) {
    const cv = cvRep;
    cv.clear();
    if (!phi2d || phi2d.length === 0) return;

    let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
    for (const r of phi2d) {
      if (r[0] < xlo) xlo = r[0]; if (r[0] > xhi) xhi = r[0];
      if (r[1] < ylo) ylo = r[1]; if (r[1] > yhi) yhi = r[1];
    }
    const pad = 0.15;
    xlo -= pad; xhi += pad; ylo -= pad; yhi += pad;
    if (xlo === xhi) { xlo -= 0.5; xhi += 0.5; }
    if (ylo === yhi) { ylo -= 0.5; yhi += 0.5; }

    const sx = new Scale([xlo, xhi], [cv.box.x0, cv.box.x1]);
    const sy = new Scale([ylo, yhi], [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel: "φ̂₁", ylabel: "φ̂₂", grid: true });

    // draw control first (behind), then treated
    for (const pass of [0, 1]) {
      for (let i = 0; i < units.length; i++) {
        if (units[i].t !== pass) continue;
        const color = pass ? "var(--treat)" : "var(--ctrl)";
        dot(cv.ctx, sx.map(phi2d[i][0]), sy.map(phi2d[i][1]), 2.5, color, { alpha: 0.55 });
      }
    }

    const mmdVal = mmdSpring.value;
    cv.ctx.fillStyle = "var(--accent)";
    cv.ctx.font = "11px var(--mono, monospace)";
    cv.ctx.textAlign = "right";
    cv.ctx.textBaseline = "top";
    cv.ctx.fillText(`MMD = ${mmdVal.toFixed(3)}`, cv.box.x1 - 2, cv.box.y0 + 2);
  }

  function drawITEPanel(iteHat) {
    const cv = cvITE;
    cv.clear();
    if (!iteHat || iteHat.length === 0) return;

    const allTrue = iteTrue;
    const allHat  = iteHat;

    // Clip extreme outliers for display (early training can be wild)
    const pct = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(q * s.length)] || 0; };
    const lo = Math.min(pct(allTrue, 0.01), pct(allHat, 0.01)) - 0.5;
    const hi = Math.max(pct(allTrue, 0.99), pct(allHat, 0.99)) + 0.5;

    const sx = new Scale([lo, hi], [cv.box.x0, cv.box.x1]);
    const sy = new Scale([lo, hi], [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel: "true ITE (μ₁−μ₀)", ylabel: "predicted ITE", grid: true });

    // perfect diagonal
    line(cv.ctx,
      [{ x: sx.map(lo), y: sy.map(lo) }, { x: sx.map(hi), y: sy.map(hi) }],
      { stroke: "var(--gold)", width: 1.5, dash: [4, 3], alpha: 0.7 }
    );

    // scatter: treated orange, control blue
    for (let i = 0; i < units.length; i++) {
      const color = units[i].t ? "var(--treat)" : "var(--ctrl)";
      const px = clamp(sx.map(iteTrue[i]), cv.box.x0 - 4, cv.box.x1 + 4);
      const py = clamp(sy.map(iteHat[i]),  cv.box.y0 - 4, cv.box.y1 + 4);
      dot(cv.ctx, px, py, 2.2, color, { alpha: 0.55 });
    }

    const peheVal = peheSpring.value;
    cv.ctx.fillStyle = "var(--gold)";
    cv.ctx.font = "bold 11px var(--mono, monospace)";
    cv.ctx.textAlign = "right";
    cv.ctx.textBaseline = "top";
    cv.ctx.fillText(`PEHE = ${peheVal.toFixed(3)}`, cv.box.x1 - 2, cv.box.y0 + 2);
  }

  // ── main frame loop ─────────────────────────────────────────────────────────
  const STEPS_PER_FRAME = 3;

  function redraw() {
    const { phi2d, iteHat, facMSE, mmd, pehe } = evaluate();
    state.facMSE = facMSE;
    state.mmd = mmd;
    state.pehe = pehe;

    mmdSpring.set(mmd);
    peheSpring.set(pehe);

    rStep.set(String(state.step));
    rMSE.set(facMSE.toFixed(4));
    rMMD.set(mmd.toFixed(4));
    rPEHE.set(pehe.toFixed(4));
    if (state.baselinePEHE !== null) {
      rBase.set(state.baselinePEHE.toFixed(4), "recorded at α=0");
    } else {
      rBase.set("—", "set α>0 to record");
    }

    drawRepSpace(phi2d);
    drawITEPanel(iteHat);

    // challenge: alpha>0, MMD<0.2, PEHE beats baseline by ≥10%
    if (
      state.alpha > 0 &&
      state.baselinePEHE !== null &&
      mmd < 0.2 &&
      pehe < state.baselinePEHE * 0.9
    ) {
      chal.setState(
        true,
        `MMD=${mmd.toFixed(3)} — representations balanced; PEHE=${pehe.toFixed(3)} < baseline ${state.baselinePEHE.toFixed(3)}.`
      );
    }
  }

  const stop = onFrame((dt) => {
    mmdSpring.step(dt);
    peheSpring.step(dt);

    if (state.playing) {
      for (let k = 0; k < STEPS_PER_FRAME; k++) trainStep();
    }
    redraw();
  });

  return () => stop();
}
