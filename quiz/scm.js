export const questions = [
  {
    q: "In Pearl's framework, the <strong>do-operator</strong> do(X = x) is described as 'graph surgery'. What does this mean, and how does it differ from ordinary conditioning P(Y | X = x)?",
    choices: [
      "do(X = x) conditions on the event X = x in the observational distribution, same as P(Y | X = x).",
      "do(X = x) removes all arrows <em>into</em> X in the causal graph and forces X to x, eliminating any confounders of X. Conditioning P(Y | X = x) does not cut arrows — it selects a subpopulation where X happens to equal x, leaving confounders intact.",
      "do(X = x) adds a new arrow from a hypothetical randomizer into X, strengthening the causal pathway.",
      "do(X = x) and P(Y | X = x) are identical whenever the dataset is large enough."
    ],
    answer: 1,
    explain: "The do-operator performs an <em>intervention</em>: it severs every incoming arrow to X (removing whatever normally causes X — e.g., latent ability in the Card SCM) and sets X to the specified value. Conditioning P(Y | X = x) merely filters the observational data to rows where X = x; confounders like ability still operate, so the conditioned estimate mixes the structural effect of X with selection bias from those confounders. The surgical distinction is the entire basis for the identifiability of causal effects from observational data."
  },
  {
    q: "Pearl's three-step counterfactual algorithm is: <strong>Abduction → Action → Prediction</strong>. Which of the following correctly matches each step to its role? (Select ALL that apply.)",
    choices: [
      "Abduction: use the <em>observed</em> (E, W) values to infer the exogenous noise variables U_A, U_E, U_W for this specific individual.",
      "Action: replace the structural equation for E with E := E′, cutting the A→E arrow (graph surgery).",
      "Prediction: recompute W using the <em>freshly drawn</em> noise variables from the population distribution.",
      "Prediction: recompute W in the surgically modified graph using the <em>same</em> locked-in U values from the abduction step."
    ],
    answer: [0, 1, 3],
    explain: "<strong>A, B, and D are correct.</strong> Abduction (A) solves backward from observations to pin down this individual's idiosyncratic noise. Action (B) is the intervention: cut the causal arrow into E and fix it to E′. Prediction (D) runs the modified model forward with the <em>same</em> noise inferred in step 1 — locking in U is exactly what makes this a unit-level <em>counterfactual</em> rather than a population-average intervention. C is wrong: using freshly drawn noise would yield the population do()-average E[W | do(E′)] = βE′, not the individual's counterfactual."
  },
  {
    q: "In the Card (1995) SCM module, a worker's counterfactual log-wage W<sub>E′</sub> <em>differs</em> from the population interventional average E[W | do(E′)] = βE′. What is the source of this difference, and does it always exist?",
    choices: [
      "The difference arises because the worker's observed wage contains measurement error; it would vanish with perfect data.",
      "The difference arises because abduction locks in the worker's inferred latent ability  Â and idiosyncratic shock U_W. Their counterfactual is W<sub>E′</sub> = βE′ + γÂ + U_W, while the population average has E[γÂ + U_W] = 0. Workers with above-average ability (Â > 0) will always have a higher CF wage than the population mean.",
      "The difference arises only when β is estimated with OLS and would disappear with an IV estimator.",
      "The difference exists only for this particular worker; for all others the unit counterfactual equals the do()-average."
    ],
    answer: 1,
    explain: "The counterfactual formula is W<sub>E′</sub> = β·E′ + γ·Â + U_W. Because abduction locked in Â ≠ 0 and U_W ≠ 0 for a specific individual, their result diverges from the population expectation β·E′ (where E[Â] = E[U_W] = 0). This difference is the entire point of the unit-vs-population distinction: <em>every</em> individual with atypical ability or luck will deviate from the population do()-average. No amount of data or estimation technique eliminates this; it is structural."
  },
  {
    q: "A student claims: 'The Card SCM has β ≈ 0.073 from OLS, but Card (1995) himself used instrumental variables (college proximity) and got β<sub>IV</sub> ≈ 0.132. Therefore the SCM is using the wrong parameter and all counterfactuals are biased.' How should an instructor respond?",
    choices: [
      "The student is right: only the IV estimate is valid; OLS is always wrong when there is confounding, so the SCM is invalidated.",
      "The OLS β conflates the structural direct effect of education with the indirect path through latent ability (confounding). The SCM explicitly models this by including a direct A→W path with coefficient γ. The total regression-adjusted OLS β is thus the <em>biased</em> naive estimate, and the SCM sets β to this value precisely to highlight the confounding — the module's purpose is to show how unobserved ability distorts naive estimates.",
      "OLS and IV estimate the same parameter whenever the exclusion restriction holds, so there is no discrepancy.",
      "The structural coefficient β in the SCM is not identified from observational data alone; the module uses β<sub>OLS</sub> as a placeholder, which the user can adjust with the slider to explore sensitivity."
    ],
    answer: 3,
    explain: "Choice D is the most accurate and pedagogically precise answer. In the presence of latent ability confounding (A→E and A→W paths), OLS β is biased upward or downward depending on the sign of the omitted-variable bias. The SCM module explicitly calibrates β to the real OLS estimate and exposes α and γ as structural parameters representing the confounding mechanism. The slider lets users explore: as γ (ability→wage) increases, the counterfactual diverges further from the do()-average. The module's core lesson is that β from OLS is <em>not</em> the clean structural causal effect — consistent with Card (1995)'s motivation for using IV."
  },
  {
    q: "In the Card (1995) NLSYM dataset used in the SCM module, the real OLS coefficient β on education in the log-wage regression is approximately:",
    choices: [
      "β ≈ 0.007 (less than 1% increase in wages per additional year of schooling).",
      "β ≈ 0.073 (approximately 7.3% higher wages per additional year of schooling, before IV correction).",
      "β ≈ 0.40 (40% higher wages per year, consistent with professional degree returns).",
      "β ≈ −0.05 (more education reduces wages, due to ability-sorting in the sample)."
    ],
    answer: 1,
    explain: "The OLS estimate of the schooling coefficient in the Card (1995) NLSYM data (controlling for experience, race, region, and urban status) is approximately <strong>β ≈ 0.073</strong> — meaning each additional year of schooling is associated with roughly 7.3% higher wages in the observational data. Card's IV estimate using college proximity as an instrument was notably higher (≈ 0.132), suggesting upward ability-bias correction in at least some specifications, though the direction of OLS bias is debated. The module displays the actual OLS β computed from the dataset."
  },
];
