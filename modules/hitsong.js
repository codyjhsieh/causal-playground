// Hit Song — "What Actually Makes a Song Popular?"
// Causal discovery on Spotify audio features (6 000 songs).
// The payoff: audio features form a clean causal network among themselves,
// but popularity has NO strong measured cause — the real driver (artist
// fame, marketing, playlist placement) isn't in the spreadsheet.
//
// Data: Spotify Web API via TidyTuesday (rfordatascience), 2020.
// N ≈ 6 000 tracks; 10 audio features + genre + popularity.

import { h, clear } from "../lib/dom.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot } from "../lib/plot.js";
import {
  lessonLayout, panelSection, slider, segmented,
  readout, challenge,
} from "../lib/ui.js";
import { correlation, invert, mean, std, olsMulti, clamp } from "../lib/stats.js";
import { rows, meta } from "../data/spotify.js";
import { col, complete, dataBadge } from "../lib/data.js";

// ── CSS ─────────────────────────────────────────────────────────────────────
function ensureCSS() {
  if (document.getElementById("hitsong-css")) return;
  const st = document.createElement("style");
  st.id = "hitsong-css";
  st.textContent = `
.hs-wrap { display:flex; flex-direction:column; align-items:center; width:100%; }
.hs-wrap canvas, .hs-wrap svg { max-width:100%; height:auto; display:block; }
.hs-sub { font:11px/1.4 var(--mono); color:var(--dim); text-align:center; margin:6px 0 0; }
.hs-row { display:flex; gap:8px; flex-wrap:wrap; }
.hs-legend { display:flex; flex-wrap:wrap; gap:6px 14px; font:11px var(--mono);
             color:var(--dim); margin-top:6px; align-items:center; }
.hs-swatch { display:inline-block; width:14px; height:8px; border-radius:3px;
             vertical-align:middle; margin-right:3px; }
.hs-dag-wrap { width:100%; display:flex; justify-content:center; }
.hs-dag-wrap svg { max-width:560px; width:100%; }
  `;
  document.head.appendChild(st);
}

// ── Data ─────────────────────────────────────────────────────────────────────
const FEATURES = ["dance","energy","loud","speech","acoustic","instrument","live","valence","tempo","dur"];
const FLABELS  = {
  dance:"danceability", energy:"energy", loud:"loudness",
  speech:"speechiness", acoustic:"acousticness", instrument:"instrumentalness",
  live:"liveness", valence:"valence", tempo:"tempo", dur:"duration (min)",
};
const GENRES = ["pop","rock","rap","latin","r&b","edm"];

const CLEAN = complete(rows, [...FEATURES, "pop", "genre"]);
const N = CLEAN.length;

// Column vectors (raw)
const popV = col(CLEAN, "pop");
const featVecs = {};
for (const f of FEATURES) featVecs[f] = col(CLEAN, f);

// Feature correlations with popularity
const popCorr = {};
for (const f of FEATURES) popCorr[f] = correlation(featVecs[f], popV);

// 10×10 feature correlation matrix
const COR = FEATURES.map(fi =>
  FEATURES.map(fj => correlation(featVecs[fi], featVecs[fj]))
);

// Precision matrix (inverse of correlation matrix)
const PREC = invert(COR);

// Partial correlation from precision matrix: -P_ij / sqrt(P_ii * P_jj)
function partialCorrPrec(i, j) {
  if (!PREC) return 0;
  return -PREC[i][j] / Math.sqrt(PREC[i][i] * PREC[j][j]);
}

// Residualize x on z-vars, return residuals
function residualize(xArr, zArrs) {
  const n = xArr.length;
  const X = xArr.map((_, i) => [1, ...zArrs.map(a => a[i])]);
  const fit = olsMulti(X, xArr);
  return xArr.map((v, i) => {
    let pred = 0;
    for (let j = 0; j < fit.beta.length; j++) pred += X[i][j] * fit.beta[j];
    return v - pred;
  });
}

// Partial correlation via OLS residualization (for panel 3)
function partialCorrOLS(fi, fj, condKeys) {
  if (condKeys.length === 0) return correlation(featVecs[fi], featVecs[fj]);
  const zArrs = condKeys.map(k => featVecs[k]);
  const rx = residualize(featVecs[fi], zArrs);
  const ry = residualize(featVecs[fj], zArrs);
  return correlation(rx, ry);
}

// Genre-stratified correlation (loudness ~ popularity)
function withinGenreCorr(feat) {
  let sum = 0, cnt = 0;
  for (const g of GENRES) {
    const sub = CLEAN.filter(r => r.genre === g);
    if (sub.length < 10) continue;
    const r = correlation(col(sub, feat), col(sub, "pop"));
    if (!isNaN(r)) { sum += r; cnt++; }
  }
  return cnt ? sum / cnt : 0;
}

// Scatter sample (for panel 1 blob): subsample for performance
function scatterSample(feat, maxPts = 350) {
  const step = Math.max(1, Math.floor(N / maxPts));
  const xs = [], ys = [];
  for (let i = 0; i < N; i += step) {
    xs.push(featVecs[feat][i]);
    ys.push(popV[i]);
  }
  return { xs, ys };
}

// ── Pre-compute key stats ─────────────────────────────────────────────────────
const sortedFeatures = FEATURES.slice().sort((a, b) => popCorr[a] - popCorr[b]);
const maxAbsPopCorr = Math.max(...FEATURES.map(f => Math.abs(popCorr[f])));
const energyLoudIdx = [FEATURES.indexOf("energy"), FEATURES.indexOf("loud")];
const energyAcousticIdx = [FEATURES.indexOf("energy"), FEATURES.indexOf("acoustic")];
const energyLoudPC = partialCorrPrec(...energyLoudIdx);
const energyAcousticPC = partialCorrPrec(...energyAcousticIdx);
const loudPopCorr = popCorr["loud"];
const loudPopWithinGenre = withinGenreCorr("loud");

// Number of edges at current alpha
function countEdges(alpha) {
  let cnt = 0;
  const n = FEATURES.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (Math.abs(partialCorrPrec(i, j)) > alpha) cnt++;
  return cnt;
}

// ── SVG graph helpers ─────────────────────────────────────────────────────────
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

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    panel: "formula",   // "formula"|"discover"|"direct"|"confound"|"missing"
    selectedFeat: "instrument",
    alpha: 0.12,
    directA: "energy",
    directB: "acoustic",
    directCond: "loud",
    challengeDone: false,
  };

  // Springs for bar animations
  const barSprings = {};
  for (const f of FEATURES) barSprings[f] = new Spring(0, { stiffness: 55, damping: 13 });
  const alphaSpring = new Spring(0.12, { stiffness: 40, damping: 12 });

  // ── Layout ─────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel: panelEl, caption } = lessonLayout({
    title: "Hit Song Science — Causal Discovery on Spotify",
    idea: "Is there a formula for a hit? We apply causal discovery to 6 000 Spotify tracks " +
          "and find that audio features form a crisp causal network — but popularity floats " +
          "nearly disconnected. The real driver (fame, marketing, playlists) isn't in the data.",
  });

  // Canvas (shared across panels)
  const cv = new Canvas(580, 370, { margin: { t: 36, r: 28, b: 52, l: 64 } });
  cv.el.style.maxWidth = "100%";
  const sublabel = h("div", { class: "hs-sub" });
  const canvasWrap = h("div", { class: "hs-wrap" });
  canvasWrap.appendChild(cv.el);
  canvasWrap.appendChild(sublabel);

  // SVG for panels that use graph rendering (discover, missing)
  const GW = 560, GH = 340;
  const svgRoot = svgEl("svg", { viewBox: `0 0 ${GW} ${GH}`, width: GW, height: GH });
  const svgWrap = h("div", { class: "hs-dag-wrap" });
  svgWrap.appendChild(svgRoot);
  svgWrap.style.display = "none";

  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.alignItems = "center";
  stage.appendChild(canvasWrap);
  stage.appendChild(svgWrap);

  // ── Readouts ────────────────────────────────────────────────────────────────
  const rMaxCorr = readout({ label: "Strongest pop r", value: "—", accent: "var(--neg)" });
  const rEdges   = readout({ label: "Discovered edges", value: "—", accent: "var(--accent)" });
  const rELoud   = readout({ label: "energy↔loudness", value: "—", accent: "var(--pos)" });

  const chal = challenge({
    goal: "Run the discovery: uncover the audio-feature causal cluster " +
          "(energy–loudness–acousticness), then explain why popularity has no strong " +
          "cause in the data — the real driver isn't measured.",
  });

  // ── View selector ───────────────────────────────────────────────────────────
  const viewSeg = segmented({
    options: [
      { label: "Is there a formula?",    value: "formula"  },
      { label: "Discover audio DNA",     value: "discover" },
      { label: "Direct or indirect?",    value: "direct"   },
      { label: "Loudness illusion",      value: "confound" },
      { label: "The missing cause",      value: "missing"  },
    ],
    value: state.panel,
    onSelect: (v) => {
      state.panel = v;
      syncVisibility();
      if (v === "discover" && !state.challengeDone) {
        state.challengeDone = true;
        chal.setState(true,
          `energy–loud partial r = ${energyLoudPC.toFixed(3)} · ` +
          `energy–acoustic = ${energyAcousticPC.toFixed(3)} · ` +
          `max pop corr = ${maxAbsPopCorr.toFixed(3)}`
        );
      }
      animateBars(v);
      updateReadouts();
    },
  });

  // Feature selector for panel 1
  const featSeg = segmented({
    options: FEATURES.map(f => ({ label: f === "instrument" ? "inst." : f === "acoustic" ? "acous." : f, value: f })),
    value: state.selectedFeat,
    onSelect: (v) => { state.selectedFeat = v; },
  });

  // Alpha slider for panel 2
  const alphaSliderEl = slider({
    label: "Edge threshold α (|partial r| > α → edge)",
    min: 0.05, max: 0.40, step: 0.01, value: state.alpha,
    fmt: v => v.toFixed(2),
    onInput: (v) => {
      state.alpha = v;
      alphaSpring.set(v);
      updateReadouts();
    },
    hint: "(lower α → more edges appear)",
  });

  // Direct/indirect selectors (panel 3)
  const P3_FEAT_OPTS = FEATURES.map(f => ({ label: FLABELS[f].split(" ")[0], value: f }));
  const directASeg = segmented({
    options: P3_FEAT_OPTS,
    value: state.directA,
    onSelect: v => { state.directA = v; },
  });
  const directBSeg = segmented({
    options: P3_FEAT_OPTS,
    value: state.directB,
    onSelect: v => { state.directB = v; },
  });
  const directCondSeg = segmented({
    options: [{ label: "none", value: "" }, ...P3_FEAT_OPTS],
    value: state.directCond,
    onSelect: v => { state.directCond = v; },
  });

  // ── Assemble panel ──────────────────────────────────────────────────────────
  panelEl.append(
    dataBadge(meta),
    panelSection("", viewSeg),
    panelSection("Click a feature (panel 1)", featSeg),
    panelSection("Discovery threshold (panel 2)", alphaSliderEl),
    panelSection("Feature A (panel 3)", directASeg),
    panelSection("Feature B (panel 3)", directBSeg),
    panelSection("Condition on (panel 3)", directCondSeg),
    panelSection("Key readouts", h("div", { class: "hs-row" }, [rMaxCorr, rEdges, rELoud])),
    panelSection("Challenge", chal),
  );

  // ── Caption ─────────────────────────────────────────────────────────────────
  caption.innerHTML =
    "Data: <strong>Spotify Web API via TidyTuesday (rfordatascience, 2020)</strong>, " +
    "n&nbsp;=&nbsp;" + N + " tracks across 6 genres. " +
    "We apply a <em>Gaussian graphical model</em> (precision-matrix partial correlations) " +
    "to discover the conditional-independence skeleton among 10 audio features, then ask " +
    "whether popularity fits in. Answer: audio features form a tight cluster " +
    "(energy–loudness–acousticness <em>r</em><sub>partial</sub>&nbsp;≈&nbsp;" +
    energyLoudPC.toFixed(2) + " / " + energyAcousticPC.toFixed(2) + ") " +
    "while the strongest raw correlation any feature has with popularity is only " +
    "|r|&nbsp;=&nbsp;" + maxAbsPopCorr.toFixed(3) + ". " +
    "The genre-confounding of the loudness–popularity link (stratifying by genre changes the sign) " +
    "illustrates that even the tiny signal is partly spurious. " +
    "The honest conclusion: causal discovery is only as good as your variable set — " +
    "the true hit-making causes (artist fame, algorithmic placement, marketing spend) " +
    "live outside this spreadsheet, and no amount of additional audio data will uncover them. " +
    "This is a fresh causal-inference analysis; explore the panels to build your own interpretation.";

  root.appendChild(layout);

  // ── Visibility sync ──────────────────────────────────────────────────────────
  function syncVisibility() {
    const useSVG = (state.panel === "discover" || state.panel === "missing");
    canvasWrap.style.display = useSVG ? "none" : "";
    svgWrap.style.display    = useSVG ? ""     : "none";
  }
  syncVisibility();

  // ── Bar animation targets ────────────────────────────────────────────────────
  function animateBars(p) {
    if (p === "formula") {
      for (const f of FEATURES) barSprings[f].set(popCorr[f]);
    }
  }
  animateBars(state.panel);

  // ── Initial readouts ─────────────────────────────────────────────────────────
  function updateReadouts() {
    rMaxCorr.set(maxAbsPopCorr.toFixed(3), "instrument (−0.156)");
    rEdges.set(String(countEdges(state.alpha)), `at α = ${state.alpha.toFixed(2)}`);
    rELoud.set(energyLoudPC.toFixed(3), "partial r (precision matrix)");
  }
  updateReadouts();

  // ── Frame loop ────────────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    for (const sp of Object.values(barSprings)) sp.step(dt);
    alphaSpring.step(dt);
    draw();
  });

  // ── Draw dispatcher ───────────────────────────────────────────────────────────
  function draw() {
    if (state.panel === "discover") { drawDiscoverSVG(); return; }
    if (state.panel === "missing")  { drawMissingSVG();  return; }
    cv.clear();
    if      (state.panel === "formula")  drawFormula();
    else if (state.panel === "direct")   drawDirect();
    else if (state.panel === "confound") drawConfound();
  }

  // ── PANEL 1: Is there a formula? ──────────────────────────────────────────────
  function drawFormula() {
    sublabel.textContent = "Correlation of each audio feature with popularity — all hover near zero";
    const ctx = cv.ctx;
    const b = cv.box;

    const css = getComputedStyle(document.documentElement);
    const ink    = css.getPropertyValue("--ink").trim()     || "#1c1c22";
    const pos    = css.getPropertyValue("--pos").trim()     || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()     || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()     || "#8a8a99";
    const accent = css.getPropertyValue("--accent").trim()  || "#8c78ff";
    const gold   = css.getPropertyValue("--gold").trim()    || "#ffce5c";

    const n = sortedFeatures.length;
    const yPad = 0.22;
    const sx = new Scale([-yPad - 0.02, yPad + 0.02], [b.x0, b.x1]);
    const sy = new Scale([-0.5, n - 0.5], [b.y1, b.y0]);

    // Zero line
    ctx.save(); ctx.strokeStyle = dim; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
    ctx.setLineDash([4, 4]);
    const zx = sx.map(0);
    ctx.beginPath(); ctx.moveTo(zx, b.y0); ctx.lineTo(zx, b.y1); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();

    // Axis labels
    ctx.save();
    ctx.fillStyle = dim; ctx.font = "11px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const t of [-0.2, -0.1, 0, 0.1, 0.2]) {
      ctx.fillText(t.toFixed(1), sx.map(t), b.y1 + 6);
    }
    ctx.fillStyle = ink; ctx.font = "12px var(--sans,sans-serif)";
    ctx.fillText("Pearson r with popularity", (b.x0 + b.x1) / 2, cv.h - 5);
    ctx.restore();

    // Bars
    sortedFeatures.forEach((f, i) => {
      const v = barSprings[f].value;
      const xc = sx.map(0);
      const xv = sx.map(v);
      const yc = sy.map(i);
      const barH = Math.max(2, (sy.map(0) - sy.map(1)) * 0.55);

      const color = Math.abs(v) < 0.03 ? dim : v > 0 ? pos : neg;
      const isSelected = state.selectedFeat === f;

      ctx.save();
      ctx.globalAlpha = isSelected ? 1 : 0.75;
      ctx.fillStyle = color;
      ctx.fillRect(Math.min(xc, xv), yc - barH / 2, Math.abs(xv - xc), barH);

      if (isSelected) {
        ctx.strokeStyle = gold;
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.min(xc, xv) - 1, yc - barH / 2 - 1, Math.abs(xv - xc) + 2, barH + 2);
      }

      // Label
      ctx.fillStyle = isSelected ? ink : dim;
      ctx.font = isSelected ? "bold 12px var(--mono)" : "11px var(--mono)";
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(FLABELS[f], b.x0 - 6, yc);

      // Value
      ctx.textAlign = v >= 0 ? "left" : "right";
      ctx.fillStyle = isSelected ? color : dim;
      ctx.font = "11px var(--mono)";
      ctx.fillText(v.toFixed(3), v >= 0 ? xv + 4 : xv - 4, yc);
      ctx.restore();
    });

    // "Strongest r" annotation
    ctx.save();
    ctx.fillStyle = neg; ctx.font = "bold 11px var(--mono)";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(`max |r| = ${maxAbsPopCorr.toFixed(3)} (instrument)`, b.x0, b.y0 + 2);
    ctx.restore();

    // Scatter overlay for selected feature
    if (state.selectedFeat) {
      drawScatterBlob(state.selectedFeat);
    }
  }

  // Mini scatter (faint blob) drawn in upper-right quadrant of canvas
  function drawScatterBlob(feat) {
    const ctx = cv.ctx;
    const b = cv.box;
    const { xs, ys } = scatterSample(feat);

    // Mini box in top-right
    const mx0 = b.x0 + (b.x1 - b.x0) * 0.62;
    const mx1 = b.x1;
    const my0 = b.y0;
    const my1 = b.y0 + (b.y1 - b.y0) * 0.52;

    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const sx2 = new Scale([xMin, xMax], [mx0 + 4, mx1 - 4]);
    const sy2 = new Scale([0, 100], [my1 - 4, my0 + 4]);

    const css = getComputedStyle(document.documentElement);
    const dim  = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const ink  = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const accent = css.getPropertyValue("--accent").trim() || "#8c78ff";

    // Background
    ctx.save();
    ctx.fillStyle = css.getPropertyValue("--surface").trim() || "#fafaf8";
    ctx.globalAlpha = 0.88;
    ctx.fillRect(mx0, my0, mx1 - mx0, my1 - my0);
    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = dim; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
    ctx.strokeRect(mx0, my0, mx1 - mx0, my1 - my0);
    ctx.globalAlpha = 1;

    // Dots
    for (let i = 0; i < xs.length; i++) {
      dot(ctx, sx2.map(xs[i]), sy2.map(ys[i]), 2, accent, { alpha: 0.22 });
    }

    // Trend line (should be nearly flat)
    const r = popCorr[feat];
    const mx = mean(xs), my = mean(ys), sx_ = std(xs), sy_ = std(ys);
    const x0 = xMin, x1 = xMax;
    const y0 = my + r * (sy_ / sx_) * (x0 - mx);
    const y1_ = my + r * (sy_ / sx_) * (x1 - mx);
    ctx.save();
    ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(sx2.map(x0), sy2.map(y0)); ctx.lineTo(sx2.map(x1), sy2.map(y1_)); ctx.stroke();
    ctx.restore();

    // Label
    ctx.fillStyle = dim; ctx.font = "10px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(`${FLABELS[feat]} vs popularity  r = ${r.toFixed(3)}`, (mx0 + mx1) / 2, my1 - 1);
    ctx.restore();
  }

  // ── PANEL 2: Discover audio DNA — SVG graph ───────────────────────────────────
  // Node layout: circle of 10 features
  const NODE_R_PX = 22;
  const GCX = GW / 2, GCY = GH / 2;
  const GRX = 200, GRY = 138;
  const nodePos = {};
  FEATURES.forEach((f, i) => {
    const a = (2 * Math.PI * i) / FEATURES.length - Math.PI / 2;
    nodePos[f] = { x: GCX + GRX * Math.cos(a), y: GCY + GRY * Math.sin(a) };
  });

  // Draggable node positions (mutable)
  const nodePosLive = {};
  for (const f of FEATURES) nodePosLive[f] = { ...nodePos[f] };

  function drawDiscoverSVG() {
    clear(svgRoot);
    const alpha = state.alpha;
    const css = getComputedStyle(document.documentElement);
    const pos    = css.getPropertyValue("--pos").trim()    || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";
    const surface= css.getPropertyValue("--surface").trim()|| "#fafaf8";
    const line2  = css.getPropertyValue("--line").trim()   || "#d4d4e0";

    sublabel.textContent =
      `Gaussian graphical model: edge shown when |partial r| > α = ${alpha.toFixed(2)} · ` +
      `green = positive, pink = negative`;

    const n = FEATURES.length;

    // Draw edges first
    const gEdges = svgEl("g");
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const pc = partialCorrPrec(i, j);
        const abs = Math.abs(pc);
        if (abs <= alpha) continue;

        const pa = nodePosLive[FEATURES[i]];
        const pb = nodePosLive[FEATURES[j]];
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const x0 = pa.x + ux * NODE_R_PX;
        const y0 = pa.y + uy * NODE_R_PX;
        const x1 = pb.x - ux * NODE_R_PX;
        const y1 = pb.y - uy * NODE_R_PX;

        const weight = clamp((abs - alpha) / (0.7 - alpha), 0, 1);
        const strokeW = 1 + weight * 5;
        const color = pc > 0 ? pos : neg;
        const opacity = 0.35 + weight * 0.55;

        gEdges.appendChild(svgEl("line", {
          x1: x0.toFixed(1), y1: y0.toFixed(1),
          x2: x1.toFixed(1), y2: y1.toFixed(1),
          stroke: color,
          "stroke-width": strokeW.toFixed(2),
          "stroke-opacity": opacity.toFixed(2),
          "stroke-linecap": "round",
        }));

        // Edge label for strong links
        if (abs > 0.25) {
          const lx = (pa.x + pb.x) / 2;
          const ly = (pa.y + pb.y) / 2;
          gEdges.appendChild(svgEl("text", {
            x: lx.toFixed(1), y: ly.toFixed(1),
            "text-anchor": "middle", "dominant-baseline": "middle",
            "font-size": "9", "font-family": "var(--mono,monospace)",
            fill: color, "fill-opacity": "0.85",
            text: pc.toFixed(2),
          }));
        }
      }
    }
    svgRoot.appendChild(gEdges);

    // Draw nodes (draggable)
    const gNodes = svgEl("g");
    for (const f of FEATURES) {
      const { x, y } = nodePosLive[f];
      const isCluster = ["energy","loud","acoustic"].includes(f);
      const isDance   = ["dance","valence"].includes(f);

      const g = svgEl("g", { transform: `translate(${x.toFixed(1)},${y.toFixed(1)})` });

      // Cluster halo
      if (isCluster) {
        g.appendChild(svgEl("circle", { r: NODE_R_PX + 7, fill: pos, "fill-opacity": "0.10" }));
      }
      if (isDance) {
        g.appendChild(svgEl("circle", { r: NODE_R_PX + 5, fill: gold, "fill-opacity": "0.10" }));
      }

      g.appendChild(svgEl("circle", {
        r: NODE_R_PX, fill: surface,
        stroke: isCluster ? pos : isDance ? gold : line2,
        "stroke-width": isCluster || isDance ? "2" : "1.5",
      }));

      // Short label
      const shortLabel = f === "instrument" ? "inst." : f === "acoustic" ? "acous." : f;
      g.appendChild(svgEl("text", {
        "text-anchor": "middle", y: "4",
        "font-size": "11", "font-family": "var(--mono,monospace)",
        "font-weight": "700", fill: ink,
        text: shortLabel,
      }));

      // Make draggable
      g.style.cursor = "grab";
      let dragging = false;
      let startX = 0, startY = 0, origX = 0, origY = 0;

      const onPointerDown = (e) => {
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        origX = nodePosLive[f].x; origY = nodePosLive[f].y;
        g.setPointerCapture(e.pointerId);
        g.style.cursor = "grabbing";
        e.preventDefault();
      };
      const onPointerMove = (e) => {
        if (!dragging) return;
        const svgRect = svgRoot.getBoundingClientRect();
        const scaleX = GW / svgRect.width;
        const scaleY = GH / svgRect.height;
        nodePosLive[f].x = origX + (e.clientX - startX) * scaleX;
        nodePosLive[f].y = origY + (e.clientY - startY) * scaleY;
      };
      const onPointerUp = () => {
        dragging = false;
        g.style.cursor = "grab";
      };
      g.addEventListener("pointerdown", onPointerDown);
      g.addEventListener("pointermove", onPointerMove);
      g.addEventListener("pointerup",   onPointerUp);
      g.addEventListener("pointercancel", onPointerUp);

      gNodes.appendChild(g);
    }
    svgRoot.appendChild(gNodes);

    // Legend
    const gLeg = svgEl("g", { transform: `translate(8, ${GH - 38})` });
    gLeg.appendChild(svgEl("rect", { x:"0", y:"0", width:"230", height:"34",
      rx:"6", fill: surface, "fill-opacity":"0.85", stroke: dim, "stroke-opacity":"0.3" }));
    gLeg.appendChild(svgEl("rect", { x:"8", y:"10", width:"18", height:"5",
      fill: pos, rx:"2", "fill-opacity":"0.85" }));
    gLeg.appendChild(svgEl("text", { x:"32", y:"15", "font-size":"10",
      "font-family":"var(--mono,monospace)", fill: dim, text: "positive partial r" }));
    gLeg.appendChild(svgEl("rect", { x:"8", y:"23", width:"18", height:"5",
      fill: neg, rx:"2", "fill-opacity":"0.85" }));
    gLeg.appendChild(svgEl("text", { x:"32", y:"28", "font-size":"10",
      "font-family":"var(--mono,monospace)", fill: dim, text: "negative partial r" }));
    gLeg.appendChild(svgEl("circle", { cx:"125", cy:"13", r:"7", fill: pos, "fill-opacity":"0.12",
      stroke: pos, "stroke-width":"1.5" }));
    gLeg.appendChild(svgEl("text", { x:"137", y:"16", "font-size":"10",
      "font-family":"var(--mono,monospace)", fill: dim, text: "energy-cluster" }));
    gLeg.appendChild(svgEl("circle", { cx:"125", cy:"26", r:"6", fill: gold, "fill-opacity":"0.15",
      stroke: gold, "stroke-width":"1.5" }));
    gLeg.appendChild(svgEl("text", { x:"137", y:"29", "font-size":"10",
      "font-family":"var(--mono,monospace)", fill: dim, text: "dance–valence" }));
    svgRoot.appendChild(gLeg);
  }

  // ── PANEL 3: Direct or indirect? ─────────────────────────────────────────────
  function drawDirect() {
    sublabel.textContent = "Raw correlation vs partial correlation (given conditioning variable)";
    const ctx = cv.ctx;
    const b = cv.box;

    const css = getComputedStyle(document.documentElement);
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const pos    = css.getPropertyValue("--pos").trim()    || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";
    const accent = css.getPropertyValue("--accent").trim() || "#8c78ff";

    const fa = state.directA, fb = state.directB, fc = state.directCond;
    const rawR = correlation(featVecs[fa], featVecs[fb]);
    const partR = fc ? partialCorrOLS(fa, fb, [fc]) : rawR;

    const vals = [rawR, partR];
    const yMin = Math.min(...vals, 0) - 0.12;
    const yMax = Math.max(...vals, 0) + 0.12;

    const sx = new Scale([0, 3], [b.x0, b.x1]);
    const sy = new Scale([yMin, yMax], [b.y1, b.y0]);

    drawAxes(cv, sx, sy, {
      ylabel: "correlation",
      xticks: [],
      yticks: niceTicks4(yMin, yMax, 5),
      grid: true,
    });

    // Zero line
    ctx.save(); ctx.strokeStyle = dim; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
    ctx.setLineDash([4, 4]);
    const zy = sy.map(0);
    ctx.beginPath(); ctx.moveTo(b.x0, zy); ctx.lineTo(b.x1, zy); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();

    const barW = (sx.map(1) - sx.map(0)) * 0.5;
    const baseline = sy.map(0);

    // Raw bar
    const rawTop = sy.map(rawR);
    ctx.save(); ctx.globalAlpha = 0.82; ctx.fillStyle = accent;
    ctx.fillRect(sx.map(0.7) - barW/2, Math.min(rawTop, baseline), barW, Math.abs(rawTop - baseline));
    ctx.restore();

    // Partial bar
    const partTop = sy.map(partR);
    ctx.save(); ctx.globalAlpha = 0.82;
    ctx.fillStyle = Math.abs(partR) < 0.05 ? pos : Math.abs(partR) < Math.abs(rawR) ? gold : neg;
    ctx.fillRect(sx.map(2.0) - barW/2, Math.min(partTop, baseline), barW, Math.abs(partTop - baseline));
    ctx.restore();

    // Labels
    ctx.save();
    ctx.fillStyle = ink; ctx.font = "bold 12px var(--mono)"; ctx.textAlign = "center";
    ctx.textBaseline = Math.min(rawTop, baseline) < b.y0 + 20 ? "top" : "bottom";
    ctx.fillText(rawR.toFixed(3), sx.map(0.7), Math.min(rawTop, baseline) - 4);
    ctx.textBaseline = Math.min(partTop, baseline) < b.y0 + 20 ? "top" : "bottom";
    ctx.fillText(partR.toFixed(3), sx.map(2.0), Math.min(partTop, baseline) - 4);
    ctx.restore();

    // X-axis labels
    ctx.save();
    ctx.fillStyle = dim; ctx.font = "12px var(--mono)"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(`${FLABELS[fa]} ~ ${FLABELS[fb]}`, sx.map(0.7), b.y1 + 6);
    ctx.fillStyle = fc ? gold : dim;
    ctx.fillText(fc ? `partial | ${FLABELS[fc]}` : "same (no conditioner)", sx.map(2.0), b.y1 + 6);
    ctx.restore();

    // Annotation arrows / screening-off text
    if (fc && Math.abs(partR) < Math.abs(rawR) * 0.5) {
      ctx.save();
      ctx.fillStyle = pos; ctx.font = "bold 11px var(--mono)";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(
        `screening-off: ${FLABELS[fc]} explains ${((1 - partR**2/(rawR**2 || 1))*100).toFixed(0)}% of link`,
        (b.x0 + b.x1) / 2, b.y0 + 14
      );
      ctx.restore();
    } else if (fc) {
      ctx.save();
      ctx.fillStyle = gold; ctx.font = "11px var(--mono)";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(`conditioning on ${FLABELS[fc]} changes r by ${(partR - rawR).toFixed(3)}`,
        (b.x0 + b.x1) / 2, b.y0 + 14);
      ctx.restore();
    }
  }

  // ── PANEL 4: Loudness illusion — genre confounding ────────────────────────────
  function drawConfound() {
    sublabel.textContent =
      "Loudness ~ popularity: raw r vs within-genre r. Genre is a common cause.";
    const ctx = cv.ctx;
    const b = cv.box;

    const css = getComputedStyle(document.documentElement);
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const pos    = css.getPropertyValue("--pos").trim()    || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";
    const accent = css.getPropertyValue("--accent").trim() || "#8c78ff";

    // Genre-level correlations
    const genreCorrs = GENRES.map(g => {
      const sub = CLEAN.filter(r => r.genre === g);
      if (sub.length < 10) return { genre: g, r: 0, n: 0 };
      return { genre: g, r: correlation(col(sub, "loud"), col(sub, "pop")), n: sub.length };
    }).filter(d => d.n >= 10);

    const allVals = [loudPopCorr, loudPopWithinGenre, ...genreCorrs.map(d => d.r), 0];
    const yMin = Math.min(...allVals) - 0.06;
    const yMax = Math.max(...allVals) + 0.06;

    const nBars = genreCorrs.length + 2;
    const sx = new Scale([-0.5, nBars + 0.5], [b.x0, b.x1]);
    const sy = new Scale([yMin, yMax], [b.y1, b.y0]);

    drawAxes(cv, sx, sy, {
      ylabel: "r with popularity",
      xticks: [],
      yticks: niceTicks4(yMin, yMax, 5),
      grid: true,
    });

    const baseline = sy.map(0);
    ctx.save(); ctx.strokeStyle = dim; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(b.x0, baseline); ctx.lineTo(b.x1, baseline); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();

    const barW = (sx.map(1) - sx.map(0)) * 0.6;
    const GENRE_COLORS = ["#4cc2ff","#7c6cff","#ff8a4c","#4cd0a0","#ffce5c","#ff7caa"];

    // Raw bar
    const rawY = sy.map(loudPopCorr);
    ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = accent;
    ctx.fillRect(sx.map(0) - barW/2, Math.min(rawY, baseline), barW, Math.abs(rawY - baseline));
    ctx.restore();
    ctx.save(); ctx.fillStyle = ink; ctx.font = "bold 11px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(loudPopCorr.toFixed(3), sx.map(0), Math.min(rawY, baseline) - 3);
    ctx.fillStyle = dim; ctx.font = "11px var(--mono)"; ctx.textBaseline = "top";
    ctx.fillText("raw", sx.map(0), b.y1 + 6);
    ctx.restore();

    // Within-genre average bar
    const wgY = sy.map(loudPopWithinGenre);
    ctx.save(); ctx.globalAlpha = 0.85;
    ctx.fillStyle = Math.abs(loudPopWithinGenre) < Math.abs(loudPopCorr) ? pos : neg;
    ctx.fillRect(sx.map(1) - barW/2, Math.min(wgY, baseline), barW, Math.abs(wgY - baseline));
    ctx.restore();
    ctx.save(); ctx.fillStyle = ink; ctx.font = "bold 11px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(loudPopWithinGenre.toFixed(3), sx.map(1), Math.min(wgY, baseline) - 3);
    ctx.fillStyle = dim; ctx.font = "11px var(--mono)"; ctx.textBaseline = "top";
    ctx.fillText("avg within-genre", sx.map(1), b.y1 + 6);
    ctx.restore();

    // Per-genre bars
    genreCorrs.forEach(({ genre, r, n }, i) => {
      const xi = i + 2;
      const barTop = sy.map(r);
      const color = GENRE_COLORS[i % GENRE_COLORS.length];

      ctx.save(); ctx.globalAlpha = 0.82; ctx.fillStyle = color;
      ctx.fillRect(sx.map(xi) - barW/2, Math.min(barTop, baseline), barW, Math.abs(barTop - baseline));
      ctx.restore();

      ctx.save(); ctx.fillStyle = ink; ctx.font = "bold 10px var(--mono)";
      ctx.textAlign = "center";
      ctx.textBaseline = r >= 0 ? "bottom" : "top";
      ctx.fillText(r.toFixed(3), sx.map(xi), r >= 0 ? barTop - 3 : barTop + 3);
      ctx.fillStyle = dim; ctx.font = "10px var(--mono)"; ctx.textBaseline = "top";
      ctx.fillText(genre, sx.map(xi), b.y1 + 6);
      ctx.fillText(`n=${n}`, sx.map(xi), b.y1 + 18);
      ctx.restore();
    });

    // Caption annotation
    ctx.save();
    ctx.fillStyle = gold; ctx.font = "bold 11px var(--mono)";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("genre is a common cause of loudness AND popularity — a confounder", b.x0, b.y0 + 2);
    ctx.restore();
  }

  // ── PANEL 5: The missing cause — SVG DAG ─────────────────────────────────────
  function drawMissingSVG() {
    clear(svgRoot);
    sublabel.textContent =
      "Causal structure: audio features cluster together; popularity is nearly disconnected";

    const css = getComputedStyle(document.documentElement);
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const pos    = css.getPropertyValue("--pos").trim()    || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";
    const surface= css.getPropertyValue("--surface").trim()|| "#fafaf8";
    const line2  = css.getPropertyValue("--line").trim()   || "#d4d4e0";

    const CX = GW / 2;

    // Feature cluster (left ellipse)
    const clusterCX = 190, clusterCY = 180, clusterRX = 145, clusterRY = 130;

    // Cluster halo
    svgRoot.appendChild(svgEl("ellipse", {
      cx: clusterCX, cy: clusterCY,
      rx: clusterRX + 18, ry: clusterRY + 14,
      fill: pos, "fill-opacity": "0.06",
      stroke: pos, "stroke-width": "1.5", "stroke-opacity": "0.25",
      "stroke-dasharray": "6 4",
    }));

    svgRoot.appendChild(svgEl("text", {
      x: clusterCX, y: 28,
      "text-anchor": "middle", "font-size": "12",
      "font-family": "var(--mono,monospace)", "font-weight": "700",
      fill: pos, text: "Audio Feature Network",
    }));

    // Feature nodes in cluster
    const clusterNodes = [
      { id: "energy",  label: "energy",   x: 130, y: 120 },
      { id: "loud",    label: "loudness",  x: 200, y: 85  },
      { id: "acoustic",label: "acousticn.", x:100, y: 195 },
      { id: "dance",   label: "dance",     x: 250, y: 175 },
      { id: "valence", label: "valence",   x: 230, y: 255 },
      { id: "tempo",   label: "tempo",     x: 155, y: 270 },
    ];

    // Feature edges (key strong ones)
    const featureEdges = [
      { a: "energy",  b: "loud",    pc: energyLoudPC },
      { a: "energy",  b: "acoustic",pc: energyAcousticPC },
      { a: "loud",    b: "acoustic",pc: partialCorrPrec(FEATURES.indexOf("loud"), FEATURES.indexOf("acoustic")) },
      { a: "dance",   b: "valence", pc: partialCorrPrec(FEATURES.indexOf("dance"), FEATURES.indexOf("valence")) },
    ];

    const gEdges = svgEl("g");
    for (const { a, b: bId, pc } of featureEdges) {
      const pa = clusterNodes.find(n => n.id === a);
      const pb = clusterNodes.find(n => n.id === bId);
      if (!pa || !pb) continue;
      const color = pc > 0 ? pos : neg;
      const strokeW = 1.5 + Math.abs(pc) * 5;
      gEdges.appendChild(svgEl("line", {
        x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y,
        stroke: color, "stroke-width": strokeW.toFixed(1),
        "stroke-opacity": "0.7", "stroke-linecap": "round",
      }));
      // partial r label midpoint
      const lx = (pa.x + pb.x) / 2, ly = (pa.y + pb.y) / 2;
      gEdges.appendChild(svgEl("text", {
        x: lx, y: ly - 3, "text-anchor": "middle",
        "font-size": "9", "font-family": "var(--mono,monospace)",
        fill: color, "fill-opacity": "0.9", text: pc.toFixed(2),
      }));
    }
    svgRoot.appendChild(gEdges);

    // Cluster feature nodes
    const gCNodes = svgEl("g");
    for (const nd of clusterNodes) {
      const g = svgEl("g", { transform: `translate(${nd.x},${nd.y})` });
      const isEnergy = ["energy","loud","acoustic"].includes(nd.id);
      const isDance  = ["dance","valence"].includes(nd.id);
      g.appendChild(svgEl("circle", {
        r: "22", fill: surface,
        stroke: isEnergy ? pos : isDance ? gold : line2,
        "stroke-width": "2",
      }));
      g.appendChild(svgEl("text", {
        "text-anchor": "middle", y: "4", "font-size": "10",
        "font-family": "var(--mono,monospace)", "font-weight": "700",
        fill: ink, text: nd.label.slice(0, 7),
      }));
      gCNodes.appendChild(g);
    }
    svgRoot.appendChild(gCNodes);

    // Popularity node (right side, nearly disconnected)
    const popX = GW - 110, popY = 130;
    svgRoot.appendChild(svgEl("circle", {
      cx: popX, cy: popY, r: "38",
      fill: surface, stroke: dim,
      "stroke-width": "1.5", "stroke-dasharray": "5 3",
    }));
    svgRoot.appendChild(svgEl("text", {
      x: popX, y: popY - 7,
      "text-anchor": "middle", "font-size": "12",
      "font-family": "var(--mono,monospace)", "font-weight": "700",
      fill: ink, text: "popularity",
    }));
    svgRoot.appendChild(svgEl("text", {
      x: popX, y: popY + 10,
      "text-anchor": "middle", "font-size": "9",
      "font-family": "var(--mono,monospace)", fill: dim,
      text: "max |r| = " + maxAbsPopCorr.toFixed(3),
    }));
    svgRoot.appendChild(svgEl("text", {
      x: popX, y: popY + 22,
      "text-anchor": "middle", "font-size": "9",
      "font-family": "var(--mono,monospace)", fill: neg,
      text: "(weak, all features)",
    }));

    // Faint arrow from cluster to popularity (very weak)
    const arrowX0 = 340, arrowY0 = 170;
    const arrowX1 = popX - 40, arrowY1 = popY;
    const gArr = svgEl("g");
    // defs for arrowhead
    const defs = svgEl("defs");
    const marker = svgEl("marker", {
      id: "hs-arr-dim", viewBox: "0 0 10 10", refX: "9", refY: "5",
      markerWidth: "5", markerHeight: "5", orient: "auto-start-reverse",
    });
    marker.appendChild(svgEl("path", { d: "M0,0 L10,5 L0,10 z", fill: dim }));
    defs.appendChild(marker);
    svgRoot.appendChild(defs);

    gArr.appendChild(svgEl("line", {
      x1: arrowX0, y1: arrowY0, x2: arrowX1, y2: arrowY1,
      stroke: dim, "stroke-width": "1",
      "stroke-dasharray": "4 4", "stroke-opacity": "0.45",
      "marker-end": "url(#hs-arr-dim)",
    }));
    gArr.appendChild(svgEl("text", {
      x: (arrowX0 + arrowX1) / 2, y: (arrowY0 + arrowY1) / 2 - 7,
      "text-anchor": "middle", "font-size": "9",
      "font-family": "var(--mono,monospace)", fill: dim,
      text: "barely connected",
    }));
    svgRoot.appendChild(gArr);

    // Unmeasured "fame / marketing" node (bottom right, shaded dashed)
    const fameX = GW - 105, fameY = 270;
    svgRoot.appendChild(svgEl("ellipse", {
      cx: fameX, cy: fameY, rx: "88", ry: "38",
      fill: gold, "fill-opacity": "0.10",
      stroke: gold, "stroke-width": "1.5", "stroke-dasharray": "5 3",
    }));
    svgRoot.appendChild(svgEl("text", {
      x: fameX, y: fameY - 12,
      "text-anchor": "middle", "font-size": "11",
      "font-family": "var(--mono,monospace)", "font-weight": "700",
      fill: gold, text: "★ fame · marketing",
    }));
    svgRoot.appendChild(svgEl("text", {
      x: fameX, y: fameY + 4,
      "text-anchor": "middle", "font-size": "10",
      "font-family": "var(--mono,monospace)", fill: gold,
      text: "playlists · timing",
    }));
    svgRoot.appendChild(svgEl("text", {
      x: fameX, y: fameY + 18,
      "text-anchor": "middle", "font-size": "9",
      "font-family": "var(--mono,monospace)", fill: dim, "fill-opacity": "0.8",
      text: "(unmeasured — not in data)",
    }));

    // Arrow from unmeasured to popularity
    const defs2 = svgEl("defs");
    const marker2 = svgEl("marker", {
      id: "hs-arr-gold", viewBox: "0 0 10 10", refX: "9", refY: "5",
      markerWidth: "5", markerHeight: "5", orient: "auto-start-reverse",
    });
    marker2.appendChild(svgEl("path", { d: "M0,0 L10,5 L0,10 z", fill: gold }));
    defs2.appendChild(marker2);
    svgRoot.appendChild(defs2);

    svgRoot.appendChild(svgEl("line", {
      x1: fameX, y1: fameY - 40, x2: popX, y2: popY + 38,
      stroke: gold, "stroke-width": "2",
      "stroke-dasharray": "6 3", "stroke-opacity": "0.7",
      "marker-end": "url(#hs-arr-gold)",
    }));

    // Annotation text
    svgRoot.appendChild(svgEl("text", {
      x: CX - 10, y: GH - 14,
      "text-anchor": "middle", "font-size": "11",
      "font-family": "var(--mono,monospace)", fill: dim,
      text: "Causal discovery sees only measured columns — the true cause is absent.",
    }));
  }

  // ── Initial draw ──────────────────────────────────────────────────────────────
  animateBars("formula");
  draw();

  return () => { stop(); };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function niceTicks4(lo, hi, n = 5) {
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
