// Bad Controls, Collider Bias & M-Bias — Card (1995) schooling & earnings.
//
// Card (1995) estimates the return to schooling on log wages. The treatment is
// educ (years of education); the outcome is lwage (log hourly wage). The true
// causal effect after blocking backdoor paths is approximately 0.07–0.10
// (log-wage points per year of schooling). Conditioning on the WRONG variables
// — colliders, mediators, or M-colliders — manufactures bias that moves the
// estimate away from this credible range.
//
// Control taxonomy demonstrated:
//   CONFOUNDER — a common cause of educ and lwage (fatheduc, motheduc, south,
//     black): should be in the adjustment set; omitting it biases the estimate.
//   MEDIATOR — a variable on the causal path educ → … → lwage (e.g. smsa:
//     educated workers sort into metros, and metro wages are higher; conditioning
//     removes part of the true effect — overcontrol bias).
//   COLLIDER — caused by BOTH educ AND lwage (constructed "prestige" index,
//     a linear combination of both with noise): conditioning opens a non-causal
//     path and introduces spurious correlation.
//   M-COLLIDER — a pre-treatment collider between a background variable (IQ
//     proxy) and a residual family factor, both affecting educ; innocent-looking
//     but conditioning induces M-bias.
//
// References: Cinelli, Forney & Pearl (2022) "A Crash Course in Good and Bad
// Controls"; Greenland (2003) "Quantifying Biases in Causal Models"; Card (1995).

import { h, clear } from "../lib/dom.js";
import { mean, std, olsMulti, clamp } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { DAG, DAGView } from "../lib/dag.js";
import { lessonLayout, panelSection, readout, challenge, button, note } from "../lib/ui.js";
import { rows as card, meta } from "../data/card.js";
import { col, complete, dataBadge } from "../lib/data.js";

// ── Inject module CSS ──────────────────────────────────────────────────────────
if (!document.getElementById("badcontrols-css")) {
  const style = document.createElement("style");
  style.id = "badcontrols-css";
  style.textContent = `
/* ── control cards ── */
.bc-cards { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
.bc-card {
  cursor: pointer; user-select: none;
  width: 130px; padding: 10px 12px; border-radius: 10px;
  border: 2px solid var(--faint); background: var(--surface);
  transition: border-color 0.18s, background 0.18s, transform 0.12s, box-shadow 0.18s;
  position: relative; overflow: hidden;
}
.bc-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.09); }
.bc-card.selected { border-color: var(--accent2); background: var(--glass); }
.bc-card.selected.bad  { border-color: var(--neg); }
.bc-card.selected.good { border-color: var(--pos); }
.bc-card-name { font: 600 12px/1.3 ui-monospace, monospace; color: var(--ink); }
.bc-card-kind {
  font: 500 10px/1.2 ui-sans-serif, system-ui, sans-serif;
  color: var(--dim); margin-top: 3px; text-transform: uppercase; letter-spacing: .04em;
}
.bc-card-reveal {
  font: 400 10.5px/1.4 ui-sans-serif, system-ui, sans-serif;
  color: var(--ink); margin-top: 6px; display: none;
  border-top: 1px solid var(--faint); padding-top: 6px;
}
.bc-card.revealed .bc-card-reveal { display: block; }
.bc-card.selected .bc-card-kind { font-weight: 700; }
.bc-card.selected.bad  .bc-card-kind { color: var(--neg); }
.bc-card.selected.good .bc-card-kind { color: var(--pos); }
.bc-card.selected.mediator .bc-card-kind { color: var(--gold); }

/* ── estimate number-line / gauge ── */
.bc-gauge-wrap { margin-top: 10px; position: relative; height: 36px; }
.bc-gauge-track {
  position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%);
  height: 6px; border-radius: 3px;
  background: linear-gradient(to right, var(--neg) 0%, var(--faint) 40%, var(--faint) 60%, var(--pos) 100%);
}
.bc-gauge-needle {
  position: absolute; top: 0; width: 3px; height: 36px;
  border-radius: 2px; background: var(--ink);
  transform: translateX(-50%); transition: left 0.05s;
  box-shadow: 0 1px 6px rgba(0,0,0,0.18);
}
.bc-gauge-credible {
  position: absolute; top: 5px; height: 26px; border-radius: 3px;
  background: rgba(76,208,160,0.18); border: 1.5px solid rgba(76,208,160,0.5);
  pointer-events: none;
}
.bc-gauge-labels {
  display: flex; justify-content: space-between;
  font: 400 9px/1 ui-monospace, monospace; color: var(--dim); margin-top: 2px;
}

/* ── bias-o-meter ── */
.bc-biasometer { margin-top: 12px; }
.bc-biasometer-label {
  font: 600 10px/1 ui-sans-serif, system-ui, sans-serif;
  color: var(--dim); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px;
}
.bc-biasometer-bar-bg {
  height: 8px; border-radius: 4px; background: var(--faint); position: relative; overflow: visible;
}
.bc-biasometer-bar {
  height: 100%; border-radius: 4px; transition: width 0.06s, background 0.2s;
  background: var(--pos);
}
.bc-biasometer-val {
  font: 700 11px/1 ui-monospace, monospace; color: var(--ink);
  margin-top: 4px; display: flex; justify-content: space-between;
}

/* ── score row ── */
.bc-score-row {
  display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 6px;
}
.bc-score-pill {
  font: 700 11px/1 ui-sans-serif, system-ui, sans-serif; padding: 3px 9px;
  border-radius: 20px; border: 1.5px solid var(--faint); color: var(--ink);
}

/* ── game overlay (quiz round) ── */
.bc-quiz-overlay {
  position: absolute; inset: 0; border-radius: 10px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; background: rgba(255,255,255,0.88); backdrop-filter: blur(2px);
  pointer-events: none; opacity: 0; transition: opacity 0.2s;
}
.bc-quiz-overlay.visible { opacity: 1; pointer-events: all; }
.bc-quiz-q { font: 700 11px/1.3 ui-sans-serif, sans-serif; color: var(--ink); text-align: center; }
.bc-quiz-btns { display: flex; gap: 6px; }
.bc-quiz-btn {
  font: 600 10px/1 ui-sans-serif, sans-serif; padding: 4px 10px;
  border-radius: 6px; border: 1.5px solid var(--faint); background: var(--surface);
  cursor: pointer; color: var(--ink);
}
.bc-quiz-btn:hover { border-color: var(--accent2); }
.bc-quiz-btn.correct { background: rgba(76,208,160,0.15); border-color: var(--pos); }
.bc-quiz-btn.wrong   { background: rgba(255,107,138,0.15); border-color: var(--neg); }

/* ── readout-grid override for 3 across ── */
.bc-readout-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 4px; }

/* ── DAG glow for node roles ── */
.bc-dag .node.role-confounder .node-disc { fill: rgba(76,208,160,0.12); stroke: var(--pos); stroke-width: 2; }
.bc-dag .node.role-mediator   .node-disc { fill: rgba(255,200,76,0.12); stroke: var(--gold); stroke-width: 2; }
.bc-dag .node.role-collider   .node-disc { fill: rgba(255,107,138,0.12); stroke: var(--neg); stroke-width: 2; }
.bc-dag .node.role-mcollider  .node-disc { fill: rgba(180,120,255,0.12); stroke: #b478ff; stroke-width: 2; }
.bc-dag .node.role-treatment  .node-disc { fill: rgba(100,149,237,0.15); stroke: var(--accent2); stroke-width: 2.5; }
.bc-dag .node.role-outcome    .node-disc { fill: rgba(255,165,0,0.10); stroke: var(--gold); stroke-width: 2.5; }
.bc-dag .node.conditioned.role-confounder .node-disc { fill: rgba(76,208,160,0.30); }
.bc-dag .node.conditioned.role-collider   .node-disc { fill: rgba(255,107,138,0.30); }
.bc-dag .node.conditioned.role-mediator   .node-disc { fill: rgba(255,200,76,0.30); }
.bc-dag .node.conditioned.role-mcollider  .node-disc { fill: rgba(180,120,255,0.30); }
`;
  document.head.appendChild(style);
}

// ── Data preparation ───────────────────────────────────────────────────────────
// Keep complete rows for the variables we need.
const NEED = ["lwage", "educ", "exper", "expersq", "black", "south", "smsa", "fatheduc", "motheduc"];
const DATA = complete(card, NEED);
const N = DATA.length;

// Construct derived variables:
//   prestige  — collider: f(educ, lwage, noise). A child of both treatment and
//               outcome; conditioning on it opens a spurious path.
//   iq_proxy  — instrument-ish IQ proxy (motheduc + fatheduc average, scaled),
//               represents a pre-treatment ability dimension NOT in the model.
//   fam_resid — residual family background orthogonal to iq_proxy; represents
//               a second background channel. Together iq_proxy and fam_resid
//               form an M-structure around educ.
//   smsa_job  — already in data (smsa = standard metropolitan statistical area
//               residence), treated here as a mediator: educ → smsa → lwage
//               because more educated workers sort into metro areas that pay more.

// Seeded cheap pseudo-random for reproducible noise (not Math.random so node --check is stable).
function seededNoise(seed, n) {
  const arr = new Float64Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    arr[i] = (s / 0xffffffff) * 2 - 1; // [-1, 1]
  }
  return arr;
}

const noise = seededNoise(42, N);

// z-score a column array
function zscoreArr(arr) {
  const m = mean(arr);
  const s = std(arr);
  return arr.map((v) => (v - m) / (s || 1));
}

const educZ  = zscoreArr(col(DATA, "educ"));
const lwageZ = zscoreArr(col(DATA, "lwage"));

// COLLIDER: prestige = 0.5*educ_z + 0.5*lwage_z + 0.3*noise  (caused by both)
const prestigeArr = DATA.map((_, i) => 0.5 * educZ[i] + 0.5 * lwageZ[i] + 0.3 * noise[i]);

// M-COLLIDER setup:
//   iq_proxy  ≈ (fatheduc + motheduc) / 2  — pre-treatment ability proxy
//   fam_bg    = family background (south + black as a rough socioeconomic index)
//   m_collider = 0.5*iq_proxy_z + 0.5*fam_bg_z + small_noise
//     — iq_proxy → m_collider ← fam_bg, and both iq_proxy and fam_bg affect educ.
//     Conditioning on m_collider induces spurious correlation between iq_proxy and
//     fam_bg, which flows into an educ → lwage estimate.
const iqProxyArr  = DATA.map((r) => (r.fatheduc + r.motheduc) / 2);
const famBgArr    = DATA.map((r) => r.black + (1 - r.south)); // proxy
const iqZ   = zscoreArr(iqProxyArr);
const famZ  = zscoreArr(famBgArr);
const noise2 = seededNoise(99, N);
const mColliderArr = DATA.map((_, i) => 0.5 * iqZ[i] + 0.5 * famZ[i] + 0.15 * noise2[i]);

// Attach constructed columns to rows copy
const ROWS = DATA.map((r, i) => ({
  ...r,
  prestige:   prestigeArr[i],
  m_collider: mColliderArr[i],
}));

// ── Credible benchmark ─────────────────────────────────────────────────────────
// OLS with true confounders only (fatheduc, motheduc, black, south):
// this is the "correct" adjustment set in this lesson context.
function computeEst(adjSet) {
  const keys = [...adjSet];
  const X = ROWS.map((r) => [1, r.educ, ...keys.map((k) => r[k])]);
  const y = col(ROWS, "lwage");
  const fit = olsMulti(X, y);
  return fit.beta[1]; // coefficient on educ
}

const CORRECT_SET = new Set(["fatheduc", "motheduc", "black", "south"]);
const BENCHMARK = computeEst(CORRECT_SET);   // ≈ 0.07–0.09
const BENCH_LO   = BENCHMARK - 0.015;
const BENCH_HI   = BENCHMARK + 0.015;

// ── Control card definitions ───────────────────────────────────────────────────
// kind: "confounder" | "mediator" | "collider" | "mcollider"
// good: whether including this control HELPS get close to the benchmark
const CONTROLS = [
  {
    id: "fatheduc",
    label: "fatheduc",
    kindLabel: "Confounder",
    kind: "confounder",
    good: true,
    dagRole: "confounder",
    reveal: "Father's education affects both how much schooling you get AND your wages (family human capital). Safe to condition on — blocks a backdoor path.",
  },
  {
    id: "motheduc",
    label: "motheduc",
    kindLabel: "Confounder",
    kind: "confounder",
    good: true,
    dagRole: "confounder",
    reveal: "Mother's education works the same way. Another backdoor: motheduc → educ and motheduc → lwage. Blocking it is essential.",
  },
  {
    id: "black",
    label: "black",
    kindLabel: "Confounder",
    kind: "confounder",
    good: true,
    dagRole: "confounder",
    reveal: "Race is a pre-treatment variable linked to both educational attainment and wages (via labor market discrimination). Include it to block this backdoor.",
  },
  {
    id: "south",
    label: "south",
    kindLabel: "Confounder",
    kind: "confounder",
    good: true,
    dagRole: "confounder",
    reveal: "Region (South) is a pre-treatment variable affecting both schooling supply and local wage levels. Block the region backdoor by conditioning.",
  },
  {
    id: "smsa",
    label: "smsa",
    kindLabel: "Mediator",
    kind: "mediator",
    good: false,
    dagRole: "mediator",
    reveal: "Metro residence (smsa) is DOWNSTREAM of education — educated workers sort into cities that pay more. Conditioning on smsa removes the location premium that is part of education's effect. Overcontrol bias: estimate shrinks.",
  },
  {
    id: "prestige",
    label: "prestige",
    kindLabel: "Collider",
    kind: "collider",
    good: false,
    dagRole: "collider",
    reveal: "Occupational prestige is caused by BOTH education AND wages. It is a collider on a path educ → prestige ← lwage. Conditioning OPENS that non-causal path, introducing spurious correlation. Estimate becomes inflated.",
  },
  {
    id: "m_collider",
    label: "iq×fam",
    kindLabel: "M-Collider",
    kind: "mcollider",
    good: false,
    dagRole: "mcollider",
    reveal: "This index blends IQ proxy and family background — two independent background factors that both feed into education but not each other. Conditioning on their child opens the M-bias path, leaking their spurious association into the educ→lwage estimate.",
  },
];

// ── DAG layout ─────────────────────────────────────────────────────────────────
const DAG_NODES = [
  { id: "educ",       label: "educ",     sub: "schooling",    x: 130, y: 210, role: "treatment",  conditionable: false },
  { id: "lwage",      label: "lwage",    sub: "log wage",     x: 500, y: 210, role: "outcome",    conditionable: false },
  // confounders (arching above)
  { id: "fatheduc",   label: "fathed",   sub: "father educ",  x:  90, y:  70, role: "confounder", conditionable: true },
  { id: "motheduc",   label: "mothed",   sub: "mother educ",  x: 220, y:  40, role: "confounder", conditionable: true },
  { id: "black",      label: "black",    sub: "race",         x: 360, y:  60, role: "confounder", conditionable: true },
  { id: "south",      label: "south",    sub: "region",       x: 490, y:  80, role: "confounder", conditionable: true },
  // mediator (below the main edge, on the path)
  { id: "smsa",       label: "smsa",     sub: "metro (med.)", x: 315, y: 290, role: "mediator",   conditionable: true },
  // collider (below, child of both)
  { id: "prestige",   label: "prestige", sub: "collider ⚠",  x: 315, y: 370, role: "collider",   conditionable: true },
  // M-collider (top-left pre-treatment)
  { id: "m_collider", label: "iq×fam",   sub: "M-collider ⚠", x: 130, y: 370, role: "mcollider",  conditionable: true },
];

const DAG_EDGES = [
  // causal edge of interest
  { from: "educ",     to: "lwage",    sign: "+", label: "β=?" },
  // confounder backdoors
  { from: "fatheduc", to: "educ",     sign: "+" },
  { from: "fatheduc", to: "lwage",    sign: "+", weak: true },
  { from: "motheduc", to: "educ",     sign: "+" },
  { from: "motheduc", to: "lwage",    sign: "+", weak: true },
  { from: "black",    to: "educ",     sign: "-", weak: true },
  { from: "black",    to: "lwage",    sign: "-" },
  { from: "south",    to: "educ",     sign: "-", weak: true },
  { from: "south",    to: "lwage",    sign: "-" },
  // mediator path
  { from: "educ",     to: "smsa",     sign: "+" },
  { from: "smsa",     to: "lwage",    sign: "+" },
  // collider paths (both point INTO prestige)
  { from: "educ",     to: "prestige", sign: "+", dashed: true },
  { from: "lwage",    to: "prestige", sign: "+", dashed: true },
  // M-structure: iq_proxy → m_collider ← fam_bg → educ  (implicit iq→educ also)
  { from: "fatheduc", to: "m_collider", sign: "+", dashed: true, weak: true },
  { from: "south",    to: "m_collider", sign: "+", dashed: true, weak: true },
];

// ── Module export ──────────────────────────────────────────────────────────────
export function mount(root) {
  // ---------- state ----------
  const selected = new Set();        // which control ids are toggled ON
  const revealed = new Set();        // which cards show their explanation
  let score = 0;
  let quizActive = false;

  // ---------- layout ----------
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Bad Controls & Collider Bias",
    idea: "More controls is NOT always better. Toggle variables into your adjustment set and watch the return-to-schooling estimate shift. Colliders and mediators manufacture bias — your job is to build the unbiased set.",
  });

  // ---------- DAG ----------
  const dag = new DAG(DAG_NODES, DAG_EDGES);
  const view = new DAGView(dag, {
    width: 620,
    height: 420,
    conditionable: true,
    onChange: (v) => {
      // Sync view.Z → selected (DAGView is the authoritative UI for the DAG panel)
      selected.clear();
      for (const id of v.Z) selected.add(id);
      syncCardsToSelected();
      recompute();
    },
  });
  view.svg.classList.add("bc-dag");
  // Animate the causal edge
  view.setFlow([{ from: "educ", to: "lwage" }]);

  const dagWrap = h("div", {}, [
    h("p", { class: "stage-title", text: "click a node to add it to your adjustment set" }),
    view.svg,
  ]);
  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.appendChild(dagWrap);

  // ---------- estimate spring ----------
  const estSpring = new Spring(BENCHMARK, { stiffness: 50, damping: 14 });

  // ---------- readouts ----------
  const rBench = readout({ label: "Credible benchmark", value: fmt(BENCHMARK), accent: "var(--pos)" });
  const rEst   = readout({ label: "Your estimate",      value: "—",            accent: "var(--accent2)" });
  const rBias  = readout({ label: "Bias (est−bench)",   value: "±0.000",       accent: "var(--neg)" });

  // ---------- gauge ----------
  const gaugeRange = [BENCHMARK - 0.06, BENCHMARK + 0.06];
  const gaugeWidth = 220;
  function gaugeLeft(val) {
    const t = clamp((val - gaugeRange[0]) / (gaugeRange[1] - gaugeRange[0]), 0, 1);
    return Math.round(t * gaugeWidth) + "px";
  }
  const credibleL = gaugeLeft(BENCH_LO);
  const credibleW = Math.round((BENCH_HI - BENCH_LO) / (gaugeRange[1] - gaugeRange[0]) * gaugeWidth) + "px";

  const needle     = h("div", { class: "bc-gauge-needle", style: { left: gaugeLeft(BENCHMARK) } });
  const credibleEl = h("div", { class: "bc-gauge-credible", style: { left: credibleL, width: credibleW } });
  const gaugeTrack = h("div", { class: "bc-gauge-track" });
  const gaugeWrap  = h("div", { class: "bc-gauge-wrap", style: { width: gaugeWidth + "px" } },
    [gaugeTrack, credibleEl, needle]);
  const gaugeLabels = h("div", { class: "bc-gauge-labels", style: { width: gaugeWidth + "px" } }, [
    h("span", { text: fmt(gaugeRange[0]) }),
    h("span", { text: "← credible →" }),
    h("span", { text: fmt(gaugeRange[1]) }),
  ]);

  // ---------- bias-o-meter ----------
  const biasBar = h("div", { class: "bc-biasometer-bar", style: { width: "0%" } });
  const biasVal = h("div", { class: "bc-biasometer-val" }, [
    h("span", { text: "bias magnitude" }),
    h("span", { id: "bc-bias-num", text: "0.000" }),
  ]);
  const biasometer = h("div", { class: "bc-biasometer" }, [
    h("div", { class: "bc-biasometer-label", text: "Bias-o-meter" }),
    h("div", { class: "bc-biasometer-bar-bg" }, [biasBar]),
    biasVal,
  ]);

  // ---------- score row ----------
  const scorePill  = h("span", { class: "bc-score-pill", text: "score: 0" });
  const badPill    = h("span", { class: "bc-score-pill", style: { color: "var(--neg)" }, text: "bad: 0" });
  const scoreRow   = h("div", { class: "bc-score-row" }, [scorePill, badPill]);

  // ---------- verdict ----------
  const verdict = h("div", { class: "note", style: { marginTop: "6px", minHeight: "2.5em" } });

  // ---------- control cards ----------
  const cardEls = {};
  const cardsWrap = h("div", { class: "bc-cards" });

  for (const ctrl of CONTROLS) {
    const nameEl   = h("div", { class: "bc-card-name", text: ctrl.label });
    const kindEl   = h("div", { class: "bc-card-kind", text: ctrl.kindLabel });
    const revealEl = h("div", { class: "bc-card-reveal", text: ctrl.reveal });

    // Quiz overlay
    const quizQ    = h("div", { class: "bc-quiz-q", text: "Good or bad control?" });
    const btnGood  = h("button", { class: "bc-quiz-btn", type: "button", text: "Good" });
    const btnBad   = h("button", { class: "bc-quiz-btn", type: "button", text: "Bad" });
    const quizBtns = h("div", { class: "bc-quiz-btns" }, [btnGood, btnBad]);
    const overlay  = h("div", { class: "bc-quiz-overlay" }, [quizQ, quizBtns]);

    const card = h("div", { class: "bc-card" }, [nameEl, kindEl, revealEl, overlay]);
    cardEls[ctrl.id] = { card, overlay, btnGood, btnBad, revealEl, kindEl };

    // Toggle on click (when not in quiz mode)
    card.addEventListener("click", () => {
      if (overlay.classList.contains("visible")) return; // quiz is handling it
      toggleControl(ctrl.id, card);
    });

    // Quiz buttons
    btnGood.addEventListener("click", (e) => { e.stopPropagation(); answerQuiz(ctrl, "good"); });
    btnBad.addEventListener("click",  (e) => { e.stopPropagation(); answerQuiz(ctrl, "bad"); });

    cardsWrap.appendChild(card);
  }

  // ---------- quiz button ----------
  const quizBtn = button("Start adversarial quiz round", startQuizRound, { kind: "primary" });
  const resetBtn = button("Reset controls", () => {
    selected.clear();
    view.Z.clear();
    view.render();
    for (const ctrl of CONTROLS) {
      const { card, overlay, revealEl } = cardEls[ctrl.id];
      card.classList.remove("selected", "good", "bad", "mediator", "revealed");
      overlay.classList.remove("visible");
      revealEl.style.display = "";
    }
    recompute();
  });

  // ---------- challenge ----------
  const chal = challenge({
    goal: "Build the unbiased adjustment set: include ALL confounders (fatheduc, motheduc, black, south), ZERO colliders and ZERO mediators. Estimate must land within the credible band.",
  });

  // ---------- panel assembly ----------
  panel.append(
    dataBadge(meta),
    panelSection("Estimate of educ → lwage", [
      h("div", { class: "bc-readout-grid" }, [rBench, rEst, rBias]),
      gaugeWrap,
      gaugeLabels,
      biasometer,
      verdict,
    ]),
    panelSection("Toggle controls — each card flips ON/OFF in the regression", [
      cardsWrap,
      h("div", { class: "btn-row", style: { marginTop: "8px" } }, [resetBtn, quizBtn]),
      scoreRow,
    ]),
    panelSection("Challenge", [chal]),
    panelSection("Notes", [
      note("Green glow = safe confounder. Amber = mediator (overcontrol). Red = collider (opens a path). Purple = M-collider."),
      note("smsa (metro) is an empirical mediator: educates workers sort into cities. Conditioning removes the location premium that IS part of education's return."),
      note("prestige is constructed as a child of both educ and lwage — the canonical collider."),
      note("iq×fam (m_collider) is a pre-treatment collider between two background channels that feed educ. Looks innocent; induces M-bias."),
    ]),
  );

  caption.innerHTML =
    "<strong>Bad-controls taxonomy (Cinelli, Forney &amp; Pearl 2022; Greenland 2003).</strong> " +
    "A <em>confounder</em> is a common cause of treatment &amp; outcome — condition on it. " +
    "A <em>mediator</em> lies <em>on</em> the causal path — conditioning removes part of the effect (overcontrol). " +
    "A <em>collider</em> is caused by both treatment &amp; outcome — conditioning <strong>opens</strong> a non-causal path. " +
    "An <em>M-collider</em> is a pre-treatment collider between two background factors — looks innocent, induces M-bias. " +
    "Data: Card (1995), NLSYM; treatment: <em>educ</em>; outcome: <em>lwage</em>. " +
    "References: Cinelli, Forney &amp; Pearl (2022) <em>A Crash Course in Good and Bad Controls</em>; " +
    "Greenland (2003) <em>Quantifying Biases in Causal Models: Classical Confounders and Colliders</em>.";

  root.appendChild(layout);

  // ── Core logic ──────────────────────────────────────────────────────────────
  function recompute() {
    const est = computeEst(selected);
    estSpring.set(est);

    const bias = est - BENCHMARK;
    const absBias = Math.abs(bias);
    const inBand = est >= BENCH_LO && est <= BENCH_HI;

    rEst.set(fmt(est), "educ coef.");
    rEst.querySelector(".readout-value").style.color =
      inBand ? "var(--pos)" : absBias > 0.03 ? "var(--neg)" : "var(--gold)";

    rBias.set((bias >= 0 ? "+" : "") + bias.toFixed(3), bias >= 0 ? "upward" : "downward");
    rBias.querySelector(".readout-value").style.color =
      absBias < 0.005 ? "var(--pos)" : absBias > 0.03 ? "var(--neg)" : "var(--gold)";

    // bias-o-meter: max meaningful bias ~0.06
    const barPct = clamp(absBias / 0.06, 0, 1) * 100;
    biasBar.style.width = barPct.toFixed(1) + "%";
    biasBar.style.background = absBias < 0.01 ? "var(--pos)" : absBias > 0.03 ? "var(--neg)" : "var(--gold)";
    document.getElementById("bc-bias-num").textContent = absBias.toFixed(3);

    // count bad controls in set
    const badCount = CONTROLS.filter((c) => !c.good && selected.has(c.id)).length;
    const goodCount = CONTROLS.filter((c) => c.good && selected.has(c.id)).length;
    badPill.textContent = "bad controls: " + badCount;
    badPill.style.color = badCount > 0 ? "var(--neg)" : "var(--dim)";

    // Verdict
    if (selected.size === 0) {
      verdict.innerHTML = `<strong style="color:var(--neg)">No adjustment</strong> — confounders open; raw estimate includes family-background bias.`;
    } else if (inBand && badCount === 0 && goodCount >= 3) {
      verdict.innerHTML = `<strong style="color:var(--pos)">✓ Unbiased set!</strong> — all ${goodCount} confounders block backdoor paths; no colliders or mediators admitted.`;
    } else if (badCount > 0 && absBias > 0.02) {
      const badNames = CONTROLS.filter((c) => !c.good && selected.has(c.id)).map((c) => c.label).join(", ");
      verdict.innerHTML = `<strong style="color:var(--neg)">✗ Bias detected</strong> — ${badNames} is/are bad control(s) pulling the estimate ${bias > 0 ? "up" : "down"} by ${absBias.toFixed(3)} log-wage pts.`;
    } else if (absBias > 0.02) {
      verdict.innerHTML = `<strong style="color:var(--gold)">△ Getting there</strong> — estimate is ${absBias.toFixed(3)} from benchmark; add more confounders (fatheduc, motheduc, black, south).`;
    } else {
      verdict.innerHTML = `<strong style="color:var(--gold)">△ Close</strong> — within ${absBias.toFixed(3)} of benchmark. Check you have ALL four confounders and no bad controls.`;
    }

    // Challenge check
    const allGoodIn = CONTROLS.filter((c) => c.good).every((c) => selected.has(c.id));
    const noBadIn   = CONTROLS.filter((c) => !c.good).every((c) => !selected.has(c.id));
    if (allGoodIn && noBadIn && inBand) {
      chal.setState(true, `adj={fatheduc,motheduc,black,south} → β=${fmt(est)} ✓`);
    } else {
      chal.setState(false, allGoodIn ? (noBadIn ? "almost…" : "bad controls present") : "missing confounders");
    }
  }

  function toggleControl(id, cardEl) {
    const ctrl = CONTROLS.find((c) => c.id === id);
    if (!ctrl) return;

    if (selected.has(id)) {
      selected.delete(id);
      cardEl.classList.remove("selected", "good", "bad", "mediator");
    } else {
      selected.add(id);
      cardEl.classList.add("selected");
      if (ctrl.kind === "confounder") cardEl.classList.add("good");
      else if (ctrl.kind === "mediator") cardEl.classList.add("bad", "mediator");
      else cardEl.classList.add("bad");
      // reveal explanation on first selection
      if (!revealed.has(id)) {
        revealed.add(id);
        cardEl.classList.add("revealed");
      }
    }

    // Sync back to the DAG view
    view.Z.clear();
    for (const sel of selected) view.Z.add(sel);
    view.render();

    recompute();
  }

  function syncCardsToSelected() {
    for (const ctrl of CONTROLS) {
      const { card } = cardEls[ctrl.id];
      if (selected.has(ctrl.id)) {
        card.classList.add("selected");
        if (ctrl.kind === "confounder") card.classList.add("good");
        else if (ctrl.kind === "mediator") { card.classList.add("bad"); card.classList.add("mediator"); }
        else card.classList.add("bad");
        if (!revealed.has(ctrl.id)) {
          revealed.add(ctrl.id);
          card.classList.add("revealed");
        }
      } else {
        card.classList.remove("selected", "good", "bad", "mediator");
      }
    }
  }

  // ── Quiz round ────────────────────────────────────────────────────────────
  let quizQueue = [];

  function startQuizRound() {
    if (quizActive) return;
    quizActive = true;
    quizBtn.disabled = true;
    quizBtn.textContent = "Quiz in progress…";
    // Pick 3 random controls to quiz (mix good and bad)
    const shuffled = CONTROLS.slice().sort(() => Math.random() - 0.5);
    quizQueue = shuffled.slice(0, 3);
    presentNextQuiz();
  }

  function presentNextQuiz() {
    if (quizQueue.length === 0) {
      quizActive = false;
      quizBtn.disabled = false;
      quizBtn.textContent = "Start adversarial quiz round";
      return;
    }
    const ctrl = quizQueue.shift();
    const { overlay } = cardEls[ctrl.id];
    overlay.classList.add("visible");
    // Reset button states
    const { btnGood, btnBad } = cardEls[ctrl.id];
    btnGood.className = "bc-quiz-btn";
    btnBad.className = "bc-quiz-btn";
  }

  function answerQuiz(ctrl, answer) {
    const isGood = ctrl.good;
    const correct = (answer === "good") === isGood;
    if (correct) {
      score += 10;
      if (answer === "good") cardEls[ctrl.id].btnGood.classList.add("correct");
      else cardEls[ctrl.id].btnBad.classList.add("correct");
    } else {
      score = Math.max(0, score - 5);
      if (answer === "good") cardEls[ctrl.id].btnGood.classList.add("wrong");
      else cardEls[ctrl.id].btnBad.classList.add("wrong");
    }
    scorePill.textContent = "score: " + score;

    // Hide overlay after brief delay, reveal explanation, then next quiz
    setTimeout(() => {
      const { overlay } = cardEls[ctrl.id];
      overlay.classList.remove("visible");
      // Reveal explanation text
      if (!revealed.has(ctrl.id)) {
        revealed.add(ctrl.id);
        cardEls[ctrl.id].card.classList.add("revealed");
      }
      presentNextQuiz();
    }, 800);
  }

  // ── Animation loop ──────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    estSpring.step(dt);
    needle.style.left = gaugeLeft(estSpring.value);
    rEst.querySelector(".readout-value").textContent = fmt(estSpring.value);
  });

  // Initial render
  recompute();
  return () => { stop(); view.destroy(); };
}

// ── Utility ────────────────────────────────────────────────────────────────────
function fmt(v) {
  return (v >= 0 ? "+" : "") + v.toFixed(3);
}
