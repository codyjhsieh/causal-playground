// The Backdoor Criterion — demonstrated on the REAL LaLonde job-training data.
// LaLonde (1986) showed that observational comparisons of trainees vs. CPS
// comparison workers give wildly wrong answers (-$8k to -$15k) because the
// groups differ on pre-treatment earnings and demographics (backdoor paths).
// Adjusting for the right set of pre-treatment covariates — especially the
// prior-earnings re74 & re75 — blocks those paths and recovers the
// experimental benchmark of ≈ +$1,794. This module lets you discover that
// interactively by clicking nodes to build your adjustment set.

import { h } from "../lib/dom.js";
import { mean, olsMulti } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { DAG, DAGView } from "../lib/dag.js";
import { lessonLayout, panelSection, readout, challenge, note } from "../lib/ui.js";
import { rows as nsw, meta } from "../data/nsw.js";
import { rows as cps } from "../data/cps.js";
import { col, complete, dataBadge } from "../lib/data.js";

// ---- Prepare real data -------------------------------------------------------
const COVARS = ["age", "educ", "black", "hisp", "marr", "nodegree", "re74", "re75"];
const ALL_KEYS = [...COVARS, "re78", "treat"];

const nswClean = complete(nsw, ALL_KEYS);
const cpsClean = complete(cps, ALL_KEYS);

// Experimental benchmark: NSW treated vs NSW control (pure RCT)
const nswTreated = nswClean.filter((r) => r.treat === 1);
const nswControl = nswClean.filter((r) => r.treat === 0);
const BENCH = mean(col(nswTreated, "re78")) - mean(col(nswControl, "re78"));
// ≈ +$1,794 (Dehejia & Wahba 1999)

// Observational sample: NSW treated + CPS controls
const OBS = [
  ...nswTreated,
  ...cpsClean.filter((r) => r.treat === 0),
];

// ---- DAG layout (treatment, outcome, 8 confounder nodes) --------------------
// Confounders are arranged in a rough arc above/around the treatment→outcome edge.
// Each one has an arrow into treat AND into re78.
const CONF_NODES = [
  { id: "age",      label: "age",    sub: "age",          x: 100, y:  60 },
  { id: "educ",     label: "educ",   sub: "education",    x: 210, y:  35 },
  { id: "black",    label: "black",  sub: "race",         x: 310, y:  25 },
  { id: "hisp",     label: "hisp",   sub: "ethnicity",    x: 400, y:  50 },
  { id: "marr",     label: "marr",   sub: "married",      x: 470, y: 100 },
  { id: "nodegree", label: "nodeg.", sub: "no degree",    x: 500, y: 175 },
  { id: "re74",     label: "re74",   sub: "earn. 1974",   x: 140, y: 330 },
  { id: "re75",     label: "re75",   sub: "earn. 1975",   x: 300, y: 355 },
];

const CONF_EDGES = CONF_NODES.flatMap((n) => [
  { from: n.id, to: "treat" },
  { from: n.id, to: "re78" },
]);

export function mount(root) {
  const dag = new DAG(
    [
      { id: "treat", label: "treat", sub: "job training", x: 145, y: 210, role: "treatment", conditionable: false },
      { id: "re78",  label: "re78",  sub: "1978 earnings", x: 440, y: 210, role: "outcome",   conditionable: false },
      ...CONF_NODES,
    ],
    [
      { from: "treat", to: "re78", sign: "+", label: "effect?" },
      ...CONF_EDGES,
    ]
  );

  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "The Backdoor Criterion",
    idea: "Click covariate nodes to add them to your adjustment set Z. The estimate updates in real time. Unadjusted, the confounded observational sample gives a wildly wrong answer; adjusting for the right pre-treatment variables (especially prior earnings re74 & re75) recovers the experimental truth.",
  });

  const view = new DAGView(dag, { width: 580, height: 420, onChange: () => recompute() });
  stage.style.display = "flex";
  stage.style.justifyContent = "center";
  stage.appendChild(view.svg);

  // --- panel ---
  const badge = dataBadge(meta);
  const fmtDollar = (v) => (v >= 0 ? "+" : "") + "$" + Math.round(v).toLocaleString();

  const rBench = readout({ label: "Experimental benchmark", value: fmtDollar(BENCH), accent: "var(--gold)" });
  const rEst   = readout({ label: "Your adjusted estimate",  value: "—",              accent: "var(--accent2)" });
  const verdict = h("div", { class: "note", style: { marginTop: "6px" } });

  const estSpring = new Spring(0, { stiffness: 45, damping: 12 });

  const chal = challenge({
    goal: `Recover the experimental benchmark (within $1,200). You will need to include prior earnings (re74 & re75) as well as other pre-treatment controls.`,
  });

  panel.append(
    badge,
    panelSection("Effect of job training on 1978 earnings", [
      h("div", { class: "readout-grid" }, [rBench, rEst]),
      verdict,
    ]),
    panelSection("How to read it", [
      note("The observational sample mixes NSW trainees (treated) with the CPS comparison group (control). Without adjustment, the estimate is ~−$8k to −$15k — completely wrong."),
      note("• Each covariate node points into BOTH treat and re78 — those are backdoor paths."),
      note("• Click a node to include it in Z. The regression coefficient on treat updates immediately."),
      note("• Adding age, educ, race, and marital status reduces bias but is not enough."),
      note("• re74 & re75 (prior earnings) carry most of the residual confounding. Adding them closes the critical backdoor paths and pushes the estimate toward the benchmark."),
    ]),
    panelSection("Challenge", chal),
  );

  caption.innerHTML =
    "<strong>LaLonde 1986; Dehejia &amp; Wahba 1999.</strong> " +
    "The <em>backdoor criterion</em> says: adjust for a set Z that (1) blocks every " +
    "non-causal (backdoor) path from treatment into outcome and (2) contains no " +
    "descendant of treatment. Here each pre-treatment covariate is a common cause of " +
    "job-training participation and 1978 earnings, creating a backdoor path. " +
    "Conditioning on these confounders — especially prior earnings re74 &amp; re75 — " +
    "blocks all backdoor paths and recovers the randomized experimental effect " +
    "of ≈ +$1,794, matching what LaLonde's own experiment measured.";

  root.appendChild(layout);

  // ---- regression on observational sample ------------------------------------
  function recompute() {
    const adj = [...view.Z]; // chosen covariate node ids
    // design matrix: intercept, treat, ...selected covariates
    const Xmat = OBS.map((r) => [1, r.treat, ...adj.map((k) => r[k])]);
    const yv   = OBS.map((r) => r.re78);
    const fit  = olsMulti(Xmat, yv);
    const est  = fit.beta[1]; // coefficient on treat
    estSpring.set(est);

    const diff = Math.abs(est - BENCH);
    rEst.querySelector(".readout-value").style.color =
      diff < 1200 ? "var(--pos)" : diff < 4000 ? "var(--accent2)" : "var(--neg)";

    const hasRe74 = adj.includes("re74");
    const hasRe75 = adj.includes("re75");

    if (diff < 1200) {
      verdict.innerHTML = `<strong style="color:var(--pos)">✓ Within $${Math.round(diff).toLocaleString()} of benchmark</strong> — adjustment set {${adj.join(", ") || "∅"}} closes the backdoor paths.`;
      chal.setState(true, `adjust { ${adj.join(", ") || "∅"} } → ${fmtDollar(est)}`);
    } else if (adj.length === 0) {
      verdict.innerHTML = `<strong style="color:var(--neg)">✗ No adjustment</strong> — all backdoor paths open, estimate is wildly confounded (${fmtDollar(est)}).`;
      chal.setState(false);
    } else if (!hasRe74 && !hasRe75) {
      verdict.innerHTML = `<strong style="color:var(--neg)">✗ Missing prior earnings</strong> — add re74 and re75 to close the key backdoor paths (currently ${fmtDollar(est)}).`;
      chal.setState(false);
    } else if (!hasRe74 || !hasRe75) {
      verdict.innerHTML = `<strong style="color:var(--accent2)">△ Getting closer</strong> — include both re74 <em>and</em> re75 for full adjustment (currently ${fmtDollar(est)}).`;
      chal.setState(false);
    } else {
      verdict.innerHTML = `<strong style="color:var(--accent2)">△ Prior earnings included</strong> — try adding more controls to get within $1,200 of benchmark (currently ${fmtDollar(est)}).`;
      chal.setState(false);
    }
  }

  const stop = onFrame((dt) => {
    estSpring.step(dt);
    rEst.set(fmtDollar(estSpring.value), "coef. on treat");
  });

  recompute();
  return () => { stop(); view.destroy(); };
}
