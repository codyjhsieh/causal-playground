// Simpson's Paradox — UC Berkeley 1973 graduate admissions.
// Aggregate data suggest bias against women (≈44% vs 30% admission rate).
// Split by department and the gap reverses: within most departments women are
// admitted at an equal or higher rate. The confounder is department: women
// applied disproportionately to the harder (low-admit) departments C, E, F.
// Source: Bickel, Hammel & O'Connell, Science 187 (1975).

import { h } from "../lib/dom.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes } from "../lib/plot.js";
import { lessonLayout, panelSection, toggle, readout, challenge } from "../lib/ui.js";
import { departments, meta } from "../data/berkeley.js";
import { dataBadge } from "../lib/data.js";

// ── colour palette (one per department, consistent with house style) ──────────
const DEPT_COLORS = {
  A: "#4cc2ff",
  B: "#7c6cff",
  C: "#ff8a4c",
  D: "#4cd0a0",
  E: "#ffce5c",
  F: "#ff6b8a",
};

// ── precompute admission rates ────────────────────────────────────────────────
const deptData = departments.map((d) => ({
  dept: d.dept,
  color: DEPT_COLORS[d.dept],
  menRate: d.men.admitted / d.men.applied,
  womenRate: d.women.admitted / d.women.applied,
  menApp: d.men.applied,
  womenApp: d.women.applied,
}));

// aggregate rates
const totalMenApp = departments.reduce((s, d) => s + d.men.applied, 0);
const totalMenAdm = departments.reduce((s, d) => s + d.men.admitted, 0);
const totalWomApp = departments.reduce((s, d) => s + d.women.applied, 0);
const totalWomAdm = departments.reduce((s, d) => s + d.women.admitted, 0);
const aggMenRate = totalMenAdm / totalMenApp;   // ≈ 0.445
const aggWomRate = totalWomAdm / totalWomApp;   // ≈ 0.304
const aggGap = aggWomRate - aggMenRate;          // ≈ −0.141

// weighted within-department average gap (W − M), weighted by dept total applicants
let _num = 0, _den = 0;
for (const d of deptData) {
  const n = d.menApp + d.womenApp;
  _num += (d.womenRate - d.menRate) * n;
  _den += n;
}
const withinGap = _num / _den; // ≈ +0.009 — near zero / positive

// ── layout constants ──────────────────────────────────────────────────────────
const W = 620, H = 400;
const MARGIN = { t: 28, r: 24, b: 52, l: 58 };

// In aggregate view: two bars (men, women) at x positions 1.5 and 3.5 (out of 5)
// In split view: 6 groups of two bars, spaced evenly
const AGG_POS = { men: 1.5, women: 3.5 };   // on x axis 0..5

// In split view: positions for each dept pair, each dept occupies 1 unit
// men at dept_x, women at dept_x + 0.35
function deptPositions() {
  // 6 depts × 1.1 unit spacing, starting at 0.3
  return deptData.map((d, i) => ({
    dept: d.dept,
    men: 0.3 + i * 1.1,
    women: 0.3 + i * 1.1 + 0.4,
  }));
}
const SPLIT_POS = deptPositions();
const SPLIT_XMAX = 0.3 + 5 * 1.1 + 0.4 + 0.4; // ≈ 6.9

// bar width in data units
const BAR_W_AGG = 0.6;
const BAR_W_SPLIT = 0.28;

// ── spring-animated reveal (0 = aggregate, 1 = split) ────────────────────────
export function mount(root) {
  const reveal = new Spring(0, { stiffness: 70, damping: 14 });
  let splitOn = false;
  let solved = false;

  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Simpson's Paradox",
    idea: "UC Berkeley 1973: the aggregate data showed women admitted at far lower rates than men — apparent bias. Condition on department and the gap reverses within most departments. Same numbers, opposite story.",
  });

  // ── canvas ───────────────────────────────────────────────────────────────────
  const cv = new Canvas(W, H, { margin: MARGIN });
  stage.style.display = "flex";
  stage.style.justifyContent = "center";
  stage.style.flexDirection = "column";
  stage.style.alignItems = "center";
  stage.appendChild(cv.el);
  stage.appendChild(buildLegend());

  // ── readouts ─────────────────────────────────────────────────────────────────
  const rAgg = readout({
    label: "Aggregate gap (W − M)",
    value: fmt(aggGap),
    accent: "var(--neg)",
  });
  const rWithin = readout({
    label: "Within-dept avg gap (W − M)",
    value: "—",
    accent: "var(--pos)",
  });
  const grid = h("div", { class: "readout-grid" }, [rAgg, rWithin]);

  // ── challenge ────────────────────────────────────────────────────────────────
  const chal = challenge({
    goal: "Split by department to see the reversal: the aggregate penalty on women vanishes — and mostly flips — once you condition on the confounder.",
  });

  // ── toggle ───────────────────────────────────────────────────────────────────
  const tog = toggle({
    label: "Split by department",
    value: false,
    hint: "(reveals the confounder)",
    onToggle: (v) => {
      splitOn = v;
      reveal.set(v ? 1 : 0);
    },
  });

  // ── assemble panel ───────────────────────────────────────────────────────────
  panel.append(
    dataBadge(meta),
    panelSection("Admission rates", grid),
    panelSection("Controls", [tog]),
    panelSection("Challenge", chal),
  );

  // ── caption ──────────────────────────────────────────────────────────────────
  caption.innerHTML =
    "<strong>Department is the confounder.</strong> Women applied disproportionately to departments " +
    "C, E, and F — all with low overall admission rates — while men clustered in the high-admit " +
    "departments A and B. Pooling across departments lets that application-pattern difference leak " +
    "into the gender comparison and <em>manufacture</em> a spurious aggregate gap. " +
    "Conditioning on department (a common cause of both applicant gender distribution and admit rate) " +
    "closes the backdoor path and the bias largely disappears. " +
    "Source: Bickel, Hammel &amp; O'Connell, <em>Science</em> 187 (1975).";

  root.appendChild(layout);

  // ── animation loop ───────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    reveal.step(dt);
    draw(reveal.value);
  });

  // ── draw ─────────────────────────────────────────────────────────────────────
  function draw(r) {
    cv.clear();
    const ctx = cv.ctx;

    // Interpolate x domain and bar width between aggregate and split views
    const xMaxAgg = 5;
    const xMax = xMaxAgg + r * (SPLIT_XMAX - xMaxAgg);
    const sx = new Scale([0, xMax], [cv.box.x0, cv.box.x1]);
    const sy = new Scale([0, 1.0], [cv.box.y1, cv.box.y0]);

    drawAxes(cv, sx, sy, {
      xlabel: r < 0.5 ? "gender" : "department",
      ylabel: "admission rate",
      xticks: [],    // custom labels below
      yticks: [0, 0.2, 0.4, 0.6, 0.8, 1.0],
    });

    // custom x-axis labels
    const css = getComputedStyle(document.documentElement);
    const dim = css.getPropertyValue("--dim").trim() || "#8a8a99";
    const ink = css.getPropertyValue("--ink").trim() || "#1c1c22";
    ctx.save();
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = dim;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    if (r < 0.5) {
      // aggregate labels: Men / Women
      ctx.fillText("Men", sx.map(AGG_POS.men), cv.box.y1 + 6);
      ctx.fillText("Women", sx.map(AGG_POS.women), cv.box.y1 + 6);
    } else {
      // split labels: dept A–F (with offset between men/women positions)
      SPLIT_POS.forEach((p) => {
        const midX = sx.map((p.men + p.women) / 2);
        ctx.fillText("Dept " + p.dept, midX, cv.box.y1 + 6);
      });
      // secondary M/W labels above dept labels
      ctx.font = "9px ui-monospace, Menlo, monospace";
      ctx.fillStyle = dim;
      SPLIT_POS.forEach((p, i) => {
        ctx.fillText("M", sx.map(p.men), cv.box.y1 + 22);
        ctx.fillText("W", sx.map(p.women), cv.box.y1 + 22);
      });
    }
    ctx.restore();

    // ── draw bars ─────────────────────────────────────────────────────────────
    // Aggregate positions for men/women (constant)
    // Split positions per dept
    // Interpolate bar x positions and widths

    const MEN_COLOR = "#4cc2ff";
    const WOM_COLOR = "#ff6b8a";

    if (r < 0.99) {
      // AGGREGATE view (or blending out): two bars
      const bw = sx.map(BAR_W_AGG) - sx.map(0); // bar width in px
      const alpha = 1 - r;

      // Men bar
      const mX = sx.map(AGG_POS.men - BAR_W_AGG / 2);
      const mH = sy.map(0) - sy.map(aggMenRate);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = MEN_COLOR;
      ctx.fillRect(mX, sy.map(aggMenRate), bw, mH);
      ctx.restore();

      // Women bar
      const wX = sx.map(AGG_POS.women - BAR_W_AGG / 2);
      const wH = sy.map(0) - sy.map(aggWomRate);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = WOM_COLOR;
      ctx.fillRect(wX, sy.map(aggWomRate), bw, wH);
      ctx.restore();

      // rate labels on bars
      if (r < 0.5) {
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.font = "bold 12px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = ink;
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(pct(aggMenRate), sx.map(AGG_POS.men), sy.map(aggMenRate) - 4);
        ctx.fillText(pct(aggWomRate), sx.map(AGG_POS.women), sy.map(aggWomRate) - 4);
        ctx.restore();
      }
    }

    if (r > 0.01) {
      // SPLIT view (or blending in): 6 dept pairs
      const bwSplit = sx.map(BAR_W_SPLIT) - sx.map(0);
      const alpha = r;

      SPLIT_POS.forEach((p, i) => {
        const d = deptData[i];
        const deptColor = d.color;

        // Men bar (slightly lighter shade)
        const mX = sx.map(p.men - BAR_W_SPLIT / 2);
        const mH = sy.map(0) - sy.map(d.menRate);
        ctx.save(); ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = MEN_COLOR;
        ctx.fillRect(mX, sy.map(d.menRate), bwSplit, mH);
        ctx.restore();

        // Women bar
        const wX = sx.map(p.women - BAR_W_SPLIT / 2);
        const wH = sy.map(0) - sy.map(d.womenRate);
        ctx.save(); ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = WOM_COLOR;
        ctx.fillRect(wX, sy.map(d.womenRate), bwSplit, wH);
        ctx.restore();

        // dept color accent line at top of men bar (identity stripe)
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.fillStyle = deptColor;
        ctx.fillRect(mX, sy.map(d.menRate) - 3, bwSplit, 3);
        ctx.fillRect(wX, sy.map(d.womenRate) - 3, bwSplit, 3);
        ctx.restore();

        // rate labels when split is mostly visible
        if (r > 0.7) {
          ctx.save(); ctx.globalAlpha = (r - 0.7) / 0.3;
          ctx.font = "9px ui-monospace, Menlo, monospace";
          ctx.fillStyle = ink;
          ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.fillText(pct(d.menRate), sx.map(p.men), sy.map(d.menRate) - 6);
          ctx.fillText(pct(d.womenRate), sx.map(p.women), sy.map(d.womenRate) - 6);
          ctx.restore();
        }
      });
    }

    // ── update readouts ────────────────────────────────────────────────────────
    rAgg.set(fmt(aggGap), "women vs men, pooled");
    const wv = rWithin.querySelector(".readout-value");
    if (r > 0.5) {
      rWithin.set(fmt(withinGap), "dept-size-weighted avg");
      if (wv) wv.style.color = withinGap >= 0 ? "var(--pos)" : "var(--neg)";
    } else {
      rWithin.set("—", "split to reveal");
      if (wv) wv.style.color = "var(--pos)";
    }

    // ── challenge ──────────────────────────────────────────────────────────────
    if (splitOn && r > 0.85 && !solved) {
      solved = true;
      chal.setState(true, `Aggregate gap: ${fmt(aggGap)} → within-dept weighted avg: ${fmt(withinGap)}. The reversal is real.`);
    } else if (!splitOn && solved) {
      // keep solved once achieved
    }
  }

  return () => stop();
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(v) {
  return (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + " pp";
}
function pct(v) {
  return (v * 100).toFixed(0) + "%";
}

function buildLegend() {
  const wrap = h("div", { class: "legend" });
  wrap.append(
    h("span", {}, [h("span", { class: "swatch", style: { background: "#4cc2ff" } }), "Men"]),
    h("span", {}, [h("span", { class: "swatch", style: { background: "#ff6b8a" } }), "Women"]),
  );
  Object.entries(DEPT_COLORS).forEach(([dept, color]) => {
    wrap.append(h("span", {}, [h("span", { class: "swatch", style: { background: color } }), "Dept " + dept]));
  });
  return wrap;
}
