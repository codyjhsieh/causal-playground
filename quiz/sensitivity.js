export const questions = [
  {
    q: "Intuitively, what does a sensitivity analysis to unobserved confounding answer that a standard regression cannot?",
    choices: [
      "It tests whether the treatment effect is statistically significant after removing outliers.",
      "It asks how strong a hidden variable would need to be — both in its relationship to treatment and to the outcome — before it could fully explain away the observed effect.",
      "It proves that no unmeasured confounder exists if the adjusted estimate matches the experimental benchmark.",
      "It quantifies bias from measurement error in the observed covariates."
    ],
    answer: 1,
    explain: "Sensitivity analysis does not prove the absence of confounders — it quantifies the minimum strength a hidden confounder would need (on both the treatment and outcome axes) to drive the result to zero. B is the precise framing used in the Cinelli–Hazlett contour approach and the E-value. A describes hypothesis testing, not sensitivity. C is a classic misconception: matching an experimental benchmark raises plausibility but is not proof. D addresses measurement error, a different problem."
  },
  {
    q: "The Cinelli–Hazlett (2020) omitted-variable bias formula adjusts an estimate by a term ±√(R²<sub>DZ</sub> · R²<sub>YZ</sub>) · (σ<sub>Y|X</sub>/σ<sub>D|X</sub>). Which of the following correctly describe what R²<sub>DZ</sub> and R²<sub>YZ</sub> measure in this formula? (Select all that apply.)",
    choices: [
      "R²<sub>DZ</sub> is the partial R² of the unobserved confounder Z with the treatment D, after partialling out all observed covariates X.",
      "R²<sub>YZ</sub> is the partial R² of Z with the outcome Y, after partialling out all observed covariates X and the treatment D.",
      "Both R² values are on the marginal (not partial) scale, so they can be read directly from a bivariate regression of Z on D or Y.",
      "The σ<sub>Y|X</sub>/σ<sub>D|X</sub> ratio rescales the bias to the coefficient's natural units, reflecting how variable the outcome is relative to the treatment residual."
    ],
    answer: [0, 1, 3],
    explain: "A and B are correct by definition in Cinelli &amp; Hazlett (2020): both R² values are partial — they measure the additional variance explained by Z after all observed covariates have been partialled out. D is also correct: the ratio σ<sub>Y|X</sub>/σ<sub>D|X</sub> rescales the bias to the same units as the treatment coefficient. C is wrong — using marginal R² ignores the confounding already absorbed by observed covariates and would overstate the strength required to explain away the result."
  },
  {
    q: "The Robustness Value (RV) for the LaLonde observational estimate is displayed in the module. Which statement correctly interprets RV?",
    choices: [
      "RV is the probability that the true effect is positive.",
      "RV is the minimum equal-strength partial R² that an unobserved confounder would need on both the treatment and the outcome axes simultaneously to drive the adjusted estimate to zero.",
      "RV equals the E-value divided by the observed risk ratio.",
      "RV measures how much of the variance in re78 is explained by the observed covariates."
    ],
    answer: 1,
    explain: "The RV is defined as the single threshold r²* such that if a confounder has R²<sub>DZ</sub> = R²<sub>YZ</sub> = r²*, the adjusted estimate equals zero. It lives on the OVB contour plot exactly where the killer curve meets the 45° diagonal. RV < r²* for any observed covariate means the result withstands even the strongest confounder that resembles those covariates. A is a frequentist/Bayesian probability statement unrelated to RV. C mixes two different sensitivity metrics. D describes model R², not sensitivity."
  },
  {
    q: "A student examines the LaLonde sensitivity contour plot and notices the 'killer curve' is very close to the origin and passes below the dots for re74 and re75. What should the student conclude?",
    choices: [
      "The observational estimate is robust because a confounder as strong as prior earnings (re74/re75) would still not be sufficient to nullify the effect.",
      "The observational estimate is fragile: a confounder no stronger than the relationship prior earnings have with both treatment and outcome would be enough to drive the estimate to zero or below.",
      "The result cannot be interpreted because re74 and re75 are observed covariates, not unmeasured confounders.",
      "The killer curve's position near the origin proves that the LaLonde experimental benchmark of +$1,794 is wrong."
    ],
    answer: 1,
    explain: "When the killer curve passes through or below the dots for observed covariates like re74/re75, it means: a hidden confounder with the same confounding strength as prior earnings would be sufficient to nullify the result. Because we know prior earnings are plausibly strong unobserved drivers of both treatment selection and 1978 earnings, the observational estimate is considered fragile. This is exactly the LaLonde lesson — we know from the RCT that the true effect is +$1,794, so the biased observational estimate is easy to explain away. A gets the direction exactly backwards. C confuses observed vs. hypothetical. D conflates sensitivity with validation of the benchmark."
  },
  {
    q: "The module computes an E-value using the employment rate in the observational LaLonde sample (employed = re78 > 0). The E-value is the minimum risk ratio (RR) a hidden confounder must have with both employment and treatment to fully explain the observed association. If the E-value is ≈ 2.5, which of the following is the correct interpretation?",
    choices: [
      "There is a 2.5% chance the observed employment rate difference is due to chance.",
      "A confounder that tripled the odds of treatment AND tripled the odds of employment would not be sufficient to explain away the effect; only a confounder with RR ≥ 2.5 on both axes could do so.",
      "Any confounder with risk ratio ≥ 2.5 with either treatment or outcome (not necessarily both) would nullify the effect.",
      "The effect is robust because an RR of 2.5 is biologically impossible in labor economics."
    ],
    answer: 1,
    explain: "The E-value (VanderWeele & Ding 2017) requires that the confounder achieve RR ≥ E-value simultaneously on both the treatment and outcome axes. An E-value of 2.5 means: to explain away the association, a confounder must be at least 2.5 times more prevalent in treated vs. untreated AND at least 2.5 times more strongly associated with employment — jointly. A describes a p-value, which is unrelated. C is wrong: the requirement applies to BOTH axes simultaneously, not either axis alone. D misuses the E-value as a biological impossibility argument; E-values inform plausibility judgments, not absolute impossibility."
  }
];
