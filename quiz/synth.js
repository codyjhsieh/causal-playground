export const questions = [
  {
    q: "Intuitively, why does the synthetic control method build a <em>weighted combination</em> of donor states rather than simply comparing California to a single most-similar state?",
    choices: [
      "Averaging over many states reduces measurement error in the cigarette sales data",
      "No single state may closely track California's pre-treatment trajectory, but a convex combination of several states can reproduce it far more accurately",
      "It ensures the weights sum to more than 1, giving a conservative estimate",
      "Federal law requires tobacco studies to use multi-state comparisons",
    ],
    answer: 1,
    explain:
      "California is a large, heterogeneous state; no single donor matches its per-capita smoking trend, income level, and demographic mix simultaneously. A convex combination (weights ≥ 0, sum = 1) can match the pre-period trajectory much more precisely — as measured by the pre-RMSE. Choice A is a side benefit, not the conceptual reason. Choice C is wrong: weights must sum to exactly 1, not more.",
  },
  {
    q: "What role does the pre-treatment period fit (pre-period RMSE) play in assessing the credibility of a synthetic control estimate?",
    choices: [
      "A low RMSE proves that post-treatment trends would have been the same without the intervention",
      "A low RMSE confirms that the synthetic control closely tracks the treated unit before the intervention, making it a plausible counterfactual — the post-treatment gap is then credibly attributed to the intervention",
      "A low RMSE means the optimizer has overfit, and the post-treatment gap will be biased upward",
      "Pre-period fit is irrelevant; what matters is the post-treatment variance of the donor states",
    ],
    answer: 1,
    explain:
      "The key identifying assumption is that the synthetic control would have continued to track California had Prop 99 not been enacted. A low pre-RMSE is the observable implication of this: if the synthetic twin closely mimics California over 19 pre-treatment years, we have evidence the weights capture the relevant factors. It does not prove parallel trends post-treatment (choice A), but it is the main credibility check. Overfitting would typically manifest as near-zero pre-RMSE but is addressed by using only the pre-period — the module achieves ~2–3 packs RMSE with no sign of overfitting.",
  },
  {
    q: "After fitting the synthetic control to California's cigarette data (1970–1988), the post-treatment gap in 2000 is approximately −26 packs per capita per year. Which statement correctly interprets this result AND names the inference procedure that tests whether the gap is larger than chance?",
    choices: [
      "Prop 99 caused a −26 pack/year reduction; statistical significance is assessed by a two-sample t-test against the donor mean",
      "Prop 99 caused a −26 pack/year reduction; inference is done via <em>placebo permutation</em> — applying the same method to each donor state and checking whether California's gap stands out in the distribution of placebo gaps",
      "The −26 pack gap shows correlation but not causation; only an RCT could establish causality",
      "The gap reflects regression to the mean, not a policy effect; significance is tested with a Wald test",
    ],
    answer: 1,
    explain:
      "The synthetic control gap is interpreted as the causal effect under the assumption that the pre-period fit is good (RMSE < ~5). Because there is only one treated unit, classical standard errors are not applicable. Instead, inference uses placebo permutation (Abadie et al. 2010): fit synthetic controls for every donor state and form the distribution of placebo gaps; California's gap is significant if it is unusually large relative to placebo gaps, especially for donor states with similarly good pre-fits. The module's Colorado placebo check illustrates this.",
  },
  {
    q: "A critic argues: 'The synthetic control is just curve-fitting — the optimizer memorizes California's pre-period trend and any post-treatment divergence could be noise.' Which feature of the method most directly refutes this concern?",
    choices: [
      "The optimizer uses gradient descent, which prevents overfitting by design",
      "The weights are constrained to a simplex (w<sub>j</sub> ≥ 0, Σw<sub>j</sub> = 1), limiting the model's degrees of freedom; and the placebo test shows that untreated states with equally good pre-fits do NOT exhibit large post-treatment gaps",
      "California's sample size is large enough to make overfitting impossible",
      "The synthetic control uses all 50 states as donors, so the estimate is fully robust",
    ],
    answer: 1,
    explain:
      "The convex-hull constraint (simplex) severely limits over-parameterization — you cannot assign arbitrary negative or very large weights to force a perfect fit. More decisively, the placebo test is the key refutation: if the gap were noise or curve-fitting artifact, we would expect similar-sized gaps for control states. When placebo gaps are small while California's is large (especially among states with low pre-RMSE), it is evidence against a noise explanation. Choice A is partially true but misses the inference logic.",
  },
  {
    q: "In the module, when you click 'Fit synthetic control,' Utah and Nevada receive among the highest donor weights. Nevada also has relatively high historical smoking rates. What does a large weight on Nevada specifically tell you about the synthetic California?",
    choices: [
      "Nevada was geographically close to California, which is the primary driver of weight assignment",
      "Nevada's per-capita cigarette sales trajectory over 1970–1988 helps reproduce California's pre-Prop-99 trend; the optimizer assigned it weight because it improves pre-period fit, not because of geography or similarity in post-1989 outcomes",
      "Nevada's weight proves that Prop 99 had no effect on Nevada, serving as a built-in control",
      "High weight for Nevada means the estimate is invalid because Nevada had its own tobacco policies",
    ],
    answer: 1,
    explain:
      "Weights are determined entirely by the pre-period fit minimization. A high weight for Nevada means Nevada's smoking trend, when combined with other donors, helps the synthetic match California's 1970–1988 trajectory. The method makes no assumption about post-1989 Nevada outcomes (Nevada is not 'controlled' by having weight). Choice D raises a valid practical concern for real analyses — if Nevada enacted its own tobacco policy post-1989, it would be excluded — but within the module's donor pool it is used as given.",
  },
];
