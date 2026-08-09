// On-device model loader — no API keys, no signups, no backend. Everything runs
// in the browser. Embeddings via transformers.js (Xenova/all-MiniLM-L6-v2, ~20MB,
// WASM or WebGPU). Chat/generation via WebLLM (a small instruct model on WebGPU;
// weights are fetched to the browser's Cache on first use, then reused offline).
//
// Both libraries are imported lazily from a CDN the first time you actually load a
// model, so the shell stays instant and pages that don't need a model pay nothing.

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js";
const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";

// Small, browser-friendly instruct models from WebLLM's prebuilt list. q4f32 is
// the most compatible (works without the shader-f16 GPU feature).
export const CHAT_MODELS = [
  { id: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC", label: "Qwen2.5 0.5B", size: "~0.6 GB", note: "fastest" },
  { id: "Llama-3.2-1B-Instruct-q4f32_1-MLC", label: "Llama 3.2 1B", size: "~1.1 GB", note: "balanced" },
  { id: "Llama-3.2-3B-Instruct-q4f32_1-MLC", label: "Llama 3.2 3B", size: "~2.3 GB", note: "best answers" },
];
export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0].id;

export function hasWebGPU() {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

// ---------------- Embeddings ----------------
let _embedder = null, _embedderPromise = null;

export async function getEmbedder(onProgress) {
  if (_embedder) return _embedder;
  if (_embedderPromise) return _embedderPromise;
  _embedderPromise = (async () => {
    const T = await import(/* @vite-ignore */ TRANSFORMERS_URL);
    if (T.env) {
      T.env.allowLocalModels = false;        // don't probe our own origin for /models
      if (T.env.backends?.onnx?.wasm) T.env.backends.onnx.wasm.numThreads = 1;
    }
    const extractor = await T.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      progress_callback: (p) => onProgress && onProgress(normalizeHF(p)),
    });
    const fn = async (texts) => {
      const many = Array.isArray(texts);
      const out = await extractor(many ? texts : [texts], { pooling: "mean", normalize: true });
      const arr = out.tolist();
      return many ? arr : arr[0];
    };
    fn.dim = 384;
    _embedder = fn;
    return fn;
  })();
  return _embedderPromise;
}

// ---------------- Chat / generation ----------------
let _engine = null, _engineModel = null, _enginePromise = null;

export async function getChatEngine(modelId = DEFAULT_CHAT_MODEL, onProgress) {
  if (!hasWebGPU()) throw new Error("WebGPU not available in this browser — on-device chat needs WebGPU (Chrome/Edge, or Safari 17+).");
  if (_engine && _engineModel === modelId) return _engine;
  if (_enginePromise && _engineModel === modelId) return _enginePromise;
  _engineModel = modelId;
  _enginePromise = (async () => {
    const webllm = await import(/* @vite-ignore */ WEBLLM_URL);
    const engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (r) => onProgress && onProgress({ text: r.text || "", progress: r.progress ?? 0 }),
    });
    _engine = engine;
    return engine;
  })();
  return _enginePromise;
}

// Stream a chat completion. messages: [{role, content}]. onToken(deltaString).
// Returns the full text. Set signal to an AbortController.signal to cancel.
export async function streamChat(engine, messages, { temperature = 0.6, max_tokens = 512, onToken } = {}) {
  const stream = await engine.chat.completions.create({ messages, temperature, max_tokens, stream: true });
  let full = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || "";
    if (delta) { full += delta; onToken && onToken(delta, full); }
  }
  return full;
}

// ---------------- helpers ----------------
export function cosineTopK(queryVec, items, k, minSim = -1) {
  // items: [{vec, ...}]; vectors are L2-normalized so cosine == dot product.
  const scored = items.map((it) => {
    let d = 0; const v = it.vec;
    for (let i = 0; i < v.length; i++) d += v[i] * queryVec[i];
    return { item: it, score: d };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score >= minSim).slice(0, k);
}

function normalizeHF(p) {
  // transformers progress events → {text, progress(0..1)}
  if (!p) return { text: "", progress: 0 };
  if (p.status === "progress" && p.total) {
    return { text: `downloading ${p.file || "model"}`, progress: (p.loaded || 0) / p.total };
  }
  if (p.status === "ready" || p.status === "done") return { text: "ready", progress: 1 };
  return { text: p.status || "loading", progress: p.progress ? p.progress / 100 : 0 };
}
