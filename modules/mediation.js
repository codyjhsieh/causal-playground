// Mediation Analysis — decomposing a total effect into direct and indirect
// components on the REAL JOBS II randomized trial data.
//
// Vinokur, Price & Schul (1995). Impact of the JOBS intervention on
// unemployed workers varying in risk for depression. Am. J. Community Psych.
//
// Did the job-search workshop reduce depression (1) because it raised
// job-search self-efficacy, or (2) through other channels?
//
// Baron-Kenny / Imai-Keele-Tingley linear mediation:
//   Mediator model:  M ~ [1, X, covariates]        → a  = X→M
//   Outcome model:   Y ~ [1, X, M, covariates]      → b  = M→Y, c' = X→Y direct
//   Total model:     Y ~ [1, X, covariates]          → c  = X→Y total
//   NIE = a·b  (Natural Indirect Effect through M)
//   NDE = c'   (Natural Direct Effect)
//   TE  = c    (Total Effect; ≈ NDE + NIE in linear models)
//   % mediated = NIE / TE
//
// Key assumption: no unmeasured mediator–outcome confounders.

import { h, s, clear } from "../lib/dom.js";
import { olsMulti, clamp } from "../lib/stats.js";
import { onFrame, Spring, lerp, tween } from "../lib/anim.js";
import { lessonLayout, panelSection, toggle, readout, challenge, note } from "../lib/ui.js";
import { rows, meta } from "../data/jobs.js";
import { col, complete, dataBadge } from "../lib/data.js";

// ── Data preparation ──────────────────────────────────────────────────────────
const KEYS = ["treat", "job_seek", "depress2", "depress1", "econ_hard", "sex", "age"];
const DATA = complete(rows, KEYS);
const N = DATA.length;

// Covariates used in adjusted models
const COVARS = ["depress1", "econ_hard", "sex", "age"];

// Build design matrices
function buildMatrices(adjusted) {
  const covCols = adjusted ? COVARS : [];

  // Mediator model: M ~ [1, X, covariates]
  const Xm = DATA.map((r) => [1, r.treat, ...covCols.map((k) => r[k])]);
  const M  = DATA.map((r) => r.job_seek);

  // Outcome model with mediator: Y ~ [1, X, M, covariates]
  const Xy = DATA.map((r) => [1, r.treat, r.job_seek, ...covCols.map((k) => r[k])]);
  const Y  = DATA.map((r) => r.depress2);

  // Total outcome model: Y ~ [1, X, covariates] (no M)
  const Xt = DATA.map((r) => [1, r.treat, ...covCols.map((k) => r[k])]);

  return { Xm, M, Xy, Y, Xt };
}

function estimate(adjusted) {
  const { Xm, M, Xy, Y, Xt } = buildMatrices(adjusted);
  const fitM = olsMulti(Xm, M);
  const fitY = olsMulti(Xy, Y);
  const fitT = olsMulti(Xt, Y);
  const a       = fitM.beta[1];   // treat → job_seek
  const cPrime  = fitY.beta[1];   // treat → depress2 | M (direct)
  const b       = fitY.beta[2];   // job_seek → depress2
  const c       = fitT.beta[1];   // treat → depress2 (total)
  const NIE     = a * b;
  const NDE     = cPrime;
  const TE      = c;
  const prop    = Math.abs(TE) > 1e-9 ? NIE / TE : 0;
  return { a, b, cPrime, c, NIE, NDE, TE, prop };
}

// Pre-compute both adjusted and unadjusted estimates
const EST_ADJ   = estimate(true);
const EST_UNADJ = estimate(false);

// ── CSS injection ─────────────────────────────────────────────────────────────
function injectCSS() {
  if (document.getElementById("mediation-css")) return;
  const style = document.createElement("style");
  style.id = "mediation-css";
  style.textContent = `
    .med-stage { display:flex; flex-direction:column; align-items:center; gap:18px; width:100%; }
    .med-path-wrap { display:flex; flex-direction:column; align-items:center; gap:4px; }
    .med-stage-title { font:700 11px var(--mono,monospace); color:var(--dim); letter-spacing:.06em;
                       text-transform:uppercase; margin:0; }
    .med-bar-wrap { display:flex; flex-direction:column; align-items:center; gap:8px; width:100%; max-width:580px; }
    .med-bar-outer {
      width:100%; height:52px; background:var(--surface2); border-radius:12px;
      overflow:hidden; display:flex; position:relative; border:1.5px solid var(--line);
    }
    .med-bar-direct {
      height:100%; background:var(--accent2); transition:none;
      display:flex; align-items:center; justify-content:center; overflow:hidden;
      border-radius:0; flex-shrink:0;
    }
    .med-bar-indirect {
      height:100%; background:var(--pos); transition:none;
      display:flex; align-items:center; justify-content:center; overflow:hidden;
      flex-shrink:0;
    }
    .med-bar-label {
      font:700 11px var(--mono,monospace); color:#fff; white-space:nowrap;
      text-shadow:0 1px 3px rgba(0,0,0,.35); padding:0 8px;
    }
    .med-bar-legend { display:flex; gap:18px; flex-wrap:wrap; justify-content:center; }
    .med-bar-legend-item { display:flex; align-items:center; gap:6px; font:12px var(--sans,system-ui); color:var(--dim); }
    .med-bar-legend-dot { width:12px; height:12px; border-radius:3px; flex-shrink:0; }
    .med-readout-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .med-eq { font:13px var(--mono,monospace); color:var(--dim); text-align:center;
              line-height:1.7; margin:4px 0 0; }
    .med-eq .hi  { color:var(--accent2); font-weight:700; }
    .med-eq .teal { color:var(--pos); font-weight:700; }
    .med-eq .orange { color:var(--gold); font-weight:700; }
    .med-assumption { font:italic 11px var(--sans,system-ui); color:var(--dim); text-align:center;
                      margin:2px 0 0; }
  `;
  document.head.appendChild(style);
}

// ── Path diagram (SVG) ────────────────────────────────────────────────────────
// Draws X→M→Y (indirect) and X→Y (direct) with thickness animated by Spring.
// Node layout:
//   X  at (100, 180)
//   M  at (340, 80)
//   Y  at (580, 180)

const PX = { x: 100, y: 180 };
const PM = { x: 340, y:  80 };
const PY = { x: 580, y: 180 };

function buildPathDiagram() {
  const W = 680, H = 280;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "dag" });

  const defs = s("defs");
  // We create multiple markers for different widths / colors
  // orange = direct (accent2 / --accent2), teal = indirect (pos / --pos)
  const mkMarker = (id, color, size = 7) => s("marker", {
    id, viewBox: "0 0 10 10", refX: 9, refY: 5,
    markerWidth: size, markerHeight: size, orient: "auto-start-reverse",
  }, [s("path", { d: "M0,0 L10,5 L0,10 z", fill: color })]);

  defs.append(
    mkMarker("med-mk-direct",   "var(--accent2)"),
    mkMarker("med-mk-indirect", "var(--pos)"),
    mkMarker("med-mk-a",        "var(--pos)"),
  );
  svg.appendChild(defs);

  // Groups for edges and nodes (nodes on top)
  const gEdges  = s("g");
  const gLabels = s("g");
  const gNodes  = s("g");
  svg.append(gEdges, gLabels, gNodes);

  // ── Build edge paths ────────────────────────────────────────────────────────
  // X→M  (a path, teal)
  // M→Y  (b path, teal)
  // X→Y  direct (c' path, orange) — arc below so it doesn't overlap M
  const R = 26; // node radius

  function edgePts(a, b, arcY = 0) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const x0 = a.x + ux * R, y0 = a.y + uy * R;
    const x1 = b.x - ux * (R + 6), y1 = b.y - uy * (R + 6);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + arcY;
    return { x0, y0, x1, y1, mx, my, d: `M ${x0} ${y0} Q ${mx} ${my} ${x1} ${y1}` };
  }

  const ePtsXM = edgePts(PX, PM);
  const ePtsMY = edgePts(PM, PY);
  const ePtsXY = edgePts(PX, PY, 80); // arc down

  // Edge path elements — stroke-width driven by spring values
  const pathXM = s("path", { fill: "none", stroke: "var(--pos)",    "stroke-linecap": "round", "marker-end": "url(#med-mk-a)" });
  const pathMY = s("path", { fill: "none", stroke: "var(--pos)",    "stroke-linecap": "round", "marker-end": "url(#med-mk-indirect)" });
  const pathXY = s("path", { fill: "none", stroke: "var(--accent2)","stroke-linecap": "round", "marker-end": "url(#med-mk-direct)" });

  gEdges.append(pathXY, pathXM, pathMY); // XY behind

  // Edge labels
  const lblXM = s("text", { class: "edge-label", "text-anchor": "middle", "font-size": "12", fill: "var(--pos)" });
  const lblMY = s("text", { class: "edge-label", "text-anchor": "middle", "font-size": "12", fill: "var(--pos)" });
  const lblXY = s("text", { class: "edge-label", "text-anchor": "middle", "font-size": "12", fill: "var(--accent2)" });
  gLabels.append(lblXY, lblXM, lblMY);

  // Position labels at curve midpoints with offset
  function setLblPos(lbl, pts, ox, oy) {
    lbl.setAttribute("x", pts.mx + ox);
    lbl.setAttribute("y", pts.my + oy);
  }
  setLblPos(lblXM, ePtsXM, -10, -8);
  setLblPos(lblMY, ePtsMY,  10, -8);
  setLblPos(lblXY, ePtsXY,   0, 14);

  // ── Nodes ──────────────────────────────────────────────────────────────────
  function mkNode(pos, label, sublabel, role) {
    const fill = role === "treatment" ? "color-mix(in srgb,var(--treat) 22%,var(--surface))"
               : role === "outcome"   ? "color-mix(in srgb,var(--neg) 16%,var(--surface))"
               : role === "mediator"  ? "color-mix(in srgb,var(--pos) 20%,var(--surface))"
               : "var(--surface)";
    const stroke = role === "treatment" ? "var(--treat)"
                 : role === "outcome"   ? "var(--neg)"
                 : role === "mediator"  ? "var(--pos)"
                 : "var(--line)";
    const g = s("g", { transform: `translate(${pos.x},${pos.y})` });
    g.append(
      s("circle", { r: String(R), fill, stroke, "stroke-width": "2.5" }),
      s("text",   { "text-anchor": "middle", y: "5",  "font-size": "13", "font-weight": "700", fill: "var(--ink)", text: label }),
      s("text",   { "text-anchor": "middle", y: String(R + 16), "font-size": "10.5", fill: "var(--dim)", text: sublabel }),
    );
    return g;
  }

  gNodes.append(
    mkNode(PX, "X", "workshop", "treatment"),
    mkNode(PM, "M", "self-efficacy", "mediator"),
    mkNode(PY, "Y", "depression", "outcome"),
  );

  // Springs for arrow thickness (abs-magnitude scaled)
  const springA  = new Spring(2, { stiffness: 45, damping: 11 });
  const springB  = new Spring(2, { stiffness: 45, damping: 11 });
  const springCP = new Spring(2, { stiffness: 45, damping: 11 });

  const MIN_W = 1.5, MAX_W = 12;
  function scaleWidth(absVal, maxAbs) {
    return clamp(MIN_W + (absVal / (maxAbs || 0.5)) * (MAX_W - MIN_W), MIN_W, MAX_W);
  }

  function update(est) {
    const maxAbs = Math.max(Math.abs(est.a), Math.abs(est.b), Math.abs(est.cPrime), 0.1);
    springA.set(scaleWidth(Math.abs(est.a), maxAbs));
    springB.set(scaleWidth(Math.abs(est.b), maxAbs));
    springCP.set(scaleWidth(Math.abs(est.cPrime), maxAbs));
  }

  function render(est) {
    // Update path data each frame (fixed geometry, only width changes)
    pathXM.setAttribute("d", ePtsXM.d);
    pathMY.setAttribute("d", ePtsMY.d);
    pathXY.setAttribute("d", ePtsXY.d);

    pathXM.setAttribute("stroke-width", String(springA.value));
    pathMY.setAttribute("stroke-width", String(springB.value));
    pathXY.setAttribute("stroke-width", String(springCP.value));

    const fmt4 = (v) => v.toFixed(3);
    lblXM.textContent = `a = ${fmt4(est.a)}`;
    lblMY.textContent = `b = ${fmt4(est.b)}`;
    lblXY.textContent = `c′ = ${fmt4(est.cPrime)}`;
  }

  return { svg, springA, springB, springCP, update, render };
}

// ── Stacked bar chart ─────────────────────────────────────────────────────────
function buildStackedBar() {
  const barDirect   = h("div", { class: "med-bar-direct" });
  const barIndirect = h("div", { class: "med-bar-indirect" });
  const barOuter    = h("div", { class: "med-bar-outer" }, [barDirect, barIndirect]);
  const lblDirect   = h("div", { class: "med-bar-label", text: "Direct" });
  const lblIndirect = h("div", { class: "med-bar-label", text: "Indirect" });
  barDirect.appendChild(lblDirect);
  barIndirect.appendChild(lblIndirect);

  // Legend
  const legend = h("div", { class: "med-bar-legend" }, [
    h("div", { class: "med-bar-legend-item" }, [
      h("div", { class: "med-bar-legend-dot", style: { background: "var(--accent2)" } }),
      "NDE — direct effect (c′)",
    ]),
    h("div", { class: "med-bar-legend-item" }, [
      h("div", { class: "med-bar-legend-dot", style: { background: "var(--pos)" } }),
      "NIE — indirect via self-efficacy (a·b)",
    ]),
  ]);

  // Spring for proportion mediated (0→1 for indirect width fraction)
  const propSpring = new Spring(0.5, { stiffness: 35, damping: 11 });

  function update(est) {
    // Proportion of total effect that is indirect.
    // When TE or components might be near zero or same sign as NIE,
    // clamp to [0,1] for display purposes.
    const rawProp = clamp(est.prop, 0, 1);
    propSpring.set(rawProp);
  }

  function render(est) {
    const p = propSpring.value; // fraction = indirect
    const directPct  = (1 - p) * 100;
    const indirectPct = p * 100;

    barDirect.style.width   = directPct.toFixed(1) + "%";
    barIndirect.style.width = indirectPct.toFixed(1) + "%";

    // Show labels only when wide enough
    lblDirect.style.opacity   = directPct  > 12 ? "1" : "0";
    lblIndirect.style.opacity = indirectPct > 12 ? "1" : "0";
  }

  const wrap = h("div", { class: "med-bar-wrap" }, [
    h("p", { class: "med-stage-title", text: "total effect decomposition" }),
    barOuter,
    legend,
  ]);

  return { wrap, propSpring, update, render };
}

// ═════════════════════════════════════════════════════════════════════════════
export function mount(root) {
  injectCSS();

  // Current state
  let adjusted = true;
  let currentEst = adjusted ? EST_ADJ : EST_UNADJ;

  // Layout
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Mediation Analysis",
    idea: "A total effect decomposes into a DIRECT path (X→Y) and an INDIRECT path through the mediator M (X→M→Y). JOBS II: did the workshop reduce depression by boosting self-efficacy, or through other channels?",
  });

  root.appendChild(layout);

  // ── Stage ─────────────────────────────────────────────────────────────────
  const stageWrap = h("div", { class: "med-stage" });
  stage.appendChild(stageWrap);

  // Path diagram
  const pathDiag = buildPathDiagram();
  const pathWrap = h("div", { class: "med-path-wrap" }, [
    h("p", { class: "med-stage-title", text: "path diagram — arrow width ∝ coefficient magnitude" }),
    pathDiag.svg,
  ]);
  stageWrap.appendChild(pathWrap);

  // Stacked bar
  const bar = buildStackedBar();
  stageWrap.appendChild(bar.wrap);

  // Decomposition equation display
  const eqEl = h("div", { class: "med-eq" });
  stageWrap.appendChild(eqEl);

  function updateEq(est) {
    const fmt = (v) => (v >= 0 ? "+" : "") + v.toFixed(3);
    eqEl.innerHTML =
      `TE = NDE + NIE &nbsp;&nbsp;→&nbsp;&nbsp;` +
      `<span class="hi">${est.TE.toFixed(3)}</span> ≈ ` +
      `<span class="orange">${est.NDE.toFixed(3)}</span> + ` +
      `<span class="teal">${est.NIE.toFixed(3)}</span>` +
      `&nbsp;&nbsp;(a·b = ${est.a.toFixed(3)} × ${est.b.toFixed(3)})`;
  }

  // ── Panel ─────────────────────────────────────────────────────────────────
  const badge = dataBadge(meta);

  const rTE   = readout({ label: "Total effect (TE)",           value: "—", accent: "var(--accent)" });
  const rNDE  = readout({ label: "Direct (NDE = c′)",           value: "—", accent: "var(--accent2)" });
  const rNIE  = readout({ label: "Indirect (NIE = a·b)",        value: "—", accent: "var(--pos)" });
  const rProp = readout({ label: "% mediated via self-efficacy", value: "—", accent: "var(--gold)" });

  const readoutGrid = h("div", { class: "med-readout-grid" }, [rTE, rNDE, rNIE, rProp]);

  // Springs for readout animations
  const sprTE   = new Spring(0, { stiffness: 50, damping: 12 });
  const sprNDE  = new Spring(0, { stiffness: 50, damping: 12 });
  const sprNIE  = new Spring(0, { stiffness: 50, damping: 12 });
  const sprProp = new Spring(0, { stiffness: 50, damping: 12 });

  function setTargets(est) {
    sprTE.set(est.TE);
    sprNDE.set(est.NDE);
    sprNIE.set(est.NIE);
    sprProp.set(est.prop * 100);
    pathDiag.update(est);
    bar.update(est);
    updateEq(est);
  }

  // Adjusted toggle
  const adjToggle = toggle({
    label: "Adjust for baseline covariates",
    hint: "(depress1, econ_hard, sex, age)",
    value: adjusted,
    onToggle: (on) => {
      adjusted = on;
      currentEst = adjusted ? EST_ADJ : EST_UNADJ;
      setTargets(currentEst);
    },
  });

  // Challenge
  const chal = challenge({
    goal: "Confirm Total ≈ Direct + Indirect, and read what % of the workshop's depression benefit flows through job-search self-efficacy.",
  });

  function checkChallenge(est) {
    const gap = Math.abs(est.TE - (est.NDE + est.NIE));
    const propPct = (est.prop * 100).toFixed(1);
    const approxOk = gap < 0.01;
    if (approxOk && Math.abs(est.prop) > 0.05) {
      chal.setState(true,
        `TE (${est.TE.toFixed(3)}) ≈ NDE (${est.NDE.toFixed(3)}) + NIE (${est.NIE.toFixed(3)}) = ${(est.NDE + est.NIE).toFixed(3)}. ${propPct}% flows through self-efficacy.`
      );
    }
  }

  panel.append(
    badge,
    panelSection("Model", [
      adjToggle,
      h("p", { class: "note", text: `n = ${N} complete cases. X = treat (workshop), M = job_seek (self-efficacy), Y = depress2 (later depression).` }),
    ]),
    panelSection("Mediation decomposition", readoutGrid),
    panelSection("How to read it", [
      note("The workshop lowers depression (negative TE). The indirect path: the workshop boosts self-efficacy (a > 0), and higher self-efficacy lowers depression (b < 0), so NIE = a·b < 0 — the same direction as the total effect."),
      note("NDE is what remains after accounting for the self-efficacy pathway. In an RCT, the total effect is well-identified; splitting it requires the no-unmeasured-mediator-confounder assumption."),
      note("Toggle covariates to see how adjustment for baseline depression, economic hardship, sex, and age shifts the decomposition."),
    ]),
    panelSection("Challenge", chal),
  );

  caption.innerHTML =
    "<strong>Mediation formula (linear):</strong> " +
    "fit a mediator model M~X+covs (→ coefficient <em>a</em>), " +
    "then an outcome model Y~X+M+covs (→ direct effect <em>c′</em>, mediator effect <em>b</em>), " +
    "and a total model Y~X+covs (→ <em>c</em>). " +
    "NIE = <em>a</em>·<em>b</em>, NDE = <em>c′</em>, TE ≈ NDE + NIE. " +
    "Key assumption: <strong>no unmeasured mediator–outcome confounders</strong> — " +
    "even in an RCT, this is an untestable structural assumption for the M→Y path. " +
    "Data: JOBS II (Vinokur, Price &amp; Schul 1995) — a randomized job-search intervention " +
    "where the workshop lowers depression (TE &lt; 0); a &gt; 0 (workshop raises self-efficacy) " +
    "and b &lt; 0 (self-efficacy lowers depression), so NIE = a·b &lt; 0 (depression-reducing). " +
    "Approximately 37% of the total depression reduction is mediated through self-efficacy (NIE / TE). " +
    "<em>Baron &amp; Kenny (1986); Imai, Keele &amp; Tingley (2010); VanderWeele (2015).</em>";

  // Initialise targets
  setTargets(currentEst);
  checkChallenge(currentEst);

  // ── Animation loop ────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    // Step springs
    sprTE.step(dt);
    sprNDE.step(dt);
    sprNIE.step(dt);
    sprProp.step(dt);
    pathDiag.springA.step(dt);
    pathDiag.springB.step(dt);
    pathDiag.springCP.step(dt);
    bar.propSpring.step(dt);

    // Update readouts
    const fmtSigned = (v) => (v >= 0 ? "+" : "") + v.toFixed(3);
    rTE.set(fmtSigned(sprTE.value),   "treat → depress2");
    rNDE.set(fmtSigned(sprNDE.value), "c′, X→Y direct");
    rNIE.set(fmtSigned(sprNIE.value), "a·b, X→M→Y");
    rProp.set(sprProp.value.toFixed(1) + "%", "NIE / TE");

    // Render visual elements
    pathDiag.render(currentEst);
    bar.render(currentEst);

    // Colour rTE based on sign
    const teEl = rTE.querySelector(".readout-value");
    if (teEl) teEl.style.color = sprTE.value < 0 ? "var(--pos)" : "var(--neg)";

    // Check challenge once settled
    checkChallenge(currentEst);
  });

  return () => { stop(); };
}
