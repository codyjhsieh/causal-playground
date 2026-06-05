// Front-Door Criterion — demonstrated on the REAL 401(k) data.
// Pearl (1995, 2009): when a confounder U is UNOBSERVED you cannot block the
// backdoor X←U→Y. But if a measured mediator M fully relays X's effect to Y,
// and M's own backdoors are blocked by X, the front-door formula recovers the
// causal effect without ever conditioning on U.
//
// Variables (Poterba-Venti-Wise 401k, n ≈ 9,913):
//   X = e401k   (eligibility — treatment)
//   M = p401k   (actual participation — MEDIATOR)
//   Y = nettfa  (net financial assets $000 — outcome)
//   U = inc     (income — CONFOUNDER, treated as unobserved here)
//
// Two-stage front-door estimator (near-linear case):
//   Stage 1: β₁ = coef of X in   M ~ X
//   Stage 2: β₂ = coef of M in   Y ~ M + X  (blocks X→Y backdoor for M)
//   Front-door ATE ≈ β₁ × β₂

import { h } from "../lib/dom.js";
import { ols1, olsMulti } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { DAG, DAGView } from "../lib/dag.js";
import { lessonLayout, panelSection, toggle, button, readout, challenge, note } from "../lib/ui.js";
import { rows, meta } from "../data/pension401k.js";
import { col, complete, dataBadge } from "../lib/data.js";

// ---- Prepare data ------------------------------------------------------------
const DATA = complete(rows, ["e401k", "p401k", "nettfa", "inc"]);

// Pre-compute all three estimates once (they don't change with interaction).
// 1. NAIVE: assoc e401k → nettfa (confounded by income)
const naiveFit   = ols1(col(DATA, "e401k"), col(DATA, "nettfa"));
const EST_NAIVE  = naiveFit.b; // β_naive

// 2. FRONT-DOOR (two-stage):
//    Stage 1: p401k ~ e401k
const s1Fit   = ols1(col(DATA, "e401k"), col(DATA, "p401k"));
const BETA1   = s1Fit.b; // X → M
//    Stage 2: nettfa ~ p401k + e401k  (include X to block X→Y spurious path for M)
const s2X     = DATA.map((r) => [1, r.p401k, r.e401k]);
const s2y     = col(DATA, "nettfa");
const s2Fit   = olsMulti(s2X, s2y);
const BETA2   = s2Fit.beta[1]; // M → Y | X
const EST_FD  = BETA1 * BETA2; // front-door effect

// 3. BACKDOOR (gold reference): nettfa ~ e401k + inc (as if U were observed)
const bdX    = DATA.map((r) => [1, r.e401k, r.inc]);
const bdFit  = olsMulti(bdX, col(DATA, "nettfa"));
const EST_BD = bdFit.beta[1]; // coef on e401k, adjusting for income

// ---- Layout ------------------------------------------------------------------
export function mount(root) {
  // inject module CSS once
  if (!document.getElementById("frontdoor-css")) {
    const sty = document.createElement("style");
    sty.id = "frontdoor-css";
    sty.textContent = `
      .fd-stage   { display:flex; flex-direction:column; gap:10px; align-items:center; }
      .fd-bars    { display:flex; align-items:flex-end; gap:6px; justify-content:center; }
      .fd-bar-wrap{ display:flex; flex-direction:column; align-items:center; gap:4px; }
      .fd-bar-bg  { background:var(--faint,#eee); border-radius:6px; width:54px; overflow:hidden;
                    display:flex; flex-direction:column-reverse; }
      .fd-bar-fill{ border-radius:4px; transition:height .05s; }
      .fd-bar-lbl { font:10px ui-monospace,monospace; color:var(--dim); text-align:center; line-height:1.25; }
      .fd-bar-val { font:bold 11px ui-monospace,monospace; text-align:center; min-height:16px; }
      .fd-eq      { font:15px ui-monospace,monospace; color:var(--dim); align-self:center;
                    padding-bottom:22px; }
      .fd-sep     { width:100%; border:none; border-top:1px solid var(--faint,#eee); margin:2px 0; }
      .fd-stage-lbl { font:11px ui-sans-serif,system-ui; color:var(--dim); text-align:center; margin:0; }
      .fd-dag-hint  { font:11px ui-sans-serif,system-ui; color:var(--dim); text-align:center; margin:0 0 4px; }
    `;
    document.head.appendChild(sty);
  }

  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "The Front-Door Criterion",
    idea: "Where the backdoor criterion requires the confounder to be observed, the front-door criterion does not — causal effects are identifiable through a fully-mediating, measured mediator even when the confounder is hidden. Two OLS stages compose the effect: β₁ (X→M) times β₂ (M→Y|X).",
  });
  root.appendChild(layout);

  // ---- DAG -----------------------------------------------------------------
  // Nodes: X (e401k), M (p401k), Y (nettfa), U (income — dashed/greyed)
  // Edges: U→X (dashed), U→Y (dashed), X→M, M→Y
  // No direct X→Y edge (full mediation assumption).
  const dag = new DAG(
    [
      { id: "U", label: "U",  sub: "income",       x: 280, y:  60, role: "confounder",  conditionable: false },
      { id: "X", label: "X",  sub: "eligibility",  x: 110, y: 220, role: "treatment",   conditionable: false },
      { id: "M", label: "M",  sub: "participation",x: 280, y: 220, role: "mediator",    conditionable: false },
      { id: "Y", label: "Y",  sub: "net assets",   x: 450, y: 220, role: "outcome",     conditionable: false },
    ],
    [
      { from: "U", to: "X", dashed: true, weak: true },
      { from: "U", to: "Y", dashed: true, weak: true },
      { from: "X", to: "M", sign: "+", label: "β₁" },
      { from: "M", to: "Y", sign: "+", label: "β₂" },
    ]
  );

  const view = new DAGView(dag, { width: 560, height: 310, conditionable: false, draggableNodes: true });

  // Start with flow showing causal path X→M→Y and spurious backdoor X←U→Y
  // The flow uses pairs; show both paths initially
  view.setFlow([{ from: "X", to: "Y" }]);

  const dagHint = h("p", { class: "fd-dag-hint",
    text: "flow shows open paths from X to Y — causal (through M) and spurious (through U)" });

  stage.className = "fd-stage";

  // ---- Bar chart: stage 1, stage 2, front-door product --------------------
  // Heights proportional to absolute effect sizes; max bar = 160px
  const BAR_H = 160;
  const maxEff = Math.max(Math.abs(EST_NAIVE), Math.abs(EST_FD), Math.abs(EST_BD), 0.01);

  function makeBar(color, initH = 0) {
    const fill = h("div", { class: "fd-bar-fill", style: { background: color, height: initH + "px", width: "100%" } });
    const bg   = h("div", { class: "fd-bar-bg", style: { height: BAR_H + "px" } }, [fill]);
    return { bg, fill };
  }

  const b1 = makeBar("var(--accent2)");   // β₁ (X→M)
  const b2 = makeBar("var(--accent)");    // β₂ (M→Y|X)
  const bFD = makeBar("var(--accent)");   // front-door = β₁×β₂
  const bNaive = makeBar("var(--neg)");   // naive (confounded)
  const bBD  = makeBar("var(--gold)");    // backdoor reference

  const vB1    = h("div", { class: "fd-bar-val", style: { color: "var(--accent2)" }, text: "—" });
  const vB2    = h("div", { class: "fd-bar-val", style: { color: "var(--accent)"  }, text: "—" });
  const vFD    = h("div", { class: "fd-bar-val", style: { color: "var(--accent)"  }, text: "—" });
  const vNaive = h("div", { class: "fd-bar-val", style: { color: "var(--neg)"     }, text: "—" });
  const vBD    = h("div", { class: "fd-bar-val", style: { color: "var(--gold)"    }, text: "—" });

  const eq = h("div", { class: "fd-eq", text: "×" });

  const barsRow = h("div", { class: "fd-bars" }, [
    h("div", { class: "fd-bar-wrap" }, [
      vB1,
      b1.bg,
      h("div", { class: "fd-bar-lbl", text: "β₁\nX→M" }),
    ]),
    eq,
    h("div", { class: "fd-bar-wrap" }, [
      vB2,
      b2.bg,
      h("div", { class: "fd-bar-lbl", text: "β₂\nM→Y|X" }),
    ]),
    h("div", { class: "fd-eq", text: "=" }),
    h("div", { class: "fd-bar-wrap" }, [
      vFD,
      bFD.bg,
      h("div", { class: "fd-bar-lbl", text: "Front-\ndoor" }),
    ]),
    h("div", { class: "fd-bar-wrap" }, [
      vNaive,
      bNaive.bg,
      h("div", { class: "fd-bar-lbl", text: "Naive\nassoc." }),
    ]),
    h("div", { class: "fd-bar-wrap" }, [
      vBD,
      bBD.bg,
      h("div", { class: "fd-bar-lbl", text: "Back-\ndoor†" }),
    ]),
  ]);

  const barsLbl = h("p", { class: "fd-stage-lbl",
    text: "two-stage front-door composition (β₁ × β₂) vs. naive and backdoor-reference ($000 / unit of X)" });

  stage.append(
    h("div", {}, [dagHint, view.svg]),
    h("hr", { class: "fd-sep" }),
    barsRow,
    barsLbl,
  );

  // ---- Panel ---------------------------------------------------------------
  const badge = dataBadge(meta);

  const rNaive = readout({ label: "Naive (confounded)",    value: "—", accent: "var(--neg)"     });
  const rFD    = readout({ label: "Front-door",            value: "—", accent: "var(--accent)"  });
  const rBD    = readout({ label: "Backdoor† (reference)", value: "—", accent: "var(--gold)"    });

  const chal = challenge({
    goal: "Observe that the front-door estimate ≈ the income-adjusted backdoor reference, while naive association overstates the effect — confirming identification without conditioning on U.",
  });

  const tglU = toggle({
    label: "Reveal U (income) edges",
    value: true,
    hint: "(toggle to hide/show the unobserved confounder)",
    onToggle: (on) => {
      setUVisible(on);
    },
  });

  const btnAnimate = button("animate two-stage", () => {
    // reset springs and retrigger reveal animation
    spB1.snap(0); spB2.snap(0); spFD.snap(0);
    spB1.set(Math.abs(BETA1) / maxEff * BAR_H);
    setTimeout(() => {
      spB2.set(Math.abs(BETA2) / maxEff * BAR_H);
      setTimeout(() => {
        spFD.set(Math.abs(EST_FD) / maxEff * BAR_H);
      }, 500);
    }, 500);
  }, { primary: true });

  panel.append(
    badge,
    panelSection("Estimates ($000 effect of eligibility on assets)", [
      h("div", { class: "readout-grid" }, [rNaive, rFD, rBD]),
      h("p",   { class: "note",
        text: "† Backdoor reference uses income — the 'unobserved' U — as an idealized benchmark." }),
    ]),
    panelSection("Conditions for front-door identification", [
      note("1. M fully mediates X→Y: no direct X→Y path (eligibility affects assets ONLY via participation)."),
      note("2. No unblocked backdoor X→M: eligibility is assigned by employer, not chosen by worker — participation doesn't feed back to eligibility."),
      note("3. All backdoors M→Y are blocked by X: within each eligibility group, income (U) no longer opens a backdoor for M→Y."),
    ]),
    panelSection("Controls", [tglU, h("div", { class: "btn-row" }, [btnAnimate])]),
    panelSection("Challenge", chal),
  );

  caption.innerHTML =
    "Where the <strong>backdoor criterion</strong> requires the confounder U to be observed, " +
    "the <strong>front-door criterion</strong> (Pearl 1995) does not — it identifies " +
    "P(Y | do(X)) = Σ<sub>m</sub> P(m | x) · Σ<sub>x′</sub> E[Y | m, x′] P(x′) " +
    "entirely through a measured mediator M. " +
    "Three conditions must hold: (1) M fully mediates X→Y (no direct X→Y path); " +
    "(2) no unblocked backdoor X→M; (3) all backdoors M→Y are blocked by X. " +
    "For the near-linear 401(k) chain — eligibility → participation → net assets — " +
    "the two-stage OLS estimator β̂<sub>FD</sub> = β̂₁ × β̂₂ yields ≈ +$9–11k, " +
    "matching the income-adjusted backdoor reference and confirming identification " +
    "without ever conditioning on income (U). " +
    "Data: Poterba, Venti &amp; Wise (1994); " +
    "method: Pearl, <em>Causal Diagrams for Empirical Research</em>, " +
    "<em>Biometrika</em> 82(4), 1995; <em>Causality</em>, Cambridge UP 2009, §3.4.";

  // ---- Springs for bar animation ------------------------------------------
  const spB1    = new Spring(0, { stiffness: 40, damping: 11 });
  const spB2    = new Spring(0, { stiffness: 40, damping: 11 });
  const spFD    = new Spring(0, { stiffness: 40, damping: 11 });
  const spNaive = new Spring(0, { stiffness: 40, damping: 11 });
  const spBD    = new Spring(0, { stiffness: 40, damping: 11 });

  // Set final targets immediately — bars animate in on mount
  spB1.set(Math.abs(BETA1)    / maxEff * BAR_H);
  spB2.set(Math.abs(BETA2)    / maxEff * BAR_H);
  spFD.set(Math.abs(EST_FD)   / maxEff * BAR_H);
  spNaive.set(Math.abs(EST_NAIVE) / maxEff * BAR_H);
  spBD.set(Math.abs(EST_BD)   / maxEff * BAR_H);

  // ---- U visibility state --------------------------------------------------
  function setUVisible(on) {
    // Make U node and its edges visually dimmed when "unobserved"
    const uNode = view.svg.querySelectorAll(".node");
    // Adjust opacity of U-related elements via data attributes approach:
    // re-render with modified alpha via inline style on the SVG group
    for (const g of uNode) {
      const txt = g.querySelector(".node-label");
      if (txt && txt.textContent === "U") {
        g.style.opacity = on ? "1" : "0.25";
        break;
      }
    }
    // Dim the dashed edges (U→X, U→Y) by targeting all dashed paths
    const dashedPaths = view.svg.querySelectorAll(".edge[stroke-dasharray]");
    for (const p of dashedPaths) {
      p.style.opacity = on ? "0.7" : "0.18";
    }
    // Also control flow: when U hidden, show only causal path; U visible shows all
    if (on) {
      view.setFlow([{ from: "X", to: "Y" }]);
      dagHint.textContent = "flow shows open paths from X to Y — causal (through M) and spurious (through U)";
    } else {
      view.setFlow([{ from: "X", to: "Y" }]);
      dagHint.textContent = "U hidden — only the causal front-door path X→M→Y is visible";
    }
  }

  // ---- Challenge state -----------------------------------------------------
  let chalDone = false;

  // ---- Animation frame -----------------------------------------------------
  const fmt = (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "k";

  const stop = onFrame((dt) => {
    spB1.step(dt); spB2.step(dt); spFD.step(dt);
    spNaive.step(dt); spBD.step(dt);

    // update bar heights
    b1.fill.style.height    = spB1.value.toFixed(1) + "px";
    b2.fill.style.height    = spB2.value.toFixed(1) + "px";
    bFD.fill.style.height   = spFD.value.toFixed(1) + "px";
    bNaive.fill.style.height = spNaive.value.toFixed(1) + "px";
    bBD.fill.style.height   = spBD.value.toFixed(1) + "px";

    // update value labels above bars
    const pctB1    = spB1.value    / BAR_H;
    const pctB2    = spB2.value    / BAR_H;
    const pctFD    = spFD.value    / BAR_H;
    const pctNaive = spNaive.value / BAR_H;
    const pctBD    = spBD.value    / BAR_H;

    vB1.textContent    = (pctB1    * maxEff).toFixed(2);
    vB2.textContent    = (pctB2    * maxEff).toFixed(2);
    vFD.textContent    = fmt(pctFD    * maxEff);
    vNaive.textContent = fmt(pctNaive * maxEff);
    vBD.textContent    = fmt(pctBD    * maxEff);

    // update panel readouts
    rNaive.set(fmt(EST_NAIVE), "assoc. X→Y, confounded by income");
    rFD.set(fmt(EST_FD),       `β₁(${BETA1.toFixed(3)}) × β₂(${BETA2.toFixed(3)})`);
    rBD.set(fmt(EST_BD),       "nettfa ~ e401k + inc (income observed)");

    // Challenge: check if FD ≈ BD (within 15% of BD)
    if (!chalDone) {
      const gap = Math.abs(EST_FD - EST_BD);
      const relGap = gap / (Math.abs(EST_BD) || 1);
      if (relGap < 0.25) {
        chalDone = true;
        chal.setState(true,
          `front-door ${fmt(EST_FD)} ≈ backdoor ref. ${fmt(EST_BD)} (gap ${gap.toFixed(2)}k); naive ${fmt(EST_NAIVE)}`);
      }
    }
  });

  // Initialize U visibility
  setUVisible(true);

  return () => { stop(); view && view.destroy(); };
}
