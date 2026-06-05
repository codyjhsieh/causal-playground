export const questions = [
  {
    q: "Intuitively, why does a coin-flip assignment let you estimate a causal effect with a simple difference in means, without controlling for any covariates?",
    choices: [
      "A coin flip guarantees that treated and control groups are exactly equal on every covariate.",
      "A coin flip makes treatment statistically independent of all pre-treatment traits — measured or unmeasured — so differences in outcomes can only be caused by treatment, not by pre-existing differences.",
      "A coin flip eliminates measurement error in the outcome, making the estimator more precise.",
      "A coin flip is unbiased only when the sample is large enough for the central limit theorem to apply."
    ],
    answer: 1,
    explain: "Randomization achieves independence: T ⫫ (X, U) for all covariates X and unobservables U. This is exchangeability — the treated and control groups are identical in expectation on everything except treatment. The difference in means then equals E[Y(1)] − E[Y(0)], the ATE, unbiasedly. A is wrong because balance is only guaranteed in expectation, not in any finite sample. C conflates precision with bias elimination. D is wrong: unbiasedness holds in every sample size; the CLT governs the shape of the sampling distribution, not bias."
  },
  {
    q: "In the Thornton (2008) HIV-incentive RCT in Malawi, the treatment variable <code>any</code> indicates whether a participant was offered a cash incentive to learn their HIV status. The estimated effect on return rate (<code>got</code>) is approximately +0.45. Which of the following best describes what this number means?",
    choices: [
      "Offering an incentive raised the probability of returning to learn HIV status by about 45 percentage points.",
      "Participants who received the incentive were 45% more likely to be HIV-positive.",
      "The incentive caused a 0.45 standard-deviation improvement in health outcomes.",
      "45% of the control group returned even without an incentive."
    ],
    answer: 0,
    explain: "The outcome <code>got</code> is binary (0/1: did the participant return to learn their status?). The difference in means, E[got | any=1] − E[got | any=0] ≈ +0.45, is a difference in probabilities — i.e., a 45 percentage-point increase in the return rate. This is not about HIV prevalence (B), not a standardized effect (C), and not the control-group mean (D, which would be the baseline rate, not the treatment effect)."
  },
  {
    q: "In the interactive module's bootstrap simulation, running 200+ coin-flip (RCT) draws produces a sampling distribution centered near +0.45, while switching to self-selection shifts the center away. Which statements correctly explain this contrast? (Select all that apply.)",
    choices: [
      "Under randomization, the estimator is unbiased because T ⫫ distance-to-clinic, so the arms are balanced on distance in expectation.",
      "Under self-selection, closer participants disproportionately choose to learn their status; since distance also predicts returning, the estimate is confounded.",
      "Under self-selection, the estimator has lower variance than under randomization because the groups are more homogeneous.",
      "Bias is the systematic shift of the sampling distribution away from the true effect; it is eliminated by randomization, not by large samples alone."
    ],
    answer: [0, 1, 3],
    explain: "A is correct: randomization severs any link between distance (a predictor of <code>got</code>) and treatment, so the arms balance on distance in expectation. B is correct: self-selection creates a correlation between treatment and distance, which is also a predictor of the outcome — the definition of a confounder. D is correct: bias is a property of the estimator across repeated samples; it vanishes under randomization regardless of n. C is wrong: self-selection does not guarantee lower variance — the self-selected treated group may be smaller or have different variance, and the confounded mean can shift unpredictably."
  },
  {
    q: "A colleague claims: 'The bootstrapped RCT estimates have some spread around +0.45, which means randomization does not fully eliminate uncertainty.' Is this a valid criticism of randomization?",
    choices: [
      "Yes — if randomization were perfect, every bootstrap draw would equal exactly +0.45.",
      "No — randomization eliminates bias (systematic error), not variance (random sampling error). Some spread around the truth is expected and quantified by the standard error.",
      "Yes — the spread indicates that the instrument (coin flip) is weak.",
      "No — but only because Thornton's sample is large enough to make variance negligible."
    ],
    answer: 1,
    explain: "Randomization solves the bias problem, not the variance problem. Any finite sample will yield an estimate that differs from the truth by some random amount — that is sampling variance, summarized by the standard error. The bootstrap histogram shows the sampling distribution of the ATE estimator: centered on the truth (bias ≈ 0) but with spread (SE > 0). A confuses bias and variance. C misuses 'weak instrument' terminology, which applies to IV, not RCT coin flips. D is wrong because unbiasedness is a small-sample property of randomization."
  },
  {
    q: "Compared to a perfectly conducted RCT, a well-matched observational study (e.g., adjusting for all observed confounders) makes a different trade-off. Which statement best captures the core difference?",
    choices: [
      "The RCT trades higher variance for zero bias; the observational study trades lower variance for potential residual bias from unobserved confounders.",
      "The RCT is always more precise because it uses the full population, while observational studies use convenience samples.",
      "The observational study is always preferred because it avoids the ethical costs of random assignment.",
      "Both approaches are unbiased as long as the sample size is large enough."
    ],
    answer: 0,
    explain: "This is the fundamental bias-variance trade-off in causal inference. An RCT uses an inefficient (coin-flip) assignment mechanism — it adds variance that a targeted design would not — but in exchange purchases zero bias from unobserved confounding (independence holds by design). An observational study can be very efficient (low variance) but remains vulnerable to bias from any unmeasured common cause. B is wrong: RCTs do not automatically recruit the full population. C is a values judgment, not a statistical property. D is false: large samples in an observational study do not eliminate bias — they only shrink the confidence interval around a biased estimate."
  }
];
