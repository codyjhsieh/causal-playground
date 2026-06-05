// Regression Discontinuity Design — REAL DATA edition.
// Running variable: lagdemvoteshare − 0.5 (how much the Democrat won/lost the
// PRIOR race by). Treatment: winning the prior race (running ≥ 0). Outcome:
// demvoteshare (current Dem vote share). The discontinuity at running = 0 is
// the INCUMBENCY ADVANTAGE: barely-winning vs barely-losing the last election
// are as-good-as-randomly assigned near the threshold (Lee 2008).

import { h } from "../lib/dom.js";
import { ols1, clamp } from "../lib/stats.js";
import { onFrame, Spring } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot, line } from "../lib/plot.js";
import { lessonLayout, panelSection, slider, readout, challenge } from "../lib/ui.js";
import { rows as rawRows, meta } from "../data/elections.js";
import { complete, dataBadge } from "../lib/data.js";

// ─── CSS injected once ───────────────────────────────────────────────────────
function injectCSS() {
  if (document.getElementById("rdd-css")) return;
  const style = document.createElement("style");
  style.id = "rdd-css";
  style.textContent = `
    .rdd-stage-label {
      font-size: 11px; color: var(--dim); font-family: var(--mono);
      text-align: center; margin: 0 0 6px;
    }
    .rdd-readout-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .rdd-cite {
      font-size: 10.5px; color: var(--dim); font-family: var(--mono);
      margin-top: 6px; padding: 5px 8px;
      border-left: 2px solid var(--line); line-height: 1.5;
    }
  `;
  document.head.appendChild(style);
}

// ─── Prepare real data ────────────────────────────────────────────────────────
// Keep complete cases; build running variable = lagdemvoteshare − 0.5
const cleanRows = complete(rawRows, ["demvoteshare", "lagdemvoteshare"]);
const pts = cleanRows.map(r => ({
  running: r.lagdemvoteshare - 0.5,   // RDD running variable (centred at cutoff)
  y:       r.demvoteshare,            // outcome: current Dem vote share
  alpha:   new Spring(1, { stiffness: 80, damping: 16 }),
}));

// Full-sample intercepts (reference line behind the window fits)
function fullSampleIntercepts() {
  const left  = pts.filter(p => p.running < 0);
  const right = pts.filter(p => p.running >= 0);
  if (left.length < 3 || right.length < 3) return null;
  const fL = ols1(left.map(p => p.running),  left.map(p => p.y));
  const fR = ols1(right.map(p => p.running), right.map(p => p.y));
  return { yL: fL.a, yR: fR.a };
}
const fullRef = fullSampleIntercepts();

// ─── Local linear fit restricted to a window ─────────────────────────────────
function fitSide(bw, side) {
  const inBW = pts.filter(p => {
    if (side === "left")  return p.running < 0 && p.running >= -bw;
    return p.running >= 0 && p.running <= bw;
  });
  if (inBW.length < 3) return null;
  const xs = inBW.map(p => p.running);
  const ys = inBW.map(p => p.y);
  return ols1(xs, ys);
}

// ─── Main module ─────────────────────────────────────────────────────────────
const TITLE = "Regression Discontinuity";
const IDEA  = "Near an electoral threshold, whether a candidate just wins or just loses is essentially random luck. The continuity assumption — that potential outcomes are smooth through the cutoff — lets the jump in outcomes at x = 0 identify the causal incumbency advantage (Lee, 2008).";

export function mount(root) {
  injectCSS();

  // State
  const state = { bw: 0.15 };

  // Animated bandwidth spring (zooming feels physical)
  const bwSpring = new Spring(state.bw, { stiffness: 60, damping: 14 });

  // Gold bracket spring tracks the gap value
  const bracketSpring = new Spring(0, { stiffness: 55, damping: 13 });

  // Build layout
  const { root: layout, stage, panel, caption } = lessonLayout({ title: TITLE, idea: IDEA });

  const cv = new Canvas(620, 420, { margin: { t: 22, r: 24, b: 48, l: 58 } });
  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.alignItems = "center";
  stage.appendChild(h("p", { class: "rdd-stage-label", text: "U.S. House elections 1946–2010  ·  x = Dem vote margin last race  ·  y = Dem vote share this race" }));
  stage.appendChild(cv.el);

  // Readouts
  const rEst = readout({ label: "RD estimate (incumbency advantage)", value: "—", accent: "var(--gold)" });
  const rN   = readout({ label: "n in bandwidth",                     value: "—", accent: "var(--accent2)" });

  const chal = challenge({ goal: "Shrink bandwidth to h ≤ 0.10 with n ≥ 100 points and read a stable positive RD estimate — local randomization near the cutoff." });

  // Bandwidth slider
  const bwSlider = slider({
    label: "Bandwidth h",
    min: 0.02, max: 0.30, step: 0.005, value: state.bw,
    fmt: v => v.toFixed(3),
    hint: "(|running| ≤ h used for local linear fit)",
    onInput: v => { state.bw = v; bwSpring.set(v); },
  });

  panel.append(
    dataBadge(meta),
    panelSection("Estimates", h("div", { class: "rdd-readout-row" }, [rEst, rN])),
    panelSection("Bandwidth", [bwSlider]),
    panelSection("Challenge", [chal]),
    h("p", { class: "rdd-cite",
      text: "Lee (2008) \"Randomized experiments from non-random selection in U.S. House elections.\" " +
            "Journal of Econometrics, 142(2): 675–697. " +
            "Barely-winners vs. barely-losers are locally as-good-as-randomized at the cutoff — " +
            "the jump in the regression function identifies the LATE (local average treatment effect) of incumbency for marginal candidates." }),
  );

  caption.innerHTML =
    "Lee (2008) studies U.S. House elections 1946–2010: the <strong>running variable</strong> is the Democratic party&rsquo;s " +
    "vote margin in the <em>prior</em> election (centred at zero). The <strong>continuity assumption</strong> " +
    "requires that potential outcomes are smooth through zero — only incumbency status jumps discontinuously at the cutoff. " +
    "Near the threshold, barely-winners and barely-losers differ only by electoral luck, so the gap in their " +
    "<em>next</em>-election vote share identifies the causal <strong>incumbency advantage</strong> (a LATE for marginal candidates). " +
    "Shrinking bandwidth <em>h</em> brings in only units close to the cutoff (less approximation bias) at the cost of " +
    "fewer observations (higher variance) — the canonical <strong>bias–variance tradeoff</strong> of local linear RDD. " +
    "The faint dashed lines show full-sample linear fits as a reference.";

  root.appendChild(layout);

  // ── Frame loop ──────────────────────────────────────────────────────────────
  const stop = onFrame((dt) => {
    bwSpring.step(dt);
    bracketSpring.step(dt);
    updateAlphas(dt);
    draw();
    updateReadouts();
  });

  // Smoothly update each point's alpha spring based on bandwidth
  function updateAlphas(dt) {
    const bw = bwSpring.value;
    for (const p of pts) {
      const inBW = Math.abs(p.running) <= bw;
      p.alpha.set(inBW ? 1.0 : 0.08);
      p.alpha.step(dt);
    }
  }

  // ── Draw ────────────────────────────────────────────────────────────────────
  function draw() {
    cv.clear();
    const ctx = cv.ctx;
    const b = cv.box;

    const bw = bwSpring.value;

    // Scales: x zooms toward [−bw, bw] as bw shrinks
    const xPad = bw * 0.35 + 0.02;
    const xLo = -(bw + xPad);
    const xHi =  (bw + xPad);
    const sx = new Scale([Math.max(-0.52, xLo), Math.min(0.52, xHi)], [b.x0, b.x1]);
    const sy = new Scale([0.28, 0.85], [b.y1, b.y0]);

    drawAxes(cv, sx, sy, {
      xlabel: "vote margin in prior race  (running variable, centred at 0)",
      ylabel: "vote share in current race",
      grid: true,
    });

    // Cutoff vertical line
    const cx0 = sx.map(0);
    ctx.save();
    ctx.strokeStyle = "var(--dim)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(cx0, b.y0); ctx.lineTo(cx0, b.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Cutoff label
    ctx.save();
    ctx.fillStyle = "var(--dim)";
    ctx.font = "10px var(--mono)";
    ctx.textAlign = "center";
    ctx.fillText("cutoff", cx0, b.y0 - 6);
    ctx.restore();

    // Bandwidth shading
    const bwX0 = sx.map(-bw), bwX1 = sx.map(bw);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fillRect(bwX0, b.y0, bwX1 - bwX0, b.y1 - b.y0);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bwX0, b.y0); ctx.lineTo(bwX0, b.y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bwX1, b.y0); ctx.lineTo(bwX1, b.y1); ctx.stroke();
    ctx.restore();

    // Full-sample reference lines (faint dashed)
    if (fullRef) {
      const xMin = sx.invert(b.x0), xMax = sx.invert(b.x1);
      // Left reference: fit full left side but draw only left of cutoff
      const leftAll = pts.filter(p => p.running < 0);
      const rightAll = pts.filter(p => p.running >= 0);
      if (leftAll.length >= 3) {
        const fL = ols1(leftAll.map(p => p.running), leftAll.map(p => p.y));
        drawRefLine(ctx, sx, sy, fL, Math.max(xMin, -0.52), 0, b);
      }
      if (rightAll.length >= 3) {
        const fR = ols1(rightAll.map(p => p.running), rightAll.map(p => p.y));
        drawRefLine(ctx, sx, sy, fR, 0, Math.min(xMax, 0.52), b);
      }
    }

    // Scatter points — alpha from spring
    for (const p of pts) {
      const px = sx.map(p.running);
      const py = sy.map(p.y);
      if (px < b.x0 - 4 || px > b.x1 + 4) continue;
      const color = p.running >= 0 ? "var(--treat)" : "var(--ctrl)";
      dot(ctx, px, py, 3.2, color, { alpha: p.alpha.value });
    }

    // Local linear fits (in-bandwidth points on each side)
    const fitL = fitSide(bw, "left");
    const fitR = fitSide(bw, "right");

    if (fitL) drawFitLine(ctx, sx, sy, fitL, -bw, 0, "var(--ctrl)", b);
    if (fitR) drawFitLine(ctx, sx, sy, fitR, 0, bw, "var(--treat)", b);

    // The jump: extrapolate both fits to x=0
    if (fitL && fitR) {
      const yL = fitL.a;
      const yR = fitR.a;
      const estimate = yR - yL;
      const pyL = sy.map(yL);
      const pyR = sy.map(yR);
      bracketSpring.set(estimate);
      drawJumpBracket(ctx, cx0, pyL, pyR, estimate, b);
    }
  }

  // Draw full-sample reference fit (faint dashed line)
  function drawRefLine(ctx, sx, sy, fit, xLo, xHi, b) {
    const cx0 = clamp(sx.map(xLo), b.x0, b.x1);
    const cx1 = clamp(sx.map(xHi), b.x0, b.x1);
    const d0 = sx.invert(cx0), d1 = sx.invert(cx1);
    const cy0 = sy.map(fit.a + fit.b * d0);
    const cy1 = sy.map(fit.a + fit.b * d1);
    ctx.save();
    ctx.strokeStyle = "rgba(160,160,160,0.25)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx1, cy1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Draw a local linear fit line clipped to [xLo, xHi]
  function drawFitLine(ctx, sx, sy, fit, xLo, xHi, color, b) {
    const cx0 = clamp(sx.map(xLo), b.x0, b.x1);
    const cx1 = clamp(sx.map(xHi), b.x0, b.x1);
    const d0 = sx.invert(cx0), d1 = sx.invert(cx1);
    const cy0 = sy.map(fit.a + fit.b * d0);
    const cy1 = sy.map(fit.a + fit.b * d1);
    line(ctx, [{ x: cx0, y: cy0 }, { x: cx1, y: cy1 }], {
      stroke: color, width: 2.5, alpha: 0.95,
    });
  }

  // Animated gold bracket (the RD estimate arrow between the two intercepts)
  function drawJumpBracket(ctx, cx, pyL, pyR, estimate, b) {
    const top = Math.min(pyL, pyR);
    const bot = Math.max(pyL, pyR);
    const bx  = cx + 14;
    const arm = 6;

    ctx.save();
    ctx.strokeStyle = "var(--gold)";
    ctx.lineWidth = 2.2;
    ctx.globalAlpha = 0.95;

    // vertical spine
    ctx.beginPath();
    ctx.moveTo(bx, top); ctx.lineTo(bx, bot); ctx.stroke();

    // arms
    ctx.beginPath(); ctx.moveTo(bx - arm, top); ctx.lineTo(bx + arm, top); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - arm, bot); ctx.lineTo(bx + arm, bot); ctx.stroke();

    // arrow tip
    const dir = estimate >= 0 ? -1 : 1;
    drawArrow(ctx, bx, top + 2 * dir, bx, top - 6 * dir);

    // label
    const label = (estimate >= 0 ? "+" : "") + (estimate * 100).toFixed(1) + " pp";
    ctx.fillStyle = "var(--gold)";
    ctx.font = "bold 13px var(--mono)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx + arm + 5, (top + bot) / 2);

    ctx.restore();
  }

  function drawArrow(ctx, x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 7;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - len * Math.cos(angle - 0.45), y2 - len * Math.sin(angle - 0.45));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - len * Math.cos(angle + 0.45), y2 - len * Math.sin(angle + 0.45));
    ctx.stroke();
  }

  // ── Readouts + challenge state ───────────────────────────────────────────────
  function updateReadouts() {
    const bw = bwSpring.value;
    const fitL = fitSide(bw, "left");
    const fitR = fitSide(bw, "right");
    const nIn  = pts.filter(p => Math.abs(p.running) <= bw).length;

    rN.set(String(nIn), "within bandwidth");

    if (fitL && fitR) {
      const est = fitR.a - fitL.a;
      rEst.set((est >= 0 ? "+" : "") + (est * 100).toFixed(1) + " pp", "local linear RD");

      const tight = state.bw <= 0.10 && nIn >= 100 && est > 0;
      if (tight) {
        chal.setState(true, `h = ${state.bw.toFixed(3)}, n = ${nIn}, RD = ${(est * 100).toFixed(1)} pp — stable positive incumbency advantage.`);
      } else if (nIn < 100) {
        chal.setState(false, `n = ${nIn} — widen h slightly or reduce it less aggressively.`);
      } else if (state.bw > 0.10) {
        chal.setState(false, `h = ${state.bw.toFixed(3)} — shrink bandwidth closer to the cutoff.`);
      } else {
        chal.setState(false, `Keep exploring — check for a clear positive jump.`);
      }
    } else {
      rEst.set("—", nIn < 3 ? "need more points" : "fitting…");
      chal.setState(false, "not enough data on one side — widen h slightly.");
    }
  }

  return () => stop();
}
