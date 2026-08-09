// Token Economics & Latency — the LLM back-of-the-envelope. Move requests/day,
// input & output tokens, model tier, RAG context, and streaming; watch $/day and
// the p99 tail move. The trade-off: bigger outputs & context buy better answers
// but cost dollars and blow up the latency tail; streaming rescues *felt* speed
// (TTFT) without changing total cost or total time.

import { h, clear } from "../lib/dom.js";
import { lessonLayout, panelSection, slider, toggle, segmented, readout, note } from "../lib/ui.js";

// Representative model tiers (prices are $/1M tokens; speeds are order-of-magnitude
// realistic, not any one vendor's exact spec).
const MODELS = {
  small:    { label: "Small",    priceIn: 0.25, priceOut: 1.25, gen: 180, ttft: 200, prefill: 0.02 },
  mid:      { label: "Mid",      priceIn: 3,    priceOut: 15,   gen: 90,  ttft: 350, prefill: 0.05 },
  frontier: { label: "Frontier", priceIn: 15,   priceOut: 75,   gen: 45,  ttft: 600, prefill: 0.08 },
};

const money = (v) => {
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "k";
  if (v >= 1) return "$" + v.toFixed(0);
  if (v >= 0.01) return "$" + v.toFixed(2);
  return "$" + v.toFixed(4);
};
const bignum = (v) => {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
  return Math.round(v).toString();
};
const ms = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + " s" : Math.round(v) + " ms");

export function mount(container) {
  const { root, stage, panel, caption } = lessonLayout({
    title: "Token Economics & Latency",
    idea: "The napkin math behind every LLM app: tokens in + tokens out, times requests, equals dollars — and the answer can't arrive faster than its last token.",
  });
  container.appendChild(root);

  const state = {
    logReq: 6,          // log10(requests/day) → 1e6/day
    promptTok: 600,
    ragTok: 0,
    outTok: 500,
    model: "mid",
    streaming: true,
  };

  // ---------- stage (a single request, drawn as a timeline + cost bar) ----------
  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.gap = "18px";

  const timelineWrap = h("div", {});
  const costWrap = h("div", {});
  stage.append(timelineWrap, costWrap);

  function renderTimeline(ttft, gen, total, felt) {
    clear(timelineWrap);
    const ttftPct = Math.max(2, (ttft / total) * 100);
    const genPct = 100 - ttftPct;
    const feltPct = Math.min(98, (felt / total) * 100);
    timelineWrap.append(
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" } }, [
        h("div", { style: { fontSize: "12.5px", fontWeight: "600" }, text: "One request — where the time goes" }),
        h("div", { class: "tag", text: "total " + ms(total) }),
      ]),
      h("div", { style: { position: "relative", height: "34px", borderRadius: "9px", overflow: "hidden", display: "flex", border: "1px solid var(--glass-hairline)" } }, [
        h("div", { style: { width: ttftPct + "%", background: "linear-gradient(135deg, var(--warn), var(--gold))", display: "grid", placeItems: "center", color: "#fff", fontSize: "11px", fontWeight: "600", fontFamily: "var(--mono)" }, text: ttftPct > 16 ? "TTFT" : "" }),
        h("div", { style: { width: genPct + "%", background: "linear-gradient(135deg, var(--accent), var(--accent2))", display: "grid", placeItems: "center", color: "#fff", fontSize: "11px", fontWeight: "600", fontFamily: "var(--mono)" }, text: genPct > 22 ? "generating output" : "" }),
        // felt-latency marker
        h("div", { style: { position: "absolute", top: "-3px", bottom: "-3px", left: feltPct + "%", width: "2px", background: "var(--neg)" } }),
      ]),
      h("div", { style: { display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "11px", color: "var(--dim)", fontFamily: "var(--mono)" } }, [
        h("span", { text: "TTFT " + ms(ttft) }),
        h("span", { style: { color: "var(--neg)" }, text: (state.streaming ? "◀ felt (first token) " : "◀ felt (full answer) ") + ms(felt) }),
        h("span", { text: "gen " + ms(gen) }),
      ]),
    );
  }

  function renderCost(inTok, outTok, inCost, outCost, perReq) {
    clear(costWrap);
    const total = inCost + outCost || 1;
    const inPct = (inCost / total) * 100;
    costWrap.append(
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" } }, [
        h("div", { style: { fontSize: "12.5px", fontWeight: "600" }, text: "Cost of one request" }),
        h("div", { class: "tag", text: money(perReq) + " / req" }),
      ]),
      h("div", { style: { display: "flex", height: "34px", borderRadius: "9px", overflow: "hidden", border: "1px solid var(--glass-hairline)" } }, [
        h("div", { style: { width: inPct + "%", background: "linear-gradient(135deg, #7c8db5, #5f708a)", display: "grid", placeItems: "center", color: "#fff", fontSize: "11px", fontWeight: "600" }, text: inPct > 22 ? "input" : "" }),
        h("div", { style: { width: (100 - inPct) + "%", background: "linear-gradient(135deg, var(--hot), #f472b6)", display: "grid", placeItems: "center", color: "#fff", fontSize: "11px", fontWeight: "600" }, text: (100 - inPct) > 22 ? "output" : "" }),
      ]),
      h("div", { style: { display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "11px", color: "var(--dim)", fontFamily: "var(--mono)" } }, [
        h("span", { text: bignum(inTok) + " in · " + money(inCost) }),
        h("span", { text: bignum(outTok) + " out · " + money(outCost) }),
      ]),
      h("p", { class: "note", style: { marginTop: "10px" },
        html: "Output tokens are generated one-by-one and usually priced <strong>5–6× higher</strong> than input — so they dominate both the bill and the clock. Input (prompt + retrieved context) is cheap per token but you pay it on <em>every</em> call, and it inflates TTFT via prefill." }),
    );
  }

  // ---------- panel (readouts + controls) ----------
  const rDay = readout({ label: "Cost / day", value: "—", accent: "var(--hot)" });
  const rMo = readout({ label: "Cost / month", value: "—" });
  const rP99 = readout({ label: "p99 latency", value: "—", accent: "var(--neg)" });
  const rQps = readout({ label: "avg QPS", value: "—", accent: "var(--accent)" });

  const statGrid = h("div", { class: "stat-row" }, [
    h("div", { class: "stat" }, [rDay]),
    h("div", { class: "stat" }, [rMo]),
    h("div", { class: "stat" }, [rP99]),
    h("div", { class: "stat" }, [rQps]),
  ]);

  const reqSlider = slider({
    label: "Requests / day", min: 3, max: 7.7, step: 0.01, value: state.logReq,
    fmt: (v) => bignum(Math.pow(10, v)), hint: "traffic",
    onInput: (v) => { state.logReq = v; render(); },
  });
  const promptSlider = slider({
    label: "Prompt tokens", min: 50, max: 8000, step: 10, value: state.promptTok,
    fmt: (v) => bignum(v), hint: "your instructions",
    onInput: (v) => { state.promptTok = v; render(); },
  });
  const ragSlider = slider({
    label: "Retrieved context (RAG)", min: 0, max: 16000, step: 100, value: state.ragTok,
    fmt: (v) => bignum(v), hint: "top-k chunks",
    onInput: (v) => { state.ragTok = v; render(); },
  });
  const outSlider = slider({
    label: "Output tokens", min: 20, max: 4000, step: 10, value: state.outTok,
    fmt: (v) => bignum(v), hint: "answer length",
    onInput: (v) => { state.outTok = v; render(); },
  });
  const modelSeg = segmented({
    options: Object.entries(MODELS).map(([k, m]) => ({ label: m.label, value: k })),
    value: state.model,
    onSelect: (v) => { state.model = v; render(); },
  });
  const streamToggle = toggle({
    label: "Streaming (SSE)", value: state.streaming, hint: "stream tokens",
    onToggle: (v) => { state.streaming = v; render(); },
  });

  panel.append(
    panelSection("Scoreboard", [statGrid]),
    panelSection("Traffic & tokens", [reqSlider, promptSlider, ragSlider, outSlider]),
    panelSection("Model & delivery", [
      h("div", { class: "control" }, [h("span", { class: "control-label", text: "Model tier" }), modelSeg]),
      streamToggle,
    ]),
  );

  // ---------- compute + render ----------
  function render() {
    const m = MODELS[state.model];
    const reqDay = Math.pow(10, state.logReq);
    const inTok = state.promptTok + state.ragTok;
    const outTok = state.outTok;

    const inCost = (inTok / 1e6) * m.priceIn;
    const outCost = (outTok / 1e6) * m.priceOut;
    const perReq = inCost + outCost;
    const perDay = perReq * reqDay;

    const ttft = m.ttft + inTok * m.prefill;           // prefill grows with input
    const gen = (outTok / m.gen) * 1000;               // token-by-token generation
    const total = ttft + gen;
    const p99 = total * 2.3;                            // tail factor (queueing + variance)
    const felt = state.streaming ? ttft : total;       // streaming → you see first token fast
    const qps = reqDay / 86400;

    rDay.set(money(perDay), "≈ " + money(perDay * 30) + "/mo");
    rMo.set(money(perDay * 30), money(perDay * 365) + "/yr");
    rP99.set(ms(p99), "p50 " + ms(total));
    rQps.set(qps < 10 ? qps.toFixed(1) : bignum(qps), bignum((inTok + outTok) * reqDay) + " tok/day");
    [rDay, rP99].forEach((r) => r.flash && r.flash());

    renderTimeline(ttft, gen, total, felt);
    renderCost(inTok, outTok, inCost, outCost, perReq);

    // interview-flavored verdict
    let verdict = "";
    if (perDay > 50000) verdict += `<strong>${money(perDay)}/day</strong> is a real budget line — the interviewer will ask how you cut it. Levers: a smaller model on easy queries (routing), a semantic cache, shorter outputs, and trimming retrieved context. `;
    else verdict += `At ${money(perDay)}/day cost is modest; `;
    if (felt < 800 && state.streaming) verdict += `and with streaming the user feels a snappy <strong>${ms(felt)}</strong> to first token even though the full answer takes ${ms(total)}.`;
    else if (!state.streaming) verdict += `but without streaming the user stares at a spinner for the full <strong>${ms(total)}</strong> — turn on streaming and the felt latency drops to the ${ms(ttft)} TTFT.`;
    else verdict += `the ${ms(total)} generation time dominates — shorter outputs or a faster model tier is the only real fix (streaming hides it, doesn't cure it).`;
    caption.innerHTML = verdict;
  }

  render();
  return () => {};
}
