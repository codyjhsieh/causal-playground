// Constraint-Based Causal Discovery: the PC algorithm (Spirtes, Glymour & Scheines 2000).
// Real data: Sachs et al. (2005) single-cell protein-signaling network (Science 2005).
// Start fully connected, delete edges via conditional-independence tests, orient via
// v-structure detection and Meek's propagation rules. Output: CPDAG (compelled arrows
// = identifiable directions; undirected = Markov-equivalence ambiguity).
//
// Skeleton phase: for each adjacent pair (X,Y), test CI given subsets S ⊆ adj(X)\{Y}
// of growing order; |partial r| < α → independent → remove edge, record sep set S.
// Orientation phase: orient unshielded X–Z–Y as collider X→Z←Y when Z ∉ sep(X,Y);
// Meek rules R1–R3 propagate remaining compelled orientations.

import { h, clear } from "../lib/dom.js";
import { onFrame } from "../lib/anim.js";
import { lessonLayout, panelSection, slider, button, readout, challenge, note } from "../lib/ui.js";
import { rows, meta } from "../data/sachs.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";
import { correlation, olsMulti } from "../lib/stats.js";

// ---------------------------------------------------------------------------
// Subset of 7 proteins chosen to give chains, forks, and a collider legibly.
// From the Sachs trueEdges:
//   chain:   PKA → Raf → Mek → Erk
//   fork:    Raf ← PKA → Erk, PKC → Raf
//   collider: Plcg → PIP2 ← PIP3 (within true network context)
// True edges restricted to this subset:
//   PKC→Raf, PKC→Mek, PKA→Raf, PKA→Mek, PKA→Erk, Raf→Mek, Mek→Erk
// This gives observable chain/fork/collider structures with clear SHD.
// ---------------------------------------------------------------------------

const SUB_VARS = ["Raf", "Mek", "Erk", "PKA", "PKC", "Plcg", "PIP2"];

// Consensus true edges restricted to the chosen subset
const ALL_TRUE_EDGES = meta.trueEdges; // [["PKC","Raf"], ...]
const TRUE_EDGES_SUB = ALL_TRUE_EDGES.filter(
  ([a, b]) => SUB_VARS.includes(a) && SUB_VARS.includes(b)
);
// Set for fast lookup
const TRUE_SET = new Set(TRUE_EDGES_SUB.map(([a, b]) => `${a}|${b}`));

// ---------------------------------------------------------------------------
// Data preparation: complete rows, z-score
// ---------------------------------------------------------------------------
const cleanRows = complete(rows, SUB_VARS);
const N = cleanRows.length;
const dataZ = {};
for (const k of SUB_VARS) {
  dataZ[k] = zscore(col(cleanRows, k)).z;
}

// ---------------------------------------------------------------------------
// Partial correlation via OLS residualization (as in corr2cause.js)
// ---------------------------------------------------------------------------
function partialCorr(xName, yName, condSet) {
  const xArr = dataZ[xName];
  const yArr = dataZ[yName];
  if (condSet.length === 0) return correlation(xArr, yArr);
  const zArrs = condSet.map((k) => dataZ[k]);
  const Xmat = [];
  for (let i = 0; i < N; i++) {
    Xmat.push([1, ...zArrs.map((a) => a[i])]);
  }
  function residualize(target) {
    const fit = olsMulti(Xmat, target);
    return target.map((v, i) => {
      let pred = 0;
      for (let j = 0; j < fit.beta.length; j++) pred += Xmat[i][j] * fit.beta[j];
      return v - pred;
    });
  }
  return correlation(residualize(xArr), residualize(yArr));
}

// ---------------------------------------------------------------------------
// Powerset of an array (excluding sets larger than maxSize)
// ---------------------------------------------------------------------------
function powerset(arr, maxSize = Infinity) {
  const out = [[]];
  for (const x of arr) {
    const len = out.length;
    for (let i = 0; i < len; i++) {
      const candidate = [...out[i], x];
      if (candidate.length <= maxSize) out.push(candidate);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// PC Algorithm
// Returns an object describing the full computation:
//   steps: array of step objects for animation
//   skeleton: Set of "A|B" (sorted) present after pruning
//   sepSets: Map "A|B" → [vars] (the separating conditioning set found)
//   edges: final edge list [{from,to,directed}] — undirected = not yet oriented
// ---------------------------------------------------------------------------
function runPC(alpha) {
  const vars = SUB_VARS;
  const n = vars.length;
  const steps = []; // log of each CI test + decision

  // --- Skeleton phase ---
  // Adjacency as a Set of sorted "A|B" strings
  const adjacent = new Set();
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      adjacent.add(`${vars[i]}|${vars[j]}`);

  const sepSets = new Map(); // "A|B" → conditioning set that separates them

  // Run orders 0, 1, 2, ... until no more edges can be deleted at that order
  for (let ord = 0; ord <= n - 2; ord++) {
    let anyTested = false;
    const pairs = [...adjacent].map((s) => s.split("|"));

    for (const [a, b] of pairs) {
      if (!adjacent.has(`${a}|${b}`) && !adjacent.has(`${b}|${a}`)) continue;
      // Neighbors of a excluding b, only among current adjacent
      const adjA = vars.filter(
        (v) => v !== a && v !== b && (adjacent.has(`${[a, v].sort().join("|")}`) || adjacent.has(`${[v, a].sort().join("|")}`))
      );
      if (adjA.length < ord) continue;
      anyTested = true;

      // Try all conditioning subsets of adjA of size ord
      const subsets = powerset(adjA, ord).filter((s) => s.length === ord);
      let separated = false;
      for (const condSet of subsets) {
        const r = partialCorr(a, b, condSet);
        const absR = Math.abs(r);
        const independent = absR < alpha;
        steps.push({
          type: "ci-test",
          x: a, y: b,
          condSet: [...condSet],
          r: r,
          absR,
          alpha,
          independent,
          order: ord,
        });
        if (independent) {
          separated = true;
          const key = [a, b].sort().join("|");
          sepSets.set(key, condSet);
          adjacent.delete(key);
          steps.push({ type: "delete-edge", x: a, y: b, condSet: [...condSet], r });
          break;
        }
      }
      if (separated) {
        // restart pairs iteration for this order to use updated adjacency
      }
    }
    if (!anyTested) break;
  }

  // --- Orientation phase ---
  // Edge representation: {a, b, dirAtoB: null/true/false}
  // null = undirected, true = a→b, false = b→a
  const edgeMap = new Map(); // key "A|B" sorted → {a, b, dir: null/true/false}
  for (const key of adjacent) {
    const [a, b] = key.split("|");
    edgeMap.set(key, { a, b, dir: null });
  }

  function isAdjacent(x, y) {
    return edgeMap.has([x, y].sort().join("|"));
  }
  function isDirectedInto(x, y) {
    // returns true if there is x → y in the current CPDAG
    const key = [x, y].sort().join("|");
    const e = edgeMap.get(key);
    if (!e) return false;
    const forward = e.a === x;
    return e.dir === forward;
  }
  function orient(x, y) {
    // set x → y
    const key = [x, y].sort().join("|");
    const e = edgeMap.get(key);
    if (!e || e.dir !== null) return false; // already oriented or not adjacent
    e.dir = e.a === x;
    return true;
  }

  // Step 1: Unshielded triples — orient colliders
  // enumerate all unshielded triples: x - z - y, x and y NOT adjacent, z adjacent to both
  const tripleSteps = [];
  for (let i = 0; i < vars.length; i++) {
    for (let j = 0; j < vars.length; j++) {
      if (i === j) continue;
      const x = vars[i], y = vars[j];
      if (isAdjacent(x, y)) continue;
      const xKey = [x, y].sort().join("|");
      const sep = sepSets.get(xKey) || [];
      // z must be adjacent to both x and y
      for (const z of vars) {
        if (z === x || z === y) continue;
        if (!isAdjacent(x, z) || !isAdjacent(z, y)) continue;
        // unshielded triple: x - z - y, x⊥y
        const isCollider = !sep.includes(z);
        if (isCollider) {
          const o1 = orient(x, z);
          const o2 = orient(y, z);
          if (o1 || o2) {
            tripleSteps.push({ type: "orient-collider", x, z, y, sep: [...sep] });
          }
        }
      }
    }
  }
  steps.push(...tripleSteps);

  // Step 2: Meek rules R1 + R2 (iterate until stable)
  let changed = true;
  const meekSteps = [];
  while (changed) {
    changed = false;
    for (const [, e] of edgeMap) {
      const { a, b } = e;

      // R1: if Z→A–B (undirected) and Z not adj B → orient A→B
      if (e.dir === null) {
        for (const z of vars) {
          if (z === a || z === b) continue;
          if (isDirectedInto(z, a) && !isAdjacent(z, b)) {
            if (orient(a, b)) { changed = true; meekSteps.push({ type: "meek-R1", x: a, y: b, z }); break; }
          }
          if (isDirectedInto(z, b) && !isAdjacent(z, a)) {
            if (orient(b, a)) { changed = true; meekSteps.push({ type: "meek-R1", x: b, y: a, z }); break; }
          }
        }
      }

      // R2: if A→C→B and A–B undirected → orient A→B (acyclicity)
      if (e.dir === null) {
        for (const c of vars) {
          if (c === a || c === b) continue;
          if (isDirectedInto(a, c) && isDirectedInto(c, b)) {
            if (orient(a, b)) { changed = true; meekSteps.push({ type: "meek-R2", x: a, y: b, z: c }); break; }
          }
          if (isDirectedInto(b, c) && isDirectedInto(c, a)) {
            if (orient(b, a)) { changed = true; meekSteps.push({ type: "meek-R2", x: b, y: a, z: c }); break; }
          }
        }
      }
    }
  }
  steps.push(...meekSteps);

  // Final edge list
  const finalEdges = [];
  for (const [key, e] of edgeMap) {
    if (e.dir === null) {
      finalEdges.push({ from: e.a, to: e.b, directed: false });
    } else if (e.dir === true) {
      finalEdges.push({ from: e.a, to: e.b, directed: true });
    } else {
      finalEdges.push({ from: e.b, to: e.a, directed: true });
    }
  }

  return { steps, skeleton: adjacent, sepSets, edgeMap, edges: finalEdges };
}

// ---------------------------------------------------------------------------
// SHD: compare discovered edges to TRUE_EDGES_SUB restricted to chosen subset
// SHD = missing + extra + wrong-direction (directed edges in skeleton that differ)
// ---------------------------------------------------------------------------
function computeSHD(edges) {
  const foundSkel = new Set(edges.map((e) => [e.from, e.to].sort().join("|")));
  const trueSkel = new Set(TRUE_EDGES_SUB.map(([a, b]) => [a, b].sort().join("|")));

  let shd = 0;
  // Missing: in true skeleton but not found
  for (const k of trueSkel) if (!foundSkel.has(k)) shd++;
  // Extra: in found skeleton but not in true
  for (const k of foundSkel) if (!trueSkel.has(k)) shd++;
  // Wrong direction: in both skeletons, directed, but wrong way
  for (const [a, b] of TRUE_EDGES_SUB) {
    const key = [a, b].sort().join("|");
    if (foundSkel.has(key)) {
      const inEdge = edges.find((e) => [e.from, e.to].sort().join("|") === key);
      if (inEdge && inEdge.directed) {
        // directed: check direction
        if (inEdge.from !== a || inEdge.to !== b) shd++;
      }
      // undirected: no direction penalty — it is Markov-equivalent ambiguity
    }
  }
  return shd;
}

// ---------------------------------------------------------------------------
// CSS injection
// ---------------------------------------------------------------------------
function injectStyle() {
  if (document.getElementById("pcalg-css")) return;
  const css = `
    .pc-stage { display:flex; flex-direction:row; gap:16px; align-items:flex-start; width:100%; }
    .pc-svg-col { display:flex; flex-direction:column; gap:8px; align-items:center; }
    .pc-info-col { flex:1; display:flex; flex-direction:column; gap:10px; min-width:0; }
    .pc-section-title { font:700 11px var(--mono,monospace); color:var(--dim); letter-spacing:.08em; text-transform:uppercase; margin:0 0 4px; }
    .pc-graph-title { font:700 11px var(--mono,monospace); color:var(--dim); text-align:center; margin:0; }
    .pc-ci-box { background:var(--surface2); border-radius:8px; padding:8px 10px; font-family:var(--mono,monospace); font-size:12px; min-height:54px; }
    .pc-ci-line { color:var(--ink); line-height:1.5; }
    .pc-ci-result { font-size:11px; margin-top:3px; }
    .pc-ci-independent { color:var(--pos); font-weight:700; }
    .pc-ci-dependent   { color:var(--accent); font-weight:700; }
    .pc-orient-box { background:var(--surface2); border-radius:8px; padding:8px 10px; font-size:12px; min-height:40px; color:var(--ink); font-family:var(--mono,monospace); }
    .pc-step-log { display:flex; flex-direction:column; gap:4px; max-height:140px; overflow-y:auto; }
    .pc-log-item { font-size:11px; font-family:var(--mono,monospace); padding:3px 7px; border-radius:5px; background:var(--surface2); color:var(--dim); transition:background .2s,color .2s; }
    .pc-log-item.active { background:var(--accent); color:#fff; }
    .pc-log-item.deleted { text-decoration:line-through; color:var(--neg); background:rgba(255,90,90,.10); }
    .pc-log-item.kept { color:var(--pos); }
    .pc-log-item.orient { color:var(--gold); background:rgba(255,210,60,.10); }
    .pc-metrics { display:flex; gap:8px; flex-wrap:wrap; margin-top:2px; }
    .pc-legend { display:flex; flex-direction:column; gap:3px; font-size:11.5px; }
    .pc-legend-row { display:flex; align-items:center; gap:6px; }
    .pc-swatch { width:22px; height:3px; border-radius:2px; display:inline-block; }
    .pc-step-counter { font:700 11px var(--mono,monospace); color:var(--dim); text-align:center; }
    .pc-btn-row { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  `;
  const el = document.createElement("style");
  el.id = "pcalg-css";
  el.textContent = css;
  document.head.appendChild(el);
}

// ---------------------------------------------------------------------------
// SVG drawing helpers
// ---------------------------------------------------------------------------
const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    el.setAttribute(k, v);
  }
  return el;
}

// Node positions: circular layout for 7 nodes
const GW = 360, GH = 340;
const CX = GW / 2, CY = GH / 2;
const RX = 130, RY = 118;
const NODE_R = 22;

const NODE_POS = {};
SUB_VARS.forEach((id, i) => {
  const a = (2 * Math.PI * i) / SUB_VARS.length - Math.PI / 2;
  NODE_POS[id] = { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a) };
});

let _svgUid = 0;

// Draw the discovery graph with current edge state:
//   edgeStates: Map "A|B" sorted → "present"|"deleted"|"fade" + directed info
//   highlightTrue: whether to gold-highlight consensus edges
//   activeEdge: "A|B" to pulse
//   edgeList: [{from,to,directed,undirected}] — final display list
function buildGraphSVG(svgEl_, edgeStates, currentEdges, opts = {}) {
  clear(svgEl_);
  const uid = ++_svgUid;

  const defs = svgEl("defs");
  // Arrow markers
  for (const [markId, markerColor] of [
    ["pc-arrow-acc-" + uid, "var(--accent)"],
    ["pc-arrow-gold-" + uid, "var(--gold)"],
    ["pc-arrow-pos-" + uid, "var(--pos)"],
    ["pc-arrow-dim-" + uid, "var(--dim)"],
  ]) {
    const m = svgEl("marker", {
      id: markId, viewBox: "0 0 10 10", refX: 9, refY: 5,
      markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse",
    });
    m.appendChild(svgEl("path", { d: "M0,0 L10,5 L0,10 z", fill: markerColor }));
    defs.appendChild(m);
  }
  svgEl_.appendChild(defs);

  const gEdges = svgEl("g");
  const gNodes = svgEl("g");
  svgEl_.appendChild(gEdges);
  svgEl_.appendChild(gNodes);

  // Draw edges
  for (const e of currentEdges) {
    const key = [e.from, e.to].sort().join("|");
    const state = edgeStates.get(key) || "present";
    if (state === "deleted") continue; // don't draw deleted edges

    const pa = NODE_POS[e.from] || NODE_POS[e.to];
    const pb = NODE_POS[e.to] || NODE_POS[e.from];
    if (!pa || !pb) continue;

    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;

    const tipOffset = e.directed ? NODE_R + 5 : NODE_R;
    const x0 = pa.x + ux * NODE_R;
    const y0 = pa.y + uy * NODE_R;
    const x1 = pb.x - ux * tipOffset;
    const y1 = pb.y - uy * tipOffset;

    // Slight perpendicular curve to avoid total overlap
    const curve = 14;
    const mx = (x0 + x1) / 2 - uy * curve;
    const my = (y0 + y1) / 2 + ux * curve;

    const isTrue = TRUE_SET.has(`${e.from}|${e.to}`) || TRUE_SET.has(`${e.to}|${e.from}`);
    const isActive = opts.activeEdge === key;
    const isFading = state === "fade";

    const directed = e.directed;
    const edgeColor = isTrue
      ? "var(--gold)"
      : directed
        ? "var(--accent)"
        : "var(--dim)";

    const markerId = isTrue
      ? `pc-arrow-gold-${uid}`
      : directed
        ? `pc-arrow-acc-${uid}`
        : `pc-arrow-dim-${uid}`;

    const opacity = isFading ? 0.2 : isActive ? 1 : 0.7;
    const strokeW = isActive ? 3 : directed ? 2.2 : 1.8;

    // Gold glow for true edges that are present
    if (isTrue && !isFading) {
      const glow = svgEl("path", {
        d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`,
        fill: "none",
        stroke: "var(--gold)",
        "stroke-width": strokeW + 5,
        "stroke-opacity": "0.18",
      });
      gEdges.appendChild(glow);
    }

    const ePath = svgEl("path", {
      d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`,
      fill: "none",
      stroke: edgeColor,
      "stroke-width": strokeW,
      "stroke-dasharray": !directed ? "5 4" : null,
      "stroke-opacity": opacity,
      "marker-end": directed ? `url(#${markerId})` : null,
    });
    gEdges.appendChild(ePath);

    // Undirected tick marks at both ends
    if (!directed) {
      for (const [px, py] of [
        [pa.x + ux * NODE_R, pa.y + uy * NODE_R],
        [pb.x - ux * NODE_R, pb.y - uy * NODE_R],
      ]) {
        gEdges.appendChild(svgEl("line", {
          x1: px - uy * 5, y1: py + ux * 5,
          x2: px + uy * 5, y2: py - ux * 5,
          stroke: edgeColor,
          "stroke-width": 2,
          "stroke-opacity": opacity,
        }));
      }
    }
  }

  // Draw nodes
  for (const id of SUB_VARS) {
    const { x, y } = NODE_POS[id];
    const isActive = opts.activeNodes && opts.activeNodes.includes(id);
    const g = svgEl("g", { transform: `translate(${x},${y})` });

    if (isActive) {
      g.appendChild(svgEl("circle", {
        r: NODE_R + 6,
        fill: "var(--accent)",
        "fill-opacity": "0.18",
      }));
    }

    g.appendChild(svgEl("circle", {
      r: NODE_R,
      fill: "var(--surface)",
      stroke: isActive ? "var(--accent)" : "var(--line)",
      "stroke-width": isActive ? 2.2 : 1.5,
    }));

    const t = svgEl("text", {
      "text-anchor": "middle",
      y: 5,
      "font-size": 12,
      fill: "var(--ink)",
      "font-family": "var(--mono,monospace)",
      "font-weight": "700",
    });
    t.textContent = id;
    g.appendChild(t);
    gNodes.appendChild(g);
  }
}

// ---------------------------------------------------------------------------
// Main module export
// ---------------------------------------------------------------------------
export function mount(root) {
  injectStyle();

  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Constraint-Based Discovery · PC Algorithm",
    idea: "Can observational data alone reveal causal structure? The PC algorithm (Spirtes, Glymour & Scheines 2000) starts with a fully connected graph, deletes edges when a conditional-independence test screens off a pair, then orients surviving edges via v-structure detection and Meek's propagation rules. The output is a CPDAG — the set of all DAGs that are statistically indistinguishable from the true graph using observational data only.",
  });
  root.appendChild(layout);

  // ---- State ----
  let alpha = 0.12;       // CI threshold
  let playing = false;
  let stepIdx = 0;        // which step in result.steps we have reached
  let result = null;      // computed by runPC(alpha)
  let animT = 0;          // time within current step (for visual hold)
  const STEP_HOLD = 0.55; // seconds to display each step before auto-advancing

  // ---- Build result on first run / when alpha changes ----
  function recompute() {
    result = runPC(alpha);
    stepIdx = 0;
    playing = false;
    updatePlayBtn();
    applyStep(-1); // show fully-connected starting graph
    updateReadouts();
  }

  // ---- Current edge state for drawing ----
  // edgeStates: Map "A|B" sorted → "present"|"deleted"
  let edgeStates = new Map();
  let currentEdgeList = []; // [{from,to,directed}]
  let activeEdgeKey = null;
  let activeNodes = [];
  let ciBoxContent = { line: "", result: "", independent: null };
  let orientBoxContent = "";

  function allPairsSorted(varList) {
    const out = [];
    for (let i = 0; i < varList.length; i++)
      for (let j = i + 1; j < varList.length; j++)
        out.push([varList[i], varList[j]].sort().join("|"));
    return out;
  }

  function applyStep(upTo) {
    // Rebuild edge state by replaying all steps up to upTo index
    // Start from fully-connected skeleton
    edgeStates = new Map();
    for (const key of allPairsSorted(SUB_VARS)) {
      edgeStates.set(key, "present");
    }

    // After CI tests that deleted edges
    if (result && upTo >= 0) {
      const steps = result.steps.slice(0, upTo + 1);
      for (const step of steps) {
        if (step.type === "delete-edge") {
          const key = [step.x, step.y].sort().join("|");
          edgeStates.set(key, "deleted");
        }
      }
    }

    // Build currentEdgeList: all present + directed info from orientation steps
    const orientedEdges = new Map(); // key → {from, to}
    if (result && upTo >= 0) {
      const steps = result.steps.slice(0, upTo + 1);
      for (const step of steps) {
        if (step.type === "orient-collider") {
          const k1 = [step.x, step.z].sort().join("|");
          const k2 = [step.y, step.z].sort().join("|");
          orientedEdges.set(k1, { from: step.x, to: step.z });
          orientedEdges.set(k2, { from: step.y, to: step.z });
        }
        if (step.type === "meek-R1" || step.type === "meek-R2") {
          const k = [step.x, step.y].sort().join("|");
          orientedEdges.set(k, { from: step.x, to: step.y });
        }
      }
    }

    currentEdgeList = [];
    for (const key of allPairsSorted(SUB_VARS)) {
      if (edgeStates.get(key) === "deleted") continue;
      if (orientedEdges.has(key)) {
        const { from, to } = orientedEdges.get(key);
        currentEdgeList.push({ from, to, directed: true });
      } else {
        const [a, b] = key.split("|");
        currentEdgeList.push({ from: a, to: b, directed: false });
      }
    }

    // Active edge / nodes for current step highlight
    activeEdgeKey = null;
    activeNodes = [];
    if (result && upTo >= 0 && upTo < result.steps.length) {
      const step = result.steps[upTo];
      if (step.type === "ci-test") {
        activeEdgeKey = [step.x, step.y].sort().join("|");
        activeNodes = [step.x, step.y, ...step.condSet];
        const condStr = step.condSet.length > 0 ? ` | {${step.condSet.join(", ")}}` : "";
        ciBoxContent = {
          line: `Testing: ${step.x} ⫫ ${step.y}${condStr}`,
          result: step.independent
            ? `|partial r| = ${Math.abs(step.r).toFixed(3)} < α=${alpha.toFixed(2)}  →  independent  →  delete edge`
            : `|partial r| = ${Math.abs(step.r).toFixed(3)} ≥ α=${alpha.toFixed(2)}  →  dependent  →  keep edge`,
          independent: step.independent,
        };
        orientBoxContent = "";
      } else if (step.type === "delete-edge") {
        activeEdgeKey = [step.x, step.y].sort().join("|");
        activeNodes = [step.x, step.y];
        ciBoxContent = {
          line: `Removed: ${step.x} — ${step.y}`,
          result: `sep set = {${step.condSet.join(", ") || "∅"}}   |r| = ${Math.abs(step.r).toFixed(3)}`,
          independent: true,
        };
        orientBoxContent = "";
      } else if (step.type === "orient-collider") {
        activeNodes = [step.x, step.z, step.y];
        orientBoxContent = `V-structure: ${step.x} → ${step.z} ← ${step.y}  (${step.z} ∉ sep{${step.x},${step.y}})`;
        ciBoxContent = { line: "", result: "", independent: null };
      } else if (step.type === "meek-R1") {
        activeNodes = [step.x, step.y, step.z];
        orientBoxContent = `Meek R1: ${step.z}→${step.x} − ${step.y}  →  orient ${step.x}→${step.y}  (avoid new v-structure)`;
        ciBoxContent = { line: "", result: "", independent: null };
      } else if (step.type === "meek-R2") {
        activeNodes = [step.x, step.y, step.z];
        orientBoxContent = `Meek R2: ${step.x}→${step.z}→${step.y}  →  orient ${step.x}→${step.y}  (acyclicity)`;
        ciBoxContent = { line: "", result: "", independent: null };
      }
    } else if (!result || upTo < 0) {
      ciBoxContent = { line: "Starting from the complete graph…", result: "", independent: null };
      orientBoxContent = "";
    } else if (upTo >= result.steps.length) {
      // Done — show final state
      currentEdgeList = result.edges.map((e) => ({ ...e }));
      ciBoxContent = { line: "Discovery complete.", result: `${result.edges.length} edge(s) in CPDAG`, independent: null };
      orientBoxContent = "All compelled directions applied. Dashed edges = Markov-equivalence ambiguity.";
    }

    renderGraph();
    renderCIBox();
    renderOrientBox();
    updateReadouts();
    updateLogHighlight();
  }

  // ---- SVG element ----
  const svgElem = svgEl("svg", {
    class: "pc-graph-svg",
    viewBox: `0 0 ${GW} ${GH}`,
    width: GW,
    height: GH,
  });

  function renderGraph() {
    buildGraphSVG(svgElem, edgeStates, currentEdgeList, { activeEdge: activeEdgeKey, activeNodes });
  }

  // ---- CI test info box ----
  const ciLine = h("div", { class: "pc-ci-line" });
  const ciResult = h("div", { class: "pc-ci-result" });
  const ciBox = h("div", { class: "pc-ci-box" }, [ciLine, ciResult]);

  function renderCIBox() {
    ciLine.textContent = ciBoxContent.line;
    ciResult.textContent = ciBoxContent.result;
    ciResult.className = "pc-ci-result " + (
      ciBoxContent.independent === true ? "pc-ci-independent" :
      ciBoxContent.independent === false ? "pc-ci-dependent" : ""
    );
  }

  // ---- Orientation info box ----
  const orientBox = h("div", { class: "pc-orient-box" });
  function renderOrientBox() {
    orientBox.textContent = orientBoxContent;
  }

  // ---- Step log ----
  const stepLog = h("div", { class: "pc-step-log" });

  function buildLog() {
    clear(stepLog);
    if (!result) return;
    result.steps.forEach((step, i) => {
      let text = "";
      if (step.type === "ci-test") {
        const condStr = step.condSet.length > 0 ? `|{${step.condSet.join(",")}}` : "";
        text = `CI: ${step.x}⫫${step.y}${condStr}  r=${step.r.toFixed(2)}`;
      } else if (step.type === "delete-edge") {
        text = `✂ delete ${step.x}–${step.y}`;
      } else if (step.type === "orient-collider") {
        text = `→ collider ${step.x}→${step.z}←${step.y}`;
      } else if (step.type === "meek-R1") {
        text = `→ Meek R1: ${step.x}→${step.y}`;
      } else if (step.type === "meek-R2") {
        text = `→ Meek R2: ${step.x}→${step.y}`;
      }
      const cls = step.type === "delete-edge" ? "pc-log-item deleted"
        : step.type.startsWith("orient") || step.type.startsWith("meek") ? "pc-log-item orient"
        : "pc-log-item";
      stepLog.appendChild(h("div", { class: cls, dataset: { idx: String(i) } }, [text]));
    });
  }

  function updateLogHighlight() {
    for (const item of stepLog.children) {
      const idx = parseInt(item.dataset.idx || "-1");
      item.classList.toggle("active", idx === stepIdx);
    }
    // scroll active into view
    const active = stepLog.querySelector(".pc-log-item.active");
    if (active) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ---- Readouts ----
  const rEdges = readout({ label: "Edges", value: "—", accent: "var(--accent)" });
  const rOriented = readout({ label: "Directed", value: "—", accent: "var(--gold)" });
  const rSHD = readout({ label: "SHD", value: "—", accent: "var(--neg)" });
  const rStep = readout({ label: "Step", value: "0", accent: "var(--dim)" });
  const metrics = h("div", { class: "pc-metrics" }, [rEdges, rOriented, rSHD, rStep]);

  function updateReadouts() {
    const edgeCount = currentEdgeList.length;
    const directedCount = currentEdgeList.filter((e) => e.directed).length;
    const shd = result ? computeSHD(result.edges) : NaN;
    rEdges.set(String(edgeCount));
    rOriented.set(String(directedCount), `of ${edgeCount} total`);
    rSHD.set(isNaN(shd) ? "—" : String(shd), shd === 0 ? "perfect!" : shd <= 3 ? "excellent" : shd <= 6 ? "good" : "");
    if (!isNaN(shd)) {
      rSHD.querySelector(".readout-value").style.color =
        shd === 0 ? "var(--pos)" : shd <= 3 ? "var(--gold)" : "var(--neg)";
    }
    const totalSteps = result ? result.steps.length : 0;
    const displayStep = result ? Math.min(stepIdx + 1, totalSteps) : 0;
    rStep.set(`${displayStep}/${totalSteps}`);
  }

  // ---- Challenge ----
  const chal = challenge({
    goal: "Tune α and run discovery to reach SHD ≤ 3 against the Sachs et al. (2005) consensus on this 7-protein subset. Gold edges match the consensus direction; dashed edges are Markov-equivalent ambiguities that cannot be resolved from observational data alone.",
  });

  // ---- Play/Step controls ----
  const playBtn = button("▶ Play", () => { playing = true; updatePlayBtn(); }, { primary: true });
  const pauseBtn = button("⏸ Pause", () => { playing = false; updatePlayBtn(); });
  const stepFwdBtn = button("⏭ Step", doStep);
  const resetBtn = button("↺ Reset", () => { stepIdx = 0; playing = false; updatePlayBtn(); applyStep(-1); });

  function updatePlayBtn() {
    playBtn.disabled = playing;
    pauseBtn.disabled = !playing;
  }
  updatePlayBtn();

  function doStep() {
    if (!result) return;
    if (stepIdx >= result.steps.length) {
      playing = false;
      updatePlayBtn();
      applyStep(result.steps.length); // show final
      return;
    }
    applyStep(stepIdx);
    stepIdx++;
    animT = 0;
  }

  // ---- Alpha slider ----
  const alphaSlider = slider({
    label: "α threshold (|partial r| < α → independent)",
    min: 0.02, max: 0.40, step: 0.01, value: alpha,
    fmt: (v) => v.toFixed(2),
    onInput: (v) => { alpha = v; recompute(); buildLog(); },
    hint: "(higher α deletes more edges)",
  });

  // ---- Step counter pill ----
  const stepPill = h("div", { class: "pc-step-counter" });

  // ---- Stage layout ----
  stage.style.display = "block";
  const stageRow = h("div", { class: "pc-stage" }, [
    h("div", { class: "pc-svg-col" }, [
      h("p", { class: "pc-graph-title", text: "CPDAG  (gold = consensus  ·  → = compelled  ·  — = reversible)" }),
      svgElem,
      stepPill,
    ]),
    h("div", { class: "pc-info-col" }, [
      h("p", { class: "pc-section-title", text: "Current CI Test" }),
      ciBox,
      h("p", { class: "pc-section-title", style: { marginTop: "8px" }, text: "Orientation" }),
      orientBox,
      h("p", { class: "pc-section-title", style: { marginTop: "8px" }, text: "Step Log" }),
      stepLog,
      h("div", { style: { marginTop: "8px" } }, [metrics]),
    ]),
  ]);
  stage.appendChild(stageRow);

  // ---- Panel ----
  panel.append(
    panelSection("Dataset", [
      dataBadge(meta),
      h("p", { class: "note", style: { marginTop: "6px" } }, [
        h("span", { text: `7-protein subset: ${SUB_VARS.join(", ")}. n=${N} cells, z-scored. True edges (subset): ${TRUE_EDGES_SUB.map(([a, b]) => a + "→" + b).join(", ")}.` }),
      ]),
    ]),
    panelSection("Controls", [
      h("div", { class: "pc-btn-row" }, [playBtn, pauseBtn, stepFwdBtn, resetBtn]),
      h("p", { class: "note", style: { marginTop: "4px" } }, ["Step through: each CI test → edge deletion → v-structure orientation → Meek propagation."]),
    ]),
    panelSection("α Threshold", [alphaSlider]),
    panelSection("Metrics", [metrics]),
    panelSection("Legend", [
      h("div", { class: "pc-legend" }, [
        h("div", { class: "pc-legend-row" }, [
          h("span", { class: "pc-swatch", style: { background: "var(--gold)" } }),
          h("span", { text: "Gold edge: matches Sachs consensus direction" }),
        ]),
        h("div", { class: "pc-legend-row" }, [
          h("span", { class: "pc-swatch", style: { background: "var(--accent)" } }),
          h("span", { text: "Arrow: compelled (identifiable from data)" }),
        ]),
        h("div", { class: "pc-legend-row" }, [
          h("span", { class: "pc-swatch", style: { background: "none", height: "2px", borderTop: "2px dashed var(--dim)" } }),
          h("span", { text: "Dashed: reversible (Markov-equivalent ambiguity)" }),
        ]),
        h("div", { class: "pc-legend-row" }, [
          h("span", { class: "pc-swatch", style: { background: "var(--neg)" } }),
          h("span", { text: "SHD = missing + extra + mis-oriented edges" }),
        ]),
      ]),
    ]),
    panelSection("Challenge", [chal]),
    panelSection("Key facts", [
      note("PC runs CI tests at growing conditioning-set orders: order 0 (marginal), 1, 2, …"),
      note("Partial correlation: residualize X and Y on S via OLS, then correlate residuals."),
      note("V-structure X→Z←Y: oriented if Z ∉ sep(X,Y) — the only edges data can orient."),
      note("Meek R1 (no new v-structure) and R2 (acyclicity) propagate further directions."),
      note("Remaining undirected edges are the Markov-equivalence class ambiguity."),
      note("Compare: GES (score-based), FCI (allows latent confounders)."),
    ]),
  );

  // ---- Caption ----
  caption.innerHTML =
    "The <strong>PC algorithm</strong> (Spirtes, Glymour &amp; Scheines 2000) recovers a causal skeleton from observational data by " +
    "testing conditional independence at increasing conditioning-set orders (order 0, 1, 2, …): remove edge X–Y whenever a set S is found such that X ⫫ Y | S. " +
    "Surviving edges are then oriented via <strong>v-structure detection</strong> (orient X→Z←Y when Z ∉ sep(X, Y)) and <strong>Meek's propagation rules</strong> " +
    "(R1: no new v-structure; R2: acyclicity), producing a <em>CPDAG</em> — the complete partially directed acyclic graph representing the Markov-equivalence class. " +
    "Compelled arrows (solid) are identifiable from data alone; dashed undirected edges are Markov-equivalent ambiguities that require interventional data to resolve. " +
    "Data: <strong>Sachs et al. (Science 2005)</strong>, 7-protein subset of an 11-phosphoprotein flow-cytometry signaling network (n=" + N + " cells). " +
    "SHD (structural Hamming distance) counts missing + extra + mis-oriented edges vs. the consensus network. " +
    "Spirtes, Glymour &amp; Scheines (2000); Meek (1995).";

  // ---- Animation loop ----
  const stop = onFrame((dt) => {
    if (playing && result) {
      animT += dt;
      if (animT >= STEP_HOLD) {
        animT = 0;
        doStep();
      }
    }

    // Update challenge
    if (result) {
      const shd = computeSHD(result.edges);
      const done = stepIdx > result.steps.length;
      const solved = done && shd <= 3;
      chal.setState(solved,
        done
          ? `SHD=${shd} vs consensus  ·  α=${alpha.toFixed(2)}  ·  ${result.edges.length} edges  ·  ${result.edges.filter((e) => e.directed).length} directed`
          : stepIdx === 0 ? "Press Play or Step to run discovery." : `Step ${stepIdx}/${result.steps.length}…`
      );
      if (!isNaN(shd)) {
        rSHD.querySelector(".readout-value").style.color =
          shd === 0 ? "var(--pos)" : shd <= 3 ? "var(--gold)" : "var(--neg)";
      }
    }

    // Step counter pill
    if (result) {
      const totalSteps = result.steps.length;
      const displayStep = Math.min(stepIdx, totalSteps);
      stepPill.textContent = `Step ${displayStep} / ${totalSteps}`;
    }
  });

  // ---- Initial run ----
  recompute();
  buildLog();
  applyStep(-1);

  return () => {
    stop();
  };
}
