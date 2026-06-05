// Method Selection — the mastery capstone.
// Real problems don't come labeled "use IV." Five concrete research questions,
// each grounded in a real dataset already used throughout the platform. The
// learner must choose the right identification strategy, defend the assumption,
// and watch the method run on the actual data. Wrong picks explain exactly why
// they fail here. Score tracked across all five cases.
//
// Cases:
//   1. NSW job-training → RCT (experimental benchmark) vs. naive CPS trap
//   2. Card schooling returns → IV (college proximity)
//   3. Lee incumbency → RDD (barely winning/losing an election)
//   4. Card-Krueger min-wage → DiD (NJ vs PA)
//   5. California Prop 99 → Synthetic Control (donor-pool gap)

import { h, clear } from "../lib/dom.js";
import { mean, ols1, olsMulti, covariance, clamp } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { DAG, DAGView } from "../lib/dag.js";
import { lessonLayout, panelSection, button, readout, challenge, note } from "../lib/ui.js";
import { rows as nsw } from "../data/nsw.js";
import { rows as cps } from "../data/cps.js";
import { rows as card } from "../data/card.js";
import { rows as elections } from "../data/elections.js";
import { rows as ck, cells as ckCells } from "../data/cardkrueger.js";
import { rows as prop99 } from "../data/prop99.js";
import { col, complete } from "../lib/data.js";

// ─── CSS ───────────────────────────────────────────────────────────────────────
function ensureCSS() {
  if (document.getElementById("capstone-css")) return;
  const st = document.createElement("style");
  st.id = "capstone-css";
  st.textContent = `
.cap-card {
  display: flex; flex-direction: column; gap: 14px;
  animation: cap-fade-in 0.35s ease;
}
@keyframes cap-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.cap-question {
  font-size: 15px; font-weight: 600; line-height: 1.5; color: var(--ink);
  padding: 12px 14px; background: var(--surface); border-radius: 10px;
  border: 1px solid var(--line);
}
.cap-question .cap-dataset {
  font-size: 11px; font-weight: 400; font-family: var(--mono); color: var(--dim);
  display: block; margin-top: 4px;
}
.cap-dag-wrap { display: flex; justify-content: center; }
.cap-dag-wrap svg { border-radius: 8px; background: var(--surface); border: 1px solid var(--line); }
.cap-choices { display: flex; flex-wrap: wrap; gap: 8px; }
.cap-choice {
  padding: 7px 14px; border-radius: 20px; border: 1.5px solid var(--line);
  background: var(--surface); color: var(--ink); cursor: pointer;
  font-size: 12px; font-family: var(--mono); transition: border-color 0.15s, background 0.15s, transform 0.1s;
}
.cap-choice:hover { border-color: var(--accent); background: rgba(140,120,255,0.07); transform: translateY(-1px); }
.cap-choice.correct { border-color: var(--pos); background: rgba(80,220,160,0.12); color: var(--pos); font-weight: 700; }
.cap-choice.wrong { border-color: var(--neg); background: rgba(255,90,90,0.08); color: var(--neg); }
.cap-choice:disabled { cursor: default; transform: none; }
.cap-reveal {
  padding: 12px 14px; border-radius: 8px; border-left: 3px solid var(--pos);
  background: rgba(80,220,160,0.06); font-size: 12.5px; line-height: 1.6;
  animation: cap-fade-in 0.4s ease;
}
.cap-reveal.wrong-reveal {
  border-left-color: var(--neg); background: rgba(255,90,90,0.06);
}
.cap-reveal strong { color: var(--gold); }
.cap-reveal .cap-assumption {
  display: block; margin-top: 6px; padding: 6px 10px;
  background: rgba(255,255,255,0.04); border-radius: 6px;
  font-family: var(--mono); font-size: 11px; color: var(--accent2);
}
.cap-estimate-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
.cap-estimate-val {
  font-family: var(--mono); font-size: 22px; font-weight: 700; color: var(--gold);
  transition: color 0.3s;
}
.cap-next-btn { margin-top: 4px; }
.cap-progress {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--mono); font-size: 11px; color: var(--dim);
}
.cap-pips { display: flex; gap: 6px; }
.cap-pip {
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--line); transition: background 0.3s;
}
.cap-pip.done-correct { background: var(--pos); }
.cap-pip.done-wrong { background: var(--neg); }
.cap-pip.active { background: var(--accent); }
.cap-score-final {
  text-align: center; padding: 24px 16px;
  font-size: 28px; font-weight: 700; color: var(--gold);
  animation: cap-fade-in 0.5s ease;
}
.cap-score-final .cap-score-sub {
  font-size: 13px; color: var(--dim); font-weight: 400;
  display: block; margin-top: 6px;
}
.cap-score-final .cap-score-msg {
  font-size: 14px; color: var(--ink); font-weight: 500;
  display: block; margin-top: 10px; line-height: 1.5;
}
.cap-mastery-list { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 6px; }
.cap-mastery-list li { display: flex; gap: 8px; font-size: 12px; line-height: 1.4; }
.cap-mastery-list li .cap-check { flex-shrink: 0; color: var(--pos); font-weight: 700; }
.cap-mastery-list li .cap-cross { flex-shrink: 0; color: var(--neg); font-weight: 700; }
  `;
  document.head.appendChild(st);
}

// ─── Pre-compute real estimates (module-scope, run once) ───────────────────────

// Case 1 — NSW RCT vs naive CPS comparison
const NSW_KEYS = ["age", "educ", "black", "hisp", "marr", "nodegree", "re74", "re75", "re78", "treat"];
const nswClean = complete(nsw, NSW_KEYS);
const cpsClean = complete(cps, NSW_KEYS);
const nswTreated = nswClean.filter(r => r.treat === 1);
const nswControl  = nswClean.filter(r => r.treat === 0);
const RCT_ESTIMATE = mean(col(nswTreated, "re78")) - mean(col(nswControl, "re78")); // ≈ +$1,794
const naiveOBS = mean(col(nswTreated, "re78")) -
  mean(col(cpsClean.filter(r => r.treat === 0), "re78")); // ≈ −$8k to −$15k

// Case 2 — Card IV
const CARD_KEYS = ["lwage", "educ", "nearc4", "exper", "expersq", "black", "south", "smsa"];
const cardData = complete(card, CARD_KEYS);
function cardOLS() {
  const X = cardData.map(r => [1, r.educ, r.exper, r.expersq, r.black, r.south, r.smsa]);
  const y = col(cardData, "lwage");
  return olsMulti(X, y).beta[1]; // coeff on educ
}
function cardIV() {
  // Wald via partialling-out
  const n = cardData.length;
  const lw  = col(cardData, "lwage");
  const ed  = col(cardData, "educ");
  const nc4 = col(cardData, "nearc4");
  const Xc  = cardData.map(r => [1, r.exper, r.expersq, r.black, r.south, r.smsa]);
  const resid = (X, y) => {
    const b = olsMulti(X, y).beta;
    return y.map((yi, i) => yi - X[i].reduce((s, x, j) => s + x * b[j], 0));
  };
  const lwR  = resid(Xc, lw);
  const edR  = resid(Xc, ed);
  const nc4R = resid(Xc, nc4);
  const cov_lw_nc4 = covariance(lwR, nc4R);
  const cov_ed_nc4 = covariance(edR, nc4R);
  return Math.abs(cov_ed_nc4) < 1e-10 ? NaN : cov_lw_nc4 / cov_ed_nc4;
}
const CARD_OLS = cardOLS();
const CARD_IV  = cardIV();

// Case 3 — Lee RDD
const elecClean = complete(elections, ["demvoteshare", "lagdemvoteshare"]);
const rddPts = elecClean.map(r => ({ x: r.lagdemvoteshare - 0.5, y: r.demvoteshare }));
function rddEstimate(bw) {
  const L = rddPts.filter(p => p.x < 0 && p.x >= -bw);
  const R = rddPts.filter(p => p.x >= 0 && p.x <= bw);
  if (L.length < 5 || R.length < 5) return NaN;
  const fL = ols1(L.map(p => p.x), L.map(p => p.y));
  const fR = ols1(R.map(p => p.x), R.map(p => p.y));
  return fR.a - fL.a;
}
const RDD_ESTIMATE = rddEstimate(0.10); // ≈ +8 to +11 pp incumbency advantage

// Case 4 — Card-Krueger DiD (from real cells export, Table 3)
const NJ_BEFORE = ckCells.NJ.before, NJ_AFTER = ckCells.NJ.after;  // 20.44, 21.03
const PA_BEFORE = ckCells.PA.before, PA_AFTER = ckCells.PA.after;  // 23.33, 21.17
const DID_ESTIMATE = (NJ_AFTER - NJ_BEFORE) - (PA_AFTER - PA_BEFORE); // +2.76

// Case 5 — Prop 99 synthetic control (simple equal-weight donor average gap)
const CAL_TREAT_YEAR = 1989;
const calRows = prop99.filter(r => r.state === "California");
const donors = prop99.filter(r => r.treated === 0);
const donorStates = [...new Set(donors.map(r => r.state))];
function synthGap() {
  // Post-1989 simple average gap: CA packs minus equal-weight donor average
  const postYears = [...new Set(prop99.filter(r => r.year >= CAL_TREAT_YEAR).map(r => r.year))].sort();
  const gaps = postYears.map(yr => {
    const calPacks = prop99.find(r => r.state === "California" && r.year === yr)?.packs ?? NaN;
    const donorMeans = donorStates.map(st => {
      const row = prop99.find(r => r.state === st && r.year === yr);
      return row ? row.packs : NaN;
    }).filter(v => !isNaN(v));
    const donorAvg = donorMeans.length ? donorMeans.reduce((a, b) => a + b, 0) / donorMeans.length : NaN;
    return isNaN(calPacks) || isNaN(donorAvg) ? NaN : calPacks - donorAvg;
  });
  const valid = gaps.filter(v => !isNaN(v));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : NaN;
}
const SYNTH_GAP = synthGap(); // ≈ −20 to −25 packs/capita vs donor avg post-89

// ─── DAG definitions for each case ────────────────────────────────────────────
function makeDag(caseIdx) {
  const dags = [
    // Case 1 — RCT / NSW: coin flip breaks all confounding
    new DAG(
      [
        { id: "R", label: "R", sub: "random assign", x: 90,  y: 160, role: "treatment",  conditionable: false },
        { id: "T", label: "T", sub: "job training",  x: 240, y: 160, role: "treatment",  conditionable: false },
        { id: "Y", label: "Y", sub: "earnings '78",  x: 390, y: 160, role: "outcome",    conditionable: false },
        { id: "U", label: "U", sub: "background",    x: 240, y:  55, role: "confounder", conditionable: false },
      ],
      [
        { from: "R", to: "T", sign: "+", label: "randomize" },
        { from: "T", to: "Y", sign: "+", label: "effect?" },
        { from: "U", to: "Y", dashed: true, weak: true },
        // R blocks all backdoor paths from U to T
      ]
    ),
    // Case 2 — IV: ability confounds educ→wage, nearc4 is the instrument
    new DAG(
      [
        { id: "Z", label: "Z", sub: "near college", x: 80,  y: 180, role: "treatment",  conditionable: false },
        { id: "X", label: "X", sub: "schooling",    x: 240, y: 180, role: "treatment",  conditionable: false },
        { id: "Y", label: "Y", sub: "log wage",     x: 400, y: 180, role: "outcome",    conditionable: false },
        { id: "U", label: "U", sub: "ability",       x: 320, y:  60, role: "confounder", conditionable: false },
      ],
      [
        { from: "Z", to: "X", sign: "+", label: "relevance" },
        { from: "X", to: "Y", sign: "+", label: "β?" },
        { from: "U", to: "X", dashed: true, weak: true },
        { from: "U", to: "Y", dashed: true, weak: true },
      ]
    ),
    // Case 3 — RDD: vote margin at cutoff = local randomization
    new DAG(
      [
        { id: "M", label: "M", sub: "vote margin",  x: 80,  y: 160, role: "treatment",  conditionable: false },
        { id: "I", label: "I", sub: "incumbent",    x: 240, y: 160, role: "treatment",  conditionable: false },
        { id: "V", label: "V", sub: "next vote %",  x: 400, y: 160, role: "outcome",    conditionable: false },
        { id: "Q", label: "Q", sub: "quality",       x: 240, y:  55, role: "confounder", conditionable: false },
      ],
      [
        { from: "M", to: "I", sign: "+", label: "threshold" },
        { from: "I", to: "V", sign: "+", label: "advantage?" },
        { from: "Q", to: "M", dashed: true, weak: true },
        { from: "Q", to: "V", dashed: true, weak: true },
      ]
    ),
    // Case 4 — DiD: NJ treated, PA control, parallel trends
    new DAG(
      [
        { id: "P", label: "P", sub: "policy (NJ)",  x: 90,  y: 160, role: "treatment",  conditionable: false },
        { id: "E", label: "E", sub: "employment",   x: 250, y: 160, role: "outcome",    conditionable: false },
        { id: "T", label: "T", sub: "time",          x: 90,  y:  70, role: "confounder", conditionable: false },
        { id: "G", label: "G", sub: "group(NJ/PA)", x: 250, y:  70, role: "confounder", conditionable: false },
      ],
      [
        { from: "P", to: "E", sign: "+", label: "effect?" },
        { from: "T", to: "P", dashed: true, weak: true },
        { from: "T", to: "E", dashed: true, weak: true },
        { from: "G", to: "P", dashed: true, weak: true },
        { from: "G", to: "E", dashed: true, weak: true },
      ]
    ),
    // Case 5 — Synthetic Control: one treated state, donor pool
    new DAG(
      [
        { id: "P", label: "P", sub: "Prop 99",      x: 90,  y: 160, role: "treatment",  conditionable: false },
        { id: "S", label: "S", sub: "smoking rate", x: 260, y: 160, role: "outcome",    conditionable: false },
        { id: "D", label: "D", sub: "donor blend",  x: 260, y:  60, role: "confounder", conditionable: false },
      ],
      [
        { from: "P", to: "S", sign: "-", label: "effect?" },
        { from: "D", to: "S", dashed: true, weak: true },
      ]
    ),
  ];
  return dags[caseIdx];
}

// ─── Case definitions ──────────────────────────────────────────────────────────
const METHODS = ["RCT / Adjust", "IV", "RDD", "DiD", "Synth. Control"];

const CASES = [
  {
    title: "Does job training raise earnings?",
    detail: "You have the NSW randomized experiment AND a CPS survey comparison group. The CPS comparison is naively much larger — but ignoring selection gives a large negative bias (≈ −$8 000 to −$15 000) relative to the true RCT estimate of ≈ +$1 794.",
    dataset: "NSW (LaLonde 1986) + CPS comparison group",
    correct: 0, // RCT / Adjust
    dagIdx: 0,
    estimate: () => RCT_ESTIMATE,
    estimateFmt: v => (v >= 0 ? "+" : "") + "$" + Math.round(v).toLocaleString(),
    estimateLabel: "RCT: NSW treated − NSW control",
    assumption: "Randomization: R was drawn by coin flip, so treated and control groups are identical in expectation on all observed AND unobserved variables. Any mean difference in Y is causal.",
    wrongExplanations: {
      1: "IV works when treatment is endogenous but you have a valid instrument. Here the NSW experiment already randomizes treatment — using IV would be like bypassing a coin flip to look for a natural experiment. The RCT is stronger.",
      2: "RDD needs a running variable with a sharp cutoff. There's no meaningful threshold here — participants were simply assigned by lottery. Use the experiment directly.",
      3: "DiD requires a before-and-after panel and a control group that trends in parallel. The NSW data records a single post-treatment outcome (re78) with no pre-treatment baseline for the comparison.",
      4: "Synthetic control builds a weighted donor blend to match pre-treatment trends over many time periods. NSW is a single cross-section — there's no time series to match.",
    },
  },
  {
    title: "What is the return to an extra year of schooling?",
    detail: "OLS of log-wage on schooling is confounded by unobserved ability — ability raises both schooling and wages. Card (1995) finds that IV via college proximity yields a larger estimate than OLS, consistent with ability bias partially offsetting measurement error in the OLS.",
    dataset: "Card (1995), NLSYM n ≈ 3010",
    correct: 1, // IV
    dagIdx: 1,
    estimate: () => CARD_IV,
    estimateFmt: v => v.toFixed(3) + " log pts/yr (IV)  vs  " + CARD_OLS.toFixed(3) + " (OLS)",
    estimateLabel: "2SLS: nearc4 → educ → log wage",
    assumption: "Exclusion: nearc4 (grew up near a 4-yr college) shifts schooling but has no direct effect on wages. Independence: proximity to college is as-good-as-random conditional on controls.",
    wrongExplanations: {
      0: "RCT would be ideal but we can't randomize years of schooling. Naive OLS adjustment can't fix unobserved ability — that's exactly why we need an instrument that bypasses ability on its way to the outcome.",
      2: "RDD needs a running variable with a cutoff. Schooling is not assigned by a sharp rule — it's chosen by students who differ in ability. There's no threshold to exploit here.",
      3: "DiD needs a policy that treated some units and not others at a specific point in time. Card's data is a cross-section without a time-varying treatment event.",
      4: "Synthetic control needs a time-series panel with a pre-treatment window to match. This is a cross-sectional survey — no time dimension to construct a synthetic twin.",
    },
  },
  {
    title: "Does barely winning an election help you win the next one?",
    detail: "Incumbent quality confounds both winning margins and future electoral success. But near the 50 % threshold, winning vs. losing is essentially random luck.",
    dataset: "Lee (2008), U.S. House elections 1946–2010",
    correct: 2, // RDD
    dagIdx: 2,
    estimate: () => RDD_ESTIMATE,
    estimateFmt: v => isNaN(v) ? "—" : (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + " pp  (local linear, h=0.10)",
    estimateLabel: "RD jump at vote-share cutoff = 0.50",
    assumption: "Continuity: potential outcomes are smooth through the 50 % threshold — only incumbency status jumps. Near the threshold, barely-winners and barely-losers are as good as randomly assigned.",
    wrongExplanations: {
      0: "You can't randomly assign who wins elections. Adjusting for observed controls can't fix the fundamental problem: stronger candidates both win by more AND win next time — an unmeasured confounder that confounds any non-local comparison.",
      1: "IV requires a valid instrument that shifts winning without directly affecting future vote share. There's no such natural instrument here — the vote margin itself is endogenous to candidate quality.",
      3: "DiD needs a policy that turns on for some units and off for others at a known time. Elections don't have a clean before/after structure — incumbency is continuously reassigned each cycle.",
      4: "Synthetic control needs many pre-treatment periods to build a matching donor blend. A single election result is not a policy intervention with a long pre-treatment window.",
    },
  },
  {
    title: "Did NJ's 1992 minimum-wage hike cut fast-food jobs?",
    detail: "NJ raised its minimum wage from $4.25 to $5.05 in April 1992. Neighboring Pennsylvania made no change. Both states were surveyed before and after.",
    dataset: "Card & Krueger (1994), NJ vs PA fast-food FTE",
    correct: 3, // DiD
    dagIdx: 3,
    estimate: () => DID_ESTIMATE,
    estimateFmt: v => (v >= 0 ? "+" : "") + v.toFixed(2) + " FTE / store",
    estimateLabel: "(NJ after − NJ before) − (PA after − PA before)",
    assumption: "Parallel trends: absent the NJ wage hike, NJ and PA fast-food employment would have moved together. PA's trend proxies what NJ would have done without the policy.",
    wrongExplanations: {
      0: "Employers weren't randomized to NJ vs PA, and adjusting for observables can't fix unobserved state-level differences in labor markets. The DiD exploits the panel structure to difference out permanent state-level confounders.",
      1: "IV requires an instrument that shifts minimum-wage exposure without directly affecting employment. There's no such instrument here — the state of being in NJ is not randomly assigned, it's just where firms happen to be.",
      2: "RDD needs a continuous running variable with a sharp cutoff. The NJ minimum-wage hike applies to all NJ fast-food restaurants simultaneously — there's no margin around a threshold to exploit.",
      4: "Synthetic control needs many pre-treatment periods and many donor units. Card-Krueger has exactly two time points (before/after) and one control state — the classic DiD design.",
    },
  },
  {
    title: "Did California's Prop 99 cut smoking? One treated state, 38 donors.",
    detail: "California enacted Proposition 99 (tobacco tax and advertising restrictions) in November 1988, effective 1989. No other state enacted a comparable measure. You have annual per-capita cigarette sales for California and 38 donor states, 1970–2000.",
    dataset: "Abadie, Diamond & Hainmueller (2010), CDC/Orzechowski-Walker",
    correct: 4, // Synthetic Control
    dagIdx: 4,
    estimate: () => SYNTH_GAP,
    estimateFmt: v => isNaN(v) ? "—" : (v >= 0 ? "+" : "") + v.toFixed(1) + " packs/capita vs. donor avg",
    estimateLabel: "CA packs − equal-weight donor avg (post-1989 mean gap)",
    assumption: "Pre-treatment fit: the synthetic control (donor blend) closely tracks California's cigarette sales 1970–1988. Post-1989 divergence is attributed to Prop 99, not pre-existing differences.",
    wrongExplanations: {
      0: "States can't be randomly assigned to tobacco policy. There's no randomization here, and adjusting for observables can't account for all the ways California (a large, coastal, progressive state) differs from others.",
      1: "IV requires an instrument that shifts Prop 99 adoption without directly affecting smoking. There is no such natural instrument for a state ballot initiative.",
      2: "RDD needs a running variable with a sharp cutoff — e.g., a vote margin. Prop 99 passed as a statewide ballot measure; there's no individual unit on the margin of treatment.",
      3: "DiD with a single treated unit and 38 controls is possible (it's essentially what synthetic control does), but simple DiD assumes each donor state is an equally valid comparison. Synthetic control is strictly better here: it picks optimal weights to match California's pre-1989 trajectory and runs placebo tests to assess uncertainty.",
    },
  },
];

// ─── Main export ───────────────────────────────────────────────────────────────
export function mount(root) {
  ensureCSS();

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    caseIdx: 0,
    score: 0,
    results: [],        // { correct: bool, chosen: int } for each case
    revealed: false,
    chosen: -1,
    done: false,
  };

  // ── Springs for estimate reveal animation ──────────────────────────────────
  const estSpring = new Spring(0, { stiffness: 40, damping: 11 });
  let estTarget = 0;

  // ── Layout ─────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Method Selection",
    idea: "Identification is a modeling choice, not a default. Five real problems — NSW job-training (RCT), Card returns to schooling (IV), Lee incumbency (RDD), Card-Krueger minimum wage (difference-in-differences), Prop 99 smoking (synthetic control) — each requires a different strategy. Match the method to the assumption its causal structure can support.",
  });

  // ── Score readout + progress pips (panel) ───────────────────────────────────
  const rScore = readout({ label: "Score", value: "0 / 5", accent: "var(--gold)" });
  const rCase  = readout({ label: "Case",  value: "1 / 5", accent: "var(--accent2)" });

  const pips = CASES.map((_, i) => h("div", { class: "cap-pip" + (i === 0 ? " active" : "") }));
  const progress = h("div", { class: "cap-progress" }, [
    h("span", { text: "Progress:" }),
    h("div", { class: "cap-pips" }, pips),
  ]);

  const chal = challenge({
    goal: "Choose the correct identification strategy for all 5 real research problems.",
  });

  panel.append(
    panelSection("Progress", [
      h("div", { class: "readout-grid" }, [rScore, rCase]),
      progress,
    ]),
    panelSection("Challenge", chal),
    panelSection("Reference", [
      note("RCT / Adjust — use when treatment is randomized or all confounders are observed."),
      note("IV — use when there's a valid instrument that shifts treatment but not outcome directly."),
      note("RDD — use when treatment is assigned by a sharp rule at a known cutoff."),
      note("DiD — use when you have before/after + treated/control groups and parallel trends hold."),
      note("Synth. Control — use when there's one treated unit, many donors, and a long pre-period."),
    ]),
  );

  // ── Stage area — card + DAG + choices ─────────────────────────────────────
  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.gap = "0";
  stage.style.overflowY = "auto";

  const cardEl = h("div", { class: "cap-card" });
  stage.appendChild(cardEl);

  // ── Caption ────────────────────────────────────────────────────────────────
  caption.innerHTML =
    "Each case presents a real research question from data explored throughout this platform. " +
    "The right identification strategy is the one whose core assumption is <strong>plausible given the causal structure</strong>: " +
    "randomization (NSW, LaLonde 1986, ≈ +$1,794 training effect); " +
    "exclusion restriction (Card 1995 IV, ≈ 0.13 log pts/yr); " +
    "continuity at a cutoff (Lee 2008 RDD incumbency advantage); " +
    "parallel trends (Card &amp; Krueger 1994 DiD, ≈ +2.76 FTE/store); " +
    "pre-treatment fit (Abadie, Diamond &amp; Hainmueller 2010 synthetic control, Prop 99 ≈ −26 packs/capita). " +
    "Wrong answers explain exactly why each alternative strategy fails for that particular causal structure. " +
    "References: LaLonde (1986); Card (1995); Lee (2008); Card &amp; Krueger (1994); Abadie, Diamond &amp; Hainmueller (2010); " +
    "Angrist &amp; Pischke, <em>Mostly Harmless Econometrics</em>; Hernán &amp; Robins, <em>Causal Inference: What If</em>.";

  root.appendChild(layout);

  // ── Render functions ───────────────────────────────────────────────────────
  let dagView = null;

  function renderCase() {
    clear(cardEl);
    if (dagView) { dagView.destroy(); dagView = null; }

    const c = CASES[state.caseIdx];

    // Question block
    cardEl.appendChild(h("div", { class: "cap-question" }, [
      c.title,
      h("span", { class: "cap-dataset", text: c.detail }),
      h("span", { class: "cap-dataset", text: "📦 " + c.dataset }),
    ]));

    // Mini DAG
    const dag = makeDag(c.dagIdx);
    dagView = new DAGView(dag, { width: 480, height: 220, conditionable: false, draggableNodes: false });
    cardEl.appendChild(h("div", { class: "cap-dag-wrap" }, [dagView.svg]));

    // Method choice buttons
    const choicesEl = h("div", { class: "cap-choices" });
    METHODS.forEach((m, mi) => {
      const btn = h("button", { class: "cap-choice", type: "button" }, [m]);
      btn.addEventListener("click", () => onChoose(mi));
      choicesEl.appendChild(btn);
    });
    cardEl.appendChild(choicesEl);
  }

  function onChoose(methodIdx) {
    if (state.revealed) return;
    state.revealed = true;
    state.chosen = methodIdx;

    const c = CASES[state.caseIdx];
    const isCorrect = methodIdx === c.correct;
    if (isCorrect) state.score++;

    // Update pip
    pips[state.caseIdx].classList.remove("active");
    pips[state.caseIdx].classList.add(isCorrect ? "done-correct" : "done-wrong");

    // Disable all buttons + mark correct/wrong
    const choicesEl = cardEl.querySelector(".cap-choices");
    [...choicesEl.children].forEach((btn, bi) => {
      btn.disabled = true;
      if (bi === c.correct) btn.classList.add("correct");
      else if (bi === methodIdx && !isCorrect) btn.classList.add("wrong");
    });

    // Build reveal block
    const revealEl = h("div", { class: isCorrect ? "cap-reveal" : "cap-reveal wrong-reveal" });

    if (isCorrect) {
      revealEl.appendChild(h("p", {}, [
        h("strong", { text: "Correct. " }),
        METHODS[c.correct] + " is the right tool here.",
      ]));
      revealEl.appendChild(h("span", { class: "cap-assumption", text: "Assumption: " + c.assumption }));

      // Estimate reveal
      const rawVal = c.estimate();
      estTarget = isFinite(rawVal) ? rawVal : 0;
      estSpring.snap(0);
      estSpring.set(estTarget);

      const estValEl = h("div", { class: "cap-estimate-val", text: "—" });
      revealEl.appendChild(
        h("div", { class: "cap-estimate-row" }, [
          h("div", {}, [
            h("div", { style: { fontSize: "11px", color: "var(--dim)", fontFamily: "var(--mono)", marginBottom: "4px" }, text: c.estimateLabel }),
            estValEl,
          ]),
        ])
      );
      // Animate the estimate value via the onFrame loop
      revealEl._estValEl = estValEl;
      revealEl._c = c;
    } else {
      const whyNot = c.wrongExplanations[methodIdx] || "That method doesn't match the causal structure of this problem.";
      revealEl.appendChild(h("p", {}, [
        h("strong", { text: "Not quite. " }),
        whyNot,
      ]));
      revealEl.appendChild(h("p", { style: { marginTop: "8px" }, text: "The right method here is: " + METHODS[c.correct] + "." }));
      revealEl.appendChild(h("span", { class: "cap-assumption", text: "Assumption: " + c.assumption }));
    }

    cardEl.appendChild(revealEl);

    // Next / finish button
    const isLast = state.caseIdx === CASES.length - 1;
    const nextBtn = button(isLast ? "See final score →" : "Next case →", () => {
      state.results.push({ correct: isCorrect, chosen: methodIdx });
      if (isLast) {
        showFinalScore();
      } else {
        state.caseIdx++;
        state.revealed = false;
        state.chosen = -1;
        pips[state.caseIdx].classList.add("active");
        rCase.set((state.caseIdx + 1) + " / 5", "case");
        rScore.set(state.score + " / " + (state.caseIdx), "so far");
        renderCase();
      }
    }, { primary: true });
    nextBtn.classList.add("cap-next-btn");
    cardEl.appendChild(nextBtn);

    rScore.set(state.score + " / " + (state.caseIdx + 1), isCorrect ? "correct!" : "try next");
  }

  function showFinalScore() {
    clear(cardEl);
    if (dagView) { dagView.destroy(); dagView = null; }
    state.done = true;

    const pct = state.score / CASES.length;
    const msg = pct === 1
      ? "Perfect. You matched every problem to the identification strategy its assumptions support."
      : pct >= 0.8
      ? "Strong. You know which tool fits which causal structure — review the ones you missed."
      : pct >= 0.6
      ? "Good start. Each missed case reveals a distinct failure mode worth studying."
      : "The logic of each method is tied to a specific structural assumption — revisit the individual modules and return.";

    cardEl.appendChild(h("div", { class: "cap-score-final" }, [
      state.score + " / " + CASES.length,
      h("span", { class: "cap-score-sub", text: "cases identified correctly" }),
      h("span", { class: "cap-score-msg", text: msg }),
    ]));

    // Summary list
    const listEl = h("ul", { class: "cap-mastery-list" });
    CASES.forEach((c, i) => {
      const r = state.results[i] || { correct: false };
      listEl.appendChild(h("li", {}, [
        h("span", { class: r.correct ? "cap-check" : "cap-cross", text: r.correct ? "✓" : "✗" }),
        h("span", {}, [
          h("strong", { text: c.title + " " }),
          "→ " + METHODS[c.correct],
          r.correct ? "" : h("span", { style: { color: "var(--dim)" }, text: " (you chose: " + METHODS[r.chosen] + ")" }),
        ]),
      ]));
    });
    cardEl.appendChild(listEl);

    // Replay button
    const replayBtn = button("Try again", () => {
      state.caseIdx = 0; state.score = 0; state.results = [];
      state.revealed = false; state.chosen = -1; state.done = false;
      pips.forEach((p, i) => {
        p.className = "cap-pip" + (i === 0 ? " active" : "");
      });
      rScore.set("0 / 5", "score");
      rCase.set("1 / 5", "case");
      chal.setState(false);
      estSpring.snap(0);
      renderCase();
    }, { primary: true });
    cardEl.appendChild(replayBtn);

    // Challenge status
    if (state.score === CASES.length) {
      chal.setState(true, "All 5 cases correct — you can match identification strategy to causal structure.");
    } else {
      chal.setState(false, state.score + "/5 correct. Review the missed cases and try again.");
    }

    rScore.set(state.score + " / " + CASES.length, "final score");
  }

  // ── Animation loop (drives estimate spring toward real value) ──────────────
  const stop = onFrame((dt) => {
    estSpring.step(dt);
    // Update the animated estimate display whenever a correct reveal is visible
    const revealEl = cardEl.querySelector(".cap-reveal");
    if (revealEl && revealEl._estValEl && revealEl._c) {
      const v = estSpring.value;
      const raw = revealEl._c.estimate();
      revealEl._estValEl.textContent = isFinite(raw) ? revealEl._c.estimateFmt(v) : "—";
    }
  });

  // ── Initial render ─────────────────────────────────────────────────────────
  rScore.set("0 / 5", "score");
  rCase.set("1 / 5", "case");
  renderCase();

  return () => {
    stop();
    if (dagView) { dagView.destroy(); dagView = null; }
  };
}
