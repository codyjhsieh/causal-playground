export const questions = [
  {
    q: "Before NOTEARS (2018), causal structure learning was often treated as a combinatorial search over DAGs. What was the key mathematical insight that made NOTEARS a breakthrough?",
    choices: [
      "NOTEARS replaced the DAG constraint with a Bayesian prior over graph structures, enabling MCMC sampling.",
      "NOTEARS derived a smooth, differentiable function h(W) = tr(e<sup>W∘W</sup>) − d that equals zero <em>if and only if</em> W encodes a DAG, turning the combinatorial graph-search into a continuous optimization problem solvable by gradient descent.",
      "NOTEARS proved that any DAG can be recovered exactly from n ≥ 2d observational samples under a Gaussian noise assumption.",
      "NOTEARS replaced the directed graph with an undirected Markov random field, bypassing the acyclicity constraint entirely."
    ],
    answer: 1,
    explain: "The combinatorial constraint 'no directed cycle' had no smooth parameterization before NOTEARS. Zheng et al. showed that h(W) = tr(exp(W ∘ W)) − d is a <strong>differentiable characterization of acyclicity</strong>: h(W) = 0 iff W is a DAG, and h > 0 otherwise. This single equation converts the NP-hard combinatorial problem into a penalized continuous regression, enabling standard gradient-based optimizers and making structure learning scale to dozens of variables."
  },
  {
    q: "DAGMA (2022) proposed replacing NOTEARS's h(W) = tr(e<sup>W∘W</sup>) − d with h(W) = −logdet(sI − W∘W) + d·log s. Select ALL true statements about this substitution.",
    choices: [
      "Both NOTEARS and DAGMA are zero if and only if W is a DAG, so they are equivalent as acyclicity certificates.",
      "DAGMA's log-determinant characterization avoids computing a matrix exponential, which is cheaper for large d.",
      "DAGMA's gradient is better conditioned near W = 0 and in practice converges roughly 10× faster than NOTEARS.",
      "DAGMA's constraint is only valid when sI − W∘W is positive definite; the module adaptively sets s above the spectral radius of W∘W to stay in this domain."
    ],
    answer: [0, 1, 2, 3],
    explain: "<strong>All four statements are correct.</strong> Both penalties are valid acyclicity characterizations (A). The log-det avoids the expensive matrix exponential and is cheaper to compute (B). In the NeurIPS 2022 paper and in the module, DAGMA converges substantially faster and has a sharper gradient signal (C). The module code explicitly sets s = max(1.0, maxRowSum + 0.25) to ensure positive-definiteness of sI − W∘W at every gradient step (D)."
  },
  {
    q: "After running NOTEARS to convergence on the Sachs dataset, you obtain a learned graph. A critic says: 'Even with SHD = 0, you still haven't recovered the true causal graph — you've only recovered the <em>Markov equivalence class</em>.' Is this correct, and why?",
    choices: [
      "No. NOTEARS provably identifies the unique DAG from sufficiently large samples under any noise distribution.",
      "Yes, but only when the sample size N < 100. For the Sachs dataset with N = 853, NOTEARS identifies the true DAG exactly.",
      "Yes. From purely observational data under Gaussian noise, observationally equivalent DAGs (same skeleton and v-structures) produce identical distributions — so you can only identify the CPDAG (completed partially directed acyclic graph), not the exact DAG.",
      "No. SHD = 0 by definition means the recovered graph matches the true graph, including all edge directions."
    ],
    answer: 2,
    explain: "Under a linear Gaussian model with equal noise variances, the data distribution is the same for every DAG in the same Markov equivalence class (MEC). NOTEARS minimizes a Gaussian likelihood, so it can only recover the MEC — represented as a CPDAG — not the unique DAG. Some DAGs within an MEC are only distinguishable via interventional data (as Sachs et al. used). That is exactly why SHD against the <em>interventionally</em> established Sachs consensus is a meaningful challenge: the observational learner must get lucky or use additional structural constraints (non-equal variances, non-Gaussianity) to fully orient every edge."
  },
  {
    q: "In the playground, increasing the L1 sparsity parameter λ₁ typically reduces the number of predicted edges. Which of the following is the <em>misconception</em> about what this achieves?",
    choices: [
      "Higher λ₁ shrinks small weights toward zero, pruning spurious edges that arise from weak correlations.",
      "Higher λ₁ can increase SHD if it prunes true edges (false negatives) faster than it removes false edges (false positives).",
      "Setting λ₁ = 0 is guaranteed to recover the correct skeleton because all signal is retained.",
      "λ₁ is a regularization hyperparameter; the optimal value trades off precision (fewer false positives) against recall (fewer false negatives)."
    ],
    answer: 2,
    explain: "The misconception is C. Setting λ₁ = 0 does <em>not</em> guarantee correct skeleton recovery — it merely means no sparsity penalty is applied. Without regularization, correlated variables that are not directly causally linked will produce non-zero weights in the weight matrix (overfitting to spurious correlations), actually <em>inflating</em> false positives and worsening SHD. Correct structure recovery requires balancing the acyclicity penalty, the regression fit, and the sparsity regularizer. A, B, and D are all accurate statements about L1 behavior."
  },
  {
    q: "The Sachs et al. (2005) benchmark dataset, used to evaluate NOTEARS in the playground, has the following characteristics — which statement is <strong>correct</strong>?",
    choices: [
      "It contains gene-expression microarray data from 11,000 human cancer cell lines, with d = 11 variables and N = 100,000 samples.",
      "It contains single-cell flow-cytometry measurements of 11 phosphoproteins in human T-cells (N ≈ 853 observations), with a 17-edge consensus causal DAG established from interventional experiments.",
      "It is a fully synthetic dataset generated from a known linear-Gaussian DAG, making the ground truth trivially recoverable.",
      "It contains 11 variables and 853,000 observations; the large N means any structure-learning algorithm achieves SHD = 0."
    ],
    answer: 1,
    explain: "The Sachs dataset consists of <strong>single-cell flow-cytometry</strong> measurements of 11 phosphoproteins (Raf, Mek, Plcg, PIP2, PIP3, Erk, Akt, PKA, PKC, P38, Jnk) from human T-cells, with N ≈ 853 complete observations. The 17-edge consensus DAG was established by Sachs et al. using targeted perturbation experiments (interventions), not from observational data alone. This is precisely why the observational NOTEARS challenge is hard — recovering all 17 directed edges from N = 853 observations using only the observational sample is genuinely difficult, and SHD = 0 from observational data alone is not guaranteed even in principle due to Markov equivalence."
  },
];
