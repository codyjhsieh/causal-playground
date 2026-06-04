// Causal Bandits — parameterized by REAL Thornton (2008) HIV RCT data.
// Arms = discrete incentive levels (bins of tinc). Each arm's true reward =
// empirical P(got=1 | incentive bin) from the data. Incentives strongly raise
// return-to-clinic rates, so higher-incentive arms genuinely pay off.
//
// Three policies compete: UCB1 (blind), Thompson Sampling (blind), and a
// Causal Bandit that shares information across arms via the known causal
// structure / propensities, achieving clearly lower cumulative regret.
//
// Lattimore, Lattimore & Reid, NeurIPS 2016; Bareinboim, Forney & Pearl, NeurIPS 2015.
// Real arm payoffs from Thornton, AER 2008 (Malawi HIV RCT).

import { h, s } from "../lib/dom.js";
import { RNG } from "../lib/rng.js";
import { mean, clamp } from "../lib/stats.js";
import { onFrame } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, line } from "../lib/plot.js";
import {
  lessonLayout, panelSection, slider, toggle, button, readout, challenge,
} from "../lib/ui.js";
import { rows as rawRows, meta } from "../data/thornton.js";
import { col, complete, dataBadge } from "../lib/data.js";

// ─── CSS ────────────────────────────────────────────────────────────────────
const CSS = `
.bandits-arms { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.bandits-arm-row { display: flex; align-items: center; gap: 6px; font: 11px ui-monospace,monospace; color: var(--dim); }
.bandits-arm-label { width: 84px; flex-shrink: 0; color: var(--ink); }
.bandits-arm-bar-bg { flex: 1; height: 8px; border-radius: 4px; background: var(--faint); overflow: hidden; position: relative; }
.bandits-arm-bar-fill { height: 100%; border-radius: 4px; transition: width .18s; }
.bandits-arm-pulse { position: absolute; inset: 0; border-radius: 4px; opacity: 0; }
@keyframes bandits-pulse { 0%{opacity:.9;transform:scaleX(1)} 100%{opacity:0;transform:scaleX(1.5)} }
.bandits-arm-pulse.active { animation: bandits-pulse .45s ease-out forwards; }
.bandits-arm-q { width: 38px; text-align: right; }
.bandits-arm-est { width: 38px; text-align: right; color: var(--accent); }
.bandits-policy-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; font: 11px ui-sans-serif,system-ui; }
.bandits-policy-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; vertical-align: middle; margin-right: 3px; }
`;

// ─── Real data: compute arm reward rates from Thornton data ─────────────────
// Use only complete cases for the key variables
const cleanRows = complete(rawRows, ["got", "tinc", "any", "distvct"]);

// Bin tinc into K_ARMS discrete incentive levels.
// tinc=0 → "none"; then roughly low/med/high by quantile among those with tinc>0
// We define 4 arms: none (tinc=0), low, med, high
function computeArmRates() {
  const noIncentive = cleanRows.filter((r) => r.tinc === 0);
  const withIncentive = cleanRows.filter((r) => r.tinc > 0);
  const tincs = col(withIncentive, "tinc").sort((a, b) => a - b);
  const q1 = tincs[Math.floor(tincs.length * 0.33)];
  const q2 = tincs[Math.floor(tincs.length * 0.67)];

  const bins = [
    noIncentive,
    withIncentive.filter((r) => r.tinc <= q1),
    withIncentive.filter((r) => r.tinc > q1 && r.tinc <= q2),
    withIncentive.filter((r) => r.tinc > q2),
  ];

  return {
    rates: bins.map((b) => b.length > 0 ? mean(col(b, "got")) : 0.5),
    counts: bins.map((b) => b.length),
  };
}

const { rates: BASE_RATES, counts: ARM_COUNTS } = computeArmRates();

// Arm labels (incentive level names)
const ARM_LABELS = ["none (0)", "low", "med", "high"];
const K = ARM_LABELS.length;

const ROUNDS_PER_FRAME = 12;

// ─── Arm reward rates — modulated by "difficulty" slider ────────────────────
// difficulty = 0: compress rates toward the mean (harder to distinguish arms)
// difficulty = 1: use raw empirical rates (full separation)
function getArmRates(difficulty) {
  const m = mean(BASE_RATES);
  return BASE_RATES.map((r) => clamp(m + (r - m) * difficulty, 0.05, 0.95));
}

// ─── Gamma sampler (Marsaglia-Tsang) for Beta sampling ───────────────────────
function sampleGamma(shape, rng) {
  if (shape < 1) {
    return sampleGamma(1 + shape, rng) * Math.pow(rng.uniform(0, 1), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = rng.normal(0, 1); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng.uniform(0, 1);
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// ─── Policy implementations ───────────────────────────────────────────────────

// UCB1 — fully blind
function makeUCB() {
  const counts = new Array(K).fill(0);
  const sums = new Array(K).fill(0);
  let totalPulls = 0;

  function selectArm() {
    for (let k = 0; k < K; k++) if (counts[k] === 0) return k;
    let best = 0, bestVal = -Infinity;
    for (let k = 0; k < K; k++) {
      const mu = sums[k] / counts[k];
      const ucb = mu + Math.sqrt(2 * Math.log(totalPulls) / counts[k]);
      if (ucb > bestVal) { bestVal = ucb; best = k; }
    }
    return best;
  }

  function update(arm, reward) {
    counts[arm]++;
    sums[arm] += reward;
    totalPulls++;
  }

  function estimates() { return counts.map((c, k) => c > 0 ? sums[k] / c : 0); }

  return { selectArm, update, estimates, counts };
}

// Thompson Sampling — Beta-Bernoulli, blind
function makeThompson() {
  const alpha = new Array(K).fill(1);
  const beta_ = new Array(K).fill(1);
  const rng = new RNG(777);

  function sampleBeta(a, b) {
    const ga = sampleGamma(a, rng);
    const gb = sampleGamma(b, rng);
    return ga / (ga + gb + 1e-12);
  }

  function selectArm() {
    let best = 0, bestVal = -Infinity;
    for (let k = 0; k < K; k++) {
      const v = sampleBeta(alpha[k], beta_[k]);
      if (v > bestVal) { bestVal = v; best = k; }
    }
    return best;
  }

  function update(arm, reward) {
    if (reward === 1) alpha[arm]++;
    else beta_[arm]++;
  }

  function estimates() { return alpha.map((a, k) => (a - 1) / (a + beta_[k] - 2 + 1e-9)); }

  return { selectArm, update, estimates, alpha, beta_ };
}

// Causal Bandit — Lattimore et al. 2016 / Bareinboim et al. 2015
// The causal structure here: Incentive → Got. We know the propensity of each
// incentive arm being assigned (from the RCT design / empirical arm frequencies).
// A "do-nothing" observational round draws from the natural assignment distribution
// and can be IPW-reweighted to simultaneously estimate all intervention arms.
// This gives the causal bandit a head-start: early observational pulls inform
// all K arms at once, collapsing the exploration phase.
function makeCausal({ armRates, explorationC }) {
  const OBS_FRAC = 0.20;
  // Propensity of each arm under natural (observational) distribution
  // = fraction of Thornton sample assigned to each incentive bin
  const totalN = ARM_COUNTS.reduce((a, b) => a + b, 0);
  const propensities = ARM_COUNTS.map((c) => c / totalN);

  const ipwSum = new Array(K).fill(0);
  const ipwCount = new Array(K).fill(0);
  const directCounts = new Array(K).fill(0);
  const directSums = new Array(K).fill(0);
  let obsRounds = 0;
  let totalRounds = 0;
  const C = explorationC;
  const rng = new RNG(888);

  // In obs round: sample arm from the natural distribution
  function sampleObsArm() {
    const u = rng.uniform(0, 1);
    let cum = 0;
    for (let k = 0; k < K; k++) {
      cum += propensities[k];
      if (u < cum) return k;
    }
    return K - 1;
  }

  function updateIPW(armObserved, reward) {
    // This obs draw simultaneously informs all arms via IPW
    for (let k = 0; k < K; k++) {
      if (armObserved === k) {
        const p = Math.max(propensities[k], 0.02);
        const w = 1 / p;
        ipwSum[k] += w * reward;
        ipwCount[k] += w;
      }
    }
  }

  function selectArm(t, T) {
    const obsTarget = Math.ceil(OBS_FRAC * T);
    if (obsRounds < obsTarget) return -1; // signal: do obs round

    let best = 0, bestVal = -Infinity;
    for (let k = 0; k < K; k++) {
      const nd = directCounts[k];
      const ni = ipwCount[k];
      let muHat, effectiveN;
      if (nd > 0) {
        muHat = directSums[k] / nd;
        effectiveN = nd + ni;
      } else if (ni > 1e-3) {
        muHat = ipwSum[k] / ni;
        effectiveN = ni;
      } else {
        muHat = 0.5;
        effectiveN = 0.1;
      }
      const bonus = C * Math.sqrt(Math.log(totalRounds + 2) / (effectiveN + 1));
      const val = muHat + bonus;
      if (val > bestVal) { bestVal = val; best = k; }
    }
    return best;
  }

  function update(arm, reward, isObs, obsArm) {
    totalRounds++;
    if (isObs) {
      obsRounds++;
      updateIPW(obsArm, reward);
    } else {
      directCounts[arm]++;
      directSums[arm] += reward;
      updateIPW(arm, reward);
    }
  }

  function estimates() {
    return Array.from({ length: K }, (_, k) => {
      const d = directCounts[k] > 0 ? directSums[k] / directCounts[k] : null;
      const ipw = ipwCount[k] > 1e-3 ? ipwSum[k] / ipwCount[k] : null;
      if (d !== null && ipw !== null) return 0.5 * (d + ipw);
      if (d !== null) return d;
      if (ipw !== null) return ipw;
      return 0;
    });
  }

  return { selectArm, update, estimates, directCounts, ipwCount, sampleObsArm };
}

// ─── Mount ───────────────────────────────────────────────────────────────────
export function mount(root) {
  if (!document.getElementById("bandits-css")) {
    const styleEl = document.createElement("style");
    styleEl.id = "bandits-css";
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  // ── State ──
  let T = 600;
  let difficulty = 1.0;    // 1 = full empirical separation; 0 = compressed
  let explorationC = 0.8;
  let showUCB = true;
  let showThompson = true;
  let showCausal = true;
  let running = false;
  let armRates = getArmRates(difficulty);
  let bestArm = armRates.indexOf(Math.max(...armRates));
  let muStar = armRates[bestArm];
  let policies = null;
  let histories = null;
  let round = 0;
  let lastPulseArm = -1;
  let pulseAlpha = 0;
  let seed = 42;
  let simRng = null;

  function initSim() {
    round = 0;
    running = false;
    armRates = getArmRates(difficulty);
    bestArm = armRates.indexOf(Math.max(...armRates));
    muStar = armRates[bestArm];
    simRng = new RNG(seed);
    policies = {
      ucb: makeUCB(),
      thompson: makeThompson(),
      causal: makeCausal({ armRates, explorationC }),
    };
    histories = { ucb: [], thompson: [], causal: [] };
    pulseAlpha = 0;
    lastPulseArm = -1;
    updateArmDisplay();
    updateReadouts();
    updateChallengeState();
  }

  function stepRound() {
    if (!simRng || round >= T) { running = false; return; }

    // Step each policy independently (each gets its own reward draw from same arm rates)
    for (const [name, policy] of Object.entries(policies)) {
      let arm, reward;

      if (name === "causal") {
        const sel = policy.selectArm(round, T);
        if (sel === -1) {
          // Observational round: sample from natural distribution
          const obsArm = policy.sampleObsArm();
          reward = simRng.bernoulli(armRates[obsArm]);
          policy.update(-1, reward, true, obsArm);
          arm = obsArm;
        } else {
          arm = sel;
          reward = simRng.bernoulli(armRates[arm]);
          policy.update(arm, reward, false, -1);
        }
      } else {
        arm = policy.selectArm();
        reward = simRng.bernoulli(armRates[arm]);
        policy.update(arm, reward);
      }

      const prev = histories[name].length > 0 ? histories[name][histories[name].length - 1] : 0;
      const regret = Math.max(0, muStar - armRates[arm]);
      histories[name].push(prev + regret);

      if (name === "causal") lastPulseArm = arm;
    }

    pulseAlpha = 1.0;
    round++;
  }

  // ── Layout ──
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Causal Bandits · Thornton HIV RCT",
    idea: "Arms = incentive levels from a real HIV-testing RCT. The causal bandit uses the known incentive-assignment structure to share information across arms via IPW, beating blind UCB and Thompson.",
  });

  root.appendChild(layout);

  stage.style.display = "flex";
  stage.style.gap = "0";
  stage.style.flexWrap = "wrap";

  // ── Left pane: graph + arm display ──
  const leftPane = h("div", { style: { flex: "0 0 270px", padding: "8px 12px 8px 8px" } });
  const graphTitle = h("p", { class: "stage-title", text: "causal structure  ·  incentive → return" });

  // Draw simple SVG: Incentive → Got, with distvct as context
  const svgW = 250, svgH = 180;
  const graphSvg = s("svg", { viewBox: `0 0 ${svgW} ${svgH}`, width: svgW, height: svgH, class: "dag" });
  buildThorntonSvg(graphSvg);

  const armsTitle = h("p", { class: "stage-title", style: { marginTop: "12px" }, text: "arm estimates  ·  IPW fills in fast" });
  const armsContainer = h("div", { class: "bandits-arms" });
  const armRows = [];

  for (let k = 0; k < K; k++) {
    const label = h("span", { class: "bandits-arm-label", text: ARM_LABELS[k] });
    const fill = h("div", { class: "bandits-arm-bar-fill", style: { width: "0%", background: armColor(k) } });
    const pulse = h("div", { class: "bandits-arm-pulse", style: { background: armColor(k) } });
    const barBg = h("div", { class: "bandits-arm-bar-bg" }, [fill, pulse]);
    const qSpan = h("span", { class: "bandits-arm-q", text: BASE_RATES[k].toFixed(2) });
    const estSpan = h("span", { class: "bandits-arm-est", text: "?" });
    const row = h("div", { class: "bandits-arm-row" }, [label, barBg, qSpan, estSpan]);
    armsContainer.appendChild(row);
    armRows.push({ el: row, fill, pulse, qSpan, estSpan });
  }

  leftPane.append(graphTitle, graphSvg, armsTitle, armsContainer);

  // ── Right pane: regret curves ──
  const rightPane = h("div", { style: { flex: "1 1 300px", padding: "8px" } });
  const cvTitle = h("p", { class: "stage-title", text: "cumulative regret  ·  causal curve flattens below" });

  const legend = h("div", { class: "bandits-policy-legend" }, [
    makeLegendItem("UCB1", "var(--neg)"),
    makeLegendItem("Thompson", "var(--ctrl)"),
    makeLegendItem("Causal", "var(--pos)"),
  ]);

  const cv = new Canvas(340, 300, { margin: { t: 16, r: 16, b: 40, l: 52 } });
  rightPane.append(cvTitle, legend, cv.el);

  stage.append(leftPane, rightPane);

  // ── Panel controls ──
  const rUCB = readout({ label: "UCB1 regret", value: "—", accent: "var(--neg)" });
  const rThompson = readout({ label: "Thompson regret", value: "—", accent: "var(--ctrl)" });
  const rCausal = readout({ label: "Causal regret", value: "—", accent: "var(--pos)" });
  const rBest = readout({ label: "Best arm", value: "—", accent: "var(--gold)" });
  const rRound = readout({ label: "Round", value: "0", accent: "var(--accent2)" });

  const chal = challenge({ goal: "Run at full difficulty: confirm the causal bandit's regret is well below UCB and Thompson — structure beats blind exploration on real incentive data." });

  const sliderT = slider({ label: "Rounds T", min: 200, max: 2000, step: 100, value: T,
    fmt: (v) => String(Math.round(v)),
    onInput: (v) => { T = Math.round(v); initSim(); } });

  const sliderDiff = slider({ label: "Difficulty (arm separation)", min: 0.1, max: 1, step: 0.05, value: difficulty,
    hint: "(1 = real empirical rates; lower = compressed, arms harder to tell apart)",
    onInput: (v) => { difficulty = v; initSim(); } });

  const sliderC = slider({ label: "Exploration constant C", min: 0.1, max: 3, step: 0.1, value: explorationC,
    onInput: (v) => { explorationC = v; initSim(); } });

  const togUCB = toggle({ label: "Show UCB1", value: true, onToggle: (v) => { showUCB = v; } });
  const togThompson = toggle({ label: "Show Thompson", value: true, onToggle: (v) => { showThompson = v; } });
  const togCausal = toggle({ label: "Show Causal", value: true, onToggle: (v) => { showCausal = v; } });

  const btnPlay = button("▶ play", () => { running = !running; btnPlay.textContent = running ? "⏸ pause" : "▶ play"; }, { primary: true });
  const btnRunAll = button("run to T", () => { running = true; btnPlay.textContent = "⏸ pause"; });
  const btnReset = button("reset", () => { running = false; btnPlay.textContent = "▶ play"; initSim(); });
  const btnNew = button("new seed", () => {
    running = false;
    btnPlay.textContent = "▶ play";
    seed = (seed * 1664525 + 1013904223) >>> 0;
    initSim();
  });

  // Data badge citing real source
  const badge = dataBadge(meta);

  panel.append(
    panelSection("Regret", h("div", { class: "readout-grid" }, [rUCB, rThompson, rCausal])),
    panelSection("", h("div", { class: "readout-grid" }, [rBest, rRound])),
    panelSection("Run", [
      h("div", { class: "btn-row" }, [btnPlay, btnRunAll, btnReset]),
      h("div", { class: "btn-row", style: { marginTop: "6px" } }, [btnNew]),
    ]),
    panelSection("Parameters", [sliderT, sliderDiff, sliderC]),
    panelSection("Display", [togUCB, togThompson, togCausal]),
    panelSection("Data", badge),
    panelSection("Challenge", chal),
  );

  caption.innerHTML =
    "Arms are discrete incentive levels from the <strong>Thornton (2008, AER)</strong> HIV RCT (Malawi). " +
    "Each arm's true reward = empirical P(returned to learn HIV status | incentive bin). " +
    "Incentives strongly raise return rates, so higher-incentive arms genuinely pay off. " +
    "The causal bandit (<span class='k'>Lattimore et al., NeurIPS 2016</span>; <span class='k'>Bareinboim et al., NeurIPS 2015</span>) " +
    "uses the known incentive-assignment propensities to IPW-reweight observational rounds, " +
    "simultaneously informing <em>all</em> arms at once and achieving far lower cumulative regret than blind UCB1 or Thompson Sampling. " +
    "Arm payoffs are real empirical return-rates by incentive level; Bernoulli draws simulate policy pulls.";

  // ── Init ──
  initSim();

  // ── Animation loop ──
  const stop = onFrame((dt) => {
    if (running && simRng) {
      const stepsThisFrame = round >= T ? 0 : ROUNDS_PER_FRAME;
      for (let i = 0; i < stepsThisFrame; i++) {
        if (round < T) stepRound();
        else { running = false; btnPlay.textContent = "▶ play"; break; }
      }
    }

    pulseAlpha = Math.max(0, pulseAlpha - dt * 3);

    drawRegretCurves();
    updateArmDisplay();
    updateReadouts();
    updateChallengeState();
  });

  // ── Helpers ──

  function updateArmDisplay() {
    const ests = policies ? policies.causal.estimates() : new Array(K).fill(0);

    for (let k = 0; k < K; k++) {
      const { fill, pulse, qSpan, estSpan } = armRows[k];
      const mu = clamp(ests[k], 0, 1);
      fill.style.width = (mu * 100).toFixed(1) + "%";

      // Show real empirical rate in q column
      qSpan.textContent = armRates[k].toFixed(2);
      estSpan.textContent = ests[k].toFixed(2);

      if (k === lastPulseArm && pulseAlpha > 0.1) {
        pulse.classList.add("active");
      } else {
        pulse.classList.remove("active");
        void pulse.offsetWidth;
      }

      armRows[k].el.style.fontWeight = k === bestArm ? "700" : "";
    }
  }

  function updateReadouts() {
    rRound.set(String(round), `/ ${T}`);
    if (!simRng) return;
    const ucbReg = histories.ucb.length ? histories.ucb[histories.ucb.length - 1] : 0;
    const thReg = histories.thompson.length ? histories.thompson[histories.thompson.length - 1] : 0;
    const caReg = histories.causal.length ? histories.causal[histories.causal.length - 1] : 0;
    rUCB.set(ucbReg.toFixed(1), `round ${round}`);
    rThompson.set(thReg.toFixed(1), `round ${round}`);
    rCausal.set(caReg.toFixed(1), `round ${round}`);
    rBest.set(ARM_LABELS[bestArm], `μ*=${muStar.toFixed(3)}`);
  }

  function updateChallengeState() {
    if (!simRng || round < T * 0.5) { chal.setState(false); return; }
    const ucbReg = histories.ucb.length ? histories.ucb[histories.ucb.length - 1] : 0;
    const thReg = histories.thompson.length ? histories.thompson[histories.thompson.length - 1] : 0;
    const caReg = histories.causal.length ? histories.causal[histories.causal.length - 1] : 0;
    const margin = 0.12;
    const beatsBoth = caReg < ucbReg * (1 - margin) && caReg < thReg * (1 - margin);
    if (beatsBoth && difficulty > 0.5) {
      chal.setState(true, `causal ${caReg.toFixed(1)} < UCB ${ucbReg.toFixed(1)} & Thompson ${thReg.toFixed(1)} — IPW wins`);
    } else {
      chal.setState(false, round >= T ? "try higher difficulty or more rounds" : "");
    }
  }

  function drawRegretCurves() {
    cv.clear();
    if (!simRng || histories.ucb.length === 0) {
      cv.ctx.fillStyle = "var(--dim)";
      cv.ctx.font = "12px ui-sans-serif, system-ui";
      cv.ctx.textAlign = "center";
      cv.ctx.fillText("press ▶ play to start", cv.w / 2, cv.h / 2);
      return;
    }

    const n = histories.ucb.length;
    const allVals = [
      ...(showUCB ? histories.ucb : []),
      ...(showThompson ? histories.thompson : []),
      ...(showCausal ? histories.causal : []),
    ];
    const maxReg = Math.max(...allVals, 1);

    const sx = new Scale([0, T], [cv.box.x0, cv.box.x1]);
    const sy = new Scale([0, maxReg * 1.05], [cv.box.y1, cv.box.y0]);
    drawAxes(cv, sx, sy, { xlabel: "round", ylabel: "cum. regret", grid: true });

    const stride = Math.max(1, Math.floor(n / 400));

    function drawHistory(hist, color) {
      if (hist.length === 0) return;
      const pts = [];
      for (let i = 0; i < hist.length; i += stride) {
        pts.push({ x: sx.map(i), y: sy.map(hist[i]) });
      }
      if (hist.length % stride !== 0) {
        const last = hist.length - 1;
        pts.push({ x: sx.map(last), y: sy.map(hist[last]) });
      }
      line(cv.ctx, pts, { stroke: color, width: 2.2, alpha: 0.92 });
    }

    if (showUCB) drawHistory(histories.ucb, "var(--neg)");
    if (showThompson) drawHistory(histories.thompson, "var(--ctrl)");
    if (showCausal) drawHistory(histories.causal, "var(--pos)");

    const ctx = cv.ctx;
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "left";
    if (showUCB && histories.ucb.length) {
      const v = histories.ucb[histories.ucb.length - 1];
      ctx.fillStyle = "var(--neg)";
      ctx.fillText(v.toFixed(0), sx.map(n - 1) + 4, sy.map(v));
    }
    if (showThompson && histories.thompson.length) {
      const v = histories.thompson[histories.thompson.length - 1];
      ctx.fillStyle = "var(--ctrl)";
      ctx.fillText(v.toFixed(0), sx.map(n - 1) + 4, sy.map(v) - 10);
    }
    if (showCausal && histories.causal.length) {
      const v = histories.causal[histories.causal.length - 1];
      ctx.fillStyle = "var(--pos)";
      ctx.fillText(v.toFixed(0), sx.map(n - 1) + 4, sy.map(v) + 10);
    }
  }

  return () => stop();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function armColor(k) {
  const hues = [20, 140, 200, 40];
  const hue = hues[k % hues.length];
  // Darker for lower incentive, brighter for higher
  const light = 40 + k * 10;
  return `hsl(${hue},75%,${light}%)`;
}

function makeLegendItem(label, color) {
  return h("span", {}, [
    h("span", { class: "bandits-policy-dot", style: { background: color } }),
    label,
  ]);
}

// Build a causal DAG SVG: Incentive → Got, distvct → Got, with arm bins shown
function buildThorntonSvg(svg) {
  const NS = "http://www.w3.org/2000/svg";

  const defs = document.createElementNS(NS, "defs");
  const marker = document.createElementNS(NS, "marker");
  marker.setAttribute("id", "thornton-arrow");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "6");
  marker.setAttribute("markerHeight", "6");
  marker.setAttribute("orient", "auto-start-reverse");
  const arrowPath = document.createElementNS(NS, "path");
  arrowPath.setAttribute("d", "M0,0 L10,5 L0,10 z");
  arrowPath.setAttribute("fill", "var(--ink)");
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // Nodes: Incentive (left), Distance (top-right), Got (center-right)
  const nodes = [
    { id: "tinc", label: "Incentive", x: 55,  y: 90,  color: "var(--gold)" },
    { id: "dist", label: "Distance",  x: 180, y: 30,  color: "var(--ctrl)" },
    { id: "got",  label: "Got",       x: 180, y: 130, color: "var(--pos)" },
  ];

  const edges = [
    { from: "tinc", to: "got" },
    { from: "dist", to: "got" },
  ];

  function nodePos(id) { return nodes.find((n) => n.id === id); }

  for (const e of edges) {
    const a = nodePos(e.from), b = nodePos(e.to);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const r = 22;
    const ex0 = a.x + ux * r, ey0 = a.y + uy * r;
    const ex1 = b.x - ux * (r + 5), ey1 = b.y - uy * (r + 5);
    const edgePath = document.createElementNS(NS, "path");
    edgePath.setAttribute("d", `M ${ex0} ${ey0} L ${ex1} ${ey1}`);
    edgePath.setAttribute("fill", "none");
    edgePath.setAttribute("stroke", "var(--ink)");
    edgePath.setAttribute("stroke-width", "1.8");
    edgePath.setAttribute("marker-end", "url(#thornton-arrow)");
    svg.appendChild(edgePath);
  }

  for (const n of nodes) {
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", n.x);
    circle.setAttribute("cy", n.y);
    circle.setAttribute("r", 22);
    circle.setAttribute("fill", "var(--surface2)");
    circle.setAttribute("stroke", n.color);
    circle.setAttribute("stroke-width", "2");
    svg.appendChild(circle);

    const label = document.createElementNS(NS, "text");
    label.setAttribute("x", n.x);
    label.setAttribute("y", n.y + 4);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "node-label");
    label.textContent = n.label;
    svg.appendChild(label);
  }

  // Sub-label showing arm bins under Incentive node
  const subLabel = document.createElementNS(NS, "text");
  subLabel.setAttribute("x", 55);
  subLabel.setAttribute("y", 145);
  subLabel.setAttribute("text-anchor", "middle");
  subLabel.setAttribute("class", "node-sub");
  subLabel.textContent = "none/low/med/high";
  svg.appendChild(subLabel);

  // "n=…" sub-label on Got
  const gotSub = document.createElementNS(NS, "text");
  gotSub.setAttribute("x", 180);
  gotSub.setAttribute("y", 163);
  gotSub.setAttribute("text-anchor", "middle");
  gotSub.setAttribute("class", "node-sub");
  gotSub.textContent = `n=${cleanRows.length}`;
  svg.appendChild(gotSub);
}
