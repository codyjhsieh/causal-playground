// Potential Outcomes — the "two worlds" model grounded in REAL data.
// LaLonde NSW (1986) randomized job-training experiment: 185 treated, 260 control.
// Every unit carries two potential outcomes — Y(0) earnings without training,
// Y(1) earnings with training — but only ONE is observed.  The other is the
// counterfactual and is NEVER observed.  God-mode reveals modeled counterfactuals
// (mean of the opposite arm) to make the fundamental problem visceral.
// Because NSW is RANDOMIZED, the ATE IS identified ≈ +$1,794.
// Individual effects (ITEs) are NOT identified — only the average is.

import { h } from "../lib/dom.js";
import { mean } from "../lib/stats.js";
import { onFrame, tween, ease, lerp } from "../lib/anim.js";
import { Canvas, Scale, histogram } from "../lib/plot.js";
import { lessonLayout, panelSection, toggle, button, readout, challenge, note } from "../lib/ui.js";
import { rows as nsw, meta } from "../data/nsw.js";
import { col, complete, dataBadge } from "../lib/data.js";

// ---- Pre-process real NSW data -----------------------------------------------
const data = complete(nsw, ["treat", "re78"]);
const treated = data.filter((r) => r.treat === 1);
const control = data.filter((r) => r.treat === 0);
const meanT = mean(col(treated, "re78"));   // factual mean for treated arm
const meanC = mean(col(control, "re78"));   // factual mean for control arm
const TRUE_ATE = meanT - meanC;             // ≈ +$1,794 (randomization identifies this)

// Build a display subset: up to 120 units (proportional to arm sizes).
// Keep the first 74 treated and 46 control to mirror ≈ 185:260 ratio at N=120.
const DISPLAY_N = 120;
const nT = Math.round(DISPLAY_N * treated.length / data.length);
const nC = DISPLAY_N - nT;
const displayUnits = [
  ...treated.slice(0, nT).map((r, i) => ({ id: i, t: 1, factual: r.re78 })),
  ...control.slice(0, nC).map((r, i) => ({ id: nT + i, t: 0, factual: r.re78 })),
];
const N = displayUnits.length;

// Assign a MODELED counterfactual for each unit:
// - For a treated unit: we never see Y(0); we model it as the control-arm mean.
// - For a control unit: we never see Y(1); we model it as the treated-arm mean.
// (A naive but honest estimator; the key message is that it IS a model, not data.)
displayUnits.forEach((u) => {
  u.cfModeled = u.t === 1 ? meanC : meanT;          // modeled ghost
  u.iteModeled = u.t === 1
    ? u.factual - u.cfModeled
    : u.cfModeled - u.factual;                        // Y(1)−Y(0) modeled
  u.y1 = u.t === 1 ? u.factual : u.cfModeled;
  u.y0 = u.t === 0 ? u.factual : u.cfModeled;
});

// Scale helpers: earnings in thousands for display
const toK = (v) => v / 1000;
const minRe = Math.min(...displayUnits.map((u) => Math.min(u.y0, u.y1)));
const maxRe = Math.max(...displayUnits.map((u) => Math.max(u.y0, u.y1)));

export function mount(root) {
  const state = { reveal: false, person: 0 };

  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Potential Outcomes",
    idea: "Every unit carries two potential outcomes — one for each version of the world. " +
          "You only ever observe one. NSW is randomized, so the average effect IS identified. " +
          "But no individual's effect is: the other world is always counterfactual.",
  });

  // ---- Stage: single-person split + population grid -----------------------
  const splitWrap = h("div", { class: "stage-row", style: { justifyContent: "center" } });
  const cvSplit = new Canvas(560, 220, { margin: { t: 18, r: 18, b: 28, l: 18 } });
  splitWrap.append(h("div", {}, [
    h("p", { class: "stage-title", text: "one unit · two worlds" }),
    cvSplit.el,
  ]));

  const cvPop = new Canvas(560, 250, { margin: { t: 16, r: 14, b: 30, l: 50 } });
  const popWrap = h("div", {}, [
    h("p", { class: "stage-title", text: "the population · factual outcomes (reveal to see modeled counterfactuals)" }),
    cvPop.el,
  ]);

  const cvHist = new Canvas(560, 150, { margin: { t: 14, r: 14, b: 30, l: 50 } });
  const histWrap = h("div", {}, [
    h("p", { class: "stage-title", text: "modeled individual effects  Y(1) − Y(0)  [god-mode only]" }),
    cvHist.el,
  ]);

  stage.append(splitWrap, popWrap, histWrap);
  stage.append(h("div", { class: "legend" }, [
    legendItem("var(--treat)", "treated arm (factual Y(1) or modeled Y(1))"),
    legendItem("var(--ctrl)", "control arm (factual Y(0) or modeled Y(0))"),
    legendItem("var(--gold)", "modeled individual gap — never truly observed"),
  ]));

  // ---- Panel --------------------------------------------------------------
  const out = h("div", { class: "readout-grid" });
  const rATE  = readout({ label: "ATE (identified)", value: "—", accent: "var(--gold)" });
  const rNaive = readout({ label: "Observed diff", value: "—", accent: "var(--accent2)" });
  out.append(rATE, rNaive);

  const chal = challenge({
    goal: "Turn on God mode — confirm that the observed treated−control difference ≈ " +
          "the modeled ATE.  Randomization makes these agree; individual effects stay hidden.",
  });

  panel.append(
    panelSection("Estimands", out),
    panelSection("Navigate units", [
      h("div", { class: "btn-row", style: { marginTop: "8px" } }, [
        button("← prev unit", () => { state.person = (state.person - 1 + N) % N; restartSplit(); }),
        button("next unit →", () => { state.person = (state.person + 1) % N; restartSplit(); }),
      ]),
      note({ text: `Unit ${0 + 1} of ${N} — treated=${displayUnits[0].t}` }),
    ]),
    panelSection("Reveal the unseen", [
      toggle({
        label: "God mode — show counterfactual ghosts",
        hint: "(modeled, never observed)",
        value: false,
        onToggle: (v) => { state.reveal = v; checkChallenge(); },
      }),
    ]),
    panelSection("Challenge", chal),
    dataBadge(meta),
  );

  caption.innerHTML =
    "For unit <span class='k'>i</span>: the <strong>individual treatment effect</strong> is " +
    "τᵢ = Y(1)ᵢ − Y(0)ᵢ = (earnings with training) − (earnings without training). " +
    "<strong>Fundamental problem of causal inference</strong>: exactly one of Y(0)ᵢ, Y(1)ᵢ is " +
    "observed — the other is <em>counterfactual and never observed</em> " +
    "(shown here as a model estimate, the mean of the opposite arm). " +
    "So τᵢ is <em>never identified</em> for any individual. " +
    "Yet the <strong>ATE</strong> τ = E[Y(1)−Y(0)] <em>is</em> identified because " +
    "NSW is <strong>randomized</strong>: E[Y(1)]=E[Y|T=1], giving ATE ≈ +$1,794. " +
    "Source: <strong>LaLonde 1986; Dehejia &amp; Wahba 1999</strong>.";

  root.appendChild(layout);

  // ---- Animation ----------------------------------------------------------
  let splitT = 0;
  function restartSplit() {
    splitT = 0;
    tween({ from: 0, to: 1, duration: 0.9, easing: ease.outBack, onUpdate: (v) => (splitT = v) });
    // update the note label
    const notEl = panel.querySelector(".note-text");
    if (notEl) {
      const u = displayUnits[state.person];
      notEl.textContent = `Unit ${state.person + 1} of ${N} — ${u.t ? "treated" : "control"}  ·  factual re78 = $${u.factual.toFixed(0)}`;
    }
  }
  restartSplit();

  function checkChallenge() {
    if (state.reveal) {
      const naiveDiff = meanT - meanC;
      chal.setState(
        true,
        `Observed diff $${naiveDiff.toFixed(0)} ≈ ATE $${TRUE_ATE.toFixed(0)} — ` +
        `randomization makes treated & control exchangeable.`,
      );
    }
  }

  const stop = onFrame(() => {
    drawSplit();
    drawPop();
    drawHist();
    updateReadouts();
  });

  function updateReadouts() {
    rATE.set(`$${TRUE_ATE.toFixed(0)}`, "E[Y|T=1] − E[Y|T=0], NSW RCT");
    rNaive.set(`$${(meanT - meanC).toFixed(0)}`, "observed treated − control");
  }

  // earnings display scale for population grid (0 .. ~25k)
  const popLo = 0, popHi = Math.min(maxRe * 1.08, 35000);

  function drawSplit() {
    const cv = cvSplit; cv.clear();
    const ctx = cv.ctx;
    const u = displayUnits[state.person];
    const cx = 90, cy = cv.h / 2;

    drawFigure(ctx, cx, cy, u.t ? "var(--treat)" : "var(--ctrl)");

    const xEnd = cv.w - 180;
    const spread = lerp(0, 68, splitT);
    const yT = cy - spread;
    const yC = cy + spread;

    pathTo(ctx, cx + 18, cy, xEnd, yT, "var(--treat)", splitT);
    pathTo(ctx, cx + 18, cy, xEnd, yC, "var(--ctrl)", splitT);

    // For a treated unit: top branch is factual (Y(1)), bottom is ghost Y(0).
    // For a control unit: bottom branch is factual (Y(0)), top is ghost Y(1).
    const topFactual  = u.t === 1;    // treated → Y(1) is factual
    const botFactual  = u.t === 0;    // control → Y(0) is factual

    // Factual Y(1) endpoint (top)
    drawWorld(ctx, xEnd, yT, "var(--treat)", "Y(1)",
      `$${u.y1.toFixed(0)}`,
      topFactual || state.reveal,
      !topFactual,   // is ghost
      !topFactual,   // counterfactual — label "(modeled)"
    );
    // Factual Y(0) endpoint (bottom)
    drawWorld(ctx, xEnd, yC, "var(--ctrl)", "Y(0)",
      `$${u.y0.toFixed(0)}`,
      botFactual || state.reveal,
      !botFactual,
      !botFactual,
    );

    // Gold gap bracket once revealed
    if (state.reveal && splitT > 0.8) {
      const gx = cv.w - 40;
      ctx.strokeStyle = "var(--gold)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(gx, yT); ctx.lineTo(gx, yC); ctx.stroke();
      ctx.fillStyle = "var(--gold)"; ctx.font = "11px var(--mono, monospace)";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(`τᵢ≈$${u.iteModeled.toFixed(0)} (modeled)`, gx + 5, cy);
    }

    // Label which branch is real
    ctx.fillStyle = "var(--dim)"; ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const label = topFactual
      ? "↑ factual (treated)   ↓ counterfactual — never observed (modeled)"
      : "↑ counterfactual — never observed (modeled)   ↓ factual (control)";
    ctx.fillText(label, cv.w / 2 - 20, cv.h - 16);
  }

  function drawPop() {
    const cv = cvPop; cv.clear();
    const ctx = cv.ctx;
    const cols = 20;
    const rows = Math.ceil(N / cols);
    const cellW = cv.iw / cols;
    const cellH = cv.ih / rows;
    const sy = new Scale([popLo, popHi], [cv.box.y1, cv.box.y0]);

    for (let i = 0; i < N; i++) {
      const u = displayUnits[i];
      const c = i % cols, r = Math.floor(i / cols);
      const x = cv.box.x0 + (c + 0.5) * cellW;

      const fy = sy.map(u.factual);
      const armCol = u.t ? "var(--treat)" : "var(--ctrl)";
      ctx.strokeStyle = armCol; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, cv.box.y1); ctx.lineTo(x, fy); ctx.stroke();
      ctx.fillStyle = armCol; ctx.beginPath(); ctx.arc(x, fy, 3.2, 0, 7); ctx.fill();

      // Counterfactual ghost (modeled) on reveal
      if (state.reveal) {
        const cfy = sy.map(u.cfModeled);
        const cfcol = u.t ? "var(--ctrl)" : "var(--treat)";
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = cfcol; ctx.beginPath(); ctx.arc(x, cfy, 3, 0, 7); ctx.fill();
        ctx.strokeStyle = "var(--gold)"; ctx.lineWidth = 1; ctx.globalAlpha = 0.45;
        ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x, cfy); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }

      // Highlight selected person
      if (i === state.person) {
        ctx.strokeStyle = "var(--gold)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, fy, 6, 0, 7); ctx.stroke();
      }
    }

    // Axis baseline
    ctx.strokeStyle = "var(--line)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cv.box.x0, cv.box.y1); ctx.lineTo(cv.box.x1, cv.box.y1); ctx.stroke();

    // Axis label
    ctx.fillStyle = "var(--dim)"; ctx.font = "10px ui-monospace,monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.save(); ctx.translate(cv.box.x0 - 38, (cv.box.y0 + cv.box.y1) / 2);
    ctx.rotate(-Math.PI / 2); ctx.fillText("re78 ($)", 0, 0); ctx.restore();
  }

  function drawHist() {
    const cv = cvHist; cv.clear();
    const ctx = cv.ctx;

    if (!state.reveal) {
      ctx.fillStyle = "var(--dim)"; ctx.font = "13px ui-monospace,monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("enable God mode to reveal modeled individual effects", cv.w / 2, cv.h / 2);
      return;
    }

    const ites = displayUnits.map((u) => u.iteModeled);
    const lo = Math.min(...ites) - 200, hi = Math.max(...ites) + 200;
    const bins = histogram(ites, 22, lo, hi);
    const sx = new Scale([lo, hi], [cv.box.x0, cv.box.x1]);
    const maxC = Math.max(...bins.map((b) => b.count), 1);
    const sy = new Scale([0, maxC], [cv.box.y1, cv.box.y0]);

    for (const b of bins) {
      const x0 = sx.map(b.x0), x1 = sx.map(b.x1);
      const yy = sy.map(b.count);
      ctx.fillStyle = "rgba(255,206,92,.55)";
      ctx.fillRect(x0 + 1, yy, x1 - x0 - 1, cv.box.y1 - yy);
    }

    // ATE line = TRUE_ATE
    const mx = sx.map(TRUE_ATE);
    ctx.strokeStyle = "var(--gold)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx, cv.box.y0); ctx.lineTo(mx, cv.box.y1); ctx.stroke();
    ctx.fillStyle = "var(--gold)"; ctx.font = "11px ui-monospace,monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(`ATE $${TRUE_ATE.toFixed(0)}`, mx, cv.box.y0 - 1);

    // Zero line
    if (lo < 0 && hi > 0) {
      const zx = sx.map(0);
      ctx.strokeStyle = "var(--line)"; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(zx, cv.box.y0); ctx.lineTo(zx, cv.box.y1); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Note: these are modeled, not real
    ctx.fillStyle = "var(--dim)"; ctx.font = "10px ui-monospace,monospace";
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText("* modeled via arm-mean imputation — not real observations", cv.box.x1, cv.box.y0 + 2);
  }

  return () => stop();
}

// ---- small drawing helpers ----
function legendItem(color, label) {
  return h("span", {}, [h("span", { class: "swatch", style: { background: color } }), label]);
}
function drawFigure(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y - 9, 6, 0, 7); ctx.fill();
  ctx.fillRect(x - 4, y - 2, 8, 16);
}
function pathTo(ctx, x0, y0, x1, y1, color, t) {
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.85;
  const mx = (x0 + x1) / 2;
  ctx.beginPath(); ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(mx, y0, mx, y1, lerp(x0, x1, t), lerp(y0, y1, t));
  ctx.stroke(); ctx.globalAlpha = 1;
}
// solid=whether to render at all; isGhost=render faded; isCF=append "(modeled)" tag
function drawWorld(ctx, x, y, color, label, valStr, solid, isGhost, isCF) {
  if (!solid) return;
  ctx.globalAlpha = isGhost ? 0.45 : 1;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
  ctx.fillStyle = "var(--ink)"; ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.globalAlpha = isGhost ? 0.6 : 1;
  const tag = isCF ? "  (counterfactual — never observed, modeled)" : "";
  ctx.fillText(`${label} = ${valStr}${tag}`, x + 14, y);
  ctx.globalAlpha = 1;
}
