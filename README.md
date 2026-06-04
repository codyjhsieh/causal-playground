# Causal Playground

An interactive, animated platform for learning the fundamentals of **causality and
causal inference** at a PhD level — taught almost entirely through handcrafted,
playable diagrams driven by real datasets and live simulation. Minimal prose; the
animation does the teaching.

No build step, no dependencies, fully offline. Just vanilla ES modules + canvas/SVG.

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

## The curriculum

Thirteen modules, each a self-contained interactive toy with a built-in challenge:

**Foundations**
1. **The Ladder of Causation** — Seeing / Doing / Imagining; one world, three answers.
2. **Simpson's Paradox** — watch the regression line flip sign as a hidden group separates.
3. **Potential Outcomes** — worlds split into factual & counterfactual; the fundamental problem made visible.
4. **Confounding** — association *flows* through a backdoor; condition on the common cause to stop it.

**Graphs**
5. **d-Separation** — chain / fork / collider in one graph; block every path to make X ⫫ Y.
6. **The Backdoor Criterion** — pick an adjustment set; regression recovers the truth or doesn't.

**Identification**
7. **Randomization** — coin-flip assignment balances a hidden confounder; build the sampling distribution.
8. **Adjustment & Stratification** — stratify to dissolve apparent bias.
9. **Propensity Scores** — collapse many covariates to one axis; match by threads.

**Quasi-experiments**
10. **Instrumental Variables** — a "nudge" bypasses confounding; the Wald ratio as rise-over-run; weak-instrument blowup.
11. **Regression Discontinuity** — zoom into the cutoff; read the jump.
12. **Difference-in-Differences** — the parallel-trends counterfactual as a ghost line.

**Counterfactuals**
13. **Counterfactuals & the SCM** — abduction → action → prediction; graph surgery with scissors.

**Causal ML & Neural Nets** (live in-browser training via `lib/nn.js`)
14. **Neural Causal Discovery** — watch a DAG crystallize from data under a differentiable acyclicity constraint; toggle the original **NOTEARS** h(W)=tr(e^{W∘W})−d (2018) vs the faster **DAGMA** log-det form (2022).
15. **Neural Treatment Effects** — a TARNet/CFR representation network; the treated & control clouds *balance* as it trains, dropping counterfactual error (PEHE).
16. **Double Machine Learning** — Neyman-orthogonal residual-on-residual + cross-fitting kills the regularization bias of naive ML plug-in.

**Causal Reinforcement Learning**
17. **Causal Bandits** — exploit a known intervention graph + propensities to cut regret far below structure-blind UCB/Thompson.
18. **Off-Policy Evaluation** — IS/WIS/DR are unbiased only without hidden confounding; crank the confounder and watch every estimator drift off the truth.
19. **Counterfactual Credit** — a counterfactual baseline (shared exogenous noise) slashes policy-gradient variance without bias.

**Frontier · 2021–2026** (the recent state of the art)
20. **Causal Representation Learning** — recover latent causal factors from entangled high-dimensional observations; interventions (not more data) grant identifiability. *Schölkopf et al. 2021; Locatello et al. 2019; CITRIS/iCITRIS 2022; score-based CRL, JMLR 2025.*
21. **LLMs & Causal Reasoning** — the Corr2Cause task: correlation fixes causation only up to the Markov-equivalence class; edit a DAG and watch the indistinguishable alternatives (and what an over-confident LLM gets wrong). *Jin et al. Corr2Cause, ICLR 2024; CLadder, NeurIPS 2023; Verma & Pearl 1990.*
22. **Causal Foundation Models** — a Prior-Data Fitted Network pre-trained on a prior of synthetic SCMs estimates treatment effects on a *new* dataset in a single forward pass, no per-dataset retraining. *PFNs, ICLR 2022; TabPFN, Nature 2025; **CausalPFN (2025)**; **CausalFM, ICLR 2026.***

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
  canvaspatch.js  makes ctx.fillStyle = "var(--x)" resolve CSS variables (canvas can't natively)
modules/          one file per lesson, each: export function mount(root) -> cleanup
test/smoke.mjs    headless DOM/canvas shim; mounts every module and runs frames
test/nn.test.mjs  numerical checks for nn.js (gradient-check, matrix exp, convergence)
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
node test/smoke.mjs    # mounts all 22 modules headless, runs animation frames, asserts no crash
node test/nn.test.mjs  # gradient-checks the neural-net library
```
