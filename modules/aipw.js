// Doubly-Robust (AIPW) Estimation + Influence Functions on REAL IHDP data.
// Combines an outcome model μ̂_a(x) and a propensity model ê(x) so that
// ONLY ONE of the two needs to be correctly specified — "double robustness".
// Efficient Influence Function (EIF) gives honest CIs and semiparametric
// efficiency. Robins & Rotnitzky 1994; Bang & Robins 2005; Chernozhukov et al. 2018.

import { h } from "../lib/dom.js";
import { rows, meta } from "../data/ihdp.js";
import { zscore, dataBadge } from "../lib/data.js";
import { mean, std, olsMulti, logisticFit, clamp } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot, histogram } from "../lib/plot.js";
import { lessonLayout, panelSection, toggle, button, readout, challenge, note } from "../lib/ui.js";

// ── inject CSS once ─────────────────────────────────────────────────────────
if (!document.getElementById("aipw-css")) {
  const sty = document.createElement("style");
  sty.id = "aipw-css";
  sty.textContent = `
    .aipw-stage    { display:flex; flex-direction:column; gap:10px; align-items:center; }
    .aipw-plots    { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
    .aipw-plot-wrap{ display:flex; flex-direction:column; align-items:center; gap:2px; }
    .aipw-plot-lbl { font:11px ui-monospace,monospace; color:var(--dim); margin:0; text-align:center; }
    .aipw-model-row{ display:flex; gap:10px; flex-wrap:wrap; margin-bottom:2px; }
    .aipw-model-box{ border:1px solid var(--line); border-radius:6px; padding:6px 10px;
                     display:flex; flex-direction:column; gap:4px; flex:1 1 160px; }
    .aipw-model-title { font:bold 11px ui-monospace,monospace; color:var(--dim); margin:0; }
    .aipw-badge    { display:inline-block; border-radius:3px; padding:1px 5px;
                     font:bold 10px ui-monospace,monospace; margin-left:4px; }
    .aipw-correct  { background:rgba(54,214,195,.18); color:var(--pos); }
    .aipw-wrong    { background:rgba(255,107,138,.18); color:var(--neg); }
  `;
  document.head.appendChild(sty);
}

// ── IHDP data prep ───────────────────────────────────────────────────────────
// All 747 rows are complete; x1..x6 are continuous, x7 onwards are dummies.
// TRUE ATE = mean(mu1 − mu0) ≈ 4.0 — the gold IHDP benchmark.
const COVAR_KEYS = ["x1", "x2", "x3", "x4", "x5", "x6"];
const N = rows.length;

// z-score continuous covariates (already z-scored in dataset but re-do for
// consistency and so the intercept-only misspecification is meaningful).
const covCols = COVAR_KEYS.map((k) => zscore(rows.map((r) => r[k])).z);
const Xcov = rows.map((_, i) => covCols.map((c) => c[i])); // n × 6, z-scored

const T = rows.map((r) => r.t);
const Y = rows.map((r) => r.yf);
const trueATE = mean(rows.map((r) => r.mu1 - r.mu0)); // ≈ 4.03

// Pre-build OLS design matrices with intercept
// Full: [1, x1..x6];  Intercept-only: [1]
const Xfull_1   = rows.map((_, i) => [1, ...Xcov[i]]);              // n × 7
const Xintercept = rows.map(() => [1]);                               // n × 1

// Treatment/control masks
const idxT = rows.map((_, i) => i).filter((i) => T[i] === 1);
const idxC = rows.map((_, i) => i).filter((i) => T[i] === 0);

// ── Estimate propensity ──────────────────────────────────────────────────────
function fitPropensity(correct) {
  // correct: logistic(intercept + x1..x6)
  // wrong  : intercept-only (constant propensity = p̄)
  const XProp = correct ? Xfull_1 : Xintercept;
  const fit = logisticFit(XProp, T, 20);
  return rows.map((_, i) => clamp(fit.predict(XProp[i]), 0.02, 0.98));
}

// ── Estimate outcome model ───────────────────────────────────────────────────
// Fit two OLS models: Y ~ 1 + x1..x6 for T=1 and T=0 separately.
// Misspecification: intercept-only model for each arm.
function fitOutcome(correct) {
  // Build sub-design matrices for treated / control
  const makeX = (idx, full) => idx.map((i) => (full ? Xfull_1[i] : Xintercept[i]));
  const Xt = makeX(idxT, correct);
  const Xc = makeX(idxC, correct);
  const Yt = idxT.map((i) => Y[i]);
  const Yc = idxC.map((i) => Y[i]);

  const fitT = olsMulti(Xt, Yt);
  const fitC = olsMulti(Xc, Yc);

  // Predict mu1, mu0 for every unit
  const mu1 = rows.map((_, i) => {
    const x = correct ? Xfull_1[i] : Xintercept[i];
    return fitT.beta.reduce((s, b, j) => s + b * x[j], 0);
  });
  const mu0 = rows.map((_, i) => {
    const x = correct ? Xfull_1[i] : Xintercept[i];
    return fitC.beta.reduce((s, b, j) => s + b * x[j], 0);
  });
  return { mu1, mu0 };
}

// ── AIPW influence-function scores ──────────────────────────────────────────
function computeEstimates(outcomeCorrect, propensityCorrect) {
  const eProp = fitPropensity(propensityCorrect);
  const { mu1, mu0 } = fitOutcome(outcomeCorrect);

  // G-formula (outcome regression) — ATE_reg
  const psiReg = rows.map((_, i) => mu1[i] - mu0[i]);
  const ateReg = mean(psiReg);

  // IPW — ATE_ipw
  const ateIpw = mean(
    rows.map((_, i) => T[i] * Y[i] / eProp[i] - (1 - T[i]) * Y[i] / (1 - eProp[i]))
  );

  // AIPW (doubly-robust) — EIF scores ψ_i
  const psiAipw = rows.map((_, i) => {
    const aug = T[i] / eProp[i] * (Y[i] - mu1[i]) - (1 - T[i]) / (1 - eProp[i]) * (Y[i] - mu0[i]);
    return (mu1[i] - mu0[i]) + aug;
  });
  const ateAipw = mean(psiAipw);

  // Influence-function SE: se = std(psi)/sqrt(n)
  const seAipw = std(psiAipw) / Math.sqrt(N);
  const ci95Lo = ateAipw - 1.96 * seAipw;
  const ci95Hi = ateAipw + 1.96 * seAipw;

  return { ateReg, ateIpw, ateAipw, seAipw, ci95Lo, ci95Hi, psiAipw, psiReg, eProp, mu1, mu0 };
}

// ── Initial computation (both correct) ──────────────────────────────────────
let results = computeEstimates(true, true);

// ── Mount ────────────────────────────────────────────────────────────────────
export function mount(root) {
  const title = "Doubly-Robust Estimation (AIPW)";
  const idea =
    "Combine an outcome model μ̂(x) and a propensity model ê(x). " +
    "Break either one alone — AIPW stays on target. " +
    "Break both — and it finally fails. That is double robustness.";

  const { root: layout, stage, panel, caption } = lessonLayout({ title, idea });
  root.appendChild(layout);

  // ── state ──────────────────────────────────────────────────────────────────
  const state = {
    outcomeCorrect:    true,
    propensityCorrect: true,
    dirty: false,
  };

  // Springs for three estimate values + CI bounds
  const spReg  = new Spring(results.ateReg,   { stiffness: 60, damping: 14 });
  const spIpw  = new Spring(results.ateIpw,   { stiffness: 60, damping: 14 });
  const spAipw = new Spring(results.ateAipw,  { stiffness: 60, damping: 14 });
  const spCiLo = new Spring(results.ci95Lo,   { stiffness: 60, damping: 14 });
  const spCiHi = new Spring(results.ci95Hi,   { stiffness: 60, damping: 14 });

  function setTargets(r) {
    spReg .set(r.ateReg);
    spIpw .set(r.ateIpw);
    spAipw.set(r.ateAipw);
    spCiLo.set(r.ci95Lo);
    spCiHi.set(r.ci95Hi);
  }
  setTargets(results);

  function recompute() {
    results = computeEstimates(state.outcomeCorrect, state.propensityCorrect);
    setTargets(results);
    updateReadouts();
    updateChallenge();
  }

  // ── canvases ───────────────────────────────────────────────────────────────
  // Main: number-line with CIs
  const cvLine  = new Canvas(560, 130, { margin: { t: 30, r: 28, b: 36, l: 28 } });
  // Histogram of EIF scores ψ
  const cvPsi   = new Canvas(280, 200, { margin: { t: 22, r: 16, b: 36, l: 48 } });
  // Propensity histogram
  const cvProp  = new Canvas(260, 200, { margin: { t: 22, r: 16, b: 36, l: 48 } });

  stage.className = "aipw-stage";
  stage.append(
    h("div", { class: "aipw-plot-wrap" }, [
      h("p", { class: "aipw-plot-lbl", text: "ATE estimates with 95% CI  (gold line = true ATE = mean(μ₁−μ₀) ≈ 4.0)" }),
      cvLine.el,
    ]),
    h("div", { class: "aipw-plots" }, [
      h("div", { class: "aipw-plot-wrap" }, [
        h("p", { class: "aipw-plot-lbl", text: "influence-function scores  ψᵢ  (spread → SE)" }),
        cvPsi.el,
      ]),
      h("div", { class: "aipw-plot-wrap" }, [
        h("p", { class: "aipw-plot-lbl", text: "estimated propensity  ê(x)  (flat = misspecified)" }),
        cvProp.el,
      ]),
    ]),
  );

  // ── readouts ───────────────────────────────────────────────────────────────
  const rTrue  = readout({ label: "True ATE",     value: trueATE.toFixed(2),  accent: "var(--gold)" });
  const rReg   = readout({ label: "Outcome-reg",  value: "—",                 accent: "var(--accent2)" });
  const rIpw   = readout({ label: "IPW",          value: "—",                 accent: "var(--accent)" });
  const rAipw  = readout({ label: "AIPW ± 95%CI", value: "—",                 accent: "var(--pos)" });
  const rSE    = readout({ label: "EIF SE",       value: "—" });
  const rN     = readout({ label: "N",            value: String(N) });

  function updateReadouts() {
    const r = results;
    rReg .set(r.ateReg .toFixed(3));
    rIpw .set(r.ateIpw .toFixed(3));
    rAipw.set(`${r.ateAipw.toFixed(3)} ± ${(1.96 * r.seAipw).toFixed(3)}`);
    rSE  .set(r.seAipw  .toFixed(4));
  }
  updateReadouts();

  // ── challenge ──────────────────────────────────────────────────────────────
  const chal = challenge({
    goal: "Break exactly one model (outcome OR propensity) — confirm AIPW stays near the gold line while the matching single-method estimate drifts. Then break both and watch AIPW finally fail.",
  });

  let chalPhase = 0; // 0=start 1=one-broke 2=both-broke
  function updateChallenge() {
    const r = results;
    const oc = state.outcomeCorrect, pc = state.propensityCorrect;
    const ateGap = Math.abs(r.ateAipw - trueATE);
    const regGap = Math.abs(r.ateReg  - trueATE);
    const ipwGap = Math.abs(r.ateIpw  - trueATE);

    if (!oc && pc) {
      // outcome wrong, propensity correct: IPW & AIPW should be ok, reg should be off
      if (ateGap < 1.2 && regGap > 1.0) {
        chalPhase = Math.max(chalPhase, 1);
        chal.setState(chalPhase >= 2, chalPhase >= 2
          ? `Now both wrong: AIPW = ${r.ateAipw.toFixed(2)}, bias = ${ateGap.toFixed(2)}. Robustness fails.`
          : `Outcome misspecified: Reg bias=${regGap.toFixed(2)}, AIPW bias=${ateGap.toFixed(2)}. AIPW survives!`
        );
        return;
      }
    }
    if (oc && !pc) {
      // propensity wrong, outcome correct: reg & AIPW should be ok, IPW should be off
      if (ateGap < 1.2 && ipwGap > 0.5) {
        chalPhase = Math.max(chalPhase, 1);
        chal.setState(chalPhase >= 2, chalPhase >= 2
          ? `Now both wrong: AIPW = ${r.ateAipw.toFixed(2)}, bias = ${ateGap.toFixed(2)}.`
          : `Propensity misspecified: IPW bias=${ipwGap.toFixed(2)}, AIPW bias=${ateGap.toFixed(2)}. AIPW survives!`
        );
        return;
      }
    }
    if (!oc && !pc) {
      if (ateGap > 1.0) {
        chalPhase = Math.max(chalPhase, 2);
        chal.setState(true,
          `Both wrong: AIPW = ${r.ateAipw.toFixed(2)}, bias = ${ateGap.toFixed(2)}. Double robustness fails with both misspecified.`
        );
        return;
      }
    }
    if (chalPhase < 2) chal.setState(false);
  }

  // ── controls ───────────────────────────────────────────────────────────────
  const tglOutcome = toggle({
    label: "Outcome model",
    value: true,
    hint: "(toggle to misspecify μ̂)",
    onToggle: (v) => { state.outcomeCorrect = v; recompute(); },
  });
  const tglProp = toggle({
    label: "Propensity model",
    value: true,
    hint: "(toggle to misspecify ê)",
    onToggle: (v) => { state.propensityCorrect = v; recompute(); },
  });

  // Model status badges
  const badgeOut  = h("span", { class: "aipw-badge aipw-correct", text: "✓ correct" });
  const badgeProp = h("span", { class: "aipw-badge aipw-correct", text: "✓ correct" });

  function updateBadge(badge, correct) {
    badge.className = `aipw-badge ${correct ? "aipw-correct" : "aipw-wrong"}`;
    badge.textContent = correct ? "✓ correct" : "✗ misspecified";
  }

  // Wrap toggles with badges
  const outRow  = h("div", { class: "aipw-model-box" }, [
    h("p", { class: "aipw-model-title" }, ["Outcome μ̂(x)  ", badgeOut]),
    tglOutcome,
    h("p", { class: "aipw-plot-lbl", text: "correct: OLS with x1–x6 for each arm  |  wrong: arm-mean only" }),
  ]);
  const propRow = h("div", { class: "aipw-model-box" }, [
    h("p", { class: "aipw-model-title" }, ["Propensity ê(x)  ", badgeProp]),
    tglProp,
    h("p", { class: "aipw-plot-lbl", text: "correct: logistic(x1–x6)  |  wrong: intercept-only (constant)" }),
  ]);

  // Override toggle to also update badge
  tglOutcome.querySelector("button").addEventListener("click", () => {
    updateBadge(badgeOut, state.outcomeCorrect);
  });
  tglProp.querySelector("button").addEventListener("click", () => {
    updateBadge(badgeProp, state.propensityCorrect);
  });

  const btnReset = button("reset both → correct", () => {
    state.outcomeCorrect = true;
    state.propensityCorrect = true;
    tglOutcome.set(true);
    tglProp.set(true);
    updateBadge(badgeOut, true);
    updateBadge(badgeProp, true);
    recompute();
  });

  const badge = dataBadge(meta);
  panel.prepend(badge);

  panel.append(
    panelSection("True Gold", h("div", { class: "readout-grid" }, [rTrue, rN])),
    panelSection("Estimates", h("div", { class: "readout-grid" }, [rReg, rIpw, rAipw, rSE])),
    panelSection("Models", [
      h("div", { class: "aipw-model-row" }, [outRow, propRow]),
      h("div", { class: "btn-row", style: { marginTop: "8px" } }, [btnReset]),
    ]),
    panelSection("Challenge", chal),
    panelSection("", [
      note("AIPW = Augmented IPW. The EIF score ψᵢ = (μ̂₁−μ̂₀) + T/ê·(Y−μ̂₁) − (1−T)/(1−ê)·(Y−μ̂₀) is the efficient influence function. It achieves the semiparametric efficiency bound and its sample mean is the AIPW estimator."),
    ]),
  );

  caption.innerHTML =
    "<strong>Doubly-Robust / AIPW formula:</strong> " +
    "ψᵢ = (μ̂₁(xᵢ)−μ̂₀(xᵢ)) + Tᵢ/ê(xᵢ)·(Yᵢ−μ̂₁(xᵢ)) − (1−Tᵢ)/(1−ê(xᵢ))·(Yᵢ−μ̂₀(xᵢ)); " +
    "ATE = mean(ψ); SE = sd(ψ)/√n. " +
    "The score ψ is the <em>efficient influence function (EIF)</em>: if either model is correct, " +
    "the augmentation term has mean zero, so ATE_AIPW is consistent regardless of which nuisance is wrong. " +
    "It also achieves the semiparametric efficiency bound — the smallest possible variance. " +
    "Misspecify <em>both</em> and the mean-zero property fails; double robustness is lost. " +
    "<strong>Data:</strong> IHDP (Hill 2011) — real covariates x₁–x₆, simulated potential outcomes, " +
    "true ATE = mean(μ₁−μ₀) ≈ 4.0 (gold benchmark). Outcome model: OLS per arm (correct) or arm-mean (wrong). " +
    "Propensity: logistic regression on x₁–x₆ (correct) or intercept-only (wrong, constant ê). " +
    "— Robins &amp; Rotnitzky 1994; Bang &amp; Robins 2005; Chernozhukov et al. 2018.";

  // ── drawing ─────────────────────────────────────────────────────────────────

  // Color palette for the three estimators
  const C_REG  = "#7c6cff"; // accent2-like
  const C_IPW  = "#36b8f5"; // accent-like
  const C_AIPW = "#36d6c3"; // pos-like
  const C_GOLD = "var(--gold)";

  function drawNumberLine(cv) {
    cv.clear();
    const ctx = cv.ctx;

    const regV  = spReg .value;
    const ipwV  = spIpw .value;
    const aipwV = spAipw.value;
    const ciLo  = spCiLo.value;
    const ciHi  = spCiHi.value;

    // Domain: cover all estimates + true ATE with padding
    const all = [regV, ipwV, aipwV, ciLo, ciHi, trueATE, 0];
    const pad = 1.5;
    const lo = Math.min(...all) - pad;
    const hi = Math.max(...all) + pad;
    const sx = new Scale([lo, hi], [cv.box.x0, cv.box.x1]);
    const midY = (cv.box.y0 + cv.box.y1) / 2;
    const lineY = midY + 10;

    // Axis baseline
    ctx.strokeStyle = "var(--line)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cv.box.x0, lineY);
    ctx.lineTo(cv.box.x1, lineY);
    ctx.stroke();

    // Tick labels
    function niceTicks(dlo, dhi, n) {
      const span = dhi - dlo || 1;
      const step0 = span / n;
      const mag = Math.pow(10, Math.floor(Math.log10(step0)));
      const norm = step0 / mag;
      let step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
      step *= mag;
      const start = Math.ceil(dlo / step) * step;
      const ticks = [];
      for (let v = start; v <= dhi + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
      return ticks;
    }
    const ticks = niceTicks(lo, hi, 7);
    ctx.fillStyle = "var(--dim)";
    ctx.font = "10px ui-monospace,monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const t of ticks) {
      const x = sx.map(t);
      ctx.beginPath();
      ctx.moveTo(x, lineY - 3);
      ctx.lineTo(x, lineY + 3);
      ctx.strokeStyle = "var(--dim)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillText(t.toFixed(1), x, lineY + 6);
    }

    // True ATE gold vertical band
    const goldX = sx.map(trueATE);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = C_GOLD;
    ctx.fillRect(goldX - 6, cv.box.y0, 12, cv.box.y1 - cv.box.y0);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C_GOLD;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(goldX, cv.box.y0);
    ctx.lineTo(goldX, lineY + 3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C_GOLD;
    ctx.font = "bold 11px ui-monospace,monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`true ATE ${trueATE.toFixed(2)}`, goldX, cv.box.y0 + 1);
    ctx.restore();

    // Draw estimate points with labels
    const estimates = [
      { v: regV,  y: midY - 28, color: C_REG,  label: "Outcome-reg" },
      { v: ipwV,  y: midY - 8,  color: C_IPW,  label: "IPW" },
      { v: aipwV, y: midY + 12, color: C_AIPW, label: "AIPW" },
    ];

    // AIPW CI bar
    ctx.save();
    ctx.strokeStyle = C_AIPW;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    const ciY = midY + 12;
    const x0ci = sx.map(ciLo), x1ci = sx.map(ciHi);
    ctx.beginPath(); ctx.moveTo(x0ci, ciY); ctx.lineTo(x1ci, ciY); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0ci, ciY - 5); ctx.lineTo(x0ci, ciY + 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1ci, ciY - 5); ctx.lineTo(x1ci, ciY + 5); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    for (const e of estimates) {
      const x = sx.map(e.v);
      dot(ctx, x, e.y, 6, e.color);
      ctx.fillStyle = e.color;
      ctx.font = "bold 10px ui-monospace,monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`${e.label} ${e.v.toFixed(2)}`, x - 10, e.y);
    }
  }

  function drawPsiHistogram(cv) {
    cv.clear();
    const ctx = cv.ctx;
    const psi = results.psiAipw;
    const lo = Math.min(...psi) - 0.5;
    const hi = Math.max(...psi) + 0.5;
    const bins = histogram(psi, 30, lo, hi);
    const maxC = Math.max(...bins.map((b) => b.count), 1);
    const sx = new Scale([lo, hi], [cv.box.x0, cv.box.x1]);
    const sy = new Scale([0, maxC], [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel: "ψᵢ  (EIF score)", ylabel: "count", grid: false });

    for (const b of bins) {
      const x0 = sx.map(b.x0), x1 = sx.map(b.x1);
      const yy = sy.map(b.count);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = C_AIPW;
      ctx.fillRect(x0 + 0.5, yy, Math.max(1, x1 - x0 - 1), cv.box.y1 - yy);
      ctx.globalAlpha = 1;
    }

    // mean line = ATE_aipw
    const r = results;
    const mx = sx.map(r.ateAipw);
    ctx.strokeStyle = C_AIPW;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(mx, cv.box.y0);
    ctx.lineTo(mx, cv.box.y1);
    ctx.stroke();
    ctx.setLineDash([]);

    // true ATE
    const tx = sx.map(trueATE);
    ctx.strokeStyle = C_GOLD;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(tx, cv.box.y0);
    ctx.lineTo(tx, cv.box.y1);
    ctx.stroke();
    ctx.setLineDash([]);

    // SE label
    ctx.fillStyle = C_AIPW;
    ctx.font = "10px ui-monospace,monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`SE = ${r.seAipw.toFixed(3)}`, cv.box.x0 + 2, cv.box.y0 + 2);
  }

  function drawPropensity(cv) {
    cv.clear();
    const ctx = cv.ctx;
    const e = results.eProp;
    const lo = Math.min(...e) - 0.02;
    const hi = Math.max(...e) + 0.02;
    const bins = histogram(e, 25, Math.max(0, lo), Math.min(1, hi));
    const maxC = Math.max(...bins.map((b) => b.count), 1);
    const sx = new Scale([Math.max(0, lo), Math.min(1, hi)], [cv.box.x0, cv.box.x1]);
    const sy = new Scale([0, maxC], [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel: "ê(x)", ylabel: "count", grid: false });

    for (const b of bins) {
      const x0 = sx.map(b.x0), x1 = sx.map(b.x1);
      const yy = sy.map(b.count);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = state.propensityCorrect ? C_IPW : "#ff6b8a";
      ctx.fillRect(x0 + 0.5, yy, Math.max(1, x1 - x0 - 1), cv.box.y1 - yy);
      ctx.globalAlpha = 1;
    }

    const label = state.propensityCorrect
      ? "logistic fit — variation"
      : "intercept-only — constant";
    ctx.fillStyle = "var(--dim)";
    ctx.font = "10px ui-monospace,monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label, (cv.box.x0 + cv.box.x1) / 2, cv.box.y0 + 2);
  }

  // ── frame loop ─────────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    spReg .step(dt);
    spIpw .step(dt);
    spAipw.step(dt);
    spCiLo.step(dt);
    spCiHi.step(dt);

    drawNumberLine(cvLine);
    drawPsiHistogram(cvPsi);
    drawPropensity(cvProp);
  });

  return () => stop();
}
