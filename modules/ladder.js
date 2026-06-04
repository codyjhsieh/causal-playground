// The Ladder of Causation (Pearl). Three rungs — Seeing, Doing, Imagining — each
// a strictly harder question the previous rung cannot answer. You climb a real
// ladder; a climber animates between rungs; each rung runs a tiny live world so
// the *difference* between association, intervention, and counterfactual is felt.
//
// Real data: LaLonde (1986) NSW job-training experiment + CPS comparison group.
// The SAME outcome (re78, 1978 earnings) gives three completely different answers
// depending on which rung you stand on — that IS the LaLonde lesson.

import { h } from "../lib/dom.js";
import { mean } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { s } from "../lib/dom.js";
import { lessonLayout, panelSection, button, note } from "../lib/ui.js";
import { rows as nsw, meta } from "../data/nsw.js";
import { rows as cps } from "../data/cps.js";
import { col, complete, dataBadge } from "../lib/data.js";

// ---- Pre-compute the three LaLonde numbers (done once at module load) ----

// Complete cases on re78 for each sub-population.
const nswComplete  = complete(nsw, ["treat", "re78"]);
const cpsComplete  = complete(cps, ["re78"]);

// NSW subsets
const nswTreated = nswComplete.filter((r) => r.treat === 1);
const nswControl = nswComplete.filter((r) => r.treat === 0);

// RUNG 1 — SEEING: naive observational gap (NSW treated vs CPS controls).
// CPS workers are far more advantaged → the gap is strongly negative.
const meanTreatedSee  = mean(col(nswTreated, "re78"));   // ~$6 k
const meanControlSee  = mean(col(cpsComplete, "re78"));  // ~$14–15 k
const observationalGap = meanTreatedSee - meanControlSee; // −$8 k to −$15 k

// RUNG 2 — DOING: randomized experiment (NSW treated vs NSW control).
// Both groups drawn from the same population → confounding is broken.
const meanTreatedDo  = mean(col(nswTreated, "re78"));
const meanControlDo  = mean(col(nswControl, "re78"));
const experimentalATT = meanTreatedDo - meanControlDo;   // ≈ +$1,794

// RUNG 3 — IMAGINING: unit-level counterfactual for one specific trainee.
// We pick a real trainee (first in the treated list) and ask: what would
// THIS person have earned without training? No data contains this; we model
// it as the mean outcome of NSW controls with similar pre-treatment earnings.
const exemplar = nswTreated[0];
// Predicted counterfactual: OLS-style prediction from controls' re75 → re78.
// Simple nearest-quantile approximation using re75 as the lone predictor.
const re75Sorted = nswControl.slice().sort((a, b) => a.re75 - b.re75);
const matchRadius = 500; // ±$500 in re75
const neighbours = re75Sorted.filter(
  (r) => Math.abs(r.re75 - (exemplar.re75 || 0)) <= matchRadius,
);
const cfPredicted = neighbours.length >= 5
  ? mean(col(neighbours, "re78"))
  : mean(col(nswControl, "re78")); // fallback: full control mean

const cfITE = exemplar.re78 - cfPredicted; // modeled unit gain

// ---- Rung descriptors ----
const RUNGS = [
  {
    key: "see", roman: "I", name: "Seeing", verb: "Association",
    q: "If I observe X, how does my belief about Y change?",
    formal: "P(Y | X)",
    blurb: "Pure observation. What patterns are there? Every correlation lives here — and so does every confounded illusion.",
    can: "Spot patterns, predict, diagnose.",
    cant: "Tell whether X causes Y, or what happens if we act.",
  },
  {
    key: "do", roman: "II", name: "Doing", verb: "Intervention",
    q: "If I set X — reach in and force it — what happens to Y?",
    formal: "P(Y | do(X))",
    blurb: "Action. We override how X would naturally arise, severing its incoming causes. This is what experiments estimate.",
    can: "Predict the effect of policies and treatments.",
    cant: "Speak about a specific individual's unrealized alternative.",
  },
  {
    key: "imagine", roman: "III", name: "Imagining", verb: "Counterfactual",
    q: "Given what happened, what would have happened instead?",
    formal: "P(Y_x | X=x′, Y=y′)",
    blurb: "Retrospection over worlds that did not occur. Blame, credit, regret, 'but for' causation — all of it lives at the top.",
    can: "Reason about responsibility, necessity, sufficiency.",
    cant: "— this is the summit; it subsumes the rungs below.",
  },
];

export function mount(root) {
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "The Ladder of Causation",
    idea: "Three rungs, three kinds of question. Data alone lives on the bottom rung. Each step up needs an assumption the data cannot supply — and answers a question the rung below cannot even ask.",
  });

  let active = 0;
  const climberY = new Spring(rungY(0), { stiffness: 90, damping: 16 });

  // ---- Stage: the ladder ----
  const W = 540, H = 380;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", style: { maxWidth: W + "px" } });
  stage.style.display = "flex";
  stage.style.justifyContent = "center";
  stage.appendChild(svg);

  const railL = 150, railR = 250;
  // rails
  svg.append(
    s("line", { x1: railL, y1: 30, x2: railL, y2: H - 20, stroke: "var(--line)", "stroke-width": 6, "stroke-linecap": "round" }),
    s("line", { x1: railR, y1: 30, x2: railR, y2: H - 20, stroke: "var(--line)", "stroke-width": 6, "stroke-linecap": "round" }),
  );
  const rungEls = [];
  RUNGS.forEach((r, i) => {
    const y = rungY(i);
    const g = s("g", { class: "ladder-rung", style: { cursor: "pointer" } });
    g.append(
      s("line", { x1: railL, y1: y, x2: railR, y2: y, stroke: "var(--dim)", "stroke-width": 5, "stroke-linecap": "round" }),
      s("circle", { cx: railR + 60, cy: y, r: 20, fill: "var(--surface2)", stroke: "var(--line)", "stroke-width": 2, class: "rung-badge" }),
      s("text", { x: railR + 60, y: y + 5, "text-anchor": "middle", fill: "var(--ink)", "font-family": "ui-monospace, monospace", "font-size": 13, text: r.roman }),
      s("text", { x: railR + 92, y: y + 5, fill: "var(--dim)", "font-size": 14, "font-family": "ui-sans-serif, system-ui", text: r.name, class: "rung-name" }),
      s("text", { x: railL - 16, y: y + 4, "text-anchor": "end", fill: "var(--accent2)", "font-size": 12, "font-family": "ui-monospace, monospace", text: r.formal }),
    );
    g.addEventListener("click", () => select(i));
    svg.append(g);
    rungEls.push(g);
  });
  // climber
  const climber = s("g", { class: "climber" });
  climber.append(
    s("circle", { cx: 200, cy: -10, r: 8, fill: "var(--accent)" }),
    s("rect", { x: 196, y: 0, width: 8, height: 18, rx: 3, fill: "var(--accent)" }),
  );
  svg.append(climber);

  function rungY(i) { return 90 + i * 100; }

  const stopAnim = onFrame((dt) => {
    climberY.step(dt);
    climber.setAttribute("transform", `translate(0, ${climberY.value - 9})`);
    rungEls.forEach((g, i) => {
      g.querySelector(".rung-badge").setAttribute("fill", i === active ? "var(--accent)" : "var(--surface2)");
      g.querySelector(".rung-name").setAttribute("fill", i === active ? "var(--ink)" : "var(--dim)");
    });
  });

  // ---- Panel: live mini-world for each rung ----
  const detail = h("div");
  const liveBox = h("div", { class: "panel-section" });
  const badgeBox = h("div", { style: { marginTop: "16px" } });
  panel.append(detail, liveBox, badgeBox);

  // Append the data provenance badge once
  badgeBox.appendChild(dataBadge(meta));

  function select(i) {
    active = i;
    climberY.set(rungY(i));
    renderDetail();
  }

  function renderDetail() {
    const r = RUNGS[active];
    detail.innerHTML = "";
    detail.append(panelSection(`Rung ${r.roman} · ${r.verb}`, [
      h("div", { class: "readout", style: { textAlign: "left", padding: 0 } }, [
        h("div", { class: "readout-value", style: { fontSize: "20px", color: "var(--accent2)" }, text: r.formal }),
      ]),
      h("p", { class: "note", style: { marginTop: "8px", fontSize: "13px", color: "var(--ink)" }, text: r.q }),
      h("p", { class: "note", style: { marginTop: "8px" }, text: r.blurb }),
      h("p", { class: "note", style: { marginTop: "8px" }, html: `<strong style="color:var(--pos)">can</strong> ${r.can}` }),
      h("p", { class: "note", html: `<strong style="color:var(--neg)">cannot</strong> ${r.cant}` }),
    ]));
    renderLive(r.key);
  }

  // ---- Real LaLonde numbers, same outcome (re78), three different answers ----
  function renderLive(key) {
    liveBox.innerHTML = "";
    liveBox.append(h("h3", { class: "panel-section-title", text: "real data · same outcome, three answers" }));

    if (key === "see") {
      // Naive observational: NSW trainees vs CPS workers — biased because CPS
      // workers were far more advantaged (older, employed, higher earners).
      const maxVal = Math.max(meanTreatedSee, meanControlSee);
      liveBox.append(
        h("p", { class: "note", style: { marginBottom: "8px" },
          html: `<em>P(re78 | observed group)</em> — who earns more in the raw data?` }),
        earningsBar("NSW trainees (treat=1)", meanTreatedSee, maxVal, "var(--treat)"),
        earningsBar("CPS workers (treat=0)", meanControlSee, maxVal, "var(--ctrl)"),
        verdict(
          `Observational gap ${fmt(observationalGap)} — looks like training HURTS. ` +
          `Trainees were severely disadvantaged vs. CPS workers before the program; ` +
          `selection bias reverses the true sign completely.`,
          "neg",
        ),
      );
    } else if (key === "do") {
      // Randomized experiment: NSW treated vs NSW control — both from the same
      // pool, assignment was random, so selection bias is gone.
      const maxVal = Math.max(meanTreatedDo, meanControlDo);
      liveBox.append(
        h("p", { class: "note", style: { marginBottom: "8px" },
          html: `<em>P(re78 | do(training))</em> — what does the RCT say?` }),
        earningsBar("NSW trained (treat=1)", meanTreatedDo, maxVal, "var(--treat)"),
        earningsBar("NSW control (treat=0)", meanControlDo, maxVal, "var(--ctrl)"),
        verdict(
          `Experimental ATT ≈ ${fmt(experimentalATT)} — training genuinely helped. ` +
          `Randomization severs severity→treatment, so the signal flips positive. ` +
          `This is the LaLonde benchmark effect.`,
          "pos",
        ),
      );
    } else {
      // Unit counterfactual: one specific trainee; what would they have earned
      // without training? No data contains this — it is modeled.
      const maxVal = Math.max(exemplar.re78, cfPredicted) * 1.05;
      liveBox.append(
        h("p", { class: "note", style: { marginBottom: "8px" },
          html: `Trainee #1: age ${exemplar.age}, educ ${exemplar.educ} yrs, re75 ≈ ${fmt(exemplar.re75 || 0)}.` }),
        earningsBar("Factual re78 (got training)", exemplar.re78, maxVal, "var(--treat)"),
        earningsBar("Modeled counterfactual (no training)", cfPredicted, maxVal, "var(--gold)"),
        h("p", { class: "note",
          style: { marginTop: "6px", fontSize: "11px", color: "var(--dim)", fontStyle: "italic" },
          text: "⚠ counterfactual is modeled (nearest-neighbour mean among NSW controls on re75) — not observed." }),
        verdict(
          `Modeled unit gain ${fmt(cfITE)}. No dataset contains this person's outcome ` +
          `under both conditions simultaneously. This is the fundamental problem of ` +
          `causal inference — and why the third rung requires the strongest assumptions.`,
          "gold",
        ),
      );
    }
  }

  caption.innerHTML =
    "These rungs form a strict hierarchy: data at a lower rung cannot answer a higher question, no matter how much of it you collect. " +
    "Climbing requires <strong>causal assumptions</strong> — typically a graph. " +
    "The LaLonde (1986) NSW job-training data makes this visceral: the <span class='k'>seeing</span> answer is " +
    "<strong style='color:var(--neg)'>strongly negative</strong> (~−$8k, because trainees were far more disadvantaged than CPS workers), " +
    "the <span class='k'>doing</span> answer is <strong style='color:var(--pos)'>positive</strong> (≈ +$1,794 from the RCT), " +
    "and the <span class='k'>imagining</span> answer is about one specific unrealized life — unobservable in any dataset. " +
    "Same real people, same outcome variable, three completely different numbers. " +
    "<em>Source: LaLonde 1986; Dehejia &amp; Wahba 1999.</em>";

  root.appendChild(layout);
  select(0);
  return () => stopAnim();
}

// ---- helpers ----

// Render an earnings bar scaled to maxVal (dollar amounts, not percentages).
function earningsBar(label, val, maxVal, color) {
  const frac = Math.max(0, Math.min(1, val / Math.max(1, maxVal)));
  const fill = h("div", {
    class: "lad-bar-fill",
    style: { width: Math.round(frac * 100) + "%", background: color },
  });
  return h("div", { style: { margin: "8px 0" } }, [
    h("div", { class: "note", style: { display: "flex", justifyContent: "space-between" } }, [
      label,
      h("span", { class: "k", text: fmt(val) }),
    ]),
    h("div", { style: { height: "8px", background: "var(--faint)", borderRadius: "4px", overflow: "hidden", marginTop: "4px" } }, [fill]),
  ]);
}

function verdict(text, kind) {
  const color = { pos: "var(--pos)", neg: "var(--neg)", gold: "var(--gold)" }[kind];
  return h("p", { class: "note", style: { marginTop: "10px", borderLeft: `2px solid ${color}`, paddingLeft: "10px", color: "var(--ink)" }, text });
}

// Format a dollar amount with sign and thousands separator.
function fmt(x) {
  const sign = x >= 0 ? "+" : "−";
  const abs = Math.abs(Math.round(x));
  const s = abs.toLocaleString("en-US");
  return `${sign}$${s}`;
}
