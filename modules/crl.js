// Causal Representation Learning — recovering latent causal variables from
// high-dimensional observations, and why INTERVENTIONS (not more data) are
// what grant identifiability.
//
// REAL DATA: z1 = z-scored PKA, z2 = z-scored P38 from Sachs et al. (2005)
// single-cell protein flow-cytometry (~853 cells). These are real biological
// signals used as the TRUE latent factors.
//
// TRUE model: z = (PKA_z, P38_z) — real, weakly-correlated proteins.
// OBSERVED:   x = A(θ)·z where A is a known invertible mixing matrix (rotation
// by θ plus mild scale asymmetry). The learner only sees x.
//
// Identifiability result: from observational Gaussians alone, ANY rotation
// of the recovered basis is equally valid (Locatello et al. 2019; Hyvärinen).
// Each do(z_i := shift) reveals column A[:,i] of the mixer → with d
// interventions we identify A (up to perm/scale) and recover ẑ = A⁻¹·x.
// MCC (mean correlation coefficient) = mean of matched |corr(ẑᵢ, zᵢ)| ∈ [0,1].
//
// HONEST framing: the latent factors are REAL protein measurements; the mixing
// + interventions are the controlled experimental design that makes
// identifiability demonstrable. In real CRL you cannot see ground-truth
// latents — here we use real signals AS latents to make the lesson concrete.

import { h } from "../lib/dom.js";
import { mean, correlation, clamp, invert } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot } from "../lib/plot.js";
import { lessonLayout, panelSection, slider, toggle, button, readout, challenge } from "../lib/ui.js";
import { rows, meta } from "../data/sachs.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";

// ── inject scoped CSS once ─────────────────────────────────────────────────
if (!document.getElementById("crl-css")) {
  const style = document.createElement("style");
  style.id = "crl-css";
  style.textContent = `
    .crl-panels { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
    .crl-panel  { flex:1 1 180px; min-width:160px; }
    .crl-title  { font:11px var(--mono,monospace); color:var(--dim);
                  margin:0 0 4px; letter-spacing:.04em; text-align:center; }
    .crl-arrow  { font:14px var(--mono,monospace); color:var(--dim);
                  display:flex; align-items:center; padding-top:28px; }
    .crl-legend { display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;
                  font:11px var(--mono,monospace); color:var(--dim); justify-content:center; }
    .crl-legend span { display:flex; align-items:center; gap:5px; }
    .crl-sw { display:inline-block; width:9px; height:9px; border-radius:50%; }
    .crl-intv { display:flex; gap:8px; margin-bottom:4px; flex-wrap:wrap; }
  `;
  document.head.appendChild(style);
}

// ── constants ──────────────────────────────────────────────────────────────
const INT_SHIFT = 2.5;  // do(z_i := shift) mean displacement

// ── helpers ────────────────────────────────────────────────────────────────
function mixingMatrix(theta) {
  // A = rotation(theta) with mild scale asymmetry so |det| ≠ 1 but it's safe
  const c = Math.cos(theta), s = Math.sin(theta);
  // slight scale so columns differ — still cleanly invertible
  return [[1.1 * c, -0.9 * s],
          [1.1 * s,  0.9 * c]];
}

function mv(A, v) {
  // 2×2 matrix × 2-vector → 2-vector
  return [A[0][0] * v[0] + A[0][1] * v[1],
          A[1][0] * v[0] + A[1][1] * v[1]];
}

// Per-point color keyed to z1 value: teal (low) → violet (high)
function ptColor(z1, lo, hi) {
  const t = clamp((z1 - lo) / (hi - lo || 1), 0, 1);
  // teal (#36d6c3) → violet (#7c6cff)
  const r = Math.round(54  + t * (124 - 54));
  const g = Math.round(214 + t * (108 - 214));
  const b = Math.round(195 + t * (255 - 195));
  return `rgb(${r},${g},${b})`;
}

// Compute MCC: match recovered components to true components by maximum |corr|,
// then average the matched |corr| values. 2D: try both permutations.
function computeMCC(zRec, zTrue) {
  if (!zRec.length) return 0;
  const r00 = Math.abs(correlation(zRec.map(p => p[0]), zTrue.map(p => p[0])));
  const r11 = Math.abs(correlation(zRec.map(p => p[1]), zTrue.map(p => p[1])));
  const r01 = Math.abs(correlation(zRec.map(p => p[0]), zTrue.map(p => p[1])));
  const r10 = Math.abs(correlation(zRec.map(p => p[1]), zTrue.map(p => p[0])));
  const perm1 = (r00 + r11) / 2;
  const perm2 = (r01 + r10) / 2;
  return Math.max(perm1, perm2);
}

// ── Load real Sachs data: PKA (z1) and P38 (z2) as latent factors ─────────
const KEYS = ["PKA", "P38"];
const sachsComplete = complete(rows, KEYS);
const z1Raw = zscore(col(sachsComplete, "PKA")).z;  // standardized PKA
const z2Raw = zscore(col(sachsComplete, "P38")).z;  // standardized P38
const N_REAL = z1Raw.length;  // ~853 cells

// Empirical correlation between PKA and P38 (displayed as info)
const empiricalCorr = correlation(z1Raw, z2Raw);

// ── module entry point ─────────────────────────────────────────────────────
export function mount(root) {
  // ── state ──
  const state = {
    theta: Math.PI / 4,     // mixing angle
    intv1: false,            // intervention on z1 active?
    intv2: false,            // intervention on z2 active?
  };

  // Animated angle for the ambiguous rotating frame (when 0 interventions)
  let ambigAngle = 0;          // current rotating-basis angle (radians)
  const recAngle = new Spring(0, { stiffness: 55, damping: 13 });  // recovered B angle spring

  // ── data ──
  let obsZ = [], obsX = [];
  let int1Z = [], int1X = [];
  let int2Z = [], int2X = [];
  let A = [], Binv = [];
  let recZ = [];
  let mcc = 0;

  function generate() {
    A = mixingMatrix(state.theta);

    // Observational environment — use all real Sachs cells
    obsZ = [];
    obsX = [];
    for (let i = 0; i < N_REAL; i++) {
      const z = [z1Raw[i], z2Raw[i]];
      obsZ.push(z);
      obsX.push(mv(A, z));
    }

    // Interventional environments: simulate do(z_i := INT_SHIFT) by shifting
    // the real values and re-mixing. We take a 200-cell subsample for visual
    // clarity, shifting z1 (PKA) or z2 (P38) mean by INT_SHIFT.
    // The mean shift in x-space reveals A[:,i], enabling recovery of A.
    const N_INT = Math.min(200, N_REAL);

    // z1Raw and z2Raw are z-scored so their means are 0; shifting by INT_SHIFT
    // directly places the interventional cloud at mean = INT_SHIFT.
    int1Z = [];
    int1X = [];
    for (let i = 0; i < N_INT; i++) {
      // do(z1 := INT_SHIFT): shift PKA up; P38 left at its real value
      const z1Shifted = z1Raw[i] + INT_SHIFT;
      const z2val = z2Raw[i];
      int1Z.push([z1Shifted, z2val]);
      int1X.push(mv(A, [z1Shifted, z2val]));
    }

    int2Z = [];
    int2X = [];
    for (let i = 0; i < N_INT; i++) {
      const z1val = z1Raw[i];
      // do(z2 := INT_SHIFT): shift P38 up; PKA left at its real value
      const z2Shifted = z2Raw[i] + INT_SHIFT;
      int2Z.push([z1val, z2Shifted]);
      int2X.push(mv(A, [z1val, z2Shifted]));
    }

    computeRecovery();
  }

  // Estimate mixing columns from interventional mean shifts, invert to get B
  function computeRecovery() {
    const n0 = state.intv1 ? 1 : 0;
    const n1 = state.intv2 ? 1 : 0;
    const nIntv = n0 + n1;

    if (nIntv === 0) {
      // No interventions: no information about A's columns.
      // Recovery is ambiguous — show a rotating frame.
      Binv = null;
      recZ = obsZ.map(() => [0, 0]); // placeholder
      mcc = 0;
      return;
    }

    // Estimate A columns from obs→interventional mean shift.
    // E[x | do(z_i := shift)] - E[x | obs] = A[:,i] * shift
    const meanObsX = [mean(obsX.map(p => p[0])), mean(obsX.map(p => p[1]))];

    let Aest = [[1, 0], [0, 1]]; // fallback identity

    if (nIntv === 1) {
      // Only one column identified; fix the other by a best-guess orthogonal.
      if (state.intv1) {
        const meanInt1X = [mean(int1X.map(p => p[0])), mean(int1X.map(p => p[1]))];
        const col0 = [(meanInt1X[0] - meanObsX[0]) / INT_SHIFT,
                      (meanInt1X[1] - meanObsX[1]) / INT_SHIFT];
        // Perp column (unknown sign — pick one)
        const col1 = [-col0[1], col0[0]];
        Aest = [[col0[0], col1[0]], [col0[1], col1[1]]];
      } else {
        const meanInt2X = [mean(int2X.map(p => p[0])), mean(int2X.map(p => p[1]))];
        const col1 = [(meanInt2X[0] - meanObsX[0]) / INT_SHIFT,
                      (meanInt2X[1] - meanObsX[1]) / INT_SHIFT];
        const col0 = [col1[1], -col1[0]];
        Aest = [[col0[0], col1[0]], [col0[1], col1[1]]];
      }
    } else {
      // Both columns identified
      const meanInt1X = [mean(int1X.map(p => p[0])), mean(int1X.map(p => p[1]))];
      const meanInt2X = [mean(int2X.map(p => p[0])), mean(int2X.map(p => p[1]))];
      const col0 = [(meanInt1X[0] - meanObsX[0]) / INT_SHIFT,
                    (meanInt1X[1] - meanObsX[1]) / INT_SHIFT];
      const col1 = [(meanInt2X[0] - meanObsX[0]) / INT_SHIFT,
                    (meanInt2X[1] - meanObsX[1]) / INT_SHIFT];
      Aest = [[col0[0], col1[0]], [col0[1], col1[1]]];
    }

    const B = invert(Aest);
    if (!B) { Binv = null; mcc = 0; return; }
    Binv = B;

    recZ = obsX.map(x => mv(B, x));
    mcc = computeMCC(recZ, obsZ);
  }

  // True angle of B's first row (for spring target)
  function trueRecoveryAngle() {
    if (!Binv) return ambigAngle;
    return Math.atan2(Binv[0][1], Binv[0][0]);
  }

  generate();

  // ── layout ──────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Causal Representation Learning",
    idea: "Real protein signals (PKA, P38) are the hidden latent causes z. Observations x = A·z are an entangled linear mix. Without interventions, you cannot tell which direction is PKA and which is P38 — a free rotation. Each intervention pins one axis.",
  });

  // ── three side-by-side canvas panels ────────────────────────────────────
  const W = 200, H = 200;
  const M = { t: 24, r: 14, b: 30, l: 30 };

  const cvTrue = new Canvas(W, H, { margin: M });
  const cvObs  = new Canvas(W, H, { margin: M });
  const cvRec  = new Canvas(W, H, { margin: M });

  const panelsWrap = h("div", { class: "crl-panels" }, [
    h("div", { class: "crl-panel" }, [
      h("p", { class: "crl-title", text: "TRUE latents  z = (PKA, P38)" }),
      cvTrue.el,
    ]),
    h("div", { class: "crl-arrow", text: "A→" }),
    h("div", { class: "crl-panel" }, [
      h("p", { class: "crl-title", text: "OBSERVED  x = Az" }),
      cvObs.el,
    ]),
    h("div", { class: "crl-arrow", text: "B→" }),
    h("div", { class: "crl-panel" }, [
      h("p", { class: "crl-title", text: "RECOVERED  ẑ = Bx" }),
      cvRec.el,
    ]),
  ]);

  const legend = h("div", { class: "crl-legend" }, [
    h("span", {}, [h("span", { class: "crl-sw", style: { background: "var(--accent2)" } }), "low PKA"]),
    h("span", {}, [h("span", { class: "crl-sw", style: { background: "var(--accent)" } }), "high PKA"]),
    h("span", {}, [h("span", { class: "crl-sw", style: { background: "var(--treat)", opacity: "0.45" } }), "do(PKA) env"]),
    h("span", {}, [h("span", { class: "crl-sw", style: { background: "var(--pos)", opacity: "0.45" } }), "do(P38) env"]),
  ]);

  stage.append(panelsWrap, legend);

  // ── panel: readouts ──────────────────────────────────────────────────────
  const rMCC    = readout({ label: "Identifiability MCC", value: "0.00", accent: "var(--gold)" });
  const rIntv   = readout({ label: "Interventions used", value: "0" });
  const rStatus = readout({ label: "Status", value: "entangled" });
  const rCorr   = readout({ label: "PKA–P38 corr (real)", value: empiricalCorr.toFixed(2) });
  const rGrid   = h("div", { class: "readout-grid" }, [rMCC, rIntv, rStatus, rCorr]);

  // ── panel: interventions ─────────────────────────────────────────────────
  const tgl1 = toggle({
    label: "Intervene on PKA  do(PKA := 2.5)",
    value: false,
    onToggle: (v) => { state.intv1 = v; onSettingsChange(); },
  });
  const tgl2 = toggle({
    label: "Intervene on P38  do(P38 := 2.5)",
    value: false,
    onToggle: (v) => { state.intv2 = v; onSettingsChange(); },
  });

  // ── panel: sliders ───────────────────────────────────────────────────────
  const slTheta = slider({
    label: "Mixing angle  θ", min: 0, max: Math.PI, step: 0.05,
    value: state.theta, fmt: (v) => (v / Math.PI * 180).toFixed(0) + "°",
    onInput: (v) => { state.theta = v; onSettingsChange(); },
  });
  const btnNew = button("↻ randomize θ", () => {
    state.theta = 0.3 + Math.random() * 2.2;
    slTheta.setValue(state.theta);
    onSettingsChange();
  });

  const chal = challenge({
    goal: "Observational data alone leaves the latents entangled (a free rotation). Add interventions on both real proteins until the recovered factors align with PKA and P38 (MCC ≈ 1).",
  });

  // Append data badge
  const badge = dataBadge(meta);

  panel.append(
    panelSection("Identifiability", rGrid),
    panelSection("Interventions", [
      h("div", { class: "crl-intv" }, [tgl1, tgl2]),
    ]),
    panelSection("Mixing matrix", [slTheta,
      h("div", { class: "btn-row", style: { marginTop: "8px" } }, [btnNew]),
    ]),
    panelSection("Challenge", chal),
    badge,
  );

  caption.innerHTML =
    "The latent factors are <strong>real phosphoprotein measurements</strong> from " +
    "<em>Sachs et al., Science 2005</em> (single-cell flow-cytometry, ~853 cells): " +
    "z-scored PKA and P38 serve as the ground-truth latent causes. A known invertible " +
    "mixing matrix A(θ) entangles them into observations x = A·z — the learner only sees x. " +
    "Without inductive bias, <strong>unsupervised disentanglement is impossible</strong>: " +
    "infinitely many linear unmixings reproduce the same Gaussian observation distribution — " +
    "the latent axes are unidentifiable up to a free rotation (Locatello et al., " +
    "<em>Challenging Common Assumptions in the Unsupervised Learning of Disentangled " +
    "Representations</em>, ICML 2019; Hyvärinen &amp; Pajunen 1999). A single " +
    "<strong>intervention</strong> do(z<sub>i</sub>) shifts the observation mean by " +
    "A[:,i]·shift, revealing that column of the mixing matrix; with interventions on all " +
    "latents, A is identified up to permutation and sign, and the latent variables are " +
    "recovered (Schölkopf et al., <em>Toward Causal Representation Learning</em>, " +
    "Proc. IEEE 2021; Lippe et al., <em>CITRIS / iCITRIS</em>, ICML/NeurIPS 2022; " +
    "Varici et al., <em>Score-Based Causal Representation Learning</em>, JMLR 2025).";

  root.appendChild(layout);

  // ── after-change hook ────────────────────────────────────────────────────
  function onSettingsChange() {
    generate();
    // Snap spring target: if fully identified, target the true recovery angle
    const nIntv = (state.intv1 ? 1 : 0) + (state.intv2 ? 1 : 0);
    if (nIntv > 0 && Binv) {
      recAngle.set(trueRecoveryAngle());
    }
    updateStatus();
  }

  function updateStatus() {
    const nIntv = (state.intv1 ? 1 : 0) + (state.intv2 ? 1 : 0);
    rIntv.set(String(nIntv));
    const mccFmt = mcc.toFixed(2);
    rMCC.set(mccFmt);
    let statusTxt = "entangled";
    if (nIntv === 1) statusTxt = "partially identified";
    if (nIntv >= 2 && mcc > 0.85) statusTxt = "identified ✓";
    rStatus.set(statusTxt);
    if (nIntv >= 2 && mcc > 0.95) {
      chal.setState(true, `MCC = ${mccFmt} with ${nIntv} interventions — latents recovered!`);
    } else {
      chal.setState(false);
    }
  }

  // ── draw helpers ─────────────────────────────────────────────────────────
  function arrMin(xs) { let m = Infinity; for (const v of xs) if (v < m) m = v; return m; }
  function arrMax(xs) { let m = -Infinity; for (const v of xs) if (v > m) m = v; return m; }

  // Draw a 2D scatter on a Canvas.
  // z1vals colors obs points; intPts drawn faintly behind.
  function drawScatter(cv, obsPts, z1vals, intPts1, intPts2, xlabel, ylabel) {
    cv.clear();
    const lo = arrMin(z1vals), hi = arrMax(z1vals);

    const allX = obsPts.map(p => p[0]);
    const allY = obsPts.map(p => p[1]);
    for (const p of intPts1) { allX.push(p[0]); allY.push(p[1]); }
    for (const p of intPts2) { allX.push(p[0]); allY.push(p[1]); }

    const pad = 0.4;
    const sx = new Scale([arrMin(allX) - pad, arrMax(allX) + pad], [cv.box.x0, cv.box.x1]);
    const sy = new Scale([arrMin(allY) - pad, arrMax(allY) + pad], [cv.box.y1, cv.box.y0]);

    drawAxes(cv, sx, sy, { xlabel, ylabel });

    // Interventional clouds (faint)
    for (const p of intPts1) {
      dot(cv.ctx, sx.map(p[0]), sy.map(p[1]), 2.8, "var(--treat)", { alpha: 0.28 });
    }
    for (const p of intPts2) {
      dot(cv.ctx, sx.map(p[0]), sy.map(p[1]), 2.8, "var(--pos)", { alpha: 0.28 });
    }

    // Observational points (colored by z1/PKA)
    for (let i = 0; i < obsPts.length; i++) {
      const c = ptColor(z1vals[i], lo, hi);
      dot(cv.ctx, sx.map(obsPts[i][0]), sy.map(obsPts[i][1]), 2.8, c, { alpha: 0.65 });
    }

    return { sx, sy };
  }

  // Draw basis vectors on a canvas given a Scale pair (as arrows from origin)
  function drawBasis(cv, sx, sy, angle, label1, label2, color1, color2, alpha) {
    const ctx = cv.ctx;
    const ox = sx.map(0), oy = sy.map(0);
    const len = 55; // pixel length for the arrow

    const dirs = [
      { dx: Math.cos(angle),                    dy: -Math.sin(angle),                    label: label1, col: color1 },
      { dx: Math.cos(angle + Math.PI / 2), dy: -Math.sin(angle + Math.PI / 2), label: label2, col: color2 },
    ];

    for (const { dx, dy, label, col: c } of dirs) {
      const ex = ox + dx * len, ey = oy + dy * len;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = c; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
      // arrowhead
      const angle2 = Math.atan2(ey - oy, ex - ox);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 8 * Math.cos(angle2 - 0.4), ey - 8 * Math.sin(angle2 - 0.4));
      ctx.lineTo(ex - 8 * Math.cos(angle2 + 0.4), ey - 8 * Math.sin(angle2 + 0.4));
      ctx.closePath(); ctx.fill();
      // label
      ctx.fillStyle = c;
      ctx.font = "bold 11px var(--mono, monospace)";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, ex + 12 * Math.cos(angle2), ey + 12 * Math.sin(angle2));
      ctx.restore();
    }
  }

  // ── animation ─────────────────────────────────────────────────────────────
  let t = 0;
  const stop = onFrame((dt, tAbs) => {
    t = tAbs;
    recAngle.step(dt);

    const nIntv = (state.intv1 ? 1 : 0) + (state.intv2 ? 1 : 0);

    // Ambient rotation of ambiguous frame when 0 interventions
    if (nIntv === 0) {
      ambigAngle = t * 0.45; // slow spin, radians/s
    } else if (Binv) {
      // Spring toward the true recovery angle
      recAngle.set(trueRecoveryAngle());
    }

    const z1vals = obsZ.map(p => p[0]);
    const showInt1 = state.intv1 ? int1X : [];
    const showInt2 = state.intv2 ? int2X : [];
    const showInt1Z = state.intv1 ? int1Z : [];
    const showInt2Z = state.intv2 ? int2Z : [];
    const showInt1Rec = state.intv1 && Binv ? int1X.map(x => mv(Binv, x)) : [];
    const showInt2Rec = state.intv2 && Binv ? int2X.map(x => mv(Binv, x)) : [];

    // Panel 1: true latents (real PKA vs P38 protein levels)
    drawScatter(cvTrue, obsZ, z1vals, showInt1Z, showInt2Z, "PKA", "P38");
    // Draw true basis (canonical axes, angle = 0)
    {
      const zxs = obsZ.map(p => p[0]), zys = obsZ.map(p => p[1]);
      const pad = 0.4;
      const sx = new Scale([arrMin(zxs) - pad, arrMax(zxs) + pad], [cvTrue.box.x0, cvTrue.box.x1]);
      const sy = new Scale([arrMin(zys) - pad, arrMax(zys) + pad], [cvTrue.box.y1, cvTrue.box.y0]);
      drawBasis(cvTrue, sx, sy, 0, "PKA", "P38", "var(--accent)", "var(--accent2)", 0.7);
    }

    // Panel 2: observed (entangled mix x = A·z)
    drawScatter(cvObs, obsX, z1vals, showInt1, showInt2, "x₁", "x₂");
    // Draw true mixing axes (A's columns) to show the entangled frame
    {
      const xxs = obsX.map(p => p[0]), xys = obsX.map(p => p[1]);
      const pad = 0.4;
      const sx = new Scale([arrMin(xxs) - pad, arrMax(xxs) + pad], [cvObs.box.x0, cvObs.box.x1]);
      const sy = new Scale([arrMin(xys) - pad, arrMax(xys) + pad], [cvObs.box.y1, cvObs.box.y0]);
      const mixAngle = Math.atan2(A[1][0], A[0][0]);
      drawBasis(cvObs, sx, sy, mixAngle, "A₁", "A₂", "var(--accent)", "var(--accent2)", 0.55);
    }

    // Panel 3: recovered (or ambiguous spinning frame)
    if (nIntv === 0 || !Binv) {
      // No interventions: show cloud in obs-space with a freely rotating "?" frame
      drawScatter(cvRec, obsX, z1vals, [], [], "ẑ₁", "ẑ₂");
      {
        const xxs = obsX.map(p => p[0]), xys = obsX.map(p => p[1]);
        const pad = 0.4;
        const sx = new Scale([arrMin(xxs) - pad, arrMax(xxs) + pad], [cvRec.box.x0, cvRec.box.x1]);
        const sy = new Scale([arrMin(xys) - pad, arrMax(xys) + pad], [cvRec.box.y1, cvRec.box.y0]);
        drawBasis(cvRec, sx, sy, ambigAngle, "?", "?", "var(--neg)", "var(--neg)", 0.7);
        const ctx = cvRec.ctx;
        ctx.save();
        ctx.fillStyle = "var(--neg)";
        ctx.font = "bold 11px var(--mono, monospace)";
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.globalAlpha = 0.75;
        ctx.fillText("ambiguous — free rotation", cvRec.w / 2, cvRec.box.y1 + 2);
        ctx.restore();
      }
    } else {
      drawScatter(cvRec, recZ, z1vals, showInt1Rec, showInt2Rec, "ẑ₁", "ẑ₂");
      {
        const rxs = recZ.map(p => p[0]), rys = recZ.map(p => p[1]);
        const pad = 0.4;
        const sx = new Scale([arrMin(rxs) - pad, arrMax(rxs) + pad], [cvRec.box.x0, cvRec.box.x1]);
        const sy = new Scale([arrMin(rys) - pad, arrMax(rys) + pad], [cvRec.box.y1, cvRec.box.y0]);
        const col1 = nIntv >= 1 ? "var(--accent)"  : "var(--neg)";
        const col2 = nIntv >= 2 ? "var(--accent2)" : "var(--neg)";
        drawBasis(cvRec, sx, sy, recAngle.value, "ẑ₁", "ẑ₂", col1, col2, 0.85);
      }
    }

    updateStatus();
  });

  // Initialize spring to current angle (no interventions → just track ambigAngle)
  recAngle.snap(0);

  return () => stop();
}
