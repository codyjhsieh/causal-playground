# Causal Playground

An interactive, animated platform for learning the fundamentals of **causality and
causal inference** at a PhD level — taught almost entirely through handcrafted,
playable diagrams driven by real datasets and live simulation. Minimal prose; the
animation does the teaching.

No build step, no dependencies, fully offline. Just vanilla ES modules + canvas/SVG.

**▶ Live: https://codyhsieh.com/causal-playground/**

## Run it

```bash
cd /Users/codyhsieh/causality
node dev-server.mjs          # http://localhost:8080  — with LIVE RELOAD
# or, no live reload:  python3 -m http.server 8080
```

`dev-server.mjs` is zero-dependency (Node 16+): it serves the files and
auto-refreshes every open browser whenever you save a file (SSE + `fs.watch`, a
tiny client snippet injected into `index.html`). ES modules require `http://`,
not `file://`, so use one of the servers above rather than opening the file.

Every section opens with a plain-words **"In plain words"** intuition card and
closes with an interactive **5-question quiz** (instant feedback, explanations,
scoring) — 38 sections, 190 questions in all (incl. a novel case study).

## The curriculum

**38 modules**, each a self-contained interactive toy with a built-in challenge,
an ELI5 intro, and a quiz:

Ordered as one conceptual spine: foundations → graphs & identification → estimating effects → heterogeneity & policy → quasi-experiments → counterfactuals & longitudinal → discovery → RL → frontier → case study → capstone.

**Foundations**
1. **The Ladder of Causation** — Seeing / Doing / Imagining; one world, three answers.
2. **Simpson's Paradox** — watch the regression line flip sign as a hidden group separates.
3. **Potential Outcomes** — factual & counterfactual worlds; the fundamental problem made visible.
4. **Confounding** — association *flows* through a backdoor; condition on the common cause to stop it.

**Causal Graphs & Identification**
5. **d-Separation** — chain / fork / collider; block every path to make X ⫫ Y.
6. **The Backdoor Criterion** — pick an adjustment set; regression recovers the truth or doesn't.
7. **Bad Controls & Collider Bias** — conditioning on a collider/mediator/descendant *creates* bias.
8. **The Front-Door Criterion** — identify X→Y even with an *unobserved* confounder, via a full mediator.
9. **do-Calculus & Identification** — the three rules turn `P(Y|do(X))` into a formula — or prove none exists.
10. **Partial Identification & Bounds** — trap the effect in an interval; assumptions tighten it (Manski).

**Estimating Effects**
11. **Randomization** — a coin flip balances every hidden trait; build the sampling distribution.
12. **Adjustment & Stratification** — stratify/standardize to dissolve apparent bias.
13. **Propensity Scores** — collapse many covariates to one balancing score; match by threads.
14. **Doubly-Robust Estimation** — AIPW / influence function; right if *either* model is, with honest CIs.
15. **Sensitivity Analysis** — how strong a hidden confounder would overturn the result (E-value, Rosenbaum, Cinelli–Hazlett).
16. **Double Machine Learning** — Neyman-orthogonal residual-on-residual + cross-fitting kills regularization bias.

**Heterogeneous Effects & Policy**
17. **Neural Treatment Effects** — a TARNet/CFR representation balances treated & control, dropping PEHE.
18. **CATE & Meta-Learners** — S / T / X-learners turn any regressor into a personalized-effect estimator.
19. **Policy Learning** — learn *who to treat* (`τ̂(x) > cost`), scored against the oracle's regret.

**Quasi-Experiments**
20. **Instrumental Variables** — a "nudge" bypasses confounding; the Wald ratio as rise-over-run.
21. **Regression Discontinuity** — zoom into the cutoff; read the jump.
22. **Difference-in-Differences** — the parallel-trends counterfactual as a ghost line.
23. **Synthetic Control** — build a weighted "twin" from untreated donors; the post-gap is the effect.
24. **Staggered DiD & the TWFE Trap** — already-treated units sneak in as controls (Goodman-Bacon).

**Counterfactuals & Longitudinal**
25. **Counterfactuals & the SCM** — abduction → action → prediction; graph surgery with scissors.
26. **Time-Varying Treatment (g-methods)** — under treatment–confounder feedback, only g-formula / IPTW are right.
27. **Mediation** — split a total effect into the part *through* a mediator vs *around* it.
28. **Interference & Spillovers** — when treatment spills onto others, SUTVA breaks; recover direct + spillover.

**Causal Discovery**
29. **Neural Causal Discovery** — a DAG crystallizes under a differentiable acyclicity constraint; **NOTEARS** (2018) vs **DAGMA** (2022).
30. **Constraint-Based Discovery (PC)** — delete edges by conditional-independence tests, then orient → a CPDAG.
31. **LLMs & Causal Reasoning** — Corr2Cause: correlation fixes causation only up to the Markov-equivalence class. *Jin et al., ICLR 2024.*

**Causal Reinforcement Learning**
32. **Causal Bandits** — exploit a known intervention graph + propensities to cut regret.
33. **Off-Policy Evaluation** — IS/WIS/DR unbiased only without hidden confounding.
34. **Counterfactual Credit** — a shared-noise counterfactual baseline slashes policy-gradient variance.

**Frontier · 2021–2026**
35. **Causal Representation Learning** — recover latent causal factors; interventions grant identifiability. *Schölkopf 2021; Locatello 2019.*
36. **Causal Foundation Models** — a Prior-Data Fitted Network estimates effects on a new dataset in one forward pass. *CausalPFN (2025); CausalFM (ICLR 2026).*

**Case Study**
37. **Ghost Games — Crowds & Home Advantage** — COVID emptied the stadiums (crowd on→off→on); apply the whole toolkit to a real football dataset to show the crowd *causes* part of home advantage — partly through referee bias. *football-data.co.uk, 2018–22.*

**Capstone**
38. **Method Selection** — match the identification strategy to the problem's structure and defend its assumptions.

## Real datasets — every interactive runs on real public data

Each module loads a genuine public dataset (compiled into `data/*.js` by
`convert-data.mjs` from public CSVs) and computes its estimands live from those
rows. A green provenance badge in each module names the dataset and citation.

| Module | Dataset | Source |
|---|---|---|
| Ladder of Causation | NSW + CPS (see vs. do vs. imagine) | LaLonde 1986; Dehejia & Wahba 1999 |
| Simpson's Paradox | UC Berkeley 1973 admissions (real counts) | Bickel, Hammel & O'Connell, *Science* 1975 |
| Potential Outcomes | NSW randomized job training | LaLonde 1986; Dehejia & Wahba 1999 |
| Confounding | 401(k) eligibility & IRA ownership (income confounds) | Poterba, Venti & Wise |
| d-Separation | Sachs protein-signaling network (real partial correlations) | Sachs et al., *Science* 2005 |
| Backdoor Criterion | NSW + CPS (adjust to recover the experiment) | LaLonde 1986; Dehejia & Wahba 1999 |
| Randomization | Thornton HIV-incentive RCT (bootstrap) | Thornton, *AER* 2008 |
| Adjustment & Stratification | UC Berkeley 1973 admissions | Bickel et al., *Science* 1975 |
| Propensity Scores | NSW treated + CPS controls (recover $1,794) | LaLonde 1986; Dehejia & Wahba 1999 |
| Instrumental Variables | Card schooling & wages, instrument = college proximity | Card 1995 |
| Regression Discontinuity | U.S. House close elections (incumbency) | Lee 2008 |
| Difference-in-Differences | NJ vs PA fast-food employment | Card & Krueger 1994 |
| Counterfactuals & SCM | Card schooling & wages (SCM fit to data) | Card 1995 |
| Neural Causal Discovery | Sachs protein network (SHD vs consensus) | Sachs et al., *Science* 2005 |
| Neural Treatment Effects | IHDP benchmark (real covariates) | Hill 2011 |
| Double Machine Learning | 401(k) eligibility → net assets | Chernozhukov et al. 2018; Poterba-Venti-Wise |
| Causal Bandits | Thornton incentive levels (real return rates) | Thornton 2008 |
| Off-Policy Evaluation | Thornton logged RCT | Thornton 2008 |
| Counterfactual Credit | Thornton reward table | Thornton 2008 |
| Causal Representation Learning | Sachs proteins as latent signals | Sachs et al. 2005 |
| LLMs & Causal Reasoning | Sachs consensus subgraph + real correlations | Sachs et al. 2005 |
| Causal Foundation Models | IHDP real test set (synthetic prior, by design) | Hill 2011 |
| Front-Door Criterion | 401(k) eligibility → participation → assets | Poterba-Venti-Wise |
| do-Calculus & Identification | 401(k) (identifiable graphs computed on real data) | Pearl 1995 |
| Partial Identification & Bounds | NSW (true ATE lies inside the bounds) | LaLonde 1986 |
| Doubly-Robust Estimation | IHDP benchmark | Hill 2011; Bang & Robins 2005 |
| Sensitivity Analysis | NSW + CPS (known benchmark) | Cinelli & Hazlett 2020; VanderWeele & Ding 2017 |
| CATE & Meta-Learners | IHDP (true ITE known) | Künzel et al. 2019 |
| Policy Learning | IHDP | Athey & Wager 2021 |
| Time-Varying Treatment | JOBS II baseline + simulated dynamics | Robins 1986; Hernán & Robins |
| Mediation | JOBS II job-search intervention | Vinokur et al. 1995; Imai et al. 2010 |
| Interference & Spillovers | Cai social-network insurance RCT | Cai, de Janvry & Sadoulet 2015 |
| Synthetic Control | California Prop 99 cigarette sales | Abadie, Diamond & Hainmueller 2010 |
| Staggered DiD | Castle-Doctrine / stand-your-ground laws | Cheng & Hoekstra 2013 |
| Constraint-Based Discovery | Sachs protein network | Spirtes, Glymour & Scheines 2000 |
| Bad Controls & Collider Bias | Card schooling & wages | Cinelli, Forney & Pearl 2022 |
| Ghost Games (Case Study) | 7,203 top-5-league football matches, 2018–22 (crowd on→off→on) | football-data.co.uk |
| Method Selection (Capstone) | NSW, Card, Lee, Card-Krueger, Prop 99 | — |

**Honest caveats.** Some quantities cannot exist in any real dataset — and the
modules say so on screen:
- **Individual counterfactuals / potential outcomes** (Potential Outcomes, SCM,
  Counterfactual Credit) — the *fundamental problem of causal inference*. Real
  factual outcomes are shown; the unobservable counterfactual is modeled and
  labeled.
- **CFR / Neural Treatment Effects** uses **IHDP**, the field-standard
  *semi-synthetic* benchmark: real covariates, simulated outcomes — done
  precisely so the ground-truth effect (hence PEHE) is known.
- **RL environments** (Bandits, OPE, Credit) use **real reward rates** from the
  Thornton RCT; the stochastic rollouts/luck are simulated (an environment must
  be interactive).
- **CRL** uses real protein signals as the latent factors; the mixing +
  interventions are the controlled design that makes identifiability measurable.
- **PFN** is *pre-trained* on a synthetic prior of SCMs (intrinsic to the
  method) but does its in-context inference on the **real IHDP** test set.

## Architecture

```
index.html        shell: sidebar + main stage
main.js           registry-driven router (hash routes, lazy module imports)
styles.css        the entire theme (modules must NOT edit this)
lib/
  rng.js          seedable RNG + Gaussian/Bernoulli/logistic, normal CDF/PDF
  stats.js        mean/var/cov/corr, OLS (simple + multiple), logistic IRLS, matrix inverse
  dom.js          h() / s() element builders
  anim.js         shared rAF ticker, easing, tween, Spring, draggable, particles
  plot.js         retina Canvas, Scale, axes, dots/lines, histograms
  dag.js          DAG model + d-separation engine + interactive view with flowing-association particles
  nn.js           tiny MLP (manual backprop + Adam), matrix ops, matrix exponential — trains live in-browser
  ui.js           lessonLayout, sliders, toggles, readouts, challenge widget
  quiz.js         interactive quiz engine (instant feedback, scoring, retry)
  data.js         real-dataset helpers + the green provenance badge
  canvaspatch.js  makes ctx.fillStyle = "var(--x)" resolve CSS variables (canvas can't natively)
modules/          one file per lesson, each: export function mount(root) -> cleanup
data/             real public datasets compiled to importable JS (+ convert-data.mjs)
quiz/             one <id>.js per module: 5 grounded questions, injected by the router
test/smoke.mjs    headless DOM/canvas shim; mounts every module and runs frames
test/nn.test.mjs  numerical checks for nn.js (gradient-check, matrix exp, convergence)
test/quiz.test.mjs schema-validates every quiz file
```

### Module contract

```js
export function mount(root) {
  const { root: layout, stage, panel, caption } = lessonLayout({ title, idea });
  // build stage (animated diagram), panel (controls + readouts), caption (HTML)
  root.appendChild(layout);
  const stop = onFrame((dt) => { /* draw */ });
  return () => { stop(); /* + view.destroy() if a DAGView was used */ };
}
```

To add a lesson: drop a file in `modules/`, add one line to the `MODULES` array in `main.js`.

## Test

```bash
node test/smoke.mjs    # mounts all 38 modules headless, runs animation frames, asserts no crash
node test/nn.test.mjs  # gradient-checks the neural-net library
node test/quiz.test.mjs # validates every quiz/<id>.js schema (190 questions)
```
