// Instrumental Variables on real Card (1995) schooling & earnings data.
// Card, David (1995). "Using Geographic Variation in College Proximity to
// Estimate the Return to Schooling." Aspects of Labour Market Behaviour:
// Essays in Honour of John Vanderkamp.
//
// Economics: OLS of log-wage on education is upward-confounded by unobserved
// ability (ability → more schooling AND higher wage). Growing up near a
// 4-year college (nearc4) raises schooling attainment but plausibly doesn't
// directly affect wages — making it a valid instrument. The IV / 2SLS estimate
// corrects for ability bias and turns out ABOVE the naive OLS estimate
// (≈ 0.13 vs ≈ 0.07), consistent with measurement-error / downward-ability-
// bias stories debated in the literature.

import { rows, meta } from "../data/card.js";
import { col, complete, dataBadge } from "../lib/data.js";
import { h, s, clear } from "../lib/dom.js";
import { mean, covariance, clamp, olsMulti } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, dot } from "../lib/plot.js";
import { DAG, DAGView } from "../lib/dag.js";
import { lessonLayout, panelSection, slider, readout, challenge } from "../lib/ui.js";

// ---- inject module-scoped CSS once -----------------------------------------
function injectCSS() {
  if (document.getElementById("iv-css")) return;
  const style = document.createElement("style");
  style.id = "iv-css";
  style.textContent = `
    .iv-stage-col { display:flex; flex-direction:column; gap:12px; align-items:center; width:100%; }
    .iv-dag-wrap p.stage-title { margin:0 0 4px; font-size:11px; color:var(--dim); text-align:center; letter-spacing:.04em; text-transform:uppercase; }
    .iv-lever-wrap { position:relative; width:540px; }
    .iv-lever-wrap p.stage-title { margin:0 0 4px; font-size:11px; color:var(--dim); text-align:center; letter-spacing:.04em; text-transform:uppercase; }
    .iv-noise-wrap { position:relative; width:540px; }
    .iv-noise-wrap p.stage-title { margin:0 0 4px; font-size:11px; color:var(--dim); text-align:center; letter-spacing:.04em; text-transform:uppercase; }
    .iv-assumptions { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px; }
    .iv-assumptions li { display:flex; align-items:flex-start; gap:6px; font-size:12px; color:var(--dim); }
    .iv-assumptions li strong { color:var(--accent2); min-width:90px; }
    .iv-wald-label {
      font-family: var(--mono, ui-monospace, monospace);
      font-size: 11px;
      fill: var(--dim);
      dominant-baseline: middle;
    }
    .iv-wald-val {
      font-family: var(--mono, ui-monospace, monospace);
      font-size: 13px;
      font-weight: 700;
      dominant-baseline: middle;
    }
    .iv-triangle-rise { fill: rgba(100, 220, 180, 0.12); stroke: var(--accent2); stroke-width: 1.5; }
    .iv-triangle-run  { fill: rgba(140, 120, 255, 0.12); stroke: var(--accent);  stroke-width: 1.5; }
    .iv-arrow-dx { stroke: var(--accent); stroke-width: 2; fill: none; }
    .iv-arrow-dy { stroke: var(--accent2); stroke-width: 2; fill: none; }
  `;
  document.head.appendChild(style);
}

// ---- pre-process the real Card data ----------------------------------------
// Complete cases for the core variables used in all regressions.
const KEYS = ["lwage", "educ", "nearc4", "exper", "expersq", "black", "south", "smsa"];
const data = complete(rows, KEYS);

// Raw columns (full sample)
const lwage    = col(data, "lwage");
const educ     = col(data, "educ");
const nearc4   = col(data, "nearc4");
const exper    = col(data, "exper");
const expersq  = col(data, "expersq");
const black    = col(data, "black");
const south    = col(data, "south");
const smsa     = col(data, "smsa");
const N_FULL   = data.length;  // ≈ 3010

// ---- helper: OLS coeff on educ, adjusting for controls --------------------
// controls = [exper, expersq, black, south, smsa]
// Design matrix for lwage ~ [1, educ, controls]
function buildX(educArr, experArr, expersqArr, blackArr, southArr, smsaArr) {
  return educArr.map((_, i) => [
    1, educArr[i], experArr[i], expersqArr[i], blackArr[i], southArr[i], smsaArr[i],
  ]);
}

// ---- compute IV estimates on an arbitrary bootstrap subsample -------------
// indices: array of row indices into `data` to use.
function computeOnSample(indices) {
  const n = indices.length;
  const lw   = indices.map((i) => lwage[i]);
  const ed   = indices.map((i) => educ[i]);
  const nc4  = indices.map((i) => nearc4[i]);
  const ex   = indices.map((i) => exper[i]);
  const exsq = indices.map((i) => expersq[i]);
  const bl   = indices.map((i) => black[i]);
  const so   = indices.map((i) => south[i]);
  const sm   = indices.map((i) => smsa[i]);

  // (1) Naive OLS: lwage ~ [1, educ, controls]
  const Xols = buildX(ed, ex, exsq, bl, so, sm);
  const olsRes = olsMulti(Xols, lw);
  const olsEduc = olsRes.beta[1]; // coeff on educ

  // (2) First stage: educ ~ [1, nearc4, controls]
  const Xfs = ed.map((_, i) => [1, nc4[i], ex[i], exsq[i], bl[i], so[i], sm[i]]);
  const fsRes = olsMulti(Xfs, ed);
  const firstStage = fsRes.beta[1]; // coeff on nearc4

  // (3) 2SLS / Wald via partialling-out (Frisch-Waugh):
  //   residualize lwage and educ on controls [1, exper, expersq, black, south, smsa]
  const Xctrl = ed.map((_, i) => [1, ex[i], exsq[i], bl[i], so[i], sm[i]]);
  const lwResid = residualize(Xctrl, lw);
  const edResid = residualize(Xctrl, ed);
  const nc4Resid = residualize(Xctrl, nc4);

  // IV = cov(lwage_resid, nearc4_resid) / cov(educ_resid, nearc4_resid)
  const covLwNc4 = covariance(lwResid, nc4Resid);
  const covEdNc4 = covariance(edResid, nc4Resid);
  const ivEst = Math.abs(covEdNc4) < 1e-10 ? Infinity : covLwNc4 / covEdNc4;

  // Group means for Wald lever (unconditional, just for visualization geometry)
  const idx1 = indices.filter((i) => nearc4[i] === 1);
  const idx0 = indices.filter((i) => nearc4[i] === 0);
  const edMean1 = mean(idx1.map((i) => educ[i]));
  const edMean0 = mean(idx0.map((i) => educ[i]));
  const lwMean1 = mean(idx1.map((i) => lwage[i]));
  const lwMean0 = mean(idx0.map((i) => lwage[i]));
  const deltaX  = edMean1 - edMean0;
  const deltaY  = lwMean1 - lwMean0;

  return { olsEst: olsEduc, ivEst, firstStage, deltaX, deltaY, edMean0, edMean1, lwMean0, lwMean1 };
}

// OLS residuals of y on X (for partialling out)
function residualize(X, y) {
  const res = olsMulti(X, y);
  const n = y.length;
  const resid = new Array(n);
  for (let i = 0; i < n; i++) {
    let yhat = 0;
    for (let j = 0; j < X[i].length; j++) yhat += X[i][j] * res.beta[j];
    resid[i] = y[i] - yhat;
  }
  return resid;
}

// ---- headline estimates on full data (stable reference) --------------------
const ALL_INDICES = Array.from({ length: N_FULL }, (_, i) => i);
const FULL_EST = computeOnSample(ALL_INDICES);

// ---- simple seeded LCG for bootstrap (no RNG dependency) ------------------
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function bootstrapIndices(n, rngFn) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(rngFn() * N_FULL);
  return out;
}

// ---- Lever / triangle SVG --------------------------------------------------
// Draws the animated Wald "rise-over-run" right triangle.
// Horizontal leg = deltaX (run: instrument nudges schooling).
// Vertical leg   = deltaY (rise: wages move). Ratio = Wald IV.
function renderLever(lever, sx, sy, est, W, H) {
  const { gTriangle, gDots, gLabels, gAxes } = lever;
  clear(gTriangle); clear(gDots); clear(gLabels); clear(gAxes);

  const { deltaX, deltaY, edMean0, edMean1, lwMean0, lwMean1 } = est;
  const dim = "var(--faint)";

  // dashed grid lines at group means
  for (const xv of [edMean0, edMean1]) {
    const px = sx.map(xv);
    gAxes.append(s("line", { x1: px, y1: 24, x2: px, y2: H - 36, stroke: dim, "stroke-width": 1, "stroke-dasharray": "4 3" }));
  }
  for (const yv of [lwMean0, lwMean1]) {
    const py = sy.map(yv);
    gAxes.append(s("line", { x1: 48, y1: py, x2: W - 16, y2: py, stroke: dim, "stroke-width": 1, "stroke-dasharray": "4 3" }));
  }

  const px0 = sx.map(edMean0), py0 = sy.map(lwMean0); // nearc4=0 group
  const px1 = sx.map(edMean1), py1 = sy.map(lwMean1); // nearc4=1 group
  const pxC = px1, pyC = py0; // right-angle corner

  // run (horizontal) triangle
  gTriangle.append(s("polygon", {
    points: `${px0},${pyC} ${pxC},${pyC} ${px0},${py0}`,
    class: "iv-triangle-run", opacity: 0.8,
  }));
  // rise (vertical) triangle
  gTriangle.append(s("polygon", {
    points: `${pxC},${py0} ${pxC},${py1} ${px1},${py1}`,
    class: "iv-triangle-rise", opacity: 0.8,
  }));
  // hypotenuse
  gTriangle.append(s("line", {
    x1: px0, y1: py0, x2: px1, y2: py1,
    stroke: "var(--gold)", "stroke-width": 2.5, "stroke-dasharray": "6 3",
  }));

  // arrows
  gTriangle.append(s("line", { x1: px0 + 4, y1: pyC, x2: pxC - 2, y2: pyC, stroke: "var(--accent)", "stroke-width": 2.2, "marker-end": "url(#iv-arrow-h)" }));
  const riseUp = py1 < py0;
  gTriangle.append(s("line", { x1: pxC, y1: py0 + (riseUp ? -4 : 4), x2: pxC, y2: py1 + (riseUp ? 4 : -4), stroke: "var(--accent2)", "stroke-width": 2.2, "marker-end": "url(#iv-arrow-v)" }));

  // group dots
  const r = 9;
  gDots.append(s("circle", { cx: px0, cy: py0, r, fill: "var(--ctrl)",  stroke: "var(--surface)", "stroke-width": 2 }));
  gDots.append(s("circle", { cx: px1, cy: py1, r, fill: "var(--treat)", stroke: "var(--surface)", "stroke-width": 2 }));

  const dotLabel = (x, y, txt, fill) =>
    s("text", { x, y: y - r - 6, "text-anchor": "middle", fill, "font-size": 11, "font-family": "var(--sans, sans-serif)", "font-weight": 600, text: txt });
  gLabels.append(dotLabel(px0, py0, "Z=0 (not near college)", "var(--ctrl)"));
  gLabels.append(dotLabel(px1, py1, "Z=1 (near 4-yr college)", "var(--treat)"));

  // ΔX label (run)
  const dxLabel = deltaX >= 0 ? `Δeduc=+${deltaX.toFixed(3)}` : `Δeduc=${deltaX.toFixed(3)}`;
  gLabels.append(s("text", {
    x: (px0 + pxC) / 2, y: pyC + 14, "text-anchor": "middle",
    class: "iv-wald-label", fill: "var(--accent)", text: dxLabel,
  }));

  // ΔY label (rise)
  const dyLabel = deltaY >= 0 ? `Δlwage=+${deltaY.toFixed(3)}` : `Δlwage=${deltaY.toFixed(3)}`;
  gLabels.append(s("text", {
    x: pxC + 52, y: (py0 + py1) / 2, "text-anchor": "start",
    class: "iv-wald-label", fill: "var(--accent2)", text: dyLabel,
  }));

  // Wald ratio label on hypotenuse midpoint
  const waldIV = isFinite(est.deltaY / est.deltaX) ? (est.deltaY / est.deltaX).toFixed(3) : "∞";
  gLabels.append(s("text", {
    x: (px0 + px1) / 2 - 10, y: (py0 + py1) / 2 - 10,
    "text-anchor": "middle", class: "iv-wald-val",
    fill: "var(--gold)", text: `Wald = ΔY/ΔX = ${waldIV}`,
  }));

  // axis labels
  gAxes.append(s("text", { x: (48 + W - 16) / 2, y: H - 4, "text-anchor": "middle", class: "iv-wald-label", fill: "var(--dim)", text: "E[educ | nearc4 group]  (first stage, the run)" }));
  gAxes.append(s("text", { x: 10, y: (24 + H - 36) / 2, "text-anchor": "middle", class: "iv-wald-label", fill: "var(--dim)", transform: `rotate(-90,10,${(24 + H - 36) / 2})`, text: "E[log wage | nearc4 group]  (reduced form, the rise)" }));
}

// ---- noise canvas (bootstrap-sample-size blowup) ---------------------------
// Draws IV and OLS estimates from 80 bootstrap resamples of size n.
// As n shrinks, IV variance explodes while OLS stays tight.
function drawNoiseCanvas(cv, ivSamples, olsSamples) {
  cv.clear();
  const ctx = cv.ctx;
  const b = cv.box;

  const allVals = [...ivSamples, ...olsSamples].filter(isFinite);
  if (allVals.length === 0) return;

  // center display on OLS/IV reference values, expand to show spread
  const OLS_REF = FULL_EST.olsEst;
  const IV_REF  = FULL_EST.ivEst;
  const lo = clamp(Math.min(...allVals), OLS_REF - 0.5, OLS_REF - 0.02);
  const hi = clamp(Math.max(...allVals), IV_REF  + 0.02, IV_REF  + 0.5);
  const pad = Math.max((hi - lo) * 0.08, 0.02);
  const sx = new Scale([lo - pad, hi + pad], [b.x0, b.x1]);

  const midY = (b.y0 + b.y1) / 2;
  ctx.save();

  // axis
  ctx.strokeStyle = "var(--faint)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(b.x0, midY); ctx.lineTo(b.x1, midY); ctx.stroke();

  // reference lines for full-sample OLS and IV
  for (const [val, color, label] of [
    [OLS_REF, "var(--neg)",     "OLS ≈ " + OLS_REF.toFixed(3)],
    [IV_REF,  "var(--accent2)", "IV  ≈ " + IV_REF.toFixed(3)],
  ]) {
    const px = sx.map(val);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(px, b.y0); ctx.lineTo(px, b.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = "10px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label, px, b.y0 + 2);
  }

  // OLS bootstrap dots (tight cluster)
  for (let i = 0; i < olsSamples.length; i++) {
    if (!isFinite(olsSamples[i])) continue;
    const jitter = (i / olsSamples.length - 0.5) * (b.y1 - b.y0) * 0.4;
    dot(ctx, sx.map(olsSamples[i]), midY - (b.y1 - b.y0) * 0.22 + jitter * 0.4, 3.5, "var(--neg)", { alpha: 0.6 });
  }

  // IV bootstrap dots (wide spread)
  for (let i = 0; i < ivSamples.length; i++) {
    if (!isFinite(ivSamples[i])) continue;
    const jitter = (i / ivSamples.length - 0.5) * (b.y1 - b.y0) * 0.55;
    dot(ctx, sx.map(ivSamples[i]), midY + (b.y1 - b.y0) * 0.22 + jitter * 0.4, 3.5, "var(--accent2)", { alpha: 0.65 });
  }

  // legend
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "var(--neg)";    ctx.fillText("OLS (confounded, tight)", b.x0 + 8, b.y0 + 18);
  ctx.fillStyle = "var(--accent2)"; ctx.fillText("IV (corrected but noisy)",  b.x0 + 8, b.y1 - 14);

  // x-axis tick values (return-to-schooling range)
  ctx.textAlign = "center"; ctx.fillStyle = "var(--dim)";
  ctx.font = "10px ui-monospace, Menlo, monospace";
  for (const t of [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30]) {
    const px = sx.map(t);
    if (px < b.x0 || px > b.x1) continue;
    ctx.fillText(t.toFixed(2), px, b.y1 + 14);
    ctx.strokeStyle = "var(--dim)";
    ctx.beginPath(); ctx.moveTo(px, b.y1); ctx.lineTo(px, b.y1 + 5); ctx.stroke();
  }
  ctx.restore();
}

// ---- main export -----------------------------------------------------------
export function mount(root) {
  injectCSS();

  const state = {
    bootstrapN: 500,  // bootstrap sample size; shrinking this explodes IV variance
    seed: 42,
  };

  // springs for animated readout values
  const spOLS = new Spring(FULL_EST.olsEst,    { stiffness: 40, damping: 11 });
  const spIV  = new Spring(FULL_EST.ivEst,     { stiffness: 40, damping: 11 });
  const spFS  = new Spring(FULL_EST.firstStage, { stiffness: 40, damping: 11 });

  let ivSamples = [], olsSamples = [];

  // ---- layout ----
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Instrumental Variables",
    idea: "Card (1995): growing up near a 4-year college (nearc4) raises schooling but plausibly doesn't directly affect wages — making it a valid instrument to recover an unbiased return to education despite unobserved ability bias.",
  });

  // ---- DAG -------------------------------------------------------------------
  const dag = new DAG(
    [
      { id: "Z", label: "Z", sub: "near college",  x: 90,  y: 200, role: "treatment",  conditionable: false },
      { id: "X", label: "X", sub: "schooling",     x: 270, y: 200, role: "treatment",  conditionable: false },
      { id: "Y", label: "Y", sub: "log wage",      x: 450, y: 200, role: "outcome",    conditionable: false },
      { id: "U", label: "U", sub: "ability",        x: 360, y: 70,  role: "confounder", conditionable: false },
    ],
    [
      { from: "Z", to: "X", sign: "+", label: "relevance" },
      { from: "X", to: "Y", sign: "+", label: "β (causal)" },
      { from: "U", to: "X", dashed: true, weak: true },
      { from: "U", to: "Y", dashed: true, weak: true },
      // no Z→Y (exclusion), no Z↔U (independence)
    ]
  );

  const view = new DAGView(dag, { width: 540, height: 280, conditionable: false, draggableNodes: false });
  view.setFlow([
    { from: "X", to: "Y" }, // causal
    { from: "U", to: "Y" }, // confounding
  ]);

  const dagWrap = h("div", { class: "iv-dag-wrap" }, [
    h("p", { class: "stage-title", text: "DAG — no arrow Z→Y (exclusion) and Z⫫U (independence)" }),
    view.svg,
  ]);

  // ---- Wald lever SVG --------------------------------------------------------
  const LEVER_W = 540, LEVER_H = 240;
  const leverSVG = s("svg", { viewBox: `0 0 ${LEVER_W} ${LEVER_H}`, width: LEVER_W, height: LEVER_H, style: "overflow:visible; display:block;" });

  const leverDefs = s("defs");
  for (const [id, color] of [["iv-arrow-h", "var(--accent)"], ["iv-arrow-v", "var(--accent2)"]]) {
    leverDefs.append(s("marker", {
      id, viewBox: "0 0 10 10", refX: 9, refY: 5,
      markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse",
    }, [s("path", { d: "M0,0 L10,5 L0,10 z", fill: color })]));
  }
  leverSVG.append(leverDefs);

  const gAxes    = s("g"); const gTriangle = s("g"); const gDots = s("g"); const gLabels = s("g");
  leverSVG.append(gAxes, gTriangle, gDots, gLabels);
  const lever = { gTriangle, gDots, gLabels, gAxes };

  const leverWrap = h("div", { class: "iv-lever-wrap" }, [
    h("p", { class: "stage-title", text: "Wald estimator — IV = Δlog-wage / Δeduc (rise over run)" }),
    leverSVG,
  ]);

  // ---- Noise canvas (bootstrap-sample-size blowup) ---------------------------
  const noiseCv = new Canvas(540, 120, { margin: { t: 22, r: 16, b: 28, l: 16 } });
  const noiseWrap = h("div", { class: "iv-noise-wrap" }, [
    h("p", { class: "stage-title", text: "80 bootstrap resamples — shrink n to watch IV variance explode while OLS stays tight" }),
    noiseCv.el,
  ]);

  // ---- assemble stage --------------------------------------------------------
  stage.style.display = "flex"; stage.style.justifyContent = "center";
  const stageCol = h("div", { class: "iv-stage-col" }, [dagWrap, leverWrap, noiseWrap]);
  stage.appendChild(stageCol);

  // ---- readouts --------------------------------------------------------------
  const rOLS = readout({ label: "OLS return (confounded)",  value: "—", accent: "var(--neg)"     });
  const rFS  = readout({ label: "First stage Δeduc",        value: "—", accent: "var(--accent)"  });
  const rIV  = readout({ label: "IV / 2SLS return",         value: "—", accent: "var(--accent2)" });

  // ---- slider — bootstrap sample size ----------------------------------------
  const nSlider = slider({
    label: "Bootstrap sample size  n",
    min: 50, max: N_FULL, step: 50, value: state.bootstrapN,
    fmt: (v) => String(Math.round(v)),
    hint: "(shrink to watch IV variance blow up)",
    onInput: (v) => { state.bootstrapN = Math.round(v); recompute(); },
  });

  // ---- challenge -------------------------------------------------------------
  const chal = challenge({
    goal: "Compute the IV estimate — observe IV > OLS (ability-bias correction) — then shrink n to watch IV variance explode.",
  });

  // ---- assumptions list ------------------------------------------------------
  const assumptionsList = h("ul", { class: "iv-assumptions" }, [
    h("li", {}, [h("strong", { text: "Relevance:" }), " nearc4 shifts years of schooling (first stage ≠ 0, Δeduc ≈ +0.83 yrs)."]),
    h("li", {}, [h("strong", { text: "Exclusion:" }), " nearc4 affects log wages only through schooling (no Z→Y arrow)."]),
    h("li", {}, [h("strong", { text: "Independence:" }), " Proximity to college is as-good-as-random conditional on controls (Z⫫U)."]),
  ]);

  // ---- panel -----------------------------------------------------------------
  panel.prepend(dataBadge(meta));
  panel.append(
    panelSection("Three estimates", h("div", { class: "readout-grid" }, [rOLS, rFS, rIV])),
    panelSection("Controls", [nSlider]),
    panelSection("IV Assumptions", assumptionsList),
    panelSection("Challenge", chal),
  );

  // ---- caption ---------------------------------------------------------------
  caption.innerHTML =
    "<strong>Card (1995)</strong> — Using Geographic Variation in College Proximity to Estimate the Return to Schooling. " +
    "Naïve OLS regresses log wages on education, but <em>ability</em> confounds both (ability raises schooling <em>and</em> wages), " +
    "biasing the coefficient. <strong>nearc4</strong> (grew up near a 4-year college) is a valid instrument: " +
    "<strong>Relevance</strong> — proximity raises schooling by ≈ 0.83 years. " +
    "<strong>Exclusion</strong> — college proximity affects wages only via the schooling it induces, not directly. " +
    "<strong>Independence</strong> — conditional on controls, college proximity is unrelated to unobserved ability. " +
    "The Wald / 2SLS estimate (≈ 0.13 per extra year) <em>exceeds</em> the naïve OLS estimate (≈ 0.07), " +
    "consistent with measurement error and ability-bias stories in the literature. " +
    "Shrink the bootstrap sample size to demonstrate IV's variance cost: as n falls, the IV estimator's spread <em>explodes</em> " +
    "while OLS stays tight — the fundamental bias-variance trade-off of instrumental variables. " +
    "<em>Real data: Card (1995), n ≈ 3010, NLSYM.</em>";

  root.appendChild(layout);

  // ---- recompute -------------------------------------------------------------
  function recompute() {
    // Full-sample lever always uses the stable headline estimates
    updateLever(FULL_EST);

    // Bootstrap resamples for noise canvas
    const rngFn = lcg(state.seed + 17);
    ivSamples  = [];
    olsSamples = [];
    for (let k = 0; k < 80; k++) {
      const idx = bootstrapIndices(state.bootstrapN, rngFn);
      const e = computeOnSample(idx);
      if (isFinite(e.ivEst)  && e.ivEst  > -1 && e.ivEst  < 2) ivSamples.push(e.ivEst);
      if (isFinite(e.olsEst) && e.olsEst > -1 && e.olsEst < 2) olsSamples.push(e.olsEst);
    }

    // Update spring targets to full-sample estimates (stable)
    spOLS.set(clamp(FULL_EST.olsEst,    -1, 2));
    spIV.set( clamp(FULL_EST.ivEst,     -1, 2));
    spFS.set( clamp(FULL_EST.firstStage, 0, 5));

    // Challenge: IV > OLS means we've seen the correction; then shrink n for the variance lesson
    const ivAboveOLS = FULL_EST.ivEst > FULL_EST.olsEst + 0.02;
    const nSmall     = state.bootstrapN <= 200;
    if (ivAboveOLS && nSmall) {
      const ivSpread = ivSamples.length > 1 ? Math.sqrt(ivSamples.reduce((s, v) => s + (v - FULL_EST.ivEst) ** 2, 0) / ivSamples.length).toFixed(3) : "—";
      chal.setState(true, `IV(${FULL_EST.ivEst.toFixed(3)}) > OLS(${FULL_EST.olsEst.toFixed(3)}) — at n=${state.bootstrapN} IV std≈${ivSpread}, variance has exploded!`);
    } else if (ivAboveOLS) {
      chal.setState(false, `IV(${FULL_EST.ivEst.toFixed(3)}) > OLS(${FULL_EST.olsEst.toFixed(3)}) — now shrink n to watch IV variance blow up.`);
    } else {
      chal.setState(false);
    }

    drawNoiseCanvas(noiseCv, ivSamples, olsSamples);
  }

  function updateLever(est) {
    const xVals = [est.edMean0, est.edMean1];
    const yVals = [est.lwMean0, est.lwMean1];
    const xPad = Math.max(0.5, Math.abs(est.deltaX) * 0.6);
    const yPad = Math.max(0.02, Math.abs(est.deltaY) * 0.6);
    const MARGIN = { l: 56, r: 80, t: 28, b: 44 };
    const sx = new Scale(
      [Math.min(...xVals) - xPad, Math.max(...xVals) + xPad],
      [MARGIN.l, LEVER_W - MARGIN.r]
    );
    const sy = new Scale(
      [Math.min(...yVals) - yPad, Math.max(...yVals) + yPad],
      [LEVER_H - MARGIN.b, MARGIN.t]
    );
    renderLever(lever, sx, sy, est, LEVER_W, LEVER_H);
  }

  // ---- animation loop --------------------------------------------------------
  spOLS.snap(clamp(FULL_EST.olsEst,    -1, 2));
  spIV.snap( clamp(FULL_EST.ivEst,     -1, 2));
  spFS.snap( clamp(FULL_EST.firstStage, 0, 5));

  const stop = onFrame((dt) => {
    spOLS.step(dt);
    spIV.step(dt);
    spFS.step(dt);
    rOLS.set(spOLS.value.toFixed(4), "per year of schooling");
    rFS.set( spFS.value.toFixed(4),  "nearc4 → educ (yrs)");
    rIV.set( isFinite(spIV.value) ? spIV.value.toFixed(4) : "∞", "2SLS / Wald");
  });

  recompute();

  return () => { stop(); view.destroy(); };
}
