// UI primitives: sliders, toggles, buttons, numeric readouts, and a "challenge"
// widget with a goal + live win-state — the bits that make modules feel like
// games you can win rather than charts you watch.

import { h, clear } from "./dom.js";

export function slider({ label, min, max, step = 0.01, value, fmt = (v) => v.toFixed(2), onInput, hint }) {
  const out = h("output", { class: "slider-val", text: fmt(value) });
  const input = h("input", {
    type: "range", min, max, step, value,
    oninput: (e) => { const v = +e.target.value; out.textContent = fmt(v); onInput && onInput(v); },
  });
  const wrap = h("label", { class: "control slider" }, [
    h("span", { class: "control-label" }, [label, hint ? h("span", { class: "hint", text: " " + hint }) : null]),
    h("div", { class: "slider-row" }, [input, out]),
  ]);
  wrap.setValue = (v) => { input.value = v; out.textContent = fmt(v); };
  wrap.getValue = () => +input.value;
  return wrap;
}

export function toggle({ label, value = false, onToggle, hint }) {
  let on = value;
  const knob = h("span", { class: "knob" });
  const sw = h("button", { class: "switch" + (on ? " on" : ""), type: "button", "aria-pressed": String(on) }, [knob]);
  sw.addEventListener("click", () => {
    on = !on;
    sw.classList.toggle("on", on);
    sw.setAttribute("aria-pressed", String(on));
    onToggle && onToggle(on);
  });
  const wrap = h("label", { class: "control toggle" }, [
    h("span", { class: "control-label" }, [label, hint ? h("span", { class: "hint", text: " " + hint }) : null]),
    sw,
  ]);
  wrap.set = (v) => { on = v; sw.classList.toggle("on", on); };
  return wrap;
}

export function button(label, onClick, { primary = false, kind = "" } = {}) {
  return h("button", {
    type: "button", class: "btn" + (primary ? " primary" : "") + (kind ? " " + kind : ""),
    onclick: onClick,
  }, [label]);
}

export function segmented({ options, value, onSelect }) {
  const wrap = h("div", { class: "segmented" });
  const btns = options.map((opt) => {
    const b = h("button", {
      type: "button", class: "seg" + (opt.value === value ? " active" : ""),
      onclick: () => {
        [...wrap.children].forEach((c) => c.classList.remove("active"));
        b.classList.add("active");
        onSelect && onSelect(opt.value);
      },
    }, [opt.label]);
    return b;
  });
  btns.forEach((b) => wrap.appendChild(b));
  return wrap;
}

// A big animated number readout (e.g. estimated ATE).
export function readout({ label, value = "—", sub, accent }) {
  const v = h("div", { class: "readout-value", style: accent ? { color: accent } : {}, text: value });
  const s = sub ? h("div", { class: "readout-sub", text: sub }) : null;
  const wrap = h("div", { class: "readout" }, [h("div", { class: "readout-label", text: label }), v, s]);
  wrap.set = (val, subtext) => {
    v.textContent = val;
    if (s && subtext != null) s.textContent = subtext;
  };
  wrap.flash = () => { v.classList.remove("flash"); void v.offsetWidth; v.classList.add("flash"); };
  return wrap;
}

// Challenge widget: a goal line + status pill that flips to "solved".
export function challenge({ goal }) {
  const status = h("span", { class: "challenge-status", text: "in progress" });
  const wrap = h("div", { class: "challenge" }, [
    h("span", { class: "challenge-icon", text: "◇" }),
    h("div", { class: "challenge-body" }, [
      h("div", { class: "challenge-goal", text: goal }),
      h("div", { class: "challenge-feedback" }),
    ]),
    status,
  ]);
  const feedback = wrap.querySelector(".challenge-feedback");
  const icon = wrap.querySelector(".challenge-icon");
  wrap.setState = (solved, msg) => {
    wrap.classList.toggle("solved", solved);
    status.textContent = solved ? "solved ✓" : "in progress";
    icon.textContent = solved ? "◆" : "◇";
    if (msg != null) feedback.textContent = msg;
  };
  return wrap;
}

// Standard module layout: a stage (left, the animated diagram) + a panel
// (right, controls/readouts) + a caption strip. Returns the assembled root and
// references to the regions for the module to fill.
export function lessonLayout({ title, idea }) {
  const stage = h("div", { class: "stage" });
  const panel = h("div", { class: "panel" });
  const caption = h("div", { class: "caption" });
  const root = h("div", { class: "lesson" }, [
    h("header", { class: "lesson-head" }, [
      h("h1", { class: "lesson-title", text: title }),
      idea ? h("p", { class: "lesson-idea", text: idea }) : null,
    ]),
    h("div", { class: "lesson-body" }, [stage, panel]),
    caption,
  ]);
  return { root, stage, panel, caption };
}

export function panelSection(title, children = []) {
  return h("section", { class: "panel-section" }, [
    title ? h("h3", { class: "panel-section-title", text: title }) : null,
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

export function note(text) {
  return h("p", { class: "note", text });
}

export { clear };
