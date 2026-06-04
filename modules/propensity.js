// Propensity Scores — the big idea: conditioning on the scalar propensity score
// e(x) = P(T=1|X) balances ALL covariates X simultaneously. A high-dimensional
// confounding problem collapses to a single axis.
//
// DATA: LaLonde (1986) NSW job-training experiment + CPS comparison group.
// Dehejia & Wahba (1999) showed that matching on the propensity score
// recovers the experimental benchmark from this badly-confounded observational study.

import { h } from "../lib/dom.js";
import { mean, clamp, logisticFit } from "../lib/stats.js";
import { onFrame, Spring, ease, lerp } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot } from "../lib/plot.js";
import { lessonLayout, panelSection, slider, button, readout, challenge, note } from "../lib/ui.js";
import { rows as nsw, meta } from "../data/nsw.js";
import { rows as cps } from "../data/cps.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";

// ---- Prepare real data -------------------------------------------------------
// NSW: 445 rows; keep only rows with all needed covariates + outcome non-null.
const COVARS = ["age", "educ", "black", "hisp", "marr", "nodegree", "re74", "re75"];
const ALL_KEYS = [...COVARS, "re78", "treat"];

const nswClean = complete(nsw, ALL_KEYS);
const cpsClean = complete(cps, ALL_KEYS);

// Experimental benchmark: NSW treated vs NSW control (pure RCT)
const nswTreated  = nswClean.filter((r) => r.treat === 1);
const nswControl  = nswClean.filter((r) => r.treat === 0);
const EXPERIMENTAL_EFFECT = mean(col(nswTreated, "re78")) - mean(col(nswControl, "re78"));
// ≈ +$1,794 (Dehejia & Wahba 1999)

// Observational sample: NSW treated (T=1) + CPS rows relabelled T=0
// Subsample CPS to 500 rows for animation performance (still 500 vs 185 units).
// Use a deterministic selection: every k-th row so result is stable.
const CPS_MAX = 500;
const cpsSample = cpsClean.length <= CPS_MAX
  ? cpsClean
  : cpsClean.filter((_, i) => i % Math.ceil(cpsClean.length / CPS_MAX) === 0).slice(0, CPS_MAX);

// Build unit array: {t, re75, re78, age, educ, black, hisp, marr, nodegree, re74}
// We expose re75 + age as the 2-D covariate-space axes (closest to original viz)
let units = [
  ...nswTreated.map((r) => ({
    t: 1,
    age: r.age, educ: r.educ, black: r.black, hisp: r.hisp,
    marr: r.marr, nodegree: r.nodegree, re74: r.re74 / 1000, re75: r.re75 / 1000,
    re78: r.re78 / 1000,  // keep in $k for consistent axis
  })),
  ...cpsSample.map((r) => ({
    t: 0,
    age: r.age, educ: r.educ, black: r.black, hisp: r.hisp,
    marr: r.marr, nodegree: r.nodegree, re74: r.re74 / 1000, re75: r.re75 / 1000,
    re78: r.re78 / 1000,
  })),
];

// ---- Pre-compute z-score parameters ONCE on the full observational sample ----
// (zscore expects an array; we compute mean/sd once and reuse)
function zscoreParams(arr) {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, arr.length - 1)) || 1;
  return { m, sd };
}

const zParams = {};
const DESIGN_COVARS = ["age", "educ", "black", "hisp", "marr", "nodegree", "re74", "re75"];
for (const k of DESIGN_COVARS) {
  zParams[k] = zscoreParams(units.map((u) => u[k]));
}

function buildDesignMatrix(unitArr) {
  return unitArr.map((u) => [
    1,
    ...DESIGN_COVARS.map((k) => (u[k] - zParams[k].m) / zParams[k].sd),
  ]);
}

// ---- Propensity score fit (run once — data is fixed) -------------------------
const X_full = buildDesignMatrix(units);
const y_full = units.map((u) => u.t);
const psModel = logisticFit(X_full, y_full, 40);
for (let i = 0; i < units.length; i++) {
  units[i].ps = clamp(psModel.predict(X_full[i]), 0.001, 0.999);
}

// ---- Common support ----------------------------------------------------------
function computeSupport() {
  const psTreat = units.filter((u) => u.t === 1).map((u) => u.ps);
  const psComp  = units.filter((u) => u.t === 0).map((u) => u.ps);
  const loSupport = Math.max(Math.min(...psTreat), Math.min(...psComp));
  const hiSupport = Math.min(Math.max(...psTreat), Math.max(...psComp));
  for (const u of units) {
    u.inSupport = u.ps >= loSupport && u.ps <= hiSupport;
  }
  return { loSupport, hiSupport };
}

computeSupport();

// ---- Estimators --------------------------------------------------------------
function naiveDiff() {
  // NSW treated mean re78 minus CPS comparison mean re78 (in $)
  const yT = units.filter((u) => u.t === 1).map((u) => u.re78);
  const yC = units.filter((u) => u.t === 0).map((u) => u.re78);
  return (mean(yT) - mean(yC)) * 1000;
}

// IPW ATE on in-support sample (Horvitz-Thompson)
function ipwEstimate() {
  const inSupport = units.filter((u) => u.inSupport);
  if (inSupport.length < 10) return NaN;
  const n = inSupport.length;
  let sumT = 0, sumC = 0;
  for (const u of inSupport) {
    sumT += (u.t * u.re78) / u.ps;
    sumC += ((1 - u.t) * u.re78) / (1 - u.ps);
  }
  return ((sumT - sumC) / n) * 1000;
}

// ---- Match each treated unit to nearest comparison unit in propensity score --
let matches = [];
function computeMatches(caliper) {
  matches = [];
  const treated = units.map((u, i) => ({ ...u, idx: i })).filter((u) => u.t === 1 && u.inSupport);
  const comps   = units.map((u, i) => ({ ...u, idx: i })).filter((u) => u.t === 0 && u.inSupport);
  for (const tr of treated) {
    let best = null, bestD = Infinity;
    for (const cp of comps) {
      const d = Math.abs(tr.ps - cp.ps);
      if (d < bestD) { bestD = d; best = cp; }
    }
    // Respect caliper
    if (best && (caliper <= 0 || bestD <= caliper)) {
      matches.push({ tiIdx: tr.idx, ciIdx: best.idx, dist: bestD });
    }
  }
}

// Matched ATT
function matchedATT() {
  if (matches.length === 0) return NaN;
  const diffs = matches.map((m) => (units[m.tiIdx].re78 - units[m.ciIdx].re78) * 1000);
  return mean(diffs);
}

export function mount(root) {
  // Inject CSS once
  if (!document.getElementById("propensity-css")) {
    const style = document.createElement("style");
    style.id = "propensity-css";
    style.textContent = `
      .ps-stage-title { font: 11px var(--mono, monospace); color: var(--dim); margin: 0 0 4px 0; letter-spacing: 0.03em; }
      .ps-legend { display: flex; gap: 14px; flex-wrap: wrap; font: 11px var(--mono, monospace); color: var(--dim); margin-top: 6px; align-items: center; }
      .ps-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
      .ps-overlap-badge { font: 11px var(--mono,monospace); color: var(--accent2); }
    `;
    document.head.appendChild(style);
  }

  // ---- State ------------------------------------------------------------------
  const state = {
    caliper: 0.05,    // propensity score caliper for matching (0 = no caliper)
    collapsed: false,
    matched: false,
  };

  // ---- Animation state -------------------------------------------------------
  const collapseSpring = new Spring(0, { stiffness: 55, damping: 14 });
  const matchSpring    = new Spring(0, { stiffness: 50, damping: 14 });
  const unmatchedAlpha = new Spring(1, { stiffness: 40, damping: 12 });
  const MAX_STAGGER = 0.3;

  // ---- Canvas / layout -------------------------------------------------------
  const CV_W = 560, CV_H_COV = 360, CV_H_PS = 180;

  const cvCov = new Canvas(CV_W, CV_H_COV, { margin: { t: 20, r: 20, b: 44, l: 58 } });
  const cvPs  = new Canvas(CV_W, CV_H_PS,  { margin: { t: 28, r: 20, b: 44, l: 58 } });

  const covWrap = h("div", {}, [
    h("p", { class: "ps-stage-title", text: "covariate space — prior earnings re75 ($k) × age" }),
    cvCov.el,
  ]);
  const psWrap = h("div", {}, [
    h("p", { class: "ps-stage-title", text: "propensity score axis  e(x) = P(treated | age, educ, race, marr, re74, re75)" }),
    cvPs.el,
  ]);

  const legendEl = h("div", { class: "ps-legend" }, [
    h("span", {}, [h("span", { class: "ps-swatch", style: { background: "var(--treat)" } }), "NSW treated (T=1, n=" + nswTreated.length + ")"]),
    h("span", {}, [h("span", { class: "ps-swatch", style: { background: "var(--ctrl)" } }), "CPS comparison (T=0, n=" + cpsSample.length + ")"]),
    h("span", {}, [h("span", { class: "ps-swatch", style: { background: "var(--accent2)", borderRadius: "2px", width: "16px" } }), "common support"]),
    h("span", {}, [h("span", { class: "ps-swatch", style: { background: "var(--gold)", borderRadius: "0", width: "2px", height: "14px", display: "inline-block" } }), "experimental benchmark"]),
  ]);

  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Propensity Scores",
    idea: "A single number — the probability of treatment given covariates — encodes all confounding information. Units with the same propensity score are as good as randomized to each other.",
  });

  stage.append(covWrap, psWrap, legendEl);

  // ---- Readouts ---------------------------------------------------------------
  const rNaive   = readout({ label: "Naive difference",       value: "—",     accent: "var(--neg)" });
  const rIPW     = readout({ label: "IPW / matched est.",     value: "—",     accent: "var(--pos)" });
  const rBench   = readout({ label: "Experimental benchmark", value: "+$" + Math.round(EXPERIMENTAL_EFFECT).toLocaleString(), accent: "var(--gold)" });
  const rOverlap = readout({ label: "Common support",         value: "—",     accent: "var(--accent2)" });

  // ---- Buttons ----------------------------------------------------------------
  const collapseBtn = button("▼ Collapse to propensity axis", () => {
    if (!state.collapsed) {
      state.collapsed = true;
      collapseSpring.set(1);
      collapseBtn.textContent = "▲ Back to covariate space";
      matchBtn.disabled = false;
    } else {
      state.collapsed = false;
      state.matched = false;
      collapseSpring.set(0);
      matchSpring.snap(0);
      unmatchedAlpha.snap(1);
      collapseBtn.textContent = "▼ Collapse to propensity axis";
      matchBtn.disabled = true;
      matchBtn.textContent = "◎ Match on propensity score";
      chal.setState(false);
    }
  }, { primary: true });

  const matchBtn = button("◎ Match on propensity score", () => {
    if (!state.collapsed) return;
    if (!state.matched) {
      computeMatches(state.caliper);
      state.matched = true;
      matchSpring.set(1);
      unmatchedAlpha.set(0);
      matchBtn.textContent = "✕ Unmatch";
    } else {
      state.matched = false;
      matchSpring.set(0);
      unmatchedAlpha.set(1);
      matchBtn.textContent = "◎ Match on propensity score";
    }
  });
  matchBtn.disabled = true;

  const caliperSlider = slider({
    label: "Caliper (max PS distance)",
    min: 0.00, max: 0.20, step: 0.005, value: state.caliper,
    fmt: (v) => v === 0 ? "none" : v.toFixed(3),
    hint: "max |e(treated) − e(control)| allowed for a match (0 = nearest neighbour, no caliper)",
    onInput: (v) => {
      state.caliper = v;
      if (state.matched) {
        computeMatches(state.caliper);
        updateReadouts();
        checkChallenge();
      }
    },
  });

  const chal = challenge({
    goal: "Collapse to the propensity score, then match — recovering the experimental benchmark (~$" + Math.round(EXPERIMENTAL_EFFECT).toLocaleString() + ") from the badly-biased naive comparison.",
  });

  panel.append(
    panelSection("Data", [dataBadge(meta)]),
    panelSection("Estimators", h("div", { class: "readout-grid" }, [rNaive, rIPW, rBench, rOverlap])),
    panelSection("Controls", [
      h("div", { class: "btn-row", style: { marginBottom: "8px" } }, [collapseBtn, matchBtn]),
      caliperSlider,
      note("CPS controls are much richer and older than NSW participants — naive difference is hugely negative. Matching on the propensity score (fit on 8 covariates) recovers the experimental truth."),
    ]),
    panelSection("Challenge", chal),
  );

  caption.innerHTML =
    "<strong>LaLonde 1986; Dehejia &amp; Wahba 1999</strong>. " +
    "NSW treated units (orange, <em>n</em>=" + nswTreated.length + ") vs. CPS non-experimental comparison (blue, <em>n</em>=" + cpsSample.length + "). " +
    "The CPS group is far richer with higher prior earnings, so the naive difference ≈ −$10,000 is heavily confounded. " +
    "The <strong>propensity score</strong> e(x)=P(T=1|x) is fit by logistic regression on age, education, race, marital status, and prior earnings (re74, re75). " +
    "Collapsing to this single axis and matching each treated unit to its nearest CPS control in propensity score recovers an estimate close to the " +
    "experimental benchmark of +$" + Math.round(EXPERIMENTAL_EFFECT).toLocaleString() + " — demonstrating that matching on the propensity score corrects selection bias when the propensity is correctly specified.";

  root.appendChild(layout);

  // ---- Scales for covariate canvas -------------------------------------------
  // Use re75 (x) and age (y) as the visible 2-D axes (most discriminating pair)
  const re75s = units.map((u) => u.re75);
  const ages  = units.map((u) => u.age);
  const re75Lo = Math.max(0, Math.min(...re75s) - 0.5);
  const re75Hi = Math.min(Math.max(...re75s) + 1, 30);
  const ageLo  = Math.min(...ages) - 1;
  const ageHi  = Math.max(...ages) + 1;

  const cScales = {
    sx: new Scale([re75Lo, re75Hi], [cvCov.box.x0, cvCov.box.x1]),
    sy: new Scale([ageLo, ageHi],   [cvCov.box.y1, cvCov.box.y0]),
  };

  const PS_AXIS_Y = cvPs.box.y0 + cvPs.ih / 2;

  // Pre-compute target positions and stagger per unit
  function computeTargets() {
    const sxPs = new Scale([0, 1], [cvPs.box.x0, cvPs.box.x1]);
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      u.covX = cScales.sx.map(u.re75);
      u.covY = cScales.sy.map(u.age);
      u.psX  = sxPs.map(u.ps);
      u.psY  = PS_AXIS_Y;
      // Use a seeded-ish stagger based on index for deterministic order
      u.stagger = (i * 0.618033) % 1; // golden ratio spread
    }
  }

  computeTargets();
  updateReadouts();

  // ---- Main draw loop ---------------------------------------------------------
  const stop = onFrame((dt) => {
    collapseSpring.step(dt);
    matchSpring.step(dt);
    unmatchedAlpha.step(dt);

    drawCovCanvas();
    drawPsCanvas();
    updateReadouts();
    checkChallenge();
  });

  // ---- Draw covariate scatter -------------------------------------------------
  function drawCovCanvas() {
    const cv = cvCov;
    cv.clear();
    const ctx = cv.ctx;
    const { sx, sy } = cScales;
    const k = collapseSpring.value;

    drawAxes(cv, sx, sy, {
      xlabel: "prior earnings re75 ($k)",
      ylabel: "age (years)",
      grid: true,
    });

    const alpha0 = 1 - k;
    if (alpha0 > 0.01) {
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        const isMatchedComp = state.matched && matches.some((m) => m.ciIdx === i);
        let alpha = alpha0;
        if (u.t === 0 && !u.inSupport) alpha *= 0.25;
        if (u.t === 0 && !isMatchedComp && state.matched) alpha *= unmatchedAlpha.value;
        const color = u.t === 1 ? "var(--treat)" : "var(--ctrl)";
        dot(ctx, u.covX, u.covY, 3.5, color, { alpha: clamp(alpha, 0, 1) });
      }
    }
  }

  // ---- Draw propensity axis ---------------------------------------------------
  function drawPsCanvas() {
    const cv = cvPs;
    cv.clear();
    const ctx = cv.ctx;
    const k = collapseSpring.value;

    const sxPs = new Scale([0, 1], [cv.box.x0, cv.box.x1]);
    const syPs = new Scale([0, 1], [cv.box.y1, cv.box.y0]);

    drawAxes(cv, sxPs, syPs, {
      xlabel: "propensity score  e(x) = P(T=1 | age, educ, race, marr, re74, re75)",
      grid: false,
    });

    // Common support band
    if (k > 0.1) {
      const { loSupport: lo, hiSupport: hi } = computeSupport();
      const x0 = sxPs.map(lo), x1 = sxPs.map(hi);
      ctx.globalAlpha = 0.18 * Math.min(1, k * 2);
      ctx.fillStyle = "var(--accent2)";
      ctx.fillRect(x0, cv.box.y0, x1 - x0, cv.ih);
      ctx.globalAlpha = 1;

      ctx.globalAlpha = 0.5 * Math.min(1, k * 2);
      ctx.strokeStyle = "var(--accent2)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x0, cv.box.y0); ctx.lineTo(x0, cv.box.y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, cv.box.y0); ctx.lineTo(x1, cv.box.y1); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      ctx.fillStyle = "var(--accent2)";
      ctx.font = "10px var(--mono, monospace)";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.globalAlpha = Math.min(1, (k - 0.4) * 3);
      ctx.fillText("common support", (x0 + x1) / 2, cv.box.y0 + 3);
      ctx.globalAlpha = 1;
    }

    // Match threads
    const mAlpha = matchSpring.value;
    if (mAlpha > 0.01) {
      for (const m of matches) {
        const tu = units[m.tiIdx];
        const cu = units[m.ciIdx];
        const tx = sxPs.map(tu.ps), cx = sxPs.map(cu.ps);
        const threadY = PS_AXIS_Y - 18;
        ctx.globalAlpha = mAlpha * 0.55;
        ctx.strokeStyle = "var(--gold)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, PS_AXIS_Y - 5);
        ctx.bezierCurveTo(tx, threadY, cx, threadY, cx, PS_AXIS_Y - 5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Experimental benchmark label
    if (k > 0.3) {
      const benchLabel = "+$" + Math.round(EXPERIMENTAL_EFFECT).toLocaleString();
      ctx.globalAlpha = Math.min(1, (k - 0.3) * 4);
      ctx.fillStyle = "var(--gold)";
      ctx.font = "bold 11px var(--mono, monospace)";
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText("← benchmark: " + benchLabel, cv.box.x1 - 4, cv.box.y0 + 14);
      ctx.globalAlpha = 1;
    }

    // Units on propensity axis — fly from above
    const uAlpha = unmatchedAlpha.value;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const localK = clamp((k - u.stagger * MAX_STAGGER) / (1 - MAX_STAGGER * 0.5), 0, 1);
      const easedK = ease.outBack(localK);

      const flyFromY = cv.box.y0 - 40 - u.stagger * 60;
      const px = u.psX;
      const py = lerp(flyFromY, PS_AXIS_Y, easedK);

      let alpha = easedK;
      if (u.t === 0 && !u.inSupport) alpha *= 0.18;
      if (u.t === 0 && !matches.some((m) => m.ciIdx === i) && state.matched) {
        alpha *= lerp(1, 0.1, uAlpha === 0 ? matchSpring.value : 1 - uAlpha);
      }

      if (alpha < 0.01 || easedK < 0.01) continue;

      const color = u.t === 1 ? "var(--treat)" : "var(--ctrl)";
      const r = u.inSupport ? 3.8 : 2.5;
      dot(ctx, px, py, r, color, { alpha: clamp(alpha, 0, 1) });
    }
  }

  // ---- Readouts ---------------------------------------------------------------
  function updateReadouts() {
    const naive = naiveDiff();
    rNaive.set(
      (naive >= 0 ? "+" : "") + "$" + Math.abs(Math.round(naive)).toLocaleString(),
      naive < 0 ? "biased (confounded)" : "near benchmark",
    );

    if (state.collapsed) {
      const { loSupport: lo, hiSupport: hi } = computeSupport();
      const inSup = units.filter((u) => u.inSupport).length;
      rOverlap.set(`[${lo.toFixed(2)}, ${hi.toFixed(2)}]`, `${inSup}/${units.length} units in support`);

      if (state.matched && matches.length > 0) {
        const att = matchedATT();
        if (!isNaN(att)) {
          rIPW.set(
            (att >= 0 ? "+" : "") + "$" + Math.abs(Math.round(att)).toLocaleString(),
            `matched ATT (${matches.length} pairs)`,
          );
        }
      } else {
        const ipw = ipwEstimate();
        if (!isNaN(ipw)) {
          rIPW.set(
            (ipw >= 0 ? "+" : "") + "$" + Math.abs(Math.round(ipw)).toLocaleString(),
            "IPW ATE (in-support)",
          );
        } else {
          rIPW.set("—", "collapse first");
        }
      }
    } else {
      rIPW.set("—", "collapse to propensity axis");
      const inSup = units.filter((u) => u.inSupport).length;
      rOverlap.set(`${inSup}/${units.length}`, "units in common support");
    }
  }

  // ---- Challenge check --------------------------------------------------------
  function checkChallenge() {
    if (!state.collapsed || !state.matched || matches.length === 0) return;
    const att = matchedATT();
    if (!isNaN(att) && Math.abs(att - EXPERIMENTAL_EFFECT) < 600) {
      chal.setState(
        true,
        `Matched ATT = +$${Math.round(att).toLocaleString()} ≈ benchmark +$${Math.round(EXPERIMENTAL_EFFECT).toLocaleString()} — propensity score works!`,
      );
    }
  }

  return () => stop();
}
