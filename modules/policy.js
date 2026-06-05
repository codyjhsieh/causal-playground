// Policy Learning / Optimal Treatment Rules — IHDP benchmark.
// True potential outcomes (mu0, mu1) are known in the IHDP semi-synthetic setup,
// enabling honest scoring of any policy's true welfare value:
//   V(π) = mean_i [ π(xᵢ)·μ₁ᵢ + (1−π(xᵢ))·μ₀ᵢ ] − c · mean_i(π(xᵢ))
// where c is the per-unit treatment cost. Regret = V(oracle) − V(learned).
//
// References:
//   Athey & Wager (2021) — Policy Learning Using Observational Data
//   Manski (2004) — Statistical Treatment Rules for Heterogeneous Populations
//   Kitagawa & Tetenov (2018) — Who Should Be Treated? Empirical Welfare Maximization
//   Hill (2011) — Bayesian Nonparametric Modeling for Causal Inference (IHDP setup)

import { h } from "../lib/dom.js";
import { clamp } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot } from "../lib/plot.js";
import { lessonLayout, panelSection, slider, segmented, button, readout, challenge, note } from "../lib/ui.js";
import { MLP } from "../lib/nn.js";
import { rows as ihdpRows, meta } from "../data/ihdp.js";
import { complete, zscore as dataZscore, dataBadge } from "../lib/data.js";

// ── inject scoped CSS once ──────────────────────────────────────────────────
if (!document.getElementById("policy-css")) {
  const style = document.createElement("style");
  style.id = "policy-css";
  style.textContent = `
    .pol-bars { display:flex; flex-direction:column; gap:6px; margin-top:6px; }
    .pol-bar-row { display:flex; align-items:center; gap:8px; }
    .pol-bar-label { font:11px var(--mono,monospace); color:var(--dim);
                     width:90px; text-align:right; flex-shrink:0; }
    .pol-bar-track { flex:1; height:16px; background:var(--surface2);
                     border-radius:4px; overflow:hidden; position:relative; }
    .pol-bar-fill  { height:100%; border-radius:4px; transition:width .25s ease; min-width:2px; }
    .pol-bar-val   { font:11px var(--mono,monospace); color:var(--dim);
                     width:52px; flex-shrink:0; }
    .pol-legend    { display:flex; gap:10px; flex-wrap:wrap;
                     font:11px var(--mono,monospace); color:var(--dim);
                     margin-top:6px; align-items:center; }
    .pol-legend-dot { display:inline-block; width:9px; height:9px;
                       border-radius:50%; margin-right:3px; vertical-align:middle; }
    .pol-stage-title { font:11px var(--mono,monospace); color:var(--dim);
                        margin:0 0 4px; letter-spacing:.03em; }
    .pol-mode-hint { font:11px var(--mono,monospace); color:var(--dim); margin-top:4px; }
  `;
  document.head.appendChild(style);
}

// ── prepare IHDP data ────────────────────────────────────────────────────────
const COV_KEYS = Array.from({ length: 25 }, (_, i) => "x" + (i + 1));
const REQUIRED  = ["t", "yf", "mu0", "mu1", ...COV_KEYS];
const units = complete(ihdpRows, REQUIRED);
const N = units.length;  // 747

// z-score covariates for MLP input
const covCols = COV_KEYS.map((k) => dataZscore(units.map((r) => r[k])));
const X_raw   = units.map((_, i) => covCols.map((c) => c.z[i]));  // n × 25

// True ITE and potential outcomes (noise-free)
const iteTrue = units.map((r) => r.mu1 - r.mu0);   // scalar per unit
const mu0arr  = units.map((r) => r.mu0);
const mu1arr  = units.map((r) => r.mu1);

// Sort-by-x1 for display axis (x1 is bwg — birth weight, most predictive covariate)
// We'll use z-scored x1 for the scatter x-axis.
const x1z = covCols[0].z;

// Pre-sort indices by x1 for the scatter (used in drawing only)
const sortedIdx = Array.from({ length: N }, (_, i) => i).sort((a, b) => x1z[a] - x1z[b]);

// ── policy value function ────────────────────────────────────────────────────
// π: array of 0/1 (length N), c: cost ≥ 0
// V(π) = mean_i[ π_i·μ₁ᵢ + (1−π_i)·μ₀ᵢ ] − c·mean_i(π_i)
function policyValue(pi, c) {
  let welfare = 0, treated = 0;
  for (let i = 0; i < N; i++) {
    welfare += pi[i] === 1 ? mu1arr[i] : mu0arr[i];
    treated += pi[i];
  }
  return welfare / N - c * (treated / N);
}

// Oracle: treat iff (mu1 - mu0) > c
function oraclePolicy(c) {
  return units.map((_, i) => iteTrue[i] > c ? 1 : 0);
}

// Treat-all / treat-none
const piAll  = new Array(N).fill(1);
const piNone = new Array(N).fill(0);

// ── module entry point ───────────────────────────────────────────────────────
export function mount(root) {
  // ── state ──────────────────────────────────────────────────────────────────
  const state = {
    cost: 2.0,           // treatment cost c
    learnerMode: "t",    // "t" (T-learner) or "s" (S-learner)
    playing: false,
    step: 0,
    // current estimated ITE per unit (from learner)
    iteHat: new Float64Array(N),
    // springs for bar widths
    springs: {},
  };

  // ── networks ───────────────────────────────────────────────────────────────
  // T-learner: two separate MLPs, one per arm; CATE = μ̂₁(x) − μ̂₀(x)
  // S-learner: one MLP with treatment indicator appended as feature
  let netM0, netM1, netS;
  const HIDDEN = [25, 16, 8, 1];
  const S_HIDDEN = [26, 16, 8, 1];

  function initNets(seed) {
    netM0 = new MLP(HIDDEN, { activation: "tanh", outAct: "identity", seed });
    netM1 = new MLP(HIDDEN, { activation: "tanh", outAct: "identity", seed: seed + 1 });
    netS  = new MLP(S_HIDDEN, { activation: "tanh", outAct: "identity", seed: seed + 2 });
    state.step = 0;
    state.iteHat = new Float64Array(N);
  }
  initNets(7);

  // z-score yf for stable training
  const { z: yf_z, mean: yf_mean, sd: yf_sd } = dataZscore(units.map((r) => r.yf));

  // Split indices by arm
  const idxT = [], idxC = [];
  units.forEach((u, i) => (u.t === 1 ? idxT : idxC).push(i));

  // ── training step ──────────────────────────────────────────────────────────
  const LR = 2e-3, WD = 1e-4;

  function trainStepT() {
    // Treated arm → M1; control arm → M0
    const xT = idxT.map((i) => X_raw[i]);
    const yT = idxT.map((i) => [[yf_z[i]]]);
    const xC = idxC.map((i) => X_raw[i]);
    const yC = idxC.map((i) => [[yf_z[i]]]);
    netM1.trainStepMSE(xT, yT.map((r) => r[0]), LR, WD);
    netM0.trainStepMSE(xC, yC.map((r) => r[0]), LR, WD);
  }

  function trainStepS() {
    // S-learner: all units, treatment appended
    const xs = units.map((u, i) => [...X_raw[i], u.t]);
    const ys = units.map((_, i) => [yf_z[i]]);
    netS.trainStepMSE(xs, ys, LR, WD);
  }

  function computeIteHat() {
    if (state.learnerMode === "t") {
      const out0 = netM0.predict(X_raw);   // n × 1
      const out1 = netM1.predict(X_raw);   // n × 1
      for (let i = 0; i < N; i++) {
        state.iteHat[i] = (out1[i][0] - out0[i][0]) * yf_sd;
      }
    } else {
      const xs1 = X_raw.map((r) => [...r, 1]);
      const xs0 = X_raw.map((r) => [...r, 0]);
      const out1 = netS.predict(xs1);
      const out0 = netS.predict(xs0);
      for (let i = 0; i < N; i++) {
        state.iteHat[i] = (out1[i][0] - out0[i][0]) * yf_sd;
      }
    }
  }

  // Learned policy: treat iff τ̂(x) > c
  function learnedPolicy(c) {
    return Array.from({ length: N }, (_, i) => state.iteHat[i] > c ? 1 : 0);
  }

  // ── layout ─────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Policy Learning — Optimal Treatment Rules",
    idea: "Knowing each person's effect isn't the goal — acting on it is. Learn a rule “treat iff it helps more than it costs,” then score the welfare it produces against the best achievable (oracle) policy.",
  });
  root.appendChild(layout);

  // ── data badge ──────────────────────────────────────────────────────────────
  const badge = dataBadge(meta);
  panel.prepend(badge);

  // ── canvases ────────────────────────────────────────────────────────────────
  const CV_W = 520, CV_H = 300;
  const cvScatter = new Canvas(CV_W, CV_H, { margin: { t: 24, r: 18, b: 44, l: 56 } });

  const scatterTitle = h("p", { class: "pol-stage-title",
    text: "units · x-axis = birth-weight z-score (x₁) · y-axis = estimated CATE τ̂(x)" });

  stage.appendChild(scatterTitle);
  stage.appendChild(cvScatter.el);

  // Policy-value comparison bars (rendered as HTML, not canvas)
  const barTitle = h("p", { class: "pol-stage-title", style: { marginTop: "14px" },
    text: "policy value V(π) = welfare − c·fraction treated" });

  const BAR_POLICIES = [
    { key: "all",     label: "treat all",  color: "var(--treat)" },
    { key: "none",    label: "treat none", color: "var(--ctrl)" },
    { key: "learned", label: "learned π",  color: "var(--accent2)" },
    { key: "oracle",  label: "oracle π★",  color: "var(--gold)" },
  ];

  const barEls = {};  // key → { fill, valEl }
  const barsDiv = h("div", { class: "pol-bars" });
  for (const p of BAR_POLICIES) {
    const fill = h("div", { class: "pol-bar-fill", style: { width: "0%", background: p.color } });
    const val  = h("div", { class: "pol-bar-val", text: "—" });
    barEls[p.key] = { fill, val };
    barsDiv.appendChild(h("div", { class: "pol-bar-row" }, [
      h("div", { class: "pol-bar-label", text: p.label }),
      h("div", { class: "pol-bar-track" }, [fill]),
      val,
    ]));
  }

  stage.appendChild(barTitle);
  stage.appendChild(barsDiv);

  // Legend
  const legend = h("div", { class: "pol-legend" }, [
    h("span", {}, [h("span", { class: "pol-legend-dot", style: { background: "var(--treat)" } }), "treated (T=1, above cost line)"]),
    h("span", {}, [h("span", { class: "pol-legend-dot", style: { background: "var(--ctrl)" } }), "untreated (T=0, below cost line)"]),
    h("span", {}, [h("span", { class: "pol-legend-dot", style: { background: "rgba(120,120,130,.4)", borderRadius:"2px", width:"14px", height:"2px", display:"inline-block", verticalAlign:"middle" } }), "cost threshold c"]),
  ]);
  stage.appendChild(legend);

  // ── springs for smooth bar animation ───────────────────────────────────────
  const barSprings = {};
  for (const p of BAR_POLICIES) {
    barSprings[p.key] = new Spring(0, { stiffness: 60, damping: 14 });
  }
  const regretSpring  = new Spring(0, { stiffness: 50, damping: 13 });
  const fracSpring    = new Spring(0, { stiffness: 50, damping: 13 });

  // ── readouts ────────────────────────────────────────────────────────────────
  const rStep    = readout({ label: "train step",         value: "0",   accent: "var(--dim)" });
  const rVlearn  = readout({ label: "V(learned π)",       value: "—",   accent: "var(--accent2)" });
  const rVoracle = readout({ label: "V(oracle π★)",       value: "—",   accent: "var(--gold)" });
  const rRegret  = readout({ label: "Regret ↓",           value: "—",   accent: "var(--neg)" });
  const rFrac    = readout({ label: "Fraction treated",   value: "—",   accent: "var(--dim)" });
  const readoutGrid = h("div", { class: "readout-grid" },
    [rStep, rFrac, rVlearn, rVoracle, rRegret]);

  // ── controls ────────────────────────────────────────────────────────────────
  // Cost slider
  const costSlider = slider({
    label: "Treatment cost c",
    min: 0, max: 8, step: 0.1, value: state.cost,
    fmt: (v) => v.toFixed(1),
    hint: "(net benefit = ITE − c)",
    onInput: (v) => { state.cost = v; },
  });

  // Learner mode toggle
  const modeSegment = segmented({
    options: [
      { label: "T-learner (two MLPs)", value: "t" },
      { label: "S-learner (one MLP)", value: "s" },
    ],
    value: state.learnerMode,
    onSelect: (v) => {
      state.learnerMode = v;
      // re-init nets on mode switch
      initNets(Math.floor(Math.random() * 9999));
      chalSolved = false;
      chal.setState(false);
    },
  });

  const playBtn  = button("▶ train", () => {
    state.playing = !state.playing;
    playBtn.textContent = state.playing ? "⏸ pause" : "▶ train";
  }, { primary: true });
  const resetBtn = button("↺ reset net", () => {
    state.playing = false;
    playBtn.textContent = "▶ train";
    initNets(Math.floor(Math.random() * 9999));
    chalSolved = false;
    chal.setState(false);
  });

  let chalSolved = false;
  const chal = challenge({
    goal: "Choose a cost where the learned targeted policy beats both treat-all and treat-none, and get Regret < 0.15. (Try cost ≈ 2–4 after ~200 train steps.)",
  });

  panel.append(
    panelSection("Policy values", readoutGrid),
    panelSection("Cost", [costSlider,
      h("p", { class: "pol-mode-hint",
        text: "Drag cost: at c=0 treat-all is optimal; as c rises a targeted policy wins." }) ]),
    panelSection("Learner", [
      modeSegment,
      h("p", { class: "pol-mode-hint",
        text: "T-learner fits separate outcome models per arm; S-learner fits one model with T as a feature." }),
    ]),
    panelSection("Training", [
      h("div", { class: "btn-row", style: { marginTop: "6px" } }, [playBtn, resetBtn]),
      note("Train to estimate CATE τ̂(x). The policy is π(x)=1{τ̂(x)>c} — treat iff estimated net benefit is positive."),
    ]),
    panelSection("Challenge", chal),
    panelSection("", [
      note("V(π) = mean_i [π_i·μ₁_i + (1−π_i)·μ₀_i] − c·mean_i(π_i). Oracle π★ uses true ITE = μ₁−μ₀ (unobservable in practice). Regret = V(oracle)−V(learned)."),
    ]),
  );

  caption.innerHTML =
    "<strong>IHDP semi-synthetic benchmark (Hill 2011).</strong> " +
    "Real covariates x₁–x₂₅ from n=747 infants; potential outcomes μ₀, μ₁ simulated under the NPCI setup so the true ITE = μ₁−μ₀ is known. " +
    "A policy π: x↦{0,1} is scored by its true welfare value <em>V(π) = 𝔼[π(x)·μ₁ + (1−π(x))·μ₀] − c·𝔼[π(x)]</em> where c ≥ 0 is the per-unit treatment cost. " +
    "The oracle policy π★(x) = 1{μ₁−μ₀ > c} is the best achievable and sets the ceiling; regret = V(π★)−V(π̂) measures the welfare gap. " +
    "Estimating CATE by T-learner (two separate outcome MLPs) or S-learner (one MLP with T as feature) and thresholding at c gives a learned policy — " +
    "even an imperfect CATE estimate can support a near-oracle policy once the cost threshold is tuned. " +
    "<em>Athey &amp; Wager (2021) (policy learning); Manski (2004); Kitagawa &amp; Tetenov (2018).</em>";

  // ── draw scatter ────────────────────────────────────────────────────────────
  // The scatter x-axis = x1 (birth-weight z-score), y-axis = estimated CATE τ̂(x).
  // A horizontal dashed line at y = cost c acts as the decision boundary.
  // Units above the line are "treated" (highlighted orange), below are "untreated".
  // The spring-animated line slides as c changes.

  // Spring for the cost threshold line y-position
  const costLineSpring = new Spring(state.cost, { stiffness: 80, damping: 16 });

  function drawScatter(c) {
    const cv = cvScatter;
    cv.clear();

    // Axis ranges: x-axis = x1z (z-scored birth weight), y-axis = CATE estimate
    const xArr = sortedIdx.map((i) => x1z[i]);
    const yArr = Array.from(state.iteHat);

    // Determine y range from actual ITE estimates + true ITEs for context
    const allITE = [...yArr, ...iteTrue];
    const ylo = Math.max(-6, Math.min(...allITE) - 0.5);
    const yhi = Math.min(14, Math.max(...allITE) + 0.5);

    const sx = new Scale([Math.min(...xArr) - 0.1, Math.max(...xArr) + 0.1], [cv.box.x0, cv.box.x1]);
    const sy = new Scale([ylo, yhi], [cv.box.y1, cv.box.y0]);

    drawAxes(cv, sx, sy, { xlabel: "birth-weight z-score (x₁)", ylabel: "CATE τ̂(x)", grid: true });

    // Cost threshold line (animated)
    const cLine = costLineSpring.value;
    const lineY = clamp(sy.map(cLine), cv.box.y0, cv.box.y1);
    const ctx = cv.ctx;
    ctx.save();
    ctx.strokeStyle = "var(--dim)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo(cv.box.x0, lineY);
    ctx.lineTo(cv.box.x1, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // label
    ctx.fillStyle = "var(--dim)";
    ctx.font = "10px var(--mono,monospace)";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`c = ${cLine.toFixed(1)}`, cv.box.x0 + 3, lineY - 2);
    ctx.restore();

    // Shade "treat" region above threshold
    ctx.save();
    ctx.fillStyle = "rgba(255,107,107,0.05)";
    ctx.fillRect(cv.box.x0, cv.box.y0, cv.iw, Math.max(0, lineY - cv.box.y0));
    ctx.restore();

    // Plot units (draw untreated first, then treated on top)
    for (const pass of [0, 1]) {
      for (let si = 0; si < N; si++) {
        const i = sortedIdx[si];
        const treated = state.iteHat[i] > c ? 1 : 0;
        if (treated !== pass) continue;
        const px = sx.map(x1z[i]);
        const py = clamp(sy.map(state.iteHat[i]), cv.box.y0 - 5, cv.box.y1 + 5);
        const color = treated ? "var(--treat)" : "var(--ctrl)";
        dot(cv.ctx, px, py, 2.3, color, { alpha: treated ? 0.65 : 0.38 });
      }
    }

    // True ITE dots (small, gold, behind label)
    ctx.save();
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < N; i++) {
      const px = sx.map(x1z[i]);
      const py = clamp(sy.map(iteTrue[i]), cv.box.y0 - 3, cv.box.y1 + 3);
      dot(cv.ctx, px, py, 1.5, "var(--gold)", { alpha: 1 });
    }
    ctx.restore();

    // Label
    ctx.fillStyle = "var(--dim)";
    ctx.font = "10px var(--mono,monospace)";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText("gold=true ITE", cv.box.x1 - 2, cv.box.y0 + 2);
  }

  // ── draw value bars ─────────────────────────────────────────────────────────
  function updateBars(vals) {
    // vals: { all, none, learned, oracle }
    // Normalize to [0,1] relative to oracle (or treat-all if oracle is tiny)
    const vMax = Math.max(vals.all, vals.none, vals.learned, vals.oracle, 0.001);
    const vMin = Math.min(vals.all, vals.none, vals.learned, vals.oracle, 0);
    const span = vMax - vMin || 1;

    for (const p of BAR_POLICIES) {
      const v = vals[p.key];
      barSprings[p.key].set(Math.max(0, (v - vMin) / span));
      const pct = (barSprings[p.key].value * 100).toFixed(1);
      barEls[p.key].fill.style.width = pct + "%";
      barEls[p.key].val.textContent = v.toFixed(3);
    }
  }

  // ── readout updater ─────────────────────────────────────────────────────────
  function updateReadouts(vals, piL, c) {
    const frac = piL.reduce((a, b) => a + b, 0) / N;
    fracSpring.set(frac);
    regretSpring.set(Math.max(0, vals.oracle - vals.learned));

    rStep.set(String(state.step));
    rVlearn.set(vals.learned.toFixed(4));
    rVoracle.set(vals.oracle.toFixed(4));
    rRegret.set(regretSpring.value.toFixed(4));
    rFrac.set((fracSpring.value * 100).toFixed(1) + "%");

    // Color regret
    const regretEl = rRegret.querySelector(".readout-value");
    if (regretEl) {
      const r = regretSpring.value;
      regretEl.style.color = r < 0.10 ? "var(--pos)" : r < 0.30 ? "var(--gold)" : "var(--neg)";
    }
  }

  // ── challenge checker ───────────────────────────────────────────────────────
  function checkChallenge(vals, c) {
    if (chalSolved) return;
    const regret = vals.oracle - vals.learned;
    const beatsAll  = vals.learned > vals.all;
    const beatsNone = vals.learned > vals.none;
    if (beatsAll && beatsNone && regret < 0.15 && state.step > 50) {
      chalSolved = true;
      chal.setState(
        true,
        `At cost c=${c.toFixed(1)}: V(learned)=${vals.learned.toFixed(3)}, V(oracle)=${vals.oracle.toFixed(3)}, ` +
        `Regret=${regret.toFixed(3)} — targeted policy dominates both baselines.`
      );
    }
  }

  // ── main frame loop ─────────────────────────────────────────────────────────
  const STEPS_PER_FRAME = 4;

  const stop = onFrame((dt) => {
    // step springs
    costLineSpring.set(state.cost);
    costLineSpring.step(dt);
    regretSpring.step(dt);
    fracSpring.step(dt);
    for (const sp of Object.values(barSprings)) sp.step(dt);

    // training
    if (state.playing) {
      for (let k = 0; k < STEPS_PER_FRAME; k++) {
        if (state.learnerMode === "t") trainStepT();
        else trainStepS();
        state.step++;
      }
    }

    // compute
    computeIteHat();
    const c = state.cost;
    const piL = learnedPolicy(c);
    const piO = oraclePolicy(c);

    const vals = {
      all:     policyValue(piAll,  c),
      none:    policyValue(piNone, c),
      learned: policyValue(piL,    c),
      oracle:  policyValue(piO,    c),
    };

    // draw
    drawScatter(c);
    updateBars(vals);
    updateReadouts(vals, piL, c);
    checkChallenge(vals, c);
  });

  return () => stop();
}
