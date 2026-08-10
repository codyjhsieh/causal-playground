// RAG Chatbot — a REAL retrieval-augmented chatbot running entirely on-device.
// Real chunking → real on-device embeddings (MiniLM) → real cosine vector search
// → real streamed generation (WebLLM). The sliders (chunk size, overlap, top-k,
// min-similarity, temperature) reconfigure the ACTUAL pipeline, and the RAG
// toggle lets you watch grounding kill hallucination live. No keys, no backend.

import { h, clear } from "../lib/dom.js";
import { lessonLayout, panelSection, slider, toggle, segmented, button } from "../lib/ui.js";
import { getEmbedder, getChatEngine, streamChat, cosineTopK, hasWebGPU, CHAT_MODELS, DEFAULT_CHAT_MODEL } from "../lib/models.js";

// Built-in corpus — concise, accurate system-design notes, so the bot doubles as
// an interview study buddy. Grounded answers should cite these.
const CORPUS = [
  { id: "caching", title: "Caching (cache-aside, LRU, TTL)",
    text: "A cache is a small, fast store in front of a slow one. The common pattern is cache-aside: on a read, check the cache; on a miss, load from the database, store it in the cache, and return it. The hit rate is what matters — a 90% hit rate cuts database load roughly tenfold. Caches are bounded, so they need an eviction policy: LRU (least-recently-used) evicts the coldest key when full. A TTL (time-to-live) expires entries so stale data doesn't live forever — a shorter TTL is fresher but lowers the hit rate. Risks: a thundering herd when a hot key expires and every request stampedes the database at once, and cache-stampede/consistency issues on writes (write-through or invalidation help)." },
  { id: "load-balancing", title: "Load balancing",
    text: "A load balancer spreads incoming requests across many identical servers so no single one is overwhelmed, and it removes failed servers from rotation via health checks. Algorithms trade simplicity for smartness: round-robin is even but ignores load; least-connections sends work to the least-busy server; consistent hashing keeps a given client/key on the same server (useful for cache locality or sticky sessions). Layer 4 balancers route on IP/port; Layer 7 balancers can route on URL or headers. The balancer itself must not be a single point of failure — run it redundantly." },
  { id: "cap", title: "CAP theorem & consistency",
    text: "When a network partition splits your nodes, you can keep the system Consistent (every read sees the latest write) or Available (every request still gets an answer) — not both. That is the CAP trade-off. CP systems refuse some requests to avoid returning stale data; AP systems keep serving and reconcile later (eventual consistency). PACELC extends this: even when there's no partition (Else), you trade Latency against Consistency. Most real systems tune this per operation — strong consistency for a bank balance, eventual for a like count." },
  { id: "rate-limiting", title: "Rate limiting (token bucket)",
    text: "A rate limiter caps how many requests a client may make, protecting a service from spikes and abuse. The token bucket is the standard: tokens refill at a steady rate up to a burst capacity, and each request spends one token — if the bucket is empty the request is rejected (HTTP 429). This allows short bursts while bounding the sustained rate. Fixed-window counters are simpler but can admit up to 2× the limit across a window boundary; sliding-window logs smooth that out at higher cost. Limit per API key/user so one noisy client can't starve others; in a cluster the counter must be shared (e.g. in Redis)." },
  { id: "replication", title: "Replication & quorums",
    text: "Replication keeps copies of data on multiple nodes for durability and read scaling. In leader-follower, writes go to the leader and replicate to followers; reads can be served by followers, but replication lag means a follower may return slightly stale data (breaking read-your-writes). Quorum systems (N replicas, W write-acks, R read-replies) give tunable consistency: if R + W > N, reads and writes overlap on at least one node, so reads see the latest write. Bigger R/W means stronger consistency but higher latency and lower availability; smaller means the opposite." },
  { id: "queues", title: "Message queues & backpressure",
    text: "A message queue decouples producers from consumers: producers append work and return immediately, while consumers process at their own pace. This smooths spikes (the queue absorbs bursts), enables retries, and lets you scale consumers independently. Delivery is usually at-least-once, so consumers must be idempotent (processing the same message twice is safe). Watch the queue depth: if producers outpace consumers for long, the backlog and latency grow without bound — that's when you apply backpressure (slow producers, shed load) or add consumers." },
  { id: "consistent-hashing", title: "Consistent hashing",
    text: "Sharding splits data across nodes by key. Naive hashing (key mod N) remaps almost every key when N changes, causing a massive reshuffle when you add or remove a node. Consistent hashing places nodes and keys on a ring; a key belongs to the next node clockwise, so adding/removing a node only moves the keys in one arc — about 1/N of them. Virtual nodes (many ring positions per physical node) even out the load and smooth rebalancing. It's the backbone of distributed caches and databases like Dynamo and Cassandra." },
];

const now = () => (typeof performance !== "undefined" ? performance.now() : 0);

export function mount(container) {
  const { root, stage, panel, caption } = lessonLayout({ title: "RAG Chatbot", idea: "" });
  container.appendChild(root);

  const state = {
    docs: CORPUS.map((d) => ({ ...d })),
    chunks: [],
    embedder: null,
    engine: null,
    modelId: DEFAULT_CHAT_MODEL,
    chunkSize: 480, overlap: 80, topK: 4, minSim: 0.25, temperature: 0.4,
    useRAG: true,
    busy: false,
    ready: false,
  };
  let abortRequested = false;

  // ---------------- stage: status + chat ----------------
  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.gap = "12px";

  const statusBar = h("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } });
  const chatLog = h("div", { style: {
    flex: "1", minHeight: "300px", maxHeight: "48vh", overflowY: "auto", display: "flex",
    flexDirection: "column", gap: "10px", padding: "4px 2px",
  } });
  const contextView = h("div", {});
  const inputRow = h("div", { style: { display: "flex", gap: "8px", alignItems: "flex-end" } });

  const ta = h("textarea", {
    rows: "2", placeholder: "Ask about caching, load balancing, CAP, rate limiting…",
    style: {
      flex: "1", resize: "vertical", fontFamily: "var(--sans)", fontSize: "14px", padding: "9px 11px",
      borderRadius: "10px", border: "1px solid var(--glass-hairline)", background: "var(--surface2)", color: "var(--ink)",
    },
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
  });
  const sendBtn = button("Ask", () => ask(), { primary: true });
  const stopBtn = button("Stop", () => { abortRequested = true; try { state.engine?.interruptGenerate?.(); } catch (e) {} }, { kind: "danger" });
  stopBtn.style.display = "none";
  inputRow.append(ta, sendBtn, stopBtn);

  stage.append(statusBar, chatLog, contextView, inputRow);

  // ---------------- load / status ----------------
  const loadBtn = button("⚡ Load on-device models", () => loadModels(), { primary: true });
  const statusText = h("span", { class: "note", style: { flex: "1" } });
  const progWrap = h("div", { class: "meter", style: { width: "160px", display: "none" } }, [h("span", { style: { width: "0%", background: "linear-gradient(90deg,var(--accent),var(--accent2))" } })]);
  const progBar = progWrap.firstChild;
  statusBar.append(loadBtn, progWrap, statusText);

  function setProg(frac, text) {
    progWrap.style.display = "block";
    progBar.style.width = Math.round((frac || 0) * 100) + "%";
    if (text) statusText.textContent = text;
  }

  function addMsg(role, text) {
    const isUser = role === "user";
    const bubble = h("div", { style: {
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "88%", padding: "10px 13px", borderRadius: "13px", fontSize: "14px", lineHeight: "1.55",
      whiteSpace: "pre-wrap", wordBreak: "break-word",
      background: isUser ? "linear-gradient(135deg,var(--accent),var(--accent2))" : "var(--surface2)",
      color: isUser ? "#fff" : "var(--ink)",
      border: isUser ? "none" : "1px solid var(--glass-hairline)",
    } }, [text]);
    const wrap = h("div", { style: { display: "flex", flexDirection: "column" } }, [
      h("div", { style: { fontSize: "10px", color: "var(--dim)", fontFamily: "var(--mono)", margin: isUser ? "0 4px 2px auto" : "0 auto 2px 4px" }, text: isUser ? "you" : "bot" }),
      bubble,
    ]);
    chatLog.appendChild(wrap);
    chatLog.scrollTop = chatLog.scrollHeight;
    return bubble;
  }

  function showContext(hits, tRetrieve) {
    clear(contextView);
    if (!state.useRAG) {
      contextView.appendChild(h("p", { class: "note", html: "🚫 <strong>RAG is off</strong> — the model is answering from its own weights only, ungrounded. Watch for confident but unsupported claims, then turn RAG back on." }));
      return;
    }
    if (!hits.length) { contextView.appendChild(h("p", { class: "note", text: "No chunks cleared the similarity cutoff — the bot should say it doesn't know." })); return; }
    contextView.appendChild(h("div", { style: { fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--dim)", margin: "2px 0 6px" }, text: `Retrieved context · ${hits.length} chunks · ${Math.round(tRetrieve)} ms` }));
    hits.forEach((hLite, i) => {
      contextView.appendChild(h("div", { style: { padding: "8px 10px", marginBottom: "6px", borderRadius: "9px", background: "var(--surface2)", border: "1px solid var(--glass-hairline)" } }, [
        h("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "3px" } }, [
          h("span", { class: "tag", text: `[${i + 1}] ${hLite.item.title}` }),
          h("span", { class: "tag " + (hLite.score > 0.5 ? "good" : hLite.score > 0.35 ? "warn" : "bad"), text: "sim " + hLite.score.toFixed(2) }),
        ]),
        h("div", { style: { fontSize: "12px", color: "var(--dim)", lineHeight: "1.45" }, text: hLite.item.text.slice(0, 220) + (hLite.item.text.length > 220 ? "…" : "") }),
      ]));
    });
  }

  // ---------------- pipeline ----------------
  function chunkDoc(doc, size, overlap) {
    const text = doc.text.replace(/\s+/g, " ").trim();
    const out = [];
    let i = 0;
    while (i < text.length) {
      let end = Math.min(text.length, i + size);
      if (end < text.length) {
        const sp = text.lastIndexOf(" ", end);
        if (sp > i + size * 0.5) end = sp;
      }
      out.push({ docId: doc.id, title: doc.title, text: text.slice(i, end).trim() });
      if (end >= text.length) break;
      i = Math.max(end - overlap, i + 1);
    }
    return out;
  }

  async function buildIndex() {
    if (!state.embedder) return;
    state.busy = true; updateControls();
    const raw = [];
    for (const d of state.docs) raw.push(...chunkDoc(d, state.chunkSize, state.overlap));
    setProg(0.1, `embedding ${raw.length} chunks…`);
    const t0 = now();
    const vecs = await state.embedder(raw.map((c) => c.text));
    raw.forEach((c, i) => (c.vec = vecs[i]));
    state.chunks = raw;
    setProg(1, `index ready · ${raw.length} chunks · ${Math.round(now() - t0)} ms`);
    indexTag.textContent = `${raw.length} chunks`;
    state.busy = false; updateControls();
  }

  async function loadModels() {
    loadBtn.disabled = true;
    try {
      setProg(0.02, "loading embedding model (MiniLM)…");
      state.embedder = await getEmbedder((p) => setProg(0.05 + 0.35 * (p.progress || 0), p.text));
      setProg(0.42, "embeddings ready — building index…");
      await buildIndex();

      if (hasWebGPU()) {
        setProg(0.45, "loading on-device LLM (first time downloads weights)…");
        try {
          state.engine = await getChatEngine(state.modelId, (p) => setProg(0.45 + 0.55 * (p.progress || 0), p.text || "loading LLM…"));
          setProg(1, "✅ ready — ask away");
        } catch (e) {
          setProg(1, "⚠️ LLM load failed: " + e.message + " — retrieval still works (extractive mode)");
        }
      } else {
        setProg(1, "⚠️ No WebGPU → retrieval-only (extractive) mode. Use Chrome/Edge for on-device generation.");
      }
      state.ready = true;
      loadBtn.style.display = "none";
      if (!chatLog.children.length) addMsg("bot", state.engine
        ? "Ready. I answer from the system-design notes on the right. Try: “When would I use consistent hashing?” or “What is the token bucket?”"
        : "Retrieval is ready (no on-device LLM here). I'll return the most relevant note chunks for your question — a real vector search, just without generation.");
    } catch (e) {
      setProg(0, "Failed to load models: " + e.message);
      loadBtn.disabled = false;
    }
    updateControls();
  }

  async function ask() {
    const q = ta.value.trim();
    if (!q || state.busy) return;
    if (!state.embedder) { statusText.textContent = "Load the models first ↑"; return; }
    ta.value = "";
    addMsg("user", q);
    state.busy = true; abortRequested = false; updateControls();

    // retrieval
    let hits = [];
    let tRetrieve = 0;
    if (state.useRAG && state.chunks.length) {
      const t0 = now();
      const qv = await state.embedder(q);
      hits = cosineTopK(qv, state.chunks, state.topK, state.minSim);
      tRetrieve = now() - t0;
    }
    showContext(hits, tRetrieve);

    // generation
    if (state.engine) {
      const context = hits.map((hh, i) => `[${i + 1}] (${hh.item.title}) ${hh.item.text}`).join("\n\n");
      const messages = state.useRAG
        ? [
            { role: "system", content: "You are a precise assistant. Answer the question using ONLY the provided context. Cite sources inline like [1], [2]. If the answer is not in the context, say you don't know." },
            { role: "user", content: `Context:\n${context || "(none)"}\n\nQuestion: ${q}` },
          ]
        : [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: q },
          ];
      const bubble = addMsg("bot", "");
      bubble.textContent = "▍";
      try {
        await streamChat(state.engine, messages, {
          temperature: state.temperature, max_tokens: 512,
          onToken: (_d, full) => { if (!abortRequested) { bubble.textContent = full + "▍"; chatLog.scrollTop = chatLog.scrollHeight; } },
        });
        bubble.textContent = bubble.textContent.replace(/▍$/, "");
      } catch (e) {
        bubble.textContent = "⚠️ generation error: " + e.message;
      }
    } else {
      // extractive fallback — real retrieval, no generation
      if (!state.useRAG) addMsg("bot", "(RAG is off and there's no on-device LLM here, so there's nothing to answer from. Turn RAG on to see retrieval.)");
      else if (!hits.length) addMsg("bot", "I don't have anything relevant in the notes for that.");
      else addMsg("bot", "Most relevant passages (retrieval-only mode):\n\n" + hits.map((hh, i) => `[${i + 1}] ${hh.item.title}\n${hh.item.text}`).join("\n\n"));
    }
    state.busy = false; updateControls();
  }

  // ---------------- panel ----------------
  const indexTag = h("span", { class: "tag", text: "0 chunks" });
  const docList = h("div", { style: { display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" } });
  function renderDocs() {
    clear(docList);
    state.docs.forEach((d) => docList.appendChild(h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px" } }, [
      h("span", { style: { flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, text: d.title }),
      d.custom ? h("button", { class: "btn", style: { padding: "2px 8px", fontSize: "11px" }, onclick: () => { state.docs = state.docs.filter((x) => x !== d); renderDocs(); markStale(); } }, ["✕"]) : h("span", { class: "tag", text: "built-in" }),
    ])));
  }
  const addTitle = h("input", { placeholder: "New doc title", style: inpStyle() });
  const addText = h("textarea", { rows: "3", placeholder: "Paste any text — it becomes searchable", style: { ...inpStyleObj(), resize: "vertical" } });
  const addBtn = button("+ Add document", () => {
    const t = addText.value.trim(); if (!t) return;
    state.docs.push({ id: "custom-" + state.docs.length, title: addTitle.value.trim() || "Untitled", text: t, custom: true });
    addTitle.value = ""; addText.value = ""; renderDocs(); markStale();
  });
  const rebuildBtn = button("↻ Rebuild index", () => buildIndex(), { primary: true });

  let stale = false;
  function markStale() { stale = true; indexTag.textContent = "index stale — rebuild"; indexTag.className = "tag warn"; }

  const chunkSlider = slider({ label: "Chunk size", min: 120, max: 1000, step: 20, value: state.chunkSize, fmt: (v) => v + " ch", hint: "chars", onInput: (v) => { state.chunkSize = v; markStale(); } });
  const overlapSlider = slider({ label: "Chunk overlap", min: 0, max: 300, step: 10, value: state.overlap, fmt: (v) => v + " ch", onInput: (v) => { state.overlap = v; markStale(); } });
  const topkSlider = slider({ label: "Top-k retrieved", min: 1, max: 8, step: 1, value: state.topK, fmt: (v) => String(v), hint: "recall↑ tokens↑", onInput: (v) => { state.topK = v; } });
  const simSlider = slider({ label: "Min similarity", min: 0, max: 0.7, step: 0.01, value: state.minSim, fmt: (v) => v.toFixed(2), hint: "relevance gate", onInput: (v) => { state.minSim = v; } });
  const tempSlider = slider({ label: "Temperature", min: 0, max: 1.2, step: 0.05, value: state.temperature, fmt: (v) => v.toFixed(2), hint: "creativity", onInput: (v) => { state.temperature = v; } });
  const ragToggle = toggle({ label: "Use retrieval (RAG)", value: state.useRAG, hint: "grounding", onToggle: (v) => { state.useRAG = v; } });
  const modelSeg = segmented({ options: CHAT_MODELS.map((m) => ({ label: m.label, value: m.id })), value: state.modelId, onSelect: (v) => { state.modelId = v; if (state.ready) statusText.textContent = "Reload the page to switch model (frees GPU memory)."; } });

  panel.append(
    panelSection("Knowledge base", [docList, indexTag, h("div", { style: { height: "8px" } }), addTitle, h("div", { style: { height: "6px" } }), addText, h("div", { style: { height: "6px" } }), addBtn, h("div", { style: { height: "6px" } }), rebuildBtn]),
    panelSection("Retrieval", [chunkSlider, overlapSlider, topkSlider, simSlider]),
    panelSection("Generation", [
      h("div", { class: "control" }, [h("span", { class: "control-label", text: "On-device model" }), modelSeg,
        h("span", { class: "hint", html: hasWebGPU() ? "WebGPU detected ✓ — weights download once, then cached." : "No WebGPU — generation off; retrieval still works." })]),
      tempSlider, ragToggle,
    ]),
  );

  function updateControls() {
    sendBtn.disabled = state.busy || !state.embedder;
    stopBtn.style.display = state.busy && state.engine ? "inline-flex" : "none";
    rebuildBtn.disabled = state.busy || !state.embedder;
    ta.disabled = state.busy;
  }

  renderDocs();
  updateControls();

  caption.innerHTML = "This is the real thing, not a mock: MiniLM embeds every chunk on your device, cosine search ranks them, and a small LLM streams a grounded answer. <strong>Turn RAG off</strong> and re-ask to feel why grounding matters. <strong>Drop min-similarity to 0 and top-k to 8</strong> to see irrelevant chunks pollute the context; <strong>raise chunk size</strong> and watch fewer, fatter chunks change what gets retrieved.";

  return () => { abortRequested = true; try { state.engine?.interruptGenerate?.(); } catch (e) {} };

  function inpStyleObj() {
    return { width: "100%", fontFamily: "var(--sans)", fontSize: "13px", padding: "8px 10px", borderRadius: "9px", border: "1px solid var(--glass-hairline)", background: "var(--surface2)", color: "var(--ink)" };
  }
  function inpStyle() { const o = inpStyleObj(); return o; }
}
