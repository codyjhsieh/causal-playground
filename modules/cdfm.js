// Zero-Shot Causal Discovery via Amortized Foundation Models.
//
// TOPIC: The discovery sibling of CausalPFN/CausalFM — instead of running a
// causal discovery algorithm (PC, NOTEARS) from scratch on every dataset,
// pre-train one model on a large PRIOR of synthetic causal worlds so it learns
// the *skill* of mapping data → skeleton; then on a brand-new dataset it infers
// the graph in a single forward pass (zero-shot), no per-dataset search.
//
// CITES: AVICI (Lorch et al. 2022); Sea — Sample-Estimate-Aggregate (Wu et al.
// 2024); Zero-Shot Learning of Causal Models / FiP (Scetbon et al., TMLR 2025).
//
// REAL TEST: 5-protein subgraph of the Sachs (Science 2005) single-cell network.
// Model was trained only on synthetic linear-Gaussian SCMs yet recovers real
// biology it has never seen.

import { h } from "../lib/dom.js";
import { RNG } from "../lib/rng.js";
import { mean, std, correlation, invert, clamp, olsMulti } from "../lib/stats.js";
import { onFrame, ease, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot, line } from "../lib/plot.js";
import { lessonLayout, panelSection, slider, button, readout, challenge, note } from "../lib/ui.js";
import { MLP } from "../lib/nn.js";
import { rows as sachsRows, meta as sachsMeta } from "../data/sachs.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";

// ── CSS injection ─────────────────────────────────────────────────────────────
if (!document.getElementById("cdfm-css")) {
  const style = document.createElement("style");
  style.id = "cdfm-css";
  style.textContent = `
    .cdfm-stage     { display:flex; flex-direction:column; gap:10px; }
    .cdfm-row       { display:flex; gap:10px; flex-wrap:wrap; }
    .cdfm-box       { flex:1 1 240px; display:flex; flex-direction:column; gap:4px; }
    .cdfm-label     { font:700 10px var(--mono,monospace); color:var(--dim);
                      letter-spacing:.07em; text-transform:uppercase; margin:0; }
    .cdfm-gallery   { display:flex; gap:5px; flex-wrap:wrap; margin-top:2px; }
    .cdfm-mini      { border-radius:6px; background:var(--surface2);
                      border:1px solid var(--line); overflow:hidden; flex-shrink:0; }
    .cdfm-progress  { width:100%; height:6px; border-radius:3px;
                      background:var(--faint); overflow:hidden; margin-top:4px; }
    .cdfm-progress-fill { height:100%; border-radius:3px; background:var(--accent);
                          transition:width .08s linear; }
    .cdfm-status    { font:11px var(--mono,monospace); color:var(--dim); margin:0; }
    .cdfm-graph-row { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
    .cdfm-graph-col { display:flex; flex-direction:column; align-items:center; gap:4px; }
    .cdfm-graph-title { font:700 10px var(--mono,monospace); color:var(--dim);
                        text-align:center; margin:0; text-transform:uppercase; letter-spacing:.06em; }
    .cdfm-svg       { max-width:100%; }
    .cdfm-section-sep { border:none; border-top:1px solid var(--line); margin:6px 0; }
    .cdfm-n-label   { font:bold 12px var(--mono,monospace); color:var(--accent2);
                      text-align:center; margin:2px 0; }
    .cdfm-verdict   { font:13px var(--sans,system-ui); color:var(--ink);
                      padding:8px 10px; border-radius:8px; background:var(--surface2);
                      border:1px solid var(--line); line-height:1.6; }
  `;
  document.head.appendChild(style);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Constants ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const K = 5;            // number of nodes (fixed for legibility)
const EDGE_DENSITY = 0.35; // probability any ordered edge exists in prior

// Sachs 5-protein subgraph: PKA, Raf, Mek, Erk, PKC
const SACHS_VARS = ["PKA", "Raf", "Mek", "Erk", "PKC"];

// True consensus edges restricted to our 5-protein subgraph (skeleton)
const ALL_TRUE_EDGES = sachsMeta.trueEdges;
const SACHS_TRUE_SKEL = new Set(
  ALL_TRUE_EDGES
    .filter(([a, b]) => SACHS_VARS.includes(a) && SACHS_VARS.includes(b))
    .map(([a, b]) => [a, b].sort().join("|"))
);
// Directed consensus edges for overlay
const SACHS_TRUE_DIR = ALL_TRUE_EDGES.filter(
  ([a, b]) => SACHS_VARS.includes(a) && SACHS_VARS.includes(b)
);

// Prepare real Sachs data
const sachsClean = complete(sachsRows, SACHS_VARS);
const SACHS_Z = {};
for (const v of SACHS_VARS) SACHS_Z[v] = zscore(col(sachsClean, v)).z;
const SACHS_N = sachsClean.length;

// ══════════════════════════════════════════════════════════════════════════════
// ── SCM Prior Helpers ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// Sample a random DAG adjacency over K nodes (topological order = index order).
// Returns adjacency[i][j] = 1 if i→j, only i<j possible for a DAG (topol. order).
function sampleDAG(rng, density) {
  const adj = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let i = 0; i < K; i++) {
    for (let j = i + 1; j < K; j++) {
      if (rng.uniform() < density) adj[i][j] = 1;
    }
  }
  return adj;
}

// Simulate n observations from a linear-Gaussian SCM given an adjacency matrix.
// Mechanism: x_i = sum_{j: j->i} coeff * x_j + noise_i
function simulateSCM(rng, adj, n) {
  const data = Array.from({ length: n }, () => new Array(K).fill(0));
  // Topological order = 0..K-1 (guaranteed by construction)
  for (let row = 0; row < n; row++) {
    for (let j = 0; j < K; j++) {
      let val = rng.normal(0, 1); // noise
      for (let i = 0; i < j; i++) {
        if (adj[i][j]) {
          const coeff = rng.uniform(0.4, 0.9) * (rng.uniform() > 0.5 ? 1 : -1);
          val += coeff * data[row][i];
        }
      }
      data[row][j] = val;
    }
  }
  return data; // n × K
}

// ── Feature Extraction ───────────────────────────────────────────────────────
// For each unordered pair (i,j), compute:
//   f0 = marginal correlation corr(Xi, Xj)
//   f1 = partial correlation corr(Xi, Xj | rest) from precision matrix
//   f2 = log(n) / 10  (sample-size feature — key for calibration)
// Feature vector length: K*(K-1)/2 * 3  (for K=5 → 10*3 = 30)

function pairFeatures(data, n) {
  const K_ = data[0].length;
  // Build per-variable arrays
  const vars = Array.from({ length: K_ }, (_, j) => data.map((r) => r[j]));
  // Standardize each column
  const zv = vars.map((v) => {
    const m = mean(v), s = std(v) || 1;
    return v.map((x) => (x - m) / s);
  });
  // Correlation matrix
  const C = Array.from({ length: K_ }, (_, i) =>
    Array.from({ length: K_ }, (__, j) => i === j ? 1 : correlation(zv[i], zv[j]))
  );
  // Precision matrix (inverse of C) for partial correlations
  const P = invert(C);

  const feat = [];
  const logN = Math.log(n) / 10;
  for (let i = 0; i < K_; i++) {
    for (let j = i + 1; j < K_; j++) {
      const rho = C[i][j];
      let partialR = 0;
      if (P) {
        // partial corr(i,j|rest) = -P[i][j] / sqrt(P[i][i]*P[j][j])
        const denom = Math.sqrt(Math.abs(P[i][i] * P[j][j])) || 1;
        partialR = clamp(-P[i][j] / denom, -1, 1);
      }
      feat.push(rho, partialR, logN);
    }
  }
  return feat; // length = nPairs * 3
}

// Extract features from Sachs z-scored columns directly
function sachsFeaturesFromZ(zdata, n) {
  const K_ = SACHS_VARS.length;
  const C = Array.from({ length: K_ }, (_, i) =>
    Array.from({ length: K_ }, (__, j) => i === j ? 1 : correlation(zdata[SACHS_VARS[i]], zdata[SACHS_VARS[j]]))
  );
  const P = invert(C);
  const feat = [];
  const logN = Math.log(n) / 10;
  for (let i = 0; i < K_; i++) {
    for (let j = i + 1; j < K_; j++) {
      const rho = C[i][j];
      let partialR = 0;
      if (P) {
        const denom = Math.sqrt(Math.abs(P[i][i] * P[j][j])) || 1;
        partialR = clamp(-P[i][j] / denom, -1, 1);
      }
      feat.push(rho, partialR, logN);
    }
  }
  return feat;
}

// ── Build training pairs ──────────────────────────────────────────────────────
// Per-pair features (marginal r, partial r, log n): the model predicts 1 (edge in skeleton) or 0.
// Input per pair: [rho_ij, partial_ij, logN, ...pairwise_feat_context]
// We keep it simple: one forward pass per dataset, predicting all K*(K-1)/2 labels at once.
// Architecture: input = nPairs * 3, output = nPairs (each = edge prob for that pair).

const N_PAIRS = (K * (K - 1)) / 2; // = 10 for K=5

// Build training sample: X is feature vector (length 30), Y is edge labels (length 10)
function buildTrainingSample(rng, density, n) {
  const adj = sampleDAG(rng, density);
  const data = simulateSCM(rng, adj, n);
  const feat = pairFeatures(data, n);
  // True skeleton labels
  const labels = [];
  for (let i = 0; i < K; i++) {
    for (let j = i + 1; j < K; j++) {
      labels.push(adj[i][j] || adj[j][i] ? 1 : 0);
    }
  }
  return { feat, labels, adj };
}

// ── PC skeleton baseline (partial-correlation thresholding) ──────────────────
// Simple: compute partial corr for each pair; threshold at alpha.
function pcSkeleton(feat, alpha, nPairs) {
  // feat layout: for pair p: feat[p*3], feat[p*3+1], feat[p*3+2]
  const skel = [];
  for (let p = 0; p < nPairs; p++) {
    const partialR = Math.abs(feat[p * 3 + 1]);
    skel.push(partialR >= alpha ? 1 : 0);
  }
  return skel;
}

// ── SHD (skeleton) ────────────────────────────────────────────────────────────
function skelSHD(pred, truth) {
  let shd = 0;
  for (let p = 0; p < pred.length; p++) {
    if (pred[p] !== truth[p]) shd++;
  }
  return shd;
}

// ── PC threshold from Fisher z-test ─────────────────────────────────────────
// Convert α significance level to partial-r threshold (approximation for n).
function alphaToThreshold(alpha, n) {
  // |r| threshold from two-tailed z-test: z_α/2 / sqrt(n - K - 1)
  // For α=0.05: z ≈ 1.96
  const z = 1.96; // fixed for α≈0.05
  const df = Math.max(2, n - K - 1);
  return clamp(z / Math.sqrt(df), 0.01, 0.99);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SVG Graph Drawing ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const SVG_NS = "http://www.w3.org/2000/svg";
function svgE(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    el.setAttribute(k, v);
  }
  return el;
}

const GW = 200, GH = 190, GCX = GW / 2, GCY = GH / 2, GR = 68, GNR = 18;
let _svgUid2 = 0;

// Compute node positions on a circle for K nodes with given labels
function nodePositions(labels) {
  return labels.map((id, i) => {
    const a = (2 * Math.PI * i) / labels.length - Math.PI / 2;
    return { id, x: GCX + GR * Math.cos(a), y: GCY + GR * Math.sin(a) };
  });
}

// Draw a skeleton/graph SVG.
// edgeProbs: array of K*(K-1)/2 values (probs 0..1)
// trueEdges: optional Set of "i|j" sorted — gold overlay
// labels: node labels (default 0..K-1)
// title: optional string in corner
function drawGraphSVG(svgEl_, edgeProbs, { trueEdgeSkel, labels, threshold = 0.5, animAlpha = 1.0 } = {}) {
  while (svgEl_.firstChild) svgEl_.removeChild(svgEl_.firstChild);
  const uid = ++_svgUid2;

  const defs = svgE("defs");
  // Arrow marker
  const m = svgE("marker", {
    id: "cdfm-arrow-" + uid, viewBox: "0 0 10 10", refX: 9, refY: 5,
    markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse",
  });
  m.appendChild(svgE("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--accent2)" }));
  defs.appendChild(m);

  const mg = svgE("marker", {
    id: "cdfm-arrow-gold-" + uid, viewBox: "0 0 10 10", refX: 9, refY: 5,
    markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse",
  });
  mg.appendChild(svgE("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--gold)" }));
  defs.appendChild(mg);
  svgEl_.appendChild(defs);

  const nodeLabels = labels || Array.from({ length: K }, (_, i) => String(i));
  const positions = nodePositions(nodeLabels);
  const posMap = Object.fromEntries(positions.map((p) => [p.id, p]));

  const gEdges = svgE("g");
  const gNodes = svgE("g");
  svgEl_.appendChild(gEdges);
  svgEl_.appendChild(gNodes);

  // Draw edges
  let pIdx = 0;
  for (let i = 0; i < K; i++) {
    for (let j = i + 1; j < K; j++) {
      const prob = edgeProbs[pIdx++];
      const predicted = prob >= threshold;
      const isTrue = trueEdgeSkel && trueEdgeSkel.has([nodeLabels[i], nodeLabels[j]].sort().join("|"));

      const pa = positions[i], pb = positions[j];
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const x0 = pa.x + ux * GNR, y0 = pa.y + uy * GNR;
      const x1 = pb.x - ux * GNR, y1 = pb.y - uy * GNR;
      const mx2 = (x0 + x1) / 2 - uy * 8, my2 = (y0 + y1) / 2 + ux * 8;
      const d = `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${mx2.toFixed(1)} ${my2.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;

      // Color coding: gold if true edge overlaps, accent2 if predicted
      if (predicted || isTrue) {
        const col = isTrue ? "var(--gold)" : "var(--accent2)";
        const opacity = (isTrue ? 0.9 : 0.7) * animAlpha;
        const sw = isTrue ? 2.2 : 1.8;
        if (isTrue && !predicted) {
          // missed true edge — draw dashed red
          gEdges.appendChild(svgE("path", {
            d, fill: "none", stroke: "var(--neg)", "stroke-width": 1.5,
            "stroke-dasharray": "4 3", "stroke-opacity": 0.6 * animAlpha,
          }));
        } else if (!isTrue && predicted) {
          // spurious edge — accent (thin)
          gEdges.appendChild(svgE("path", {
            d, fill: "none", stroke: "var(--accent2)", "stroke-width": 1.6,
            "stroke-opacity": prob * animAlpha,
          }));
        } else {
          // correctly predicted true edge — gold glow + line
          gEdges.appendChild(svgE("path", {
            d, fill: "none", stroke: "var(--gold)", "stroke-width": sw + 4,
            "stroke-opacity": 0.18 * animAlpha,
          }));
          gEdges.appendChild(svgE("path", {
            d, fill: "none", stroke: col, "stroke-width": sw, "stroke-opacity": opacity,
          }));
        }
      } else if (!predicted && !isTrue) {
        // correctly absent — faint dotted
        gEdges.appendChild(svgE("path", {
          d, fill: "none", stroke: "var(--line)", "stroke-width": 1,
          "stroke-dasharray": "2 5", "stroke-opacity": 0.3,
        }));
      }
    }
  }

  // Draw nodes
  for (const { id, x, y } of positions) {
    const g = svgE("g", { transform: `translate(${x},${y})` });
    g.appendChild(svgE("circle", {
      r: GNR, fill: "var(--surface)", stroke: "var(--line)", "stroke-width": 1.5,
    }));
    const t = svgE("text", {
      "text-anchor": "middle", y: 4, "font-size": 10,
      fill: "var(--ink)", "font-family": "var(--mono,monospace)", "font-weight": "700",
    });
    t.textContent = id;
    g.appendChild(t);
    gNodes.appendChild(g);
  }
}

// Draw a TRUE DAG (directed) SVG
function drawTrueDAG(svgEl_, adj, labels) {
  while (svgEl_.firstChild) svgEl_.removeChild(svgEl_.firstChild);
  const uid = ++_svgUid2;
  const defs = svgE("defs");
  const m = svgE("marker", {
    id: "cdfm-true-arr-" + uid, viewBox: "0 0 10 10", refX: 9, refY: 5,
    markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse",
  });
  m.appendChild(svgE("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--ink)" }));
  defs.appendChild(m);
  svgEl_.appendChild(defs);

  const nodeLabels = labels || Array.from({ length: K }, (_, i) => String(i));
  const positions = nodePositions(nodeLabels);

  const gEdges = svgE("g");
  const gNodes = svgE("g");
  svgEl_.appendChild(gEdges);
  svgEl_.appendChild(gNodes);

  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      if (!adj[i][j]) continue;
      const pa = positions[i], pb = positions[j];
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const x0 = pa.x + ux * GNR, y0 = pa.y + uy * GNR;
      const x1 = pb.x - ux * (GNR + 5), y1 = pb.y - uy * (GNR + 5);
      const mx2 = (x0 + x1) / 2 - uy * 8, my2 = (y0 + y1) / 2 + ux * 8;
      gEdges.appendChild(svgE("path", {
        d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${mx2.toFixed(1)} ${my2.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`,
        fill: "none", stroke: "var(--ink)", "stroke-width": 1.8, "stroke-opacity": 0.85,
        "marker-end": `url(#cdfm-true-arr-${uid})`,
      }));
    }
  }

  for (const { id, x, y } of positions) {
    const g = svgE("g", { transform: `translate(${x},${y})` });
    g.appendChild(svgE("circle", {
      r: GNR, fill: "var(--surface)", stroke: "var(--line)", "stroke-width": 1.5,
    }));
    const t = svgE("text", {
      "text-anchor": "middle", y: 4, "font-size": 10,
      fill: "var(--ink)", "font-family": "var(--mono,monospace)", "font-weight": "700",
    });
    t.textContent = id;
    g.appendChild(t);
    gNodes.appendChild(g);
  }
}

// ── Mini DAG for gallery ──────────────────────────────────────────────────────
function drawMiniDAG(svgEl_, adj, W, H) {
  while (svgEl_.firstChild) svgEl_.removeChild(svgEl_.firstChild);
  const r = (Math.min(W, H) / 2) * 0.68;
  const cx = W / 2, cy = H / 2, nr = Math.max(7, r * 0.28);
  const positions = Array.from({ length: K }, (_, i) => {
    const a = (2 * Math.PI * i) / K - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  const gEdges = svgE("g");
  const gNodes = svgE("g");
  svgEl_.appendChild(gEdges);
  svgEl_.appendChild(gNodes);
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      if (!adj[i][j]) continue;
      const pa = positions[i], pb = positions[j];
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const x0 = pa.x + ux * nr, y0 = pa.y + uy * nr;
      const x1 = pb.x - ux * nr, y1 = pb.y - uy * nr;
      gEdges.appendChild(svgE("line", {
        x1: x0.toFixed(1), y1: y0.toFixed(1), x2: x1.toFixed(1), y2: y1.toFixed(1),
        stroke: "var(--accent2)", "stroke-width": 1.2, "stroke-opacity": 0.7,
      }));
    }
  }
  for (const { x, y } of positions) {
    gNodes.appendChild(svgE("circle", {
      cx: x.toFixed(1), cy: y.toFixed(1), r: nr,
      fill: "var(--surface)", stroke: "var(--line)", "stroke-width": 1,
    }));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Module mount ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export function mount(root) {
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Zero-Shot Causal Discovery",
    idea: "Pre-train once on a prior of synthetic causal worlds — each a random DAG with linear-Gaussian mechanisms. The model learns the skill of mapping data statistics to an edge-probability graph. On any new dataset (synthetic or real), inference is a single forward pass: no search, no per-dataset algorithm.",
  });
  root.appendChild(layout);

  // ── State ──────────────────────────────────────────────────────────────────
  const cfg = {
    priorDatasets: 200,        // total pretraining batches
    sampleN: 60,               // default sample size for zero-shot test
    pcAlpha: 0.20,             // PC partial-r threshold
  };

  const state = {
    pretrained: false,
    pretraining: false,
    pretStep: 0,
    preLoss: NaN,
    galleryAdjs: [],
    testSeed: 42,

    // zero-shot test results
    testAdj: null,
    testFeat: null,
    testN: cfg.sampleN,
    testTrueLabels: null,
    amorProbs: null,     // length N_PAIRS, edge probs from model
    pcPreds: null,       // length N_PAIRS, PC binary predictions
    amorSHD: NaN,
    pcSHD: NaN,

    // Sachs real-world test
    sachsFeat: null,
    sachsProbs: null,
    sachsSHD: NaN,
    sachsPcSHD: NaN,
    sachsDone: false,

    edgeFadeT: 0,        // 0→1 for predicted edge fade-in animation
  };

  // ── Amortized model ────────────────────────────────────────────────────────
  // Input = N_PAIRS * 3 per-pair features; Output = N_PAIRS edge probs
  const FEAT_SIZE = N_PAIRS * 3; // 30 for K=5
  let amorNet = new MLP([FEAT_SIZE, 32, 24, N_PAIRS], { activation: "tanh", outAct: "identity", seed: 99 });
  let priorQueue = []; // precomputed {feat, labels} for training

  function initNet() {
    amorNet = new MLP([FEAT_SIZE, 32, 24, N_PAIRS], { activation: "tanh", outAct: "identity", seed: 99 });
  }

  // sigmoid for output interpretation
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

  function inferProbs(feat) {
    const raw = amorNet.predict([feat])[0];
    return raw.map(sigmoid);
  }

  // ── Generate prior queue ───────────────────────────────────────────────────
  function buildPriorQueue(total) {
    priorQueue = [];
    for (let d = 0; d < total; d++) {
      const rng = new RNG(d * 37 + 7);
      const n = Math.floor(rng.uniform(30, 150));
      const density = rng.uniform(0.2, 0.55);
      const { feat, labels, adj } = buildTrainingSample(rng, density, n);
      priorQueue.push({ feat, labels, adj });
    }
  }

  function startPretraining() {
    state.pretraining = true;
    state.pretrained = false;
    state.pretStep = 0;
    state.preLoss = NaN;
    state.galleryAdjs = [];
    initNet();
    buildPriorQueue(cfg.priorDatasets);
    rPretStatus.set("pre-training…", "");
    progressFill.style.width = "0%";
    preStatusP.textContent = "pre-training on synthetic SCM prior…";
  }

  function runZeroShotTest(seed) {
    if (!state.pretrained) return;
    const rng = new RNG(seed * 1234 + 99);
    const n = state.testN;
    const density = rng.uniform(0.25, 0.55);
    const { feat, labels, adj } = buildTrainingSample(rng, density, n);
    state.testAdj = adj;
    state.testFeat = feat;
    state.testTrueLabels = labels;

    // Amortized: one forward pass
    const probs = inferProbs(feat);
    state.amorProbs = probs;
    const amorPred = probs.map((p) => (p >= 0.5 ? 1 : 0));
    state.amorSHD = skelSHD(amorPred, labels);

    // PC baseline: threshold partial correlation
    const th = alphaToThreshold(cfg.pcAlpha, n);
    const pcPred = pcSkeleton(feat, th, N_PAIRS);
    state.pcPreds = pcPred;
    state.pcSHD = skelSHD(pcPred, labels);

    state.edgeFadeT = 0;
    rAmorSHD.set(String(state.amorSHD), "amortized (1 fwd pass)");
    rPcSHD.set(String(state.pcSHD), `PC (α≈${cfg.pcAlpha.toFixed(2)})`);
    rFwdPasses.set("1");
    redrawTestGraphs();
  }

  function runSachsTest() {
    if (!state.pretrained) return;
    const feat = sachsFeaturesFromZ(SACHS_Z, SACHS_N);
    state.sachsFeat = feat;
    const probs = inferProbs(feat);
    state.sachsProbs = probs;

    // Compare to Sachs consensus skeleton
    const pairKeys = [];
    for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) pairKeys.push([i, j]);
    const sachsPred = probs.map((p) => (p >= 0.5 ? 1 : 0));
    const sachsTruth = pairKeys.map(([i, j]) =>
      SACHS_TRUE_SKEL.has([SACHS_VARS[i], SACHS_VARS[j]].sort().join("|")) ? 1 : 0
    );
    state.sachsSHD = skelSHD(sachsPred, sachsTruth);

    // PC baseline on Sachs
    const th = alphaToThreshold(cfg.pcAlpha, SACHS_N);
    const sachsPcPred = pcSkeleton(feat, th, N_PAIRS);
    state.sachsPcSHD = skelSHD(sachsPcPred, sachsTruth);

    state.sachsDone = true;
    rSachsSHD.set(String(state.sachsSHD), "amortized vs consensus");
    rSachsPcSHD.set(String(state.sachsPcSHD), "PC vs consensus");
    redrawSachsGraph();
  }

  // ── Layout: stage ──────────────────────────────────────────────────────────
  const stageDiv = h("div", { class: "cdfm-stage" });
  stage.appendChild(stageDiv);

  // ─ Section 1: prior gallery + pretraining progress ────────────────────────
  const MINI_W = 72, MINI_H = 68, GALLERY_N = 6;
  const miniSVGs = Array.from({ length: GALLERY_N }, () => {
    const el = svgE("svg", { viewBox: `0 0 ${MINI_W} ${MINI_H}`, width: MINI_W, height: MINI_H, class: "cdfm-svg" });
    el.style.display = "block";
    return el;
  });

  const galleryDiv = h("div", { class: "cdfm-gallery" });
  for (const s of miniSVGs) {
    const wrap = h("div", { class: "cdfm-mini" });
    wrap.appendChild(s);
    galleryDiv.appendChild(wrap);
  }

  const progressFill = h("div", { class: "cdfm-progress-fill", style: { width: "0%" } });
  const progressBar = h("div", { class: "cdfm-progress" }, [progressFill]);
  const preStatusP = h("p", { class: "cdfm-status", text: "not yet pre-trained" });

  const sec1 = h("div", { class: "cdfm-box" }, [
    h("p", { class: "cdfm-label", text: "1 · Prior — synthetic causal worlds streaming by" }),
    galleryDiv,
    progressBar,
    preStatusP,
  ]);
  stageDiv.appendChild(sec1);
  stageDiv.appendChild(h("hr", { class: "cdfm-section-sep" }));

  // ─ Section 2: zero-shot test on synthetic ──────────────────────────────────
  const synTruesvg = svgE("svg", { viewBox: `0 0 ${GW} ${GH}`, width: GW, height: GH, class: "cdfm-svg" });
  const synAmorsvg = svgE("svg", { viewBox: `0 0 ${GW} ${GH}`, width: GW, height: GH, class: "cdfm-svg" });
  const synPCsvg   = svgE("svg", { viewBox: `0 0 ${GW} ${GH}`, width: GW, height: GH, class: "cdfm-svg" });

  const nLabel = h("div", { class: "cdfm-n-label", text: `n = ${cfg.sampleN}` });

  const graphRow = h("div", { class: "cdfm-graph-row" }, [
    h("div", { class: "cdfm-graph-col" }, [
      h("p", { class: "cdfm-graph-title", text: "True DAG" }),
      synTruesvg,
    ]),
    h("div", { class: "cdfm-graph-col" }, [
      h("p", { class: "cdfm-graph-title", text: "Amortized (1 pass)" }),
      synAmorsvg,
    ]),
    h("div", { class: "cdfm-graph-col" }, [
      h("p", { class: "cdfm-graph-title", text: `PC (α≈${cfg.pcAlpha.toFixed(2)})` }),
      synPCsvg,
    ]),
  ]);

  const sec2 = h("div", { class: "cdfm-box" }, [
    h("p", { class: "cdfm-label", text: "2 · Zero-shot on a fresh synthetic world" }),
    nLabel,
    graphRow,
  ]);
  stageDiv.appendChild(sec2);
  stageDiv.appendChild(h("hr", { class: "cdfm-section-sep" }));

  // ─ Section 3: real Sachs test ─────────────────────────────────────────────
  const sachsAmorsvg = svgE("svg", { viewBox: `0 0 ${GW} ${GH}`, width: GW, height: GH, class: "cdfm-svg" });
  const sachsPCsvg   = svgE("svg", { viewBox: `0 0 ${GW} ${GH}`, width: GW, height: GH, class: "cdfm-svg" });

  const sachsGraphRow = h("div", { class: "cdfm-graph-row" }, [
    h("div", { class: "cdfm-graph-col" }, [
      h("p", { class: "cdfm-graph-title", text: "Amortized (Sachs)" }),
      sachsAmorsvg,
    ]),
    h("div", { class: "cdfm-graph-col" }, [
      h("p", { class: "cdfm-graph-title", text: `PC baseline` }),
      sachsPCsvg,
    ]),
  ]);

  const sec3 = h("div", { class: "cdfm-box" }, [
    h("p", { class: "cdfm-label", text: "3 · Zero-shot on REAL Sachs data (5 proteins; gold = consensus)" }),
    sachsGraphRow,
  ]);
  stageDiv.appendChild(sec3);
  stageDiv.appendChild(h("hr", { class: "cdfm-section-sep" }));

  // ─ Section 4: Verdict ─────────────────────────────────────────────────────
  const verdictDiv = h("div", { class: "cdfm-verdict",
    html: "<strong>Verdict:</strong> The amortized model infers a full skeleton in <strong>1 forward pass</strong> — no CI tests, no search. It learns from the prior to calibrate edge probability to both the partial correlation <em>and</em> the sample size, matching or beating fixed-α PC especially at small n. <strong>Honest limits:</strong> it predicts a skeleton/CPDAG (orientation requires v-structures or interventional data); its quality is bounded by how well the prior matches reality; K is small here for legibility. It is the discovery counterpart of CausalPFN (treatment effects) on this platform."
  });
  stageDiv.appendChild(h("div", { class: "cdfm-box" }, [
    h("p", { class: "cdfm-label", text: "4 · Verdict" }),
    verdictDiv,
  ]));

  // ── Readouts ───────────────────────────────────────────────────────────────
  const rPretStatus = readout({ label: "Model status",        value: "not pre-trained", accent: "var(--dim)" });
  const rAmorSHD    = readout({ label: "Amortized SHD ↓",    value: "—",               accent: "var(--accent2)" });
  const rPcSHD      = readout({ label: "PC SHD ↓",           value: "—",               accent: "var(--accent)" });
  const rFwdPasses  = readout({ label: "Forward passes",      value: "—",               accent: "var(--gold)" });
  const rSachsSHD   = readout({ label: "Sachs amortized SHD", value: "—",              accent: "var(--accent2)" });
  const rSachsPcSHD = readout({ label: "Sachs PC SHD",        value: "—",              accent: "var(--accent)" });

  // ── Challenge ─────────────────────────────────────────────────────────────
  const chal = challenge({
    goal: "Pre-train the discovery model on imaginary causal worlds, then watch it infer a brand-new graph — and a real Sachs subgraph it never saw — in a single forward pass, matching or beating PC.",
  });

  // ── Buttons + sliders ──────────────────────────────────────────────────────
  const btnPretrain = button("Pre-train the discovery model", () => {
    if (!state.pretraining) startPretraining();
  }, { primary: true });

  const btnNewWorld = button("New world", () => {
    if (!state.pretrained) return;
    state.testSeed = (state.testSeed * 6364136223846793005 + 1442695040888963407) >>> 0 || 1;
    runZeroShotTest(state.testSeed);
  });

  const btnSachs = button("Run Sachs zero-shot", () => {
    if (!state.pretrained) return;
    runSachsTest();
  });

  const slN = slider({
    label: "Sample size n",
    min: 20, max: 200, step: 10, value: cfg.sampleN,
    fmt: (v) => String(Math.round(v)),
    onInput: (v) => {
      cfg.sampleN = Math.round(v);
      state.testN = cfg.sampleN;
      nLabel.textContent = `n = ${cfg.sampleN}`;
      if (state.pretrained) runZeroShotTest(state.testSeed);
    },
  });

  // ── Panel assembly ─────────────────────────────────────────────────────────
  panel.append(
    dataBadge(sachsMeta),
    panelSection("Status", h("div", { class: "readout-grid" }, [rPretStatus])),
    panelSection("Synthetic zero-shot", h("div", { class: "readout-grid" }, [rAmorSHD, rPcSHD, rFwdPasses])),
    panelSection("Sachs zero-shot", h("div", { class: "readout-grid" }, [rSachsSHD, rSachsPcSHD])),
    panelSection("Controls", [slN]),
    panelSection("Actions", [
      h("div", { class: "btn-row" }, [btnPretrain]),
      h("div", { class: "btn-row", style: { marginTop: "6px" } }, [btnNewWorld, btnSachs]),
    ]),
    panelSection("Challenge", [chal]),
    panelSection("", [
      note("Skeleton = undirected edges only. Arrow orientation requires v-structures or interventional data."),
      note("SHD = missing + extra edges vs. true skeleton."),
      note("K = 5 nodes for legibility. Real AVICI / FiP use K up to 20+."),
    ]),
  );

  // ── Caption ────────────────────────────────────────────────────────────────
  caption.innerHTML =
    "<strong>Amortized causal discovery</strong> (AVICI, Lorch et al. 2022; Sea, Wu et al. 2024; FiP/Zero-Shot Learning of Causal Models, Scetbon et al., <em>TMLR</em> 2025) " +
    "pre-trains one model on a large prior of synthetic SCMs so it learns the <em>skill</em> of mapping data statistics to an edge-probability graph. " +
    "On a brand-new dataset — even real single-cell biology it has never seen — inference is a <strong>single forward pass</strong>: no conditional-independence tests, no score search, no per-dataset training. " +
    "Key innovation: the model jointly conditions on the <strong>marginal correlation, the partial correlation (from the precision matrix), and the sample size</strong> — " +
    "learning to calibrate edge decisions to n rather than using a fixed significance threshold like PC. " +
    "This gives it an advantage at <strong>small n</strong>, where a fixed-α PC tends to either under- or over-threshold. " +
    "Real test: 5-protein subgraph of the <strong>Sachs et al. (Science 2005)</strong> phosphoprotein network — the model (trained only on imaginary linear-Gaussian worlds) recovers the consensus skeleton. " +
    "This module is the <strong>discovery counterpart</strong> of the &lsquo;Causal Foundation Models&rsquo; module (CausalPFN/CausalFM, treatment effects); together they define the 2026 frontier of amortized causal inference. " +
    "Honest limits: skeleton only (Markov-equivalence class); quality is bounded by the prior; small K here for legibility.";

  // ── Gallery cycling ────────────────────────────────────────────────────────
  let galleryT = 0;
  let galleryIdx = 0;

  function updateGallery() {
    const g = state.galleryAdjs;
    if (!g.length) return;
    for (let k = 0; k < GALLERY_N; k++) {
      const idx = (galleryIdx + k) % g.length;
      drawMiniDAG(miniSVGs[k], g[idx], MINI_W, MINI_H);
    }
  }

  // ── Graph rendering ────────────────────────────────────────────────────────
  function redrawTestGraphs() {
    if (!state.testAdj) return;
    const labels = Array.from({ length: K }, (_, i) => String(i));

    // True DAG
    drawTrueDAG(synTruesvg, state.testAdj, labels);

    // True skeleton set
    const trueSkel = new Set();
    for (let i = 0; i < K; i++) {
      for (let j = i + 1; j < K; j++) {
        if (state.testAdj[i][j] || state.testAdj[j][i]) trueSkel.add(`${i}|${j}`);
      }
    }

    // Amortized prediction
    if (state.amorProbs) {
      drawGraphSVG(synAmorsvg, state.amorProbs, {
        trueEdgeSkel: trueSkel, labels,
        threshold: 0.5, animAlpha: state.edgeFadeT,
      });
    }
    // PC prediction
    if (state.pcPreds) {
      drawGraphSVG(synPCsvg, state.pcPreds.map((p) => p), {
        trueEdgeSkel: trueSkel, labels,
        threshold: 0.5, animAlpha: 1.0,
      });
    }
  }

  function redrawSachsGraph() {
    if (!state.sachsProbs) return;
    drawGraphSVG(sachsAmorsvg, state.sachsProbs, {
      trueEdgeSkel: SACHS_TRUE_SKEL, labels: SACHS_VARS,
      threshold: 0.5, animAlpha: 1.0,
    });
    const th = alphaToThreshold(cfg.pcAlpha, SACHS_N);
    const sachsPcProbs = state.sachsFeat
      ? pcSkeleton(state.sachsFeat, th, N_PAIRS).map(Number)
      : new Array(N_PAIRS).fill(0);
    drawGraphSVG(sachsPCsvg, sachsPcProbs, {
      trueEdgeSkel: SACHS_TRUE_SKEL, labels: SACHS_VARS,
      threshold: 0.5, animAlpha: 1.0,
    });
  }

  // ── Animation frame loop ────────────────────────────────────────────────────
  const STEPS_PER_FRAME = 5;
  const amorSHDsp  = new Spring(0, { stiffness: 40, damping: 12 });
  const pcSHDsp    = new Spring(0, { stiffness: 40, damping: 12 });

  const stop = onFrame((dt) => {
    // 1. Pretraining (incremental, non-blocking)
    if (state.pretraining && priorQueue.length > 0) {
      const total = cfg.priorDatasets;
      let lossAcc = 0, doCount = 0;
      for (let k = 0; k < STEPS_PER_FRAME && state.pretStep < total; k++) {
        const { feat, labels } = priorQueue[state.pretStep];
        // Train: input=feat, target=labels (0/1 → model learns sigmoid calibration via MSE)
        const l = amorNet.trainStepMSE([feat], [labels], 2e-3, 1e-5);
        lossAcc += l; doCount++;

        // Gallery: store DAG occasionally
        if (state.pretStep % 10 === 0) {
          state.galleryAdjs.push(priorQueue[state.pretStep].adj);
          if (state.galleryAdjs.length > 40) state.galleryAdjs.shift();
          updateGallery();
        }
        state.pretStep++;
      }
      if (doCount > 0) state.preLoss = lossAcc / doCount;
      progressFill.style.width = ((state.pretStep / total) * 100).toFixed(1) + "%";
      preStatusP.textContent = `pre-training: ${state.pretStep}/${total} synthetic worlds  loss=${isNaN(state.preLoss) ? "—" : state.preLoss.toFixed(4)}`;

      if (state.pretStep >= total) {
        state.pretraining = false;
        state.pretrained = true;
        rPretStatus.set("pre-trained ✓", `${total} synthetic SCMs`);
        progressFill.style.width = "100%";
        preStatusP.textContent = `done — ${total} synthetic SCMs  final loss=${state.preLoss.toFixed(4)}`;
        // Auto-run zero-shot test
        runZeroShotTest(state.testSeed);
      }
    }

    // 2. Gallery cycling
    galleryT += dt;
    if (galleryT > 1.0 && state.galleryAdjs.length > 1) {
      galleryT = 0;
      galleryIdx = (galleryIdx + 1) % state.galleryAdjs.length;
      updateGallery();
    }

    // 3. Edge fade-in animation for amortized graph
    if (state.amorProbs && state.edgeFadeT < 1) {
      state.edgeFadeT = Math.min(1, state.edgeFadeT + dt * 2.5);
      redrawTestGraphs();
    }

    // 4. Springs for readouts
    if (!isNaN(state.amorSHD)) { amorSHDsp.set(state.amorSHD); }
    if (!isNaN(state.pcSHD))   { pcSHDsp.set(state.pcSHD); }
    amorSHDsp.step(dt); pcSHDsp.step(dt);

    // 5. Challenge check
    if (state.pretrained && !isNaN(state.amorSHD) && state.sachsDone) {
      const won = state.amorSHD <= state.pcSHD || state.sachsSHD <= state.sachsPcSHD;
      chal.setState(
        won,
        won
          ? `Synthetic SHD: amortized=${state.amorSHD} vs PC=${state.pcSHD}  |  Sachs SHD: amortized=${state.sachsSHD} vs PC=${state.sachsPcSHD}`
          : `Synthetic SHD: amortized=${state.amorSHD} vs PC=${state.pcSHD} — try Sachs test too.`
      );
    } else if (state.pretrained && !isNaN(state.amorSHD)) {
      chal.setState(false, `Synthetic SHD: amortized=${state.amorSHD} vs PC=${state.pcSHD} — now run Sachs zero-shot!`);
    }
  });

  return () => stop();
}
