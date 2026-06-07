// App shell: registry-driven router. Each module is a lazy import exposing
// { id, title, group, eli5, mount(container) -> cleanup }. The `eli5` string is
// a from-scratch, plain-words intuition injected at the top of every lesson so
// each section builds understanding before any jargon.
//
// Order follows the conceptual spine: foundations → graphs & identification →
// estimating effects → heterogeneity & policy → quasi-experiments →
// counterfactuals & longitudinal → discovery → RL → frontier → capstone.

import { h, clear } from "./lib/dom.js";
import { patchCanvas } from "./lib/canvaspatch.js";
import { quizWidget } from "./lib/quiz.js";

patchCanvas(); // make ctx.fillStyle = "var(--x)" work everywhere

const MODULES = [
  { group: "Foundations", id: "ladder", title: "The Ladder of Causation",
    eli5: "Imagine three superpowers. <strong>Seeing</strong>: you notice the street is wet whenever people carry umbrellas. <strong>Doing</strong>: you grab a hose and spray the street yourself to learn what wetness actually causes. <strong>Imagining</strong>: you ask “would the grass have died if I hadn’t watered it?” Plain data only gives you the first power — each step up needs an extra assumption about what causes what.",
    load: () => import("./modules/ladder.js") },
  { group: "Foundations", id: "simpson", title: "Simpson's Paradox",
    eli5: "A trend can <strong>flip completely</strong> when you split a crowd into groups. A treatment can look worse for everyone lumped together, yet better for both the sick and the healthy looked at separately — because the sickest people used it most. The lumped-together average lied; the groups told the truth.",
    load: () => import("./modules/simpson.js") },
  { group: "Foundations", id: "two-worlds", title: "Potential Outcomes",
    eli5: "Every choice has a road taken and a road not taken. To <em>know</em> a pill helped you, we’d need to see both you-who-took-it and you-who-skipped-it — but we only ever see one. That missing twin is why causes are hard to measure, and why we lean on averages across many people.",
    load: () => import("./modules/two-worlds.js") },
  { group: "Foundations", id: "confounding", title: "Confounding",
    eli5: "Ice-cream sales and sunburns rise together, but ice cream doesn’t cause sunburn — <strong>sunshine causes both</strong>. A hidden “common cause” can make two unrelated things look linked. Finding and holding it fixed is half of causal inference.",
    load: () => import("./modules/confounding.js") },

  { group: "Causal Graphs & Identification", id: "dsep", title: "d-Separation",
    eli5: "Picture the arrows in a cause-diagram as <strong>pipes that gossip flows through</strong>. Some junctions pass the gossip along, some block it, and one strange kind only starts gossiping once you eavesdrop on it. d-separation is just the rulebook for which facts stay unrelated.",
    load: () => import("./modules/dsep.js") },
  { group: "Causal Graphs & Identification", id: "backdoor", title: "The Backdoor Criterion",
    eli5: "A fair comparison means comparing apples to apples. The backdoor rule tells you <strong>exactly which background facts to hold fixed</strong> so a treated group and an untreated group differ only in the treatment — and warns you which facts to leave well alone.",
    load: () => import("./modules/backdoor.js") },
  { group: "Causal Graphs & Identification", id: "badcontrols", title: "Bad Controls & Collider Bias",
    eli5: "More controls is <strong>not</strong> always better. Condition on the wrong variable — a collider, or anything <em>caused</em> by the treatment — and you manufacture bias out of thin air. Learn to tell a good control from a poison one.",
    load: () => import("./modules/badcontrols.js") },
  { group: "Causal Graphs & Identification", id: "frontdoor", title: "The Front-Door Criterion",
    eli5: "Sometimes you can’t measure the hidden cause wrecking your comparison — but you <em>can</em> watch the mechanism in between. If a treatment works only <strong>through</strong> a measurable middle step, tracking that step lets you route around the unmeasured confounder. That detour is the front door.",
    load: () => import("./modules/frontdoor.js") },
  { group: "Causal Graphs & Identification", id: "docalc", title: "do-Calculus & Identification",
    eli5: "Three little rewrite rules turn a question about <strong>doing</strong> into one about plain <strong>seeing</strong> — or prove it’s impossible. It’s algebra for interventions: shuffle the graph until the <code>do()</code> disappears, and you’ve found a formula you can compute from data.",
    load: () => import("./modules/docalc.js") },
  { group: "Causal Graphs & Identification", id: "bounds", title: "Partial Identification & Bounds",
    eli5: "When you can’t pin the effect to a single number, you can still <strong>fence it in</strong>. With zero assumptions the data already traps the answer between a floor and a ceiling; each extra assumption you’re willing to make tightens the fence.",
    load: () => import("./modules/bounds.js") },

  { group: "Estimating Effects", id: "randomization", title: "Randomization",
    eli5: "Flip a coin to decide who gets the treatment. The coin doesn’t care who’s rich, sick, or lucky, so both groups end up <strong>alike in every way except the treatment</strong>. Any difference in outcomes must then be the treatment’s doing.",
    load: () => import("./modules/randomization.js") },
  { group: "Estimating Effects", id: "adjustment", title: "Adjustment & Stratification",
    eli5: "If men and women apply to different college departments, one overall admit-rate is unfair. Compare them <strong>department by department</strong>, then re-combine. That “re-stack the groups fairly” move is called standardization.",
    load: () => import("./modules/adjustment.js") },
  { group: "Estimating Effects", id: "propensity", title: "Propensity Scores",
    eli5: "Comparing job-trainees to a random survey is unfair — they differ in a dozen ways at once. The propensity score <strong>squashes all those differences into a single number</strong>: “how likely were you to be treated?” Match people with the same score and the comparison is fair again.",
    load: () => import("./modules/propensity.js") },
  { group: "Estimating Effects", id: "aipw", title: "Doubly-Robust Estimation",
    eli5: "Two ways to estimate an effect: model the <em>outcome</em>, or model <em>who got treated</em>. Doubly-robust combines them so you only need <strong>one of the two</strong> to be right — a safety net, with honest error bars from the influence function.",
    load: () => import("./modules/aipw.js") },
  { group: "Estimating Effects", id: "sensitivity", title: "Sensitivity Analysis",
    eli5: "Your estimate assumes <em>no</em> hidden confounder. Fair question: how strong would a secret confounder have to be to erase it? If it’d need to be wildly stronger than anything you measured, you’re safe. If a whisper would do it, beware.",
    load: () => import("./modules/sensitivity.js") },
  { group: "Estimating Effects", id: "dml", title: "Double Machine Learning",
    eli5: "Income muddies the link between 401(k)s and savings in a twisty, nonlinear way. Let flexible ML <strong>predict income’s effect away from both sides</strong>, then study what’s left over. A cross-fitting trick stops the ML from fooling itself.",
    load: () => import("./modules/dml.js") },

  { group: "Heterogeneous Effects & Policy", id: "cfr", title: "Neural Treatment Effects",
    eli5: "We want each person’s <em>personal</em> treatment effect, but the treated and untreated crowds look different. A neural net learns a <strong>fair viewpoint</strong> where the two crowds overlap, so it can fill in each person’s unseen other-world outcome.",
    load: () => import("./modules/cfr.js") },
  { group: "Heterogeneous Effects & Policy", id: "metalearners", title: "CATE & Meta-Learners",
    eli5: "The average effect hides who it helps and who it hurts. Meta-learners (S / T / X / R / DR) are recipes that turn any ML model into a <strong>personalized-effect</strong> estimator — and they disagree in revealing ways.",
    load: () => import("./modules/metalearners.js") },
  { group: "Heterogeneous Effects & Policy", id: "policy", title: "Policy Learning",
    eli5: "Knowing each person’s effect isn’t the goal — <strong>acting</strong> on it is. Learn a rule for whom to treat, then honestly score how much better off everyone ends up. A good rule can beat “treat everyone” at lower cost.",
    load: () => import("./modules/policy.js") },

  { group: "Quasi-Experiments", id: "iv", title: "Instrumental Variables",
    eli5: "You can’t randomize who goes to college — but growing up near one <strong>nudges</strong> some people to go, like a natural coin flip. Track how that nudge ripples into wages and you can isolate schooling’s real effect, even though ambition muddies everything.",
    load: () => import("./modules/iv.js") },
  { group: "Quasi-Experiments", id: "rdd", title: "Regression Discontinuity",
    eli5: "Someone who wins an election by 0.1% and someone who loses by 0.1% are basically <strong>identical — luck split them</strong>. So compare barely-winners to barely-losers: any jump right at the cutoff is caused by winning, not by being a stronger candidate.",
    load: () => import("./modules/rdd.js") },
  { group: "Quasi-Experiments", id: "did", title: "Difference-in-Differences",
    eli5: "New Jersey raised its minimum wage; next-door Pennsylvania didn’t. To guess what NJ <em>would</em> have done, assume it would’ve drifted just like PA did. The gap between NJ’s real path and that borrowed path is the policy’s effect.",
    load: () => import("./modules/did.js") },
  { group: "Quasi-Experiments", id: "synth", title: "Synthetic Control",
    eli5: "No control group? <strong>Build one.</strong> Blend other untreated states into a fake “twin” that tracks the treated state perfectly <em>before</em> the policy — then the gap that opens up afterward is the effect.",
    load: () => import("./modules/synth.js") },
  { group: "Quasi-Experiments", id: "staggered", title: "Staggered DiD & the TWFE Trap",
    eli5: "When regions adopt a policy in different years, the popular two-way fixed-effects regression can secretly use <strong>already-treated</strong> units as controls — and even flip the sign. See where the naive number comes from, and how to fix it.",
    load: () => import("./modules/staggered.js") },

  { group: "Counterfactuals & Longitudinal", id: "scm", title: "Counterfactuals & the SCM",
    eli5: "To ask “what would <em>this</em> person have earned with more schooling?” you first deduce their hidden luck and talent from what you saw, then rewind, change only their schooling, and replay with the <strong>same</strong> luck. That three-step replay is how counterfactuals work.",
    load: () => import("./modules/scm.js") },
  { group: "Counterfactuals & Longitudinal", id: "gmethods", title: "Time-Varying Treatment (g-methods)",
    eli5: "When today’s treatment changes tomorrow’s health, which changes tomorrow’s treatment, ordinary controlling-for <strong>breaks</strong>. The g-formula simulates the whole chain forward; weighting (MSM/IPTW) reweights people into a pseudo-randomized world.",
    load: () => import("./modules/gmethods.js") },
  { group: "Counterfactuals & Longitudinal", id: "mediation", title: "Mediation: Direct & Indirect",
    eli5: "Did the program work <em>because</em> it boosted confidence — or some other way? Mediation splits a total effect into the part flowing <strong>through</strong> the middle step and the part going <strong>around</strong> it.",
    load: () => import("./modules/mediation.js") },
  { group: "Counterfactuals & Longitudinal", id: "interference", title: "Interference & Spillovers",
    eli5: "Vaccinate your neighbor and you’re safer too. When one person’s treatment <strong>spills onto others</strong>, “treated vs untreated” stops being clean — and ignoring spillover both biases the effect and hides its biggest benefit.",
    load: () => import("./modules/interference.js") },

  { group: "Causal Discovery", id: "notears", title: "Neural Causal Discovery",
    eli5: "Hand a computer a pile of measurements — can it <strong>draw the cause-and-effect arrows itself?</strong> It gently tunes a grid of connection strengths while a clever math rule forbids loops, until a causal map crystallizes out of the data.",
    load: () => import("./modules/notears.js") },
  { group: "Causal Discovery", id: "pcalg", title: "Constraint-Based Discovery (PC)",
    eli5: "Start with every variable wired to every other. <strong>Knock out an edge</strong> whenever two variables become independent once you control for something. What survives — plus a few arrow-orienting rules — is the causal skeleton the data can support.",
    load: () => import("./modules/pcalg.js") },
  { group: "Causal Discovery", id: "corr2cause", title: "LLMs & Causal Reasoning",
    eli5: "From correlations alone you can often draw the <strong>skeleton</strong> of a causal graph but not always which way the arrows point. Some directions are simply unknowable from data — which is exactly where a confident chatbot tends to make things up.",
    load: () => import("./modules/corr2cause.js") },

  { group: "Causal Reinforcement Learning", id: "bandits", title: "Causal Bandits",
    eli5: "A row of slot machines, and you must learn which pays best <em>while</em> playing. If you also know how the levers are <strong>wired together</strong>, you can share lessons across them and find the winner far faster.",
    load: () => import("./modules/bandits.js") },
  { group: "Causal Reinforcement Learning", id: "ope", title: "Off-Policy Evaluation",
    eli5: "Can you grade a <em>new</em> policy using only logs from the <em>old</em> one, without ever deploying it? Yes — by re-weighting the old data toward what the new policy would do. But if the logs hid a confounder, every grade comes out wrong.",
    load: () => import("./modules/ope.js") },
  { group: "Causal Reinforcement Learning", id: "credit", title: "Counterfactual Credit",
    eli5: "When a team wins, who actually helped? Compare “what happened” to “what would’ve happened with the <strong>same luck but a different action</strong>.” That isolates each action’s real contribution — and makes learning far less noisy.",
    load: () => import("./modules/credit.js") },

  { group: "Frontier · 2021–2026", id: "crl", title: "Causal Representation Learning",
    eli5: "Reality hands us pixels, not tidy variables. Can a machine recover the few <strong>true knobs of the world</strong> from scrambled observations? Only if it’s allowed to <em>poke</em> the world (intervene) — just watching is provably not enough.",
    load: () => import("./modules/crl.js") },
  { group: "Frontier · 2021–2026", id: "pfn", title: "Causal Foundation Models",
    eli5: "Instead of training a fresh model for each new dataset, train <strong>one huge model on millions of pretend worlds</strong>. It learns the <em>skill</em> of causal inference itself, so on a brand-new dataset it answers in a single shot — like a doctor who’s already seen everything.",
    load: () => import("./modules/pfn.js") },

  { group: "Case Study", id: "ghostgames", title: "Ghost Games — Crowds & Home Advantage",
    eli5: "Home teams win more — everyone knows it, nobody fully knows why. Then COVID <strong>emptied the stadiums</strong>, switching the crowd off and later back on: a rare natural on/off/on experiment. Watch home advantage shrink when the fans vanish and rebound when they return — and catch the referees quietly favoring the home side only when a crowd is roaring.",
    load: () => import("./modules/ghostgames.js") },
  { group: "Case Study", id: "hitsong", title: "The Hit Song Formula",
    eli5: "Everyone has a theory about what makes a song a hit — more energy, a catchy beat, the perfect tempo. So let the data settle it: run <strong>causal discovery</strong> on 6,000 songs’ audio fingerprints. You’ll uncover a tidy web of cause and effect among the sound features — and a punchline almost nobody expects about popularity itself.",
    load: () => import("./modules/hitsong.js") },

  { group: "Capstone", id: "capstone", title: "Method Selection (Capstone)",
    eli5: "Real problems don’t come labeled “use IV.” Given a messy dataset and a question, the master move is <strong>choosing the right tool</strong>, defending its assumptions, and saying honestly what you still don’t know.",
    load: () => import("./modules/capstone.js") },
];

const app = document.getElementById("app");
const nav = document.getElementById("nav");
const main = document.getElementById("main");
const sidebar = document.getElementById("sidebar");
let currentCleanup = null;

// ---- mobile nav toggle (hamburger) ----
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
    n++;
    const item = h("div", {
      class: "nav-item", dataset: { id: m.id }, onclick: () => navigate(m.id),
    }, [
      h("span", { class: "nav-num", text: String(n) }),
      h("span", { text: m.title }),
    ]);
    nav.appendChild(item);
  }
}

// A plain-words intuition card injected at the top of every lesson.
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

// Lazy-load this module's question set and append an interactive quiz at the
// bottom of the lesson. Guarded so a slow import can't attach to a lesson the
// user has already navigated away from.
async function injectQuiz(id) {
  try {
    const mod = await import(`./quiz/${id}.js`);
    if (id !== currentNavId) return; // navigated away while loading
    if (!mod || !Array.isArray(mod.questions) || !mod.questions.length) return;
    const lesson = main.querySelector(".lesson");
    if (lesson && !lesson.querySelector(".quiz")) lesson.appendChild(quizWidget(mod.questions));
  } catch (e) { /* no quiz file for this module — skip silently */ }
}

let currentNavId = null;
async function navigate(id) {
  const m = MODULES.find((x) => x.id === id) || MODULES[0];
  currentNavId = m.id;
  [...nav.querySelectorAll(".nav-item")].forEach((el) =>
    el.classList.toggle("active", el.dataset.id === m.id));
  if (location.hash !== "#" + m.id) history.replaceState(null, "", "#" + m.id);
  app.classList.remove("nav-open"); // close the mobile drawer on selection

  if (currentCleanup) { try { currentCleanup(); } catch (e) {} currentCleanup = null; }
  clear(main);
  const loading = h("div", { class: "lesson" }, [h("p", { class: "note", text: "loading…" })]);
  main.appendChild(loading);
  try {
    const mod = await m.load();
    clear(main);
    currentCleanup = mod.mount(main) || null;
    injectEli5(m.eli5);
    main.scrollTop = 0;
    injectQuiz(m.id);
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

buildNav();
const startId = location.hash.slice(1);
navigate(MODULES.some((m) => m.id === startId) ? startId : MODULES[0].id);
window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (MODULES.some((m) => m.id === id)) navigate(id);
});
