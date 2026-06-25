export const questions = [
  {
    q: "What makes a <strong>Neural Causal Model (NCM)</strong> different from a single, monolithic neural network fit to (T,&nbsp;C)&nbsp;→&nbsp;Y on the same data?",
    choices: [
      "An NCM uses <em>one MLP per node</em> in a DAG — each network takes only that node's parents as input — so the joint factorizes the same way the SCM does. A monolithic MLP learns the conditional P(Y|T,C) and nothing else; an NCM additionally encodes P(T|C), giving you a generative model that can be sampled, intervened on, and counterfactually queried.",
      "An NCM uses transformers while a monolithic MLP uses feed-forward layers.",
      "An NCM is trained without backpropagation, using only do-calculus rewrites.",
      "There is no difference — Xia et&nbsp;al. proved any feed-forward network on (T, C)&nbsp;→&nbsp;Y is already an NCM."
    ],
    answer: 0,
    explain: "The architectural point of Xia, Lee, Bengio, Bareinboim (2021/2023) is that an NCM has <em>one neural net per node</em>, each constrained to receive only the parents listed in the DAG. This induces the SCM factorization P(C)·P(T|C)·P(Y|T,C). A monolithic MLP learns the conditional Y|T,C alone — it cannot tell you P(T|C), so it cannot marginalize over the <em>marginal</em> P(C) to compute P(Y|do(T)); it can only do P(Y|T=t, C=c). B confuses architecture with topology. C is wrong: NCMs are trained with ordinary gradient descent. D is wrong: a monolithic MLP is not an NCM unless wired to a DAG."
  },
  {
    q: "The theorem says the trained NCM can answer queries from all three rungs of Pearl's hierarchy. Match each rung to <em>how the NCM computes it</em>:",
    choices: [
      "<strong>L1</strong>: average actual Y conditional on observed T. <strong>L2</strong>: for every row, predict Y from the MLP with T <em>overridden</em> to do-value; average. <strong>L3</strong>: pick a row; predict its Y with that individual's covariates held fixed but their T flipped.",
      "<strong>L1</strong> and <strong>L2</strong> are computed identically; <strong>L3</strong> requires retraining the NCM on a single row.",
      "All three rungs are obtained by running do-calculus symbolically on the network weights, not by any data computation.",
      "<strong>L1</strong> requires intervention; <strong>L2</strong> requires conditioning; <strong>L3</strong> requires the front-door criterion."
    ],
    answer: 0,
    explain: "This is the architectural recipe. L1 is plain observational: filter rows by T=t and average Y. L2 is the <em>do</em>-operator on the trained MLP — for every covariate row, force T to the do-value and predict, then average; this marginalizes over the marginal P(C), <em>not</em> the conditional P(C|T), which is exactly what intervention means. L3 is per-individual: fix the row's covariates, flip the treatment, predict the counterfactual Y. B is wrong: L1≠L2 under confounding. C is wrong: the NCM uses numerical inference, not symbolic do-calculus. D scrambles the definitions."
  },
  {
    q: "In <strong>RCT mode</strong> (real NSW data) the module shows L1 ≈ L2 ≈ +$1,794. In <strong>Confounded mode</strong> (synthetic data, true ATE = $1,800) L1 is biased but the NCM's L2 recovers the truth. Why does randomization make L1 = L2 in RCT mode?",
    choices: [
      "Randomization severs the C → T edge in the true DAG (because T is set by a coin, not by C), so the conditional distribution P(C | T=t) coincides with the marginal P(C). The two averages — over P(C|T=t) for L1 and over P(C) for L2 — therefore equal each other.",
      "Randomization replaces the outcome equation Y = f(T, C, U) with a coin flip, removing the dependence on C.",
      "L1 = L2 in any experiment because the partial correlation equals the marginal correlation when n is large.",
      "L1 always equals L2 in any binary-treatment study; the difference between rungs only matters for continuous treatments."
    ],
    answer: 0,
    explain: "Pearl's L2 = E[Y|do(T=t)] is the average of Y under the <em>marginal</em> P(C); L1 = E[Y|T=t] averages over <em>P(C|T=t)</em>. When T is randomly assigned (RCT), the coin is independent of C, so P(C|T=t) = P(C), and the two averages numerically coincide. This is why an RCT identifies the causal effect with the naive difference of means. B confuses the structural equations — randomization replaces the equation for T, not for Y. C and D are simply false."
  },
  {
    q: "Flipping <em>Hide re75 (latent confounder)</em> in Confounded mode causes the NCM's <strong>L2</strong> estimate to drift away from the true $1,800. Which statement best explains why?",
    choices: [
      "The synthetic data was generated with re75 as the strongest selector into treatment <em>and</em> a strong driver of baseline Y. Removing it from the NCM's input set means the C → T and C → Y backdoor path through re75 is no longer blocked by the model's adjustment set — identifiability of the L2 query fails, and even a perfectly-trained NCM cannot recover the truth.",
      "Removing re75 reduces the number of parameters, so the MLP underfits; the bias would vanish with a deeper network.",
      "The MLP is now training on a smaller dataset, so the variance of the estimate is too large.",
      "Hiding a column corrupts the dataset rows, so the comparison is no longer apples-to-apples."
    ],
    answer: 0,
    explain: "This is the identifiability gate the paper foregrounds. The L2 query P(Y|do(T)) is identifiable from observational data if and only if all backdoor paths from T to Y can be blocked by the <em>observed</em> covariate set (Pearl, backdoor criterion). The synthetic generator routes confounding through re75 (low re75 → likely treated AND lower baseline Y), so removing re75 from the model's adjustment set leaves an open backdoor C → T plus C → Y through re75. <em>No</em> amount of training, depth, or sample size fixes this — the NCM cannot recover what its graph cannot see. B and C describe finite-sample issues; the bias here is asymptotic. D is incorrect: the row count is unchanged."
  },
  {
    q: "Which of the following are <strong>honest limitations</strong> of the NCM framework as instantiated in this module? (Select all that apply.)",
    choices: [
      "Identifiability is inherited from the assumed DAG: if the true graph has edges or latent variables the NCM does not encode, L2/L3 outputs can be biased even with infinite data and perfect optimization.",
      "L3 counterfactuals for a specific individual depend on assumptions about the residual U_Y (the noise term) — here the MLP folds that residual into its regression error, giving a point estimate but not the full counterfactual distribution.",
      "Confounded mode uses synthetic Y with a known true ATE so the lesson can grade the network's L2 against ground truth — real-world counterfactual outcomes are unobservable in principle.",
      "Because the NCM is a neural network, it does not require any causal assumptions — it learns the DAG end-to-end from the data."
    ],
    answer: [0, 1, 2],
    explain: "A is the central caveat: the paper proves NCMs realize SCMs given the structural assumptions; it does not magic away the need for those assumptions. B is the L3 caveat — counterfactuals require modeling the per-individual noise (abduction step); a deterministic MLP gives the best point estimate but loses the residual distribution that real probabilistic counterfactuals need. C is the honesty the module practices: the true ATE in Confounded mode is constructed for the lesson, not measured. D is wrong: the DAG is supplied to the NCM — discovering structure is a separate problem (see the <code>notears</code> and <code>cdfm</code> modules)."
  }
];
