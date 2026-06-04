// Counterfactuals & the Structural Causal Model — Pearl's third rung.
// A linear-Gaussian SCM (education/wages/latent ability) calibrated to REAL
// Card (1995) data makes the 3-step abduction → action → prediction algorithm
// concrete and interactive.
//
// DATA: Card, D. (1995). "Using Geographic Variation in College Proximity to
// Estimate the Return to Schooling." NLSYM survey; n ≈ 3010 workers.
// REAL person #42 from the dataset; structural coefficients β, γ estimated
// by OLS; noise variances from actual residuals.
//
// Abduction locks in THIS person's exogenous noise; action performs graph
// surgery (scissors cut the arrow); prediction recomputes with the same U.
// The unit counterfactual ≠ the do()-average because ability is atypical.
// ⚠ NOTE: The latent-ability structure and counterfactuals are MODEL-BASED;
// β, noise variances are calibrated to real data, but counterfactuals
// are never directly observable — they depend on the structural assumptions.

import { rows, meta } from "../data/card.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";
import { h, s, clear } from "../lib/dom.js";
import { clamp, mean, std, olsMulti } from "../lib/stats.js";
import { onFrame, Spring, lerp } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot } from "../lib/plot.js";
import {
  lessonLayout, panelSection, slider, button,
  readout, challenge, note,
} from "../lib/ui.js";

// ── Fit structural coefficients from real Card (1995) data ───────────────────
// Keep complete cases on the core variables we use.
const KEYS = ["lwage", "educ", "exper", "expersq", "black", "south", "smsa"];
const data = complete(rows, KEYS);

const lwageAll = col(data, "lwage");
const educAll  = col(data, "educ");
const experAll = col(data, "exper");
const experSqAll = col(data, "expersq");
const blackAll = col(data, "black");
const southAll = col(data, "south");
const smsaAll  = col(data, "smsa");
const N = data.length; // ≈ 3010

// OLS: lwage ~ [1, educ, exper, expersq, black, south, smsa]
// This gives us the structural coefficient β for education and controls.
const X_full = data.map((_, i) => [
  1,
  educAll[i],
  experAll[i],
  experSqAll[i],
  blackAll[i],
  southAll[i],
  smsaAll[i],
]);
const olsRes = olsMulti(X_full, lwageAll);

// β: structural schooling coefficient (index 1).  Typically ≈ 0.07 from OLS.
const BETA_REAL = olsRes.beta[1];

// Compute OLS fitted values and residuals for the wage equation.
const lwageFitted = data.map((_, i) => {
  let yhat = 0;
  for (let j = 0; j < X_full[i].length; j++) yhat += X_full[i][j] * olsRes.beta[j];
  return yhat;
});
const lwageResid = lwageAll.map((w, i) => w - lwageFitted[i]);

// Residual std dev → noise scale σ_W (U_W ~ N(0, σ_W²)).
const SIGMA_W = std(lwageResid);

// For the SCM we want a small interpretable 3-node model:
//   A    := U_A  (latent ability, exogenous, N(0,1))
//   E    := α·A + U_E   (education; ability raises it)
//   W    := β·E + γ·A + U_W  (wage; direct ability path + schooling)
//
// We choose α and γ to represent the confounding that OLS cannot see.
// To keep the model interpretable and consistent with the IV literature:
//   - α = 0.6 (ability raises schooling by ~0.6 SD per SD ability)
//   - γ = 0.25 (direct effect of ability on log-wage ≈ 0.25 std units)
// These are structural/model assumptions, not OLS estimates.
// β is taken from the real OLS regression above.
const ALPHA_REAL = 0.6;   // ability → education
const GAMMA_REAL = 0.25;  // ability → wage (direct confounding path)

// Intercept absorbed into a mean-wage constant (so W is in log-wage levels).
// We use the OLS intercept for the full baseline, but for the SCM we
// want W to be mean-zero around its predicted level, so we center.
const MEAN_LWAGE = mean(lwageAll);
const MEAN_EDUC  = mean(educAll);

// Std dev of educ residuals after partialling out ability proxy.
// We use std(educ) as a guide for the noise scale of U_E.
const SIGMA_E = std(educAll) * Math.sqrt(1 - ALPHA_REAL ** 2); // approx
const SIGMA_A = 1.0; // A ~ N(0,1) by convention

// Pre-computed mean controls for the population do() display (constant).
const MEAN_EXPER   = mean(experAll);
const MEAN_EXPERSQ = mean(experSqAll);
const MEAN_BLACK   = mean(blackAll);
const MEAN_SOUTH   = mean(southAll);
const MEAN_SMSA    = mean(smsaAll);
// E[W|do(E')] on raw lwage scale = β*E' + mean-controls-fit, mean-centered on educ.
// Precompute the control intercept piece (constant across interventions).
const MEAN_CONTROL_FIT =
  olsRes.beta[0]
  + olsRes.beta[2] * MEAN_EXPER
  + olsRes.beta[3] * MEAN_EXPERSQ
  + olsRes.beta[4] * MEAN_BLACK
  + olsRes.beta[5] * MEAN_SOUTH
  + olsRes.beta[6] * MEAN_SMSA;

// Structural SCM params object (mutable — we allow slider edits of β, γ)
const DEFAULT_PARAMS = {
  alpha: ALPHA_REAL,
  beta: BETA_REAL,
  gamma: GAMMA_REAL,
  sigmaW: SIGMA_W,
  sigmaE: Math.max(0.5, SIGMA_E),
};

// ── Pick a REAL individual from the dataset (row index 42) ───────────────────
// We "embed" them in the SCM by treating their observed (educ, lwage) as
// generated by the structural equations — this lets us perform abduction.
const REAL_IDX = 42;
const realRow = data[REAL_IDX];

// ── Closed-form abduction for linear-Gaussian SCM ────────────────────────────
// Given observed (E_obs, W_obs_centered) and params, solve for exogenous draws.
//
// Structural equations:
//   A = U_A
//   E = α·A + U_E          →  U_E = E - α·A
//   W = β·E + γ·A + U_W   →  U_W = W - β·E - γ·A
//
// For the real person we treat their observed W as:
//   W_centered = lwage - (intercept + β_controls·controls)
// which removes the control-variable effects so W_centered ~ β·E + γ·A + U_W.
// We infer A via a moment-matching approach: given one (E, W_centered) observation,
// the most common approach for a linear-Gaussian SCM is to use the regression of
// A on (E, W) from the joint distribution.
//
// From the joint Gaussian:
//   E[A|E, W_c] = Σ_{AX} Σ_{XX}^{-1} (X - μ_X)
// where X = (E, W_c).  This is the MMSE estimator for A.
// We compute the regression coefficients below.
function buildAbductionWeights(p) {
  // Variances/covariances from the structural model:
  // Var(A) = 1
  // Var(E) = α²·Var(A) + σ_E²  = α² + σ_E²
  // Var(W) = β²·Var(E) + γ²·Var(A) + 2βγ·Cov(E,A) + σ_W²
  //   Cov(E,A) = α
  //   = β²(α²+σ_E²) + γ² + 2βγα + σ_W²
  // Cov(A,E) = α
  // Cov(A,W) = βα + γ
  const { alpha: a, beta: b, gamma: g, sigmaW: sW, sigmaE: sE } = p;
  const varE = a * a + sE * sE;
  const covAE = a;
  const covAW = b * a + g;
  const varW = b * b * varE + g * g + 2 * b * g * a + sW * sW;
  const covEW = b * varE + g * a;

  // Sigma_XX = [[varE, covEW],[covEW, varW]]
  // Sigma_AX = [covAE, covAW]
  // E[A|E,W] = Sigma_AX * Sigma_XX^{-1} * (E, W)'
  const det = varE * varW - covEW * covEW;
  if (Math.abs(det) < 1e-14) {
    // fallback: use single-equation heuristic
    return { wE: covAE / varE, wW: 0 };
  }
  // inv(Sigma_XX) = (1/det) * [[varW, -covEW],[-covEW, varE]]
  const wE = (covAE * varW - covAW * covEW) / det;
  const wW = (covAW * varE - covAE * covEW) / det;
  return { wE, wW };
}

// Abduct: infer U_A, U_E, U_W from observed (E_obs, W_obs_centered) using MMSE A.
function abduct(E_obs, W_obs_c, params) {
  const { alpha, beta, gamma } = params;
  const { wE, wW } = buildAbductionWeights(params);
  // MMSE estimate of A (= U_A)
  const A_hat = wE * E_obs + wW * W_obs_c;
  const U_A = A_hat;
  const U_E = E_obs - alpha * A_hat;
  const U_W = W_obs_c - beta * E_obs - gamma * A_hat;
  return { U_A, U_E, U_W };
}

// Counterfactual wage: do(E := E_prime), same U
function counterfactual(E_prime, U_A, U_W, params) {
  const { beta, gamma } = params;
  // In the surgically modified model, E is fixed to E_prime (A→E arrow cut).
  // W is still determined by β·E + γ·A + U_W, A=U_A unchanged.
  return beta * E_prime + gamma * U_A + U_W;
}

// Population do(E') average: integrate over fresh noise
// E[W_c | do(E')] = β·E' + γ·E[A] + E[U_W] = β·E'
// (because E[A]=E[U_A]=0 and E[U_W]=0 by construction)
function doAverage(E_prime, params) {
  return params.beta * E_prime;
}

// ── Centre a real individual's wage by removing control effects ───────────────
// We want W_centered = lwage - (α₀ + controls·β_controls) so that
// the residual is comparable to β·E + γ·A + U_W in our SCM.
function centerWage(row, params) {
  // Use the OLS baseline controls to remove their influence.
  const intercept = olsRes.beta[0];
  const bExper    = olsRes.beta[2];
  const bExpersq  = olsRes.beta[3];
  const bBlack    = olsRes.beta[4];
  const bSouth    = olsRes.beta[5];
  const bSmsa     = olsRes.beta[6];
  const controlFit =
    intercept +
    bExper   * row.exper +
    bExpersq * row.expersq +
    bBlack   * row.black +
    bSouth   * row.south +
    bSmsa    * row.smsa;
  // W_centered: strip controls; keep educ + ability + noise component
  return row.lwage - controlFit + params.beta * MEAN_EDUC;
  // The +β*MEAN_EDUC re-centres around zero so E[W_c|E=mean]=~0.
}

// Build person object from a real row index and current params.
function buildRealPerson(idx, params) {
  const row = data[idx];
  const E_obs   = row.educ;
  const W_obs_c = centerWage(row, params);
  return { row, E_obs, W_obs_c, idx };
}

// Population size for the do() average scatter
const POP_N = 2000;

// ── Inject one-time CSS ────────────────────────────────────────────────────────
function injectCSS() {
  if (document.getElementById("scm-css")) return;
  const style = document.createElement("style");
  style.id = "scm-css";
  style.textContent = `
    .scm-pipeline { display:flex; gap:0; align-items:stretch; justify-content:center; margin:18px 0 10px; }
    .scm-step {
      display:flex; flex-direction:column; align-items:center; gap:8px;
      padding:14px 18px 12px; border-radius:10px; border:1.5px solid var(--line);
      background:var(--surface); min-width:130px; transition:border-color .3s;
      position:relative; flex:1; max-width:160px;
    }
    .scm-step.active { border-color:var(--accent); background:color-mix(in srgb,var(--accent) 8%,var(--surface)); }
    .scm-step.done   { border-color:var(--pos); }
    .scm-step-num  { font:700 11px var(--mono,monospace); color:var(--dim); letter-spacing:.06em; }
    .scm-step-name { font:700 14px var(--sans,system-ui); color:var(--ink); text-align:center; }
    .scm-step-desc { font:11px var(--sans,system-ui); color:var(--dim); text-align:center; line-height:1.4; }
    .scm-arrow { display:flex; align-items:center; color:var(--line); font-size:20px;
                 padding:0 4px; flex-shrink:0; align-self:center; }
    .scm-u-row { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; }
    .scm-u-token {
      font:700 12px var(--mono,monospace); padding:3px 7px; border-radius:6px;
      border:1.5px solid var(--line); background:var(--surface2); color:var(--dim);
      transition:all .4s; white-space:nowrap;
    }
    .scm-u-token.locked { border-color:var(--gold); color:var(--gold);
                          background:color-mix(in srgb,var(--gold) 14%,var(--surface)); }
    .scm-scissors { position:absolute; top:-14px; left:50%; transform:translateX(-50%);
                    font-size:18px; opacity:0; transition:opacity .4s; pointer-events:none; }
    .scm-scissors.visible { opacity:1; }
    .scm-eq { font:13px var(--mono,monospace); color:var(--dim); text-align:center;
              line-height:1.6; white-space:pre; }
    .scm-eq .hi { color:var(--accent2); }
    .scm-eq .cut { text-decoration:line-through; color:var(--neg); opacity:.5; }
    .scm-readout-row { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin:10px 0 4px; }
    .scm-person-dot { cursor:pointer; transition:r .2s; }
    .scm-person-dot:hover { opacity:.8; }
    .scm-stage-title { font:700 11px var(--mono,monospace); color:var(--dim); letter-spacing:.05em;
                       margin:0 0 4px; text-transform:uppercase; }
    .scm-model-note {
      font:italic 11px var(--sans,system-ui); color:var(--dim); text-align:center;
      margin:4px 0 0; max-width:540px;
    }
  `;
  document.head.appendChild(style);
}

// ═════════════════════════════════════════════════════════════════════════════
export function mount(root) {
  injectCSS();

  const params = { ...DEFAULT_PARAMS };
  let person = buildRealPerson(REAL_IDX, params);

  // Intervention value (E') — default = person's actual educ + 2
  let E_prime = clamp(person.E_obs + 2, 4, 20);

  // Pipeline step: 0=idle, 1=abduction, 2=action, 3=prediction
  let step = 0;
  let abductedU = null; // set after step 1
  let cfWage = null;    // set after step 3
  let chalDone = false;
  let currentIdx = REAL_IDX;

  const stepNames = ["Abduction", "Action", "Prediction"];
  const stepDescs = [
    "Infer U from\nthe observed\n(E, W)",
    "do(E:=E') —\nsurgically set E,\ncut A→E arrow",
    "Recompute W\nwith same U\nand new E",
  ];

  // Springs for animated readouts
  const wFactSpring  = new Spring(person.W_obs_c, { stiffness: 60, damping: 13 });
  const wCfSpring    = new Spring(person.W_obs_c, { stiffness: 60, damping: 13 });
  const wDoSpring    = new Spring(doAverage(E_prime, params), { stiffness: 60, damping: 13 });
  const EPrimeSpring = new Spring(E_prime, { stiffness: 60, damping: 13 });

  // ── Layout ─────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Counterfactuals & the SCM — Card (1995)",
    idea: "Pearl's top rung: use the same exogenous noise U that generated this real worker's data (calibrated to Card 1995), surgically sever the intervened equation, and recompute. That's what separates a unit counterfactual from a population do()-average.",
  });
  root.appendChild(layout);

  stage.style.flexDirection = "column";
  stage.style.alignItems = "center";
  stage.style.gap = "0";

  // ── DAG ────────────────────────────────────────────────────────────────────
  const dagWrap = h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } });
  const dagTitle = h("p", { class: "scm-stage-title", text: "structural causal model — card 1995" });

  const DAG_W = 560, DAG_H = 200;
  const dagSvg = s("svg", { viewBox: `0 0 ${DAG_W} ${DAG_H}`, width: DAG_W, height: DAG_H, class: "dag" });

  // Build defs for markers
  const defs = s("defs");
  const mkArrow = (id, color) => s("marker", {
    id, viewBox: "0 0 10 10", refX: 9, refY: 5,
    markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse",
  }, [s("path", { d: "M0,0 L10,5 L0,10 z", fill: color })]);
  defs.append(
    mkArrow("scm-arrow-ink", "var(--ink)"),
    mkArrow("scm-arrow-treat", "var(--treat)"),
    mkArrow("scm-arrow-pos", "var(--pos)"),
    mkArrow("scm-arrow-neg", "var(--neg)"),
  );
  dagSvg.appendChild(defs);

  const gDagEdges = s("g"); const gDagNodes = s("g"); const gDagLabels = s("g");
  dagSvg.append(gDagEdges, gDagLabels, gDagNodes);

  // scissors symbol group (floats over A→E edge midpoint)
  const scissorsG = s("g", { class: "scm-scissors", opacity: "0" });
  const scissorsText = s("text", { "text-anchor": "middle", "dominant-baseline": "middle",
    "font-size": "20", fill: "var(--neg)" }, ["✂"]);
  scissorsG.appendChild(scissorsText);
  dagSvg.appendChild(scissorsG);

  // node positions
  const NODE_POS = { A: { x: 100, y: 100 }, E: { x: 280, y: 155 }, W: { x: 460, y: 100 } };
  const NODE_SUBS = { A: "ability", E: "education", W: "log-wage" };
  const NODE_ROLES = { A: "", E: "treatment", W: "outcome" };

  // scissors animates over the midpoint of A→E
  const AE_MID = {
    x: (NODE_POS.A.x + NODE_POS.E.x) / 2,
    y: (NODE_POS.A.y + NODE_POS.E.y) / 2 - 8,
  };

  // edge cut spring (0=intact, 1=cut)
  const cutSpring = new Spring(0, { stiffness: 50, damping: 12 });

  function edgePath(a, b, r = 22) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const x0 = a.x + ux * r, y0 = a.y + uy * r;
    const x1 = b.x - ux * (r + 6), y1 = b.y - uy * (r + 6);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    return `M ${x0} ${y0} Q ${mx} ${my} ${x1} ${y1}`;
  }

  function renderDAG() {
    clear(gDagEdges); clear(gDagNodes); clear(gDagLabels);
    const cut = cutSpring.value; // 0..1

    const edges = [
      { from: "A", to: "E", label: `α=${params.alpha.toFixed(2)}`, isAE: true },
      { from: "E", to: "W", label: `β=${params.beta.toFixed(3)}`, isAE: false },
      { from: "A", to: "W", label: `γ=${params.gamma.toFixed(2)}`, isAE: false },
    ];

    for (const e of edges) {
      const pa = NODE_POS[e.from], pb = NODE_POS[e.to];
      const d = edgePath(pa, pb);
      const alpha = e.isAE ? lerp(1, 0.12, cut) : 1;
      const stroke = e.isAE
        ? `color-mix(in srgb, var(--neg) ${Math.round(cut * 90)}%, var(--ink))`
        : "var(--ink)";
      const dashArr = e.isAE && cut > 0.05
        ? `${lerp(0, 6, cut)} ${lerp(0, 4, cut)}`
        : null;

      const pathEl = s("path", {
        d, fill: "none", stroke, "stroke-width": "2.4",
        "stroke-opacity": String(alpha),
        "stroke-dasharray": dashArr,
        "marker-end": `url(#scm-arrow-ink)`,
        class: "edge",
      });
      gDagEdges.appendChild(pathEl);

      // edge label at midpoint
      const mx = (pa.x + pb.x) / 2, my2 = (pa.y + pb.y) / 2 - 10;
      const lbl = s("text", {
        x: mx, y: my2, "text-anchor": "middle", "dominant-baseline": "middle",
        "font-size": "11", "font-family": "var(--mono,monospace)",
        fill: e.isAE ? `color-mix(in srgb, var(--neg) ${Math.round(cut * 80)}%, var(--dim))` : "var(--dim)",
        "fill-opacity": String(e.isAE ? lerp(1, 0.3, cut) : 0.75),
        text: e.label,
      });
      gDagLabels.appendChild(lbl);
    }

    // scissors over A→E edge
    scissorsG.setAttribute("transform", `translate(${AE_MID.x},${AE_MID.y})`);
    scissorsG.setAttribute("opacity", String(cut));

    for (const [id, pos] of Object.entries(NODE_POS)) {
      const role = NODE_ROLES[id];
      const fill = role === "treatment" ? "color-mix(in srgb,var(--treat) 20%,var(--surface))"
                 : role === "outcome"   ? "color-mix(in srgb,var(--pos) 18%,var(--surface))"
                 : "var(--surface)";
      const stroke2 = role === "treatment" ? "var(--treat)"
                    : role === "outcome"   ? "var(--pos)"
                    : "var(--line)";
      const g = s("g", { transform: `translate(${pos.x},${pos.y})`, class: "node" });
      g.append(
        s("circle", { r: "26", fill, stroke: stroke2, "stroke-width": "2", class: "node-disc" }),
        s("text", { class: "node-label", "text-anchor": "middle", y: "5",
          "font-size": "15", "font-weight": "700", fill: "var(--ink)", text: id }),
        s("text", { class: "node-sub", "text-anchor": "middle", y: "42",
          "font-size": "11", fill: "var(--dim)", text: NODE_SUBS[id] }),
      );
      gDagNodes.appendChild(g);
    }

    // exogenous U labels near each node
    const uPos = { A: { x: 50, y: 40 }, E: { x: 220, y: 200 }, W: { x: 520, y: 40 } };
    const uLbls = { A: "U_A", E: "U_E", W: "U_W" };
    for (const [id, p] of Object.entries(uPos)) {
      const isLocked = step >= 1 && abductedU;
      const col2 = isLocked ? "var(--gold)" : "var(--dim)";
      const uVal = abductedU
        ? (id === "A" ? abductedU.U_A : id === "E" ? abductedU.U_E : abductedU.U_W)
        : null;
      const txt = uVal != null ? `${uLbls[id]}=${uVal.toFixed(2)}` : uLbls[id];
      gDagLabels.append(
        s("text", { x: p.x, y: p.y, "text-anchor": "middle", "dominant-baseline": "middle",
          "font-size": "11", "font-family": "var(--mono,monospace)",
          fill: col2, "font-weight": isLocked ? "700" : "400", text: txt }),
      );
      // dashed line from U label to node
      const np = NODE_POS[id];
      gDagEdges.prepend(
        s("line", { x1: p.x, y1: p.y, x2: np.x, y2: np.y,
          stroke: col2, "stroke-width": "1.2", "stroke-dasharray": "4 3",
          "stroke-opacity": "0.5" }),
      );
    }
  }

  dagWrap.append(dagTitle, dagSvg);

  // ── 3-step pipeline UI ────────────────────────────────────────────────────
  const pipelineEl = h("div", { class: "scm-pipeline" });
  const stepEls = [];
  const uTokenEls = [];
  const equationEls = [];

  for (let i = 0; i < 3; i++) {
    const numEl  = h("div", { class: "scm-step-num",  text: `STEP ${i + 1}` });
    const nameEl = h("div", { class: "scm-step-name", text: stepNames[i] });
    const descEl = h("div", { class: "scm-step-desc", text: stepDescs[i] });
    const eqEl   = h("div", { class: "scm-eq", text: "" });
    equationEls.push(eqEl);

    const uRow = h("div", { class: "scm-u-row" });
    uTokenEls.push(uRow);

    const stepEl = h("div", { class: "scm-step" }, [numEl, nameEl, descEl, uRow, eqEl]);
    stepEls.push(stepEl);

    if (i < 2) pipelineEl.append(stepEl, h("div", { class: "scm-arrow" }, ["→"]));
    else pipelineEl.append(stepEl);
  }

  function updatePipelineUI() {
    const u = abductedU;
    for (let i = 0; i < 3; i++) {
      const active = (step === i + 1);
      const done   = (step > i + 1);
      stepEls[i].classList.toggle("active", active);
      stepEls[i].classList.toggle("done", done);
    }

    // Step 1: abduction — show U tokens that get locked
    clear(uTokenEls[0]);
    ["U_A", "U_E", "U_W"].forEach((lbl) => {
      const locked = step >= 1 && u;
      const val = u ? (lbl === "U_A" ? u.U_A : lbl === "U_E" ? u.U_E : u.U_W) : null;
      const tok = h("div", { class: "scm-u-token" + (locked ? " locked" : "") },
        [val != null ? `${lbl}=${val.toFixed(2)}` : lbl]);
      uTokenEls[0].appendChild(tok);
    });

    // Step 1 equation
    equationEls[0].innerHTML = step >= 1 && u
      ? `A=${u.U_A.toFixed(2)}\nE_obs=${person.E_obs.toFixed(0)}\nW_obs=${person.W_obs_c.toFixed(2)}`
      : "observe (E, W)";

    // Step 2: action — equation surgery display
    clear(uTokenEls[1]);
    if (step >= 2) {
      const locked = step >= 2 && u;
      ["U_A", "U_W"].forEach((lbl) => {
        const val = u ? (lbl === "U_A" ? u.U_A : u.U_W) : null;
        const tok = h("div", { class: "scm-u-token" + (locked ? " locked" : "") },
          [val != null ? `${lbl}=${val.toFixed(2)}` : lbl]);
        uTokenEls[1].appendChild(tok);
      });
    }
    if (step >= 2) {
      equationEls[1].innerHTML =
        `<span class="cut">E:=α·A+U_E</span>\n` +
        `E:=<span class="hi">${E_prime.toFixed(1)}</span>  ✂`;
    } else {
      equationEls[1].innerHTML = "";
    }

    // Step 3: prediction — carry U tokens + show result
    clear(uTokenEls[2]);
    if (step >= 3 && u) {
      ["U_A", "U_W"].forEach((lbl) => {
        const val = lbl === "U_A" ? u.U_A : u.U_W;
        const tok = h("div", { class: "scm-u-token locked" },
          [`${lbl}=${val.toFixed(2)}`]);
        uTokenEls[2].appendChild(tok);
      });
    }
    if (step >= 3 && cfWage != null) {
      equationEls[2].innerHTML =
        `W_{E'}=β·<span class="hi">${E_prime.toFixed(1)}</span>+γ·A+U_W\n` +
        `     =<span class="hi" style="color:var(--gold)">${cfWage.toFixed(3)}</span>`;
    } else {
      equationEls[2].innerHTML = step >= 3 ? "computing…" : "";
    }
  }

  // ── Scatter canvas: education vs log-wage cloud + this person ─────────────
  const cvPop = new Canvas(540, 220, { margin: { t: 20, r: 20, b: 40, l: 50 } });
  const popTitle = h("p", { class: "scm-stage-title", text: "log-wage ~ education — Card 1995 real data" });

  // Use the real dataset for the scatter (thin for performance)
  function drawPopScatter() {
    cvPop.clear();
    // Use the real data (lwageAll, educAll) — thin by 4 for performance
    const allE = educAll;
    const allW = lwageAll;
    const eMin = Math.min(...allE) - 0.5, eMax = Math.max(...allE) + 0.5;
    const wMin = Math.min(...allW) - 0.5, wMax = Math.max(...allW) + 0.5;
    const sx = new Scale([eMin, eMax], [cvPop.box.x0, cvPop.box.x1]);
    const sy = new Scale([wMin, wMax], [cvPop.box.y1, cvPop.box.y0]);
    drawAxes(cvPop, sx, sy, { xlabel: "education (yrs)", ylabel: "log wage" });

    // real population dots (thinned)
    const ctx = cvPop.ctx;
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "var(--accent2)";
    for (let i = 0; i < allE.length; i += 4) {
      ctx.beginPath();
      ctx.arc(sx.map(allE[i]), sy.map(allW[i]), 2.5, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // this real person (using actual lwage for the scatter, not centered)
    const px = sx.map(person.E_obs), py = sy.map(person.row.lwage);
    dot(ctx, px, py, 8, "var(--treat)", { stroke: "var(--ink)", alpha: 1 });
    ctx.fillStyle = "var(--ink)"; ctx.font = "11px var(--mono,monospace)";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(`worker #${currentIdx} (real)`, px + 11, py);

    // counterfactual point — convert CF wage back to log-wage level
    if (step >= 3 && cfWage != null) {
      // cfWage is in centered-wage space; shift by same amount to get back to lwage scale
      const cfLwage = person.row.lwage + (cfWage - person.W_obs_c);
      const cx = sx.map(E_prime), cy = sy.map(cfLwage);
      dot(ctx, cx, cy, 8, "var(--gold)", { stroke: "var(--ink)", alpha: 1 });
      // dashed line from factual to counterfactual
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "var(--gold)"; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx, cy); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = "var(--gold)";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(`W_{E'} (CF)`, cx + 11, cy);

      // population do() average mapped to raw log-wage scale.
      // Centering: W_c = lwage - controlFit + β*MEAN_EDUC, so
      // lwage = W_c + controlFit - β*MEAN_EDUC.
      // For pop avg use MEAN_CONTROL_FIT: doWLwage = β*E' + MEAN_CONTROL_FIT - β*MEAN_EDUC
      const doWLwage = params.beta * E_prime + MEAN_CONTROL_FIT - params.beta * MEAN_EDUC;
      const dx2 = sx.map(E_prime), dy2 = sy.map(doWLwage);
      dot(ctx, dx2, dy2, 7, "var(--accent)", { stroke: "var(--ink)", alpha: 0.85 });
      ctx.fillStyle = "var(--accent)";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(`E[W|do(E')] avg`, dx2 + 11, dy2 - 14);
    }

    // vertical line at E_prime
    if (step >= 2) {
      const ex = sx.map(EPrimeSpring.value);
      ctx.strokeStyle = "var(--accent2)"; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]); ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(ex, cvPop.box.y0); ctx.lineTo(ex, cvPop.box.y1); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = "var(--accent2)"; ctx.font = "11px var(--mono,monospace)";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(`E'=${E_prime.toFixed(1)} yrs`, ex, cvPop.box.y0 + 2);
    }
  }

  // Model note
  const modelNote = h("p", { class: "scm-model-note" },
    [`Model calibrated to Card (1995) NLSYM data. β=${BETA_REAL.toFixed(3)} from OLS; σ_W=${SIGMA_W.toFixed(3)} from residuals. Counterfactuals are model-based — real data sets parameters, but unit counterfactuals are never directly observed.`]);

  // ── Readouts ───────────────────────────────────────────────────────────────
  const rWFact   = readout({ label: "Factual log-wage",        value: "—", accent: "var(--treat)" });
  const rWCf     = readout({ label: "Counterfactual W_{E'}",   value: "—", accent: "var(--gold)" });
  const rWDo     = readout({ label: "Pop. E[W|do(E')]",        value: "—", accent: "var(--accent)" });
  const rAbility = readout({ label: "Inferred ability  Â",     value: "—", accent: "var(--accent2)" });

  const readoutRow = h("div", { class: "scm-readout-row" }, [rWFact, rWCf, rWDo, rAbility]);

  // ── Challenge ──────────────────────────────────────────────────────────────
  const chal = challenge({
    goal: "Run all 3 steps to compute this real worker's counterfactual log-wage — then confirm it differs from the population do() average because abduction locked in THEIR ability.",
  });

  // ── Run button + step control ──────────────────────────────────────────────
  let tweenCancel = null;

  function advanceStep() {
    if (tweenCancel) { tweenCancel(); tweenCancel = null; }
    const nextStep = (step % 3) + 1;
    step = nextStep;

    if (step === 1) {
      // Abduction: solve for U's from real observed (E, W_centered)
      abductedU = abduct(person.E_obs, person.W_obs_c, params);
      cfWage = null;
      chalDone = false;
      cutSpring.set(0);
      wCfSpring.snap(person.W_obs_c);
      chal.setState(false);
    } else if (step === 2) {
      // Action: cut A→E arrow
      cutSpring.set(1);
    } else if (step === 3) {
      // Prediction: compute counterfactual with locked noise
      cfWage = counterfactual(E_prime, abductedU.U_A, abductedU.U_W, params);
      wCfSpring.set(cfWage);

      const doW = doAverage(E_prime, params);
      const diff = Math.abs(cfWage - doW);
      chalDone = diff > 0.05;
      if (chalDone) {
        chal.setState(true,
          `CF W_c=${cfWage.toFixed(3)}  vs  do()-avg ${doW.toFixed(3)}  (Δ=${diff.toFixed(3)}) — ability locked in!`);
      }
    }

    updateReadouts();
    updatePipelineUI();
  }

  function reset() {
    if (tweenCancel) { tweenCancel(); tweenCancel = null; }
    step = 0;
    abductedU = null;
    cfWage = null;
    chalDone = false;
    cutSpring.set(0);
    wCfSpring.snap(person.W_obs_c);
    updatePipelineUI();
    updateReadouts();
    chal.setState(false);
  }

  // Cycle through real data rows
  let rowCursor = REAL_IDX;
  function nextRealPerson() {
    rowCursor = (rowCursor + 1) % data.length;
    currentIdx = rowCursor;
    person = buildRealPerson(rowCursor, params);
    E_prime = clamp(person.E_obs + 2, 4, 20);
    ePrimeSlider.setValue(E_prime);
    EPrimeSpring.snap(E_prime);
    wFactSpring.snap(person.W_obs_c);
    wDoSpring.snap(doAverage(E_prime, params));
    reset();
  }

  function updateReadouts() {
    wFactSpring.set(person.W_obs_c);
    const doW = doAverage(E_prime, params);
    wDoSpring.set(doW);
    EPrimeSpring.set(E_prime);
    rAbility.set(step >= 1 && abductedU ? abductedU.U_A.toFixed(2) : "—",
                 step >= 1 ? "inferred from (E,W)" : "unknown until abduction");
    rWFact.set(person.W_obs_c.toFixed(3),
               `E=${person.E_obs} yrs, row #${currentIdx}`);
    rWCf.set(step >= 3 && cfWage != null ? cfWage.toFixed(3) : "—",
             step >= 3 ? `at E'=${E_prime.toFixed(1)} yrs` : "run all 3 steps");
    rWDo.set(doW.toFixed(3), `β·E'=${params.beta.toFixed(3)}·${E_prime.toFixed(1)}`);
  }
  updateReadouts();
  updatePipelineUI();

  // ── Run button ─────────────────────────────────────────────────────────────
  const runBtn      = button("▶ Next step",       advanceStep,      { primary: true });
  const resetBtn    = button("↺ Reset",            reset);
  const newPersonBtn = button("⟳ Next worker",    nextRealPerson);

  // ── E' slider ──────────────────────────────────────────────────────────────
  const ePrimeSlider = slider({
    label: "Intervention  E'  (years of schooling)",
    min: 4, max: 20, step: 1, value: E_prime,
    fmt: (v) => `${v.toFixed(0)} yrs`,
    onInput: (v) => {
      E_prime = v;
      EPrimeSpring.set(v);
      wDoSpring.set(doAverage(v, params));
      if (step >= 3 && abductedU) {
        cfWage = counterfactual(E_prime, abductedU.U_A, abductedU.U_W, params);
        wCfSpring.set(cfWage);
        const diff = Math.abs(cfWage - doAverage(E_prime, params));
        if (diff > 0.05) {
          chal.setState(true,
            `CF W_c=${cfWage.toFixed(3)}  vs  do()-avg ${doAverage(E_prime, params).toFixed(3)}  (Δ=${diff.toFixed(3)})`);
        }
      }
      updateReadouts();
      updatePipelineUI();
    },
  });

  // β slider (allows exploring sensitivity around real estimate)
  const betaSlider = slider({
    label: `β  (educ→lwage, OLS = ${BETA_REAL.toFixed(3)})`,
    min: 0.01, max: 0.20, step: 0.005, value: params.beta,
    fmt: (v) => v.toFixed(3),
    onInput: (v) => {
      params.beta = v;
      person = buildRealPerson(currentIdx, params);
      reset();
    },
  });

  const gammaSlider = slider({
    label: "γ  (ability→lwage direct)",
    min: 0, max: 0.6, step: 0.01, value: params.gamma,
    fmt: (v) => v.toFixed(2),
    onInput: (v) => { params.gamma = v; reset(); },
  });

  const alphaSlider = slider({
    label: "α  (ability→education)",
    min: 0, max: 1.5, step: 0.05, value: params.alpha,
    fmt: (v) => v.toFixed(2),
    onInput: (v) => { params.alpha = v; reset(); },
  });

  // ── Assemble stage ─────────────────────────────────────────────────────────
  const dagAndPipeline = h("div", {
    style: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: "8px" },
  });
  dagAndPipeline.append(dagWrap, pipelineEl, readoutRow);

  const scatterWrap = h("div", {
    style: { display: "flex", flexDirection: "column", alignItems: "center" },
  });
  scatterWrap.append(popTitle, cvPop.el, modelNote);

  stage.append(dagAndPipeline, scatterWrap);

  // ── Assemble panel ─────────────────────────────────────────────────────────
  panel.append(
    dataBadge(meta),
    panelSection("3-step algorithm", [
      h("div", { class: "btn-row", style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
        [runBtn, resetBtn, newPersonBtn]),
      note("Each click advances one step: Abduction → Action → Prediction. Reset to re-run on the same worker, or 'Next worker' to cycle through real rows."),
    ]),
    panelSection("Counterfactual query", ePrimeSlider),
    panelSection("SCM coefficients", [
      note(`OLS β=${BETA_REAL.toFixed(3)}, σ_W=${SIGMA_W.toFixed(3)} — estimated from Card (1995) n=${N}. α and γ are structural model assumptions representing confounding by latent ability.`),
      betaSlider, gammaSlider, alphaSlider,
    ]),
    panelSection("Challenge", chal),
    panelSection("Key identity", [
      note("CF:   W_{E'} = β·E' + γ·Â + U_W  (Â and U_W locked by abduction)"),
      note("do(): E[W|do(E')] = β·E'  (fresh noise, A averages to 0)"),
      note("They differ by  γ·Â + U_W, which is non-zero whenever this worker's ability or idiosyncratic luck deviates from the mean."),
    ]),
  );

  caption.innerHTML =
    "<strong>Card (1995) NLSYM data</strong>: β=" + BETA_REAL.toFixed(3) + " (OLS schooling return), σ_W=" + SIGMA_W.toFixed(3) + ". " +
    "A Structural Causal Model defines endogenous variables by <strong>structural equations</strong> plus <strong>exogenous noise</strong>. " +
    "Here: <span class='k'>A=U<sub>A</sub></span> (latent ability), " +
    "<span class='k'>E=αA+U<sub>E</sub></span> (education), " +
    "<span class='k'>W<sub>c</sub>=βE+γA+U<sub>W</sub></span> (centered log-wage). " +
    "Counterfactual reasoning uses Pearl's 3-step algorithm: <strong>Abduction</strong> — infer this worker's specific exogenous noise from their observed (E,W) via MMSE; " +
    "<strong>Action</strong> — <em>surgically</em> replace the E-equation with E:=E' (scissors cut the A→E arrow — graph surgery, not conditioning); " +
    "<strong>Prediction</strong> — recompute W with the <em>same</em> inferred U in the modified graph. " +
    "The result W<sub>E'</sub> is this real worker's counterfactual log-wage, differing from E[W|do(E')]=βE' (population interventional average) " +
    "because abduction locked in <em>their</em> latent ability — a worker with above-average ability has a higher CF wage than the population mean. " +
    "<em>Note: β and σ_W are calibrated to real Card (1995) data; the structural latent-ability form is a modeling assumption — unit counterfactuals are never directly observed (Pearl 2009).</em>";

  // ── Animation loop ─────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    cutSpring.step(dt);
    wFactSpring.step(dt);
    wCfSpring.step(dt);
    wDoSpring.step(dt);
    EPrimeSpring.step(dt);

    rWFact.set(wFactSpring.value.toFixed(3),
      `E=${person.E_obs} yrs, lwage=${person.row.lwage.toFixed(3)}`);
    rWCf.set(step >= 3 && cfWage != null ? wCfSpring.value.toFixed(3) : "—",
             step >= 3 ? `at do(E:=${E_prime.toFixed(1)} yrs)` : "run all 3 steps");
    rWDo.set(wDoSpring.value.toFixed(3), `β·E'=${params.beta.toFixed(3)}·${E_prime.toFixed(1)}`);

    renderDAG();
    drawPopScatter();
  });

  return () => {
    stop();
    if (tweenCancel) tweenCancel();
  };
}
