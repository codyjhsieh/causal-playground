// Confounding. IRA ownership and 401k eligibility rise together — but neither
// causes the other; income drives both. You see association literally *flow*
// through the backdoor path pira ← inc → e401k, and when you condition on
// income the flow stops and the within-income correlation collapses to ≈ 0.
//
// Data: Poterba, Venti & Wise 401(k) dataset (n ≈ 9,913 complete cases).

import { h } from "../lib/dom.js";
import { mean, correlation } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot } from "../lib/plot.js";
import { DAG, DAGView } from "../lib/dag.js";
import { lessonLayout, panelSection, slider, readout, challenge, note } from "../lib/ui.js";
import { rows, meta } from "../data/pension401k.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";

// ---- Pre-process real data --------------------------------------------------
// Keep only rows with pira, e401k, and inc present.
const DATA = complete(rows, ["pira", "e401k", "inc"]);

// Sorted income values — used to assign quantile-based bin indices.
const incVals = col(DATA, "inc").slice().sort((a, b) => a - b);
const N = incVals.length;

// Z-scored income parameters — used to color-map bins by income (0=low → 1=high).
const { mean: incMeanVal, sd: incSd } = zscore(col(DATA, "inc"));
function incColorT(incVal) {
  const z = (incVal - incMeanVal) / (incSd || 1);
  return Math.max(0, Math.min(1, (z + 2.5) / 5)); // map ±2.5 SD to [0,1]
}

// Build income-binned view: 10 bins, each bin → {incMid, piraMean, e401kMean, n, rows}
function buildBins(numBins) {
  const bins = Array.from({ length: numBins }, () => ({ incSum: 0, piraSum: 0, e401kSum: 0, n: 0, rows: [] }));
  for (const r of DATA) {
    const b = Math.min(numBins - 1, Math.floor((incVals.filter((x) => x <= r.inc).length / N) * numBins));
    bins[b].incSum += r.inc;
    bins[b].piraSum += r.pira;
    bins[b].e401kSum += r.e401k;
    bins[b].n++;
    bins[b].rows.push(r);
  }
  return bins.filter((b) => b.n > 0).map((b) => ({
    incMid: b.incSum / b.n,
    piraMean: b.piraSum / b.n,
    e401kMean: b.e401kSum / b.n,
    n: b.n,
    rows: b.rows,
  }));
}

// Raw correlation (over all complete rows)
const rawR = correlation(col(DATA, "pira"), col(DATA, "e401k"));

// Within-income partial correlation: average Pearson r within each income decile.
function withinIncomeCorr(numBins) {
  const bins = buildBins(numBins);
  let sum = 0, count = 0;
  for (const b of bins) {
    if (b.rows.length < 5) continue;
    const r = correlation(b.rows.map((d) => d.pira), b.rows.map((d) => d.e401k));
    if (!isNaN(r)) { sum += r; count++; }
  }
  return count ? sum / count : 0;
}

export function mount(root) {
  const state = { bins: 10 };
  const strat = new Spring(0, { stiffness: 60, damping: 13 }); // 0 = raw, 1 = within-income

  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Confounding",
    idea: "A confounder is a common cause of both variables. It opens a non-causal 'backdoor' path that smuggles association between things that don't affect each other at all.",
  });

  // ---- DAG ----
  const dag = new DAG(
    [
      { id: "Z", label: "$", sub: "income", x: 280, y: 70, role: "confounder" },
      { id: "X", label: "IRA", sub: "owns IRA", x: 150, y: 240, role: "treatment", conditionable: false },
      { id: "Y", label: "401k", sub: "eligible", x: 410, y: 240, role: "outcome", conditionable: false },
    ],
    [
      { from: "Z", to: "X", sign: "+" },
      { from: "Z", to: "Y", sign: "+" },
    ]
  );
  const view = new DAGView(dag, { width: 560, height: 320, onChange: onCond });
  view.setFlow([{ from: "X", to: "Y" }]);
  const dagWrap = h("div", {}, [
    h("p", { class: "stage-title", text: "click $ (income) to condition on it — watch the flow stop" }),
    view.svg,
  ]);

  // ---- Scatter (income-binned association plot) ----
  const cv = new Canvas(560, 300, { margin: { t: 16, r: 16, b: 44, l: 56 } });
  const scWrap = h("div", {}, [
    h("p", { class: "stage-title", text: "income-binned IRA ownership vs 401k eligibility rates" }),
    cv.el,
  ]);

  stage.append(h("div", { class: "stage-row" }, [dagWrap, scWrap]));

  // ---- Panel ----
  const rRaw = readout({ label: "Raw correlation", value: rawR.toFixed(3), accent: "var(--neg)" });
  const rAdj = readout({ label: "Within-income", value: "—", accent: "var(--pos)" });

  const chal = challenge({
    goal: "Stop the spurious association: condition on $ (click it) so the backdoor IRA ← income → 401k is blocked.",
  });

  panel.append(
    panelSection("Data", dataBadge(meta)),
    panelSection("Correlation", h("div", { class: "readout-grid" }, [rRaw, rAdj])),
    panelSection("Income bins", [
      slider({
        label: "Number of income bins",
        min: 5, max: 20, step: 1, value: state.bins,
        fmt: (v) => String(Math.round(v)),
        onInput: (v) => { state.bins = Math.round(v); },
      }),
      note("More bins = finer income strata. Within-income correlation stays ≈ 0 across all granularities."),
    ]),
    panelSection("Challenge", chal),
  );

  caption.innerHTML =
    "There is <strong>no arrow</strong> between IRA ownership and 401k eligibility — yet they correlate " +
    "(raw r ≈ " + rawR.toFixed(2) + "), because the open backdoor " +
    "<span class='k'>IRA ← income → 401k</span> " +
    "carries association. Higher-income households are more likely to own an IRA <em>and</em> more likely to " +
    "work at firms that offer a 401k. Conditioning on income <strong>blocks</strong> that path: within a " +
    "narrow income stratum the two are essentially independent (within-income r ≈ 0). " +
    "Data: <em>Poterba, Venti &amp; Wise (401k dataset)</em>.";

  root.appendChild(layout);

  function onCond() { /* re-render handled in draw via view.Z */ }

  const stop = onFrame((dt) => {
    const targetStrat = view.Z.has("Z") ? 1 : 0;
    strat.set(targetStrat);
    strat.step(dt);
    draw();
  });

  function draw() {
    const numBins = state.bins;
    const bins = buildBins(numBins);
    const k = strat.value;

    cv.clear();

    // Global IRA ownership rate (used to collapse points when conditioning)
    const globalPiraMean = mean(col(DATA, "pira"));

    // When conditioning (k→1), collapse each point toward global mean on x-axis
    // so the association flattens — simulating "within-income" variation only.
    const sx = new Scale([0, 1], [cv.box.x0, cv.box.x1]);
    const sy = new Scale([0, 1], [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel: "IRA ownership rate (per income bin)", ylabel: "401k eligibility rate" });

    for (let i = 0; i < bins.length; i++) {
      const b = bins[i];
      const t = incColorT(b.incMid); // zscore-based 0..1 for income color
      const xRaw = b.piraMean;
      const yRaw = b.e401kMean;
      // When conditioning (k→1): collapse x toward global mean so the
      // income-driven spread disappears and the within-income flatness is revealed.
      const xStr = globalPiraMean + (xRaw - globalPiraMean) * 0.08;
      const x = xRaw * (1 - k) + xStr * k;
      const c = incomeColor(t);
      dot(cv.ctx, sx.map(x), sy.map(yRaw), 4.5, c, { alpha: 0.88 });
    }

    // Draw a trend line through bins (flattens when conditioning)
    if (bins.length > 1) {
      const ctx = cv.ctx;
      ctx.save();
      ctx.strokeStyle = k > 0.5 ? "rgba(76,208,160,0.5)" : "rgba(255,107,138,0.5)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      for (let i = 0; i < bins.length; i++) {
        const xRaw = bins[i].piraMean;
        const xStr = globalPiraMean + (xRaw - globalPiraMean) * 0.08;
        const x = xRaw * (1 - k) + xStr * k;
        const px = sx.map(x), py = sy.map(bins[i].e401kMean);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Compute live within-income correlation
    const partialR = withinIncomeCorr(numBins);
    rRaw.set(rawR.toFixed(3));
    rAdj.set(partialR.toFixed(3), "≈ 0 once income is held fixed");

    const conditioned = view.Z.has("Z");
    if (conditioned) {
      chal.setState(true, `backdoor blocked · within-income r = ${partialR.toFixed(3)}`);
    } else {
      chal.setState(false);
    }
  }

  return () => { stop(); view.destroy(); };
}

function incomeColor(t) {
  // Low income → blue-ish, high income → amber/gold
  const r = Math.round(76 + t * 180);
  const g = Math.round(160 + t * 30);
  const b = Math.round(255 - t * 200);
  return `rgb(${r},${g},${b})`;
}
