// Interference & Spillovers — SUTVA violation in the Cai, de Janvry & Sadoulet
// (2015) weather-insurance RCT in rural China. When one villager gets the
// intensive information session, their NEIGHBORS also become more likely to buy
// insurance. That peer channel (a) biases the naive treated-vs-control gap and
// (b) hides the program's biggest benefit. The fix: exposure mapping — model
// each person's outcome as a function of BOTH their own treatment and their
// village's treatment saturation (leave-one-out fraction of peers intensively
// treated). The spillover coefficient from that regression is large, positive,
// and separable from the direct effect, so the total value of treating everyone
// far exceeds what the naive ITT number suggests.
//
// Data: Cai, de Janvry & Sadoulet, AEJ:Applied 2015 — rural Chinese villages,
// two-stage RCT (villages → households within village).

import { h } from "../lib/dom.js";
import { mean, olsMulti, clamp } from "../lib/stats.js";
import { RNG } from "../lib/rng.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot } from "../lib/plot.js";
import {
  lessonLayout, panelSection, slider, button, readout, challenge, note,
} from "../lib/ui.js";
import { rows, meta } from "../data/insure.js";
import { col, complete, dataBadge } from "../lib/data.js";

// ---------------------------------------------------------------------------
// 1. DATA PREP
// ---------------------------------------------------------------------------

// Keep rows where core fields exist.
const DATA = complete(rows, ["village", "takeup_survey", "intensive"]);

// Build a village index: village name → array of row indices.
const villageIndex = new Map();
for (let i = 0; i < DATA.length; i++) {
  const v = DATA[i].village;
  if (!villageIndex.has(v)) villageIndex.set(v, []);
  villageIndex.get(v).push(i);
}
const villageNames = [...villageIndex.keys()];

// Leave-one-out peer exposure: fraction of OTHER villagers intensively treated.
// This is the spillover channel (exposure mapping).
const peerExposure = new Array(DATA.length).fill(0);
for (const [, idxs] of villageIndex) {
  const n = idxs.length;
  if (n < 2) continue;
  const totalIntensive = idxs.reduce((s, i) => s + DATA[i].intensive, 0);
  for (const i of idxs) {
    const othersN  = n - 1;
    const othersInt = totalIntensive - DATA[i].intensive;
    peerExposure[i] = othersN > 0 ? othersInt / othersN : 0;
  }
}

// Safe covariate fallback (some rows may be missing age/risk_averse/literacy).
function safeVal(r, key, fallback = 0) {
  const v = r[key];
  return v != null && !Number.isNaN(v) ? v : fallback;
}

// ---------------------------------------------------------------------------
// 2. ESTIMANDS (computed once from real data)
// ---------------------------------------------------------------------------

// Naive ITT: mean(takeup | intensive=1) − mean(takeup | intensive=0).
// Ignores spillovers entirely.
const yAll    = col(DATA, "takeup_survey");
const dAll    = col(DATA, "intensive");
const treatedY = yAll.filter((_, i) => dAll[i] === 1);
const controlY = yAll.filter((_, i) => dAll[i] === 0);
const NAIVE    = mean(treatedY) - mean(controlY);

// Exposure-mapping regression:
//   takeup ~ 1 + intensive + peer_exposure + age_z + male + risk_averse + literacy
// beta[1] = direct effect (own intensive), beta[2] = spillover (peer exposure).
const ageMean = mean(DATA.map((r) => safeVal(r, "age", 55)));
const ageSD   = Math.sqrt(
  DATA.map((r) => safeVal(r, "age", 55)).reduce((s, v) => s + (v - ageMean) ** 2, 0) / DATA.length
) || 1;

const X_reg = DATA.map((r, i) => [
  1,                                         // intercept
  DATA[i].intensive,                         // own treatment
  peerExposure[i],                           // peer exposure (spillover channel)
  (safeVal(r, "age", ageMean) - ageMean) / ageSD,
  safeVal(r, "male", 0.5),
  safeVal(r, "risk_averse", 0),
  safeVal(r, "literacy", 0.5),
]);
const Y_reg = yAll;
const fit   = olsMulti(X_reg, Y_reg);
// beta: [intercept, direct, spillover, age_z, male, risk_averse, literacy]
const DIRECT   = fit.beta[1];  // own-intensive coefficient
const SPILLOVER = fit.beta[2]; // peer-exposure coefficient
// Total effect at full saturation (exposure = 1) vs no-treatment baseline:
// direct + spillover * 1 (own treated, all peers treated)
const TOTAL = DIRECT + SPILLOVER;

// ---------------------------------------------------------------------------
// 3. VILLAGE DISPLAY (network / cluster view)
// ---------------------------------------------------------------------------

// Pick up to 6 representative villages for the animated view — mix of sizes.
const DISPLAY_VILLAGES = (function () {
  const sorted = villageNames
    .map((v) => ({ v, n: villageIndex.get(v).length }))
    .filter((x) => x.n >= 6 && x.n <= 30)
    .sort((a, b) => a.n - b.n);
  // pick ~6 spread across the size range
  const picks = [];
  const step = Math.max(1, Math.floor(sorted.length / 6));
  for (let i = 0; i < sorted.length && picks.length < 6; i += step) {
    picks.push(sorted[i].v);
  }
  return picks;
})();

// For each display village, build a static cluster layout (hexagonal packing).
function buildCluster(villageName, cx, cy, rng) {
  const idxs = villageIndex.get(villageName);
  const persons = idxs.map((i) => ({
    intensive: DATA[i].intensive,
    takeup:    DATA[i].takeup_survey,
    exposure:  peerExposure[i],
    age:       safeVal(DATA[i], "age", 55),
    // layout
    px: 0, py: 0,   // pixel position within cluster (set below)
    // animated state
    glowT: 0,        // 0→1: info-ripple glow progress
  }));

  // Hexagonal spiral layout within a circle of radius ~30px.
  const R = Math.min(28, 5 + persons.length * 1.5);
  for (let i = 0; i < persons.length; i++) {
    const angle = i * 2.399963 + rng.uniform(-0.1, 0.1);  // golden-angle spiral
    const r2    = R * Math.sqrt(i / Math.max(1, persons.length - 1));
    persons[i].px = cx + r2 * Math.cos(angle);
    persons[i].py = cy + r2 * Math.sin(angle);
  }
  return { name: villageName, cx, cy, persons, n: persons.length };
}

// ---------------------------------------------------------------------------
// 4. MODULE MOUNT
// ---------------------------------------------------------------------------

export function mount(root) {
  const rng = new RNG(77);

  // Slider state: village treatment saturation (0→1).
  // At saturation s: each person i has own_treated = intensive (real),
  // but we override peer_exposure to s for the prediction.
  let saturation = mean(peerExposure);   // start at the real empirical mean
  let rippleT = 0;   // 0→1 ripple sweep progress; advances in onFrame
  let challengeDone = false;

  // Build cluster positions: 2 rows of 3 villages.
  const STAGE_W = 560, STAGE_H = 420;
  const clusters = DISPLAY_VILLAGES.map((v, i) => {
    const col_ = i % 3;
    const row_ = Math.floor(i / 3);
    const cx   = 90 + col_ * 190;
    const cy   = 100 + row_ * 200;
    return buildCluster(v, cx, cy, rng);
  });

  // Springs for smooth saturation-driven glow.
  const glowSpring = new Spring(saturation, { stiffness: 40, damping: 9 });

  // ---- Layout ----------------------------------------------------------------
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Interference & Spillovers",
    idea: "SUTVA assumes one person's treatment doesn't affect another's outcome. In village RCTs that assumption is often wrong: information learned by treated households leaks to untreated neighbors. Ignoring the spillover both mis-estimates the direct effect and hides the program's biggest benefit.",
  });

  // Stage: network canvas + bar chart canvas
  const cvNet  = new Canvas(STAGE_W, STAGE_H, { margin: { t: 10, r: 10, b: 8, l: 10 } });
  cvNet.el.style.display = "block";
  const cvBar  = new Canvas(STAGE_W, 170, { margin: { t: 20, r: 20, b: 44, l: 58 } });
  cvBar.el.style.display = "block";

  stage.append(
    h("p", { class: "stage-title", text: "village clusters · glowing dots = intensively treated · ring brightness = takeup · drag saturation slider" }),
    cvNet.el,
    h("p", { class: "stage-title", text: "effect decomposition (regressed from real data)" }),
    cvBar.el,
  );

  // Panel controls & readouts ---------------------------------------------------
  const rNaive    = readout({ label: "Naive ITT",         value: NAIVE.toFixed(3),     accent: "var(--neg)"    });
  const rDirect   = readout({ label: "Direct effect",     value: DIRECT.toFixed(3),    accent: "var(--treat)"  });
  const rSpillover= readout({ label: "Spillover (peers)", value: SPILLOVER.toFixed(3), accent: "var(--gold)"   });
  const rTotal    = readout({ label: "Total (D+S)",       value: TOTAL.toFixed(3),     accent: "var(--pos)"    });
  const rPredTakeup = readout({ label: "Pred. takeup at slider saturation", value: "—", accent: "var(--ctrl)" });

  const satSlider = slider({
    label: "Village treatment saturation",
    min: 0, max: 1, step: 0.01, value: saturation,
    fmt: (v) => (v * 100).toFixed(0) + "%",
    onInput: (v) => {
      saturation = v;
      glowSpring.set(v);
      rippleT = 0;
    },
  });

  const chal = challenge({
    goal: "Move the saturation slider to 100% and observe: total effect (Direct + Spillover) exceeds the naive ITT — the program's true value was hidden by ignoring peer learning.",
  });

  const rippleBtn = button("▶ animate info spread", () => {
    rippleT = 0;
  }, { primary: true });

  panel.append(
    panelSection("Dataset", dataBadge(meta)),
    panelSection("Effect decomposition", h("div", { class: "readout-grid" }, [
      rNaive, rDirect, rSpillover, rTotal,
    ])),
    panelSection("Explore spillovers", [
      satSlider,
      rPredTakeup,
      note("Slider controls peer exposure fed to the regression model. Direct + Spillover = predicted benefit of treating everyone."),
      h("div", { class: "btn-row" }, [rippleBtn]),
      note("Click to animate how information ripples from treated (glowing) to untreated neighbors."),
    ]),
    panelSection("Challenge", chal),
  );

  caption.innerHTML =
    "<strong>Stable Unit Treatment Value Assumption (SUTVA)</strong> requires that each unit's " +
    "potential outcome depends only on its own treatment. The Cai et al. (2015) weather-insurance " +
    "RCT violates SUTVA: villagers share information, so having more intensively-treated " +
    "<em>neighbors</em> raises an untreated person's take-up. " +
    "Fix: <strong>exposure mapping</strong> (Hudgens &amp; Halloran 2008; Aronow &amp; Samii 2017) — " +
    "model <em>takeup ~ own_treatment + peer_saturation + covariates</em>; the peer coefficient is " +
    "the spillover effect. Ignoring it understates the program's value by conflating the " +
    "spillover-inflated control group with the true counterfactual. " +
    "<em>Cai, de Janvry &amp; Sadoulet 2015; Hudgens &amp; Halloran 2008 (interference); Aronow &amp; Samii 2017.</em>";

  root.appendChild(layout);

  // ---- Animation loop -------------------------------------------------------
  const stop = onFrame((dt) => {
    glowSpring.step(dt);

    // Ripple animation: advance 0→1 over ~2 s, then hold.
    rippleT = Math.min(1, rippleT + dt * 0.5);

    drawNetwork();
    drawBars();
    updateReadouts();
    updateChallenge();
  });

  // ---------------------------------------------------------------------------
  // DRAW: network village clusters
  // ---------------------------------------------------------------------------
  function drawNetwork() {
    cvNet.clear();
    const ctx = cvNet.ctx;
    const glow = glowSpring.value;  // 0=no peer exposure, 1=full saturation

    for (const cluster of clusters) {
      // Village label
      ctx.save();
      ctx.fillStyle = "var(--dim)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(cluster.name, cluster.cx, cluster.cy + 46);
      ctx.restore();

      // Draw edges between persons (sparse, thin — social network flavor).
      ctx.save();
      ctx.strokeStyle = "rgba(140,140,180,0.10)";
      ctx.lineWidth = 0.8;
      const ps = cluster.persons;
      for (let a = 0; a < ps.length; a++) {
        for (let b = a + 1; b < ps.length; b++) {
          const dx = ps[a].px - ps[b].px, dy = ps[a].py - ps[b].py;
          if (dx * dx + dy * dy < 900) {  // only connect neighbors within 30px
            ctx.beginPath();
            ctx.moveTo(ps[a].px, ps[a].py);
            ctx.lineTo(ps[b].px, ps[b].py);
            ctx.stroke();
          }
        }
      }
      ctx.restore();

      // Draw each person.
      for (const p of ps) {
        // Ripple: glow radiates from treated persons outward by distance.
        // Use polar angle from cluster center as proxy for spread order.
        const angle = Math.atan2(p.py - cluster.cy, p.px - cluster.cx);
        const normAngle = (angle + Math.PI) / (2 * Math.PI); // 0..1
        // Treated persons lead; untreated get glow only if rippleT advanced enough.
        let rippleGlow = 0;
        if (p.intensive) {
          rippleGlow = clamp(rippleT * 3, 0, 1);
        } else {
          // Untreated neighbors glow later in ripple, scaled by slider saturation.
          const delay = 0.3 + normAngle * 0.4;
          rippleGlow = clamp((rippleT - delay) * 2.5, 0, 1) * glow;
        }

        // Also: steady-state glow from slider (peer exposure model).
        const steadyGlow = p.intensive ? 1 : glow * 0.6;
        const effectiveGlow = Math.max(rippleGlow, steadyGlow);

        // Predicted takeup probability for this person given slider.
        const ownI = p.intensive;
        const peerE = saturation;  // slider controls peer exposure
        const predTakeup = clamp(
          fit.beta[0] + fit.beta[1] * ownI + fit.beta[2] * peerE,
          0, 1
        );

        // Color: treated = warm gold/amber; untreated = cool blue.
        // Ring color reflects predicted takeup (green = high).
        const baseColor = p.intensive
          ? `rgba(255,${Math.round(160 + effectiveGlow * 60)},60,${0.7 + effectiveGlow * 0.3})`
          : `rgba(80,${Math.round(140 + effectiveGlow * 60)},${Math.round(220 - effectiveGlow * 50)},${0.55 + effectiveGlow * 0.3})`;

        const r = 5.5;

        // Glow halo (for treated / high-exposure neighbors).
        if (effectiveGlow > 0.05) {
          ctx.save();
          const grad = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, r * (2.5 + effectiveGlow * 3));
          const haloColor = p.intensive ? "255,200,80" : "80,200,255";
          grad.addColorStop(0, `rgba(${haloColor},${effectiveGlow * 0.45})`);
          grad.addColorStop(1, `rgba(${haloColor},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.px, p.py, r * (2.5 + effectiveGlow * 3), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Main dot.
        dot(ctx, p.px, p.py, r, baseColor);

        // Takeup ring: green ring thickness proportional to predicted takeup.
        if (predTakeup > 0.1) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(p.px, p.py, r + 2, 0, Math.PI * 2 * predTakeup);
          ctx.strokeStyle = `rgba(60,220,140,${0.5 + predTakeup * 0.5})`;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }

        // Small center dot for actual historical takeup.
        if (p.takeup) {
          dot(ctx, p.px, p.py, 2, "rgba(255,255,255,0.85)");
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // DRAW: horizontal bar chart of effect components
  // ---------------------------------------------------------------------------
  function drawBars() {
    cvBar.clear();
    const ctx = cvBar.ctx;
    const b   = cvBar.box;

    // Four bars: naive, direct, spillover, total.
    const items = [
      { label: "Naive ITT",          value: NAIVE,      color: "var(--neg)"   },
      { label: "Direct effect",      value: DIRECT,     color: "var(--treat)" },
      { label: "Spillover (peers)",  value: SPILLOVER,  color: "var(--gold)"  },
      { label: "Total  D + S",       value: TOTAL,      color: "var(--pos)"   },
    ];

    const maxVal = Math.max(...items.map((x) => Math.abs(x.value)), 0.01) * 1.2;
    const sx = new Scale([0, maxVal], [b.x0, b.x1]);
    const barH = (b.y1 - b.y0) / items.length;

    // Axis.
    drawAxes(cvBar, sx, new Scale([0, 1], [b.y1, b.y0]), {
      xlabel: "effect on insurance take-up (OLS coefficient / mean difference)",
      grid: false,
      yticks: [],
    });

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const y0 = b.y0 + i * barH + 3;
      const yC = y0 + barH * 0.5;
      const barPx = Math.max(1, sx.map(Math.abs(it.value)) - b.x0);

      // Bar fill.
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = it.color;
      const barY = y0 + barH * 0.18;
      const barHh = barH * 0.55;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(b.x0, barY, barPx, barHh, 3);
        ctx.fill();
      } else {
        ctx.fillRect(b.x0, barY, barPx, barHh);
      }
      ctx.restore();

      // Label.
      ctx.save();
      ctx.fillStyle = "var(--ink)";
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(it.label, b.x0 + 4, yC - 2);
      ctx.restore();

      // Value annotation.
      ctx.save();
      ctx.fillStyle = it.color;
      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("+" + it.value.toFixed(3), b.x0 + barPx + 6, yC - 2);
      ctx.restore();
    }

    // Vertical zero line.
    ctx.save();
    ctx.strokeStyle = "var(--dim)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.x0, b.y0);
    ctx.lineTo(b.x0, b.y1);
    ctx.stroke();
    ctx.restore();

    // Annotation: "total > naive" bracket.
    const naivePx  = b.x0 + sx.map(NAIVE)  - sx.map(0);
    const totalPx  = b.x0 + sx.map(TOTAL)  - sx.map(0);
    const bracketY = b.y1 - 8;
    ctx.save();
    ctx.strokeStyle = "rgba(60,220,140,0.5)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(naivePx,  bracketY);
    ctx.lineTo(totalPx,  bracketY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(60,220,140,0.8)";
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("program undervalued by ignoring spillover", (naivePx + totalPx) / 2, bracketY - 10);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // READOUTS & CHALLENGE
  // ---------------------------------------------------------------------------
  function updateReadouts() {
    // Predicted average takeup if we treat everyone at slider saturation.
    // Average over the display data using the regression model.
    const nSample = Math.min(DATA.length, 400);
    let sumPred = 0;
    for (let i = 0; i < nSample; i++) {
      const r  = DATA[i];
      const ownI = r.intensive;
      const pred = clamp(
        fit.beta[0] + fit.beta[1] * ownI + fit.beta[2] * saturation +
        fit.beta[3] * ((safeVal(r, "age", ageMean) - ageMean) / ageSD) +
        fit.beta[4] * safeVal(r, "male", 0.5) +
        fit.beta[5] * safeVal(r, "risk_averse", 0) +
        fit.beta[6] * safeVal(r, "literacy", 0.5),
        0, 1
      );
      sumPred += pred;
    }
    const avgPred = sumPred / nSample;
    rPredTakeup.set(avgPred.toFixed(3), `at ${(saturation * 100).toFixed(0)}% peer saturation`);
  }

  function updateChallenge() {
    if (challengeDone) return;
    if (saturation >= 0.98 && TOTAL > NAIVE + 0.001) {
      challengeDone = true;
      chal.setState(true,
        `total effect ${TOTAL.toFixed(3)} > naive ITT ${NAIVE.toFixed(3)} — spillover adds ${(SPILLOVER).toFixed(3)} on top of the direct ${DIRECT.toFixed(3)}`
      );
    }
  }

  return () => stop();
}
