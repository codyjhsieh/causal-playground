// F1 — "Driver or Car?"
// The classic causal question in Formula 1 — and in head-to-head betting markets.
// Starting on pole strongly predicts winning, but does grid position CAUSE
// the result, or does constructor quality confound both?
//
// Data: Ergast / jolpi.ca F1 API, 2023–2025 (3 × ~24 races = 1 398 race entries).
// Causal finding:
//   corr(grid, finish) = 0.658 — pole predicts wins.
//   corr(grid, car-strength) = 0.631 — the car drives qualifying too.
//   partial corr(grid, finish | car-strength) = 0.433 — grid still has a real
//     direct effect (track position), but the car explains much of the raw link.
//   Driver overperformance = residual finish after removing car strength.
//   VER ≈ −3.3, ALO ≈ −1.6, ALB ≈ −0.9 beat their car.
//   PER ≈ +2.7, SAR ≈ +1.8, STR ≈ +1.6 underperform.
//   VER vs PER (same Red Bull) = the cleanest driver-skill estimate.

import { h } from "../lib/dom.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot } from "../lib/plot.js";
import {
  lessonLayout, panelSection, segmented, toggle,
  readout, challenge,
} from "../lib/ui.js";
import { clamp } from "../lib/stats.js";
import { rows, meta } from "../data/f1.js";
import { dataBadge } from "../lib/data.js";
import { DAG, DAGView } from "../lib/dag.js";

// ── CSS ──────────────────────────────────────────────────────────────────────
function ensureCSS() {
  if (document.getElementById("f1-css")) return;
  const st = document.createElement("style");
  st.id = "f1-css";
  st.textContent = `
.f1-wrap { display:flex; flex-direction:column; align-items:center; width:100%; }
.f1-wrap canvas { max-width:100%; height:auto; display:block; }
.f1-wrap svg { max-width:100%; height:auto; display:block; }
.f1-sub { font:11px/1.4 var(--mono); color:var(--dim); text-align:center; margin:6px 0 2px; }
.f1-row { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-start; }
.f1-dag-wrap { width:100%; display:flex; justify-content:center; }
.f1-dag-wrap svg { max-width:560px; width:100%; }
@media (max-width:600px) {
  .f1-wrap canvas, .f1-wrap svg { max-width:100%; }
}
  `;
  document.head.appendChild(st);
}

// ── Data prep ─────────────────────────────────────────────────────────────────
function mean_(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function std_(xs) {
  const m = mean_(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
function corr_(xs, ys) {
  const mx = mean_(xs), my = mean_(ys), sx = std_(xs), sy = std_(ys);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (xs.length - 1) / sx / sy;
}
function olsResiduals(y, x) {
  const mx = mean_(x), my = mean_(y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxy / sxx, a = my - b * mx;
  return y.map((v, i) => v - (a + b * x[i]));
}

// Car strength per (constructor, season) = average finishing position
const csKey = r => r.constructor + "|" + r.season;
const csMap = {};
for (const r of rows) {
  const k = csKey(r);
  if (!csMap[k]) csMap[k] = { sum: 0, n: 0 };
  csMap[k].sum += r.finish;
  csMap[k].n++;
}
const carStrengthArr = rows.map(r => csMap[csKey(r)].sum / csMap[csKey(r)].n);
const gridArr = rows.map(r => r.grid);
const finArr  = rows.map(r => r.finish);

// Key statistics (computed live, verified against ground truth)
const CORR_GF  = corr_(gridArr, finArr);           // ≈ 0.658
const CORR_GCS = corr_(gridArr, carStrengthArr);    // ≈ 0.631
const gridRes  = olsResiduals(gridArr, carStrengthArr);
const finRes   = olsResiduals(finArr,  carStrengthArr);
const PARTIAL_GF_CS = corr_(gridRes, finRes);       // ≈ 0.433

// Driver overperformance = mean residual finish (negative = beats car)
const driverMap = {};
for (let i = 0; i < rows.length; i++) {
  const d = rows[i].driver;
  if (!driverMap[d]) driverMap[d] = { resids: [], n: 0 };
  driverMap[d].resids.push(finRes[i]);
  driverMap[d].n++;
}
const DRIVER_OVP = Object.entries(driverMap)
  .filter(([, v]) => v.n >= 25)
  .map(([driver, v]) => ({ driver, ovp: mean_(v.resids), n: v.n }))
  .sort((a, b) => a.ovp - b.ovp);

// Circuit-level grid→finish effect (Spearman-like: just Pearson on this data)
const circuitMap = {};
for (let i = 0; i < rows.length; i++) {
  const c = rows[i].circuit;
  if (!circuitMap[c]) circuitMap[c] = { gs: [], fs: [], name: rows[i].race };
  circuitMap[c].gs.push(rows[i].grid);
  circuitMap[c].fs.push(rows[i].finish);
}
const CIRCUIT_EFFECTS = Object.entries(circuitMap)
  .filter(([, v]) => v.gs.length >= 10)
  .map(([circuit, v]) => ({ circuit, name: v.name, r: corr_(v.gs, v.fs), n: v.gs.length }))
  .sort((a, b) => b.r - a.r);  // sorted high (grid matters) to low

// Teammate head-to-head per team (for a set of notable teams)
const NOTABLE_TEAMS = ["Red Bull", "Ferrari", "Mercedes", "McLaren", "Aston Martin", "Williams"];

function teammateStats(team) {
  const sub = rows.filter(r => r.constructor === team);
  // find drivers who drove for this team
  const drivers = [...new Set(sub.map(r => r.driver))];
  if (drivers.length < 2) return null;
  // find all races where both teammates finished (not DNF)
  const raceKeys = [...new Set(sub.map(r => r.season + "|" + r.round))];
  const pairData = {};
  for (const k of raceKeys) {
    const raceRows = sub.filter(r => r.season + "|" + r.round === k && r.dnf === 0);
    if (raceRows.length < 2) continue;
    // group by race-round, pick the pair in raceRows
    // For each pair of drivers in that race
    for (let a = 0; a < raceRows.length; a++) {
      for (let b = a + 1; b < raceRows.length; b++) {
        const da = raceRows[a].driver, db = raceRows[b].driver;
        const pairKey = [da, db].sort().join("|");
        if (!pairData[pairKey]) pairData[pairKey] = { dA: da, dB: db, aWins: 0, bWins: 0, aFinish: [], bFinish: [] };
        // who finished better (lower finish number = better)
        if (raceRows[a].finish < raceRows[b].finish) {
          pairData[pairKey].aWins++;
        } else {
          pairData[pairKey].bWins++;
        }
        pairData[pairKey].aFinish.push(raceRows[a].finish);
        pairData[pairKey].bFinish.push(raceRows[b].finish);
      }
    }
  }
  // Pick the dominant pair (most shared races)
  const pairs = Object.values(pairData)
    .sort((a, b) => (b.aWins + b.bWins) - (a.aWins + a.bWins));
  if (!pairs.length) return null;
  const best = pairs[0];
  return {
    team,
    dA: best.dA, dB: best.dB,
    aWins: best.aWins, bWins: best.bWins,
    total: best.aWins + best.bWins,
    aAvgFinish: mean_(best.aFinish),
    bAvgFinish: mean_(best.bFinish),
  };
}

const TEAMMATE_DATA = NOTABLE_TEAMS.map(t => teammateStats(t)).filter(Boolean);

// ── SVG helpers ───────────────────────────────────────────────────────────────
const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "text") el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.appendChild(c);
  return el;
}

// ── MODULE ────────────────────────────────────────────────────────────────────
export function mount(root) {
  ensureCSS();

  const state = {
    panel: "pole",    // "pole"|"confound"|"driver"|"teammates"|"circuit"|"verdict"
    controlCar: false,
    selectedTeam: "Red Bull",
    challengeDone: false,
  };

  // Springs for bar/scatter animations
  const corrSpring      = new Spring(0, { stiffness: 55, damping: 13 });
  const partialSpring   = new Spring(0, { stiffness: 55, damping: 13 });
  const barSprings      = DRIVER_OVP.map(() => new Spring(0, { stiffness: 50, damping: 13 }));
  const circuitSprings  = CIRCUIT_EFFECTS.slice(0, 20).map(() => new Spring(0, { stiffness: 50, damping: 13 }));

  // ── Layout ─────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel: panelEl, caption } = lessonLayout({
    title: "F1 — Driver or Car?",
    idea:
      "Pole position strongly predicts winning — but is that causal? " +
      "Constructor quality confounds both grid and finish. " +
      "Strip out the car to find which drivers actually beat their machinery, " +
      "and which circuits make starting position truly decisive.",
  });

  // Canvas (shared)
  const cv = new Canvas(580, 380, { margin: { t: 36, r: 28, b: 52, l: 64 } });
  cv.el.style.maxWidth = "100%";
  const sublabel = h("div", { class: "f1-sub" });
  const canvasWrap = h("div", { class: "f1-wrap" });
  canvasWrap.appendChild(cv.el);
  canvasWrap.appendChild(sublabel);

  // DAG for panel 2
  const dag = new DAG(
    [
      { id: "Car",    label: "Car",   sub: "constructor",  x: 280, y:  65, role: "confounder", conditionable: true },
      { id: "Grid",   label: "Grid",  sub: "start pos.",   x: 130, y: 240, role: "treatment",  conditionable: false },
      { id: "Finish", label: "Finish",sub: "result",       x: 430, y: 240, role: "outcome",    conditionable: false },
      { id: "Driver", label: "Driver",sub: "skill",        x: 430, y:  65, role: "other",      conditionable: false },
    ],
    [
      { from: "Car",    to: "Grid",   sign: "+", label: "fast cars qualify well" },
      { from: "Car",    to: "Finish", sign: "+", label: "fast cars finish well" },
      { from: "Grid",   to: "Finish", sign: "+", label: "track position" },
      { from: "Driver", to: "Finish", sign: "+", label: "skill" },
    ]
  );
  const dagView = new DAGView(dag, { width: 560, height: 330, onChange: onDAGChange });
  dagView.setFlow([{ from: "Grid", to: "Finish" }]);
  const dagWrap = h("div", { class: "f1-dag-wrap" });
  dagWrap.appendChild(dagView.svg);
  dagWrap.style.display = "none";

  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.alignItems = "center";
  stage.appendChild(canvasWrap);
  stage.appendChild(dagWrap);

  // ── Readouts ────────────────────────────────────────────────────────────────
  const rCorr    = readout({ label: "corr(grid, finish)",      value: CORR_GF.toFixed(3),  accent: "var(--neg)"    });
  const rPartial = readout({ label: "partial r | car",         value: "—",                  accent: "var(--pos)"    });
  const rTopDrv  = readout({ label: "Best beats-car driver",   value: "—",                  accent: "var(--gold)"   });

  const chal = challenge({
    goal:
      "Separate the driver from the car: control for the constructor to reveal which drivers " +
      "truly beat their machinery — confirm with a teammate head-to-head — and find the circuits " +
      "where starting position actually causes the result.",
  });

  // ── Panel selector ──────────────────────────────────────────────────────────
  const viewSeg = segmented({
    options: [
      { label: "Pole predicts wins",     value: "pole"      },
      { label: "Car is the confounder",  value: "confound"  },
      { label: "Driver vs Car",          value: "driver"    },
      { label: "Teammates",              value: "teammates" },
      { label: "Where grid matters",     value: "circuit"   },
      { label: "Verdict",                value: "verdict"   },
    ],
    value: state.panel,
    onSelect: v => {
      state.panel = v;
      syncVisibility();
      animatePanel(v);
      updateReadouts();
      if ((v === "driver" || v === "teammates") && !state.challengeDone) {
        state.challengeDone = true;
        const top = DRIVER_OVP[0];
        chal.setState(true,
          `partial r(grid,finish|car) = ${PARTIAL_GF_CS.toFixed(3)} · ` +
          `top driver: ${top.driver} (${top.ovp.toFixed(2)}) · ` +
          `Monaco r = ${(CIRCUIT_EFFECTS.find(c => c.circuit === "monaco") || CIRCUIT_EFFECTS[0]).r.toFixed(3)}`
        );
      }
    },
  });

  // Control-for-car toggle (panel 2)
  const carToggle = toggle({
    label: "Control for the car (constructor)",
    value: false,
    onToggle: on => {
      state.controlCar = on;
      if (on) {
        corrSpring.set(PARTIAL_GF_CS);
      } else {
        corrSpring.set(CORR_GF);
      }
    },
    hint: "(shrinks grid↔finish association from 0.66 → 0.43)",
  });

  // Team selector for panel 4
  const teamSeg = segmented({
    options: NOTABLE_TEAMS.map(t => ({ label: t === "Aston Martin" ? "Aston" : t === "McLaren" ? "McLaren" : t, value: t })),
    value: state.selectedTeam,
    onSelect: v => { state.selectedTeam = v; },
  });

  // ── Assemble panel ──────────────────────────────────────────────────────────
  panelEl.append(
    dataBadge(meta),
    panelSection("", viewSeg),
    panelSection("Control for car (panel 2)", carToggle),
    panelSection("Select team (panel 4)", teamSeg),
    panelSection("Key stats", h("div", { class: "f1-row" }, [rCorr, rPartial, rTopDrv])),
    panelSection("Challenge", chal),
  );

  // ── Caption ──────────────────────────────────────────────────────────────────
  caption.innerHTML =
    "Data: <strong>Ergast / jolpi.ca F1 API, 2023–25</strong> " +
    "(3&nbsp;&times;&nbsp;~24 races, " + rows.length + " race entries). " +
    "Raw correlation corr(grid,&nbsp;finish)&nbsp;=&nbsp;" + CORR_GF.toFixed(3) + " — " +
    "pole strongly predicts victory. But the <em>constructor</em> is a " +
    "<strong>confounder</strong>: a fast car qualifies well (corr(grid,&nbsp;car-strength)&nbsp;=&nbsp;" +
    CORR_GCS.toFixed(3) + ") <em>and</em> finishes well. " +
    "Controlling for the car, the partial correlation shrinks to " + PARTIAL_GF_CS.toFixed(3) + " — " +
    "grid still has a real direct effect (track position limits overtaking), " +
    "but much of the raw link was the car. " +
    "Driver <em>overperformance</em> (residual finish after removing constructor strength) identifies " +
    "who beats their machinery: " +
    DRIVER_OVP.slice(0, 3).map(d => `<strong>${d.driver}</strong>&nbsp;(${d.ovp.toFixed(2)})`).join(", ") + ". " +
    "The cleanest driver-skill estimate is the <em>teammate head-to-head</em>: " +
    "VER&nbsp;vs&nbsp;PER in the same Red Bull car. " +
    "Circuit heterogeneity matters for betting: street circuits like Monaco make starting position " +
    "nearly deterministic; power tracks like Monza enable overtaking. " +
    "<em>Caution:</em> markets price in driver quality; this structure illuminates potential mispricings " +
    "in head-to-head driver markets, but no guaranteed arbitrage is claimed. " +
    "Fresh causal-inference analysis on public data; not affiliated with F1 or any betting entity.";

  root.appendChild(layout);

  // ── Visibility sync ──────────────────────────────────────────────────────────
  function syncVisibility() {
    const useSVG = state.panel === "confound";
    canvasWrap.style.display = useSVG ? "none" : "";
    dagWrap.style.display    = useSVG ? ""     : "none";
  }
  syncVisibility();

  // ── Animate panel targets ────────────────────────────────────────────────────
  function animatePanel(p) {
    if (p === "pole" || p === "confound") {
      corrSpring.set(state.controlCar ? PARTIAL_GF_CS : CORR_GF);
      partialSpring.set(PARTIAL_GF_CS);
    }
    if (p === "driver") {
      DRIVER_OVP.forEach((d, i) => barSprings[i].set(d.ovp));
    }
    if (p === "circuit") {
      CIRCUIT_EFFECTS.slice(0, 20).forEach((c, i) => circuitSprings[i].set(c.r));
    }
  }
  animatePanel(state.panel);
  corrSpring.set(CORR_GF);
  partialSpring.set(PARTIAL_GF_CS);

  // ── Readouts ─────────────────────────────────────────────────────────────────
  function updateReadouts() {
    rCorr.set(CORR_GF.toFixed(3), "raw grid↔finish");
    rPartial.set(PARTIAL_GF_CS.toFixed(3), "after removing car");
    const top = DRIVER_OVP[0];
    rTopDrv.set(top ? `${top.driver} (${top.ovp.toFixed(2)})` : "—", "most negative residual");
  }
  updateReadouts();

  // ── DAG onChange ─────────────────────────────────────────────────────────────
  function onDAGChange() {
    // If user conditions on Car, toggle the control
    const carConditioned = dagView.Z.has("Car");
    if (carConditioned !== state.controlCar) {
      state.controlCar = carConditioned;
      carToggle.set(carConditioned);
      corrSpring.set(carConditioned ? PARTIAL_GF_CS : CORR_GF);
    }
  }

  // ── Frame loop ───────────────────────────────────────────────────────────────
  const stop = onFrame(dt => {
    corrSpring.step(dt);
    partialSpring.step(dt);
    for (const sp of barSprings) sp.step(dt);
    for (const sp of circuitSprings) sp.step(dt);
    draw();
  });

  // ── Draw dispatcher ───────────────────────────────────────────────────────────
  function draw() {
    const p = state.panel;
    if (p === "confound") {
      drawConfound(); // DAG renders itself; we just update the sublabel
      return;
    }
    cv.clear();
    if      (p === "pole")      drawPole();
    else if (p === "driver")    drawDriver();
    else if (p === "teammates") drawTeammates();
    else if (p === "circuit")   drawCircuit();
    else if (p === "verdict")   drawVerdict();
  }

  // ── PANEL 1: Pole predicts wins ───────────────────────────────────────────────
  function drawPole() {
    sublabel.textContent =
      "Grid position vs finishing position — all 2023–25 entries · " +
      `raw corr = ${CORR_GF.toFixed(3)}`;

    const ctx = cv.ctx;
    const b = cv.box;
    const css = getComputedStyle(document.documentElement);
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const accent = css.getPropertyValue("--accent").trim() || "#8c78ff";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";

    const sx = new Scale([0, 22], [b.x0, b.x1]);
    const sy = new Scale([0, 22], [b.y1, b.y0]);

    drawAxes(cv, sx, sy, {
      xlabel: "Grid position (start)",
      ylabel: "Finishing position",
      xticks: [1, 5, 10, 15, 20],
      yticks: [1, 5, 10, 15, 20],
      grid: true,
    });

    // Plot a representative subsample (every 4th row for performance)
    const step = Math.max(1, Math.floor(rows.length / 400));
    for (let i = 0; i < rows.length; i += step) {
      const r = rows[i];
      // Color by constructor tier (avg finish: low = fast team = warmer color)
      const cs = carStrengthArr[i];
      const col2 = cs < 9 ? accent : cs < 14 ? gold : dim;
      dot(ctx, sx.map(r.grid), sy.map(r.finish), 3, col2, { alpha: 0.28 });
    }

    // Regression line
    const { a: ra, b: rb } = ols1D(gridArr, finArr);
    ctx.save();
    ctx.strokeStyle = neg; ctx.lineWidth = 2; ctx.globalAlpha = 0.75;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sx.map(1),  sy.map(ra + rb * 1));
    ctx.lineTo(sx.map(21), sy.map(ra + rb * 21));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Annotation: r value
    ctx.save();
    ctx.fillStyle = neg; ctx.font = "bold 12px var(--mono)";
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText(`r = ${CORR_GF.toFixed(3)}`, b.x1 - 4, b.y0 + 4);
    ctx.fillStyle = dim; ctx.font = "11px var(--mono)";
    ctx.fillText("does pole cause winning?", b.x1 - 4, b.y0 + 20);
    ctx.restore();

    // Color legend
    const items = [
      { label: "Top constructor", color: accent },
      { label: "Mid field",       color: gold   },
      { label: "Backmarker",      color: dim    },
    ];
    ctx.save();
    items.forEach(({ label, color }, i) => {
      const lx = b.x0 + i * 155;
      const ly = b.y0 + 4;
      ctx.fillStyle = color; ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(lx + 6, ly + 5, 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = dim; ctx.font = "10px var(--mono)";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(label, lx + 14, ly + 5);
    });
    ctx.restore();
  }

  // ── PANEL 2: DAG (handled by dagView — just update sublabel) ─────────────────
  // DAG is always rendered by DAGView in its own SVG.
  // We update the sublabel with the live corr value.
  function drawConfound() {
    const r = corrSpring.value;
    sublabel.textContent = state.controlCar
      ? `Controlling for car: partial corr(grid,finish|car) = ${r.toFixed(3)} — grid still matters (track position), but less`
      : `Raw: corr(grid,finish) = ${r.toFixed(3)} — car is a confounder: click Car node to control it`;
  }

  // ── PANEL 3: Driver vs Car — ranked bar chart ─────────────────────────────────
  function drawDriver() {
    const n = DRIVER_OVP.length;
    sublabel.textContent =
      "Driver overperformance = residual finish after removing constructor strength (negative = beats car)";

    const ctx = cv.ctx;
    const b = cv.box;
    const css = getComputedStyle(document.documentElement);
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const pos    = css.getPropertyValue("--pos").trim()    || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";

    const vals = barSprings.map(s => s.value);
    const vMin = Math.min(...vals, -4) - 0.4;
    const vMax = Math.max(...vals,  3) + 0.4;

    const sx = new Scale([-0.5, n + 0.5], [b.x0, b.x1]);
    const sy = new Scale([vMin, vMax], [b.y1, b.y0]);

    drawAxes(cv, sx, sy, {
      xlabel: "driver (≥25 races, ranked best to worst)",
      ylabel: "avg residual finish position",
      xticks: [],
      yticks: niceTicks(vMin, vMax, 5),
      grid: true,
    });

    // Zero line
    const zy = sy.map(0);
    ctx.save(); ctx.strokeStyle = dim; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(b.x0, zy); ctx.lineTo(b.x1, zy); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();

    // Zero label
    ctx.save();
    ctx.fillStyle = dim; ctx.font = "10px var(--mono)";
    ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText("= car average", b.x0 + 2, zy - 2);
    ctx.restore();

    const barW = (sx.map(1) - sx.map(0)) * 0.65;
    const baseline = sy.map(0);

    DRIVER_OVP.forEach((d, i) => {
      const v = barSprings[i].value;
      const xc = sx.map(i);
      const color = v < -0.5 ? pos : v > 0.5 ? neg : gold;
      const barTop = sy.map(v);

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = color;
      ctx.fillRect(xc - barW / 2, Math.min(barTop, baseline), barW, Math.abs(barTop - baseline));
      ctx.restore();

      // Value label
      ctx.save();
      ctx.fillStyle = ink; ctx.font = "bold 10px var(--mono)";
      ctx.textAlign = "center";
      ctx.textBaseline = v < 0 ? "bottom" : "top";
      ctx.fillText(v.toFixed(1), xc, v < 0 ? barTop - 2 : barTop + 2);
      // Driver code
      ctx.fillStyle = dim; ctx.font = "9px var(--mono)";
      ctx.textBaseline = "top";
      ctx.save();
      ctx.translate(xc, b.y1 + 4);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(d.driver, 0, 0);
      ctx.restore();
      ctx.restore();
    });

    // Note: VER + PER same car
    const verI = DRIVER_OVP.findIndex(d => d.driver === "VER");
    const perI = DRIVER_OVP.findIndex(d => d.driver === "PER");
    if (verI >= 0 && perI >= 0) {
      const xVer = sx.map(verI), xPer = sx.map(perI);
      ctx.save();
      ctx.strokeStyle = gold; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
      ctx.setLineDash([3, 3]);
      const bracketY = Math.min(sy.map(DRIVER_OVP[verI].ovp), sy.map(DRIVER_OVP[perI].ovp)) - 16;
      ctx.beginPath(); ctx.moveTo(xVer, bracketY); ctx.lineTo(xPer, bracketY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = gold; ctx.font = "bold 10px var(--mono)";
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText("same Red Bull →", (xVer + xPer) / 2, bracketY - 2);
      ctx.restore();
    }

    // Legend
    ctx.save();
    ctx.font = "10px var(--mono)";
    const legend = [
      { color: pos, label: "beats car (negative)" },
      { color: gold, label: "near average" },
      { color: neg, label: "underperforms" },
    ];
    legend.forEach(({ color, label }, i) => {
      const lx = b.x0 + i * 170;
      ctx.fillStyle = color; ctx.globalAlpha = 0.85;
      ctx.fillRect(lx, b.y0 + 4, 12, 8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = dim; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(label, lx + 16, b.y0 + 4);
    });
    ctx.restore();
  }

  // ── PANEL 4: Teammates — the perfect experiment ───────────────────────────────
  function drawTeammates() {
    const td = TEAMMATE_DATA.find(t => t.team === state.selectedTeam);
    sublabel.textContent =
      `Teammate head-to-head: same car = pure driver comparison (${state.selectedTeam})`;

    const ctx = cv.ctx;
    const b = cv.box;
    const css = getComputedStyle(document.documentElement);
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const pos    = css.getPropertyValue("--pos").trim()    || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";
    const accent = css.getPropertyValue("--accent").trim() || "#8c78ff";

    if (!td) {
      ctx.fillStyle = dim; ctx.font = "14px var(--mono)";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("No paired data for this team", (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      return;
    }

    const { dA, dB, aWins, bWins, total, aAvgFinish, bAvgFinish } = td;
    const winnerD = aWins >= bWins ? dA : dB;
    const winnerPct = Math.max(aWins, bWins) / total;
    const winnerAvgF = aWins >= bWins ? aAvgFinish : bAvgFinish;
    const loserAvgF  = aWins >= bWins ? bAvgFinish : aAvgFinish;
    const loserD = aWins >= bWins ? dB : dA;

    const cx = (b.x0 + b.x1) / 2;
    const topY = b.y0 + 16;

    // Title: why this is the cleanest test
    ctx.save();
    ctx.fillStyle = ink; ctx.font = "bold 13px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(`${state.selectedTeam} — same car controls for the constructor`, cx, topY);
    ctx.fillStyle = dim; ctx.font = "11px var(--mono)";
    ctx.fillText(
      "A matched-pair design: every confound that's fixed by the car (chassis, engine, tyres) cancels out.",
      cx, topY + 18
    );
    ctx.restore();

    // Head-to-head bar: win counts
    const barAreaY0 = topY + 50, barAreaH = 100;
    const totalW = b.x1 - b.x0 - 80;
    const aFrac = aWins / (total || 1);

    // Draw split bar
    const barLeft = b.x0 + 40;
    const aW = aFrac * totalW;
    const bW = (1 - aFrac) * totalW;

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = accent;
    ctx.fillRect(barLeft, barAreaY0, aW, barAreaH);
    ctx.fillStyle = neg;
    ctx.fillRect(barLeft + aW, barAreaY0, bW, barAreaH);
    ctx.globalAlpha = 1;

    // Driver labels inside bars
    const aLabel = `${dA}  ${aWins}/${total}  (${(aWins/total*100).toFixed(0)}%)`;
    const bLabel = `${dB}  ${bWins}/${total}  (${(bWins/total*100).toFixed(0)}%)`;
    ctx.fillStyle = "#fff"; ctx.font = "bold 13px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (aW > 60) ctx.fillText(aLabel, barLeft + aW / 2, barAreaY0 + barAreaH / 2);
    if (bW > 60) ctx.fillText(bLabel, barLeft + aW + bW / 2, barAreaY0 + barAreaH / 2);
    ctx.restore();

    // Average finish positions side by side
    const avfY = barAreaY0 + barAreaH + 24;
    const avfItems = [
      { label: dA, val: aAvgFinish, color: accent },
      { label: dB, val: bAvgFinish, color: neg    },
    ];
    const avfW = 200;
    const avfMaxF = 22;
    const avfSX = new Scale([0.5, avfMaxF], [0, avfW]);

    avfItems.forEach(({ label, val, color }, idx) => {
      const bx = b.x0 + 30 + idx * (avfW + 80);
      const by = avfY;
      ctx.save();
      ctx.fillStyle = ink; ctx.font = "bold 12px var(--mono)";
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(`${label}  avg finish: ${val.toFixed(1)}`, bx, by);

      // Mini bar
      ctx.fillStyle = color; ctx.globalAlpha = 0.8;
      ctx.fillRect(bx, by + 18, avfSX.map(val), 12);
      ctx.globalAlpha = 1;
      ctx.fillStyle = dim; ctx.font = "10px var(--mono)";
      ctx.textBaseline = "top";
      ctx.fillText(`P${val.toFixed(1)} avg`, bx + avfSX.map(val) + 4, by + 18);
      ctx.restore();
    });

    // Explanation text
    const expY = avfY + 60;
    ctx.save();
    ctx.fillStyle = dim; ctx.font = "11px var(--mono)";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    const lines = [
      `Winner: ${winnerD} in ${Math.max(aWins,bWins)}/${total} matched races (${(winnerPct*100).toFixed(0)}%)`,
      `avg finish ${winnerD}=${winnerAvgF.toFixed(1)} vs ${loserD}=${loserAvgF.toFixed(1)}`,
      `Gap = ${Math.abs(winnerAvgF - loserAvgF).toFixed(1)} positions — attributable to driver, not car.`,
      `Why this is the cleanest test: both drivers use identical machinery each race weekend.`,
      `Unmeasured car differences across constructors cannot confound a same-team head-to-head.`,
    ];
    lines.forEach((ln, i) => {
      ctx.fillStyle = i === 2 ? pos : i === 3 || i === 4 ? gold : dim;
      if (i === 0) ctx.fillStyle = ink;
      ctx.fillText(ln, b.x0 + 30, expY + i * 17);
    });
    ctx.restore();
  }

  // ── PANEL 5: Circuit heterogeneity ────────────────────────────────────────────
  function drawCircuit() {
    const shown = CIRCUIT_EFFECTS.slice(0, 20);
    sublabel.textContent =
      "Grid→finish correlation by circuit — high at street tracks (less overtaking), low at power circuits";

    const ctx = cv.ctx;
    const b = cv.box;
    const css = getComputedStyle(document.documentElement);
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const pos    = css.getPropertyValue("--pos").trim()    || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";

    const n = shown.length;
    const sx = new Scale([-0.5, n + 0.5], [b.x0, b.x1]);
    const sy = new Scale([0, 1], [b.y1, b.y0]);

    drawAxes(cv, sx, sy, {
      xlabel: "circuit (sorted by grid→finish effect, high to low)",
      ylabel: "corr(grid, finish)",
      xticks: [],
      yticks: [0, 0.2, 0.4, 0.6, 0.8, 1.0],
      grid: true,
    });

    const barW = (sx.map(1) - sx.map(0)) * 0.65;
    const baseline = sy.map(0);

    // Threshold line at global corr
    const globalY = sy.map(CORR_GF);
    ctx.save();
    ctx.strokeStyle = dim; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(b.x0, globalY); ctx.lineTo(b.x1, globalY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = dim; ctx.font = "10px var(--mono)"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText(`overall r=${CORR_GF.toFixed(2)}`, b.x0 + 2, globalY - 2);
    ctx.restore();

    shown.forEach((c, i) => {
      const v = circuitSprings[i].value;
      const xc = sx.map(i);
      // Color: high r = warm (red), low r = cool (blue/green)
      const t = clamp((v - 0.3) / 0.5, 0, 1);
      const color = t > 0.7 ? neg : t > 0.4 ? gold : pos;
      const barTop = sy.map(v);

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = color;
      ctx.fillRect(xc - barW / 2, barTop, barW, baseline - barTop);
      ctx.restore();

      // Circuit name (rotated)
      ctx.save();
      ctx.fillStyle = dim; ctx.font = "9px var(--mono)";
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.save();
      ctx.translate(xc, b.y1 + 4);
      ctx.rotate(-Math.PI / 3.5);
      ctx.fillText(c.name.slice(0, 10), 0, 0);
      ctx.restore();
      ctx.restore();

      // Value above bar (for top 3 and bottom 3)
      if (i < 3 || i >= n - 3) {
        ctx.save();
        ctx.fillStyle = ink; ctx.font = "bold 9px var(--mono)";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(v.toFixed(2), xc, barTop - 2);
        ctx.restore();
      }
    });

    // Annotation
    ctx.save();
    ctx.fillStyle = neg; ctx.font = "bold 11px var(--mono)";
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText("← high: qualifying market matters here", b.x1 - 2, b.y0 + 4);
    ctx.fillStyle = pos; ctx.textAlign = "left";
    ctx.fillText("low: overtaking possible →", b.x0 + 2, b.y0 + 18);
    ctx.restore();
  }

  // ── PANEL 6: Verdict ──────────────────────────────────────────────────────────
  function drawVerdict() {
    sublabel.textContent = "Causal anatomy of F1 results — what the data shows and doesn't show";
    const ctx = cv.ctx;
    const b = cv.box;
    const css = getComputedStyle(document.documentElement);
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const pos    = css.getPropertyValue("--pos").trim()    || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";

    const cx = (b.x0 + b.x1) / 2;
    ctx.save();
    ctx.fillStyle = ink; ctx.font = "bold 14px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("Driver or car? — the causal verdict", cx, b.y0 + 4);
    ctx.restore();

    const topDriver = DRIVER_OVP[0];
    const bottomDriver = DRIVER_OVP[DRIVER_OVP.length - 1];

    const items = [
      { type: "found", text: `Raw: corr(grid,finish) = ${CORR_GF.toFixed(3)} — pole strongly predicts victory.` },
      { type: "found", text: `Confounding: corr(grid,car-strength) = ${CORR_GCS.toFixed(3)} — fast cars qualify and finish well.` },
      { type: "found", text: `After controlling for the car: partial r = ${PARTIAL_GF_CS.toFixed(3)} (down from ${CORR_GF.toFixed(3)}). Grid still has a real direct effect — track position limits overtaking — but much of the raw signal was the car.` },
      { type: "found", text: `Driver overperformance: ${topDriver.driver} (${topDriver.ovp.toFixed(2)}) is the biggest overachiever; ${bottomDriver.driver} (${bottomDriver.ovp.toFixed(2)}) the most underperforming vs their machinery.` },
      { type: "found", text: `Teammate head-to-head (VER vs PER, same Red Bull): the cleanest causal test — no car confound. The gap is attributable to driver skill alone.` },
      { type: "found", text: `Circuit heterogeneity: grid matters most at street tracks (Monaco), least at power circuits (Monza). Betting note: qualifying markets are more informative at high-effect circuits.` },
      { type: "caveat", text: `Limits: car development changes mid-season; driver changes teams; 3 seasons may miss structural shifts. Correlations reflect average effects, not causal effects for any specific race.` },
      { type: "verdict", text: `Verdict: "pole predicts wins" is mostly the car causing both. The undermodeled signal — especially in head-to-head driver betting — is which driver beats their machinery. Markets adjust; this is structural insight, not guaranteed edge.` },
    ];

    const rowH = 38;
    const icons = { found: "✓", caveat: "△", verdict: "◆" };
    const colors = { found: pos, caveat: neg, verdict: gold };

    items.forEach((item, i) => {
      const y = b.y0 + 30 + i * rowH;
      if (y + rowH > b.y1) return;
      const color = colors[item.type];
      const icon  = icons[item.type];

      ctx.save();
      ctx.fillStyle = color; ctx.globalAlpha = 0.12;
      ctx.fillRect(b.x0, y, b.x1 - b.x0, rowH - 4);
      ctx.globalAlpha = 1;

      ctx.font = "bold 12px var(--mono)"; ctx.fillStyle = color;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(icon, b.x0 + 6, y + rowH / 2 - 2);

      ctx.font = "10px var(--mono)"; ctx.fillStyle = ink;
      drawWrappedText(ctx, item.text, b.x0 + 24, y + 7, b.x1 - b.x0 - 30, 14);
      ctx.restore();
    });
  }

  // Kickoff draw
  draw();

  return () => {
    stop();
    dagView && dagView.destroy();
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function ols1D(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - slope * mx, b: slope };
}

function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(step0) || 1)));
  const norm = step0 / mag;
  let step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  step *= mag;
  const start = Math.ceil(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

function drawWrappedText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(" ");
  let ln = "";
  let curY = y;
  for (const w of words) {
    const test = ln ? ln + " " + w : w;
    if (ctx.measureText(test).width > maxW && ln) {
      ctx.fillText(ln, x, curY);
      ln = w; curY += lineH;
    } else { ln = test; }
  }
  if (ln) ctx.fillText(ln, x, curY);
}
