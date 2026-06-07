// Market Graph — "What Actually Moves a Stock?"
// Causal discovery + confounding by the market factor.
// Real data: Yahoo Finance daily prices, ~2024-06 to 2026-06.
// N = 500 trading days; 20 large-cap stocks + S&P 500 (SPY).
//
// The honest payoff:
//   Raw returns all correlate (avg ≈ 0.19) because the market is a common cause.
//   Remove SPY and the web collapses (avg residual corr ≈ 0.01).
//   But SECTOR structure survives: Energy ≈ 0.80, Financials ≈ 0.60.
//   Tech dissolves because mega-cap tech IS the market in 2024–26.
//   Day-ahead prediction stays elusive (efficient markets).

import { h, clear } from "../lib/dom.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes } from "../lib/plot.js";
import {
  lessonLayout, panelSection, slider, segmented, toggle,
  readout, challenge,
} from "../lib/ui.js";
import { mean, correlation, clamp } from "../lib/stats.js";
import { tickers, rets, meta } from "../data/stocks.js";
import { dataBadge } from "../lib/data.js";

// ── CSS ─────────────────────────────────────────────────────────────────────
function ensureCSS() {
  if (document.getElementById("marketgraph-css")) return;
  const st = document.createElement("style");
  st.id = "marketgraph-css";
  st.textContent = `
.mg-wrap { display:flex; flex-direction:column; align-items:center; width:100%; }
.mg-wrap canvas { max-width:100%; height:auto; display:block; }
.mg-wrap svg { max-width:100%; height:auto; display:block; }
.mg-sublabel { font:11px/1.4 var(--mono); color:var(--dim); text-align:center; margin:6px 0 2px; }
.mg-row { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-start; }
.mg-legend { display:flex; flex-wrap:wrap; gap:5px 12px; font:10px var(--mono);
             color:var(--dim); margin-top:5px; align-items:center; }
.mg-swatch { display:inline-block; width:12px; height:8px; border-radius:2px;
             vertical-align:middle; margin-right:3px; }
.mg-svg-wrap { width:100%; display:flex; justify-content:center; }
.mg-svg-wrap svg { max-width:580px; width:100%; }
  `;
  document.head.appendChild(st);
}

// ── Data prep ────────────────────────────────────────────────────────────────
// tickers[0] = SPY (Market); tickers[1..19] = 19 stocks
const N_DAYS = rets.length;
const N_STOCKS = 19; // non-SPY stocks

// Column vectors
function colVec(k) { return rets.map(r => r[k]); }
const spyRet = colVec(0); // column 0 = SPY

// All 19 stock return columns (indices 1..19)
const stockRets = [];
for (let k = 1; k < 20; k++) stockRets.push(colVec(k));

// OLS beta of stock k on SPY (simple slope, no intercept offset needed in practice)
function olsBeta(y) {
  const mx = mean(spyRet), my = mean(y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < N_DAYS; i++) {
    sxy += (spyRet[i] - mx) * (y[i] - my);
    sxx += (spyRet[i] - mx) ** 2;
  }
  return sxx === 0 ? 1 : sxy / sxx;
}

// Market betas for each stock
const stockBetas = stockRets.map(olsBeta);

// De-marketed residuals: residual_i = return_i - beta_i * SPY
const stockResids = stockRets.map((r, i) => r.map((v, t) => v - stockBetas[i] * spyRet[t]));

// Correlation helpers
function pairCorr(a, b) { return correlation(a, b); }

// Pre-compute full 19×19 raw correlation matrix
const RAW_CORR = Array.from({ length: N_STOCKS }, (_, i) =>
  Array.from({ length: N_STOCKS }, (_, j) => i === j ? 1 : pairCorr(stockRets[i], stockRets[j]))
);

// Pre-compute 19×19 residual correlation matrix
const RES_CORR = Array.from({ length: N_STOCKS }, (_, i) =>
  Array.from({ length: N_STOCKS }, (_, j) => i === j ? 1 : pairCorr(stockResids[i], stockResids[j]))
);

// Average pairwise correlations (upper triangle)
function avgPairCorr(mat) {
  let sum = 0, cnt = 0;
  for (let i = 0; i < N_STOCKS; i++) for (let j = i + 1; j < N_STOCKS; j++) {
    sum += mat[i][j]; cnt++;
  }
  return cnt ? sum / cnt : 0;
}
const AVG_RAW_CORR = avgPairCorr(RAW_CORR);
const AVG_RES_CORR = avgPairCorr(RES_CORR);

// Avg corr of each stock with SPY
let spyCorrSum = 0;
for (let i = 0; i < N_STOCKS; i++) spyCorrSum += pairCorr(stockRets[i], spyRet);
const AVG_SPY_CORR = spyCorrSum / N_STOCKS;

// Sector index mapping: tickers[1..19] → residCols index 0..18
// Sectors: Tech(0-4), Fin(5-7), Energy(8-10), Staples(11-13), Health(14-16), Consumer(17), Industrials(18)
const SECTOR_COLORS = {
  Technology: "#8c78ff",
  Financials:  "#4cc2ff",
  Energy:      "#ff8a4c",
  Staples:     "#4cd0a0",
  Health:      "#ff7caa",
  Consumer:    "#ffce5c",
  Industrials: "#7c6cff",
  Market:      "#aaaaaa",
};

const STOCK_INFO = tickers.slice(1).map((t, i) => ({
  sym: t.sym, name: t.name, sector: t.sector, idx: i,
  color: SECTOR_COLORS[t.sector] || "#aaaaaa",
}));

// Within-sector residual corrs
function withinSectorAvgCorr(sectorName) {
  const idxs = STOCK_INFO.filter(s => s.sector === sectorName).map(s => s.idx);
  if (idxs.length < 2) return 0;
  let sum = 0, cnt = 0;
  for (let a = 0; a < idxs.length; a++) for (let b = a + 1; b < idxs.length; b++) {
    sum += RES_CORR[idxs[a]][idxs[b]]; cnt++;
  }
  return cnt ? sum / cnt : 0;
}
const ENERGY_RES_CORR  = withinSectorAvgCorr("Energy");
const FIN_RES_CORR     = withinSectorAvgCorr("Financials");
const TECH_RES_CORR    = withinSectorAvgCorr("Technology");

// Lag-1 correlations: corr(residual_i[day], residual_j[day+1]) — efficiency test
function lagCorr(a, b) {
  const n = Math.min(a.length, b.length) - 1;
  const xs = a.slice(0, n), ys = b.slice(1, n + 1);
  return pairCorr(xs, ys);
}
// sample a few lag correlations for representative display
const LAG_PAIRS = [
  [8, 9], [8, 10], [9, 10],   // Energy pairs
  [5, 6], [5, 7], [6, 7],     // Fin pairs
  [0, 1], [0, 4], [2, 3],     // Tech pairs
];
const LAG_CORRS = LAG_PAIRS.map(([a, b]) => lagCorr(stockResids[a], stockResids[b]));
const AVG_LAG_CORR = mean(LAG_CORRS.map(Math.abs));

// Strongest raw pair
let maxRawCorr = 0, maxRawI = 0, maxRawJ = 0;
for (let i = 0; i < N_STOCKS; i++) for (let j = i + 1; j < N_STOCKS; j++) {
  if (RAW_CORR[i][j] > maxRawCorr) { maxRawCorr = RAW_CORR[i][j]; maxRawI = i; maxRawJ = j; }
}

// Strongest residual pair
let maxResCorr = 0, maxResI = 0, maxResJ = 0;
for (let i = 0; i < N_STOCKS; i++) for (let j = i + 1; j < N_STOCKS; j++) {
  if (RES_CORR[i][j] > maxResCorr) { maxResCorr = RES_CORR[i][j]; maxResI = i; maxResJ = j; }
}

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

// ── Network graph layout ──────────────────────────────────────────────────────
const GW = 560, GH = 380;
const GCX = GW / 2, GCY = GH / 2 - 10;
const GR = 155;

// Node positions: circle layout for 19 stocks
const nodePos = STOCK_INFO.map((s, i) => {
  const a = (2 * Math.PI * i) / N_STOCKS - Math.PI / 2;
  return { x: GCX + GR * Math.cos(a), y: GCY + GR * Math.sin(a) };
});

const NODE_R = 15;

// ── MODULE ─────────────────────────────────────────────────────────────────────
export function mount(root) {
  ensureCSS();

  // ── State ────────────────────────────────────────────────────────────────────
  const state = {
    panel: "tangled",    // "tangled"|"hidden"|"discover"|"predict"|"verdict"
    alpha: 0.30,         // edge threshold for network
    demarket: false,     // for panel 2 toggle
    challengeDone: false,
  };

  // Spring for alpha animation
  const alphaSpring = new Spring(state.alpha, { stiffness: 45, damping: 12 });

  // Springs for bar animations (panel 2 corr comparison)
  const rawBarSp  = new Spring(AVG_RAW_CORR, { stiffness: 55, damping: 13 });
  const resBarSp  = new Spring(AVG_RES_CORR, { stiffness: 55, damping: 13 });
  const spyBarSp  = new Spring(AVG_SPY_CORR, { stiffness: 55, damping: 13 });

  // ── Layout ───────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel: panelEl, caption } = lessonLayout({
    title: "Market Graph — What Actually Moves a Stock?",
    idea: "Stock returns all correlate because ONE hidden common cause — the overall market — " +
          "drives them all. Strip out the market and the tangled web collapses, revealing real " +
          "sector structure. But day-ahead prediction stays elusive: markets are near-efficient.",
  });

  // Canvas (for bar charts / scatter)
  const cv = new Canvas(560, 360, { margin: { t: 36, r: 24, b: 52, l: 62 } });
  cv.el.style.maxWidth = "100%";
  const sublabel = h("div", { class: "mg-sublabel" });
  const canvasWrap = h("div", { class: "mg-wrap" });
  canvasWrap.appendChild(cv.el);
  canvasWrap.appendChild(sublabel);

  // SVG for network panels
  const svgRoot = svgEl("svg", { viewBox: `0 0 ${GW} ${GH}`, width: GW, height: GH });
  const svgWrap = h("div", { class: "mg-svg-wrap" });
  svgWrap.appendChild(svgRoot);
  svgWrap.style.display = "none";

  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.alignItems = "center";
  stage.appendChild(canvasWrap);
  stage.appendChild(svgWrap);

  // ── Readouts ─────────────────────────────────────────────────────────────────
  const rRaw    = readout({ label: "Avg raw pairwise r", value: "—", accent: "var(--neg)"    });
  const rRes    = readout({ label: "Avg residual r",     value: "—", accent: "var(--pos)"    });
  const rEnergy = readout({ label: "Within-Energy r",    value: "—", accent: "var(--gold)"   });

  const chal = challenge({
    goal: "Strip out the market — the hidden common cause — and discover what's left: " +
          "the sector clusters (Energy, Financials). Then confirm no stock reliably predicts " +
          "another's next-day move.",
  });

  // ── Panel selector ────────────────────────────────────────────────────────────
  const viewSeg = segmented({
    options: [
      { label: "The tangled web",       value: "tangled"  },
      { label: "The hidden hand",       value: "hidden"   },
      { label: "Real structure",        value: "discover" },
      { label: "Predict tomorrow?",     value: "predict"  },
      { label: "Verdict",               value: "verdict"  },
    ],
    value: state.panel,
    onSelect: (v) => {
      state.panel = v;
      syncVisibility();
      updateReadouts();
      if ((v === "discover" || v === "verdict") && !state.challengeDone) {
        state.challengeDone = true;
        chal.setState(true,
          `avg raw r=${AVG_RAW_CORR.toFixed(3)} → residual r=${AVG_RES_CORR.toFixed(3)}` +
          ` · Energy within-sector=${ENERGY_RES_CORR.toFixed(3)}` +
          ` · avg |lag-1 corr|=${AVG_LAG_CORR.toFixed(3)} ≈ 0`
        );
      }
      // Animate bar targets for hidden panel
      if (v === "hidden") {
        rawBarSp.set(AVG_RAW_CORR);
        resBarSp.set(AVG_RES_CORR);
        spyBarSp.set(AVG_SPY_CORR);
      }
    },
  });

  // Edge threshold slider (panels "discover")
  const alphaSliderEl = slider({
    label: "Edge threshold α (|corr| > α → edge)",
    min: 0.05, max: 0.85, step: 0.01, value: state.alpha,
    fmt: v => v.toFixed(2),
    onInput: (v) => {
      state.alpha = v;
      alphaSpring.set(v);
    },
    hint: "(lower → more edges appear)",
  });

  // De-market toggle (panel "hidden")
  const demarketToggle = toggle({
    label: "Remove the market (de-market returns)",
    value: false,
    onToggle: (on) => {
      state.demarket = on;
    },
  });

  // ── Assemble panel ────────────────────────────────────────────────────────────
  panelEl.append(
    dataBadge(meta),
    panelSection("", viewSeg),
    panelSection("De-market (panel 2)", demarketToggle),
    panelSection("Edge threshold α (panel 3)", alphaSliderEl),
    panelSection("Key readouts", h("div", { class: "mg-row" }, [rRaw, rRes, rEnergy])),
    panelSection("Challenge", chal),
    panelSection("Sector key", buildLegend()),
  );

  // ── Caption ───────────────────────────────────────────────────────────────────
  caption.innerHTML =
    "Data: <strong>Yahoo Finance daily prices, 2024–26</strong> (500 trading days, 19 large-cap " +
    "U.S. stocks + SPY). We apply causal-discovery logic to daily log returns: " +
    "the raw pairwise correlation web is dense (avg r&nbsp;≈&nbsp;" + AVG_RAW_CORR.toFixed(2) + ") " +
    "because the <em>overall market</em> is a <strong>common cause</strong> of every stock — " +
    "a textbook confounder. Regressing each stock on SPY and correlating the residuals " +
    "reveals the true conditional structure: average residual correlation collapses to " +
    "≈&nbsp;" + AVG_RES_CORR.toFixed(2) + ". Within-sector blocks survive — " +
    "<strong>Energy</strong> (XOM–CVX–COP, avg r&nbsp;≈&nbsp;" + ENERGY_RES_CORR.toFixed(2) + ") " +
    "and <strong>Financials</strong> (JPM–BAC–GS, avg r&nbsp;≈&nbsp;" + FIN_RES_CORR.toFixed(2) + ") — " +
    "while <strong>Technology dissolves</strong>: in 2024–26 the mega-cap tech stocks essentially " +
    "<em>are</em> the market, so removing SPY removes their co-movement. " +
    "Lag-1 cross-correlations hover near zero (avg |r|&nbsp;≈&nbsp;" + AVG_LAG_CORR.toFixed(3) + "), " +
    "confirming near-efficient markets: contemporaneous structure is discoverable, " +
    "day-ahead causal prediction is not — which is exactly why beating the market is hard. " +
    "This is a fresh causal-inference analysis of public data; no trading edge is claimed.";

  root.appendChild(layout);

  // ── Visibility sync ───────────────────────────────────────────────────────────
  function syncVisibility() {
    const useSVG = (state.panel === "tangled" || state.panel === "discover");
    canvasWrap.style.display = useSVG ? "none" : "";
    svgWrap.style.display    = useSVG ? "" : "none";
  }
  syncVisibility();

  // ── Initial readouts ──────────────────────────────────────────────────────────
  function updateReadouts() {
    rRaw.set(AVG_RAW_CORR.toFixed(3), "avg pairwise raw r");
    rRes.set(AVG_RES_CORR.toFixed(3), "avg pairwise residual r");
    rEnergy.set(ENERGY_RES_CORR.toFixed(3), "XOM–CVX–COP residual r");
  }
  updateReadouts();

  // ── Frame loop ────────────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    alphaSpring.step(dt);
    rawBarSp.step(dt);
    resBarSp.step(dt);
    spyBarSp.step(dt);
    draw();
  });

  // ── Draw dispatcher ───────────────────────────────────────────────────────────
  function draw() {
    const p = state.panel;
    if (p === "tangled" || p === "discover") {
      drawNetworkSVG();
      return;
    }
    cv.clear();
    if      (p === "hidden")  drawHidden();
    else if (p === "predict") drawPredict();
    else if (p === "verdict") drawVerdict();
  }

  // ── PANEL 1 & 3: Network SVG ──────────────────────────────────────────────────
  function drawNetworkSVG() {
    clear(svgRoot);
    const css = getComputedStyle(document.documentElement);
    const pos    = css.getPropertyValue("--pos").trim()    || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";
    const surf   = css.getPropertyValue("--surface").trim()|| "#fafaf8";

    const isDiscover = state.panel === "discover";
    const alpha = isDiscover ? alphaSpring.value : 0.14; // tangled: show many edges
    const corrMat = isDiscover ? RES_CORR : RAW_CORR;

    sublabel.textContent = isDiscover
      ? `De-marketed residual correlation network · edge when |r| > α = ${alphaSpring.value.toFixed(2)}`
      : `Raw return correlation network · avg r = ${AVG_RAW_CORR.toFixed(3)} · why is everything linked?`;

    const gEdges = svgEl("g");

    // Draw edges
    for (let i = 0; i < N_STOCKS; i++) {
      for (let j = i + 1; j < N_STOCKS; j++) {
        const r = corrMat[i][j];
        const absR = Math.abs(r);
        if (absR <= alpha) continue;

        const pa = nodePos[i], pb = nodePos[j];
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const x0 = pa.x + ux * NODE_R;
        const y0 = pa.y + uy * NODE_R;
        const x1 = pb.x - ux * NODE_R;
        const y1 = pb.y - uy * NODE_R;

        const weight = clamp((absR - alpha) / (0.9 - alpha), 0, 1);
        const strokeW = 0.6 + weight * 3.5;
        const opacity = 0.18 + weight * 0.7;

        // Color by sector if discover mode, otherwise by sign
        let color;
        if (isDiscover) {
          // highlight within-sector edges
          const si = STOCK_INFO[i].sector, sj = STOCK_INFO[j].sector;
          if (si === sj && absR > 0.25) {
            color = SECTOR_COLORS[si] || pos;
          } else {
            color = r > 0 ? pos : neg;
          }
        } else {
          color = r > 0 ? pos : neg;
        }

        gEdges.appendChild(svgEl("line", {
          x1: x0.toFixed(1), y1: y0.toFixed(1),
          x2: x1.toFixed(1), y2: y1.toFixed(1),
          stroke: color,
          "stroke-width": strokeW.toFixed(2),
          "stroke-opacity": opacity.toFixed(2),
          "stroke-linecap": "round",
        }));
      }
    }
    svgRoot.appendChild(gEdges);

    // Draw cluster halos for discover mode
    if (isDiscover) {
      // Energy cluster halo
      const energyIdxs = STOCK_INFO.filter(s => s.sector === "Energy").map(s => s.idx);
      if (energyIdxs.length) drawClusterHalo(energyIdxs, SECTOR_COLORS.Energy, "Energy cluster");
      const finIdxs = STOCK_INFO.filter(s => s.sector === "Financials").map(s => s.idx);
      if (finIdxs.length) drawClusterHalo(finIdxs, SECTOR_COLORS.Financials, "Financials cluster");
    }

    // Draw nodes
    const gNodes = svgEl("g");
    for (let i = 0; i < N_STOCKS; i++) {
      const info = STOCK_INFO[i];
      const { x, y } = nodePos[i];
      const g = svgEl("g", { transform: `translate(${x.toFixed(1)},${y.toFixed(1)})` });

      // Node glow for strong within-sector residual
      if (isDiscover && (info.sector === "Energy" || info.sector === "Financials")) {
        g.appendChild(svgEl("circle", {
          r: NODE_R + 5, fill: info.color, "fill-opacity": "0.20",
        }));
      }

      g.appendChild(svgEl("circle", {
        r: NODE_R, fill: surf,
        stroke: info.color,
        "stroke-width": "2",
      }));

      // Sym label
      g.appendChild(svgEl("text", {
        "text-anchor": "middle", y: "4",
        "font-size": "9", "font-family": "var(--mono,monospace)",
        "font-weight": "700", fill: ink,
        text: info.sym,
      }));

      gNodes.appendChild(g);
    }
    svgRoot.appendChild(gNodes);

    // Annotation text
    if (!isDiscover) {
      // Pose the question
      svgRoot.appendChild(svgEl("text", {
        x: GCX, y: GH - 16,
        "text-anchor": "middle", "font-size": "11",
        "font-family": "var(--mono,monospace)", fill: dim,
        text: `${countEdges(corrMat, alpha)} edges shown · avg raw r = ${AVG_RAW_CORR.toFixed(3)} · why is everything connected?`,
      }));
    } else {
      // Readout in SVG
      const edgeCnt = countEdges(corrMat, alphaSpring.value);
      svgRoot.appendChild(svgEl("text", {
        x: GCX, y: GH - 16,
        "text-anchor": "middle", "font-size": "11",
        "font-family": "var(--mono,monospace)", fill: dim,
        text: `${edgeCnt} edges · avg residual r = ${AVG_RES_CORR.toFixed(3)} · Energy: ${ENERGY_RES_CORR.toFixed(2)} · Fin: ${FIN_RES_CORR.toFixed(2)} · Tech: ${TECH_RES_CORR.toFixed(2)}`,
      }));

      // "Tech note" callout
      const techNote = svgEl("g", { transform: "translate(8, 8)" });
      techNote.appendChild(svgEl("rect", {
        x: "0", y: "0", width: "280", height: "30",
        rx: "6", fill: surf, "fill-opacity": "0.88",
        stroke: SECTOR_COLORS.Technology, "stroke-opacity": "0.4",
      }));
      techNote.appendChild(svgEl("text", {
        x: "10", y: "14", "font-size": "10",
        "font-family": "var(--mono,monospace)",
        fill: SECTOR_COLORS.Technology,
        text: "Tech dissolves — mega-cap tech = the market",
      }));
      techNote.appendChild(svgEl("text", {
        x: "10", y: "25", "font-size": "9",
        "font-family": "var(--mono,monospace)", fill: dim,
        text: `avg within-Tech residual r = ${TECH_RES_CORR.toFixed(2)}`,
      }));
      svgRoot.appendChild(techNote);
    }

    // Sector legend (bottom-right)
    drawSVGLegend();
  }

  function drawClusterHalo(idxs, color, label) {
    if (idxs.length < 2) return;
    let cx = 0, cy = 0;
    for (const i of idxs) { cx += nodePos[i].x; cy += nodePos[i].y; }
    cx /= idxs.length; cy /= idxs.length;
    let r = 0;
    for (const i of idxs) r = Math.max(r, Math.hypot(nodePos[i].x - cx, nodePos[i].y - cy));
    r += NODE_R + 10;
    svgRoot.appendChild(svgEl("circle", {
      cx: cx.toFixed(1), cy: cy.toFixed(1), r: r.toFixed(1),
      fill: color, "fill-opacity": "0.08",
      stroke: color, "stroke-width": "1.5",
      "stroke-opacity": "0.40", "stroke-dasharray": "6 4",
    }));
    svgRoot.appendChild(svgEl("text", {
      x: cx.toFixed(1), y: (cy - r - 3).toFixed(1),
      "text-anchor": "middle", "font-size": "10",
      "font-family": "var(--mono,monospace)", "font-weight": "700",
      fill: color, text: label,
    }));
  }

  function drawSVGLegend() {
    const css = getComputedStyle(document.documentElement);
    const surf = css.getPropertyValue("--surface").trim() || "#fafaf8";
    const dim  = css.getPropertyValue("--dim").trim()     || "#8a8a99";

    const sectors = [...new Set(STOCK_INFO.map(s => s.sector))];
    const lx = GW - 110, ly = 8, rowH = 14;
    const g = svgEl("g");
    g.appendChild(svgEl("rect", {
      x: lx - 6, y: ly - 4,
      width: 115, height: sectors.length * rowH + 8,
      rx: "6", fill: surf, "fill-opacity": "0.88",
      stroke: dim, "stroke-opacity": "0.2",
    }));
    sectors.forEach((sec, i) => {
      g.appendChild(svgEl("rect", {
        x: lx, y: ly + i * rowH + 1, width: 10, height: 7,
        rx: "2", fill: SECTOR_COLORS[sec] || dim,
      }));
      g.appendChild(svgEl("text", {
        x: lx + 14, y: ly + i * rowH + 8,
        "font-size": "9", "font-family": "var(--mono,monospace)",
        fill: dim, text: sec,
      }));
    });
    svgRoot.appendChild(g);
  }

  function countEdges(mat, alpha) {
    let cnt = 0;
    for (let i = 0; i < N_STOCKS; i++) for (let j = i + 1; j < N_STOCKS; j++)
      if (Math.abs(mat[i][j]) > alpha) cnt++;
    return cnt;
  }

  // ── PANEL 2: The hidden hand ──────────────────────────────────────────────────
  function drawHidden() {
    const css = getComputedStyle(document.documentElement);
    const pos    = css.getPropertyValue("--pos").trim()    || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";
    const accent = css.getPropertyValue("--accent").trim() || "#8c78ff";
    const surf   = css.getPropertyValue("--surface").trim()|| "#fafaf8";

    const demarket = state.demarket;

    sublabel.textContent = demarket
      ? "After removing the market — the common cause — residual correlations collapse"
      : "Every stock loads heavily on SPY: the market is a common cause of all returns";

    const b = cv.box;
    const ctx = cv.ctx;

    if (!demarket) {
      // Show: stock-SPY correlations as a bar chart
      const spyCorrs = stockRets.map((r, i) => pairCorr(r, spyRet));
      const spyCorrSorted = spyCorrs.map((v, i) => ({ v, info: STOCK_INFO[i] }))
        .sort((a, b2) => a.v - b2.v);

      const sx = new Scale([0, N_STOCKS + 1], [b.x0, b.x1]);
      const sy = new Scale([0, 1], [b.y1, b.y0]);
      drawAxes(cv, sx, sy, {
        xlabel: "stock",
        ylabel: "corr with SPY",
        xticks: [],
        yticks: [0, 0.2, 0.4, 0.6, 0.8],
        grid: true,
      });

      // Avg line
      const avgY = sy.map(AVG_SPY_CORR);
      ctx.save();
      ctx.strokeStyle = gold; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(b.x0, avgY); ctx.lineTo(b.x1, avgY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = gold; ctx.font = "10px var(--mono)";
      ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      ctx.fillText(`avg = ${AVG_SPY_CORR.toFixed(2)}`, b.x0 + 4, avgY - 2);
      ctx.restore();

      const barW = (sx.map(1) - sx.map(0)) * 0.65;
      spyCorrSorted.forEach(({ v, info }, i) => {
        const xc = sx.map(i + 1);
        const barTop = sy.map(v);
        const baseline = sy.map(0);
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = info.color;
        ctx.fillRect(xc - barW / 2, barTop, barW, baseline - barTop);
        ctx.restore();

        // Sym label at bottom
        ctx.save();
        ctx.fillStyle = dim; ctx.font = "8px var(--mono)";
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.save(); ctx.translate(xc, b.y1 + 2); ctx.rotate(-Math.PI / 4);
        ctx.fillText(info.sym, 0, 0);
        ctx.restore(); ctx.restore();
      });

      // Annotation: DAG concept — Market → every stock
      drawConfounderDAG(ctx, b, surf, ink, dim, gold, accent);
    } else {
      // Show: before/after comparison bars — raw avg vs residual avg vs energy/fin
      const bars = [
        { label: "avg raw r", val: rawBarSp.value, color: neg,    hint: "all 19 stocks, raw"   },
        { label: "avg resid r", val: resBarSp.value, color: pos,  hint: "after removing SPY"   },
        { label: "within-Energy", val: ENERGY_RES_CORR, color: gold, hint: "XOM–CVX–COP resid" },
        { label: "within-Fin",   val: FIN_RES_CORR,    color: accent, hint: "JPM–BAC–GS resid" },
        { label: "within-Tech",  val: TECH_RES_CORR,   color: SECTOR_COLORS.Technology, hint: "tech dissolves!" },
      ];

      const sx = new Scale([-0.5, bars.length + 0.5], [b.x0, b.x1]);
      const sy = new Scale([0, 1.0], [b.y1, b.y0]);
      drawAxes(cv, sx, sy, {
        xlabel: "",
        ylabel: "correlation",
        xticks: [],
        yticks: [0, 0.2, 0.4, 0.6, 0.8, 1.0],
        grid: true,
      });

      const barW = (sx.map(1) - sx.map(0)) * 0.6;
      const baseline = sy.map(0);

      bars.forEach(({ label, val, color, hint }, i) => {
        const xc = sx.map(i);
        const barTop = sy.map(Math.max(0, val));
        ctx.save();
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = color;
        ctx.fillRect(xc - barW / 2, barTop, barW, Math.max(1, baseline - barTop));
        ctx.restore();

        // Value label
        ctx.save();
        ctx.fillStyle = ink; ctx.font = "bold 12px var(--mono)";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(val.toFixed(2), xc, barTop - 3);
        ctx.fillStyle = dim; ctx.font = "10px var(--mono)"; ctx.textBaseline = "top";
        ctx.fillText(label, xc, b.y1 + 4);
        ctx.fillText(hint, xc, b.y1 + 16);
        ctx.restore();
      });

      // Headline annotation
      ctx.save();
      ctx.fillStyle = pos; ctx.font = "bold 11px var(--mono)";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(
        `removing the market: ${AVG_RAW_CORR.toFixed(3)} → ${AVG_RES_CORR.toFixed(3)}  (${((1 - AVG_RES_CORR / AVG_RAW_CORR) * 100).toFixed(0)}% collapse)`,
        (b.x0 + b.x1) / 2, b.y0 + 4
      );
      ctx.restore();
    }
  }

  function drawConfounderDAG(ctx, b, surf, ink, dim, gold, accent) {
    // Small schematic DAG: Market → Stock_i, for all i
    const dagX = b.x1 - 135, dagY = b.y0 + 15;
    const dagW = 130, dagH = 110;

    ctx.save();
    ctx.fillStyle = surf; ctx.globalAlpha = 0.88;
    ctx.fillRect(dagX - 6, dagY - 6, dagW + 12, dagH + 12);
    ctx.globalAlpha = 0.25; ctx.strokeStyle = gold; ctx.lineWidth = 1;
    ctx.strokeRect(dagX - 6, dagY - 6, dagW + 12, dagH + 12);
    ctx.globalAlpha = 1;

    // Market node (top center)
    const mx = dagX + dagW / 2, my = dagY + 18;
    ctx.fillStyle = gold; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(mx, my, 16, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink; ctx.font = "bold 10px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("SPY", mx, my);

    // Stock nodes (bottom row)
    const stockXs = [dagX + 18, dagX + dagW / 2, dagX + dagW - 18];
    const sy2 = dagY + dagH - 18;
    const labels = ["AAPL", "XOM", "JPM"];
    const colors = [SECTOR_COLORS.Technology, SECTOR_COLORS.Energy, SECTOR_COLORS.Financials];

    for (let si = 0; si < 3; si++) {
      const sx2 = stockXs[si];
      // Arrow from market
      ctx.save();
      ctx.strokeStyle = gold; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55;
      ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(mx, my + 16); ctx.lineTo(sx2, sy2 - 12); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();

      ctx.save();
      ctx.fillStyle = colors[si]; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(sx2, sy2, 12, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink; ctx.font = "bold 8px var(--mono)";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(labels[si], sx2, sy2);
      ctx.restore();
    }

    // Ellipsis label
    ctx.save();
    ctx.fillStyle = dim; ctx.font = "9px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("Market → every stock", dagX + dagW / 2, dagY + dagH - 3);
    ctx.restore();
    ctx.restore();
  }

  // ── PANEL 4: Can you predict tomorrow? ───────────────────────────────────────
  function drawPredict() {
    const css = getComputedStyle(document.documentElement);
    const pos    = css.getPropertyValue("--pos").trim()    || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";
    const accent = css.getPropertyValue("--accent").trim() || "#8c78ff";

    sublabel.textContent =
      "Lag-1 cross-correlations of de-marketed residuals — near zero = near-efficient market";

    const b = cv.box;
    const ctx = cv.ctx;

    // Show lag-1 correlations for the same-sector pairs we care about
    const pairs = [
      { label: "XOM→CVX+1",  r: lagCorr(stockResids[8], stockResids[9]),  color: SECTOR_COLORS.Energy },
      { label: "XOM→COP+1",  r: lagCorr(stockResids[8], stockResids[10]), color: SECTOR_COLORS.Energy },
      { label: "CVX→COP+1",  r: lagCorr(stockResids[9], stockResids[10]), color: SECTOR_COLORS.Energy },
      { label: "JPM→BAC+1",  r: lagCorr(stockResids[5], stockResids[6]),  color: SECTOR_COLORS.Financials },
      { label: "JPM→GS+1",   r: lagCorr(stockResids[5], stockResids[7]),  color: SECTOR_COLORS.Financials },
      { label: "BAC→GS+1",   r: lagCorr(stockResids[6], stockResids[7]),  color: SECTOR_COLORS.Financials },
      { label: "AAPL→MSFT+1",r: lagCorr(stockResids[0], stockResids[1]),  color: SECTOR_COLORS.Technology },
      { label: "NVDA→GOOGL+1",r:lagCorr(stockResids[2], stockResids[3]),  color: SECTOR_COLORS.Technology },
    ];

    const allVals = pairs.map(p => p.r);
    const absMax = Math.max(...allVals.map(Math.abs), 0.08) * 1.35;

    const sx = new Scale([-0.5, pairs.length + 0.5], [b.x0, b.x1]);
    const sy = new Scale([-absMax, absMax], [b.y1, b.y0]);
    drawAxes(cv, sx, sy, {
      xlabel: "stock pair (lag-1 day)",
      ylabel: "lag-1 residual r",
      xticks: [],
      yticks: niceMgTicks(-absMax, absMax, 5),
      grid: true,
    });

    // Zero line
    const zy = sy.map(0);
    ctx.save(); ctx.strokeStyle = dim; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(b.x0, zy); ctx.lineTo(b.x1, zy); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();

    const barW = (sx.map(1) - sx.map(0)) * 0.6;
    const baseline = sy.map(0);

    pairs.forEach(({ label, r, color }, i) => {
      const xc = sx.map(i);
      const barTop = sy.map(r);
      ctx.save();
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = color;
      ctx.fillRect(xc - barW / 2, Math.min(barTop, baseline), barW, Math.abs(barTop - baseline));
      ctx.restore();

      // Value
      ctx.save();
      ctx.fillStyle = ink; ctx.font = "10px var(--mono)";
      ctx.textAlign = "center";
      ctx.textBaseline = r >= 0 ? "bottom" : "top";
      ctx.fillText(r.toFixed(3), xc, r >= 0 ? barTop - 2 : barTop + 2);
      ctx.fillStyle = dim; ctx.font = "8px var(--mono)"; ctx.textBaseline = "top";
      ctx.fillText(label, xc, b.y1 + 4);
      ctx.restore();
    });

    // Annotation
    const avgAbsLag = mean(pairs.map(p => Math.abs(p.r)));
    ctx.save();
    ctx.fillStyle = pos; ctx.font = "bold 11px var(--mono)";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(
      `avg |lag-1 r| = ${avgAbsLag.toFixed(3)} ≈ 0  ·  contemporaneous ≠ predictive`,
      (b.x0 + b.x1) / 2, b.y0 + 4
    );
    ctx.restore();
  }

  // ── PANEL 5: Verdict ──────────────────────────────────────────────────────────
  function drawVerdict() {
    const css = getComputedStyle(document.documentElement);
    const pos    = css.getPropertyValue("--pos").trim()    || "#50dca0";
    const neg    = css.getPropertyValue("--neg").trim()    || "#ff5a5a";
    const dim    = css.getPropertyValue("--dim").trim()    || "#8a8a99";
    const ink    = css.getPropertyValue("--ink").trim()    || "#1c1c22";
    const gold   = css.getPropertyValue("--gold").trim()   || "#ffce5c";
    const accent = css.getPropertyValue("--accent").trim() || "#8c78ff";

    sublabel.textContent = "Causal anatomy of the market — what we can and cannot learn";

    const b = cv.box;
    const ctx = cv.ctx;
    const cx = (b.x0 + b.x1) / 2;

    ctx.save();
    ctx.font = "bold 14px var(--mono)";
    ctx.fillStyle = ink;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("What causal discovery reveals (and doesn't)", cx, b.y0 + 6);
    ctx.restore();

    const items = [
      { type: "found",   text: `Raw web (avg r=${AVG_RAW_CORR.toFixed(3)}): the market confounds everything — a common cause of all 19 stocks.` },
      { type: "found",   text: `De-marketing collapses average r to ${AVG_RES_CORR.toFixed(3)} — the confounder explains most of the spurious co-movement.` },
      { type: "found",   text: `Energy (XOM–CVX–COP, r≈${ENERGY_RES_CORR.toFixed(2)}) and Financials (JPM–BAC–GS, r≈${FIN_RES_CORR.toFixed(2)}) sector blocks survive — real shared structure.` },
      { type: "found",   text: `Technology dissolves (r≈${TECH_RES_CORR.toFixed(2)}): in 2024–26 the mega-cap tech stocks essentially ARE the market index.` },
      { type: "caveat",  text: `Lag-1 residual correlations ≈ 0 (avg |r|=${AVG_LAG_CORR.toFixed(3)}): markets are near-efficient — no reliable day-ahead prediction.` },
      { type: "caveat",  text: "Caution: contemporaneous co-movement reveals structure, NOT a trading edge. Arbitraging sector correlations faces transaction costs and regime shifts." },
      { type: "verdict", text: "Verdict: one giant common factor (the market) + a few sector blocks = the causal anatomy of U.S. equity returns. This is a discovery, not a forecast." },
    ];

    const rowH = 40;
    const iconColors = { found: pos, caveat: neg, verdict: gold };
    const icons = { found: "✓", caveat: "△", verdict: "◆" };

    items.forEach((item, i) => {
      const y = b.y0 + 36 + i * rowH;
      if (y + rowH > b.y1) return;
      const color = iconColors[item.type];
      ctx.save();
      ctx.fillStyle = color; ctx.globalAlpha = 0.12;
      ctx.fillRect(b.x0, y, b.x1 - b.x0, rowH - 3);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color; ctx.font = "bold 12px var(--mono)";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(icons[item.type], b.x0 + 6, y + rowH / 2 - 2);
      ctx.fillStyle = ink; ctx.font = "10px var(--mono)";
      drawWrappedText(ctx, item.text, b.x0 + 22, y + 7, b.x1 - b.x0 - 28, 14);
      ctx.restore();
    });
  }

  // ── initial draw ──────────────────────────────────────────────────────────────
  draw();

  return () => { stop(); };
}

// ── Build sector legend for panel ────────────────────────────────────────────
function buildLegend() {
  const SECTOR_COLORS_LOC = {
    Technology: "#8c78ff", Financials: "#4cc2ff", Energy: "#ff8a4c",
    Staples: "#4cd0a0", Health: "#ff7caa", Consumer: "#ffce5c", Industrials: "#7c6cff",
  };
  const items = Object.entries(SECTOR_COLORS_LOC).map(([sec, col]) => {
    const swatch = document.createElement("span");
    swatch.className = "mg-swatch";
    swatch.style.background = col;
    const label = document.createTextNode(sec);
    const wrap = document.createElement("span");
    wrap.appendChild(swatch);
    wrap.appendChild(label);
    return wrap;
  });
  const div = document.createElement("div");
  div.className = "mg-legend";
  items.forEach(el => div.appendChild(el));
  return div;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function niceMgTicks(lo, hi, n = 5) {
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
  let ln = "";
  let curY = y;
  for (const w of words) {
    const test = ln ? ln + " " + w : w;
    if (ctx.measureText(test).width > maxW && ln) {
      ctx.fillText(ln, x, curY);
      ln = w; curY += lineH;
    } else {
      ln = test;
    }
  }
  if (ln) ctx.fillText(ln, x, curY);
}
