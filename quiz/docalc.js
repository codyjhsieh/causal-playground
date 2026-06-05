export const questions = [
  {
    q: "What does the notation <strong>do(X = x)</strong> mean, and how does it differ from observing X = x?",
    choices: [
      "do(X = x) means we observe that X happened to take the value x in the population — identical to conditioning on X = x.",
      "do(X = x) represents a physical intervention that sets X = x by graph surgery — cutting all arrows <em>into</em> X — so the post-intervention distribution of Y is P(Y | do(X = x)) ≠ P(Y | X = x) whenever there is confounding.",
      "do(X = x) is a shorthand for 'do a regression of Y on X controlling for all covariates that are observed'.",
      "do(X = x) means we delete X from the graph entirely and analyze the remaining variables."
    ],
    answer: 1,
    explain: "In Pearl's framework, do(X = x) models an external intervention that pins X to x regardless of its usual causes. Graphically this is implemented as <em>graph surgery</em>: all edges <em>into</em> X are severed, removing the influence of confounders. The result is P(Y | do(X = x)), the interventional distribution. This is categorically different from P(Y | X = x), the observational conditional, which includes confounding paths. A conflates interventional and observational distributions. C describes regression, a statistical procedure, not the do-operator. D is wrong — surgery cuts incoming edges to X, not X itself."
  },
  {
    q: "The module contains five canonical graph structures. Which of the following correctly classifies their identifiability?",
    choices: [
      "Backdoor: not identifiable; Front-door: identifiable; Bow arc: identifiable; Instrument: identifiable.",
      "Backdoor: identifiable (adjustment formula); Front-door: identifiable (two-stage formula); Bow arc: NOT identifiable; Instrument: NOT point-identified (IV recovers LATE only).",
      "All five graphs are identifiable given enough data.",
      "Bow arc: identifiable by conditioning on U; Instrument: identifiable by IV ratio."
    ],
    answer: 1,
    explain: "B is correct. The backdoor graph is identifiable via Σ_z P(Y|X,z)P(z). The front-door graph is identifiable via the front-door formula (Pearl 1995). The <strong>bow arc</strong> (X→Y with a latent U confounding both endpoints) is the canonical non-identifiable graph — no set of observed variables and no do-calculus rules can eliminate the do-operator; non-identifiability is proven by the <em>hedge</em> criterion (Shpitser &amp; Pearl 2006). The instrument graph: IV identifies the LATE (local ATE for compliers) under monotonicity, but not the population ATE without homogeneity assumptions — so it is not point-identified in the do-calculus sense. A and C are wrong. D is wrong: U is unobserved so conditioning on it is impossible; the IV ratio gives LATE, not ATE."
  },
  {
    q: "Pearl's do-calculus has three rules. Rule 2 (action ↔ observation exchange) is the workhorse of the backdoor proof. Which statement correctly describes when Rule 2 applies?",
    choices: [
      "Rule 2 allows replacing do(Z) with observation of Z when, in the mutilated graph where arrows into X are cut and arrows in and out of Z are also cut (G<sub>X̄Z̄</sub>), Y and Z are d-separated given X and W.",
      "Rule 2 allows replacing any do(Z) with an observation of Z whenever Z is exogenous (has no parents in the original graph).",
      "Rule 2 is the same as the law of total probability — it simply marginalizes over Z.",
      "Rule 2 applies only when Z is a binary variable with equal treatment probabilities."
    ],
    answer: 0,
    explain: "Rule 2 states: P(Y | do(X), do(Z), W) = P(Y | do(X), Z, W) when Y ⊥ Z | X, W in G<sub>X̄Z̄</sub> — the graph obtained by deleting arrows into X <em>and</em> into and out of Z. In this mutilated graph, if Z is d-separated from Y, the do on Z can be exchanged for an observation. For the backdoor graph, G<sub>X̄Z̄</sub> removes Z→X and Z→Y, leaving Z isolated from Y given X, so Rule 2 converts do(X) to observation X in the adjusted formula. B is a special case (exogenous Z) but doesn't capture the general condition. C is the law of total expectation, unrelated. D invents a binary/balance restriction that doesn't exist."
  },
  {
    q: "The bow-arc graph has X→Y and a latent common cause U (bidirected arc X↔Y). The module shows this as 'NOT identifiable.' A student proposes: 'Just collect a very large dataset — eventually the causal effect will separate from the confounding.' What is wrong with this argument?",
    choices: [
      "The argument is correct; non-identifiability is a finite-sample issue that disappears as n → ∞.",
      "Non-identifiability in the bow-arc is a structural property of the graph, not a statistical problem. There exist two different causal models with the same skeleton and same observational distribution P(X, Y) but different values of P(Y | do(X)). No sample size resolves this because the data themselves cannot distinguish the two models.",
      "The bow-arc is identifiable asymptotically because the hedge criterion only applies to small graphs.",
      "Collecting more data helps, but only if the dataset is randomized; observational data of any size cannot identify the bow-arc."
    ],
    answer: 1,
    explain: "Non-identifiability of the bow arc is a structural, information-theoretic property of the graph — not a finite-sample limitation — proven by the <em>hedge</em> criterion of Shpitser &amp; Pearl (2006) and formalized by Tian &amp; Pearl (2002) via c-components. Formally, there exist two distinct causal models with identical observational distributions P(X, Y) but different values of P(Y | do(X)). Collecting more data lets you estimate P(X, Y) more precisely, but cannot distinguish models that agree on every observable. This holds in the infinite-data limit as well. Asymptotic arguments (A, C) fundamentally misread the nature of the result. D is wrong because randomization is itself a do-intervention, not a remedy within observational data."
  },
  {
    q: "The module computes these effects from the real 401(k) data: backdoor-adjusted ≈ +$9–11k, front-door ≈ +$9–11k, naive association ≈ +$14k. For the <strong>M-bias</strong> graph in the gallery, the identification verdict is: P(Y | do(X)) = P(Y | X) — no adjustment. Why is this correct, and what happens if you condition on the collider B?",
    choices: [
      "P(Y|X) = P(Y|do(X)) because X and Y are independent in the M-bias graph.",
      "In the M-bias graph, X and Y have no open backdoor path (U₁ and U₂ are not directly connected to both X and Y without going through B). B is a collider on the path U₁→B←U₂; without conditioning on B, that path is blocked. Conditioning on B opens the path, creating a spurious association between U₁ (which affects X) and U₂ (which affects Y) — a classic M-bias trap. So the correct estimator is the unadjusted P(Y|X).",
      "Conditioning on B is correct because B is a pre-treatment covariate; the more covariates we condition on, the less biased the estimate.",
      "M-bias graphs are never identifiable because the latent variables U₁ and U₂ introduce confounding."
    ],
    answer: 1,
    explain: "In the M-bias graph, X has only U₁ as a (latent) parent, and Y has only U₂ as a (latent) parent. The path X←U₁→B←U₂→Y is blocked at the collider B (without conditioning). Since no open backdoor path exists from X to Y, Rule 2 applies: do(X) = obs X, and P(Y|do(X)) = P(Y|X). Conditioning on B <em>opens</em> the collider, creating a spurious association between U₁ and U₂ — now X (caused partly by U₁) is spuriously correlated with Y (caused partly by U₂), biasing the estimate. This is the M-bias trap, showing that 'include all pre-treatment covariates' (C) is bad advice when some are colliders. D is wrong — the graph is identifiable; the key is <em>not</em> adjusting for B."
  }
];
