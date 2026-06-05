// do-Calculus & Identification — interactive gallery of canonical graphs.
// Pearl (1995): three rewrite rules turn P(Y|do(X)) into a do-free formula,
// or prove no formula exists. This module is a tactile identification explorer:
// pick a graph, watch the do-operator cut arrows into X (graph surgery), step
// through the derivation, and see a live verdict + computed effect from real
// 401(k) data for the graphs that match it.
//
// Gallery:
//   1. Backdoor  — X←Z→Y, Z observed → identifiable by adjustment.
//   2. Front-door — X→M→Y, U unobserved → identifiable via mediator.
//   3. Bow arc   — X→Y, U bidirected X↔Y → NOT identifiable.
//   4. Instrument — Z→X→Y, U unobserved → NOT point-identified without IV.
//   5. M-bias    — conditioning on B opens a blocked path (collider).
//
// Real data: pension401k.js (Poterba-Venti-Wise, n≈9913).

import { h, clear } from "../lib/dom.js";
import { DAG, DAGView } from "../lib/dag.js";
import { onFrame, Spring } from "../lib/anim.js";
import { lessonLayout, panelSection, segmented, button, readout, challenge } from "../lib/ui.js";
import { rows, meta } from "../data/pension401k.js";
import { col, complete, dataBadge } from "../lib/data.js";
import { ols1, olsMulti } from "../lib/stats.js";

// ─── Real data (401k) ────────────────────────────────────────────────────────
const DATA = complete(rows, ["e401k", "p401k", "nettfa", "inc"]);

// Naive assoc e401k → nettfa
const EST_NAIVE = ols1(col(DATA, "e401k"), col(DATA, "nettfa")).b;

// Backdoor: nettfa ~ e401k + inc (income = observed confounder)
const bdFit  = olsMulti(DATA.map((r) => [1, r.e401k, r.inc]), col(DATA, "nettfa"));
const EST_BD = bdFit.beta[1]; // ≈ income-adjusted effect

// Front-door two-stage:
//   Stage 1: p401k ~ e401k   (β₁)
const BETA1  = ols1(col(DATA, "e401k"), col(DATA, "p401k")).b;
//   Stage 2: nettfa ~ p401k + e401k   (β₂ = coef on p401k)
const s2Fit  = olsMulti(DATA.map((r) => [1, r.p401k, r.e401k]), col(DATA, "nettfa"));
const BETA2  = s2Fit.beta[1];
const EST_FD = BETA1 * BETA2;

// ─── Gallery definitions ─────────────────────────────────────────────────────
// Each entry has: id, label, identifiable, formula (HTML), whyNot (HTML),
// verdict, nodes[], edges[], derivationSteps[], ruleHighlights[],
// computedEffect (null = not available from data)

const GRAPHS = [
  {
    id: "backdoor",
    label: "Backdoor",
    identifiable: true,
    formula: "Σ<sub>z</sub> P(Y | X, z) P(z)",
    whyNot: null,
    verdictText: "Identifiable — backdoor adjustment",
    dataLabel: "Backdoor-adjusted ($000 / unit eligibility)",
    computedEffect: () => EST_BD,
    formulaPlain: "Σ_z P(Y|X,z)P(z)",
    derivation: [
      { query: "P(Y | do(X))",    rule: null,  note: "Start: interventional query" },
      { query: "P(Y | do(X))",    rule: 2,     note: "Rule 2: Z blocks all backdoors X←Z→Y; X and Y are d-separated given Z in G_X̄  ⟹ do(X) acts like obs. X given Z" },
      { query: "Σ<sub>z</sub> P(Y | X, z) P(z)", rule: null, note: "Result: do-free formula, computable from data" },
    ],
    nodes: [
      { id: "Z", label: "Z", sub: "income (obs.)", x: 280, y:  70, role: "confounder" },
      { id: "X", label: "X", sub: "eligibility",   x: 140, y: 230, role: "treatment",  conditionable: false },
      { id: "Y", label: "Y", sub: "net assets",     x: 420, y: 230, role: "outcome",    conditionable: false },
    ],
    edges: [
      { from: "Z", to: "X" },
      { from: "Z", to: "Y" },
      { from: "X", to: "Y", sign: "+", label: "?" },
    ],
  },
  {
    id: "frontdoor",
    label: "Front-door",
    identifiable: true,
    formula: "Σ<sub>m</sub> P(m | X) Σ<sub>x′</sub> E[Y | m, x′] P(x′)",
    whyNot: null,
    verdictText: "Identifiable — front-door formula",
    dataLabel: "Front-door ATE ($000; β₁×β₂)",
    computedEffect: () => EST_FD,
    formulaPlain: "Σ_m P(m|X) Σ_x' P(Y|m,x') P(x')",
    derivation: [
      { query: "P(Y | do(X))",                                     rule: null, note: "Start: X→Y confounded by unobserved U" },
      { query: "Σ<sub>m</sub> P(m | do(X)) P(Y | do(X), do(m))",  rule: 3,    note: "Rule 3: insert do(M); M has no unblocked backdoors from X, so do(X) ⟹ obs X for M" },
      { query: "Σ<sub>m</sub> P(m | X) P(Y | do(m))",             rule: 2,    note: "Rule 2: exchange do(M) for obs M in P(Y|do(m)); X blocks all backdoors M←U→Y when conditioning on X" },
      { query: "Σ<sub>m</sub> P(m | X) Σ<sub>x′</sub> E[Y | m, x′] P(x′)", rule: null, note: "Result: do-free; both stages estimable from data" },
    ],
    nodes: [
      { id: "U", label: "U", sub: "unobserved",    x: 280, y:  55, role: "confounder",  conditionable: false, latent: true },
      { id: "X", label: "X", sub: "eligibility",   x: 130, y: 230, role: "treatment",   conditionable: false },
      { id: "M", label: "M", sub: "participation", x: 280, y: 230, role: "mediator" },
      { id: "Y", label: "Y", sub: "net assets",    x: 430, y: 230, role: "outcome",     conditionable: false },
    ],
    edges: [
      { from: "U", to: "X", dashed: true, weak: true, latent: true },
      { from: "U", to: "Y", dashed: true, weak: true, latent: true },
      { from: "X", to: "M", sign: "+", label: "β₁" },
      { from: "M", to: "Y", sign: "+", label: "β₂" },
    ],
  },
  {
    id: "bowarc",
    label: "Bow arc",
    identifiable: false,
    formula: null,
    whyNot: "U creates a <em>bidirected arc</em> X↔Y (a latent common cause confounding both endpoints). No set of observed variables can block the open backdoor, and no do-calculus rule applies — P(Y | do(X)) cannot be expressed in terms of observational data alone, regardless of sample size. The <em>hedge</em> criterion (Tian &amp; Pearl 2002; Shpitser &amp; Pearl 2006) confirms non-identifiability.",
    verdictText: "Not identifiable — the hedge (bow arc)",
    dataLabel: null,
    computedEffect: null,
    formulaPlain: null,
    derivation: [
      { query: "P(Y | do(X))", rule: null, note: "Start: X→Y with bidirected U arc" },
      { query: "P(Y | do(X)) = ???", rule: null, note: "No rule can eliminate do(X): U blocks every rewriting attempt. The causal effect is not identified — P(Y|do(X)) cannot be expressed in terms of P(X,Y) alone." },
    ],
    nodes: [
      { id: "U", label: "U", sub: "unobserved",  x: 280, y:  65, role: "confounder", conditionable: false, latent: true },
      { id: "X", label: "X", sub: "treatment",   x: 140, y: 230, role: "treatment",  conditionable: false },
      { id: "Y", label: "Y", sub: "outcome",     x: 420, y: 230, role: "outcome",    conditionable: false },
    ],
    edges: [
      { from: "U", to: "X", dashed: true, weak: true, latent: true },
      { from: "U", to: "Y", dashed: true, weak: true, latent: true },
      { from: "X", to: "Y", sign: "+", label: "?" },
    ],
  },
  {
    id: "instrument",
    label: "Instrument",
    identifiable: false,
    formula: null,
    whyNot: "U confounds X and Y; Z is an instrument (Z→X, Z⊥Y|X). The IV ratio E[Y|Z=1]−E[Y|Z=0] / E[X|Z=1]−E[X|Z=0] recovers the LATE (local ATE for compliers) but NOT the population ATE — which remains unidentified without homogeneity assumptions.",
    verdictText: "Not point-identified — IV recovers LATE only",
    dataLabel: null,
    computedEffect: null,
    formulaPlain: null,
    derivation: [
      { query: "P(Y | do(X))",  rule: null, note: "Start: X→Y, U unobserved; Z→X is instrument" },
      { query: "P(Y | do(X)) — no backdoor formula", rule: null, note: "Rule 2 fails: U creates open backdoor X←U→Y not blocked by Z. Rule 3 fails: no mediator. The population ATE is not identified." },
      { query: "LATE = E[Y|Z=1]−E[Y|Z=0] / E[X|Z=1]−E[X|Z=0]", rule: null, note: "IV ratio identifies LATE for compliers (Imbens & Angrist 1994), not the full do-calculus ATE without extra assumptions." },
    ],
    nodes: [
      { id: "Z", label: "Z", sub: "instrument",  x:  90, y: 230, role: "instrument", conditionable: false },
      { id: "U", label: "U", sub: "unobserved",  x: 280, y:  65, role: "confounder", conditionable: false, latent: true },
      { id: "X", label: "X", sub: "treatment",   x: 255, y: 230, role: "treatment",  conditionable: false },
      { id: "Y", label: "Y", sub: "outcome",     x: 450, y: 230, role: "outcome",    conditionable: false },
    ],
    edges: [
      { from: "Z", to: "X" },
      { from: "U", to: "X", dashed: true, weak: true, latent: true },
      { from: "U", to: "Y", dashed: true, weak: true, latent: true },
      { from: "X", to: "Y", sign: "+", label: "?" },
    ],
  },
  {
    id: "mbias",
    label: "M-bias",
    identifiable: true,
    formula: "P(Y | do(X)) = P(Y | X) — no adjustment needed",
    whyNot: null,
    verdictText: "Identifiable — marginal P(Y|X) suffices; conditioning on B induces bias",
    dataLabel: null,
    computedEffect: null,
    formulaPlain: "P(Y|X) — do not adjust for B",
    derivation: [
      { query: "P(Y | do(X))",  rule: null, note: "Start: X→Y. X and Y are d-separated by ∅; B is a collider on U₁→B←U₂" },
      { query: "P(Y | do(X)) = P(Y | X)", rule: 2, note: "Rule 2: no open backdoor from X to Y in the empty graph G_X̄; do(X) = obs X. Marginal association is causal." },
      { query: "WARNING: conditioning on B opens U₁→B←U₂ path", rule: 1, note: "Rule 1 (insert/delete obs): adding B to conditioning set opens the collider B, creating a spurious association between U₁ and U₂ — a classic M-bias trap." },
    ],
    nodes: [
      { id: "U1", label: "U₁", sub: "latent 1",  x: 140, y:  70, latent: true, conditionable: false },
      { id: "U2", label: "U₂", sub: "latent 2",  x: 420, y:  70, latent: true, conditionable: false },
      { id: "B",  label: "B",  sub: "collider",  x: 280, y: 150 },
      { id: "X",  label: "X",  sub: "treatment", x: 140, y: 280, role: "treatment", conditionable: false },
      { id: "Y",  label: "Y",  sub: "outcome",   x: 420, y: 280, role: "outcome",   conditionable: false },
    ],
    edges: [
      { from: "U1", to: "B", dashed: true, weak: true, latent: true },
      { from: "U2", to: "B", dashed: true, weak: true, latent: true },
      { from: "U1", to: "X", dashed: true, weak: true, latent: true },
      { from: "U2", to: "Y", dashed: true, weak: true, latent: true },
      { from: "X",  to: "Y", sign: "+" },
    ],
  },
];

// ─── Rules reference ──────────────────────────────────────────────────────────
const RULES = [
  {
    num: 1,
    short: "Rule 1 — Insert / delete observations",
    detail: "P(Y | do(X), Z, W) = P(Y | do(X), Z)  when Y ⊥ W | X, Z in G_X̄ (W's arrows into X deleted).",
  },
  {
    num: 2,
    short: "Rule 2 — Action ↔ observation exchange",
    detail: "P(Y | do(X), do(Z), W) = P(Y | do(X), Z, W)  when Y ⊥ Z | X, W in G_X̄Z̄ (arrows in/out of both deleted).",
  },
  {
    num: 3,
    short: "Rule 3 — Insert / delete actions",
    detail: "P(Y | do(X), do(Z), W) = P(Y | do(X), W)  when Y ⊥ Z | X, W in G_X̄Z(W) (only Z's arrows blocked for non-ancestors of W).",
  },
];

// ─── Module ───────────────────────────────────────────────────────────────────
export function mount(root) {
  // ── CSS ────────────────────────────────────────────────────────────────────
  if (!document.getElementById("docalc-css")) {
    const sty = document.createElement("style");
    sty.id = "docalc-css";
    sty.textContent = `
      /* Layout */
      .dc-stage  { display:flex; flex-direction:column; gap:10px; align-items:center; position:relative; }
      .dc-seg-row{ display:flex; justify-content:center; flex-wrap:wrap; gap:6px; }

      /* Verdict badge */
      .dc-verdict {
        display:flex; align-items:center; gap:10px;
        padding:10px 16px; border-radius:10px;
        font:700 13px ui-sans-serif,system-ui;
        border:2px solid transparent;
        transition:background .35s, border-color .35s, color .35s;
        min-width:0; width:100%; box-sizing:border-box;
      }
      .dc-verdict.ident  { background:color-mix(in srgb,var(--pos) 12%,transparent); border-color:var(--pos); color:var(--pos); }
      .dc-verdict.notident{ background:color-mix(in srgb,var(--neg) 12%,transparent); border-color:var(--neg); color:var(--neg); }
      .dc-verdict-icon { font-size:22px; flex-shrink:0; }
      .dc-verdict-text { line-height:1.35; }
      .dc-verdict-sub  { font-weight:400; font-size:11px; opacity:.8; margin-top:2px; }

      /* Formula pill */
      .dc-formula {
        background:var(--surface2,#f4f4f4);
        border-radius:8px; padding:8px 14px;
        font:600 13px ui-monospace,monospace;
        color:var(--ink); border:1px solid var(--faint,#ddd);
        line-height:1.6; margin-top:4px;
        transition:opacity .3s;
      }
      .dc-formula.hidden { opacity:0; }

      /* Derivation */
      .dc-deriv       { display:flex; flex-direction:column; gap:4px; }
      .dc-step        { display:flex; gap:10px; align-items:flex-start; padding:7px 10px; border-radius:8px;
                        border:1px solid transparent; transition:background .25s,border-color .25s; }
      .dc-step.active { background:color-mix(in srgb,var(--accent) 12%,transparent); border-color:var(--accent); }
      .dc-step-num    { font:700 11px ui-sans-serif,system-ui; color:var(--dim); min-width:22px; padding-top:2px; }
      .dc-step-q      { font:600 12px ui-monospace,monospace; color:var(--ink); line-height:1.5; }
      .dc-step-note   { font:11px ui-sans-serif,system-ui; color:var(--dim); line-height:1.4; margin-top:2px; }
      .dc-step-rule   { display:inline-flex; align-items:center; gap:4px; margin-top:3px;
                        padding:2px 8px; border-radius:20px; font:700 10px ui-sans-serif,system-ui;
                        background:var(--accent); color:#fff; }

      /* Rules checklist */
      .dc-rules       { display:flex; flex-direction:column; gap:6px; }
      .dc-rule        { display:flex; gap:8px; align-items:flex-start; padding:6px 10px; border-radius:8px;
                        border:1px solid var(--faint,#ddd); transition:background .25s, border-color .25s, opacity .25s; }
      .dc-rule.lit    { background:color-mix(in srgb,var(--accent) 15%,transparent); border-color:var(--accent); }
      .dc-rule.dim    { opacity:.35; }
      .dc-rule-badge  { font:700 11px ui-sans-serif,system-ui; color:var(--accent); min-width:18px; padding-top:1px; }
      .dc-rule-short  { font:600 11px ui-sans-serif,system-ui; color:var(--ink); line-height:1.35; }
      .dc-rule-detail { font:11px ui-sans-serif,system-ui; color:var(--dim); margin-top:2px; line-height:1.4; }

      /* Surgery animation overlay */
      .dc-surgery-msg {
        position:absolute; top:8px; left:50%; transform:translateX(-50%);
        background:color-mix(in srgb,var(--accent) 90%,transparent);
        color:#fff; padding:5px 14px; border-radius:20px;
        font:700 12px ui-sans-serif,system-ui;
        pointer-events:none; opacity:0; transition:opacity .3s;
        white-space:nowrap; z-index:10;
      }
      .dc-surgery-msg.show { opacity:1; }

      /* Effect readout */
      .dc-effect-row  { display:flex; gap:8px; flex-wrap:wrap; }

      /* Collider warning */
      .dc-collider-warn {
        padding:8px 12px; border-radius:8px;
        background:color-mix(in srgb,var(--neg) 10%,transparent);
        border:1px solid var(--neg);
        font:12px ui-sans-serif,system-ui; color:var(--neg); line-height:1.45;
        margin-top:6px; display:none;
      }
      .dc-collider-warn.show { display:block; }

      /* Derivation step buttons */
      .dc-step-btns   { display:flex; gap:6px; margin-top:4px; }

      /* latent node style */
      .node.latent .node-disc { stroke-dasharray: 5 4; stroke:var(--dim); fill:var(--surface); opacity:.65; }
      .node.latent .node-label { fill:var(--dim); opacity:.75; }
      .node.latent .node-sub   { fill:var(--dim); opacity:.6; }
    `;
    document.head.appendChild(sty);
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "do-Calculus & Identification",
    idea: "The do-calculus (Pearl 1995) gives three rewrite rules that either reduce P(Y | do(X)) to an observable formula or prove no such formula exists. Pick a graph from the gallery: backdoor and front-door are identifiable; the bow arc is NOT — no amount of observational data suffices. For the 401(k) graphs the formula is computed from real data.",
  });
  root.appendChild(layout);

  // ── State ──────────────────────────────────────────────────────────────────
  let currentId = "backdoor";
  let stepIdx   = 0;   // active derivation step
  let surgeryOn = false;
  let view      = null;

  // ── Stage elements ─────────────────────────────────────────────────────────
  const surgeryMsg = h("div", { class: "dc-surgery-msg", text: "Graph surgery: arrows into X cut" });
  stage.style.position = "relative";

  const dagWrap = h("div", { style: { position: "relative" } }, [surgeryMsg]);
  stage.classList.add("dc-stage");

  // Gallery selector
  const galSeg = segmented({
    options: GRAPHS.map((g) => ({ label: g.label, value: g.id })),
    value: currentId,
    onSelect: (id) => { currentId = id; stepIdx = 0; surgeryOn = false; rebuild(); },
  });
  const galRow = h("div", { class: "dc-seg-row" }, [galSeg]);

  stage.append(galRow, dagWrap);

  // ── Panel elements ─────────────────────────────────────────────────────────
  const badge = dataBadge(meta);

  // Verdict
  const verdictIcon = h("div", { class: "dc-verdict-icon" });
  const verdictText = h("div", { class: "dc-verdict-text" });
  const verdictEl   = h("div", { class: "dc-verdict" }, [verdictIcon, verdictText]);

  // Formula
  const formulaEl = h("div", { class: "dc-formula" });

  // Effect readout
  const rEffect = readout({ label: "Identified effect (real data)", value: "—", accent: "var(--pos)" });
  const rNaive  = readout({ label: "Naive assoc. (confounded)",     value: "—", accent: "var(--neg)" });
  const effectRow = h("div", { class: "dc-effect-row" }, [rEffect, rNaive]);

  // Rules checklist
  const ruleEls = RULES.map((r) => {
    const badge2  = h("div", { class: "dc-rule-badge", text: r.num });
    const short   = h("div", { class: "dc-rule-short", text: r.short });
    const detail  = h("div", { class: "dc-rule-detail", text: r.detail });
    const el = h("div", { class: "dc-rule" }, [badge2, h("div", {}, [short, detail])]);
    el._ruleNum = r.num;
    return el;
  });
  const rulesBox = h("div", { class: "dc-rules" }, ruleEls);

  // Derivation panel
  const derivEl  = h("div", { class: "dc-deriv" });
  const btnPrev  = button("← prev", () => { stepIdx = Math.max(0, stepIdx - 1); updateDerivation(); }, {});
  const btnNext  = button("next →", () => { stepIdx = Math.min(currentGraph().derivation.length - 1, stepIdx + 1); updateDerivation(); }, { primary: true });
  const stepBtns = h("div", { class: "dc-step-btns" }, [btnPrev, btnNext]);

  // Surgery button
  const btnSurgery = button("✂ Graph surgery (do(X))", () => {
    surgeryOn = !surgeryOn;
    btnSurgery.textContent = surgeryOn ? "↩ Restore graph" : "✂ Graph surgery (do(X))";
    applySurgery();
  }, { primary: false });

  // Collider warning (M-bias)
  const colliderWarn = h("div", { class: "dc-collider-warn",
    html: "<strong>Collider trap:</strong> Conditioning on B opens the path U₁→B←U₂, creating a spurious association between U₁ (which affects X) and U₂ (which affects Y). The adjustment <em>induces</em> bias." });

  // Challenge
  const chal = challenge({
    goal: "Find which graphs are identifiable and recover the 401(k) effect for both the backdoor and front-door graphs. Identify the bow arc — the graph where no do-calculus rule applies and no amount of observational data can identify the effect.",
  });
  let chalDone = false;
  const solvedSet = new Set();

  // Springs for effect animation
  const spEff   = new Spring(0, { stiffness: 50, damping: 13 });
  const spNaive = new Spring(EST_NAIVE, { stiffness: 50, damping: 13 });

  panel.append(
    badge,
    panelSection("Identification verdict", [verdictEl, formulaEl]),
    panelSection("Computed effect", [effectRow]),
    panelSection("Step-through derivation", [derivEl, stepBtns]),
    panelSection("Three rules of do-calculus", [rulesBox]),
    panelSection("", [btnSurgery, colliderWarn]),
    panelSection("Challenge", [chal]),
  );

  // ── Helpers ────────────────────────────────────────────────────────────────
  function currentGraph() { return GRAPHS.find((g) => g.id === currentId); }

  function rebuild() {
    const g = currentGraph();

    // Destroy old view
    if (view) { view.destroy(); view = null; }

    // Build DAG
    const dag = new DAG(
      g.nodes.map((n) => ({ ...n })),
      g.edges.map((e) => ({ ...e })),
    );

    view = new DAGView(dag, {
      width: 560, height: 310,
      conditionable: g.id === "mbias", // only M-bias lets you condition
      draggableNodes: true,
      onChange: () => {
        if (g.id === "mbias") updateColliderWarn();
      },
    });

    // Style latent nodes after render
    styleLatent(g, view);

    clear(dagWrap);
    dagWrap.append(surgeryMsg, view.svg);

    // Set causal flow
    if (g.id === "backdoor" || g.id === "frontdoor") {
      view.setFlow([{ from: "X", to: "Y" }]);
    } else if (g.id === "bowarc") {
      view.setFlow([{ from: "X", to: "Y" }]);
    } else if (g.id === "instrument") {
      view.setFlow([{ from: "Z", to: "Y" }]);
    }

    // Verdict
    if (g.identifiable) {
      verdictEl.className = "dc-verdict ident";
      verdictIcon.textContent = "✓";
      verdictText.innerHTML = `<div>${g.verdictText}</div>`;
      formulaEl.innerHTML = g.formula || "";
      formulaEl.style.display = "block";
    } else {
      verdictEl.className = "dc-verdict notident";
      verdictIcon.textContent = "✗";
      verdictText.innerHTML = `<div>${g.verdictText}</div><div class="dc-verdict-sub">${g.whyNot}</div>`;
      formulaEl.style.display = "none";
    }

    // Effect readout
    if (g.computedEffect) {
      const eff = g.computedEffect();
      spEff.snap(eff);
      rEffect.set((eff >= 0 ? "+" : "") + eff.toFixed(2) + "k", g.dataLabel);
      rNaive.set((EST_NAIVE >= 0 ? "+" : "") + EST_NAIVE.toFixed(2) + "k", "assoc. e401k→nettfa");
      effectRow.style.display = "flex";
      // Mark challenge progress
      solvedSet.add(g.id);
    } else {
      rEffect.set("n/a", "not identifiable from data");
      rNaive.set("—", "");
      effectRow.style.display = g.id === "bowarc" || g.id === "instrument" ? "flex" : "none";
    }

    // Surgery off on new graph
    surgeryOn = false;
    btnSurgery.textContent = "✂ Graph surgery (do(X))";
    surgeryMsg.classList.remove("show");

    // Collider warn
    colliderWarn.classList.toggle("show", g.id === "mbias");

    updateDerivation();
    updateChallenge();
  }

  function styleLatent(g, v) {
    // Apply latent class to SVG node groups for dashed/dim rendering
    const latentIds = new Set(g.nodes.filter((n) => n.latent).map((n) => n.id));
    if (latentIds.size === 0) return;
    // Walk the rendered node groups
    const nodeGs = v.svg.querySelectorAll(".node");
    for (const g of nodeGs) {
      const lbl = g.querySelector(".node-label");
      if (!lbl) continue;
      // match by label text against latentIds
      if (latentIds.has(lbl.textContent) || [...latentIds].some((id) => {
        const nd = v.dag.node(id);
        return nd && (nd.label === lbl.textContent || id === lbl.textContent);
      })) {
        g.classList.add("latent");
      }
    }
    // Also dim latent edges (dashed)
    const edgePaths = v.svg.querySelectorAll(".edge");
    for (const ep of edgePaths) {
      if (ep.getAttribute("stroke-dasharray")) {
        ep.style.opacity = "0.55";
      }
    }
  }

  function updateDerivation() {
    const g = currentGraph();
    clear(derivEl);
    const steps = g.derivation;
    const rulesUsed = new Set(steps.map((s) => s.rule).filter(Boolean));

    steps.forEach((st, i) => {
      const active = i === stepIdx;
      const stepNum = h("div", { class: "dc-step-num", text: (i + 1) + "." });
      const qDiv    = h("div", {}, [
        h("div", { class: "dc-step-q", html: st.query }),
        h("div", { class: "dc-step-note", text: st.note }),
        st.rule ? h("span", { class: "dc-step-rule", text: "Rule " + st.rule }) : null,
      ]);
      const stepEl = h("div", { class: "dc-step" + (active ? " active" : "") }, [stepNum, qDiv]);
      stepEl.style.cursor = "pointer";
      stepEl.addEventListener("click", () => { stepIdx = i; updateDerivation(); });
      derivEl.appendChild(stepEl);
    });

    // Update rules highlight
    const activeRule = steps[stepIdx]?.rule;
    for (const rel of ruleEls) {
      rel.classList.toggle("lit", rel._ruleNum === activeRule);
      rel.classList.toggle("dim", rulesUsed.size > 0 && !rulesUsed.has(rel._ruleNum) && rel._ruleNum !== activeRule);
    }

    btnPrev.disabled = stepIdx === 0;
    btnNext.disabled = stepIdx === steps.length - 1;
  }

  function applySurgery() {
    if (!view) return;
    surgeryMsg.classList.toggle("show", surgeryOn);

    // In do-calculus graph surgery: cut all edges INTO X
    const dag = view.dag;
    for (const e of dag.edges) {
      if (e.to === "X") {
        e._origOpacity = e._origOpacity || "1";
        e._hiddenBySurgery = surgeryOn;
      }
    }
    // Re-render and then dim the cut edges
    view.render();
    if (surgeryOn) styleLatent(currentGraph(), view);

    // Dim cut edges visually
    const edgePaths = view.svg.querySelectorAll(".edge");
    let i = 0;
    for (const e of dag.edges) {
      const ep = edgePaths[i];
      if (ep && e._hiddenBySurgery) {
        ep.style.opacity = "0.1";
        ep.style.strokeDasharray = "3 5";
      }
      i++;
    }
  }

  function updateColliderWarn() {
    if (currentId !== "mbias" || !view) return;
    const hasB = view.Z.has("B");
    colliderWarn.classList.toggle("show", hasB);
  }

  function updateChallenge() {
    if (chalDone) return;
    // Require: visited both identifiable real-data graphs + bow arc
    const hasBackdoor  = solvedSet.has("backdoor");
    const hasFrontdoor = solvedSet.has("frontdoor");
    const hasBow       = solvedSet.has("bowarc");
    if (hasBackdoor && hasFrontdoor && hasBow) {
      chalDone = true;
      const bd = EST_BD.toFixed(2);
      const fd = EST_FD.toFixed(2);
      chal.setState(true,
        `Backdoor: +${bd}k · Front-door: +${fd}k · Bow arc: not identified. ` +
        `Instrument and M-bias explored.`);
    }
  }

  // ── onFrame animation ──────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    spEff.step(dt);
    spNaive.step(dt);
    // No per-frame readout update needed — values are set on rebuild.
  });

  // ── Caption ────────────────────────────────────────────────────────────────
  caption.innerHTML =
    "<strong>Three rules of do-calculus (Pearl 1995):</strong> " +
    "<em>Rule 1</em> — insert/delete observations W when Y⊥W|X,Z in G<sub>X̄</sub>. " +
    "<em>Rule 2</em> — exchange action do(Z) for observation Z when Y⊥Z|X,W in G<sub>X̄Z̄</sub>. " +
    "<em>Rule 3</em> — insert/delete actions do(Z) when Y⊥Z|X,W in G<sub>X̄Z(W)</sub>. " +
    "The do-calculus is <em>complete</em>: every identifiable query has a proof via these three rules, " +
    "and every non-identifiable query is witnessed by the <em>hedge</em> criterion — " +
    "a subgraph structure for which no rule applies and P(Y | do(X)) cannot be expressed " +
    "in terms of the observed distribution alone. " +
    "In the gallery: <strong>backdoor</strong> and <strong>front-door</strong> are identifiable; " +
    "the <strong>bow arc</strong> (X→Y with a latent U confounding both) is <em>not</em> identifiable — " +
    "no observational data of any size can separate cause from confounding in that graph. " +
    "Data: Poterba, Venti &amp; Wise (1994) 401(k) subsidy study. " +
    "References: Pearl (1995) — do-calculus; Tian &amp; Pearl (2002) — c-components; " +
    "Shpitser &amp; Pearl (2006) — ID algorithm completeness.";

  // ── Initial build ──────────────────────────────────────────────────────────
  rebuild();

  return () => { stop(); if (view) view.destroy(); };
}
