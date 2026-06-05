// Difference-in-Differences. The parallel-trends counterfactual makes the
// assumption visible: drag the assumed control trend and watch how the entire
// estimated effect is downstream of that one untestable bet.
// Real numbers: Card & Krueger (1994), NJ minimum-wage experiment.

import { h } from "../lib/dom.js";
import { onFrame, tween, ease } from "../lib/anim.js";
import { Canvas, Scale, drawAxes, dot, line } from "../lib/plot.js";
import {
  lessonLayout, panelSection, slider, toggle, readout, button, challenge, note,
} from "../lib/ui.js";
import { meta as ckMeta } from "../data/cardkrueger.js";
import { dataBadge } from "../lib/data.js";

// ── Card & Krueger (1994), Table 3 ────────────────────────────────────────────
const NJ_BEFORE  = 20.44;   // New Jersey FTE employment, Feb 1992
const NJ_AFTER   = 21.03;   // New Jersey FTE employment, Nov 1992
const PA_BEFORE  = 23.33;   // Pennsylvania FTE employment, Feb 1992
const PA_AFTER   = 21.17;   // Pennsylvania FTE employment, Nov 1992

const NJ_CHANGE  = NJ_AFTER  - NJ_BEFORE;   // +0.59
const PA_CHANGE  = PA_AFTER  - PA_BEFORE;   // −2.16
const DID_TRUE   = NJ_CHANGE - PA_CHANGE;    // +2.76  (the famous result)

// ── Inject module-scoped CSS once ────────────────────────────────────────────
function ensureStyles() {
  if (document.getElementById("did-css")) return;
  const st = document.createElement("style");
  st.id = "did-css";
  st.textContent = `
.did-table { border-collapse: collapse; width: 100%; font-family: var(--mono); font-size: 12px; }
.did-table th, .did-table td { padding: 4px 8px; border: 1px solid var(--line); text-align: right; }
.did-table th { color: var(--dim); font-weight: 500; }
.did-table td.label { text-align: left; color: var(--dim); }
.did-table .gold { color: var(--gold); font-weight: 700; }
.did-table .treat { color: var(--treat); }
.did-table .ctrl  { color: var(--ctrl);  }
.did-stage-label { font: 11px/1 var(--mono); color: var(--dim); text-align: center; margin: 4px 0 0; }
  `;
  document.head.appendChild(st);
}

export function mount(root) {
  ensureStyles();

  // ── Mutable state ──────────────────────────────────────────────────────────
  const state = {
    cfTrend:        PA_CHANGE,   // slider-controlled assumed parallel trend
    showCF:         false,       // has user toggled counterfactual on?
    violatePT:      false,       // pre-existing differential NJ trend
    cfProgress:     0,           // 0→1 tween for CF reveal animation
    bracketProgress:0,           // 0→1 tween for gold bracket
    challengeDone:  false,
  };
  let cancelCfTween = null;
  let cancelBrTween = null;

  // ── Layout ─────────────────────────────────────────────────────────────────
  const { root: layout, stage, panel, caption } = lessonLayout({
    title: "Difference-in-Differences",
    idea:  "Compare the change in a treated group to the change in an untreated control group. The causal effect is the treated group's change minus the control group's change — eliminating shared time trends under the parallel-trends assumption.",
  });

  // Canvas
  const cv = new Canvas(580, 380, { margin: { t: 28, r: 36, b: 48, l: 60 } });
  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.alignItems = "center";
  stage.appendChild(cv.el);
  stage.appendChild(h("p", { class: "did-stage-label", text: "Card & Krueger (1994) · NJ vs PA fast-food employment · FTE per store" }));

  // ── Readouts ───────────────────────────────────────────────────────────────
  const rNJ  = readout({ label: "NJ change",  value: fmtSgn(NJ_CHANGE), accent: "var(--treat)" });
  const rPA  = readout({ label: "PA change",  value: fmtSgn(PA_CHANGE), accent: "var(--ctrl)"  });
  const rDiD = readout({ label: "DiD effect", value: "—",               accent: "var(--gold)"  });
  rDiD.querySelector(".readout-value").style.fontWeight = "700";

  // 2×2 DiD table
  const table = h("table", { class: "did-table" }, [
    h("thead", {}, [h("tr", {}, [
      h("th", { text: "" }),
      h("th", { text: "Before" }),
      h("th", { text: "After" }),
      h("th", { text: "Δ" }),
    ])]),
    h("tbody", {}, [
      h("tr", {}, [
        h("td", { class: "label treat", text: "NJ (treated)" }),
        h("td", { text: NJ_BEFORE.toFixed(2) }),
        h("td", { text: NJ_AFTER.toFixed(2)  }),
        h("td", { class: "treat", text: fmtSgn(NJ_CHANGE) }),
      ]),
      h("tr", {}, [
        h("td", { class: "label ctrl", text: "PA (control)" }),
        h("td", { text: PA_BEFORE.toFixed(2) }),
        h("td", { text: PA_AFTER.toFixed(2)  }),
        h("td", { class: "ctrl",  text: fmtSgn(PA_CHANGE)  }),
      ]),
      h("tr", {}, [
        h("td", { class: "label gold", text: "DiD" }),
        h("td", { text: "—" }),
        h("td", { text: "—" }),
        h("td", { class: "gold", text: fmtSgn(DID_TRUE) }),
      ]),
    ]),
  ]);

  // ── Challenge ──────────────────────────────────────────────────────────────
  const chal = challenge({
    goal: "Reveal the parallel-trends counterfactual and read off the DiD: how much higher NJ employment is than it 'would have been' had it followed Pennsylvania.",
  });

  // ── Trend slider ───────────────────────────────────────────────────────────
  let trendSlider;

  function computeDiD() {
    const cfAfter = NJ_BEFORE + state.cfTrend + (state.violatePT ? 1.8 : 0);
    const njEff   = NJ_AFTER - cfAfter;
    return { cfAfter, njEff };
  }

  // ── Controls ───────────────────────────────────────────────────────────────
  const cfToggle = toggle({
    label: "Show counterfactual",
    value: false,
    hint:  "(what NJ would have done under parallel trends)",
    onToggle: (v) => {
      state.showCF = v;
      if (cancelCfTween) cancelCfTween();
      if (cancelBrTween) cancelBrTween();
      if (v) {
        cancelCfTween = tween({
          from: state.cfProgress, to: 1, duration: 0.9, easing: ease.inOut,
          onUpdate: (val) => { state.cfProgress = val; },
          onDone: () => {
            // after CF line, animate bracket
            cancelBrTween = tween({
              from: 0, to: 1, duration: 0.7, easing: ease.outBack,
              onUpdate: (val) => { state.bracketProgress = val; },
            });
          },
        });
      } else {
        cancelCfTween = tween({
          from: state.cfProgress, to: 0, duration: 0.4, easing: ease.inOut,
          onUpdate: (val) => { state.cfProgress = val; },
        });
        cancelBrTween = tween({
          from: state.bracketProgress, to: 0, duration: 0.25, easing: ease.inOut,
          onUpdate: (val) => { state.bracketProgress = val; },
        });
      }
    },
  });

  trendSlider = slider({
    label: "Assumed parallel trend (control slope)",
    min: -5, max: 3, step: 0.05, value: state.cfTrend,
    fmt: (v) => fmtSgn(v),
    hint: "(drag to see how the effect depends on this assumption)",
    onInput: (v) => { state.cfTrend = v; },
  });

  const ptToggle = toggle({
    label: "Violate parallel trends",
    value: false,
    hint:  "(NJ had a pre-existing upward trend — DiD overstates)",
    onToggle: (v) => { state.violatePT = v; },
  });

  const resetBtn = button("Reset trend to PA actual", () => {
    state.cfTrend = PA_CHANGE;
    trendSlider.setValue(PA_CHANGE);
  });

  panel.append(
    dataBadge(ckMeta),
    panelSection("Data (Card & Krueger 1994)", table),
    panelSection("Estimates", h("div", { class: "readout-grid" }, [rNJ, rPA, rDiD])),
    panelSection("Counterfactual", [cfToggle, trendSlider, resetBtn]),
    panelSection("Assumption check", [
      ptToggle,
      note("Parallel trends: absent treatment, NJ and PA would have moved together. This is untestable from the post-period alone."),
    ]),
    panelSection("Challenge", chal),
  );

  caption.innerHTML =
    "The DiD estimator subtracts the control group&rsquo;s trend from the treated group&rsquo;s trend, " +
    "recovering a <strong>counterfactual baseline</strong> for what NJ &ldquo;would have done&rdquo; absent the policy. " +
    "Card &amp; Krueger (1994) found NJ fast-food employment <em>rose</em> by +2.76 FTE per store relative to PA " +
    "after NJ raised its minimum wage from $4.25 to $5.05 in April 1992 — contradicting the standard competitive-labor-market prediction of job losses. " +
    "The identifying assumption — <strong>parallel trends</strong> — requires that, absent the wage hike, NJ and PA employment would have moved together; this is untestable from post-period data alone. " +
    "Drag the slider to see how the entire causal estimate depends on that single counterfactual assumption.";

  root.appendChild(layout);

  // ── Render loop ────────────────────────────────────────────────────────────
  const stop = onFrame((_dt) => {
    draw();
    updateReadouts();
    checkChallenge();
  });

  // ── Draw ───────────────────────────────────────────────────────────────────
  function draw() {
    cv.clear();
    const ctx = cv.ctx;

    const xPad = 0.3;
    const sx = new Scale([-xPad, 1 + xPad], [cv.box.x0, cv.box.x1]);
    const sy = new Scale([15, 26],           [cv.box.y1, cv.box.y0]);

    drawAxes(cv, sx, sy, {
      xlabel: "time",
      ylabel: "avg. FTE employment / store",
      xticks: [0, 1],
      yticks: [16, 18, 20, 22, 24, 26],
      grid: true,
    });

    // time-point labels
    ctx.save();
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "var(--dim)";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Before (Feb 1992)", sx.map(0), cv.box.y1 + 38);
    ctx.fillText("After (Nov 1992)",  sx.map(1), cv.box.y1 + 38);
    ctx.restore();

    // ── Counterfactual ghost line ────────────────────────────────────────────
    const p = state.cfProgress;   // 0→1
    if (p > 0.01) {
      const { cfAfter } = computeDiD();
      const cfX0 = sx.map(0), cfY0 = sy.map(NJ_BEFORE);
      const cfX1 = sx.map(1), cfY1 = sy.map(cfAfter);

      // draw only the portion of the dashed line that has been animated
      const midX = cfX0 + (cfX1 - cfX0) * p;
      const midY = cfY0 + (cfY1 - cfY0) * p;

      ctx.save();
      ctx.globalAlpha = 0.7 * p;
      ctx.strokeStyle = "var(--treat)";
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(cfX0, cfY0);
      ctx.lineTo(midX, midY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // counterfactual endpoint dot (fades in)
      if (p > 0.95) {
        dot(ctx, cfX1, cfY1, 5, "var(--treat)", { stroke: "var(--surface)", alpha: (p - 0.95) / 0.05 });
        // label
        ctx.save();
        ctx.globalAlpha = (p - 0.95) / 0.05;
        ctx.font = "11px ui-monospace, monospace";
        ctx.fillStyle = "var(--treat)";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(cfAfter.toFixed(2) + " (CF)", cfX1 - 10, cfY1);
        ctx.restore();
      }

      // ── Gold bracket (DiD effect) ──────────────────────────────────────────
      const bp = state.bracketProgress;
      if (bp > 0.01) {
        const { njEff } = computeDiD();
        const bx  = sx.map(1) + 18;
        const yTop = sy.map(NJ_AFTER);
        const yBot = sy.map(cfAfter);
        const yMid = (yTop + yBot) / 2;
        const visTop = yBot + (yTop - yBot) * bp;  // animates from counterfactual upward

        ctx.save();
        ctx.globalAlpha = bp;
        ctx.strokeStyle = "var(--gold)";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);

        // vertical bar
        ctx.beginPath();
        ctx.moveTo(bx, yBot);
        ctx.lineTo(bx, visTop);
        ctx.stroke();

        // tick marks
        const tick = 6;
        [[bx, yTop], [bx, yBot]].forEach(([tx, ty]) => {
          if (ty >= visTop || ty === yBot) {
            ctx.beginPath();
            ctx.moveTo(tx - tick, ty);
            ctx.lineTo(tx + tick, ty);
            ctx.stroke();
          }
        });

        // label
        if (bp > 0.6) {
          const labelAlpha = (bp - 0.6) / 0.4;
          ctx.globalAlpha = labelAlpha;
          ctx.font = "bold 13px ui-monospace, monospace";
          ctx.fillStyle = "var(--gold)";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const sign = njEff >= 0 ? "+" : "";
          ctx.fillText(`${sign}${njEff.toFixed(2)} DiD`, bx + 10, yMid);
        }
        ctx.restore();
      }
    }

    // ── Solid lines: NJ and PA ────────────────────────────────────────────────
    line(ctx,
      [{ x: sx.map(0), y: sy.map(NJ_BEFORE) }, { x: sx.map(1), y: sy.map(NJ_AFTER) }],
      { stroke: "var(--treat)", width: 2.5 });

    line(ctx,
      [{ x: sx.map(0), y: sy.map(PA_BEFORE) }, { x: sx.map(1), y: sy.map(PA_AFTER) }],
      { stroke: "var(--ctrl)", width: 2.5 });

    // ── Four canonical dots ───────────────────────────────────────────────────
    [
      { x: 0, y: NJ_BEFORE, color: "var(--treat)" },
      { x: 1, y: NJ_AFTER,  color: "var(--treat)" },
      { x: 0, y: PA_BEFORE, color: "var(--ctrl)"  },
      { x: 1, y: PA_AFTER,  color: "var(--ctrl)"  },
    ].forEach(({ x, y, color }) => {
      dot(ctx, sx.map(x), sy.map(y), 6, color, { stroke: "var(--surface)", alpha: 1 });
    });

    // ── Legend ────────────────────────────────────────────────────────────────
    ctx.save();
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    const legendY = cv.box.y0 + 6;

    // NJ
    ctx.fillStyle = "var(--treat)";
    ctx.beginPath(); ctx.arc(cv.box.x0 + 16, legendY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "var(--ink)";
    ctx.textAlign = "left";
    ctx.fillText("NJ (treated)", cv.box.x0 + 26, legendY);

    // PA
    ctx.fillStyle = "var(--ctrl)";
    ctx.beginPath(); ctx.arc(cv.box.x0 + 130, legendY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "var(--ink)";
    ctx.fillText("PA (control)", cv.box.x0 + 140, legendY);

    // CF key
    if (state.cfProgress > 0.05) {
      ctx.globalAlpha = Math.min(1, state.cfProgress * 2);
      ctx.strokeStyle = "var(--treat)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(cv.box.x0 + 255, legendY);
      ctx.lineTo(cv.box.x0 + 280, legendY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "var(--ink)";
      ctx.globalAlpha = ctx.globalAlpha;
      ctx.fillText("NJ counterfactual", cv.box.x0 + 285, legendY);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ── Readout updates ────────────────────────────────────────────────────────
  function updateReadouts() {
    const { njEff } = computeDiD();
    rNJ.set(fmtSgn(NJ_CHANGE));
    rPA.set(fmtSgn(PA_CHANGE));
    if (state.cfProgress > 0.05) {
      rDiD.set(fmtSgn(njEff), state.violatePT ? "biased (trend violation)" : "Card & Krueger 1994");
      rDiD.querySelector(".readout-value").style.color =
        Math.abs(njEff - DID_TRUE) < 0.05 ? "var(--gold)" : "var(--accent)";
    } else {
      rDiD.set("—");
      rDiD.querySelector(".readout-value").style.color = "var(--gold)";
    }
  }

  // ── Challenge check ────────────────────────────────────────────────────────
  function checkChallenge() {
    if (state.challengeDone) return;
    const { njEff } = computeDiD();
    const cfShown   = state.cfProgress > 0.95;
    const bracketUp = state.bracketProgress > 0.8;
    const onTarget  = Math.abs(njEff - DID_TRUE) < 0.15 && !state.violatePT;
    if (cfShown && bracketUp && onTarget) {
      state.challengeDone = true;
      chal.setState(true, `DiD = +${njEff.toFixed(2)} — NJ employment rose, not fell, relative to PA.`);
    }
  }

  return () => stop();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtSgn(v) {
  return (v >= 0 ? "+" : "") + v.toFixed(2);
}
