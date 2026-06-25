// Neural Causal Models — Theory Meets Architecture.
//
// PAPER: Xia, Lee, Bengio, Bareinboim (2021, NeurIPS; 2023 JMLR extension)
// "The Causal-Neural Connection: Expressiveness, Learnability, and Inference."
//
// THEORY: An NCM is a structural causal model whose mechanisms are *neural
// networks* — one per node, parents → node. The paper proves NCMs are
// expressive enough to realize any SCM (Layer-1/2/3 of Pearl's hierarchy), and
// that — given the right DAG — gradient training on observational data plus
// do-calculus-respecting inference can answer observational, interventional,
// AND counterfactual queries from the SAME trained network.
//
// ARCHITECTURE: Per-node MLPs. Sampling traverses the DAG in topological order.
// L1 (observation): forward pass with the data-generating SCM.
// L2 (intervention): override the equation at a node — replace its MLP output
//                    with the do-value, propagate downstream.
// L3 (counterfactual): abduct → intervene → predict, on a fixed factual row.
//
// REAL TEST: NSW (LaLonde 1986; Dehejia–Wahba 1999) experimental sample.
// In RCT mode L1 = L2 ≈ +$1,794 (because randomization severs C → T).
// In Confounded mode we re-assign T from a propensity P(T|C) and generate a
// synthetic Y with KNOWN ATE = $1,800; L1 is biased, L2 from the NCM recovers
// the truth — but only if the confounder is observed (toggle "hide re75").

import { h } from "../lib/dom.js";
import { RNG } from "../lib/rng.js";
import { mean } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { lessonLayout, panelSection, slider, toggle, button, segmented, readout, challenge, note } from "../lib/ui.js";
import { MLP } from "../lib/nn.js";
import { rows as nswRows, meta as nswMeta } from "../data/nsw.js";
import { col, zscore, dataBadge } from "../lib/data.js";

// ── CSS ──────────────────────────────────────────────────────────────────────
if (!document.getElementById("ncm-css")) {
  const style = document.createElement("style");
  style.id = "ncm-css";
  style.textContent = `
    .ncm-stage     { display:flex; flex-direction:column; gap:12px; }
    .ncm-canvas-wrap { background:var(--surface2); border:1px solid var(--line);
                       border-radius:10px; padding:8px; }
    .ncm-rungs     { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; }
    .ncm-rung      { background:var(--surface2); border:1px solid var(--line);
                     border-radius:10px; padding:10px 12px; display:flex;
                     flex-direction:column; gap:4px; position:relative; overflow:hidden; }
    .ncm-rung.active { border-color:var(--accent2); box-shadow:0 0 0 2px var(--accent2-faint, rgba(120,180,255,0.15)); }
    .ncm-rung-tag  { font:700 9px var(--mono,monospace); color:var(--dim);
                     letter-spacing:.1em; text-transform:uppercase; }
    .ncm-rung-name { font:600 12px var(--sans,system-ui); color:var(--ink); }
    .ncm-rung-val  { font:700 22px var(--mono,monospace); color:var(--ink);
                     line-height:1.1; transition:color .25s; }
    .ncm-rung-val.good { color:var(--pos); }
    .ncm-rung-val.bad  { color:var(--neg); }
    .ncm-rung-sub  { font:11px var(--mono,monospace); color:var(--dim); }
    .ncm-formula   { font:11px var(--mono,monospace); color:var(--dim);
                     padding:6px 0 0 0; line-height:1.5; }
    .ncm-cf-row    { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap;
                     padding:8px 10px; background:var(--surface2);
                     border:1px solid var(--line); border-radius:8px; }
    .ncm-cf-row .lab { font:11px var(--mono,monospace); color:var(--dim);
                       text-transform:uppercase; letter-spacing:.05em; }
    .ncm-cf-row .val { font:600 14px var(--sans,system-ui); color:var(--ink); }
    .ncm-cf-row .delta { font:700 14px var(--mono,monospace); color:var(--accent2); }
    .ncm-data-badge{ font:11px var(--mono,monospace); color:var(--dim); }
  `;
  document.head.appendChild(style);
}

// ── Data preparation ────────────────────────────────────────────────────────
const COV_FULL = ["age", "educ", "black", "hisp", "marr", "nodegree", "re74", "re75"];
const Y_SCALE = 10000; // re78 / 10000 → keep MLP targets in O(1)

// Standardize one column across the full NSW sample
const COV_STATS = {};
for (const k of COV_FULL) {
  const xs = col(nswRows, k);
  const m = mean(xs);
  const v = mean(xs.map((x) => (x - m) ** 2));
  COV_STATS[k] = { mean: m, sd: Math.sqrt(v) || 1 };
}
function zRow(row, cov) {
  return cov.map((k) => (row[k] - COV_STATS[k].mean) / COV_STATS[k].sd);
}

// Real NSW (RCT). ATE under randomization = E[Y|T=1] - E[Y|T=0].
const RCT_ROWS = nswRows.slice();
const RCT_TREAT_MEAN = mean(RCT_ROWS.filter((r) => r.treat === 1).map((r) => r.re78));
const RCT_CONTROL_MEAN = mean(RCT_ROWS.filter((r) => r.treat === 0).map((r) => r.re78));
const RCT_ATE = RCT_TREAT_MEAN - RCT_CONTROL_MEAN; // ≈ 1794

// Synthetic confounded dataset built from NSW covariates.
//   Propensity P(T=1|C) depends on nodegree and re75 (job-history confounding)
//   Outcome:   Y = baseline(C) + TRUE_ATE * T + noise   (true ATE known)
const CONF_TRUE_ATE = 1800; // dollars
function buildConfounded(seed = 7) {
  const rng = new RNG(seed);
  const out = [];
  for (const r of nswRows) {
    // re75 in dollars; scale to be on similar order to other covariates' z-scores
    const re75z = (r.re75 - COV_STATS.re75.mean) / COV_STATS.re75.sd;
    const eduz  = (r.educ  - COV_STATS.educ.mean ) / COV_STATS.educ.sd;
    // Strong selection: low re75 & nodegree=1 & unmarried → more likely to enroll
    const logit = 1.0 * r.nodegree - 0.9 * re75z - 0.4 * r.marr - 0.5;
    const p = 1 / (1 + Math.exp(-logit));
    const T = rng.uniform() < p ? 1 : 0;
    // Baseline strongly tied to job history & education
    const baseline = 4000 + 0.55 * r.re75 + 600 * r.educ - 500 * r.nodegree + 1500 * r.marr;
    const noise = rng.normal(0, 3500);
    const Y = baseline + CONF_TRUE_ATE * T + noise;
    out.push({ ...r, treat: T, re78: Math.max(0, Y) });
  }
  return out;
}

// ── NCM (per-node MLPs) ─────────────────────────────────────────────────────
//
// Graph:   C ──► T,   C ──► Y,   T ──► Y
// MLP_T:  C → score(T)      (regress on 0/1; threshold for sampling)
// MLP_Y:  [C, T] → Y/scale  (regress; identity output)
//
// Only MLP_Y is needed for L1/L2/L3 once we treat C as observed (we marginalize
// over the empirical P(C)). MLP_T is trained anyway as the propensity head so
// the picture matches the "every node has its own neural net" story.

function buildNCM(dCov, seed = 1) {
  return {
    mlpT: new MLP([dCov, 12, 1],     { activation: "tanh", outAct: "identity", seed }),
    mlpY: new MLP([dCov + 1, 16, 8, 1], { activation: "tanh", outAct: "identity", seed: seed + 1 }),
  };
}

// Prepare X,Y arrays once for a given (rows, cov) view.
function makeXY(rows, cov) {
  const Xc = rows.map((r) => zRow(r, cov));
  const Yt = rows.map((r) => [r.treat]);
  const Xy = rows.map((r, i) => [...Xc[i], r.treat]);
  const Yy = rows.map((r) => [r.re78 / Y_SCALE]);
  return { Xc, Yt, Xy, Yy };
}

// Mini-batch SGD step (drawn fresh each call). Returns { lossT, lossY }.
function trainStep(ncm, view, rng, lr, batch = 64) {
  const n = view.Xc.length;
  const idx = [];
  for (let i = 0; i < batch; i++) idx.push(Math.floor(rng.uniform() * n));
  const Xc = idx.map((i) => view.Xc[i]);
  const Yt = idx.map((i) => view.Yt[i]);
  const Xy = idx.map((i) => view.Xy[i]);
  const Yy = idx.map((i) => view.Yy[i]);
  const lossT = ncm.mlpT.trainStepMSE(Xc, Yt, lr, 1e-4);
  const lossY = ncm.mlpY.trainStepMSE(Xy, Yy, lr, 1e-4);
  return { lossT, lossY };
}

// ── Causal queries on a trained NCM ─────────────────────────────────────────
//
// L1 — Observation E[Y | T=t]:
//   Use the EMPIRICAL conditional. Average actual Y over rows with T=t.
//   (Pulling the L1 number from data is what the trained NCM also implies.)
//
// L2 — Intervention E[Y | do(T=t)]:
//   For EVERY row, feed MLP_Y(C_i, t)  (t fixed, overriding the SCM equation
//   for T). Average over i. This marginalizes over P(C), not P(C|T).
//
// L3 — Counterfactual Y_{T=t'}(i) for a single row i with observed (T_i, Y_i):
//   Predict MLP_Y(C_i, t'). The NCM is deterministic in the structural sense
//   (its residual U_Y is folded into the regression error), so this is the
//   point-estimate counterfactual.

function queryL1(rows) {
  const yt = rows.filter((r) => r.treat === 1).map((r) => r.re78);
  const yc = rows.filter((r) => r.treat === 0).map((r) => r.re78);
  return { e1: mean(yt), e0: mean(yc), ate: mean(yt) - mean(yc) };
}

function queryL2(ncm, view, rows) {
  // Marginalize over empirical P(C): for each row, predict Y at do(T=1) and do(T=0).
  const Xy1 = view.Xc.map((c) => [...c, 1]);
  const Xy0 = view.Xc.map((c) => [...c, 0]);
  const Y1 = ncm.mlpY.predict(Xy1).map((r) => r[0] * Y_SCALE);
  const Y0 = ncm.mlpY.predict(Xy0).map((r) => r[0] * Y_SCALE);
  return { e1: mean(Y1), e0: mean(Y0), ate: mean(Y1) - mean(Y0) };
}

function queryL3(ncm, rows, view, i) {
  const r = rows[i];
  const cf = 1 - r.treat;
  const yCf = ncm.mlpY.predict([[...view.Xc[i], cf]])[0][0] * Y_SCALE;
  return { factualT: r.treat, factualY: r.re78, cfT: cf, cfY: yCf, ite: yCf - r.re78 };
}

// ── DAG drawing on canvas ───────────────────────────────────────────────────
function drawDAG(ctx, w, h, pulses) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const r = 26;
  // Node positions: C left, T top-right, Y right
  const nodes = {
    C: { x: cx - 180, y: cy,       label: "C",  desc: "covariates" },
    T: { x: cx,       y: cy - 50,  label: "T",  desc: "treatment" },
    Y: { x: cx + 180, y: cy,       label: "Y",  desc: "outcome" },
  };
  // Edges with their per-MLP pulse intensity in [0,1]
  const edges = [
    ["C", "T", pulses.T, "f_T  (MLP_T)"],
    ["C", "Y", pulses.Y, "f_Y  (MLP_Y)"],
    ["T", "Y", pulses.Y, ""],
  ];
  // Draw edges (curved C→Y to avoid passing through T)
  for (const [a, b, pulse, lab] of edges) {
    const A = nodes[a], B = nodes[b];
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const startX = A.x + ux * r, startY = A.y + uy * r;
    const endX   = B.x - ux * r, endY   = B.y - uy * r;
    const intensity = Math.min(1, Math.max(0.25, pulse));
    ctx.strokeStyle = `var(--accent2)`;
    ctx.globalAlpha = 0.35 + 0.6 * intensity;
    ctx.lineWidth   = 1.4 + 2.6 * intensity;
    ctx.beginPath();
    if (a === "C" && b === "Y") {
      // arc under the T node
      const mx = (startX + endX) / 2, my = (startY + endY) / 2 + 70;
      ctx.moveTo(startX, startY); ctx.quadraticCurveTo(mx, my, endX, endY);
    } else {
      ctx.moveTo(startX, startY); ctx.lineTo(endX, endY);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Arrowhead
    const ah = 8;
    ctx.fillStyle = `var(--accent2)`;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - ux * ah - uy * ah * 0.6, endY - uy * ah + ux * ah * 0.6);
    ctx.lineTo(endX - ux * ah + uy * ah * 0.6, endY - uy * ah - ux * ah * 0.6);
    ctx.closePath();
    ctx.fill();
    // Label
    if (lab) {
      ctx.fillStyle = `var(--dim)`;
      ctx.font = "11px var(--mono,monospace)";
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      const lx = (startX + endX) / 2;
      const ly = (a === "C" && b === "Y") ? (startY + endY) / 2 + 78 : (startY + endY) / 2 - 8;
      ctx.fillText(lab, lx, ly);
    }
  }
  // Edge label for T→Y
  ctx.fillStyle = `var(--dim)`;
  ctx.font = "11px var(--mono,monospace)";
  ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText("(direct effect)", (nodes.T.x + nodes.Y.x) / 2, (nodes.T.y + nodes.Y.y) / 2 - 8);

  // Draw nodes
  for (const k of Object.keys(nodes)) {
    const n = nodes[k];
    ctx.fillStyle = k === "T" ? `var(--treat)` : k === "Y" ? `var(--accent)` : `var(--ctrl)`;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `var(--ink)`; ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = `var(--ink)`;
    ctx.font = "bold 16px var(--sans,system-ui)";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(n.label, n.x, n.y);
    ctx.font = "10px var(--mono,monospace)";
    ctx.fillStyle = `var(--dim)`;
    ctx.fillText(n.desc, n.x, n.y + r + 12);
  }
}

// ── Loss curve drawing ──────────────────────────────────────────────────────
function drawLossCurve(ctx, w, h, history) {
  ctx.clearRect(0, 0, w, h);
  const pad = { l: 38, r: 8, t: 8, b: 18 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  // Axes
  ctx.strokeStyle = `var(--line)`; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + ih);
  ctx.lineTo(pad.l + iw, pad.t + ih); ctx.stroke();
  ctx.fillStyle = `var(--dim)`; ctx.font = "10px var(--mono,monospace)";
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  ctx.fillText("loss", pad.l - 6, pad.t + ih / 2);
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText("training iteration", pad.l + iw / 2, pad.t + ih + 4);
  if (history.lossY.length < 2) return;
  const N = history.lossY.length;
  const maxV = Math.max(...history.lossY, ...history.lossT, 0.5);
  const drawLine = (arr, stroke, lab) => {
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < arr.length; i++) {
      const x = pad.l + (i / (N - 1)) * iw;
      const y = pad.t + ih - (arr[i] / maxV) * ih;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // label at the end
    ctx.fillStyle = stroke; ctx.font = "10px var(--mono,monospace)";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const lastY = pad.t + ih - (arr[arr.length - 1] / maxV) * ih;
    ctx.fillText(lab, pad.l + iw + 2, lastY);
  };
  drawLine(history.lossT, "var(--treat)", "");
  drawLine(history.lossY, "var(--accent)", "");
  // Legend
  ctx.fillStyle = `var(--treat)`; ctx.font = "10px var(--mono,monospace)";
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillText("● f_T loss", pad.l + 6, pad.t + 2);
  ctx.fillStyle = `var(--accent)`;
  ctx.fillText("● f_Y loss", pad.l + 80, pad.t + 2);
}

// ── Number formatting ───────────────────────────────────────────────────────
const fmtDollars = (x) => {
  const s = x < 0 ? "−" : "+";
  return `${s}$${Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};
const fmtDollarsAbs = (x) => `$${Math.round(x).toLocaleString("en-US")}`;

// ════════════════════════════════════════════════════════════════════════════
// ── mount ───────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
export function mount(root) {
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Neural Causal Models — Theory Meets Architecture",
    idea: "One neural net per node, wired to a DAG. Train it on data, then read off observational, interventional, AND counterfactual answers from the same network — the theorem says you can; the architecture says how.",
  });

  // ── State ────────────────────────────────────────────────────────────────
  let mode = "rct";           // "rct" | "conf"
  let hideRe75 = false;       // toggle "Hide re75 (latent confounder)"
  let cov = COV_FULL.slice();
  let rows = RCT_ROWS;
  let view = makeXY(rows, cov);
  let ncm = buildNCM(cov.length);
  let history = { lossT: [], lossY: [] };
  let iter = 0;
  const TOTAL_ITERS = 1200;
  let stepsPerFrame = 6;
  let training = true;
  let cfIndex = 0;
  let rng = new RNG(13);
  let pulses = { T: 0, Y: 0 };

  // ── Stage layout ─────────────────────────────────────────────────────────
  const dagWrap = h("div", { class: "ncm-canvas-wrap" });
  const dagCanvas = h("canvas", { width: 700, height: 200, style: { width: "100%", height: "200px" } });
  dagWrap.appendChild(dagCanvas);
  const dagCtx = dagCanvas.getContext("2d");

  // Three rung cards
  const rungs = {
    L1: { tag: "L1 — Association",  name: "E[Y | T=1] − E[Y | T=0]",
          card: null, val: null, sub: null },
    L2: { tag: "L2 — Intervention", name: "E[Y | do(T=1)] − E[Y | do(T=0)]",
          card: null, val: null, sub: null },
    L3: { tag: "L3 — Counterfactual", name: "Y_{T=1−t}(i) − Y_{T=t}(i)  for one person",
          card: null, val: null, sub: null },
  };
  function makeRungCard(r) {
    const val = h("div", { class: "ncm-rung-val", text: "—" });
    const sub = h("div", { class: "ncm-rung-sub", text: "training…" });
    const card = h("div", { class: "ncm-rung" }, [
      h("div", { class: "ncm-rung-tag",  text: r.tag }),
      h("div", { class: "ncm-rung-name", text: r.name }),
      val, sub,
    ]);
    r.card = card; r.val = val; r.sub = sub;
    return card;
  }
  const rungsWrap = h("div", { class: "ncm-rungs" }, [
    makeRungCard(rungs.L1), makeRungCard(rungs.L2), makeRungCard(rungs.L3),
  ]);

  // Loss curve
  const lossWrap = h("div", { class: "ncm-canvas-wrap" });
  const lossCanvas = h("canvas", { width: 700, height: 110, style: { width: "100%", height: "110px" } });
  lossWrap.appendChild(lossCanvas);
  const lossCtx = lossCanvas.getContext("2d");

  // Counterfactual factual line ("person i was: …; would have been: …")
  const cfFactual = h("span", { class: "val", text: "—" });
  const cfCounter = h("span", { class: "val", text: "—" });
  const cfDelta   = h("span", { class: "delta", text: "—" });
  const cfRow = h("div", { class: "ncm-cf-row" }, [
    h("span", { class: "lab", text: "Person i observed:" }), cfFactual,
    h("span", { class: "lab", text: "Counterfactual:" }), cfCounter,
    h("span", { class: "lab", text: "ITE:" }), cfDelta,
  ]);

  // Data badge (provenance chip)
  const badgeMount = h("div", { class: "ncm-data-badge" });
  badgeMount.appendChild(dataBadge(nswMeta));

  stage.classList.add("ncm-stage");
  stage.appendChild(badgeMount);
  stage.appendChild(dagWrap);
  stage.appendChild(rungsWrap);
  stage.appendChild(lossWrap);
  stage.appendChild(cfRow);

  // ── Panel controls ───────────────────────────────────────────────────────
  const modeSeg = segmented({
    options: [
      { label: "RCT (NSW)", value: "rct" },
      { label: "Confounded (synthetic)", value: "conf" },
    ],
    value: "rct",
    onSelect: (v) => { mode = v; resetTraining(); },
  });

  const hideToggle = toggle({
    label: "Hide re75 (treat as latent confounder)",
    value: false,
    hint: "Only matters in Confounded mode — re75 is the strongest selector into treatment.",
    onToggle: (v) => { hideRe75 = v; resetTraining(); },
  });

  const trainBtn = button("Reset & train", () => resetTraining(), { primary: true });

  const cfSlider = slider({
    label: "Pick individual i for L3 counterfactual",
    min: 0, max: nswRows.length - 1, step: 1, value: 0,
    fmt: (v) => `i = ${v | 0}`,
    onInput: (v) => { cfIndex = v | 0; updateCounterfactual(); },
  });

  const rIter   = readout({ label: "Training iteration", value: "0 / " + TOTAL_ITERS });
  const rLossY  = readout({ label: "f_Y loss", value: "—", sub: "MSE on Y / 10k" });
  const rTrueATE = readout({ label: "Known true ATE", value: "—", sub: "what the network should recover" });

  const chal = challenge({
    goal: "Find a setting where L1 differs from L2 by more than $500 (and the NCM still recovers the truth).",
  });

  panel.appendChild(panelSection("Data mode", modeSeg));
  panel.appendChild(panelSection("Architecture", hideToggle));
  panel.appendChild(panelSection("Controls", trainBtn));
  panel.appendChild(panelSection("Counterfactual (L3)", cfSlider));
  panel.appendChild(panelSection("Status", h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
    [rIter, rLossY, rTrueATE])));
  panel.appendChild(panelSection("Challenge", chal));

  // ── Caption ──────────────────────────────────────────────────────────────
  caption.innerHTML =
    "<strong>Paper:</strong> Xia, Lee, Bengio, Bareinboim (NeurIPS&nbsp;2021; JMLR&nbsp;2023) — " +
    "<em>The Causal-Neural Connection: Expressiveness, Learnability, and Inference</em>. " +
    "A <strong>Neural Causal Model</strong> is a structural causal model whose mechanisms are <em>neural networks</em>, " +
    "one per node, each taking its DAG parents as input. The theorem: NCMs are expressive enough to realize any SCM, " +
    "and once trained, the <em>same</em> network answers all three rungs of Pearl's hierarchy — " +
    "<strong>L1</strong> (associations, <code>P(Y|T)</code>), <strong>L2</strong> (interventions, <code>P(Y|do(T))</code>), " +
    "<strong>L3</strong> (counterfactuals, <code>P(Y<sub>T=t&#39;</sub>|T=t,&nbsp;Y=y)</code>) — provided each query is identifiable. " +
    "<strong>Architecture here:</strong> three nodes (C&nbsp;= covariates, T&nbsp;= treatment, Y&nbsp;= outcome); " +
    "edges C→T, C→Y, T→Y; per-node MLPs trained with mini-batch Adam on real NSW data (LaLonde&nbsp;1986; Dehejia–Wahba&nbsp;1999). " +
    "<strong>RCT mode</strong>: real experiment — randomization breaks C→T, so L1 = L2 ≈ <strong>+$" + Math.round(RCT_ATE).toLocaleString() + "</strong>. " +
    "<strong>Confounded mode</strong>: treatment is re-assigned by a propensity score that selects on re75 &amp; nodegree, and Y is generated with a <em>known true ATE = $" + CONF_TRUE_ATE.toLocaleString() + "</em>. " +
    "The L1 number now bakes in the selection bias; the NCM's L2, queried via <code>do(T=t)</code> on the trained MLP_Y, recovers the truth — " +
    "but only if the confounder is in the graph. Flip <em>Hide re75</em> to make it latent and watch L2 inherit the bias. " +
    "<strong>L3</strong>: slide <em>Individual i</em> to pick a real person; the NCM imputes their counterfactual outcome had their treatment been flipped. " +
    "<em>Caveat:</em> the confounded scenario uses synthetic Y — honest about which numbers are real and which are constructed for the lesson.";

  root.appendChild(layout);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function resetTraining() {
    cov = hideRe75 ? COV_FULL.filter((k) => k !== "re75") : COV_FULL.slice();
    rows = mode === "rct" ? RCT_ROWS : buildConfounded(7);
    view = makeXY(rows, cov);
    ncm = buildNCM(cov.length, 1 + (mode === "conf" ? 10 : 0) + (hideRe75 ? 100 : 0));
    history = { lossT: [], lossY: [] };
    iter = 0;
    training = true;
    cfIndex = Math.min(cfIndex, rows.length - 1);
    cfSlider.setValue(cfIndex);
    rIter.set("0 / " + TOTAL_ITERS);
    rLossY.set("—");
    chal.setState(false, "");
    rng = new RNG(mode === "conf" ? 27 : 13);
    pulses = { T: 0, Y: 0 };
    for (const k of Object.keys(rungs)) {
      rungs[k].val.textContent = "—";
      rungs[k].val.classList.remove("good", "bad");
      rungs[k].sub.textContent = "training…";
    }
    cfFactual.textContent = "—"; cfCounter.textContent = "—"; cfDelta.textContent = "—";
    rTrueATE.set(mode === "rct" ? `+$${Math.round(RCT_ATE).toLocaleString()}` : `+$${CONF_TRUE_ATE.toLocaleString()}`,
                 mode === "rct" ? "empirical RCT difference" : "by construction");
  }

  function updateRungs() {
    const l1 = queryL1(rows);
    const l2 = queryL2(ncm, view, rows);
    rungs.L1.val.textContent = fmtDollars(l1.ate);
    rungs.L1.sub.textContent = `E[Y|T=1] = ${fmtDollarsAbs(l1.e1)} · E[Y|T=0] = ${fmtDollarsAbs(l1.e0)}`;
    rungs.L2.val.textContent = fmtDollars(l2.ate);
    rungs.L2.sub.textContent = `do(T=1): ${fmtDollarsAbs(l2.e1)} · do(T=0): ${fmtDollarsAbs(l2.e0)}`;
    // Color: green if close to known truth (within $400), red if biased
    const truth = mode === "rct" ? RCT_ATE : CONF_TRUE_ATE;
    rungs.L2.val.classList.toggle("good", Math.abs(l2.ate - truth) < 400);
    rungs.L2.val.classList.toggle("bad",  Math.abs(l2.ate - truth) >= 1200);
    rungs.L1.val.classList.toggle("good", Math.abs(l1.ate - truth) < 400);
    rungs.L1.val.classList.toggle("bad",  Math.abs(l1.ate - truth) >= 1200);
    updateCounterfactual();
    // Challenge: |L1 − L2| > 500 AND NCM L2 within 400 of truth
    const solved = Math.abs(l1.ate - l2.ate) > 500 && Math.abs(l2.ate - truth) < 400;
    chal.setState(solved, solved ? "L1/L2 gap visible; the NCM still recovers the truth." : "");
  }

  function updateCounterfactual() {
    if (iter < 30) return;
    const i = Math.max(0, Math.min(rows.length - 1, cfIndex));
    const q = queryL3(ncm, rows, view, i);
    cfFactual.textContent = `T=${q.factualT}, Y = ${fmtDollarsAbs(q.factualY)}`;
    cfCounter.textContent = `T=${q.cfT}, Y_cf = ${fmtDollarsAbs(q.cfY)}`;
    const sign = q.ite >= 0 ? "+" : "−";
    cfDelta.textContent = `${sign}$${Math.abs(Math.round(q.ite)).toLocaleString()}`;
    rungs.L3.val.textContent = `${sign}$${Math.abs(Math.round(q.ite)).toLocaleString()}`;
    rungs.L3.sub.textContent = `person i = ${i} · flip their treatment, hold their C fixed`;
  }

  // ── Initial setup ────────────────────────────────────────────────────────
  resetTraining();

  // ── Frame loop ───────────────────────────────────────────────────────────
  let lastUpdate = 0;
  const stop = onFrame((dt, t) => {
    if (training) {
      for (let s = 0; s < stepsPerFrame; s++) {
        if (iter >= TOTAL_ITERS) { training = false; break; }
        const lr = iter < 200 ? 2e-2 : (iter < 600 ? 1e-2 : 5e-3);
        const { lossT, lossY } = trainStep(ncm, view, rng, lr);
        if (iter % 8 === 0) {
          history.lossT.push(lossT);
          history.lossY.push(lossY);
          if (history.lossT.length > 200) {
            history.lossT.shift(); history.lossY.shift();
          }
        }
        iter++;
        pulses.T = 0.5 + 0.5 * Math.sin(iter * 0.4);
        pulses.Y = 0.5 + 0.5 * Math.cos(iter * 0.35);
      }
      // Throttle expensive readout updates to every ~120ms
      if (t - lastUpdate > 120 || !training) {
        lastUpdate = t;
        rIter.set(`${iter} / ${TOTAL_ITERS}`);
        const ly = history.lossY[history.lossY.length - 1];
        if (ly != null) rLossY.set(ly.toFixed(4));
        updateRungs();
      }
      if (!training) {
        // final pass
        pulses.T = 0; pulses.Y = 0;
        rungs.L1.sub.textContent && (rungs.L1.sub.textContent = rungs.L1.sub.textContent.replace(/training…/, ""));
        updateRungs();
      }
    }
    drawDAG(dagCtx, dagCanvas.width, dagCanvas.height, pulses);
    drawLossCurve(lossCtx, lossCanvas.width, lossCanvas.height, history);
  });

  return () => { stop(); };
}
