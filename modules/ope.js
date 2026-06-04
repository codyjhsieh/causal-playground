// Off-Policy Evaluation under confounding — grounded in the Thornton (2008)
// Malawi HIV learning RCT. The logged dataset is a REAL randomized experiment:
// action a = any (cash incentive offered, randomized), reward r = got (learned
// HIV status). Because assignment was random the behavior propensity is known
// and IS/DR are unbiased. The "hidden confounding" slider synthetically
// subsamples the log — preferentially dropping far-distance treated units — to
// mimic a world where the propensity we record is *wrong*. Estimators then drift
// off the gold true value, showing OPE's reliance on unconfounded logging.
// Ref: Precup/Sutton IS; Thomas & Brunskill DR; Kallus & Zhou confounded OPE.

import { h } from "../lib/dom.js";
import { RNG } from "../lib/rng.js";
import { mean, std, clamp } from "../lib/stats.js";
import { onFrame } from "../lib/anim.js";
import { Canvas, Scale, histogram, drawAxes } from "../lib/plot.js";
import {
  lessonLayout, panelSection, slider, toggle, button, readout, challenge, note,
} from "../lib/ui.js";
import { rows as rawRows, meta } from "../data/thornton.js";
import { col, complete, dataBadge } from "../lib/data.js";

// ─── inject minimal extra CSS ─────────────────────────────────────────────────
(function injectCSS() {
  if (document.getElementById("ope-css")) return;
  const el = document.createElement("style");
  el.id = "ope-css";
  el.textContent = `
    .ope-log-scroll{overflow-y:auto;max-height:260px;font:11px var(--mono,monospace);
      background:var(--surface2);border-radius:8px;padding:6px 8px;color:var(--ink);}
    .ope-log-row{display:flex;gap:6px;align-items:center;padding:2px 0;opacity:.9;}
    .ope-log-row.new{opacity:1;}
    .ope-swatch{width:8px;height:8px;border-radius:2px;flex-shrink:0;}
    .ope-ghost{opacity:.38;font-style:italic;}
    .ope-legend{display:flex;gap:14px;flex-wrap:wrap;font:11px var(--mono,monospace);
      margin-top:4px;align-items:center;}
    .ope-legend span{display:flex;gap:5px;align-items:center;}
    .ope-legend .sw{width:12px;height:3px;border-radius:1px;display:inline-block;}
    .readout-grid.ope-grid{grid-template-columns:1fr 1fr;}
  `;
  document.head.appendChild(el);
})();

// ─── Prepare the Thornton logged dataset ─────────────────────────────────────
// Keep only complete rows: need any (action), got (reward).
// Also keep distvct & age for the confounding covariate.
const BASE_ROWS = complete(rawRows, ["any", "got"]);

// Behavior policy: randomized assignment, so true propensity is the empirical
// fraction a=1 in the complete dataset. This is the "recorded" pi_b we use.
const PI_B_1 = mean(col(BASE_ROWS, "any")); // P(a=1) under behavior policy

// Target policy pi_e: "always offer an incentive" (a=1 for everyone).
// True value of pi_e = E[got | a=1] under the RCT (randomization → unbiased).
const TREAT_ROWS = BASE_ROWS.filter((r) => r.any === 1);
const CTRL_ROWS  = BASE_ROWS.filter((r) => r.any === 0);
const TRUE_VALUE_ALWAYS_TREAT = mean(col(TREAT_ROWS, "got"));  // E[got|a=1]
const TRUE_VALUE_ALWAYS_CTRL  = mean(col(CTRL_ROWS,  "got"));  // E[got|a=0]

// Precompute z-scored distance for the confounding covariate
const distArr = col(BASE_ROWS, "distvct");
const distMean = mean(distArr);
const distSd   = std(distArr) || 1;
const DIST_Z   = distArr.map((d) => (d - distMean) / distSd);  // per-row

// ─── OPE estimators on a SUBSAMPLE of the logged data ────────────────────────
// confStr: 0 = full log (unconfounded), >0 = subsample that preferentially
// drops far-distance treated units. This mimics a logger that under-records
// high-distance treated observations → propensity recorded (PI_B_1) is wrong.
//
// Subsampling weight for row i when confStr > 0:
//   keep_prob(i) = 1                             if a=0
//   keep_prob(i) = sigmoid(-confStr * dist_z[i]) if a=1
// i.e. far-away treated units are dropped at higher rates.

const sig = (x) => 1 / (1 + Math.exp(-x));

function buildSubsample(rng, confStr) {
  if (confStr < 0.01) return BASE_ROWS.slice();   // no confounding → all rows
  const out = [];
  for (let i = 0; i < BASE_ROWS.length; i++) {
    const r = BASE_ROWS[i];
    const keepProb = r.any === 1
      ? sig(-confStr * DIST_Z[i])   // drop far treated units
      : 1.0;
    if (rng.uniform() < keepProb) out.push(r);
  }
  return out.length > 10 ? out : BASE_ROWS.slice();   // safety: never too small
}

// Bootstrap resample (with replacement) from an array.
function bootstrap(arr, rng) {
  const n = arr.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = arr[Math.floor(rng.uniform() * n)];
  return out;
}

// Run OPE estimators on one bootstrapped subsample.
// piE_a1: P(a=1) under target policy (1.0 for "always treat").
// piB_a1: the propensity we *think* the logger used (PI_B_1, potentially wrong
//         after subsampling, which is the whole point).
function runEstimators(sample, piE_a1, piB_a1) {
  const n = sample.length;
  if (n === 0) return { VDM: 0, VIS: 0, VSNIS: 0, VDR: 0 };

  // Direct Method: mean reward per action (treating as separate groups)
  const r1 = sample.filter((r) => r.any === 1).map((r) => r.got);
  const r0 = sample.filter((r) => r.any === 0).map((r) => r.got);
  const rhat1 = r1.length > 0 ? mean(r1) : TRUE_VALUE_ALWAYS_TREAT;
  const rhat0 = r0.length > 0 ? mean(r0) : TRUE_VALUE_ALWAYS_CTRL;
  const VDM = piE_a1 * rhat1 + (1 - piE_a1) * rhat0;

  // Importance Sampling (ordinary, unnormalized)
  let isSum = 0;
  for (const row of sample) {
    const piE_a = row.any === 1 ? piE_a1 : (1 - piE_a1);
    const piB_a = row.any === 1 ? piB_a1 : (1 - piB_a1);
    const w = clamp(piE_a / piB_a, 0, 20);
    isSum += w * row.got;
  }
  const VIS = isSum / n;

  // Self-normalized IS (WIS / SNIS)
  let wSum = 0, wrSum = 0;
  for (const row of sample) {
    const piE_a = row.any === 1 ? piE_a1 : (1 - piE_a1);
    const piB_a = row.any === 1 ? piB_a1 : (1 - piB_a1);
    const w = clamp(piE_a / piB_a, 0, 20);
    wSum += w;
    wrSum += w * row.got;
  }
  const VSNIS = wSum > 0 ? wrSum / wSum : VIS;

  // Doubly Robust: DM + IS correction on residual
  let drCorr = 0;
  for (const row of sample) {
    const piE_a = row.any === 1 ? piE_a1 : (1 - piE_a1);
    const piB_a = row.any === 1 ? piB_a1 : (1 - piB_a1);
    const w = clamp(piE_a / piB_a, 0, 20);
    const rhatA = row.any === 1 ? rhat1 : rhat0;
    drCorr += w * (row.got - rhatA);
  }
  const VDR = VDM + drCorr / n;

  return { VDM, VIS, VSNIS, VDR };
}

// ─── Module ───────────────────────────────────────────────────────────────────
export function mount(root) {
  const rng = new RNG(42);

  const state = {
    confStr: 0,       // 0 = no confounding; up to 3
    revealConf: false,
    showDM: true,
    showIS: true,
    showSNIS: true,
    showDR: true,
  };

  // Estimator sampling distributions (bootstrap estimates)
  const dists = { DM: [], IS: [], SNIS: [], DR: [] };

  // "True" value for the current target policy under the real RCT
  // (unaffected by confounding — it's from the original randomized data)
  const trueValue = TRUE_VALUE_ALWAYS_TREAT;

  // Streaming log display
  let streamLogs = [];
  const STREAM_MAX = 30;
  let pendingLogs = [];
  let streamTimer = 0;

  // ─── Runs ─────────────────────────────────────────────────────────────────
  function runOne() {
    const sub  = buildSubsample(rng, state.confStr);
    const boot = bootstrap(sub, rng);
    const { VDM, VIS, VSNIS, VDR } = runEstimators(boot, 1.0, PI_B_1);
    dists.DM.push(VDM);
    dists.IS.push(VIS);
    dists.SNIS.push(VSNIS);
    dists.DR.push(VDR);
    // Queue sample rows for streaming (show first 60 from subsample)
    pendingLogs = sub.slice(0, 60);
    streamLogs = [];
    streamTimer = 0;
  }

  function runBatch(k) {
    const sub = buildSubsample(rng, state.confStr);
    for (let i = 0; i < k; i++) {
      const boot = bootstrap(sub, rng);
      const res  = runEstimators(boot, 1.0, PI_B_1);
      dists.DM.push(res.VDM);
      dists.IS.push(res.VIS);
      dists.SNIS.push(res.VSNIS);
      dists.DR.push(res.VDR);
    }
    // Stream from the first subsample
    pendingLogs = sub.slice(0, 60);
    streamLogs = [];
    streamTimer = 0;
  }

  function refresh() {
    dists.DM.length = 0; dists.IS.length = 0; dists.SNIS.length = 0; dists.DR.length = 0;
    streamLogs = [];
    pendingLogs = [];
    streamTimer = 0;
    updateReadouts();
    updateChallengeState();
  }

  // ─── Layout ───────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Off-Policy Evaluation",
    idea: "Can you trust a dataset collected by someone else's policy to evaluate yours? Only if they never acted on something you can't see.",
  });

  // Stage: two columns
  const stageLeft  = h("div", { style: { flex: "1 1 260px", display: "flex", flexDirection: "column", gap: "10px" } });
  const stageRight = h("div", { style: { flex: "1 1 340px", display: "flex", flexDirection: "column", gap: "10px" } });
  const stageRow   = h("div", { class: "stage-row", style: { alignItems: "flex-start", gap: "16px" } });
  stageRow.append(stageLeft, stageRight);
  stage.append(stageRow);

  // Left: streaming log panel
  const logTitle  = h("p", { class: "stage-title", text: "logged trajectories · color = action (any=0 ctrl, any=1 treat)" });
  const logScroll = h("div", { class: "ope-log-scroll" });
  const logLegend = h("div", { class: "ope-legend" }, [
    h("span", {}, [h("span", { class: "sw", style: { background: "var(--ctrl)" } }), "a=0 (no incentive)"]),
    h("span", {}, [h("span", { class: "sw", style: { background: "var(--treat)" } }), "a=1 (incentive)"]),
    h("span", { class: "ope-ghost" }, ["ghost = dist (confounder)"]),
  ]);
  stageLeft.append(logTitle, logScroll, logLegend);

  // Right: sampling distribution histograms
  const distTitle  = h("p", { class: "stage-title", text: "bootstrap sampling distributions of V̂(πₑ) · gold = truth" });
  const cvDist     = new Canvas(340, 280, { margin: { t: 16, r: 14, b: 38, l: 46 } });
  const distLegend = h("div", { class: "ope-legend" }, [
    h("span", {}, [h("span", { class: "sw", style: { background: "var(--ctrl)", opacity: ".85" } }), "DM"]),
    h("span", {}, [h("span", { class: "sw", style: { background: "var(--treat)", opacity: ".85" } }), "IS"]),
    h("span", {}, [h("span", { class: "sw", style: { background: "var(--accent2)", opacity: ".85" } }), "WIS"]),
    h("span", {}, [h("span", { class: "sw", style: { background: "var(--gold)", opacity: ".85" } }), "DR"]),
    h("span", {}, [h("span", { class: "sw", style: { background: "var(--gold)", height: "2px" } }), "truth"]),
  ]);
  stageRight.append(distTitle, cvDist.el, distLegend);

  // ─── Readouts ─────────────────────────────────────────────────────────────
  const rTrue  = readout({ label: "True V(πₑ)", value: TRUE_VALUE_ALWAYS_TREAT.toFixed(3), accent: "var(--gold)" });
  const rDM    = readout({ label: "DM bias", value: "—", accent: "var(--ctrl)" });
  const rIS    = readout({ label: "IS bias", value: "—", accent: "var(--treat)" });
  const rDR    = readout({ label: "DR bias", value: "—", accent: "var(--accent2)" });
  const rRuns  = readout({ label: "Runs", value: "0" });

  const chal = challenge({
    goal: "At confounding = 0, IS & DR should be unbiased (histograms centered on gold line). Raise the hidden confounding slider and watch every estimator drift off the truth — even the doubly-robust one cannot fix a misspecified propensity.",
  });

  let chalSeen0 = false;
  let chalSeenHigh = false;

  // Hidden confounding strength slider (star control)
  const confSlider = slider({
    label: "Hidden confounding strength ★",
    min: 0, max: 3, step: 0.05, value: state.confStr,
    fmt: (v) => v.toFixed(2),
    onInput: (v) => { state.confStr = v; refresh(); },
  });

  const godToggle = toggle({
    label: "Reveal hidden confounder (distance)",
    hint: "(god mode)",
    value: false,
    onToggle: (v) => { state.revealConf = v; },
  });

  panel.append(
    panelSection("Data", dataBadge(meta)),
    panelSection("Estimators", h("div", { class: "readout-grid ope-grid" }, [rTrue, rRuns, rDM, rIS, rDR])),
    panelSection("Controls", [
      confSlider,
      godToggle,
    ]),
    panelSection("Run", [
      h("div", { class: "btn-row" }, [
        button("▶ run 1 bootstrap", () => { runOne(); updateChallengeState(); }, { primary: true }),
        button("⚄⚄ run 200", () => { runBatch(200); updateChallengeState(); }),
        button("reset", () => refresh()),
      ]),
      note("Bootstrap 200 datasets to build the sampling distribution. Each run resamples the Thornton logged data with the current confounding applied."),
    ]),
    panelSection("Challenge", chal),
    panelSection("References",
      h("p", { class: "note", html:
        "Thornton, R. (2008). <em>The demand for, and impact of, learning HIV status.</em> AER 98(5). &nbsp;·&nbsp; " +
        "Precup, Sutton &amp; Singh (2000) IS for OPE. &nbsp;·&nbsp; " +
        "Thomas &amp; Brunskill (2016) Doubly Robust OPE. &nbsp;·&nbsp; " +
        "Kallus &amp; Zhou (2018) / Namkoong et al. (2020) confounded OPE &amp; sensitivity analysis."
      })
    ),
  );

  caption.innerHTML =
    "<strong>Real data:</strong> Thornton (AER 2008) randomized cash incentives to learn HIV status in Malawi. " +
    "Here <em>any</em> (cash incentive offered, randomized) is the logged action and <em>got</em> (learned HIV result) is the reward. " +
    "Because assignment was truly random, the behavior propensity π<sub>b</sub>(a=1) ≈ " + PI_B_1.toFixed(2) + " is correctly specified, " +
    "so IS and DR are <strong>unbiased</strong> at confounding = 0 (histograms sit on the gold line). " +
    "The <strong>hidden confounding slider</strong> synthetically subsamples the log — preferentially dropping " +
    "far-distance treated units — so the propensity we record is <em>wrong</em>. " +
    "Every estimator then inherits a bias that <strong>cannot be removed</strong> by cleverer reweighting. " +
    "Sensitivity bounds (Kallus &amp; Zhou 2018; Namkoong et al. 2020) are the honest answer: " +
    "they trade point estimates for intervals under worst-case Γ.";

  root.appendChild(layout);
  refresh();

  // ─── Streaming log renderer ───────────────────────────────────────────────
  function drainOneLog() {
    if (!pendingLogs.length) return;
    const l = pendingLogs.shift();
    const row = buildLogRow(l);
    if (streamLogs.length >= STREAM_MAX) {
      if (logScroll.firstChild) logScroll.removeChild(logScroll.firstChild);
      streamLogs.shift();
    }
    streamLogs.push(l);
    logScroll.appendChild(row);
    logScroll.scrollTop = logScroll.scrollHeight;
  }

  function buildLogRow(l) {
    const aColor = l.any === 1 ? "var(--treat)" : "var(--ctrl)";
    const swatch = h("span", { class: "ope-swatch", style: { background: aColor } });
    const aLabel = h("span", { style: { color: aColor }, text: `a=${l.any}` });
    const rLabel = h("span", { style: { color: "var(--ink)" }, text: `r=${l.got}` });
    const children = [swatch, aLabel, rLabel];
    if (state.revealConf && l.distvct != null) {
      const dz = (l.distvct - distMean) / distSd;
      children.push(h("span", { class: "ope-ghost", text: `dist_z=${dz.toFixed(2)}` }));
    }
    return h("div", { class: "ope-log-row new" }, children);
  }

  // ─── Histogram drawing ────────────────────────────────────────────────────
  const COLORS = {
    DM:   "rgba(74,144,226,.55)",
    IS:   "rgba(255,107,138,.60)",
    SNIS: "rgba(54,214,195,.55)",
    DR:   "rgba(255,196,50,.65)",
  };
  const SHOW_FLAGS = { DM: "showDM", IS: "showIS", SNIS: "showSNIS", DR: "showDR" };

  function drawDist() {
    const cv = cvDist;
    cv.clear();

    const all = [];
    for (const [key, flag] of Object.entries(SHOW_FLAGS)) {
      if (state[flag]) for (const v of dists[key]) all.push(v);
    }
    if (all.length < 4) {
      cv.ctx.fillStyle = "var(--dim)";
      cv.ctx.font = "12px ui-sans-serif,system-ui";
      cv.ctx.textAlign = "center";
      cv.ctx.fillText("run bootstrap datasets to build distributions", cv.w / 2, cv.h / 2);
      return;
    }

    const lo = Math.min(...all, trueValue) - 0.05;
    const hi = Math.max(...all, trueValue) + 0.05;
    const sx = new Scale([lo, hi], [cv.box.x0, cv.box.x1]);

    let globalMax = 1;
    for (const [key, flag] of Object.entries(SHOW_FLAGS)) {
      if (!state[flag] || dists[key].length < 2) continue;
      const bins = histogram(dists[key], 28, lo, hi);
      const m = Math.max(...bins.map((b) => b.count));
      if (m > globalMax) globalMax = m;
    }
    const sy = new Scale([0, globalMax], [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel: "estimated V(πₑ)", grid: true });

    for (const [key, flag] of Object.entries(SHOW_FLAGS)) {
      if (!state[flag] || dists[key].length < 2) continue;
      const bins = histogram(dists[key], 28, lo, hi);
      const ctx = cv.ctx;
      ctx.fillStyle = COLORS[key];
      for (const b of bins) {
        if (b.count === 0) continue;
        const x0 = sx.map(b.x0) + 0.5;
        const x1 = sx.map(b.x1) - 0.5;
        const yy = sy.map(b.count);
        ctx.fillRect(x0, yy, Math.max(1, x1 - x0), cv.box.y1 - yy);
      }
      // mean dashed line
      const m = mean(dists[key]);
      const mx = sx.map(m);
      ctx.save();
      ctx.strokeStyle = COLORS[key].replace(/[\d.]+\)$/, "1)");
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(mx, cv.box.y0 + 4); ctx.lineTo(mx, cv.box.y1); ctx.stroke();
      ctx.restore();
    }

    // Gold truth line (on top)
    const tx = sx.map(trueValue);
    cv.ctx.save();
    cv.ctx.strokeStyle = "var(--gold)";
    cv.ctx.lineWidth = 2.5;
    cv.ctx.beginPath(); cv.ctx.moveTo(tx, cv.box.y0); cv.ctx.lineTo(tx, cv.box.y1); cv.ctx.stroke();
    cv.ctx.fillStyle = "var(--gold)";
    cv.ctx.font = "11px ui-monospace,monospace";
    cv.ctx.textAlign = "center"; cv.ctx.textBaseline = "bottom";
    cv.ctx.fillText("truth", tx, cv.box.y0 - 1);
    cv.ctx.restore();
  }

  // ─── Readout updater ──────────────────────────────────────────────────────
  function updateReadouts() {
    rTrue.set(trueValue.toFixed(3), `E[got|a=1] RCT  n=${TREAT_ROWS.length}`);

    const nRuns = dists.DM.length;
    rRuns.set(String(nRuns), "bootstrap runs");

    if (nRuns > 0) {
      const biasStr = (key) => {
        const m = mean(dists[key]);
        const b = m - trueValue;
        return (b >= 0 ? "+" : "") + b.toFixed(3);
      };
      rDM.set(biasStr("DM"),   `mean ${mean(dists.DM).toFixed(3)}`);
      rIS.set(biasStr("IS"),   `mean ${mean(dists.IS).toFixed(3)}`);
      rDR.set(biasStr("DR"),   `mean ${mean(dists.DR).toFixed(3)}`);
      for (const [r, key] of [[rDM, "DM"], [rIS, "IS"], [rDR, "DR"]]) {
        const b = Math.abs(mean(dists[key]) - trueValue);
        const el = r.querySelector(".readout-value");
        if (el) el.style.color = b < 0.02 ? "var(--pos)" : b < 0.06 ? "var(--dim)" : "var(--neg)";
      }
    } else {
      rDM.set("—"); rIS.set("—"); rDR.set("—");
    }
  }

  function updateChallengeState() {
    if (dists.IS.length < 5) return;
    const isBias = Math.abs(mean(dists.IS) - trueValue);
    const drBias = Math.abs(mean(dists.DR) - trueValue);
    if (state.confStr < 0.1 && isBias < 0.03 && drBias < 0.03) chalSeen0    = true;
    if (state.confStr > 1.5 && isBias > 0.04)                   chalSeenHigh = true;
    if (chalSeen0 && chalSeenHigh) {
      chal.setState(true,
        `Unconfounded: IS & DR ≈ unbiased on real RCT. ` +
        `Confounded (strength=${state.confStr.toFixed(1)}): IS drift ${
          (mean(dists.IS) - trueValue).toFixed(3)
        } — confirmed. Real data, real lesson.`
      );
    }
  }

  // ─── Main loop ────────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    streamTimer += dt;
    if (streamTimer > 0.08 && pendingLogs.length) {
      streamTimer = 0;
      drainOneLog();
    }
    updateReadouts();
    drawDist();
  });

  return () => stop();
}
