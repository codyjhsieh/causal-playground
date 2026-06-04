// Randomization. Why does a coin flip license causal claims? Because assignment
// becomes independent of every hidden trait — confounders balance *in
// expectation*. Real participants from Thornton (2008) rain down and a coin
// routes each into treatment/control; you watch distance-to-clinic balance
// (random) or split (self-selection), then stack bootstrap replications into
// the sampling distribution of the ATE — centered on the real ~0.45 effect.

import { h } from "../lib/dom.js";
import { RNG } from "../lib/rng.js";
import { mean, std } from "../lib/stats.js";
import { onFrame } from "../lib/anim.js";
import { Canvas, Scale, histogram, drawAxes } from "../lib/plot.js";
import { lessonLayout, panelSection, segmented, button, readout, challenge, note } from "../lib/ui.js";
import { rows, meta } from "../data/thornton.js";
import { col, complete, zscore, dataBadge } from "../lib/data.js";

// ---- Prepare the real Thornton data ----
// Keep only participants with both treatment indicator and outcome.
const data = complete(rows, ["any", "got"]);
// Also compute z-scored distance for covariate coloring (lower dist -> greener).
const distArr = data.map((r) => (r.distvct != null && !Number.isNaN(r.distvct) ? r.distvct : 3));
const distMean = distArr.reduce((a, b) => a + b, 0) / distArr.length;
const distSd = Math.sqrt(distArr.reduce((a, b) => a + (b - distMean) ** 2, 0) / Math.max(1, distArr.length - 1)) || 1;
const distZ = distArr.map((d) => (d - distMean) / distSd);

// Real RCT estimate (truth from the data)
const treated = data.filter((r) => r.any === 1).map((r) => r.got);
const control = data.filter((r) => r.any === 0).map((r) => r.got);
const TRUE_EFFECT = mean(treated) - mean(control); // ≈ +0.45

// Animated display uses a fixed N subsample for the rain animation.
const DISPLAY_N = 60;

export function mount(root) {
  let mode = "random"; // 'random' | 'select'
  const rng = new RNG(42);
  let units = [];       // current experiment's units (animated)
  let estimates = [];   // sampling distribution accumulator
  let animating = false;

  // ---- Bootstrap resampling helpers ----
  function bootstrapOnce() {
    // Resample real rows with replacement
    const n = data.length;
    const sample = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng.uniform(0, 1) * n);
      sample.push(data[idx]);
    }
    const t = sample.filter((r) => r.any === 1).map((r) => r.got);
    const c = sample.filter((r) => r.any === 0).map((r) => r.got);
    if (t.length && c.length) return mean(t) - mean(c);
    return null;
  }

  function pseudoTreatOnce() {
    // Self-selection: ignore the real RCT assignment; instead assign pseudo-
    // treatment using distance (closer units more likely to "self-select").
    // This confounds the estimate because distance also affects `got`.
    const n = data.length;
    let t = [], c = [];
    for (const r of data) {
      // closer (smaller distvct) -> more likely to choose to learn status
      const dz = r.distvct != null && !Number.isNaN(r.distvct)
        ? (r.distvct - distMean) / distSd
        : 0;
      const p = 1 / (1 + Math.exp(0.8 + 1.2 * dz)); // logistic: farther => lower p
      const pseudoT = rng.bernoulli(p);
      if (pseudoT) t.push(r.got);
      else c.push(r.got);
    }
    if (t.length && c.length) return mean(t) - mean(c);
    return null;
  }

  // ---- Build animated display units ----
  function makeUnits() {
    units = [];
    // Subsample DISPLAY_N rows for animation
    const pool = rng.shuffle(data).slice(0, DISPLAY_N);
    for (let i = 0; i < pool.length; i++) {
      const row = pool[i];
      const dz = distZ[data.indexOf(row)] ?? 0;
      let t;
      if (mode === "random") {
        t = row.any; // use real RCT assignment
      } else {
        // Self-selection: pseudo-treat based on distance
        const p = 1 / (1 + Math.exp(0.8 + 1.2 * ((row.distvct != null && !Number.isNaN(row.distvct) ? row.distvct : distMean) - distMean) / distSd));
        t = rng.bernoulli(p);
      }
      units.push({
        dist: dz,           // covariate for coloring
        rawDist: row.distvct ?? distMean,
        got: row.got,
        t,
        x: 280 + rng.uniform(-120, 120),
        py: -rng.uniform(0, 120),
        settled: false,
        targetX: 0,
        targetY: 0,
      });
    }
    layoutTargets();
    animating = true;
  }

  function layoutTargets() {
    const left = units.filter((u) => !u.t), right = units.filter((u) => u.t);
    const place = (arr, x0) => {
      arr.forEach((u, i) => {
        const c = i % 6, rowi = Math.floor(i / 6);
        u.targetX = x0 + c * 18;
        u.targetY = 330 - rowi * 16;
      });
    };
    place(left, 70);
    place(right, 360);
  }

  // ---- Layout ----
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Randomization",
    idea: "A coin flip is the most powerful instrument in science: it makes treatment independent of everything — measured or not — so a simple difference in means becomes an unbiased causal estimate. Real data from the Thornton (2008) HIV-incentive RCT in Malawi.",
  });

  const cvTop = new Canvas(560, 360, { margin: { t: 10, r: 10, b: 10, l: 10 } });
  const topWrap = h("div", {}, [
    h("p", { class: "stage-title", text: "one bootstrap draw · color = distance to clinic · left control / right treated" }),
    cvTop.el,
  ]);
  const cvHist = new Canvas(560, 190, { margin: { t: 16, r: 14, b: 34, l: 40 } });
  const histWrap = h("div", {}, [
    h("p", { class: "stage-title", text: "sampling distribution of estimated ATE (each bootstrap adds one)" }),
    cvHist.el,
  ]);
  stage.append(topWrap, histWrap);

  const rTrue = readout({ label: "RCT effect (real)", value: TRUE_EFFECT.toFixed(3), accent: "var(--gold)" });
  const rMean = readout({ label: "Mean estimate", value: "—", accent: "var(--accent2)" });
  const rBias = readout({ label: "Bias", value: "—", accent: "var(--neg)" });
  const rSE   = readout({ label: "Std. error", value: "—", accent: "var(--ctrl)" });

  const chal = challenge({
    goal: "Run ≥150 randomized bootstraps and confirm the distribution centers on the real RCT effect (bias ≈ 0). Then switch to self-selection and watch it shift away.",
  });

  panel.append(
    dataBadge(meta),
    panelSection("Estimator behaviour", h("div", { class: "readout-grid" }, [rTrue, rMean, rBias, rSE])),
    panelSection("Assignment mechanism", [
      segmented({
        options: [
          { label: "Coin flip (RCT)", value: "random" },
          { label: "Self-selection", value: "select" },
        ],
        value: "random",
        onSelect: (v) => { mode = v; estimates = []; makeUnits(); },
      }),
      note("Self-selection: closer participants self-select into getting their result, confounding the arms."),
    ]),
    panelSection("Run", [
      h("div", { class: "btn-row" }, [
        button("⚄ one bootstrap", () => makeUnits(), { primary: true }),
        button("⚄⚄ run 200", () => runMany(200)),
        button("clear", () => { estimates = []; }),
      ]),
    ]),
    panelSection("Challenge", chal),
  );

  caption.innerHTML =
    "Data: <strong>Thornton (2008) HIV Learning, Treatment &amp; Prevention in Malawi</strong> (<em>American Economic Review</em>). " +
    "The randomized treatment (<code>any</code>) is whether a participant was offered <em>any</em> cash incentive to return and learn their HIV result; " +
    "the outcome (<code>got</code>) is whether they actually returned. " +
    "In the <strong>RCT mode</strong>, each run resamples real rows with replacement (bootstrap) and recomputes " +
    "<em>mean(got | any=1) − mean(got | any=0)</em>. The histogram centers on the real ATE ≈ +0.45 — <strong>unbiased</strong>. " +
    "In the <strong>self-selection mode</strong>, the randomized assignment is ignored and a pseudo-treatment is assigned by distance to the clinic " +
    "(closer → more likely to self-select into learning their status). Because distance also predicts <code>got</code>, " +
    "the confounded estimate shifts off the real RCT value — that shift is the bias randomization eliminates. " +
    "Dots are colored by distance: <span style='color:#50e090'>green = close</span> → <span style='color:#f07040'>orange = far</span>. " +
    "Under randomization you see the covariate means balance across arms; under self-selection they diverge.";

  root.appendChild(layout);
  makeUnits();

  // ---- Record estimate from the current animated units ----
  function recordEstimate() {
    if (mode === "random") {
      const est = bootstrapOnce();
      if (est != null) estimates.push(est);
    } else {
      const est = pseudoTreatOnce();
      if (est != null) estimates.push(est);
    }
  }

  // ---- Batch silent runs ----
  function runMany(k) {
    for (let r = 0; r < k; r++) {
      const est = mode === "random" ? bootstrapOnce() : pseudoTreatOnce();
      if (est != null) estimates.push(est);
    }
  }

  // ---- Animation loop ----
  const stop = onFrame((dt) => {
    stepAnim(dt);
    drawTop();
    drawHist();
    updateReadouts();
  });

  function stepAnim(dt) {
    if (!animating) return;
    let allSettled = true;
    for (const u of units) {
      if (u.settled) continue;
      allSettled = false;
      u.x  += (u.targetX - u.x)  * Math.min(1, dt * 6);
      u.py += (u.targetY - u.py) * Math.min(1, dt * 6);
      if (Math.abs(u.x - u.targetX) < 0.6 && Math.abs(u.py - u.targetY) < 0.6) {
        u.x = u.targetX; u.py = u.targetY; u.settled = true;
      }
    }
    if (allSettled) { animating = false; recordEstimate(); }
  }

  function drawTop() {
    const cv = cvTop; cv.clear();
    const ctx = cv.ctx;
    // bins
    ctx.strokeStyle = "var(--line)"; ctx.lineWidth = 1.5;
    roundedBin(ctx, 55, 200, 130, 150, "var(--ctrl)");
    roundedBin(ctx, 345, 200, 130, 150, "var(--treat)");
    ctx.fillStyle = "var(--dim)"; ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("CONTROL", 120, 196);
    ctx.fillText("TREATED", 410, 196);
    // assignment icon
    ctx.fillStyle = "var(--gold)"; ctx.font = "20px serif";
    ctx.fillText(mode === "random" ? "⚄" : "👤", 280, 120);
    // units
    for (const u of units) {
      const clr = distColor(u.dist);
      ctx.beginPath(); ctx.arc(u.x, u.py, 5, 0, 7);
      ctx.fillStyle = clr; ctx.fill();
      ctx.strokeStyle = u.t ? "var(--treat)" : "var(--ctrl)";
      ctx.lineWidth = 1.5; ctx.stroke();
    }
    // balance bars: mean raw distance per arm
    const ld = units.filter((u) => !u.t).map((u) => u.rawDist);
    const rd = units.filter((u) =>  u.t).map((u) => u.rawDist);
    const ldm = ld.length ? mean(ld) : 0;
    const rdm = rd.length ? mean(rd) : 0;
    ctx.fillStyle = "var(--dim)"; ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(`mean dist ${ldm.toFixed(2)} km`, 120, 360);
    ctx.fillText(`mean dist ${rdm.toFixed(2)} km`, 410, 360);
  }

  function drawHist() {
    const cv = cvHist; cv.clear();
    if (estimates.length === 0) {
      cv.ctx.fillStyle = "var(--dim)"; cv.ctx.font = "12px ui-sans-serif, system-ui";
      cv.ctx.textAlign = "center";
      cv.ctx.fillText("run bootstraps to build the distribution", cv.w / 2, cv.h / 2);
      return;
    }
    const lo = -0.3, hi = 0.9;
    const bins = histogram(estimates, 40, lo, hi);
    const sx = new Scale([lo, hi], [cv.box.x0, cv.box.x1]);
    const maxC = Math.max(...bins.map((b) => b.count), 1);
    const sy = new Scale([0, maxC], [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel: "estimated ATE = mean(got|treated) − mean(got|control)", grid: false });
    for (const b of bins) {
      const x0 = sx.map(b.x0), x1 = sx.map(b.x1), yy = sy.map(b.count);
      cv.ctx.fillStyle = mode === "random" ? "rgba(54,214,195,.6)" : "rgba(255,107,138,.55)";
      cv.ctx.fillRect(x0 + 0.5, yy, Math.max(1, x1 - x0 - 1), cv.box.y1 - yy);
    }
    // true effect line (from the real data)
    const tx = sx.map(TRUE_EFFECT);
    cv.ctx.strokeStyle = "var(--gold)"; cv.ctx.lineWidth = 2;
    cv.ctx.beginPath(); cv.ctx.moveTo(tx, cv.box.y0); cv.ctx.lineTo(tx, cv.box.y1); cv.ctx.stroke();
    // mean line
    const mx = sx.map(mean(estimates));
    cv.ctx.strokeStyle = "var(--ink)"; cv.ctx.setLineDash([4, 3]); cv.ctx.lineWidth = 1.5;
    cv.ctx.beginPath(); cv.ctx.moveTo(mx, cv.box.y0); cv.ctx.lineTo(mx, cv.box.y1); cv.ctx.stroke();
    cv.ctx.setLineDash([]);
  }

  function updateReadouts() {
    if (estimates.length) {
      const m = mean(estimates);
      rMean.set(m.toFixed(3), `${estimates.length} bootstraps`);
      const bias = m - TRUE_EFFECT;
      rBias.set((bias >= 0 ? "+" : "") + bias.toFixed(3));
      rBias.querySelector(".readout-value").style.color =
        Math.abs(bias) < 0.05 ? "var(--pos)" : "var(--neg)";
      rSE.set(estimates.length > 1 ? std(estimates).toFixed(3) : "—");
      if (
        mode === "random" &&
        estimates.length >= 150 &&
        Math.abs(m - TRUE_EFFECT) < 0.05
      ) {
        chal.setState(true, `unbiased: mean ${m.toFixed(3)} ≈ true RCT ${TRUE_EFFECT.toFixed(3)}`);
      }
    }
  }

  return () => stop();
}

function roundedBin(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.rect(x, y, w, h);
  ctx.stroke();
  ctx.restore();
}

// Color by distance z-score: close (low dist, low z) -> green; far -> orange
function distColor(dz) {
  const t = Math.max(0, Math.min(1, 0.5 + dz * 0.3));   // 0=close, 1=far
  const r = Math.round(80  + t * 175);
  const g = Math.round(220 - t * 140);
  const b = Math.round(144 - t * 100);
  return `rgb(${r},${g},${b})`;
}
