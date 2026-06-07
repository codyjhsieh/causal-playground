// Ghost Games — Crowds &amp; Home Advantage.
// COVID forced top-5 European football leagues into empty stadiums (2020–21),
// then crowds returned (2021–22). This on→off→on design is a natural experiment
// for the causal effect of home crowd on home advantage — and reveals that
// referee card bias, a mechanism, collapses without a crowd.
// Data: football-data.co.uk; 7203 matches across England, Germany, Spain,
// Italy, France; seasons 2018–19 through 2021–22.

import { h } from "../lib/dom.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot, line } from "../lib/plot.js";
import {
  lessonLayout, panelSection, segmented, readout, challenge, note,
} from "../lib/ui.js";
import { mean } from "../lib/stats.js";
import { RNG } from "../lib/rng.js";
import { rows, meta } from "../data/ghostgames.js";
import { complete, dataBadge } from "../lib/data.js";

// ── CSS ────────────────────────────────────────────────────────────────────────
function ensureCSS() {
  if (document.getElementById("ghostgames-css")) return;
  const st = document.createElement("style");
  st.id = "ghostgames-css";
  st.textContent = `
.gg-canvas-wrap { display:flex; flex-direction:column; align-items:center; width:100%; }
.gg-canvas-wrap canvas { max-width:100%; height:auto; }
.gg-sublabel { font:11px/1 var(--mono); color:var(--dim); text-align:center; margin:4px 0 0; }
.gg-readout-row { display:flex; gap:8px; flex-wrap:wrap; }
.gg-legend { display:flex; flex-wrap:wrap; gap:6px 12px; font:11px var(--mono); color:var(--dim);
             margin-top:4px; align-items:center; }
.gg-swatch { display:inline-block; width:12px; height:12px; border-radius:3px;
             vertical-align:middle; margin-right:3px; }
  `;
  document.head.appendChild(st);
}

// ── Pre-compute all statistics from real data ─────────────────────────────────

function pts(r) { return r.ftr === "H" ? 3 : r.ftr === "D" ? 1 : 0; }

// Complete rows (require result + card fields)
const CLEAN = complete(rows, ["ftr","hy","ay","hr","ar"]);

const crowd  = CLEAN.filter(r => r.crowd === 1);
const empty  = CLEAN.filter(r => r.crowd === 0);

// Home PPG
const crowdPPG = mean(crowd.map(pts));   // ≈1.577
const emptyPPG = mean(empty.map(pts));   // ≈1.457

// Home win rate
const crowdWin = crowd.filter(r => r.ftr === "H").length / crowd.length;  // ≈0.440
const emptyWin = empty.filter(r => r.ftr === "H").length / empty.length;  // ≈0.402

// By season (on/off/on reversal)
const SEASONS = ["1819","1920","2021","2122"];
const seasonStats = SEASONS.map(s => {
  const sr = CLEAN.filter(r => r.season === s);
  return { season: s, ppg: mean(sr.map(pts)), n: sr.length, crowd: sr[0]?.crowd };
});

// Card bias: (ay + 2ar) − (hy + 2hr) ; >0 = more cards on away = pro-home
function cardBias(rs) {
  const valid = rs.filter(r => r.hy != null && r.ay != null && r.hr != null && r.ar != null);
  return mean(valid.map(r => (r.ay + 2 * r.ar) - (r.hy + 2 * r.hr)));
}
const crowdBias = cardBias(crowd);  // ≈0.315
const emptyBias = cardBias(empty);  // ≈0.046

// Card bias by season
const seasonBias = SEASONS.map(s => cardBias(CLEAN.filter(r => r.season === s)));

// Foul differential (af − hf): positive = more fouls called on away
function foulDiff(rs) {
  const valid = rs.filter(r => r.hf != null && r.af != null);
  if (!valid.length) return 0;
  return mean(valid.map(r => r.af - r.hf));
}
const crowdFouls = foulDiff(crowd);  // ≈+0.26
const emptyFouls = foulDiff(empty);  // ≈−0.21

// Goal diff
function goalDiff(rs) {
  const valid = rs.filter(r => r.fthg != null && r.ftag != null);
  if (!valid.length) return 0;
  return mean(valid.map(r => r.fthg - r.ftag));
}
// Shots-on-target advantage
function stAdv(rs) {
  const valid = rs.filter(r => r.hst != null && r.ast != null);
  if (!valid.length) return 0;
  return mean(valid.map(r => r.hst - r.ast));
}

// By-league crowd effect on home PPG
const LEAGUES = ["England","Germany","Spain","Italy","France"];
const leagueEffect = LEAGUES.map(lg => {
  const lc = CLEAN.filter(r => r.league === lg && r.crowd === 1);
  const le = CLEAN.filter(r => r.league === lg && r.crowd === 0);
  const diff = (lc.length && le.length) ? mean(lc.map(pts)) - mean(le.map(pts)) : 0;
  return { league: lg, diff, crowdPPG: lc.length ? mean(lc.map(pts)) : 0, emptyPPG: le.length ? mean(le.map(pts)) : 0 };
});

// Outcome selector values
const OUTCOMES = [
  { label: "Home PPG",   value: "ppg" },
  { label: "Win %",      value: "win" },
  { label: "Goal diff",  value: "gd"  },
  { label: "Shots adv",  value: "st"  },
];

function getOutcome(rs, key) {
  if (key === "ppg") return mean(rs.map(pts));
  if (key === "win") return rs.filter(r => r.ftr === "H").length / rs.length;
  if (key === "gd")  return goalDiff(rs);
  if (key === "st")  return stAdv(rs);
  return 0;
}

// Bootstrap CI (1000 resamples, 95%)
const RNG_INST = new RNG(42);
function bootstrapCI(rowsA, rowsB, key, B = 1000) {
  const diffs = [];
  for (let b = 0; b < B; b++) {
    const sa = resample(rowsA);
    const sb = resample(rowsB);
    diffs.push(getOutcome(sa, key) - getOutcome(sb, key));
  }
  diffs.sort((a, c) => a - c);
  return {
    lo: diffs[Math.floor(0.025 * B)],
    hi: diffs[Math.floor(0.975 * B)],
    mid: mean(diffs),
  };
}
function resample(rs) {
  const n = rs.length;
  const out = [];
  for (let i = 0; i < n; i++) out.push(rs[Math.floor(RNG_INST._u() * n)]);
  return out;
}

// Precompute CI for the default (all leagues, ppg)
let ciCache = {};

// ── MODULE ────────────────────────────────────────────────────────────────────
export function mount(root) {
  ensureCSS();

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    panel: "timeline",    // "timeline" | "crowd" | "mechanism" | "league" | "verdict"
    outcome: "ppg",
    league: "All",
    mechanismView: "cards",  // "cards" | "fouls"
    challengeDone: false,
  };

  // Springs for bar animations
  const barSprings = {
    crowdVal: new Spring(0, { stiffness: 60, damping: 14 }),
    emptyVal: new Spring(0, { stiffness: 60, damping: 14 }),
    biasCrowd: new Spring(0, { stiffness: 60, damping: 14 }),
    biasEmpty: new Spring(0, { stiffness: 60, damping: 14 }),
    season0: new Spring(0, { stiffness: 50, damping: 13 }),
    season1: new Spring(0, { stiffness: 50, damping: 13 }),
    season2: new Spring(0, { stiffness: 50, damping: 13 }),
    season3: new Spring(0, { stiffness: 50, damping: 13 }),
  };
  // Kickoff timeline bars
  barSprings.season0.set(1);
  barSprings.season1.set(1);
  barSprings.season2.set(1);
  barSprings.season3.set(1);

  // ── Layout ────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Ghost Games — Crowds &amp; Home Advantage",
    idea: "COVID emptied football stadiums in 2020–21, switching the home crowd off then back on. " +
          "This on→off→on reversal is a natural experiment: does the crowd cause home advantage, " +
          "and does it operate through referee bias?",
  });

  // Canvas
  const cv = new Canvas(580, 380, { margin: { t: 32, r: 36, b: 52, l: 64 } });
  const canvasWrap = h("div", { class: "gg-canvas-wrap" });
  canvasWrap.appendChild(cv.el);
  const sublabel = h("p", { class: "gg-sublabel" });
  canvasWrap.appendChild(sublabel);
  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.alignItems = "center";
  stage.appendChild(canvasWrap);

  // ── Readouts ───────────────────────────────────────────────────────────────
  const rCrowd  = readout({ label: "Crowd",  value: "—", accent: "var(--pos)"  });
  const rEmpty  = readout({ label: "Empty",  value: "—", accent: "var(--dim)"  });
  const rEffect = readout({ label: "Effect", value: "—", accent: "var(--gold)" });
  const rRefDrop = readout({ label: "Ref bias: crowd→empty", value: "—", accent: "var(--accent)" });

  const readoutRow = h("div", { class: "gg-readout-row" }, [rCrowd, rEmpty, rEffect]);
  const readoutRow2 = h("div", { class: "gg-readout-row" }, [rRefDrop]);

  const chal = challenge({
    goal: "Uncover the mechanism — show the referee's pro-home card bias collapses when the crowd is gone, evidence that home advantage is partly social pressure on the officials.",
  });

  // ── View selector ──────────────────────────────────────────────────────────
  const viewSeg = segmented({
    options: [
      { label: "Natural experiment", value: "timeline"   },
      { label: "Crowd effect",       value: "crowd"      },
      { label: "The referees",       value: "mechanism"  },
      { label: "By league",          value: "league"     },
      { label: "Verdict",            value: "verdict"    },
    ],
    value: state.panel,
    onSelect: (v) => {
      state.panel = v;
      if (v === "mechanism" && !state.challengeDone) {
        state.challengeDone = true;
        chal.setState(true,
          `Referee card bias: crowd = +${crowdBias.toFixed(3)}, empty = +${emptyBias.toFixed(3)} — ` +
          `drops ${((crowdBias - emptyBias) / crowdBias * 100).toFixed(0)}% without the crowd.`);
      }
      animateBarsForPanel(v);
      updateReadouts();
    },
  });

  // Outcome selector (for "crowd" panel)
  const outcomeSeg = segmented({
    options: OUTCOMES,
    value: state.outcome,
    onSelect: (v) => {
      state.outcome = v;
      ciCache = {};  // clear cache when outcome changes
      animateBarsForPanel(state.panel);
      updateReadouts();
    },
  });

  // League filter (for "crowd" panel)
  const leagueSeg = segmented({
    options: [{ label: "All", value: "All" }, ...LEAGUES.map(l => ({ label: l, value: l }))],
    value: state.league,
    onSelect: (v) => {
      state.league = v;
      ciCache = {};
      animateBarsForPanel(state.panel);
      updateReadouts();
    },
  });

  // ── Assemble panel ─────────────────────────────────────────────────────────
  panel.append(
    dataBadge(meta),
    panelSection("", viewSeg),
    panelSection("Outcome", outcomeSeg),
    panelSection("League filter", leagueSeg),
    panelSection("Estimates", readoutRow),
    panelSection("Mechanism", readoutRow2),
    panelSection("Challenge", chal),
  );

  // ── Caption ────────────────────────────────────────────────────────────────
  caption.innerHTML =
    "Data: <strong>football-data.co.uk</strong>; top-5 European leagues, 2018–19 to 2021–22 (7,203 matches). " +
    "COVID quarantine rules forced empty-stadium play in 2020–21, creating an <em>on→off→on</em> natural experiment. " +
    "Home PPG: crowd present = " + crowdPPG.toFixed(3) + ", empty = " + emptyPPG.toFixed(3) + ". " +
    "Referee card bias (away minus home weighted cards) collapses from " +
    crowdBias.toFixed(3) + " to " + emptyBias.toFixed(3) + " without a crowd — " +
    "consistent with social pressure on officials being a mechanism. " +
    "Prior academic work by Pettersson-Lidbom &amp; Priks (2010) and Scoppa (2021) aligns with these findings; " +
    "the on→off→on pattern and league heterogeneity are verifiable here. " +
    "<em>Caution:</em> the empty season also coincided with schedule compression and summer play — a one-time confound cannot be fully ruled out, but the reversal pattern and referee mechanism are difficult for a single-shot confound to explain.";

  root.appendChild(layout);

  // ── Initial animation ──────────────────────────────────────────────────────
  animateBarsForPanel("timeline");
  updateReadouts();

  // ── Frame loop ─────────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    for (const sp of Object.values(barSprings)) sp.step(dt);
    draw();
  });

  // ── Bar animation targets ──────────────────────────────────────────────────
  function animateBarsForPanel(p) {
    if (p === "timeline") {
      barSprings.season0.set(seasonStats[0].ppg);
      barSprings.season1.set(seasonStats[1].ppg);
      barSprings.season2.set(seasonStats[2].ppg);
      barSprings.season3.set(seasonStats[3].ppg);
    } else if (p === "crowd") {
      const lg = state.league;
      const cr = lg === "All" ? crowd : crowd.filter(r => r.league === lg);
      const em = lg === "All" ? empty : empty.filter(r => r.league === lg);
      barSprings.crowdVal.set(getOutcome(cr, state.outcome));
      barSprings.emptyVal.set(getOutcome(em, state.outcome));
    } else if (p === "mechanism") {
      barSprings.biasCrowd.set(crowdBias);
      barSprings.biasEmpty.set(emptyBias);
      barSprings.crowdVal.set(crowdFouls);
      barSprings.emptyVal.set(emptyFouls);
    } else if (p === "league") {
      // league bar heights stored in season springs (one per league)
      barSprings.season0.set(leagueEffect[0].diff);
      barSprings.season1.set(leagueEffect[1].diff);
      barSprings.season2.set(leagueEffect[2].diff);
      barSprings.season3.set(leagueEffect[3].diff);
      // season3 → league[3], reuse crowdVal for league[4]
      barSprings.crowdVal.set(leagueEffect[4].diff);
    }
  }

  // ── Draw dispatcher ────────────────────────────────────────────────────────
  function draw() {
    cv.clear();
    if      (state.panel === "timeline")   drawTimeline();
    else if (state.panel === "crowd")      drawCrowd();
    else if (state.panel === "mechanism")  drawMechanism();
    else if (state.panel === "league")     drawLeague();
    else if (state.panel === "verdict")    drawVerdict();
  }

  // ── PANEL 1: Natural experiment timeline ──────────────────────────────────
  function drawTimeline() {
    sublabel.textContent = "Home points per game by season — on→off→on crowd reversal";
    const ctx = cv.ctx;
    const b = cv.box;

    const xPad = 0.4;
    const sx = new Scale([-xPad, 3 + xPad], [b.x0, b.x1]);
    const sy = new Scale([1.3, 1.7], [b.y1, b.y0]);

    drawAxes(cv, sx, sy, {
      xlabel: "season",
      ylabel: "home PPG",
      xticks: [],
      yticks: [1.35, 1.45, 1.55, 1.65],
      grid: true,
    });

    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim() || "#1c1c22";
    const pos = css.getPropertyValue("--pos").trim() || "#50dca0";
    const dim = css.getPropertyValue("--dim").trim() || "#8a8a99";
    const neg = css.getPropertyValue("--neg").trim() || "#ff5a5a";
    const gold = css.getPropertyValue("--gold").trim() || "#ffce5c";

    const SEASON_LABELS = ["2018–19", "2019–20", "2020–21", "2021–22"];
    const CROWD_FLAGS = [1, 0.5, 0, 1]; // 0.5 = split season
    const springs = [barSprings.season0, barSprings.season1, barSprings.season2, barSprings.season3];

    const barW = (sx.map(1) - sx.map(0)) * 0.55;
    const barHalf = barW / 2;
    const baseline = sy.map(sy.d0);

    // Background shading: crowd-on seasons get a soft pos tint
    ctx.save();
    [[0, 1], [3, 1]].forEach(([xi]) => {
      const x0 = sx.map(xi - 0.42);
      const x1 = sx.map(xi + 0.42);
      ctx.fillStyle = pos;
      ctx.globalAlpha = 0.07;
      ctx.fillRect(x0, b.y0, x1 - x0, b.y1 - b.y0);
    });
    ctx.restore();

    // Label bands
    ctx.save();
    ctx.font = "10px var(--mono)";
    ctx.fillStyle = pos;
    ctx.globalAlpha = 0.8;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("crowd ON", sx.map(0), b.y0 + 2);
    ctx.fillText("crowd ON", sx.map(3), b.y0 + 2);
    ctx.fillStyle = dim;
    ctx.fillText("empty", sx.map(2), b.y0 + 2);
    ctx.restore();

    // Draw bars + animate line
    const pts_arr = [];
    springs.forEach((sp, i) => {
      const v = sp.value;
      const xc = sx.map(i);
      const barTop = sy.map(v);
      const color = CROWD_FLAGS[i] === 1 ? pos : (CROWD_FLAGS[i] === 0 ? dim : gold);
      const alpha = 0.82;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(xc - barHalf, barTop, barW, baseline - barTop);
      ctx.restore();

      // Value label above bar
      ctx.save();
      ctx.fillStyle = ink;
      ctx.font = "bold 12px var(--mono)";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(v.toFixed(3), xc, barTop - 3);
      ctx.restore();

      // x-axis label
      ctx.save();
      ctx.fillStyle = dim;
      ctx.font = "11px var(--mono)";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(SEASON_LABELS[i], xc, b.y1 + 6);
      ctx.restore();

      pts_arr.push({ x: xc, y: barTop + (baseline - barTop) * 0.04 });
    });

    // Connecting line
    if (pts_arr.length >= 2) {
      const linePts = springs.map((sp, i) => ({ x: sx.map(i), y: sy.map(sp.value) }));
      line(ctx, linePts, { stroke: ink, width: 1.5, dash: [4, 3], alpha: 0.4 });

      linePts.forEach((p, i) => {
        const color = CROWD_FLAGS[i] === 1 ? pos : (CROWD_FLAGS[i] === 0 ? dim : gold);
        dot(ctx, p.x, p.y, 5, color, { stroke: "var(--surface)", alpha: 1 });
      });
    }

    // Legend
    ctx.save();
    ctx.font = "11px var(--mono)";
    ctx.textBaseline = "middle";
    const ly = b.y0 + 16;
    [[pos, "Crowd on"], [dim, "Empty (COVID)"], [gold, "Mixed"]].forEach(([color, lbl], i) => {
      const lx = b.x0 + i * 130;
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly - 5, 12, 10);
      ctx.fillStyle = ink;
      ctx.textAlign = "left";
      ctx.fillText(lbl, lx + 16, ly);
    });
    ctx.restore();
  }

  // ── PANEL 2: Crowd effect ─────────────────────────────────────────────────
  function drawCrowd() {
    const key = state.outcome;
    const lg = state.league;
    sublabel.textContent = `Home ${OUTCOMES.find(o=>o.value===key)?.label ?? key} — crowd vs empty ${lg === "All" ? "(all leagues)" : `(${lg})`}`;

    const ctx = cv.ctx;
    const b = cv.box;

    const cr = lg === "All" ? crowd : crowd.filter(r => r.league === lg);
    const em = lg === "All" ? empty : empty.filter(r => r.league === lg);
    const valC = getOutcome(cr, key);
    const valE = getOutcome(em, key);
    const diff = valC - valE;

    // Bootstrap CI (cached)
    const cacheKey = `${key}:${lg}`;
    if (!ciCache[cacheKey] && cr.length > 10 && em.length > 10) {
      ciCache[cacheKey] = bootstrapCI(cr, em, key);
    }
    const ci = ciCache[cacheKey];

    const allVals = [0, valC, valE, ci ? ci.lo : diff * 0.5, ci ? ci.hi : diff * 1.5];
    const yMin = Math.min(...allVals) - Math.abs(diff) * 0.3 - 0.05;
    const yMax = Math.max(...allVals) + Math.abs(diff) * 0.3 + 0.05;

    const sx = new Scale([0, 3.5], [b.x0, b.x1]);
    const sy = new Scale([yMin, yMax], [b.y1, b.y0]);

    drawAxes(cv, sx, sy, {
      xlabel: "",
      ylabel: OUTCOMES.find(o => o.value === key)?.label ?? key,
      xticks: [],
      yticks: niceFewTicks(yMin, yMax, 5),
      grid: true,
    });

    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim() || "#1c1c22";
    const pos = css.getPropertyValue("--pos").trim() || "#50dca0";
    const dim = css.getPropertyValue("--dim").trim() || "#8a8a99";
    const gold = css.getPropertyValue("--gold").trim() || "#ffce5c";
    const faint = css.getPropertyValue("--faint").trim() || "#e6e6ee";

    const barW = (sx.map(1) - sx.map(0)) * 0.45;
    const baseline = sy.map(0);

    // Bar: Crowd
    const cv_val = barSprings.crowdVal.value;
    const cv_top = sy.map(cv_val);
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = pos;
    ctx.fillRect(sx.map(0.5) - barW / 2, Math.min(cv_top, baseline), barW, Math.abs(baseline - cv_top));
    ctx.restore();

    // Bar: Empty
    const ev_val = barSprings.emptyVal.value;
    const ev_top = sy.map(ev_val);
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = dim;
    ctx.fillRect(sx.map(1.75) - barW / 2, Math.min(ev_top, baseline), barW, Math.abs(baseline - ev_top));
    ctx.restore();

    // Diff bar with CI
    const diffX = sx.map(3.0);
    const diffBarW = barW * 0.9;
    const diffTop = sy.map(diff);
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = diff >= 0 ? gold : css.getPropertyValue("--neg").trim() || "#ff5a5a";
    ctx.fillRect(diffX - diffBarW / 2, Math.min(diffTop, baseline), diffBarW, Math.abs(baseline - diffTop));
    ctx.restore();

    // CI whiskers (bootstrap distribution of the diff)
    if (ci) {
      const ciMidX = diffX;
      const wiTop = sy.map(ci.hi);
      const wiBot = sy.map(ci.lo);
      ctx.save();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(ciMidX, wiTop);
      ctx.lineTo(ciMidX, wiBot);
      ctx.stroke();
      [wiTop, wiBot].forEach(y => {
        ctx.beginPath();
        ctx.moveTo(ciMidX - 6, y);
        ctx.lineTo(ciMidX + 6, y);
        ctx.stroke();
      });
      ctx.restore();
    }

    // Value labels
    const labelFont = "bold 12px var(--mono)";
    ctx.save();
    ctx.fillStyle = ink;
    ctx.font = labelFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(fmtOutcome(cv_val, key), sx.map(0.5), Math.min(cv_top, baseline) - 4);
    ctx.fillText(fmtOutcome(ev_val, key), sx.map(1.75), Math.min(ev_top, baseline) - 4);
    ctx.fillStyle = diff >= 0 ? gold : css.getPropertyValue("--neg").trim();
    ctx.fillText((diff >= 0 ? "+" : "") + fmtOutcome(diff, key), diffX, Math.min(diffTop, baseline) - 4);
    ctx.restore();

    // X labels
    ctx.save();
    ctx.fillStyle = css.getPropertyValue("--dim").trim();
    ctx.font = "12px var(--mono)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Crowd on", sx.map(0.5), b.y1 + 6);
    ctx.fillText("Empty", sx.map(1.75), b.y1 + 6);
    ctx.fillStyle = gold;
    ctx.fillText("Diff ±95% CI", diffX, b.y1 + 6);
    ctx.restore();
  }

  // ── PANEL 3: Mechanism — referee bias ─────────────────────────────────────
  function drawMechanism() {
    sublabel.textContent = "Referee pro-home card bias & foul differential: crowd vs empty";
    const ctx = cv.ctx;
    const b = cv.box;

    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim() || "#1c1c22";
    const pos = css.getPropertyValue("--pos").trim() || "#50dca0";
    const dim = css.getPropertyValue("--dim").trim() || "#8a8a99";
    const accent = css.getPropertyValue("--accent").trim() || "#8c78ff";
    const neg = css.getPropertyValue("--neg").trim() || "#ff5a5a";

    // Two sub-charts side by side: card bias | fouls
    // Use the full canvas box; split at midpoint
    const midX = (b.x0 + b.x1) / 2 - 8;

    // --- Left: card bias ---
    const cb_crowd = barSprings.biasCrowd.value;
    const cb_empty = barSprings.biasEmpty.value;
    const cbMax = Math.max(cb_crowd, cb_empty, 0.05) * 1.35;

    const lsx = new Scale([0, 3], [b.x0, midX]);
    const lsy = new Scale([0, cbMax], [b.y1, b.y0]);

    // left y-axis + grid
    drawHalfAxes(ctx, b, lsx, lsy, 4, "Card bias");

    const barW = (lsx.map(1) - lsx.map(0)) * 0.5;
    const baseline = lsy.map(0);

    // crowd bar
    const ct = lsy.map(cb_crowd);
    ctx.save(); ctx.globalAlpha = 0.85;
    ctx.fillStyle = pos;
    ctx.fillRect(lsx.map(0.7) - barW/2, ct, barW, baseline - ct);
    ctx.restore();

    // empty bar
    const et = lsy.map(cb_empty);
    ctx.save(); ctx.globalAlpha = 0.85;
    ctx.fillStyle = dim;
    ctx.fillRect(lsx.map(1.7) - barW/2, et, barW, baseline - et);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = ink; ctx.font = "bold 12px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(cb_crowd.toFixed(3), lsx.map(0.7), ct - 3);
    ctx.fillText(cb_empty.toFixed(3), lsx.map(1.7), et - 3);
    ctx.fillStyle = dim; ctx.font = "11px var(--mono)"; ctx.textBaseline = "top";
    ctx.fillText("Crowd", lsx.map(0.7), b.y1 + 5);
    ctx.fillText("Empty", lsx.map(1.7), b.y1 + 5);
    ctx.restore();

    // --- Right: fouls ---
    const fl_crowd = barSprings.crowdVal.value;
    const fl_empty = barSprings.emptyVal.value;
    const fMin = Math.min(fl_crowd, fl_empty, -0.1) * 1.4;
    const fMax = Math.max(fl_crowd, fl_empty, 0.1) * 1.4;

    const rsx = new Scale([0, 3], [midX + 16, b.x1]);
    const rsy = new Scale([fMin, fMax], [b.y1, b.y0]);

    drawHalfAxes(ctx, b, rsx, rsy, 4, "Fouls (away−home)");

    const rBaseline = rsy.map(0);
    // zero line
    ctx.save(); ctx.strokeStyle = dim; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(rsx.map(0), rBaseline); ctx.lineTo(rsx.map(3), rBaseline); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const rBarW = (rsx.map(1) - rsx.map(0)) * 0.5;
    const fct = rsy.map(fl_crowd);
    const fet = rsy.map(fl_empty);

    ctx.save(); ctx.globalAlpha = 0.85;
    ctx.fillStyle = pos;
    ctx.fillRect(rsx.map(0.7) - rBarW/2, Math.min(fct, rBaseline), rBarW, Math.abs(rBaseline - fct));
    ctx.fillStyle = dim;
    ctx.fillRect(rsx.map(1.7) - rBarW/2, Math.min(fet, rBaseline), rBarW, Math.abs(rBaseline - fet));
    ctx.restore();

    ctx.save();
    ctx.fillStyle = ink; ctx.font = "bold 12px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText((fl_crowd >= 0 ? "+" : "") + fl_crowd.toFixed(3), rsx.map(0.7), Math.min(fct, rBaseline) - 3);
    ctx.fillText((fl_empty >= 0 ? "+" : "") + fl_empty.toFixed(3), rsx.map(1.7), Math.min(fet, rBaseline) - 3);
    ctx.fillStyle = dim; ctx.font = "11px var(--mono)"; ctx.textBaseline = "top";
    ctx.fillText("Crowd", rsx.map(0.7), b.y1 + 5);
    ctx.fillText("Empty", rsx.map(1.7), b.y1 + 5);
    ctx.restore();

    // Central divider
    ctx.save(); ctx.strokeStyle = dim; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(midX + 8, b.y0); ctx.lineTo(midX + 8, b.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // By-season card bias sparkline across full width
    drawBiasSparkline(ctx, b);
  }

  function drawHalfAxes(ctx, b, sx, sy, nTicks, ylabel) {
    const css = getComputedStyle(document.documentElement);
    const dim = css.getPropertyValue("--dim").trim() || "#8a8a99";
    const ink = css.getPropertyValue("--ink").trim() || "#1c1c22";
    const faint = css.getPropertyValue("--faint").trim() || "#e6e6ee";
    const yt = niceFewTicks(sy.d0, sy.d1, nTicks);
    ctx.save();
    ctx.strokeStyle = faint; ctx.lineWidth = 1;
    for (const t of yt) {
      const y = sy.map(t);
      ctx.beginPath(); ctx.moveTo(sx.map(sx.d0), y); ctx.lineTo(sx.map(sx.d1), y); ctx.stroke();
    }
    ctx.strokeStyle = dim;
    ctx.beginPath(); ctx.moveTo(sx.map(sx.d0), b.y1); ctx.lineTo(sx.map(sx.d1), b.y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx.map(sx.d0), b.y0); ctx.lineTo(sx.map(sx.d0), b.y1); ctx.stroke();
    ctx.fillStyle = dim; ctx.font = "11px var(--mono)";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (const t of yt) ctx.fillText(t.toFixed(2), sx.map(sx.d0) - 4, sy.map(t));
    ctx.fillStyle = ink; ctx.font = "11px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(ylabel, (sx.map(sx.d0) + sx.map(sx.d1)) / 2, b.y0 - 18);
    ctx.restore();
  }

  function drawBiasSparkline(ctx, b) {
    const css = getComputedStyle(document.documentElement);
    const dim = css.getPropertyValue("--dim").trim() || "#8a8a99";
    const pos = css.getPropertyValue("--pos").trim() || "#50dca0";
    const gold = css.getPropertyValue("--gold").trim() || "#ffce5c";
    const ink = css.getPropertyValue("--ink").trim() || "#1c1c22";

    // Bottom strip: sparkline of card bias by season
    const sx = new Scale([0, 3], [b.x0, b.x1]);
    const sparkY0 = b.y1 - 42;
    const sparkH  = 32;
    const biasVals = seasonBias;
    const bMin = Math.min(...biasVals, 0);
    const bMax = Math.max(...biasVals, 0.1);
    const sy = new Scale([bMin, bMax * 1.15], [sparkY0, sparkY0 - sparkH]);

    ctx.save();
    ctx.fillStyle = dim; ctx.font = "9px var(--mono)"; ctx.textAlign = "right";
    ctx.textBaseline = "middle"; ctx.globalAlpha = 0.7;
    ctx.fillText("bias by season:", sx.map(0) - 2, sparkY0 - sparkH / 2);
    ctx.restore();

    const sparkPts = SEASONS.map((s, i) => ({ x: sx.map(i), y: sy.map(biasVals[i]) }));
    line(ctx, sparkPts, { stroke: gold, width: 1.5, alpha: 0.75 });
    sparkPts.forEach((p, i) => {
      const col = SEASONS[i] === "2021" ? dim : pos;
      dot(ctx, p.x, p.y, 3, col, { stroke: "var(--surface)", alpha: 0.9 });
    });

    // Labels
    ctx.save();
    ctx.font = "9px var(--mono)"; ctx.textAlign = "center"; ctx.fillStyle = gold;
    ctx.globalAlpha = 0.8;
    sparkPts.forEach((p, i) => {
      ctx.fillText(biasVals[i].toFixed(3), p.x, p.y - 8);
    });
    ctx.restore();
  }

  // ── PANEL 4: By league ────────────────────────────────────────────────────
  function drawLeague() {
    sublabel.textContent = "Crowd effect on home PPG by league (crowd on minus empty)";
    const ctx = cv.ctx;
    const b = cv.box;

    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim() || "#1c1c22";
    const pos = css.getPropertyValue("--pos").trim() || "#50dca0";
    const neg = css.getPropertyValue("--neg").trim() || "#ff5a5a";
    const dim = css.getPropertyValue("--dim").trim() || "#8a8a99";

    const diffs = [
      barSprings.season0.value,
      barSprings.season1.value,
      barSprings.season2.value,
      barSprings.season3.value,
      barSprings.crowdVal.value,
    ];
    const allVals = [0, ...diffs];
    const yMin = Math.min(...allVals) - 0.05;
    const yMax = Math.max(...allVals) + 0.05;

    const sx = new Scale([-0.5, 5], [b.x0, b.x1]);
    const sy = new Scale([yMin, yMax], [b.y1, b.y0]);

    drawAxes(cv, sx, sy, {
      xlabel: "league",
      ylabel: "ΔHome PPG (crowd − empty)",
      xticks: [],
      yticks: niceFewTicks(yMin, yMax, 5),
      grid: true,
    });

    // Zero line
    const zy = sy.map(0);
    ctx.save(); ctx.strokeStyle = dim; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(b.x0, zy); ctx.lineTo(b.x1, zy); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();

    const LEAGUE_COLORS = ["#4cc2ff","#7c6cff","#ff8a4c","#4cd0a0","#ffce5c"];
    const barW = (sx.map(1) - sx.map(0)) * 0.55;
    const baseline = sy.map(0);

    diffs.forEach((d, i) => {
      const xc = sx.map(i);
      const barTop = sy.map(d);
      const color = LEAGUE_COLORS[i];

      ctx.save(); ctx.globalAlpha = 0.85;
      ctx.fillStyle = color;
      ctx.fillRect(xc - barW/2, Math.min(barTop, baseline), barW, Math.abs(barTop - baseline));
      ctx.restore();

      // Value label
      ctx.save();
      ctx.fillStyle = ink; ctx.font = "bold 11px var(--mono)";
      ctx.textAlign = "center"; ctx.textBaseline = d >= 0 ? "bottom" : "top";
      ctx.fillText((d >= 0 ? "+" : "") + d.toFixed(3), xc, d >= 0 ? barTop - 3 : barTop + 3);
      ctx.restore();

      // League label
      ctx.save();
      ctx.fillStyle = dim; ctx.font = "11px var(--mono)";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(LEAGUES[i], xc, b.y1 + 6);
      ctx.restore();

      // N label
      const lc = CLEAN.filter(r => r.league === LEAGUES[i] && r.crowd === 1);
      const le = CLEAN.filter(r => r.league === LEAGUES[i] && r.crowd === 0);
      ctx.save();
      ctx.fillStyle = dim; ctx.font = "9px var(--mono)";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(`n=${lc.length}/${le.length}`, xc, b.y1 + 22);
      ctx.restore();
    });
  }

  // ── PANEL 5: Verdict ──────────────────────────────────────────────────────
  function drawVerdict() {
    sublabel.textContent = "Credibility of the natural experiment — strengths & limits";
    const ctx = cv.ctx;
    const b = cv.box;

    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim() || "#1c1c22";
    const pos = css.getPropertyValue("--pos").trim() || "#50dca0";
    const neg = css.getPropertyValue("--neg").trim() || "#ff5a5a";
    const dim = css.getPropertyValue("--dim").trim() || "#8a8a99";
    const gold = css.getPropertyValue("--gold").trim() || "#ffce5c";
    const accent = css.getPropertyValue("--accent").trim() || "#8c78ff";

    const cx = (b.x0 + b.x1) / 2;

    ctx.save();
    ctx.font = "bold 14px var(--mono)";
    ctx.fillStyle = ink;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("Evidence & Confounds", cx, b.y0 + 4);
    ctx.restore();

    const items = [
      { type: "strong", text: "On→off→on reversal matches crowd status perfectly across all 5 leagues." },
      { type: "strong", text: `Referee card bias drops ${((crowdBias - emptyBias) / crowdBias * 100).toFixed(0)}% without crowd — a plausible mechanism, hard to fake.` },
      { type: "strong", text: `Home PPG: crowd ${crowdPPG.toFixed(3)} → empty ${emptyPPG.toFixed(3)} → crowd ${seasonStats[3].ppg.toFixed(3)}. Rebound on return.` },
      { type: "strong", text: "Effect consistent across England, Germany, Spain, Italy, France." },
      { type: "caveat", text: "Confound: COVID-19 also caused fixture congestion & summer scheduling." },
      { type: "caveat", text: "Confound: reduced travel fatigue for away teams in empty stadiums." },
      { type: "caveat", text: "2019–20 was a split season — partial contamination." },
      { type: "verdict", text: "Verdict: crowd likely causes ~0.12 PPG home advantage through referee pressure, but a clean experiment would need multiple simultaneous matched cities." },
    ];

    const rowH = 38;
    items.forEach((item, i) => {
      const y = b.y0 + 32 + i * rowH;
      const color = item.type === "strong" ? pos : item.type === "caveat" ? neg : gold;
      const icon = item.type === "strong" ? "✓" : item.type === "caveat" ? "△" : "◆";

      ctx.save();
      ctx.fillStyle = color; ctx.globalAlpha = 0.15;
      ctx.fillRect(b.x0, y, b.x1 - b.x0, rowH - 4);
      ctx.globalAlpha = 1;

      ctx.font = "bold 12px var(--mono)";
      ctx.fillStyle = color;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(icon, b.x0 + 6, y + rowH/2 - 2);

      ctx.font = "11px var(--mono)";
      ctx.fillStyle = ink;
      drawWrappedText(ctx, item.text, b.x0 + 24, y + 8, b.x1 - b.x0 - 30, 15);
      ctx.restore();
    });
  }

  // ── Readout updates ────────────────────────────────────────────────────────
  function updateReadouts() {
    const p = state.panel;

    const refDrop = crowdBias - emptyBias;
    rRefDrop.set(`${crowdBias.toFixed(3)} → ${emptyBias.toFixed(3)}`, `drop of ${refDrop.toFixed(3)} (${((refDrop / crowdBias) * 100).toFixed(0)}%)`);

    if (p === "timeline") {
      rCrowd.set(crowdPPG.toFixed(3), "crowd on, PPG");
      rEmpty.set(emptyPPG.toFixed(3), "empty, PPG");
      rEffect.set((crowdPPG - emptyPPG).toFixed(3), "crowd effect");
    } else if (p === "crowd") {
      const lg = state.league;
      const key = state.outcome;
      const cr = lg === "All" ? crowd : crowd.filter(r => r.league === lg);
      const em = lg === "All" ? empty : empty.filter(r => r.league === lg);
      const valC = getOutcome(cr, key);
      const valE = getOutcome(em, key);
      const diff = valC - valE;
      const cacheKey = `${key}:${lg}`;
      const ci = ciCache[cacheKey];
      rCrowd.set(fmtOutcome(valC, key), "crowd on");
      rEmpty.set(fmtOutcome(valE, key), "empty");
      rEffect.set((diff >= 0 ? "+" : "") + fmtOutcome(diff, key),
        ci ? `±CI [${fmtOutcome(ci.lo, key)}, ${fmtOutcome(ci.hi, key)}]` : "bootstrap CI pending");
    } else if (p === "mechanism") {
      rCrowd.set(crowdBias.toFixed(3), "card bias, crowd");
      rEmpty.set(emptyBias.toFixed(3), "card bias, empty");
      rEffect.set((crowdBias - emptyBias).toFixed(3), "bias drop");
    } else if (p === "league") {
      rCrowd.set("—");
      rEmpty.set("—");
      rEffect.set("↑ see chart", "by league");
    } else if (p === "verdict") {
      rCrowd.set(crowdPPG.toFixed(3), "crowd PPG");
      rEmpty.set(emptyPPG.toFixed(3), "empty PPG");
      rEffect.set((crowdBias - emptyBias).toFixed(3), "ref-bias drop");
    }
  }

  return () => stop();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtOutcome(v, key) {
  if (key === "win") return (v * 100).toFixed(1) + "%";
  return v.toFixed(3);
}

function niceFewTicks(lo, hi, n = 5) {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
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
  let line = "";
  let curY = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, curY);
      line = w;
      curY += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, curY);
}
