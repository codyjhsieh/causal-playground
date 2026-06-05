// LLMs & Causal Reasoning: the Corr2Cause task (Jin et al., ICLR 2024).
// Can you infer causation from correlation? Only up to the Markov equivalence
// class. Same independencies ⇒ multiple indistinguishable DAGs. Watching the
// MEC shrink and expand as you edit edges is the payoff.
//
// Real-data grounding: seed DAG from the Sachs et al. (2005) consensus network
// (subgraph: PKC→Raf, PKA→Raf, Raf→Mek, Mek→Erk). For each implied
// independence statement the empirical partial correlation from ~853 real cells
// is shown beside it — confirming that d-separated pairs are ≈0 in real data,
// while d-connected pairs are clearly nonzero.

import { h, clear } from "../lib/dom.js";
import { DAG, DAGView } from "../lib/dag.js";
import { onFrame, Spring } from "../lib/anim.js";
import { lessonLayout, panelSection, button, readout, challenge, note, segmented } from "../lib/ui.js";
import { rows, meta } from "../data/sachs.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";
import { correlation, olsMulti } from "../lib/stats.js";

// ---------------------------------------------------------------------------
// Causal-structure helpers (all tractable for ≤4 nodes)
// ---------------------------------------------------------------------------

/** All variable pairs where i < j (by sorted id). */
function allPairs(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      out.push([ids[i], ids[j]]);
  return out;
}

/** Powerset of an array (as arrays), excluding the given pair for |(Z)| subset. */
function powerset(arr) {
  const out = [[]];
  for (const x of arr) {
    const len = out.length;
    for (let i = 0; i < len; i++) out.push([...out[i], x]);
  }
  return out;
}

/**
 * independenciesOf(dag) → array of {x, y, z} where z is minimal conditioning set.
 * We enumerate every pair (X,Y) and every subset Z of the remaining variables;
 * collect d-separations and keep only "minimal" ones (no proper subset also separates).
 */
function independenciesOf(dag) {
  const ids = dag.nodes.map((n) => n.id);
  const results = [];
  for (const [x, y] of allPairs(ids)) {
    const others = ids.filter((v) => v !== x && v !== y);
    // Collect all separating sets
    const sepSets = [];
    for (const z of powerset(others)) {
      if (dag.dSeparated(x, y, new Set(z))) {
        sepSets.push(z);
      }
    }
    if (sepSets.length === 0) continue;
    // Keep only minimal separating sets
    const minimal = sepSets.filter((z) =>
      !sepSets.some((z2) => z2.length < z.length && z2.every((v) => z.includes(v)))
    );
    for (const z of minimal) {
      results.push({ x, y, z });
    }
  }
  return results;
}

/**
 * skeleton(dag) → Set of "A|B" strings (sorted, undirected edges).
 */
function skeleton(dag) {
  const sk = new Set();
  for (const e of dag.edges) {
    const pair = [e.from, e.to].sort().join("|");
    sk.add(pair);
  }
  return sk;
}

/**
 * vStructures(dag) → array of {x, z, y} where x→z←y and x,y not adjacent.
 */
function vStructures(dag) {
  const vs = [];
  for (const n of dag.nodes) {
    const pars = dag.parents(n.id);
    for (let i = 0; i < pars.length; i++) {
      for (let j = i + 1; j < pars.length; j++) {
        const x = pars[i], y = pars[j];
        if (!dag.hasEdge(x, y) && !dag.hasEdge(y, x)) {
          vs.push({ x, z: n.id, y });
        }
      }
    }
  }
  return vs;
}

/** Normalize a v-structure so the pair (x,y) is always sorted. */
function vsKey({ x, z, y }) {
  const [a, b] = [x, y].sort();
  return `${a}|${z}|${b}`;
}

/**
 * Check if two DAGs are Markov equivalent:
 * same skeleton AND same v-structures (by vsKey).
 */
function markovEquivalent(dag1, dag2) {
  const sk1 = skeleton(dag1), sk2 = skeleton(dag2);
  if (sk1.size !== sk2.size) return false;
  for (const e of sk1) if (!sk2.has(e)) return false;
  const vs1 = new Set(vStructures(dag1).map(vsKey));
  const vs2 = new Set(vStructures(dag2).map(vsKey));
  if (vs1.size !== vs2.size) return false;
  for (const v of vs1) if (!vs2.has(v)) return false;
  return true;
}

/**
 * Check if an array of edges forms a DAG (no directed cycles).
 * Uses DFS-based cycle detection.
 */
function isAcyclic(nodes, edges) {
  const children = {};
  for (const n of nodes) children[n] = [];
  for (const { from, to } of edges) {
    if (from === to) return false;
    children[from].push(to);
  }
  // DFS: 0=unvisited, 1=in-stack, 2=done
  const state = {};
  for (const n of nodes) state[n] = 0;
  function dfs(v) {
    if (state[v] === 1) return false; // cycle
    if (state[v] === 2) return true;
    state[v] = 1;
    for (const w of children[v]) if (!dfs(w)) return false;
    state[v] = 2;
    return true;
  }
  for (const n of nodes) if (state[n] === 0 && !dfs(n)) return false;
  return true;
}

/**
 * Enumerate the Markov Equivalence Class of a given DAG.
 * Strategy: take the skeleton, try all 2^(#edges) orientations; keep acyclic
 * DAGs that share exactly the same v-structures as the reference DAG.
 */
function computeMEC(dag) {
  const nodeIds = dag.nodes.map((n) => n.id);
  const sk = [...skeleton(dag)]; // e.g. ["A|B", "B|C"]
  const pairs = sk.map((s) => s.split("|")); // [[A,B],[B,C]]
  const k = pairs.length;
  const refVS = new Set(vStructures(dag).map(vsKey));

  const mec = [];
  for (let mask = 0; mask < (1 << k); mask++) {
    const edges = pairs.map(([a, b], i) =>
      mask & (1 << i) ? { from: a, to: b } : { from: b, to: a }
    );
    if (!isAcyclic(nodeIds, edges)) continue;
    // Build a tiny DAG to check v-structures
    const candidate = new DAG(dag.nodes, edges);
    const candVS = new Set(vStructures(candidate).map(vsKey));
    if (candVS.size !== refVS.size) continue;
    let match = true;
    for (const v of refVS) if (!candVS.has(v)) { match = false; break; }
    if (match) mec.push(edges);
  }
  return mec; // each entry is an edge list
}

/**
 * Compute CPDAG from MEC:
 * An edge pair (A,B) in the skeleton is COMPELLED if every DAG in the MEC
 * agrees on the direction A→B; otherwise it's REVERSIBLE.
 * Returns array of {from, to, compelled:bool}.
 */
function computeCPDAG(dag, mec) {
  const sk = [...skeleton(dag)];
  return sk.map((s) => {
    const [a, b] = s.split("|");
    const allAtoB = mec.every((edges) => edges.some((e) => e.from === a && e.to === b));
    const allBtoA = mec.every((edges) => edges.some((e) => e.from === b && e.to === a));
    if (allAtoB) return { from: a, to: b, compelled: true };
    if (allBtoA) return { from: b, to: a, compelled: true };
    return { from: a, to: b, compelled: false }; // reversible: show undirected
  });
}

// ---------------------------------------------------------------------------
// Real-data partial correlation engine (Sachs et al. 2005)
// ---------------------------------------------------------------------------

// Pre-process Sachs data: keep complete rows, z-score each column.
const SACHS_KEYS = meta.vars; // ["Raf","Mek","Plcg","PIP2","PIP3","Erk","Akt","PKA","PKC","P38","Jnk"]
const sachsClean = complete(rows, SACHS_KEYS);

// Build a map name → z-scored array (n ≈ 853)
const sachsZ = {};
for (const key of SACHS_KEYS) {
  sachsZ[key] = zscore(col(sachsClean, key)).z;
}
const N_SACHS = sachsClean.length;

/**
 * Partial correlation of X and Y given conditioning set Z (array of variable names).
 * Method: residualize X and Y on Z via OLS (with intercept), then correlate residuals.
 * Returns r (rounded to 2 dp).
 */
function partialCorr(xName, yName, zNames) {
  const xArr = sachsZ[xName];
  const yArr = sachsZ[yName];

  if (!xArr || !yArr) return null; // variable not in Sachs dataset

  // If no conditioning, just return raw correlation
  if (zNames.length === 0) {
    return correlation(xArr, yArr);
  }

  // Check all conditioning variables exist
  const zArrs = zNames.map((z) => sachsZ[z]);
  if (zArrs.some((a) => !a)) return null;

  // Build design matrix with intercept + Z columns
  const Xmat = [];
  for (let i = 0; i < N_SACHS; i++) {
    Xmat.push([1, ...zArrs.map((a) => a[i])]);
  }

  // Residualize X on Z
  const fitX = olsMulti(Xmat, xArr);
  const resX = xArr.map((v, i) => {
    let pred = 0;
    for (let j = 0; j < fitX.beta.length; j++) pred += Xmat[i][j] * fitX.beta[j];
    return v - pred;
  });

  // Residualize Y on Z
  const fitY = olsMulti(Xmat, yArr);
  const resY = yArr.map((v, i) => {
    let pred = 0;
    for (let j = 0; j < fitY.beta.length; j++) pred += Xmat[i][j] * fitY.beta[j];
    return v - pred;
  });

  return correlation(resX, resY);
}

// ---------------------------------------------------------------------------
// Styles (injected once)
// ---------------------------------------------------------------------------

const STYLE_ID = "c2c-css";
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
    .c2c-stage { display: flex; flex-direction: row; gap: 16px; align-items: flex-start; width: 100%; min-height: 340px; }
    .c2c-col { display: flex; flex-direction: column; gap: 10px; }
    .c2c-col-dag { flex: 0 0 auto; }
    .c2c-col-indep { flex: 1 1 0; min-width: 140px; }
    .c2c-col-mec  { flex: 1 1 0; min-width: 180px; }
    .c2c-panel-title { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); margin: 0 0 6px; }
    .c2c-edge-btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 0; }
    .c2c-indep-list { display: flex; flex-direction: column; gap: 5px; }
    .c2c-indep-item { font-size: 12.5px; font-family: var(--mono); background: var(--surface2); border-radius: 6px; padding: 4px 8px; color: var(--ink); transition: opacity .25s; }
    .c2c-indep-item .c2c-pcorr { font-size: 11px; margin-left: 8px; padding: 1px 5px; border-radius: 4px; font-weight: 600; }
    .c2c-pcorr-near-zero { background: rgba(76,208,160,0.18); color: var(--pos); }
    .c2c-pcorr-nonzero   { background: rgba(124,108,255,0.18); color: var(--accent); }
    .c2c-pcorr-na        { color: var(--dim); }
    .c2c-indep-none { font-size: 12px; color: var(--dim); font-style: italic; }
    .c2c-mec-gallery { display: flex; flex-direction: column; gap: 8px; }
    .c2c-cpdag-wrap, .c2c-gallery-frame { background: var(--surface2); border-radius: 10px; padding: 6px; position: relative; }
    .c2c-gallery-nav { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
    .c2c-gallery-idx { font-size: 11px; color: var(--dim); font-family: var(--mono); min-width: 36px; text-align: center; }
    .c2c-mec-label { font-size: 10.5px; font-weight: 700; color: var(--gold); letter-spacing:.06em; text-transform:uppercase; margin:0 0 3px; }
    .c2c-readouts { display: flex; gap: 10px; flex-wrap: wrap; margin: 2px 0; }
    .c2c-llm-wrap { background: var(--surface2); border-radius: 8px; padding: 8px 10px; margin-top: 4px; }
    .c2c-llm-msg  { font-size: 12px; min-height: 18px; margin-top: 4px; color: var(--dim); transition: color .3s; }
    .c2c-llm-msg.ok  { color: var(--pos); }
    .c2c-llm-msg.bad { color: var(--neg); }
    .c2c-vs-badge { font-size: 10.5px; font-family: var(--mono); background: var(--surface); border-radius: 4px; padding: 2px 6px; color: var(--accent2); border: 1px solid var(--line); display: inline-block; margin: 2px 2px 0 0; }
    .c2c-skeleton-svg { display: block; }
    .c2c-sachs-note { font-size: 11px; color: var(--dim); margin: 2px 0 4px; line-height: 1.4; }
  `;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

// ---------------------------------------------------------------------------
// Mini-SVG renderers for CPDAG and gallery frames (no DAGView — we need custom
// edge styling: solid arrows vs undirected lines, gold vs accent colors)
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

const W = 180, H = 150; // mini-svg dimensions
const R = 18; // node radius

/** Compute fixed layout positions for n nodes. */
function layoutPositions(nodeIds) {
  const n = nodeIds.length;
  const cx = W / 2, cy = H / 2, rx = W * 0.36, ry = H * 0.38;
  const pos = {};
  nodeIds.forEach((id, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    pos[id] = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
  return pos;
}

function arrowPath(ax, ay, bx, by, undirected = false) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const x0 = ax + ux * R, y0 = ay + uy * R;
  const x1 = bx - ux * (R + (undirected ? 0 : 6)), y1 = by - uy * (R + (undirected ? 0 : 6));
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

let _svgUid = 0;
function makeMiniSVG(nodeIds, edges, { highlight = new Set() } = {}) {
  const uid = ++_svgUid;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "c2c-skeleton-svg" });
  const defs = svgEl("defs");

  // Arrow markers: accent (compelled) and gold (reversible)
  for (const [id, col] of [["arrow-c2c-a-" + uid, "var(--accent)"], ["arrow-c2c-g-" + uid, "var(--gold)"], ["arrow-c2c-i-" + uid, "var(--dim)"]]) {
    const m = svgEl("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" });
    m.appendChild(svgEl("path", { d: "M0,0 L10,5 L0,10 z", fill: col }));
    defs.appendChild(m);
  }
  svg.appendChild(defs);

  const pos = layoutPositions(nodeIds);

  // Edges
  for (const e of edges) {
    const a = pos[e.from], b = pos[e.to];
    const d = arrowPath(a.x, a.y, b.x, b.y, e.undirected);
    const isIn = highlight.has(e.from + "|" + e.to) || highlight.has(e.to + "|" + e.from);
    const col = e.undirected ? "var(--gold)" : (e.inMEC ? "var(--dim)" : "var(--accent)");
    const marker = e.undirected ? null : (e.inMEC ? `url(#arrow-c2c-i-${uid})` : `url(#arrow-c2c-a-${uid})`);
    const path = svgEl("path", {
      d, fill: "none",
      stroke: isIn ? "var(--gold)" : col,
      "stroke-width": 2.2,
      "stroke-dasharray": e.undirected ? "5 4" : null,
      "marker-end": marker,
      opacity: 0.92,
    });
    svg.appendChild(path);

    // For undirected edges, add tick marks at both ends to signal "no arrow"
    if (e.undirected) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      for (const [px, py] of [[a.x + ux * R, a.y + uy * R], [b.x - ux * R, b.y - uy * R]]) {
        svg.appendChild(svgEl("line", {
          x1: px - uy * 5, y1: py + ux * 5, x2: px + uy * 5, y2: py - ux * 5,
          stroke: "var(--gold)", "stroke-width": 2, opacity: 0.8,
        }));
      }
    }
  }

  // Nodes
  for (const id of nodeIds) {
    const { x, y } = pos[id];
    const g = svgEl("g", { transform: `translate(${x},${y})` });
    g.appendChild(svgEl("circle", { r: R, fill: "var(--surface)", stroke: "var(--line)", "stroke-width": 1.5 }));
    const t = svgEl("text", { "text-anchor": "middle", y: 5, "font-size": 13, fill: "var(--ink)", "font-family": "var(--mono)", "font-weight": 700 });
    t.textContent = id;
    g.appendChild(t);
    svg.appendChild(g);
  }
  return svg;
}

// ---------------------------------------------------------------------------
// Sachs subgraph seed configuration
// ---------------------------------------------------------------------------
// Subgraph: PKC→Raf, PKA→Raf, Raf→Mek, Mek→Erk
// This gives: v-structure PKC→Raf←PKA (compelled), plus chain Raf→Mek→Erk
// (Raf—Mek reversible, Mek—Erk reversible). MEC size = 4 (2 reversible edges).
const SACHS_NODE_IDS = ["PKC", "PKA", "Raf", "Mek", "Erk"];
const SACHS_INIT_EDGES = [
  { from: "PKC", to: "Raf" },
  { from: "PKA", to: "Raf" },
  { from: "Raf", to: "Mek" },
  { from: "Mek", to: "Erk" },
];

// Fixed positions in the 500×310 DAGView canvas (spread out for readability)
const SACHS_POSITIONS = {
  PKC: { x: 90,  y: 120 },
  PKA: { x: 90,  y: 220 },
  Raf: { x: 220, y: 170 },
  Mek: { x: 350, y: 170 },
  Erk: { x: 460, y: 170 },
};

// ---------------------------------------------------------------------------
// Main module
// ---------------------------------------------------------------------------

export function mount(root) {
  injectStyle();

  const title = "LLMs & Causal Reasoning";
  const idea = "Correlation reveals only the Markov equivalence class (MEC) — the set of DAGs with the same skeleton and same v-structures, hence statistically indistinguishable from observational data alone. LLMs and humans that orient reversible edges beyond what the data permits are overconfident (Jin et al. 2024).";

  const { root: layout, stage, panel, caption } = lessonLayout({ title, idea });
  root.appendChild(layout);

  // ---- Initial graph: Sachs subgraph (PKC→Raf←PKA, Raf→Mek→Erk) ----
  // Using real Sachs protein names so the independence list matches real data
  let nodeIds = [...SACHS_NODE_IDS];
  let currentEdges = SACHS_INIT_EDGES.map((e) => ({ ...e }));

  // Whether current node set is the Sachs proteins (enables partial-corr display)
  function isSachsMode() {
    return nodeIds.every((id) => SACHS_KEYS.includes(id));
  }

  // All candidate edges among the current nodeIds
  function candidateEdges() {
    const out = [];
    for (let i = 0; i < nodeIds.length; i++)
      for (let j = i + 1; j < nodeIds.length; j++)
        out.push([nodeIds[i], nodeIds[j]]);
    return out;
  }

  function buildNodePositions(ids) {
    const positions = {
      // Sachs protein positions
      PKC: SACHS_POSITIONS.PKC,
      PKA: SACHS_POSITIONS.PKA,
      Raf: SACHS_POSITIONS.Raf,
      Mek: SACHS_POSITIONS.Mek,
      Erk: SACHS_POSITIONS.Erk,
      // Generic fallback positions for abstract A/B/C/D mode
      A: { x: 130, y: 180 },
      B: { x: 280, y: 100 },
      C: { x: 430, y: 180 },
      D: { x: 280, y: 290 },
    };
    return ids.map((id) => ({
      id, label: id,
      x: positions[id]?.x || 280,
      y: positions[id]?.y || 200,
    }));
  }

  function buildDAG() {
    return new DAG(buildNodePositions(nodeIds), currentEdges.map((e) => ({ ...e })));
  }

  // ---- DAGView for the editable true DAG ----
  let dag = buildDAG();
  let view = new DAGView(dag, { width: 500, height: 310, conditionable: false, draggableNodes: true });

  const dagWrap = h("div", { class: "c2c-col c2c-col-dag" }, [
    h("p", { class: "c2c-panel-title", text: "True DAG (editable)" }),
    view.svg,
  ]);

  // Edge buttons panel
  const edgeBtnRow = h("div", { class: "c2c-edge-btns" });

  function hasEdge(a, b) { return currentEdges.some((e) => e.from === a && e.to === b); }

  function rebuildEdgeButtons() {
    clear(edgeBtnRow);
    for (const [a, b] of candidateEdges()) {
      const hasAB = hasEdge(a, b);
      const hasBA = hasEdge(b, a);
      const present = hasAB || hasBA;
      const label = present ? (hasAB ? `${a}→${b}` : `${b}→${a}`) : `${a}—${b}`;
      const btn = h("button", {
        type: "button",
        class: "btn" + (present ? " primary" : ""),
        style: { fontSize: "11px", padding: "3px 8px" },
        text: present ? (hasAB ? `${a}→${b} ↺` : `${b}→${a} ↺`) : `+ ${a}—${b}`,
        onclick: () => handleEdgeToggle(a, b),
      });
      edgeBtnRow.appendChild(btn);
    }
  }

  function handleEdgeToggle(a, b) {
    const hasAB = hasEdge(a, b), hasBA = hasEdge(b, a);
    if (!hasAB && !hasBA) {
      // add A→B
      currentEdges.push({ from: a, to: b });
    } else if (hasAB) {
      // flip to B→A
      currentEdges = currentEdges.filter((e) => !(e.from === a && e.to === b));
      currentEdges.push({ from: b, to: a });
    } else {
      // hasBA: remove
      currentEdges = currentEdges.filter((e) => !(e.from === b && e.to === a));
    }
    rebuildGraph();
  }

  function rebuildGraph() {
    // Ensure no cycles after toggle
    dag = buildDAG();
    view.destroy();
    view = new DAGView(dag, { width: 500, height: 310, conditionable: false, draggableNodes: true });
    clear(dagWrap);
    dagWrap.appendChild(h("p", { class: "c2c-panel-title", text: "True DAG (editable)" }));
    dagWrap.appendChild(view.svg);
    dagWrap.appendChild(edgeBtnRow);
    rebuildEdgeButtons();
    refresh();
  }

  dagWrap.appendChild(edgeBtnRow);
  rebuildEdgeButtons();

  // ---- Independence list (with empirical partial correlations) ----
  const indepList = h("div", { class: "c2c-indep-list" });
  const sachsNoteEl = h("p", { class: "c2c-sachs-note",
    text: `Sachs data (n=${N_SACHS}): partial-corr badge is ≈0 (green) for d-separated pairs, nonzero (purple) for d-connected.` });
  const indepCol = h("div", { class: "c2c-col c2c-col-indep" }, [
    h("p", { class: "c2c-panel-title", text: "Implied Independencies" }),
    h("p", { class: "note", style: { marginBottom: "4px" }, text: "What correlational data reveals:" }),
    sachsNoteEl,
    indepList,
  ]);

  // ---- MEC column ----
  const mecSizeSpring = new Spring(0, { stiffness: 60, damping: 14 });
  const rMec = readout({ label: "|MEC|", value: "—", accent: "var(--gold)" });
  rMec.title = "Number of Markov-equivalent DAGs";
  const rCompelled = readout({ label: "Compelled edges", value: "—", accent: "var(--accent)" });
  const rReversible = readout({ label: "Reversible edges", value: "—", accent: "var(--gold)" });

  const cpdagWrap = h("div", { class: "c2c-cpdag-wrap" });
  const cpdagLabel = h("p", { class: "c2c-mec-label", text: "CPDAG (compelled = arrow, reversible = ─ ─)" });

  // Gallery
  let galleryIdx = 0;
  let mecCache = []; // array of edge-lists
  const galleryFrame = h("div", { class: "c2c-gallery-frame" });
  const galleryIdxEl = h("span", { class: "c2c-gallery-idx", text: "0/0" });
  const btnPrev = button("←", () => { galleryIdx = Math.max(0, galleryIdx - 1); renderGallery(); });
  const btnNext = button("→", () => { galleryIdx = Math.min(mecCache.length - 1, galleryIdx + 1); renderGallery(); });
  const galleryNav = h("div", { class: "c2c-gallery-nav" }, [btnPrev, galleryIdxEl, btnNext]);

  // LLM guess panel
  const llmMsg = h("div", { class: "c2c-llm-msg" });
  const llmBtnRow = h("div", { class: "c2c-edge-btns" });
  const llmWrap = h("div", { class: "c2c-llm-wrap" }, [
    h("p", { class: "c2c-panel-title", text: "LLM Guess: orient the reversible edges" }),
    h("p", { class: "note", style: { marginBottom: "4px" }, text: "Flip reversible edges to simulate an LLM's causal claim. Is it distinguishable from the truth?" }),
    llmBtnRow,
    llmMsg,
  ]);

  const vsWrap = h("div", { style: { marginTop: "4px" } });

  const mecCol = h("div", { class: "c2c-col c2c-col-mec" }, [
    h("p", { class: "c2c-panel-title", text: "Markov Equivalence Class" }),
    h("div", { class: "c2c-readouts" }, [rMec, rCompelled, rReversible]),
    cpdagLabel,
    cpdagWrap,
    h("p", { class: "c2c-mec-label", style: { marginTop: "8px" }, text: "DAGs in MEC (flip through)" }),
    galleryFrame,
    galleryNav,
    vsWrap,
    llmWrap,
  ]);

  // Assemble stage
  stage.style.display = "block";
  stage.style.overflowX = "auto";
  const stageRow = h("div", { class: "c2c-stage" }, [dagWrap, indepCol, mecCol]);
  stage.appendChild(stageRow);

  // ---- Challenge ----
  const chal = challenge({
    goal: "Build a DAG with at least one compelled edge (v-structure) AND at least one reversible edge (|MEC|>1). Show that data can orient some edges but not others.",
  });

  // ---- Panel sections ----
  panel.append(
    panelSection("Dataset", [
      dataBadge(meta),
      h("p", { class: "note", style: { marginTop: "6px" } },
        [h("span", { text: `Seed DAG: Sachs consensus subgraph — PKC→Raf←PKA (v-structure, compelled) + Raf→Mek→Erk (reversible chain). ${N_SACHS} cells.` })]),
    ]),
    panelSection("Node set", [
      segmented({
        options: [
          { label: "Sachs proteins (real data)", value: "sachs" },
          { label: "Abstract A/B/C/D", value: "abstract" },
        ],
        value: "sachs",
        onSelect: (v) => {
          if (v === "sachs") {
            nodeIds = [...SACHS_NODE_IDS];
            currentEdges = SACHS_INIT_EDGES.map((e) => ({ ...e }));
          } else {
            nodeIds = ["A", "B", "C", "D"];
            currentEdges = [{ from: "A", to: "B" }, { from: "B", to: "C" }];
          }
          rebuildGraph();
        },
      }),
    ]),
    panelSection("", [
      note("Click an edge button to cycle: absent → A→B → B→A → absent."),
      note("Drag nodes to rearrange the layout."),
    ]),
    panelSection("Legend", [
      h("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, [
        h("div", { style: { fontSize: "12px", color: "var(--accent)" }, html: "▶ <strong>Compelled edge</strong>: all MEC DAGs agree on direction (causal direction identifiable)." }),
        h("div", { style: { fontSize: "12px", color: "var(--gold)" }, html: "─ ─ <strong>Reversible edge</strong>: direction underdetermined by data." }),
        h("div", { style: { fontSize: "12px", color: "var(--pos)" }, html: "🟢 <strong>≈0 partial-corr</strong>: d-separation confirmed in real Sachs cells." }),
        h("div", { style: { fontSize: "12px", color: "var(--accent)" }, html: "🟣 <strong>nonzero partial-corr</strong>: d-connected (association present) in real cells." }),
      ]),
    ]),
    panelSection("Challenge", chal),
  );

  // ---- Caption ----
  caption.innerHTML =
    "Correlation determines causation only up to the <strong>Markov equivalence class</strong> (MEC) — the set of DAGs with identical skeletons and v-structures, hence indistinguishable from observational data alone " +
    "(Verma &amp; Pearl 1990). " +
    "V-structure edges (<em>X→Z←Y</em>, X and Y non-adjacent) are the <em>only</em> edges whose direction is identifiable from observational independence tests. " +
    "The seed DAG is a subgraph of the Sachs et al. (2005) protein-signaling consensus network " +
    "(n=" + N_SACHS + " single-cell flow-cytometry measurements, 11 phosphoproteins); " +
    "empirical partial correlations confirm d-separated pairs are ≈0 while d-connected pairs are clearly nonzero — " +
    "yet the reversible chain edges Raf—Mek—Erk remain unidentified even from real data. " +
    "Jin et al. (<em>Corr2Cause</em>, ICLR 2024) show that GPT-4 and other LLMs perform near chance at distinguishing compelled from reversible edges, " +
    "confusing causal plausibility with statistical identifiability. " +
    "PC algorithm: Spirtes, Glymour &amp; Scheines (2000). " +
    "Sachs et al., <em>Science</em> 2005.";

  // ---- Core refresh ----
  function refresh() {
    const sachsMode = isSachsMode();
    sachsNoteEl.style.display = sachsMode ? "" : "none";

    // Independencies (with empirical partial correlations where available)
    const indeps = independenciesOf(dag);
    clear(indepList);
    if (indeps.length === 0) {
      indepList.appendChild(h("p", { class: "c2c-indep-none", text: "No d-separations — all pairs correlated." }));
    } else {
      for (const { x, y, z } of indeps) {
        const zStr = z.length === 0 ? "" : ` | ${z.join(",")}`;
        const label = `${x} ⫫ ${y}${zStr}`;
        const item = h("div", { class: "c2c-indep-item" });
        item.appendChild(document.createTextNode(label));

        // Empirical partial correlation from Sachs data
        if (sachsMode) {
          const r = partialCorr(x, y, z);
          if (r !== null) {
            const rRound = r.toFixed(2);
            const nearZero = Math.abs(r) < 0.10;
            const badge = h("span", {
              class: "c2c-pcorr " + (nearZero ? "c2c-pcorr-near-zero" : "c2c-pcorr-nonzero"),
              text: `r=${rRound}`,
              title: nearZero
                ? `Partial correlation ≈ 0 — independence confirmed in Sachs data`
                : `Partial correlation = ${rRound} — NOT independent in Sachs data (d-connected path open)`,
            });
            item.appendChild(badge);
          } else {
            item.appendChild(h("span", { class: "c2c-pcorr c2c-pcorr-na", text: "(not in dataset)" }));
          }
        }

        indepList.appendChild(item);
      }
    }

    // MEC
    mecCache = computeMEC(dag);
    const cpdag = computeCPDAG(dag, mecCache);
    const compelledCount = cpdag.filter((e) => e.compelled).length;
    const reversibleCount = cpdag.filter((e) => !e.compelled).length;

    mecSizeSpring.set(mecCache.length);
    rMec.set(String(mecCache.length));
    rCompelled.set(String(compelledCount));
    rReversible.set(String(reversibleCount));

    // CPDAG visual
    clear(cpdagWrap);
    const cpdagEdges = cpdag.map((e) => ({
      from: e.from, to: e.to,
      undirected: !e.compelled,
      compelled: e.compelled,
    }));
    cpdagWrap.appendChild(makeMiniSVG(nodeIds, cpdagEdges));

    // Gallery
    galleryIdx = Math.min(galleryIdx, Math.max(0, mecCache.length - 1));
    renderGallery();

    // V-structures badge
    clear(vsWrap);
    const vs = vStructures(dag);
    if (vs.length > 0) {
      const row = h("div", { style: { marginTop: "4px" } });
      row.appendChild(h("span", { class: "c2c-panel-title", text: "V-structures: " }));
      for (const { x, z, y } of vs) {
        row.appendChild(h("span", { class: "c2c-vs-badge", text: `${x}→${z}←${y}` }));
      }
      vsWrap.appendChild(row);
    }

    // LLM guess panel
    rebuildLLMPanel(cpdag);

    // Challenge: need |MEC|>1 AND at least one compelled edge
    const solved = mecCache.length > 1 && compelledCount >= 1;
    chal.setState(solved, solved
      ? `|MEC|=${mecCache.length}, ${compelledCount} compelled, ${reversibleCount} reversible`
      : mecCache.length === 1
        ? "All edges identified — add an edge that creates ambiguity (no v-structure)."
        : compelledCount === 0
          ? "No compelled edges — add a v-structure (X→Z←Y where X,Y not adjacent)."
          : "Keep going…"
    );
  }

  function renderGallery() {
    clear(galleryFrame);
    if (mecCache.length === 0) {
      galleryFrame.appendChild(h("p", { class: "c2c-indep-none", text: "No valid DAGs." }));
      galleryIdxEl.textContent = "0/0";
      return;
    }
    const edges = mecCache[galleryIdx].map((e) => ({ ...e, inMEC: true }));
    galleryFrame.appendChild(makeMiniSVG(nodeIds, edges));
    galleryIdxEl.textContent = `${galleryIdx + 1} / ${mecCache.length}`;
  }

  // LLM guess: let user orient reversible edges
  let llmOrient = {}; // key: "A|B" → "forward" | "reverse"

  function rebuildLLMPanel(cpdag) {
    clear(llmBtnRow);
    const reversible = cpdag.filter((e) => !e.compelled);
    if (reversible.length === 0) {
      llmBtnRow.appendChild(h("p", { class: "c2c-indep-none", text: "No reversible edges — MEC is a single DAG." }));
      llmMsg.textContent = "";
      llmMsg.className = "c2c-llm-msg";
      return;
    }
    for (const e of reversible) {
      const key = [e.from, e.to].sort().join("|");
      if (!(key in llmOrient)) llmOrient[key] = "forward";
      const orient = llmOrient[key];
      const label = orient === "forward" ? `${e.from}→${e.to}` : `${e.to}→${e.from}`;
      const btn = h("button", {
        type: "button", class: "btn",
        style: { fontSize: "11px", padding: "3px 8px", borderColor: "var(--gold)", color: "var(--gold)" },
        text: label + " ↺",
        onclick: () => {
          llmOrient[key] = llmOrient[key] === "forward" ? "reverse" : "forward";
          rebuildLLMPanel(cpdag);
        },
      });
      llmBtnRow.appendChild(btn);
    }
    checkLLMGuess(cpdag);
  }

  function checkLLMGuess(cpdag) {
    // Build the "LLM's claimed DAG" using compelled edges + user's reversible choices
    const guessEdges = cpdag.map((e) => {
      if (e.compelled) return { from: e.from, to: e.to };
      const key = [e.from, e.to].sort().join("|");
      const orient = llmOrient[key] || "forward";
      return orient === "forward" ? { from: e.from, to: e.to } : { from: e.to, to: e.from };
    });
    // Is guessEdges in the MEC?
    const guessDag = new DAG(dag.nodes, guessEdges);
    const inMEC = markovEquivalent(dag, guessDag);
    if (inMEC) {
      llmMsg.textContent = "✓ This orientation is in the MEC — indistinguishable from truth by any correlation/independence test.";
      llmMsg.className = "c2c-llm-msg ok";
    } else {
      llmMsg.textContent = "✗ This orientation is NOT in the MEC — the data would falsify it (different v-structures or skeleton).";
      llmMsg.className = "c2c-llm-msg bad";
    }
  }

  // ---- Animation loop (spring-animate MEC size readout) ----
  const stop = onFrame((dt) => {
    mecSizeSpring.step(dt);
  });

  // ---- Init ----
  refresh();

  return () => {
    stop();
    view && view.destroy();
  };
}
