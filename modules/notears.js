// Neural Causal Discovery — NOTEARS (Zheng, Aragam, Ravikumar, Xing, NeurIPS 2018) /
// DAGMA (Bello, Aragam, Ravikumar, Xing, NeurIPS 2022).
// Real benchmark: Sachs et al. (2005) single-cell protein-signaling network.
// Structure learning as continuous optimization: minimize a least-squares loss
// subject to the differentiable acyclicity constraint h(W) = tr(exp(W∘W)) − d = 0.
// Watch the 11×11 weight matrix crystallize into the real causal DAG via gradient descent.

import { h, s, clear } from "../lib/dom.js";
import { clamp } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas } from "../lib/plot.js";
import {
  zeros, mT, mm, madd, msub, mscale, hadamard,
  trace, frob2, matExp,
} from "../lib/nn.js";
import {
  lessonLayout, panelSection, slider, button, segmented,
  readout, challenge, note,
} from "../lib/ui.js";
import { rows, meta } from "../data/sachs.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";

// ── Constants ─────────────────────────────────────────────────────────────────
const LABELS = meta.vars;           // ["Raf","Mek","Plcg","PIP2","PIP3","Erk","Akt","PKA","PKC","P38","Jnk"]
const D = LABELS.length;            // 11

// Build name→index map
const NAME_IDX = Object.fromEntries(LABELS.map((name, i) => [name, i]));

// Ground-truth edges as index pairs (from the Sachs consensus network)
const TRUE_EDGES = meta.trueEdges.map(([a, b]) => [NAME_IDX[a], NAME_IDX[b]]);
// Build a fast lookup set
const TRUE_SET = new Set(TRUE_EDGES.map(([a, b]) => `${a}-${b}`));

// Steps per animation frame when running
const STEPS_PER_FRAME = 3;
// Augmented-Lagrangian update every K gradient steps
const AL_UPDATE_INTERVAL = 100;

// ── Build data matrix from real Sachs data ────────────────────────────────────
function buildDataMatrix() {
  const complete_rows = complete(rows, LABELS);
  const N = complete_rows.length;
  // z-score each column independently
  const cols = LABELS.map(key => zscore(col(complete_rows, key)).z);
  // assemble N×D matrix (row-major)
  const X = Array.from({ length: N }, (_, i) => LABELS.map((_, j) => cols[j][i]));
  return { X, N };
}

// ── Inject CSS ────────────────────────────────────────────────────────────────
function injectCSS() {
  if (document.getElementById("notears-css")) return;
  const style = document.createElement("style");
  style.id = "notears-css";
  style.textContent = `
    .nt-stage { display:flex; flex-direction:row; gap:20px; align-items:flex-start; justify-content:center; width:100%; }
    .nt-heatmap-wrap { display:flex; flex-direction:column; align-items:center; gap:6px; }
    .nt-graph-wrap  { display:flex; flex-direction:column; align-items:center; gap:6px; flex:1; min-width:0; }
    .nt-section-title {
      font:700 11px var(--mono,monospace); color:var(--dim); letter-spacing:.07em;
      text-transform:uppercase; margin:0 0 4px;
    }
    .nt-metrics { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:6px; }
    .nt-heatmap-canvas { border-radius:6px; border:1px solid var(--line); image-rendering:pixelated; }
    .nt-graph-svg { border-radius:8px; border:1px solid var(--line); background:var(--surface); display:block; }
    .nt-loss-canvas { border-radius:6px; border:1px solid var(--line); margin-top:6px; }
    .nt-iter-label { font:12px var(--mono,monospace); color:var(--dim); text-align:center; }
  `;
  document.head.appendChild(style);
}

// ── NOTEARS optimizer state ───────────────────────────────────────────────────
// Gauss-Jordan inverse + log-determinant for a small matrix. Used for DAGMA's
// log-det acyclicity. ok=false if a non-positive/near-zero pivot is hit (i.e. we
// have left the positive-definite domain where the DAGMA constraint is valid).
function gjInverseLogdet(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  let logdet = 0, ok = true;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) { ok = false; break; }
    if (piv !== c) { const t = M[piv]; M[piv] = M[c]; M[c] = t; }
    const d = M[c][c];
    if (d <= 0) ok = false;            // not positive-definite -> outside DAGMA domain
    logdet += Math.log(Math.abs(d));
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return { ok, logdet, inv: M.map((row) => row.slice(n)) };
}

// Returns a mutable object whose properties are updated in-place so callers
// can hold a stable reference.
function makeOpt(dataRef, hyperRef) {
  const state = {
    W: zeros(D, D),
    rho: 1.0,
    alpha: 0.0,
    stepCount: 0,
    prevH: Infinity,
    lossHistory: [],
    hHistory: [],
  };

  function gradAndLoss(Wm) {
    const X = dataRef.X;
    const N = dataRef.N;
    const lambdaL1 = hyperRef.lambdaL1;
    // Residuals: R = XW − X  (n×d)
    const XW = mm(X, Wm);
    const R  = msub(XW, X);

    // Least-squares gradient: (1/n) * Xᵀ(XW − X)
    const G_ls = mscale(mm(mT(X), R), 1 / N);

    // LS loss
    const ls_loss = frob2(R) / (2 * N);

    // Acyclicity h(W). Two characterizations, both =0 iff W is a DAG:
    //   NOTEARS (2018): h = tr(exp(W∘W)) − d
    //   DAGMA   (2022): h = −logdet(sI − W∘W) + d·log s   (faster, sharper grad)
    const W2 = hadamard(Wm, Wm);
    let hVal, G_h;
    if (hyperRef.acyclicity === "dagma") {
      // sI − W∘W is a nonsingular M-matrix (hence positive-definite, logdet
      // defined) whenever s exceeds the spectral radius of W∘W. The max row sum
      // upper-bounds that radius (Perron), so pick s just above it adaptively —
      // this keeps DAGMA in its valid domain for any W and never NaNs.
      let maxRowSum = 0;
      for (const row of W2) { let rs = 0; for (const v of row) rs += v; if (rs > maxRowSum) maxRowSum = rs; }
      const s = Math.max(1.0, maxRowSum + 0.25);
      const Madj = W2.map((row, i) => row.map((v, j) => (i === j ? s : 0) - v));
      const { ok, logdet, inv } = gjInverseLogdet(Madj);
      if (ok) {
        hVal = -logdet + D * Math.log(s);                 // ≥ 0, = 0 iff W is a DAG
        G_h = hadamard(mT(inv), mscale(Wm, 2));           // (sI−W∘W)^{-T} ∘ 2W
      } else {
        const E = matExp(W2);                              // numerical safety net
        hVal = trace(E) - D;
        G_h = hadamard(mT(E), mscale(Wm, 2));
      }
    } else {
      const E = matExp(W2);
      hVal = trace(E) - D;
      G_h = hadamard(mT(E), mscale(Wm, 2));
    }

    // L1 subgradient
    const G_l1 = Wm.map(row => row.map(v => {
      if (v >  1e-10) return  lambdaL1;
      if (v < -1e-10) return -lambdaL1;
      return 0;
    }));

    // Augmented-Lagrangian h coefficient
    const hCoef = state.rho * hVal + state.alpha;

    // Total gradient
    const G = madd(madd(G_ls, mscale(G_h, hCoef)), G_l1);

    // Total loss
    const l1sum = Wm.reduce((acc, row) => acc + row.reduce((a, v) => a + Math.abs(v), 0), 0);
    const loss = ls_loss + lambdaL1 * l1sum
                 + (state.rho / 2) * hVal * hVal + state.alpha * hVal;

    return { G, loss, h: hVal };
  }

  function step() {
    const lr = hyperRef.lr;
    const { G, loss, h: hVal } = gradAndLoss(state.W);
    // Gradient descent update
    for (let i = 0; i < D; i++) {
      for (let j = 0; j < D; j++) {
        state.W[i][j] -= lr * G[i][j];
      }
      state.W[i][i] = 0; // no self-loops
    }
    state.stepCount++;

    // Augmented-Lagrangian update
    if (state.stepCount % AL_UPDATE_INTERVAL === 0) {
      if (hVal > 0.25 * Math.abs(state.prevH) && state.rho < 1e6) {
        state.rho = Math.min(state.rho * 1.5, 1e6);
      }
      state.alpha = state.alpha + state.rho * hVal;
      state.prevH = hVal;
    }

    // Record history (every 5 steps)
    if (state.stepCount % 5 === 0) {
      state.lossHistory.push(loss);
      state.hHistory.push(Math.max(0, hVal));
      if (state.lossHistory.length > 200) {
        state.lossHistory.shift();
        state.hHistory.shift();
      }
    }

    return { loss, h: hVal };
  }

  function reset() {
    for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) state.W[i][j] = 0;
    state.rho = 1.0;
    state.alpha = 0;
    state.stepCount = 0;
    state.prevH = Infinity;
    state.lossHistory = [];
    state.hHistory = [];
  }

  state.step = step;
  state.reset = reset;
  return state;
}

// ── SHD computation ───────────────────────────────────────────────────────────
function computeSHD(W, threshold) {
  // Compare {i→j : |W[i][j]| > threshold} to TRUE_EDGES (Sachs consensus)
  // SHD = false-positives + false-negatives + reversals
  // Reversals: count an edge where the reverse is in truth (not double-counted)
  let shd = 0;
  for (let i = 0; i < D; i++) {
    for (let j = 0; j < D; j++) {
      if (i === j) continue;
      const predicted = Math.abs(W[i][j]) > threshold;
      const inTrue    = TRUE_SET.has(`${i}-${j}`);
      const reverse   = TRUE_SET.has(`${j}-${i}`);
      if (predicted && !inTrue && !reverse) shd++; // false positive
      if (predicted && !inTrue &&  reverse) shd++; // reversal (only count once from this side)
    }
  }
  // missing true edges (not predicted, even reversed)
  for (const [a, b] of TRUE_EDGES) {
    const predictedForward = Math.abs(W[a][b]) > threshold;
    const predictedReverse = Math.abs(W[b][a]) > threshold;
    if (!predictedForward && !predictedReverse) shd++; // entirely missing
  }
  return shd;
}

// ── Heatmap drawing ───────────────────────────────────────────────────────────
function drawHeatmap(cv, W, threshold) {
  const ctx = cv.ctx;
  cv.clear();

  // For 11 nodes use a smaller font; compute cell size to fill canvas
  const cellW = cv.w / (D + 1.5);
  const cellH = cv.h / (D + 1.5);
  const offsetX = cellW * 1.5;
  const offsetY = cellH * 1.5;

  // Draw background
  ctx.fillStyle = "var(--surface)";
  ctx.fillRect(0, 0, cv.w, cv.h);

  // Axis labels (protein names, rotated for columns)
  ctx.font = "bold 9px var(--mono,monospace)";
  ctx.textBaseline = "middle";

  for (let i = 0; i < D; i++) {
    const cx = offsetX + i * cellW + cellW / 2;
    const cy = offsetY + i * cellH + cellH / 2;

    // Column label (top) — rotated 45° for readability
    ctx.save();
    ctx.translate(cx, cellH * 0.6);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = "right";
    ctx.fillStyle = "var(--dim)";
    ctx.fillText(LABELS[i], 0, 0);
    ctx.restore();

    // Row label (left)
    ctx.textAlign = "right";
    ctx.fillStyle = "var(--dim)";
    ctx.fillText(LABELS[i], offsetX - 4, cy);
    ctx.textAlign = "center";
  }

  // Cells
  for (let i = 0; i < D; i++) {
    for (let j = 0; j < D; j++) {
      const val = W[i][j];
      const absVal = Math.abs(val);
      const cx = offsetX + j * cellW;
      const cy = offsetY + i * cellH;

      if (i === j) {
        // Diagonal: always zero
        ctx.fillStyle = "var(--surface2)";
        ctx.fillRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
        continue;
      }

      // Color: teal for positive, pink for negative; opacity = magnitude
      const maxMag = 1.5;
      const t = clamp(absVal / maxMag, 0, 1);

      if (val > 0) {
        ctx.fillStyle = `color-mix(in srgb, var(--accent2) ${Math.round(t * 100)}%, var(--surface))`;
      } else if (val < 0) {
        ctx.fillStyle = `color-mix(in srgb, var(--neg) ${Math.round(t * 100)}%, var(--surface))`;
      } else {
        ctx.fillStyle = "var(--surface)";
      }
      const alpha = 0.08 + t * 0.85;
      ctx.globalAlpha = alpha > 0.08 ? 1 : alpha;
      ctx.fillRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
      ctx.globalAlpha = 1;

      // Gold outline on true-edge cells (Sachs consensus)
      const isTrueEdge = TRUE_SET.has(`${i}-${j}`);
      if (isTrueEdge) {
        ctx.strokeStyle = "var(--gold)";
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.55;
        ctx.strokeRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
        ctx.globalAlpha = 1;
      }

      // Mark threshold-passing edges with inner border
      if (absVal > threshold) {
        ctx.strokeStyle = val > 0 ? "var(--accent2)" : "var(--neg)";
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = 0.6;
        ctx.strokeRect(cx + 2, cy + 2, cellW - 4, cellH - 4);
        ctx.globalAlpha = 1;
      }

      // Value text for cells with strong signal
      if (absVal > 0.35 && cellW > 22) {
        ctx.font = "8px var(--mono,monospace)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = absVal > 0.6 ? "var(--ink)" : "var(--dim)";
        ctx.globalAlpha = clamp(t * 2, 0.3, 1);
        ctx.fillText(val.toFixed(1), cx + cellW / 2, cy + cellH / 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Grid lines
  ctx.strokeStyle = "var(--line)";
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.4;
  for (let i = 0; i <= D; i++) {
    const x = offsetX + i * cellW, y = offsetY + i * cellH;
    ctx.beginPath(); ctx.moveTo(x, offsetY); ctx.lineTo(x, offsetY + D * cellH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(offsetX, y); ctx.lineTo(offsetX + D * cellW, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // "W[from→to]" header
  ctx.font = "9px var(--mono,monospace)";
  ctx.fillStyle = "var(--dim)";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("W[from→to]", offsetX + D * cellW / 2, 2);
}

// ── Graph drawing (SVG) — circular layout ────────────────────────────────────
// 11 nodes on a circle, labelled with protein names
const GW = 340, GH = 340;
const CX = GW / 2, CY = GH / 2, RADIUS = 128, NODE_R = 22;

function circlePos(i) {
  // Start at top (−π/2), go clockwise
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / D;
  return { x: CX + RADIUS * Math.cos(angle), y: CY + RADIUS * Math.sin(angle) };
}

const GPOS = Array.from({ length: D }, (_, i) => circlePos(i));

function buildGraphSVG(svgEl, W, threshold, flashEdges, glowSteps) {
  clear(svgEl);

  // Defs
  const defs = s("defs");
  const mkArrow = (id, col) => s("marker", {
    id, viewBox: "0 0 10 10", refX: 9, refY: 5,
    markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse",
  }, [s("path", { d: "M0,0 L10,5 L0,10 z", fill: col })]);
  defs.append(
    mkArrow("nt-arrow-pos", "var(--accent2)"),
    mkArrow("nt-arrow-neg", "var(--neg)"),
    mkArrow("nt-arrow-gold", "var(--gold)"),
  );
  svgEl.appendChild(defs);

  const gEdges = s("g");
  const gNodes = s("g");
  svgEl.append(gEdges, gNodes);

  // Edges
  for (let i = 0; i < D; i++) {
    for (let j = 0; j < D; j++) {
      if (i === j) continue;
      const val = W[i][j];
      const absVal = Math.abs(val);
      if (absVal <= threshold * 0.1) continue;

      const pa = GPOS[i], pb = GPOS[j];
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const x0 = pa.x + ux * NODE_R, y0 = pa.y + uy * NODE_R;
      const x1 = pb.x - ux * (NODE_R + 4), y1 = pb.y - uy * (NODE_R + 4);
      // Slight curve to avoid overlap
      const mx = (x0 + x1) / 2 - uy * 15, my = (y0 + y1) / 2 + ux * 15;

      const alpha = clamp(absVal / 1.5, 0.05, 1);
      const thickness = clamp(absVal * 2.5, 0.4, 4);
      const visible = absVal > threshold;
      const isTrue = TRUE_SET.has(`${i}-${j}`);
      const isFlash = flashEdges.has(`${i}-${j}`);

      const col = val > 0 ? "var(--accent2)" : "var(--neg)";
      const markerId = val > 0 ? "nt-arrow-pos" : "nt-arrow-neg";
      const opacity = visible ? clamp(alpha * 1.4, 0.2, 1) : clamp(alpha * 0.3, 0.02, 0.2);

      // Gold glow behind true edges that are visible
      if (isTrue && visible) {
        const trueEl = s("path", {
          d: `M ${x0} ${y0} Q ${mx} ${my} ${x1} ${y1}`,
          fill: "none", stroke: "var(--gold)",
          "stroke-width": String(thickness + 3),
          "stroke-opacity": "0.3",
        });
        gEdges.appendChild(trueEl);
      }

      const pathEl = s("path", {
        d: `M ${x0} ${y0} Q ${mx} ${my} ${x1} ${y1}`,
        fill: "none", stroke: col,
        "stroke-width": String(thickness),
        "stroke-opacity": String(opacity),
        "marker-end": visible ? `url(#${markerId})` : "none",
      });
      gEdges.appendChild(pathEl);

      // Flash false-positive edges
      if (isFlash && visible) {
        const flashEl = s("path", {
          d: `M ${x0} ${y0} Q ${mx} ${my} ${x1} ${y1}`,
          fill: "none", stroke: "var(--neg)",
          "stroke-width": String(thickness + 2),
          "stroke-opacity": "0.5",
        });
        gEdges.appendChild(flashEl);
      }
    }
  }

  // Nodes
  for (let i = 0; i < D; i++) {
    const pos = GPOS[i];
    const glow = glowSteps[i] || 0;
    const g = s("g", { transform: `translate(${pos.x},${pos.y})` });
    if (glow > 0) {
      g.appendChild(s("circle", { r: NODE_R + 5, fill: "var(--accent)", "fill-opacity": String(glow * 0.25) }));
    }
    g.append(
      s("circle", { r: NODE_R, fill: "var(--surface2)", stroke: "var(--line)", "stroke-width": "1.5" }),
      s("text", {
        "text-anchor": "middle", y: "4",
        "font-size": "9", "font-weight": "700",
        fill: "var(--ink)", "font-family": "var(--mono,monospace)",
        text: LABELS[i],
      }),
    );
    gNodes.appendChild(g);
  }
}

// ── Loss/h mini-chart ─────────────────────────────────────────────────────────
function drawMiniChart(cv, lossHist, hHist) {
  const ctx = cv.ctx;
  cv.clear();

  if (lossHist.length < 2) {
    ctx.fillStyle = "var(--dim)";
    ctx.font = "11px var(--mono,monospace)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("press play to start", cv.w / 2, cv.h / 2);
    return;
  }

  const pad = { t: 14, r: 8, b: 20, l: 38 };
  const bx0 = pad.l, by0 = pad.t, bx1 = cv.w - pad.r, by1 = cv.h - pad.b;
  const bw = bx1 - bx0, bh = by1 - by0;

  const n = lossHist.length;
  const maxLoss = Math.max(...lossHist, 0.01);
  const maxH    = Math.max(...hHist, 0.01);

  const drawLine = (hist, maxVal, lineCol) => {
    if (hist.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < hist.length; i++) {
      const x = bx0 + (i / (n - 1)) * bw;
      const y = by1 - clamp(hist[i] / maxVal, 0, 1) * bh;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  // Grid
  ctx.strokeStyle = "var(--faint)";
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.5;
  for (let t = 0; t <= 4; t++) {
    const y = by0 + (t / 4) * bh;
    ctx.beginPath(); ctx.moveTo(bx0, y); ctx.lineTo(bx1, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Axis labels
  ctx.fillStyle = "var(--dim)";
  ctx.font = "9px var(--mono,monospace)";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(maxLoss.toFixed(2), bx0 - 2, by0);
  ctx.fillText("0", bx0 - 2, by1 - 8);

  drawLine(lossHist, maxLoss, "var(--accent2)");
  drawLine(hHist, maxH, "var(--treat)");

  // Legend
  ctx.font = "9px var(--mono,monospace)";
  ctx.textBaseline = "top";
  ctx.fillStyle = "var(--accent2)"; ctx.textAlign = "left";
  ctx.fillText("loss", bx0, by0 - 12);
  ctx.fillStyle = "var(--treat)";
  ctx.fillText("h(W)", bx0 + 30, by0 - 12);
}

// ── Main export ───────────────────────────────────────────────────────────────
export function mount(root) {
  injectCSS();

  // ── Build real Sachs data matrix once
  const { X, N } = buildDataMatrix();
  const dataRef  = { X, N };
  const hyperRef = { lr: 0.015, lambdaL1: 0.08, acyclicity: "notears" };
  let threshold = 0.25;
  let playing = false;

  const opt = makeOpt(dataRef, hyperRef);

  // Flash state: edge key -> TTL frames
  const flashMap = new Map();
  // Glow state per node
  const nodeGlows = Array.from({ length: D }, () => new Spring(0, { stiffness: 60, damping: 12 }));

  // Springs for smooth readouts
  const hSpring    = new Spring(0, { stiffness: 80, damping: 14 });
  const lossSpring = new Spring(0, { stiffness: 80, damping: 14 });
  const shdSpring  = new Spring(0, { stiffness: 80, damping: 14 });

  // ── Layout
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Neural Causal Discovery · Sachs Network",
    idea: "NOTEARS / DAGMA learn the 11-node protein-signaling DAG from real single-cell flow-cytometry data (Sachs et al. 2005). Structure learning becomes smooth optimization: minimize regression loss + differentiable acyclicity penalty h(W). Gold edges = Sachs consensus ground truth.",
  });
  root.appendChild(layout);

  // ── Data provenance badge
  const badge = dataBadge(meta);
  panel.insertBefore(badge, panel.firstChild);

  // ── Stage: heatmap + graph
  const stageInner = h("div", { class: "nt-stage" });
  stage.appendChild(stageInner);

  // Left: heatmap (sized for 11×11 + label margin)
  const hmWrap = h("div", { class: "nt-heatmap-wrap" });
  const hmTitle = h("p", { class: "nt-section-title", text: "Learned W matrix (11×11)" });
  const CELL = 34;
  const HM_SIZE = CELL * (D + 1.5);
  const hmCv = new Canvas(HM_SIZE, HM_SIZE, { margin: { t: 0, r: 0, b: 0, l: 0 } });
  hmCv.el.className = "nt-heatmap-canvas";
  hmWrap.append(hmTitle, hmCv.el);

  // Right: graph SVG (circular layout)
  const grWrap = h("div", { class: "nt-graph-wrap" });
  const grTitle = h("p", { class: "nt-section-title", text: "Implied causal graph" });
  const grSvg = s("svg", { class: "nt-graph-svg", viewBox: `0 0 ${GW} ${GH}`, width: GW, height: GH });

  // Mini chart below graph
  const chartTitle = h("p", { class: "nt-section-title", text: "Training curve" });
  const chartCv = new Canvas(GW, 80, { margin: { t: 0, r: 0, b: 0, l: 0 } });
  chartCv.el.className = "nt-loss-canvas";
  const iterLabel = h("div", { class: "nt-iter-label", text: `step 0  ·  N=${N}` });
  grWrap.append(grTitle, grSvg, chartTitle, chartCv.el, iterLabel);

  stageInner.append(hmWrap, grWrap);

  // ── Readouts
  const rH    = readout({ label: "h(W) acyclicity",       value: "—", accent: "var(--treat)" });
  const rLoss = readout({ label: "Loss",                   value: "—", accent: "var(--accent2)" });
  const rSHD  = readout({ label: "SHD to Sachs",          value: "—", accent: "var(--gold)" });
  const rRho  = readout({ label: "ρ (AL penalty)",        value: "—", accent: "var(--dim)" });
  const metrics = h("div", { class: "nt-metrics" }, [rH, rLoss, rSHD, rRho]);

  // ── Legend note
  const legendNote = h("p", { class: "note", style: { textAlign: "center", marginTop: "4px" } },
    ["Gold = Sachs consensus edges  ·  teal = positive weight  ·  pink = negative"]);

  // ── Challenge (SHD ≤ 8 is achievable from observational data with tuned L1)
  const chal = challenge({
    goal: "Run until h(W) < 0.01 (acyclic) and SHD ≤ 8 vs the Sachs consensus. Tune L1 sparsity to prune false edges. Recovering all 17 ground-truth edges from observational data alone is genuinely hard — that's the lesson.",
  });

  // ── Controls
  const playBtn  = button("▶ Play",   () => { playing = true;  updatePlayBtn(); }, { primary: true });
  const pauseBtn = button("⏸ Pause",  () => { playing = false; updatePlayBtn(); });
  const stepBtn  = button("⏭ Step",   doStep);
  const resetBtn = button("↺ Reset",  doReset);

  function updatePlayBtn() {
    playBtn.disabled  = playing;
    pauseBtn.disabled = !playing;
  }
  updatePlayBtn();

  const lrSlider = slider({
    label: "Learning rate", min: 0.001, max: 0.06, step: 0.001, value: hyperRef.lr,
    fmt: v => v.toFixed(3),
    onInput: v => { hyperRef.lr = v; },
  });
  const l1Slider = slider({
    label: "L1 sparsity  λ₁", min: 0, max: 0.3, step: 0.005, value: hyperRef.lambdaL1,
    fmt: v => v.toFixed(3),
    onInput: v => { hyperRef.lambdaL1 = v; opt.reset(); playing = false; updatePlayBtn(); },
    hint: "(higher = sparser graph)",
  });
  const thrSlider = slider({
    label: "Edge threshold", min: 0.05, max: 0.8, step: 0.01, value: threshold,
    fmt: v => v.toFixed(2),
    onInput: v => { threshold = v; },
    hint: "(|W_ij| > this → draw edge)",
  });
  const acycSeg = h("label", { class: "control" }, [
    h("span", { class: "control-label" }, ["Acyclicity  h(W)", h("span", { class: "hint", text: " 2018 → 2022" })]),
    segmented({
      options: [{ label: "NOTEARS", value: "notears" }, { label: "DAGMA", value: "dagma" }],
      value: hyperRef.acyclicity,
      onSelect: v => { hyperRef.acyclicity = v; opt.reset(); playing = false; updatePlayBtn(); },
    }),
  ]);

  panel.append(
    panelSection("Controls", [
      h("div", { class: "btn-row", style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
        [playBtn, pauseBtn, stepBtn, resetBtn]),
    ]),
    panelSection("Hyperparameters", [acycSeg, lrSlider, l1Slider, thrSlider]),
    panelSection("Metrics", [metrics, legendNote]),
    panelSection("Challenge", chal),
    panelSection("Key identities", [
      note("NOTEARS (2018):  h(W) = tr(e^{W∘W}) − d = 0  ⟺  W is a DAG"),
      note("DAGMA (2022):  h(W) = −logdet(sI − W∘W) + d·log s  (≈10× faster, sharper gradient)"),
      note("Augmented Lagrangian: escalate ρ and α until h → 0."),
      note(`Gold-outlined cells = ${TRUE_EDGES.length} Sachs consensus edges.`),
      note(`Data: N=${N} single-cell flow-cytometry measurements, D=11 phosphoproteins.`),
    ]),
  );

  caption.innerHTML =
    "Running <strong>NOTEARS</strong> (Zheng, Aragam, Ravikumar, Xing — NeurIPS 2018) and " +
    "<strong>DAGMA</strong> (Bello, Aragam, Ravikumar, Xing — NeurIPS 2022) on the " +
    "<em>Sachs et al. (Science 2005)</em> protein-signaling dataset — the standard benchmark for " +
    "causal discovery. " +
    "853 single-cell flow-cytometry measurements across 11 phosphoproteins (Raf, Mek, Plcg, PIP2, PIP3, " +
    "Erk, Akt, PKA, PKC, P38, Jnk). Each algorithm minimises " +
    "<span class='k'>ℒ(W) = ‖X−XW‖²/(2n) + λ‖W‖₁ + (ρ/2)h(W)² + αh(W)</span> where h(W) is the " +
    "differentiable acyclicity penalty — zero iff W encodes a DAG, no combinatorial search needed. " +
    "Gold-highlighted edges/cells show the " +
    "<strong>" + TRUE_EDGES.length + "-edge Sachs consensus DAG</strong>. " +
    "Recovering the exact network from purely observational data is genuinely hard (SHD&nbsp;≈&nbsp;0 requires " +
    "interventional data) — that's the lesson. DAGMA's log-det characterization is faster and better-conditioned " +
    "than NOTEARS's matrix-exponential form; toggle between them to compare convergence.";

  // ── Logic helpers
  let prevEdgeSet = new Set();

  function doStep() {
    const { loss, h: hVal } = opt.step();
    hSpring.set(hVal);
    lossSpring.set(loss);

    // Flash newly-appeared false-positive edges; glow nodes gaining true edges
    const curEdgeSet = new Set();
    for (let i = 0; i < D; i++) {
      for (let j = 0; j < D; j++) {
        if (i === j) continue;
        if (Math.abs(opt.W[i][j]) > threshold) {
          const key = `${i}-${j}`;
          curEdgeSet.add(key);
          const isTrue = TRUE_SET.has(key);
          if (!prevEdgeSet.has(key) && !isTrue) {
            flashMap.set(key, 12);
          }
        }
      }
    }
    for (const [a, b] of TRUE_EDGES) {
      const key = `${a}-${b}`;
      if (curEdgeSet.has(key) && !prevEdgeSet.has(key)) {
        nodeGlows[b].set(1);
      }
    }
    prevEdgeSet = curEdgeSet;
    iterLabel.textContent = `step ${opt.stepCount}  ·  N=${N}`;
  }

  function doReset() {
    opt.reset();
    playing = false;
    updatePlayBtn();
    hSpring.snap(0);
    lossSpring.snap(0);
    shdSpring.snap(0);
    flashMap.clear();
    prevEdgeSet = new Set();
    nodeGlows.forEach(sp => sp.snap(0));
    chal.setState(false);
    iterLabel.textContent = `step 0  ·  N=${N}`;
  }

  // ── Animation loop
  const stop = onFrame((dt) => {
    if (playing) {
      for (let k = 0; k < STEPS_PER_FRAME; k++) doStep();
    }

    hSpring.step(dt);
    lossSpring.step(dt);
    shdSpring.step(dt);
    nodeGlows.forEach(sp => sp.step(dt));

    for (const [key, ttl] of flashMap) {
      if (ttl <= 0) flashMap.delete(key);
      else flashMap.set(key, ttl - 1);
    }

    const shd = computeSHD(opt.W, threshold);
    shdSpring.set(shd);
    const hVal = hSpring.value;

    // Update readouts
    rH.set(hVal < 0.001 ? "≈ 0" : hVal.toFixed(4), hVal < 0.01 ? "acyclic!" : "not yet a DAG");
    rH.querySelector(".readout-value").style.color = hVal < 0.01 ? "var(--pos)" : "var(--treat)";
    rLoss.set(lossSpring.value.toFixed(4), `step ${opt.stepCount}`);
    rSHD.set(String(shd), shd <= 8 ? (shd === 0 ? "perfect!" : "great recovery!") : `${shd} edge(s) wrong`);
    rSHD.querySelector(".readout-value").style.color = shd <= 8 ? "var(--pos)" : "var(--gold)";
    rRho.set(opt.rho < 100 ? opt.rho.toFixed(2) : opt.rho.toExponential(1), `α=${opt.alpha.toFixed(3)}`);

    // Challenge: acyclic AND SHD ≤ 8
    if (hVal < 0.01 && shd <= 8) {
      chal.setState(true, `h=${hVal.toFixed(4)}, SHD=${shd} — consensus network well-recovered!`);
    } else {
      chal.setState(false);
    }

    drawHeatmap(hmCv, opt.W, threshold);
    buildGraphSVG(grSvg, opt.W, threshold, flashMap, nodeGlows.map(sp => sp.value));
    drawMiniChart(chartCv, opt.lossHistory, opt.hHistory);
  });

  return () => { stop(); };
}
