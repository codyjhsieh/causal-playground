// Sensitivity Analysis to Unobserved Confounding — on the REAL LaLonde data.
// The LaLonde (1986) dataset is uniquely powerful for sensitivity analysis
// because we KNOW the experimental truth (+$1,794) from the NSW RCT.
// So we can ask: how strong would a hidden confounder have to be to overturn
// our observational estimate? Three classic tools: Cinelli-Hazlett (2020)
// omitted-variable-bias contours, the Robustness Value (RV), and the E-value
// (VanderWeele & Ding 2017).

import { h } from "../lib/dom.js";
import { mean, std, olsMulti, clamp } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot } from "../lib/plot.js";
import { lessonLayout, panelSection, slider, toggle, readout, challenge } from "../lib/ui.js";
import { rows as nsw, meta } from "../data/nsw.js";
import { rows as cps } from "../data/cps.js";
import { col, complete, dataBadge } from "../lib/data.js";

// ---- Prepare real data -------------------------------------------------------
const COVARS = ["age", "educ", "black", "hisp", "marr", "nodegree", "re74", "re75"];
const ALL_KEYS = [...COVARS, "re78", "treat"];

const nswClean = complete(nsw, ALL_KEYS);
const cpsClean = complete(cps, ALL_KEYS);

const nswTreated = nswClean.filter((r) => r.treat === 1);
const nswControl = nswClean.filter((r) => r.treat === 0);

// Experimental truth (RCT benchmark)
const BENCH = mean(col(nswTreated, "re78")) - mean(col(nswControl, "re78"));
// ≈ +$1,794

// Observational sample: NSW treated + CPS controls
const OBS = [
  ...nswTreated,
  ...cpsClean.filter((r) => r.treat === 0),
];
const N = OBS.length;

// ---- Fit the full adjusted OLS regression once at module load ---------------
// Y = treat + age + educ + black + hisp + marr + nodegree + re74 + re75
// Design matrix with intercept
const Xfull = OBS.map((r) => [1, r.treat, r.age, r.educ, r.black, r.hisp, r.marr, r.nodegree, r.re74, r.re75]);
const Yfull = OBS.map((r) => r.re78);
const fitFull = olsMulti(Xfull, Yfull);
const BETA_TREAT = fitFull.beta[1];  // Adjusted treatment estimate (still biased)

// ---- Compute partial R² for each covariate w.r.t. treat and outcome ---------
// Cinelli-Hazlett method: partial R²(X_j, D | other X) and partial R²(X_j, Y | other X)
// We use leave-one-out: fit model without covariate j, get residuals of both D and Y
// on remaining covariates, then regress each residual on the omitted covariate.

// Treat column is index 1, outcome is Yfull, covariate cols are 2..9
// partial R² with TREATMENT: regress treat on remaining covariates → r² of omitted covariate
// partial R² with OUTCOME: regress re78 on remaining covariates → r² of omitted covariate

const Dtreat = OBS.map((r) => r.treat); // treatment vector

// For each covariate at index ci in Xfull (ci = 2..9):
// partial R²(covariate, treat | other covariates) = how much variance in treat residual it explains
// We compute partial R²(covariate, D | remaining) and partial R²(covariate, Y | remaining)

// To get partial R²(cov_j, D | all_other_covariates_incl_intercept_excl_treat):
// Build a design matrix = [intercept, other_covariates] excluding treat column (1) and cov_j column
// Then residualize both D and the covariate on that design.

function partialR2pair(covar_col_idx) {
  // covar_col_idx is the column index in Xfull (2..9)
  // Partial R² with treatment:
  // Regress treat on [intercept, all other covariates except covar and treat itself]
  const Xfortreat = Xfull.map((row) =>
    row.filter((_, j) => j !== 1 && j !== covar_col_idx) // remove treat (1) and the covariate
  );
  const fitTreat = olsMulti(Xfortreat, Dtreat);
  const Dresid = Dtreat.map((d, i) => {
    let yhat = 0; for (let j = 0; j < Xfortreat[i].length; j++) yhat += Xfortreat[i][j] * fitTreat.beta[j];
    return d - yhat;
  });
  // Regress Y on [intercept, all other covariates except covar]
  const Xfory = Xfull.map((row) => row.filter((_, j) => j !== covar_col_idx));
  const fitY = olsMulti(Xfory, Yfull);
  const Yresid = Yfull.map((y, i) => {
    let yhat = 0; for (let j = 0; j < Xfory[i].length; j++) yhat += Xfory[i][j] * fitY.beta[j];
    return y - yhat;
  });
  // The covariate column values
  const covValues = Xfull.map((row) => row[covar_col_idx]);
  const covMean = mean(covValues);
  // partial R²(cov, D)
  let sxy_d = 0, sxx_c = 0, syy_d = 0;
  let sxy_y = 0, syy_y = 0;
  for (let i = 0; i < N; i++) {
    const dc = covValues[i] - covMean;
    sxy_d += dc * Dresid[i];
    sxx_c += dc * dc;
    syy_d += Dresid[i] * Dresid[i];
    sxy_y += dc * Yresid[i];
    syy_y += Yresid[i] * Yresid[i];
  }
  const r2_d = (sxx_c < 1e-12 || syy_d < 1e-12) ? 0 : Math.min(1, (sxy_d * sxy_d) / (sxx_c * syy_d));
  const r2_y = (sxx_c < 1e-12 || syy_y < 1e-12) ? 0 : Math.min(1, (sxy_y * sxy_y) / (sxx_c * syy_y));
  return { r2_d: Math.max(0, r2_d), r2_y: Math.max(0, r2_y) };
}

// Compute partial R² pairs for all 8 covariates
const COV_NAMES = ["age", "educ", "black", "hisp", "marr", "nodeg.", "re74", "re75"];
const covDots = COVARS.map((_, i) => {
  const { r2_d, r2_y } = partialR2pair(2 + i);
  return { name: COV_NAMES[i], r2d: r2_d, r2y: r2_y };
});

// ---- Cinelli-Hazlett OVB formula --------------------------------------------
// Bias formula (Theorem 1, Cinelli & Hazlett 2020):
//   bias = sign(r_DZ) * sqrt( r²(Z,D|X) * r²(Z,Y|D,X) ) * sd(Y_resid) / sd(D_resid)
// Adjusted estimate: τ_adj = τ_hat - bias
// where τ_hat is our observed OLS coefficient on treat.

// We need sd of residuals of Y and D after partialling out all covariates.
// Partial out treat and all covariates from Y; partial out covariates from treat.

// Residuals of D (treat) after controlling for covariates (excluding treat itself)
const Xcovonly = Xfull.map((row) => row.filter((_, j) => j !== 1)); // remove treat column
const fitDresid = olsMulti(Xcovonly, Dtreat);
const Dresid_full = Dtreat.map((d, i) => {
  let yhat = 0; for (let j = 0; j < Xcovonly[i].length; j++) yhat += Xcovonly[i][j] * fitDresid.beta[j];
  return d - yhat;
});
const SD_D = std(Dresid_full);

// Residuals of Y after controlling for all covariates AND treat
const fitYresid = olsMulti(Xfull, Yfull);
const Yresid_full = Yfull.map((y, i) => {
  let yhat = 0; for (let j = 0; j < Xfull[i].length; j++) yhat += Xfull[i][j] * fitYresid.beta[j];
  return y - yhat;
});
const SD_Y = std(Yresid_full);

// Adjusted estimate given hypothesized confounder partial R² pair (r2d, r2y).
// Using Cinelli-Hazlett Eq (6): adjusted = τ̂ - sign * sqrt(r²_DZ * r²_YZ) * (SD_Y/SD_D)
// We take the worst-case sign (reduces estimate toward 0):
function adjustedEstimate(r2d, r2y) {
  if (r2d <= 0 || r2y <= 0) return BETA_TREAT;
  const biasMag = Math.sqrt(r2d * r2y) * (SD_Y / SD_D);
  // worst-case: bias reduces |estimate| toward 0
  const sign = BETA_TREAT >= 0 ? 1 : -1;
  return BETA_TREAT - sign * biasMag;
}

// ---- Robustness Value (RV) --------------------------------------------------
// Minimal equal-strength confounding (r²_DZ = r²_YZ) to drive estimate to 0.
// Set |τ̂| = RV * (SD_Y/SD_D)  →  RV = (|τ̂| · SD_D / SD_Y)²
// A confounder must explain at least RV of variance in both treatment and
// outcome (partial R² scale) to nullify the result.
const RV_DISPLAY = clamp((Math.abs(BETA_TREAT) * SD_D / SD_Y) ** 2, 0, 1);

// ---- E-value (VanderWeele & Ding 2017) -------------------------------------
// Binarize outcome: employed = 1 if re78 > 0
// Compute risk ratio of employment for treated vs control in observational sample
const pTreated = mean(OBS.filter((r) => r.treat === 1).map((r) => (r.re78 > 0 ? 1 : 0)));
const pControl = mean(OBS.filter((r) => r.treat === 0).map((r) => (r.re78 > 0 ? 1 : 0)));
const RR_OBS = pControl > 0 ? pTreated / pControl : 1;

// E-value = RR + sqrt(RR * (RR - 1)) for RR > 1; for RR < 1 use 1/RR first
const RR_for_eval = RR_OBS >= 1 ? RR_OBS : 1 / RR_OBS;
const EVALUE = RR_for_eval + Math.sqrt(RR_for_eval * (RR_for_eval - 1));

// ---- Strongest observed covariate ------------------------------------------
let strongestCov = covDots[0];
for (const c of covDots) {
  if (Math.sqrt(c.r2d * c.r2y) > Math.sqrt(strongestCov.r2d * strongestCov.r2y)) {
    strongestCov = c;
  }
}

// ---- Killer curve: the r2d/r2y pairs that drive adjusted estimate to 0 ------
// 0 = τ̂ - sqrt(r2d * r2y) * (SD_Y/SD_D)
// → r2d * r2y = (τ̂ * SD_D / SD_Y)²   (constant product = hyperbola)
const KILLER_PRODUCT = (Math.abs(BETA_TREAT) * SD_D / SD_Y) ** 2;

// ======================================================================
// MODULE MOUNT
// ======================================================================

export function mount(root) {
  // --- CSS injection ---
  if (!document.getElementById("sensitivity-css")) {
    const sty = document.createElement("style");
    sty.id = "sensitivity-css";
    sty.textContent = `
      .sens-stage { display:flex; flex-direction:column; align-items:center; gap:10px; }
      .sens-legend { display:flex; gap:14px; flex-wrap:wrap; font:11px var(--mono,monospace); color:var(--dim); margin-top:4px; align-items:center; }
      .sens-swatch { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:4px; vertical-align:middle; }
      .sens-swatch-sq { display:inline-block; width:14px; height:3px; border-radius:1px; margin-right:4px; vertical-align:middle; }
      .sens-tag { font:10px var(--mono,monospace); color:var(--dim); margin-top:2px; }
      .sens-status-ok  { color:var(--pos); font-weight:600; }
      .sens-status-bad { color:var(--neg); font-weight:600; }
    `;
    document.head.appendChild(sty);
  }

  const title = "Sensitivity Analysis";
  const idea = "Every observational estimate assumes no unmeasured confounding — sensitivity analysis asks how strong a hidden confounder would need to be to overturn the result. " +
    "The Cinelli–Hazlett (2020) omitted-variable-bias contour plot gives the full picture: " +
    "dial in a hypothetical confounder's partial R² with treatment and outcome, and watch the adjusted estimate update live. " +
    "The LaLonde data are uniquely powerful here because the RCT benchmark (+$1,794) is known.";

  const { root: layout, stage, panel, caption } = lessonLayout({ title, idea });
  root.appendChild(layout);

  // ---- Canvas ---
  const CV_W = 520, CV_H = 420;
  const cv = new Canvas(CV_W, CV_H, { margin: { t: 28, r: 28, b: 52, l: 62 } });

  // ---- State ---
  const state = {
    r2d: 0.02,    // hypothesized confounder partial R² with treatment
    r2y: 0.02,    // hypothesized confounder partial R² with outcome
    showEvalue: false,
  };

  // Springs for animated readouts
  const adjSpring = new Spring(BETA_TREAT, { stiffness: 60, damping: 14 });

  // ---- Stage layout ---
  const legend = h("div", { class: "sens-legend" }, [
    h("span", {}, [h("span", { class: "sens-swatch-sq", style: { background: "var(--accent2)", display: "inline-block", width: "18px", height: "2px" } }), "contour lines"]),
    h("span", {}, [h("span", { class: "sens-swatch-sq", style: { background: "var(--neg)", display: "inline-block", width: "18px", height: "2.5px" } }), "\"killer\" curve (est. = 0)"]),
    h("span", {}, [h("span", { class: "sens-swatch", style: { background: "var(--dim)" } }), "observed covariates"]),
    h("span", {}, [h("span", { class: "sens-swatch", style: { background: "var(--gold)" } }), "your hypothetical confounder"]),
  ]);

  stage.className = "sens-stage";
  stage.append(cv.el, legend);

  // ---- Panel ---
  const badge = dataBadge(meta);

  const rBench = readout({ label: "Experimental truth",     value: fmtDollar(BENCH),       accent: "var(--gold)" });
  const rAdj   = readout({ label: "Adjusted obs. estimate", value: fmtDollar(BETA_TREAT),   accent: "var(--accent2)" });
  const rAdjHyp = readout({ label: "Confounder-adjusted",  value: fmtDollar(BETA_TREAT),   accent: "var(--pos)" });
  const rRV    = readout({ label: "Robustness value (RV)", value: fmtPct(RV_DISPLAY),       accent: "var(--accent)" });
  const rEval  = readout({ label: "E-value",               value: EVALUE.toFixed(2),        accent: "var(--accent2)" });
  const rBest  = readout({ label: "Strongest obs. cov.",   value: strongestCov.name,        accent: "var(--dim)" });
  const statusEl = h("div", { class: "note", style: { marginTop: "6px", minHeight: "20px" } });

  const slR2d = slider({
    label: "Confounder → treatment  (partial R²)",
    min: 0, max: 0.5, step: 0.001, value: state.r2d,
    fmt: (v) => (v * 100).toFixed(1) + "%",
    hint: "how much variance in treatment the hidden confounder explains",
    onInput: (v) => { state.r2d = v; updateAdjust(); },
  });

  const slR2y = slider({
    label: "Confounder → outcome  (partial R²)",
    min: 0, max: 0.5, step: 0.001, value: state.r2y,
    fmt: (v) => (v * 100).toFixed(1) + "%",
    hint: "how much variance in re78 the hidden confounder explains",
    onInput: (v) => { state.r2y = v; updateAdjust(); },
  });

  const tglEval = toggle({
    label: "Show E-value / Rosenbaum-Γ overlay",
    value: false,
    onToggle: (v) => { state.showEvalue = v; },
  });

  const chal = challenge({
    goal: "Dial the sliders to drive the confounder-adjusted estimate ≤ $0. Then compare: is your required confounder stronger than the strongest measured covariate (re74/re75)? If yes, an unobserved confounder of that strength would be implausible.",
  });

  panel.append(
    badge,
    panelSection("Estimates", h("div", { class: "readout-grid" }, [rBench, rAdj, rAdjHyp])),
    panelSection("Sensitivity metrics", h("div", { class: "readout-grid" }, [rRV, rEval, rBest])),
    panelSection("Hypothetical confounder", [slR2d, slR2y, statusEl]),
    panelSection("Options", [tglEval]),
    panelSection("Challenge", [chal]),
  );

  caption.innerHTML =
    "<strong>Omitted-variable bias (OVB) contours</strong> — Cinelli &amp; Hazlett (2020). " +
    "An unobserved confounder Z shifts the estimate by ±√(r²<sub>DZ</sub>·r²<sub>YZ</sub>)·(σ<sub>Y|X</sub>/σ<sub>D|X</sub>), " +
    "where r²<sub>DZ</sub> and r²<sub>YZ</sub> are the confounder's partial R² with treatment and outcome " +
    "after removing all observed covariates. " +
    "Contour lines show where that adjusted estimate lands; the red <em>killer curve</em> is where it reaches zero. " +
    "Observed covariates (grey dots) benchmark realistic confounding strength — " +
    "if the killer curve requires a confounder far stronger than any measured variable, the result is robust. " +
    "<strong>Robustness value</strong> (RV): the single r² threshold needed on both axes to nullify the result. " +
    "<strong>E-value</strong> — VanderWeele &amp; Ding (2017): the minimum risk ratio a confounder must have " +
    "with both treatment and outcome to fully explain away the observed association. " +
    "Rosenbaum bounds — Rosenbaum (2002) — give the analogous sensitivity parameter Γ for rank-based tests. " +
    "LaLonde (1986) RCT benchmark: +$1,794. " +
    "<em>A result you cannot break with a plausible confounder is a robust result.</em>";

  // ---- Contour computation ---
  // Axis ranges
  const XMAX = 0.5, YMAX = 0.5;
  const sx = new Scale([0, XMAX], [cv.box.x0, cv.box.x1]);
  const sy = new Scale([0, YMAX], [cv.box.y1, cv.box.y0]); // y increases upward

  // Trace a single contour at a given estimate value using marching approach
  function traceContour(estVal) {
    // adjustedEstimate(r2d, r2y) = BETA_TREAT - sign * sqrt(r2d*r2y) * (SD_Y/SD_D)
    // = estVal  →  sqrt(r2d*r2y) * (SD_Y/SD_D) = |BETA_TREAT - estVal| / sign
    // For estVal < BETA_TREAT (positive treatment): product = ((BETA_TREAT - estVal)*SD_D/SD_Y)²
    const product = ((BETA_TREAT - estVal) * SD_D / SD_Y) ** 2;
    if (product < 0) return [];
    // hyperbola: r2y = product / r2d  for r2d > 0
    const pts = [];
    const steps = 120;
    for (let i = 1; i <= steps; i++) {
      const r2d = (i / steps) * XMAX;
      const r2y = product / r2d;
      if (r2y <= 0 || r2y > YMAX) continue;
      pts.push({ x: sx.map(r2d), y: sy.map(r2y) });
    }
    return pts;
  }

  // ---- Drawing -----------------------------------------------------------------
  function draw() {
    cv.clear();
    const ctx = cv.ctx;
    const b = cv.box;

    drawAxes(cv, sx, sy, {
      xlabel: "Partial R²  (confounder → treatment)",
      ylabel: "Partial R²  (confounder → outcome)",
      grid: true,
    });

    // ---- Contour lines ---
    const contourLevels = [
      { val: -8000, color: "rgba(220,60,60,0.22)",  width: 1.0, dash: [3,3] },
      { val: -4000, color: "rgba(220,60,60,0.30)",  width: 1.0, dash: [3,3] },
      { val: -2000, color: "rgba(220,60,60,0.38)",  width: 1.0, dash: [3,3] },
      { val:  1000, color: "rgba(100,180,100,0.30)", width: 1.0, dash: [3,3] },
      { val:  2000, color: "rgba(100,180,100,0.38)", width: 1.0, dash: [3,3] },
      { val:  BETA_TREAT * 0.5, color: "rgba(120,120,220,0.28)", width: 1.0, dash: [3,3] },
    ];

    for (const c of contourLevels) {
      const pts = traceContour(c.val);
      if (pts.length < 2) continue;
      ctx.save();
      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.width;
      if (c.dash) ctx.setLineDash(c.dash);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
      // label at left edge
      if (pts.length > 0) {
        const lp = pts[0];
        ctx.save();
        ctx.fillStyle = c.color.replace(/[\d.]+\)$/, "0.85)");
        ctx.font = "9px ui-monospace,monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(fmtDollar(c.val), lp.x + 2, lp.y - 7);
        ctx.restore();
      }
    }

    // ---- Killer curve (estimate = 0) ---
    const killerPts = traceContour(0);
    if (killerPts.length >= 2) {
      ctx.save();
      ctx.strokeStyle = "var(--neg)";
      ctx.lineWidth = 2.2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(killerPts[0].x, killerPts[0].y);
      for (let i = 1; i < killerPts.length; i++) ctx.lineTo(killerPts[i].x, killerPts[i].y);
      ctx.stroke();
      ctx.restore();
      // label
      const lkp = killerPts[Math.floor(killerPts.length * 0.55)];
      if (lkp) {
        ctx.save();
        ctx.fillStyle = "var(--neg)";
        ctx.font = "bold 10px ui-monospace,monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("est. = $0", lkp.x, lkp.y - 4);
        ctx.restore();
      }
    }

    // ---- RV point: where the killer curve meets the diagonal (r2d = r2y = RV_DISPLAY) ---
    const rvX = sx.map(RV_DISPLAY);
    const rvY = sy.map(RV_DISPLAY);
    if (RV_DISPLAY < XMAX && RV_DISPLAY < YMAX) {
      ctx.save();
      ctx.strokeStyle = "var(--neg)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(rvX, b.y1); ctx.lineTo(rvX, rvY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x0, rvY); ctx.lineTo(rvX, rvY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // RV label
      ctx.save();
      ctx.fillStyle = "var(--neg)";
      ctx.font = "10px ui-monospace,monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("RV=" + fmtPct(RV_DISPLAY), rvX, b.y1 + 6);
      ctx.restore();
    }

    // ---- Observed covariate dots ---
    for (const c of covDots) {
      const cx = sx.map(c.r2d);
      const cy = sy.map(c.r2y);
      if (cx < b.x0 || cx > b.x1 || cy < b.y0 || cy > b.y1) continue;
      dot(ctx, cx, cy, 5.5, "var(--dim)", { alpha: 0.75 });
      ctx.save();
      ctx.fillStyle = "var(--ink, #1c1c22)";
      ctx.font = "10px ui-monospace,monospace";
      ctx.textAlign = c.r2d < XMAX * 0.75 ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillText(c.name, cx + (c.r2d < XMAX * 0.75 ? 8 : -8), cy);
      ctx.restore();
    }

    // ---- E-value overlay (optional) ---
    if (state.showEvalue) {
      // E-value corresponds to a risk ratio threshold for both axes
      // For a risk-ratio scale, draw an approximate boundary line
      // The E-value is the minimum RR on both confounding axes
      // Approximate mapping: RR → approximate partial R² via Cornfield inequalities
      // For display: show a horizontal and vertical threshold at approximate partial r²
      // corresponding to the E-value (rough heuristic for visualization)
      const evalRR = EVALUE;
      // Cornfield bound: confounder needs to have OR > evalRR with treatment AND outcome
      // Translate RR to approximate partial r² using r² ≈ (RR-1)²/RR² for binary outcomes
      // This is a rough visual guide only
      const approxR2 = Math.min(XMAX * 0.95, (evalRR - 1) ** 2 / (evalRR ** 2 + (evalRR - 1) ** 2));
      const evX = sx.map(approxR2);
      const evY = sy.map(approxR2);
      ctx.save();
      ctx.strokeStyle = "var(--accent2)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      // vertical
      ctx.beginPath(); ctx.moveTo(evX, b.y0); ctx.lineTo(evX, b.y1); ctx.stroke();
      // horizontal
      ctx.beginPath(); ctx.moveTo(b.x0, evY); ctx.lineTo(b.x1, evY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "var(--accent2)";
      ctx.font = "10px ui-monospace,monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("E-value ≈ " + evalRR.toFixed(2) + " (RR scale)", b.x1 - 4, b.y0 + 4);
      ctx.restore();
    }

    // ---- Hypothetical confounder dot (gold, animated position) ---
    const hypX = sx.map(state.r2d);
    const hypY = sy.map(state.r2y);
    if (hypX >= b.x0 && hypX <= b.x1 && hypY >= b.y0 && hypY <= b.y1) {
      // glow ring
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(hypX, hypY, 11, 0, Math.PI * 2);
      ctx.fillStyle = "var(--gold)";
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      dot(ctx, hypX, hypY, 7, "var(--gold)", { stroke: "var(--ink, #1c1c22)" });

      // Label: show adjusted estimate
      const adj = adjustedEstimate(state.r2d, state.r2y);
      const labelTxt = fmtDollar(adj);
      ctx.save();
      ctx.fillStyle = "var(--gold)";
      ctx.font = "bold 11px ui-monospace,monospace";
      ctx.textAlign = hypX > cv.box.x0 + cv.iw * 0.6 ? "right" : "left";
      ctx.textBaseline = hypY < b.y0 + cv.ih * 0.4 ? "top" : "bottom";
      const offX = ctx.textAlign === "right" ? -12 : 12;
      const offY = ctx.textBaseline === "top" ? 12 : -12;
      ctx.fillText(labelTxt, hypX + offX, hypY + offY);
      ctx.restore();
    }

    // ---- Benchmark line at top right ---
    ctx.save();
    ctx.fillStyle = "var(--gold)";
    ctx.font = "10px ui-monospace,monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText("RCT benchmark: " + fmtDollar(BENCH), b.x1 - 4, b.y0 + 4);
    ctx.restore();
  }

  // ---- Helpers -----------------------------------------------------------------
  function fmtDollar(v) {
    return (v >= 0 ? "+" : "") + "$" + Math.round(Math.abs(v)).toLocaleString() + (v < 0 ? " (neg.)" : "");
  }
  function fmtPct(v) {
    return (v * 100).toFixed(1) + "%";
  }

  // ---- Update adjusted estimate readout and challenge -------------------------
  let chalSolved = false;
  function updateAdjust() {
    const adj = adjustedEstimate(state.r2d, state.r2y);
    adjSpring.set(adj);

    // Status text
    if (adj <= 0) {
      statusEl.innerHTML = `<span class="sens-status-bad">Estimate driven to ${fmtDollar(adj)} — zero/negative!</span> <br/>
        <span style="color:var(--dim);font-size:11px">Required r²<sub>DZ</sub>=${fmtPct(state.r2d)}, r²<sub>YZ</sub>=${fmtPct(state.r2y)} — compare to strongest covariate (${strongestCov.name}: ${fmtPct(strongestCov.r2d)}, ${fmtPct(strongestCov.r2y)}).</span>`;
      if (!chalSolved) {
        chalSolved = true;
        chal.setState(true,
          `Confounder (r²_D=${fmtPct(state.r2d)}, r²_Y=${fmtPct(state.r2y)}) nullifies est. ` +
          `vs. strongest observed cov. ${strongestCov.name} (r²_D=${fmtPct(strongestCov.r2d)}, r²_Y=${fmtPct(strongestCov.r2y)})`);
      }
    } else {
      chalSolved = false;
      chal.setState(false);
      const pctKiller = Math.min(100, Math.round(100 * Math.sqrt(state.r2d * state.r2y) / Math.sqrt(KILLER_PRODUCT)));
      statusEl.innerHTML = `<span class="sens-status-ok">Estimate holds: ${fmtDollar(adj)}</span>
        <span style="color:var(--dim);font-size:11px"> (${pctKiller}% of the way to killer curve)</span>`;
    }
  }

  // ---- Main animation loop ---------------------------------------------------
  const stop = onFrame((dt) => {
    adjSpring.step(dt);
    draw();
    // Update spring-animated readout
    rAdjHyp.set(fmtDollar(adjSpring.value),
      adjSpring.value >= 0 ? "still positive" : "driven to zero/negative");
    rAdjHyp.querySelector(".readout-value").style.color =
      adjSpring.value >= 0 ? "var(--pos)" : "var(--neg)";
  });

  // ---- Initialize static readouts ---
  rAdj.set(fmtDollar(BETA_TREAT), "OLS adj. est. (8 covariates)");
  rRV.set(fmtPct(RV_DISPLAY), "r² needed on both axes for zero");
  rEval.set(EVALUE.toFixed(2),
    `min RR to explain away (employ. RR=${RR_OBS.toFixed(2)})`);
  rBest.set(
    strongestCov.name,
    `r²_D=${fmtPct(strongestCov.r2d)}, r²_Y=${fmtPct(strongestCov.r2y)}`
  );
  updateAdjust();

  return () => stop();
}
