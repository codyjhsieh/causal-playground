export const questions = [
  {
    q: "Intuitively, why does AIPW (augmented IPW) provide extra protection compared to using either an outcome model or a propensity model alone?",
    choices: [
      "It averages the two single-model estimates, so errors partially cancel.",
      "It adds an augmentation term whose expected value is zero whenever either the outcome model OR the propensity model is correct, so misspecifying one model leaves the estimator consistent.",
      "It uses a larger effective sample by combining treated and control units into one regression.",
      "It bootstraps both models and takes the median, reducing variance."
    ],
    answer: 1,
    explain: "The AIPW score ψᵢ = (μ̂₁−μ̂₀) + T/ê·(Y−μ̂₁) − (1−T)/(1−ê)·(Y−μ̂₀). The augmentation piece has expectation zero if ê is correct (IPW property) and also has expectation zero if μ̂ is correct (regression property). So mean(ψ) is consistent when either model is correctly specified. A is wrong: AIPW is not a simple average of two estimates. C and D describe irrelevant numerical tricks, not the mathematical protection mechanism."
  },
  {
    q: "Double robustness fails when both models are misspecified. Which of the following statements about the AIPW efficiency-function score ψᵢ correctly explains WHY consistency requires at least one correct model? (Select all that apply.)",
    choices: [
      "If the propensity model ê is correct, the IPW piece T/ê·(Y−μ̂₁) has mean zero in the population regardless of μ̂, so bias from the outcome model is corrected.",
      "If the outcome model μ̂ is correct, residuals (Y−μ̂) have mean zero within covariate strata, so the augmentation term vanishes regardless of ê.",
      "When both models are wrong, the mean-zero property fails simultaneously for both augmentation pieces, so bias accumulates.",
      "AIPW is doubly robust because it uses twice as much data as a single-model estimator."
    ],
    answer: [0, 1, 2],
    explain: "A, B, and C are all correct. A: with a correct propensity model, re-weighting by 1/ê balances the covariate distribution, making the outcome-model residuals mean-zero in expectation. B: with a correct outcome model, the predicted counterfactual matches the true conditional mean so residuals centre at zero regardless of propensity weights. C: if both are wrong, neither mean-zero property holds and biases compound. D is simply false — AIPW uses the same n observations as any other estimator."
  },
  {
    q: "The AIPW module uses the efficient influence function (EIF) score ψᵢ to compute confidence intervals: SE = sd(ψ)/√n. What property of the EIF score justifies this standard-error formula?",
    choices: [
      "The ψᵢ scores are independent and identically distributed, so their sample standard deviation estimates the asymptotic standard deviation of the estimator by the delta method.",
      "The EIF achieves the semiparametric efficiency bound, meaning the variance of mean(ψ) is the smallest possible variance for any regular estimator in this model, and sd(ψ)/√n consistently estimates it.",
      "The ψᵢ scores are always normally distributed by construction, making the t-interval exact in finite samples.",
      "Dividing by √n corrects for the fact that AIPW uses two models instead of one, each using n/2 effective observations."
    ],
    answer: 1,
    explain: "The efficient influence function is defined as the function whose variance equals the semiparametric efficiency bound — the minimum achievable asymptotic variance for any consistent, regular estimator in the non-parametric model. Under standard regularity conditions, n·Var(mean(ψ)) → Var(ψ₁), so sd(ψ)/√n is the correct asymptotic SE. A partially captures the i.i.d. argument but misnames the tool (delta method is for transformations, not for EIFs). C is false: normality of ψᵢ is not guaranteed in finite samples. D invents a non-existent correction factor."
  },
  {
    q: "A student claims: 'In the AIPW module, when I misspecify only the propensity model (intercept-only logistic), the AIPW estimate still lands near the true ATE ≈ 4.0, so propensity accuracy must not matter.' What is wrong with this reasoning?",
    choices: [
      "Nothing is wrong; AIPW is consistent regardless of propensity accuracy as long as the outcome model is correct.",
      "The student confuses consistency with efficiency: AIPW stays consistent because the outcome model is still correct, but the confidence interval widens because the augmentation term inflates residuals when propensity weights are wrong.",
      "The propensity model does not affect AIPW at all; only the outcome model determines point estimates.",
      "AIPW with a misspecified propensity model always produces a wider confidence interval AND a biased point estimate."
    ],
    answer: 1,
    explain: "This is the classic double-robustness misreading. When the outcome model is correct, AIPW is consistent (bias → 0) even with a wrong propensity model — so the student's observation is correct. But double robustness only guarantees consistency, not efficiency: the augmentation term with poor propensity weights creates large individual-level corrections, inflating sd(ψ) and hence the SE. The CI therefore becomes noticeably wider even when the point estimate is accurate. C is false (propensity enters both the augmentation and the variance). D is false because the point estimate remains consistent."
  },
  {
    q: "In the IHDP benchmark used by the AIPW module, the true ATE = mean(μ₁ − μ₀) ≈ 4.0. After running the module with BOTH models correctly specified (outcome OLS on x₁–x₆ per arm; propensity logistic on x₁–x₆), the AIPW estimate and its 95% CI are displayed. Which interpretation is most accurate?",
    choices: [
      "The CI covers the true ATE ≈ 4.0 because the IHDP data were collected from a randomized experiment, so any consistent estimator will produce valid inference.",
      "The CI covers the true ATE ≈ 4.0 primarily because both nuisance models are approximately correct, the EIF variance estimator is consistent, and n = 747 is sufficient for asymptotic coverage to hold.",
      "Coverage is guaranteed at exactly 95% in every IHDP simulation because the potential outcomes are Gaussian by design.",
      "The AIPW point estimate equals the true ATE exactly when both models are linear, because OLS is unbiased."
    ],
    answer: 1,
    explain: "IHDP uses real covariate data from a randomized experiment but the potential outcomes μ₀, μ₁ are semi-synthetic (simulated under a nonlinear DGP). Coverage of the EIF-based CI hinges on: (i) consistency of the nuisance estimates (here achieved because the linear models approximate the DGP reasonably), (ii) consistency of the variance estimate sd(ψ)/√n, and (iii) n large enough for asymptotic normality of mean(ψ). A is wrong — the IHDP observational use here is not an RCT analysis; treatment assignment in the real IHDP was observational. C is wrong — the DGP is not Gaussian, and coverage is asymptotic, not exact. D confuses unbiasedness with exact equality and ignores model error."
  }
];
