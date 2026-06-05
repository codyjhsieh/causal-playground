// Interactive "test yourself" engine. Given a list of questions it renders a
// one-at-a-time quiz with immediate feedback, per-answer explanations, a running
// score, and a final mastery summary with retry. Supports single-answer
// multiple-choice (answer: index) and select-all-that-apply (answer: [indices]).
// Pure DOM + CSS; no animation lib dependency so it stays light.

import { h, clear } from "./dom.js";

const setEq = (a, b) => {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
};

export function quizWidget(questions, { title = "Test yourself" } = {}) {
  const state = { i: 0, score: 0, locked: new Array(questions.length).fill(false) };

  const root = h("section", { class: "quiz" });
  const head = h("div", { class: "quiz-head" }, [
    h("span", { class: "quiz-title" }, [h("span", { class: "quiz-icon", text: "✎" }), title]),
    h("span", { class: "quiz-progress" }),
  ]);
  const body = h("div", { class: "quiz-body" });
  root.append(head, body);
  const progressEl = head.querySelector(".quiz-progress");

  function setProgress(n) { progressEl.textContent = `${n} / ${questions.length}`; }

  function renderQuestion() {
    clear(body);
    setProgress(state.i + 1);
    const qd = questions[state.i];
    const isMulti = Array.isArray(qd.answer);
    const correctSet = new Set(isMulti ? qd.answer : [qd.answer]);
    const chosen = new Set();
    let locked = false;

    body.append(
      h("p", { class: "quiz-prompt", html: `<span class="quiz-qnum">Q${state.i + 1}.</span> ${qd.q}` }),
      isMulti ? h("p", { class: "quiz-hint", text: "Select all that apply." }) : null,
    );

    const choicesEl = h("div", { class: "quiz-choices" });
    const explainEl = h("div", { class: "quiz-explain" });
    const footer = h("div", { class: "quiz-foot" });

    const btns = qd.choices.map((c, idx) =>
      h("button", { class: "quiz-choice", type: "button" }, [
        h("span", { class: "quiz-mark", text: isMulti ? "□" : String.fromCharCode(65 + idx) }),
        h("span", { class: "quiz-choice-text", html: c }),
      ])
    );

    function grade() {
      if (locked) return;
      locked = true;
      state.locked[state.i] = true;
      const right = setEq(chosen, correctSet);
      if (right) state.score++;
      btns.forEach((b, idx) => {
        b.classList.add("done");
        if (correctSet.has(idx)) b.classList.add("correct");
        else if (chosen.has(idx)) b.classList.add("wrong");
      });
      explainEl.classList.add("show", right ? "ok" : "bad");
      explainEl.innerHTML = `<strong>${right ? "✓ Correct" : "✗ Not quite"}</strong> — ${qd.explain}`;
      clear(footer);
      const last = state.i >= questions.length - 1;
      const next = h("button", { class: "btn primary", type: "button" }, [last ? "See results →" : "Next question →"]);
      next.addEventListener("click", () => { if (last) renderSummary(); else { state.i++; renderQuestion(); } });
      footer.appendChild(next);
    }

    btns.forEach((b, idx) => {
      b.addEventListener("click", () => {
        if (locked) return;
        if (isMulti) {
          const on = chosen.has(idx);
          if (on) { chosen.delete(idx); } else { chosen.add(idx); }
          b.classList.toggle("picked", !on);
          b.querySelector(".quiz-mark").textContent = !on ? "☑" : "□";
        } else {
          chosen.clear(); chosen.add(idx);
          grade();
        }
      });
      choicesEl.appendChild(b);
    });

    if (isMulti) {
      const submit = h("button", { class: "btn", type: "button" }, ["Check answer"]);
      submit.addEventListener("click", () => { if (chosen.size) grade(); });
      footer.appendChild(submit);
    }

    body.append(choicesEl, explainEl, footer);
  }

  function renderSummary() {
    clear(body);
    setProgress(questions.length);
    const pct = Math.round((100 * state.score) / questions.length);
    const tier = pct >= 80 ? "Mastery" : pct >= 50 ? "Getting there" : "Keep practicing";
    const retry = h("button", { class: "btn", type: "button" }, ["↻ Try again"]);
    retry.addEventListener("click", () => { state.i = 0; state.score = 0; renderQuestion(); });
    body.append(
      h("div", { class: "quiz-summary" + (pct >= 80 ? " pass" : "") }, [
        h("div", { class: "quiz-score", text: `${state.score} / ${questions.length}` }),
        h("div", { class: "quiz-tier", text: `${tier} · ${pct}%` }),
        retry,
      ])
    );
  }

  renderQuestion();
  return root;
}
