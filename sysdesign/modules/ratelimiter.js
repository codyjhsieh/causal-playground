// Rate Limiter — a REAL, running mini-system you build piece by piece. A live
// traffic generator fires real request objects at a server with a real capacity;
// a real limiter (token bucket / fixed window / sliding-window log) admits or
// rejects each one; the server queues, serves (200), overflows (503); the edge
// rejects (429). Every number is measured off the running system.
//
// Pieces, in interview order: (1) no limiter → the server melts under a spike;
// (2) add a token bucket → excess rejected cheaply at the edge; (3) tune refill
// vs capacity → too strict rejects real users, too loose overloads again;
// (4) per-user buckets → one noisy neighbor no longer starves everyone;
// (5) swap algorithm → fixed-window boundary burst vs smooth sliding window.

import { h, clear } from "../lib/dom.js";
import { lessonLayout, panelSection, slider, toggle, segmented, readout, challenge } from "../lib/ui.js";
import { Canvas } from "../lib/plot.js";

const FPS = 30;
const Q_MAX = 60;               // server queue depth before it drops (503)
const HIST = 200;               // frames kept for the chart
const WIN = 45;                 // frames (~1.5s) for rolling rate averages

const poisson = (l) => { if (l <= 0) return 0; const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; };
const NORMALS = ["u1", "u2", "u3", "u4", "u5"];

export function mount(container) {
  const { root, stage, panel, caption } = lessonLayout({ title: "Rate Limiter", idea: "" });
  container.appendChild(root);

  const S = { arrival: 240, cap: 100, refill: 100, burst: 40, window: 1, algo: "off", perUser: false, noisy: true };

  // ---- limiter state (rebuilt on config change) ----
  let buckets, winState, slideLog;
  function resetLimiter() { buckets = new Map(); winState = new Map(); slideLog = new Map(); }
  resetLimiter();
  const keyFor = (u) => (S.perUser ? u : "global");

  function admit(u, t) {
    if (S.algo === "off") return true;
    const key = keyFor(u);
    if (S.algo === "token") {
      let tok = buckets.get(key); if (tok == null) tok = S.burst;
      if (tok >= 1) { buckets.set(key, tok - 1); return true; }
      buckets.set(key, tok); return false;
    }
    if (S.algo === "fixed") {
      const limit = Math.max(1, S.refill * S.window);
      const win = Math.floor(t / S.window);
      let st = winState.get(key);
      if (!st || st.win !== win) { st = { win, count: 0 }; winState.set(key, st); }
      if (st.count < limit) { st.count++; return true; }
      return false;
    }
    if (S.algo === "sliding") {
      const limit = Math.max(1, S.refill * S.window);
      let log = slideLog.get(key); if (!log) { log = []; slideLog.set(key, log); }
      const cutoff = t - S.window;
      while (log.length && log[0] < cutoff) log.shift();
      if (log.length < limit) { log.push(t); return true; }
      return false;
    }
    return true;
  }
  function refillTokens(dt) {
    if (S.algo !== "token") return;
    for (const [k, v] of buckets) buckets.set(k, Math.min(S.burst, v + S.refill * dt));
  }

  // ---- server ----
  let qlen = 0, serveCarry = 0, simT = 0;
  const hist = [];               // {off, s200, r429, r503, lat}
  const latSamples = [];

  function step(dt) {
    simT += dt;
    refillTokens(dt);
    let off = 0, s200 = 0, r429 = 0, r503 = 0;
    const cls = { abuser: { off: 0, adm: 0 }, normal: { off: 0, adm: 0 } };

    const n = poisson(S.arrival * dt);
    for (let i = 0; i < n; i++) {
      const u = S.noisy ? (Math.random() < 0.6 ? "abuser" : NORMALS[(Math.random() * 5) | 0])
                        : (Math.random() < 1 / 6 ? "abuser" : NORMALS[(Math.random() * 5) | 0]);
      const c = u === "abuser" ? cls.abuser : cls.normal;
      off++; c.off++;
      if (admit(u, simT)) {
        c.adm++;
        if (qlen < Q_MAX) qlen++; else r503++;     // server backlog full → overloaded
      } else r429++;
    }
    // serve from queue at capacity
    serveCarry += S.cap * dt;
    const serve = Math.min(qlen, Math.floor(serveCarry));
    serveCarry -= serve; qlen -= serve; s200 += serve;

    const lat = (qlen / S.cap) * 1000;             // queueing delay to drain backlog
    latSamples.push(lat); if (latSamples.length > 150) latSamples.shift();

    hist.push({ off, s200, r429, r503, lat, cls });
    if (hist.length > HIST) hist.shift();
  }

  // ---- rolling metrics ----
  function rolling() {
    const w = hist.slice(-WIN);
    let off = 0, s200 = 0, r429 = 0, r503 = 0, ab = { off: 0, adm: 0 }, no = { off: 0, adm: 0 };
    for (const f of w) { off += f.off; s200 += f.s200; r429 += f.r429; r503 += f.r503; ab.off += f.cls.abuser.off; ab.adm += f.cls.abuser.adm; no.off += f.cls.normal.off; no.adm += f.cls.normal.adm; }
    const sorted = [...latSamples].sort((a, b) => a - b);
    const p99 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] : 0;
    return { off, s200, r429, r503, p99, ab, no };
  }

  // ---- stage: chart + fairness + queue ----
  let cv, W = 620, H = 210;
  const chartHost = h("div", { style: { width: "100%" } });
  const fairRow = h("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" } });
  const legend = h("div", { style: { display: "flex", gap: "14px", flexWrap: "wrap", marginTop: "8px", fontSize: "12px" } }, [
    sw("var(--pos)", "served (200)"), sw("var(--warn)", "rejected (429)"), sw("var(--neg)", "overloaded (503)"),
  ]);
  stage.append(chartHost, legend, fairRow);

  function buildCanvas() {
    W = Math.max(320, Math.min(680, (stage.clientWidth || 640) - 34));
    clear(chartHost);
    cv = new Canvas(W, H, { margin: { t: 14, r: 12, b: 22, l: 34 } });
    chartHost.appendChild(cv.el);
  }

  function draw() {
    const ctx = cv.ctx; cv.clear(); const b = cv.box;
    // y-scale: max offered per frame across history (so bars fit)
    let ymax = 1;
    for (const f of hist) ymax = Math.max(ymax, f.off);
    ymax = Math.max(ymax, (S.cap / FPS) * 2.2, 4);
    const yToPx = (v) => b.y1 - (v / ymax) * (b.y1 - b.y0);
    // capacity line (per-frame serve capacity)
    const capPer = S.cap / FPS;
    ctx.strokeStyle = "var(--dim)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(b.x0, yToPx(capPer)); ctx.lineTo(b.x1, yToPx(capPer)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "var(--dim)"; ctx.font = "10px ui-monospace, monospace"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText("server capacity", b.x0 + 4, yToPx(capPer) - 2);
    // stacked bars
    const bw = (b.x1 - b.x0) / HIST;
    for (let i = 0; i < hist.length; i++) {
      const f = hist[i]; const x = b.x0 + i * bw;
      let yb = b.y1;
      const seg = (val, color) => { if (val <= 0) return; const hpx = (val / ymax) * (b.y1 - b.y0); ctx.fillStyle = color; ctx.fillRect(x, yb - hpx, Math.max(1, bw - 0.4), hpx); yb -= hpx; };
      seg(f.s200, "var(--pos)"); seg(f.r429, "var(--warn)"); seg(f.r503, "var(--neg)");
    }
    // axis baseline
    ctx.strokeStyle = "var(--dim)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(b.x0, b.y1); ctx.lineTo(b.x1, b.y1); ctx.stroke();
    ctx.fillStyle = "var(--dim)"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(Math.round(ymax * FPS) + "/s", b.x0 - 4, b.y0 + 6);
    ctx.fillText("0", b.x0 - 4, b.y1);
  }

  // ---- panel: readouts + build steps + knobs ----
  const rOk = readout({ label: "Success (200)", value: "—", accent: "var(--pos)" });
  const r429 = readout({ label: "Rejected (429)", value: "—", accent: "var(--warn)" });
  const r503 = readout({ label: "Overloaded (503)", value: "—", accent: "var(--neg)" });
  const rLat = readout({ label: "p99 latency", value: "—" });
  const statGrid = h("div", { class: "stat-row" }, [
    h("div", { class: "stat" }, [rOk]), h("div", { class: "stat" }, [r429]),
    h("div", { class: "stat" }, [r503]), h("div", { class: "stat" }, [rLat]),
  ]);

  const algoSeg = segmented({
    options: [
      { label: "Off", value: "off" }, { label: "Token bucket", value: "token" },
      { label: "Fixed window", value: "fixed" }, { label: "Sliding", value: "sliding" },
    ], value: S.algo,
    onSelect: (v) => { S.algo = v; resetLimiter(); qlen = 0; syncControls(); },
  });

  const arrivalSlider = slider({ label: "Arrival rate", min: 0, max: 500, step: 10, value: S.arrival, fmt: (v) => v + "/s", hint: "traffic", onInput: (v) => { S.arrival = v; } });
  const capSlider = slider({ label: "Server capacity", min: 20, max: 300, step: 10, value: S.cap, fmt: (v) => v + "/s", hint: "safe throughput", onInput: (v) => { S.cap = v; } });
  const refillSlider = slider({ label: "Refill / limit rate", min: 0, max: 400, step: 10, value: S.refill, fmt: (v) => v + "/s", hint: "tokens per sec", onInput: (v) => { S.refill = v; } });
  const burstSlider = slider({ label: "Burst (bucket size)", min: 1, max: 200, step: 1, value: S.burst, fmt: (v) => String(v), hint: "spare tokens", onInput: (v) => { S.burst = v; } });
  const windowSlider = slider({ label: "Window", min: 0.2, max: 5, step: 0.1, value: S.window, fmt: (v) => v.toFixed(1) + "s", hint: "counter resets", onInput: (v) => { S.window = v; } });
  const perUserToggle = toggle({ label: "Per-user buckets", value: S.perUser, hint: "fairness", onToggle: (v) => { S.perUser = v; resetLimiter(); } });
  const noisyToggle = toggle({ label: "Noisy-neighbor traffic", value: S.noisy, hint: "1 client = 60%", onToggle: (v) => { S.noisy = v; } });

  const knobBox = panelSection("Knobs", [arrivalSlider, capSlider, refillSlider, burstSlider, windowSlider]);
  const chal = challenge({ goal: "Zero 503s and ≥ 70% success under the spike." });

  panel.append(
    panelSection("Live scoreboard", [statGrid, chal]),
    panelSection("Piece 1 · the limiter", [
      h("div", { class: "control" }, [h("span", { class: "control-label", text: "Algorithm" }), algoSeg]),
      h("div", { class: "control" }, [h("span", { class: "control-label", text: "Fairness" }), perUserToggle, noisyToggle]),
    ]),
    knobBox,
  );

  function syncControls() {
    const showWin = S.algo === "fixed" || S.algo === "sliding";
    const showTok = S.algo === "token";
    windowSlider.style.display = showWin ? "" : "none";
    burstSlider.style.display = showTok ? "" : "none";
    refillSlider.style.display = S.algo === "off" ? "none" : "";
    refillSlider.querySelector(".control-label").firstChild.textContent = showWin ? "Limit rate" : "Refill rate";
  }
  syncControls();

  function sw(color, label) {
    return h("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--dim)" } }, [
      h("span", { style: { width: "12px", height: "12px", borderRadius: "3px", background: color, display: "inline-block" } }), label,
    ]);
  }

  // ---- render loop ----
  function render() {
    const m = rolling();
    const okPct = m.off ? (m.s200 / m.off) * 100 : 0;
    const p429 = m.off ? (m.r429 / m.off) * 100 : 0;
    const p503 = m.off ? (m.r503 / m.off) * 100 : 0;
    rOk.set(okPct.toFixed(0) + "%", Math.round(m.s200 / (WIN / FPS)) + "/s");
    r429.set(p429.toFixed(0) + "%", "cheap edge reject");
    r503.set(p503.toFixed(0) + "%", p503 > 1 ? "server dying" : "healthy");
    rLat.set(m.p99 < 1000 ? Math.round(m.p99) + " ms" : (m.p99 / 1000).toFixed(1) + " s", "queue " + Math.round(qlen) + "/" + Q_MAX);

    // fairness
    clear(fairRow);
    if (S.noisy) {
      const noPct = m.no.off ? (m.no.adm / m.no.off) * 100 : 0;
      const abPct = m.ab.off ? (m.ab.adm / m.ab.off) * 100 : 0;
      fairRow.append(
        h("div", { class: "stat", style: { flex: "1", minWidth: "120px" } }, [
          h("div", { class: "readout-label", text: "Quiet users admitted" }),
          h("div", { class: "readout-value", style: { fontSize: "18px", color: noPct > 60 ? "var(--pos)" : "var(--neg)" }, text: noPct.toFixed(0) + "%" }),
        ]),
        h("div", { class: "stat", style: { flex: "1", minWidth: "120px" } }, [
          h("div", { class: "readout-label", text: "Noisy neighbor admitted" }),
          h("div", { class: "readout-value", style: { fontSize: "18px", color: "var(--dim)" }, text: abPct.toFixed(0) + "%" }),
        ]),
      );
    }

    draw();

    // challenge + narration
    const solved = p503 < 0.5 && okPct >= 70 && S.algo !== "off";
    chal.setState(solved, solved
      ? `Solved — limiter admitting ~${Math.round(m.s200 / (WIN / FPS))}/s into a ${S.cap}/s server, no overload, ${okPct.toFixed(0)}% served.`
      : "");

    let cap;
    if (S.algo === "off")
      cap = `<strong>No limiter.</strong> ${S.arrival}/s is pouring into a ${S.cap}/s server, so the queue pegs at ${Q_MAX} and everything past it is dropped as <span style="color:var(--neg)">503</span> — the server is <strong>melting</strong>, and it fails for everyone, including well-behaved users. <em>Next piece:</em> switch on a Token bucket.`;
    else if (S.arrival > 0 && p503 > 1)
      cap = `Still overloading (<span style="color:var(--neg)">${p503.toFixed(0)}% 503</span>). Your ${S.algo === "token" ? "refill" : "limit"} rate is above what the server can drain — lower it toward the ${S.cap}/s capacity line so the edge sheds load as cheap <span style="color:var(--warn)">429</span>s instead.`;
    else if (S.refill < S.cap * 0.7 && S.algo !== "off")
      cap = `Server's safe now, but you're rejecting a lot of <em>legitimate</em> traffic (<span style="color:var(--warn)">${p429.toFixed(0)}% 429</span>) — the limit is stricter than capacity. Nudge it up toward ${S.cap}/s to serve more without risking overload.`;
    else if (S.noisy && !S.perUser)
      cap = `Healthy overall, but with one <strong>global</strong> bucket the noisy neighbor eats the tokens and quiet users get starved. <em>Next piece:</em> turn on <strong>Per-user buckets</strong> and watch quiet-user admits jump.`;
    else if (S.algo === "fixed")
      cap = `Fixed windows can pass up to <strong>2× the limit</strong> across a boundary (a burst at the end of one window + the start of the next). Shrink the window or switch to <strong>Sliding</strong> to smooth it.`;
    else
      cap = `Dialed in: the limiter admits near the ${S.cap}/s capacity line, 503s are gone, and ${okPct.toFixed(0)}% of requests are served. This is the shape you want — reject cheaply at the edge, keep the server in its safe zone.`;
    caption.innerHTML = cap;
  }

  buildCanvas();
  const timer = setInterval(() => { step(1 / FPS); render(); }, 1000 / FPS);
  const onResize = () => { buildCanvas(); };
  window.addEventListener("resize", onResize);

  return () => { clearInterval(timer); window.removeEventListener("resize", onResize); };
}
