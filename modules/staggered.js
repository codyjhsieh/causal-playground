// Staggered DiD & the Two-Way Fixed-Effects Trap.
// When units adopt a policy in different years, TWFE secretly uses
// already-treated units as controls — a forbidden comparison that can
// bias the estimate, sometimes flipping its sign.
// Real data: Cheng & Hoekstra (2013), castle-doctrine / stand-your-ground laws.
//
// Computes:
//   • Naive TWFE via two-way within-transformation (demean by state + year + grand mean)
//   • Callaway–Sant'Anna style clean ATT: each cohort compared only to
//     not-yet-treated / never-treated units
//   • Goodman-Bacon decomposition: surfaces the "forbidden" already-treated-as-control
//     comparisons that bias TWFE
//
// References: Goodman-Bacon (2021); Callaway & Sant'Anna (2021);
//   de Chaisemartin & D'Haultfœuille (2020); Sun & Abraham (2021).

import { h } from "../lib/dom.js";
import { onFrame, Spring, lerp } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot } from "../lib/plot.js";
import {
  lessonLayout, panelSection, toggle, segmented, readout, challenge, note,
} from "../lib/ui.js";
import { mean } from "../lib/stats.js";
import { rows as castleRows, meta } from "../data/castle.js";
import { complete, dataBadge } from "../lib/data.js";

// ── CSS ──────────────────────────────────────────────────────────────────────
function ensureCSS() {
  if (document.getElementById("staggered-css")) return;
  const st = document.createElement("style");
  st.id = "staggered-css";
  st.textContent = `
.stag-label { font: 11px/1 var(--mono); color: var(--dim); text-align: center; margin: 4px 0 0; }
.stag-cite  { font: 10.5px/1.5 var(--mono); color: var(--dim); padding: 5px 8px;
              border-left: 2px solid var(--line); margin-top: 6px; }
.stag-readout-row { display: flex; gap: 8px; flex-wrap: wrap; }
.stag-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; font: 11px var(--mono); color: var(--dim);
               margin-top: 4px; align-items: center; }
.stag-swatch { display:inline-block; width:20px; height:3px; border-radius:2px;
               vertical-align:middle; margin-right:4px; }
.stag-swatch-dot { display:inline-block; width:9px; height:9px; border-radius:50%;
                   vertical-align:middle; margin-right:4px; }
  `;
  document.head.appendChild(st);
}

// ── Cohort palette ─────────────────────────────────────────────────────────
const COHORT_COLORS = {
  2006: "#4cc2ff",
  2007: "#7c6cff",
  2008: "#ff8a4c",
  2009: "#4cd0a0",
  2010: "#ffce5c",
};
const NEVER_COLOR = "#8a8a99";

// ── Pre-process data ────────────────────────────────────────────────────────
// Keep complete cases with l_homicide, post, effyear present
const CLEAN = complete(castleRows, ["sid", "year", "l_homicide", "post", "effyear"]);

// State → cohort (effyear; 0 = never-treated)
const STATE_COHORT = {};
for (const r of CLEAN) STATE_COHORT[r.sid] = r.effyear;

// Unique states, years
const SIDS   = [...new Set(CLEAN.map(r => r.sid))].sort((a, b) => a - b);
const YEARS  = [...new Set(CLEAN.map(r => r.year))].sort((a, b) => a - b);
const YMIN   = YEARS[0];      // 2000
const YMAX   = YEARS[YEARS.length - 1];  // 2010

// Cohort groups (years of adoption observed in data)
const ADOPTING_COHORTS = [...new Set(
  Object.values(STATE_COHORT).filter(g => g > 0)
)].sort((a, b) => a - b);

// Never-treated states
const NEVER_SIDS = SIDS.filter(s => STATE_COHORT[s] === 0);

// ── Index rows by (sid, year) ───────────────────────────────────────────────
const INDEX = {};
for (const r of CLEAN) INDEX[`${r.sid}_${r.year}`] = r;
function obs(sid, year) { return INDEX[`${sid}_${year}`]; }

// ── Two-way within transformation ─────────────────────────────────────────
// y_tilde = y - state_mean - year_mean + grand_mean
// Then TWFE coefficient on post = cov(post_tilde, y_tilde) / var(post_tilde)
function computeTWFE() {
  // state means
  const stateMeanY = {};
  const stateMeanP = {};
  for (const sid of SIDS) {
    const rs = YEARS.map(yr => obs(sid, yr)).filter(Boolean);
    stateMeanY[sid] = mean(rs.map(r => r.l_homicide));
    stateMeanP[sid] = mean(rs.map(r => r.post));
  }
  // year means
  const yearMeanY = {};
  const yearMeanP = {};
  for (const yr of YEARS) {
    const rs = SIDS.map(sid => obs(sid, yr)).filter(Boolean);
    yearMeanY[yr] = mean(rs.map(r => r.l_homicide));
    yearMeanP[yr] = mean(rs.map(r => r.post));
  }
  // grand means
  const allY = CLEAN.map(r => r.l_homicide);
  const allP = CLEAN.map(r => r.post);
  const grandY = mean(allY);
  const grandP = mean(allP);

  // demeaned
  let covPY = 0, varP = 0;
  for (const r of CLEAN) {
    const yTilde = r.l_homicide - stateMeanY[r.sid] - yearMeanY[r.year] + grandY;
    const pTilde = r.post       - stateMeanP[r.sid] - yearMeanP[r.year] + grandP;
    covPY += pTilde * yTilde;
    varP  += pTilde * pTilde;
  }
  return varP > 0 ? covPY / varP : 0;
}

// ── Callaway–Sant'Anna clean ATT ────────────────────────────────────────────
// For each cohort g and each post-adoption year t >= g:
//   ATT(g,t) = [mean y(t) - mean y(g-1)] for cohort g
//            - [mean y(t) - mean y(g-1)] for not-yet-treated/never-treated units
// Aggregate: simple unweighted average over all (g,t) with t >= g
// Control pool for (g,t): states with effyear=0 or effyear > t  (not yet treated)
function computeCleanATT() {
  const attCells = []; // { g, t, att, nTreat, nCtrl }

  for (const g of ADOPTING_COHORTS) {
    const baseyear = g - 1;  // baseline: one year before adoption

    // treated cohort states
    const tSids = SIDS.filter(s => STATE_COHORT[s] === g);

    // base-period mean for treated cohort
    const treatBase = mean(tSids.map(s => obs(s, baseyear)?.l_homicide).filter(v => v != null));
    if (!isFinite(treatBase)) continue;

    for (const t of YEARS) {
      if (t < g) continue;  // only post-adoption years for this cohort
      if (t < baseyear) continue;
      if (baseyear < YMIN) continue;

      // treated cohort mean at t
      const treatT = mean(tSids.map(s => obs(s, t)?.l_homicide).filter(v => v != null));
      if (!isFinite(treatT)) continue;

      // clean control pool: never-treated OR not-yet-treated (effyear > t)
      const ctrlSids = SIDS.filter(s => {
        const ey = STATE_COHORT[s];
        return ey === 0 || ey > t;
      });
      if (ctrlSids.length < 2) continue;

      const ctrlBase = mean(ctrlSids.map(s => obs(s, baseyear)?.l_homicide).filter(v => v != null));
      const ctrlT    = mean(ctrlSids.map(s => obs(s, t)?.l_homicide).filter(v => v != null));
      if (!isFinite(ctrlBase) || !isFinite(ctrlT)) continue;

      const att = (treatT - treatBase) - (ctrlT - ctrlBase);
      attCells.push({ g, t, att, nTreat: tSids.length, nCtrl: ctrlSids.length });
    }
  }

  if (attCells.length === 0) return { att: 0, cells: [] };
  const att = mean(attCells.map(c => c.att));
  return { att, cells: attCells };
}

// ── Goodman-Bacon comparisons ───────────────────────────────────────────────
// There are three kinds of 2×2 DiD comparisons TWFE is averaging:
//   1. Early-vs-never: early adopter vs never-treated  (clean)
//   2. Late-vs-never:  late adopter vs never-treated   (clean)
//   3. Early-vs-late:  early adopter vs late adopter   (forbidden! late is treated in 2nd window)
// We enumerate a simplified version of these.
function computeBaconComparisons() {
  const comparisons = []; // { type, gEarly, gLate, estimate, weight, forbidden }

  // Each pair of adopting cohorts
  for (let i = 0; i < ADOPTING_COHORTS.length; i++) {
    for (let j = i + 1; j < ADOPTING_COHORTS.length; j++) {
      const gE = ADOPTING_COHORTS[i];  // earlier adopter
      const gL = ADOPTING_COHORTS[j];  // later adopter
      const early_sids = SIDS.filter(s => STATE_COHORT[s] === gE);
      const late_sids  = SIDS.filter(s => STATE_COHORT[s] === gL);
      if (early_sids.length < 1 || late_sids.length < 1) continue;

      // "Early vs Late": uses the late group (still untreated) as control for the early adopter
      // window 1: pre-gE vs [gE, gL): clean comparison (late is not yet treated)
      // window 2: [gL, max] where early already treated, late newly treated
      // → the second window uses already-treated early as control for the late — FORBIDDEN

      // Simplified: compute one 2×2 for each pair
      // Window: before gE vs [gE, gL) — late is control (not yet treated) — OK
      const baseYears = YEARS.filter(yr => yr < gE);
      const midYears  = YEARS.filter(yr => yr >= gE && yr < gL);
      const lateYears = YEARS.filter(yr => yr >= gL);

      if (baseYears.length < 1 || midYears.length < 1) continue;

      const e_base = mean(baseYears.flatMap(yr => early_sids.map(s => obs(s, yr)?.l_homicide).filter(v => v != null)));
      const e_mid  = mean(midYears.flatMap(yr => early_sids.map(s => obs(s, yr)?.l_homicide).filter(v => v != null)));
      const l_base = mean(baseYears.flatMap(yr => late_sids.map(s => obs(s, yr)?.l_homicide).filter(v => v != null)));
      const l_mid  = mean(midYears.flatMap(yr => late_sids.map(s => obs(s, yr)?.l_homicide).filter(v => v != null)));

      if ([e_base, e_mid, l_base, l_mid].some(v => !isFinite(v))) continue;

      const est_clean = (e_mid - e_base) - (l_mid - l_base);
      comparisons.push({
        type: "early-vs-late-clean",
        gEarly: gE, gLate: gL,
        estimate: est_clean,
        weight: early_sids.length * late_sids.length,
        forbidden: false,
        label: `g${gE} v g${gL} (pre→mid, clean)`,
      });

      // Forbidden window: post-gL, where early is already treated used as control for late
      if (lateYears.length >= 1) {
        const e_late_obs = mean(lateYears.flatMap(yr => early_sids.map(s => obs(s, yr)?.l_homicide).filter(v => v != null)));
        const l_late_obs = mean(lateYears.flatMap(yr => late_sids.map(s => obs(s, yr)?.l_homicide).filter(v => v != null)));
        const e_pre_late = mean(midYears.flatMap(yr => early_sids.map(s => obs(s, yr)?.l_homicide).filter(v => v != null)));
        const l_pre_late = mean(midYears.flatMap(yr => late_sids.map(s => obs(s, yr)?.l_homicide).filter(v => v != null)));

        if ([e_late_obs, l_late_obs, e_pre_late, l_pre_late].some(v => !isFinite(v))) continue;

        const est_forbidden = (l_late_obs - l_pre_late) - (e_late_obs - e_pre_late);
        comparisons.push({
          type: "late-vs-early-forbidden",
          gEarly: gE, gLate: gL,
          estimate: est_forbidden,
          weight: early_sids.length * late_sids.length,
          forbidden: true,
          label: `g${gL} v g${gE} (mid→post, FORBIDDEN)`,
        });
      }
    }

    // Cohort vs never-treated (always clean)
    const g = ADOPTING_COHORTS[i];
    const g_sids = SIDS.filter(s => STATE_COHORT[s] === g);
    if (g_sids.length < 1 || NEVER_SIDS.length < 1) continue;

    const baseYrs = YEARS.filter(yr => yr < g);
    const postYrs = YEARS.filter(yr => yr >= g);
    if (baseYrs.length < 1 || postYrs.length < 1) continue;

    const g_base  = mean(baseYrs.flatMap(yr => g_sids.map(s => obs(s, yr)?.l_homicide).filter(v => v != null)));
    const g_post  = mean(postYrs.flatMap(yr => g_sids.map(s => obs(s, yr)?.l_homicide).filter(v => v != null)));
    const nv_base = mean(baseYrs.flatMap(yr => NEVER_SIDS.map(s => obs(s, yr)?.l_homicide).filter(v => v != null)));
    const nv_post = mean(postYrs.flatMap(yr => NEVER_SIDS.map(s => obs(s, yr)?.l_homicide).filter(v => v != null)));

    if ([g_base, g_post, nv_base, nv_post].some(v => !isFinite(v))) continue;

    const est_clean = (g_post - g_base) - (nv_post - nv_base);
    comparisons.push({
      type: "cohort-vs-never",
      gEarly: g, gLate: 0,
      estimate: est_clean,
      weight: g_sids.length * NEVER_SIDS.length,
      forbidden: false,
      label: `g${g} vs never`,
    });
  }

  return comparisons;
}

// ── Event-study data ─────────────────────────────────────────────────────────
// For each cohort g, compute mean l_homicide relative to event-time k = year − g
// Event time from −5 to +4 (relative to adoption year)
function computeEventStudy() {
  const EVENT_TIMES = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4];
  const result = {};

  for (const g of ADOPTING_COHORTS) {
    const gSids = SIDS.filter(s => STATE_COHORT[s] === g);
    if (gSids.length === 0) continue;
    const baseline = g - 1;  // normalize at k = -1

    const meanAtBase = mean(
      gSids.map(s => obs(s, baseline)?.l_homicide).filter(v => v != null)
    );
    if (!isFinite(meanAtBase)) continue;

    result[g] = {};
    for (const k of EVENT_TIMES) {
      const yr = g + k;
      if (yr < YMIN || yr > YMAX) { result[g][k] = null; continue; }
      const vals = gSids.map(s => obs(s, yr)?.l_homicide).filter(v => v != null);
      if (vals.length === 0) { result[g][k] = null; continue; }
      result[g][k] = mean(vals) - meanAtBase;
    }
  }

  return { cohorts: result, eventTimes: EVENT_TIMES };
}

// ── RUN COMPUTATIONS ─────────────────────────────────────────────────────────
const TWFE_COEF   = computeTWFE();
const { att: CLEAN_ATT } = computeCleanATT();
const BACON_COMPS = computeBaconComparisons();
const { cohorts: EVENT_DATA, eventTimes: EVENT_TIMES } = computeEventStudy();

const N_FORBIDDEN = BACON_COMPS.filter(c => c.forbidden).length;

// ── MODULE ───────────────────────────────────────────────────────────────────
export function mount(root) {
  ensureCSS();

  // ── State ────────────────────────────────────────────────────────────────
  const state = {
    view: "eventstudy",   // "eventstudy" | "bacon"
    showForbidden: true,  // include forbidden comparisons in Bacon view
    challengeDone: false,
  };

  // Springs for cohort line animations (one per cohort, 0→1)
  const cohortSprings = {};
  for (const g of ADOPTING_COHORTS) {
    cohortSprings[g] = new Spring(0, { stiffness: 55, damping: 13 });
    cohortSprings[g].set(1);  // animate in on load
  }
  // Forbidden highlight spring (1 = forbidden shown, 0 = hidden)
  const forbidSpring = new Spring(1, { stiffness: 80, damping: 16 });

  // ── Layout ─────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Staggered DiD & the TWFE Trap",
    idea:  "States adopt stand-your-ground laws in different years. The standard regression secretly uses already-treated states as controls — a forbidden comparison that contaminates the estimate.",
  });

  // Canvas
  const cv = new Canvas(590, 390, { margin: { t: 30, r: 28, b: 50, l: 62 } });
  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.alignItems = "center";
  stage.appendChild(cv.el);

  // Legend row
  const legendEl = buildLegend();
  stage.appendChild(legendEl);

  // Stage label
  const stageLabel = h("p", { class: "stag-label" });
  stage.appendChild(stageLabel);

  // ── Readouts ─────────────────────────────────────────────────────────
  const rTWFE = readout({ label: "Naive TWFE", value: fmtCoef(TWFE_COEF), accent: "var(--neg)" });
  const rATT  = readout({ label: "Clean ATT (CS)", value: fmtCoef(CLEAN_ATT), accent: "var(--gold)" });
  const rBad  = readout({ label: "Forbidden 2×2s", value: String(N_FORBIDDEN), accent: "var(--accent)" });

  const chal = challenge({
    goal: "Toggle off forbidden comparisons to see the clean estimate — and notice the difference vs the naive TWFE.",
  });

  // ── Controls ──────────────────────────────────────────────────────────
  const viewSeg = segmented({
    options: [
      { label: "Event study", value: "eventstudy" },
      { label: "TWFE decomposition", value: "bacon" },
    ],
    value: state.view,
    onSelect: (v) => {
      state.view = v;
      updateLegend();
    },
  });

  const forbidToggle = toggle({
    label: "Include forbidden comparisons",
    value: state.showForbidden,
    hint: "(already-treated units used as controls)",
    onToggle: (v) => {
      state.showForbidden = v;
      forbidSpring.set(v ? 1 : 0);
      updateReadouts();
      checkChallenge();
    },
  });

  panel.append(
    dataBadge(meta),
    panelSection("Estimates", h("div", { class: "stag-readout-row" }, [rTWFE, rATT, rBad])),
    panelSection("View", [viewSeg]),
    panelSection("TWFE comparisons", [
      forbidToggle,
      note("TWFE is a weighted average of all pairwise 2×2 DiD comparisons — including ones that use already-treated units as controls. These 'forbidden' comparisons contaminate the estimate."),
    ]),
    panelSection("Challenge", chal),
    h("p", { class: "stag-cite",
      text: "Goodman-Bacon (2021) · Callaway & Sant'Anna (2021) · de Chaisemartin & D'Haultfœuille (2020) · Sun & Abraham (2021)" }),
  );

  caption.innerHTML =
    "TWFE regression on a staggered panel is a <strong>variance-weighted average</strong> of all 2×2 DiD " +
    "comparisons — including ones where <em>already-treated</em> early adopters serve as controls for " +
    "later adopters. Because their treatment effect is baked into their baseline level, this " +
    "<strong>contaminates the control group</strong> and can bias — or even reverse — the overall estimate. " +
    "The clean Callaway–Sant'Anna ATT restricts each cohort's control pool to " +
    "<em>not-yet-treated</em> and <em>never-treated</em> units, eliminating the forbidden comparisons. " +
    "Naive TWFE: <strong>" + fmtCoef(TWFE_COEF) + "</strong> · Clean ATT: <strong>" + fmtCoef(CLEAN_ATT) + "</strong> · " +
    "Goodman-Bacon (2021); Callaway &amp; Sant'Anna (2021); " +
    "de Chaisemartin &amp; D'Haultf&oelig;uille (2020); Sun &amp; Abraham (2021).";

  root.appendChild(layout);

  // ── Frame loop ────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    for (const g of ADOPTING_COHORTS) cohortSprings[g].step(dt);
    forbidSpring.step(dt);
    draw();
    updateReadouts();
  });

  // ── Draw ──────────────────────────────────────────────────────────────
  function draw() {
    cv.clear();
    if (state.view === "eventstudy") drawEventStudy();
    else drawBacon();
  }

  function drawEventStudy() {
    const ctx = cv.ctx;
    const b = cv.box;

    const sx = new Scale([-5, 4], [b.x0, b.x1]);
    const sy = new Scale([-0.35, 0.35], [b.y1, b.y0]);

    drawAxes(cv, sx, sy, {
      xlabel: "event time (years since adoption)",
      ylabel: "log homicide rate (relative to t=−1)",
      xticks: EVENT_TIMES,
      yticks: [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3],
      grid: true,
    });

    // Zero line
    const zeroY = sy.map(0);
    ctx.save();
    ctx.strokeStyle = "var(--dim)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(b.x0, zeroY); ctx.lineTo(b.x1, zeroY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Adoption year vertical
    const adoptX = sx.map(0);
    ctx.save();
    ctx.strokeStyle = "var(--gold)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(adoptX, b.y0); ctx.lineTo(adoptX, b.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "var(--gold)";
    ctx.font = "10px var(--mono)";
    ctx.textAlign = "center";
    ctx.fillText("adoption", adoptX, b.y0 - 8);
    ctx.restore();

    // Draw each cohort's event-study line
    for (const g of ADOPTING_COHORTS) {
      const color = COHORT_COLORS[g] || "#aaa";
      const prog = cohortSprings[g].value;
      if (prog < 0.01) continue;

      const pts = [];
      for (const k of EVENT_TIMES) {
        const val = EVENT_DATA[g]?.[k];
        if (val == null) continue;
        pts.push({ x: sx.map(k), y: sy.map(val), k, val });
      }
      if (pts.length < 2) continue;

      // Draw animated line up to the animated progress point
      const totalPts = pts.length;
      const maxIdx = Math.floor(prog * totalPts);
      const fracPart = prog * totalPts - maxIdx;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (let i = 0; i <= maxIdx && i < totalPts; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else {
          if (i < maxIdx) {
            ctx.lineTo(pts[i].x, pts[i].y);
          } else if (i === maxIdx && i < totalPts - 1) {
            // interpolate to partial segment
            const nx = pts[i].x + (pts[Math.min(i+1, totalPts-1)].x - pts[i].x) * fracPart;
            const ny = pts[i].y + (pts[Math.min(i+1, totalPts-1)].y - pts[i].y) * fracPart;
            ctx.lineTo(nx, ny);
          } else {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
        }
      }
      ctx.stroke();
      ctx.restore();

      // Dots at each event-time (fade in)
      for (let i = 0; i < pts.length && i <= maxIdx; i++) {
        const alpha = i < maxIdx ? 0.85 * prog : 0.85 * fracPart * prog;
        dot(ctx, pts[i].x, pts[i].y, 4, color, { stroke: "var(--surface)", alpha });
      }
    }

    // Draw overall clean ATT bar on the right (post-adoption average)
    const attX = b.x1 + 8;
    if (isFinite(CLEAN_ATT)) {
      const ay0 = sy.map(0);
      const ay1 = sy.map(CLEAN_ATT);
      ctx.save();
      ctx.strokeStyle = "var(--gold)";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(attX, Math.min(ay0, ay1)); ctx.lineTo(attX, Math.max(ay0, ay1)); ctx.stroke();
      // tick marks
      [-1, 0].forEach(sign => {
        const y = sign === -1 ? ay0 : ay1;
        ctx.beginPath(); ctx.moveTo(attX - 4, y); ctx.lineTo(attX + 4, y); ctx.stroke();
      });
      ctx.restore();
    }
  }

  function drawBacon() {
    const ctx = cv.ctx;
    const b = cv.box;

    const comps = state.showForbidden
      ? BACON_COMPS
      : BACON_COMPS.filter(c => !c.forbidden);

    if (comps.length === 0) {
      ctx.save();
      ctx.fillStyle = "var(--dim)";
      ctx.font = "13px var(--mono)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No comparisons selected.", (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      ctx.restore();
      return;
    }

    // x = estimate, y = weight (count of state pairs), size = weight
    const ests = comps.map(c => c.estimate);
    const wts  = comps.map(c => c.weight);
    const xLo = Math.min(-0.25, ...ests) - 0.05;
    const xHi = Math.max( 0.25, ...ests) + 0.05;
    const yHi = Math.max(...wts) * 1.15;

    const sx = new Scale([xLo, xHi], [b.x0, b.x1]);
    const sy = new Scale([0, yHi],   [b.y1, b.y0]);

    drawAxes(cv, sx, sy, {
      xlabel: "2×2 DiD estimate",
      ylabel: "comparison weight (# state pairs)",
      yticks: [0, Math.round(yHi / 2), Math.round(yHi)].filter((v, i, a) => a.indexOf(v) === i),
      grid: true,
    });

    // TWFE zero line
    const x0 = sx.map(0);
    ctx.save();
    ctx.strokeStyle = "var(--dim)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.moveTo(x0, b.y0); ctx.lineTo(x0, b.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Weighted average vertical line (current TWFE)
    const fAlpha = forbidSpring.value;
    if (comps.length > 0) {
      const totalW = wts.reduce((a, b) => a + b, 0);
      const wtdEst = comps.reduce((a, c, i) => a + c.estimate * wts[i], 0) / totalW;
      const lx = sx.map(wtdEst);
      ctx.save();
      ctx.strokeStyle = "var(--gold)";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(lx, b.y0); ctx.lineTo(lx, b.y1); ctx.stroke();
      ctx.font = "bold 11px var(--mono)";
      ctx.fillStyle = "var(--gold)";
      ctx.textAlign = "center";
      ctx.fillText("wtd avg " + fmtCoef(wtdEst), lx, b.y0 - 8);
      ctx.restore();
    }

    // Draw each comparison as a dot
    comps.forEach((c, i) => {
      const px = sx.map(c.estimate);
      const py = sy.map(c.weight);
      const r  = Math.max(5, Math.min(16, Math.sqrt(c.weight) * 1.5));
      const color = c.forbidden ? "var(--neg)" : (c.type === "cohort-vs-never" ? NEVER_COLOR : "var(--pos)");
      const alpha = c.forbidden ? lerp(0.3, 1.0, fAlpha) : 0.85;
      dot(ctx, px, py, r, color, { stroke: "var(--surface)", alpha });

      // Label forbidden ones
      if (c.forbidden && fAlpha > 0.3) {
        ctx.save();
        ctx.globalAlpha = (fAlpha - 0.3) / 0.7;
        ctx.fillStyle = "var(--neg)";
        ctx.font = "9px var(--mono)";
        ctx.textAlign = "center";
        ctx.fillText(c.label, px, py - r - 4);
        ctx.restore();
      }
    });

    // Legend inside chart
    ctx.save();
    ctx.font = "10px var(--mono)";
    ctx.textBaseline = "middle";
    const lx0 = b.x0 + 8;
    let ly = b.y0 + 12;
    [[NEVER_COLOR, "cohort vs never (clean)"], ["var(--pos)", "early vs late-clean"], ["var(--neg)", "late vs already-treated (FORBIDDEN)"]].forEach(([color, label]) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(lx0 + 5, ly, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "var(--ink)";
      ctx.fillText(label, lx0 + 14, ly);
      ly += 16;
    });
    ctx.restore();
  }

  // ── Legend ─────────────────────────────────────────────────────────────
  function buildLegend() {
    const wrap = h("div", { class: "stag-legend" });
    for (const g of ADOPTING_COHORTS) {
      const color = COHORT_COLORS[g] || "#aaa";
      wrap.appendChild(h("span", {}, [
        h("span", { class: "stag-swatch", style: { background: color } }),
        `g=${g}`,
      ]));
    }
    wrap.appendChild(h("span", {}, [
      h("span", { class: "stag-swatch-dot", style: { background: NEVER_COLOR } }),
      "never-treated",
    ]));
    return wrap;
  }

  function updateLegend() {
    stageLabel.textContent = state.view === "eventstudy"
      ? "Event-study: log-homicide relative to year before adoption (k = −1)"
      : "Goodman-Bacon decomposition: each dot is one 2×2 DiD comparison";
  }
  updateLegend();

  // ── Readouts ────────────────────────────────────────────────────────────
  function updateReadouts() {
    const comps = state.showForbidden ? BACON_COMPS : BACON_COMPS.filter(c => !c.forbidden);
    const totalW = comps.reduce((a, c) => a + c.weight, 0);
    const wtdEst = totalW > 0
      ? comps.reduce((a, c) => a + c.estimate * c.weight, 0) / totalW
      : TWFE_COEF;

    rTWFE.set(fmtCoef(state.showForbidden ? TWFE_COEF : wtdEst),
              state.showForbidden ? "incl. forbidden" : "clean only");
    rTWFE.querySelector(".readout-value").style.color =
      state.showForbidden ? "var(--neg)" : "var(--pos)";
    rATT.set(fmtCoef(CLEAN_ATT), "Callaway–Sant'Anna");
    rBad.set(`${N_FORBIDDEN} / ${BACON_COMPS.length}`, "of all 2×2 comparisons");
  }

  // ── Challenge ───────────────────────────────────────────────────────────
  function checkChallenge() {
    if (state.challengeDone) return;
    if (!state.showForbidden) {
      state.challengeDone = true;
      chal.setState(true,
        `Removed ${N_FORBIDDEN} forbidden comparisons. Clean ATT ≈ ${fmtCoef(CLEAN_ATT)} vs naive TWFE ${fmtCoef(TWFE_COEF)}.`);
    }
  }

  return () => stop();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtCoef(v) {
  if (!isFinite(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(3);
}
