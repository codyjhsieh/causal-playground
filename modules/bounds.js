// Partial Identification & Manski Bounds — LaLonde NSW (randomized job training).
//
// The core insight: when an effect ISN'T point-identified, it's still TRAPPED inside
// an interval that the data can compute. Each credible assumption squeezes the interval
// tighter. NSW is an RCT so the "randomization known" assumption collapses to a point.
//
// Binary outcome Y = 1{re78 > 0} (employed/had positive earnings) puts Y ∈ [0,1]
// so unobserved potential outcomes are bounded in [0,1] — the Manski setup.
//
// References: Manski (1990) J. Econometrics; Manski (1997) Rev. Econ. Studies;
//             Balke & Pearl (1997) JASA.

import { h } from "../lib/dom.js";
import { mean } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale } from "../lib/plot.js";
import {
  lessonLayout, panelSection, toggle, readout, challenge, note,
} from "../lib/ui.js";
import { rows, meta } from "../data/nsw.js";
import { complete, dataBadge } from "../lib/data.js";

// ── CSS (injected once, never touches styles.css) ────────────────────────────
function injectCSS() {
  if (document.getElementById("bounds-css")) return;
  const st = document.createElement("style");
  st.id = "bounds-css";
  st.textContent = `
    .bounds-numberline-wrap {
      display: flex; flex-direction: column; align-items: center;
      padding: 24px 0 8px;
    }
    .bounds-numberline-label {
      font: 11px var(--mono, monospace); color: var(--dim);
      margin-bottom: 10px; letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .bounds-assumption-grid {
      display: flex; flex-direction: column; gap: 6px;
    }
    .bounds-formula {
      font: 11.5px var(--mono, monospace); color: var(--dim);
      line-height: 1.7; padding: 8px 10px;
      border-left: 2px solid var(--line);
      margin: 0;
    }
    .bounds-formula em { color: var(--gold); font-style: normal; }
    .bounds-sign-pill {
      display: inline-block; padding: 2px 9px; border-radius: 20px;
      font: bold 11px var(--mono, monospace); letter-spacing: 0.05em;
      transition: background 0.3s, color 0.3s;
    }
    .bounds-sign-pill.identified { background: var(--pos, #27ae60); color: #fff; }
    .bounds-sign-pill.unknown    { background: var(--line); color: var(--dim); }
    .bounds-cite {
      font: 10.5px var(--mono, monospace); color: var(--dim);
      margin-top: 6px; padding: 5px 8px;
      border-left: 2px solid var(--line); line-height: 1.5;
    }
    .bounds-stage-title {
      font: 11px var(--mono, monospace); color: var(--dim);
      margin: 0 0 4px 0; text-align: center; letter-spacing: 0.03em;
    }
  `;
  document.head.appendChild(st);
}

// ── Pre-process real NSW data ────────────────────────────────────────────────
const data = complete(rows, ["treat", "re78"]);
const treated = data.filter((r) => r.treat === 1);
const control = data.filter((r) => r.treat === 0);

const N_ALL = data.length;
const pT = treated.length / N_ALL;   // P(T = 1)
const pC = control.length / N_ALL;   // P(T = 0)

// Binary outcome: Y = 1{re78 > 0}
const Y1obs = treated.map((r) => (r.re78 > 0 ? 1 : 0));
const Y0obs = control.map((r) => (r.re78 > 0 ? 1 : 0));
const EY_T1 = mean(Y1obs);   // E[Y | T = 1]  — factual, observed
const EY_T0 = mean(Y0obs);   // E[Y | T = 0]  — factual, observed

// TRUE ATE (NSW is an RCT so this is identified):  E[Y(1)] - E[Y(0)]
const TRUE_ATE = EY_T1 - EY_T0;

// ── Bound computation ────────────────────────────────────────────────────────
// No-assumption (Manski 1990) bounds for ATE on a binary outcome ∈ [0,1]:
//   E[Y(1)] ∈ [E[Y|T=1]·P(T=1) + 0·P(T=0),  E[Y|T=1]·P(T=1) + 1·P(T=0)]
//   E[Y(0)] ∈ [E[Y|T=0]·P(T=0) + 0·P(T=1),  E[Y|T=0]·P(T=0) + 1·P(T=1)]
//   ATE ∈ [LB, UB]:
//     LB = E[Y|T=1]·P(T=1) + 0·P(T=0) − (E[Y|T=0]·P(T=0) + 1·P(T=1))
//     UB = E[Y|T=1]·P(T=1) + 1·P(T=0) − (E[Y|T=0]·P(T=0) + 0·P(T=1))
const LB_BASE = EY_T1 * pT + 0 * pC - (EY_T0 * pC + 1 * pT);
const UB_BASE = EY_T1 * pT + 1 * pC - (EY_T0 * pC + 0 * pT);
const WIDTH_BASE = UB_BASE - LB_BASE;  // ≈ 1 by construction

// Monotone Treatment Response (MTR): Y(1) ≥ Y(0) for all i (training never hurts).
//   ⇒ ATE ≥ 0, so LB is tightened to max(LB_BASE, 0).
const LB_MTR = Math.max(LB_BASE, 0);
const UB_MTR = UB_BASE;

// Monotone Treatment Selection (MTS): E[Y(t) | T=1] ≥ E[Y(t) | T=0] for t ∈ {0,1}.
//   (Those who selected into treatment have weakly higher potential outcomes.)
//   ⇒ Unobserved Y(1) for controls ≤ E[Y|T=1]; unobserved Y(0) for treated ≥ E[Y|T=0].
//   LB_MTS = E[Y|T=1]·P(T=1) + E[Y|T=0]·P(T=0) − (E[Y|T=0]·P(T=0) + E[Y|T=1]·P(T=1)) = 0
//   UB_MTS = E[Y|T=1]·P(T=1) + E[Y|T=1]·P(T=0) − (E[Y|T=0]·P(T=0) + E[Y|T=0]·P(T=1))
//          = E[Y|T=1] − E[Y|T=0]   (i.e., the naive observed difference = TRUE ATE here)
const LB_MTS = 0;   // by construction of MTS on binary outcome
const UB_MTS = EY_T1 - EY_T0;  // = TRUE_ATE (NSW is RCT — no selection bias)

// MTR + MTS combined:
const LB_BOTH = Math.max(LB_MTR, LB_MTS);
const UB_BOTH = Math.min(UB_MTR, UB_MTS);

// Randomization known (NSW is an RCT): point identification — interval collapses.
const LB_RCT = TRUE_ATE;
const UB_RCT = TRUE_ATE;

// Helper: compute active bounds from toggle state
function computeBounds(useMTR, useMTS, useRCT) {
  if (useRCT) return { lb: LB_RCT, ub: UB_RCT };
  if (useMTR && useMTS) return { lb: LB_BOTH, ub: UB_BOTH };
  if (useMTR) return { lb: LB_MTR, ub: UB_MTR };
  if (useMTS) return { lb: LB_MTS, ub: UB_MTS };
  return { lb: LB_BASE, ub: UB_BASE };
}

// ── Module ───────────────────────────────────────────────────────────────────
export function mount(root) {
  injectCSS();

  const state = {
    useMTR: false,
    useMTS: false,
    useRCT: false,
  };

  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Partial Identification & Bounds",
    idea: "Even without full identification, the data + assumptions trap the effect in an interval. " +
          "Each assumption tightens it. NSW is an RCT, so randomization collapses the interval to a point — " +
          "confirming the true ATE is always inside every valid bound.",
  });

  // ── Stage: number-line canvas ──────────────────────────────────────────────
  const CV_W = 620, CV_H = 320;
  const cv = new Canvas(CV_W, CV_H, { margin: { t: 60, r: 50, b: 80, l: 50 } });

  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.alignItems = "center";

  stage.appendChild(
    h("p", { class: "bounds-stage-title",
      text: "ATE on Y = 1{re78 > 0} — assumptions progressively trap the effect" }),
  );
  stage.appendChild(cv.el);

  // Legend row
  stage.appendChild(
    h("div", { class: "ps-legend", style: { marginTop: "10px" } }, [
      h("span", {}, [
        h("span", { class: "ps-swatch",
          style: { background: "var(--accent2)", borderRadius: "2px",
                   width: "22px", height: "8px", display: "inline-block",
                   verticalAlign: "middle", marginRight: "5px" } }),
        "bound interval [LB, UB]",
      ]),
      h("span", {}, [
        h("span", { class: "ps-swatch",
          style: { background: "var(--gold)", width: "10px", height: "10px" } }),
        "true RCT ATE (always inside)",
      ]),
      h("span", {}, [
        h("span", { class: "ps-swatch",
          style: { background: "var(--dim)", borderRadius: "0",
                   width: "2px", height: "14px", display: "inline-block",
                   verticalAlign: "middle", marginRight: "5px" } }),
        "zero  (sign identified when interval excludes 0)",
      ]),
    ]),
  );

  // ── Panel ──────────────────────────────────────────────────────────────────
  // Springs: drive animated LB and UB endpoints
  const lbSpring = new Spring(LB_BASE, { stiffness: 60, damping: 15 });
  const ubSpring = new Spring(UB_BASE, { stiffness: 60, damping: 15 });

  // Readouts
  const rLB    = readout({ label: "Lower bound",  value: "—", accent: "var(--ctrl)" });
  const rUB    = readout({ label: "Upper bound",  value: "—", accent: "var(--treat)" });
  const rWidth = readout({ label: "Width",        value: "—", accent: "var(--accent2)" });
  const rATE   = readout({ label: "True RCT ATE", value: `${TRUE_ATE >= 0 ? "+" : ""}${TRUE_ATE.toFixed(3)}`, accent: "var(--gold)" });

  const signPill = h("span", { class: "bounds-sign-pill unknown", text: "sign unknown" });

  // Challenge
  const chal = challenge({
    goal: "Add assumptions until the bound interval EXCLUDES zero — " +
          "then you can conclude the training effect is strictly positive. " +
          "Confirm the true ATE stays inside every interval.",
  });

  // Assumption toggles
  const togMTR = toggle({
    label: "Monotone Treatment Response (MTR)",
    hint: "(training never hurts — LB ≥ 0)",
    value: false,
    onToggle: (v) => { state.useMTR = v; applyBounds(); },
  });
  const togMTS = toggle({
    label: "Monotone Treatment Selection (MTS)",
    hint: "(those who select in have weakly higher potential outcomes)",
    value: false,
    onToggle: (v) => { state.useMTS = v; applyBounds(); },
  });
  const togRCT = toggle({
    label: "Randomization known (NSW is an RCT)",
    hint: "(collapses to point estimate — the ultimate assumption)",
    value: false,
    onToggle: (v) => {
      state.useRCT = v;
      togMTR.set(false); state.useMTR = false;
      togMTS.set(false); state.useMTS = false;
      applyBounds();
    },
  });

  function applyBounds() {
    const { lb, ub } = computeBounds(state.useMTR, state.useMTS, state.useRCT);
    lbSpring.set(lb);
    ubSpring.set(ub);
    checkChallenge(lb, ub);
  }

  function checkChallenge(lb, ub) {
    const excl0 = lb > 0.0005;  // strictly excludes zero
    const ateInside = TRUE_ATE >= lb - 1e-9 && TRUE_ATE <= ub + 1e-9;
    if (excl0 && ateInside) {
      chal.setState(true,
        `Bounds [${lb.toFixed(3)}, ${ub.toFixed(3)}] exclude 0 — sign identified! ` +
        `True ATE (${TRUE_ATE.toFixed(3)}) is inside. ✓`);
    } else if (!ateInside) {
      chal.setState(false, "Something's wrong — true ATE outside bounds (shouldn't happen).");
    } else {
      chal.setState(false, `LB = ${lb.toFixed(3)} ≤ 0 — interval still contains zero.`);
    }
  }

  panel.append(
    panelSection("Data", [dataBadge(meta)]),
    panelSection("Estimands", h("div", { class: "readout-grid" }, [rLB, rUB, rWidth, rATE])),
    panelSection("Sign identified?", [
      h("div", { style: { padding: "6px 0" } }, [signPill]),
      note(`Sign identified = lower bound > 0, i.e., the interval excludes zero`),
    ]),
    panelSection("Assumptions — toggle to tighten", [
      h("div", { class: "bounds-assumption-grid" }, [togMTR, togMTS, togRCT]),
    ]),
    panelSection("Challenge", [chal]),
    h("p", { class: "bounds-cite" }, [
      "No-assumption width = P(T=0) + P(T=1) = 1 by construction. " +
      "MTR tightens LB to 0. MTS tightens UB to the observed diff (= true ATE in this RCT). " +
      "Manski 1990; Manski 1997; Balke & Pearl 1997 (IV bounds).",
    ]),
  );

  caption.innerHTML =
    "Manski (1990) worst-case bounds: <em>LB = E[Y|T=1]·P(T=1) − E[Y|T=0]·P(T=0) − P(T=1)</em> &nbsp;and&nbsp; " +
    "<em>UB = E[Y|T=1]·P(T=1) − E[Y|T=0]·P(T=0) + P(T=0)</em>. " +
    "Width = 1 with no assumptions, because the unobserved potential outcomes can be anything in [0,1]. " +
    "<strong>Monotone Treatment Response</strong> (training can't hurt) pins LB ≥ 0. " +
    "<strong>Monotone Treatment Selection</strong> (self-selection into treatment) tightens UB to the observed arm difference. " +
    "Because NSW is <strong>randomized</strong>, that observed difference IS the true ATE — collapsing the interval to a point. " +
    "Identification is a spectrum, not all-or-nothing. " +
    "Sources: <strong>Manski 1990; Manski 1997; Balke &amp; Pearl 1997</strong>.";

  root.appendChild(layout);

  // ── Draw loop ──────────────────────────────────────────────────────────────
  // Domain for the number line: span from a bit below LB_BASE to a bit above UB_BASE
  const domLo = -0.6;
  const domHi =  0.9;

  // We animate a "spark" burst at the true ATE dot to draw the eye
  let sparkT = 0;

  const stop = onFrame((dt) => {
    lbSpring.step(dt);
    ubSpring.step(dt);
    sparkT = (sparkT + dt * 0.8) % (Math.PI * 2);
    draw();
    updateReadouts();
  });

  function draw() {
    cv.clear();
    const ctx = cv.ctx;
    const b = cv.box;

    // Horizontal number-line domain
    const sx = new Scale([domLo, domHi], [b.x0, b.x1]);
    const midY = b.y0 + cv.ih / 2;

    // ── Grid lines at nice intervals ───────────────────────────────────────
    const ticks = [-0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--faint").trim() || "#e6e6ee";
    ctx.lineWidth = 1;
    for (const t of ticks) {
      const x = sx.map(t);
      ctx.beginPath(); ctx.moveTo(x, b.y0); ctx.lineTo(x, b.y1); ctx.stroke();
    }

    // ── Axis line ─────────────────────────────────────────────────────────
    const axisCol = getComputedStyle(document.documentElement).getPropertyValue("--line").trim() || "#ccc";
    ctx.strokeStyle = axisCol; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(b.x0, midY); ctx.lineTo(b.x1, midY); ctx.stroke();

    // Tick marks + labels
    const dimCol = getComputedStyle(document.documentElement).getPropertyValue("--dim").trim() || "#888";
    ctx.fillStyle = dimCol;
    ctx.font = "11px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const t of ticks) {
      const x = sx.map(t);
      ctx.strokeStyle = dimCol; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, midY - 5); ctx.lineTo(x, midY + 5); ctx.stroke();
      ctx.fillText(t.toFixed(1), x, midY + 10);
    }

    // Axis label
    const inkCol = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#111";
    ctx.fillStyle = inkCol;
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("ATE  (Y = 1{re78 > 0},  binary employment outcome)", (b.x0 + b.x1) / 2, b.y1 + 36);

    // ── Zero dashed line ──────────────────────────────────────────────────
    const zx = sx.map(0);
    ctx.strokeStyle = dimCol; ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]); ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(zx, b.y0); ctx.lineTo(zx, midY - 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(zx, midY + 6); ctx.lineTo(zx, b.y1); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    // Zero label
    ctx.fillStyle = dimCol; ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("0", zx, b.y0 - 4);

    // ── Animated bound interval ───────────────────────────────────────────
    const lb = lbSpring.value;
    const ub = ubSpring.value;
    const lbX = sx.map(lb);
    const ubX = sx.map(ub);

    const barHalf = 20;
    const barTop  = midY - barHalf;
    const barBot  = midY + barHalf;
    const barW    = ubX - lbX;
    const isPoint = Math.abs(barW) < 3;

    // Fill interval bar
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "var(--accent2)";
    if (!isPoint) ctx.fillRect(lbX, barTop, barW, barHalf * 2);
    ctx.globalAlpha = 1;

    // Bracket end-caps and spine
    ctx.strokeStyle = "var(--accent2)"; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
    const capH = barHalf + 6;

    if (isPoint) {
      // Collapsed to a point — draw a bracket that's just two vertical ticks
      ctx.beginPath();
      ctx.moveTo(lbX - 1, midY - capH); ctx.lineTo(lbX - 1, midY + capH);
      ctx.moveTo(lbX + 1, midY - capH); ctx.lineTo(lbX + 1, midY + capH);
      ctx.stroke();
    } else {
      // LB cap
      ctx.beginPath();
      ctx.moveTo(lbX, midY - capH); ctx.lineTo(lbX, midY + capH);
      ctx.stroke();
      // UB cap
      ctx.beginPath();
      ctx.moveTo(ubX, midY - capH); ctx.lineTo(ubX, midY + capH);
      ctx.stroke();
      // Horizontal top + bottom rails
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(lbX, barTop); ctx.lineTo(ubX, barTop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lbX, barBot); ctx.lineTo(ubX, barBot); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // LB label (below)
    ctx.fillStyle = "var(--ctrl)";
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(lb.toFixed(3), lbX, barBot + 8);

    // UB label (below)
    ctx.fillStyle = "var(--treat)";
    ctx.textAlign = "center";
    if (!isPoint) ctx.fillText(ub.toFixed(3), ubX, barBot + 8);

    // Width label (above interval midpoint)
    if (!isPoint) {
      const midX = (lbX + ubX) / 2;
      ctx.fillStyle = "var(--accent2)"; ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText(`width = ${(ub - lb).toFixed(3)}`, midX, barTop - 6);
    }

    // ── True ATE gold dot (with animated pulse ring) ──────────────────────
    const ateX = sx.map(TRUE_ATE);
    const ateY = midY;

    // Pulse ring
    const ringR = 8 + 5 * Math.sin(sparkT);
    ctx.strokeStyle = "var(--gold)"; ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(sparkT);
    ctx.beginPath(); ctx.arc(ateX, ateY, ringR, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    // Dot
    ctx.fillStyle = "var(--gold)";
    ctx.beginPath(); ctx.arc(ateX, ateY, 6, 0, Math.PI * 2); ctx.fill();

    // "True ATE" label (above)
    ctx.fillStyle = "var(--gold)"; ctx.font = "bold 11px ui-monospace, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(`true ATE = ${TRUE_ATE >= 0 ? "+" : ""}${TRUE_ATE.toFixed(3)}`, ateX, barTop - 26);

    // Leader line
    ctx.strokeStyle = "var(--gold)"; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(ateX, ateY - 6); ctx.lineTo(ateX, barTop - 28); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    // ── "SIGN IDENTIFIED" glow when LB > 0 ────────────────────────────────
    if (lb > 0.0005) {
      ctx.fillStyle = "var(--pos, #27ae60)";
      ctx.globalAlpha = 0.12;
      ctx.fillRect(zx, barTop, ubX - zx, barHalf * 2);
      ctx.globalAlpha = 1;
    }
  }

  function updateReadouts() {
    const lb = lbSpring.value;
    const ub = ubSpring.value;
    const w  = ub - lb;

    rLB.set(lb.toFixed(3), lb <= LB_BASE + 0.001 ? "no assumptions" : "tightened by MTR/MTS/RCT");
    rUB.set(ub.toFixed(3), ub >= UB_BASE - 0.001 ? "no assumptions" : "tightened by MTR/MTS/RCT");
    rWidth.set(w.toFixed(3), w < 0.01 ? "point identified!" : w < 0.3 ? "narrowing…" : "wide (few assumptions)");

    // Sign pill
    const excl0 = lb > 0.0005;
    signPill.textContent = excl0 ? "sign identified: effect > 0" : "sign unknown";
    signPill.className = "bounds-sign-pill " + (excl0 ? "identified" : "unknown");
  }

  return () => stop();
}
