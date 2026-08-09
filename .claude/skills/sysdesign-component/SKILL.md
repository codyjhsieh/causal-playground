---
name: sysdesign-component
description: Build (or revise) one interactive mini-system for the System Design Dojo — the hands-on system-design interview trainer under `sysdesign/`. Each mini-system is a REAL, working thing you build up PIECE BY PIECE (rate limiter, URL shortener, KV cache, load balancer, message queue, consistent hashing, replicated store, alerting system; plus an AI track: RAG service, chatbot, semantic cache, LLM gateway). Use whenever the user asks to add/build/improve a mini-system or says "next component". Produces a `sysdesign/modules/<id>.js` module + registry entry + "Try it" pill matching the platform's contract.
---

# Build a System Design Dojo mini-system

The Dojo (`sysdesign/`) is a static, no-build, no-signup, GitHub-Pages trainer for
a **general system-design interview** (the user is interviewing at an AI company,
but is NOT tested on that company's products — keep content vendor-neutral and
canonical). It is completely separate from the causal playground at the repo root.

## What each module is

A **standalone mini-system** — one classic interview problem — that the learner
**builds up piece by piece into a REAL, working thing**, the way you'd grow a
design live on a whiteboard, except every piece actually runs in the browser.

Two non-negotiables:

1. **Real, not simulated-with-a-formula.** The mechanics must genuinely execute:
   a real token-bucket that really admits/rejects real request objects; a real
   LRU cache that really evicts and reports a measured hit-rate; a real
   consistent-hash ring that really places real keys and really rebalances on
   node add/remove; a real replication log with real lag. Metrics are *measured
   from the running system*, never hand-computed curves. (Concept-only slider
   demos are the exception, not the norm — prefer building the real thing.)

2. **Built piece by piece.** The module exposes an ordered set of *pieces* the
   learner adds (as staged toggles / a "build steps" control). Each piece is the
   natural next move in an interview, visibly changes real behavior, and exposes
   its own trade-off. Example — Rate Limiter: (1) no limiter → server overloads
   under bursts; (2) add a token bucket → excess rejected cheaply at the edge;
   (3) tune refill/burst → too strict rejects real users, too loose overloads
   again; (4) per-user keys → one abuser no longer starves everyone; (5) swap
   algorithm → fixed-window boundary burst vs sliding window.

## The AI track

On-device only (no keys, no backend). Use `sysdesign/lib/models.js`:
`getEmbedder()` (MiniLM embeddings, WASM/WebGPU) and `getChatEngine()` +
`streamChat()` (WebLLM, small instruct model on WebGPU, weights cached in-browser
on first use). Feature-detect with `hasWebGPU()` and degrade gracefully
(retrieval still works without a GPU). See `modules/ragbot.js` for the pattern.

## The module contract

Create `sysdesign/modules/<id>.js` exporting exactly:

```js
export function mount(container) {
  // build the lesson into `container`, wire up the running mini-system
  return () => {/* cleanup: cancel rAF/intervals, remove listeners, free engines */};
}
```

Shared primitives (all under `sysdesign/lib/`):

- `import { h, clear } from "../lib/dom.js";` — `h(tag, attrs, children)`. attrs: `class`, `text`, `html`, `style` (obj), `on*`, `dataset`.
- `import { lessonLayout, panelSection, slider, toggle, segmented, button, readout, challenge, note } from "../lib/ui.js";`
  - `lessonLayout({title, idea})` → `{root, stage, panel, caption}`; append `root`. Put the running diagram/animation in `stage`, the build-steps + knobs + readouts in `panel`, a live takeaway in `caption`.
  - `slider(...)` → el with `.getValue()/.setValue(v)`; `toggle(...)`; `segmented({options:[{label,value}], value, onSelect})`; `readout(...)` → `.set(val,sub)`, `.flash()`; `challenge({goal})` → `.setState(solved,msg)`.
- `import { Canvas, Scale, drawAxes, dot, line, niceTicks, histogram } from "../lib/plot.js";` — retina canvas for live time-series / diagrams. `new Canvas(w,h,{margin})`, `cv.el`, `cv.ctx`, `cv.box`, `cv.clear()`, `cv.evToPx(e)`.
- Canvas colors use CSS vars directly (`ctx.fillStyle = "var(--accent)"`); tokens: `--ink --dim --accent --accent2 --pos --neg --warn --gold --hot`. `patchCanvas()` runs in `main.js`.

Run live systems on a fixed loop (`setInterval`/`requestAnimationFrame`); ALWAYS
cancel it in the returned cleanup so navigating away leaves nothing running.

## Registering the module

Edit `sysdesign/main.js`:

1. Add a `MODULES` entry in its track group (keep group order sensible):
   ```js
   { group: "Classic systems", id: "ratelimiter", title: "Rate Limiter",
     eli5: "Plain-words intuition, no jargon — what breaks, and what the piece fixes.",
     load: () => import("./modules/ratelimiter.js") },
   ```
2. Add a one-line `HOWTO[id]` — exactly what to add/drag and what to watch.
3. Flip the topic's roadmap dot to built in `modules/home.js` (it reads the registry, so just having `load` present is enough; make sure it's listed).

## Quizzes: skip by default

The platform is for *building and operating the real thing*, not testing. Do not
add quizzes unless asked. Put the pedagogy in the running system, the eli5 card,
the "Try it" pill, the live readouts, and the caption.

## Quality bar

- **eli5 first**: concrete everyday analogy before any jargon.
- **Alive on arrival**: something is already running/animating; no "click to begin" wall (model-loading gates in the AI track are the one allowed exception).
- **A number that moves**: measured metrics in `readout`s that `.flash()` on change — success %, hit-rate, p99, lag — read off the *actual* run.
- **Piece-by-piece**: an ordered build-steps control; each step both fixes something and introduces the next trade-off. The caption narrates "you just added X; now watch Y."
- **Cleanup**: the returned fn cancels every loop/listener/engine.
- **Self-contained**: no signups; AI pieces use on-device models via `lib/models.js`.

## Checklist before finishing

- [ ] Mechanics genuinely execute (real objects flowing), metrics measured not formula'd.
- [ ] Ordered build-steps; each piece changes real behavior and shows a trade-off.
- [ ] `mount()` returns a cleanup that stops all loops; navigating away is quiet.
- [ ] Registry entry + HOWTO added; appears on the home roadmap as built.
- [ ] Loaded in the dev server and clicked through every build step.
