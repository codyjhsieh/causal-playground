// Adjustment & Stratification. The UC Berkeley 1973 admissions data — men look
// admitted at a 14-point higher rate in the aggregate, yet within every large
// department the gap is near-zero or reversed. Women applied disproportionately
// to harder departments. Stratifying (conditioning on department) is adjustment;
// the aggregate gap is a confounder story, not a discrimination story.
//
// The centerpiece: ~600 dots representing applicants fly from a two-column
// aggregate pile into six labelled department columns the moment you toggle
// "Stratify by department". Within each column the within-dept admit rates
// become visible as small bar segments. A Spring-based animation drives every
// dot's position, making the re-grouping feel physical and tactile.

import { h } from "../lib/dom.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, dot } from "../lib/plot.js";
import { DAG, DAGView } from "../lib/dag.js";
import { lessonLayout, panelSection, toggle, readout, challenge, note } from "../lib/ui.js";
import { meta as berkeleyMeta } from "../data/berkeley.js";
import { dataBadge } from "../lib/data.js";

// ── Real Berkeley 1973 data (Bickel, Hammel & O'Connell, Science 1975) ────────
const DEPTS = [
  { name: "A", mApp: 825, mAdm: 512, wApp: 108, wAdm: 89 },
  { name: "B", mApp: 560, mAdm: 353, wApp: 25,  wAdm: 17 },
  { name: "C", mApp: 325, mAdm: 120, wApp: 593, wAdm: 202 },
  { name: "D", mApp: 417, mAdm: 138, wApp: 375, wAdm: 131 },
  { name: "E", mApp: 191, mAdm: 53,  wApp: 393, wAdm: 94 },
  { name: "F", mApp: 373, mAdm: 22,  wApp: 341, wAdm: 24 },
];

const TOT_M_APP  = DEPTS.reduce((a, d) => a + d.mApp, 0); // 2691
const TOT_W_APP  = DEPTS.reduce((a, d) => a + d.wApp, 0); // 1835
const TOT_M_ADM  = DEPTS.reduce((a, d) => a + d.mAdm, 0); // 1198
const TOT_W_ADM  = DEPTS.reduce((a, d) => a + d.wAdm, 0); // 557
const CRUDE_M    = TOT_M_ADM / TOT_M_APP;  // ~0.4448
const CRUDE_W    = TOT_W_ADM / TOT_W_APP;  // ~0.3035
const CRUDE_GAP  = CRUDE_W - CRUDE_M;      // ~−0.141

// Standardized gap: Σ_d P(admit|female,d)·P(dept=d)
// using overall applicant share as weights
const TOT_ALL = TOT_M_APP + TOT_W_APP;
let adjGap = 0;
for (const d of DEPTS) {
  const dShare = (d.mApp + d.wApp) / TOT_ALL;
  const mRate  = d.mAdm / d.mApp;
  const wRate  = d.wAdm / d.wApp;
  adjGap += (wRate - mRate) * dShare;
}
// adjGap ≈ +0.01..+0.02 (slightly positive once stratified)

// ── Dot sampling ──────────────────────────────────────────────────────────────
// Scale the 4526 applicants down to ~600 dots, preserving per-dept proportions.
// Each dot knows its department, sex, admitted status, and two positions:
//   aggPos  = position in the two-column aggregate pile (men / women)
//   stratPos = position in the per-dept stratified layout

const TOTAL_DOTS = 600;

function buildDots(canvasW, canvasH) {
  // Layout parameters
  const CX = canvasW / 2;

  // Aggregate columns: men left, women right
  const AGG_COL_W = 80;
  const AGG_MEN_X = CX - 120;
  const AGG_WOM_X = CX + 120;
  const AGG_Y0    = 60;
  const AGG_Y1    = canvasH - 60;

  // Dept columns across the canvas
  const N_DEPT = 6;
  const MARGIN_X = 55;
  const DEPT_STEP = (canvasW - 2 * MARGIN_X) / (N_DEPT - 1);

  const dots = [];

  // Count how many dots each (dept, sex, admitted) cell gets
  const totalReal = TOT_M_APP + TOT_W_APP;

  for (let di = 0; di < DEPTS.length; di++) {
    const d = DEPTS[di];
    const cells = [
      { count: d.mAdm,          sex: "m", adm: true },
      { count: d.mApp - d.mAdm, sex: "m", adm: false },
      { count: d.wAdm,          sex: "w", adm: true },
      { count: d.wApp - d.wAdm, sex: "w", adm: false },
    ];
    for (const cell of cells) {
      const n = Math.round((cell.count / totalReal) * TOTAL_DOTS);
      for (let k = 0; k < n; k++) {
        dots.push({ dept: di, sex: cell.sex, adm: cell.adm, sx: new Spring(0, { stiffness: 55, damping: 13 }), sy: new Spring(0, { stiffness: 55, damping: 13 }) });
      }
    }
  }

  // Place dots in aggregate positions using a simple grid pack per sex column
  const menDots = dots.filter(d => d.sex === "m");
  const womDots = dots.filter(d => d.sex === "w");

  function packInColumn(arr, cx, y0, y1, colW) {
    const n = arr.length;
    const rows = Math.ceil(Math.sqrt(n * (y1 - y0) / colW));
    const cols2 = Math.ceil(n / Math.max(1, rows));
    const cellW = colW / Math.max(1, cols2);
    const cellH = (y1 - y0) / Math.max(1, rows);
    arr.forEach((dot, i) => {
      const row = Math.floor(i / cols2);
      const col = i % cols2;
      const px = cx - colW / 2 + (col + 0.5) * cellW + (Math.random() - 0.5) * 2;
      const py = y0 + (row + 0.5) * cellH + (Math.random() - 0.5) * 2;
      dot.ax = px; dot.ay = py;
    });
  }

  packInColumn(menDots, AGG_MEN_X, AGG_Y0, AGG_Y1, AGG_COL_W);
  packInColumn(womDots, AGG_WOM_X, AGG_Y0, AGG_Y1, AGG_COL_W);

  // Place dots in stratified positions: within each dept column, men left sub-col, women right sub-col
  const DEPT_COL_W = 64;
  const DEPT_Y0 = 55, DEPT_Y1 = canvasH - 55;

  for (let di = 0; di < DEPTS.length; di++) {
    const deptX = MARGIN_X + di * DEPT_STEP;
    const dMen = dots.filter(d => d.dept === di && d.sex === "m");
    const dWom = dots.filter(d => d.dept === di && d.sex === "w");
    packInColumn(dMen, deptX - DEPT_COL_W * 0.28, DEPT_Y0, DEPT_Y1, DEPT_COL_W * 0.5);
    packInColumn(dWom, deptX + DEPT_COL_W * 0.28, DEPT_Y0, DEPT_Y1, DEPT_COL_W * 0.5);
  }

  // Snap springs to aggregate position initially
  for (const d of dots) {
    d.sx.snap(d.ax);
    d.sy.snap(d.ay);
  }

  return dots;
}

// ── Colors ────────────────────────────────────────────────────────────────────
const WOMEN_ADM   = "var(--accent)";   // purple, admitted women
const WOMEN_REJ   = "#7c4fa0";         // dim purple, rejected women
const MEN_ADM     = "var(--ctrl)";     // blue, admitted men
const MEN_REJ     = "#2a4a7a";         // dim blue, rejected men

function dotColor(d) {
  if (d.sex === "w") return d.adm ? WOMEN_ADM : WOMEN_REJ;
  return d.adm ? MEN_ADM : MEN_REJ;
}

// ── Module ────────────────────────────────────────────────────────────────────
export function mount(root) {
  // Inject scoped styles once
  if (!document.getElementById("adjustment-css")) {
    const style = document.createElement("style");
    style.id = "adjustment-css";
    style.textContent = `
      .adj-dept-labels {
        display: flex;
        justify-content: space-between;
        padding: 0 55px;
        font: 11px var(--mono);
        color: var(--dim);
        margin-top: 2px;
        pointer-events: none;
        user-select: none;
      }
      .adj-dept-label { text-align: center; width: 0; }
      .adj-col-headers {
        display: flex;
        justify-content: space-around;
        padding: 0 80px;
        font: 10px var(--mono);
        color: var(--dim);
        margin-bottom: 2px;
        pointer-events: none;
      }
      .adj-agg-labels {
        display: flex;
        justify-content: center;
        gap: 120px;
        font: 11px var(--mono);
        color: var(--dim);
        margin-bottom: 2px;
        pointer-events: none;
      }
      .adj-bar-overlay {
        position: absolute;
        bottom: 0; left: 0; right: 0;
        display: flex;
        justify-content: space-between;
        padding: 0 49px;
        align-items: flex-end;
        height: 100%;
        pointer-events: none;
      }
      .adj-stage-wrap {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .adj-legend {
        display: flex;
        gap: 18px;
        font: 11px var(--mono);
        color: var(--dim);
        margin-top: 6px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .adj-legend span { display: flex; align-items: center; gap: 5px; }
      .adj-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
    `;
    document.head.appendChild(style);
  }

  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Adjustment & Stratification",
    idea: "Aggregate statistics can mislead when a third variable (department) channels applicants unequally. Conditioning on department — standardization — reveals the true causal effect.",
  });

  // ── Canvas ──────────────────────────────────────────────────────────────────
  const CV_W = 580, CV_H = 380;
  const cv = new Canvas(CV_W, CV_H, { margin: { t: 0, r: 0, b: 0, l: 0 } });
  cv.el.style.borderRadius = "8px";

  const dots = buildDots(CV_W, CV_H);

  // Stratification spring: 0 = aggregate, 1 = stratified
  const stratSpring = new Spring(0, { stiffness: 40, damping: 12 });

  // Pre-compute stratified (bx/by) positions for all dots.
  // ax/ay = aggregate pile positions (already set by buildDots).
  const MARGIN_X = 55;
  const DEPT_STEP = (CV_W - 2 * MARGIN_X) / 5;
  // Compute stratified target positions (bx/by) here after buildDots, which
  // wrote ax/ay = aggregate pile and left bx/by undefined.
  (() => {
    const DEPT_COL_W = 64;
    const DEPT_Y0 = 55, DEPT_Y1 = CV_H - 55;

    function packStrat(arr, cx, y0, y1, colW) {
      const n = arr.length;
      if (n === 0) return;
      const rows = Math.ceil(Math.sqrt(n * (y1 - y0) / colW));
      const cols2 = Math.ceil(n / Math.max(1, rows));
      const cellW = colW / Math.max(1, cols2);
      const cellH = (y1 - y0) / Math.max(1, rows);
      arr.forEach((d, i) => {
        const row = Math.floor(i / cols2);
        const col = i % cols2;
        d.bx = cx - colW / 2 + (col + 0.5) * cellW;
        d.by = y0 + (row + 0.5) * cellH;
      });
    }

    for (let di = 0; di < DEPTS.length; di++) {
      const deptX = MARGIN_X + di * DEPT_STEP;
      const dMen = dots.filter(d => d.dept === di && d.sex === "m");
      const dWom = dots.filter(d => d.dept === di && d.sex === "w");
      packStrat(dMen, deptX - DEPT_COL_W * 0.28, DEPT_Y0, DEPT_Y1, DEPT_COL_W * 0.5);
      packStrat(dWom, deptX + DEPT_COL_W * 0.28, DEPT_Y0, DEPT_Y1, DEPT_COL_W * 0.5);
    }
  })();

  // ── Readouts ─────────────────────────────────────────────────────────────────
  const rCrude = readout({
    label: "Crude gap  (W − M)",
    value: fmtPt(CRUDE_GAP * 100),
    accent: "var(--neg)",
  });
  const rAdj = readout({
    label: "Dept-adjusted gap",
    value: fmtPt(adjGap * 100),
    accent: "var(--pos)",
  });

  const chal = challenge({
    goal: "Stratify by department to explain away the apparent bias — toggle adjustment until the dept-adjusted gap is shown.",
  });

  // ── DAG ──────────────────────────────────────────────────────────────────────
  const dag = new DAG(
    [
      { id: "G",  label: "Gender",     x: 100, y: 100, role: "treatment",  conditionable: false },
      { id: "D",  label: "Dept",       x: 280, y: 55,  role: "confounder" },
      { id: "A",  label: "Admit",      x: 460, y: 100, role: "outcome",   conditionable: false },
    ],
    [
      { from: "G", to: "D", sign: "+" },
      { from: "G", to: "A", sign: "+", label: "?" },
      { from: "D", to: "A", sign: "+", label: "−" },
    ]
  );
  const dagView = new DAGView(dag, { width: 320, height: 150, conditionable: true, draggableNodes: false });
  dagView.svg.style.marginTop = "6px";

  // ── Panel ─────────────────────────────────────────────────────────────────────
  const stratToggle = toggle({
    label: "Stratify by department",
    value: false,
    hint: "(animate dots into dept columns)",
    onToggle: (v) => {
      // Stagger dots dept-by-dept
      const order = v ? [0,1,2,3,4,5] : [5,4,3,2,1,0];
      for (let i = 0; i < order.length; i++) {
        const di = order[i];
        const delay = i * 80;
        setTimeout(() => {
          for (const d of dots) {
            if (d.dept !== di) continue;
            if (v) { d.sx.set(d.bx); d.sy.set(d.by); }
            else   { d.sx.set(d.ax); d.sy.set(d.ay); }
          }
        }, delay);
      }
      stratSpring.set(v ? 1 : 0);
      if (v) chal.setState(true, `dept-adjusted gap ≈ ${fmtPt(adjGap * 100)} pp (near zero)`);
      else   chal.setState(false);
    },
  });

  panel.append(
    dataBadge(berkeleyMeta),
    panelSection("Admission gaps", h("div", { class: "readout-grid" }, [rCrude, rAdj])),
    panelSection("Adjustment", [
      stratToggle,
      note("Men: " + pct(CRUDE_M) + " overall · Women: " + pct(CRUDE_W) + " overall"),
      note("Apparent gap: " + fmtPt(CRUDE_GAP * 100) + " pp against women."),
    ]),
    panelSection("Causal graph", [
      h("p", { class: "note", text: "Department is a confounder/mediator. Condition on it (click node) to see the path Gender→Admit through Dept." }),
      dagView.svg,
    ]),
    panelSection("Challenge", chal),
  );

  // ── Caption ───────────────────────────────────────────────────────────────────
  caption.innerHTML =
    "The aggregate gap (−14 pp) arises because women applied disproportionately to departments C–F, which had lower admit rates for <em>everyone</em>. " +
    "Conditioning on department via <strong>standardization</strong> (the adjustment formula) recovers the within-stratum effect: " +
    "<math>P(admit ∣ do(female)) = Σ<sub>d</sub> P(admit ∣ female, dept=d) · P(dept=d)</math>. " +
    "Once stratified, the gender gap shrinks to near-zero or slightly favours women in most departments. " +
    "This is a textbook case of <strong>Simpson's paradox</strong> driven by a departmental confounder. " +
    "Data: Bickel, Hammel &amp; O'Connell, <em>Science</em> 1975.";

  // ── Stage layout ───────────────────────────────────────────────────────────
  const aggLabels = h("div", { class: "adj-agg-labels" }, [
    h("span", { text: "Men" }),
    h("span", { text: "Women" }),
  ]);

  const deptLabelRow = h("div", { class: "adj-dept-labels" },
    DEPTS.map(d => h("span", { class: "adj-dept-label", text: "Dept " + d.name }))
  );

  // Legend
  const legend = h("div", { class: "adj-legend" }, [
    h("span", {}, [h("span", { class: "adj-swatch", style: { background: "var(--ctrl)" } }), " Men admitted"]),
    h("span", {}, [h("span", { class: "adj-swatch", style: { background: "#2a4a7a" } }), " Men rejected"]),
    h("span", {}, [h("span", { class: "adj-swatch", style: { background: "var(--accent)" } }), " Women admitted"]),
    h("span", {}, [h("span", { class: "adj-swatch", style: { background: "#7c4fa0" } }), " Women rejected"]),
  ]);

  const stageWrap = h("div", { class: "adj-stage-wrap" }, [
    aggLabels,
    cv.el,
    deptLabelRow,
    legend,
  ]);
  stage.style.display = "flex";
  stage.style.justifyContent = "center";
  stage.appendChild(stageWrap);

  root.appendChild(layout);

  // ── Draw loop ─────────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    stratSpring.step(dt);
    const k = stratSpring.value; // 0 = agg, 1 = strat

    cv.clear();
    const ctx = cv.ctx;

    // Draw dept-column guide lines when stratifying
    if (k > 0.05) {
      ctx.save();
      ctx.globalAlpha = k * 0.18;
      ctx.strokeStyle = "var(--line)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      for (let di = 0; di < 6; di++) {
        const cx2 = MARGIN_X + di * DEPT_STEP;
        ctx.beginPath();
        ctx.moveTo(cx2, 30);
        ctx.lineTo(cx2, CV_H - 30);
        ctx.stroke();
      }
      ctx.restore();

      // Per-dept admit-rate bars (fade in)
      drawDeptBars(ctx, k);
    }

    // Aggregate column guide lines (fade out)
    if (k < 0.95) {
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.22;
      ctx.strokeStyle = "var(--line)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const CX = CV_W / 2;
      for (const cx2 of [CX - 120, CX + 120]) {
        ctx.beginPath();
        ctx.moveTo(cx2, 30);
        ctx.lineTo(cx2, CV_H - 30);
        ctx.stroke();
      }
      ctx.restore();

      // Aggregate admit-rate labels (fade out)
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.font = "11px ui-monospace, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "var(--accent)";
      ctx.fillText(pct(CRUDE_W) + " admitted", CX + 120, 22);
      ctx.fillStyle = "var(--ctrl)";
      ctx.fillText(pct(CRUDE_M) + " admitted", CX - 120, 22);
      ctx.restore();
    }

    // Step all dot springs and draw
    for (const d of dots) {
      d.sx.step(dt);
      d.sy.step(dt);
      const x = d.sx.value;
      const y = d.sy.value;
      const r = k > 0.3 ? 2.8 : 3.4;
      const alpha = d.adm ? 0.92 : 0.45;
      dot(ctx, x, y, r, dotColor(d), { alpha });
    }

    // Update label fade
    aggLabels.style.opacity = String(Math.max(0, 1 - k * 2));
    deptLabelRow.style.opacity = String(Math.min(1, k * 2));
  });

  // Draw per-dept within-sex admit rate bars in the background
  function drawDeptBars(ctx, alpha) {
    for (let di = 0; di < DEPTS.length; di++) {
      const d = DEPTS[di];
      const deptX = MARGIN_X + di * DEPT_STEP;
      const BAR_W = 10;
      const BAR_MAX_H = CV_H - 90;
      const BAR_Y1 = CV_H - 55;

      const mRate = d.mAdm / d.mApp;
      const wRate = d.wAdm / d.wApp;

      // Men bar (left of dept center)
      ctx.save();
      ctx.globalAlpha = alpha * 0.25;
      ctx.fillStyle = "var(--ctrl)";
      const mH = mRate * BAR_MAX_H;
      ctx.fillRect(deptX - BAR_W * 1.4 - BAR_W, BAR_Y1 - mH, BAR_W, mH);

      // Women bar (right)
      ctx.fillStyle = "var(--accent)";
      const wH = wRate * BAR_MAX_H;
      ctx.fillRect(deptX + BAR_W * 0.4, BAR_Y1 - wH, BAR_W, wH);
      ctx.restore();

      // Rate labels
      if (alpha > 0.5) {
        ctx.save();
        ctx.globalAlpha = (alpha - 0.5) * 2 * 0.9;
        ctx.font = "9px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "var(--ctrl)";
        ctx.fillText(Math.round(mRate * 100) + "%", deptX - BAR_W * 0.9 - BAR_W, BAR_Y1 - mH - 5);
        ctx.fillStyle = "var(--accent)";
        ctx.fillText(Math.round(wRate * 100) + "%", deptX + BAR_W * 0.9, BAR_Y1 - wH - 5);
        ctx.restore();
      }
    }
  }

  return () => { stop(); dagView.destroy(); };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pct(r) { return (r * 100).toFixed(1) + "%"; }
function fmtPt(v) { return (v >= 0 ? "+" : "") + v.toFixed(1) + " pp"; }
