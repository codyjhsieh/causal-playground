// Interactive causal DAG: draggable nodes, directed edges, a conditioning set,
// a real d-separation engine, and animated "association flow" particles that
// travel open paths and visibly stop at blocked junctions. This is the toy that
// makes confounders / colliders / mediators something you play with.

import { s, clear } from "./dom.js";
import { draggable, onFrame, bezierPoint } from "./anim.js";

let _uid = 0;

export class DAG {
  constructor(nodes = [], edges = []) {
    this.nodes = nodes.map((n) => ({ ...n }));
    this.edges = edges.map((e) => ({ ...e }));
  }
  node(id) { return this.nodes.find((n) => n.id === id); }
  parents(id) { return this.edges.filter((e) => e.to === id).map((e) => e.from); }
  children(id) { return this.edges.filter((e) => e.from === id).map((e) => e.to); }
  hasEdge(a, b) { return this.edges.some((e) => e.from === a && e.to === b); }
  neighbors(id) {
    const set = new Set();
    for (const e of this.edges) {
      if (e.from === id) set.add(e.to);
      if (e.to === id) set.add(e.from);
    }
    return [...set];
  }
  descendants(id) {
    const seen = new Set();
    const stack = [...this.children(id)];
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...this.children(x));
    }
    return seen;
  }

  // All simple undirected paths between a and b (for d-separation reasoning).
  paths(a, b, maxLen = 8) {
    const out = [];
    const walk = (cur, visited, acc) => {
      if (acc.length > maxLen) return;
      if (cur === b) { out.push(acc.slice()); return; }
      for (const nb of this.neighbors(cur)) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        acc.push(nb);
        walk(nb, visited, acc);
        acc.pop();
        visited.delete(nb);
      }
    };
    walk(a, new Set([a]), [a]);
    return out;
  }

  // Is a single path open (d-connecting) given the conditioning set Z?
  // For each interior node, classify the triple by edge directions.
  isPathOpen(path, Z) {
    const zset = Z instanceof Set ? Z : new Set(Z);
    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1], mid = path[i], next = path[i + 1];
      const intoFromPrev = this.hasEdge(prev, mid); // prev -> mid
      const intoFromNext = this.hasEdge(next, mid); // next -> mid
      const isCollider = intoFromPrev && intoFromNext; // prev->mid<-next
      if (isCollider) {
        // collider blocks UNLESS mid or a descendant is conditioned on
        const opensCollider = zset.has(mid) || [...this.descendants(mid)].some((d) => zset.has(d));
        if (!opensCollider) return false;
      } else {
        // chain or fork: blocked iff mid is conditioned on
        if (zset.has(mid)) return false;
      }
    }
    return true;
  }

  openPaths(a, b, Z) {
    return this.paths(a, b).filter((p) => this.isPathOpen(p, Z));
  }
  dSeparated(a, b, Z) {
    return this.openPaths(a, b, Z).length === 0;
  }
}

// ---- Rendering -------------------------------------------------------------

const SIGN_COLOR = { "+": "var(--pos)", "-": "var(--neg)", causal: "var(--ink)" };

export class DAGView {
  constructor(dag, { width = 560, height = 360, onChange, conditionable = true, draggableNodes = true } = {}) {
    this.dag = dag;
    this.w = width; this.h = height;
    this.onChange = onChange;
    this.conditionable = conditionable;
    this.draggableNodes = draggableNodes;
    this.Z = new Set();
    this.flowSources = []; // [{from,to}] pairs to animate association between
    this.flowParticles = [];
    this._flowAcc = 0;
    this.svg = s("svg", { class: "dag", viewBox: `0 0 ${width} ${height}`, width, height });
    this._buildDefs();
    this.gEdges = s("g", { class: "edges" });
    this.gFlow = s("g", { class: "flow" });
    this.gNodes = s("g", { class: "nodes" });
    this.svg.append(this.gEdges, this.gFlow, this.gNodes);
    this.render();
    this._tick = onFrame((dt) => this._animate(dt));
  }
  destroy() { this._tick && this._tick(); }

  _buildDefs() {
    const defs = s("defs");
    for (const [k, col] of [["arrow", "var(--ink)"], ["arrowPos", "var(--pos)"], ["arrowNeg", "var(--neg)"]]) {
      const m = s("marker", {
        id: `${k}-${this._mid()}`, viewBox: "0 0 10 10", refX: 9, refY: 5,
        markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse",
      }, [s("path", { d: "M0,0 L10,5 L0,10 z", fill: col })]);
      this[`marker_${k}`] = m.id;
      defs.append(m);
    }
    this.svg.append(defs);
  }
  _mid() { return (this._idbase ||= ++_uid); }

  setConditioned(id, on) {
    if (on) this.Z.add(id); else this.Z.delete(id);
    this.render();
    this.onChange && this.onChange(this);
  }
  toggleConditioned(id) { this.setConditioned(id, !this.Z.has(id)); }
  setFlow(pairs) { this.flowSources = pairs; }

  _edgePath(e) {
    const a = this.dag.node(e.from), b = this.dag.node(e.to);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const r = 26;
    const x0 = a.x + ux * r, y0 = a.y + uy * r;
    const x1 = b.x - ux * (r + 6), y1 = b.y - uy * (r + 6);
    // slight curve so bidirectional / overlapping edges separate
    const curve = e.curve || 0;
    const mx = (x0 + x1) / 2 - uy * curve, my = (y0 + y1) / 2 + ux * curve;
    return { d: `M ${x0} ${y0} Q ${mx} ${my} ${x1} ${y1}`, ctrl: { x: mx, y: my }, p0: { x: x0, y: y0 }, p1: { x: x1, y: y1 } };
  }

  render() {
    clear(this.gEdges); clear(this.gNodes);
    for (const e of this.dag.edges) {
      const { d } = this._edgePath(e);
      const marker = e.sign === "+" ? this.marker_arrowPos : e.sign === "-" ? this.marker_arrowNeg : this.marker_arrow;
      const col = e.sign ? SIGN_COLOR[e.sign] : "var(--ink)";
      const path = s("path", {
        d, fill: "none", stroke: col, "stroke-width": e.weak ? 1.5 : 2.4,
        "stroke-dasharray": e.dashed ? "5 5" : null,
        "marker-end": `url(#${marker})`, class: "edge" + (e.spurious ? " spurious" : ""),
      });
      this.gEdges.append(path);
      if (e.label) {
        const { ctrl } = this._edgePath(e);
        this.gEdges.append(s("text", { x: ctrl.x, y: ctrl.y - 4, class: "edge-label", "text-anchor": "middle", text: e.label }));
      }
    }
    for (const n of this.dag.nodes) {
      const conditioned = this.Z.has(n.id);
      const g = s("g", { class: "node" + (conditioned ? " conditioned" : "") + (n.role ? " role-" + n.role : ""), transform: `translate(${n.x},${n.y})` });
      if (conditioned) {
        g.append(s("rect", { x: -30, y: -30, width: 60, height: 60, rx: 8, class: "cond-box" }));
      }
      const circle = s("circle", { r: 24, class: "node-disc", fill: n.fill || "var(--surface)" });
      const label = s("text", { class: "node-label", "text-anchor": "middle", y: 5, text: n.label || n.id });
      g.append(circle, label);
      if (n.sub) g.append(s("text", { class: "node-sub", "text-anchor": "middle", y: 40, text: n.sub }));
      this.gNodes.append(g);

      if (this.draggableNodes) {
        draggable(g, {
          toCoords: (e) => {
            const pt = this.svg.createSVGPoint();
            pt.x = e.clientX; pt.y = e.clientY;
            const m = this.svg.getScreenCTM().inverse();
            const p = pt.matrixTransform(m);
            return { x: p.x, y: p.y };
          },
          onStart: () => { this._dragMoved = false; },
          onDrag: (p) => {
            this._dragMoved = true;
            n.x = Math.max(28, Math.min(this.w - 28, p.x));
            n.y = Math.max(28, Math.min(this.h - 28, p.y));
            this.render();
          },
          onEnd: () => {
            if (!this._dragMoved && this.conditionable && n.conditionable !== false) this.toggleConditioned(n.id);
          },
        });
      } else if (this.conditionable) {
        g.style.cursor = "pointer";
        g.addEventListener("click", () => { if (n.conditionable !== false) this.toggleConditioned(n.id); });
      }
    }
  }

  // Animate flowing association along open paths between flowSource pairs.
  _animate(dt) {
    this._flowAcc += dt;
    // spawn
    if (this._flowAcc > 0.12) {
      this._flowAcc = 0;
      for (const { from, to } of this.flowSources) {
        const open = this.dag.openPaths(from, to, this.Z);
        for (const path of open) {
          this.flowParticles.push({ path, t: 0, speed: 0.45 + Math.random() * 0.2 });
        }
      }
    }
    clear(this.gFlow);
    const keep = [];
    for (const p of this.flowParticles) {
      p.t += dt * p.speed;
      if (p.t >= 1) continue;
      const pos = this._posAlong(p.path, p.t);
      if (pos) {
        this.gFlow.append(s("circle", { cx: pos.x, cy: pos.y, r: 4, class: "flow-dot" }));
        keep.push(p);
      }
    }
    this.flowParticles = keep;
  }

  // Position along a multi-segment path at parameter t in [0,1].
  _posAlong(path, t) {
    const segs = path.length - 1;
    if (segs <= 0) return null;
    const ft = t * segs;
    const i = Math.min(segs - 1, Math.floor(ft));
    const local = ft - i;
    const a = this.dag.node(path[i]), b = this.dag.node(path[i + 1]);
    if (!a || !b) return null;
    const ctrl = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return bezierPoint(local, a, ctrl, b);
  }
}
