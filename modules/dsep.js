// d-Separation, grounded in real single-cell protein data.
// The graph is a readable 7-node subgraph of the Sachs et al. (2005) consensus
// signaling network (Science 2005, ~853 flow-cytometry measurements of 11
// phosphoproteins). It contains every junction type:
//   chain:   PKA → Raf → Mek
//   fork:    Raf ← PKA → Erk  (PKA drives both)
//   collider: Plcg → PIP2 ← PIP3  (two parents converge on PIP2)
//
// You pick two proteins X and Y, click nodes to build a conditioning set Z, and
// the module:
//   1. runs the d-separation engine on the graph (structural prediction), and
//   2. computes the empirical partial correlation of X and Y given Z from the
//      REAL Sachs data (linear residualization).
// The lesson: d-separation in the graph predicts which conditional correlations
// vanish in the real single-cell data — before seeing a single number.

import { h, clear } from "../lib/dom.js";
import { DAG, DAGView } from "../lib/dag.js";
import { onFrame } from "../lib/anim.js";
import { lessonLayout, panelSection, challenge, button, note } from "../lib/ui.js";
import { rows, meta } from "../data/sachs.js";
import { col, complete, dataBadge } from "../lib/data.js";
import { mean, correlation } from "../lib/stats.js";

// ---- 7-node Sachs subgraph ---------------------------------------------------
// Nodes: PKA, PKC, Raf, Mek, Erk, Plcg, PIP2, PIP3
// Subset of meta.trueEdges chosen to give chain, fork, and collider structures
// in a legible layout.
const NODES = [
  { id: "PKA",  label: "PKA",  sub: "kinase",     x: 280, y:  55 },
  { id: "PKC",  label: "PKC",  sub: "kinase",     x: 460, y: 200 },
  { id: "Raf",  label: "Raf",  sub: "kinase",     x: 140, y: 175 },
  { id: "Mek",  label: "Mek",  sub: "kinase",     x: 140, y: 310 },
  { id: "Erk",  label: "Erk",  sub: "kinase",     x: 280, y: 380 },
  { id: "Plcg", label: "Plcg", sub: "enzyme",     x: 460, y:  55 },
  { id: "PIP3", label: "PIP3", sub: "lipid",      x: 600, y: 175 },
  { id: "PIP2", label: "PIP2", sub: "lipid ← 2",  x: 600, y: 310 },
];

// Edges from the consensus network (subset)
// Structures present:
//   chain:    PKA → Raf → Mek → Erk
//   fork:     Raf ← PKA → Erk  (PKA forks to both)
//   collider: Plcg → PIP2 ← PIP3  (PIP2 is a collider)
const EDGES = [
  { from: "PKA",  to: "Raf" },
  { from: "PKA",  to: "Erk" },
  { from: "PKC",  to: "Raf" },
  { from: "Raf",  to: "Mek" },
  { from: "Mek",  to: "Erk" },
  { from: "Plcg", to: "PIP3" },
  { from: "Plcg", to: "PIP2" },
  { from: "PIP3", to: "PIP2" },
  { from: "PIP2", to: "PKC" },
];

// Node IDs in this subgraph
const SUBGRAPH_IDS = new Set(NODES.map((n) => n.id));

// ---- Real-data helpers -------------------------------------------------------
// Keep only rows where all 8 subgraph proteins are present.
const PROTEIN_KEYS = [...SUBGRAPH_IDS];
const cleanRows = complete(rows, PROTEIN_KEYS);

// Residualize xs on a set of control columns; return residuals.
function residualize(xs, controls) {
  if (controls.length === 0) return xs.slice();
  // OLS: xs ~ controls (no intercept needed after centering)
  const mx = mean(xs);
  const xc = xs.map((v) => v - mx);
  // Build Z matrix (controls, centered)
  const mcs = controls.map((c) => mean(c));
  const Zc = xs.map((_, i) => controls.map((c, j) => c[i] - mcs[j]));
  // Normal equations via successive projections (Gram-Schmidt is fine for ≤7 vars)
  // Use OLS via QR-free normal equations (small p)
  const p = controls.length;
  const ZtZ = Array.from({ length: p }, () => new Array(p).fill(0));
  const Zty = new Array(p).fill(0);
  for (let i = 0; i < Zc.length; i++) {
    for (let j = 0; j < p; j++) {
      Zty[j] += Zc[i][j] * xc[i];
      for (let k = 0; k < p; k++) ZtZ[j][k] += Zc[i][j] * Zc[i][k];
    }
  }
  // Solve via Gauss-Jordan
  const beta = solveLS(ZtZ, Zty);
  return xc.map((v, i) => {
    let fit = 0;
    for (let j = 0; j < p; j++) fit += Zc[i][j] * beta[j];
    return v - fit;
  });
}

function solveLS(A, b) {
  const n = A.length;
  // augmented [A | b]
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) continue;
    const d = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row[n]);
}

// Partial correlation of X and Y given conditioning set Z (array of column names).
function partialCorr(xKey, yKey, zKeys) {
  const xs = col(cleanRows, xKey);
  const ys = col(cleanRows, yKey);
  const controls = zKeys.map((k) => col(cleanRows, k));
  const rx = residualize(xs, controls);
  const ry = residualize(ys, controls);
  return correlation(rx, ry);
}

// ---- Module ------------------------------------------------------------------

export function mount(root) {
  const dag = new DAG(NODES, EDGES);

  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "d-Separation · Sachs Signaling Network",
    idea: "Graphical d-separation predicts which conditional correlations vanish in real single-cell protein data. Pick two proteins, build a conditioning set by clicking nodes, and watch the empirical partial correlation confirm the structural prediction.",
  });

  const view = new DAGView(dag, { width: 740, height: 440, onChange: () => refresh() });
  stage.style.display = "flex";
  stage.style.justifyContent = "center";
  stage.appendChild(view.svg);

  // ---- X / Y protein pickers --------------------------------------------------
  const proteinOptions = PROTEIN_KEYS.map((k) => h("option", { value: k, text: k }));
  const proteinOptions2 = PROTEIN_KEYS.map((k) => h("option", { value: k, text: k }));

  const selX = h("select", { class: "protein-sel" }, proteinOptions);
  const selY = h("select", { class: "protein-sel" }, proteinOptions2);
  selX.value = "Raf";
  selY.value = "Mek";

  selX.addEventListener("change", () => refresh());
  selY.addEventListener("change", () => refresh());

  // ---- Path list + status ------------------------------------------------------
  const pathList = h("div", { class: "path-list" });
  const status = h("div", { class: "dsep-status note" });

  // ---- Empirical correlation readout ------------------------------------------
  const corrBox = h("div", { class: "readout", style: { marginTop: "8px" } });
  const corrValue = h("div", { class: "readout-value", text: "—" });
  const corrLabel = h("div", { class: "readout-label", text: "Empirical |partial corr|" });
  const corrSub = h("div", { class: "readout-sub", text: "from Sachs data" });
  const predLabel = h("div", { class: "readout-label", style: { marginTop: "6px" }, text: "Graph prediction" });
  const predValue = h("div", { class: "readout-value", text: "—" });
  corrBox.append(corrLabel, corrValue, corrSub, predLabel, predValue);

  // ---- Challenge ---------------------------------------------------------------
  const chal = challenge({
    goal: "Find a conditioning set Z that (a) d-separates two proteins in the graph AND (b) drives their empirical partial correlation below 0.10.",
  });

  // ---- Panel layout -----------------------------------------------------------
  const xyRow = h("div", { class: "btn-row", style: { gap: "8px", alignItems: "center" } }, [
    h("span", { class: "note", text: "X =" }),
    selX,
    h("span", { class: "note", text: "Y =" }),
    selY,
  ]);

  panel.append(
    panelSection("Choose proteins X and Y", [xyRow]),
    panelSection("Paths  X — Y", [pathList, status]),
    panelSection("Real-data evidence", [corrBox]),
    panelSection("Junctions in this graph", [
      junctionRow("chain", "PKA → Raf → Mek", "open; blocked by conditioning on Raf", "var(--ctrl)"),
      junctionRow("fork",  "Raf ← PKA → Erk",  "open; blocked by conditioning on PKA", "var(--gold)"),
      junctionRow("collider", "Plcg → PIP2 ← PIP3", "blocked; OPENED by conditioning on PIP2", "var(--neg)"),
    ]),
    panelSection("", [
      h("div", { class: "btn-row" }, [
        button("clear conditioning", () => { view.Z.clear(); view.render(); refresh(); }),
      ]),
      h("p", { class: "note", style: { marginTop: "8px" }, text: "Click a node to condition on it (dashed box). Drag to rearrange." }),
    ]),
    panelSection("Challenge", [chal]),
    panelSection("Data", [dataBadge(meta)]),
  );

  caption.innerHTML =
    "This graph is a 7-node subgraph of the <strong>Sachs et al. (2005)</strong> consensus signaling network " +
    "(Science 308:523–529), derived from ~853 single-cell flow-cytometry measurements of 11 phosphoproteins. " +
    "Graphical d-separation is a <em>structural</em> claim: the graph predicts which conditional correlations " +
    "should vanish in the real data. The empirical partial correlation (computed by linear residualization on " +
    "the conditioning set) confirms or refutes the prediction. " +
    "Key structures: the <span class='k'>PKA → Raf → Mek</span> chain is a mediator — " +
    "conditioning on Raf blocks the indirect path. " +
    "The <span class='k'>Plcg → PIP2 ← PIP3</span> collider is naturally blocked; " +
    "conditioning on PIP2 would <strong>open</strong> a spurious path. " +
    "Try: set X=Raf, Y=Mek, condition on PKA — does the empirical partial correlation rise or fall?";

  root.appendChild(layout);

  // ---- Refresh -----------------------------------------------------------------
  function refresh() {
    const xId = selX.value;
    const yId = selY.value;
    if (xId === yId) {
      clear(pathList);
      status.textContent = "X and Y must be different proteins.";
      corrValue.textContent = "—";
      predValue.textContent = "—";
      return;
    }

    // Update flow animation source pair
    view.setFlow([{ from: xId, to: yId }]);

    // Structural: paths and d-separation
    clear(pathList);
    const Z = view.Z;
    const paths = dag.paths(xId, yId);
    for (const p of paths) {
      const open = dag.isPathOpen(p, Z);
      const reason = explain(dag, p, Z);
      const row = h("div", { class: "path-row " + (open ? "open" : "blocked") }, [
        h("span", { class: "path-glyph", text: open ? "◉" : "○" }),
        h("span", { class: "path-text", text: p.join(" — ") }),
        h("span", { class: "path-reason note", text: reason }),
      ]);
      pathList.appendChild(row);
    }

    const sep = dag.dSeparated(xId, yId, Z);
    const zlist = [...Z];
    status.innerHTML = sep
      ? `<strong style="color:var(--pos)">${xId} ⫫ ${yId}</strong> given { ${zlist.join(", ") || "∅"} } — d-separated.`
      : `<strong style="color:var(--neg)">${xId} ⫫̸ ${yId}</strong> given { ${zlist.join(", ") || "∅"} } — still connected.`;

    // Empirical: partial correlation from real Sachs data
    // Exclude X and Y themselves from Z for residualization
    const zForCorr = zlist.filter((k) => k !== xId && k !== yId);
    const pc = partialCorr(xId, yId, zForCorr);
    const absPc = Math.abs(pc);
    corrValue.textContent = absPc.toFixed(3);
    corrValue.style.color = absPc < 0.10 ? "var(--pos)" : absPc < 0.30 ? "var(--gold)" : "var(--neg)";

    predValue.textContent = sep
      ? "d-separated → expect ≈ 0"
      : "d-connected → expect nonzero";
    predValue.style.color = sep ? "var(--pos)" : "var(--neg)";

    // Challenge: solved if graph says d-separated AND empirical corr < 0.10
    const chalSolved = sep && absPc < 0.10;
    chal.setState(
      chalSolved,
      chalSolved
        ? `${xId} ⫫ ${yId} | {${zlist.join(", ")}} — empirical |r| = ${absPc.toFixed(3)} ✓`
        : sep
          ? `d-separated but |r| = ${absPc.toFixed(3)} (need < 0.10)`
          : `${dag.openPaths(xId, yId, Z).length} path(s) still open`,
    );
  }

  const stop = onFrame(() => {});
  refresh();
  return () => { stop(); view.destroy(); };
}

// ---- Helpers -----------------------------------------------------------------

function explain(dag, path, Z) {
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1], m = path[i], b = path[i + 1];
    const collider = dag.hasEdge(a, m) && dag.hasEdge(b, m);
    if (collider) {
      const opened = Z.has(m) || [...dag.descendants(m)].some((d) => Z.has(d));
      if (!opened) return `blocked at collider ${m}`;
    } else if (Z.has(m)) {
      return `blocked at ${m}`;
    }
  }
  return "open — association flows";
}

function junctionRow(name, glyph, desc, color) {
  return h("div", { style: { marginBottom: "8px" } }, [
    h("div", { style: { display: "flex", gap: "8px", alignItems: "baseline" } }, [
      h("span", { class: "pill", style: { color, borderColor: color }, text: name }),
      h("span", { class: "k", text: glyph }),
    ]),
    h("p", { class: "note", style: { marginTop: "2px" }, text: desc }),
  ]);
}
