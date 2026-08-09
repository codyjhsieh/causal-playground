// System Design Dojo — app shell. Registry-driven router, same contract as the
// causal playground but a completely separate page. Each built module lazy-loads
// and exposes { mount(container) -> cleanup }. `eli5` is a plain-words intuition
// injected above every lesson; HOWTO is a one-line "Try it" hint.
//
// Each module is a STANDALONE MINI-SYSTEM — one classic interview problem you
// build up piece by piece into a real, working thing. Two tracks: Classic systems
// and an AI systems track (on-device models, no keys). Modules with `soon:true`
// are on the roadmap (greyed in the nav); we build them one-by-one. `load` present
// === built.

import { h, clear } from "./lib/dom.js";
import { patchCanvas } from "./lib/canvaspatch.js";

patchCanvas(); // make ctx.fillStyle = "var(--x)" work in canvas everywhere

const MODULES = [
  { group: "Start here", id: "home", title: "How to use the Dojo",
    eli5: "",
    load: () => import("./modules/home.js") },

  { group: "Classic systems", id: "ratelimiter", title: "Rate Limiter",
    eli5: "A popular service gets more requests than it can safely handle, and it falls over for <em>everyone</em>. A rate limiter is a bouncer at the door: it admits requests only as fast as the system can serve them and turns the rest away cheaply — protecting the many from a traffic spike or a single greedy client.",
    load: () => import("./modules/ratelimiter.js") },
  { group: "Classic systems", id: "cache", title: "Key-Value Cache (LRU / TTL)", soon: true },
  { group: "Classic systems", id: "loadbalancer", title: "Load Balancer", soon: true },
  { group: "Classic systems", id: "urlshortener", title: "URL Shortener", soon: true },
  { group: "Classic systems", id: "queue", title: "Message Queue & Backpressure", soon: true },
  { group: "Classic systems", id: "conshash", title: "Consistent Hashing", soon: true },
  { group: "Classic systems", id: "replication", title: "Replication & Quorums", soon: true },
  { group: "Classic systems", id: "alerting", title: "Alerting System", soon: true },

  { group: "AI systems", id: "ragbot", title: "RAG Chatbot (on-device)",
    eli5: "A chatbot that looks things up before it speaks. Instead of trusting the model's memory, it searches a pile of documents for the passages most relevant to your question, hands those to the model, and asks it to answer <em>only</em> from them — grounded, current, and far less likely to make things up.",
    load: () => import("./modules/ragbot.js") },
  { group: "AI systems", id: "semcache", title: "Semantic Cache",
    eli5: "Lots of users ask the <em>same thing</em> in different words. A semantic cache remembers past questions as points in meaning-space; when a new question lands close enough to an old one, it returns the stored answer and skips the model entirely — instant and free. The catch: “close enough” is a dial. Set it loose and you'll serve confident answers to the <em>wrong</em> question.",
    load: () => import("./modules/semcache.js") },
  { group: "AI systems", id: "tokenomics", title: "Token Economics & Latency",
    eli5: "An LLM app's bill and its speed are both paid in <strong>tokens</strong>. Every request drags a prompt in and streams an answer out; you pay per token each way, and the answer can't finish before its last token is generated. The napkin math every AI-systems design starts from: tokens × requests = dollars, and how slow is the tail?",
    load: () => import("./modules/tokenomics.js") },
  { group: "AI systems", id: "gateway", title: "LLM Gateway (routing & fallback)", soon: true },
  { group: "AI systems", id: "vector", title: "Vector Search & ANN", soon: true },
];

// One-line hands-on instruction per built module — what to add/drag, what to watch.
const HOWTO = {
  ratelimiter: `Start with the limiter Off and watch the server melt under the spike. Switch to Token Bucket, then tune Refill toward the server's capacity — find the rate that stops 503s without rejecting real users.`,
  ragbot: `Hit "Load on-device models", then ask a question. Toggle Use-RAG off and re-ask to watch it hallucinate; drop Min-similarity to 0 with Top-k 8 to see junk pollute the context.`,
  semcache: `Drag the similarity threshold down — watch the hit-rate and cost savings climb while the wrong-answer meter turns red. Find the sweet spot between the two humps.`,
  tokenomics: `Drag "output tokens" and "requests/day" up — watch $/day and the p99 latency climb, then flip Streaming on to rescue the felt speed (TTFT).`,
};

const app = document.getElementById("app");
const nav = document.getElementById("nav");
const main = document.getElementById("main");
const sidebar = document.getElementById("sidebar");
let currentCleanup = null;
let currentNavId = null;

// mobile hamburger
const menuBtn = h("button", {
  class: "nav-mobile-toggle", type: "button", "aria-label": "Menu",
  onclick: () => app.classList.toggle("nav-open"),
}, [h("span", { class: "burger" })]);
const brand = sidebar.querySelector(".brand");
if (brand) brand.appendChild(menuBtn);

function buildNav() {
  let lastGroup = null;
  let n = 0;
  for (const m of MODULES) {
    if (m.group !== lastGroup) {
      nav.appendChild(h("div", { class: "nav-group-title", text: m.group }));
      lastGroup = m.group;
    }
    const built = !!m.load;
    if (built) n++;
    const children = [
      h("span", { class: "nav-num", text: built ? String(n) : "·" }),
      h("span", { text: m.title }),
    ];
    if (!built) children.push(h("span", { class: "nav-soon-tag", text: "soon" }));
    const item = h("div", {
      class: "nav-item" + (built ? "" : " soon"),
      dataset: { id: m.id },
      onclick: built ? () => navigate(m.id) : () => navigate("home"),
    }, children);
    nav.appendChild(item);
  }
}

function injectEli5(text) {
  if (!text) return;
  const card = h("aside", { class: "eli5" }, [
    h("span", { class: "eli5-icon", text: "💡" }),
    h("div", { class: "eli5-body" }, [
      h("div", { class: "eli5-title", text: "In plain words" }),
      h("p", { class: "eli5-text", html: text }),
    ]),
  ]);
  const head = main.querySelector(".lesson-head");
  if (head) head.insertAdjacentElement("afterend", card);
  else (main.querySelector(".lesson") || main).prepend(card);
}

function injectHowto(id) {
  const text = HOWTO[id];
  if (!text) return;
  const pill = h("div", { class: "howto" }, [
    h("span", { class: "howto-icon", text: "👆" }),
    h("span", { class: "howto-label", text: "Try it" }),
    h("span", { class: "howto-text", text }),
  ]);
  const eli5 = main.querySelector(".eli5");
  const anchor = eli5 || main.querySelector(".lesson-head");
  if (anchor) anchor.insertAdjacentElement("afterend", pill);
  else (main.querySelector(".lesson") || main).prepend(pill);
}

async function navigate(id) {
  const m = MODULES.find((x) => x.id === id && x.load) || MODULES[0];
  currentNavId = m.id;
  [...nav.querySelectorAll(".nav-item")].forEach((el) =>
    el.classList.toggle("active", el.dataset.id === m.id));
  if (location.hash !== "#" + m.id) history.replaceState(null, "", "#" + m.id);
  app.classList.remove("nav-open");

  if (currentCleanup) { try { currentCleanup(); } catch (e) {} currentCleanup = null; }
  clear(main);
  const loading = h("div", { class: "lesson" }, [h("p", { class: "note", text: "loading…" })]);
  main.appendChild(loading);
  try {
    const mod = await m.load();
    if (currentNavId !== m.id) return; // navigated away while loading
    clear(main);
    currentCleanup = mod.mount(main) || null;
    injectEli5(m.eli5);
    injectHowto(m.id);
    main.scrollTop = 0;
  } catch (err) {
    clear(main);
    main.appendChild(h("div", { class: "lesson" }, [
      h("h1", { class: "lesson-title", text: m.title }),
      h("p", { class: "note", text: "This module failed to load: " + (err && err.message) }),
      h("pre", { class: "note", style: { whiteSpace: "pre-wrap" }, text: (err && err.stack) || "" }),
    ]));
    console.error(err);
  }
}

// Expose the curriculum so the home page can render an accurate roadmap.
export const CURRICULUM = MODULES.map((m) => ({ group: m.group, id: m.id, title: m.title, built: !!m.load }));
window.__DOJO_NAV = (id) => navigate(id);

buildNav();
const startId = location.hash.slice(1);
navigate(MODULES.some((m) => m.id === startId && m.load) ? startId : "home");
window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (MODULES.some((m) => m.id === id && m.load)) navigate(id);
});
