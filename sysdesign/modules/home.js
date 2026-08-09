// Landing page: frames the Dojo (a hands-on system-design interview trainer where
// you build real mini-systems piece by piece) and renders a live roadmap from the
// curriculum registry.

import { h } from "../lib/dom.js";
import { CURRICULUM } from "../main.js";

export function mount(container) {
  const go = (id) => window.__DOJO_NAV && window.__DOJO_NAV(id);

  const hero = h("div", { class: "home-hero" }, [
    h("h1", { text: "System Design Dojo" }),
    h("p", { html: "Prep for a system-design interview by <strong>building the real thing</strong>. Each topic is a standalone mini-system you assemble <strong>piece by piece</strong> — the way you'd grow a design live on a whiteboard — except every piece actually runs in your browser. A real token-bucket really throttles real requests; a real cache really evicts and reports its hit-rate; a real RAG chatbot really embeds, retrieves, and answers." }),
    h("p", { html: "No sign-ups, no API keys, no backend. AI pieces use <strong>on-device models</strong> (weights download once, then run locally). Move a knob, add a piece, watch the trade-off move." }),
  ]);

  const how = h("div", { class: "home-cards" }, [
    h("div", { class: "card" }, [
      h("h3", { html: "<span class='card-ico'>🧩</span> Build piece by piece" }),
      h("p", { text: "Every mini-system starts bare and breaks under load. You add the next component — a limiter, a cache, a replica — and watch it fix one problem and expose the next trade-off." }),
    ]),
    h("div", { class: "card" }, [
      h("h3", { html: "<span class='card-ico'>⚙️</span> Real, not hand-waved" }),
      h("p", { text: "The mechanics genuinely execute and the numbers are measured off the running system — success rate, p99 latency, hit-rate, replication lag — not drawn from a formula." }),
    ]),
    h("div", { class: "card" }, [
      h("h3", { html: "<span class='card-ico'>🗣️</span> Interview-shaped" }),
      h("p", { html: "Each piece is the natural next move you'd propose out loud: “it'll melt under a spike — add a rate limiter,” “reads are hot — add a cache,” “the leader is a SPOF — replicate.”" }),
    ]),
  ]);

  // Roadmap from the registry, grouped by track
  const roadmap = h("div", { class: "roadmap" });
  let last = null;
  for (const m of CURRICULUM) {
    if (m.id === "home") continue;
    if (m.group !== last) { roadmap.appendChild(h("div", { class: "roadmap-group", text: m.group })); last = m.group; }
    const item = h("div", {
      class: "roadmap-item" + (m.built ? "" : " locked"),
      onclick: m.built ? () => go(m.id) : null,
    }, [
      h("span", { class: "roadmap-dot " + (m.built ? "done" : "soon") }),
      h("span", { text: m.title }),
      m.built ? h("span", { class: "tag good", text: "ready", style: { marginLeft: "auto" } })
              : h("span", { class: "tag", text: "soon", style: { marginLeft: "auto" } }),
    ]);
    roadmap.appendChild(item);
  }

  const builtCount = CURRICULUM.filter((m) => m.built && m.id !== "home").length;
  const totalCount = CURRICULUM.filter((m) => m.id !== "home").length;

  const roadmapSection = h("div", { style: { marginTop: "26px" } }, [
    h("h3", { style: { fontSize: "16px", margin: "0 0 4px" }, text: "The mini-systems" }),
    h("p", { class: "note", style: { margin: "0 0 14px" },
      html: `<strong>${builtCount} of ${totalCount}</strong> built. We add the rest one at a time — open a “ready” one, or tell me which to build next.` }),
    roadmap,
  ]);

  const start = h("div", { style: { margin: "22px 0 6px", display: "flex", gap: "10px", flexWrap: "wrap" } }, [
    h("button", { class: "btn primary", onclick: () => go("ratelimiter"), style: { fontSize: "14px", padding: "11px 20px" } }, ["Build a Rate Limiter →"]),
    h("button", { class: "btn", onclick: () => go("ragbot"), style: { fontSize: "14px", padding: "11px 20px" } }, ["Try the RAG chatbot"]),
  ]);

  const root = h("div", { class: "lesson" }, [
    h("header", { class: "lesson-head" }, [hero]),
    start,
    how,
    roadmapSection,
  ]);
  container.appendChild(root);
  return () => {};
}
