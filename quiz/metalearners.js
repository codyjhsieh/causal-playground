export const questions = [
  {
    q: "Intuitively, why would you want to estimate a Conditional Average Treatment Effect (CATE) τ̂(x) rather than a single Average Treatment Effect (ATE)?",
    choices: [
      "CATE is always more statistically efficient than ATE because it uses more parameters.",
      "The ATE hides effect heterogeneity: some subgroups may benefit greatly while others are harmed, and a single average can mask both, leading to suboptimal treatment decisions.",
      "CATE estimation automatically adjusts for unmeasured confounders that the ATE estimate ignores.",
      "Regulatory agencies require CATE estimation before approving new treatments."
    ],
    answer: 1,
    explain: "The ATE is a population average that can hide substantial heterogeneity. If τ(x) = +10 for half the population and −8 for the other half, the ATE ≈ +1 looks positive but treating everyone would harm half the population. CATE reveals who benefits, enabling targeted decisions. A is wrong: more parameters usually means less efficiency per parameter, not more. C is wrong: CATE estimation, like ATE, still requires standard identification assumptions (unconfoundedness). D is irrelevant context."
  },
  {
    q: "The S-learner uses a single model μ̂(x, t) with treatment as just another feature, then computes τ̂(x) = μ̂(x,1) − μ̂(x,0). Which of the following correctly describe a known weakness of the S-learner? (Select all that apply.)",
    choices: [
      "Regularization applied to the joint model can shrink the treatment feature's coefficient toward zero, causing τ̂(x) to be smoothed toward a constant (often near 0), under-representing heterogeneity.",
      "The S-learner cannot recover the ATE even when the outcome model is correctly specified.",
      "When treatment is a binary feature among many covariates, many regularized models will down-weight it relative to continuous covariates, flattening the CATE curve.",
      "The S-learner requires a separate propensity model, which adds an extra source of error."
    ],
    answer: [0, 2],
    explain: "A and C are both correct and describe the same phenomenon from different angles. Regularization (L1/L2, tree depth, early stopping in neural nets) treats the treatment indicator as one feature among many. When the treatment feature gets shrunk, the difference μ̂(x,1)−μ̂(x,0) collapses toward zero, making the S-learner's CATE curve nearly flat — the IHDP module shows exactly this. B is false: the S-learner does recover a consistent ATE (= mean of τ̂(x)) under correct specification. D is false: the S-learner requires no propensity model; it is the X-learner that uses propensity weighting."
  },
  {
    q: "The T-learner fits separate models μ̂₀ and μ̂₁ on each treatment arm, then τ̂(x) = μ̂₁(x) − μ̂₀(x). Why does T-learner CATE tend to have higher variance than S-learner CATE, particularly on IHDP (≈ 90% control arm)?",
    choices: [
      "The T-learner uses twice as many parameters, doubling the model's degrees of freedom and inflating variance.",
      "Each arm model is trained on a subset of data. With heavily imbalanced arms (n≈67 treated, n≈680 control in IHDP), the treated-arm model μ̂₁ is trained on far fewer observations, making its predictions noisier and propagating that noise into τ̂(x).",
      "T-learner applies two rounds of cross-fitting, which introduces instability.",
      "T-learner is known to be asymptotically inefficient regardless of sample size or balance."
    ],
    answer: 1,
    explain: "In IHDP, about 90% of the 747 units are controls. The T-learner trains μ̂₁ on roughly 67 treated units — a small, sparse sample — so predictions of the counterfactual outcome under treatment are high-variance. μ̂₀ has much more data and is stable, but the noise from μ̂₁ dominates τ̂(x) = μ̂₁−μ̂₀. A is partly true (more parameters exist) but misidentifies the cause — it is data sparsity, not parameter count, that drives the variance. C is wrong: T-learner does not use cross-fitting (that is a feature of DR-learner/R-learner). D is too strong: T-learner is consistent and can be efficient when arms are balanced."
  },
  {
    q: "A researcher claims: 'The X-learner is just the T-learner with propensity-weighted averaging — so it must always beat the T-learner on PEHE.' What is the flaw in this reasoning?",
    choices: [
      "No flaw: the X-learner is theoretically guaranteed to have lower PEHE than the T-learner in finite samples.",
      "The X-learner's improvement relies on the pseudo-effect imputation step being accurate, which in turn depends on the T-learner being reasonably well-trained. In early training (before the T-learner converges), the X-learner's pseudo-effects are noisy, and it can perform worse than T-learner.",
      "PEHE is not a valid metric for comparing learners because it can only be computed when true ITEs are known.",
      "The X-learner's propensity model introduces additional confounding bias that does not exist in the T-learner."
    ],
    answer: 1,
    explain: "The X-learner imputes pseudo-effects D̃ᵢ = Yᵢ − μ̂₁₋ₜᵢ(xᵢ): for treated units it uses the control model's prediction as a counterfactual, and vice versa. If the T-learner hasn't converged, μ̂ is a poor counterfactual, making the pseudo-effects noisy — sometimes noisier than the T-learner's direct estimate. The IHDP module reflects this by holding X-learner inactive until step 200. A is false: no finite-sample guarantee exists. C is wrong: PEHE requires known true ITEs, which is exactly what IHDP provides (μ₁−μ₀ is known). D is false: propensity weighting in the X-learner does not introduce confounding; it blends two τ̂ estimates, not a propensity-weighted outcome."
  },
  {
    q: "In the IHDP module, after sufficient training (≥ 300 steps), the S-learner's CATE curve τ̂<sub>S</sub>(x₁) is nearly flat across birthweight x₁, while the true τ(x₁) curve clearly increases with birthweight. What does this imply about the PEHE score for S-learner vs. the other learners?",
    choices: [
      "S-learner will have the lowest PEHE because a flat curve matches the true ATE ≈ 4.0 for most units.",
      "S-learner will have the highest PEHE among the three, because predicting a constant ATE for every unit incurs large squared errors on units whose true ITE is far from the mean — especially low-birthweight infants with near-zero effect and high-birthweight infants with large effect.",
      "PEHE cannot distinguish a flat from a curved estimator if both have the same mean (ATE).",
      "S-learner will match T-learner's PEHE because both ultimately recover the correct ATE."
    ],
    answer: 1,
    explain: "PEHE = √mean((τ̂(x)−τ(x))²) penalizes unit-level errors regardless of whether the ATE is correct. A flat τ̂(x) ≈ ATE ≈ 4 assigns every unit the population average. Units with true τ ≈ 0 (low birthweight) get error ≈ 4²=16; units with τ ≈ 10 (high birthweight) get error ≈ 6²=36. T-learner and X-learner, which track the slope of the true curve, accumulate far smaller unit-level errors. A is backwards: matching the ATE minimizes bias in the mean but not PEHE. C is wrong: PEHE is exactly designed to capture the difference between predicted and true individual effects, which is non-zero when heterogeneity is flattened. D confuses ATE recovery with CATE accuracy."
  }
];
